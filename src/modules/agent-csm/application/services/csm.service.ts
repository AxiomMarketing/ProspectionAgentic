import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@core/database/prisma.service';
import { ICustomerRepository } from '../../domain/repositories/i-customer.repository';
import { Customer } from '../../domain/entities/customer.entity';
import { DealToCSMDto } from '../dtos/deal-to-csm.dto';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { OnboardingService } from './onboarding.service';
import { SatisfactionService } from './satisfaction.service';
import { UpsellService } from './upsell.service';
import { ReviewService } from './review.service';
import { ReferralService } from './referral.service';
import { ReferralLeadData } from './referral.service';

@Injectable()
export class CsmService {
  private readonly logger = new Logger(CsmService.name);

  constructor(
    private readonly customerRepository: ICustomerRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly agentEventLogger: AgentEventLoggerService,
    private readonly onboardingService: OnboardingService,
    private readonly satisfactionService: SatisfactionService,
    private readonly upsellService: UpsellService,
    private readonly reviewService: ReviewService,
    private readonly referralService: ReferralService,
    private readonly prisma: PrismaService,
  ) {}

  async onboardCustomer(dto: DealToCSMDto): Promise<Customer> {
    this.logger.log({ msg: 'Onboarding customer', companyName: dto.entreprise.nom });

    const customer = Customer.create({
      companyName: dto.entreprise.nom,
      siren: dto.entreprise.siret,
      primaryContactId: dto.prospect_id,
      contractStartDate: new Date(dto.contrat.date_demarrage_prevue),
      mrrEur: dto.contrat.montant_ht,
      plan: dto.contrat.tier,
      typeProjet: dto.contrat.type_projet,
      tier: dto.contrat.tier,
      scopeDetaille: dto.contrat.scope_detaille,
      conditionsPaiement: dto.contrat.conditions_paiement,
      notesVente: dto.notes_vente,
      dealCycleDays: dto.metadata.deal_cycle_days,
      engagementScoreFinal: dto.metadata.engagement_score_final,
    });

    // Override status to 'onboarding' — Customer.create sets 'active' by default
    const customerWithOnboarding = Customer.reconstitute({
      ...customer.toPlainObject(),
      status: 'onboarding',
    });

    const saved = await this.customerRepository.save(customerWithOnboarding);

    this.eventEmitter.emit('customer.onboarded', { customerId: saved.id, dealId: dto.deal_id });

    await this.agentEventLogger.log({
      agentName: 'csm',
      eventType: 'customer_onboarded',
      payload: {
        customerId: saved.id,
        dealId: dto.deal_id,
        typeProjet: dto.contrat.type_projet,
        tier: dto.contrat.tier,
      },
    });

    await this.onboardingService.startOnboarding(saved.id, dto);

    return saved;
  }

  async calculateHealthScore(customerId: string): Promise<unknown> {
    return this.satisfactionService.calculateHealthScore(customerId);
  }

  async predictChurn(): Promise<unknown[]> {
    const atRisk = await this.prisma.customer.findMany({
      where: { status: 'active' },
      include: {
        healthScores: { where: { isLatest: true }, take: 1 },
        churnSignals: { where: { resolvedAt: null }, orderBy: { detectedAt: 'desc' }, take: 5 },
      },
    });
    return atRisk.filter((c) => {
      const score = c.healthScores[0]?.healthScore ?? 100;
      return score < 50 || c.churnSignals.length > 0;
    });
  }

  async evaluateUpsell(customerId: string): Promise<unknown> {
    return this.upsellService.evaluateUpsellOpportunity(customerId);
  }

  async requestReviews(customerId: string, npsScore: number): Promise<void> {
    return this.reviewService.requestReviews(customerId, npsScore);
  }

  async inviteToReferral(customerId: string): Promise<void> {
    return this.referralService.inviteToProgram(customerId);
  }

  async dailyHealthSnapshot(): Promise<void> {
    return this.satisfactionService.checkAllCustomersHealth();
  }

