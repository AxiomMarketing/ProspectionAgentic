import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RedacteurController } from './presentation/controllers/redacteur.controller';
import { RedacteurService } from './application/services/redacteur.service';
import { ImpactCalculatorService } from './application/services/impact-calculator.service';
import { MessageValidatorService } from './application/services/message-validator.service';
import { IGeneratedMessageRepository } from './domain/repositories/i-generated-message.repository';
import { PrismaGeneratedMessageRepository } from './infrastructure/repositories/prisma-generated-message.repository';
import { RedacteurProcessor } from './infrastructure/jobs/redacteur.processor';
import { LlmModule } from '@modules/llm/llm.module';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';

@Module({
  imports: [
    LlmModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.REDACTEUR_PIPELINE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.SUIVEUR_PIPELINE }),
  ],
  controllers: [RedacteurController],
  providers: [
    RedacteurService,
    ImpactCalculatorService,
    MessageValidatorService,
    AgentEventLoggerService,
    RedacteurProcessor,
    { provide: IGeneratedMessageRepository, useClass: PrismaGeneratedMessageRepository },
  ],
  exports: [RedacteurService],
})
export class AgentRedacteurModule {}
