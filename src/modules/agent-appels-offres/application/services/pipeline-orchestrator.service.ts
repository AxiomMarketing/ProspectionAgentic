import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectFlowProducer } from '@nestjs/bullmq';
import { FlowProducer } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@core/database/prisma.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

export const AO_JOB_NAMES = {
  ANALYZE_DCE: 'ao:analyze-dce',
  QUALIFY: 'ao:qualify',
  JURISTE: 'ao:juriste',
  CHIFFREUR: 'ao:chiffreur',
  MEMOIRE_REDACTEUR: 'ao:memoire-redacteur',
  CONTROLE_QA: 'ao:controle-qa',
} as const;

export type AoPipelineStatus =
  | 'pending'
  | 'analyzing_dce'
  | 'qualifying'
  | 'parallel_analysis'
  | 'redacting'
  | 'qa_control'
  | 'completed'
  | 'failed'
  | 'ignored';

export const APPELS_OFFRES_FLOW = 'appels-offres-flow';

@Injectable()
export class PipelineOrchestratorService {
  private readonly logger = new Logger(PipelineOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectFlowProducer(APPELS_OFFRES_FLOW) private readonly flowProducer: FlowProducer,
    private readonly config: ConfigService,
  ) {}

  async orchestratePipeline(tenderId: string): Promise<void> {
    const tender = await (this.prisma as any).publicTender.findUnique({
      where: { id: tenderId },
      include: { aoAnalyse: true },
    });

    if (!tender) {
      throw new NotFoundException(`Tender ${tenderId} not found`);
    }

    let analyse = (tender as any).aoAnalyse;

    if (!analyse) {
      analyse = await (this.prisma as any).aoAnalyse.create({
        data: {
          tenderId,
          status: 'pending' as AoPipelineStatus,
        },
      });
    }

    const analyseId: string = analyse.id;

    this.logger.log({ msg: 'Starting AO pipeline', tenderId, analyseId });

    await (this.prisma as any).aoAnalyse.update({
      where: { id: analyseId },
      data: { status: 'analyzing_dce' as AoPipelineStatus, currentStep: AO_JOB_NAMES.ANALYZE_DCE },
    });

    const q = QUEUE_NAMES.APPELS_OFFRES_PIPELINE;
    const data = { tenderId, analyseId };

    // Flow: 9a → 9b → (9c // 9d // 9e) → 9f
    // FlowProducer processes children before parent, so tree is inverted:
    // controle-qa (9f) runs after all three parallel children complete
    await this.flowProducer.add({
      name: AO_JOB_NAMES.CONTROLE_QA,
      data,
      queueName: q,
      opts: { jobId: `${AO_JOB_NAMES.CONTROLE_QA}:${tenderId}`, removeOnComplete: false },
      children: [
        {
          name: AO_JOB_NAMES.JURISTE,
          data,
          queueName: q,
          opts: { jobId: `${AO_JOB_NAMES.JURISTE}:${tenderId}`, removeOnComplete: false },
          children: [
            {
              name: AO_JOB_NAMES.QUALIFY,
              data,
              queueName: q,
              opts: { jobId: `${AO_JOB_NAMES.QUALIFY}:${tenderId}`, removeOnComplete: false },
              children: [
                {
                  name: AO_JOB_NAMES.ANALYZE_DCE,
                  data,
                  queueName: q,
                  opts: { jobId: `${AO_JOB_NAMES.ANALYZE_DCE}:${tenderId}`, removeOnComplete: false },
                },
              ],
            },
          ],
        },
        {
          name: AO_JOB_NAMES.CHIFFREUR,
          data,
          queueName: q,
          opts: { jobId: `${AO_JOB_NAMES.CHIFFREUR}:${tenderId}`, removeOnComplete: false },
          children: [
            {
              name: AO_JOB_NAMES.QUALIFY,
              data,
              queueName: q,
              opts: { jobId: `${AO_JOB_NAMES.QUALIFY}:${tenderId}-chiffreur`, removeOnComplete: false },
            },
          ],
        },
        {
          name: AO_JOB_NAMES.MEMOIRE_REDACTEUR,
          data,
          queueName: q,
          opts: { jobId: `${AO_JOB_NAMES.MEMOIRE_REDACTEUR}:${tenderId}`, removeOnComplete: false },
          children: [
            {
              name: AO_JOB_NAMES.QUALIFY,
              data,
              queueName: q,
              opts: { jobId: `${AO_JOB_NAMES.QUALIFY}:${tenderId}-memoire`, removeOnComplete: false },
            },
          ],
        },
      ],
    });

    this.logger.log({
      msg: 'AO pipeline flow enqueued',
      tenderId,
      analyseId,
      flow: '9a → 9b → (9c // 9d // 9e) → 9f',
    });
  }

  async updateStepStatus(analyseId: string, step: string, status: AoPipelineStatus): Promise<void> {
    await (this.prisma as any).aoAnalyse.update({
      where: { id: analyseId },
      data: { status, currentStep: step },
    });
  }

  async markFailed(analyseId: string, errorMessage: string): Promise<void> {
    await (this.prisma as any).aoAnalyse.update({
      where: { id: analyseId },
      data: { status: 'failed' as AoPipelineStatus, errorMessage },
    });
  }

  async markCompleted(analyseId: string): Promise<void> {
    await (this.prisma as any).aoAnalyse.update({
      where: { id: analyseId },
      data: { status: 'completed' as AoPipelineStatus, currentStep: null },
    });
  }
}
