import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SuiveurService } from '../../application/services/suiveur.service';
import { PrismaService } from '@core/database/prisma.service';
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

  constructor(
    private readonly suiveurService: SuiveurService,
    private readonly prisma: PrismaService,
  ) {
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

    if (job.name === 'message.generated') {
      // sequenceId may not be provided by Rédacteur — look up active sequence for this prospect
      let sequenceId = job.data.sequenceId;
      if (!sequenceId && job.data.prospectId) {
        const activeSequence = await this.prisma.prospectSequence.findFirst({
          where: { prospectId: job.data.prospectId, status: 'active' },
          orderBy: { createdAt: 'desc' },
        });
        if (!activeSequence) {
          // Create a default sequence for this prospect
          // B12: Use category to select correct sequence
          const category = (job.data as any).category ?? 'HOT_C';
          const CATEGORY_SEQUENCE: Record<string, { name: string; steps: number }> = {
            HOT_A: { name: 'seq_hot_a_vip', steps: 4 },
            HOT_B: { name: 'seq_hot_b_standard', steps: 4 },
            HOT_C: { name: 'seq_hot_c_nurture', steps: 4 },
            WARM: { name: 'seq_warm_nurture', steps: 5 },
            COLD: { name: 'seq_cold_newsletter', steps: 7 },
          };
          const seqConfig = CATEGORY_SEQUENCE[category] ?? CATEGORY_SEQUENCE.HOT_C;
          const newSequence = await this.prisma.prospectSequence.create({
            data: {
              prospectId: job.data.prospectId,
              name: seqConfig.name,
              channel: (job.data as any).channel ?? 'email',
              totalSteps: seqConfig.steps,
              currentStep: 0,
              status: 'active',
              startedAt: new Date(),
            },
          });
          sequenceId = newSequence.id;
        } else {
          sequenceId = activeSequence.id;
        }
      }
      await this.suiveurService.executeSequenceStep({
        prospectId: job.data.prospectId,
        sequenceId: sequenceId ?? '',
      });
      return;
    }

    this.logger.warn({ msg: 'Unknown job name', jobName: job.name, jobId: job.id });
  }
}
