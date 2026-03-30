import { Controller, Get, Post, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ScoreurService } from '../../application/services/scoreur.service';
import {
  CalculateScoreSchema,
  CalculateScoreDto,
} from '../../application/dtos/calculate-score.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';

@Controller('agents/scoreur')
export class ScoreurController {
  constructor(private readonly scoreurService: ScoreurService) {}

  @UseGuards(JwtAuthGuard)
  @Post('calculate')
  async calculateScore(@Body(new ZodValidationPipe(CalculateScoreSchema)) dto: CalculateScoreDto) {
    const result = await this.scoreurService.calculateScore(dto);
    // S4: Only return safe fields, not full breakdown
    return {
      id: result.id,
      prospectId: result.prospectId,
      totalScore: result.totalScore,
      segment: result.segment,
      calculatedAt: result.calculatedAt,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('scores/:prospectId')
  async getScores(@Param('prospectId', new ParseUUIDPipe()) prospectId: string) {
    return this.scoreurService.getScoresByProspectId(prospectId);
  }
}
