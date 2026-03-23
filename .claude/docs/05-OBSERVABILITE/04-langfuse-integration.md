# Intégration Langfuse — Traçabilité LLM

## Pourquoi Langfuse

### Critères de sélection

| Critère | Langfuse | Alternative (LangSmith) | Alternative (Helicone) |
|---|---|---|---|
| Licence | MIT open-source | Propriétaire | Propriétaire |
| Hébergement | Self-hosted OU cloud | Cloud uniquement | Cloud uniquement |
| Confidentialité | Vos données restent chez vous | Envoyées vers LangChain | Envoyées vers Helicone |
| Coût | Infrastructure only | $39+/mois | $20+/mois |
| Multi-agent traces | Oui (nested spans) | Oui | Limité |
| Évaluations custom | Oui | Oui | Non |
| Prompt management | Oui (versionné, A/B) | Oui | Non |
| SDK Node.js | Oui (@langfuse/langfuse-node) | Oui | Oui |
| Intégration NestJS | Oui | Partielle | Non |

### Fonctionnalités utilisées dans ce projet

1. **Traces** — Chaque cycle d'agent = 1 trace, chaque appel LLM = 1 span
2. **Coûts** — Calcul automatique des coûts par modèle (Haiku, Sonnet, Opus)
3. **Évaluations** — Scoring automatique de la qualité des emails générés
4. **Prompt management** — Versioning des system prompts, A/B testing
5. **Dashboard de coûts** — Visualisation par agent, par jour, par modèle
6. **Détection d'hallucinations** — Évaluation automatique des réponses LLM
7. **Graph multi-agent** — Visualisation des appels LLM imbriqués entre agents

---

## Déploiement Docker

### docker-compose.langfuse.yml

```yaml
version: '3.9'

services:
  langfuse-server:
    image: langfuse/langfuse:3
    container_name: prospection-langfuse
    depends_on:
      langfuse-postgres:
        condition: service_healthy
      langfuse-redis:
        condition: service_healthy
    ports:
      - "3100:3000"
    environment:
      # Base de données Langfuse (séparée de la DB principale)
      DATABASE_URL: postgresql://langfuse:${LANGFUSE_DB_PASSWORD}@langfuse-postgres:5432/langfuse
      REDIS_HOST: langfuse-redis
      REDIS_PORT: 6379
      REDIS_AUTH: ${LANGFUSE_REDIS_PASSWORD}

      # Clés secrètes (générer avec: openssl rand -hex 32)
      NEXTAUTH_SECRET: ${LANGFUSE_NEXTAUTH_SECRET}
      SALT: ${LANGFUSE_SALT}

      # URL de l'application
      NEXTAUTH_URL: http://langfuse.internal:3100
      LANGFUSE_CSP_ENFORCE_HTTPS: false

      # Organisation initiale
      LANGFUSE_INIT_ORG_ID: prospection-agentic
      LANGFUSE_INIT_ORG_NAME: "ProspectionAgentic"
      LANGFUSE_INIT_PROJECT_ID: main-project
      LANGFUSE_INIT_PROJECT_NAME: "ProspectionAgentic"
      LANGFUSE_INIT_PROJECT_PUBLIC_KEY: ${LANGFUSE_PUBLIC_KEY}
      LANGFUSE_INIT_PROJECT_SECRET_KEY: ${LANGFUSE_SECRET_KEY}
      LANGFUSE_INIT_USER_EMAIL: ${LANGFUSE_ADMIN_EMAIL}
      LANGFUSE_INIT_USER_NAME: ${LANGFUSE_ADMIN_NAME}
      LANGFUSE_INIT_USER_PASSWORD: ${LANGFUSE_ADMIN_PASSWORD}

      # Rétention des traces (90 jours)
      LANGFUSE_TRACING_ENABLED: true

      # Désactiver la télémétrie vers Langfuse Cloud
      TELEMETRY_ENABLED: false

    volumes:
      - langfuse-data:/app/public/upload
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/public/health"]
      interval: 30s
      timeout: 10s
      retries: 5

  langfuse-postgres:
    image: postgres:16-alpine
    container_name: prospection-langfuse-postgres
    environment:
      POSTGRES_USER: langfuse
      POSTGRES_PASSWORD: ${LANGFUSE_DB_PASSWORD}
      POSTGRES_DB: langfuse
    volumes:
      - langfuse-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U langfuse"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  langfuse-redis:
    image: redis:7-alpine
    container_name: prospection-langfuse-redis
    command: redis-server --requirepass ${LANGFUSE_REDIS_PASSWORD}
    volumes:
      - langfuse-redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "--pass", "${LANGFUSE_REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  langfuse-data:
  langfuse-postgres-data:
  langfuse-redis-data:
```

### Variables d'environnement Langfuse

