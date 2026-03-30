import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { AppelsOffresService } from './application/services/appels-offres.service';
import { AppelsOffresController } from './presentation/controllers/appels-offres.controller';
import { AnalyzeTenderHandler } from './application/commands/analyze-tender.handler';
import { GetTenderAnalysisHandler } from './application/queries/get-tender-analysis.handler';
import { ITenderRepository } from './domain/repositories/i-tender.repository';
import { PrismaTenderRepository } from './infrastructure/repositories/prisma-tender.repository';
import { LlmModule } from '@modules/llm/llm.module';
import { PipelineOrchestratorService, APPELS_OFFRES_FLOW } from './application/services/pipeline-orchestrator.service';
import { DceAnalyzerService } from './application/services/dce-analyzer.service';
import { QualifierService } from './application/services/qualifier.service';
import { JuristeService } from './application/services/juriste.service';
import { ChiffreurService } from './application/services/chiffreur.service';
import { MemoireRedacteurService } from './application/services/memoire-redacteur.service';
import { ControleurQaService } from './application/services/controleur-qa.service';
import { MoniteurService } from './application/services/moniteur.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [
    CqrsModule,
    LlmModule,
    HttpModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.APPELS_OFFRES_PIPELINE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.DEALMAKER_PIPELINE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.CSM_ONBOARDING }),
    BullModule.registerFlowProducer({ name: APPELS_OFFRES_FLOW }),
  ],
  controllers: [AppelsOffresController],
  providers: [
    // Master orchestrator
    AppelsOffresService,
    PipelineOrchestratorService,

    // Sub-agents
    DceAnalyzerService,
    QualifierService,
    JuristeService,
    ChiffreurService,
    MemoireRedacteurService,
    ControleurQaService,
    MoniteurService,

    // CQRS handlers
    AnalyzeTenderHandler,
    GetTenderAnalysisHandler,

    // Repository
    { provide: ITenderRepository, useClass: PrismaTenderRepository },
  ],
  exports: [AppelsOffresService, PipelineOrchestratorService],
})
export class AgentAppelsOffresModule {}
