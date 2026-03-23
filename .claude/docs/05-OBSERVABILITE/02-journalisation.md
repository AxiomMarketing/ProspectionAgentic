# Journalisation et Audit Trail — Système Multi-Agents

## Vue d'ensemble

La journalisation du système de prospection multi-agents remplit trois fonctions distinctes :

1. **Observabilité opérationnelle** — Comprendre en temps réel ce que font les agents, diagnostiquer les pannes rapidement
2. **Audit trail réglementaire** — Traçabilité complète des décisions automatisées pour la conformité RGPD (article 22)
3. **Replay de session** — Reconstituer exactement ce qu'a fait un agent pour débugger ou rejouer un scénario

### Principe de séparation

```
┌─────────────────────────────────────────────────────────┐
│                   Couches de logs                       │
├─────────────────────┬───────────────────────────────────┤
│  Application logs   │  Pino → stdout → Loki/CloudWatch  │
│  (structured JSON)  │  Niveau: info / warn / error       │
├─────────────────────┼───────────────────────────────────┤
│  Audit trail        │  PostgreSQL event_store            │
│  (immuable)         │  Toutes les décisions agents       │
├─────────────────────┼───────────────────────────────────┤
│  Trace LLM          │  Langfuse                          │
│  (prompts/réponses) │  Tokens, coûts, qualité           │
├─────────────────────┼───────────────────────────────────┤
│  Queue logs         │  BullMQ → Redis → PostgreSQL       │
│  (inter-agents)     │  Tous les messages entre agents    │
└─────────────────────┴───────────────────────────────────┘
```

---

## Configuration Pino — Journalisation Structurée

### Installation et configuration de base

```bash
npm install pino pino-pretty pino-http nestjs-pino
npm install --save-dev @types/pino
```

### Configuration NestJS (app.module.ts)

```typescript
// src/logging/pino.config.ts
import { Params } from 'nestjs-pino';
import { IncomingMessage, ServerResponse } from 'http';

export const PINO_CONFIG: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, singleLine: false } }
        : undefined,

    // Format de base de chaque log
    base: {
      app: 'prospection-agentic',
      version: process.env.APP_VERSION ?? '1.0.0',
      env: process.env.NODE_ENV ?? 'development',
    },

    // Timestamp ISO 8601
    timestamp: () => `,"time":"${new Date().toISOString()}"`,

    // Sérialisation HTTP
    serializers: {
      req: (req: IncomingMessage) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        // Ne jamais logger les headers Authorization
        userAgent: req.headers['user-agent'],
      }),
      res: (res: ServerResponse) => ({
        statusCode: res.statusCode,
      }),
      err: (err: Error) => ({
        type: err.constructor.name,
        message: err.message,
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
      }),
    },

    // Masquer les champs sensibles dans les logs HTTP
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.apiKey',
        'req.body.token',
      ],
      censor: '[REDACTED]',
    },

    // Formater le log de requête HTTP
    customSuccessMessage: (req, res) =>
      `${req.method} ${req.url} → ${res.statusCode}`,
    customErrorMessage: (req, res, err) =>
      `${req.method} ${req.url} → ${res.statusCode} — ${err.message}`,
  },
};
```

### Service de log agent

```typescript
// src/logging/agent-logger.service.ts
import { Injectable, Scope } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PiiRedactor } from './pii-redactor.service';

export interface AgentLogContext {
  agentId: string;
  agentName: string;
  executionId: string;
  correlationId: string;
  leadId?: string;
}

@Injectable({ scope: Scope.TRANSIENT })
export class AgentLoggerService {
  private context: AgentLogContext | null = null;

  constructor(
    private readonly logger: PinoLogger,
    private readonly piiRedactor: PiiRedactor,
  ) {}

  setContext(ctx: AgentLogContext): void {
    this.context = ctx;
    this.logger.setContext(`[${ctx.agentName}]`);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(
      { ...this.context, ...this.sanitize(data) },
      message,
    );
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(
      { ...this.context, ...this.sanitize(data) },
      message,
    );
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.logger.error(
      {
        ...this.context,
        ...this.sanitize(data),
        err: error ? {
          type: error.constructor.name,
          message: error.message,
          code: (error as any).code,
          // Stack uniquement hors production
          stack: process.env.NODE_ENV !== 'production' ? error.stack : '[omitted]',
        } : undefined,
      },
      message,
    );
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'production') return;
    this.logger.debug(
      { ...this.context, ...this.sanitize(data) },
      message,
    );
  }

  llmCall(params: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    costUsd: number;
    langfuseTraceId?: string;
  }): void {
    this.logger.info(
      { ...this.context, event: 'llm_call', ...params },
      `LLM call completed — ${params.model} — ${params.latencyMs}ms`,
    );
  }

  toolInvoked(toolName: string, inputSummary: string): void {
    this.logger.info(
      { ...this.context, event: 'tool_invoked', toolName, inputSummary },
      `Tool invoked: ${toolName}`,
    );
  }

  messageSent(destination: string, messageType: string, jobId: string): void {
    this.logger.info(
      { ...this.context, event: 'message_sent', destination, messageType, jobId },
      `Message sent → ${destination}: ${messageType}`,
    );
  }

  private sanitize(data?: Record<string, unknown>): Record<string, unknown> {
    if (!data) return {};
    return this.piiRedactor.redact(data);
  }
}
```

