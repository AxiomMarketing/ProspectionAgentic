import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@core/database/prisma.service';
import { LlmService } from '@modules/llm/llm.service';
import { LlmTask } from '@modules/llm/llm.types';
import { IGeneratedMessageRepository } from '../../domain/repositories/i-generated-message.repository';
import { GeneratedMessage } from '../../domain/entities/generated-message.entity';
import { GenerateMessageDto } from '../dtos/generate-message.dto';
import { ImpactCalculatorService } from './impact-calculator.service';
import { MessageValidatorService } from './message-validator.service';
import { EMAIL_SYSTEM_PROMPT, LINKEDIN_SYSTEM_PROMPT, SEGMENT_CONTEXTS } from './prompt-templates';
import { ProspectNotFoundException } from '@common/exceptions/prospect-not-found.exception';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

export interface LinkedinMessageResult {
  connection_note: { content: string; character_count: number };
  post_connection_message: { content: string; character_count: number };
  prospectId: string;
  modelUsed: string;
  costEur: number;
  durationMs: number;
}

@Injectable()
export class RedacteurService {
  private readonly logger = new Logger(RedacteurService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generatedMessageRepository: IGeneratedMessageRepository,
    private readonly llmService: LlmService,
    private readonly impactCalculator: ImpactCalculatorService,
    private readonly messageValidator: MessageValidatorService,
    @InjectQueue(QUEUE_NAMES.SUIVEUR_PIPELINE) private readonly suiveurQueue: Queue,
  ) {}

  async generateMessage(dto: GenerateMessageDto): Promise<GeneratedMessage> {
    this.logger.log({
      msg: 'Generating message',
      prospectId: dto.prospectId,
      channel: dto.channel,
    });

    const prospect = await this.prisma.prospect.findUnique({
      where: { id: dto.prospectId },
      include: { scores: { where: { isLatest: true }, take: 1 } },
    });
    if (!prospect) throw new ProspectNotFoundException(dto.prospectId);

    const latestScore = prospect.scores[0];
    const segment: string = latestScore?.segment ?? 'pme_metro';
    const segmentContext = SEGMENT_CONTEXTS[segment] ?? SEGMENT_CONTEXTS['pme_metro'];

    const enrichmentData = prospect.enrichmentData as Record<string, unknown> | null;
    const lighthouseScore = (enrichmentData?.['lighthouse_score'] as number | undefined) ?? 60;
    const impactData = this.impactCalculator.calculatePerformanceImpact(
      lighthouseScore,
      prospect.companyRevenue ?? undefined,
    );

    const systemPrompt = `${EMAIL_SYSTEM_PROMPT}\n\n${segmentContext}`;
    const userPrompt = `Prospect: ${prospect.fullName ?? prospect.firstName ?? 'le dirigeant'} — ${prospect.jobTitle ?? 'Dirigeant'} chez ${prospect.companyName ?? "l'entreprise"}.
Site web: ${prospect.companyWebsite ?? 'inconnu'}.
Performance site: ${impactData.messageImpact}.
${impactData.perteCaMensuelle > 0 ? `Perte CA estimée: ${impactData.perteCaMensuelle}€/mois (${impactData.perteCaAnnuelle}€/an).` : ''}
Taux de rebond estimé: ${impactData.bounceRatePct}%.

Rédige un email froid B2B personnalisé. Réponds avec:
OBJET: [objet email]
CORPS:
[corps de l'email]`;

    let subject = '';
    let body = '';
    let llmResult = await this.llmService.call({
      task: LlmTask.GENERATE_EMAIL,
      systemPrompt,
      userPrompt,
      maxTokens: 600,
      temperature: 0.7,
    });

    const parsed = this.parseEmailResponse(llmResult.content);
    subject = parsed.subject;
    body = parsed.body;

    let validation = this.messageValidator.validate(subject, body);
    if (!validation.valid) {
      this.logger.warn({ msg: 'Message validation failed, retrying', errors: validation.errors });
      const retryPrompt = `${userPrompt}

IMPORTANT - Respect STRICTEMENT:
- Objet: 36-50 caractères
- Corps: 50-125 mots
- Erreurs précédentes à corriger: ${validation.errors.join('; ')}`;

      llmResult = await this.llmService.call({
        task: LlmTask.GENERATE_EMAIL,
        systemPrompt,
        userPrompt: retryPrompt,
        maxTokens: 600,
        temperature: 0.5,
      });

      const retryParsed = this.parseEmailResponse(llmResult.content);
      subject = retryParsed.subject;
      body = retryParsed.body;
      validation = this.messageValidator.validate(subject, body);
      if (!validation.valid) {
        this.logger.warn({
          msg: 'Message validation still failed after retry',
          errors: validation.errors,
        });
      }
    }

    const message = GeneratedMessage.create({
      prospectId: dto.prospectId,
      templateId: dto.templateId,
      channel: dto.channel,
      subject,
      body,
      modelUsed: llmResult.model,
      promptTokens: llmResult.inputTokens,
      completionTokens: llmResult.outputTokens,
      costEur: llmResult.costEur,
      generationMs: llmResult.durationMs,
    });

    const saved = await this.generatedMessageRepository.save(message);

    await this.suiveurQueue.add('message.generated', {
      prospectId: dto.prospectId,
      messageId: saved.id,
      channel: dto.channel,
    });

    this.logger.log({
      msg: 'Message generated',
      prospectId: dto.prospectId,
      messageId: saved.id,
      costEur: llmResult.costEur,
    });

    return saved;
  }

