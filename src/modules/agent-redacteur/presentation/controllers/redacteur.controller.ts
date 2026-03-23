import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { RedacteurService } from '../../application/services/redacteur.service';
import {
  GenerateMessageSchema,
  GenerateMessageDto,
} from '../../application/dtos/generate-message.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';

@Controller('agents/redacteur')
export class RedacteurController {
  constructor(private readonly redacteurService: RedacteurService) {}

  @Post('generate')
  async generateMessage(
    @Body(new ZodValidationPipe(GenerateMessageSchema)) dto: GenerateMessageDto,
  ) {
    return this.redacteurService.generateMessage(dto);
  }

  @Post('generate-linkedin')
  async generateLinkedinMessage(
    @Body(new ZodValidationPipe(GenerateMessageSchema)) dto: GenerateMessageDto,
  ) {
    return this.redacteurService.generateLinkedinMessage(dto);
  }

  @Get('messages/:prospectId')
  async getMessages(@Param('prospectId') prospectId: string) {
    return this.redacteurService.getMessagesByProspectId(prospectId);
  }
}
