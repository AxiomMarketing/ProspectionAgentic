import { Test, TestingModule } from '@nestjs/testing';
import { ResponseClassifierService, ClassificationResult } from './response-classifier.service';
import { LlmService } from '@modules/llm/llm.service';
import { LlmTask } from '@modules/llm/llm.types';

const validLlmPayload = {
  category: 'INTERESSE',
  confidence: 0.95,
  sentiment: 'positif',
  action_suggeree: 'Planifier un call',
  date_retour_ooo: null,
  personne_referree: null,
  phrase_cle: 'Oui je suis disponible',
  raisonnement: 'Le prospect confirme son intérêt.',
};

const mockLlmService = {
  call: jest.fn().mockResolvedValue({
    content: JSON.stringify(validLlmPayload),
    model: 'mock',
    inputTokens: 10,
    outputTokens: 5,
    costEur: 0,
    durationMs: 100,
  }),
};

const classifyParams = {
  replyBody: 'Oui je suis disponible la semaine prochaine.',
  fromAddress: 'jean@acme.com',
  subject: 'Re: Votre projet digital',
  prospectName: 'Jean',
  prospectCompany: 'Acme',
  prospectPoste: 'CEO',
  lastMessageSent: 'Bonjour, avez-vous un moment pour échanger ?',
};

describe('ResponseClassifierService', () => {
  let service: ResponseClassifierService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ResponseClassifierService, { provide: LlmService, useValue: mockLlmService }],
    }).compile();

    service = module.get<ResponseClassifierService>(ResponseClassifierService);
  });

  it('should call LlmService with CLASSIFY_REPLY task', async () => {
    await service.classify(classifyParams);

    expect(mockLlmService.call).toHaveBeenCalledWith(
      expect.objectContaining({ task: LlmTask.CLASSIFY_REPLY }),
    );
  });

  it('should return parsed classification result from LLM response', async () => {
    const result: ClassificationResult = await service.classify(classifyParams);

    expect(result.category).toBe('INTERESSE');
    expect(result.confidence).toBe(0.95);
    expect(result.sentiment).toBe('positif');
    expect(result.actionSuggeree).toBe('Planifier un call');
    expect(result.phraseCle).toBe('Oui je suis disponible');
  });

  it('should return fallback DEMANDE_INFO when LLM returns unparseable response', async () => {
    mockLlmService.call.mockResolvedValueOnce({
      content: 'NOT_VALID_JSON !!!',
      model: 'mock',
      inputTokens: 10,
      outputTokens: 5,
      costEur: 0,
      durationMs: 100,
    });

    const result: ClassificationResult = await service.classify(classifyParams);

    expect(result.category).toBe('DEMANDE_INFO');
    expect(result.confidence).toBe(0.3);
    expect(result.sentiment).toBe('neutre');
    expect(result.actionSuggeree).toBe('Revue manuelle requise');
    expect(result.dateRetourOoo).toBeNull();
    expect(result.personneReferree).toBeNull();
  });

  it('should include replyBody excerpt in phraseCle when parsing fails', async () => {
    const shortReply = 'Je ne comprends pas.';
    mockLlmService.call.mockResolvedValueOnce({
      content: 'broken json',
      model: 'mock',
      inputTokens: 5,
      outputTokens: 2,
      costEur: 0,
      durationMs: 50,
    });

    const result = await service.classify({ ...classifyParams, replyBody: shortReply });

    expect(result.phraseCle).toBe(shortReply.substring(0, 100));
  });
});
