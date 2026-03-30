import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { WebScannerAdapter } from '@modules/agent-veilleur/infrastructure/adapters/web-scanner.adapter';

export interface TechEnrichmentResult {
  status: 'success' | 'partial' | 'cached' | 'failed';
  stack: {
    cms: string | null;
    cms_version: string | null;
    framework_js: string | null;
    server: string | null;
  };
  performance: {
    score: number | null;
    lcp_ms: number | null;
    cls: number | null;
    verdict: string | null;
  };
  accessibilite: {
    score: number | null;
    violations_critical: number;
    violations_total: number;
  };
  seo: {
    score: number | null;
    has_robots_txt: boolean;
    has_sitemap: boolean;
  };
  ssl: {
    valid: boolean;
    days_remaining: number | null;
  };
  problemes_detectes: string[];
}

@Injectable()
export class TechEnrichmentService {
  private readonly logger = new Logger(TechEnrichmentService.name);
  private static readonly CACHE_TTL_DAYS = 30;

  constructor(
    private readonly webScanner: WebScannerAdapter,
    private readonly prisma: PrismaService,
    private readonly eventLogger: AgentEventLoggerService,
  ) {}

  async enrichTechnique(
    prospect: any,
    leadSource: string,
  ): Promise<TechEnrichmentResult | null> {
    // web_audit leads: load existing audit from DB instead of re-scanning
    if (leadSource === 'web_audit') {
      if (!prospect.companyWebsite) return null;

      const existing = await this.prisma.auditTechnique.findFirst({
        where: { url: prospect.companyWebsite },
        orderBy: { createdAt: 'desc' },
      });

      if (!existing) return null;

      return this.mapDbRecordToResult(existing, 'cached');
    }

    if (!prospect.companyWebsite) return null;

    // Check cache: skip scan if recent result exists
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - TechEnrichmentService.CACHE_TTL_DAYS);

