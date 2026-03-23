import { Controller, Post, Put, Body, Param } from '@nestjs/common';
import { DealmakerService } from '../../application/services/dealmaker.service';
import {
  CreateDealSchema,
  CreateDealDto,
  GenerateQuoteSchema,
  GenerateQuoteDto,
} from '../../application/dtos/dealmaker.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { DealStage } from '../../domain/entities/deal.entity';

@Controller('agents/dealmaker')
export class DealmakerController {
  constructor(private readonly dealmakerService: DealmakerService) {}

  @Post('deals')
  async createDeal(@Body(new ZodValidationPipe(CreateDealSchema)) dto: CreateDealDto) {
    return (await this.dealmakerService.createDeal(dto)).toPlainObject();
  }

  @Post('quotes')
  async generateQuote(@Body(new ZodValidationPipe(GenerateQuoteSchema)) dto: GenerateQuoteDto) {
    return (await this.dealmakerService.generateQuote(dto)).toPlainObject();
  }

  @Put('deals/:id/stage')
  async advanceStage(@Param('id') id: string, @Body() body: { stage: DealStage }) {
    return (await this.dealmakerService.advanceStage(id, body.stage)).toPlainObject();
  }
}
