import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ScoreurService } from '../../application/services/scoreur.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Processor(QUEUE_NAMES.SCOREUR_PIPELINE)
export class ScoreurProcessor extends WorkerHost {
  private readonly logger = new Logger(ScoreurProcessor.name);

  constructor(
    private readonly scoreurService: ScoreurService,
    private readonly agentEventLogger: AgentEventLoggerService,
  ) {
    super();
  }

  async process(job: Job<{ prospectId: string }>): Promise<void> {
    if (!job.data?.prospectId) {
      this.logger.error({ msg: 'Invalid job data: missing prospectId', jobId: job.id });
      return;
    }

    this.logger.log({
      msg: 'Processing scoring job',
      jobId: job.id,
      prospectId: job.data.prospectId,
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Scoring timeout (30s)')), 30_000),
    );

    try {
      await Promise.race([
        this.scoreurService.calculateScore({ prospectId: job.data.prospectId }),
        timeout,
      ]);

      await this.agentEventLogger.log({
        agentName: 'scoreur',
        eventType: 'scoring_job_completed',
        jobId: String(job.id),
        prospectId: job.data.prospectId,
      });
    } catch (error) {
      this.logger.error({
        msg: 'Scoring job failed',
        jobId: job.id,
        error: (error as Error).message,
      });

      await this.agentEventLogger.log({
        agentName: 'scoreur',
        eventType: 'scoring_error',
        jobId: String(job.id),
        prospectId: job.data.prospectId,
        errorMessage: (error as Error).message,
      });

      throw error;
    }
  }
}
