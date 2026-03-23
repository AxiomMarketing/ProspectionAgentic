import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SuiveurService } from '../../application/services/suiveur.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

export interface SuiveurExecuteStepJobData {
  prospectId: string;
  sequenceId: string;
  step: number;
}

export interface SuiveurProcessReplyJobData {
  prospectId: string;
  sequenceId: string;
  messageSendId: string;
  replyBody: string;
  fromAddress: string;
  subject: string;
  prospectName: string;
  prospectCompany: string;
  prospectPoste: string;
  lastMessageSent: string;
}

export type SuiveurJobData = SuiveurExecuteStepJobData | SuiveurProcessReplyJobData;

@Processor(QUEUE_NAMES.SUIVEUR_PIPELINE)
export class SuiveurProcessor extends WorkerHost {
  private readonly logger = new Logger(SuiveurProcessor.name);

  constructor(private readonly suiveurService: SuiveurService) {
    super();
  }

  async process(job: Job<SuiveurJobData>): Promise<void> {
    this.logger.log({ msg: 'Processing suiveur job', jobId: job.id, jobName: job.name });

    if (job.name === 'execute-step') {
      const data = job.data as SuiveurExecuteStepJobData;
      await this.suiveurService.executeSequenceStep({
        prospectId: data.prospectId,
        sequenceId: data.sequenceId,
      });
      return;
    }

    if (job.name === 'process-reply') {
      const data = job.data as SuiveurProcessReplyJobData;
      await this.suiveurService.processReply({
        prospectId: data.prospectId,
        sequenceId: data.sequenceId,
        messageSendId: data.messageSendId,
        replyBody: data.replyBody,
        fromAddress: data.fromAddress,
        subject: data.subject,
        prospectName: data.prospectName,
        prospectCompany: data.prospectCompany,
        prospectPoste: data.prospectPoste,
        lastMessageSent: data.lastMessageSent,
      });
      return;
    }

    if (job.name === 'detect-responses') {
      await this.suiveurService.detectResponses();
      return;
    }

    this.logger.warn({ msg: 'Unknown job name', jobName: job.name, jobId: job.id });
  }
}
