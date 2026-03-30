import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@core/database/prisma.service';
import { LlmService } from '@modules/llm/llm.service';
import { LlmTask } from '@modules/llm/llm.types';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { DceAnalysisOutput, sanitizeForPrompt } from './dce-analyzer.service';

const AI_PATTERN_BLACKLIST = [
  'en tant que',
  'il est important de',
  'il convient de noter',
  'dans un monde où',
  'force est de constater',
  'il est essentiel',
  'nous nous engageons à',
  'dans le cadre de cette démarche',
  'nous sommes convaincus que',
  'à cet égard',
];

const TARGET_RATIO_IA_HUMAIN = 0.60;

const CHAPTER_PAGE_LIMITS = {
  MAPA: { 1: [2, 3], 2: [3, 5], 3: [5, 8], 4: [3, 5], 5: [2, 3] },
  AO: { 1: [4, 6], 2: [6, 10], 3: [10, 15], 4: [6, 10], 5: [4, 8] },
} as const;

const WORDS_PER_PAGE = 300;

const VOLET_SOCIAL_WORDING =
  "Axiom s'engage à étudier les possibilités de recours à des structures d'insertion\npar l'activité économique (SIAE) ou à des entreprises adaptées pour les lots ou\nprestations qui s'y prêtent, conformément aux dispositions de l'article L2112-2\ndu Code de la commande publique.";

const MAPA_THRESHOLD = 90_000;

export interface ChapitreMemoire {
  numero: number;
  titre: string;
  contenu: string;
  nbPages: number;
  sectionsConditionnelles: string[];
}

export interface MemoireTechniqueResult {
  analyseId: string;
  chapitres: ChapitreMemoire[];
  referencesUsees: string[];
  schemasGeneres: string[];
  flagsActives: {
    rse: boolean;
    rgaa: boolean;
    voletSocial: boolean;
  };
  ratioIaHumain: number;
  scoreAntiDetect: number;
  nbPagesTotal: number;
  status: 'DRAFT' | 'REVIEW' | 'VALIDATED' | 'FINAL';
  sectionsJonathanRequired: string[];
}

@Injectable()
export class MemoireRedacteurService {
  private readonly logger = new Logger(MemoireRedacteurService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly config: ConfigService,
    private readonly agentEventLogger: AgentEventLoggerService,
  ) {}

