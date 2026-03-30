import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SuiveurController } from './presentation/controllers/suiveur.controller';
import { SuiveurService } from './application/services/suiveur.service';
import { ResponseClassifierService } from './application/services/response-classifier.service';
import { SequenceOrchestratorService } from './application/services/sequence-orchestrator.service';
import { ActionHandlerService } from './application/services/action-handler.service';
import { ReplyEventListenerService } from './application/services/reply-event-listener.service';
import { BounceHandlerService } from './application/services/bounce-handler.service';
import { IMessageSendRepository } from './domain/repositories/i-message-send.repository';
import { PrismaMessageSendRepository } from './infrastructure/repositories/prisma-message-send.repository';
import { SuiveurProcessor } from './infrastructure/jobs/suiveur.processor';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { LlmModule } from '@modules/llm/llm.module';
import { EmailModule } from '@modules/email/email.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.SUIVEUR_PIPELINE },
      { name: QUEUE_NAMES.NURTURER_PIPELINE },
      { name: QUEUE_NAMES.ENRICHISSEUR_PIPELINE },
    ),
    LlmModule,
    EmailModule,
  ],
  controllers: [SuiveurController],
  providers: [
    SuiveurService,
    BounceHandlerService,
    ResponseClassifierService,
    SequenceOrchestratorService,
    ActionHandlerService,
    ReplyEventListenerService,
    SuiveurProcessor,
    { provide: IMessageSendRepository, useClass: PrismaMessageSendRepository },
  ],
  exports: [SuiveurService],
})
export class AgentSuiveurModule {}
