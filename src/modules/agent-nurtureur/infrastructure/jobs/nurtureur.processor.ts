import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NurtureurService } from '../../application/services/nurtureur.service';
import { NurtureEmailService } from '../../application/services/nurture-email.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import {
  StartNurtureSchema,
  ProcessNurtureStepSchema,
} from '../../application/dtos/start-nurture.dto';
import { z } from 'zod';

const ExecuteNurtureStepSchema = z.object({
  prospectId: z.string().uuid(),
  step: z.union([z.number().int().min(0), z.string()]),
});

const CheckRePermissionResponseSchema = z.object({
  prospectId: z.string().uuid(),
});

const SunsetProspectSchema = z.object({
  prospectId: z.string().uuid(),
});

@Processor(QUEUE_NAMES.NURTURER_PIPELINE)
export class NurtureurProcessor extends WorkerHost {
  private readonly logger = new Logger(NurtureurProcessor.name);

  constructor(
    private readonly nurtureurService: NurtureurService,
    private readonly nurtureEmailService: NurtureEmailService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log({
      msg: 'Processing nurture job',
      jobName: job.name,
      jobId: job.id,
      category: (job.data as { category?: string }).category,
    });

    try {
      switch (job.name) {
        case 'nurture-prospect':
        case 'start-nurture': {
          const data = StartNurtureSchema.parse(job.data);
          await this.nurtureurService.startNurture(data);
          break;
        }
        case 'process-nurture-step': {
          const data = ProcessNurtureStepSchema.parse(job.data);
          await this.nurtureurService.processNurtureStep(data.prospectId);
          break;
        }
        case 'execute-nurture-step': {
          const data = ExecuteNurtureStepSchema.parse(job.data);
          if (data.step === 're_permission') {
            await this.nurtureEmailService.sendRePermissionEmail(data.prospectId);
          } else {
            await this.nurtureEmailService.startReEngagementSequence(data.prospectId);
          }
          break;
        }
        case 'check-re-permission-response': {
          const data = CheckRePermissionResponseSchema.parse(job.data);
          await this.nurtureurService.checkSunset();
          this.logger.log({ msg: 'Re-permission response check done', prospectId: data.prospectId });
          break;
        }
        case 'sunset-prospect': {
          const data = SunsetProspectSchema.parse(job.data);
          await this.nurtureurService.checkSunset();
          this.logger.log({ msg: 'Sunset prospect check done', prospectId: data.prospectId });
          break;
        }
        case 're-engagement-check':
          await this.nurtureurService.checkReEngagement();
          break;
        case 'sunset-check':
          await this.nurtureurService.checkSunset();
          break;
        default:
          this.logger.warn({ msg: 'Unknown job name', jobName: job.name });
      }
    } catch (error: any) {
      this.logger.error({
        msg: 'Nurture job failed',
        jobName: job.name,
        jobId: job.id,
        error: error?.message,
      });
    }
  }
}