  async generateMemoireTechnique(
    tenderId: string,
    analyseId: string,
    dceAnalysis: DceAnalysisOutput,
  ): Promise<MemoireTechniqueResult> {
    const startTime = Date.now();
    const prismaAny = this.prisma as any;

    const tender = await prismaAny.publicTender.findUnique({
      where: { id: tenderId },
    });

    if (!tender) throw new NotFoundException(`Tender ${tenderId} not found`);

    // Idempotence: return existing memoir if already generated
    const existing = await prismaAny.aoMemoireTechnique.findUnique({
      where: { analyseId },
    });
    if (existing && existing.status !== 'pending') {
      this.logger.debug({ msg: 'MemoireTechnique already generated, returning cached', analyseId });
      return this.rehydrateFromDb(existing, analyseId);
    }

    // Determine MAPA vs AO based on estimated amount
    const estimatedAmount = tender.estimatedAmount ?? tender.estimatedBudget ?? 0;
    const size: 'MAPA' | 'AO' = estimatedAmount > 0 && estimatedAmount < MAPA_THRESHOLD ? 'MAPA' : 'AO';

    // Detect conditional flags
    const flags = {
      rse: dceAnalysis.flags_conditionnels.rse,
      rgaa: dceAnalysis.flags_conditionnels.rgaa,
      voletSocial: dceAnalysis.flags_conditionnels.volet_social,
    };

    this.logger.log({ msg: 'Generating mémoire technique', tenderId, analyseId, size, flags });

    // Generate all 5 chapters
    const chapitres: ChapitreMemoire[] = [];
    for (let i = 1; i <= 5; i++) {
      const chapitre = await this.generateChapitre(i, tender, dceAnalysis, flags, size);
      chapitres.push(chapitre);
    }

    // Generate Mermaid diagrams
    const schemasGeneres = this.generateMermaidDiagrams(tender, dceAnalysis);

    // Identify Jonathan-required sections
    const sectionsJonathanRequired = this.identifySectionsJonathan(chapitres);

    // Calculate anti-detection score
    const scoreAntiDetect = this.calculateAntiDetectionScore(chapitres);

    // Calculate totals
    const nbPagesTotal = chapitres.reduce((sum, c) => sum + c.nbPages, 0);

    // Extract references used (pulled from chapter content placeholders)
    const referencesUsees = this.extractReferences(chapitres);

    const status: MemoireTechniqueResult['status'] = scoreAntiDetect > 20 ? 'REVIEW' : 'DRAFT';

    // Persist to database
    await prismaAny.aoMemoireTechnique.upsert({
      where: { analyseId },
      create: {
        analyseId,
        status: status.toLowerCase(),
        approche: chapitres[1]?.contenu?.slice(0, 2000) ?? null,
        methodologie: chapitres[3]?.contenu?.slice(0, 2000) ?? null,
        planningJson: { chapitres: chapitres.map((c) => ({ numero: c.numero, titre: c.titre, nbPages: c.nbPages })) },
        equipeJson: { sectionsJonathan: sectionsJonathanRequired },
        referencesJson: { references: referencesUsees, schemas: schemasGeneres },
        differenciants: chapitres[2]?.contenu?.slice(0, 1000) ?? null,
        wordCount: chapitres.reduce((sum, c) => sum + c.contenu.split(/\s+/).length, 0),
        aiScoreRisk: scoreAntiDetect,
        humanizedAt: null,
      },
      update: {
        status: status.toLowerCase(),
        approche: chapitres[1]?.contenu?.slice(0, 2000) ?? null,
        methodologie: chapitres[3]?.contenu?.slice(0, 2000) ?? null,
        planningJson: { chapitres: chapitres.map((c) => ({ numero: c.numero, titre: c.titre, nbPages: c.nbPages })) },
        equipeJson: { sectionsJonathan: sectionsJonathanRequired },
        referencesJson: { references: referencesUsees, schemas: schemasGeneres },
        differenciants: chapitres[2]?.contenu?.slice(0, 1000) ?? null,
        wordCount: chapitres.reduce((sum, c) => sum + c.contenu.split(/\s+/).length, 0),
        aiScoreRisk: scoreAntiDetect,
      },
    });

    await this.agentEventLogger.log({
      agentName: 'agent-appels-offres:9e',
      eventType: 'memoire_generated',
      payload: { tenderId, analyseId, size },
      result: {
        nbChapitres: chapitres.length,
        nbPagesTotal,
        scoreAntiDetect,
        status,
        flagsActives: flags as unknown as Record<string, unknown>,
        jonathanSectionsCount: sectionsJonathanRequired.length,
      },
      durationMs: Date.now() - startTime,
    });

    this.logger.log({
      msg: 'Mémoire technique generated',
      tenderId,
      analyseId,
      nbPagesTotal,
      scoreAntiDetect,
      status,
    });

    return {
      analyseId,
      chapitres,
      referencesUsees,
      schemasGeneres,
      flagsActives: flags,
      ratioIaHumain: TARGET_RATIO_IA_HUMAIN,
      scoreAntiDetect,
      nbPagesTotal,
      status,
      sectionsJonathanRequired,
    };
  }