```dotenv
# .env — Section Langfuse
LANGFUSE_HOST=http://langfuse.internal:3100
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Admin initial
LANGFUSE_ADMIN_EMAIL=admin@yourcompany.com
LANGFUSE_ADMIN_NAME=Admin
LANGFUSE_ADMIN_PASSWORD=changeme-strong-password

# Secrets (générer avec: openssl rand -hex 32)
LANGFUSE_NEXTAUTH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
LANGFUSE_SALT=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
LANGFUSE_DB_PASSWORD=langfuse-db-strong-password
LANGFUSE_REDIS_PASSWORD=langfuse-redis-strong-password
```

---

## Intégration NestJS

### Installation

```bash
npm install langfuse
npm install --save-dev @types/node
```

### Module Langfuse

```typescript
// src/langfuse/langfuse.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LangfuseService } from './langfuse.service';
import { LangfuseTraceInterceptor } from './langfuse-trace.interceptor';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [LangfuseService, LangfuseTraceInterceptor],
  exports: [LangfuseService, LangfuseTraceInterceptor],
})
export class LangfuseModule {}
```

### Service principal Langfuse

```typescript
// src/langfuse/langfuse.service.ts
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Langfuse, {
  LangfuseTraceClient,
  LangfuseSpanClient,
  LangfuseGenerationClient,
} from 'langfuse';

export interface CreateTraceOptions {
  name: string;
  agentName: string;
  agentId: string;
  executionId: string;
  correlationId: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface CreateGenerationOptions {
  name: string;
  model: string;
  modelParameters?: Record<string, unknown>;
  input: string | object;
  output?: string | object;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  startTime?: Date;
  endTime?: Date;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
  level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';
}

@Injectable()
export class LangfuseService implements OnModuleDestroy {
  private readonly client: Langfuse;
  private readonly logger = new Logger(LangfuseService.name);

  constructor(private readonly config: ConfigService) {
    this.client = new Langfuse({
      publicKey: config.getOrThrow('LANGFUSE_PUBLIC_KEY'),
      secretKey: config.getOrThrow('LANGFUSE_SECRET_KEY'),
      baseUrl: config.getOrThrow('LANGFUSE_HOST'),
      // Flush les événements toutes les 5 secondes ou à chaque 50 événements
      flushAt: 50,
      flushInterval: 5000,
      // Ne pas crash si Langfuse est inaccessible
      enabled: config.get('LANGFUSE_ENABLED', 'true') === 'true',
    });

    this.client.on('error', (err) => {
      this.logger.warn('Langfuse error (non-blocking):', err.message);
    });
  }

  createTrace(options: CreateTraceOptions): LangfuseTraceClient {
    return this.client.trace({
      id: options.correlationId,
      name: options.name,
      userId: options.userId,
      sessionId: options.sessionId ?? options.executionId,
      tags: [
        `agent:${options.agentName}`,
        `execution:${options.executionId}`,
        ...(options.tags ?? []),
      ],
      metadata: {
        agentId: options.agentId,
        agentName: options.agentName,
        executionId: options.executionId,
        ...options.metadata,
      },
    });
  }

  createSpan(
    trace: LangfuseTraceClient,
    name: string,
    metadata?: Record<string, unknown>,
  ): LangfuseSpanClient {
    return trace.span({
      name,
      startTime: new Date(),
      metadata,
    });
  }

  createGeneration(
    parent: LangfuseTraceClient | LangfuseSpanClient,
    options: CreateGenerationOptions,
  ): LangfuseGenerationClient {
    return parent.generation({
      name: options.name,
      model: options.model,
      modelParameters: options.modelParameters,
      input: options.input,
      output: options.output,
      usage: options.usage
        ? {
            input: options.usage.promptTokens,
            output: options.usage.completionTokens,
            total: options.usage.totalTokens,
            unit: 'TOKENS',
          }
        : undefined,
      startTime: options.startTime ?? new Date(),
      endTime: options.endTime,
      metadata: options.metadata,
      level: options.level ?? 'DEFAULT',
    });
  }

  async score(params: {
    traceId: string;
    name: string;
    value: number;
    comment?: string;
    dataType?: 'NUMERIC' | 'BOOLEAN' | 'CATEGORICAL';
  }): Promise<void> {
    await this.client.score({
      traceId: params.traceId,
      name: params.name,
      value: params.value,
      comment: params.comment,
      dataType: params.dataType ?? 'NUMERIC',
    });
  }

  getPrompt(name: string, version?: number): Promise<any> {
    return this.client.getPrompt(name, version);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.flushAsync();
  }
}
```

---

## Traçage de Chaque Appel Claude

### Wrapper Claude avec traçage automatique

