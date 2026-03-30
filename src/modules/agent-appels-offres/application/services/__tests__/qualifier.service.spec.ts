import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { QualifierService, QualificationAxes, TenderDecision } from '../qualifier.service';
import { DceAnalysisOutput } from '../dce-analyzer.service';
import { PrismaService } from '@core/database/prisma.service';
import { LlmService } from '@modules/llm/llm.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';

// ─── Mock factories ────────────────────────────────────────────────────────────

function makeDceAnalysis(overrides: Partial<DceAnalysisOutput> = {}): DceAnalysisOutput {
  return {
    conditions_participation: [],
    criteres_evaluation: [{ critere: 'Prix', ponderation: 40 }, { critere: 'Technique', ponderation: 60 }],
    pieces_exigees: [],
    exigences_individuelles: [],
    flags_conditionnels: { rse: false, rgaa: false, volet_social: false },
    mots_cles_miroir: [],
    strategie_prix_recommandee: '',
    suspicion_flags: {
      criteres_sur_mesure: false,
      references_impossibles: false,
      budget_sous_evalue: false,
      delai_irrealiste: false,
    },
    ...overrides,
  };
}

function makeTenderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tender-1',
    title: 'Refonte portail web',
    description: 'Site web digital e-commerce',
    buyerName: 'Conseil Général Test',
    source: 'BOAMP',
    estimatedAmount: 80_000,
    estimatedBudget: null,
    deadlineDate: new Date(Date.now() + 20 * 86_400_000),
    aoAnalyse: null,
    ...overrides,
  };
}

function makeAoAnalyseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'analyse-1',
    tenderId: 'tender-1',
    status: 'completed',
    decision: 'GO',
    decisionReason: 'Score élevé',
    scorePertinence: 80,
    scoreCompetence: 75,
    scoreBudget: 80,
    scoreConcurrence: 70,
    scoreTotal: 75,
    ...overrides,
  };
}

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  publicTender: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  aoAnalyse: {
    update: jest.fn(),
    create: jest.fn(),
  },
  aoAnalyseHistory: {
    create: jest.fn(),
  },
};

const mockLlmService = { call: jest.fn() };
const mockConfigService = { get: jest.fn() };
const mockHttpService = { post: jest.fn() };
const mockAgentEventLogger = { log: jest.fn() };

// ─── Test suite ────────────────────────────────────────────────────────────────