  private async generateChapitre(
    numero: number,
    tender: any,
    dceAnalysis: DceAnalysisOutput,
    flags: { rse: boolean; rgaa: boolean; voletSocial: boolean },
    size: 'MAPA' | 'AO',
  ): Promise<ChapitreMemoire> {
    const [minPages, maxPages] = CHAPTER_PAGE_LIMITS[size][numero as 1 | 2 | 3 | 4 | 5];
    const targetPages = Math.round((minPages + maxPages) / 2);
    const targetWords = targetPages * WORDS_PER_PAGE;

    const sectionsConditionnelles: string[] = [];
    const conditionalInstructions: string[] = [];

    if (flags.rgaa && (numero === 3 || numero === 2)) {
      sectionsConditionnelles.push('RGAA');
      conditionalInstructions.push(
        'Inclure une section RGAA (accessibilité numérique) détaillant la conformité au RGAA 4.1, niveaux A et AA.',
      );
    }
    if (flags.rse && (numero === 1 || numero === 4)) {
      sectionsConditionnelles.push('RSE');
      conditionalInstructions.push(
        'Inclure une section RSE (Responsabilité Sociétale des Entreprises) : politique environnementale, bilan carbone, achats responsables.',
      );
    }
    if (flags.voletSocial && numero === 4) {
      sectionsConditionnelles.push('Volet Social');
      conditionalInstructions.push(
        `Inclure le volet social avec le texte exact suivant (validé juridiquement, ne pas modifier) :\n\n"${VOLET_SOCIAL_WORDING}"`,
      );
    }

    const chapterConfig: Record<number, { titre: string; instructions: string }> = {
      1: {
        titre: 'Présentation de la société Axiom Marketing',
        instructions: `Rédige la présentation complète d'Axiom Marketing : histoire, valeurs, équipe, expertises clés (marketing digital, web, RGAA, e-commerce), références client notables, certifications, implantation géographique. Format : ${targetWords} mots (~${targetPages} pages). Utilise "nous" et "notre". Évite tout langage générique.`,
      },
      2: {
        titre: 'Compréhension du besoin et analyse du contexte',
        instructions: `Rédige une analyse approfondie du besoin exprimé dans l'appel d'offres "${tender.title}" pour ${tender.buyerName ?? 'l\'acheteur public'}. Montre que tu as parfaitement compris les enjeux, le contexte, les contraintes et les objectifs. Intègre les mots-clés miroir : ${dceAnalysis.mots_cles_miroir.slice(0, 8).join(', ')}. Format : ${targetWords} mots (~${targetPages} pages).`,
      },
      3: {
        titre: 'Solution technique proposée',
        instructions: `Rédige la description détaillée de la solution technique d'Axiom Marketing pour répondre à "${tender.title}". Décris l'approche, les technologies, l'architecture, les livrables, les jalons. Inclure [JONATHAN: Innovation technique spécifique — expertise métier réelle requise] et [JONATHAN: Positionnement prix — décision stratégique]. Format : ${targetWords} mots (~${targetPages} pages).`,
      },
      4: {
        titre: 'Méthodologie et organisation du projet',
        instructions: `Rédige la méthodologie de gestion de projet : phases, jalons, réunions de suivi, outils de gestion (JIRA, Notion), organisation de l'équipe, processus de validation client. Inclure [JONATHAN: Engagement spécifique client — formulation contractuelle à valider]. Format : ${targetWords} mots (~${targetPages} pages).`,
      },
      5: {
        titre: 'Maintenance, support et accompagnement',
        instructions: `Rédige la politique de maintenance et de support : niveaux de service (SLA), délais d'intervention, équipe support, formations, documentation, accompagnement post-livraison, conditions de renouvellement. Format : ${targetWords} mots (~${targetPages} pages).`,
      },
    };

    const chapConf = chapterConfig[numero];
    const allInstructions = [chapConf.instructions, ...conditionalInstructions].join('\n\n');

    const systemPrompt = `Tu es un expert en rédaction de mémoires techniques pour les marchés publics français. Tu rédiges pour Axiom Marketing, agence marketing digital et web.

RÈGLES D'ÉCRITURE ABSOLUES :
- Utilise "nous", "notre", "nos" (jamais "je" ni "on")
- Chiffres précis : 47%, 23 jours, 3 projets similaires (jamais ~50%, quelques jours)
- Phrases de longueur variée (5 à 35 mots), alternance courtes/longues
- Vocabulaire technique spécifique au domaine (pas générique)
- Anecdotes concrètes avec noms fictifs cohérents (ex: "Lors du projet MaVille 2024...")
- Jamais : "${AI_PATTERN_BLACKLIST.slice(0, 5).join('", "')}"
- Jamais de formules génériques ou de langue de bois
- Sois direct, précis, concret
- Format Markdown avec titres H2/H3 et listes à puces`;

    const userPrompt = `Chapitre ${numero} — ${chapConf.titre}

${allInstructions}

Appel d'offres : ${sanitizeForPrompt(tender.title)}
Acheteur : ${sanitizeForPrompt(tender.buyerName ?? 'Acheteur public')}
Type : ${size}
Stratégie prix recommandée : ${dceAnalysis.strategie_prix_recommandee || 'Compétitif sur valeur'}`;

    const result = await this.llmService.call({
      task: LlmTask.ANALYZE_DCE,
      systemPrompt,
      userPrompt,
      maxTokens: Math.max(2000, targetWords * 2),
      temperature: 0.7,
    });

    let contenu = result.content;

    // Apply anti-detection pass
    contenu = await this.applyAntiDetection(contenu);

    // Inject volet social verbatim if flagged and chapter 4
    if (flags.voletSocial && numero === 4 && !contenu.includes(VOLET_SOCIAL_WORDING.slice(0, 30))) {
      contenu += `\n\n### Volet social\n\n${VOLET_SOCIAL_WORDING}`;
    }

    const wordCount = contenu.split(/\s+/).length;
    const nbPages = Math.max(1, Math.round(wordCount / WORDS_PER_PAGE));

    return {
      numero,
      titre: chapConf.titre,
      contenu,
      nbPages,
      sectionsConditionnelles,
    };
  }

