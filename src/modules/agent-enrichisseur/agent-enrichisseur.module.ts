import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EnrichisseurController } from './presentation/controllers/enrichisseur.controller';
import { EnrichisseurService } from './application/services/enrichisseur.service';
import { EmailPatternService } from './application/services/email-pattern.service';
import { EnrichisseurProcessor } from './infrastructure/jobs/enrichisseur.processor';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.ENRICHISSEUR_PIPELINE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.SCOREUR_PIPELINE }),
  ],
  controllers: [EnrichisseurController],
  providers: [EnrichisseurService, EmailPatternService, EnrichisseurProcessor],
  exports: [EnrichisseurService],
})
export class AgentEnrichisseurModule {}
