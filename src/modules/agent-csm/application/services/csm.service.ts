import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@core/database/prisma.service';
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
    private readonly prisma: PrismaService,
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

  async calculateHealthScore(customerId: string): Promise<any> {
    const customer = await this.customerRepository.findById(customerId);
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

    const engagementScore = await this.calculateEngagement(customerId);
    const satisfactionScore = await this.calculateSatisfaction(customerId);
    const growthScore = await this.calculateGrowth(customerId);

    const healthScore = Math.round(
      engagementScore * 0.4 + satisfactionScore * 0.3 + growthScore * 0.3,
    );

    const healthLabel =
      healthScore >= 80
        ? 'green'
        : healthScore >= 60
          ? 'yellow'
          : healthScore >= 50
            ? 'orange'
            : healthScore >= 30
              ? 'dark_orange'
              : 'red';

    const score = HealthScore.create({
      customerId,
      healthScore,
      healthLabel,
      usageScore: engagementScore,
      supportScore: satisfactionScore,
      financialScore: growthScore,
      engagementScore,
      npsScore: undefined,
      signals: {},
    });

    const existing = await this.healthScoreRepository.findLatestByCustomerId(customerId);
    if (existing) {
      const superceded = existing.supercede();
      await this.healthScoreRepository.save(superceded);
    }
    await this.healthScoreRepository.save(score);

    this.logger.log({ msg: 'Health score calculated', customerId, healthScore, healthLabel });
    this.eventEmitter.emit('customer.health_scored', { customerId, healthScore, healthLabel });
    return score.toPlainObject();
  }

  async predictChurn(): Promise<any[]> {
    const churnRisk = await this.customerRepository.findChurnRisk(40);

    const silentCustomers = await this.prisma.customer.findMany({
      where: { status: 'active' },
      include: {
        deals: { orderBy: { updatedAt: 'desc' }, take: 1 },
      },
    });

    const atRisk = silentCustomers.filter((c) => {
      const lastActivity = c.deals[0]?.updatedAt;
      if (!lastActivity) return true;
      return Date.now() - lastActivity.getTime() > 60 * 24 * 60 * 60 * 1000;
    });

    return [
      ...churnRisk.map((c) => c.toPlainObject()),
      ...atRisk.map((c) => ({ ...c, churnReason: 'silence_60d' })),
    ];
  }

  private async calculateEngagement(customerId: string): Promise<number> {
    const recentEvents = await this.prisma.agentEvent.count({
      where: {
        prospectId: customerId,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });
    return Math.min(100, recentEvents * 10);
  }

  private async calculateSatisfaction(_customerId: string): Promise<number> {
    return 70;
  }

  private async calculateGrowth(customerId: string): Promise<number> {
    const customer = await this.customerRepository.findById(customerId);
    if (!customer) return 0;
    return customer.mrrEur > 0 ? Math.min(100, customer.mrrEur / 10) : 30;
  }
}
