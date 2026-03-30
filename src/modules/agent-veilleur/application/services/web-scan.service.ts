import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { WebScannerAdapter } from '../../infrastructure/adapters/web-scanner.adapter';

export interface ScanBatchOptions {
  batchSize: number;
  minScore: number;
}

@Injectable()
export class WebScanService {
  private readonly logger = new Logger(WebScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentEventLogger: AgentEventLoggerService,
    private readonly webScanner: WebScannerAdapter,
    @InjectQueue(QUEUE_NAMES.ENRICHISSEUR_PIPELINE) private readonly enrichisseurQueue: Queue,
  ) {}

  async scanBatch(options: ScanBatchOptions): Promise<void> {
    const { batchSize, minScore } = options;
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    await this.agentEventLogger.log({
      agentName: 'veilleur-web',
      eventType: 'scan_batch_started',
      payload: { batchSize, minScore },
    });

    const sites = await this.prisma.siteAScanner.findMany({
      where: {
        active: true,
        OR: [{ lastScannedAt: null }, { lastScannedAt: { lt: cutoff } }],
      },
      orderBy: { priority: 'asc' },
      take: batchSize,
    });

    this.logger.log({ msg: 'Web scan batch loaded', count: sites.length, batchSize, minScore });

    if (sites.length === 0) {
      await this.agentEventLogger.log({
        agentName: 'veilleur-web',
        eventType: 'scan_batch_complete',
        payload: { scanned: 0, leads: 0 },
      });
      return;
    }

    // Process max 5 concurrently
    const concurrency = 5;
    let scanned = 0;
    let leads = 0;

    for (let i = 0; i < sites.length; i += concurrency) {
      const batch = sites.slice(i, i + concurrency);

      const results = await Promise.allSettled(
        batch.map(async (site) => {
          try {
            const result = await this.webScanner.scanSite(site.url);

            // Save audit result
            await this.prisma.auditTechnique.create({
              data: {
                url: site.url,
                entrepriseNom: site.entrepriseNom ?? null,
                lhPerformance: result.performanceScore,
                lhAccessibility: result.accessibilityScore,
                lhBestPractices: result.lhBestPractices,
                lhSeo: result.lhSeo,
                lhMetrics: result.lhMetrics as import('@prisma/client').Prisma.InputJsonValue,
                stackCms: result.stackCms ?? null,
                stackCmsVersion: result.stackCmsVersion ?? null,
                stackFramework: result.stackFramework ?? null,
                stackServer: result.stackServer ?? null,
                stackComplete: result.stackComplete as import('@prisma/client').Prisma.InputJsonValue,
                axeViolations: result.axeViolations,
                axeCritical: result.axeCritical,
                axeSerious: result.axeSerious,
                sslValid: result.sslValid,
                sslDaysRemaining: result.sslDaysRemaining ?? null,
                hasSitemap: result.hasSitemap,
                hasRobotsTxt: result.hasRobotsTxt,
                pageWeightMb: result.pageWeightMb,
                scoreTechnique: result.scoreTechnique,
                classification: result.classification,
                reasons: result.reasons,
              },
            });

            // Update scanner record
            await this.prisma.siteAScanner.update({
              where: { id: site.id },
              data: {
                lastScannedAt: new Date(),
                scanCount: { increment: 1 },
              },
            });

            scanned++;

            // Create lead if above threshold
            if (result.scoreTechnique >= minScore) {
              const rawLead = await this.prisma.rawLead.create({
                data: {
                  source: 'web_audit',
                  sourceId: site.url,
                  sourceUrl: site.url,
                  rawData: {
                    url: site.url,
                    entrepriseNom: site.entrepriseNom,
                    scoreTechnique: result.scoreTechnique,
                    classification: result.classification,
                    reasons: result.reasons,
                  } as import('@prisma/client').Prisma.InputJsonValue,
                  processed: false,
                },
              });

              await this.enrichisseurQueue.add(
                'enrich-lead',
                {
                  leadId: rawLead.id,
                  source: 'web_audit',
                  preScore: result.scoreTechnique,
                  highPriority: result.scoreTechnique >= 70,
                  dispatchedAt: new Date().toISOString(),
                },
                {
                  priority: result.scoreTechnique >= 70 ? 1 : 5,
                  attempts: 3,
                  backoff: { type: 'exponential', delay: 5000 },
                },
              );

              leads++;

              await this.agentEventLogger.log({
                agentName: 'veilleur-web',
                eventType: 'lead_created',
                payload: {
                  url: site.url,
                  scoreTechnique: result.scoreTechnique,
                  classification: result.classification,
                  leadId: rawLead.id,
                },
              });
            }

            await this.agentEventLogger.log({
              agentName: 'veilleur-web',
              eventType: 'site_scanned',
              payload: {
                url: site.url,
                scoreTechnique: result.scoreTechnique,
                classification: result.classification,
              },
            });
          } catch (error: any) {
            this.logger.error({
              msg: 'Site scan failed',
              url: site.url,
              error: error.message,
            });
            await this.agentEventLogger.log({
              agentName: 'veilleur-web',
              eventType: 'site_scan_error',
              errorMessage: error.message,
              payload: { url: site.url },
            });
          }
        }),
      );

      this.logger.log({
        msg: 'Batch chunk processed',
        chunk: Math.floor(i / concurrency) + 1,
        succeeded: results.filter((r) => r.status === 'fulfilled').length,
        failed: results.filter((r) => r.status === 'rejected').length,
      });
    }

    this.logger.log({ msg: 'Web scan batch complete', scanned, leads });

    await this.agentEventLogger.log({
      agentName: 'veilleur-web',
      eventType: 'scan_batch_complete',
      payload: { scanned, leads },
    });
  }
}
