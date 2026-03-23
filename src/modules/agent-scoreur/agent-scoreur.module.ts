import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScoreurController } from './presentation/controllers/scoreur.controller';
import { ScoreurService } from './application/services/scoreur.service';
import { ScoringEngine } from './application/services/scoring-engine';
import { IProspectScoreRepository } from './domain/repositories/i-prospect-score.repository';
import { PrismaProspectScoreRepository } from './infrastructure/repositories/prisma-prospect-score.repository';
import { ScoreurProcessor } from './infrastructure/jobs/scoreur.processor';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.SCOREUR_PIPELINE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.REDACTEUR_PIPELINE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.NURTURER_PIPELINE }),
  ],
  controllers: [ScoreurController],
  providers: [
    ScoreurService,
    ScoringEngine,
    ScoreurProcessor,
    { provide: IProspectScoreRepository, useClass: PrismaProspectScoreRepository },
  ],
  exports: [ScoreurService],
})
export class AgentScoreurModule {}
