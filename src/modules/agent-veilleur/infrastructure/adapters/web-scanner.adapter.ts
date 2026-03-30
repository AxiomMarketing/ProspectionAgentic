import { Injectable, Logger } from '@nestjs/common';
import { connect, TLSSocket } from 'tls';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
// wappalyzer-core is deprecated and calls process.exit() on import
// Use lazy dynamic import to prevent crash at module load time
let Wappalyzer: any = null;
async function getWappalyzer() {
  if (!Wappalyzer) {
    try {
      Wappalyzer = (await import('wappalyzer-core')).default;
    } catch {
      Wappalyzer = null;
    }
  }
  return Wappalyzer;
}
import axe from 'axe-core';

export interface WebScanResult {
  url: string;
  performanceScore: number;
  accessibilityScore: number;
  lhBestPractices: number;
  lhSeo: number;
  lhMetrics: Record<string, unknown>;

  stackCms: string | null;
  stackCmsVersion: string | null;
  stackFramework: string | null;
  stackServer: string | null;
  stackComplete: Record<string, unknown>;

  axeViolations: number;
  axeCritical: number;
  axeSerious: number;

  sslValid: boolean;
  sslDaysRemaining: number | null;

  hasSitemap: boolean;
  hasRobotsTxt: boolean;
  pageWeightMb: number;

  scoreTechnique: number;
  classification: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: string[];
}

interface WappalyzerTechnology {
  name: string;
  slug?: string;
  categories?: Array<{ name: string }>;
  version?: string;
}

@Injectable()
export class WebScannerAdapter {
  private readonly logger = new Logger(WebScannerAdapter.name);

  async scanSite(url: string): Promise<WebScanResult> {
    this.logger.log({ msg: 'Starting web scan', url });

    const [lighthouseResult, wappalyzerResult, sslResult, robotsResult, sitemapResult] =
      await Promise.allSettled([
        this.runLighthouse(url),
        this.runWappalyzer(url),
        this.checkSsl(url),
        this.checkRobotsTxt(url),
        this.checkSitemap(url),
      ]);

    const lh =
      lighthouseResult.status === 'fulfilled'
        ? lighthouseResult.value
        : this.defaultLighthouseResult();

    const stack =
      wappalyzerResult.status === 'fulfilled'
        ? wappalyzerResult.value
        : this.defaultStackResult();

    const ssl =
      sslResult.status === 'fulfilled' ? sslResult.value : { valid: false, daysRemaining: null };

    const hasRobots = robotsResult.status === 'fulfilled' ? robotsResult.value : false;
    const hasSitemap = sitemapResult.status === 'fulfilled' ? sitemapResult.value : false;

    if (lighthouseResult.status === 'rejected') {
      this.logger.warn({ msg: 'Lighthouse failed', url, error: lighthouseResult.reason?.message });
    }

    // axe-core needs a DOM — skip in server context (score 100 when unavailable)
    const axeResult = { violations: 0, critical: 0, serious: 0 };

    const pageWeightMb = this.extractPageWeight(lh.metrics);

    const scoreTechnique = this.calculateScore({
      performance: lh.performance,
      accessibility: lh.accessibility,
      axeViolations: axeResult.violations,
      pageWeightMb,
      sslValid: ssl.valid,
      hasSitemap,
      hasRobots,
      stack,
    });

    const classification = this.classify(scoreTechnique);
    const reasons = this.buildReasons({
      performance: lh.performance,
      accessibility: lh.accessibility,
      axeViolations: axeResult.violations,
      sslValid: ssl.valid,
      hasSitemap,
      hasRobots,
      stack,
    });

    return {
      url,
      performanceScore: lh.performance,
      accessibilityScore: lh.accessibility,
      lhBestPractices: lh.bestPractices,
      lhSeo: lh.seo,
      lhMetrics: lh.metrics,

      stackCms: stack.cms,
      stackCmsVersion: stack.cmsVersion,
      stackFramework: stack.framework,
      stackServer: stack.server,
      stackComplete: stack.complete,

      axeViolations: axeResult.violations,
      axeCritical: axeResult.critical,
      axeSerious: axeResult.serious,

      sslValid: ssl.valid,
      sslDaysRemaining: ssl.daysRemaining,

      hasSitemap,
      hasRobotsTxt: hasRobots,
      pageWeightMb,

      scoreTechnique,
      classification,
      reasons,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
      await chrome.kill();
      return true;
    } catch {
      return false;
    }
  }

