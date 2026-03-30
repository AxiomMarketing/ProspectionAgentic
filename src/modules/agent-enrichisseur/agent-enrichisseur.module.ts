import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { EnrichisseurController } from './presentation/controllers/enrichisseur.controller';
import { EnrichisseurService } from './application/services/enrichisseur.service';
import { EmailPatternService } from './application/services/email-pattern.service';
import { EnrichisseurProcessor } from './infrastructure/jobs/enrichisseur.processor';
import { InseeAdapter } from './infrastructure/adapters/insee.adapter';
import { PappersAdapter } from './infrastructure/adapters/pappers.adapter';
import { ReacherAdapter } from './infrastructure/adapters/reacher.adapter';
import { BodaccAdapter } from './infrastructure/adapters/bodacc.adapter';
import { InpiAdapter } from './infrastructure/adapters/inpi.adapter';
import { EmailFinderService } from './infrastructure/services/email-finder.service';
import { CompanyEnricherService } from './infrastructure/services/company-enricher.service';
import { TechEnrichmentService } from './infrastructure/services/tech-enrichment.service';
import { EnrichmentCacheService } from './infrastructure/services/enrichment-cache.service';
import { HunterAdapter } from './infrastructure/adapters/hunter.adapter';
import { DecideurSelectionService } from './infrastructure/services/decideur-selection.service';
import { IEmailVerifierAdapter } from '@common/ports/i-email-verifier.adapter';
import { ILegalNoticesAdapter } from '@common/ports/i-legal-notices.adapter';
import { ICompanyRegistryAdapter } from '@common/ports/i-company-registry.adapter';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';
import { AgentVeilleurModule } from '@modules/agent-veilleur/agent-veilleur.module';

@Module({
  imports: [
    HttpModule,
    AgentVeilleurModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.ENRICHISSEUR_PIPELINE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.SCOREUR_PIPELINE }),
  ],
  controllers: [EnrichisseurController],
  providers: [
    EnrichisseurService,
    EmailPatternService,
    EnrichisseurProcessor,
    EnrichmentCacheService,
    InseeAdapter,
    PappersAdapter,
    { provide: IEmailVerifierAdapter, useClass: ReacherAdapter },
    { provide: ILegalNoticesAdapter, useClass: BodaccAdapter },
    { provide: ICompanyRegistryAdapter, useClass: InpiAdapter },
    EmailFinderService,
    CompanyEnricherService,
    TechEnrichmentService,
    HunterAdapter,
    DecideurSelectionService,
  ],
  exports: [EnrichisseurService],
})
export class AgentEnrichisseurModule {}