  private async applyAntiDetection(content: string): Promise<string> {
    // Check for blacklisted patterns
    const foundPatterns = AI_PATTERN_BLACKLIST.filter((pattern) =>
      content.toLowerCase().includes(pattern.toLowerCase()),
    );

    if (foundPatterns.length === 0) {
      return content;
    }

    const systemPrompt = `Tu es un éditeur spécialisé dans la rédaction humaine et naturelle pour les marchés publics.
Tu dois réécrire les passages qui contiennent des formules typiques d'IA pour les rendre plus naturels et authentiques.

FORMULES À ÉLIMINER : ${foundPatterns.map((p) => `"${p}"`).join(', ')}

RÈGLES DE REMPLACEMENT :
- Remplace par des formulations directes et concrètes
- Varie la longueur des phrases
- Utilise des tournures actives (nous faisons, plutôt que il est fait)
- Intègre des chiffres précis quand c'est possible
- Garde le sens et le contenu exact, change seulement la forme
- Ne modifie PAS les sections [JONATHAN: ...], les blocs Mermaid, ni le volet social`;

    const userPrompt = `Texte à nettoyer :\n\n${content}`;

    try {
      const result = await this.llmService.call({
        task: LlmTask.ANALYZE_DCE,
        systemPrompt,
        userPrompt,
        maxTokens: Math.min(4096, Math.round(content.length / 2)),
        temperature: 0.5,
      });
      return result.content;
    } catch (error) {
      this.logger.warn({ msg: 'Anti-detection rewrite failed, keeping original', error: (error as Error).message });
      return content;
    }
  }

