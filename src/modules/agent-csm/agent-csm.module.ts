import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CsmService } from './application/services/csm.service';
import { CsmController } from './presentation/controllers/csm.controller';
import { ICustomerRepository } from './domain/repositories/i-customer.repository';
import { PrismaCustomerRepository } from './infrastructure/repositories/prisma-customer.repository';
import { IHealthScoreRepository } from './domain/repositories/i-health-score.repository';
import { PrismaHealthScoreRepository } from './infrastructure/repositories/prisma-health-score.repository';
import { CsmProcessor } from './infrastructure/jobs/csm.processor';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.CSM_ONBOARDING })],
  controllers: [CsmController],
  providers: [
    CsmService,
    CsmProcessor,
    { provide: ICustomerRepository, useClass: PrismaCustomerRepository },
    { provide: IHealthScoreRepository, useClass: PrismaHealthScoreRepository },
  ],
  exports: [CsmService],
})
export class AgentCsmModule {}
