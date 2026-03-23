import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthCheckService } from '@nestjs/terminus';
import { PrismaService } from '@core/database/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: { check: jest.Mock };

  beforeEach(async () => {
    healthCheckService = {
      check: jest.fn().mockResolvedValue({
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]) },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('check returns health result with ok status', async () => {
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.info?.database?.status).toBe('up');
  });

  it('check calls HealthCheckService.check', async () => {
    await controller.check();
    expect(healthCheckService.check).toHaveBeenCalledTimes(1);
  });
});
