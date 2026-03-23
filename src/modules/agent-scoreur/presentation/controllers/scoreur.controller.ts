import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ScoreurService } from '../../application/services/scoreur.service';
import {
  CalculateScoreSchema,
  CalculateScoreDto,
} from '../../application/dtos/calculate-score.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';

@Controller('api/agents/scoreur')
export class ScoreurController {
  constructor(private readonly scoreurService: ScoreurService) {}

  @Post('calculate')
  async calculateScore(@Body(new ZodValidationPipe(CalculateScoreSchema)) dto: CalculateScoreDto) {
    return this.scoreurService.calculateScore(dto);
  }

  @Get('scores/:prospectId')
  async getScores(@Param('prospectId') prospectId: string) {
    return this.scoreurService.getScoresByProspectId(prospectId);
  }
}
