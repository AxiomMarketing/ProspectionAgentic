# Intégration LLM — Claude API

## Vue d'ensemble

Trois modèles Claude sont utilisés selon la complexité et le coût des tâches. Un système de prompt caching réduit les coûts de ~90% sur les parties statiques. Chaque appel LLM est tracé dans Langfuse et comptabilisé dans le budget mensuel.

---

## Stratégie de Routing des Modèles

| Modèle | Tâche | Coût entrée | Coût sortie | Latence |
|--------|-------|-------------|-------------|---------|
| claude-haiku-3-5 | Classification, extraction, scoring | ~0.0008€/1k tokens | ~0.0004€/1k tokens | ~1s |
| claude-sonnet-4 | Génération emails, personnalisation | ~0.003€/1k tokens | ~0.015€/1k tokens | ~3-5s |
| claude-opus-4 | Analyse DCE, documents complexes | ~0.015€/1k tokens | ~0.075€/1k tokens | ~10-20s |

### Règles de routing

```typescript
// src/modules/llm/llm.service.ts
export enum LlmTask {
  // Haiku: tâches simples, rapides
  CLASSIFY_REPLY = 'classify_reply',
  EXTRACT_CONTACT_INFO = 'extract_contact_info',
  VALIDATE_EMAIL = 'validate_email',
  SCORE_PROSPECT = 'score_prospect',
  DETECT_LANGUAGE = 'detect_language',
  CHECK_BLACKLIST = 'check_blacklist',

  // Sonnet: génération, personnalisation
  GENERATE_EMAIL = 'generate_email',
  GENERATE_LINKEDIN_MESSAGE = 'generate_linkedin_message',
  PERSONALIZE_TEMPLATE = 'personalize_template',
  SUGGEST_NEXT_ACTION = 'suggest_next_action',
  GENERATE_QUOTE_SUMMARY = 'generate_quote_summary',

  // Opus: analyse complexe, documents longs
  ANALYZE_DCE = 'analyze_dce',
  ANALYZE_COMPANY_STRATEGY = 'analyze_company_strategy',
  REVIEW_CONTRACT = 'review_contract',
}

const MODEL_ROUTING: Record<LlmTask, ClaudeModel> = {
  // Haiku
  [LlmTask.CLASSIFY_REPLY]: 'claude-haiku-3-5',
  [LlmTask.EXTRACT_CONTACT_INFO]: 'claude-haiku-3-5',
  [LlmTask.VALIDATE_EMAIL]: 'claude-haiku-3-5',
  [LlmTask.SCORE_PROSPECT]: 'claude-haiku-3-5',
  [LlmTask.DETECT_LANGUAGE]: 'claude-haiku-3-5',
  [LlmTask.CHECK_BLACKLIST]: 'claude-haiku-3-5',

  // Sonnet
  [LlmTask.GENERATE_EMAIL]: 'claude-sonnet-4',
  [LlmTask.GENERATE_LINKEDIN_MESSAGE]: 'claude-sonnet-4',
  [LlmTask.PERSONALIZE_TEMPLATE]: 'claude-sonnet-4',
  [LlmTask.SUGGEST_NEXT_ACTION]: 'claude-sonnet-4',
  [LlmTask.GENERATE_QUOTE_SUMMARY]: 'claude-sonnet-4',

  // Opus
  [LlmTask.ANALYZE_DCE]: 'claude-opus-4',
  [LlmTask.ANALYZE_COMPANY_STRATEGY]: 'claude-opus-4',
  [LlmTask.REVIEW_CONTRACT]: 'claude-opus-4',
};

type ClaudeModel = 'claude-haiku-3-5' | 'claude-sonnet-4' | 'claude-opus-4';
```

---

## LLM Service Principal

