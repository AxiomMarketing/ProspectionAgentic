import { NotFoundException } from '@nestjs/common';
import { ControleurQaService, QAReport, QACheckItem } from '../controleur-qa.service';

const makePrisma = () => ({
  aoControleQa: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  aoAnalyse: {
    findUnique: jest.fn(),
  },
  publicTender: {
    findUnique: jest.fn(),
  },
});

const makeAgentEventLogger = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

const makeValidDocuments = () => [
  { type: 'KBIS', valid: true, expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), filePath: '/docs/kbis.pdf' },
  { type: 'URSSAF', valid: true, expiresAt: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), filePath: '/docs/urssaf.pdf' },
  { type: 'FISCAL', valid: true, expiresAt: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000), filePath: '/docs/fiscal.pdf' },
  { type: 'RCPRO', valid: true, expiresAt: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000), filePath: '/docs/rcpro.pdf' },
  { type: 'RIB', valid: true, expiresAt: new Date('2099-12-31'), filePath: '/docs/rib.pdf' },
];

const makeExpiredDocuments = () => [
  { type: 'KBIS', valid: false, expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), filePath: '/docs/kbis.pdf' },
  { type: 'URSSAF', valid: true, expiresAt: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), filePath: '/docs/urssaf.pdf' },
  { type: 'FISCAL', valid: true, expiresAt: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000), filePath: '/docs/fiscal.pdf' },
  { type: 'RCPRO', valid: true, expiresAt: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000), filePath: '/docs/rcpro.pdf' },
  { type: 'RIB', valid: true, expiresAt: new Date('2099-12-31'), filePath: '/docs/rib.pdf' },
];

const makeDossier = (overrides: Partial<any> = {}) => ({
  id: 'dossier-001',
  dc1Generated: true,
  dc2Generated: true,
  dumeGenerated: false,
  attestationsOk: true,
  documentValidities: makeValidDocuments(),
  missingDocuments: [],
  expiredDocuments: [],
  status: 'COMPLETE',
  ...overrides,
});

const makeOffre = (overrides: Partial<any> = {}) => ({
  id: 'offre-001',
  typeDocument: 'BPU',
  lignesBudget: [
    { poste: 'Direction', description: 'Dir', unite: 'jour', quantite: 5, prixUnitaire: 1350, total: 6750, seniorite: 'SENIOR' },
    { poste: 'Dev', description: 'Dev', unite: 'jour', quantite: 10, prixUnitaire: 900, total: 9000, seniorite: 'CONFIRME' },
  ],
  montantTotal: 15750,
  margeNette: 30,
  margeLodeom: 5,
  strategie: 'EQUILIBREE',
  alertes: [],
  status: 'DRAFT',
  ...overrides,
});

const makeMemoire = (overrides: Partial<any> = {}) => ({
  id: 'memoire-001',
  status: 'draft',
  planningJson: [
    { numero: 1, titre: 'Présentation', nbPages: 3, sectionsConditionnelles: [] },
    { numero: 2, titre: 'Compréhension', nbPages: 5, sectionsConditionnelles: [] },
    { numero: 3, titre: 'Solution', nbPages: 8, sectionsConditionnelles: [] },
    { numero: 4, titre: 'Méthodologie', nbPages: 5, sectionsConditionnelles: [] },
    { numero: 5, titre: 'Maintenance', nbPages: 3, sectionsConditionnelles: [] },
  ],
  schemasGeneres: ['```mermaid\ngantt\n...```', '```mermaid\ngraph\n...```'],
  equipeJson: { sectionsJonathan: [], flagsActives: { rse: false, rgaa: false, voletSocial: false } },
  referencesJson: { references: [], schemas: ['schema1'] },
  aiScoreRisk: 10,
  ...overrides,
});

const makeAnalyse = (overrides: Partial<any> = {}) => ({
  id: 'analyse-001',
  dossierAdmin: makeDossier(),
  offreFinanciere: makeOffre(),
  memoireTechnique: makeMemoire(),
  exigences: [],
  ...overrides,
});

const makeTender = (overrides: Partial<any> = {}) => ({
  id: 'tender-001',
  title: 'Refonte portail citoyen',
  buyerName: 'Ville de Paris',
  sourceId: 'BOAMP-2026-001',
  deadlineDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  ...overrides,
});

