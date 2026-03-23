import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EnrichisseurController } from './presentation/controllers/enrichisseur.controller';
import { EnrichisseurService } from './application/services/enrichisseur.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.ENRICHISSEUR_PIPELINE })],
  controllers: [EnrichisseurController],
  providers: [EnrichisseurService],
  exports: [EnrichisseurService],
})
export class AgentEnrichisseurModule {}
