import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';

@Injectable()
export class AgentEventLoggerService {
  private readonly logger = new Logger(AgentEventLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    agentName: string;
    eventType: string;
    jobId?: string;
    prospectId?: string;
    payload?: Record<string, unknown>;
    result?: Record<string, unknown>;
    errorMessage?: string;
    durationMs?: number;
  }): Promise<void> {
    try {
      await this.prisma.agentEvent.create({
        data: {
          agentName: params.agentName,
          eventType: params.eventType,
          jobId: params.jobId,
          prospectId: params.prospectId,
          payload: params.payload ? JSON.parse(JSON.stringify(params.payload)) : undefined,
          result: params.result ? JSON.parse(JSON.stringify(params.result)) : undefined,
          errorMessage: params.errorMessage,
          durationMs: params.durationMs,
        },
      });
    } catch (error) {
      // Never let event logging crash the pipeline
      this.logger.warn({
        msg: 'Failed to log agent event',
        agentName: params.agentName,
        error: (error as Error).message,
      });
    }
  }
}
