import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NurtureurService } from './application/services/nurtureur.service';
import { NurtureurController } from './presentation/controllers/nurtureur.controller';
import { INurtureSequenceRepository } from './domain/repositories/i-nurture-sequence.repository';
import { PrismaNurtureSequenceRepository } from './infrastructure/repositories/prisma-nurture-sequence.repository';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.NURTURER_PIPELINE })],
  controllers: [NurtureurController],
  providers: [
    NurtureurService,
    { provide: INurtureSequenceRepository, useClass: PrismaNurtureSequenceRepository },
  ],
  exports: [NurtureurService],
})
export class AgentNurtureurModule {}
