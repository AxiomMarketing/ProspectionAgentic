// Mock ESM-only packages pulled in by WebScannerAdapter — must come before any imports
jest.mock('lighthouse', () => jest.fn());
jest.mock('chrome-launcher', () => ({ launch: jest.fn() }));
jest.mock('wappalyzer-core', () => ({}));
jest.mock('axe-core', () => ({}));

import { Test, TestingModule } from '@nestjs/testing';
import { TechEnrichmentService, TechEnrichmentResult } from './tech-enrichment.service';
import { WebScannerAdapter } from '@modules/agent-veilleur/infrastructure/adapters/web-scanner.adapter';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';

const mockWebScanner = {
  scanSite: jest.fn(),
};

const mockPrisma = {
  auditTechnique: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

const mockEventLogger = {
  log: jest.fn(),
};

describe('TechEnrichmentService', () => {
  let service: TechEnrichmentService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TechEnrichmentService,
        { provide: WebScannerAdapter, useValue: mockWebScanner },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AgentEventLoggerService, useValue: mockEventLogger },
      ],
    }).compile();

    service = module.get<TechEnrichmentService>(TechEnrichmentService);
  });

  describe('enrichTechnique — shouldRunTechScan logic', () => {
    it('returns null when leadSource is web_audit and no companyWebsite', async () => {
      const result = await service.enrichTechnique({ companyWebsite: null }, 'web_audit');
      expect(result).toBeNull();
      expect(mockPrisma.auditTechnique.findFirst).not.toHaveBeenCalled();
    });

    it('returns null when leadSource is web_audit and no DB record found', async () => {
      mockPrisma.auditTechnique.findFirst.mockResolvedValue(null);
      const result = await service.enrichTechnique(
        { companyWebsite: 'https://example.com' },
        'web_audit',
      );
      expect(result).toBeNull();
    });

    it('returns cached result when leadSource is web_audit and DB record exists', async () => {
      const dbRecord = buildDbRecord({ lhPerformance: 80 });
      mockPrisma.auditTechnique.findFirst.mockResolvedValue(dbRecord);

      const result = await service.enrichTechnique(
        { companyWebsite: 'https://example.com' },
        'web_audit',
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe('cached');
      expect(result!.performance.score).toBe(80);
      expect(mockWebScanner.scanSite).not.toHaveBeenCalled();
    });

    it('returns null when no companyWebsite and leadSource is not web_audit', async () => {
      const result = await service.enrichTechnique({ companyWebsite: null }, 'linkedin');
      expect(result).toBeNull();
    });

    it('returns cached result when recent scan exists in DB', async () => {
      const dbRecord = buildDbRecord({ lhPerformance: 60 });
      mockPrisma.auditTechnique.findFirst.mockResolvedValue(dbRecord);

      const result = await service.enrichTechnique(
        { companyWebsite: 'https://example.com' },
        'linkedin',
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe('cached');
      expect(mockWebScanner.scanSite).not.toHaveBeenCalled();
    });

    it('runs fresh scan when no cached result exists', async () => {
      mockPrisma.auditTechnique.findFirst.mockResolvedValue(null);
      const scanResult = buildScanResult();
      mockWebScanner.scanSite.mockResolvedValue(scanResult);
      mockPrisma.auditTechnique.create.mockResolvedValue(buildDbRecord({}));

      const result = await service.enrichTechnique(
        { id: 'prospect-1', companyWebsite: 'https://example.com', companyName: 'Acme' },
        'boamp',
      );

      expect(mockWebScanner.scanSite).toHaveBeenCalledWith('https://example.com');
      expect(mockPrisma.auditTechnique.create).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.status).toBe('success');
    });

    it('returns null when scan throws an error', async () => {
      mockPrisma.auditTechnique.findFirst.mockResolvedValue(null);
      mockWebScanner.scanSite.mockRejectedValue(new Error('Chrome unavailable'));

      const result = await service.enrichTechnique(
        { id: 'prospect-1', companyWebsite: 'https://example.com' },
        'boamp',
      );

      expect(result).toBeNull();
    });
  });

  describe('detectProblemes — 12 business rules', () => {
    function buildPartial(
      overrides: Partial<Omit<TechEnrichmentResult, 'problemes_detectes'>> = {},
    ): Omit<TechEnrichmentResult, 'problemes_detectes'> {
      return {
        status: 'success',
        stack: { cms: null, cms_version: null, framework_js: null, server: null },
        performance: { score: 100, lcp_ms: 1000, cls: 0.0, verdict: null },
        accessibilite: { score: 100, violations_critical: 0, violations_total: 0 },
        seo: { score: 80, has_robots_txt: true, has_sitemap: true },
        ssl: { valid: true, days_remaining: 90 },
        ...overrides,
      };
    }

    it('detects PERFORMANCE CRITIQUE when score < 30', () => {
      const problems = service.detectProblemes(
        buildPartial({ performance: { score: 20, lcp_ms: null, cls: null, verdict: null } }),
      );
      expect(problems).toContain('PERFORMANCE CRITIQUE');
      expect(problems).not.toContain('Performance faible');
    });

    it('detects Performance faible when score 30-49', () => {
      const problems = service.detectProblemes(
        buildPartial({ performance: { score: 45, lcp_ms: null, cls: null, verdict: null } }),
      );
      expect(problems).toContain('Performance faible');
      expect(problems).not.toContain('PERFORMANCE CRITIQUE');
    });

    it('detects LCP trop lent when lcp_ms > 4000', () => {
      const problems = service.detectProblemes(
        buildPartial({ performance: { score: 60, lcp_ms: 5000, cls: null, verdict: null } }),
      );
      expect(problems).toContain('LCP trop lent');
    });

    it('does not flag LCP when lcp_ms <= 4000', () => {
      const problems = service.detectProblemes(
        buildPartial({ performance: { score: 60, lcp_ms: 3999, cls: null, verdict: null } }),
      );
      expect(problems).not.toContain('LCP trop lent');
    });

    it('detects CLS mauvais when cls > 0.25', () => {
      const problems = service.detectProblemes(
        buildPartial({ performance: { score: 60, lcp_ms: null, cls: 0.3, verdict: null } }),
      );
      expect(problems).toContain('CLS mauvais');
    });

    it('detects critical a11y violations', () => {
      const problems = service.detectProblemes(
        buildPartial({
          accessibilite: { score: 70, violations_critical: 3, violations_total: 10 },
        }),
      );
      expect(problems).toContain('3 violations accessibilité CRITIQUES');
    });

    it('detects Accessibilité insuffisante when score < 50', () => {
      const problems = service.detectProblemes(
        buildPartial({
          accessibilite: { score: 40, violations_critical: 0, violations_total: 0 },
        }),
      );
      expect(problems).toContain('Accessibilité insuffisante');
    });

    it('detects WordPress obsolète when cms is WordPress and version < 6', () => {
      const problems = service.detectProblemes(
        buildPartial({
          stack: { cms: 'WordPress', cms_version: '5.9.3', framework_js: null, server: null },
        }),
      );
      expect(problems).toContain('WordPress obsolète');
    });

    it('does not flag WordPress when version >= 6', () => {
      const problems = service.detectProblemes(
        buildPartial({
          stack: { cms: 'WordPress', cms_version: '6.4.1', framework_js: null, server: null },
        }),
      );
      expect(problems).not.toContain('WordPress obsolète');
    });

    it('detects jQuery sans framework moderne', () => {
      const problems = service.detectProblemes(
        buildPartial({
          stack: { cms: null, cms_version: null, framework_js: 'jQuery', server: null },
        }),
      );
      expect(problems).toContain('jQuery sans framework moderne');
    });

    it('does not flag jQuery when React is also present (combined framework string)', () => {
      const problems = service.detectProblemes(
        buildPartial({
          stack: { cms: null, cms_version: null, framework_js: 'jQuery / React', server: null },
        }),
      );
      expect(problems).not.toContain('jQuery sans framework moderne');
    });

    it('detects Certificat SSL invalide when not valid but days_remaining is set', () => {
      const problems = service.detectProblemes(
        buildPartial({ ssl: { valid: false, days_remaining: 10 } }),
      );
      expect(problems).toContain('Certificat SSL invalide');
    });

    it('detects Certificat SSL expire bientôt when valid and < 30 days remaining', () => {
      const problems = service.detectProblemes(
        buildPartial({ ssl: { valid: true, days_remaining: 15 } }),
      );
      expect(problems).toContain('Certificat SSL expire bientôt');
    });

    it('detects Pas de HTTPS when not valid and days_remaining is null', () => {
      const problems = service.detectProblemes(
        buildPartial({ ssl: { valid: false, days_remaining: null } }),
      );
      expect(problems).toContain('Pas de HTTPS');
    });

    it('returns empty array when no problems found', () => {
      const problems = service.detectProblemes(buildPartial());
      expect(problems).toHaveLength(0);
    });
  });
});

