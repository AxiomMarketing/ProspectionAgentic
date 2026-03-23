import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NurtureurService } from '../../application/services/nurtureur.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Processor(QUEUE_NAMES.NURTURER_PIPELINE)
export class NurtureurProcessor extends WorkerHost {
  private readonly logger = new Logger(NurtureurProcessor.name);

  constructor(private readonly nurtureurService: NurtureurService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log({ msg: 'Processing nurture job', jobName: job.name, jobId: job.id });

    switch (job.name) {
      case 'start-nurture':
        await this.nurtureurService.startNurture(job.data);
        break;
      case 'process-nurture-step':
        await this.nurtureurService.processNurtureStep(job.data.prospectId);
        break;
      case 're-engagement-check':
        await this.nurtureurService.checkReEngagement();
        break;
      case 'sunset-check':
        await this.nurtureurService.checkSunset();
        break;
      default:
        this.logger.warn({ msg: 'Unknown job name', jobName: job.name });
    }
  }
}
