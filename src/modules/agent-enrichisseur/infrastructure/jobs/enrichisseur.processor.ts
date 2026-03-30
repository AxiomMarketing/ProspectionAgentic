import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EnrichisseurService } from '../../application/services/enrichisseur.service';
import { PrismaService } from '@core/database/prisma.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Processor(QUEUE_NAMES.ENRICHISSEUR_PIPELINE)
export class EnrichisseurProcessor extends WorkerHost {
  private readonly logger = new Logger(EnrichisseurProcessor.name);

  constructor(
    private readonly enrichisseurService: EnrichisseurService,
    private readonly prisma: PrismaService,
    private readonly agentEventLogger: AgentEventLoggerService,
  ) {
    super();
  }

  async process(job: Job<{ leadId: string; source: string; preScore: number }>): Promise<void> {
    this.logger.log({ msg: 'Processing enrichment job', jobId: job.id, leadId: job.data.leadId });

    // 1. Load the RawLead
    const rawLead = await this.prisma.rawLead.findUnique({ where: { id: job.data.leadId } });
    if (!rawLead) {
      this.logger.warn({ msg: 'RawLead not found, skipping', leadId: job.data.leadId });
      return;
    }

    // 2. Extract company info from rawData — multi-source support
    const rawData = (rawLead.rawData as Record<string, unknown>) ?? {};
    const companyName = (rawData.companyName as string)
      ?? (rawData.entrepriseNom as string)
      ?? (rawData.nomacheteur as string)
      ?? (rawData.objet as string)
      ?? 'Inconnu';
    const companySiren = (rawData.companySiren as string)
      ?? (rawData.siret as string)
      ?? this.extractSiren(rawData);
    const companyWebsite = (rawData.companyWebsite as string)
      ?? (rawData.url as string)
      ?? (rawData.url_avis as string)
      ?? null;
    const firstName = (rawData.firstName as string)
      ?? ((rawData.contactName as string)?.split(' ')[0])
      ?? null;
    const lastName = (rawData.lastName as string)
      ?? ((rawData.contactName as string)?.split(' ').slice(1).join(' '))
      ?? null;
    const linkedinUrl = (rawData.companyLinkedinUrl as string)
      ?? (rawData.linkedinUrl as string)
      ?? null;

    // 3. Deduplication: find existing Prospect by SIRET → email → domain
    let prospect = rawLead.prospectId
      ? await this.prisma.prospect.findUnique({ where: { id: rawLead.prospectId } })
      : null;

    if (!prospect && companySiren) {
      prospect = await this.prisma.prospect.findFirst({ where: { companySiren } });
      if (prospect) this.logger.log({ msg: 'Dedup match by SIREN', prospectId: prospect.id, companySiren });
    }

    if (!prospect && companyWebsite) {
      try {
        const domain = new URL(companyWebsite).hostname.replace('www.', '');
        prospect = await this.prisma.prospect.findFirst({
          where: { companyWebsite: { contains: domain } },
        });
        if (prospect) this.logger.log({ msg: 'Dedup match by domain', prospectId: prospect.id, domain });
      } catch { /* invalid URL */ }
    }

    // B03: Merge signals when prospect already exists
    if (prospect) {
      const existingSignals = (prospect.enrichmentData as any)?.signals ?? [];
      const newSignals = (rawLead.rawData as any)?.signals ?? [];
      const mergedSignals = [...existingSignals];
      for (const signal of newSignals) {
        if (!mergedSignals.some((s: any) => s.type === signal.type && s.source === signal.source)) {
          mergedSignals.push(signal);
        }
      }
      await this.prisma.prospect.update({
        where: { id: prospect.id },
        data: {
          enrichmentData: {
            ...(prospect.enrichmentData as any),
            signals: mergedSignals,
            nb_detections: ((prospect.enrichmentData as any)?.nb_detections ?? 1) + 1,
            lastDetectedAt: new Date().toISOString(),
          },
        },
      });
      // Refresh local prospect object with updated enrichmentData
      prospect = await this.prisma.prospect.findUnique({ where: { id: prospect.id } });
    }

    if (!prospect) {
      prospect = await this.prisma.prospect.create({
        data: {
          companyName,
          companySiren,
          companyWebsite,
          firstName,
          lastName,
          linkedinUrl,
          source: job.data.source,
          status: 'raw',
        },
      });

      // Link the RawLead to the new Prospect
      await this.prisma.rawLead.update({
        where: { id: rawLead.id },
        data: { prospectId: prospect.id, processed: true, processedAt: new Date() },
      });

      this.logger.log({ msg: 'Prospect created from RawLead', prospectId: prospect.id, leadId: rawLead.id });

      await this.agentEventLogger.log({
        agentName: 'enrichisseur',
        eventType: 'prospect_created',
        prospectId: prospect.id,
        payload: { leadId: rawLead.id, companyName, source: job.data.source },
      });
    }

    // 4. Now enrich the Prospect
    try {
      await this.enrichisseurService.enrichProspect({ prospectId: prospect.id });
    } catch (error) {
      this.logger.error({
        msg: 'Enrichment failed',
        prospectId: prospect.id,
        error: (error as Error).message,
      });

      await this.agentEventLogger.log({
        agentName: 'enrichisseur',
        eventType: 'enrichment_error',
        prospectId: prospect.id,
        errorMessage: (error as Error).message,
      });

      // Re-throw to let BullMQ retry the job
      throw error;
    }
  }

  private extractSiren(rawData: Record<string, unknown>): string | null {
    // Try to extract SIREN from gestion JSON string
    const gestion = rawData.gestion as string | undefined;
    if (gestion) {
      try {
        const parsed = JSON.parse(gestion);
        const orgName = parsed?.INDEXATION?.NOMORGANISME;
        // SIREN might be in REFERENCE or elsewhere
        return null; // SIREN extraction from BOAMP is complex, leave for enrichment
      } catch {
        return null;
      }
    }
    return null;
  }
}
