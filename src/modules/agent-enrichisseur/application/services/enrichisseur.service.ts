import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@core/database/prisma.service';
import { EnrichProspectDto } from '../dtos/enrich-prospect.dto';
import { ProspectNotFoundException } from '@common/exceptions/prospect-not-found.exception';
import { BlacklistedContactException } from '@common/exceptions/blacklisted-contact.exception';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { EmailFinderService, EmailFinderResult } from '../../infrastructure/services/email-finder.service';
import { CompanyEnricherService, CompanyEnrichmentResult } from '../../infrastructure/services/company-enricher.service';
import { TechEnrichmentService } from '../../infrastructure/services/tech-enrichment.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';

const ENRICHMENT_TIMEOUT_MS = 180_000; // 3 minutes global timeout

@Injectable()
export class EnrichisseurService {
  private readonly logger = new Logger(EnrichisseurService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailFinderService: EmailFinderService,
    private readonly companyEnricherService: CompanyEnricherService,
    @InjectQueue(QUEUE_NAMES.SCOREUR_PIPELINE) private readonly scoreurQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
    private readonly agentEventLogger: AgentEventLoggerService,
    private readonly techEnrichmentService: TechEnrichmentService,
  ) {}

  async enrichProspect(dto: EnrichProspectDto): Promise<any> {
    const startTime = Date.now();
    this.logger.log({ msg: 'Starting enrichment', prospectId: dto.prospectId });

    // 1. Load prospect
    const prospect = await this.prisma.prospect.findUnique({ where: { id: dto.prospectId } });
    if (!prospect) throw new ProspectNotFoundException(dto.prospectId);

    // Idempotency guard — skip if recently enriched (< 24h)
    if (prospect.status === 'enriched' && prospect.enrichedAt) {
      const hoursSinceEnrichment = (Date.now() - prospect.enrichedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceEnrichment < 24) {
        this.logger.log({ msg: 'Already enriched recently, skipping', prospectId: dto.prospectId, hoursAgo: Math.round(hoursSinceEnrichment) });
        return prospect;
      }
    }

    // 2. RGPD blacklist check
    const blacklisted = await this.checkRgpdBlacklist(prospect.email, prospect.companySiren);
    if (blacklisted) {
      throw new BlacklistedContactException('RGPD opposition found');
    }

    // 3. Determine which sub-agents to run (conditional activation)
    const needsContact = !prospect.email || !prospect.emailVerified;
    const needsCompany = !prospect.companySiren;
    const needsTech = prospect.source !== 'web_audit' && !!prospect.companyWebsite;

    // 4. Run sub-agents in parallel with global timeout
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Enrichment global timeout (3min)')), ENRICHMENT_TIMEOUT_MS),
    );

    const rawLeadForSegment = await this.prisma.rawLead.findFirst({ where: { prospectId: dto.prospectId } });
    const rawDataForSegment = (rawLeadForSegment?.rawData as Record<string, unknown>) ?? {};
    const segment = (rawDataForSegment.segment as string) ?? 'pme_metro';

    const [contactData, companyData, techData] = await Promise.race([
      Promise.allSettled([
        needsContact ? this.enrichContact(prospect, segment) : Promise.resolve(null),
        needsCompany ? this.enrichCompany(prospect) : Promise.resolve(null),
        needsTech ? this.techEnrichmentService.enrichTechnique(prospect, prospect.source ?? '') : Promise.resolve(null),
      ]),
      timeout.then(() => { throw new Error('timeout'); }),
    ]) as [PromiseSettledResult<EmailFinderResult | null>, PromiseSettledResult<CompanyEnrichmentResult | null>, PromiseSettledResult<any>];

    // 4. Process contact results
    const enrichmentData: Record<string, unknown> = {};
    let emailFound: string | undefined;
    let emailConfidence = 0;

    if (contactData.status === 'fulfilled' && contactData.value) {
      const finder = contactData.value;
      emailFound = finder.email ?? undefined;
      emailConfidence = finder.confidence;
      enrichmentData.contact = {
        email: finder.email,
        confidence: finder.confidence,
        source: finder.source,
        patternsChecked: finder.patternsChecked,
        domain: finder.domain,
      };
    } else {
      // B4 fix: Don't silently skip — log the reason
      enrichmentData.contact = {
        email: null,
        source: contactData.status === 'rejected'
          ? `error: ${(contactData as PromiseRejectedResult).reason?.message}`
          : 'no_contact_info',
      };
    }

