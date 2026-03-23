import { HealthScore } from '../entities/health-score.entity';

export abstract class IHealthScoreRepository {
  abstract findLatestByCustomerId(customerId: string): Promise<HealthScore | null>;
  abstract save(healthScore: HealthScore): Promise<HealthScore>;
}
