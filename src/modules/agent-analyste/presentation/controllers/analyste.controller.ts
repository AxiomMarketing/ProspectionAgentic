import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AnalyzePipelineCommand } from '../../application/commands/analyze-pipeline.command';
import { GetPipelineMetricsQuery } from '../../application/queries/get-pipeline-metrics.query';

@Controller('agents/analyste')
export class AnalysteController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('analyze')
  async analyzePipeline(@Body() body: { dateFrom: string; dateTo: string; agentFilter?: string }) {
    return this.commandBus.execute(
      new AnalyzePipelineCommand(new Date(body.dateFrom), new Date(body.dateTo), body.agentFilter),
    );
  }

  @Get('metrics')
  async getMetrics(@Query('dateFrom') dateFrom: string, @Query('dateTo') dateTo: string) {
    return this.queryBus.execute(new GetPipelineMetricsQuery(new Date(dateFrom), new Date(dateTo)));
  }
}