```typescript
// src/llm/claude-traced.service.ts
import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { LangfuseService } from '../langfuse/langfuse.service';
import { LangfuseTraceClient, LangfuseSpanClient } from 'langfuse';
import { EventStoreService } from '../events/event-store.service';

export interface ClaudeCallOptions {
  model: 'claude-haiku-3-5' | 'claude-sonnet-4-5' | 'claude-opus-4';
  systemPrompt?: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  temperature?: number;
  purpose: string;  // 'scoring' | 'copywriting' | 'classification' | 'analysis'
  agentName: string;
  agentId: string;
  executionId: string;
  langfuseParent?: LangfuseTraceClient | LangfuseSpanClient;
}

export interface ClaudeCallResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
  langfuseGenerationId: string;
  model: string;
}

// Tarifs Anthropic (USD per million tokens) — à mettre à jour régulièrement
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-3-5':  { input: 0.80,   output: 4.00 },
  'claude-sonnet-4-5': { input: 3.00,   output: 15.00 },
  'claude-opus-4':     { input: 15.00,  output: 75.00 },
};

@Injectable()
export class ClaudeTracedService {
  private readonly anthropic: Anthropic;

  constructor(
    private readonly langfuse: LangfuseService,
    private readonly eventStore: EventStoreService,
    private readonly db: DatabaseService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async call(options: ClaudeCallOptions): Promise<ClaudeCallResult> {
    const startTime = new Date();

    // Créer la génération Langfuse AVANT l'appel
    const generation = options.langfuseParent
      ? this.langfuse.createGeneration(options.langfuseParent, {
          name: `${options.agentName}/${options.purpose}`,
          model: options.model,
          modelParameters: {
            maxTokens: options.maxTokens ?? 1024,
            temperature: options.temperature ?? 0,
          },
          input: {
            system: options.systemPrompt,
            messages: options.messages,
          },
          startTime,
        })
      : null;

    let result: Anthropic.Message;
    let latencyMs: number;
    let error: Error | null = null;

    try {
      result = await this.anthropic.messages.create({
        model: options.model,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0,
        system: options.systemPrompt,
        messages: options.messages,
      });
      latencyMs = Date.now() - startTime.getTime();
    } catch (err) {
      latencyMs = Date.now() - startTime.getTime();
      error = err as Error;

      generation?.end({
        output: { error: (err as Error).message },
        level: 'ERROR',
        endTime: new Date(),
      });

      throw err;
    }

    // Calcul du coût
    const pricing = MODEL_PRICING[options.model] ?? { input: 0, output: 0 };
    const costUsd =
      (result.usage.input_tokens / 1_000_000) * pricing.input +
      (result.usage.output_tokens / 1_000_000) * pricing.output;

    const content = result.content
      .filter(c => c.type === 'text')
      .map(c => (c as Anthropic.TextBlock).text)
      .join('');

    // Finaliser la génération Langfuse
    generation?.end({
      output: content,
      usage: {
        input: result.usage.input_tokens,
        output: result.usage.output_tokens,
        total: result.usage.input_tokens + result.usage.output_tokens,
        unit: 'TOKENS',
      },
      endTime: new Date(),
      metadata: {
        stopReason: result.stop_reason,
        latencyMs,
        costUsd,
      },
    });

    const generationId = (generation as any)?.id ?? 'no-trace';

    // Persister dans PostgreSQL pour les dashboards Metabase
    await this.db.query(
      `INSERT INTO llm_calls
         (agent_id, execution_id, langfuse_trace_id, model,
          prompt_tokens, completion_tokens, total_tokens,
          cost_usd, latency_ms, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'success')`,
      [
        options.agentId,
        options.executionId,
        generationId,
        options.model,
        result.usage.input_tokens,
        result.usage.output_tokens,
        result.usage.input_tokens + result.usage.output_tokens,
        costUsd,
        latencyMs,
      ],
    );

    // Event store
    await this.eventStore.append({
      eventType: 'LLMCallCompleted',
      agentId: options.agentId,
      agentName: options.agentName,
      streamId: options.executionId,
      correlationId: options.executionId,
      payload: {
        model: options.model,
        promptTokens: result.usage.input_tokens,
        completionTokens: result.usage.output_tokens,
        totalTokens: result.usage.input_tokens + result.usage.output_tokens,
        latencyMs,
        costUsd,
        langfuseTraceId: generationId,
        finishReason: result.stop_reason ?? 'end_turn',
      },
    });

    return {
      content,
      promptTokens: result.usage.input_tokens,
      completionTokens: result.usage.output_tokens,
      totalTokens: result.usage.input_tokens + result.usage.output_tokens,
      costUsd,
      latencyMs,
      langfuseGenerationId: generationId,
      model: options.model,
    };
  }
}
```

---

## Routing de Modèles

### Stratégie de sélection du modèle

```
Tâche de classification simple → claude-haiku-3-5   (rapide, économique)
Tâche de raisonnement moyen   → claude-sonnet-4-5  (équilibre)
Tâche complexe / créative     → claude-opus-4       (qualité maximale)
```

### Service de routing

