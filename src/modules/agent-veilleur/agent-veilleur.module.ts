import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VeilleurController } from './presentation/controllers/veilleur.controller';
import { VeilleurService } from './application/services/veilleur.service';
import { IRawLeadRepository } from './domain/repositories/i-raw-lead.repository';
import { PrismaRawLeadRepository } from './infrastructure/repositories/prisma-raw-lead.repository';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.VEILLEUR_PIPELINE })],
  controllers: [VeilleurController],
  providers: [
    VeilleurService,
    { provide: IRawLeadRepository, useClass: PrismaRawLeadRepository },
  ],
  exports: [VeilleurService],
})
export class AgentVeilleurModule {}
