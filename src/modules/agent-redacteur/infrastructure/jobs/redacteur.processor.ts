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
    job: Job<{
      prospectId: string;
      channel: 'email' | 'linkedin';
      category?: string;
      routing?: { sequenceId: string; canal: string; slaHours: number; priority: number; delayMs: number };
      breakdown?: Record<string, number>;
      templateId?: string;
    }>,
  ): Promise<void> {
    this.logger.log({
      msg: 'Processing redacteur job',
      jobId: job.id,
      prospectId: job.data.prospectId,
      channel: job.data.channel,
      category: job.data.category,
      sequenceId: job.data.routing?.sequenceId,
    });
    const dto = {
      prospectId: job.data.prospectId,
      channel: job.data.channel,
      templateId: job.data.templateId,
      category: job.data.category,
      routing: job.data.routing,
      breakdown: job.data.breakdown,
    };

    // B1 fix: Route LinkedIn to generateLinkedinMessage
    if (job.data.channel === 'linkedin') {
      await this.redacteurService.generateLinkedinMessage(dto);
    } else {
      await this.redacteurService.generateMessage(dto);
    }
  }
}
