import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { AnalyzeTenderCommand } from './analyze-tender.command';
import { ITenderRepository } from '../../domain/repositories/i-tender.repository';
import { LlmService } from '@modules/llm/llm.service';
import { LlmTask } from '@modules/llm/llm.types';

@CommandHandler(AnalyzeTenderCommand)
export class AnalyzeTenderHandler implements ICommandHandler<AnalyzeTenderCommand> {
  private readonly logger = new Logger(AnalyzeTenderHandler.name);

  constructor(
    private readonly tenderRepository: ITenderRepository,
    private readonly llmService: LlmService,
  ) {}

  async execute(command: AnalyzeTenderCommand): Promise<void> {
    this.logger.log({
      msg: 'Analyzing tender DCE',
      tenderId: command.tenderId,
      forceReanalyze: command.forceReanalyze,
    });

    const tender = await this.tenderRepository.findById(command.tenderId);
    if (!tender) throw new Error(`Tender not found: ${command.tenderId}`);

    const result = await this.llmService.call({
      task: LlmTask.ANALYZE_DCE,
      systemPrompt: `Tu es un expert en marchés publics français. Analyse cet appel d'offres et détermine:
1. Pertinence pour Axiom Marketing (agence web: sites, e-commerce, tracking, RGAA)
2. Score de fit (0-100)
3. Décision GO/NO-GO
4. Exigences clés extraites

Réponds en JSON: { "fit_score": N, "decision": "GO|NO_GO|A_EVALUER", "exigences": ["..."], "raison": "..." }`,
      userPrompt: `APPEL D'OFFRES:
Titre: ${tender.title}
Acheteur: ${tender.buyerName ?? 'Inconnu'}
Description: ${tender.description ?? 'Non disponible'}
Montant estimé: ${tender.estimatedAmount ?? 'Non spécifié'} EUR
Deadline: ${tender.deadlineDate?.toISOString() ?? 'Non spécifié'}`,
      maxTokens: 800,
    });

    try {
      const analysis = JSON.parse(result.content);
      const analyzed = tender.markAnalyzed(analysis.fit_score ?? 0);
      await this.tenderRepository.update(analyzed);
    } catch {
      const analyzed = tender.markAnalyzed(0);
      await this.tenderRepository.update(analyzed);
    }
  }
}