    const cached = await this.prisma.auditTechnique.findFirst({
      where: {
        url: prospect.companyWebsite,
        createdAt: { gte: thirtyDaysAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (cached) {
      this.logger.log({ msg: 'Tech scan cache hit', url: prospect.companyWebsite });
      return this.mapDbRecordToResult(cached, 'cached');
    }

    // Run fresh scan
    this.logger.log({ msg: 'Running tech scan', url: prospect.companyWebsite });

    try {
      const scanResult = await this.webScanner.scanSite(prospect.companyWebsite);

      const lhMetrics = scanResult.lhMetrics as Record<string, { numericValue?: number }>;
      const lcpMs =
        (lhMetrics['largest-contentful-paint']?.numericValue ?? null);
      const cls =
        (lhMetrics['cumulative-layout-shift']?.numericValue ?? null);

      const saved = await this.prisma.auditTechnique.create({
        data: {
          url: prospect.companyWebsite,
          entrepriseNom: prospect.companyName ?? null,
          lhPerformance: scanResult.performanceScore,
          lhAccessibility: scanResult.accessibilityScore,
          lhBestPractices: scanResult.lhBestPractices,
          lhSeo: scanResult.lhSeo,
          lhMetrics: scanResult.lhMetrics as object,
          stackCms: scanResult.stackCms,
          stackCmsVersion: scanResult.stackCmsVersion,
          stackFramework: scanResult.stackFramework,
          stackServer: scanResult.stackServer,
          stackComplete: scanResult.stackComplete as object,
          axeViolations: scanResult.axeViolations,
          axeCritical: scanResult.axeCritical,
          axeSerious: scanResult.axeSerious,
          sslValid: scanResult.sslValid,
          sslDaysRemaining: scanResult.sslDaysRemaining,
          hasSitemap: scanResult.hasSitemap,
          hasRobotsTxt: scanResult.hasRobotsTxt,
          pageWeightMb: scanResult.pageWeightMb,
          scoreTechnique: scanResult.scoreTechnique,
          classification: scanResult.classification,
          reasons: scanResult.reasons,
        },
      });

      const result = this.mapDbRecordToResult(saved, 'success');

      await this.eventLogger.log({
        agentName: 'agent-enrichisseur',
        eventType: 'tech_scan_completed',
        prospectId: prospect.id,
        result: {
          url: prospect.companyWebsite,
          status: result.status,
          problemes: result.problemes_detectes.length,
        },
      });

      return result;
    } catch (error) {
      this.logger.error({
        msg: 'Tech scan failed',
        url: prospect.companyWebsite,
        error: (error as Error).message,
      });

      await this.eventLogger.log({
        agentName: 'agent-enrichisseur',
        eventType: 'tech_scan_failed',
        prospectId: prospect.id,
        errorMessage: (error as Error).message,
      });

      return null;
    }
  }

  detectProblemes(result: Omit<TechEnrichmentResult, 'problemes_detectes'>): string[] {
    const problemes: string[] = [];
    const { performance, accessibilite, stack, ssl } = result;

    if (performance.score !== null && performance.score < 30) {
      problemes.push('PERFORMANCE CRITIQUE');
    } else if (performance.score !== null && performance.score < 50) {
      problemes.push('Performance faible');
    }

    if (performance.lcp_ms !== null && performance.lcp_ms > 4000) {
      problemes.push('LCP trop lent');
    }

    if (performance.cls !== null && performance.cls > 0.25) {
      problemes.push('CLS mauvais');
    }

    if (accessibilite.violations_critical > 0) {
      problemes.push(
        `${accessibilite.violations_critical} violations accessibilité CRITIQUES`,
      );
    }

    if (accessibilite.score !== null && accessibilite.score < 50) {
      problemes.push('Accessibilité insuffisante');
    }

    if (
      stack.cms !== null &&
      stack.cms.toLowerCase().includes('wordpress') &&
      stack.cms_version !== null
    ) {
      const versionMatch = stack.cms_version.match(/^(\d+)/);
      if (versionMatch && parseInt(versionMatch[1], 10) < 6) {
        problemes.push('WordPress obsolète');
      }
    }

    if (
      stack.framework_js !== null &&
      stack.framework_js.toLowerCase().includes('jquery') &&
      !['react', 'vue', 'angular', 'svelte', 'next', 'nuxt'].some(
        (f) => stack.framework_js?.toLowerCase().includes(f),
      )
    ) {
      problemes.push('jQuery sans framework moderne');
    }

    if (!ssl.valid && ssl.days_remaining !== null && ssl.days_remaining > 0) {
      problemes.push('Certificat SSL invalide');
    }

    if (ssl.valid && ssl.days_remaining !== null && ssl.days_remaining < 30) {
      problemes.push('Certificat SSL expire bientôt');
    }

    if (!ssl.valid && ssl.days_remaining === null) {
      problemes.push('Pas de HTTPS');
    }

    return problemes;
  }

  private mapDbRecordToResult(
    record: any,
    status: 'success' | 'cached',
  ): TechEnrichmentResult {
    const lhMetrics = (record.lhMetrics ?? {}) as Record<
      string,
      { numericValue?: number }
    >;

    const partial: Omit<TechEnrichmentResult, 'problemes_detectes'> = {
      status,
      stack: {
        cms: record.stackCms ?? null,
        cms_version: record.stackCmsVersion ?? null,
        framework_js: record.stackFramework ?? null,
        server: record.stackServer ?? null,
      },
      performance: {
        score: record.lhPerformance ?? null,
        lcp_ms: lhMetrics['largest-contentful-paint']?.numericValue ?? null,
        cls: lhMetrics['cumulative-layout-shift']?.numericValue ?? null,
        verdict: record.classification ?? null,
      },
      accessibilite: {
        score: record.lhAccessibility ?? null,
        violations_critical: record.axeCritical ?? 0,
        violations_total: record.axeViolations ?? 0,
      },
      seo: {
        score: record.lhSeo ?? null,
        has_robots_txt: record.hasRobotsTxt ?? false,
        has_sitemap: record.hasSitemap ?? false,
      },
      ssl: {
        valid: record.sslValid ?? false,
        days_remaining: record.sslDaysRemaining ?? null,
      },
    };

    return {
      ...partial,
      problemes_detectes: this.detectProblemes(partial),
    };
  }
}
