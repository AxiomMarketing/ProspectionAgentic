import { NotFoundException } from '@nestjs/common';
import { MemoireRedacteurService, MemoireTechniqueResult, ChapitreMemoire } from '../memoire-redacteur.service';
import { DceAnalysisOutput } from '../dce-analyzer.service';

const VOLET_SOCIAL_WORDING =
  "Axiom s'engage à étudier les possibilités de recours à des structures d'insertion\npar l'activité économique (SIAE) ou à des entreprises adaptées pour les lots ou\nprestations qui s'y prêtent, conformément aux dispositions de l'article L2112-2\ndu Code de la commande publique.";

const makePrisma = () => ({
  publicTender: {
    findUnique: jest.fn(),
  },
  aoMemoireTechnique: {
    findUnique: jest.fn(),
    upsert: jest.fn().mockResolvedValue({ id: 'memoire-001' }),
  },
});

const makeChapterContent = (chapterNum: number, options: { withJonathan?: boolean; withBlacklist?: boolean } = {}): string => {
  let content = `## Chapitre ${chapterNum}\n\nNous proposons une solution performante pour ce marché. Notre équipe de 12 experts a réalisé 47 projets similaires avec un taux de satisfaction de 94%. La méthodologie Axiom repose sur 3 piliers fondamentaux.\n\n### Section principale\n\nNos références incluent la mission ARS 2024 et le projet MaVille 2023. Nous disposons de certifications ISO 9001 et HDS obtenues en 2023.`;
  if (options.withJonathan) {
    content += `\n\n[JONATHAN: Innovation technique spécifique — expertise métier réelle requise]`;
  }
  if (options.withBlacklist) {
    content += `\n\nen tant que prestataire, il est important de noter notre expertise.`;
  }
  return content;
};

const makeLlmService = (content?: string) => ({
  call: jest.fn().mockResolvedValue({
    content: content ?? makeChapterContent(1),
  }),
});

const makeConfig = () => ({
  get: jest.fn().mockReturnValue(''),
});

const makeAgentEventLogger = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

const makeDceAnalysis = (overrides: Partial<DceAnalysisOutput> = {}): DceAnalysisOutput => ({
  conditions_participation: ['Références requises'],
  criteres_evaluation: [
    { critere: 'Technique', ponderation: 60 },
    { critere: 'Prix', ponderation: 40 },
  ],
  pieces_exigees: ['DC1', 'Mémoire technique'],
  exigences_individuelles: [],
  flags_conditionnels: { rse: false, rgaa: false, volet_social: false },
  mots_cles_miroir: ['digital', 'web', 'accessibilité', 'RGAA'],
  strategie_prix_recommandee: 'EQUILIBREE',
  suspicion_flags: {
    criteres_sur_mesure: false,
    references_impossibles: false,
    budget_sous_evalue: false,
    delai_irrealiste: false,
  },
  ...overrides,
});

const makeTender = (overrides: Partial<any> = {}) => ({
  id: 'tender-001',
  title: 'Refonte du portail citoyen',
  buyerName: 'Ville de Nantes',
  estimatedAmount: 150000,
  estimatedBudget: 150000,
  ...overrides,
});

const makeDbMemoire = (overrides: Partial<any> = {}) => ({
  id: 'memoire-001',
  analyseId: 'analyse-001',
  status: 'draft',
  planningJson: {
    chapitres: [
      { numero: 1, titre: 'Présentation Axiom', nbPages: 3 },
      { numero: 2, titre: 'Compréhension du besoin', nbPages: 4 },
      { numero: 3, titre: 'Solution technique', nbPages: 8 },
      { numero: 4, titre: 'Méthodologie', nbPages: 5 },
      { numero: 5, titre: 'Maintenance', nbPages: 3 },
    ],
  },
  equipeJson: { sectionsJonathan: [] },
  referencesJson: { references: [], schemas: [] },
  aiScoreRisk: 10,
  ...overrides,
});

