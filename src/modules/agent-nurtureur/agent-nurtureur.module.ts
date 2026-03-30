import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NurtureurService, NURTURE_EMAIL_SERVICE_TOKEN } from './application/services/nurtureur.service';
import { NurtureEmailService } from './application/services/nurture-email.service';
import { ReScorerService } from './application/services/re-scorer.service';
import { NurtureEventListenerService } from './application/services/nurture-event-listener.service';
import { NurtureurController } from './presentation/controllers/nurtureur.controller';
import { INurtureSequenceRepository } from './domain/repositories/i-nurture-sequence.repository';
import { PrismaNurtureSequenceRepository } from './infrastructure/repositories/prisma-nurture-sequence.repository';
import { NurtureurProcessor } from './infrastructure/jobs/nurtureur.processor';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { LlmModule } from '@modules/llm/llm.module';
import { EmailModule } from '@modules/email/email.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.NURTURER_PIPELINE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.SCOREUR_PIPELINE }),
    LlmModule,
    EmailModule,
  ],
  controllers: [NurtureurController],
  providers: [
    NurtureurService,
    NurtureEmailService,
    ReScorerService,
    NurtureEventListenerService,
    NurtureurProcessor,
    { provide: INurtureSequenceRepository, useClass: PrismaNurtureSequenceRepository },
    { provide: NURTURE_EMAIL_SERVICE_TOKEN, useExisting: NurtureEmailService },
  ],
  exports: [NurtureurService, ReScorerService],
})
export class AgentNurtureurModule {}
