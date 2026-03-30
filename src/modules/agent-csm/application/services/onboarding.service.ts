import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@core/database/prisma.service';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { DealToCSMDto } from '../dtos/deal-to-csm.dto';
import {
  welcomeEmail,
  preKickoffEmail,
  kickoffRecapEmail,
  milestoneEmail,
  monthlyCheckinEmail,
} from '../../infrastructure/emails/onboarding-templates';

interface OnboardingStepDef {
  stepId: string;
  name: string;
  dayOffset: number;
  owner: string;
}

const BASE_ONBOARDING_STEPS: OnboardingStepDef[] = [
  { stepId: 'welcome_email', name: 'Email de bienvenue', dayOffset: 0, owner: 'axiom' },
  { stepId: 'shared_folder', name: 'Dossier partagé créé', dayOffset: 0, owner: 'axiom' },
  { stepId: 'pm_assigned', name: 'PM assigné', dayOffset: 0, owner: 'axiom' },
  { stepId: 'kickoff_scheduled', name: 'Kick-off planifié', dayOffset: 2, owner: 'axiom' },
  { stepId: 'pre_kickoff_email', name: 'Email pré-kick-off', dayOffset: 3, owner: 'axiom' },
  { stepId: 'kickoff_done', name: 'Kick-off réalisé', dayOffset: 5, owner: 'both' },
  { stepId: 'kickoff_recap', name: 'Recap kick-off envoyé', dayOffset: 7, owner: 'axiom' },
  { stepId: 'assets_collected', name: 'Accès techniques collectés', dayOffset: 10, owner: 'client' },
  { stepId: 'first_deliverable', name: 'Premier livrable envoyé', dayOffset: 14, owner: 'axiom' },
  { stepId: 'monthly_checkin', name: 'Check-in mensuel', dayOffset: 30, owner: 'axiom' },
];

const PROJECT_SPECIFIC_STEPS: Record<string, OnboardingStepDef[]> = {
  site_vitrine: [
    { stepId: 'brand_review', name: 'Revue identité de marque', dayOffset: 4, owner: 'both' },
    { stepId: 'content_received', name: 'Contenu reçu du client', dayOffset: 8, owner: 'client' },
  ],
  ecommerce_shopify: [
    { stepId: 'product_catalog', name: 'Catalogue produits importé', dayOffset: 7, owner: 'client' },
    { stepId: 'payment_setup', name: 'Paiement configuré', dayOffset: 10, owner: 'both' },
  ],
  app_flutter: [
    { stepId: 'ux_workshop', name: 'Atelier UX/wireframes', dayOffset: 7, owner: 'both' },
    { stepId: 'api_specs', name: 'Spécifications API validées', dayOffset: 10, owner: 'both' },
  ],
  app_metier: [
    { stepId: 'process_mapping', name: 'Mapping des processus métier', dayOffset: 7, owner: 'both' },
    { stepId: 'data_import', name: 'Import données existantes', dayOffset: 14, owner: 'client' },
  ],
  rgaa: [
    { stepId: 'audit_scope', name: 'Périmètre audit défini', dayOffset: 3, owner: 'both' },
    { stepId: 'initial_audit', name: 'Audit initial réalisé', dayOffset: 10, owner: 'axiom' },
  ],
  tracking_server_side: [
    { stepId: 'gtm_access', name: 'Accès GTM fournis', dayOffset: 1, owner: 'client' },
    { stepId: 'tracking_plan', name: 'Plan de tracking validé', dayOffset: 3, owner: 'both' },
  ],
};

const TTV_TARGETS: Record<string, number> = {
  site_vitrine: 12,
  ecommerce_shopify: 14,
  app_flutter: 21,
  app_metier: 21,
  rgaa: 14,
  tracking_server_side: 5,
};