// ─── Test helpers ────────────────────────────────────────────────────────────

function buildDbRecord(overrides: Record<string, unknown>) {
  return {
    id: 'audit-1',
    createdAt: new Date(),
    url: 'https://example.com',
    entrepriseNom: 'Acme',
    lhPerformance: 75,
    lhAccessibility: 80,
    lhBestPractices: 90,
    lhSeo: 85,
    lhMetrics: {},
    stackCms: null,
    stackCmsVersion: null,
    stackFramework: null,
    stackServer: 'nginx',
    stackComplete: {},
    axeViolations: 0,
    axeCritical: 0,
    axeSerious: 0,
    sslValid: true,
    sslDaysRemaining: 90,
    hasSitemap: true,
    hasRobotsTxt: true,
    pageWeightMb: 1.2,
    scoreTechnique: 55,
    classification: 'HIGH',
    reasons: [],
    leadId: null,
    ...overrides,
  };
}

function buildScanResult() {
  return {
    url: 'https://example.com',
    performanceScore: 75,
    accessibilityScore: 80,
    lhBestPractices: 90,
    lhSeo: 85,
    lhMetrics: {},
    stackCms: null,
    stackCmsVersion: null,
    stackFramework: null,
    stackServer: 'nginx',
    stackComplete: {},
    axeViolations: 0,
    axeCritical: 0,
    axeSerious: 0,
    sslValid: true,
    sslDaysRemaining: 90,
    hasSitemap: true,
    hasRobotsTxt: true,
    pageWeightMb: 1.2,
    scoreTechnique: 55,
    classification: 'HIGH' as const,
    reasons: [],
  };
}
