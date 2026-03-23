import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EnrichisseurService } from '../../application/services/enrichisseur.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Processor(QUEUE_NAMES.ENRICHISSEUR_PIPELINE)
export class EnrichisseurProcessor extends WorkerHost {
  private readonly logger = new Logger(EnrichisseurProcessor.name);

  constructor(private readonly enrichisseurService: EnrichisseurService) {
    super();
  }

  async process(job: Job<{ leadId: string; source: string; preScore: number }>): Promise<void> {
    this.logger.log({ msg: 'Processing enrichment job', jobId: job.id, leadId: job.data.leadId });
    await this.enrichisseurService.enrichProspect({ prospectId: job.data.leadId });
  }
}
