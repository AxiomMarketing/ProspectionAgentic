import { Test, TestingModule } from '@nestjs/testing';
import { BounceHandlerService } from './bounce-handler.service';
import { PrismaService } from '@core/database/prisma.service';

const mockPrisma = {
  prospect: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  bounceEvent: {
    create: jest.fn(),
    count: jest.fn(),
  },
  emailSend: {
    update: jest.fn(),
  },
  rgpdBlacklist: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

describe('BounceHandlerService', () => {
  let service: BounceHandlerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BounceHandlerService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BounceHandlerService>(BounceHandlerService);
    jest.clearAllMocks();
  });

  describe('handleBounce', () => {
    const prospect = { id: 'prospect-1', email: 'test@example.com' };

    it('hard bounce immediately blacklists prospect', async () => {
      mockPrisma.prospect.findFirst.mockResolvedValue(prospect);
      mockPrisma.bounceEvent.create.mockResolvedValue({});
      mockPrisma.emailSend.update.mockResolvedValue({});
      mockPrisma.prospect.update.mockResolvedValue({});
      mockPrisma.rgpdBlacklist.findFirst.mockResolvedValue(null);
      mockPrisma.rgpdBlacklist.create.mockResolvedValue({});

      await service.handleBounce('test@example.com', 'hard', '550', 'mailgun', 'send-1');

      expect(mockPrisma.bounceEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ bounceType: 'hard', email: 'test@example.com' }) }),
      );
      expect(mockPrisma.prospect.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'blacklisted' }) }),
      );
    });

    it('soft bounce with 3+ previous bounces auto-blacklists', async () => {
      mockPrisma.prospect.findFirst.mockResolvedValue(prospect);
      mockPrisma.bounceEvent.create.mockResolvedValue({});
      mockPrisma.emailSend.update.mockResolvedValue({});
      mockPrisma.bounceEvent.count.mockResolvedValue(3);
      mockPrisma.prospect.update.mockResolvedValue({});
      mockPrisma.rgpdBlacklist.findFirst.mockResolvedValue(null);
      mockPrisma.rgpdBlacklist.create.mockResolvedValue({});

      await service.handleBounce('test@example.com', 'soft', '421', 'mailgun', null);

      expect(mockPrisma.bounceEvent.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'test@example.com' } }),
      );
      expect(mockPrisma.prospect.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'blacklisted' }) }),
      );
    });

    it('soft bounce with fewer than 3 bounces does NOT blacklist', async () => {
      mockPrisma.prospect.findFirst.mockResolvedValue(prospect);
      mockPrisma.bounceEvent.create.mockResolvedValue({});
      mockPrisma.emailSend.update.mockResolvedValue({});
      mockPrisma.bounceEvent.count.mockResolvedValue(1);

      await service.handleBounce('test@example.com', 'soft', '421', 'mailgun', null);

      expect(mockPrisma.prospect.update).not.toHaveBeenCalled();
    });

    it('hard bounce updates emailSend.bouncedAt when emailSendId provided', async () => {
      mockPrisma.prospect.findFirst.mockResolvedValue(prospect);
      mockPrisma.bounceEvent.create.mockResolvedValue({});
      mockPrisma.emailSend.update.mockResolvedValue({});
      mockPrisma.prospect.update.mockResolvedValue({});
      mockPrisma.rgpdBlacklist.findFirst.mockResolvedValue(null);
      mockPrisma.rgpdBlacklist.create.mockResolvedValue({});

      await service.handleBounce('test@example.com', 'hard', '550', 'mailgun', 'send-42');

      expect(mockPrisma.emailSend.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'send-42' },
          data: expect.objectContaining({ bouncedAt: expect.any(Date), bounceType: 'hard', status: 'bounced' }),
        }),
      );
    });
  });

  describe('handleComplaint', () => {
    it('blacklists prospect on spam complaint', async () => {
      const prospect = { id: 'p-2', email: 'spammer@example.com' };
      mockPrisma.prospect.findFirst.mockResolvedValue(prospect);
      mockPrisma.prospect.update.mockResolvedValue({});
      mockPrisma.rgpdBlacklist.findFirst.mockResolvedValue(null);
      mockPrisma.rgpdBlacklist.create.mockResolvedValue({});

      await service.handleComplaint('spammer@example.com');

      expect(mockPrisma.prospect.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'blacklisted' }) }),
      );
    });
  });

  describe('handleUnsubscribe', () => {
    it('sets prospect status to unsubscribed', async () => {
      const prospect = { id: 'p-3', email: 'unsub@example.com' };
      mockPrisma.prospect.findFirst.mockResolvedValue(prospect);
      mockPrisma.prospect.update.mockResolvedValue({});
      mockPrisma.rgpdBlacklist.create.mockResolvedValue({});

      await service.handleUnsubscribe('unsub@example.com');

      expect(mockPrisma.prospect.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'unsubscribed' }) }),
      );
      expect(mockPrisma.rgpdBlacklist.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'unsub@example.com', reason: 'unsubscribed' }) }),
      );
    });

    it('does nothing if prospect not found', async () => {
      mockPrisma.prospect.findFirst.mockResolvedValue(null);

      await service.handleUnsubscribe('ghost@example.com');

      expect(mockPrisma.prospect.update).not.toHaveBeenCalled();
    });
  });
});
