import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RedacteurController } from './presentation/controllers/redacteur.controller';
import { RedacteurService } from './application/services/redacteur.service';
import { IGeneratedMessageRepository } from './domain/repositories/i-generated-message.repository';
import { PrismaGeneratedMessageRepository } from './infrastructure/repositories/prisma-generated-message.repository';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.REDACTEUR_PIPELINE })],
  controllers: [RedacteurController],
  providers: [
    RedacteurService,
    { provide: IGeneratedMessageRepository, useClass: PrismaGeneratedMessageRepository },
  ],
  exports: [RedacteurService],
})
export class AgentRedacteurModule {}