```typescript
// src/llm/model-router.service.ts
import { Injectable } from '@nestjs/common';

export type TaskComplexity = 'simple' | 'medium' | 'complex';

const TASK_MODEL_MAP: Record<string, string> = {
  // Tâches simples → Haiku
  'lead_classification':     'claude-haiku-3-5',
  'email_categorization':    'claude-haiku-3-5',
  'bounce_detection':        'claude-haiku-3-5',
  'intent_detection':        'claude-haiku-3-5',
  'data_extraction':         'claude-haiku-3-5',
  'lead_deduplication':      'claude-haiku-3-5',

  // Tâches moyennes → Sonnet
  'lead_scoring':            'claude-sonnet-4-5',
  'company_research':        'claude-sonnet-4-5',
  'icp_matching':            'claude-sonnet-4-5',
  'email_quality_review':    'claude-sonnet-4-5',
  'follow_up_strategy':      'claude-sonnet-4-5',
  'pipeline_analysis':       'claude-sonnet-4-5',

  // Tâches complexes → Opus (usage limité, coûteux)
  'email_generation':        'claude-opus-4',
  'personalization_deep':    'claude-opus-4',
  'strategic_planning':      'claude-opus-4',
};

@Injectable()
export class ModelRouterService {
  selectModel(purpose: string, forceModel?: string): string {
    if (forceModel) return forceModel;
    return TASK_MODEL_MAP[purpose] ?? 'claude-haiku-3-5';
  }

  getModelForComplexity(complexity: TaskComplexity): string {
    const map: Record<TaskComplexity, string> = {
      simple: 'claude-haiku-3-5',
      medium: 'claude-sonnet-4-5',
      complex: 'claude-opus-4',
    };
    return map[complexity];
  }

  estimateCost(
    purpose: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number,
  ): number {
    const model = this.selectModel(purpose);
    const pricing = MODEL_PRICING[model];
    return (
      (estimatedInputTokens / 1_000_000) * pricing.input +
      (estimatedOutputTokens / 1_000_000) * pricing.output
    );
  }
}
```

### Tracking du routing dans Langfuse

```typescript
// Dans chaque agent, ajouter le tag de modèle à la trace
const trace = this.langfuse.createTrace({
  name: `${agentName}/execution`,
  agentName,
  agentId,
  executionId,
  correlationId,
  tags: [
    `model:${selectedModel}`,
    `purpose:${purpose}`,
    `environment:${process.env.NODE_ENV}`,
  ],
  metadata: {
    modelRoutingReason: routingReason,
    estimatedCostUsd: estimatedCost,
  },
});
```

---

## Évaluations Personnalisées

### 1. Scoring de qualité des emails

```typescript
// src/evaluations/email-quality-evaluator.service.ts
import { Injectable } from '@nestjs/common';
import { LangfuseService } from '../langfuse/langfuse.service';
import { ClaudeTracedService } from '../llm/claude-traced.service';

const EMAIL_QUALITY_RUBRIC = `
Tu es un expert en cold outreach B2B. Évalue cet email selon ces critères:

1. Personnalisation (0-2): L'email fait-il référence à des éléments spécifiques de l'entreprise?
2. Proposition de valeur (0-2): Le bénéfice pour le prospect est-il clair et concret?
3. Crédibilité (0-2): Y a-t-il des éléments qui établissent la crédibilité (chiffres, clients, cas)?
4. Appel à l'action (0-2): Le CTA est-il clair, spécifique, et à faible friction?
5. Ton et lisibilité (0-2): Le ton est-il professionnel mais humain? L'email est-il court et clair?

Retourne UNIQUEMENT un JSON valide:
{
  "personalization": <0-2>,
  "value_proposition": <0-2>,
  "credibility": <0-2>,
  "call_to_action": <0-2>,
  "tone_readability": <0-2>,
  "total_score": <0-10>,
  "main_improvement": "<une phrase>",
  "is_spam_risk": <true|false>
}
`;

@Injectable()
export class EmailQualityEvaluatorService {
  constructor(
    private readonly claude: ClaudeTracedService,
    private readonly langfuse: LangfuseService,
  ) {}

  async evaluateEmail(params: {
    emailSubject: string;
    emailBody: string;
    recipientCompany: string;
    traceId: string;
    agentId: string;
    executionId: string;
  }): Promise<EmailQualityScore> {
    const prompt = `
Entreprise destinataire: ${params.recipientCompany}

--- SUJET ---
${params.emailSubject}

--- CORPS ---
${params.emailBody}
`;

    const result = await this.claude.call({
      model: 'claude-haiku-3-5',
      systemPrompt: EMAIL_QUALITY_RUBRIC,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400,
      temperature: 0,
      purpose: 'email_quality_review',
      agentName: 'EmailQualityEvaluator',
      agentId: params.agentId,
      executionId: params.executionId,
    });

    let scores: EmailQualityScore;
    try {
      scores = JSON.parse(result.content);
    } catch {
      scores = {
        personalization: 1,
        value_proposition: 1,
        credibility: 1,
        call_to_action: 1,
        tone_readability: 1,
        total_score: 5,
        main_improvement: 'Could not parse evaluation',
        is_spam_risk: false,
      };
    }

    // Envoyer les scores à Langfuse
    await Promise.all([
      this.langfuse.score({
        traceId: params.traceId,
        name: 'email_quality_total',
        value: scores.total_score,
        dataType: 'NUMERIC',
        comment: scores.main_improvement,
      }),
      this.langfuse.score({
        traceId: params.traceId,
        name: 'email_personalization',
        value: scores.personalization,
        dataType: 'NUMERIC',
      }),
      this.langfuse.score({
        traceId: params.traceId,
        name: 'email_spam_risk',
        value: scores.is_spam_risk ? 1 : 0,
        dataType: 'BOOLEAN',
      }),
    ]);

    return scores;
  }
}

interface EmailQualityScore {
  personalization: number;
  value_proposition: number;
  credibility: number;
  call_to_action: number;
  tone_readability: number;
  total_score: number;
  main_improvement: string;
  is_spam_risk: boolean;
}
```

