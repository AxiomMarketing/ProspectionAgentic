import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { VeilleurController } from './presentation/controllers/veilleur.controller';
import { VeilleurService } from './application/services/veilleur.service';
import { IRawLeadRepository } from './domain/repositories/i-raw-lead.repository';
import { PrismaRawLeadRepository } from './infrastructure/repositories/prisma-raw-lead.repository';
import { IMarketDataAdapter } from '@common/ports/i-market-data.adapter';
import { BoampAdapter } from './infrastructure/adapters/boamp.adapter';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [
    HttpModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.VEILLEUR_PIPELINE },
      { name: QUEUE_NAMES.ENRICHISSEUR_PIPELINE },
    ),
  ],
  controllers: [VeilleurController],
  providers: [
    VeilleurService,
    { provide: IRawLeadRepository, useClass: PrismaRawLeadRepository },
    { provide: IMarketDataAdapter, useClass: BoampAdapter },
  ],
  exports: [VeilleurService],
})
export class AgentVeilleurModule {}
