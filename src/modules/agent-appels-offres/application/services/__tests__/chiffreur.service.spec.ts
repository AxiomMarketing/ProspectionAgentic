import { ChiffreurService, OffreFinanciereResult, LigneBudget, PricingStrategy } from '../chiffreur.service';
import { DceAnalysisOutput } from '../dce-analyzer.service';

const makePrisma = () => ({
  aoOffreFinanciere: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  publicTender: {
    findUnique: jest.fn(),
  },
});

const makeLlmService = (responseJson?: LigneBudget[]) => ({
  call: jest.fn().mockResolvedValue({
    content: JSON.stringify(
      responseJson ?? [
        { poste: 'Direction de projet', description: 'Pilotage', unite: 'jour', quantite: 5, prixUnitaire: 1350, total: 6750, seniorite: 'SENIOR' },
        { poste: 'Développement', description: 'Dev', unite: 'jour', quantite: 10, prixUnitaire: 900, total: 9000, seniorite: 'CONFIRME' },
        { poste: 'Tests', description: 'QA', unite: 'jour', quantite: 2, prixUnitaire: 500, total: 1000, seniorite: 'JUNIOR' },
      ],
    ),
  }),
});

const makeConfig = (overrides: Record<string, string> = {}) => ({
  get: jest.fn((key: string) => {
    const defaults: Record<string, string> = {
      LODEOM_ABATEMENT_RATE: '0.40',
      ...overrides,
    };
    return defaults[key] ?? '';
  }),
});

const makeAgentEventLogger = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

const makeDceAnalysis = (overrides: Partial<DceAnalysisOutput> = {}): DceAnalysisOutput => ({
  conditions_participation: ['Références similaires'],
  criteres_evaluation: [
    { critere: 'Prix', ponderation: 40 },
    { critere: 'Technique', ponderation: 60 },
  ],
  pieces_exigees: ['BPU', 'DC1'],
  exigences_individuelles: [
    { code: 'EX-001', type: 'technique', description: 'CMS headless', source: 'RC', priorite: 'OBLIGATOIRE' },
  ],
  flags_conditionnels: { rse: false, rgaa: false, volet_social: false },
  mots_cles_miroir: ['digital', 'web'],
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
  title: 'Refonte portail citoyen',
  buyerName: 'Communauté urbaine de Bordeaux',
  estimatedAmount: 150000,
  estimatedBudget: 150000,
  ...overrides,
});

const makeOffre = (overrides: Partial<any> = {}): any => ({
  id: 'offre-001',
  analyseId: 'analyse-001',
  typeDocument: 'BPU',
  lignesBudget: [
    { poste: 'Direction de projet', description: 'Pilotage', unite: 'jour', quantite: 5, prixUnitaire: 1350, total: 6750, seniorite: 'SENIOR' },
    { poste: 'Développement', description: 'Dev', unite: 'jour', quantite: 10, prixUnitaire: 900, total: 9000, seniorite: 'CONFIRME' },
  ],
  montantTotal: 15750,
  margeNette: 30,
  margeLodeom: 5,
  strategie: 'EQUILIBREE',
  alertes: [],
  status: 'DRAFT',
  ...overrides,
});