    // 5. Process company results
    let companyResult: CompanyEnrichmentResult | null = null;
    if (companyData.status === 'fulfilled' && companyData.value) {
      companyResult = companyData.value;
      enrichmentData.company = {
        siren: companyResult.siren,
        legalName: companyResult.legalName,
        tradeName: companyResult.tradeName,
        nafCode: companyResult.nafCode,
        nafLabel: companyResult.nafLabel,
        legalCategory: companyResult.legalCategory,
        creationDate: companyResult.creationDate,
        address: companyResult.address,
        employeeRange: companyResult.employeeRange,
        isActive: companyResult.isActive,
        legalForm: companyResult.legalForm,
        capital: companyResult.capital,
        directors: companyResult.directors,
        beneficialOwners: companyResult.beneficialOwners,
        financials: companyResult.financials,
        legalNotices: companyResult.legalNotices,
        hasCollectiveProcedure: companyResult.hasCollectiveProcedure,
        sourcesUsed: companyResult.sourcesUsed,
        sourcesUnavailable: companyResult.sourcesUnavailable,
      };
    }

    // B7 fix: Auto-exclusion checks
    if (companyResult?.hasCollectiveProcedure) {
      await this.prisma.prospect.update({
        where: { id: dto.prospectId },
        data: { status: 'excluded', enrichmentData: enrichmentData as any },
      });
      await this.agentEventLogger.log({
        agentName: 'enrichisseur', eventType: 'prospect_excluded',
        prospectId: dto.prospectId, payload: { reason: 'procedure_collective' },
      });
      this.logger.warn({ msg: 'Prospect excluded: procedure collective', prospectId: dto.prospectId });
      return null;
    }

    if (companyResult && companyResult.isActive === false) {
      await this.prisma.prospect.update({
        where: { id: dto.prospectId },
        data: { status: 'excluded', enrichmentData: enrichmentData as any },
      });
      await this.agentEventLogger.log({
        agentName: 'enrichisseur', eventType: 'prospect_excluded',
        prospectId: dto.prospectId, payload: { reason: 'entreprise_fermee' },
      });
      this.logger.warn({ msg: 'Prospect excluded: enterprise closed', prospectId: dto.prospectId });
      return null;
    }

    // 6. Process tech results (sub-agent 2c)
    let techResult: any = null;
    if (techData.status === 'fulfilled' && techData.value) {
      techResult = techData.value;
      enrichmentData.technique = {
        stack: techResult.stack,
        performance: techResult.performance,
        accessibilite: techResult.accessibilite,
        seo: techResult.seo,
        ssl: techResult.ssl,
        problemes_detectes: techResult.problemes_detectes,
      };
    }

    // B1+B2+B3 fix: Propagate signals, segment, and region from RawLead + enrichment
    const rawLead = await this.prisma.rawLead.findFirst({ where: { prospectId: dto.prospectId } });
    const rawData = (rawLead?.rawData as Record<string, unknown>) ?? {};

    // B1: Propagate signals from Agent 1
    const rawSignals = Array.isArray(rawData.signals) ? rawData.signals : [];
    enrichmentData.signals = rawSignals.map((s: any) => ({
      type: String(s.type ?? s.signalType ?? 'unknown'),
      date: s.date ?? s.date_signal ?? s.detectedAt ?? new Date().toISOString(),
      source: String(s.source ?? rawLead?.source ?? 'unknown'),
    }));

    // B2: Propagate segment from Agent 1 or detect from NAF
    enrichmentData.segment = (rawData.segment as string)
      ?? this.detectSegment(companyResult?.nafLabel, prospect.companySize)
      ?? null;

    // B3: Map city → region via code postal
    enrichmentData.region = this.mapToRegion(companyResult?.address);

    // Other flat fields the Scoreur reads
    enrichmentData.industry = companyResult?.nafLabel ?? null;
    enrichmentData.lighthouseScore = techResult?.performance?.score ?? null;
    enrichmentData.websiteTraffic = null;
    enrichmentData.isCompetitor = false;
    enrichmentData.isBankrupt = companyResult?.hasCollectiveProcedure ?? false;

    // Enrichissement metadata
    const enrichmentDurationMs = Date.now() - startTime;
    enrichmentData.enrichissement = {
      status: 'complet',
      date_enrichissement: new Date().toISOString(),
      sous_agents_utilises: [
        needsContact ? '2a_contact' : null,
        needsCompany ? '2b_entreprise' : null,
        needsTech ? '2c_technique' : null,
      ].filter(Boolean),
      duration_ms: enrichmentDurationMs,
      qualite: {
        completude_pct: this.calculateCompletude(prospect, emailFound, companyResult),
        enrichable: !!prospect.companyName && (!!emailFound || !!prospect.phone),
      },
    };

    // B3 fix: Update Prospect columns (not just enrichmentData JSON)
    const updated = await this.prisma.prospect.update({
      where: { id: dto.prospectId },
      data: {
        email: emailFound ?? prospect.email,
        emailVerified: emailConfidence >= 75,
        enrichmentData: enrichmentData as any,
        enrichedAt: new Date(),
        status: 'enriched',
        companyName: companyResult?.legalName ?? prospect.companyName,
        companySiren: companyResult?.siren ?? prospect.companySiren,
        companySize: companyResult?.employeeRange ?? prospect.companySize,
        companyTechStack: techResult?.stack ? techResult.stack as any : prospect.companyTechStack,
      },
    });

