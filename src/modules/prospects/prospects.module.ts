import { Module } from '@nestjs/common';
import { ProspectController } from './presentation/controllers/prospect.controller';
import { ProspectService } from './application/services/prospect.service';
import { IProspectRepository } from './domain/repositories/i-prospect.repository';
import { PrismaProspectRepository } from './infrastructure/repositories/prisma-prospect.repository';

@Module({
  controllers: [ProspectController],
  providers: [
    ProspectService,
    { provide: IProspectRepository, useClass: PrismaProspectRepository },
  ],
  exports: [ProspectService, IProspectRepository],
})
export class ProspectsModule {}