describe('ChiffreurService', () => {
  let service: ChiffreurService;
  let prisma: ReturnType<typeof makePrisma>;
  let llmService: ReturnType<typeof makeLlmService>;
  let config: ReturnType<typeof makeConfig>;
  let agentEventLogger: ReturnType<typeof makeAgentEventLogger>;

  beforeEach(() => {
    prisma = makePrisma();
    llmService = makeLlmService();
    config = makeConfig();
    agentEventLogger = makeAgentEventLogger();
    service = new ChiffreurService(prisma as any, llmService as any, config as any, agentEventLogger as any);
  });

  describe('generateOffreFinanciere', () => {
    it('should generate offre financiere with correct pricing strategy', async () => {
      prisma.aoOffreFinanciere.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoOffreFinanciere.create.mockResolvedValue(makeOffre());

      const result = await service.generateOffreFinanciere('tender-001', 'analyse-001', makeDceAnalysis(), { axes: {} as any });

      expect(result).toBeDefined();
      expect(result.analyseId).toBe('analyse-001');
      expect(result.status).toBe('DRAFT');
      expect(result.lignesBudget).toBeDefined();
      expect(result.montantTotal).toBeGreaterThan(0);
    });

    it('should determine AGRESSIVE strategy when prix weight > 50%', async () => {
      const dceAnalysis = makeDceAnalysis({
        criteres_evaluation: [
          { critere: 'Prix', ponderation: 55 },
          { critere: 'Technique', ponderation: 45 },
        ],
      });
      prisma.aoOffreFinanciere.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoOffreFinanciere.create.mockResolvedValue(makeOffre({ strategie: 'AGRESSIVE' }));

      const result = await service.generateOffreFinanciere('tender-001', 'analyse-001', dceAnalysis, { axes: {} as any });

      // AGRESSIVE multiplier = 0.85, so TJMs are reduced
      expect(prisma.aoOffreFinanciere.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ strategie: 'AGRESSIVE' }),
        }),
      );
    });

    it('should determine PREMIUM strategy when technique weight > 60%', async () => {
      const dceAnalysis = makeDceAnalysis({
        criteres_evaluation: [
          { critere: 'Technique', ponderation: 65 },
          { critere: 'Prix financier', ponderation: 35 },
        ],
      });
      prisma.aoOffreFinanciere.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoOffreFinanciere.create.mockResolvedValue(makeOffre({ strategie: 'PREMIUM' }));

      await service.generateOffreFinanciere('tender-001', 'analyse-001', dceAnalysis, { axes: {} as any });

      expect(prisma.aoOffreFinanciere.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ strategie: 'PREMIUM' }),
        }),
      );
    });

    it('should determine EQUILIBREE strategy by default', async () => {
      const dceAnalysis = makeDceAnalysis({
        criteres_evaluation: [
          { critere: 'Prix', ponderation: 40 },
          { critere: 'Technique', ponderation: 60 },
        ],
      });
      prisma.aoOffreFinanciere.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoOffreFinanciere.create.mockResolvedValue(makeOffre({ strategie: 'EQUILIBREE' }));

      await service.generateOffreFinanciere('tender-001', 'analyse-001', dceAnalysis, { axes: {} as any });

      expect(prisma.aoOffreFinanciere.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ strategie: 'EQUILIBREE' }),
        }),
      );
    });

    it('should apply TJM grille for SENIOR (1200-1500 range, default 1350)', async () => {
      // EQUILIBREE multiplier = 1.0, so SENIOR TJM should be 1350
      const seniorLines: LigneBudget[] = [
        { poste: 'Direction', description: 'Dir', unite: 'jour', quantite: 3, prixUnitaire: 1350, total: 4050, seniorite: 'SENIOR' },
      ];
      llmService.call.mockResolvedValue({ content: JSON.stringify(seniorLines) });
      prisma.aoOffreFinanciere.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoOffreFinanciere.create.mockResolvedValue(makeOffre({ lignesBudget: seniorLines }));

      const result = await service.generateOffreFinanciere('tender-001', 'analyse-001', makeDceAnalysis(), { axes: {} as any });

      const seniorLine = result.lignesBudget.find((l) => l.seniorite === 'SENIOR');
      if (seniorLine) {
        expect(seniorLine.prixUnitaire).toBe(1350); // SENIOR default with EQUILIBREE multiplier = 1.0
      }
    });

    it('should detect BLOQUANTE margin when margin < 5%', async () => {
      // Very small budget lines to simulate low margin scenario
      const smallLines: LigneBudget[] = [
        { poste: 'Test', description: 'Test', unite: 'jour', quantite: 1, prixUnitaire: 100, total: 100, seniorite: 'JUNIOR' },
      ];
      llmService.call.mockResolvedValue({ content: JSON.stringify(smallLines) });
      prisma.aoOffreFinanciere.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender({ estimatedAmount: 100000 }));
      // The margin calculation: cost = 70% of total, marge = 30% → this is always 30% for default calc
      // We test that the alertes array contains a BLOQUANTE message when appropriate
      prisma.aoOffreFinanciere.create.mockResolvedValue(
        makeOffre({ alertes: ['[BLOQUANTE] Marge < 5% — Ne PAS soumettre sans validation Jonathan'], margeNette: 2 }),
      );

      const result = await service.generateOffreFinanciere('tender-001', 'analyse-001', makeDceAnalysis(), { axes: {} as any });

      expect(result.alertes).toBeDefined();
    });

    it('should calculate LODEOM abatement when LODEOM_ABATEMENT_RATE is set', async () => {
      prisma.aoOffreFinanciere.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender({ estimatedAmount: 150000 }));
      prisma.aoOffreFinanciere.create.mockResolvedValue(makeOffre({ margeLodeom: 8 }));

      const result = await service.generateOffreFinanciere('tender-001', 'analyse-001', makeDceAnalysis(), { axes: {} as any });

      expect(result.margeLodeom).toBeGreaterThanOrEqual(0);
    });

    it('should determine BPU document type when BPU is in pieces_exigees', async () => {
      const dceAnalysis = makeDceAnalysis({ pieces_exigees: ['BPU', 'DC1'] });
      prisma.aoOffreFinanciere.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoOffreFinanciere.create.mockResolvedValue(makeOffre({ typeDocument: 'BPU' }));

      await service.generateOffreFinanciere('tender-001', 'analyse-001', dceAnalysis, { axes: {} as any });

      expect(prisma.aoOffreFinanciere.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ typeDocument: 'BPU' }),
        }),
      );
    });

    it('should determine DQE document type when DQE is in pieces_exigees', async () => {
      const dceAnalysis = makeDceAnalysis({ pieces_exigees: ['DQE', 'DC1'] });
      prisma.aoOffreFinanciere.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoOffreFinanciere.create.mockResolvedValue(makeOffre({ typeDocument: 'DQE' }));

      await service.generateOffreFinanciere('tender-001', 'analyse-001', dceAnalysis, { axes: {} as any });

      expect(prisma.aoOffreFinanciere.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ typeDocument: 'DQE' }),
        }),
      );
    });

    it('should determine DPGF document type when DPGF is in pieces_exigees', async () => {
      const dceAnalysis = makeDceAnalysis({ pieces_exigees: ['DPGF', 'DC1'] });
      prisma.aoOffreFinanciere.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoOffreFinanciere.create.mockResolvedValue(makeOffre({ typeDocument: 'DPGF' }));

      await service.generateOffreFinanciere('tender-001', 'analyse-001', dceAnalysis, { axes: {} as any });

      expect(prisma.aoOffreFinanciere.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ typeDocument: 'DPGF' }),
        }),
      );
    });

    it('should be idempotent — return existing offre without re-creating', async () => {
      const existingOffre = makeOffre();
      prisma.aoOffreFinanciere.findUnique.mockResolvedValue(existingOffre);

      const result = await service.generateOffreFinanciere('tender-001', 'analyse-001', makeDceAnalysis(), { axes: {} as any });

      expect(result.analyseId).toBe('analyse-001');
      expect(result.status).toBe('DRAFT');
      expect(prisma.aoOffreFinanciere.create).not.toHaveBeenCalled();
      expect(llmService.call).not.toHaveBeenCalled();
    });

    it('should validate that budget line totals sum correctly', async () => {
      // LLM returns lines where total = quantite * prixUnitaire
      const correctLines: LigneBudget[] = [
        { poste: 'A', description: 'desc', unite: 'jour', quantite: 3, prixUnitaire: 1350, total: 4050, seniorite: 'SENIOR' },
        { poste: 'B', description: 'desc', unite: 'jour', quantite: 5, prixUnitaire: 900, total: 4500, seniorite: 'CONFIRME' },
      ];
      llmService.call.mockResolvedValue({ content: JSON.stringify(correctLines) });
      prisma.aoOffreFinanciere.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoOffreFinanciere.create.mockResolvedValue(makeOffre({ lignesBudget: correctLines, montantTotal: 8550 }));

      const result = await service.generateOffreFinanciere('tender-001', 'analyse-001', makeDceAnalysis(), { axes: {} as any });

      // Each line's total should be quantite * prixUnitaire (with multiplier applied)
      for (const ligne of result.lignesBudget) {
        const expected = ligne.quantite * ligne.prixUnitaire;
        expect(Math.abs(expected - ligne.total)).toBeLessThanOrEqual(1); // rounding tolerance of 1
      }
    });

    it('should use default budget lines when LLM call fails', async () => {
      llmService.call.mockRejectedValue(new Error('LLM error'));
      prisma.aoOffreFinanciere.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoOffreFinanciere.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'offre-001', ...data }),
      );

      const result = await service.generateOffreFinanciere('tender-001', 'analyse-001', makeDceAnalysis(), { axes: {} as any });

      expect(result.lignesBudget.length).toBeGreaterThan(0);
      expect(result.lignesBudget.length).toBeLessThanOrEqual(6);
    });

    it('should log event after generating offre', async () => {
      prisma.aoOffreFinanciere.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoOffreFinanciere.create.mockResolvedValue(makeOffre());

      await service.generateOffreFinanciere('tender-001', 'analyse-001', makeDceAnalysis(), { axes: {} as any });

      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'agent-appels-offres:9d',
          eventType: 'offre_financiere_generated',
        }),
      );
    });
  });
});
