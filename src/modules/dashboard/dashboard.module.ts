import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.VEILLEUR_PIPELINE },
      { name: QUEUE_NAMES.ENRICHISSEUR_PIPELINE },
      { name: QUEUE_NAMES.SCOREUR_PIPELINE },
      { name: QUEUE_NAMES.SUIVEUR_PIPELINE },
      { name: QUEUE_NAMES.NURTURER_PIPELINE },
    ),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
