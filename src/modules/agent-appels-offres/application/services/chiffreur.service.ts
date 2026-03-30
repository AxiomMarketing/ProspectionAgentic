import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@core/database/prisma.service';
import { LlmService } from '@modules/llm/llm.service';
import { LlmTask } from '@modules/llm/llm.types';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { DceAnalysisOutput } from './dce-analyzer.service';
import { QualificationAxes } from './qualifier.service';

export type PricingStrategy = 'AGRESSIVE' | 'EQUILIBREE' | 'PREMIUM';

export interface LigneBudget {
  poste: string;
  description: string;
  unite: string;
  quantite: number;
  prixUnitaire: number;
  total: number;
  seniorite: 'SENIOR' | 'CONFIRME' | 'JUNIOR';
}

export interface OffreFinanciereResult {
  analyseId: string;
  typeDocument: 'BPU' | 'DQE' | 'DPGF';
  lignesBudget: LigneBudget[];
  montantTotal: number;
  margeNette: number; // percentage
  margeLodeom: number; // LODEOM abatement if DOM-TOM
  strategie: PricingStrategy;
  alertes: string[]; // margin warnings
  status: 'DRAFT' | 'VALIDATED' | 'FINAL';
}

const TJM_GRILLE = {
  SENIOR: { min: 1200, max: 1500, default: 1350 },
  CONFIRME: { min: 800, max: 1000, default: 900 },
  JUNIOR: { min: 400, max: 600, default: 500 },
} as const;

const TJM_MOYEN = 800;

const MARGIN_THRESHOLDS = [
  { max: 5, severity: 'BLOQUANTE', message: 'Marge < 5% — Ne PAS soumettre sans validation Jonathan' },
  { max: 15, severity: 'HAUTE', message: 'Marge 5-15% — Acceptable si marché stratégique' },
  { max: 25, severity: 'MOYENNE', message: 'Marge 15-25% — Confortable' },
  { max: 100, severity: 'BASSE', message: 'Marge > 25% — Attention offre anormalement haute' },
];

const STRATEGY_MULTIPLIERS: Record<PricingStrategy, number> = {
  AGRESSIVE: 0.85,
  EQUILIBREE: 1.0,
  PREMIUM: 1.15,
};

@Injectable()
export class ChiffreurService {
  private readonly logger = new Logger(ChiffreurService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly config: ConfigService,
    private readonly agentEventLogger: AgentEventLoggerService,
  ) {}

  async generateOffreFinanciere(
    tenderId: string,
    analyseId: string,
    dceAnalysis: DceAnalysisOutput,
    qualificationResult: { axes: QualificationAxes },
  ): Promise<OffreFinanciereResult> {
    const startTime = Date.now();
    const prismaAny = this.prisma as any;

    // Idempotence: check if offer already exists
    const existing = await prismaAny.aoOffreFinanciere.findUnique({
      where: { analyseId },
    });

    if (existing) {
      this.logger.debug({ msg: 'OffreFinanciere already exists, returning cached result', analyseId });

      return {
        analyseId,
        typeDocument: existing.typeDocument as OffreFinanciereResult['typeDocument'],
        lignesBudget: (existing.lignesBudget as LigneBudget[]) ?? [],
        montantTotal: existing.montantTotal ?? 0,
        margeNette: existing.margeNette ?? 0,
        margeLodeom: existing.margeLodeom ?? 0,
        strategie: existing.strategie as PricingStrategy,
        alertes: (existing.alertes as string[]) ?? [],
        status: existing.status as OffreFinanciereResult['status'],
      };
    }

    const strategie = this.determinePricingStrategy(dceAnalysis);
    const typeDocument = this.determineDocumentType(dceAnalysis);

    // Use Claude Sonnet to generate budget lines
    const lignesBudget = await this.generateBudgetLines(dceAnalysis, strategie);

    // Get estimated amount from tender
    const tender = await prismaAny.publicTender.findUnique({ where: { id: tenderId } });
    const montantEstime = tender?.estimatedAmount ?? tender?.estimatedBudget ?? 0;

    // Calculate total from lines
    const montantTotal = lignesBudget.reduce((sum, l) => sum + l.total, 0);

    const { margeNette, margeLodeom, alertes } = this.calculateMargin(lignesBudget, montantEstime);

    // Persist offer
    const offre = await prismaAny.aoOffreFinanciere.create({
      data: {
        analyseId,
        tenderId,
        typeDocument,
        lignesBudget: lignesBudget as any,
        montantTotal,
        margeNette,
        margeLodeom,
        strategie,
        alertes,
        status: 'DRAFT',
      },
    });

    await this.agentEventLogger.log({
      agentName: 'agent-appels-offres:9d',
      eventType: 'offre_financiere_generated',
      payload: { tenderId, analyseId },
      result: { strategie, typeDocument, montantTotal, margeNette, alertesCount: alertes.length },
      durationMs: Date.now() - startTime,
    });

    this.logger.log({ msg: 'OffreFinanciere generated', tenderId, analyseId, strategie, montantTotal, margeNette });

    return {
      analyseId,
      typeDocument,
      lignesBudget,
      montantTotal,
      margeNette,
      margeLodeom,
      strategie,
      alertes,
      status: 'DRAFT',
    };
  }

