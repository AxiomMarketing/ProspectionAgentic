import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AppelsOffresController } from '../appels-offres.controller';
import { AppelsOffresService } from '../../../application/services/appels-offres.service';

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const INVALID_UUID = 'not-a-uuid';

function makeMockService() {
  return {
    listTenders: jest.fn() as jest.Mock,
    getTender: jest.fn() as jest.Mock,
    getAnalysis: jest.fn() as jest.Mock,
    launchPipeline: jest.fn() as jest.Mock,
    getPipelineProgress: jest.fn() as jest.Mock,
    analyzeDce: jest.fn() as jest.Mock,
    qualifyTender: jest.fn() as jest.Mock,
    prepareDossierAdmin: jest.fn() as jest.Mock,
    generateOffreFinanciere: jest.fn() as jest.Mock,
    generateMemoireTechnique: jest.fn() as jest.Mock,
    runQualityControl: jest.fn() as jest.Mock,
    getMonitorStatus: jest.fn() as jest.Mock,
    processResult: jest.fn() as jest.Mock,
    jonathanDecision: jest.fn() as jest.Mock,
    healthCheck: jest.fn() as jest.Mock,
  };
}

describe('AppelsOffresController', () => {
  let controller: AppelsOffresController;
  let service: ReturnType<typeof makeMockService>;
  let commandBus: { execute: jest.Mock };
  let queryBus: { execute: jest.Mock };

  beforeEach(async () => {
    service = makeMockService();
    commandBus = { execute: jest.fn() };
    queryBus = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppelsOffresController],
      providers: [
        { provide: AppelsOffresService, useValue: service },
        { provide: CommandBus, useValue: commandBus },
        { provide: QueryBus, useValue: queryBus },
      ],
    }).compile();

    controller = module.get<AppelsOffresController>(AppelsOffresController);
  });

  // ─── listTenders ──────────────────────────────────────────────

  describe('listTenders()', () => {
    it('should list tenders with default pagination', async () => {
      const mockResult = { data: [], total: 0 };
      service.listTenders.mockResolvedValue(mockResult);

      // ZodValidationPipe provides defaults, so in direct call we pass the parsed output
      const result = await controller.listTenders({ page: 1, limit: 20 });

      expect(service.listTenders).toHaveBeenCalledWith(1, 20);
      expect(result).toBe(mockResult);
    });

    it('should list tenders with custom pagination', async () => {
      const mockResult = { data: [], total: 0 };
      service.listTenders.mockResolvedValue(mockResult);

      // ZodValidationPipe coerces strings to numbers
      const result = await controller.listTenders({ page: 2, limit: 10 });

      expect(service.listTenders).toHaveBeenCalledWith(2, 10);
      expect(result).toBe(mockResult);
    });
  });

  // ─── getTender ────────────────────────────────────────────────

  describe('getTender()', () => {
    it('should get single tender by UUID', async () => {
      const mockTender = { id: VALID_UUID, title: 'Test tender', status: 'DETECTED' };
      service.getTender.mockResolvedValue(mockTender);

      const result = await controller.getTender(VALID_UUID);

      expect(service.getTender).toHaveBeenCalledWith(VALID_UUID);
      expect(result).toBe(mockTender);
    });
  });

  // ─── launchPipeline ───────────────────────────────────────────

  describe('launchPipeline()', () => {
    it('should launch pipeline and return 202 Accepted payload', async () => {
      const mockResult = { analyseId: 'analyse-001' };
      service.launchPipeline.mockResolvedValue(mockResult);

      const result = await controller.launchPipeline(VALID_UUID);

      expect(service.launchPipeline).toHaveBeenCalledWith(VALID_UUID);
      expect(result).toEqual({ analyseId: 'analyse-001' });
    });
  });

  // ─── getPipelineProgress ──────────────────────────────────────

  describe('getPipelineProgress()', () => {
    it('should get pipeline progress', async () => {
      const mockProgress = {
        tenderId: VALID_UUID,
        analyseId: 'analyse-001',
        status: 'analyzing_dce',
        currentStep: '9a',
        steps: [],
      };
      service.getPipelineProgress.mockResolvedValue(mockProgress);

      const result = await controller.getPipelineProgress(VALID_UUID);

      expect(service.getPipelineProgress).toHaveBeenCalledWith(VALID_UUID);
      expect(result).toBe(mockProgress);
    });
  });

  // ─── analyzeDce ───────────────────────────────────────────────

  describe('analyzeDce()', () => {
    it('should trigger analyzeDce', async () => {
      const mockResult = { analyseId: 'analyse-001', decision: 'GO', analysis: {} as any };
      service.analyzeDce.mockResolvedValue(mockResult);

      const result = await controller.analyzeDce(VALID_UUID);

      expect(service.analyzeDce).toHaveBeenCalledWith(VALID_UUID);
      expect(result).toBe(mockResult);
    });
  });

  // ─── qualifyTender ────────────────────────────────────────────

  describe('qualifyTender()', () => {
    it('should trigger qualifyTender with forceReanalyze false by default', async () => {
      const mockResult = { decision: 'GO', score: 85 } as any;
      service.qualifyTender.mockResolvedValue(mockResult);

      // ZodValidationPipe would parse and provide defaults; in unit test we pass the parsed result
      const result = await controller.qualifyTender(VALID_UUID, { tenderId: VALID_UUID, forceReanalyze: false });

      expect(service.qualifyTender).toHaveBeenCalledWith(VALID_UUID, false);
      expect(result).toBe(mockResult);
    });

    it('should pass forceReanalyze true when provided', async () => {
      const mockResult = { decision: 'GO', score: 75 } as any;
      service.qualifyTender.mockResolvedValue(mockResult);

      await controller.qualifyTender(VALID_UUID, { tenderId: VALID_UUID, forceReanalyze: true });

      expect(service.qualifyTender).toHaveBeenCalledWith(VALID_UUID, true);
    });
  });

  // ─── prepareDossierAdmin ─────────────────────────────────────

  describe('prepareDossierAdmin()', () => {
    it('should trigger prepareDossierAdmin', async () => {
      const mockResult = { dossier: 'generated' } as any;
      service.prepareDossierAdmin.mockResolvedValue(mockResult);

      const result = await controller.prepareDossierAdmin(VALID_UUID);

      expect(service.prepareDossierAdmin).toHaveBeenCalledWith(VALID_UUID);
      expect(result).toBe(mockResult);
    });
  });

  // ─── generateOffreFinanciere ──────────────────────────────────

  describe('generateOffreFinanciere()', () => {
    it('should trigger generateOffreFinanciere', async () => {
      const mockResult = { totalHT: 120000 } as any;
      service.generateOffreFinanciere.mockResolvedValue(mockResult);

      const result = await controller.generateOffreFinanciere(VALID_UUID);

      expect(service.generateOffreFinanciere).toHaveBeenCalledWith(VALID_UUID);
      expect(result).toBe(mockResult);
    });
  });

  // ─── generateMemoireTechnique ─────────────────────────────────

  describe('generateMemoireTechnique()', () => {
    it('should trigger generateMemoireTechnique', async () => {
      const mockResult = { content: 'memoire content' } as any;
      service.generateMemoireTechnique.mockResolvedValue(mockResult);

      const result = await controller.generateMemoireTechnique(VALID_UUID);

      expect(service.generateMemoireTechnique).toHaveBeenCalledWith(VALID_UUID);
      expect(result).toBe(mockResult);
    });
  });

  // ─── runQualityControl ────────────────────────────────────────

  describe('runQualityControl()', () => {
    it('should trigger runQualityControl', async () => {
      const mockReport = { score: 92, passed: true } as any;
      service.runQualityControl.mockResolvedValue(mockReport);

      const result = await controller.runQualityControl(VALID_UUID);

      expect(service.runQualityControl).toHaveBeenCalledWith(VALID_UUID);
      expect(result).toBe(mockReport);
    });
  });

  // ─── getMonitorStatus ─────────────────────────────────────────

  describe('getMonitorStatus()', () => {
    it('should get monitor status', async () => {
      const mockStatus = { tenderId: VALID_UUID, status: 'SUBMITTED' } as any;
      service.getMonitorStatus.mockResolvedValue(mockStatus);

      const result = await controller.getMonitorStatus(VALID_UUID);

      expect(service.getMonitorStatus).toHaveBeenCalledWith(VALID_UUID);
      expect(result).toBe(mockStatus);
    });
  });

  // ─── processResult ────────────────────────────────────────────

  describe('processResult()', () => {
    it('should process result GAGNE', async () => {
      const mockRetex = { id: 'retex-001' } as any;
      service.processResult.mockResolvedValue(mockRetex);

      const result = await controller.processResult(VALID_UUID, { result: 'GAGNE' });

      expect(service.processResult).toHaveBeenCalledWith(VALID_UUID, 'GAGNE', undefined);
      expect(result).toBe(mockRetex);
    });

    it('should process result PERDU with details', async () => {
      service.processResult.mockResolvedValue(undefined);

      await controller.processResult(VALID_UUID, {
        result: 'PERDU',
        details: { reason: 'Price too high' },
      });

      expect(service.processResult).toHaveBeenCalledWith(
        VALID_UUID,
        'PERDU',
        { reason: 'Price too high' },
      );
    });

    it('should process result SANS_SUITE', async () => {
      service.processResult.mockResolvedValue(undefined);

      await controller.processResult(VALID_UUID, { result: 'SANS_SUITE' });

      expect(service.processResult).toHaveBeenCalledWith(VALID_UUID, 'SANS_SUITE', undefined);
    });

    it('should pass validated result to service', async () => {
      service.processResult.mockResolvedValue(undefined);
      // ZodValidationPipe validates before controller method is called
      // In unit test we pass pre-validated data
      const result = await controller.processResult(VALID_UUID, { result: 'PERDU' });
      expect(service.processResult).toHaveBeenCalledWith(VALID_UUID, 'PERDU', undefined);
    });
  });

  // ─── jonathanDecision ─────────────────────────────────────────

  describe('jonathanDecision()', () => {
    it('should handle Jonathan CONFIRME_GO decision', async () => {
      service.jonathanDecision.mockResolvedValue(undefined);

      const result = await controller.jonathanDecision(VALID_UUID, {
        decision: 'CONFIRME_GO',
        reason: 'Strong candidate',
      });

      expect(service.jonathanDecision).toHaveBeenCalledWith(
        VALID_UUID,
        'CONFIRME_GO',
        'Strong candidate',
      );
      expect(result).toEqual({ ok: true, decision: 'CONFIRME_GO' });
    });

    it('should handle Jonathan FORCE_GO decision', async () => {
      service.jonathanDecision.mockResolvedValue(undefined);

      const result = await controller.jonathanDecision(VALID_UUID, {
        decision: 'FORCE_GO',
      });

      expect(service.jonathanDecision).toHaveBeenCalledWith(VALID_UUID, 'FORCE_GO', undefined);
      expect(result).toEqual({ ok: true, decision: 'FORCE_GO' });
    });

    it('should handle Jonathan NO_GO decision', async () => {
      service.jonathanDecision.mockResolvedValue(undefined);

      const result = await controller.jonathanDecision(VALID_UUID, {
        decision: 'NO_GO',
        reason: 'Budget too tight',
      });

      expect(service.jonathanDecision).toHaveBeenCalledWith(
        VALID_UUID,
        'NO_GO',
        'Budget too tight',
      );
      expect(result).toEqual({ ok: true, decision: 'NO_GO' });
    });

    it('should pass validated decision to service', async () => {
      service.jonathanDecision.mockResolvedValue(undefined);
      const result = await controller.jonathanDecision(VALID_UUID, { decision: 'NO_GO', reason: 'Budget too low' });
      expect(service.jonathanDecision).toHaveBeenCalledWith(VALID_UUID, 'NO_GO', 'Budget too low');
      expect(result).toEqual({ ok: true, decision: 'NO_GO' });
    });
  });

  // ─── healthCheck ──────────────────────────────────────────────

  describe('healthCheck()', () => {
    it('should return health check result', async () => {
      const mockHealth = {
        status: 'ok',
        activePipelines: 3,
        pendingTenders: 12,
        expiredDocuments: 0,
      };
      service.healthCheck.mockResolvedValue(mockHealth);

      const result = await controller.healthCheck();

      expect(service.healthCheck).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockHealth);
      expect(result.status).toBe('ok');
    });
  });

  // ─── CQRS endpoints ───────────────────────────────────────────

  describe('analyzeTenderCqrs()', () => {
    it('should dispatch AnalyzeTenderCommand via commandBus', async () => {
      commandBus.execute.mockResolvedValue({ queued: true });

      const result = await controller.analyzeTenderCqrs(VALID_UUID, {});

      expect(commandBus.execute).toHaveBeenCalledTimes(1);
      const command = commandBus.execute.mock.calls[0][0];
      expect(command.tenderId).toBe(VALID_UUID);
      expect(command.forceReanalyze).toBe(false);
      expect(result).toEqual({ queued: true });
    });

    it('should pass forceReanalyze to AnalyzeTenderCommand', async () => {
      commandBus.execute.mockResolvedValue({});

      await controller.analyzeTenderCqrs(VALID_UUID, { forceReanalyze: true });

      const command = commandBus.execute.mock.calls[0][0];
      expect(command.forceReanalyze).toBe(true);
    });
  });

  describe('getTenderAnalysisCqrs()', () => {
    it('should dispatch GetTenderAnalysisQuery via queryBus', async () => {
      const mockAnalysis = { id: 'analysis-001' };
      queryBus.execute.mockResolvedValue(mockAnalysis);

      const result = await controller.getTenderAnalysisCqrs(VALID_UUID);

      expect(queryBus.execute).toHaveBeenCalledTimes(1);
      const query = queryBus.execute.mock.calls[0][0];
      expect(query.tenderId).toBe(VALID_UUID);
      expect(query.includeHistory).toBe(false);
      expect(result).toBe(mockAnalysis);
    });

    it('should pass includeHistory=true when query param is "true"', async () => {
      queryBus.execute.mockResolvedValue({});

      await controller.getTenderAnalysisCqrs(VALID_UUID, 'true');

      const query = queryBus.execute.mock.calls[0][0];
      expect(query.includeHistory).toBe(true);
    });
  });

  // ─── UUID validation ──────────────────────────────────────────

  describe('UUID validation via ParseUUIDPipe', () => {
    it('should reject invalid UUID params — ParseUUIDPipe throws BadRequestException', async () => {
      const { ParseUUIDPipe: OriginalPipe } = jest.requireActual('@nestjs/common');
      const pipe = new OriginalPipe();
      await expect(pipe.transform(INVALID_UUID, { type: 'param', metatype: String })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should accept a valid UUID through ParseUUIDPipe without throwing', async () => {
      const { ParseUUIDPipe: OriginalPipe } = jest.requireActual('@nestjs/common');
      const pipe = new OriginalPipe();
      await expect(pipe.transform(VALID_UUID, { type: 'param', metatype: String })).resolves.toBe(VALID_UUID);
    });
  });
});
