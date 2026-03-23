import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/database/prisma.service';

describe('App Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Set the same global prefix as main.ts
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
  }, 30000);

  afterAll(async () => {
    // Clean up test data
    await prisma.agentEvent.deleteMany({});
    await prisma.replyClassification.deleteMany({});
    await prisma.linkedinAction.deleteMany({});
    await prisma.emailSend.deleteMany({});
    await prisma.generatedMessage.deleteMany({});
    await prisma.prospectScore.deleteMany({});
    await prisma.prospectSequence.deleteMany({});
    await prisma.bounceEvent.deleteMany({});
    await prisma.nurtureInteraction.deleteMany({});
    await prisma.nurtureProspect.deleteMany({});
    await prisma.rawLead.deleteMany({});
    await prisma.prospect.deleteMany({});
    await app.close();
  }, 30000);

  describe('Health', () => {
    it('GET /api/health should return ok', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          // Terminus returns { status, info, error, details } — TransformInterceptor wraps in data
          // In test context with interceptors applied via app, it may or may not wrap
          const body = res.body;
          const payload = body.data ?? body;
          expect(payload.status).toBe('ok');
          expect(payload.details?.database?.status ?? payload.info?.database?.status).toBe('up');
        });
    });
  });

  describe('Auth', () => {
    it('POST /api/auth/login should return 501 (not implemented)', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: '12345678' })
        .expect(501);
    });
  });

  describe('Protected Routes', () => {
    it('GET /api/prospects should return 401 without token', () => {
      return request(app.getHttpServer()).get('/api/prospects').expect(401);
    });

    it('GET /api/dashboard/metrics should return 401 without token', () => {
      return request(app.getHttpServer()).get('/api/dashboard/metrics').expect(401);
    });
  });

  describe('Database Operations', () => {
    it('should be able to create and query a prospect via Prisma', async () => {
      const prospect = await prisma.prospect.create({
        data: {
          firstName: 'Test',
          lastName: 'Integration',
          email: 'test-integ@example.com',
          companyName: 'Test Corp',
          status: 'raw',
        },
      });

      expect(prospect.id).toBeDefined();
      expect(prospect.firstName).toBe('Test');
      expect(prospect.status).toBe('raw');

      // Query it back
      const found = await prisma.prospect.findUnique({ where: { id: prospect.id } });
      expect(found).not.toBeNull();
      expect(found!.email).toBe('test-integ@example.com');

      // Clean up
      await prisma.prospect.delete({ where: { id: prospect.id } });
    });

    it('should be able to create a scoring coefficient', async () => {
      // The seed already created one, verify it exists
      const coef = await prisma.scoringCoefficient.findFirst({ where: { isActive: true } });
      expect(coef).not.toBeNull();
      expect(coef!.name).toBe('default');
    });
  });
});
