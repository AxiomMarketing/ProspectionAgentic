import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@core/database/prisma.service';
import { EnrichProspectDto } from '../dtos/enrich-prospect.dto';
import { EmailPatternService } from './email-pattern.service';
import { ProspectNotFoundException } from '@common/exceptions/prospect-not-found.exception';
import { BlacklistedContactException } from '@common/exceptions/blacklisted-contact.exception';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Injectable()
export class EnrichisseurService {
  private readonly logger = new Logger(EnrichisseurService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailPatternService: EmailPatternService,
    @InjectQueue(QUEUE_NAMES.SCOREUR_PIPELINE) private readonly scoreurQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async enrichProspect(dto: EnrichProspectDto): Promise<any> {
    const startTime = Date.now();
    this.logger.log({ msg: 'Starting enrichment', prospectId: dto.prospectId });

    const prospect = await this.prisma.prospect.findUnique({ where: { id: dto.prospectId } });
    if (!prospect) throw new ProspectNotFoundException(dto.prospectId);

    const blacklisted = await this.checkRgpdBlacklist(prospect.email, prospect.companySiren);
    if (blacklisted) {
      throw new BlacklistedContactException('RGPD opposition found');
    }

    const [contactData, companyData] = await Promise.allSettled([
      this.enrichContact(prospect),
      this.enrichCompany(prospect),
    ]);

    const enrichmentData: Record<string, unknown> = {};
    let emailFound: string | undefined;
    let emailConfidence = 0;

    if (contactData.status === 'fulfilled' && contactData.value) {
      Object.assign(enrichmentData, { contact: contactData.value });
      emailFound = contactData.value.email;
      emailConfidence = contactData.value.confidence;
    }

    if (companyData.status === 'fulfilled' && companyData.value) {
      Object.assign(enrichmentData, { company: companyData.value });
    }

    const enrichmentDurationMs = Date.now() - startTime;
    const updated = await this.prisma.prospect.update({
      where: { id: dto.prospectId },
      data: {
        email: emailFound ?? prospect.email,
        emailVerified: emailConfidence >= 0.75,
        enrichmentData: enrichmentData as any,
        enrichedAt: new Date(),
        status: 'enriched',
        companyName:
          (companyData.status === 'fulfilled' ? companyData.value?.legalName : null) ??
          prospect.companyName,
      },
    });

    await this.scoreurQueue.add(
      'score-prospect',
      {
        prospectId: dto.prospectId,
        enrichedAt: new Date().toISOString(),
      },
      {
        priority: 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    this.eventEmitter.emit('prospect.enriched', {
      prospectId: dto.prospectId,
      emailFound: !!emailFound,
      enrichmentDurationMs,
    });

    this.logger.log({
      msg: 'Enrichment complete',
      prospectId: dto.prospectId,
      emailFound: !!emailFound,
      durationMs: enrichmentDurationMs,
    });
    return updated;
  }

  private async enrichContact(
    prospect: any,
  ): Promise<{ email?: string; confidence: number; source: string } | null> {
    if (prospect.firstName && prospect.lastName && prospect.companyWebsite) {
      try {
        const domain = new URL(prospect.companyWebsite).hostname.replace('www.', '');
        const candidates = this.emailPatternService.generateCandidates(
          prospect.firstName,
          prospect.lastName,
          domain,
        );
        // TODO: Implement SMTP validation (MX lookup + RCPT TO)
        return { email: candidates[0], confidence: 0.3, source: 'pattern_match' };
      } catch {
        // invalid URL, skip
      }
    }
    return null;
  }

  private async enrichCompany(
    prospect: any,
  ): Promise<{ legalName?: string; siret?: string; naf?: string; effectif?: string } | null> {
    // TODO: Implement real INSEE SIRENE API call
    if (prospect.companySiren) {
      return {
        legalName: prospect.companyName ?? undefined,
        siret: prospect.companySiren,
        naf: undefined,
        effectif: prospect.companySize ?? undefined,
      };
    }
    return null;
  }

  private async checkRgpdBlacklist(email?: string | null, siren?: string | null): Promise<boolean> {
    if (!email && !siren) return false;
    const where: any[] = [];
    if (email) where.push({ email });
    if (siren) where.push({ companySiren: siren });
    const found = await this.prisma.rgpdBlacklist.findFirst({ where: { OR: where } });
    return !!found;
  }

  async getEnrichmentStatus(prospectId: string): Promise<{ status: string; enrichedAt?: Date }> {
    const prospect = await this.prisma.prospect.findUnique({
      where: { id: prospectId },
      select: { status: true, enrichedAt: true },
    });
    if (!prospect) throw new ProspectNotFoundException(prospectId);
    return { status: prospect.status, enrichedAt: prospect.enrichedAt ?? undefined };
  }
}
