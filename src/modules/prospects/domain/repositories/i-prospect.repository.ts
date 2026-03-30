import { Prospect } from '../entities/prospect.entity';

export interface ProspectFilter {
  status?: string[];
  search?: string;
  segment?: string;
  scoreMin?: number;
  scoreMax?: number;
  source?: string;
  createdAfter?: Date;
  tags?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedProspects {
  data: Prospect[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export abstract class IProspectRepository {
  abstract findById(id: string): Promise<Prospect | null>;
  abstract findByEmail(email: string): Promise<Prospect | null>;
  abstract findByCompanyDomain(domain: string): Promise<Prospect[]>;
  abstract findAll(
    filter?: ProspectFilter,
    page?: number,
    pageSize?: number,
  ): Promise<PaginatedProspects>;
  abstract save(prospect: Prospect): Promise<Prospect>;
  abstract update(prospect: Prospect): Promise<Prospect>;
  abstract delete(id: string): Promise<void>;
  abstract updateScore(
    id: string,
    totalScore: number,
    breakdown?: Record<string, number>,
  ): Promise<void>;
  abstract countByStatus(): Promise<Record<string, number>>;
}
