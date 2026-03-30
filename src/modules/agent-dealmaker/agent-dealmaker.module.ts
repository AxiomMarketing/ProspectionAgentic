import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { DealmakerService } from './application/services/dealmaker.service';
import { QuoteGeneratorService } from './application/services/quote-generator.service';
import { DealFollowUpService } from './application/services/deal-followup.service';
import { YousignService } from './application/services/yousign.service';
import { PricingService } from './application/services/pricing.service';
import { DealmakerController } from './presentation/controllers/dealmaker.controller';
import { IDealRepository } from './domain/repositories/i-deal.repository';
import { PrismaDealRepository } from './infrastructure/repositories/prisma-deal.repository';
import { IQuoteRepository } from './domain/repositories/i-quote.repository';
import { PrismaQuoteRepository } from './infrastructure/repositories/prisma-quote.repository';
import { DealmakerProcessor } from './infrastructure/jobs/dealmaker.processor';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { LlmModule } from '@modules/llm/llm.module';
import { EmailModule } from '@modules/email/email.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.DEALMAKER_PIPELINE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.NURTURER_PIPELINE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.CSM_ONBOARDING }),
    LlmModule,
    EmailModule,
    HttpModule,
  ],
  controllers: [DealmakerController],
  providers: [
    DealmakerService,
    QuoteGeneratorService,
    DealFollowUpService,
    YousignService,
    PricingService,
    DealmakerProcessor,
    { provide: IDealRepository, useClass: PrismaDealRepository },
    { provide: IQuoteRepository, useClass: PrismaQuoteRepository },
  ],
  exports: [DealmakerService],
})
export class AgentDealmakerModule {}