### 2. Classification de la précision des réponses

```typescript
// src/evaluations/response-classification.evaluator.ts
const CLASSIFICATION_ACCURACY_PROMPT = `
Tu es un évaluateur de précision des classificateurs LLM.

Classification attendue: {expected}
Classification produite: {actual}
Contexte: {context}

Évalue la précision de la classification:
- 1.0: Parfaitement correct
- 0.75: Correct avec une nuance manquante
- 0.5: Partiellement correct
- 0.25: Incorrect avec une bonne intention
- 0.0: Complètement incorrect

Retourne UNIQUEMENT un JSON:
{"score": <0.0-1.0>, "reasoning": "<une phrase>"}
`;

@Injectable()
export class ClassificationAccuracyEvaluator {
  async evaluate(params: {
    expected: string;
    actual: string;
    context: string;
    traceId: string;
  }): Promise<number> {
    const result = await this.claude.call({
      model: 'claude-haiku-3-5',
      systemPrompt: CLASSIFICATION_ACCURACY_PROMPT
        .replace('{expected}', params.expected)
        .replace('{actual}', params.actual)
        .replace('{context}', params.context),
      messages: [{ role: 'user', content: 'Évalue cette classification.' }],
      maxTokens: 150,
      temperature: 0,
      purpose: 'classification_accuracy',
      agentName: 'ClassificationEvaluator',
      agentId: 'system',
      executionId: params.traceId,
    });

    const parsed = JSON.parse(result.content);

    await this.langfuse.score({
      traceId: params.traceId,
      name: 'classification_accuracy',
      value: parsed.score,
      comment: parsed.reasoning,
      dataType: 'NUMERIC',
    });

    return parsed.score;
  }
}
```

### 3. Détection d'hallucinations

```typescript
// src/evaluations/hallucination-detector.service.ts
const HALLUCINATION_DETECTION_PROMPT = `
Tu es un détecteur de faits inventés dans les réponses LLM.

CONTEXTE FOURNI À L'AGENT:
{context}

RÉPONSE GÉNÉRÉE:
{response}

Vérifie si la réponse contient des affirmations factuelles qui NE SONT PAS dans le contexte fourni.
Retourne UNIQUEMENT un JSON:
{
  "has_hallucinations": <true|false>,
  "hallucinated_claims": ["<claim1>", "<claim2>"],
  "hallucination_score": <0.0-1.0>,
  "confidence": <0.0-1.0>
}

où hallucination_score = 0 signifie aucune hallucination, 1 = entièrement halluciné.
`;

@Injectable()
export class HallucinationDetectorService {
  async detect(params: {
    context: string;
    response: string;
    traceId: string;
    agentId: string;
    executionId: string;
  }): Promise<HallucinationResult> {
    const result = await this.claude.call({
      model: 'claude-haiku-3-5',
      systemPrompt: HALLUCINATION_DETECTION_PROMPT
        .replace('{context}', params.context.slice(0, 3000))
        .replace('{response}', params.response.slice(0, 2000)),
      messages: [{ role: 'user', content: 'Détecte les hallucinations.' }],
      maxTokens: 300,
      temperature: 0,
      purpose: 'hallucination_detection',
      agentName: 'HallucinationDetector',
      agentId: params.agentId,
      executionId: params.executionId,
    });

    const parsed: HallucinationResult = JSON.parse(result.content);

    await this.langfuse.score({
      traceId: params.traceId,
      name: 'hallucination_score',
      value: parsed.hallucination_score,
      comment: parsed.hallucinated_claims?.join(', ') ?? 'No hallucinations',
      dataType: 'NUMERIC',
    });

    if (parsed.has_hallucinations) {
      await this.langfuse.score({
        traceId: params.traceId,
        name: 'has_hallucinations',
        value: 1,
        dataType: 'BOOLEAN',
      });
    }

    return parsed;
  }
}

interface HallucinationResult {
  has_hallucinations: boolean;
  hallucinated_claims: string[];
  hallucination_score: number;
  confidence: number;
}
```

---

## Gestion des Prompts (Versioning + A/B Testing)

### Upload d'un prompt dans Langfuse

