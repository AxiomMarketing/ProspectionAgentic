import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { EnrichisseurService } from '../../application/services/enrichisseur.service';
import {
  EnrichProspectSchema,
  EnrichProspectDto,
} from '../../application/dtos/enrich-prospect.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';

@Controller('api/agents/enrichisseur')
export class EnrichisseurController {
  constructor(private readonly enrichisseurService: EnrichisseurService) {}

  @Post('enrich')
  async enrichProspect(@Body(new ZodValidationPipe(EnrichProspectSchema)) dto: EnrichProspectDto) {
    return this.enrichisseurService.enrichProspect(dto);
  }

  @Get('status/:prospectId')
  async getStatus(@Param('prospectId') prospectId: string) {
    return this.enrichisseurService.getEnrichmentStatus(prospectId);
  }
}
