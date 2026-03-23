import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SuiveurController } from './presentation/controllers/suiveur.controller';
import { SuiveurService } from './application/services/suiveur.service';
import { IMessageSendRepository } from './domain/repositories/i-message-send.repository';
import { PrismaMessageSendRepository } from './infrastructure/repositories/prisma-message-send.repository';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.SUIVEUR_PIPELINE })],
  controllers: [SuiveurController],
  providers: [
    SuiveurService,
    { provide: IMessageSendRepository, useClass: PrismaMessageSendRepository },
  ],
  exports: [SuiveurService],
})
export class AgentSuiveurModule {}