```typescript
// src/prompts/prompt-manager.service.ts
import { Injectable } from '@nestjs/common';
import { LangfuseService } from '../langfuse/langfuse.service';

const PROMPT_NAMES = {
  LEAD_SCORING: 'lead-scoring-v2',
  EMAIL_GENERATION: 'email-generation-v3',
  COMPANY_RESEARCH: 'company-research-v1',
  INTENT_DETECTION: 'intent-detection-v1',
} as const;

@Injectable()
export class PromptManagerService {
  private readonly promptCache = new Map<string, { prompt: any; fetchedAt: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutes

  constructor(private readonly langfuse: LangfuseService) {}

  async getPrompt(
    promptName: string,
    variables?: Record<string, string>,
  ): Promise<{ system: string; promptVersion: number }> {
    // Cache local pour éviter trop d'appels à Langfuse
    const cached = this.promptCache.get(promptName);
    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL_MS) {
      return this.compilePrompt(cached.prompt, variables);
    }

    try {
      const prompt = await this.langfuse.getPrompt(promptName);
      this.promptCache.set(promptName, { prompt, fetchedAt: Date.now() });
      return this.compilePrompt(prompt, variables);
    } catch (err) {
      // Fallback sur les prompts hardcodés si Langfuse est inaccessible
      return this.getFallbackPrompt(promptName, variables);
    }
  }

  private compilePrompt(
    prompt: any,
    variables?: Record<string, string>,
  ): { system: string; promptVersion: number } {
    let compiled = prompt.prompt as string;
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        compiled = compiled.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
    }
    return { system: compiled, promptVersion: prompt.version };
  }

  private getFallbackPrompt(
    promptName: string,
    variables?: Record<string, string>,
  ): { system: string; promptVersion: number } {
    // Prompts de secours hardcodés
    const fallbacks: Record<string, string> = {
      [PROMPT_NAMES.LEAD_SCORING]: `Tu es un expert en qualification de leads B2B SaaS. Score ce lead entre 0 et 100.`,
      [PROMPT_NAMES.EMAIL_GENERATION]: `Tu es un expert en cold outreach. Génère un email de prospection personnalisé.`,
    };
    return {
      system: fallbacks[promptName] ?? 'System prompt not found.',
      promptVersion: -1,  // -1 indique le fallback
    };
  }
}
```

### Création/mise à jour de prompts via l'API Langfuse

```typescript
// Script de déploiement des prompts
// scripts/deploy-prompts.ts
import Langfuse from 'langfuse';

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl: process.env.LANGFUSE_HOST!,
});

async function deployPrompts() {
  await langfuse.createPrompt({
    name: 'lead-scoring-v2',
    prompt: `
Tu es un expert en qualification de leads B2B SaaS.

## Contexte ICP (Ideal Customer Profile)
- Secteur: SaaS, Tech, Digital
- Taille: 10-200 employés
- Pays: France
- Décideur: CEO, CTO, VP Sales

## Données du lead
Entreprise: {{company_name}}
Secteur: {{sector}}
Taille: {{employee_count}} employés
Technologie détectée: {{tech_stack}}
Signaux d'achat: {{buying_signals}}

## Instructions
Score ce lead entre 0 et 100. Retourne UNIQUEMENT un JSON:
{
  "score": <0-100>,
  "tier": <"A"|"B"|"C"|"D">,
  "key_strengths": ["<string>"],
  "key_weaknesses": ["<string>"],
  "recommended_approach": "<string>",
  "confidence": <0.0-1.0>
}
    `.trim(),
    type: 'text',
    labels: ['production'],
    config: {
      model: 'claude-sonnet-4-5',
      temperature: 0,
      max_tokens: 300,
    },
  });

  console.log('Prompts deployed successfully');
  await langfuse.flushAsync();
}

deployPrompts().catch(console.error);
```

### A/B Testing de prompts

```typescript
// src/prompts/ab-test.service.ts
@Injectable()
export class PromptAbTestService {
  private readonly AB_TEST_CONFIG = {
    'email-generation': {
      variants: [
        { name: 'control', promptVersion: 3, weight: 0.5 },
        { name: 'variant_pain_point', promptVersion: 4, weight: 0.5 },
      ],
    },
  };

  selectVariant(promptName: string, leadId: string): { variantName: string; promptVersion: number } {
    const config = this.AB_TEST_CONFIG[promptName];
    if (!config) return { variantName: 'default', promptVersion: undefined! };

    // Déterministe basé sur l'ID du lead pour la cohérence
    const hash = this.hashId(leadId);
    let cumulative = 0;
    for (const variant of config.variants) {
      cumulative += variant.weight;
      if (hash < cumulative) {
        return { variantName: variant.name, promptVersion: variant.promptVersion };
      }
    }
    return {
      variantName: config.variants[0].name,
      promptVersion: config.variants[0].promptVersion,
    };
  }

  private hashId(id: string): number {
    let hash = 0;
    for (const char of id) {
      hash = ((hash << 5) - hash) + char.charCodeAt(0);
      hash |= 0;
    }
    return Math.abs(hash) / 2147483647;  // Normalise entre 0 et 1
  }
}
```

---

## Dashboard de Coûts Langfuse

### Vue native Langfuse

Langfuse propose nativement un dashboard de coûts accessible via `http://langfuse.internal:3100/project/main-project/analytics`.

