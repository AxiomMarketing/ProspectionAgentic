import * as crypto from 'crypto';
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@core/database/prisma.service';
import { ICustomerRepository } from '../../domain/repositories/i-customer.repository';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { Customer } from '../../domain/entities/customer.entity';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import {
  vipInvitationEmail,
  reminderEmail,
} from '../../infrastructure/emails/referral-templates';

const COMMISSION_TIERS: Record<string, number> = {
  tier_1: 0.2,
  tier_2: 0.15,
  tier_3: 0.1,
};

const COMMISSION_LIMITS = {
  per_referral: 5000,
  monthly: 10000,
  annual: 50000,
};

const DAILY_REFERRAL_LIMIT = 3;

export interface ReferralLeadData {
  prenom: string;
  nom: string;
  email: string;
  entreprise: string;
  besoin: string;
  telephone?: string;
}

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerRepository: ICustomerRepository,
    private readonly emailAdapter: IEmailAdapter,
    private readonly eventEmitter: EventEmitter2,
    private readonly agentEventLogger: AgentEventLoggerService,
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_NAMES.VEILLEUR_REFERRAL_LEADS) private readonly veilleurQueue: Queue,
  ) {}

  async identifyAmbassadorCandidates(): Promise<Customer[]> {
    const referralMinHealth = this.configService.get<number>('csm.referralMinHealth', 80);
    const referralMinNps = this.configService.get<number>('csm.referralMinNps', 9);
    const referralMinDays = this.configService.get<number>('csm.referralMinDays', 60);

    const minStartDate = new Date(Date.now() - referralMinDays * 24 * 60 * 60 * 1000);

    // Query active customers with no existing program, joined >= N days ago
    const candidates = await this.prisma.customer.findMany({
      where: {
        status: 'active',
        contractStartDate: { lte: minStartDate },
        referralProgram: null,
      },
      include: {
        healthScores: {
          where: { isLatest: true },
          take: 1,
        },
        npsSurveys: {
          where: { type: 'nps', status: 'responded' },
          orderBy: { respondedAt: 'desc' },
          take: 1,
        },
      },
    });

    const eligible = candidates.filter((c) => {
      const latestHealth = c.healthScores[0];
      const latestNps = c.npsSurveys[0];
      return (
        latestHealth &&
        latestHealth.healthScore >= referralMinHealth &&
        latestNps &&
        latestNps.score !== null &&
        latestNps.score >= referralMinNps
      );
    });

    return eligible.map((c) => Customer.reconstitute({
      id: c.id,
      companyName: c.companyName,
      siren: c.siren ?? undefined,
      primaryContactId: c.primaryContactId ?? undefined,
      contractStartDate: c.contractStartDate ?? undefined,
      mrrEur: c.mrrEur,
      plan: c.plan ?? undefined,
      status: c.status as any,
      churnedAt: c.churnedAt ?? undefined,
      churnReason: c.churnReason ?? undefined,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      typeProjet: c.typeProjet ?? undefined,
      tier: c.tier ?? undefined,
      scopeDetaille: (c.scopeDetaille as string[] | null) ?? undefined,
      conditionsPaiement: c.conditionsPaiement ?? undefined,
      notesVente: c.notesVente ?? undefined,
      dealCycleDays: c.dealCycleDays ?? undefined,
      engagementScoreFinal: c.engagementScoreFinal ?? undefined,
    }));
  }

  async inviteToProgram(customerId: string): Promise<void> {
    const customer = await this.customerRepository.findById(customerId);
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

    const referralMinHealth = this.configService.get<number>('csm.referralMinHealth', 80);
    const referralMinNps = this.configService.get<number>('csm.referralMinNps', 9);
    const referralMinDays = this.configService.get<number>('csm.referralMinDays', 60);

    // Verify eligibility
    const existing = await this.prisma.referralProgram.findUnique({ where: { customerId } });
    if (existing) {
      throw new BadRequestException(`Customer ${customerId} already has a referral program`);
    }

    const daysSinceStart = customer.contractStartDate
      ? Math.floor((Date.now() - customer.contractStartDate.getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    if (daysSinceStart < referralMinDays) {
      throw new BadRequestException(`Customer must be active for at least ${referralMinDays} days`);
    }

    const latestHealth = await this.prisma.customerHealthScore.findFirst({
      where: { customerId, isLatest: true },
    });
    if (!latestHealth || latestHealth.healthScore < referralMinHealth) {
      throw new BadRequestException(`Customer health score below minimum threshold`);
    }

    const latestNps = await this.prisma.npsSurvey.findFirst({
      where: { customerId, type: 'nps', status: 'responded' },
      orderBy: { respondedAt: 'desc' },
    });
    if (!latestNps || latestNps.score === null || latestNps.score < referralMinNps) {
      throw new BadRequestException(`Customer NPS score below minimum threshold`);
    }

    // Determine commission tier based on deal ACV
    const deal = await this.prisma.dealCrm.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    const acv = deal?.amountEur ?? 0;
    let commissionTier: string;
    if (acv < 15000) commissionTier = 'tier_1';
    else if (acv <= 40000) commissionTier = 'tier_2';
    else commissionTier = 'tier_3';

    const referralCode = this.generateReferralCode(customer.companyName);

    const program = await this.prisma.referralProgram.create({
      data: {
        customerId,
        dealId: deal?.id,
        status: 'invited',
        referralCode,
        commissionTier,
      },
    });

    // Send VIP invitation email
    await this.sendInvitationEmail(customer, referralCode, commissionTier);

    this.eventEmitter.emit('referral.invited', { customerId, programId: program.id, referralCode });

    await this.agentEventLogger.log({
      agentName: 'csm',
      eventType: 'referral_invited',
      payload: { customerId, programId: program.id, referralCode, commissionTier },
    });

    this.logger.log({ msg: 'Referral invitation sent', customerId, referralCode, commissionTier });
  }

  generateReferralCode(customerName: string): string {
    const words = customerName.trim().split(/\s+/);
    const abbr = words
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 3);
    const randomHex = crypto.randomBytes(8).toString('hex').toUpperCase();
    return `AXIOM-${abbr}-${randomHex}`;
  }

  async submitReferral(referralCode: string, leadData: ReferralLeadData): Promise<void> {
    const program = await this.prisma.referralProgram.findUnique({
      where: { referralCode },
    });
    if (!program) throw new NotFoundException(`Referral code ${referralCode} not found`);
    if (program.status !== 'active') {
      throw new BadRequestException(`Referral program is not active (status: ${program.status})`);
    }

    // Check daily limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = await this.prisma.referralLead.count({
      where: { referralProgramId: program.id, submittedAt: { gte: todayStart } },
    });
    if (todayCount >= DAILY_REFERRAL_LIMIT) {
      throw new BadRequestException(`Daily referral limit of ${DAILY_REFERRAL_LIMIT} reached`);
    }

    // Deduplication check
    const duplicate = await this.prisma.referralLead.findFirst({
      where: { email: leadData.email },
    });
    if (duplicate) {
      throw new BadRequestException(`Lead with email ${leadData.email} already exists`);
    }

    const lead = await this.prisma.referralLead.create({
      data: {
        referralProgramId: program.id,
        referralCode,
        prenom: leadData.prenom,
        nom: leadData.nom,
        email: leadData.email,
        entreprise: leadData.entreprise,
        besoin: leadData.besoin,
        telephone: leadData.telephone,
        status: 'submitted',
      },
    });

    await this.prisma.referralProgram.update({
      where: { id: program.id },
      data: {
        totalReferralsSubmitted: { increment: 1 },
        lastReferralAt: new Date(),
      },
    });

    // Dispatch to Agent 1 (Veilleur)
    await this.veilleurQueue.add(
      'referral-lead',
      {
        type: 'referral_lead',
        referral_id: lead.id,
        referred_by: { client_id: program.customerId, referral_code: referralCode },
        lead: { ...leadData, source: 'referral' },
        priority_boost: 40,
        metadata: {
          agent: 'agent_10_csm',
          created_at: new Date().toISOString(),
          version: '1.0',
        },
      },
      { priority: 1 },
    );

    // Notify ambassador
    await this.sendReferralReceivedEmail(program.customerId, leadData.prenom);

    this.eventEmitter.emit('referral.submitted', {
      leadId: lead.id,
      customerId: program.customerId,
      referralCode,
    });

    await this.agentEventLogger.log({
      agentName: 'csm',
      eventType: 'referral_submitted',
      payload: { leadId: lead.id, customerId: program.customerId, referralCode },
    });

    this.logger.log({ msg: 'Referral submitted', leadId: lead.id, referralCode });
  }

  async processReferralConversion(referralLeadId: string, dealValue: number): Promise<void> {
    const lead = await this.prisma.referralLead.findUnique({
      where: { id: referralLeadId },
      include: { referralProgram: true },
    });
    if (!lead) throw new NotFoundException(`Referral lead ${referralLeadId} not found`);

    const program = lead.referralProgram;
    const commissionRate = COMMISSION_TIERS[program.commissionTier] ?? COMMISSION_TIERS.tier_1;
    const commissionAmount = dealValue * commissionRate;

    const valid = await this.validateCommission(program.id, commissionAmount);
    const finalCommission = valid ? commissionAmount : 0;

    await this.prisma.referralLead.update({
      where: { id: referralLeadId },
      data: {
        status: 'won',
        convertedAt: new Date(),
        dealValue,
        commissionRate,
        commissionAmount: finalCommission,
      },
    });

    await this.prisma.referralProgram.update({
      where: { id: program.id },
      data: {
        totalCommissionEarned: { increment: finalCommission },
        totalReferralsConverted: { increment: 1 },
      },
    });

    // Notify ambassador
    await this.sendConversionEmail(program.customerId, dealValue, finalCommission, commissionRate);

    this.eventEmitter.emit('referral.converted', {
      leadId: referralLeadId,
      customerId: program.customerId,
      dealValue,
      commissionAmount: finalCommission,
    });

    await this.agentEventLogger.log({
      agentName: 'csm',
      eventType: 'referral_converted',
      payload: { leadId: referralLeadId, customerId: program.customerId, dealValue, commissionAmount: finalCommission },
    });

    this.logger.log({ msg: 'Referral converted', leadId: referralLeadId, commissionAmount: finalCommission });
  }

  async validateCommission(programId: string, amount: number): Promise<boolean> {
    if (amount > COMMISSION_LIMITS.per_referral) return false;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const yearStart = new Date();
    yearStart.setMonth(0, 1);
    yearStart.setHours(0, 0, 0, 0);

    const [monthlyLeads, annualLeads] = await Promise.all([
      this.prisma.referralLead.findMany({
        where: { referralProgramId: programId, status: 'won', convertedAt: { gte: monthStart } },
        select: { commissionAmount: true },
      }),
      this.prisma.referralLead.findMany({
        where: { referralProgramId: programId, status: 'won', convertedAt: { gte: yearStart } },
        select: { commissionAmount: true },
      }),
    ]);

    const monthlyTotal = monthlyLeads.reduce((sum, l) => sum + (l.commissionAmount ?? 0), 0);
    if (monthlyTotal + amount > COMMISSION_LIMITS.monthly) return false;

    const annualTotal = annualLeads.reduce((sum, l) => sum + (l.commissionAmount ?? 0), 0);
    if (annualTotal + amount > COMMISSION_LIMITS.annual) return false;

    return true;
  }

  private async sendInvitationEmail(
    customer: Customer,
    referralCode: string,
    commissionTier: string,
  ): Promise<void> {
    if (!customer.primaryContactId) return;

    const prospect = await this.prisma.prospect.findUnique({
      where: { id: customer.primaryContactId },
      select: { firstName: true, email: true },
    });
    if (!prospect?.email) return;

    const baseUrl = this.configService.get<string>('APP_URL', 'https://axiom-marketing.fr');
    const referralLink = `${baseUrl}/referral/${referralCode}`;
    const commissionPct = COMMISSION_TIERS[commissionTier] ?? COMMISSION_TIERS.tier_1;
    const senderEmail = this.configService.get<string>('GMAIL_USER', 'no-reply@axiom-marketing.fr');

    const template = vipInvitationEmail({
      prenom: prospect.firstName ?? 'Client',
      referralCode,
      commissionPct,
      referralLink,
    });

    try {
      await this.emailAdapter.sendEmail({
        from: senderEmail,
        to: [prospect.email],
        subject: template.subject,
        htmlBody: template.htmlBody,
        tags: ['csm', 'referral', 'invitation'],
      });
    } catch (error) {
      this.logger.warn({ msg: 'Failed to send referral invitation email', error: (error as Error).message });
    }
  }

  private async sendReferralReceivedEmail(customerId: string, leadPrenom: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { primaryContactId: true },
    });
    if (!customer?.primaryContactId) return;

    const prospect = await this.prisma.prospect.findUnique({
      where: { id: customer.primaryContactId },
      select: { firstName: true, email: true },
    });
    if (!prospect?.email) return;

    const senderEmail = this.configService.get<string>('GMAIL_USER', 'no-reply@axiom-marketing.fr');

    try {
      await this.emailAdapter.sendEmail({
        from: senderEmail,
        to: [prospect.email],
        subject: `Merci ! Votre recommandation pour ${leadPrenom} a bien été reçue`,
        htmlBody: `<p>Bonjour ${prospect.firstName ?? 'Client'},</p><p>Nous avons bien reçu votre recommandation pour <strong>${leadPrenom}</strong>. Notre équipe prendra contact dans les plus brefs délais.</p><p>Merci pour votre confiance !<br><strong>L'équipe Axiom Marketing</strong></p>`,
        tags: ['csm', 'referral', 'confirmation'],
      });
    } catch (error) {
      this.logger.warn({ msg: 'Failed to send referral received email', error: (error as Error).message });
    }
  }

  private async sendConversionEmail(
    customerId: string,
    dealValue: number,
    commissionAmount: number,
    commissionRate: number,
  ): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { primaryContactId: true },
    });
    if (!customer?.primaryContactId) return;

    const prospect = await this.prisma.prospect.findUnique({
      where: { id: customer.primaryContactId },
      select: { firstName: true, email: true },
    });
    if (!prospect?.email) return;

    const senderEmail = this.configService.get<string>('GMAIL_USER', 'no-reply@axiom-marketing.fr');
    const commissionPct = Math.round(commissionRate * 100);

    try {
      await this.emailAdapter.sendEmail({
        from: senderEmail,
        to: [prospect.email],
        subject: `Félicitations ! Votre commission de ${commissionAmount} EUR est validée`,
        htmlBody: `
<p>Bonjour ${prospect.firstName ?? 'Client'},</p>
<p>Excellente nouvelle ! La mission que vous avez recommandée vient d'être signée pour un montant de <strong>${dealValue} EUR HT</strong>.</p>
<p>Conformément à votre taux de commission de ${commissionPct}%, vous avez gagné <strong>${commissionAmount} EUR</strong>.</p>
<p>Notre équipe finance vous contactera pour les modalités de versement.</p>
<p>Merci pour cette belle recommandation !<br><strong>L'équipe Axiom Marketing</strong></p>`,
        tags: ['csm', 'referral', 'conversion'],
      });
    } catch (error) {
      this.logger.warn({ msg: 'Failed to send conversion email', error: (error as Error).message });
    }
  }

  // Expose reminder email for scheduler use
  async sendReminderEmail(customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { primaryContactId: true, referralProgram: true },
    });
    if (!customer?.primaryContactId || !customer.referralProgram) return;

    const prospect = await this.prisma.prospect.findUnique({
      where: { id: customer.primaryContactId },
      select: { firstName: true, email: true },
    });
    if (!prospect?.email) return;

    const baseUrl = this.configService.get<string>('APP_URL', 'https://axiom-marketing.fr');
    const referralLink = `${baseUrl}/referral/${customer.referralProgram.referralCode}`;
    const senderEmail = this.configService.get<string>('GMAIL_USER', 'no-reply@axiom-marketing.fr');

    const template = reminderEmail({
      prenom: prospect.firstName ?? 'Client',
      referralLink,
    });

    try {
      await this.emailAdapter.sendEmail({
        from: senderEmail,
        to: [prospect.email],
        subject: template.subject,
        htmlBody: template.htmlBody,
        tags: ['csm', 'referral', 'reminder'],
      });
    } catch (error) {
      this.logger.warn({ msg: 'Failed to send referral reminder email', error: (error as Error).message });
    }
  }
}
