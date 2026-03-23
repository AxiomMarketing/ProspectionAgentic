import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AppelsOffresService } from './application/services/appels-offres.service';
import { AppelsOffresController } from './presentation/controllers/appels-offres.controller';
import { AnalyzeTenderHandler } from './application/commands/analyze-tender.handler';
import { GetTenderAnalysisHandler } from './application/queries/get-tender-analysis.handler';
import { ITenderRepository } from './domain/repositories/i-tender.repository';
import { PrismaTenderRepository } from './infrastructure/repositories/prisma-tender.repository';

@Module({
  imports: [CqrsModule],
  controllers: [AppelsOffresController],
  providers: [
    AppelsOffresService,
    AnalyzeTenderHandler,
    GetTenderAnalysisHandler,
    { provide: ITenderRepository, useClass: PrismaTenderRepository },
  ],
  exports: [AppelsOffresService],
})
export class AgentAppelsOffresModule {}