Les métriques disponibles par défaut :
- Coût total par période
- Coût par modèle
- Coût par trace (nom de trace = nom de l'agent)
- Volume de tokens (input vs output)
- Nombre d'appels LLM

### Requêtes API Langfuse pour tableaux custom

```typescript
// src/langfuse/langfuse-analytics.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class LangfuseAnalyticsService {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.getOrThrow('LANGFUSE_HOST');
    const credentials = Buffer.from(
      `${config.getOrThrow('LANGFUSE_PUBLIC_KEY')}:${config.getOrThrow('LANGFUSE_SECRET_KEY')}`
    ).toString('base64');
    this.headers = {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    };
  }

  // Récupérer les métriques de coût par agent
  async getCostsByAgent(fromDate: Date, toDate: Date): Promise<AgentCostMetrics[]> {
    const response = await fetch(
      `${this.baseUrl}/api/public/metrics/usage?` +
      `fromTimestamp=${fromDate.toISOString()}&toTimestamp=${toDate.toISOString()}` +
      `&granularity=day`,
      { headers: this.headers },
    );

    if (!response.ok) throw new Error(`Langfuse API error: ${response.status}`);
    return response.json();
  }

  // Récupérer les traces avec score faible (qualité < 6)
  async getLowQualityTraces(scoreThreshold = 6): Promise<LangfuseTrace[]> {
    const response = await fetch(
      `${this.baseUrl}/api/public/traces?` +
      `tags=email_quality&limit=50`,
      { headers: this.headers },
    );
    const data = await response.json();

    return data.data.filter((trace: any) =>
      trace.scores?.some((s: any) =>
        s.name === 'email_quality_total' && s.value < scoreThreshold
      )
    );
  }

  // Récupérer les traces avec hallucinations
  async getHallucinatedTraces(): Promise<LangfuseTrace[]> {
    const response = await fetch(
      `${this.baseUrl}/api/public/traces?limit=100`,
      { headers: this.headers },
    );
    const data = await response.json();

    return data.data.filter((trace: any) =>
      trace.scores?.some((s: any) =>
        s.name === 'has_hallucinations' && s.value === 1
      )
    );
  }
}
```

---

## Métriques de Qualité

### Dashboard qualité — SQL Metabase (via PostgreSQL llm_calls)

```sql
-- Qualité des emails par semaine
SELECT
  date_trunc('week', lc.called_at) AS week,
  COUNT(*) FILTER (WHERE lc.metadata->>'purpose' = 'email_generation') AS emails_generated,
  AVG(
    CASE WHEN lc.langfuse_trace_id IS NOT NULL
    THEN (
      SELECT AVG(ls.value)
      FROM langfuse_scores ls  -- Vue construite depuis l'API Langfuse
      WHERE ls.trace_id = lc.langfuse_trace_id
        AND ls.name = 'email_quality_total'
    )
    END
  ) AS avg_email_quality_score,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM langfuse_scores ls
      WHERE ls.trace_id = lc.langfuse_trace_id
        AND ls.name = 'has_hallucinations'
        AND ls.value = 1
    )
  ) AS hallucinations_detected
FROM llm_calls lc
WHERE lc.called_at >= NOW() - INTERVAL '90 days'
GROUP BY week
ORDER BY week DESC;
```

### Vue PostgreSQL pour synchronisation des scores Langfuse

```sql
-- Table de synchronisation des scores Langfuse (peuplée par un job planifié)
CREATE TABLE langfuse_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id VARCHAR(200) NOT NULL,
  score_name VARCHAR(100) NOT NULL,
  value NUMERIC(8, 4) NOT NULL,
  comment TEXT,
  data_type VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_langfuse_scores_trace ON langfuse_scores(trace_id);
CREATE INDEX idx_langfuse_scores_name ON langfuse_scores(score_name, created_at DESC);
```

```typescript
// src/langfuse/langfuse-sync.job.ts — Synchronisation quotidienne des scores
@Cron('0 6 * * *')
async syncScoresToPostgres(): Promise<void> {
  const yesterday = new Date(Date.now() - 86400 * 1000);
  const scores = await this.langfuseApi.getScores(yesterday, new Date());

  for (const batch of chunk(scores, 100)) {
    await this.db.query(`
      INSERT INTO langfuse_scores (trace_id, score_name, value, comment, data_type, created_at)
      VALUES ${batch.map(() => '(?,?,?,?,?,?)').join(',')}
      ON CONFLICT (trace_id, score_name) DO UPDATE
        SET value = EXCLUDED.value, synced_at = NOW()
    `, batch.flatMap(s => [s.traceId, s.name, s.value, s.comment, s.dataType, s.createdAt]));
  }
}
```

---

## Graph Multi-Agent

### Comment les traces s'imbriquent

Langfuse supporte nativement les traces multi-niveaux via les spans. Pour relier les appels LLM de plusieurs agents au sein d'une même pipeline, on utilise le `sessionId` et le `correlationId`.

```
Trace: OrchestratorAgent (correlationId = pipeline-run-xyz)
  ├── Span: initialize
  ├── Span: dispatch_to_leadscout
  │     └── [message BullMQ vers LeadScoutAgent]
  │
Trace: LeadScoutAgent (sessionId = pipeline-run-xyz)
  ├── Span: receive_from_orchestrator
  ├── Generation: classify_leads (model: claude-haiku-3-5)
  │     input: "..."  output: "[{company: ...}]"
  ├── Span: dispatch_to_enrichment
  │     └── [message BullMQ vers EnrichmentAgent]
  │
Trace: EnrichmentAgent (sessionId = pipeline-run-xyz)
  ├── Generation: extract_insights (model: claude-haiku-3-5)
  ├── Span: dispatch_to_scoring
  │
Trace: ScoringAgent (sessionId = pipeline-run-xyz)
  ├── Generation: score_lead (model: claude-sonnet-4-5)
  │
Trace: CopywriterAgent (sessionId = pipeline-run-xyz)
  └── Generation: generate_email (model: claude-opus-4)
```

### Implémentation du contexte partagé

```typescript
// src/agents/base-agent.service.ts
export abstract class BaseAgentService {
  protected trace: LangfuseTraceClient | null = null;

  protected async initTrace(executionContext: AgentExecutionContext): Promise<void> {
    this.trace = this.langfuse.createTrace({
      name: `${this.agentName}/execution`,
      agentName: this.agentName,
      agentId: executionContext.agentId,
      executionId: executionContext.executionId,
      correlationId: executionContext.correlationId,
      // sessionId = correlationId pour regrouper toute la pipeline dans Langfuse
      sessionId: executionContext.correlationId,
      tags: [
        `pipeline:${executionContext.pipelineId}`,
        `trigger:${executionContext.triggerType}`,
      ],
    });
  }

  protected createChildSpan(spanName: string, metadata?: Record<string, unknown>) {
    if (!this.trace) throw new Error('Trace not initialized');
    return this.langfuse.createSpan(this.trace, spanName, metadata);
  }

  protected async callClaude(options: Omit<ClaudeCallOptions, 'langfuseParent'>) {
    return this.claudeService.call({
      ...options,
      langfuseParent: this.trace ?? undefined,
    });
  }
}
```

---

## Intégration avec Metabase

### Flux de données : Langfuse → PostgreSQL → Metabase

```
Langfuse (traces LLM)
       │
       │ Job planifié (0 6 * * *) via LangfuseSyncJob
       ▼
PostgreSQL
  ├── llm_calls (coûts, latences)
  ├── langfuse_scores (scores qualité)
  └── agent_events (décisions, actions)
       │
       ▼
Metabase
  ├── Dashboard coûts LLM
  ├── Dashboard qualité emails
  └── Dashboard performance agents
```

### Vue Metabase — Coûts + Qualité combinés

```sql
SELECT
  DATE(lc.called_at) AS day,
  a.name AS agent_name,
  lc.model,
  COUNT(*) AS llm_calls,
  SUM(lc.total_tokens) AS total_tokens,
  ROUND(SUM(lc.cost_usd)::NUMERIC, 4) AS cost_usd,
  ROUND(AVG(ls.value) FILTER (WHERE ls.score_name = 'email_quality_total'), 2)
    AS avg_email_quality,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM langfuse_scores ls2
      WHERE ls2.trace_id = lc.langfuse_trace_id
        AND ls2.score_name = 'has_hallucinations'
        AND ls2.value = 1
    )
  ) AS hallucinations_count,
  ROUND(AVG(lc.latency_ms)::NUMERIC, 0) AS avg_latency_ms
FROM llm_calls lc
JOIN agents a ON a.id = lc.agent_id
LEFT JOIN langfuse_scores ls ON ls.trace_id = lc.langfuse_trace_id
WHERE lc.called_at >= NOW() - INTERVAL '30 days'
GROUP BY day, a.name, lc.model
ORDER BY day DESC, cost_usd DESC;
```

---

## Récapitulatif des variables d'environnement

```dotenv
# Langfuse
LANGFUSE_HOST=http://langfuse.internal:3100
LANGFUSE_PUBLIC_KEY=pk-lf-xxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxx
LANGFUSE_ENABLED=true  # Mettre à false pour désactiver sans changer le code

# Déploiement Langfuse
LANGFUSE_DB_PASSWORD=strong-password-here
LANGFUSE_REDIS_PASSWORD=strong-password-here
LANGFUSE_NEXTAUTH_SECRET=openssl-rand-hex-32-output
LANGFUSE_SALT=openssl-rand-hex-32-output
LANGFUSE_ADMIN_EMAIL=admin@yourcompany.com
LANGFUSE_ADMIN_NAME=Admin
LANGFUSE_ADMIN_PASSWORD=strong-admin-password
```

## Accès aux interfaces

| Interface | URL | Description |
|---|---|---|
| Langfuse UI | http://langfuse.internal:3100 | Traces, coûts, évaluations |
| Traces d'un agent | `/project/main-project/traces?tags=agent:LeadScoutAgent` | Filtrer par agent |
| Dashboard coûts | `/project/main-project/analytics` | Coûts par modèle/jour |
| Prompt manager | `/project/main-project/prompts` | Gérer les versions |
| Sessions multi-agent | `/project/main-project/sessions` | Voir les pipelines complets |
