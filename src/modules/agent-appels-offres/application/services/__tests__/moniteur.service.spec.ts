import { NotFoundException } from '@nestjs/common';
import { MoniteurService, MonitorStatus, RetexReport, MonitorAlert, AlertType } from '../moniteur.service';

const makePrisma = () => ({
  publicTender: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  aoAnalyse: {
    update: jest.fn().mockResolvedValue({}),
  },
  agentEventLog: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
});

const makeLlmService = (retexJson?: any) => ({
  call: jest.fn().mockResolvedValue({
    content: JSON.stringify(
      retexJson ?? {
        pointsForts: ['Dossier complet', 'Prix compétitif'],
        pointsFaibles: ['Références insuffisantes'],
        lecons: ['Améliorer les références clients similaires'],
        actionsAmelioration: ['Préparer 3 références secteur public avant prochain AO'],
        ajustementScoring: 'Augmenter le poids des références de 10 points',
      },
    ),
  }),
});

const makeConfig = (overrides: Record<string, string> = {}) => ({
  get: jest.fn((key: string) => {
    const defaults: Record<string, string> = {
      COMPANY_NAME: 'Axiom Marketing',
      COMPANY_SIRET: '12345678901234',
      SLACK_WEBHOOK_URL: '',
      ...overrides,
    };
    return defaults[key] ?? '';
  }),
});

const makeHttpService = () => ({
  axiosRef: {
    post: jest.fn().mockResolvedValue({ status: 200 }),
  },
});

const makeAgentEventLogger = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

const makeQueue = () => ({
  add: jest.fn().mockResolvedValue({}),
});

const makeTender = (overrides: Partial<any> = {}) => ({
  id: 'tender-001',
  title: 'Refonte portail citoyen',
  buyerName: 'Ville de Bordeaux',
  sourceId: 'BOAMP-2026-001',
  status: 'SUBMITTED',
  submittedAt: null,
  deadlineDate: new Date(),
  updatedAt: new Date(),
  estimatedAmount: 150000,
  aoAnalyse: null,
  ...overrides,
});

const makeTenderSubmittedDaysAgo = (days: number, overrides: Partial<any> = {}) =>
  makeTender({
    submittedAt: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    ...overrides,
  });

