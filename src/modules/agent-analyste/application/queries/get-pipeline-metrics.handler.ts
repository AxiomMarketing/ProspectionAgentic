import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { GetPipelineMetricsQuery } from './get-pipeline-metrics.query';

@QueryHandler(GetPipelineMetricsQuery)
export class GetPipelineMetricsHandler implements IQueryHandler<GetPipelineMetricsQuery> {
  async execute(query: GetPipelineMetricsQuery): Promise<any[]> {
    // TODO: Implement metrics query
    return [];
  }
}