  async generateLinkedinMessage(dto: GenerateMessageDto): Promise<LinkedinMessageResult> {
    this.logger.log({
      msg: 'Generating LinkedIn message',
      prospectId: dto.prospectId,
    });

    const prospect = await this.prisma.prospect.findUnique({
      where: { id: dto.prospectId },
      include: { scores: { where: { isLatest: true }, take: 1 } },
    });
    if (!prospect) throw new ProspectNotFoundException(dto.prospectId);

    const latestScore = prospect.scores[0];
    const segment: string = latestScore?.segment ?? 'pme_metro';
    const segmentContext = SEGMENT_CONTEXTS[segment] ?? SEGMENT_CONTEXTS['pme_metro'];

    const enrichmentData = prospect.enrichmentData as Record<string, unknown> | null;
    const lighthouseScore = (enrichmentData?.['lighthouse_score'] as number | undefined) ?? 60;
    const impactData = this.impactCalculator.calculatePerformanceImpact(
      lighthouseScore,
      prospect.companyRevenue ?? undefined,
    );

    const systemPrompt = `${LINKEDIN_SYSTEM_PROMPT}\n\n${segmentContext}`;
    const userPrompt = `Prospect: ${prospect.fullName ?? prospect.firstName ?? 'le dirigeant'} — ${prospect.jobTitle ?? 'Dirigeant'} chez ${prospect.companyName ?? "l'entreprise"}.
Signal d'achat: ${impactData.messageImpact}.
${impactData.perteCaMensuelle > 0 ? `Impact estimé: ${impactData.perteCaMensuelle}€/mois.` : ''}

Génère une connection note et un post-connection message LinkedIn.`;

    const llmResult = await this.llmService.call({
      task: LlmTask.GENERATE_LINKEDIN_MESSAGE,
      systemPrompt,
      userPrompt,
      maxTokens: 400,
      temperature: 0.7,
    });

    const parsed = this.parseLinkedinResponse(llmResult.content);

    this.logger.log({
      msg: 'LinkedIn message generated',
      prospectId: dto.prospectId,
      costEur: llmResult.costEur,
    });

    return {
      ...parsed,
      prospectId: dto.prospectId,
      modelUsed: llmResult.model,
      costEur: llmResult.costEur,
      durationMs: llmResult.durationMs,
    };
  }

  async getMessagesByProspectId(prospectId: string): Promise<GeneratedMessage[]> {
    return this.generatedMessageRepository.findByProspectId(prospectId);
  }

  private parseEmailResponse(content: string): { subject: string; body: string } {
    const subjectMatch = content.match(/OBJET\s*:\s*(.+)/i);
    const corpsMatch = content.match(/CORPS\s*:\s*([\s\S]+)/i);

    const subject = subjectMatch
      ? subjectMatch[1].trim()
      : 'Améliorer les performances de votre site';
    const body = corpsMatch ? corpsMatch[1].trim() : content.trim();

    return { subject, body };
  }

  private parseLinkedinResponse(content: string): {
    connection_note: { content: string; character_count: number };
    post_connection_message: { content: string; character_count: number };
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          connection_note: { content: string; character_count: number };
          post_connection_message: { content: string; character_count: number };
        };
        return parsed;
      }
    } catch {
      this.logger.warn({ msg: 'Failed to parse LinkedIn JSON response, using fallback' });
    }

    const fallbackNote = `Bonjour, j'ai remarqué votre travail chez ${'{entreprise}'}. Je serais ravi d'échanger.`;
    const fallbackMsg = `Merci pour votre acceptation ! Je travaille chez Axiom Marketing sur des sujets de performance web. Votre profil m'a interpellé, serait-il pertinent d'échanger ?`;

    return {
      connection_note: { content: fallbackNote, character_count: fallbackNote.length },
      post_connection_message: { content: fallbackMsg, character_count: fallbackMsg.length },
    };
  }
}