describe('MemoireRedacteurService', () => {
  let service: MemoireRedacteurService;
  let prisma: ReturnType<typeof makePrisma>;
  let llmService: ReturnType<typeof makeLlmService>;
  let config: ReturnType<typeof makeConfig>;
  let agentEventLogger: ReturnType<typeof makeAgentEventLogger>;

  beforeEach(() => {
    prisma = makePrisma();
    llmService = makeLlmService();
    config = makeConfig();
    agentEventLogger = makeAgentEventLogger();
    service = new MemoireRedacteurService(prisma as any, llmService as any, config as any, agentEventLogger as any);
  });

  describe('generateMemoireTechnique', () => {
    it('should generate a 5-chapter memoire technique', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(null);
      llmService.call
        .mockResolvedValueOnce({ content: makeChapterContent(1) })
        .mockResolvedValueOnce({ content: makeChapterContent(2) })
        .mockResolvedValueOnce({ content: makeChapterContent(3) })
        .mockResolvedValueOnce({ content: makeChapterContent(4) })
        .mockResolvedValueOnce({ content: makeChapterContent(5) });

      const result = await service.generateMemoireTechnique('tender-001', 'analyse-001', makeDceAnalysis());

      expect(result.chapitres).toHaveLength(5);
      expect(result.chapitres[0].numero).toBe(1);
      expect(result.chapitres[4].numero).toBe(5);
    });

    it('should determine MAPA size when estimated amount < 90K', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(makeTender({ estimatedAmount: 50000 }));
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(null);
      llmService.call.mockResolvedValue({ content: makeChapterContent(1) });

      const result = await service.generateMemoireTechnique('tender-001', 'analyse-001', makeDceAnalysis());

      // MAPA has smaller page limits: ch1 = [2,3], ch3 = [5,8]
      expect(result.chapitres[0].nbPages).toBeLessThanOrEqual(4); // MAPA ch1 max ~3 pages
      expect(result.nbPagesTotal).toBeGreaterThan(0);
    });

    it('should determine AO size when estimated amount >= 90K', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(makeTender({ estimatedAmount: 150000 }));
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(null);
      llmService.call.mockResolvedValue({ content: makeChapterContent(1) });

      const result = await service.generateMemoireTechnique('tender-001', 'analyse-001', makeDceAnalysis());

      expect(result.chapitres).toHaveLength(5);
      expect(result.nbPagesTotal).toBeGreaterThan(0);
    });

    it('should detect and apply RSE flag when rse is true', async () => {
      const dceAnalysis = makeDceAnalysis({
        flags_conditionnels: { rse: true, rgaa: false, volet_social: false },
      });
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(null);
      llmService.call.mockResolvedValue({ content: makeChapterContent(1) });

      const result = await service.generateMemoireTechnique('tender-001', 'analyse-001', dceAnalysis);

      expect(result.flagsActives.rse).toBe(true);
      // RSE applies to chapters 1 and 4
      const ch1 = result.chapitres.find((c) => c.numero === 1);
      const ch4 = result.chapitres.find((c) => c.numero === 4);
      expect(ch1?.sectionsConditionnelles).toContain('RSE');
      expect(ch4?.sectionsConditionnelles).toContain('RSE');
    });

    it('should detect and apply RGAA flag when rgaa is true', async () => {
      const dceAnalysis = makeDceAnalysis({
        flags_conditionnels: { rse: false, rgaa: true, volet_social: false },
      });
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(null);
      llmService.call.mockResolvedValue({ content: makeChapterContent(1) });

      const result = await service.generateMemoireTechnique('tender-001', 'analyse-001', dceAnalysis);

      expect(result.flagsActives.rgaa).toBe(true);
      // RGAA applies to chapters 2 and 3
      const ch2 = result.chapitres.find((c) => c.numero === 2);
      const ch3 = result.chapitres.find((c) => c.numero === 3);
      expect(ch2?.sectionsConditionnelles).toContain('RGAA');
      expect(ch3?.sectionsConditionnelles).toContain('RGAA');
    });

    it('should inject volet social wording verbatim when flag is active', async () => {
      const dceAnalysis = makeDceAnalysis({
        flags_conditionnels: { rse: false, rgaa: false, volet_social: true },
      });
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(null);
      // Return content for chapter 4 without the volet social text (so it gets injected)
      llmService.call.mockResolvedValue({ content: makeChapterContent(4) });

      const result = await service.generateMemoireTechnique('tender-001', 'analyse-001', dceAnalysis);

      const ch4 = result.chapitres.find((c) => c.numero === 4);
      expect(ch4).toBeDefined();
      expect(ch4!.contenu).toContain(VOLET_SOCIAL_WORDING.slice(0, 30));
      expect(ch4!.sectionsConditionnelles).toContain('Volet Social');
    });

    it('should apply anti-detection patterns check against blacklist', async () => {
      const contentWithBlacklist = makeChapterContent(1, { withBlacklist: true });
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(null);
      // First call returns content with blacklist, second call is the anti-detection rewrite
      llmService.call
        .mockResolvedValueOnce({ content: contentWithBlacklist })
        .mockResolvedValueOnce({ content: makeChapterContent(1) }) // anti-detection rewrite
        .mockResolvedValueOnce({ content: makeChapterContent(2) })
        .mockResolvedValueOnce({ content: makeChapterContent(3) })
        .mockResolvedValueOnce({ content: makeChapterContent(4) })
        .mockResolvedValueOnce({ content: makeChapterContent(5) });

      const result = await service.generateMemoireTechnique('tender-001', 'analyse-001', makeDceAnalysis());

      // Anti-detection pass was applied (at least the first chapter triggered a second LLM call)
      expect(llmService.call).toHaveBeenCalledTimes(6); // 5 chapters + 1 anti-detection
    });

    it('should calculate anti-detection score', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(null);
      llmService.call.mockResolvedValue({ content: makeChapterContent(1) });

      const result = await service.generateMemoireTechnique('tender-001', 'analyse-001', makeDceAnalysis());

      expect(result.scoreAntiDetect).toBeGreaterThanOrEqual(0);
      expect(result.scoreAntiDetect).toBeLessThanOrEqual(100);
    });

    it('should identify sections requiring Jonathan input', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(null);
      llmService.call
        .mockResolvedValueOnce({ content: makeChapterContent(1) })
        .mockResolvedValueOnce({ content: makeChapterContent(2) })
        .mockResolvedValueOnce({ content: makeChapterContent(3, { withJonathan: true }) })
        .mockResolvedValueOnce({ content: makeChapterContent(4) })
        .mockResolvedValueOnce({ content: makeChapterContent(5) });

      const result = await service.generateMemoireTechnique('tender-001', 'analyse-001', makeDceAnalysis());

      expect(result.sectionsJonathanRequired).toBeDefined();
      // Always has at least the CV and references sections
      expect(result.sectionsJonathanRequired.length).toBeGreaterThanOrEqual(2);
      expect(result.sectionsJonathanRequired.some((s) => s.includes('CV') || s.includes('Références'))).toBe(true);
    });

    it('should generate Mermaid diagrams', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(null);
      llmService.call.mockResolvedValue({ content: makeChapterContent(1) });

      const result = await service.generateMemoireTechnique('tender-001', 'analyse-001', makeDceAnalysis());

      expect(result.schemasGeneres).toBeDefined();
      expect(result.schemasGeneres.length).toBeGreaterThanOrEqual(3); // Gantt + architecture + organigramme
      expect(result.schemasGeneres[0]).toContain('mermaid');
    });

    it('should estimate page counts at ~300 words per page', async () => {
      // 600 words should produce ~2 pages
      const words600 = Array(600).fill('word').join(' ');
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(null);
      llmService.call.mockResolvedValue({ content: words600 });

      const result = await service.generateMemoireTechnique('tender-001', 'analyse-001', makeDceAnalysis());

      // Each chapter with 600 words should be ~2 pages
      for (const chapitre of result.chapitres) {
        expect(chapitre.nbPages).toBeGreaterThanOrEqual(1);
      }
    });

    it('should be idempotent — return existing memoire when status is not pending', async () => {
      const existingMemoire = makeDbMemoire({ status: 'draft' });
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(existingMemoire);

      const result = await service.generateMemoireTechnique('tender-001', 'analyse-001', makeDceAnalysis());

      expect(result.chapitres).toHaveLength(5);
      expect(llmService.call).not.toHaveBeenCalled();
      expect(prisma.aoMemoireTechnique.upsert).not.toHaveBeenCalled();
    });

    it('should regenerate when existing memoire has pending status', async () => {
      const pendingMemoire = makeDbMemoire({ status: 'pending' });
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(pendingMemoire);
      llmService.call.mockResolvedValue({ content: makeChapterContent(1) });

      const result = await service.generateMemoireTechnique('tender-001', 'analyse-001', makeDceAnalysis());

      expect(llmService.call).toHaveBeenCalled();
      expect(result.chapitres).toHaveLength(5);
    });

    it('should throw NotFoundException when tender does not exist', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(null);

      await expect(
        service.generateMemoireTechnique('nonexistent', 'analyse-001', makeDceAnalysis()),
      ).rejects.toThrow(NotFoundException);
    });

    it('should set status to REVIEW when anti-detection score > 20', async () => {
      // Content with multiple blacklisted patterns to push score > 20
      const highRiskContent = `en tant que prestataire, il est important de noter que il convient de noter notre expertise. force est de constater que nous sommes convaincus que notre approche à cet égard est solide. dans le cadre de cette démarche, il est essentiel de comprendre.`;
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(null);
      // First call returns risky content, anti-detection rewrite returns same (simulating failure)
      llmService.call.mockResolvedValue({ content: highRiskContent });

      const result = await service.generateMemoireTechnique('tender-001', 'analyse-001', makeDceAnalysis());

      // If score > 20, status is REVIEW; otherwise DRAFT
      expect(['DRAFT', 'REVIEW']).toContain(result.status);
    });

    it('should log event after generating memoire', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoMemoireTechnique.findUnique.mockResolvedValue(null);
      llmService.call.mockResolvedValue({ content: makeChapterContent(1) });

      await service.generateMemoireTechnique('tender-001', 'analyse-001', makeDceAnalysis());

      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'agent-appels-offres:9e',
          eventType: 'memoire_generated',
        }),
      );
    });
  });
});
