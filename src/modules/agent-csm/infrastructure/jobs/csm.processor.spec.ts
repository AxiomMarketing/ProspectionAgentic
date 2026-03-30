import { CsmProcessor } from './csm.processor';
import { CsmService } from '../../application/services/csm.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { Job, Queue } from 'bullmq';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeJob = (
  data: Record<string, unknown>,
  opts: { id?: string; attemptsMade?: number; name?: string } = {},
): Job =>
  ({
    id: opts.id ?? 'job-1',
    name: opts.name ?? 'csm-job',
    data,
    attemptsMade: opts.attemptsMade ?? 0,
  }) as unknown as Job;

const validOnboardPayload = (): Record<string, unknown> => ({
  action: 'onboard-customer',
  deal_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  prospect_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  prospect: { prenom: 'Jean', nom: 'Dupont', email: 'jean@acme.fr', poste: 'CEO' },
  entreprise: { nom: 'Acme Corp' },
  contrat: {
    montant_ht: 5000,
    tier: 'gold',
    type_projet: 'site_vitrine',
    date_signature: '2025-03-01T00:00:00.000Z',
    date_demarrage_prevue: '2025-03-15T00:00:00.000Z',
    duree_estimee_semaines: 8,
    conditions_paiement: '50/50',
  },
  metadata: {
    agent: 'agent_8_dealmaker',
    created_at: '2025-03-01T00:00:00.000Z',
  },
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CsmProcessor', () => {
  let processor: CsmProcessor;
  let csmService: jest.Mocked<Pick<CsmService, 'onboardCustomer' | 'calculateHealthScore' | 'dailyHealthSnapshot' | 'checkOnboardingRisks' | 'evaluateUpsell' | 'requestReviews' | 'inviteToReferral' | 'detectChurnSignals'>>;
  let agentEventLogger: jest.Mocked<Pick<AgentEventLoggerService, 'log'>>;
  let deadLetterQueue: jest.Mocked<Pick<Queue, 'add'>>;

  beforeEach(() => {
    csmService = {
      onboardCustomer: jest.fn().mockResolvedValue(undefined),
      calculateHealthScore: jest.fn().mockResolvedValue(undefined),
      dailyHealthSnapshot: jest.fn().mockResolvedValue(undefined),
      checkOnboardingRisks: jest.fn().mockResolvedValue(undefined),
      evaluateUpsell: jest.fn().mockResolvedValue(undefined),
      requestReviews: jest.fn().mockResolvedValue(undefined),
      inviteToReferral: jest.fn().mockResolvedValue(undefined),
      detectChurnSignals: jest.fn().mockResolvedValue([]),
    };
    agentEventLogger = { log: jest.fn().mockResolvedValue(undefined) };
    deadLetterQueue = { add: jest.fn().mockResolvedValue(undefined) };

    processor = new CsmProcessor(
      csmService as unknown as CsmService,
      agentEventLogger as unknown as AgentEventLoggerService,
      deadLetterQueue as unknown as Queue,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Valid actions ─────────────────────────────────────────────────────────

  describe('onboard-customer', () => {
    it('should call csmService.onboardCustomer with the full payload', async () => {
      const data = validOnboardPayload();
      await processor.process(makeJob(data));

      expect(csmService.onboardCustomer).toHaveBeenCalledTimes(1);
      expect(csmService.onboardCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          deal_id: data.deal_id,
          prospect_id: data.prospect_id,
        }),
      );
    });

    it('should log job.start and job.complete events on success', async () => {
      await processor.process(makeJob(validOnboardPayload()));

      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'job.start.onboard-customer' }),
      );
      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'job.complete.onboard-customer' }),
      );
    });
  });

  describe('calculate-health', () => {
    it('should call csmService.calculateHealthScore with customerId', async () => {
      const customerId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      await processor.process(makeJob({ action: 'calculate-health', customerId }));

      expect(csmService.calculateHealthScore).toHaveBeenCalledWith(customerId);
    });
  });

  describe('daily-health-snapshot', () => {
    it('should call csmService.dailyHealthSnapshot', async () => {
      await processor.process(makeJob({ action: 'daily-health-snapshot' }));

      expect(csmService.dailyHealthSnapshot).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Invalid payload ───────────────────────────────────────────────────────

  describe('invalid payload', () => {
    it('should throw when action field is missing', async () => {
      const job = makeJob({ customerId: 'cust-1' });

      await expect(processor.process(job)).rejects.toThrow('Invalid job data');
    });

    it('should throw when action is unknown', async () => {
      const job = makeJob({ action: 'unknown-action' });

      await expect(processor.process(job)).rejects.toThrow('Invalid job data');
    });

    it('should throw when calculate-health is missing customerId', async () => {
      const job = makeJob({ action: 'calculate-health' });

      await expect(processor.process(job)).rejects.toThrow('Invalid job data');
    });
  });

  // ─── Error handling + retry / dead-letter ─────────────────────────────────

  describe('error handling', () => {
    it('should rethrow when service throws and attemptsMade < 3', async () => {
      const error = new Error('Service failure');
      csmService.calculateHealthScore.mockRejectedValue(error);

      const customerId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      const job = makeJob({ action: 'calculate-health', customerId }, { attemptsMade: 1 });

      await expect(processor.process(job)).rejects.toThrow('Service failure');
      expect(deadLetterQueue.add).not.toHaveBeenCalled();
    });

    it('should dispatch to dead-letter queue when attemptsMade >= 3', async () => {
      const error = new Error('Persistent failure');
      csmService.calculateHealthScore.mockRejectedValue(error);

      const customerId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      const job = makeJob({ action: 'calculate-health', customerId }, { attemptsMade: 3 });

      await processor.process(job);

      expect(deadLetterQueue.add).toHaveBeenCalledWith(
        'dead-letter',
        expect.objectContaining({
          originalQueue: QUEUE_NAMES.CSM_ONBOARDING,
          errorMessage: 'Persistent failure',
        }),
        expect.any(Object),
      );
    });

    it('should log job.error event on failure', async () => {
      csmService.calculateHealthScore.mockRejectedValue(new Error('oops'));

      const customerId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      const job = makeJob({ action: 'calculate-health', customerId }, { attemptsMade: 3 });

      await processor.process(job);

      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'job.error.calculate-health' }),
      );
    });
  });

  // ─── Wired actions ────────────────────────────────────────────────────────

  describe('wired actions', () => {
    it('should call csmService.checkOnboardingRisks for check-onboarding-risks', async () => {
      await processor.process(makeJob({ action: 'check-onboarding-risks' }));

      expect(csmService.checkOnboardingRisks).toHaveBeenCalledTimes(1);
    });

    it('should call csmService.evaluateUpsell with customerId', async () => {
      const customerId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      await processor.process(makeJob({ action: 'evaluate-upsell', customerId }));

      expect(csmService.evaluateUpsell).toHaveBeenCalledWith(customerId);
    });

    it('should call csmService.requestReviews with customerId and npsScore', async () => {
      const customerId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      await processor.process(makeJob({ action: 'request-review', customerId, npsScore: 8 }));

      expect(csmService.requestReviews).toHaveBeenCalledWith(customerId, 8);
    });

    it('should call csmService.inviteToReferral with customerId', async () => {
      const customerId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      await processor.process(makeJob({ action: 'invite-to-referral', customerId }));

      expect(csmService.inviteToReferral).toHaveBeenCalledWith(customerId);
    });

    it('should call csmService.detectChurnSignals with customerId for check-churn-signals', async () => {
      const customerId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      await processor.process(makeJob({ action: 'check-churn-signals', customerId }));

      expect(csmService.detectChurnSignals).toHaveBeenCalledWith(customerId);
    });

    it('should not call any service for send-nps-survey (still deferred)', async () => {
      const customerId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      await processor.process(makeJob({ action: 'send-nps-survey', customerId, surveyType: 'nps' }));

      expect(csmService.onboardCustomer).not.toHaveBeenCalled();
      expect(csmService.calculateHealthScore).not.toHaveBeenCalled();
      expect(csmService.dailyHealthSnapshot).not.toHaveBeenCalled();
    });
  });
});
