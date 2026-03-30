import { RedacteurProcessor } from './redacteur.processor';
import { RedacteurService } from '../../application/services/redacteur.service';

describe('RedacteurProcessor', () => {
  let processor: RedacteurProcessor;
  let redacteurService: jest.Mocked<RedacteurService>;

  beforeEach(() => {
    redacteurService = { generateMessage: jest.fn().mockResolvedValue({}), generateLinkedinMessage: jest.fn().mockResolvedValue({}) } as unknown as jest.Mocked<RedacteurService>;
    processor = new RedacteurProcessor(redacteurService);
  });

  it('should pass base fields to generateMessage', async () => {
    const job = {
      id: 'job-1',
      data: { prospectId: '550e8400-e29b-41d4-a716-446655440000', channel: 'email' as const },
    } as any;

    await processor.process(job);

    expect(redacteurService.generateMessage).toHaveBeenCalledWith({
      prospectId: '550e8400-e29b-41d4-a716-446655440000',
      channel: 'email',
      templateId: undefined,
      category: undefined,
      routing: undefined,
      breakdown: undefined,
    });
  });

  it('should pass category and routing to generateMessage', async () => {
    const routing = { sequenceId: 'seq-hot-a', canal: 'email', slaHours: 24, priority: 100, delayMs: 0 };
    const job = {
      id: 'job-2',
      data: {
        prospectId: '550e8400-e29b-41d4-a716-446655440000',
        channel: 'linkedin' as const,
        category: 'HOT_A',
        routing,
        breakdown: { icpFitNormalized: 30 },
      },
    } as any;

    await processor.process(job);

    // B1 fix: LinkedIn routes to generateLinkedinMessage
    expect(redacteurService.generateLinkedinMessage).toHaveBeenCalledWith({
      prospectId: '550e8400-e29b-41d4-a716-446655440000',
      channel: 'linkedin',
      templateId: undefined,
      category: 'HOT_A',
      routing,
      breakdown: { icpFitNormalized: 30 },
    });
  });

  it('should pass templateId when provided', async () => {
    const job = {
      id: 'job-3',
      data: {
        prospectId: '550e8400-e29b-41d4-a716-446655440000',
        channel: 'email' as const,
        templateId: '660e8400-e29b-41d4-a716-446655440001',
      },
    } as any;

    await processor.process(job);

    expect(redacteurService.generateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: '660e8400-e29b-41d4-a716-446655440001' }),
    );
  });
});
