import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IGeneratedMessageRepository } from '../../domain/repositories/i-generated-message.repository';
import { ILlmAdapter } from '@common/ports/i-llm.adapter';
import { GeneratedMessage } from '../../domain/entities/generated-message.entity';
import { GenerateMessageDto } from '../dtos/generate-message.dto';

const EUR_PER_INPUT_TOKEN = 0.000003;
const EUR_PER_OUTPUT_TOKEN = 0.000015;

@Injectable()
export class RedacteurService {
  private readonly logger = new Logger(RedacteurService.name);

  constructor(
    private readonly generatedMessageRepository: IGeneratedMessageRepository,
    private readonly llmAdapter: ILlmAdapter,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async generateMessage(dto: GenerateMessageDto): Promise<GeneratedMessage> {
    this.logger.log({
      msg: 'Generating message',
      prospectId: dto.prospectId,
      channel: dto.channel,
    });

    const startMs = Date.now();

    // TODO: fetch prospect data and template from their respective repositories
    const systemPrompt = `You are an expert B2B sales copywriter. Generate a personalized ${dto.channel} message.`;
    const userPrompt = `Write a personalized ${dto.channel} prospecting message for prospect ${dto.prospectId}.`;

    const response = await this.llmAdapter.complete({
      model: 'claude-haiku-4-5-20251001',
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 500,
      temperature: 0.7,
    });

    const generationMs = Date.now() - startMs;
    const costEur =
      response.inputTokens * EUR_PER_INPUT_TOKEN + response.outputTokens * EUR_PER_OUTPUT_TOKEN;

    const subject = dto.channel === 'email' ? 'Proposition de partenariat' : '';
    const message = GeneratedMessage.create({
      prospectId: dto.prospectId,
      templateId: dto.templateId,
      channel: dto.channel,
      subject,
      body: response.content,
      modelUsed: response.model,
      promptTokens: response.inputTokens,
      completionTokens: response.outputTokens,
      costEur,
      generationMs,
    });

    const saved = await this.generatedMessageRepository.save(message);
    this.eventEmitter.emit('message.generated', {
      prospectId: dto.prospectId,
      messageId: saved.id,
      channel: dto.channel,
    });

    this.logger.log({
      msg: 'Message generated',
      prospectId: dto.prospectId,
      messageId: saved.id,
      costEur,
    });
    return saved;
  }

  async getMessagesByProspectId(prospectId: string): Promise<GeneratedMessage[]> {
    return this.generatedMessageRepository.findByProspectId(prospectId);
  }
}