### Niveaux de log et leur usage

| Niveau | Quand l'utiliser | Exemples |
|---|---|---|
| `fatal` | Crash irrécupérable | DB unreachable au démarrage |
| `error` | Erreur fonctionnelle ou technique | LLM API error, job failed after retries |
| `warn` | Situation anormale non bloquante | Rate limit atteint, retry en cours, budget > 80% |
| `info` | Événements normaux importants | Agent started/completed, email sent, lead scored |
| `debug` | Détail de traitement (hors prod) | Payload de requête LLM, résultat intermédiaire |
| `trace` | Détail extrême (dev uniquement) | Chaque étape de parsing, état interne |

---

## Règles de Redaction PII

### Principe : Privacy by Design

**Règle absolue** : Aucune donnée personnelle identifiable ne doit apparaître dans les logs applicatifs. Les logs sont potentiellement envoyés vers des services cloud (CloudWatch, Loki) et conservés par des tiers.

### Patterns de redaction

```typescript
// src/logging/pii-redactor.service.ts
import { Injectable } from '@nestjs/common';

interface RedactionRule {
  pattern: RegExp;
  replacement: string;
  fieldNames?: string[];  // Si spécifié, ne s'applique qu'à ces champs
}

@Injectable()
export class PiiRedactor {
  private readonly VALUE_RULES: RedactionRule[] = [
    // Emails
    {
      pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
      replacement: '[EMAIL]',
    },
    // Numéros de téléphone français (06, 07, 01-05, +33)
    {
      pattern: /(?:\+33|0033|0)[1-9](?:[\s.\-]?\d{2}){4}/g,
      replacement: '[PHONE]',
    },
    // SIRET (14 chiffres)
    {
      pattern: /\b\d{3}[\s.\-]?\d{3}[\s.\-]?\d{3}[\s.\-]?\d{5}\b/g,
      replacement: '[SIRET]',
    },
    // SIREN (9 chiffres)
    {
      pattern: /\b\d{3}[\s.\-]?\d{3}[\s.\-]?\d{3}\b/g,
      replacement: '[SIREN]',
    },
    // Numéros de carte bancaire
    {
      pattern: /\b(?:\d{4}[\s\-]?){3}\d{4}\b/g,
      replacement: '[CARD]',
    },
    // Clés API (patterns courants)
    {
      pattern: /\b(?:sk-ant-|sk-|xoxb-|xoxp-|ghp_|glpat-)[A-Za-z0-9\-_]{10,}/g,
      replacement: '[API_KEY]',
    },
    // URLs avec tokens en paramètre
    {
      pattern: /[?&](token|api_key|apikey|access_token|secret)=[^&\s]+/gi,
      replacement: '?$1=[REDACTED]',
    },
  ];

  private readonly FIELD_RULES: Record<string, string> = {
    // Ces champs sont toujours remplacés intégralement
    email: '[EMAIL]',
    phone: '[PHONE]',
    mobile: '[PHONE]',
    telephone: '[PHONE]',
    siret: '[SIRET]',
    siren: '[SIREN]',
    password: '[PASSWORD]',
    passwd: '[PASSWORD]',
    secret: '[SECRET]',
    apiKey: '[API_KEY]',
    api_key: '[API_KEY]',
    token: '[TOKEN]',
    accessToken: '[TOKEN]',
    refreshToken: '[TOKEN]',
    firstName: '[FIRST_NAME]',
    lastName: '[LAST_NAME]',
    nom: '[NOM]',
    prenom: '[PRENOM]',
    address: '[ADDRESS]',
    adresse: '[ADDRESS]',
  };

  redact(data: Record<string, unknown>): Record<string, unknown> {
    return this.redactObject(data) as Record<string, unknown>;
  }

  redactString(value: string): string {
    let result = value;
    for (const rule of this.VALUE_RULES) {
      result = result.replace(rule.pattern, rule.replacement);
    }
    return result;
  }

  private redactObject(obj: unknown, depth = 0): unknown {
    if (depth > 10) return '[DEEP_OBJECT]';  // Éviter les boucles infinies

    if (typeof obj === 'string') {
      return this.redactString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.redactObject(item, depth + 1));
    }

    if (obj !== null && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();

        // Vérifier si la clé correspond à un champ PII connu
        const fieldReplacement = Object.entries(this.FIELD_RULES).find(
          ([fieldName]) => lowerKey === fieldName.toLowerCase() ||
                           lowerKey.endsWith(`_${fieldName.toLowerCase()}`)
        );

        if (fieldReplacement) {
          result[key] = fieldReplacement[1];
        } else {
          result[key] = this.redactObject(value, depth + 1);
        }
      }
      return result;
    }

    return obj;
  }
}
```