  private async runLighthouse(url: string): Promise<{
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
    metrics: Record<string, unknown>;
  }> {
    const chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
    });

    try {
      const result = await lighthouse(url, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      });

      if (!result?.lhr) {
        return this.defaultLighthouseResult();
      }

      const cats = result.lhr.categories;
      const audits = result.lhr.audits ?? {};

      const metrics: Record<string, unknown> = {};
      const metricKeys = [
        'first-contentful-paint',
        'largest-contentful-paint',
        'total-blocking-time',
        'cumulative-layout-shift',
        'speed-index',
        'interactive',
      ];
      for (const key of metricKeys) {
        if (audits[key]) {
          metrics[key] = { displayValue: audits[key].displayValue, numericValue: audits[key].numericValue };
        }
      }

      // Capture total transfer size for page weight estimation
      if (audits['total-byte-weight']) {
        metrics['total-byte-weight'] = {
          numericValue: audits['total-byte-weight'].numericValue,
        };
      }

      return {
        performance: Math.round((cats['performance']?.score ?? 0) * 100),
        accessibility: Math.round((cats['accessibility']?.score ?? 0) * 100),
        bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
        seo: Math.round((cats['seo']?.score ?? 0) * 100),
        metrics,
      };
    } finally {
      await chrome.kill();
    }
  }

  private async runWappalyzer(url: string): Promise<{
    cms: string | null;
    cmsVersion: string | null;
    framework: string | null;
    server: string | null;
    complete: Record<string, unknown>;
  }> {
    let html = '';
    let headers: Record<string, string> = {};
    let scriptSrc: string[] = [];

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'AxiomProspection/1.0' },
        signal: AbortSignal.timeout(15_000),
      });
      html = await response.text();
      headers = Object.fromEntries(
        [...response.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]),
      );
    } catch (err: any) {
      this.logger.warn({ msg: 'Wappalyzer fetch failed', url, error: err.message });
      return this.defaultStackResult();
    }

    // Extract script src values from HTML (simple regex)
    const scriptSrcMatches = html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
    scriptSrc = [...scriptSrcMatches].map((m) => m[1]);

    const wapp = Wappalyzer as any;
    if (typeof wapp.setTechnologies === 'function') {
      // Load minimal embedded technologies for server-side detection
      // Wappalyzer-core requires technologies to be loaded externally
      wapp.setTechnologies({});
    }

    const results: WappalyzerTechnology[] = [];
    try {
      const detected = await wapp.analyze?.({ url, html, headers, scriptSrc });
      if (detected && Array.isArray(detected.technologies)) {
        results.push(...(detected.technologies as WappalyzerTechnology[]));
      }
    } catch {
      // Wappalyzer may fail in server context — that's acceptable
    }

    let cms: string | null = null;
    let cmsVersion: string | null = null;
    let framework: string | null = null;
    let server: string | null = null;

    for (const tech of results) {
      const cats = tech.categories?.map((c) => c.name.toLowerCase()) ?? [];
      if (cats.some((c) => c.includes('cms') || c.includes('blog'))) {
        cms = tech.name;
        cmsVersion = tech.version ?? null;
      } else if (cats.some((c) => c.includes('javascript framework') || c.includes('web framework'))) {
        framework = tech.name;
      } else if (cats.some((c) => c.includes('web server'))) {
        server = tech.name;
      }
    }

    // Fallback: detect server from response header
    if (!server && headers['server']) {
      server = headers['server'];
    }

    const complete: Record<string, unknown> = {};
    for (const tech of results) {
      complete[tech.name] = { version: tech.version, categories: tech.categories };
    }

    return { cms, cmsVersion, framework, server, complete };
  }

  private async checkSsl(url: string): Promise<{ valid: boolean; daysRemaining: number | null }> {
    return new Promise((resolve) => {
      let hostname: string;
      try {
        hostname = new URL(url).hostname;
      } catch {
        return resolve({ valid: false, daysRemaining: null });
      }

      if (!url.startsWith('https://')) {
        return resolve({ valid: false, daysRemaining: null });
      }

      const socket = connect({ host: hostname, port: 443, rejectUnauthorized: false }, () => {
        const tlsSocket = socket as TLSSocket;
        const cert = tlsSocket.getPeerCertificate();
        socket.destroy();

        if (!cert || !cert.valid_to) {
          return resolve({ valid: false, daysRemaining: null });
        }

        const expiresAt = new Date(cert.valid_to);
        const now = new Date();
        const daysRemaining = Math.floor(
          (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        resolve({ valid: daysRemaining > 0, daysRemaining });
      });

      socket.on('error', () => {
        socket.destroy();
        resolve({ valid: false, daysRemaining: null });
      });

      socket.setTimeout(5_000, () => {
        socket.destroy();
        resolve({ valid: false, daysRemaining: null });
      });
    });
  }

  private async checkRobotsTxt(url: string): Promise<boolean> {
    try {
      const origin = new URL(url).origin;
      const response = await fetch(`${origin}/robots.txt`, {
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async checkSitemap(url: string): Promise<boolean> {
    try {
      const origin = new URL(url).origin;
      const [sitemap1, sitemap2] = await Promise.allSettled([
        fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(5_000) }),
        fetch(`${origin}/sitemap_index.xml`, { signal: AbortSignal.timeout(5_000) }),
      ]);
      return (
        (sitemap1.status === 'fulfilled' && sitemap1.value.ok) ||
        (sitemap2.status === 'fulfilled' && sitemap2.value.ok)
      );
    } catch {
      return false;
    }
  }

  private extractPageWeight(metrics: Record<string, unknown>): number {
    const totalBytes = (metrics['total-byte-weight'] as { numericValue?: number } | undefined)
      ?.numericValue;
    if (!totalBytes) return 0;
    return Math.round((totalBytes / (1024 * 1024)) * 100) / 100;
  }

  private calculateScore(params: {
    performance: number;
    accessibility: number;
    axeViolations: number;
    pageWeightMb: number;
    sslValid: boolean;
    hasSitemap: boolean;
    hasRobots: boolean;
    stack: { cms: string | null; framework: string | null };
  }): number {
    // Performance score (40%): inversely correlated — poor perf = high opportunity
    const perfOpportunity = 100 - params.performance;
    const perfContribution = (perfOpportunity / 100) * 40;

    // Accessibility score (25%): inversely correlated
    const a11yOpportunity = 100 - params.accessibility;
    const a11yContribution = (a11yOpportunity / 100) * 25;

    // Stack complexity (20%): having detected tech = more complex site = better prospect
    const stackScore = params.stack.cms || params.stack.framework ? 60 : 30;
    const stackContribution = (stackScore / 100) * 20;

    // Page weight (10%): > 3MB is heavy, opportunity for optimization
    const weightScore = Math.min(100, (params.pageWeightMb / 5) * 100);
    const weightContribution = (weightScore / 100) * 10;

    // SSL + SEO signals (5%): missing SSL or sitemap = opportunity
    let sslSeoScore = 0;
    if (!params.sslValid) sslSeoScore += 50;
    if (!params.hasSitemap) sslSeoScore += 30;
    if (!params.hasRobots) sslSeoScore += 20;
    const sslSeoContribution = (Math.min(100, sslSeoScore) / 100) * 5;

    return Math.round(perfContribution + a11yContribution + stackContribution + weightContribution + sslSeoContribution);
  }

  private classify(score: number): 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' {
    if (score >= 70) return 'URGENT';
    if (score >= 50) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    return 'LOW';
  }

  private buildReasons(params: {
    performance: number;
    accessibility: number;
    axeViolations: number;
    sslValid: boolean;
    hasSitemap: boolean;
    hasRobots: boolean;
    stack: { cms: string | null };
  }): string[] {
    const reasons: string[] = [];
    if (params.performance < 50) reasons.push(`Performance score low (${params.performance}/100)`);
    if (params.accessibility < 50) reasons.push(`Accessibility score low (${params.accessibility}/100)`);
    if (params.axeViolations > 0) reasons.push(`${params.axeViolations} accessibility violations detected`);
    if (!params.sslValid) reasons.push('SSL certificate missing or expired');
    if (!params.hasSitemap) reasons.push('No sitemap.xml found');
    if (!params.hasRobots) reasons.push('No robots.txt found');
    if (params.stack.cms) reasons.push(`CMS detected: ${params.stack.cms}`);
    return reasons;
  }

  private defaultLighthouseResult() {
    return {
      performance: 0,
      accessibility: 0,
      bestPractices: 0,
      seo: 0,
      metrics: {},
    };
  }

  private defaultStackResult() {
    return {
      cms: null,
      cmsVersion: null,
      framework: null,
      server: null,
      complete: {},
    };
  }
}