  private generateMermaidDiagrams(tender: any, dceAnalysis: DceAnalysisOutput): string[] {
    const title = tender.title ?? 'Projet';
    const buyerName = tender.buyerName ?? 'Client';

    // Planning Gantt
    const gantt = `\`\`\`mermaid
gantt
    title Planning projet — ${title}
    dateFormat  YYYY-MM-DD
    section Phase 1 Cadrage
    Réunion de lancement          :a1, 2024-01-15, 5d
    Audit existant                :a2, after a1, 7d
    Validation périmètre          :milestone, after a2, 0d
    section Phase 2 Conception
    Spécifications fonctionnelles :b1, after a2, 10d
    Maquettes UX/UI               :b2, after b1, 10d
    Validation maquettes          :milestone, after b2, 0d
    section Phase 3 Réalisation
    Développement sprint 1        :c1, after b2, 14d
    Développement sprint 2        :c2, after c1, 14d
    Intégration contenus          :c3, after c2, 7d
    section Phase 4 Recette
    Tests fonctionnels            :d1, after c3, 7d
    Corrections                   :d2, after d1, 5d
    Recette client ${buyerName}    :d3, after d2, 5d
    section Phase 5 Livraison
    Formation équipe              :e1, after d3, 3d
    Mise en production            :milestone, after e1, 0d
    Support 3 mois post-livraison :e2, after e1, 90d
\`\`\``;

    // Architecture technique
    const hasRgaa = dceAnalysis.flags_conditionnels.rgaa;
    const architecture = `\`\`\`mermaid
graph TB
    subgraph "Côté client — ${buyerName}"
        U[Utilisateurs finaux]
        A[Administrateurs]
    end
    subgraph "Front-end"
        FE[Interface web responsive<br/>HTML5 / CSS3 / JS]
        ${hasRgaa ? 'RG[Module RGAA 4.1<br/>Conformité AA]' : ''}
    end
    subgraph "Back-end Axiom"
        API[API REST sécurisée<br/>Node.js / NestJS]
        CMS[CMS Headless<br/>Gestion contenus]
        AUTH[Service Auth<br/>SSO / SAML]
    end
    subgraph "Infrastructure"
        CDN[CDN Cloudflare<br/>Performances & sécurité]
        DB[(Base de données<br/>PostgreSQL)]
        CACHE[(Cache Redis<br/>Performances)]
    end
    U --> FE
    A --> CMS
    FE --> CDN
    CDN --> API
    API --> AUTH
    API --> DB
    API --> CACHE
    CMS --> API
    ${hasRgaa ? 'FE --> RG' : ''}
\`\`\``;

    // Organigramme équipe projet
    const organigramme = `\`\`\`mermaid
graph TD
    JO["Jonathan O.<br/>Directeur de projet<br/>Axiom Marketing"]
    CP["Chef de projet<br/>Coordination & planning"]
    DT["Développeur Lead<br/>Architecture & développement"]
    UX["Designer UX/UI<br/>Expérience utilisateur"]
    QA["Responsable QA<br/>Tests & recette"]
    ${hasRgaa ? 'ACC["Expert RGAA<br/>Audit accessibilité"]' : ''}
    RC["Référent client<br/>${buyerName}"]
    JO --> CP
    CP --> DT
    CP --> UX
    CP --> QA
    ${hasRgaa ? 'CP --> ACC' : ''}
    RC <-.->|"Points hebdomadaires"| CP
\`\`\``;

    return [
      `Diagramme Gantt — planning projet sur 6 mois:\n${gantt}`,
      `Architecture technique de la solution:\n${architecture}`,
      `Organigramme équipe projet:\n${organigramme}`,
    ];
  }

  private identifySectionsJonathan(chapitres: ChapitreMemoire[]): string[] {
    const sections: string[] = [];
    const jonathanMarkers = [
      {
        pattern: /\[JONATHAN:[^\]]+innovation/i,
        label: 'Chapitre 3 — Innovation technique : expertise métier réelle requise',
      },
      {
        pattern: /\[JONATHAN:[^\]]+prix/i,
        label: 'Chapitre 3 — Positionnement prix : décision stratégique',
      },
      {
        pattern: /\[JONATHAN:[^\]]+engagement/i,
        label: 'Chapitre 4 — Engagement spécifique client : formulation contractuelle',
      },
    ];

    // Always required regardless of content
    sections.push('Annexes — CV et parcours de l\'équipe projet : données personnelles non générables par IA');
    sections.push('Annexes — Références projets passés : anecdotes et chiffres réels à fournir par Jonathan');

    for (const chapitre of chapitres) {
      for (const marker of jonathanMarkers) {
        if (marker.pattern.test(chapitre.contenu) && !sections.includes(marker.label)) {
          sections.push(marker.label);
        }
      }
    }

    // Check for generic [JONATHAN:...] tags in any chapter
    for (const chapitre of chapitres) {
      const matches = chapitre.contenu.match(/\[JONATHAN:[^\]]+\]/g) ?? [];
      for (const match of matches) {
        const label = `Chapitre ${chapitre.numero} — ${match}`;
        if (!sections.some((s) => s.includes(match))) {
          sections.push(label);
        }
      }
    }