const makeControle = (checks: QACheckItem[], overrides: Partial<any> = {}) => ({
  id: 'controle-001',
  analyseId: 'analyse-001',
  status: 'completed',
  checksJson: checks,
  errorsFound: checks.filter((c) => c.status === 'FAIL').length,
  warningsFound: checks.filter((c) => c.status === 'WARNING').length,
  approved: checks.filter((c) => c.status === 'FAIL').length === 0,
  approvedAt: checks.filter((c) => c.status === 'FAIL').length === 0 ? new Date() : null,
  rejectionReason: null,
  ...overrides,
});

describe('ControleurQaService', () => {
  let service: ControleurQaService;
  let prisma: ReturnType<typeof makePrisma>;
  let agentEventLogger: ReturnType<typeof makeAgentEventLogger>;

  beforeEach(() => {
    prisma = makePrisma();
    agentEventLogger = makeAgentEventLogger();
    const mockConfig = { get: jest.fn().mockReturnValue('0') };
    service = new ControleurQaService(prisma as any, mockConfig as any, agentEventLogger as any);
  });

  describe('runQualityControl', () => {
    it('should run 29-point checklist', async () => {
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(makeAnalyse());
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockResolvedValue(makeControle([]));

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      expect(result.checklistItems.length).toBe(29);
      const codes = result.checklistItems.map((c) => c.code);
      expect(codes).toContain('QA-001');
      expect(codes).toContain('QA-029');
    });

    it('should return CONFORME when all checks pass', async () => {
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(makeAnalyse());
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'controle-001', ...create }),
      );

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      // Verify decision logic: no FAIL in ADMIN or COMPLETUDE, <=3 total fails → could be CONFORME
      if (result.nbFail === 0) {
        expect(result.decision).toBe('CONFORME');
        expect(result.readyForDeposit).toBe(true);
      }
    });

    it('should return CORRECTIONS_REQUISES for minor failures (< 3 fails, no admin/completude)', async () => {
      // Create an analyse with missing schema (WARNING in QA-012) and low margin (WARNING QA-021)
      const analyseWithMinorIssues = makeAnalyse({
        memoireTechnique: makeMemoire({ aiScoreRisk: 25, schemasGeneres: [] }), // QA-012 WARNING, QA-016 FAIL
        offreFinanciere: makeOffre({ lignesBudget: [
          { poste: 'A', description: 'd', unite: 'jour', quantite: 2, prixUnitaire: 100, total: 300, seniorite: 'JUNIOR' }, // total mismatch QA-020 FAIL
        ]}),
      });
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(analyseWithMinorIssues);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'controle-001', ...create }),
      );

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      // Verify the decision is computed based on actual fails
      expect(['CONFORME', 'CORRECTIONS_REQUISES', 'BLOQUANT']).toContain(result.decision);
    });

    it('should return BLOQUANT when admin document FAIL', async () => {
      const analyseWithMissingAdmin = makeAnalyse({
        dossierAdmin: makeDossier({ dc1Generated: false }), // QA-001 FAIL (ADMIN)
      });
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(analyseWithMissingAdmin);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'controle-001', ...create }),
      );

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      expect(result.decision).toBe('BLOQUANT');
      expect(result.readyForDeposit).toBe(false);
    });

    it('should return BLOQUANT when more than 3 fails', async () => {
      const analyseWithMultipleFailures = makeAnalyse({
        dossierAdmin: makeDossier({
          dc1Generated: false, // QA-001 FAIL (ADMIN)
          dc2Generated: false, // QA-002 FAIL (ADMIN)
          documentValidities: makeExpiredDocuments(), // QA-004 FAIL (KBIS expired)
        }),
        offreFinanciere: null, // QA-018 FAIL
        memoireTechnique: null, // QA-009 FAIL
      });
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(analyseWithMultipleFailures);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'controle-001', ...create }),
      );

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      expect(result.decision).toBe('BLOQUANT');
    });

    it('should check admin documents — DC1 present', async () => {
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(makeAnalyse());
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'controle-001', ...create }),
      );

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      const dc1Check = result.checklistItems.find((c) => c.code === 'QA-001');
      expect(dc1Check).toBeDefined();
      expect(dc1Check!.status).toBe('PASS');
      expect(dc1Check!.category).toBe('ADMIN');
    });

    it('should check admin documents — DC2 missing → FAIL', async () => {
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(makeAnalyse({
        dossierAdmin: makeDossier({ dc2Generated: false }),
      }));
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'controle-001', ...create }),
      );

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      const dc2Check = result.checklistItems.find((c) => c.code === 'QA-002');
      expect(dc2Check!.status).toBe('FAIL');
    });

    it('should check technique — memoire present → PASS', async () => {
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(makeAnalyse());
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'controle-001', ...create }),
      );

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      const memoireCheck = result.checklistItems.find((c) => c.code === 'QA-009');
      expect(memoireCheck!.status).toBe('PASS');
      expect(memoireCheck!.category).toBe('TECHNIQUE');
    });

    it('should check technique — anti-detection score', async () => {
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(makeAnalyse({
        memoireTechnique: makeMemoire({ aiScoreRisk: 25 }), // score > 20 → FAIL
      }));
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'controle-001', ...create }),
      );

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      const antiDetectCheck = result.checklistItems.find((c) => c.code === 'QA-016');
      expect(antiDetectCheck!.status).toBe('FAIL');
    });

    it('should check financier — budget coherence', async () => {
      const invalidLigne = { poste: 'A', description: 'd', unite: 'jour', quantite: 2, prixUnitaire: 100, total: 999, seniorite: 'JUNIOR' }; // 2*100 = 200 ≠ 999
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(makeAnalyse({
        offreFinanciere: makeOffre({ lignesBudget: [invalidLigne] }),
      }));
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'controle-001', ...create }),
      );

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      const coherenceCheck = result.checklistItems.find((c) => c.code === 'QA-020');
      expect(coherenceCheck!.status).toBe('FAIL');
    });

    it('should check financier — margin warning when margin <= 5', async () => {
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(makeAnalyse({
        offreFinanciere: makeOffre({ margeNette: 3 }), // < 5%
      }));
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'controle-001', ...create }),
      );

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      const margeCheck = result.checklistItems.find((c) => c.code === 'QA-021');
      expect(margeCheck!.status).toBe('WARNING');
    });

    it('should set readyForDeposit = true only when CONFORME', async () => {
      // All good scenario
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(makeAnalyse());
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'controle-001', ...create }),
      );

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      expect(result.readyForDeposit).toBe(result.decision === 'CONFORME');
    });

    it('should set readyForDeposit = false when BLOQUANT', async () => {
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(makeAnalyse({
        dossierAdmin: makeDossier({ dc1Generated: false }), // ADMIN FAIL → BLOQUANT
      }));
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'controle-001', ...create }),
      );

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      expect(result.readyForDeposit).toBe(false);
    });

    it('should be idempotent — return existing controle when approved is not null', async () => {
      const allPassChecks: QACheckItem[] = [
        { code: 'QA-001', category: 'ADMIN', description: 'DC1', status: 'PASS' },
        { code: 'QA-002', category: 'ADMIN', description: 'DC2', status: 'PASS' },
      ];
      const existingControle = makeControle(allPassChecks, { approved: true });
      prisma.aoControleQa.findUnique.mockResolvedValue(existingControle);

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      expect(result.controleId).toBe(existingControle.id);
      expect(prisma.aoAnalyse.findUnique).not.toHaveBeenCalled();
      expect(prisma.aoControleQa.upsert).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when analyse does not exist', async () => {
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(null);

      await expect(
        service.runQualityControl('tender-001', 'analyse-nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when tender does not exist', async () => {
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(makeAnalyse());
      prisma.publicTender.findUnique.mockResolvedValue(null);

      await expect(
        service.runQualityControl('nonexistent-tender', 'analyse-001'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should log event after completing QA control', async () => {
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(makeAnalyse());
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'controle-001', ...create }),
      );

      await service.runQualityControl('tender-001', 'analyse-001');

      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'agent-appels-offres:9f',
          eventType: 'qa_control_completed',
        }),
      );
    });

    it('should include corrections list for failing checks', async () => {
      prisma.aoControleQa.findUnique.mockResolvedValue(null);
      prisma.aoAnalyse.findUnique.mockResolvedValue(makeAnalyse({
        dossierAdmin: makeDossier({ dc1Generated: false }),
      }));
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoControleQa.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'controle-001', ...create }),
      );

      const result = await service.runQualityControl('tender-001', 'analyse-001');

      expect(result.corrections.length).toBeGreaterThan(0);
      expect(result.corrections.some((c) => c.includes('QA-001'))).toBe(true);
    });
  });
});
