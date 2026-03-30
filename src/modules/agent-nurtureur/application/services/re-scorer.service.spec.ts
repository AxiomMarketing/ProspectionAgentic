import { ReScorerService } from './re-scorer.service';

const makeService = (prismaOverrides: Partial<any> = {}) => {
  const prisma = {
    nurtureProspect: {
      update: jest.fn().mockResolvedValue({ id: 'np-1', engagementScoreCurrent: 0 }),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    nurtureInteraction: {
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    $executeRaw: jest.fn().mockResolvedValue(10),
    ...prismaOverrides,
  };

  const scoreurQueue = { add: jest.fn().mockResolvedValue({}) };
  const configService = { get: jest.fn().mockImplementation((_key: string, def: any) => def) };
  const eventEmitter = { emit: jest.fn() };

  const service = new ReScorerService(prisma as any, scoreurQueue as any, configService as any, eventEmitter as any);

  return { service, prisma, scoreurQueue, eventEmitter };
};

describe('ReScorerService', () => {
  describe('trackEngagement', () => {
    it('gives correct points for email_opened (2)', async () => {
      const { service, prisma } = makeService({
        nurtureProspect: {
          update: jest.fn().mockResolvedValue({ id: 'np-1', engagementScoreCurrent: 2 }),
          findUnique: jest.fn().mockResolvedValue({ id: 'np-1', engagementScoreCurrent: 2 }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        nurtureInteraction: {
          create: jest.fn().mockResolvedValue({}),
          count: jest.fn().mockResolvedValue(0),
        },
      });

      await service.trackEngagement('p-1', 'email_opened');

      expect(prisma.nurtureProspect.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ engagementScoreCurrent: { increment: 2 } }),
        }),
      );
    });

    it('gives correct points for reply (15)', async () => {
      const { service, prisma } = makeService({
        nurtureProspect: {
          update: jest.fn().mockResolvedValue({ id: 'np-1', engagementScoreCurrent: 15 }),
          findUnique: jest.fn().mockResolvedValue({ id: 'np-1', engagementScoreCurrent: 15 }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        nurtureInteraction: {
          create: jest.fn().mockResolvedValue({}),
          count: jest.fn().mockResolvedValue(0),
        },
      });

      await service.trackEngagement('p-1', 'reply');

      expect(prisma.nurtureProspect.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ engagementScoreCurrent: { increment: 15 } }),
        }),
      );
    });

    it('gives correct points for contact_spontaneous (25)', async () => {
      const { service, prisma } = makeService({
        nurtureProspect: {
          update: jest.fn().mockResolvedValue({ id: 'np-1', engagementScoreCurrent: 25 }),
          findUnique: jest.fn().mockResolvedValue({ id: 'np-1', engagementScoreCurrent: 25 }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        nurtureInteraction: {
          create: jest.fn().mockResolvedValue({}),
          count: jest.fn().mockResolvedValue(0),
        },
      });

      await service.trackEngagement('p-1', 'contact_spontaneous');

      expect(prisma.nurtureProspect.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ engagementScoreCurrent: { increment: 25 } }),
        }),
      );
    });
  });

  describe('checkHotHandoff', () => {
    it('triggers handoff at threshold (75)', async () => {
      const nurture = {
        id: 'np-1',
        prospectId: 'p-1',
        engagementScoreCurrent: 80,
        engagementScoreInitial: 0,
        emailsNurtureSent: 5,
        emailsOpened: 3,
        emailsClicked: 2,
        lastInteractionAt: new Date(),
        journeyStage: 'consideration',
        sequenceType: 'WARM_NURTURE',
        entryDate: new Date(Date.now() - 30 * 86400000),
        createdAt: new Date(Date.now() - 30 * 86400000),
      };
      const { service, scoreurQueue, prisma } = makeService({
        nurtureProspect: {
          findUnique: jest.fn().mockResolvedValue(nurture),
          update: jest.fn().mockResolvedValue(nurture),
          findMany: jest.fn().mockResolvedValue([]),
        },
        nurtureInteraction: {
          create: jest.fn().mockResolvedValue({}),
          count: jest.fn().mockResolvedValue(0),
        },
      });

      const result = await service.checkHotHandoff('p-1');
      expect(result).toBe(true);
      expect(scoreurQueue.add).toHaveBeenCalledWith('score-prospect', expect.objectContaining({ prospectId: 'p-1' }));
      expect(prisma.nurtureProspect.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'paused' } }),
      );
    });

    it('does not trigger below threshold', async () => {
      const nurture = {
        id: 'np-1',
        engagementScoreCurrent: 50,
        entryDate: new Date(),
        createdAt: new Date(),
      };
      const { service, scoreurQueue } = makeService({
        nurtureProspect: {
          findUnique: jest.fn().mockResolvedValue(nurture),
          update: jest.fn().mockResolvedValue(nurture),
          findMany: jest.fn().mockResolvedValue([]),
        },
        nurtureInteraction: {
          create: jest.fn().mockResolvedValue({}),
          count: jest.fn().mockResolvedValue(0),
        },
      });

      const result = await service.checkHotHandoff('p-1');
      expect(result).toBe(false);
      expect(scoreurQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('weeklyEngagementDecay', () => {
    it('reduces score by 5% via raw query', async () => {
      const { service, prisma } = makeService();
      await service.weeklyEngagementDecay();
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });
});
