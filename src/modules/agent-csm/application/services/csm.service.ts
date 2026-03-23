import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ICustomerRepository } from '../../domain/repositories/i-customer.repository';
import { IHealthScoreRepository } from '../../domain/repositories/i-health-score.repository';
import { Customer } from '../../domain/entities/customer.entity';
import { HealthScore } from '../../domain/entities/health-score.entity';
import { OnboardCustomerDto } from '../dtos/onboard-customer.dto';

@Injectable()
export class CsmService {
  private readonly logger = new Logger(CsmService.name);

  constructor(
    private readonly customerRepository: ICustomerRepository,
    private readonly healthScoreRepository: IHealthScoreRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onboardCustomer(dto: OnboardCustomerDto): Promise<Customer> {
    this.logger.log({ msg: 'Onboarding customer', companyName: dto.companyName });
    const customer = Customer.create({
      companyName: dto.companyName,
      siren: dto.siren,
      primaryContactId: dto.primaryContactId,
      contractStartDate: dto.contractStartDate ? new Date(dto.contractStartDate) : undefined,
      mrrEur: dto.mrrEur,
      plan: dto.plan,
    });
    const saved = await this.customerRepository.save(customer);
    this.eventEmitter.emit('customer.onboarded', { customerId: saved.id });
    return saved;
  }

  async calculateHealthScore(customerId: string): Promise<HealthScore> {
    const customer = await this.customerRepository.findById(customerId);
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

    const existing = await this.healthScoreRepository.findLatestByCustomerId(customerId);
    if (existing) {
      // TODO: Wrap supercede + create in repository-level transaction
      await this.healthScoreRepository.save(existing.supercede());
    }

    // TODO: Implement scoring logic with real signals
    const healthScore = HealthScore.create({
      customerId,
      healthScore: 75,
      healthLabel: 'healthy',
      signals: {},
    });

    this.logger.log({ msg: 'Health score calculated', customerId, score: healthScore.healthScore });
    return this.healthScoreRepository.save(healthScore);
  }

  async predictChurn(): Promise<Customer[]> {
    return this.customerRepository.findChurnRisk(40);
  }
}