### Tests unitaires de redaction

```typescript
// src/logging/__tests__/pii-redactor.spec.ts
describe('PiiRedactor', () => {
  let redactor: PiiRedactor;

  beforeEach(() => { redactor = new PiiRedactor(); });

  describe('redactString', () => {
    it('redacts email addresses', () => {
      expect(redactor.redactString('Contact: john.doe@example.com'))
        .toBe('Contact: [EMAIL]');
    });

    it('redacts French phone numbers', () => {
      expect(redactor.redactString('Tel: 06 12 34 56 78'))
        .toBe('Tel: [PHONE]');
      expect(redactor.redactString('Tel: +33612345678'))
        .toBe('Tel: [PHONE]');
    });

    it('redacts SIRET numbers', () => {
      expect(redactor.redactString('SIRET: 12345678901234'))
        .toBe('SIRET: [SIRET]');
    });

    it('redacts API keys', () => {
      expect(redactor.redactString('key: sk-ant-api03-xxx'))
        .toBe('key: [API_KEY]');
    });
  });

  describe('redact object', () => {
    it('redacts known PII fields by name', () => {
      const result = redactor.redact({
        email: 'john@example.com',
        company: 'Acme Corp',
        phone: '0612345678',
        revenue: 500000,
      });
      expect(result).toEqual({
        email: '[EMAIL]',
        company: 'Acme Corp',
        phone: '[PHONE]',
        revenue: 500000,
      });
    });

    it('redacts nested PII', () => {
      const result = redactor.redact({
        lead: { email: 'test@test.com', score: 85 },
      });
      expect((result as any).lead.email).toBe('[EMAIL]');
      expect((result as any).lead.score).toBe(85);
    });
  });
});
```

---

## Event Sourcing — Audit Trail des Décisions

### Concept

Chaque décision prise par un agent est enregistrée comme un événement immuable dans PostgreSQL. Ce n'est pas du logging applicatif — c'est un journal d'audit légalement exploitable et techniquement rejouable.

```
Agent prend une décision
        │
        ▼
EventStore.append(AgentEvent)
        │
        ├─→ PostgreSQL (persistance immuable)
        ├─→ Pino log (info level)
        └─→ SSE broadcast (dashboard temps réel)
```

### Schéma PostgreSQL — Event Store

```sql
-- Table principale des événements agents
CREATE TABLE agent_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_number BIGSERIAL NOT NULL,  -- Ordre global des événements
  stream_id       UUID NOT NULL,       -- ID de session/exécution de l'agent
  stream_version  INT NOT NULL,        -- Version au sein du stream (pour OCC)
  event_type      VARCHAR(100) NOT NULL,
  agent_id        UUID NOT NULL REFERENCES agents(id),
  agent_name      VARCHAR(100) NOT NULL,
  correlation_id  UUID NOT NULL,       -- Permet de relier les événements d'une session
  causation_id    UUID,                -- ID de l'événement qui a causé celui-ci
  payload         JSONB NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Contrainte d'unicité pour l'optimistic concurrency control
  UNIQUE (stream_id, stream_version)
);

-- Index pour les requêtes courantes
CREATE INDEX idx_events_stream      ON agent_events(stream_id, stream_version);
CREATE INDEX idx_events_agent_time  ON agent_events(agent_id, occurred_at DESC);
CREATE INDEX idx_events_type_time   ON agent_events(event_type, occurred_at DESC);
CREATE INDEX idx_events_correlation ON agent_events(correlation_id, sequence_number);
CREATE INDEX idx_events_sequence    ON agent_events(sequence_number);

-- Vue pour les snapshots de session (reconstitution rapide)
CREATE TABLE agent_session_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id    UUID NOT NULL UNIQUE,
  agent_id     UUID NOT NULL REFERENCES agents(id),
  last_version INT NOT NULL,
  state        JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Partitionnement par mois pour la rétention
CREATE TABLE agent_events_2024_01 PARTITION OF agent_events
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
-- (continuer pour chaque mois)

-- Vue pratique pour l'audit
CREATE VIEW agent_audit_trail AS
SELECT
  ae.occurred_at,
  ae.event_type,
  ae.agent_name,
  ae.correlation_id,
  ae.payload,
  ae.metadata
FROM agent_events ae
ORDER BY ae.sequence_number;
```

