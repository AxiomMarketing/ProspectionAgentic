import { NurtureEmailService } from './nurture-email.service';
import { NurtureSequence } from '../../domain/entities/nurture-sequence.entity';

const makeSequence = (overrides: Partial<any> = {}) =>
  NurtureSequence.reconstitute({
    id: 'seq-1',
    prospectId: 'prospect-1',
    entryReason: 'warm',
    entryDate: new Date(),
    status: 'active',
    tags: [],
    currentStep: 0,
    totalSteps: 12,
    journeyStage: 'awareness',
    engagementScoreInitial: 30,
    engagementScoreCurrent: 30,
    emailsNurtureSent: 0,
    emailsOpened: 0,
    emailsClicked: 0,
    repliesReceived: 0,
    contentDownloaded: 0,
    consecutiveUnopened: 0,
    consentBasis: 'legitimate_interest',
    segment: 'pme_metro',
    ...overrides,
  });

const makeService = (overrides: Partial<any> = {}) => {
  const prisma = {
    prospect: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        fullName: 'Jean Dupont',
        firstName: 'Jean',
        jobTitle: 'CEO',
        companyName: 'Acme',
        email: 'jean@acme.fr',
      }),
    },
    nurtureProspect: {
      findUnique: jest.fn().mockResolvedValue({ id: 'np-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    nurtureInteraction: {
      create: jest.fn().mockResolvedValue({}),
    },
    ...overrides.prisma,
  };

  const llmService = {
    call: jest.fn().mockResolvedValue({ content: JSON.stringify({ subject: 'Test Subject', body: 'Email body', preview: 'preview' }) }),
    ...overrides.llmService,
  };

  const emailAdapter = {
    sendEmail: jest.fn().mockResolvedValue({ messageId: 'msg-1', accepted: ['jean@acme.fr'], rejected: [] }),
    ...overrides.emailAdapter,
  };

  const configService = {
    get: jest.fn().mockImplementation((key: string, def?: any) => {
      const values: Record<string, string> = {
        APP_BASE_URL: 'https://axiom.fr',
        AXIOM_SIRET: '123456789',
        AXIOM_ADDRESS: '1 rue de Paris',
        AXIOM_SENDER_EMAIL: 'contact@axiom-marketing.fr',
      };
      return values[key] ?? def;
    }),
    ...overrides.configService,
  };

  const queue = { add: jest.fn().mockResolvedValue({}) };

  return {
    service: new NurtureEmailService(prisma as any, llmService as any, emailAdapter as any, configService as any, queue as any),
    prisma,
    llmService,
    emailAdapter,
    queue,
  };
};

describe('NurtureEmailService', () => {
  describe('getContentType', () => {
    it('returns promo on every 4th email (index 3, 7, 11...)', () => {
      const { service } = makeService();
      expect(service.getContentType(3)).toBe('promo');
      expect(service.getContentType(7)).toBe('promo');
      expect(service.getContentType(11)).toBe('promo');
    });

    it('returns valeur for other positions', () => {
      const { service } = makeService();
      expect(service.getContentType(0)).toBe('valeur');
      expect(service.getContentType(1)).toBe('valeur');
      expect(service.getContentType(4)).toBe('valeur');
    });
  });

  describe('determineBranch', () => {
    it('returns ACCELERATE when opened and clicked', () => {
      const { service } = makeService();
      expect(service.determineBranch(makeSequence(), true, true)).toBe('ACCELERATE');
    });

    it('returns CHANGE_CTA when opened but not clicked', () => {
      const { service } = makeService();
      expect(service.determineBranch(makeSequence(), true, false)).toBe('CHANGE_CTA');
    });

    it('returns RETRY when not opened and consecutiveUnopened is 0', () => {
      const { service } = makeService();
      expect(service.determineBranch(makeSequence({ consecutiveUnopened: 0 }), false, false)).toBe('RETRY');
    });

    it('returns PIVOT when not opened and consecutiveUnopened is 1', () => {
      const { service } = makeService();
      expect(service.determineBranch(makeSequence({ consecutiveUnopened: 1 }), false, false)).toBe('PIVOT');
    });

    it('returns EXIT when not opened and consecutiveUnopened >= 2', () => {
      const { service } = makeService();
      expect(service.determineBranch(makeSequence({ consecutiveUnopened: 2 }), false, false)).toBe('EXIT');
    });
  });

  describe('advanceJourneyStage', () => {
    it('returns awareness for steps 0-4', () => {
      const { service } = makeService();
      expect(service.advanceJourneyStage(makeSequence({ currentStep: 0 }))).toBe('awareness');
      expect(service.advanceJourneyStage(makeSequence({ currentStep: 4 }))).toBe('awareness');
    });

    it('returns consideration for steps 5-8', () => {
      const { service } = makeService();
      expect(service.advanceJourneyStage(makeSequence({ currentStep: 5 }))).toBe('consideration');
      expect(service.advanceJourneyStage(makeSequence({ currentStep: 8 }))).toBe('consideration');
    });

    it('returns decision for steps >= 9', () => {
      const { service } = makeService();
      expect(service.advanceJourneyStage(makeSequence({ currentStep: 9 }))).toBe('decision');
      expect(service.advanceJourneyStage(makeSequence({ currentStep: 12 }))).toBe('decision');
    });
  });

  describe('sendNurtureEmail', () => {
    it('calls LLM and sends email via adapter', async () => {
      const { service, llmService, emailAdapter } = makeService();
      await service.sendNurtureEmail('prospect-1', makeSequence());

      expect(llmService.call).toHaveBeenCalledTimes(1);
      expect(emailAdapter.sendEmail).toHaveBeenCalledTimes(1);
    });

    it('appends LCEN footer with unsubscribe link', async () => {
      const { service, emailAdapter } = makeService();
      await service.sendNurtureEmail('prospect-1', makeSequence());

      const callArgs = emailAdapter.sendEmail.mock.calls[0][0];
      expect(callArgs.htmlBody).toContain('Pour ne plus recevoir');
      expect(callArgs.htmlBody).toContain('unsubscribe');
    });

    it('handles malformed LLM JSON and falls back to plain text', async () => {
      const { service, emailAdapter } = makeService({
        llmService: { call: jest.fn().mockResolvedValue({ content: 'not valid json' }) },
      });
      await service.sendNurtureEmail('prospect-1', makeSequence());
      expect(emailAdapter.sendEmail).toHaveBeenCalledTimes(1);
    });
  });
});