```typescript
// src/modules/llm/llm.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { Langfuse } from 'langfuse';
import { PinoLogger } from 'nestjs-pino';
import { CostTrackerService } from './cost-tracker.service';
import { PromptCacheService } from './prompt-cache.service';
import { PiiSanitizerService } from './pii-sanitizer.service';
import { PromptInjectionGuard } from './prompt-injection.guard';

export interface LlmCallOptions {
  task: LlmTask;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  traceId?: string;
  traceName?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  enableCaching?: boolean;
  fallbackToTemplate?: string;
}

export interface LlmCallResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costEur: number;
  durationMs: number;
  langfuseGenerationId: string;
  usedFallback: boolean;
}

@Injectable()
export class LlmService {
  private readonly anthropic: Anthropic;
  private readonly langfuse: Langfuse;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly costTracker: CostTrackerService,
    private readonly promptCache: PromptCacheService,
    private readonly piiSanitizer: PiiSanitizerService,
    private readonly injectionGuard: PromptInjectionGuard,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('llm.anthropicApiKey'),
      maxRetries: 3,
      timeout: 60000,
    });

    this.langfuse = new Langfuse({
      publicKey: this.configService.get<string>('llm.langfusePublicKey'),
      secretKey: this.configService.get<string>('llm.langfuseSecretKey'),
      baseUrl: this.configService.get<string>('llm.langfuseHost'),
      flushAt: 20,
      flushInterval: 5000,
    });
  }

  async call(options: LlmCallOptions): Promise<LlmCallResult> {
    const start = Date.now();
    const model = MODEL_ROUTING[options.task];

    // 1. Vérification du budget
    const canProceed = await this.costTracker.checkBudget(model);
    if (!canProceed) {
      this.logger.warn(
        { task: options.task },
        'LLM budget exceeded, using fallback',
      );
      if (options.fallbackToTemplate) {
        return this.buildFallbackResult(options.fallbackToTemplate, start);
      }
      throw new Error('LLM budget exceeded and no fallback available');
    }

    // 2. Sanitation PII
    const sanitizedSystem = this.piiSanitizer.sanitize(options.systemPrompt);
    const sanitizedUser = this.piiSanitizer.sanitize(options.userPrompt);

    // 3. Détection injection de prompt
    const injectionResult = this.injectionGuard.check(sanitizedUser);
    if (injectionResult.detected) {
      this.logger.error(
        { patterns: injectionResult.patterns },
        'Prompt injection detected, blocking call',
      );
      throw new Error('Prompt injection detected');
    }

    // 4. Construction des messages avec cache
    const messages = this.buildMessages(sanitizedSystem, sanitizedUser, options);

    // 5. Trace Langfuse
    const trace = this.langfuse.trace({
      id: options.traceId,
      name: options.traceName || options.task,
      userId: options.userId,
      metadata: {
        task: options.task,
        model,
        ...options.metadata,
      },
    });

    const generation = trace.generation({
      name: `${options.task}_generation`,
      model,
      input: messages,
    });

    try {
      // 6. Appel API avec retry automatique
      const response = await this.callWithRetry(model, messages, options);

      const durationMs = Date.now() - start;
      const content = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

      const usage = response.usage;
      const costEur = this.costTracker.calculateCost(model, {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      });

      // 7. Enregistrement coût
      await this.costTracker.record({
        model,
        task: options.task,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        costEur,
        durationMs,
      });

      // 8. Finalisation trace Langfuse
      generation.end({
        output: content,
        usage: {
          input: usage.input_tokens,
          output: usage.output_tokens,
          total: usage.input_tokens + usage.output_tokens,
        },
        metadata: {
          costEur,
          cacheReadTokens: usage.cache_read_input_tokens,
          cacheWriteTokens: usage.cache_creation_input_tokens,
          durationMs,
        },
      });

      this.logger.info({
        task: options.task,
        model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens,
        costEur,
        durationMs,
      });

      return {
        content,
        model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        costEur,
        durationMs,
        langfuseGenerationId: generation.id,
        usedFallback: false,
      };
    } catch (error) {
      generation.end({
        output: null,
        metadata: { error: String(error), durationMs: Date.now() - start },
      });

      this.logger.error({ error, task: options.task, model }, 'LLM call failed');

      // Fallback sur template si disponible
      if (options.fallbackToTemplate) {
        this.logger.warn({ task: options.task }, 'Using template fallback');
        return this.buildFallbackResult(options.fallbackToTemplate, start);
      }

      throw error;
    }
  }

  private async callWithRetry(
    model: string,
    messages: Anthropic.Messages.MessageParam[],
    options: LlmCallOptions,
  ): Promise<Anthropic.Messages.Message> {
    const maxRetries = 3;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.anthropic.messages.create({
          model,
          max_tokens: options.maxTokens ?? 2048,
          temperature: options.temperature ?? 0.3,
          messages,
        });
      } catch (error) {
        lastError = error as Error;

        // Rate limit: attendre selon le header Retry-After
        if (error instanceof Anthropic.RateLimitError) {
          const retryAfter = parseInt(
            (error as any).headers?.['retry-after'] ?? '60',
          );
          this.logger.warn(
            { attempt, retryAfterSec: retryAfter },
            'Rate limited, waiting',
          );
          await this.sleep(retryAfter * 1000);
          continue;
        }

        // Overload: backoff exponentiel
        if (error instanceof Anthropic.APIError && error.status === 529) {
          const delay = Math.min(attempt * attempt * 2000, 30000);
          this.logger.warn(
            { attempt, delayMs: delay },
            'API overloaded, backing off',
          );
          await this.sleep(delay);
          continue;
        }

        // Autres erreurs: arrêter immédiatement
        throw error;
      }
    }

    throw lastError!;
  }

  private buildMessages(
    system: string,
    user: string,
    options: LlmCallOptions,
  ): Anthropic.Messages.MessageParam[] {
    // Le system prompt va en tant que paramètre séparé dans les appels système
    // mais ici on construit pour le prompt caching
    return [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: user,
          },
        ],
      },
    ];
  }

  private buildFallbackResult(template: string, start: number): LlmCallResult {
    return {
      content: template,
      model: 'template-fallback',
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costEur: 0,
      durationMs: Date.now() - start,
      langfuseGenerationId: '',
      usedFallback: true,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

---

## Prompt Caching (-90% de coût)

### Principe

L'API Claude supporte le caching des blocs de prompt marqués avec `cache_control: { type: "ephemeral" }`. Les tokens cachés sont 10x moins chers en lecture. Le cache est conservé 5 minutes minimum par Anthropic.

```typescript
// src/modules/llm/prompt-cache.service.ts
import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface CachedSystemBlock {
  text: string;
  isCacheable: boolean;  // true si >1024 tokens (minimum pour le cache)
}