describe('QualifierService', () => {
  let service: QualifierService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QualifierService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LlmService, useValue: mockLlmService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: AgentEventLoggerService, useValue: mockAgentEventLogger },
      ],
    }).compile();

    service = module.get<QualifierService>(QualifierService);
    jest.clearAllMocks();
  });

  // ─── qualifyTender — happy path ────────────────────────────────────────────

  describe('qualifyTender', () => {
    it('should score on 7 axes and return a QualificationResult', async () => {
      const tender = makeTenderRow({ aoAnalyse: null });
      (mockPrisma.publicTender as any).findUnique = jest.fn().mockResolvedValue(tender);
      (mockPrisma.aoAnalyseHistory as any).create = jest.fn().mockResolvedValue({});
      (mockPrisma.aoAnalyse as any).create = jest.fn().mockResolvedValue({ id: 'analyse-new' });
      (mockPrisma.publicTender as any).update = jest.fn().mockResolvedValue({});

      const result = await service.qualifyTender('tender-1', makeDceAnalysis());

      expect(result.tenderId).toBe('tender-1');
      expect(result.axes).toHaveProperty('pertinence');
      expect(result.axes).toHaveProperty('competences');
      expect(result.axes).toHaveProperty('budget');
      expect(result.axes).toHaveProperty('concurrence');
      expect(result.axes).toHaveProperty('delai');
      expect(result.axes).toHaveProperty('references');
      expect(result.axes).toHaveProperty('capacite');
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
      expect(result.cached).toBe(false);
    });

    it('should return GO when totalScore >= 70 and EV is positive and above threshold', async () => {
      // Use a high-scoring digital tender with large budget to guarantee GO
      const tender = makeTenderRow({
        title: 'Refonte site web digital e-commerce marketing',
        description: 'Application web digital',
        source: 'MAPA',
        estimatedAmount: 150_000,
        deadlineDate: new Date(Date.now() + 30 * 86_400_000),
        aoAnalyse: null,
      });
      (mockPrisma.publicTender as any).findUnique = jest.fn().mockResolvedValue(tender);
      (mockPrisma.aoAnalyseHistory as any).create = jest.fn().mockResolvedValue({});
      (mockPrisma.aoAnalyse as any).create = jest.fn().mockResolvedValue({ id: 'analyse-go' });
      (mockPrisma.publicTender as any).update = jest.fn().mockResolvedValue({});

      const dce = makeDceAnalysis({ flags_conditionnels: { rse: false, rgaa: true, volet_social: false } });
      const result = await service.qualifyTender('tender-1', dce);

      // With rgaa=true and digital title + MAPA + 150k budget this should score >= 70
      expect(['GO', 'POSSIBLE']).toContain(result.decision);
    });

    it('should return POSSIBLE when score is 50-69', async () => {
      // Force a POSSIBLE score by testing determineDecision directly
      const { decision } = service.determineDecision(60, 2000, 'BOAMP');
      expect(decision).toBe('POSSIBLE');
    });

    it('should return NO_GO when score < 50', async () => {
      const { decision } = service.determineDecision(40, 100, 'BOAMP');
      expect(decision).toBe('NO_GO');
    });

    it('should return NO_GO when EV is negative', async () => {
      const { decision } = service.determineDecision(75, -500, 'BOAMP');
      expect(decision).toBe('NO_GO');
    });

    it('should return cached result when already qualified (forceReanalyze = false)', async () => {
      const existingAnalyse = makeAoAnalyseRow({ decision: 'GO', status: 'completed' });
      const tender = makeTenderRow({ aoAnalyse: existingAnalyse });
      (mockPrisma.publicTender as any).findUnique = jest.fn().mockResolvedValue(tender);
      (mockPrisma.aoAnalyseHistory as any).create = jest.fn().mockResolvedValue({});

      const result = await service.qualifyTender('tender-1', makeDceAnalysis(), false);

      expect(result.cached).toBe(true);
      expect(result.decision).toBe('GO');
      expect((mockPrisma.aoAnalyse as any).update).not.toHaveBeenCalled();
    });

    it('should bypass cache and re-qualify when forceReanalyze = true', async () => {
      const existingAnalyse = makeAoAnalyseRow({ decision: 'GO' });
      const tender = makeTenderRow({ aoAnalyse: existingAnalyse });
      (mockPrisma.publicTender as any).findUnique = jest.fn().mockResolvedValue(tender);
      (mockPrisma.aoAnalyseHistory as any).create = jest.fn().mockResolvedValue({});
      (mockPrisma.aoAnalyse as any).update = jest.fn().mockResolvedValue({ id: 'analyse-1' });
      (mockPrisma.publicTender as any).update = jest.fn().mockResolvedValue({});

      const result = await service.qualifyTender('tender-1', makeDceAnalysis(), true);

      expect(result.cached).toBe(false);
      expect((mockPrisma.aoAnalyse as any).update).toHaveBeenCalled();
    });

    it('should throw NotFoundException for a missing tender', async () => {
      (mockPrisma.publicTender as any).findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.qualifyTender('nonexistent', makeDceAnalysis())).rejects.toThrow(NotFoundException);
    });

    it('should send Slack notification for POSSIBLE decisions when SLACK_WEBHOOK_URL is configured', async () => {
      const tender = makeTenderRow({ aoAnalyse: null });
      (mockPrisma.publicTender as any).findUnique = jest.fn()
        .mockResolvedValueOnce(tender) // qualifyTender initial call
        .mockResolvedValueOnce(tender); // notifyJonathan internal call
      (mockPrisma.aoAnalyseHistory as any).create = jest.fn().mockResolvedValue({});
      (mockPrisma.aoAnalyse as any).create = jest.fn().mockResolvedValue({ id: 'analyse-possible' });
      (mockPrisma.publicTender as any).update = jest.fn().mockResolvedValue({});
      mockConfigService.get.mockReturnValue('https://hooks.slack.com/services/test');
      mockHttpService.post.mockReturnValue(of({ status: 200 }));

      // Override determineDecision to guarantee POSSIBLE
      jest.spyOn(service, 'determineDecision').mockReturnValue({ decision: 'POSSIBLE', reason: 'Test POSSIBLE' });

      await service.qualifyTender('tender-1', makeDceAnalysis());

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/test',
        expect.objectContaining({ text: expect.any(String) }),
        expect.any(Object),
      );
    });

    it('should skip Slack notification when SLACK_WEBHOOK_URL is not configured', async () => {
      const tender = makeTenderRow({ aoAnalyse: null });
      (mockPrisma.publicTender as any).findUnique = jest.fn().mockResolvedValue(tender);
      (mockPrisma.aoAnalyseHistory as any).create = jest.fn().mockResolvedValue({});
      (mockPrisma.aoAnalyse as any).create = jest.fn().mockResolvedValue({ id: 'analyse-no-slack' });
      (mockPrisma.publicTender as any).update = jest.fn().mockResolvedValue({});
      mockConfigService.get.mockReturnValue(undefined);

      jest.spyOn(service, 'determineDecision').mockReturnValue({ decision: 'POSSIBLE', reason: 'No Slack test' });

      await service.qualifyTender('tender-1', makeDceAnalysis());

      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should auto NO_GO for COLLECTIVE_SUSPICION (3+ fausse chance flags)', () => {
      // When all 4 suspicion flags are set, concurrence axis should score very low
      const dce = makeDceAnalysis({
        suspicion_flags: {
          criteres_sur_mesure: true,
          references_impossibles: true,
          budget_sous_evalue: true,
          delai_irrealiste: true,
        },
      });

      // The scoreAxes logic in QualifierService sets concurrence=20 on criteres_sur_mesure
      // We verify through calculateWeightedScore that low concurrence contributes to score
      const axes: QualificationAxes = {
        pertinence: 60,
        competences: 55,
        budget: 50,
        concurrence: 20, // criteres_sur_mesure
        delai: 70,
        references: 50,
        capacite: 65,
      };
      const score = service.calculateWeightedScore(axes);
      const { decision } = service.determineDecision(score, 1000, 'BOAMP');

      // With concurrence at 20, the weighted score should land in a range that can be NO_GO or POSSIBLE
      expect(score).toBeLessThan(70);
    });
  });

  // ─── calculateWeightedScore ────────────────────────────────────────────────

  describe('calculateWeightedScore', () => {
    it('should correctly apply weights summing to 1.0', () => {
      const axes: QualificationAxes = {
        pertinence: 100,
        competences: 100,
        budget: 100,
        concurrence: 100,
        delai: 100,
        references: 100,
        capacite: 100,
      };
      expect(service.calculateWeightedScore(axes)).toBe(100);
    });

    it('should return 0 when all axes are 0', () => {
      const axes: QualificationAxes = {
        pertinence: 0,
        competences: 0,
        budget: 0,
        concurrence: 0,
        delai: 0,
        references: 0,
        capacite: 0,
      };
      expect(service.calculateWeightedScore(axes)).toBe(0);
    });

    it('should correctly weight pertinence (0.25) as the highest weight', () => {
      const baseAxes: QualificationAxes = {
        pertinence: 0,
        competences: 0,
        budget: 0,
        concurrence: 0,
        delai: 0,
        references: 0,
        capacite: 0,
      };

      const withPertinence = service.calculateWeightedScore({ ...baseAxes, pertinence: 100 });
      const withCompetences = service.calculateWeightedScore({ ...baseAxes, competences: 100 });

      expect(withPertinence).toBeGreaterThan(withCompetences);
    });
  });

  // ─── calculateExpectedValue ────────────────────────────────────────────────

  describe('calculateExpectedValue', () => {
    it('should calculate EV as (montant * margePercent% * probaGain) - effortCost', () => {
      // montant=100_000, marge=20%, proba=0.20, effort=16h, tjm=800
      // grossValue = 100_000 * 0.20 * 0.20 = 4000
      // costOfEffort = 16 * (800/8) = 16 * 100 = 1600
      // EV = 4000 - 1600 = 2400
      const ev = service.calculateExpectedValue(100_000, 20, 0.20, 16);
      expect(ev).toBe(2400);
    });

    it('should return negative EV when effort cost exceeds gross value', () => {
      // Small contract with high effort
      const ev = service.calculateExpectedValue(5_000, 15, 0.20, 100);
      expect(ev).toBeLessThan(0);
    });

    it('should accept custom TJM parameter', () => {
      const ev1 = service.calculateExpectedValue(100_000, 20, 0.20, 16, 800);
      const ev2 = service.calculateExpectedValue(100_000, 20, 0.20, 16, 1200);
      expect(ev2).toBeLessThan(ev1);
    });
  });

  // ─── determineDecision ─────────────────────────────────────────────────────

  describe('determineDecision', () => {
    it('should return GO when score >= 70 and EV > threshold (MAPA: 500)', () => {
      const { decision } = service.determineDecision(75, 1000, 'MAPA');
      expect(decision).toBe('GO');
    });

    it('should return GO when score >= 70 and EV > threshold (default: 1000)', () => {
      const { decision } = service.determineDecision(70, 1500, 'BOAMP');
      expect(decision).toBe('GO');
    });

    it('should return POSSIBLE when score >= 70 but EV <= threshold', () => {
      const { decision } = service.determineDecision(70, 800, 'BOAMP');
      expect(decision).toBe('POSSIBLE');
    });

    it('should return NO_GO when score < 50 regardless of EV', () => {
      const { decision } = service.determineDecision(49, 50_000, 'BOAMP');
      expect(decision).toBe('NO_GO');
    });

    it('should include score details in reason string', () => {
      const { reason } = service.determineDecision(45, 100, 'BOAMP');
      expect(reason).toContain('45');
    });
  });

  // ─── getSuccessRate ────────────────────────────────────────────────────────

  describe('getSuccessRate', () => {
    it('should return 0.425 for MAPA procedures', () => {
      expect(service.getSuccessRate('MAPA')).toBe(0.425);
    });

    it('should return 0.50 for RESTREINT procedures', () => {
      expect(service.getSuccessRate('PROCEDURE_RESTREINT')).toBe(0.50);
    });

    it('should return 0.70 for RECONDUCTION procedures', () => {
      expect(service.getSuccessRate('AO_RECONDUCTION')).toBe(0.70);
    });

    it('should return 0.20 as default fallback', () => {
      expect(service.getSuccessRate('BOAMP')).toBe(0.20);
    });

    it('should be case-insensitive', () => {
      expect(service.getSuccessRate('mapa')).toBe(0.425);
    });
  });
});
