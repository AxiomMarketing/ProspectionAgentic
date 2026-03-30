import { Global, Module } from '@nestjs/common';
import { AgentEventLoggerService } from './services/agent-event-logger.service';

@Global()
@Module({
  providers: [AgentEventLoggerService],
  exports: [AgentEventLoggerService],
})
export class SharedModule {}
