import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RedacteurService } from '../../application/services/redacteur.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Processor(QUEUE_NAMES.REDACTEUR_PIPELINE)
export class RedacteurProcessor extends WorkerHost {
  private readonly logger = new Logger(RedacteurProcessor.name);

  constructor(private readonly redacteurService: RedacteurService) {
    super();
  }

  async process(
    job: Job<{ prospectId: string; channel: 'email' | 'linkedin'; templateId?: string }>,
  ): Promise<void> {
    this.logger.log({
      msg: 'Processing redacteur job',
      jobId: job.id,
      prospectId: job.data.prospectId,
      channel: job.data.channel,
    });
    await this.redacteurService.generateMessage({
      prospectId: job.data.prospectId,
      channel: job.data.channel,
      templateId: job.data.templateId,
    });
  }
}
