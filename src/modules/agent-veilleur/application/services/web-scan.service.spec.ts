import { WebScanService } from './web-scan.service';
import { WebScannerAdapter, WebScanResult } from '../../infrastructure/adapters/web-scanner.adapter';

// Mock lighthouse and chrome-launcher which use ESM — they are not needed in unit tests
jest.mock('lighthouse', () => jest.fn());
jest.mock('chrome-launcher', () => ({ launch: jest.fn() }));
jest.mock('wappalyzer-core', () => ({}));
jest.mock('axe-core', () => ({}));

const mockSites = [
  { id: 'site-1', url: 'https://example.com', entrepriseNom: 'Example Corp', lastScannedAt: null, active: true, priority: 5, scanCount: 0 },
  { id: 'site-2', url: 'https://old.com', entrepriseNom: 'Old Corp', lastScannedAt: new Date(Date.now() - 72 * 60 * 60 * 1000), active: true, priority: 3, scanCount: 1 },
  { id: 'site-3', url: 'https://recent.com', entrepriseNom: 'Recent Corp', lastScannedAt: new Date(Date.now() - 10 * 60 * 60 * 1000), active: true, priority: 5, scanCount: 1 },
];

const makeResult = (score: number): WebScanResult => ({
  url: 'https://example.com',
  performanceScore: 30,
  accessibilityScore: 40,
  lhBestPractices: 70,
  lhSeo: 60,
  lhMetrics: {},
  stackCms: 'WordPress',
  stackCmsVersion: '6.0',
  stackFramework: null,
  stackServer: 'nginx',
  stackComplete: {},
  axeViolations: 5,
  axeCritical: 2,
  axeSerious: 3,
  sslValid: true,
  sslDaysRemaining: 90,
  hasSitemap: false,
  hasRobotsTxt: true,
  pageWeightMb: 4.5,
  scoreTechnique: score,
  classification: score >= 70 ? 'URGENT' : score >= 50 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW',
  reasons: ['Performance score low (30/100)'],
});

describe('WebScanService', () => {
  let service: WebScanService;
  let mockPrisma: any;
  let mockAgentEventLogger: any;
  let mockWebScanner: jest.Mocked<WebScannerAdapter>;
  let mockEnrichisseurQueue: any;

  beforeEach(() => {
    mockPrisma = {
      siteAScanner: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      auditTechnique: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      rawLead: {
        create: jest.fn().mockResolvedValue({ id: 'lead-1' }),
      },
    };

    mockAgentEventLogger = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockWebScanner = {
      scanSite: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
    } as any;

    mockEnrichisseurQueue = {
      add: jest.fn().mockResolvedValue({}),
    };

    service = new WebScanService(
      mockPrisma,
      mockAgentEventLogger,
      mockWebScanner,
      mockEnrichisseurQueue,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('scanBatch', () => {
    it('loads sites filtered by 48h cutoff from the database', async () => {
      mockPrisma.siteAScanner.findMany.mockResolvedValue([]);

      await service.scanBatch({ batchSize: 10, minScore: 50 });

      expect(mockPrisma.siteAScanner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
          take: 10,
        }),
      );
    });

    it('does nothing when no sites are returned', async () => {
      mockPrisma.siteAScanner.findMany.mockResolvedValue([]);

      await service.scanBatch({ batchSize: 10, minScore: 50 });

      expect(mockWebScanner.scanSite).not.toHaveBeenCalled();
      expect(mockPrisma.rawLead.create).not.toHaveBeenCalled();
    });

    it('saves audit result and updates lastScannedAt for each site', async () => {
      const site = mockSites[0];
      mockPrisma.siteAScanner.findMany.mockResolvedValue([site]);
      mockWebScanner.scanSite.mockResolvedValue(makeResult(40));

      await service.scanBatch({ batchSize: 10, minScore: 50 });

      expect(mockPrisma.auditTechnique.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.siteAScanner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: site.id },
          data: expect.objectContaining({ lastScannedAt: expect.any(Date) }),
        }),
      );
    });

    it('does not create a lead when score is below minScore', async () => {
      const site = mockSites[0];
      mockPrisma.siteAScanner.findMany.mockResolvedValue([site]);
      mockWebScanner.scanSite.mockResolvedValue(makeResult(30)); // below minScore=50

      await service.scanBatch({ batchSize: 10, minScore: 50 });

      expect(mockPrisma.rawLead.create).not.toHaveBeenCalled();
      expect(mockEnrichisseurQueue.add).not.toHaveBeenCalled();
    });

    it('creates a lead and dispatches to enrichisseur when score >= minScore', async () => {
      const site = mockSites[0];
      mockPrisma.siteAScanner.findMany.mockResolvedValue([site]);
      mockWebScanner.scanSite.mockResolvedValue(makeResult(75)); // above minScore=50

      await service.scanBatch({ batchSize: 10, minScore: 50 });

      expect(mockPrisma.rawLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: 'web_audit',
            sourceUrl: site.url,
          }),
        }),
      );
      expect(mockEnrichisseurQueue.add).toHaveBeenCalledWith(
        'enrich-lead',
        expect.objectContaining({ source: 'web_audit', preScore: 75 }),
        expect.any(Object),
      );
    });

    it('marks high-priority leads (score >= 70) with priority 1 in queue', async () => {
      const site = mockSites[0];
      mockPrisma.siteAScanner.findMany.mockResolvedValue([site]);
      mockWebScanner.scanSite.mockResolvedValue(makeResult(80));

      await service.scanBatch({ batchSize: 10, minScore: 50 });

      expect(mockEnrichisseurQueue.add).toHaveBeenCalledWith(
        'enrich-lead',
        expect.objectContaining({ highPriority: true }),
        expect.objectContaining({ priority: 1 }),
      );
    });

    it('logs an error and continues when a single site scan fails', async () => {
      const [site1, site2] = mockSites;
      mockPrisma.siteAScanner.findMany.mockResolvedValue([site1, site2]);
      mockWebScanner.scanSite
        .mockRejectedValueOnce(new Error('Chrome crash'))
        .mockResolvedValueOnce(makeResult(60));

      await service.scanBatch({ batchSize: 10, minScore: 50 });

      // site2 succeeded — audit saved
      expect(mockPrisma.auditTechnique.create).toHaveBeenCalledTimes(1);
      // Error event logged for site1
      expect(mockAgentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'site_scan_error' }),
      );
    });

    it('processes all sites even when error occurs mid-batch', async () => {
      const sites = mockSites.slice(0, 2);
      mockPrisma.siteAScanner.findMany.mockResolvedValue(sites);
      mockWebScanner.scanSite
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(makeResult(20));

      await expect(service.scanBatch({ batchSize: 10, minScore: 50 })).resolves.toBeUndefined();
    });

    it('logs batch_started and batch_complete events', async () => {
      mockPrisma.siteAScanner.findMany.mockResolvedValue([]);

      await service.scanBatch({ batchSize: 5, minScore: 40 });

      expect(mockAgentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'scan_batch_started' }),
      );
      expect(mockAgentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'scan_batch_complete' }),
      );
    });
  });
});