const EMAIL_STEP_IDS = new Set([
  'welcome_email',
  'pre_kickoff_email',
  'kickoff_recap',
  'first_deliverable',
  'monthly_checkin',
]);

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAdapter: IEmailAdapter,
    private readonly eventEmitter: EventEmitter2,
    private readonly agentEventLogger: AgentEventLoggerService,
    private readonly configService: ConfigService,
  ) {}

  async startOnboarding(customerId: string, dealData: DealToCSMDto): Promise<void> {
    const { type_projet: typeProjet, date_demarrage_prevue: startDateStr } = dealData.contrat;
    const contractStartDate = new Date(startDateStr);

    const specificSteps = PROJECT_SPECIFIC_STEPS[typeProjet] ?? [];
    const allSteps = [...BASE_ONBOARDING_STEPS, ...specificSteps];

    const ttvTarget = TTV_TARGETS[typeProjet];

    await this.prisma.onboardingStep.createMany({
      data: allSteps.map((step) => {
        const dueDate = new Date(contractStartDate);
        dueDate.setDate(dueDate.getDate() + step.dayOffset);
        return {
          customerId,
          stepId: step.stepId,
          name: step.name,
          dayOffset: step.dayOffset,
          owner: step.owner,
          status: 'pending',
          dueDate,
        };
      }),
    });

    this.eventEmitter.emit('onboarding.started', {
      customerId,
      typeProjet,
      ttvTargetDays: ttvTarget,
      contractStartDate,
    });

    await this.agentEventLogger.log({
      agentName: 'csm',
      eventType: 'onboarding_started',
      prospectId: customerId,
      payload: { typeProjet, ttvTargetDays: ttvTarget, stepCount: allSteps.length },
    });

    this.logger.log({ msg: 'Onboarding started', customerId, typeProjet, steps: allSteps.length });
  }

  async executeStep(customerId: string, stepId: string): Promise<void> {
    const step = await this.prisma.onboardingStep.findFirst({
      where: { customerId, stepId },
    });

    if (!step) {
      this.logger.warn({ msg: 'Onboarding step not found', customerId, stepId });
      return;
    }

    // Idempotence: skip if already completed
    if (step.status !== 'pending') {
      this.logger.log({ msg: 'Step already processed, skipping', customerId, stepId, status: step.status });
      return;
    }

    if (EMAIL_STEP_IDS.has(stepId)) {
      await this.sendStepEmail(customerId, stepId, step);
    }

    await this.prisma.onboardingStep.update({
      where: { id: step.id },
      data: { status: 'completed', completedAt: new Date() },
    });

    await this.agentEventLogger.log({
      agentName: 'csm',
      eventType: 'onboarding_step_completed',
      prospectId: customerId,
      payload: { stepId, stepName: step.name },
    });

    this.logger.log({ msg: 'Onboarding step completed', customerId, stepId });
  }

  async checkAtRiskOnboardings(): Promise<void> {
    const now = new Date();

    const overdueSteps = await this.prisma.onboardingStep.findMany({
      where: {
        dueDate: { lt: now },
        status: 'pending',
      },
      include: { customer: true },
    });

    for (const step of overdueSteps) {
      const daysSinceTrigger = Math.floor(
        (now.getTime() - step.dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      const severity = this.computeSeverity(step.stepId, daysSinceTrigger);
      if (!severity) continue;

      await this.prisma.onboardingRisk.create({
        data: {
          customerId: step.customerId,
          riskType: step.stepId,
          severity,
          daysSinceTrigger,
          detectedAt: now,
        },
      });

      const eventName = severity === 'critical' ? 'onboarding.critical' : 'onboarding.at_risk';
      this.eventEmitter.emit(eventName, {
        customerId: step.customerId,
        stepId: step.stepId,
        severity,
        daysSinceTrigger,
      });

      await this.agentEventLogger.log({
        agentName: 'csm',
        eventType: 'onboarding_risk_detected',
        prospectId: step.customerId,
        payload: { stepId: step.stepId, severity, daysSinceTrigger },
      });
    }

    this.logger.log({ msg: 'At-risk onboarding check done', overdueCount: overdueSteps.length });
  }

  private computeSeverity(stepId: string, daysSinceTrigger: number): string | null {
    const thresholds: Record<string, { medium?: number; high?: number; critical?: number }> = {
      assets_collected: { medium: 5, high: 10 },
      welcome_email: { medium: 10, high: 15 },
      kickoff_done: { high: 7, critical: 14 },
    };

    const t = thresholds[stepId];
    if (!t) {
      // Generic fallback for any other overdue step
      if (daysSinceTrigger >= 14) return 'critical';
      if (daysSinceTrigger >= 7) return 'high';
      if (daysSinceTrigger >= 3) return 'medium';
      return null;
    }

    if (t.critical !== undefined && daysSinceTrigger >= t.critical) return 'critical';
    if (t.high !== undefined && daysSinceTrigger >= t.high) return 'high';
    if (t.medium !== undefined && daysSinceTrigger >= t.medium) return 'medium';
    return null;
  }

  private async sendStepEmail(
    customerId: string,
    stepId: string,
    step: { name: string; dueDate: Date },
  ): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { deals: { take: 1, orderBy: { createdAt: 'desc' } } },
    });

    if (!customer?.primaryContactId) return;

    const prospect = await this.prisma.prospect.findUnique({
      where: { id: customer.primaryContactId },
      select: { firstName: true, email: true },
    });

    if (!prospect?.email) return;

    const prenom = prospect.firstName ?? 'Client';
    const nomProjet = customer.companyName;
    const typeProjet = customer.typeProjet ?? '';
    const senderEmail = this.configService.get<string>('GMAIL_USER') ?? 'no-reply@axiom-marketing.fr';

    let template: { subject: string; htmlBody: string } | null = null;

    switch (stepId) {
      case 'welcome_email':
        template = welcomeEmail({ prenom, typeProjet });
        break;
      case 'pre_kickoff_email': {
        const kickoffDate = new Date(step.dueDate);
        kickoffDate.setDate(kickoffDate.getDate() + 2);
        template = preKickoffEmail({
          prenom,
          nomProjet,
          kickoffDate: kickoffDate.toLocaleDateString('fr-FR'),
        });
        break;
      }
      case 'kickoff_recap':
        template = kickoffRecapEmail({ prenom, nomProjet, decisions: [], nextSteps: [] });
        break;
      case 'first_deliverable':
        template = milestoneEmail({ prenom, typeProjet });
        break;
      case 'monthly_checkin':
        template = monthlyCheckinEmail({ prenom, nomProjet, completed: [], inProgress: [], upcoming: [] });
        break;
    }

    if (!template) return;

    try {
      await this.emailAdapter.sendEmail({
        from: senderEmail,
        to: [prospect.email],
        subject: template.subject,
        htmlBody: template.htmlBody,
        tags: ['csm', 'onboarding', stepId],
      });
    } catch (error) {
      this.logger.warn({ msg: 'Failed to send onboarding email', stepId, error: (error as Error).message });
    }
  }
}
