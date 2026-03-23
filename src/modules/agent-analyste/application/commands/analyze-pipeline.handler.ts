import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { AnalyzePipelineCommand } from './analyze-pipeline.command';

@CommandHandler(AnalyzePipelineCommand)
export class AnalyzePipelineHandler implements ICommandHandler<AnalyzePipelineCommand> {
  private readonly logger = new Logger(AnalyzePipelineHandler.name);

  async execute(command: AnalyzePipelineCommand): Promise<void> {
    this.logger.log({ msg: 'Analyzing pipeline', dateFrom: command.dateFrom, dateTo: command.dateTo });
    // TODO: Implement pipeline analysis logic
  }
}