    // Dispatch to Scoreur with dynamic priority based on completude
    const completude = (enrichmentData.enrichissement as any)?.qualite?.completude_pct ?? 0;
    await this.scoreurQueue.add(
      'score-prospect',
      { prospectId: dto.prospectId, enrichedAt: new Date().toISOString() },
      {
        priority: completude >= 70 ? 1 : 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    this.eventEmitter.emit('prospect.enriched', {
      prospectId: dto.prospectId,
      emailFound: !!emailFound,
      enrichmentDurationMs,
    });

    await this.agentEventLogger.log({
      agentName: 'enrichisseur',
      eventType: 'prospect_enriched',
      prospectId: dto.prospectId,
      durationMs: enrichmentDurationMs,
      payload: { emailFound: !!emailFound, completude },
    });

    return updated;
  }

  // B4 fix: Allow enrichContact even when firstName/lastName missing
  private async enrichContact(prospect: any, segment?: string): Promise<EmailFinderResult | null> {
    if (!prospect.companyWebsite) {
      this.logger.debug({ msg: 'No company website, cannot find email', prospectId: prospect.id });
      return null;
    }

    let domain: string;
    try {
      domain = new URL(prospect.companyWebsite).hostname.replace('www.', '');
    } catch {
      this.logger.debug({ msg: 'Invalid company website URL', url: prospect.companyWebsite });
      return null;
    }

    if (prospect.firstName && prospect.lastName) {
      return this.emailFinderService.findEmail(
        prospect.firstName,
        prospect.lastName,
        domain,
        prospect.employeeCount ?? undefined,
        segment,
      );
    }

    // No name available — log and return null (Hunter domain search will be added in Phase 1)
    this.logger.debug({ msg: 'No contact name available, email finder skipped', prospectId: prospect.id, domain });
    return null;
  }

  private async enrichCompany(prospect: any): Promise<CompanyEnrichmentResult | null> {
    if (prospect.companySiren) {
      return this.companyEnricherService.enrichBySiren(prospect.companySiren);
    }
    if (prospect.companyName) {
      return this.companyEnricherService.enrichByName(prospect.companyName);
    }
    return null;
  }

  private calculateCompletude(
    prospect: any,
    emailFound: string | undefined,
    companyData: CompanyEnrichmentResult | null,
  ): number {
    let score = 0;
    if (emailFound) score += 20;
    if (prospect.firstName) score += 10;
    if (prospect.lastName) score += 10;
    if (companyData?.siren) score += 15;
    if (companyData?.financials?.length) score += 10;
    if (companyData?.employeeRange) score += 10;
    if (prospect.phone) score += 5;
    if (prospect.companyWebsite) score += 5;
    if (companyData?.directors?.length) score += 10;
    // technique: +5 (will be added when 2c is wired)
    return Math.min(100, score);
  }

  private async checkRgpdBlacklist(email?: string | null, siren?: string | null): Promise<boolean> {
    if (!email && !siren) return false;
    const where: any[] = [];
    if (email) where.push({ email });
    if (siren) where.push({ companySiren: siren });
    const found = await this.prisma.rgpdBlacklist.findFirst({ where: { OR: where } });
    return !!found;
  }

  // B2: Detect segment from NAF label or company size
  private detectSegment(nafLabel?: string | null, companySize?: string | null): string | null {
    if (!nafLabel) return null;
    const naf = nafLabel.toLowerCase();
    if (naf.includes('commerce') || naf.includes('vente')) return 'ecommerce';
    if (naf.includes('administration') || naf.includes('collectivit')) return 'collectivite';
    if (naf.includes('informatique') || naf.includes('logiciel') || naf.includes('programmation')) {
      // Check size for startup vs PME
      if (companySize && (companySize.includes('1-') || companySize.includes('0 '))) return 'startup';
      return 'pme_metro';
    }
    return 'pme_metro';
  }

  // B3: Map address to region name via code postal
  private mapToRegion(address?: { postalCode?: string; city?: string } | null): string | null {
    if (!address?.postalCode) return address?.city ?? null;
    const cp = address.postalCode;
    const dept = cp.startsWith('97') ? cp.slice(0, 3) : cp.slice(0, 2);

    const DEPT_REGION: Record<string, string> = {
      '75': 'ile-de-france', '92': 'ile-de-france', '93': 'ile-de-france', '94': 'ile-de-france',
      '91': 'ile-de-france', '77': 'ile-de-france', '78': 'ile-de-france', '95': 'ile-de-france',
      '13': 'provence', '83': 'provence', '84': 'provence', '06': 'provence',
      '69': 'auvergne', '63': 'auvergne', '42': 'auvergne', '43': 'auvergne',
      '31': 'occitanie', '34': 'occitanie', '30': 'occitanie', '66': 'occitanie',
      '33': 'nouvelle-aquitaine', '64': 'nouvelle-aquitaine', '40': 'nouvelle-aquitaine',
      '974': 'reunion', '976': 'mayotte', '971': 'guadeloupe', '972': 'martinique', '973': 'guyane',
    };
    return DEPT_REGION[dept] ?? null;
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
