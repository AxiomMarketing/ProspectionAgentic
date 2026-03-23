import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { VeilleurService } from '../../application/services/veilleur.service';
import { DetectLeadSchema, DetectLeadDto } from '../../application/dtos/detect-lead.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';

@Controller('agents/veilleur')
export class VeilleurController {
  constructor(private readonly veilleurService: VeilleurService) {}

  @Post('detect')
  async detectLeads(@Body(new ZodValidationPipe(DetectLeadSchema)) dto: DetectLeadDto) {
    return this.veilleurService.detectLeads(dto);
  }

  @Get('leads/pending')
  async getPendingLeads(@Query('limit') limit?: string) {
    return this.veilleurService.getPendingLeads(limit ? parseInt(limit, 10) : undefined);
  }

  @Get('leads/:id')
  async getLeadById(@Param('id') id: string) {
    return this.veilleurService.getLeadById(id);
  }

  @Get('stats')
  async getStats() {
    return this.veilleurService.getLeadStats();
  }
}
