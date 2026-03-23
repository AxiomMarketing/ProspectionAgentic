import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { SuiveurService } from '../../application/services/suiveur.service';
import { ExecuteStepSchema, ExecuteStepDto } from '../../application/dtos/execute-step.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';

@Controller('agents/suiveur')
export class SuiveurController {
  constructor(private readonly suiveurService: SuiveurService) {}

  @Post('execute-step')
  async executeStep(@Body(new ZodValidationPipe(ExecuteStepSchema)) dto: ExecuteStepDto) {
    return this.suiveurService.executeSequenceStep(dto);
  }

  @Get('sends/:prospectId')
  async getSends(@Param('prospectId') prospectId: string) {
    return this.suiveurService.getSendsByProspectId(prospectId);
  }
}