@Injectable()
export class PromptCacheService {
  /**
   * Construit un système de messages avec cache sur les parties statiques.
   * Structure recommandée:
   * 1. Instructions système statiques → cache_control (mis en cache)
   * 2. Exemples few-shot statiques → cache_control (mis en cache)
   * 3. Données dynamiques du prospect → PAS de cache
   * 4. Question/instruction → PAS de cache
   */
  buildCachedMessages(
    staticSystemPrompt: string,    // Mis en cache (instructions)
    staticExamples: string | null, // Mis en cache (few-shot)
    dynamicContext: string,        // PAS de cache (données prospect)
    userInstruction: string,       // PAS de cache (question)
  ): {
    system: Anthropic.Messages.TextBlockParam[];
    messages: Anthropic.Messages.MessageParam[];
  } {
    const systemBlocks: Anthropic.Messages.TextBlockParam[] = [];

    // Bloc 1: Instructions statiques → cache
    systemBlocks.push({
      type: 'text',
      text: staticSystemPrompt,
      // @ts-expect-error cache_control est une preview feature
      cache_control: { type: 'ephemeral' },
    });

    // Bloc 2: Exemples few-shot → cache (si fournis)
    if (staticExamples) {
      systemBlocks.push({
        type: 'text',
        text: staticExamples,
        // @ts-expect-error cache_control est une preview feature
        cache_control: { type: 'ephemeral' },
      });
    }

    // Message utilisateur avec contexte dynamique + instruction
    const userContent = dynamicContext
      ? `<context>\n${dynamicContext}\n</context>\n\n${userInstruction}`
      : userInstruction;

    return {
      system: systemBlocks,
      messages: [{ role: 'user', content: userContent }],
    };
  }