  private determinePricingStrategy(dceAnalysis: DceAnalysisOutput): PricingStrategy {
    const criteres = dceAnalysis.criteres_evaluation ?? [];

    // Sum ponderation for prix-related and technique-related criteria
    let prixWeight = 0;
    let techniqueWeight = 0;

    for (const c of criteres) {
      const label = c.critere.toLowerCase();
      if (label.includes('prix') || label.includes('financier') || label.includes('coût')) {
        prixWeight += c.ponderation;
      } else if (label.includes('technique') || label.includes('qualité') || label.includes('méthodologie')) {
        techniqueWeight += c.ponderation;
      }
    }

    if (prixWeight > 50) return 'AGRESSIVE';
    if (techniqueWeight > 60) return 'PREMIUM';
    return 'EQUILIBREE';
  }

  private determineDocumentType(dceAnalysis: DceAnalysisOutput): 'BPU' | 'DQE' | 'DPGF' {
    const pieces = (dceAnalysis.pieces_exigees ?? []).map((p) => p.toUpperCase());
    const criteres = (dceAnalysis.criteres_evaluation ?? []).map((c) => c.critere.toUpperCase());
    const allText = [...pieces, ...criteres].join(' ');

    if (allText.includes('DPGF')) return 'DPGF';
    if (allText.includes('DQE')) return 'DQE';
    if (allText.includes('BPU')) return 'BPU';

    // Default: BPU for service tenders
    return 'BPU';
  }

  private calculateMargin(
    lignes: LigneBudget[],
    montantEstime: number,
  ): { margeNette: number; margeLodeom: number; alertes: string[] } {
    const montantTotal = lignes.reduce((sum, l) => sum + l.total, 0);
    const alertes: string[] = [];

    if (montantTotal === 0) {
      return { margeNette: 0, margeLodeom: 0, alertes: ['Montant total nul — impossible de calculer la marge'] };
    }

    // Cost calculation from budget lines
    const realCost = lignes.reduce((sum, l) => sum + l.quantite * TJM_GRILLE[l.seniorite].default, 0);
    const margeNette = montantTotal > 0 ? Math.round(((montantTotal - realCost) / montantTotal) * 100) : 0;

    // LODEOM: DOM-TOM charge abatement
    const lodeomRate = parseFloat(this.config.get<string>('LODEOM_ABATEMENT_RATE') ?? '0.40');
    const chargesBase = realCost * 0.45; // estimated charges at 45% of labor cost
    const lodeomSaving = chargesBase * lodeomRate;
    const margeLodeom = montantEstime > 0
      ? Math.round((lodeomSaving / montantTotal) * 100)
      : 0;

    // Generate alerts based on thresholds
    for (const threshold of MARGIN_THRESHOLDS) {
      if (margeNette < threshold.max) {
        alertes.push(`[${threshold.severity}] ${threshold.message} (marge actuelle: ${margeNette}%)`);
        break;
      }
    }

    return { margeNette, margeLodeom, alertes };
  }

