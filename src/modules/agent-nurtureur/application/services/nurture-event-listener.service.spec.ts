import { NurtureEventListenerService } from './nurture-event-listener.service';

const makePrisma = (overrides: Partial<any> = {}) => ({
  prospect: {
    findUnique: jest.fn().mockResolvedValue({ id: 'p-1', email: 'test@example.com' }),
    findFirst: jest.fn().mockResolvedValue({ id: 'p-1', email: 'test@example.com' }),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    ...overrides.prospect,
  },
  nurtureProspect: {
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    ...overrides.nurtureProspect,
  },
  rgpdBlacklist: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    ...overrides.rgpdBlacklist,
  },
  agentEvent: {
    create: jest.fn().mockResolvedValue({}),
    ...overrides.agentEvent,
  },
});

const makeService = (prismaOverrides: Partial<any> = {}) => {
  const prisma = makePrisma(prismaOverrides);
  const nurtureurService = { triggerReScore: jest.fn().mockResolvedValue(undefined) };
  const agentEventLogger = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new NurtureEventListenerService(prisma as any, nurtureurService as any, agentEventLogger as any);
  return { service, prisma, nurtureurService, agentEventLogger };
};

describe('NurtureEventListenerService', () => {
  describe('reply.classified', () => {
    it('pauses nurture when intent is INTERESSE', async () => {
      const nurture = { id: 'np-1' };
      const { service, prisma } = makeService({
        nurtureProspect: {
          findFirst: jest.fn().mockResolvedValue(nurture),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      });

      await service.handleReplyClassified({ prospectId: 'p-1', intent: 'INTERESSE' });

      expect(prisma.nurtureProspect.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'paused' }) }),
      );
    });

    it('pauses nurture when intent is MEETING_REQUEST', async () => {
      const nurture = { id: 'np-1' };
      const { service, prisma } = makeService({
        nurtureProspect: {
          findFirst: jest.fn().mockResolvedValue(nurture),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      });

      await service.handleReplyClassified({ prospectId: 'p-1', intent: 'MEETING_REQUEST' });

      expect(prisma.nurtureProspect.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'paused' }) }),
      );
    });

    it('exits nurture and blacklists on STOP intent', async () => {
      const nurture = { id: 'np-1' };
      const { service, prisma } = makeService({
        nurtureProspect: {
          findFirst: jest.fn().mockResolvedValue(nurture),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      });

      await service.handleReplyClassified({ prospectId: 'p-1', intent: 'STOP' });

      expect(prisma.nurtureProspect.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'exited' }) }),
      );
      expect(prisma.prospect.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'unsubscribed' } }),
      );
      expect(prisma.rgpdBlacklist.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reason: 'reply_stop' }) }),
      );
    });

    it('does nothing when no active nurture exists', async () => {
      const { service, prisma } = makeService({
        nurtureProspect: {
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
      });

      await service.handleReplyClassified({ prospectId: 'p-1', intent: 'INTERESSE' });

      expect(prisma.nurtureProspect.update).not.toHaveBeenCalled();
    });
  });

  describe('mailgun.unsubscribed', () => {
    it('exits all active/paused sequences and adds to blacklist', async () => {
      const { service, prisma } = makeService({
        prospect: {
          findFirst: jest.fn().mockResolvedValue({ id: 'p-1', email: 'test@example.com' }),
          findUnique: jest.fn().mockResolvedValue({ id: 'p-1', email: 'test@example.com' }),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        nurtureProspect: {
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      });

      await service.handleMailgunUnsubscribed({ email: 'test@example.com' });

      expect(prisma.nurtureProspect.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'exited', exitReason: 'mailgun_unsubscribed' }),
        }),
      );
      expect(prisma.rgpdBlacklist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'test@example.com', reason: 'mailgun_unsubscribed' }),
        }),
      );
      expect(prisma.prospect.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'unsubscribed' } }),
      );
    });

    it('does nothing when prospect not found', async () => {
      const { service, prisma } = makeService({
        prospect: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
      });

      await service.handleMailgunUnsubscribed({ email: 'unknown@example.com' });

      expect(prisma.nurtureProspect.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('company.bankrupt', () => {
    it('exits all nurture sequences for company prospects', async () => {
      const prospects = [
        { id: 'p-1', email: 'ceo@bankrupt.fr' },
        { id: 'p-2', email: 'cto@bankrupt.fr' },
      ];
      const { service, prisma } = makeService({
        prospect: {
          findMany: jest.fn().mockResolvedValue(prospects),
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        nurtureProspect: {
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      });

      await service.handleCompanyBankrupt({ companySiren: '123456789' });

      expect(prisma.nurtureProspect.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.rgpdBlacklist.create).toHaveBeenCalledTimes(2);
    });

    it('does nothing when no prospects found for company', async () => {
      const { service, prisma } = makeService({
        prospect: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
      });

      await service.handleCompanyBankrupt({ companySiren: '000000000' });

      expect(prisma.nurtureProspect.updateMany).not.toHaveBeenCalled();
    });
  });
});
