import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { ReviewService } from './review.service';
import { PrismaService } from '@core/database/prisma.service';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { LlmService } from '@modules/llm/llm.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const makePrisma = (overrides: Partial<Record<string, any>> = {}) => ({
  reviewRequest: {
    create: jest.fn().mockResolvedValue({ id: 'rr-1' }),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  negativeReview: {
    create: jest.fn().mockResolvedValue({ id: 'nr-1' }),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  customer: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'cust-1',
      companyName: 'Acme Corp',
      primaryContactId: 'prospect-1',
      typeProjet: 'site_vitrine',
    }),
  },
  prospect: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'prospect-1',
      firstName: 'Jean',
      email: 'jean@acme.com',
    }),
  },
  ...overrides,
});

const makeConfig = (overrides: Record<string, any> = {}) => ({
  get: jest.fn((key: string, defaultVal?: any) => {
    const cfg: Record<string, any> = {
      'csm.reviewMinNps': 7,
      'csm.reviewRequestDelayDays': 5,
      'csm.reviewReminder1Days': 10,
      'csm.reviewReminder2Days': 15,
      'csm.reviewUrlGoogle': 'https://g.page/axiom',
      'csm.reviewUrlTrustpilot': 'https://trustpilot.com/axiom',
      'csm.reviewUrlClutch': 'https://clutch.co/axiom',
      'csm.reviewUrlSortlist': 'https://sortlist.com/axiom',
      'csm.reviewUrlLinkedin': 'https://linkedin.com/company/axiom',
      GMAIL_USER: 'no-reply@axiom-marketing.fr',
      ...overrides,
    };
    return cfg[key] ?? defaultVal;
  }),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ReviewService', () => {
  let service: ReviewService;
  let prisma: ReturnType<typeof makePrisma>;
  let emailAdapter: { sendEmail: jest.Mock; getUnreadReplies: jest.Mock; markAsRead: jest.Mock; isAvailable: jest.Mock };
  let llmService: { call: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let agentEventLogger: { log: jest.Mock };
  let configService: ReturnType<typeof makeConfig>;

  beforeEach(async () => {
    prisma = makePrisma();
    emailAdapter = {
      sendEmail: jest.fn().mockResolvedValue({ messageId: 'msg-1', accepted: [], rejected: [], provider: 'mock' }),
      getUnreadReplies: jest.fn().mockResolvedValue([]),
      markAsRead: jest.fn().mockResolvedValue(undefined),
      isAvailable: jest.fn().mockResolvedValue(true),
    };
    llmService = { call: jest.fn().mockResolvedValue({ content: 'Draft response text', model: 'claude-sonnet-4-20250514', inputTokens: 100, outputTokens: 50, costEur: 0.001, durationMs: 500 }) };
    eventEmitter = { emit: jest.fn() };
    agentEventLogger = { log: jest.fn() };
    configService = makeConfig();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewService,
        { provide: PrismaService, useValue: prisma },
        { provide: IEmailAdapter, useValue: emailAdapter },
        { provide: LlmService, useValue: llmService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: AgentEventLoggerService, useValue: agentEventLogger },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<ReviewService>(ReviewService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── requestReviews ────────────────────────────────────────────────────────

  describe('requestReviews', () => {
    it('NPS >= 9 targets all 5 platforms and creates ReviewRequest', async () => {
      await service.requestReviews('cust-1', 9);

      expect(prisma.reviewRequest.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.reviewRequest.create.mock.calls[0][0];
      expect(data.platformTargets).toHaveLength(5);
      expect(data.platformTargets).toContain('google');
      expect(data.platformTargets).toContain('trustpilot');
      expect(data.platformTargets).toContain('clutch');
      expect(data.platformTargets).toContain('sortlist');
      expect(data.platformTargets).toContain('linkedin');
    });

    it('NPS 7-8 targets only google and trustpilot', async () => {
      await service.requestReviews('cust-1', 7);

      expect(prisma.reviewRequest.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.reviewRequest.create.mock.calls[0][0];
      expect(data.platformTargets).toHaveLength(2);
      expect(data.platformTargets).toEqual(['google', 'trustpilot']);
    });

    it('NPS < 7 skips — no ReviewRequest created', async () => {
      await service.requestReviews('cust-1', 6);

      expect(prisma.reviewRequest.create).not.toHaveBeenCalled();
    });

    it('emits review.requested event when NPS meets threshold', async () => {
      await service.requestReviews('cust-1', 8);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'review.requested',
        expect.objectContaining({ customerId: 'cust-1', npsScore: 8 }),
      );
    });

    it('stores npsScore in the created ReviewRequest', async () => {
      await service.requestReviews('cust-1', 10);

      const { data } = prisma.reviewRequest.create.mock.calls[0][0];
      expect(data.npsScore).toBe(10);
      expect(data.sequenceStatus).toBe('pending');
    });
  });

  // ─── detectNegativeReview ──────────────────────────────────────────────────

  describe('detectNegativeReview', () => {
    it('creates NegativeReview record with correct fields', async () => {
      await service.detectNegativeReview('google', {
        url: 'https://g.page/review/123',
        score: 1,
        text: 'Very bad experience',
        customerId: 'cust-1',
      });

      expect(prisma.negativeReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            platform: 'google',
            reviewScore: 1,
            reviewText: 'Very bad experience',
            status: 'detected',
            customerId: 'cust-1',
          }),
        }),
      );
    });

    it("emits 'review.negative' event with platform and score", async () => {
      await service.detectNegativeReview('trustpilot', {
        url: 'https://trustpilot.com/review/456',
        score: 2,
        text: 'Disappointed',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'review.negative',
        expect.objectContaining({ platform: 'trustpilot', score: 2 }),
      );
    });

    it('works without customerId (anonymous review)', async () => {
      await service.detectNegativeReview('clutch', {
        url: 'https://clutch.co/review/789',
        score: 1,
        text: 'Poor quality',
      });

      const { data } = prisma.negativeReview.create.mock.calls[0][0];
      expect(data.customerId).toBeNull();
    });

    it('logs the event via agentEventLogger', async () => {
      await service.detectNegativeReview('google', {
        url: 'https://g.page/review/abc',
        score: 2,
        text: 'Not happy',
        customerId: 'cust-1',
      });

      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'csm',
          eventType: 'negative_review_detected',
        }),
      );
    });
  });

  // ─── generateNegativeResponseDraft ────────────────────────────────────────

  describe('generateNegativeResponseDraft', () => {
    it('calls LlmService with sanitized review text and returns draft', async () => {
      prisma.negativeReview.findUnique.mockResolvedValue({
        id: 'nr-1',
        platform: 'google',
        reviewScore: 1,
        reviewText: 'Very bad <experience> with {injected} content!',
        customerId: 'cust-1',
      });

      const result = await service.generateNegativeResponseDraft('nr-1');

      expect(llmService.call).toHaveBeenCalledTimes(1);
      const callArgs = llmService.call.mock.calls[0][0];
      // Sanitized: <> and {} removed
      expect(callArgs.userPrompt).not.toContain('<');
      expect(callArgs.userPrompt).not.toContain('>');
      expect(callArgs.userPrompt).not.toContain('{');
      expect(callArgs.userPrompt).not.toContain('}');
      expect(result).toBe('Draft response text');
    });

    it('truncates review text to 500 characters before sending to LLM', async () => {
      const longText = 'a'.repeat(800);
      prisma.negativeReview.findUnique.mockResolvedValue({
        id: 'nr-2',
        platform: 'google',
        reviewScore: 1,
        reviewText: longText,
        customerId: 'cust-1',
      });

      await service.generateNegativeResponseDraft('nr-2');

      const callArgs = llmService.call.mock.calls[0][0];
      // userPrompt contains the truncated text
      const textInPrompt = callArgs.userPrompt.split('Avis: ')[1];
      expect(textInPrompt.length).toBeLessThanOrEqual(500);
    });

    it('throws when NegativeReview not found', async () => {
      prisma.negativeReview.findUnique.mockResolvedValue(null);

      await expect(service.generateNegativeResponseDraft('nonexistent')).rejects.toThrow(
        'NegativeReview nonexistent not found',
      );
    });
  });

  // ─── respondToNegativeReview ───────────────────────────────────────────────

  describe('respondToNegativeReview', () => {
    it('updates NegativeReview with responseText and status responded', async () => {
      await service.respondToNegativeReview('nr-1', 'We apologize and will contact you.');

      expect(prisma.negativeReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'nr-1' },
          data: expect.objectContaining({
            responseText: 'We apologize and will contact you.',
            status: 'responded',
            respondedAt: expect.any(Date),
          }),
        }),
      );
    });
  });
});
