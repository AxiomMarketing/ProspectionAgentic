import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { VeilleurService } from '../../application/services/veilleur.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Processor(QUEUE_NAMES.VEILLEUR_PIPELINE)
export class VeilleurProcessor extends WorkerHost {
  private readonly logger = new Logger(VeilleurProcessor.name);

  constructor(private readonly veilleurService: VeilleurService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log({ msg: 'Processing veilleur job', jobName: job.name, jobId: job.id });

    switch (job.name) {
      case 'scan-boamp':
        await this.veilleurService.detectLeads({
          source: 'boamp',
          keywords: job.data.keywords ?? ['digital', 'numérique', 'site web', 'application', 'marketing'],
          sinceDays: 1,
          maxResults: job.data.maxResults ?? 50,
          minRelevanceScore: job.data.minRelevanceScore ?? 0,
        });
        break;

      case 'scan-web':
        await this.veilleurService.scanWebsites(job.data);
        break;

      case 'scan-jobboards':
        await this.veilleurService.scanJobBoards(job.data);
        break;

      case 'scan-linkedin':
        await this.veilleurService.scanLinkedIn(job.data);
        break;

      default:
        this.logger.warn({ msg: 'Unknown job name', jobName: job.name });
    }
  }
}
