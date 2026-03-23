import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { GetTenderAnalysisQuery } from './get-tender-analysis.query';
import { ITenderRepository } from '../../domain/repositories/i-tender.repository';

@QueryHandler(GetTenderAnalysisQuery)
export class GetTenderAnalysisHandler implements IQueryHandler<GetTenderAnalysisQuery> {
  constructor(private readonly tenderRepository: ITenderRepository) {}

  async execute(query: GetTenderAnalysisQuery): Promise<any | null> {
    const tender = await this.tenderRepository.findById(query.tenderId);
    if (!tender) return null;
    return tender.toPlainObject();
  }
}