  /**
   * Estime les économies de cache sur un mois.
   * Base: 10M tokens/mois sur le system prompt
   */
  estimateMonthlySavings(params: {
    monthlyCallCount: number;
    systemPromptTokens: number;
    modelPricePerMInputToken: number;
    cachePriceMultiplier: number;  // 0.1 = 10x moins cher
  }): { savedEur: number; percentSaved: number } {
    const { monthlyCallCount, systemPromptTokens, modelPricePerMInputToken, cachePriceMultiplier } = params;

    const normalCost =
      (monthlyCallCount * systemPromptTokens * modelPricePerMInputToken) / 1_000_000;

    // Premier appel: cache write (1.25x) + lecture suivantes: cache read (0.1x)
    const cacheWriteCost =
      (systemPromptTokens * modelPricePerMInputToken * 1.25) / 1_000_000;
    const cacheReadCost =
      ((monthlyCallCount - 1) *
        systemPromptTokens *
        modelPricePerMInputToken *
        cachePriceMultiplier) /
      1_000_000;

    const cachedCost = cacheWriteCost + cacheReadCost;
    const savedEur = normalCost - cachedCost;

    return {
      savedEur,
      percentSaved: (savedEur / normalCost) * 100,
    };
  }
}
```

### Exemple concret — Génération d'email

```typescript
// Utilisation dans PersonalizationAgent
async generateProspectingEmail(prospect: Prospect): Promise<string> {
  const { system, messages } = this.promptCache.buildCachedMessages(
    // Bloc 1 — CACHE: Instructions invariantes (env. 800 tokens)
    `Tu es un expert en prospection B2B pour une agence de transformation digitale.
     Tes emails doivent être:
     - Concis (150-200 mots maximum)
     - Personnalisés selon le contexte du prospect
     - Sans formules génériques ("J'espère que ce message vous trouve bien")
     - Avec une proposition de valeur claire et spécifique
     - Terminant par une question ouverte concrète
     - En français professionnel mais naturel

     Structure obligatoire:
     1. Accroche personnalisée (1 phrase, fait sur l'entreprise)
     2. Problème adressé (1-2 phrases)
     3. Notre approche différenciante (1-2 phrases)
     4. CTA concret (1 phrase, question ou proposition)`,

    // Bloc 2 — CACHE: Exemples few-shot (env. 600 tokens)
    `<examples>
     <example>
       <context>PME 50 salariés, directeur marketing, site e-commerce Magento</context>
       <email>
       Objet: Question sur votre refonte Magento → Lidl, Decathlon et une agence de 8 personnes

       Bonjour [Prénom],

       J'ai vu votre post LinkedIn sur les défis de performance de votre site Magento — les -40% de conversion mobile, c'est exactement le problème qu'on a résolu pour Duval & Fontaine il y a 6 mois.

       La plupart des agences proposent une refonte complète (12-18 mois, 150k€+). On a une approche différente: on identifie les 20% de changements qui génèrent 80% de l'impact en 8 semaines.

       Auriez-vous 20 minutes cette semaine pour qu'on partage notre diagnostic gratuit sur votre site?
       </email>
     </example>
     </examples>`,

    // Données dynamiques — PAS de cache
    `Prospect: ${prospect.fullName}
     Entreprise: ${prospect.companyName} (${prospect.companySize} salariés)
     Secteur NAF: ${prospect.companyNafCode}
     Stack technique: ${JSON.stringify(prospect.companyTechStack)}
     Signaux récents: ${prospect.enrichmentData?.signals?.join(', ')}`,

    // Instruction — PAS de cache
    'Génère un email de prospection B2B pour ce prospect. Réponds uniquement avec le texte de l\'email (objet inclus).',
  );

  const result = await this.llmService.callWithSystem({
    system,
    messages,
    model: 'claude-sonnet-4',
    maxTokens: 400,
    task: LlmTask.GENERATE_EMAIL,
  });

  return result.content;
}
```

---

## Gestion des Prompts

### Structure de versioning

```typescript
// src/modules/llm/prompts/prompt-registry.ts
export interface PromptDefinition {
  id: string;
  version: string;
  task: LlmTask;
  model: ClaudeModel;
  systemPrompt: string;
  examplePrompt?: string;
  variables: string[];  // Variables attendues dans le user prompt
  maxTokens: number;
  temperature: number;
  tags: string[];
  isActive: boolean;
  abTestGroup?: 'A' | 'B';
  successMetric?: string;  // Nom de la métrique à tracker
}

export const PROMPT_REGISTRY: Record<string, PromptDefinition> = {
  'email.prospecting.v2': {
    id: 'email.prospecting.v2',
    version: '2.1',
    task: LlmTask.GENERATE_EMAIL,
    model: 'claude-sonnet-4',
    systemPrompt: SYSTEM_PROMPTS.EMAIL_PROSPECTING,
    examplePrompt: EXAMPLE_PROMPTS.EMAIL_FEW_SHOT,
    variables: ['prospect_name', 'company_name', 'tech_stack', 'signals'],
    maxTokens: 400,
    temperature: 0.4,
    tags: ['email', 'cold-outreach', 'b2b'],
    isActive: true,
    successMetric: 'email_reply_rate',
  },
  'reply.classify.v1': {
    id: 'reply.classify.v1',
    version: '1.3',
    task: LlmTask.CLASSIFY_REPLY,
    model: 'claude-haiku-3-5',
    systemPrompt: SYSTEM_PROMPTS.REPLY_CLASSIFICATION,
    variables: ['reply_text', 'original_email'],
    maxTokens: 100,
    temperature: 0.1,
    tags: ['classification', 'reply'],
    isActive: true,
  },
  'dce.analyze.v1': {
    id: 'dce.analyze.v1',
    version: '1.0',
    task: LlmTask.ANALYZE_DCE,
    model: 'claude-opus-4',
    systemPrompt: SYSTEM_PROMPTS.DCE_ANALYSIS,
    variables: ['dce_content', 'our_capabilities'],
    maxTokens: 4000,
    temperature: 0.2,
    tags: ['dce', 'tender', 'analysis'],
    isActive: true,
  },
};
```

### A/B Testing de prompts

```typescript
// src/modules/llm/prompt-ab-test.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { createHash } from 'crypto';

