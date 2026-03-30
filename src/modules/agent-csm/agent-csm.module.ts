import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailModule } from '@modules/email/email.module';
import { CsmService } from './application/services/csm.service';
import { OnboardingService } from './application/services/onboarding.service';
import { SatisfactionService } from './application/services/satisfaction.service';
import { UpsellService } from './application/services/upsell.service';
import { ReviewService } from './application/services/review.service';
import { ReferralService } from './application/services/referral.service';
import { CsmController } from './presentation/controllers/csm.controller';
import { ICustomerRepository } from './domain/repositories/i-customer.repository';
import { PrismaCustomerRepository } from './infrastructure/repositories/prisma-customer.repository';
import { IHealthScoreRepository } from './domain/repositories/i-health-score.repository';
import { PrismaHealthScoreRepository } from './infrastructure/repositories/prisma-health-score.repository';
import { CsmProcessor } from './infrastructure/jobs/csm.processor';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [
    EmailModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.CSM_ONBOARDING }),
    BullModule.registerQueue({ name: QUEUE_NAMES.VEILLEUR_REFERRAL_LEADS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.NURTURER_CHURNED_CLIENT }),
    BullModule.registerQueue({ name: QUEUE_NAMES.DEALMAKER_UPSELL }),
    BullModule.registerQueue({ name: QUEUE_NAMES.DEAD_LETTER_QUEUE }),
  ],
  controllers: [CsmController],
  providers: [
    CsmService,
    CsmProcessor,
    OnboardingService,
    SatisfactionService,
    UpsellService,
    ReviewService,
    ReferralService,
    { provide: ICustomerRepository, useClass: PrismaCustomerRepository },
    { provide: IHealthScoreRepository, useClass: PrismaHealthScoreRepository },
  ],
  exports: [CsmService],
})
export class AgentCsmModule {}
