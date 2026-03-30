import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { VeilleurController } from './presentation/controllers/veilleur.controller';
import { VeilleurService } from './application/services/veilleur.service';
import { IRawLeadRepository } from './domain/repositories/i-raw-lead.repository';
import { PrismaRawLeadRepository } from './infrastructure/repositories/prisma-raw-lead.repository';
import { IMarketDataAdapter } from '@common/ports/i-market-data.adapter';
import { BoampAdapter } from './infrastructure/adapters/boamp.adapter';
import { VeilleurProcessor } from './infrastructure/jobs/veilleur.processor';
import { WebScannerAdapter } from './infrastructure/adapters/web-scanner.adapter';
import { WebScanService } from './application/services/web-scan.service';
import { JobBoardScannerAdapter } from './infrastructure/adapters/jobboard-scanner.adapter';
import { JobBoardScanService } from './application/services/jobboard-scan.service';
import { NetrowsAdapter } from './infrastructure/adapters/linkedin/netrows.adapter';
import { SignalsApiAdapter } from './infrastructure/adapters/linkedin/signals-api.adapter';
import { RssFundingAdapter } from './infrastructure/adapters/linkedin/rss-funding.adapter';
import { LinkedInScanService } from './application/services/linkedin-scan.service';
import { DeduplicationService } from './application/services/deduplication.service';
import { PreScoringService } from './application/services/pre-scoring.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Module({
  imports: [
    HttpModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.VEILLEUR_PIPELINE },
      { name: QUEUE_NAMES.ENRICHISSEUR_PIPELINE },
      { name: QUEUE_NAMES.APPELS_OFFRES_PIPELINE },
    ),
  ],
  controllers: [VeilleurController],
  providers: [
    VeilleurService,
    VeilleurProcessor,
    { provide: IRawLeadRepository, useClass: PrismaRawLeadRepository },
    { provide: IMarketDataAdapter, useClass: BoampAdapter },
    // Sub-agent 1c — Web audit
    WebScannerAdapter,
    WebScanService,
    // Sub-agent 1d — Job boards
    JobBoardScannerAdapter,
    JobBoardScanService,
    // Sub-agent 1a — LinkedIn signals
    NetrowsAdapter,
    SignalsApiAdapter,
    RssFundingAdapter,
    LinkedInScanService,
    // Master orchestration
    DeduplicationService,
    PreScoringService,
  ],
  exports: [VeilleurService, WebScannerAdapter],
})
export class AgentVeilleurModule {}
