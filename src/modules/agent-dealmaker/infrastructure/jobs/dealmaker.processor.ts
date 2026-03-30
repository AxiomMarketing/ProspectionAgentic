import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { z } from 'zod';
import { DealmakerService } from '../../application/services/dealmaker.service';
import { QuoteGeneratorService } from '../../application/services/quote-generator.service';
import { DealFollowUpService } from '../../application/services/deal-followup.service';
import { YousignService } from '../../application/services/yousign.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { DealStage } from '../../domain/entities/deal.entity';

const DealIdSchema = z.string().uuid();

const JobDataSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('advance-stage'), dealId: z.string().uuid(), stage: z.nativeEnum(DealStage), reason: z.string().optional() }),
  z.object({ action: z.literal('create-deal'), dealId: z.string().uuid(), prospectId: z.string().uuid().optional(), title: z.string().optional() }),
  z.object({ action: z.literal('generate-quote'), dealId: z.string().uuid(), prospectId: z.string().uuid().optional() }),
  z.object({ action: z.literal('follow-up'), dealId: z.string().uuid(), step: z.number().int().optional() }),
  z.object({ action: z.literal('sign-contract'), dealId: z.string().uuid() }),
  z.object({ action: z.literal('check-timeout'), dealId: z.string().uuid() }),
  z.object({ action: z.literal('send-reminder'), dealId: z.string().uuid(), signatureRequestId: z.string().optional(), step: z.number().int().optional() }),
]);

type JobData = z.infer<typeof JobDataSchema>;

@Processor(QUEUE_NAMES.DEALMAKER_PIPELINE)
export class DealmakerProcessor extends WorkerHost {
  private readonly logger = new Logger(DealmakerProcessor.name);

  constructor(
    private readonly dealmakerService: DealmakerService,
    private readonly quoteGeneratorService: QuoteGeneratorService,
    private readonly dealFollowUpService: DealFollowUpService,
    private readonly yousignService: YousignService,
  ) {
    super();
  }

  async process(job: Job<JobData>): Promise<void> {
    const parseResult = JobDataSchema.safeParse(job.data);
    if (!parseResult.success) {
      this.logger.error({
        msg: 'Invalid dealmaker job data',
        jobId: job.id,
        errors: parseResult.error.errors,
      });
      throw new Error(`Invalid job data: ${parseResult.error.message}`);
    }

    const data = parseResult.data;
    DealIdSchema.parse(data.dealId);

    this.logger.log({
      msg: 'Processing dealmaker job',
      jobId: job.id,
      action: data.action,
      dealId: data.dealId,
    });

    switch (data.action) {
      case 'advance-stage':
        await this.dealmakerService.advanceStage(data.dealId, data.stage, data.reason, 'system');
        break;
      case 'create-deal':
        try {
          await this.dealmakerService.createDeal(
            {
              prospectId: data.prospectId ?? data.dealId,
              title: data.title ?? 'Deal',
            },
            'system',
          );
        } catch (err) {
          this.logger.error({ msg: 'create-deal job failed', dealId: data.dealId, error: (err as Error).message });
          throw err;
        }
        break;
      case 'generate-quote':
        try {
          await this.quoteGeneratorService.generateQuote(data.dealId, data.prospectId ?? data.dealId);
        } catch (err) {
          this.logger.error({ msg: 'generate-quote job failed', dealId: data.dealId, error: (err as Error).message });
          throw err;
        }
        break;
      case 'follow-up':
        try {
          await this.dealFollowUpService.processFollowUp(data.dealId, data.step ?? 1);
        } catch (err) {
          this.logger.error({ msg: 'follow-up job failed', dealId: data.dealId, error: (err as Error).message });
          throw err;
        }
        break;
      case 'sign-contract':
        try {
          await this.dealmakerService.startSignatureProcess(data.dealId);
        } catch (err) {
          this.logger.error({ msg: 'sign-contract job failed', dealId: data.dealId, error: (err as Error).message });
          throw err;
        }
        break;
      case 'check-timeout':
        try {
          await this.dealFollowUpService.checkTimeout();
        } catch (err) {
          this.logger.error({ msg: 'check-timeout job failed', dealId: data.dealId, error: (err as Error).message });
          throw err;
        }
        break;
      case 'send-reminder':
        try {
          if (data.signatureRequestId) {
            await this.yousignService.sendReminder(data.signatureRequestId);
          } else {
            this.logger.warn({ msg: 'send-reminder job missing signatureRequestId', dealId: data.dealId });
          }
        } catch (err) {
          this.logger.error({ msg: 'send-reminder job failed', dealId: data.dealId, error: (err as Error).message });
          throw err;
        }
        break;
      default:
        this.logger.warn({ msg: 'Unknown dealmaker job action', action: (data as { action: string }).action });
    }
  }
}
