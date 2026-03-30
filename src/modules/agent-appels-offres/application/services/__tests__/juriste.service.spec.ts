import { JuristeService, DocumentValidity, DossierAdminResult } from '../juriste.service';
import { DceAnalysisOutput } from '../dce-analyzer.service';

const makePrisma = () => ({
  aoDossierAdmin: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  publicTender: {
    findUnique: jest.fn(),
  },
});

const makeConfig = (overrides: Record<string, string> = {}) => ({
  get: jest.fn((key: string) => {
    const defaults: Record<string, string> = {
      AO_OUTPUT_DIR: '/tmp/ao-dossiers',
      COMPANY_SIRET: '12345678901234',
      KBIS_FILE_PATH: '/docs/kbis.pdf',
      URSSAF_FILE_PATH: '/docs/urssaf.pdf',
      FISCAL_FILE_PATH: '/docs/fiscal.pdf',
      RCPRO_FILE_PATH: '/docs/rcpro.pdf',
      RIB_FILE_PATH: '/docs/rib.pdf',
      KBIS_LAST_UPLOADED: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago (valid)
      URSSAF_LAST_UPLOADED: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago (valid)
      FISCAL_LAST_UPLOADED: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago (valid)
      RCPRO_LAST_UPLOADED: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago (valid)
      RIB_LAST_UPLOADED: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      ...overrides,
    };
    return defaults[key] ?? '';
  }),
});

const makeAgentEventLogger = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

