import { ScoreurProcessor } from './scoreur.processor';
import { ScoreurService } from '../../application/services/scoreur.service';
import { AgentEventLoggerService } from '@shared/services/agent-event-logger.service';
import { Job } from 'bullmq';

describe('ScoreurProcessor', () => {
  let processor: ScoreurProcessor;
  let scoreurService: jest.Mocked<Pick<ScoreurService, 'calculateScore'>>;
  let agentEventLogger: jest.Mocked<Pick<AgentEventLoggerService, 'log'>>;

  const makeJob = (data: Record<string, unknown>, id = 'job-1'): Job<{ prospectId: string }> =>
    ({ id, data } as unknown as Job<{ prospectId: string }>);

  beforeEach(() => {
    scoreurService = { calculateScore: jest.fn() };
    agentEventLogger = { log: jest.fn().mockResolvedValue(undefined) };

    processor = new ScoreurProcessor(
      scoreurService as unknown as ScoreurService,
      agentEventLogger as unknown as AgentEventLoggerService,
    );
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('invalid job data', () => {
    it('should return early and not call calculateScore when prospectId is missing', async () => {
      const job = makeJob({});
      await processor.process(job);
      expect(scoreurService.calculateScore).not.toHaveBeenCalled();
    });

    it('should return early when job.data is null', async () => {
      const job = makeJob(null as unknown as Record<string, unknown>);
      await processor.process(job);
      expect(scoreurService.calculateScore).not.toHaveBeenCalled();
    });
  });

  describe('successful processing', () => {
    it('should call calculateScore with the correct prospectId', async () => {
      scoreurService.calculateScore.mockResolvedValue({} as any);
      const job = makeJob({ prospectId: 'prospect-123' });

      await processor.process(job);

      expect(scoreurService.calculateScore).toHaveBeenCalledWith({ prospectId: 'prospect-123' });
    });

    it('should log a scoring_job_completed event on success', async () => {
      scoreurService.calculateScore.mockResolvedValue({} as any);
      const job = makeJob({ prospectId: 'prospect-123' });

      await processor.process(job);

      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'scoreur',
          eventType: 'scoring_job_completed',
          prospectId: 'prospect-123',
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should log a scoring_error event and rethrow when calculateScore throws', async () => {
      const err = new Error('DB failure');
      scoreurService.calculateScore.mockRejectedValue(err);
      const job = makeJob({ prospectId: 'prospect-456' });

      await expect(processor.process(job)).rejects.toThrow('DB failure');

      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'scoreur',
          eventType: 'scoring_error',
          prospectId: 'prospect-456',
          errorMessage: 'DB failure',
        }),
      );
    });
  });

  describe('timeout handling', () => {
    it('should reject with timeout error when calculateScore takes longer than 30s', async () => {
      jest.useFakeTimers();

      scoreurService.calculateScore.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 60_000)),
      );

      const job = makeJob({ prospectId: 'prospect-timeout' });
      const processPromise = processor.process(job);

      jest.advanceTimersByTime(30_001);

      await expect(processPromise).rejects.toThrow('Scoring timeout (30s)');

      expect(agentEventLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: 'scoreur',
          eventType: 'scoring_error',
          errorMessage: 'Scoring timeout (30s)',
        }),
      );
    });
  });
});
