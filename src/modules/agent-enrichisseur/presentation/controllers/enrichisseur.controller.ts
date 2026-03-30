import { Controller, Get, Post, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { EnrichisseurService } from '../../application/services/enrichisseur.service';
import {
  EnrichProspectSchema,
  EnrichProspectDto,
} from '../../application/dtos/enrich-prospect.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';

@Controller('agents/enrichisseur')
export class EnrichisseurController {
  constructor(private readonly enrichisseurService: EnrichisseurService) {}

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('enrich')
  async enrichProspect(@Body(new ZodValidationPipe(EnrichProspectSchema)) dto: EnrichProspectDto) {
    return this.enrichisseurService.enrichProspect(dto);
  }

  @Get('status/:prospectId')
  async getStatus(@Param('prospectId', new ParseUUIDPipe()) prospectId: string) {
    return this.enrichisseurService.getEnrichmentStatus(prospectId);
  }
}