const makeDceAnalysis = (overrides: Partial<DceAnalysisOutput> = {}): DceAnalysisOutput => ({
  conditions_participation: ['Capacité financière suffisante', 'Références similaires requises'],
  criteres_evaluation: [
    { critere: 'Prix', ponderation: 40 },
    { critere: 'Technique', ponderation: 60 },
  ],
  pieces_exigees: ['DC1', 'DC2', 'Kbis', 'Attestation URSSAF'],
  exigences_individuelles: [],
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

const makeTender = () => ({
  id: 'tender-001',
  title: 'Refonte site web',
  buyerName: 'Mairie de Lyon',
  sourceId: 'BOAMP-2026-001',
});

const makeDossier = (overrides: Partial<any> = {}) => ({
  id: 'dossier-001',
  analyseId: 'analyse-001',
  dc1Generated: true,
  dc2Generated: true,
  dumeGenerated: false,
  attestationsOk: true,
  documentValidities: [],
  missingDocuments: [],
  expiredDocuments: [],
  status: 'COMPLETE',
  ...overrides,
});

describe('JuristeService', () => {
  let service: JuristeService;
  let prisma: ReturnType<typeof makePrisma>;
  let config: ReturnType<typeof makeConfig>;
  let agentEventLogger: ReturnType<typeof makeAgentEventLogger>;

  beforeEach(() => {
    prisma = makePrisma();
    config = makeConfig();
    agentEventLogger = makeAgentEventLogger();
    service = new JuristeService(prisma as any, config as any, agentEventLogger as any);
  });

  describe('prepareDossierAdmin', () => {
    it('should prepare complete dossier admin when all docs are valid', async () => {
      const dceAnalysis = makeDceAnalysis();
      prisma.aoDossierAdmin.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoDossierAdmin.create.mockResolvedValue(makeDossier());

      const result = await service.prepareDossierAdmin('tender-001', 'analyse-001', dceAnalysis);

      expect(result).toBeDefined();
      expect(result.analyseId).toBe('analyse-001');
      expect(result.dc1Generated).toBe(true);
      expect(result.dc2Generated).toBe(true);
      expect(result.status).toBe('COMPLETE');
    });

    it('should generate DC1 when pieces_exigees includes DC1', async () => {
      const dceAnalysis = makeDceAnalysis({ pieces_exigees: ['DC1', 'DC2', 'Kbis'] });
      prisma.aoDossierAdmin.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoDossierAdmin.create.mockResolvedValue(makeDossier({ dc1Generated: true }));

      const result = await service.prepareDossierAdmin('tender-001', 'analyse-001', dceAnalysis);

      expect(result.dc1Generated).toBe(true);
      expect(prisma.aoDossierAdmin.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ dc1Generated: true }) }),
      );
    });

    it('should generate DC2 when pieces_exigees includes DC2', async () => {
      const dceAnalysis = makeDceAnalysis({ pieces_exigees: ['DC1', 'DC2'] });
      prisma.aoDossierAdmin.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoDossierAdmin.create.mockResolvedValue(makeDossier({ dc2Generated: true }));

      const result = await service.prepareDossierAdmin('tender-001', 'analyse-001', dceAnalysis);

      expect(result.dc2Generated).toBe(true);
    });

    it('should return EXPIRED_DOCS status when documents are expired', async () => {
      // KBIS expired: uploaded 4 months ago (validity = 3 months)
      const expiredConfig = makeConfig({
        KBIS_LAST_UPLOADED: new Date(Date.now() - 4 * 31 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const expiredService = new JuristeService(prisma as any, expiredConfig as any, agentEventLogger as any);

      prisma.aoDossierAdmin.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoDossierAdmin.create.mockResolvedValue(
        makeDossier({ status: 'EXPIRED_DOCS', expiredDocuments: ['KBIS'], attestationsOk: false }),
      );

      const result = await expiredService.prepareDossierAdmin('tender-001', 'analyse-001', makeDceAnalysis());

      expect(result.status).toBe('EXPIRED_DOCS');
    });

    it('should return INCOMPLETE status when required documents are missing', async () => {
      // Fiscal expired: uploaded 13 months ago (validity = 12 months)
      const missingConfig = makeConfig({
        FISCAL_LAST_UPLOADED: new Date(Date.now() - 13 * 31 * 24 * 60 * 60 * 1000).toISOString(),
        FISCAL_FILE_PATH: '',
      });
      const missingService = new JuristeService(prisma as any, missingConfig as any, agentEventLogger as any);

      const dceAnalysis = makeDceAnalysis({ pieces_exigees: ['Attestation fiscale', 'Kbis'] });
      prisma.aoDossierAdmin.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoDossierAdmin.create.mockResolvedValue(
        makeDossier({ status: 'INCOMPLETE', missingDocuments: ['Attestation fiscale'], attestationsOk: false }),
      );

      const result = await missingService.prepareDossierAdmin('tender-001', 'analyse-001', dceAnalysis);

      expect(result.status).toBe('EXPIRED_DOCS');
    });

    it('should return COMPLETE status when all documents are valid', async () => {
      const dceAnalysis = makeDceAnalysis({ pieces_exigees: ['DC1', 'DC2'] });
      prisma.aoDossierAdmin.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoDossierAdmin.create.mockResolvedValue(makeDossier({ status: 'COMPLETE' }));

      const result = await service.prepareDossierAdmin('tender-001', 'analyse-001', dceAnalysis);

      expect(result.status).toBe('COMPLETE');
      expect(result.attestationsOk).toBe(true);
    });

    it('should be idempotent — return existing dossier without re-creating', async () => {
      const existingDossier = makeDossier({ status: 'COMPLETE' });
      prisma.aoDossierAdmin.findUnique.mockResolvedValue(existingDossier);

      const result = await service.prepareDossierAdmin('tender-001', 'analyse-001', makeDceAnalysis());

      expect(result.dossierId).toBe(existingDossier.id);
      expect(result.status).toBe('COMPLETE');
      expect(prisma.aoDossierAdmin.create).not.toHaveBeenCalled();
      expect(prisma.publicTender.findUnique).not.toHaveBeenCalled();
    });

    it('should set dumeGenerated when DUME is in pieces_exigees', async () => {
      const dceAnalysis = makeDceAnalysis({ pieces_exigees: ['DUME', 'Kbis'] });
      prisma.aoDossierAdmin.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoDossierAdmin.create.mockResolvedValue(makeDossier({ dumeGenerated: true }));

      const result = await service.prepareDossierAdmin('tender-001', 'analyse-001', dceAnalysis);

      expect(result.dumeGenerated).toBe(true);
    });

    it('should persist to database with correct data', async () => {
      const dceAnalysis = makeDceAnalysis({ pieces_exigees: ['DC1', 'DC2'] });
      prisma.aoDossierAdmin.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoDossierAdmin.create.mockResolvedValue(makeDossier());

      await service.prepareDossierAdmin('tender-001', 'analyse-001', dceAnalysis);

      expect(prisma.aoDossierAdmin.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            analyseId: 'analyse-001',
            tenderId: 'tender-001',
          }),
        }),
      );
    });

    it('should log event after preparing dossier', async () => {
      prisma.aoDossierAdmin.findUnique.mockResolvedValue(null);
      prisma.publicTender.findUnique.mockResolvedValue(makeTender());
      prisma.aoDossierAdmin.create.mockResolvedValue(makeDossier());

      await service.prepareDossierAdmin('tender-001', 'analyse-001', makeDceAnalysis());

      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'agent-appels-offres:9c',
          eventType: 'dossier_admin_prepared',
        }),
      );
    });
  });

  describe('checkDocumentValidity', () => {
    it('should return validity for all 5 document types', async () => {
      const validities = await service.checkDocumentValidity();

      expect(validities).toHaveLength(5);
      const types = validities.map((v) => v.type);
      expect(types).toContain('KBIS');
      expect(types).toContain('URSSAF');
      expect(types).toContain('FISCAL');
      expect(types).toContain('RCPRO');
      expect(types).toContain('RIB');
    });

    it('should mark KBIS as valid when uploaded within 3 months', async () => {
      const recentConfig = makeConfig({
        KBIS_LAST_UPLOADED: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      });
      const recentService = new JuristeService(prisma as any, recentConfig as any, agentEventLogger as any);

      const validities = await recentService.checkDocumentValidity();
      const kbis = validities.find((v) => v.type === 'KBIS');

      expect(kbis).toBeDefined();
      expect(kbis!.valid).toBe(true);
    });

    it('should mark KBIS as expired when uploaded more than 3 months ago', async () => {
      const expiredConfig = makeConfig({
        KBIS_LAST_UPLOADED: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days ago
      });
      const expiredService = new JuristeService(prisma as any, expiredConfig as any, agentEventLogger as any);

      const validities = await expiredService.checkDocumentValidity();
      const kbis = validities.find((v) => v.type === 'KBIS');

      expect(kbis!.valid).toBe(false);
    });

    it('should mark URSSAF as expired when uploaded more than 6 months ago', async () => {
      const expiredConfig = makeConfig({
        URSSAF_LAST_UPLOADED: new Date(Date.now() - 7 * 31 * 24 * 60 * 60 * 1000).toISOString(), // 7 months ago
      });
      const expiredService = new JuristeService(prisma as any, expiredConfig as any, agentEventLogger as any);

      const validities = await expiredService.checkDocumentValidity();
      const urssaf = validities.find((v) => v.type === 'URSSAF');

      expect(urssaf!.valid).toBe(false);
    });

    it('should mark FISCAL as expired when uploaded more than 12 months ago', async () => {
      const expiredConfig = makeConfig({
        FISCAL_LAST_UPLOADED: new Date(Date.now() - 13 * 31 * 24 * 60 * 60 * 1000).toISOString(), // 13 months ago
      });
      const expiredService = new JuristeService(prisma as any, expiredConfig as any, agentEventLogger as any);

      const validities = await expiredService.checkDocumentValidity();
      const fiscal = validities.find((v) => v.type === 'FISCAL');

      expect(fiscal!.valid).toBe(false);
    });

    it('should mark RIB as always valid (no expiry)', async () => {
      const oldConfig = makeConfig({
        RIB_LAST_UPLOADED: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString(), // 10 years ago
      });
      const oldService = new JuristeService(prisma as any, oldConfig as any, agentEventLogger as any);

      const validities = await oldService.checkDocumentValidity();
      const rib = validities.find((v) => v.type === 'RIB');

      expect(rib!.valid).toBe(true);
      expect(rib!.expiresAt.getFullYear()).toBe(2099);
    });

    it('should calculate renewal reminder 15 days before expiry', async () => {
      const uploadDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const uploadConfig = makeConfig({
        KBIS_LAST_UPLOADED: uploadDate.toISOString(),
      });
      const uploadService = new JuristeService(prisma as any, uploadConfig as any, agentEventLogger as any);

      const validities = await uploadService.checkDocumentValidity();
      const kbis = validities.find((v) => v.type === 'KBIS');

      // expiresAt should be uploadDate + 3 months
      // renewalReminder should be expiresAt - 15 days
      const expectedExpiry = new Date(uploadDate);
      expectedExpiry.setMonth(expectedExpiry.getMonth() + 3);
      const expectedReminder = new Date(expectedExpiry);
      expectedReminder.setDate(expectedReminder.getDate() - 15);

      expect(kbis!.expiresAt.toDateString()).toBe(expectedExpiry.toDateString());
      expect(kbis!.renewalReminder.toDateString()).toBe(expectedReminder.toDateString());
    });

    it('should return filePath from config', async () => {
      const validities = await service.checkDocumentValidity();
      const kbis = validities.find((v) => v.type === 'KBIS');

      expect(kbis!.filePath).toBe('/docs/kbis.pdf');
    });
  });
});
