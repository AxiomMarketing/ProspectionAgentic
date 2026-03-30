import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@core/database/prisma.service';
import { ICustomerRepository } from '../../domain/repositories/i-customer.repository';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import {
  ecommerceUpsellEmail,
  trackingUpsellEmail,
  renewalUpsellEmail,
} from '../../infrastructure/emails/upsell-templates';

interface CrossSellTarget {
  target: string;
  probability: number;
  amount: number;
  timing: string;
}

const CROSS_SELL_MATRIX: Record<string, CrossSellTarget[]> = {
  site_vitrine: [
    { target: 'ecommerce_shopify', probability: 0.45, amount: 8000, timing: 'M3-4' },
    { target: 'tracking_server_side', probability: 0.65, amount: 990, timing: 'M1-2' },
    { target: 'app_flutter', probability: 0.15, amount: 30000, timing: 'M6+' },
  ],
  ecommerce_shopify: [
    { target: 'tracking_server_side', probability: 0.80, amount: 990, timing: 'M1-2' },
    { target: 'app_flutter', probability: 0.30, amount: 20000, timing: 'M4-6' },
  ],
  app_flutter: [
    { target: 'tracking_server_side', probability: 0.70, amount: 990, timing: 'M2' },
    { target: 'app_metier', probability: 0.25, amount: 15000, timing: 'M6+' },
  ],
  app_metier: [
    { target: 'tracking_server_side', probability: 0.70, amount: 990, timing: 'M2' },
    { target: 'app_flutter', probability: 0.20, amount: 20000, timing: 'M6+' },
  ],
  rgaa: [
    { target: 'site_vitrine', probability: 0.35, amount: 8000, timing: 'M2-3' },
    { target: 'ecommerce_shopify', probability: 0.20, amount: 10000, timing: 'M4-6' },
  ],
  tracking_server_side: [
    { target: 'site_vitrine', probability: 0.25, amount: 7500, timing: 'M3-4' },
    { target: 'ecommerce_shopify', probability: 0.30, amount: 10000, timing: 'M3-4' },
  ],
};

