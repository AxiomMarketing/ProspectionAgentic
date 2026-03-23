import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ScoreurService } from '../../application/services/scoreur.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Processor(QUEUE_NAMES.SCOREUR_PIPELINE)
export class ScoreurProcessor extends WorkerHost {
  private readonly logger = new Logger(ScoreurProcessor.name);

  constructor(private readonly scoreurService: ScoreurService) {
    super();
  }

  async process(job: Job<{ prospectId: string }>): Promise<void> {
    this.logger.log({
      msg: 'Processing scoring job',
      jobId: job.id,
      prospectId: job.data.prospectId,
    });
    await this.scoreurService.calculateScore({ prospectId: job.data.prospectId });
  }
}