@Injectable()
export class PromptAbTestService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Détermine le groupe A/B d'un prospect de façon déterministe.
   * Le même prospect verra toujours la même variante.
   */
  getVariant(prospectId: string, testId: string): 'A' | 'B' {
    const hash = createHash('md5')
      .update(`${prospectId}:${testId}`)
      .digest('hex');
    return parseInt(hash[0], 16) % 2 === 0 ? 'A' : 'B';
  }

  /**
   * Enregistre le résultat d'un A/B test pour analyse.
   */
  async recordResult(params: {
    testId: string;
    variant: 'A' | 'B';
    prospectId: string;
    outcome: 'open' | 'click' | 'reply' | 'meeting';
  }): Promise<void> {
    await this.prisma.metriquesDaily.upsert({
      where: {
        date_metricName_dimensions: {
          date: new Date().toISOString().split('T')[0],
          metricName: `ab_test_${params.testId}_${params.outcome}`,
          dimensions: { variant: params.variant },
        },
      },
      update: { metricValue: { increment: 1 } },
      create: {
        date: new Date(),
        metricName: `ab_test_${params.testId}_${params.outcome}`,
        metricValue: 1,
        dimensions: { variant: params.variant },
      },
    });
  }

  /**
   * Calcule la signification statistique du test (test Chi-2 simplifié).
   */
  async getTestResults(testId: string): Promise<{
    variantA: { sends: number; replies: number; rate: number };
    variantB: { sends: number; replies: number; rate: number };
    winner: 'A' | 'B' | 'none';
    confidence: number;
  }> {
    // Requête sur metriques_daily pour les derniers 30 jours
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const metrics = await this.prisma.$queryRaw<
      Array<{ variant: string; outcome: string; total: number }>
    >`
      SELECT
        dimensions->>'variant' as variant,
        REPLACE(metric_name, ${'ab_test_' + testId + '_'}, '') as outcome,
        SUM(metric_value) as total
      FROM metriques_daily
      WHERE metric_name LIKE ${'ab_test_' + testId + '_%'}
        AND date >= ${cutoff}
      GROUP BY 1, 2
    `;

    const getCount = (v: string, o: string) =>
      Number(metrics.find((m) => m.variant === v && m.outcome === o)?.total ?? 0);

    const aReplies = getCount('A', 'reply');
    const bReplies = getCount('B', 'reply');
    const aSends = getCount('A', 'send');
    const bSends = getCount('B', 'send');

    const aRate = aSends > 0 ? aReplies / aSends : 0;
    const bRate = bSends > 0 ? bReplies / bSends : 0;

    // Confidence simplifiée (95% si >100 envois et >20% d'écart)
    const hasEnoughData = aSends > 100 && bSends > 100;
    const hasSignificantDiff = Math.abs(aRate - bRate) / Math.max(aRate, bRate) > 0.2;
    const confidence = hasEnoughData && hasSignificantDiff ? 95 : 0;

    return {
      variantA: { sends: aSends, replies: aReplies, rate: aRate },
      variantB: { sends: bSends, replies: bReplies, rate: bRate },
      winner: confidence >= 95 ? (aRate > bRate ? 'A' : 'B') : 'none',
      confidence,
    };
  }
}
```

---

## Sanitation PII

```typescript
// src/modules/llm/pii-sanitizer.service.ts
import { Injectable } from '@nestjs/common';

interface SanitizationResult {
  text: string;
  replacements: Array<{ original: string; replacement: string; type: string }>;
}

