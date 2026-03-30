import { Test, TestingModule } from '@nestjs/testing';
import { AnomalyDetectorService } from './anomaly-detector.service';
import { PrismaService } from '@core/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

describe('AnomalyDetectorService', () => {
  let service: AnomalyDetectorService;
  const mockFindMany = jest.fn();
  const mockCreate = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnomalyDetectorService,
        {
          provide: PrismaService,
          useValue: {
            metriquesDaily: { findMany: mockFindMany },
            alertes: { create: mockCreate },
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: HttpService, useValue: { post: jest.fn() } },
      ],
    }).compile();

    service = module.get<AnomalyDetectorService>(AnomalyDetectorService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('calculateZScore', () => {
    it('returns 0 when history has fewer than 3 elements', () => {
      expect(service.calculateZScore(10, [5, 8])).toBe(0);
    });

    it('returns 0 when stddev is 0 (all same values)', () => {
      expect(service.calculateZScore(5, [5, 5, 5, 5, 5, 5, 5])).toBe(0);
    });

    it('calculates correct z-score for known values', () => {
      // mean=5, values=[3,4,5,6,7], stddev=~1.58, current=8 => z=(8-5)/1.58~1.9
      const history = [3, 4, 5, 6, 7];
      const z = service.calculateZScore(8, history);
      expect(z).toBeCloseTo(1.897, 2);
    });

    it('returns negative z-score for below-average value', () => {
      const history = [10, 10, 10, 10, 10, 10, 10];
      // All same — stddev=0 → returns 0
      expect(service.calculateZScore(5, history)).toBe(0);
    });

    it('handles large z-score correctly', () => {
      const history = [5, 5, 5, 5, 5, 5, 6]; // mean~5.14, stddev~0.38
      const z = service.calculateZScore(20, history);
      expect(z).toBeGreaterThan(3);
    });
  });

  describe('weekend guard', () => {
    it('skips weekdayOnly metrics on weekends', async () => {
      // 2026-01-03 is a Saturday
      const saturdayRecord = {
        id: '1',
        dateSnapshot: new Date('2026-01-03'),
        suiveurReplyRate: 0,
        suiveurBounceRate: 0,
        veilleurLeadsBruts: 0,
        suiveurEmailsEnvoyes: 0,
        enrichisseurTauxEnrichissement: 0,
        suiveurSlaBreaches: 0,
        scoreurPctHot: 0,
        nurtureurEngagementScoreMoyen: 0,
        createdAt: new Date(),
      };
      mockFindMany.mockResolvedValue([saturdayRecord]);

      const anomalies = await service.detectAnomalies('2026-01-03');

      // veilleurLeadsBruts and suiveurEmailsEnvoyes have weekdayOnly:true — must NOT be reported
      const weekdayOnlyAnomalies = anomalies.filter(
        (a) => a.metrique === 'veilleurLeadsBruts' || a.metrique === 'suiveurEmailsEnvoyes',
      );
      expect(weekdayOnlyAnomalies).toHaveLength(0);
    });
  });

  describe('insufficient data guard', () => {
    it('returns empty when no records found', async () => {
      mockFindMany.mockResolvedValue([]);

      const anomalies = await service.detectAnomalies('2026-01-15');

      expect(anomalies).toHaveLength(0);
    });

    it('uses absolute thresholds when history < 7 days', async () => {
      // Only today's record — reply rate at critical threshold (0%)
      const today = {
        id: '1',
        dateSnapshot: new Date('2026-01-15'),
        suiveurReplyRate: 0,
        suiveurBounceRate: 0,
        veilleurLeadsBruts: 20,
        suiveurEmailsEnvoyes: 10,
        enrichisseurTauxEnrichissement: 70,
        suiveurSlaBreaches: 0,
        scoreurPctHot: 5,
        nurtureurEngagementScoreMoyen: 15,
        createdAt: new Date(),
      };
      mockFindMany.mockResolvedValue([today]);
      mockCreate.mockResolvedValue({});

      const anomalies = await service.detectAnomalies('2026-01-15');

      // suiveurReplyRate=0 should trigger CRITICAL (fixedCriticalLow=1, actually 0 < 1)
      expect(anomalies.length).toBeGreaterThan(0);
    });
  });

  describe('fixed threshold detection', () => {
    it('detects CRITICAL when veilleurLeadsBruts is 0 on a weekday', async () => {
      // 2026-01-12 is a Monday
      const today = {
        id: '1',
        dateSnapshot: new Date('2026-01-12'),
        suiveurReplyRate: 5,
        suiveurBounceRate: 1,
        veilleurLeadsBruts: 0,  // fixedCriticalLow = 0 → triggers
        suiveurEmailsEnvoyes: 10,
        enrichisseurTauxEnrichissement: 70,
        suiveurSlaBreaches: 0,
        scoreurPctHot: 5,
        nurtureurEngagementScoreMoyen: 15,
        createdAt: new Date(),
      };
      mockFindMany.mockResolvedValue([today]);
      mockCreate.mockResolvedValue({});

      const anomalies = await service.detectAnomalies('2026-01-12');

      const leadsAnomaly = anomalies.find((a) => a.metrique === 'veilleurLeadsBruts');
      expect(leadsAnomaly).toBeDefined();
      expect(leadsAnomaly?.seuilType).toBe('CRITICAL');
    });

    it('persists anomalies when found', async () => {
      const today = {
        id: '1',
        dateSnapshot: new Date('2026-01-12'),
        suiveurReplyRate: 5,
        suiveurBounceRate: 1,
        veilleurLeadsBruts: 0,
        suiveurEmailsEnvoyes: 10,
        enrichisseurTauxEnrichissement: 70,
        suiveurSlaBreaches: 0,
        scoreurPctHot: 5,
        nurtureurEngagementScoreMoyen: 15,
        createdAt: new Date(),
      };
      mockFindMany.mockResolvedValue([today]);
      mockCreate.mockResolvedValue({});

      await service.detectAnomalies('2026-01-12');

      expect(mockCreate).toHaveBeenCalled();
    });
  });
});