### Types d'événements agents

```typescript
// src/events/agent-event.types.ts

export type AgentEventType =
  | 'AgentInitialized'
  | 'ToolInvoked'
  | 'ToolCompleted'
  | 'ToolFailed'
  | 'LLMCallStarted'
  | 'LLMCallCompleted'
  | 'LLMCallFailed'
  | 'DecisionMade'
  | 'MessageSent'
  | 'MessageReceived'
  | 'ErrorOccurred'
  | 'RetryScheduled'
  | 'AgentCompleted'
  | 'AgentFailed'
  | 'LeadProcessed'
  | 'LeadScored'
  | 'EmailGenerated'
  | 'EmailSent';

// Payload typé par event type
export interface AgentEventPayloads {
  AgentInitialized: {
    config: Record<string, unknown>;  // Config sans secrets
    triggerType: 'cron' | 'manual' | 'event';
    triggerData?: Record<string, unknown>;
  };

  ToolInvoked: {
    toolName: string;
    toolVersion?: string;
    inputSummary: string;  // Résumé des inputs, sans PII
    inputHash: string;     // Hash SHA-256 des inputs réels
  };

  ToolCompleted: {
    toolName: string;
    durationMs: number;
    resultSummary: string;
    outputHash: string;
  };

  ToolFailed: {
    toolName: string;
    errorType: string;
    errorMessage: string;
    retryable: boolean;
  };

  LLMCallStarted: {
    model: string;
    promptTokensEstimate: number;
    temperature: number;
    purpose: string;  // 'scoring' | 'copywriting' | 'classification' | etc.
  };

  LLMCallCompleted: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    costUsd: number;
    langfuseTraceId: string;
    finishReason: string;
  };

  DecisionMade: {
    decisionType: string;
    decision: string;
    reasoning: string;
    confidence?: number;
    alternatives?: string[];
    inputs: Record<string, unknown>;  // Contexte sans PII
  };

  MessageSent: {
    destinationAgent: string;
    messageType: string;
    queueName: string;
    jobId: string;
    payloadHash: string;
    payloadSizeBytes: number;
  };

  ErrorOccurred: {
    errorCode: string;
    errorType: string;
    errorMessage: string;
    failedStep: string;
    retryCount: number;
    retryable: boolean;
    stackTrace?: string;  // Uniquement hors production
  };

  LeadScored: {
    leadId: string;  // ID interne, pas de données personnelles
    score: number;
    tier: 'A' | 'B' | 'C' | 'D';
    scoringModel: string;
    criteriaBreakdown: Record<string, number>;
  };

  AgentCompleted: {
    durationMs: number;
    leadsProcessed: number;
    llmCallsTotal: number;
    totalCostUsd: number;
    resultSummary: Record<string, unknown>;
  };
}
```

### Event Store Service

