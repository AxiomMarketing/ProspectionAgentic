import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { AnalyzeTenderCommand } from './analyze-tender.command';
import { ITenderRepository } from '../../domain/repositories/i-tender.repository';
import { ILlmAdapter } from '@common/ports/i-llm.adapter';

@CommandHandler(AnalyzeTenderCommand)
export class AnalyzeTenderHandler implements ICommandHandler<AnalyzeTenderCommand> {
  private readonly logger = new Logger(AnalyzeTenderHandler.name);

  constructor(
    private readonly tenderRepository: ITenderRepository,
    private readonly llmAdapter: ILlmAdapter,
  ) {}

  async execute(command: AnalyzeTenderCommand): Promise<void> {
    this.logger.log({ msg: 'Analyzing tender DCE', tenderId: command.tenderId, forceReanalyze: command.forceReanalyze });
    // TODO: Implement DCE analysis logic using llmAdapter
  }
}
