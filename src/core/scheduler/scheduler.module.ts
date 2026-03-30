import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { AgentSchedulerService } from './agent-scheduler.service';
import { DeadLetterProcessor } from './dead-letter.processor';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { DeduplicationService } from '@modules/agent-veilleur/application/services/deduplication.service';
import { PreScoringService } from '@modules/agent-veilleur/application/services/pre-scoring.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.VEILLEUR_PIPELINE },
      { name: QUEUE_NAMES.SUIVEUR_PIPELINE },
      { name: QUEUE_NAMES.NURTURER_PIPELINE },
      { name: QUEUE_NAMES.CSM_ONBOARDING },
      { name: QUEUE_NAMES.DEAD_LETTER_QUEUE },
    ),
  ],
  providers: [AgentSchedulerService, DeadLetterProcessor, DeduplicationService, PreScoringService],
})
export class AgentSchedulerModule {}
