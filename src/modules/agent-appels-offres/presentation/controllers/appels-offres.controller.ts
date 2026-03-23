import { Controller, Post, Get, Param, Query, Body } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AnalyzeTenderCommand } from '../../application/commands/analyze-tender.command';
import { GetTenderAnalysisQuery } from '../../application/queries/get-tender-analysis.query';

@Controller('api/agents/appels-offres')
export class AppelsOffresController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('tenders/:id/analyze')
  async analyzeTender(
    @Param('id') id: string,
    @Body() body: { forceReanalyze?: boolean },
  ) {
    return this.commandBus.execute(
      new AnalyzeTenderCommand(id, body.forceReanalyze ?? false),
    );
  }

  @Get('tenders/:id/analysis')
  async getTenderAnalysis(
    @Param('id') id: string,
    @Query('includeHistory') includeHistory?: string,
  ) {
    return this.queryBus.execute(
      new GetTenderAnalysisQuery(id, includeHistory === 'true'),
    );
  }
}
