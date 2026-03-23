import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CsmService } from '../../application/services/csm.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Processor(QUEUE_NAMES.CSM_ONBOARDING)
export class CsmProcessor extends WorkerHost {
  private readonly logger = new Logger(CsmProcessor.name);

  constructor(private readonly csmService: CsmService) {
    super();
  }

  async process(
    job: Job<{ dealId: string; prospectId: string; companyName?: string; mrrEur?: number }>,
  ): Promise<void> {
    this.logger.log({
      msg: 'Processing CSM onboarding job',
      jobId: job.id,
      dealId: job.data.dealId,
    });

    if (job.data.companyName && job.data.mrrEur && job.data.mrrEur > 0) {
      await this.csmService.onboardCustomer({
        companyName: job.data.companyName,
        mrrEur: job.data.mrrEur,
      });
    } else {
      this.logger.log({
        msg: 'CSM onboarding deferred — insufficient job data',
        dealId: job.data.dealId,
      });
    }
  }
}
