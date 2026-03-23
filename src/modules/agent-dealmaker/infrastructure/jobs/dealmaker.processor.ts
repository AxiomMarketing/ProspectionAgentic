import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DealmakerService } from '../../application/services/dealmaker.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Processor(QUEUE_NAMES.DEALMAKER_PIPELINE)
export class DealmakerProcessor extends WorkerHost {
  private readonly logger = new Logger(DealmakerProcessor.name);

  constructor(private readonly dealmakerService: DealmakerService) {
    super();
  }

  async process(job: Job<{ dealId: string; action: string; stage?: string }>): Promise<void> {
    this.logger.log({
      msg: 'Processing dealmaker job',
      jobId: job.id,
      action: job.data.action,
      dealId: job.data.dealId,
    });

    switch (job.data.action) {
      case 'advance_stage':
        if (job.data.stage) {
          await this.dealmakerService.advanceStage(job.data.dealId, job.data.stage as any);
        }
        break;
      default:
        this.logger.warn({ msg: 'Unknown dealmaker job action', action: job.data.action });
    }
  }
}
