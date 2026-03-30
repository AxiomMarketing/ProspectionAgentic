import { Controller, Get, Post, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RedacteurService } from '../../application/services/redacteur.service';
import {
  GenerateMessageSchema,
  GenerateMessageDto,
} from '../../application/dtos/generate-message.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';

@Controller('agents/redacteur')
@UseGuards(JwtAuthGuard)
export class RedacteurController {
  constructor(private readonly redacteurService: RedacteurService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('generate')
  async generateMessage(
    @Body(new ZodValidationPipe(GenerateMessageSchema)) dto: GenerateMessageDto,
  ) {
    return this.redacteurService.generateMessage(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('generate-linkedin')
  async generateLinkedinMessage(
    @Body(new ZodValidationPipe(GenerateMessageSchema)) dto: GenerateMessageDto,
  ) {
    return this.redacteurService.generateLinkedinMessage(dto);
  }

  @Get('messages/:prospectId')
  async getMessages(@Param('prospectId', new ParseUUIDPipe()) prospectId: string) {
    return this.redacteurService.getMessagesByProspectId(prospectId);
  }
}