```typescript
// src/events/event-store.service.ts
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AgentLoggerService } from '../logging/agent-logger.service';
import { createHash } from 'crypto';

export interface AgentEvent<T extends AgentEventType = AgentEventType> {
  eventType: T;
  agentId: string;
  agentName: string;
  streamId: string;      // = executionId
  correlationId: string;
  causationId?: string;
  payload: AgentEventPayloads[T];
  metadata?: Record<string, unknown>;
}

@Injectable()
export class EventStoreService {
  private streamVersionCache = new Map<string, number>();

  constructor(
    private readonly db: DatabaseService,
    private readonly logger: AgentLoggerService,
  ) {}

  async append<T extends AgentEventType>(event: AgentEvent<T>): Promise<string> {
    const currentVersion = this.streamVersionCache.get(event.streamId) ?? -1;
    const nextVersion = currentVersion + 1;

    const result = await this.db.query<{ id: string }>(
      `INSERT INTO agent_events
         (stream_id, stream_version, event_type, agent_id, agent_name,
          correlation_id, causation_id, payload, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
       RETURNING id`,
      [
        event.streamId,
        nextVersion,
        event.eventType,
        event.agentId,
        event.agentName,
        event.correlationId,
        event.causationId ?? null,
        JSON.stringify(event.payload),
        JSON.stringify({
          ...event.metadata,
          _hash: this.hashPayload(event.payload),
        }),
      ],
    );

    this.streamVersionCache.set(event.streamId, nextVersion);
    this.logger.info(`Event appended: ${event.eventType}`, {
      eventId: result[0].id,
      streamId: event.streamId,
      version: nextVersion,
    });

    return result[0].id;
  }

  async getStream(streamId: string): Promise<AgentEvent[]> {
    const rows = await this.db.query<any>(
      `SELECT event_type, agent_id, agent_name, stream_id,
              correlation_id, causation_id, payload, metadata, occurred_at
       FROM agent_events
       WHERE stream_id = $1
       ORDER BY stream_version ASC`,
      [streamId],
    );

    return rows.map(row => ({
      eventType: row.event_type,
      agentId: row.agent_id,
      agentName: row.agent_name,
      streamId: row.stream_id,
      correlationId: row.correlation_id,
      causationId: row.causation_id,
      payload: row.payload,
      metadata: row.metadata,
      occurredAt: row.occurred_at,
    }));
  }

  async replaySession(executionId: string): Promise<void> {
    const events = await this.getStream(executionId);
    console.log(`\n=== REPLAY: Session ${executionId} ===`);
    console.log(`Total events: ${events.length}\n`);

    for (const event of events) {
      console.log(`[${(event as any).occurredAt?.toISOString()}] ${event.eventType}`);
      console.log(`  Agent: ${event.agentName}`);
      console.log(`  Payload: ${JSON.stringify(event.payload, null, 2)}`);
      console.log('');
    }
  }

  private hashPayload(payload: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex')
      .slice(0, 16);
  }
}
```

---

## Replay de Sessions pour Debugging

### Pourquoi rejouer ?

Quand un agent produit un résultat inattendu (email de mauvaise qualité, lead mal scoré, boucle infinie), il faut pouvoir reconstituer exactement ce qui s'est passé sans modifier l'état courant du système.

### Outil de replay en ligne de commande

```typescript
// src/cli/replay-session.command.ts
import { Command, CommandRunner, Option } from 'nest-commander';
import { EventStoreService } from '../events/event-store.service';
import { LangfuseService } from '../langfuse/langfuse.service';

@Command({
  name: 'replay',
  description: 'Replay an agent session from the event store',
})
export class ReplaySessionCommand extends CommandRunner {
  constructor(
    private readonly eventStore: EventStoreService,
    private readonly langfuse: LangfuseService,
  ) {
    super();
  }

  async run(
    passedParams: string[],
    options: { executionId?: string; correlationId?: string; format: string },
  ): Promise<void> {
    const streamId = options.executionId ?? passedParams[0];
    if (!streamId) {
      console.error('Usage: replay <executionId> [--format=json|text|timeline]');
      process.exit(1);
    }

    const events = await this.eventStore.getStream(streamId);

    if (options.format === 'timeline') {
      this.printTimeline(events);
    } else if (options.format === 'json') {
      console.log(JSON.stringify(events, null, 2));
    } else {
      await this.printTextReplay(events);
    }
  }

  private printTimeline(events: any[]): void {
    console.log('\n┌─────────────────────────────────────────┐');
    console.log('│         SESSION TIMELINE                │');
    console.log('└─────────────────────────────────────────┘\n');

    let prevTime: Date | null = null;
    for (const event of events) {
      const time = new Date(event.occurredAt);
      const elapsed = prevTime ? ` (+${time.getTime() - prevTime.getTime()}ms)` : '';
      prevTime = time;

      const icon = this.getEventIcon(event.eventType);
      console.log(`${time.toISOString()}${elapsed}`);
      console.log(`  ${icon} ${event.eventType} [${event.agentName}]`);

      if (event.eventType === 'DecisionMade') {
        console.log(`     Decision: ${event.payload.decision}`);
        console.log(`     Reasoning: ${event.payload.reasoning?.slice(0, 100)}...`);
      } else if (event.eventType === 'LLMCallCompleted') {
        console.log(`     Model: ${event.payload.model}`);
        console.log(`     Tokens: ${event.payload.totalTokens} | Cost: $${event.payload.costUsd}`);
        console.log(`     Latency: ${event.payload.latencyMs}ms`);
      } else if (event.eventType === 'ErrorOccurred') {
        console.log(`     !! ${event.payload.errorMessage}`);
      }
      console.log('');
    }
  }

  private getEventIcon(eventType: string): string {
    const icons: Record<string, string> = {
      AgentInitialized: '→',
      ToolInvoked: '[T]',
      LLMCallStarted: '[L]',
      LLMCallCompleted: '[L]',
      DecisionMade: '[D]',
      MessageSent: '[M]',
      ErrorOccurred: '[!]',
      AgentCompleted: '[OK]',
      AgentFailed: '[X]',
    };
    return icons[eventType] ?? '[-]';
  }

  @Option({ flags: '--format <format>', defaultValue: 'timeline' })
  parseFormat(val: string): string { return val; }
}
```

### Exemple de sortie de replay

```
$ npx ts-node -e "require('./src/cli').replay('exec-uuid-123')" --format=timeline

┌─────────────────────────────────────────┐
│         SESSION TIMELINE                │
└─────────────────────────────────────────┘

2024-01-15T14:30:00.000Z
  → AgentInitialized [LeadScoutAgent]

2024-01-15T14:30:00.245Z (+245ms)
  [T] ToolInvoked [LeadScoutAgent]
     Tool: scrape_pappers
     Input: {"sector":"SaaS","region":"Paris","size":"11-50"}

2024-01-15T14:30:04.890Z (+4645ms)
  [T] ToolCompleted [LeadScoutAgent]
     Duration: 4645ms | Found: 47 companies

2024-01-15T14:30:05.100Z (+210ms)
  [L] LLMCallStarted [LeadScoutAgent]
     Model: claude-haiku-3-5 | Purpose: lead_classification

2024-01-15T14:30:06.340Z (+1240ms)
  [L] LLMCallCompleted [LeadScoutAgent]
     Model: claude-haiku-3-5
     Tokens: 1847 | Cost: $0.000184
     Latency: 1240ms

2024-01-15T14:30:06.345Z (+5ms)
  [D] DecisionMade [LeadScoutAgent]
     Decision: filter_by_icp
     Reasoning: 23 of 47 companies match ICP criteria (SaaS, 11-50 emp...)

2024-01-15T14:30:06.400Z (+55ms)
  [M] MessageSent [LeadScoutAgent]
     To: EnrichmentAgent | Queue: lead-enrichment | Jobs: 23
```

---

## Ce qu'il faut logger / Ne pas logger

### Toujours logger

```
✓ Démarrage et arrêt de chaque agent (avec durée)
✓ Chaque appel LLM (modèle, tokens, coût, latence) — SANS le contenu des prompts
✓ Chaque outil invoqué (nom, durée, succès/echec)
✓ Chaque message BullMQ envoyé/reçu (type, queue, job ID, hash payload)
✓ Chaque décision importante (decision + reasoning résumé, SANS les données brutes)
✓ Toutes les erreurs avec leur contexte (type, message, étape, retry count)
✓ Les métriques de performance (latences, throughput)
✓ Les transitions de lifecycle (STARTING → PROCESSING → COMPLETED)
✓ Les alertes budget (> 70%, > 85%, > 95%)
✓ Les rejets de leads (raison de rejet)
```

### Ne jamais logger

```
✗ Contenu complet des prompts LLM (peut contenir des données de leads)
✗ Réponses complètes du LLM (idem)
✗ Adresses email des leads (remplacer par [EMAIL])
✗ Noms et prénoms des contacts (remplacer par [FIRST_NAME]/[LAST_NAME])
✗ Numéros de téléphone (remplacer par [PHONE])
✗ SIRET/SIREN en clair (remplacer par [SIRET]/[SIREN])
✗ Clés API (Claude, Slack, etc.) — JAMAIS
✗ Mots de passe et secrets
✗ Tokens d'authentification complets
✗ Données bancaires
✗ Payload brut des messages BullMQ (utiliser le hash SHA-256)
✗ Contenu des emails générés (peut contenir les infos du prospect)
```

### Exemple de log correct vs incorrect

```typescript
// INCORRECT — ne jamais faire
this.logger.info('Lead enriched', {
  email: 'jean.dupont@acme.fr',      // PII en clair !
  phone: '0612345678',               // PII en clair !
  siret: '12345678901234',           // PII en clair !
  promptContent: systemPrompt,       // Peut contenir des données sensibles
});

// CORRECT — format attendu
this.logger.info('Lead enriched', {
  leadId: lead.id,                   // ID interne uniquement
  fieldsEnriched: 12,                // Métriques agrégées
  enrichmentSource: 'pappers',
  durationMs: 450,
  hasEmail: true,                    // Booléen, pas la valeur
  hasPhone: true,                    // Booléen, pas la valeur
  payloadHash: hashOf(leadData),     // Hash pour corrélation debug
});
```

---

## Logging des Messages Inter-Agents (BullMQ)

### Intercepteur BullMQ

```typescript
// src/queue/bullmq-audit.processor.ts
import { Injectable } from '@nestjs/common';
import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Job, Worker } from 'bullmq';
import { EventStoreService } from '../events/event-store.service';
import { createHash } from 'crypto';

@Injectable()
export class BullMQAuditMiddleware {
  constructor(
    private readonly eventStore: EventStoreService,
    private readonly db: DatabaseService,
  ) {}

  async onJobAdded(job: Job, sourceAgentId: string, destinationAgentId: string): Promise<void> {
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(job.data))
      .digest('hex');

    // 1. Logger dans agent_messages (pour le dashboard)
    await this.db.query(
      `INSERT INTO agent_messages
         (source_agent_id, destination_agent_id, correlation_id, queue_name,
          job_id, message_type, payload_hash, payload_size_bytes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sent')`,
      [
        sourceAgentId,
        destinationAgentId,
        job.data.correlationId,
        job.queueName,
        job.id,
        job.name,
        payloadHash,
        Buffer.byteLength(JSON.stringify(job.data)),
      ],
    );

    // 2. Ajouter un événement dans l'event store
    await this.eventStore.append({
      eventType: 'MessageSent',
      agentId: sourceAgentId,
      agentName: job.data.sourceAgent ?? 'unknown',
      streamId: job.data.executionId,
      correlationId: job.data.correlationId,
      payload: {
        destinationAgent: job.data.destinationAgent ?? 'unknown',
        messageType: job.name,
        queueName: job.queueName,
        jobId: job.id!,
        payloadHash,
        payloadSizeBytes: Buffer.byteLength(JSON.stringify(job.data)),
      },
    });
  }

  async onJobCompleted(job: Job, result: unknown): Promise<void> {
    const processingMs = Date.now() - job.processedOn!;
    await this.db.query(
      `UPDATE agent_messages
       SET status = 'processed',
           processed_at = NOW(),
           processing_latency_ms = $1
       WHERE job_id = $2`,
      [processingMs, job.id],
    );
  }

  async onJobFailed(job: Job, error: Error): Promise<void> {
    await this.db.query(
      `UPDATE agent_messages
       SET status = 'failed',
           processed_at = NOW(),
           retry_count = $1,
           error_message = $2
       WHERE job_id = $3`,
      [job.attemptsMade, error.message.slice(0, 500), job.id],
    );
  }
}
```

---

## Rétention des Logs

### Politique de rétention

| Type de log | Durée de rétention | Justification | Méthode de suppression |
|---|---|---|---|
| Logs applicatifs Pino | 90 jours | Opérationnel, debugging récent | Rotation automatique (logrotate / CloudWatch) |
| Event store (agent_events) | 3 ans | Audit trail RGPD article 22 | Partitionnement + DROP PARTITION |
| LLM calls (llm_calls) | 1 an | Analyse coûts, amélioration | DELETE WHERE called_at < NOW() - INTERVAL '1 year' |
| Agent messages (agent_messages) | 180 jours | Debugging pipeline | DELETE WHERE sent_at < NOW() - INTERVAL '6 months' |
| Agent errors (agent_errors) | 180 jours | Analyse qualité | DELETE WHERE occurred_at < NOW() - INTERVAL '6 months' |
| Heartbeats (agent_heartbeats) | 30 jours | Monitoring temps réel uniquement | DELETE WHERE recorded_at < NOW() - INTERVAL '30 days' |
| Snapshots Langfuse | 90 jours | Qualité LLM | Configuré dans Langfuse |

### Job de nettoyage planifié

```typescript
// src/maintenance/log-retention.job.ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { AgentLoggerService } from '../logging/agent-logger.service';

