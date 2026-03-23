import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DealmakerService } from './application/services/dealmaker.service';
import { DealmakerController } from './presentation/controllers/dealmaker.controller';
import { IDealRepository } from './domain/repositories/i-deal.repository';
import { PrismaDealRepository } from './infrastructure/repositories/prisma-deal.repository';
import { IQuoteRepository } from './domain/repositories/i-quote.repository';
import { PrismaQuoteRepository } from './infrastructure/repositories/prisma-quote.repository';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.DEALMAKER_PIPELINE }),
  ],
  controllers: [DealmakerController],
  providers: [
    DealmakerService,
    { provide: IDealRepository, useClass: PrismaDealRepository },
    { provide: IQuoteRepository, useClass: PrismaQuoteRepository },
  ],
  exports: [DealmakerService],
})
export class AgentDealmakerModule {}
