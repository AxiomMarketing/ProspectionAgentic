import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Processor(QUEUE_NAMES.DEAD_LETTER_QUEUE)
export class DeadLetterProcessor extends WorkerHost {
  private readonly logger = new Logger(DeadLetterProcessor.name);
  async process(job: Job): Promise<void> {
    this.logger.error({ msg: 'Job failed permanently', jobName: job.name, jobId: job.id, failedReason: job.failedReason, data: job.data });
  }
}