@Injectable()
export class LogRetentionJob {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: AgentLoggerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldLogs(): Promise<void> {
    this.logger.info('Starting log retention cleanup');

    const results = await Promise.all([
      this.cleanup('agent_heartbeats', 'recorded_at', '30 days'),
      this.cleanup('agent_messages', 'sent_at', '180 days'),
      this.cleanup('agent_errors', 'occurred_at', '180 days'),
      this.cleanup('llm_calls', 'called_at', '1 year'),
    ]);

    const totalDeleted = results.reduce((sum, r) => sum + r, 0);
    this.logger.info('Log retention cleanup completed', {
      totalRowsDeleted: totalDeleted,
      tables: ['agent_heartbeats', 'agent_messages', 'agent_errors', 'llm_calls'],
    });
  }

  private async cleanup(
    table: string,
    timeColumn: string,
    retention: string,
  ): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM ${table}
         WHERE ${timeColumn} < NOW() - INTERVAL '${retention}'
         RETURNING 1
       ) SELECT COUNT(*) AS count FROM deleted`,
    );
    const deleted = parseInt(result[0].count, 10);
    this.logger.info(`Cleaned ${deleted} rows from ${table}`);
    return deleted;
  }

  // Suppression des anciennes partitions de l'event store (>3 ans)
  @Cron('0 4 1 * *')  // 1er de chaque mois à 4h
  async dropOldEventPartitions(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 3);

    const partitionName = `agent_events_${cutoffDate.getFullYear()}_${
      String(cutoffDate.getMonth() + 1).padStart(2, '0')
    }`;

    await this.db.query(
      `DO $$
       BEGIN
         IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = '${partitionName}')
         THEN
           EXECUTE 'DROP TABLE ${partitionName}';
           RAISE NOTICE 'Dropped partition: ${partitionName}';
         END IF;
       END $$;`,
    );
  }
}
```

