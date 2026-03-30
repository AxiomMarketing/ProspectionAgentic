import { NurtureurService, NURTURE_EMAIL_SERVICE_TOKEN } from './nurtureur.service';
import { NurtureSequence } from '../../domain/entities/nurture-sequence.entity';
import { INurtureSequenceRepository } from '../../domain/repositories/i-nurture-sequence.repository';

const makeSequence = (overrides: Partial<any> = {}) =>
  NurtureSequence.reconstitute({
    id: 'seq-1',
    prospectId: 'prospect-1',
    entryReason: 'test',
    entryDate: new Date(),
    status: 'active',
    tags: [],
    currentStep: 0,
    totalSteps: 12,
    journeyStage: 'awareness',
    engagementScoreInitial: 0,
    engagementScoreCurrent: 0,
    emailsNurtureSent: 0,
    emailsOpened: 0,
    emailsClicked: 0,
    repliesReceived: 0,
    contentDownloaded: 0,
    consecutiveUnopened: 0,
    consentBasis: 'legitimate_interest',
    ...overrides,
  });

const makePrisma = (overrides: Partial<any> = {}) => ({
  prospect: {
    findUnique: jest.fn().mockResolvedValue({ status: 'active', email: 'test@example.com', rgpdErasedAt: null }),
    update: jest.fn().mockResolvedValue({}),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  nurtureProspect: {
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  nurtureInteraction: {
    count: jest.fn().mockResolvedValue(0),
  },
  rgpdBlacklist: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  },
  ...overrides,
});

const makeRepo = (overrides: Partial<any> = {}) => ({
  findActiveByProspectId: jest.fn().mockResolvedValue(null),
  findByProspectId: jest.fn().mockResolvedValue(null),
  findById: jest.fn().mockResolvedValue(null),
  save: jest.fn().mockImplementation((seq: NurtureSequence) => Promise.resolve(seq)),
  update: jest.fn().mockImplementation((seq: NurtureSequence) => Promise.resolve(seq)),
  ...overrides,
});

const makeService = (prisma: any, repo: any, extra: Partial<any> = {}) => {
  const eventEmitter = { emit: jest.fn() };
  const scoreurQueue = { add: jest.fn() };
  const agentEventLogger = { log: jest.fn().mockResolvedValue(undefined) };
  const configService = { get: jest.fn().mockImplementation((key: string, def: any) => def) };

  return new NurtureurService(
    repo as unknown as INurtureSequenceRepository,
    eventEmitter as any,
    prisma,
    scoreurQueue as any,
    agentEventLogger as any,
    configService as any,
    extra[NURTURE_EMAIL_SERVICE_TOKEN] ?? null,
    extra.reScorerService ?? null,
  );
};

describe('NurtureurService', () => {
  describe('startNurture', () => {
    it('happy path: saves sequence and sets prospect.status to nurturing', async () => {
      const repo = makeRepo();
      const prisma = makePrisma();
      const svc = makeService(prisma, repo);

      const result = await svc.startNurture({ prospectId: 'prospect-1', reason: 'warm' });

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(prisma.prospect.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'nurturing' } }),
      );
      expect(result.status).toBe('active');
    });

    it('blocks RGPD blacklisted prospects', async () => {
      const prisma = makePrisma({
        rgpdBlacklist: {
          findFirst: jest.fn().mockResolvedValue({ id: 'bl-1', email: 'test@example.com' }),
          create: jest.fn(),
        },
      });
      const repo = makeRepo();
      const svc = makeService(prisma, repo);

      await expect(svc.startNurture({ prospectId: 'prospect-1', reason: 'warm' })).rejects.toThrow('BLACKLISTED');
    });

    it('blocks RGPD erased prospects', async () => {
      const prisma = makePrisma({
        prospect: {
          findUnique: jest.fn().mockResolvedValue({ status: 'active', email: 'e@x.com', rgpdErasedAt: new Date() }),
          update: jest.fn(),
          findFirst: jest.fn().mockResolvedValue(null),
        },
      });
      const repo = makeRepo();
      const svc = makeService(prisma, repo);

      await expect(svc.startNurture({ prospectId: 'prospect-1', reason: 'warm' })).rejects.toThrow('RGPD_ERASED');
    });

    it('handles P2002 concurrent insert — returns existing active sequence', async () => {
      const existing = makeSequence();
      const repo = makeRepo({
        save: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findActiveByProspectId: jest.fn()
          .mockResolvedValueOnce(null)   // first call before save
          .mockResolvedValueOnce(existing), // second call after P2002
      });
      const prisma = makePrisma();
      const svc = makeService(prisma, repo);

      const result = await svc.startNurture({ prospectId: 'prospect-1', reason: 'warm' });
      expect(result.id).toBe('seq-1');
    });

    it('deduplicates: merges reason on existing active sequence', async () => {
      const existing = makeSequence();
      const repo = makeRepo({
        findActiveByProspectId: jest.fn().mockResolvedValue(existing),
      });
      const prisma = makePrisma();
      const svc = makeService(prisma, repo);

      await svc.startNurture({ prospectId: 'prospect-1', reason: 'second-reason' });
      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('processNurtureStep', () => {
    it('delegates to NurtureEmailService when available', async () => {
      const sequence = makeSequence();
      const repo = makeRepo({
        findByProspectId: jest.fn().mockResolvedValue(sequence),
      });
      const nurtureEmailService = { sendNurtureEmail: jest.fn().mockResolvedValue(undefined) };
      const prisma = makePrisma({
        nurtureProspect: {
          findFirst: jest.fn().mockResolvedValue({ id: 'np-1', lastEmailSentAt: null }),
          update: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
        },
        nurtureInteraction: {
          count: jest.fn().mockResolvedValue(0),
        },
      });
      const svc = makeService(prisma, repo, { [NURTURE_EMAIL_SERVICE_TOKEN]: nurtureEmailService });

      await svc.processNurtureStep('prospect-1');
      expect(nurtureEmailService.sendNurtureEmail).toHaveBeenCalledTimes(1);
    });

    it('rate limiting blocks when too frequent', async () => {
      const sequence = makeSequence();
      const repo = makeRepo({
        findByProspectId: jest.fn().mockResolvedValue(sequence),
      });
      const nurtureEmailService = { sendNurtureEmail: jest.fn() };
      const prisma = makePrisma({
        nurtureProspect: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'np-1',
            lastEmailSentAt: new Date(), // sent just now
          }),
          update: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
        },
        nurtureInteraction: {
          count: jest.fn().mockResolvedValue(0),
        },
      });
      const svc = makeService(prisma, repo, { [NURTURE_EMAIL_SERVICE_TOKEN]: nurtureEmailService });

      await svc.processNurtureStep('prospect-1');
      expect(nurtureEmailService.sendNurtureEmail).not.toHaveBeenCalled();
    });
  });

  describe('checkReEngagement', () => {
    it('uses lastInteractionAt to find inactive prospects', async () => {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 61);
      const prisma = makePrisma({
        nurtureProspect: {
          findMany: jest.fn().mockResolvedValue([{ prospectId: 'p-2', status: undefined }]),
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
        },
      });
      const repo = makeRepo();
      const svc = makeService(prisma, repo);

      await svc.checkReEngagement();
      expect(prisma.nurtureProspect.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: expect.anything() }) }),
      );
    });

    it('RGPD gate prevents enrollment for blacklisted prospects', async () => {
      const prisma = makePrisma({
        prospect: {
          findUnique: jest.fn().mockResolvedValue({ status: 'blacklisted', email: 'b@x.com', rgpdErasedAt: null }),
          update: jest.fn(),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        rgpdBlacklist: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
      });
      const repo = makeRepo();
      const svc = makeService(prisma, repo);

      await expect(
        svc.startNurture({ prospectId: 'p-3', reason: 're_engagement' }),
      ).rejects.toThrow('STATUS_BLACKLISTED');
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('checkSunset', () => {
    it('exits 90d+ prospects with legitimate_interest consent', async () => {
      const prisma = makePrisma({
        nurtureProspect: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'np-old',
              prospectId: 'p-old',
              entryReason: 'warm',
              entryDate: new Date('2025-01-01'),
              status: 'active',
              reactivatedAt: null,
              exitReason: null,
              tags: [],
              currentStep: 0,
              totalSteps: 12,
              journeyStage: 'awareness',
              engagementScoreInitial: 0,
              engagementScoreCurrent: 0,
              emailsNurtureSent: 0,
              emailsOpened: 0,
              emailsClicked: 0,
              repliesReceived: 0,
              contentDownloaded: 0,
              consecutiveUnopened: 0,
              consentBasis: 'legitimate_interest',
              lastInteractionAt: null,
              lastEmailSentAt: null,
              prospect: { email: 'old@example.com' },
            },
          ]),
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
        },
        rgpdBlacklist: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({}),
        },
      });
      const repo = makeRepo();
      const svc = makeService(prisma, repo);

      await svc.checkSunset();

      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'exited' }),
      );
      expect(prisma.prospect.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'unsubscribed' } }),
      );
      expect(prisma.rgpdBlacklist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'old@example.com', reason: expect.stringContaining('90d') }),
        }),
      );
    });
  });

  describe('rgpdGate', () => {
    it('blocks unsubscribed prospects', async () => {
      const prisma = makePrisma({
        prospect: {
          findUnique: jest.fn().mockResolvedValue({ status: 'unsubscribed', email: 'u@x.com', rgpdErasedAt: null }),
          update: jest.fn(),
          findFirst: jest.fn().mockResolvedValue(null),
        },
      });
      const repo = makeRepo();
      const svc = makeService(prisma, repo);

      await expect(svc.startNurture({ prospectId: 'prospect-1', reason: 'warm' })).rejects.toThrow(
        'STATUS_UNSUBSCRIBED',
      );
    });

    it('blocks opted-out prospects', async () => {
      const prisma = makePrisma({
        nurtureProspect: {
          findFirst: jest.fn().mockResolvedValue({ optOutAt: new Date() }),
          update: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
        },
      });
      const repo = makeRepo();
      const svc = makeService(prisma, repo);

      await expect(svc.startNurture({ prospectId: 'prospect-1', reason: 'warm' })).rejects.toThrow('OPT_OUT');
    });
  });
});