@Injectable()
export class PiiSanitizerService {
  private readonly PATTERNS: Array<{
    name: string;
    regex: RegExp;
    replacement: string;
  }> = [
    // Email
    {
      name: 'email',
      regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      replacement: '[EMAIL]',
    },
    // Téléphone français
    {
      name: 'phone_fr',
      regex: /(?:\+33|0033|0)[1-9](?:[\s.-]?\d{2}){4}/g,
      replacement: '[PHONE]',
    },
    // Numéro de sécurité sociale
    {
      name: 'nss',
      regex: /[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}/g,
      replacement: '[NSS]',
    },
    // IBAN
    {
      name: 'iban',
      regex: /[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}/g,
      replacement: '[IBAN]',
    },
    // Carte de crédit (basique)
    {
      name: 'credit_card',
      regex: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g,
      replacement: '[CARD]',
    },
  ];

  sanitize(text: string): string {
    let sanitized = text;
    for (const pattern of this.PATTERNS) {
      sanitized = sanitized.replace(pattern.regex, pattern.replacement);
    }
    return sanitized;
  }

  sanitizeDetailed(text: string): SanitizationResult {
    const replacements: SanitizationResult['replacements'] = [];
    let sanitized = text;

    for (const pattern of this.PATTERNS) {
      sanitized = sanitized.replace(pattern.regex, (match) => {
        replacements.push({
          original: match,
          replacement: pattern.replacement,
          type: pattern.name,
        });
        return pattern.replacement;
      });
    }

    return { text: sanitized, replacements };
  }

  /**
   * Vérifie si un texte contient des PII détectables.
   * Utilisé avant d'envoyer à Claude pour audit.
   */
  containsPii(text: string): boolean {
    return this.PATTERNS.some((p) => p.regex.test(text));
  }
}
```

---

## Détection d'Injection de Prompt

```typescript
// src/modules/llm/prompt-injection.guard.ts
import { Injectable } from '@nestjs/common';

export interface InjectionCheckResult {
  detected: boolean;
  patterns: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

@Injectable()
export class PromptInjectionGuard {
  private readonly INJECTION_PATTERNS: Array<{
    name: string;
    pattern: RegExp;
    risk: 'low' | 'medium' | 'high';
  }> = [
    // Tentatives de redéfinition du rôle
    {
      name: 'role_override',
      pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
      risk: 'high',
    },
    {
      name: 'system_override',
      pattern: /you\s+are\s+now\s+|act\s+as\s+if\s+you\s+are/i,
      risk: 'high',
    },
    {
      name: 'jailbreak_dan',
      pattern: /do\s+anything\s+now|DAN\s+mode|jailbreak/i,
      risk: 'high',
    },
    // Tentatives d'exfiltration
    {
      name: 'reveal_system',
      pattern:
        /reveal\s+(your\s+)?(system|prompt|instructions|training|persona)/i,
      risk: 'high',
    },
    {
      name: 'print_instructions',
      pattern: /print\s+(all\s+)?(your\s+)?(instructions|system\s+prompt)/i,
      risk: 'high',
    },
    // Délimiteurs de prompt injection
    {
      name: 'delimiter_injection',
      pattern: /```\s*(system|assistant|human|user)\s*```/i,
      risk: 'medium',
    },
    {
      name: 'xml_injection',
      pattern: /<\/?(?:system|prompt|instruction|context)>/i,
      risk: 'medium',
    },
    // Balises suspectes
    {
      name: 'hidden_text',
      pattern: /\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>/i,
      risk: 'high',
    },
  ];

  check(userInput: string): InjectionCheckResult {
    const detected: string[] = [];
    let maxRisk: 'low' | 'medium' | 'high' = 'low';

    for (const { name, pattern, risk } of this.INJECTION_PATTERNS) {
      if (pattern.test(userInput)) {
        detected.push(name);
        if (risk === 'high') maxRisk = 'high';
        else if (risk === 'medium' && maxRisk !== 'high') maxRisk = 'medium';
      }
    }

    return {
      detected: detected.length > 0,
      patterns: detected,
      riskLevel: maxRisk,
    };
  }
}
```

---

## Suivi des Coûts et Budget

```typescript
// src/modules/llm/cost-tracker.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

// Tarifs en EUR pour 1M tokens (au 2025)
const MODEL_PRICING: Record<string, {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}> = {
  'claude-haiku-3-5': {
    input: 0.80,
    output: 4.00,
    cacheRead: 0.08,
    cacheWrite: 1.00,
  },
  'claude-sonnet-4': {
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 3.75,
  },
  'claude-opus-4': {
    input: 15.00,
    output: 75.00,
    cacheRead: 1.50,
    cacheWrite: 18.75,
  },
};

@Injectable()
export class CostTrackerService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  calculateCost(model: string, usage: TokenUsage): number {
    const pricing = MODEL_PRICING[model];
    if (!pricing) return 0;