---

## Conformité RGPD

### Obligations liées au traitement automatisé (Article 22)

Le système de prospection effectue des décisions automatisées sur des personnes physiques (scoring de leads, génération de profils de contact). L'article 22 du RGPD impose :

1. **Traçabilité** — Chaque décision doit être journalisée avec ses critères
2. **Explicabilité** — Il doit être possible d'expliquer pourquoi un lead a été scoré X
3. **Droit d'accès** — Un prospect peut demander à voir ses données et les décisions prises
4. **Droit à l'effacement** — Suppression de toutes les données le concernant

### Implémentation du droit à l'effacement

```typescript
// src/gdpr/right-to-erasure.service.ts
@Injectable()
export class RightToErasureService {
  async eraseLead(leadId: string, requestedBy: string): Promise<void> {
    this.logger.info('GDPR erasure request initiated', {
      leadId,
      requestedBy,
      timestamp: new Date().toISOString(),
    });

    await this.db.transaction(async (trx) => {
      // 1. Anonymiser les données dans leads
      await trx.query(
        `UPDATE leads SET
           email = '[ERASED]',
           first_name = '[ERASED]',
           last_name = '[ERASED]',
           phone = '[ERASED]',
           linkedin_url = '[ERASED]',
           erased_at = NOW(),
           erasure_reason = 'GDPR_REQUEST'
         WHERE id = $1`,
        [leadId],
      );

      // 2. Effacer les contenus d'emails générés
      await trx.query(
        `UPDATE generated_emails SET
           subject = '[ERASED]', body = '[ERASED]', erased_at = NOW()
         WHERE lead_id = $1`,
        [leadId],
      );

      // 3. Conserver les événements de l'event store (obligation légale)
      // mais anonymiser les payloads qui contiendraient des données perso
      await trx.query(
        `UPDATE agent_events SET
           payload = jsonb_set(payload, '{lead_data}', '"[ERASED_PER_GDPR]"')
         WHERE payload->>'leadId' = $1`,
        [leadId],
      );

      // 4. Logger l'effacement dans un registre de traitement
      await trx.query(
        `INSERT INTO gdpr_erasure_log
           (lead_id, requested_by, erased_at, tables_affected)
         VALUES ($1, $2, NOW(), $3)`,
        [leadId, requestedBy, JSON.stringify(['leads', 'generated_emails', 'agent_events'])],
      );
    });

    this.logger.info('GDPR erasure completed', { leadId });
  }
}
```