@Injectable()
export class UpsellService {
  private readonly logger = new Logger(UpsellService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerRepository: ICustomerRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly emailAdapter: IEmailAdapter,
    private readonly agentEventLogger: AgentEventLoggerService,
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_NAMES.DEALMAKER_UPSELL) private readonly dealmakerQueue: Queue,
  ) {}

  async evaluateUpsellOpportunity(customerId: string): Promise<{ id: string } | null> {
    const customer = await this.customerRepository.findById(customerId);
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

    // Check cooldown: skip if upsell proposed within last 90 days
    const cooldownDays = 90;
    const cooldownDate = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);
    const recentProposal = await this.prisma.upsellOpportunity.findFirst({
      where: {
        customerId,
        proposedAt: { gte: cooldownDate },
      },
    });
    if (recentProposal) {
      this.logger.log({ msg: 'Upsell cooldown active — skipping', customerId });
      return null;
    }

    // Check absolute blockers
    const blocker = await this.detectBlocker(customerId);
    if (blocker) {
      this.logger.log({ msg: 'Upsell blocked', customerId, blocker });
      return null;
    }

    // Get existing services from deals
    const existingDeals = await this.prisma.dealCrm.findMany({
      where: { customerId },
      select: { typeProjet: true },
    });
    const existingServices = new Set(
      existingDeals.map((d) => d.typeProjet).filter(Boolean) as string[],
    );
    if (customer.typeProjet) {
      existingServices.add(customer.typeProjet);
    }

    // Find best cross-sell target from matrix
    const currentProduct = customer.typeProjet;
    if (!currentProduct || !CROSS_SELL_MATRIX[currentProduct]) {
      this.logger.log({ msg: 'No cross-sell matrix for product', customerId, currentProduct });
      return null;
    }

    const candidates = CROSS_SELL_MATRIX[currentProduct].filter(
      (c) => !existingServices.has(c.target),
    );
    if (candidates.length === 0) {
      this.logger.log({ msg: 'All cross-sell products already owned', customerId });
      return null;
    }

    // Pick highest probability candidate
    const best = candidates.reduce((a, b) => (a.probability >= b.probability ? a : b));

    // Calculate upsell score
    const upsellScore = await this.calculateUpsellScore(customerId);

    const minScore = this.configService.get<number>('csm.upsellMinScore', 60);
    if (upsellScore < minScore) {
      this.logger.log({ msg: 'Upsell score below threshold', customerId, upsellScore, minScore });
      return null;
    }

    const priority = upsellScore >= 80 ? 'high' : upsellScore >= 60 ? 'medium' : 'low';

    const opportunity = await this.prisma.upsellOpportunity.create({
      data: {
        customerId,
        productTarget: best.target,
        estimatedValue: best.amount,
        upsellScore,
        priority,
        signalsDetected: { timing: best.timing, probability: best.probability } as object,
        status: 'detected',
      },
    });

    this.eventEmitter.emit('upsell.detected', {
      customerId,
      opportunityId: opportunity.id,
      productTarget: best.target,
      upsellScore,
      estimatedValue: best.amount,
    });

    await this.agentEventLogger.log({
      agentName: 'csm',
      eventType: 'upsell_detected',
      payload: {
        customerId,
        opportunityId: opportunity.id,
        productTarget: best.target,
        upsellScore,
        estimatedValue: best.amount,
      },
    });

    this.logger.log({
      msg: 'Upsell opportunity detected',
      customerId,
      opportunityId: opportunity.id,
      productTarget: best.target,
      upsellScore,
    });

    return { id: opportunity.id };
  }

  async calculateUpsellScore(customerId: string): Promise<number> {
    let score = 0;
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // 1. Product Health (0-30)
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { contractStartDate: true, primaryContactId: true, typeProjet: true },
    });

    // project_on_time: no overdue milestones
    const overdueMilestones = await this.prisma.projectMilestone.count({
      where: { customerId, status: 'pending', dueDate: { lt: now } },
    });
    if (overdueMilestones === 0) score += 7;

    // zero_complaints_60days: no critical churn signals in 60 days
    const recentComplaints = await this.prisma.churnSignal.count({
      where: { customerId, severity: 'critical', detectedAt: { gte: sixtyDaysAgo } },
    });
    if (recentComplaints === 0) score += 8;

    // dashboard_active_weekly: recent agent events (proxy for activity)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weeklyActivity = await this.prisma.agentEvent.count({
      where: {
        payload: { path: ['customerId'], equals: customerId },
        createdAt: { gte: sevenDaysAgo },
      },
    });
    if (weeklyActivity > 0) score += 15;

    // 2. Usage Growth (0-25)
    // traffic_growth_50pct: detected via churn signals of type 'traffic_growth'
    const trafficGrowthSignal = await this.prisma.agentEvent.count({
      where: {
        agentName: 'csm',
        eventType: 'traffic_growth',
        payload: { path: ['customerId'], equals: customerId },
      },
    });
    if (trafficGrowthSignal > 0) score += 15;

    // feature_usage_80pct: multiple completed onboarding steps as proxy
    const totalSteps = await this.prisma.onboardingStep.count({ where: { customerId } });
    const completedSteps = await this.prisma.onboardingStep.count({
      where: { customerId, status: 'completed' },
    });
    if (totalSteps > 0 && completedSteps / totalSteps >= 0.8) score += 10;

    // 3. Budget Signals (0-20) — mutually exclusive, take highest
    const budgetApproved = await this.prisma.agentEvent.count({
      where: {
        agentName: 'csm',
        eventType: 'budget_approved',
        payload: { path: ['customerId'], equals: customerId },
      },
    });
    const companyGrowth = await this.prisma.agentEvent.count({
      where: {
        agentName: 'csm',
        eventType: 'company_growth',
        payload: { path: ['customerId'], equals: customerId },
      },
    });
    const featureRequest = await this.prisma.agentEvent.count({
      where: {
        agentName: 'csm',
        eventType: 'feature_request',
        payload: { path: ['customerId'], equals: customerId },
      },
    });
    if (budgetApproved > 0) score += 20;
    else if (companyGrowth > 0) score += 15;
    else if (featureRequest > 0) score += 10;

    // 4. Relationship (0-15)
    const lastNps = await this.prisma.npsSurvey.findFirst({
      where: { customerId, type: 'nps', status: 'responded' },
      orderBy: { respondedAt: 'desc' },
    });
    if (lastNps?.score != null && lastNps.score >= 8) score += 10;

    // regular_communication: recent touchpoints
    const recentEvents = await this.prisma.agentEvent.count({
      where: {
        payload: { path: ['customerId'], equals: customerId },
        createdAt: { gte: sixtyDaysAgo },
      },
    });
    if (recentEvents >= 3) score += 5;

    // 5. Timeline (0-10)
    if (customer?.contractStartDate) {
      const daysSinceLaunch = Math.floor(
        (now.getTime() - customer.contractStartDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (daysSinceLaunch >= 30) score += 5;

      // pre_renewal_window: 30-60 days before 12-month anniversary
      const renewalDate = new Date(customer.contractStartDate);
      renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      const daysToRenewal = Math.floor((renewalDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      if (daysToRenewal >= 0 && daysToRenewal <= 60) score += 10;
    }

    // no_active_crisis: no unresolved critical churn signals
    const activeCrisis = await this.prisma.churnSignal.count({
      where: { customerId, severity: 'critical', resolvedAt: null },
    });
    if (activeCrisis === 0) score += 3;

    return Math.min(100, score);
  }

  async proposeUpsell(customerId: string, opportunityId: string): Promise<void> {
    const opportunity = await this.prisma.upsellOpportunity.findUnique({
      where: { id: opportunityId },
    });
    if (!opportunity) {
      this.logger.warn({ msg: 'Upsell opportunity not found', opportunityId });
      return;
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { companyName: true, primaryContactId: true },
    });
    if (!customer?.primaryContactId) {
      this.logger.warn({ msg: 'No primary contact for upsell email', customerId });
      return;
    }

    const prospect = await this.prisma.prospect.findUnique({
      where: { id: customer.primaryContactId },
      select: { firstName: true, email: true },
    });
    if (!prospect?.email) return;

    const senderEmail =
      this.configService.get<string>('GMAIL_USER') ?? 'no-reply@axiom-marketing.fr';
    const prenom = prospect.firstName ?? 'Client';
    const productTarget = opportunity.productTarget;

    let template: { subject: string; htmlBody: string } | null = null;

    if (productTarget === 'ecommerce_shopify') {
      template = ecommerceUpsellEmail({
        prenom,
        companyName: customer.companyName,
        estimatedValue: opportunity.estimatedValue,
      });
    } else if (productTarget === 'tracking_server_side') {
      template = trackingUpsellEmail({
        prenom,
        companyName: customer.companyName,
        estimatedValue: opportunity.estimatedValue,
      });
    } else {
      template = renewalUpsellEmail({
        prenom,
        companyName: customer.companyName,
        nextProductTarget: productTarget,
        estimatedValue: opportunity.estimatedValue,
      });
    }

    try {
      await this.emailAdapter.sendEmail({
        from: senderEmail,
        to: [prospect.email],
        subject: template.subject,
        htmlBody: template.htmlBody,
        tags: ['csm', 'upsell', productTarget],
      });
    } catch (error) {
      this.logger.warn({
        msg: 'Failed to send upsell email',
        opportunityId,
        error: (error as Error).message,
      });
    }

    await this.prisma.upsellOpportunity.update({
      where: { id: opportunityId },
      data: { status: 'proposed', proposedAt: new Date() },
    });

    // Dispatch to Agent 8 Dealmaker for upsell pipeline handling
    await this.dealmakerQueue.add('upsell-opportunity', {
      type: 'upsell_opportunity',
      client_id: customerId,
      existing_deal_id: opportunity.dealId ?? '',
      upsell: {
        product_target: opportunity.productTarget,
        estimated_value: opportunity.estimatedValue,
        upsell_score: opportunity.upsellScore,
        priority: opportunity.priority,
        signals_detected: opportunity.signalsDetected,
      },
      metadata: { agent: 'agent_10_csm', created_at: new Date().toISOString(), version: '1.0' },
    });

    this.eventEmitter.emit('upsell.proposed', {
      customerId,
      opportunityId,
      productTarget,
    });

    await this.agentEventLogger.log({
      agentName: 'csm',
      eventType: 'upsell_proposed',
      payload: { customerId, opportunityId, productTarget },
    });

    this.logger.log({ msg: 'Upsell proposed', customerId, opportunityId, productTarget });
  }

  private async detectBlocker(customerId: string): Promise<string | null> {
    const now = new Date();

    // 1. project_late: overdue milestones
    const overdueMilestones = await this.prisma.projectMilestone.count({
      where: { customerId, status: 'pending', dueDate: { lt: now } },
    });
    if (overdueMilestones > 0) return 'project_late';

    // 2. escalated_complaint: critical churn signal unresolved
    const criticalSignal = await this.prisma.churnSignal.count({
      where: { customerId, severity: 'critical', resolvedAt: null },
    });
    if (criticalSignal > 0) return 'escalated_complaint';

    // 3. core_bugs: unresolved support signals
    const supportBugs = await this.prisma.churnSignal.count({
      where: { customerId, signalType: 'support_spike', resolvedAt: null },
    });
    if (supportBugs > 0) return 'core_bugs';

    // 4. low_attendance: less than 50% onboarding steps completed
    const totalSteps = await this.prisma.onboardingStep.count({ where: { customerId } });
    if (totalSteps > 0) {
      const completedSteps = await this.prisma.onboardingStep.count({
        where: { customerId, status: 'completed' },
      });
      if (completedSteps / totalSteps < 0.5) return 'low_attendance';
    }

    // 5. nps_detractor: last NPS < 6
    const lastNps = await this.prisma.npsSurvey.findFirst({
      where: { customerId, type: 'nps', status: 'responded' },
      orderBy: { respondedAt: 'desc' },
    });
    if (lastNps?.score != null && lastNps.score < 6) return 'nps_detractor';

    // 6. multiple_complaints: 2+ unresolved churn signals
    const unresolvedSignals = await this.prisma.churnSignal.count({
      where: { customerId, resolvedAt: null },
    });
    if (unresolvedSignals >= 2) return 'multiple_complaints';

    // 7. late_payment: payment-related churn signal
    const latePayment = await this.prisma.churnSignal.count({
      where: { customerId, signalType: 'late_payment', resolvedAt: null },
    });
    if (latePayment > 0) return 'late_payment';

    // 8. refund_requested
    const refundSignal = await this.prisma.churnSignal.count({
      where: { customerId, signalType: 'refund_requested', resolvedAt: null },
    });
    if (refundSignal > 0) return 'refund_requested';

    // 9. incomplete_onboarding: pending steps past due date
    const incompleteOnboarding = await this.prisma.onboardingStep.count({
      where: { customerId, status: 'pending', dueDate: { lt: now } },
    });
    if (incompleteOnboarding > 0) return 'incomplete_onboarding';

    // 10. key_contact_left: no primaryContactId
    const customerRecord = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { primaryContactId: true },
    });
    if (!customerRecord?.primaryContactId) return 'key_contact_left';

    return null;
  }
}