    return (
      (usage.inputTokens * pricing.input +
        usage.outputTokens * pricing.output +
        usage.cacheReadTokens * pricing.cacheRead +
        usage.cacheWriteTokens * pricing.cacheWrite) /
      1_000_000
    );
  }

  async checkBudget(model: string): Promise<boolean> {
    const dailyBudget = this.configService.get<number>('llm.dailyBudgetEur', 25);
    const monthlyBudget = this.configService.get<number>('llm.monthlyBudgetEur', 500);

    const [dailySpend, monthlySpend] = await Promise.all([
      this.getDailySpend(),
      this.getMonthlySpend(),
    ]);

    if (dailySpend >= dailyBudget) {
      return false;
    }
    if (monthlySpend >= monthlyBudget) {
      return false;
    }

    // Avertissement à 80% du budget
    if (dailySpend >= dailyBudget * 0.8 || monthlySpend >= monthlyBudget * 0.8) {
      await this.sendBudgetAlert(dailySpend, monthlySpend);
    }

    return true;
  }

  async record(params: {
    model: string;
    task: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costEur: number;
    durationMs: number;
  }): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const month = today.substring(0, 7);

    // Incrémenter dans Redis (fast path)
    const pipeline = this.redis.getClient().multi();
    pipeline.incrbyfloat(`llm:cost:daily:${today}`, params.costEur);
    pipeline.expire(`llm:cost:daily:${today}`, 86400 * 2);
    pipeline.incrbyfloat(`llm:cost:monthly:${month}`, params.costEur);
    pipeline.expire(`llm:cost:monthly:${month}`, 86400 * 35);
    await pipeline.exec();

    // Persister dans PostgreSQL (async, non bloquant)
    this.prisma.metriquesDaily
      .upsert({
        where: {
          date_metricName_dimensions: {
            date: new Date(today),
            metricName: 'llm_cost_eur',
            dimensions: { model: params.model, task: params.task },
          },
        },
        update: { metricValue: { increment: params.costEur } },
        create: {
          date: new Date(today),
          metricName: 'llm_cost_eur',
          metricValue: params.costEur,
          dimensions: { model: params.model, task: params.task },
        },
      })
      .catch((err) => console.error('Failed to persist LLM cost:', err));
  }

  private async getDailySpend(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const value = await this.redis.getClient().get(`llm:cost:daily:${today}`);
    return parseFloat(value ?? '0');
  }

  private async getMonthlySpend(): Promise<number> {
    const month = new Date().toISOString().substring(0, 7);
    const value = await this.redis.getClient().get(`llm:cost:monthly:${month}`);
    return parseFloat(value ?? '0');
  }

  private async sendBudgetAlert(
    dailySpend: number,
    monthlySpend: number,
  ): Promise<void> {
    const alertKey = `llm:budget:alert:${new Date().toISOString().split('T')[0]}`;
    const alreadyAlerted = await this.redis.exists(alertKey);
    if (alreadyAlerted) return;

    await this.redis.set(alertKey, true, 3600);

    // Enregistrer l'alerte en base
    await this.prisma.alertes.create({
      data: {
        severity: 'warning',
        title: 'Budget LLM à 80%',
        description: `Dépense journalière: ${dailySpend.toFixed(2)}€. Dépense mensuelle: ${monthlySpend.toFixed(2)}€.`,
        category: 'budget',
        metricName: 'llm_cost_eur',
        metricValue: monthlySpend,
      },
    });
  }

  async getSpendReport(): Promise<{
    today: number;
    thisMonth: number;
    byModel: Record<string, number>;
    byTask: Record<string, number>;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(today.substring(0, 7) + '-01');

    const [dailySpend, metrics] = await Promise.all([
      this.getDailySpend(),
      this.prisma.metriquesDaily.findMany({
        where: {
          metricName: 'llm_cost_eur',
          date: { gte: monthStart },
        },
      }),
    ]);

    const monthlySpend = metrics.reduce(
      (sum, m) => sum + Number(m.metricValue),
      0,
    );

    const byModel: Record<string, number> = {};
    const byTask: Record<string, number> = {};

    for (const m of metrics) {
      const dims = m.dimensions as Record<string, string>;
      const model = dims.model ?? 'unknown';
      const task = dims.task ?? 'unknown';
      byModel[model] = (byModel[model] ?? 0) + Number(m.metricValue);
      byTask[task] = (byTask[task] ?? 0) + Number(m.metricValue);
    }

    return { today: dailySpend, thisMonth: monthlySpend, byModel, byTask };
  }
}
```

---

## Gestion des Rate Limits

### Niveaux Anthropic

| Tier | Requêtes/min | Tokens/min | Tokens/jour |
|------|-------------|------------|-------------|
| Tier 1 | 50 | 40K | 1M |
| Tier 2 | 1000 | 80K | 2.5M |
| Tier 3 | 2000 | 160K | 5M |
| Tier 4 | 4000 | 400K | 25M |

### Stratégie de throttling

```typescript
// src/modules/llm/llm-rate-limiter.service.ts
import { Injectable } from '@nestjs/common';
import { RedisService } from '../../shared/redis/redis.service';