  async checkOnboardingRisks(): Promise<void> {
    return this.onboardingService.checkAtRiskOnboardings();
  }

  // ══════════════════ READ-ONLY QUERY METHODS ══════════════════

  async listCustomers(opts: { status?: string; take: number; skip: number }) {
    return this.prisma.customer.findMany({
      where: opts.status ? { status: opts.status } : undefined,
      take: opts.take,
      skip: opts.skip,
      orderBy: { createdAt: 'desc' },
      include: { healthScores: { where: { isLatest: true }, take: 1 } },
    });
  }

  async getCustomerDetail(id: string) {
    return this.prisma.customer.findUnique({
      where: { id },
      include: {
        healthScores: { where: { isLatest: true }, take: 1 },
        deals: { orderBy: { createdAt: 'desc' }, take: 5 },
        onboardingSteps: { orderBy: { dayOffset: 'asc' } },
        npsSurveys: { orderBy: { createdAt: 'desc' }, take: 5 },
        upsellOpportunities: { orderBy: { createdAt: 'desc' }, take: 5 },
        reviewRequests: { orderBy: { createdAt: 'desc' }, take: 5 },
        referralProgram: true,
      },
    });
  }

  async updateCustomer(id: string, data: Record<string, unknown>) {
    const allowed = ['companyName', 'siren', 'mrrEur', 'plan', 'tier', 'conditionsPaiement', 'notesVente'];
    const safeData = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
    return this.prisma.customer.update({ where: { id }, data: safeData });
  }

  async getHealthHistory(customerId: string, take: number) {
    return this.prisma.customerHealthScore.findMany({
      where: { customerId },
      orderBy: { calculatedAt: 'desc' },
      take,
    });
  }

  async detectChurnSignals(customerId: string) {
    return this.satisfactionService.detectChurnSignals(customerId);
  }

  async getOnboardingPlan(customerId: string) {
    return this.prisma.onboardingStep.findMany({
      where: { customerId },
      orderBy: { dayOffset: 'asc' },
    });
  }

  async getUpsellPipeline() {
    return this.prisma.upsellOpportunity.findMany({
      where: { status: { in: ['detected', 'proposed'] } },
      orderBy: [{ priority: 'asc' }, { upsellScore: 'desc' }],
      include: { customer: { select: { id: true, companyName: true } } },
    });
  }

  async getReviewRequests(customerId: string) {
    return this.prisma.reviewRequest.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getNegativeReviews() {
    return this.prisma.negativeReview.findMany({
      where: { status: { in: ['detected', 'draft_ready'] } },
      orderBy: { detectedAt: 'desc' },
    });
  }

  async respondToNegativeReview(reviewId: string, response: string) {
    return this.reviewService.respondToNegativeReview(reviewId, response);
  }

  async getReferralPrograms() {
    return this.prisma.referralProgram.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, companyName: true } },
        referralLeads: { orderBy: { submittedAt: 'desc' }, take: 5 },
      },
    });
  }

  async submitReferral(code: string, leadData: ReferralLeadData) {
    return this.referralService.submitReferral(code, leadData);
  }

  async getReferralLeads() {
    return this.prisma.referralLead.findMany({
      orderBy: { submittedAt: 'desc' },
      include: {
        referralProgram: {
          include: { customer: { select: { id: true, companyName: true } } },
        },
      },
    });
  }

  async getDailySnapshot() {
    return this.prisma.csmMetricsDaily.findFirst({ orderBy: { date: 'desc' } });
  }

  async getHealthDistribution() {
    const scores = await this.prisma.customerHealthScore.findMany({
      where: { isLatest: true },
      select: { healthLabel: true, healthScore: true },
    });
    const distribution: Record<string, number> = {
      green: 0, yellow: 0, orange: 0, dark_orange: 0, red: 0,
    };
    for (const s of scores) {
      const label = s.healthLabel ?? 'red';
      distribution[label] = (distribution[label] ?? 0) + 1;
    }
    return {
      distribution,
      total: scores.length,
      avgScore: scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s.healthScore, 0) / scores.length)
        : 0,
    };
  }
}
