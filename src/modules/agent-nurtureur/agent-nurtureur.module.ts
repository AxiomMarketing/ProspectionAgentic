import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NurtureurService } from './application/services/nurtureur.service';
import { NurtureurController } from './presentation/controllers/nurtureur.controller';
import { INurtureSequenceRepository } from './domain/repositories/i-nurture-sequence.repository';
import { PrismaNurtureSequenceRepository } from './infrastructure/repositories/prisma-nurture-sequence.repository';
import { NurtureurProcessor } from './infrastructure/jobs/nurtureur.processor';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.NURTURER_PIPELINE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.SCOREUR_PIPELINE }),
  ],
  controllers: [NurtureurController],
  providers: [
    NurtureurService,
    NurtureurProcessor,
    { provide: INurtureSequenceRepository, useClass: PrismaNurtureSequenceRepository },
  ],
  exports: [NurtureurService],
})
export class AgentNurtureurModule {}