@Injectable()
export class LlmRateLimiterService {
  // Fenêtres glissantes par modèle
  private readonly LIMITS: Record<string, { rpm: number; tpm: number }> = {
    'claude-haiku-3-5': { rpm: 2000, tpm: 160_000 },
    'claude-sonnet-4': { rpm: 1000, tpm: 80_000 },
    'claude-opus-4': { rpm: 500, tpm: 40_000 },
  };

  constructor(private readonly redis: RedisService) {}

  async checkAndIncrement(
    model: string,
    estimatedTokens: number,
  ): Promise<{ allowed: boolean; waitMs: number }> {
    const limits = this.LIMITS[model];
    if (!limits) return { allowed: true, waitMs: 0 };

    const now = Math.floor(Date.now() / 1000);
    const rpmKey = `ratelimit:${model}:rpm:${now}`;
    const tpmKey = `ratelimit:${model}:tpm:${now}`;

    const client = this.redis.getClient();
    const [rpmCount, tpmCount] = await Promise.all([
      client.incr(rpmKey),
      client.incrBy(tpmKey, estimatedTokens),
    ]);

    // Expiration après 70s (1 minute + marge)
    await Promise.all([
      client.expire(rpmKey, 70),
      client.expire(tpmKey, 70),
    ]);

    if (rpmCount > limits.rpm || tpmCount > limits.tpm) {
      // Attendre jusqu'à la prochaine fenêtre
      const waitMs = (60 - (Date.now() / 1000 - now)) * 1000 + 100;
      // Décrémenter ce qu'on vient d'incrémenter
      await Promise.all([
        client.decr(rpmKey),
        client.decrBy(tpmKey, estimatedTokens),
      ]);
      return { allowed: false, waitMs };
    }

    return { allowed: true, waitMs: 0 };
  }
}
```

---

## Prompts Systèmes Clés

```typescript
// src/modules/llm/prompts/system-prompts.ts
export const SYSTEM_PROMPTS = {
  REPLY_CLASSIFICATION: `
Tu es un expert en analyse de réponses email B2B. Classifie la réponse selon ce JSON strict:
{
  "sentiment": "positive|negative|neutral|out_of_office|unsubscribe_request",
  "intent": "schedule_call|request_more_info|not_interested|wrong_person|referral|auto_reply|unsubscribe",
  "next_best_action": "book_meeting|send_more_info|mark_lost|forward_to_contact|unsubscribe|no_action",
  "confidence": 0.0-1.0,
  "suggested_response": "texte en 2-3 phrases maximum si pertinent, sinon null"
}
Réponds UNIQUEMENT avec le JSON, sans markdown ni explications.`,

  DCE_ANALYSIS: `
Tu es un expert en marchés publics français et en réponse à appels d'offres.
Analyse ce DCE (Dossier de Consultation des Entreprises) et retourne une analyse structurée:

1. SYNTHÈSE (150 mots max): nature du marché, acheteur, budget estimé, délai
2. ADÉQUATION OFFRE (score 0-100): évalue si notre agence peut répondre
3. EXIGENCES CLÉS: liste des 5-10 critères techniques/financiers importants
4. RISQUES: obstacles potentiels à notre candidature
5. RECOMMANDATION: "Répondre", "Abstenir", "Partenariat requis"

Sois factuel et précis. Ignore les parties administratives standard.`,
};
```