---

## Reconstruction de la Timeline d'un Agent

### Requête SQL complète

```sql
-- Reconstituer la timeline complète d'une exécution agent
WITH session_events AS (
  SELECT
    ae.occurred_at,
    ae.event_type,
    ae.agent_name,
    ae.payload,
    ae.metadata,
    ae.stream_version,
    LAG(ae.occurred_at) OVER (ORDER BY ae.stream_version) AS prev_occurred_at
  FROM agent_events ae
  WHERE ae.stream_id = $1  -- executionId
  ORDER BY ae.stream_version ASC
),
enriched_events AS (
  SELECT
    *,
    CASE
      WHEN prev_occurred_at IS NULL THEN 0
      ELSE EXTRACT(EPOCH FROM (occurred_at - prev_occurred_at)) * 1000
    END AS elapsed_since_prev_ms,
    EXTRACT(EPOCH FROM (occurred_at - FIRST_VALUE(occurred_at) OVER (ORDER BY stream_version))) * 1000
      AS elapsed_since_start_ms
  FROM session_events
)
SELECT
  stream_version AS step,
  TO_CHAR(occurred_at, 'HH24:MI:SS.MS') AS time,
  ROUND(elapsed_since_start_ms)::INT AS ms_from_start,
  ROUND(elapsed_since_prev_ms)::INT AS ms_from_prev,
  event_type,
  agent_name,
  payload->>'decision' AS decision,
  payload->>'toolName' AS tool_name,
  payload->>'model' AS llm_model,
  (payload->>'totalTokens')::INT AS tokens,
  (payload->>'costUsd')::NUMERIC AS cost_usd,
  (payload->>'latencyMs')::INT AS latency_ms,
  payload->>'errorMessage' AS error_message
FROM enriched_events
ORDER BY step;
```