  private async generateBudgetLines(
    dceAnalysis: DceAnalysisOutput,
    strategy: PricingStrategy,
  ): Promise<LigneBudget[]> {
    const multiplier = STRATEGY_MULTIPLIERS[strategy];

    const systemPrompt = `Tu es un chiffreur expert en marchés publics pour une agence web/digital/marketing (Axiom Marketing).
Génère des lignes budgétaires détaillées pour répondre à cet appel d'offres.

Réponds UNIQUEMENT en JSON valide avec ce tableau :
[
  {
    "poste": "<nom du poste>",
    "description": "<description>",
    "unite": "jour",
    "quantite": <nombre de jours>,
    "prixUnitaire": <TJM en EUR>,
    "total": <quantite * prixUnitaire>,
    "seniorite": "<SENIOR|CONFIRME|JUNIOR>"
  }
]

TJM de référence : SENIOR=${TJM_GRILLE.SENIOR.default}€, CONFIRME=${TJM_GRILLE.CONFIRME.default}€, JUNIOR=${TJM_GRILLE.JUNIOR.default}€
Génère entre 3 et 8 postes selon la complexité du marché.
Le montant total doit être cohérent avec la taille du marché.`;

    const userPrompt = `Appel d'offres à chiffrer :
Critères d'évaluation : ${JSON.stringify(dceAnalysis.criteres_evaluation)}
Conditions de participation : ${dceAnalysis.conditions_participation.join(', ')}
Exigences clés : ${dceAnalysis.exigences_individuelles.slice(0, 5).map((e) => e.description).join(', ')}
Pièces exigées : ${dceAnalysis.pieces_exigees.join(', ')}
Stratégie tarifaire : ${strategy} (multiplicateur ${multiplier})

Génère les lignes budgétaires avec les TJM ajustés par le multiplicateur de stratégie.`;

    try {
      const result = await this.llmService.call({
        task: LlmTask.ANALYZE_DCE,
        systemPrompt,
        userPrompt,
        maxTokens: 1500,
        temperature: 0.2,
      });

      const cleaned = result.content.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
      const parsed = JSON.parse(cleaned) as LigneBudget[];

      // Apply strategy multiplier and clamp TJMs
      const adjusted = parsed.map((ligne) => {
        const tjmRef = TJM_GRILLE[ligne.seniorite]?.default ?? TJM_MOYEN;
        const prixUnitaire = Math.round(tjmRef * multiplier);
        const total = Math.round(ligne.quantite * prixUnitaire);
        return {
          ...ligne,
          prixUnitaire,
          total,
        };
      });

      // Validate sum integrity
      const sumCheck = adjusted.reduce((sum, l) => sum + l.total, 0);
      this.logger.debug({ msg: 'Budget lines generated', count: adjusted.length, totalEur: sumCheck, strategy });

      return adjusted;
    } catch (error) {
      this.logger.warn({ msg: 'Failed to generate budget lines via Claude, using defaults', error: (error as Error).message });
      return this.generateDefaultBudgetLines(strategy, multiplier);
    }
  }

  private generateDefaultBudgetLines(strategy: PricingStrategy, multiplier: number): LigneBudget[] {
    const lines: Array<Omit<LigneBudget, 'prixUnitaire' | 'total'> & { senioriteRef: 'SENIOR' | 'CONFIRME' | 'JUNIOR' }> = [
      { poste: 'Cadrage et analyse des besoins', description: 'Réunion de lancement, analyse des enjeux', unite: 'jour', quantite: 2, seniorite: 'SENIOR', senioriteRef: 'SENIOR' },
      { poste: 'Direction de projet', description: 'Pilotage et coordination tout au long du projet', unite: 'jour', quantite: 5, seniorite: 'SENIOR', senioriteRef: 'SENIOR' },
      { poste: 'Conception fonctionnelle', description: 'Arborescence, zoning, wireframes', unite: 'jour', quantite: 3, seniorite: 'CONFIRME', senioriteRef: 'CONFIRME' },
      { poste: 'Développement / Intégration', description: 'Développement et intégration des pages', unite: 'jour', quantite: 10, seniorite: 'CONFIRME', senioriteRef: 'CONFIRME' },
      { poste: 'Recette et tests', description: 'Tests fonctionnels et corrections', unite: 'jour', quantite: 2, seniorite: 'JUNIOR', senioriteRef: 'JUNIOR' },
      { poste: 'Formation et documentation', description: 'Formation des utilisateurs finaux', unite: 'jour', quantite: 1, seniorite: 'CONFIRME', senioriteRef: 'CONFIRME' },
    ];

    return lines.map((l) => {
      const tjmRef = TJM_GRILLE[l.senioriteRef].default;
      const prixUnitaire = Math.round(tjmRef * multiplier);
      const total = Math.round(l.quantite * prixUnitaire);
      return {
        poste: l.poste,
        description: l.description,
        unite: l.unite,
        quantite: l.quantite,
        prixUnitaire,
        total,
        seniorite: l.seniorite,
      };
    });
  }
}