describe('MoniteurService', () => {
  let service: MoniteurService;
  let prisma: ReturnType<typeof makePrisma>;
  let llmService: ReturnType<typeof makeLlmService>;
  let config: ReturnType<typeof makeConfig>;
  let httpService: ReturnType<typeof makeHttpService>;
  let agentEventLogger: ReturnType<typeof makeAgentEventLogger>;

  beforeEach(() => {
    prisma = makePrisma();
    llmService = makeLlmService();
    config = makeConfig();
    httpService = makeHttpService();
    agentEventLogger = makeAgentEventLogger();
    service = new MoniteurService(
      prisma as any,
      llmService as any,
      config as any,
      httpService as any,
      agentEventLogger as any,
      makeQueue() as any,
      makeQueue() as any,
    );
  });

  describe('checkTenderStatus', () => {
    it('should determine ACTIVE phase (J+0 to J+15)', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(makeTenderSubmittedDaysAgo(5));

      const result = await service.checkTenderStatus('tender-001');

      expect(result.phase).toBe('ACTIVE');
      expect(result.daysSinceSubmission).toBeLessThanOrEqual(15);
    });

    it('should determine ATTENTE phase (J+15 to J+60)', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(makeTenderSubmittedDaysAgo(30));

      const result = await service.checkTenderStatus('tender-001');

      expect(result.phase).toBe('ATTENTE');
      expect(result.daysSinceSubmission).toBeGreaterThan(15);
      expect(result.daysSinceSubmission).toBeLessThanOrEqual(60);
    });

    it('should determine RESULTAT phase (J+60+)', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(makeTenderSubmittedDaysAgo(65));

      const result = await service.checkTenderStatus('tender-001');

      expect(result.phase).toBe('RESULTAT');
      expect(result.daysSinceSubmission).toBeGreaterThan(60);
    });

    it('should return correct tender ID and lastCheckAt', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(makeTenderSubmittedDaysAgo(5));

      const result = await service.checkTenderStatus('tender-001');

      expect(result.tenderId).toBe('tender-001');
      expect(result.lastCheckAt).toBeInstanceOf(Date);
      expect(result.alerts).toBeInstanceOf(Array);
    });

    it('should generate no_news_30d alert in ATTENTE phase when no recent alert exists', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(makeTenderSubmittedDaysAgo(35));
      prisma.agentEventLog.findFirst.mockResolvedValue(null); // no existing alert

      const result = await service.checkTenderStatus('tender-001');

      const noNewsAlert = result.alerts.find((a) => a.type === 'no_news_30d');
      expect(noNewsAlert).toBeDefined();
      expect(noNewsAlert!.level).toBe(1);
      expect(noNewsAlert!.tenderId).toBe('tender-001');
    });

    it('should NOT generate no_news_30d alert when one already exists in last 24h', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(makeTenderSubmittedDaysAgo(35));
      prisma.agentEventLog.findFirst.mockResolvedValue({ id: 'existing-alert' }); // alert already exists

      const result = await service.checkTenderStatus('tender-001');

      const noNewsAlert = result.alerts.find((a) => a.type === 'no_news_30d');
      expect(noNewsAlert).toBeUndefined();
    });

    it('should throw NotFoundException when tender does not exist', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(null);

      await expect(service.checkTenderStatus('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should fall back to deadlineDate when submittedAt is null', async () => {
      const tender = makeTender({
        submittedAt: null,
        deadlineDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
      });
      prisma.publicTender.findUnique.mockResolvedValue(tender);

      const result = await service.checkTenderStatus('tender-001');

      expect(result.daysSinceSubmission).toBeGreaterThan(0);
    });
  });

  describe('processResult', () => {
    it('should process GAGNE result — update status to WON and prepare signature docs', async () => {
      const tender = makeTenderSubmittedDaysAgo(30, {
        aoAnalyse: { id: 'analyse-001', offreFinanciere: null },
      });
      prisma.publicTender.findUnique.mockResolvedValue(tender);

      await service.processResult('tender-001', 'GAGNE');

      expect(prisma.publicTender.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'WON' }),
        }),
      );
    });

    it('should log tender_won event when GAGNE', async () => {
      const tender = makeTenderSubmittedDaysAgo(30);
      prisma.publicTender.findUnique.mockResolvedValue(tender);

      await service.processResult('tender-001', 'GAGNE');

      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'agent-appels-offres:9g',
          eventType: 'tender_won',
        }),
      );
    });

    it('should process PERDU result — generate R2181-3 letter and RETEX', async () => {
      const tender = makeTenderSubmittedDaysAgo(30, {
        aoAnalyse: { id: 'analyse-001', offreFinanciere: { strategie: 'EQUILIBREE', margeNette: 30, montantTotal: 50000 } },
      });
      prisma.publicTender.findUnique
        .mockResolvedValueOnce(tender) // processResult call
        .mockResolvedValueOnce(tender); // generateRetex call

      const result = await service.processResult('tender-001', 'PERDU', { rankObtenu: 2, nbCandidats: 5 });

      expect(result).toBeDefined();
      const retex = result as RetexReport;
      expect(retex.tenderId).toBe('tender-001');
      expect(retex.resultat).toBe('PERDU');
      expect(retex.pointsForts).toBeInstanceOf(Array);
      expect(retex.pointsFaibles).toBeInstanceOf(Array);
      expect(retex.lecons).toBeInstanceOf(Array);
      expect(retex.actionsAmelioration).toBeInstanceOf(Array);
    });

    it('should process SANS_SUITE — archive and log', async () => {
      const tender = makeTenderSubmittedDaysAgo(30, {
        aoAnalyse: { id: 'analyse-001' },
      });
      prisma.publicTender.findUnique.mockResolvedValue(tender);

      const result = await service.processResult('tender-001', 'SANS_SUITE');

      expect(result).toBeUndefined();
      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'agent-appels-offres:9g',
          eventType: 'tender_sans_suite',
        }),
      );
    });

    it('should update aoAnalyse with SANS_SUITE decision when applicable', async () => {
      const tender = makeTenderSubmittedDaysAgo(30, {
        aoAnalyse: { id: 'analyse-001' },
      });
      prisma.publicTender.findUnique.mockResolvedValue(tender);

      await service.processResult('tender-001', 'SANS_SUITE');

      expect(prisma.aoAnalyse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ decision: 'SANS_SUITE' }),
        }),
      );
    });

    it('should throw NotFoundException when tender does not exist', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(null);

      await expect(service.processResult('nonexistent', 'PERDU')).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateRetex', () => {
    it('should generate RETEX report with lessons learned', async () => {
      const tender = makeTender({
        aoAnalyse: { id: 'analyse-001', offreFinanciere: { strategie: 'EQUILIBREE', margeNette: 25, montantTotal: 80000 } },
      });
      prisma.publicTender.findUnique.mockResolvedValue(tender);

      const retex = await service.generateRetex('tender-001', {
        resultat: 'PERDU',
        rankObtenu: 3,
        nbCandidats: 8,
        prixLaureat: 70000,
      });

      expect(retex.tenderId).toBe('tender-001');
      expect(retex.title).toBe(tender.title);
      expect(retex.acheteur).toBe(tender.buyerName);
      expect(retex.resultat).toBe('PERDU');
      expect(retex.pointsForts).toBeInstanceOf(Array);
      expect(retex.pointsFaibles).toBeInstanceOf(Array);
      expect(retex.lecons).toBeInstanceOf(Array);
      expect(retex.actionsAmelioration).toBeInstanceOf(Array);
      expect(retex.rankObtenu).toBe(3);
      expect(retex.nbCandidats).toBe(8);
    });

    it('should calculate ecartPrix when prixLaureat is provided', async () => {
      const tender = makeTender({
        estimatedAmount: 100000,
        aoAnalyse: { id: 'analyse-001', offreFinanciere: { strategie: 'EQUILIBREE', margeNette: 25, montantTotal: 90000 } },
      });
      prisma.publicTender.findUnique.mockResolvedValue(tender);

      const retex = await service.generateRetex('tender-001', {
        resultat: 'PERDU',
        prixLaureat: 75000,
      });

      // ecartPrix = round((90000 - 75000) / 75000 * 100) = round(20) = 20
      expect(retex.ecartPrix).toBe(20);
    });

    it('should fall back to default RETEX data when LLM call fails', async () => {
      llmService.call.mockRejectedValue(new Error('LLM error'));
      const tender = makeTender({
        aoAnalyse: { id: 'analyse-001', offreFinanciere: null },
      });
      prisma.publicTender.findUnique.mockResolvedValue(tender);

      const retex = await service.generateRetex('tender-001', { resultat: 'PERDU' });

      expect(retex.pointsForts.length).toBeGreaterThan(0);
      expect(retex.lecons.length).toBeGreaterThan(0);
      expect(retex.actionsAmelioration.length).toBeGreaterThan(0);
    });

    it('should log retex_generated event', async () => {
      const tender = makeTender({
        aoAnalyse: { id: 'analyse-001', offreFinanciere: null },
      });
      prisma.publicTender.findUnique.mockResolvedValue(tender);

      await service.generateRetex('tender-001', { resultat: 'PERDU' });

      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'agent-appels-offres:9g',
          eventType: 'retex_generated',
        }),
      );
    });

    it('should persist retex to aoAnalyse when analyse exists', async () => {
      const tender = makeTender({
        aoAnalyse: { id: 'analyse-001', offreFinanciere: null },
      });
      prisma.publicTender.findUnique.mockResolvedValue(tender);

      await service.generateRetex('tender-001', { resultat: 'PERDU' });

      expect(prisma.aoAnalyse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'analyse-001' },
          data: expect.objectContaining({ status: 'completed' }),
        }),
      );
    });

    it('should throw NotFoundException when tender does not exist', async () => {
      prisma.publicTender.findUnique.mockResolvedValue(null);

      await expect(service.generateRetex('nonexistent', { resultat: 'PERDU' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('determineEscalationLevel', () => {
    it('should return level 1 for qr_published', () => {
      expect(service.determineEscalationLevel('qr_published')).toBe(1);
    });

    it('should return level 1 for deadline_extended', () => {
      expect(service.determineEscalationLevel('deadline_extended')).toBe(1);
    });

    it('should return level 1 for no_news_30d', () => {
      expect(service.determineEscalationLevel('no_news_30d')).toBe(1);
    });

    it('should return level 2 for dce_modified', () => {
      expect(service.determineEscalationLevel('dce_modified')).toBe(2);
    });

    it('should return level 2 for procedure_collective', () => {
      expect(service.determineEscalationLevel('procedure_collective')).toBe(2);
    });

    it('should return level 2 for regulatory_change', () => {
      expect(service.determineEscalationLevel('regulatory_change')).toBe(2);
    });

    it('should return level 3 for result_won', () => {
      expect(service.determineEscalationLevel('result_won')).toBe(3);
    });

    it('should return level 3 for result_lost', () => {
      expect(service.determineEscalationLevel('result_lost')).toBe(3);
    });

    it('should return level 1 for unknown alert type', () => {
      expect(service.determineEscalationLevel('debrief_received')).toBe(1);
    });
  });

  describe('processAlert', () => {
    it('should log the alert via agentEventLogger', async () => {
      const alert: MonitorAlert = {
        type: 'qr_published',
        tenderId: 'tender-001',
        level: 1,
        message: 'Nouvelles Q&R publiées',
        actionRequired: 'Re-analyser le DCE',
        createdAt: new Date(),
      };

      await service.processAlert(alert);

      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'agent-appels-offres:9g',
          eventType: 'process_alert_qr_published',
        }),
      );
    });

    it('should send Slack notification for level 2 alert when SLACK_WEBHOOK_URL is configured', async () => {
      const configWithSlack = makeConfig({ SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test' });
      const serviceWithSlack = new MoniteurService(
        prisma as any,
        llmService as any,
        configWithSlack as any,
        httpService as any,
        agentEventLogger as any,
        makeQueue() as any,
        makeQueue() as any,
      );

      const alert: MonitorAlert = {
        type: 'dce_modified',
        tenderId: 'tender-001',
        level: 2,
        message: 'DCE modifié',
        actionRequired: 'Relancer analyse 9a',
        createdAt: new Date(),
      };

      await serviceWithSlack.processAlert(alert);

      expect(httpService.axiosRef.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({ text: expect.stringContaining('NIVEAU 2') }),
      );
    });

    it('should send urgent Slack notification for level 3 alert', async () => {
      const configWithSlack = makeConfig({ SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test' });
      const serviceWithSlack = new MoniteurService(
        prisma as any,
        llmService as any,
        configWithSlack as any,
        httpService as any,
        agentEventLogger as any,
        makeQueue() as any,
        makeQueue() as any,
      );

      const alert: MonitorAlert = {
        type: 'result_won',
        tenderId: 'tender-001',
        level: 3,
        message: 'Appel d\'offres GAGNÉ',
        actionRequired: 'Préparer signature',
        createdAt: new Date(),
      };

      await serviceWithSlack.processAlert(alert);

      expect(httpService.axiosRef.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({ text: expect.stringContaining('URGENT') }),
      );
    });

    it('should not call httpService when SLACK_WEBHOOK_URL is not configured', async () => {
      const alert: MonitorAlert = {
        type: 'dce_modified',
        tenderId: 'tender-001',
        level: 2,
        message: 'DCE modifié',
        actionRequired: 'Relancer analyse',
        createdAt: new Date(),
      };

      await service.processAlert(alert); // config has no SLACK_WEBHOOK_URL

      expect(httpService.axiosRef.post).not.toHaveBeenCalled();
    });
  });
});
