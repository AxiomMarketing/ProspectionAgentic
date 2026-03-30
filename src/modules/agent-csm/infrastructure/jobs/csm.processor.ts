import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { z } from 'zod';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { CsmService } from '../../application/services/csm.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { DealToCSMSchema } from '../../application/dtos/deal-to-csm.dto';

const JobDataSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('onboard-customer') }).merge(DealToCSMSchema),
  z.object({ action: z.literal('calculate-health'), customerId: z.string().uuid() }),
  z.object({ action: z.literal('check-onboarding-risks') }),
  z.object({ action: z.literal('evaluate-upsell'), customerId: z.string().uuid() }),
  z.object({
    action: z.literal('request-review'),
    customerId: z.string().uuid(),
    npsScore: z.number().int().min(0).max(10),
  }),
  z.object({ action: z.literal('invite-to-referral'), customerId: z.string().uuid() }),
  z.object({
    action: z.literal('send-nps-survey'),
    customerId: z.string().uuid(),
    surveyType: z.enum(['nps', 'csat', 'ces']).default('nps'),
  }),
  z.object({ action: z.literal('check-churn-signals'), customerId: z.string().uuid() }),
  z.object({ action: z.literal('daily-health-snapshot') }),
]);

type JobData = z.infer<typeof JobDataSchema>;

@Processor(QUEUE_NAMES.CSM_ONBOARDING)
@Injectable()
export class CsmProcessor extends WorkerHost {
  private readonly logger = new Logger(CsmProcessor.name);

  constructor(
    private readonly csmService: CsmService,
    private readonly agentEventLogger: AgentEventLoggerService,
    @InjectQueue(QUEUE_NAMES.DEAD_LETTER_QUEUE) private readonly deadLetterQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<JobData>): Promise<void> {
    const parseResult = JobDataSchema.safeParse(job.data);
    if (!parseResult.success) {
      this.logger.error({
        msg: 'Invalid CSM job data',
        jobId: job.id,
        errors: parseResult.error.errors,
      });
      throw new Error(`Invalid job data: ${parseResult.error.message}`);
    }

    const data = parseResult.data;
    const startedAt = Date.now();

    this.logger.log({
      msg: 'Processing CSM job',
      jobId: job.id,
      action: data.action,
    });

    await this.agentEventLogger.log({
      agentName: 'agent-csm',
      eventType: `job.start.${data.action}`,
      jobId: String(job.id),
      payload: { action: data.action },
    });

    try {
      switch (data.action) {
        case 'onboard-customer':
          await this.csmService.onboardCustomer(data);
          break;

        case 'calculate-health':
          await this.csmService.calculateHealthScore(data.customerId);
          break;

        case 'daily-health-snapshot':
          await this.csmService.dailyHealthSnapshot();
          break;

        case 'check-onboarding-risks':
        case 'evaluate-upsell':
        case 'request-review':
        case 'invite-to-referral':
        case 'send-nps-survey':
        case 'check-churn-signals':
          this.logger.log({
            msg: 'action deferred — service not yet implemented',
            jobId: job.id,
            action: data.action,
          });
          break;

        default:
          this.logger.warn({
            msg: 'Unknown CSM job action',
            action: (data as { action: string }).action,
          });
      }

      await this.agentEventLogger.log({
        agentName: 'agent-csm',
        eventType: `job.complete.${data.action}`,
        jobId: String(job.id),
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      const error = err as Error;

      this.logger.error({
        msg: 'CSM job failed',
        jobId: job.id,
        action: data.action,
        attempt: job.attemptsMade,
        error: error.message,
      });

      await this.agentEventLogger.log({
        agentName: 'agent-csm',
        eventType: `job.error.${data.action}`,
        jobId: String(job.id),
        errorMessage: error.message,
        durationMs: Date.now() - startedAt,
      });

      if (job.attemptsMade < 3) {
        throw err;
      }

      await this.deadLetterQueue.add(
        'dead-letter',
        {
          originalQueue: QUEUE_NAMES.CSM_ONBOARDING,
          jobId: job.id,
          jobName: job.name,
          jobData: job.data,
          errorMessage: error.message,
          failedAt: new Date().toISOString(),
        },
        { removeOnComplete: true },
      );
    }
  }
}
