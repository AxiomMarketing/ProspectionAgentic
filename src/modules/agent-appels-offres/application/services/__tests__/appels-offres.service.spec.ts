import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AppelsOffresService } from '../appels-offres.service';
import { DceAnalyzerService } from '../dce-analyzer.service';
import { QualifierService } from '../qualifier.service';
import { JuristeService } from '../juriste.service';
import { ChiffreurService } from '../chiffreur.service';
import { MemoireRedacteurService } from '../memoire-redacteur.service';
import { ControleurQaService } from '../controleur-qa.service';
import { MoniteurService } from '../moniteur.service';
import { PipelineOrchestratorService } from '../pipeline-orchestrator.service';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';

// ─── Mock factories ────────────────────────────────────────────────────────────

function makeTenderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tender-1',
    title: 'Conception site web mairie',
    buyerName: 'Mairie de Test',
    status: 'DETECTED',
    dceFitScore: null,
    deadlineDate: new Date(Date.now() + 20 * 86_400_000),
    createdAt: new Date(),
    dceAnalyzed: false,
    ...overrides,
  };
}

function makeAoAnalyseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'analyse-1',
    tenderId: 'tender-1',
    status: 'analyzing_dce',
    currentStep: 'ao:analyze-dce',
    decision: null,
    decisionReason: null,
    scorePertinence: null,
    scoreCompetence: null,
    scoreBudget: null,
    scoreConcurrence: null,
    scoreDelai: null,
    scoreReferences: null,
    scoreCapacite: null,
    scoreTotal: null,
    conditionsPartic: [],
    criteresEval: [],
    piecesExigees: [],
    exigencesTech: [],
    flagsConditionnels: { rse: false, rgaa: false, volet_social: false },
    motsClesMiroir: [],
    strategiePrix: '',
    jonathanDecision: null,
    jonathanReviewAt: null,
    ...overrides,
  };
}

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  publicTender: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  aoAnalyse: {
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

const mockAgentEventLogger = { log: jest.fn() };

const mockDceAnalyzer = {
  analyzeDce: jest.fn(),
};

const mockQualifier = {
  qualifyTender: jest.fn(),
};

const mockJuriste = {
  prepareDossierAdmin: jest.fn(),
  checkDocumentValidity: jest.fn(),
};

const mockChiffreur = {
  generateOffreFinanciere: jest.fn(),
};

const mockMemoireRedacteur = {
  generateMemoireTechnique: jest.fn(),
};

const mockControleurQa = {
  runQualityControl: jest.fn(),
};

const mockMoniteur = {
  checkTenderStatus: jest.fn(),
  processResult: jest.fn(),
};

const mockPipelineOrchestrator = {
  orchestratePipeline: jest.fn(),
  updateStepStatus: jest.fn(),
};

// ─── Test suite ────────────────────────────────────────────────────────────────

describe('AppelsOffresService', () => {
  let service: AppelsOffresService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppelsOffresService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AgentEventLoggerService, useValue: mockAgentEventLogger },
        { provide: DceAnalyzerService, useValue: mockDceAnalyzer },
        { provide: QualifierService, useValue: mockQualifier },
        { provide: JuristeService, useValue: mockJuriste },
        { provide: ChiffreurService, useValue: mockChiffreur },
        { provide: MemoireRedacteurService, useValue: mockMemoireRedacteur },
        { provide: ControleurQaService, useValue: mockControleurQa },
        { provide: MoniteurService, useValue: mockMoniteur },
        { provide: PipelineOrchestratorService, useValue: mockPipelineOrchestrator },
      ],
    }).compile();

    service = module.get<AppelsOffresService>(AppelsOffresService);
    jest.clearAllMocks();
  });

  // ─── launchPipeline ────────────────────────────────────────────────────────

  describe('launchPipeline', () => {
    it('should launch pipeline successfully and return analyseId', async () => {
      const tender = makeTenderRow();
      const analyse = makeAoAnalyseRow();
      (mockPrisma.publicTender as any).findUnique = jest.fn().mockResolvedValue(tender);
      mockPipelineOrchestrator.orchestratePipeline.mockResolvedValue(undefined);
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(analyse);

      const result = await service.launchPipeline('tender-1');

      expect(result.analyseId).toBe('analyse-1');
      expect(mockPipelineOrchestrator.orchestratePipeline).toHaveBeenCalledWith('tender-1');
      expect(mockAgentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'pipeline_launched' }),
      );
    });

    it('should throw NotFoundException when tender does not exist', async () => {
      (mockPrisma.publicTender as any).findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.launchPipeline('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getPipelineProgress ───────────────────────────────────────────────────

  describe('getPipelineProgress', () => {
    it('should return pipeline progress with correct step statuses for analyzing_dce', async () => {
      const analyse = makeAoAnalyseRow({ status: 'analyzing_dce' });
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(analyse);

      const result = await service.getPipelineProgress('tender-1');

      expect(result.tenderId).toBe('tender-1');
      expect(result.analyseId).toBe('analyse-1');
      expect(result.status).toBe('analyzing_dce');
      expect(result.steps).toHaveLength(7);

      const step9a = result.steps.find((s) => s.code === '9a');
      expect(step9a?.status).toBe('in_progress');
    });

    it('should mark steps before current as done', async () => {
      const analyse = makeAoAnalyseRow({ status: 'parallel_analysis' });
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(analyse);

      const result = await service.getPipelineProgress('tender-1');

      const step9a = result.steps.find((s) => s.code === '9a');
      const step9b = result.steps.find((s) => s.code === '9b');
      expect(step9a?.status).toBe('done');
      expect(step9b?.status).toBe('done');
    });

    it('should mark all steps as pending when status is pending', async () => {
      const analyse = makeAoAnalyseRow({ status: 'pending' });
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(analyse);

      const result = await service.getPipelineProgress('tender-1');

      for (const step of result.steps) {
        expect(step.status).toBe('pending');
      }
    });

    it('should throw NotFoundException when no analysis found', async () => {
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.getPipelineProgress('tender-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── analyzeDce delegation ─────────────────────────────────────────────────

  describe('analyzeDce', () => {
    it('should delegate to DceAnalyzerService', async () => {
      const expected = {
        analyseId: 'analyse-1',
        decision: 'GO' as const,
        analysis: {} as any,
      };
      mockDceAnalyzer.analyzeDce.mockResolvedValue(expected);

      const result = await service.analyzeDce('tender-1');

      expect(mockDceAnalyzer.analyzeDce).toHaveBeenCalledWith('tender-1');
      expect(result).toEqual(expected);
    });
  });

  // ─── qualifyTender delegation ──────────────────────────────────────────────

  describe('qualifyTender', () => {
    it('should delegate to QualifierService after loading aoAnalyse', async () => {
      const analyse = makeAoAnalyseRow();
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(analyse);
      const qualResult = {
        tenderId: 'tender-1',
        analyseId: 'analyse-1',
        axes: {} as any,
        totalScore: 75,
        ev: 3000,
        decision: 'GO' as const,
        decisionReason: 'Score élevé',
        cached: false,
      };
      mockQualifier.qualifyTender.mockResolvedValue(qualResult);

      const result = await service.qualifyTender('tender-1');

      expect(mockQualifier.qualifyTender).toHaveBeenCalledWith(
        'tender-1',
        expect.objectContaining({
          conditions_participation: [],
          criteres_evaluation: [],
        }),
        false,
      );
      expect(result).toEqual(qualResult);
    });

    it('should throw NotFoundException when no DCE analysis exists yet', async () => {
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.qualifyTender('tender-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── prepareDossierAdmin delegation ───────────────────────────────────────

  describe('prepareDossierAdmin', () => {
    it('should delegate to JuristeService', async () => {
      const analyse = makeAoAnalyseRow();
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(analyse);
      const dossierResult = {
        analyseId: 'analyse-1',
        dossierId: 'dossier-1',
        dc1Generated: true,
        dc2Generated: true,
        dumeGenerated: false,
        attestationsOk: true,
        documentValidities: [],
        missingDocuments: [],
        expiredDocuments: [],
        status: 'COMPLETE' as const,
      };
      mockJuriste.prepareDossierAdmin.mockResolvedValue(dossierResult);

      const result = await service.prepareDossierAdmin('tender-1');

      expect(mockJuriste.prepareDossierAdmin).toHaveBeenCalledWith(
        'tender-1',
        'analyse-1',
        expect.any(Object),
      );
      expect(result.status).toBe('COMPLETE');
    });

    it('should throw NotFoundException when no analysis exists', async () => {
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.prepareDossierAdmin('tender-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── generateOffreFinanciere delegation ───────────────────────────────────

  describe('generateOffreFinanciere', () => {
    it('should delegate to ChiffreurService with axes from analyse', async () => {
      const analyse = makeAoAnalyseRow({
        scorePertinence: 80,
        scoreCompetence: 75,
        scoreBudget: 80,
        scoreConcurrence: 70,
        scoreDelai: 85,
        scoreReferences: 75,
        scoreCapacite: 65,
      });
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(analyse);
      const offreResult = {
        analyseId: 'analyse-1',
        typeDocument: 'BPU' as const,
        lignesBudget: [],
        montantTotal: 85_000,
        margeNette: 22,
        margeLodeom: 0,
        strategie: 'EQUILIBREE' as const,
        alertes: [],
      };
      mockChiffreur.generateOffreFinanciere.mockResolvedValue(offreResult);

      const result = await service.generateOffreFinanciere('tender-1');

      expect(mockChiffreur.generateOffreFinanciere).toHaveBeenCalledWith(
        'tender-1',
        'analyse-1',
        expect.any(Object),
        expect.objectContaining({
          axes: expect.objectContaining({
            pertinence: 80,
            competences: 75,
          }),
        }),
      );
      expect(result.montantTotal).toBe(85_000);
    });
  });

  // ─── generateMemoireTechnique delegation ──────────────────────────────────

  describe('generateMemoireTechnique', () => {
    it('should delegate to MemoireRedacteurService', async () => {
      const analyse = makeAoAnalyseRow();
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(analyse);
      const memoireResult = {
        analyseId: 'analyse-1',
        chapitres: [],
        referencesUsees: [],
        schemasGeneres: [],
        flagsActives: { rse: false, rgaa: true, voletSocial: false },
        ratioIaHumain: 0.6,
        scoreAntiDetect: 85,
        nbPagesTotal: 12,
        status: 'DRAFT' as const,
        sectionsJonathanRequired: [],
      };
      mockMemoireRedacteur.generateMemoireTechnique.mockResolvedValue(memoireResult);

      const result = await service.generateMemoireTechnique('tender-1');

      expect(mockMemoireRedacteur.generateMemoireTechnique).toHaveBeenCalledWith(
        'tender-1',
        'analyse-1',
        expect.any(Object),
      );
      expect(result.status).toBe('DRAFT');
    });
  });

  // ─── runQualityControl delegation ─────────────────────────────────────────

  describe('runQualityControl', () => {
    it('should delegate to ControleurQaService', async () => {
      const analyse = makeAoAnalyseRow();
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(analyse);
      const qaReport = {
        analyseId: 'analyse-1',
        controleId: 'controle-1',
        checklistItems: [],
        nbPass: 10,
        nbFail: 0,
        nbWarning: 2,
        decision: 'CONFORME' as const,
        corrections: [],
        readyForDeposit: true,
      };
      mockControleurQa.runQualityControl.mockResolvedValue(qaReport);

      const result = await service.runQualityControl('tender-1');

      expect(mockControleurQa.runQualityControl).toHaveBeenCalledWith('tender-1', 'analyse-1');
      expect(result.readyForDeposit).toBe(true);
    });
  });

  // ─── jonathanDecision ──────────────────────────────────────────────────────

  describe('jonathanDecision', () => {
    it('should update analyse with CONFIRME_GO and trigger parallel analysis step', async () => {
      const analyse = makeAoAnalyseRow({ decision: 'GO' });
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(analyse);
      (mockPrisma.aoAnalyse as any).update = jest.fn().mockResolvedValue({});
      mockPipelineOrchestrator.updateStepStatus.mockResolvedValue(undefined);

      await service.jonathanDecision('tender-1', 'CONFIRME_GO');

      expect((mockPrisma.aoAnalyse as any).update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'analyse-1' },
          data: expect.objectContaining({ jonathanDecision: 'CONFIRME_GO', decision: 'GO' }),
        }),
      );
      expect(mockPipelineOrchestrator.updateStepStatus).toHaveBeenCalledWith(
        'analyse-1',
        'parallel_analysis',
        'parallel_analysis',
      );
    });

    it('should update analyse with FORCE_GO and continue pipeline', async () => {
      const analyse = makeAoAnalyseRow({ decision: 'POSSIBLE' });
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(analyse);
      (mockPrisma.aoAnalyse as any).update = jest.fn().mockResolvedValue({});
      mockPipelineOrchestrator.updateStepStatus.mockResolvedValue(undefined);

      await service.jonathanDecision('tender-1', 'FORCE_GO', 'Priorité stratégique');

      expect((mockPrisma.aoAnalyse as any).update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ jonathanDecision: 'FORCE_GO', decision: 'GO' }),
        }),
      );
    });

    it('should update analyse with NO_GO and mark pipeline as ignored', async () => {
      const analyse = makeAoAnalyseRow({ decision: 'POSSIBLE' });
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(analyse);
      (mockPrisma.aoAnalyse as any).update = jest.fn().mockResolvedValue({});
      mockPipelineOrchestrator.updateStepStatus.mockResolvedValue(undefined);

      await service.jonathanDecision('tender-1', 'NO_GO', 'Hors périmètre');

      expect((mockPrisma.aoAnalyse as any).update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ jonathanDecision: 'NO_GO', decision: 'NO_GO' }),
        }),
      );
      expect(mockPipelineOrchestrator.updateStepStatus).toHaveBeenCalledWith(
        'analyse-1',
        'ignored',
        'ignored',
      );
    });

    it('should log jonathan_decision event', async () => {
      const analyse = makeAoAnalyseRow();
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(analyse);
      (mockPrisma.aoAnalyse as any).update = jest.fn().mockResolvedValue({});
      mockPipelineOrchestrator.updateStepStatus.mockResolvedValue(undefined);

      await service.jonathanDecision('tender-1', 'CONFIRME_GO');

      expect(mockAgentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'jonathan_decision' }),
      );
    });

    it('should throw NotFoundException when tender analyse does not exist', async () => {
      (mockPrisma.aoAnalyse as any).findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.jonathanDecision('nonexistent', 'CONFIRME_GO')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── healthCheck ───────────────────────────────────────────────────────────

  describe('healthCheck', () => {
    it('should return health check with active pipeline count and pending tenders', async () => {
      (mockPrisma.aoAnalyse as any).count = jest.fn().mockResolvedValue(3);
      (mockPrisma.publicTender as any).count = jest.fn().mockResolvedValue(12);
      mockJuriste.checkDocumentValidity.mockResolvedValue([
        { type: 'kbis', valid: true },
        { type: 'assurance', valid: false },
      ]);

      const result = await service.healthCheck();

      expect(result.status).toBe('ok');
      expect(result.activePipelines).toBe(3);
      expect(result.pendingTenders).toBe(12);
      expect(result.expiredDocuments).toBe(1);
    });

    it('should return expiredDocuments=0 when document validity check throws', async () => {
      (mockPrisma.aoAnalyse as any).count = jest.fn().mockResolvedValue(0);
      (mockPrisma.publicTender as any).count = jest.fn().mockResolvedValue(0);
      mockJuriste.checkDocumentValidity.mockRejectedValue(new Error('DB error'));

      const result = await service.healthCheck();

      expect(result.status).toBe('ok');
      expect(result.expiredDocuments).toBe(0);
    });
  });

  // ─── listTenders ───────────────────────────────────────────────────────────

  describe('listTenders', () => {
    it('should return paginated tender list', async () => {
      const tenders = [makeTenderRow(), makeTenderRow({ id: 'tender-2', title: 'Autre marché' })];
      (mockPrisma.publicTender as any).findMany = jest.fn().mockResolvedValue(tenders);
      (mockPrisma.publicTender as any).count = jest.fn().mockResolvedValue(2);

      const result = await service.listTenders(1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect((mockPrisma.publicTender as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('should apply correct skip for page 2', async () => {
      (mockPrisma.publicTender as any).findMany = jest.fn().mockResolvedValue([]);
      (mockPrisma.publicTender as any).count = jest.fn().mockResolvedValue(0);

      await service.listTenders(2, 10);

      expect((mockPrisma.publicTender as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  // ─── getTender ─────────────────────────────────────────────────────────────

  describe('getTender', () => {
    it('should return tender when found', async () => {
      const tender = makeTenderRow();
      (mockPrisma.publicTender as any).findUnique = jest.fn().mockResolvedValue(tender);

      const result = await service.getTender('tender-1');

      expect(result.id).toBe('tender-1');
    });

    it('should throw NotFoundException for missing tender', async () => {
      (mockPrisma.publicTender as any).findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.getTender('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
