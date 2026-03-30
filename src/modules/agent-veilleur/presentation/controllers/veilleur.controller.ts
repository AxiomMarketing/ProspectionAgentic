import { Controller, Get, Post, Body, Query, Param, ParseUUIDPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { VeilleurService } from '../../application/services/veilleur.service';
import { DetectLeadSchema, DetectLeadDto } from '../../application/dtos/detect-lead.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { Roles } from '@common/decorators/roles.decorator';

@Controller('agents/veilleur')
export class VeilleurController {
  constructor(private readonly veilleurService: VeilleurService) {}

  @Roles('admin', 'manager')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('detect')
  async detectLeads(@Body(new ZodValidationPipe(DetectLeadSchema)) dto: DetectLeadDto) {
    return this.veilleurService.detectLeads(dto);
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('leads/pending')
  async getPendingLeads(@Query('limit') limit?: string) {
    return this.veilleurService.getPendingLeads(limit ? parseInt(limit, 10) : undefined);
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('leads/:id')
  async getLeadById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.veilleurService.getLeadById(id);
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('stats')
  async getStats() {
    return this.veilleurService.getLeadStats();
  }
}