    return [...new Set(sections)];
  }

  private calculateAntiDetectionScore(chapitres: ChapitreMemoire[]): number {
    const fullText = chapitres.map((c) => c.contenu).join('\n\n');
    const words = fullText.split(/\s+/);
    const totalWords = Math.max(1, words.length);

    let score = 0;

    // Check for AI blacklist patterns (up to 40 points)
    for (const pattern of AI_PATTERN_BLACKLIST) {
      const regex = new RegExp(pattern, 'gi');
      const matches = (fullText.match(regex) ?? []).length;
      score += matches * 4;
    }

    // Check sentence length variation (up to 20 points)
    const sentences = fullText.split(/[.!?]+/).filter((s) => s.trim().length > 5);
    if (sentences.length > 5) {
      const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
      const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const stdDev = Math.sqrt(lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length);
      // Low std dev = more uniform = more AI-like → higher score (worse)
      if (stdDev < 5) score += 20;
      else if (stdDev < 8) score += 10;
      else if (stdDev < 12) score += 5;
    }

    // Check for round numbers vs precise numbers (up to 20 points)
    const roundNumbers = (fullText.match(/\b(50|100|200|500|1000|10|20|30|40|60|70|80|90)\b/g) ?? []).length;
    const preciseNumbers = (fullText.match(/\b\d*[1-9]\d*[%]\b|\b\d{2,}(?!\d)\b/g) ?? []).length;
    if (roundNumbers > preciseNumbers * 2) score += 20;
    else if (roundNumbers > preciseNumbers) score += 10;

    // Check for personal pronouns (up to 20 points — GOOD if present, PENALIZE if absent)
    const pronounCount = (fullText.match(/\b(nous|notre|nos|axiom)\b/gi) ?? []).length;
    const pronounDensity = (pronounCount / totalWords) * 100;
    if (pronounDensity < 0.3) score += 20;
    else if (pronounDensity < 0.5) score += 10;

    // Stub Copyleaks API call — in production would call external service
    // const copyleaksApiKey = this.config.get<string>('COPYLEAKS_API_KEY');
    // const copyleaksApiUrl = this.config.get<string>('COPYLEAKS_API_URL');
    // if (copyleaksApiKey && copyleaksApiUrl) { ... }

    return Math.min(100, Math.max(0, score));
  }

  private extractReferences(chapitres: ChapitreMemoire[]): string[] {
    const fullText = chapitres.map((c) => c.contenu).join('\n\n');
    const references: string[] = [];

    // Extract project references (e.g. "projet MaVille 2024", "mission ARS 2023")
    const projectMatches = fullText.match(/(?:projet|mission|chantier|contrat)\s+[A-Z][a-zA-ZÀ-ÿ]+\s+\d{4}/g) ?? [];
    references.push(...projectMatches);

    // Extract client references
    const clientMatches = fullText.match(/\b(?:pour|avec)\s+[A-Z][a-zA-ZÀ-ÿ\s]{5,30}(?:\s+en\s+\d{4})?\b/g) ?? [];
    references.push(...clientMatches.slice(0, 5));

    return [...new Set(references)].slice(0, 10);
  }

  private rehydrateFromDb(record: any, analyseId: string): MemoireTechniqueResult {
    const planningJson = (record.planningJson as any) ?? {};
    const equipeJson = (record.equipeJson as any) ?? {};
    const referencesJson = (record.referencesJson as any) ?? {};

    const chapitres: ChapitreMemoire[] = (planningJson.chapitres ?? []).map((c: any) => ({
      numero: c.numero,
      titre: c.titre,
      contenu: '',
      nbPages: c.nbPages,
      sectionsConditionnelles: [],
    }));

    const statusMap: Record<string, MemoireTechniqueResult['status']> = {
      draft: 'DRAFT',
      review: 'REVIEW',
      validated: 'VALIDATED',
      final: 'FINAL',
    };

    return {
      analyseId,
      chapitres,
      referencesUsees: referencesJson.references ?? [],
      schemasGeneres: referencesJson.schemas ?? [],
      flagsActives: { rse: false, rgaa: false, voletSocial: false },
      ratioIaHumain: TARGET_RATIO_IA_HUMAIN,
      scoreAntiDetect: record.aiScoreRisk ?? 0,
      nbPagesTotal: chapitres.reduce((sum: number, c: ChapitreMemoire) => sum + c.nbPages, 0),
      status: statusMap[record.status] ?? 'DRAFT',
      sectionsJonathanRequired: equipeJson.sectionsJonathan ?? [],
    };
  }
}
