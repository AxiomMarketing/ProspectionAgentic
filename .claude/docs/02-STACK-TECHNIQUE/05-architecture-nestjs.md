# Architecture NestJS — Clean Architecture (Ports & Adapters)

**Projet :** Axiom Prospection Agentique
**Stack :** NestJS 11 + Prisma 7.4 + BullMQ + Claude API + Gmail API + BOAMP API
**Dernière mise à jour :** 23 mars 2026

> Ce document est la **référence architecturale principale** du projet. Tout développeur doit baser ses patterns sur les exemples ci-dessous.

---

## Table des matières

1. [Architecture Hexagonale (Ports & Adapters)](#1-architecture-hexagonale)
2. [Adapter Pattern pour les APIs Externes](#2-adapter-pattern)
3. [Repository Pattern avec Contrats](#3-repository-pattern)
4. [Exception Filters Complets](#4-exception-filters)
5. [Guards Complets](#5-guards)
6. [Interceptors Complets](#6-interceptors)
7. [Pipes — ZodValidationPipe](#7-pipes)
8. [Middleware Security Stack](#8-middleware)
9. [CQRS Decision Record](#9-cqrs)
10. [Module Structure Complète](#10-module-structure)
11. [Testing avec DI Contracts](#11-testing)

---

## 1. Architecture Hexagonale

### Principe

L'architecture hexagonale sépare le domaine métier (pur, sans dépendances) des adaptateurs techniques (Prisma, HTTP, Claude, Gmail). Le domaine définit des **ports** (interfaces abstraites), les couches extérieures fournissent des **adaptateurs** concrets.

```
Domain (pure TypeScript)
   ↑ depends on nothing
Application (use cases)
   ↑ depends on Domain
Infrastructure (Prisma, APIs)
   ↑ depends on Application interfaces
Presentation (controllers)
   ↑ depends on Application DTOs
```

### Structure de dossiers — agent-veilleur

```
src/modules/agent-veilleur/
├── domain/
│   ├── entities/
│   │   ├── raw-lead.entity.ts
│   │   └── lead-source.entity.ts
│   ├── value-objects/
│   │   ├── lead-url.vo.ts
│   │   ├── company-name.vo.ts
│   │   └── detection-score.vo.ts
│   ├── events/
│   │   ├── lead-detected.event.ts
│   │   └── lead-duplicate-found.event.ts
│   ├── exceptions/
│   │   ├── duplicate-lead.exception.ts
│   │   └── invalid-lead-source.exception.ts
│   └── repositories/
│       └── i-raw-lead.repository.ts        ← port (interface abstraite)
├── application/
│   ├── services/
│   │   └── veilleur.service.ts             ← use case principal
│   ├── dtos/
│   │   ├── detect-lead.dto.ts
│   │   └── raw-lead.response.dto.ts
│   └── ports/
│       ├── i-market-data.adapter.ts        ← port pour BOAMP/INSEE
│       └── i-web-scraper.adapter.ts        ← port pour Puppeteer
├── infrastructure/
│   ├── repositories/
│   │   └── prisma-raw-lead.repository.ts   ← adapter Prisma
│   ├── adapters/
│   │   ├── boamp.adapter.ts                ← adapter BOAMP API
│   │   ├── linkedin-sales.adapter.ts       ← adapter LinkedIn
│   │   └── puppeteer-scraper.adapter.ts    ← adapter web scraping
│   └── jobs/
│       └── veilleur.processor.ts           ← BullMQ processor
└── presentation/
    ├── controllers/
    │   └── veilleur.controller.ts
    └── agent-veilleur.module.ts
```

### Entité Domain

```typescript
// src/modules/agent-veilleur/domain/entities/raw-lead.entity.ts

export type LeadStatus = 'pending' | 'enriched' | 'rejected' | 'duplicate';
export type LeadSource = 'boamp' | 'linkedin' | 'web' | 'jobs';

export interface RawLeadProps {
  id: string;
  sourceUrl: string;
  companyName: string;
  source: LeadSource;
  status: LeadStatus;
  rawData: Record<string, unknown>;
  detectedAt: Date;
  detectionScore: number;
}

export class RawLead {
  private constructor(private readonly props: RawLeadProps) {}

  static create(props: Omit<RawLeadProps, 'id' | 'detectedAt' | 'status'>): RawLead {
    return new RawLead({
      ...props,
      id: crypto.randomUUID(),
      detectedAt: new Date(),
      status: 'pending',
    });
  }

  static reconstitute(props: RawLeadProps): RawLead {
    return new RawLead(props);
  }

  get id(): string { return this.props.id; }
  get sourceUrl(): string { return this.props.sourceUrl; }
  get companyName(): string { return this.props.companyName; }
  get source(): LeadSource { return this.props.source; }
  get status(): LeadStatus { return this.props.status; }
  get rawData(): Record<string, unknown> { return this.props.rawData; }
  get detectedAt(): Date { return this.props.detectedAt; }
  get detectionScore(): number { return this.props.detectionScore; }

  markAsDuplicate(): RawLead {
    return new RawLead({ ...this.props, status: 'duplicate' });
  }

  markAsEnriched(): RawLead {
    return new RawLead({ ...this.props, status: 'enriched' });
  }

  toPlainObject(): RawLeadProps {
    return { ...this.props };
  }
}
```

### Value Object

```typescript
// src/modules/agent-veilleur/domain/value-objects/detection-score.vo.ts

export class DetectionScore {
  private constructor(private readonly value: number) {}

  static create(score: number): DetectionScore {
    if (score < 0 || score > 100) {
      throw new Error(`DetectionScore must be between 0 and 100, got ${score}`);
    }
    return new DetectionScore(score);
  }

  get raw(): number { return this.value; }

  isAboveThreshold(threshold: number): boolean {
    return this.value >= threshold;
  }

  equals(other: DetectionScore): boolean {
    return this.value === other.value;
  }
}
```

### Domain Event

```typescript
// src/modules/agent-veilleur/domain/events/lead-detected.event.ts

export class LeadDetectedEvent {
  readonly occurredAt: Date;

  constructor(
    readonly leadId: string,
    readonly companyName: string,
    readonly source: string,
    readonly detectionScore: number,
  ) {
    this.occurredAt = new Date();
  }
}
```

### Domain Exception

```typescript
// src/modules/agent-veilleur/domain/exceptions/duplicate-lead.exception.ts

import { DomainException } from '@common/exceptions/domain.exception';

export class DuplicateLeadException extends DomainException {
  constructor(sourceUrl: string) {
    super(
      'DUPLICATE_LEAD',
      `Lead already exists for URL: ${sourceUrl}`,
      409,
    );
  }
}
```

### Port Repository (interface)

```typescript
// src/modules/agent-veilleur/domain/repositories/i-raw-lead.repository.ts

import { RawLead } from '../entities/raw-lead.entity';

export abstract class IRawLeadRepository {
  abstract findById(id: string): Promise<RawLead | null>;
  abstract findBySourceUrl(url: string): Promise<RawLead | null>;
  abstract findPending(limit: number): Promise<RawLead[]>;
  abstract save(lead: RawLead): Promise<RawLead>;
  abstract update(lead: RawLead): Promise<RawLead>;
  abstract countBySourceSince(source: string, since: Date): Promise<number>;
}
```

### Application Service (Use Case)

```typescript
// src/modules/agent-veilleur/application/services/veilleur.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RawLead } from '../../domain/entities/raw-lead.entity';
import { IRawLeadRepository } from '../../domain/repositories/i-raw-lead.repository';
import { IMarketDataAdapter } from '../ports/i-market-data.adapter';
import { DuplicateLeadException } from '../../domain/exceptions/duplicate-lead.exception';
import { LeadDetectedEvent } from '../../domain/events/lead-detected.event';
import { DetectLeadDto } from '../dtos/detect-lead.dto';
import { RawLeadResponseDto } from '../dtos/raw-lead.response.dto';

@Injectable()
export class VeilleurService {
  private readonly logger = new Logger(VeilleurService.name);

  constructor(
    private readonly rawLeadRepository: IRawLeadRepository,
    private readonly marketDataAdapter: IMarketDataAdapter,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async detectLeads(dto: DetectLeadDto): Promise<RawLeadResponseDto[]> {
    this.logger.log(`Detecting leads from source: ${dto.source}`);

    const marketData = await this.marketDataAdapter.fetchRecentOpportunities({
      source: dto.source,
      since: dto.since,
      keywords: dto.keywords,
    });

    const results: RawLeadResponseDto[] = [];

    for (const opportunity of marketData) {
      const existing = await this.rawLeadRepository.findBySourceUrl(opportunity.url);
      if (existing) {
        this.logger.debug(`Duplicate lead skipped: ${opportunity.url}`);
        continue;
      }

      const lead = RawLead.create({
        sourceUrl: opportunity.url,
        companyName: opportunity.companyName,
        source: dto.source,
        rawData: opportunity.raw,
        detectionScore: opportunity.relevanceScore,
      });

      const saved = await this.rawLeadRepository.save(lead);

      this.eventEmitter.emit(
        'lead.detected',
        new LeadDetectedEvent(
          saved.id,
          saved.companyName,
          saved.source,
          saved.detectionScore,
        ),
      );

      results.push(RawLeadResponseDto.fromEntity(saved));
    }

    this.logger.log(`Detected ${results.length} new leads from ${dto.source}`);
    return results;
  }

  async rejectDuplicate(sourceUrl: string): Promise<void> {
    const lead = await this.rawLeadRepository.findBySourceUrl(sourceUrl);
    if (!lead) {
      throw new DuplicateLeadException(sourceUrl);
    }
    const updated = lead.markAsDuplicate();
    await this.rawLeadRepository.update(updated);
  }
}
```

### DTOs Application

```typescript
// src/modules/agent-veilleur/application/dtos/detect-lead.dto.ts

import { z } from 'zod';

export const DetectLeadSchema = z.object({
  source: z.enum(['boamp', 'linkedin', 'web', 'jobs']),
  since: z.coerce.date(),
  keywords: z.array(z.string()).min(1).max(20),
});

export type DetectLeadDto = z.infer<typeof DetectLeadSchema>;
```

```typescript
// src/modules/agent-veilleur/application/dtos/raw-lead.response.dto.ts

import { RawLead } from '../../domain/entities/raw-lead.entity';

export class RawLeadResponseDto {
  id: string;
  companyName: string;
  sourceUrl: string;
  source: string;
  status: string;
  detectionScore: number;
  detectedAt: Date;

  static fromEntity(lead: RawLead): RawLeadResponseDto {
    const dto = new RawLeadResponseDto();
    dto.id = lead.id;
    dto.companyName = lead.companyName;
    dto.sourceUrl = lead.sourceUrl;
    dto.source = lead.source;
    dto.status = lead.status;
    dto.detectionScore = lead.detectionScore;
    dto.detectedAt = lead.detectedAt;
    return dto;
  }
}
```

---

## 2. Adapter Pattern pour les APIs Externes

### Port ILlmAdapter

```typescript
// src/common/ports/i-llm.adapter.ts

export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmCompletionRequest {
  model?: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  cacheablePrefix?: string;
}

export interface LlmCompletionResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence';
}

export abstract class ILlmAdapter {
  abstract complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
  abstract isAvailable(): Promise<boolean>;
}
```

### Adapter Claude

```typescript
// src/modules/agent-veilleur/infrastructure/adapters/claude.adapter.ts

import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import {
  ILlmAdapter,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from '@common/ports/i-llm.adapter';
import { ClaudeApiUnavailableException } from '@common/exceptions/claude-api-unavailable.exception';

@Injectable()
export class ClaudeAdapter extends ILlmAdapter {
  private readonly logger = new Logger(ClaudeAdapter.name);
  private readonly client: Anthropic;
  private readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    super();
    this.client = new Anthropic({
      apiKey: this.configService.getOrThrow<string>('ANTHROPIC_API_KEY'),
    });
    this.defaultModel = this.configService.get<string>(
      'CLAUDE_DEFAULT_MODEL',
      'claude-sonnet-4',
    );
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const model = request.model ?? this.defaultModel;

    const messages: Anthropic.MessageParam[] = request.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.3,
        system: request.systemPrompt,
        messages,
      });

      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      return {
        content: textContent.text,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        model: response.model,
        stopReason: response.stop_reason as LlmCompletionResponse['stopReason'],
      };
    } catch (error) {
      this.logger.error('Claude API call failed', { error, model });
      throw new ClaudeApiUnavailableException(
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: 'claude-haiku-3-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
```

### Mock LLM Adapter (pour tests)

```typescript
// src/common/adapters/mock-llm.adapter.ts

import { Injectable } from '@nestjs/common';
import {
  ILlmAdapter,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from '@common/ports/i-llm.adapter';

@Injectable()
export class MockLlmAdapter extends ILlmAdapter {
  private responses: Map<string, string> = new Map();
  private callLog: LlmCompletionRequest[] = [];

  setResponse(prompt: string, response: string): void {
    this.responses.set(prompt, response);
  }

  setDefaultResponse(response: string): void {
    this.responses.set('__default__', response);
  }

  getCallLog(): LlmCompletionRequest[] {
    return [...this.callLog];
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    this.callLog.push(request);

    const lastMessage = request.messages[request.messages.length - 1]?.content ?? '';
    const response =
      this.responses.get(lastMessage) ??
      this.responses.get('__default__') ??
      '{"mock": true}';

    return {
      content: response,
      inputTokens: 10,
      outputTokens: 5,
      model: 'mock-model',
      stopReason: 'end_turn',
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
```

### Port IEmailAdapter

```typescript
// src/common/ports/i-email.adapter.ts

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface SendEmailRequest {
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: EmailAddress;
  trackOpens?: boolean;
  trackClicks?: boolean;
  tags?: string[];
}

export interface SendEmailResponse {
  messageId: string;
  accepted: string[];
  rejected: string[];
  provider: string;
}

export interface EmailThreadMessage {
  messageId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: Date;
  isRead: boolean;
}

export abstract class IEmailAdapter {
  abstract sendEmail(request: SendEmailRequest): Promise<SendEmailResponse>;
  abstract getUnreadReplies(since: Date): Promise<EmailThreadMessage[]>;
  abstract markAsRead(messageId: string): Promise<void>;
  abstract isAvailable(): Promise<boolean>;
}
```

### Adapter Gmail

```typescript
// src/modules/agent-suiveur/infrastructure/adapters/gmail.adapter.ts

import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { ConfigService } from '@nestjs/config';
import {
  IEmailAdapter,
  SendEmailRequest,
  SendEmailResponse,
  EmailThreadMessage,
} from '@common/ports/i-email.adapter';

@Injectable()
export class GmailAdapter extends IEmailAdapter {
  private readonly logger = new Logger(GmailAdapter.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  private async getGmailClient() {
    const auth = new google.auth.OAuth2(
      this.configService.getOrThrow('GMAIL_CLIENT_ID'),
      this.configService.getOrThrow('GMAIL_CLIENT_SECRET'),
    );
    auth.setCredentials({
      refresh_token: this.configService.getOrThrow('GMAIL_REFRESH_TOKEN'),
    });
    return google.gmail({ version: 'v1', auth });
  }

  async sendEmail(request: SendEmailRequest): Promise<SendEmailResponse> {
    const gmail = await this.getGmailClient();

    const toHeader = request.to.map((a) =>
      a.name ? `${a.name} <${a.email}>` : a.email,
    ).join(', ');

    const rawEmail = [
      `From: ${request.from.name ? `${request.from.name} <${request.from.email}>` : request.from.email}`,
      `To: ${toHeader}`,
      `Subject: ${request.subject}`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      request.htmlBody,
    ].join('\r\n');

    const encoded = Buffer.from(rawEmail).toString('base64url');

    try {
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encoded },
      });

      return {
        messageId: response.data.id ?? '',
        accepted: request.to.map((a) => a.email),
        rejected: [],
        provider: 'gmail',
      };
    } catch (error) {
      this.logger.error('Gmail send failed', { error });
      throw error;
    }
  }

  async getUnreadReplies(since: Date): Promise<EmailThreadMessage[]> {
    const gmail = await this.getGmailClient();
    const sinceTimestamp = Math.floor(since.getTime() / 1000);

    const list = await gmail.users.messages.list({
      userId: 'me',
      q: `is:unread after:${sinceTimestamp} in:inbox`,
      maxResults: 100,
    });

    if (!list.data.messages) return [];

    const messages: EmailThreadMessage[] = [];

    for (const msg of list.data.messages) {
      if (!msg.id) continue;

      const full = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const headers = full.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

      const body =
        full.data.snippet ?? '';

      messages.push({
        messageId: msg.id,
        from: getHeader('from'),
        subject: getHeader('subject'),
        body,
        receivedAt: new Date(Number(full.data.internalDate)),
        isRead: false,
      });
    }

    return messages;
  }

  async markAsRead(messageId: string): Promise<void> {
    const gmail = await this.getGmailClient();
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { removeLabelIds: ['UNREAD'] },
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const gmail = await this.getGmailClient();
      await gmail.users.getProfile({ userId: 'me' });
      return true;
    } catch {
      return false;
    }
  }
}
```

### Port IMarketDataAdapter

```typescript
// src/common/ports/i-market-data.adapter.ts

export interface MarketOpportunity {
  url: string;
  companyName: string;
  title: string;
  description: string;
  publishedAt: Date;
  deadline?: Date;
  estimatedValue?: number;
  cpvCodes?: string[];
  relevanceScore: number;
  raw: Record<string, unknown>;
}

export interface FetchOpportunitiesRequest {
  source: string;
  since: Date;
  keywords: string[];
  maxResults?: number;
}

export abstract class IMarketDataAdapter {
  abstract fetchRecentOpportunities(
    request: FetchOpportunitiesRequest,
  ): Promise<MarketOpportunity[]>;
  abstract isAvailable(): Promise<boolean>;
}
```

### Adapter BOAMP

```typescript
// src/modules/agent-veilleur/infrastructure/adapters/boamp.adapter.ts

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  IMarketDataAdapter,
  MarketOpportunity,
  FetchOpportunitiesRequest,
} from '@common/ports/i-market-data.adapter';

interface BoampAvisItem {
  idWeb: string;
  acheteur: { nom: string };
  objet: string;
  descriptif: string;
  dateParution: string;
  dateLimite?: string;
  valeurEstimee?: number;
  cpv?: Array<{ code: string }>;
  url: string;
}

@Injectable()
export class BoampAdapter extends IMarketDataAdapter {
  private readonly logger = new Logger(BoampAdapter.name);
  private readonly baseUrl = 'https://www.boamp.fr/api/avis';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async fetchRecentOpportunities(
    request: FetchOpportunitiesRequest,
  ): Promise<MarketOpportunity[]> {
    const isoSince = request.since.toISOString().split('T')[0];
    const keywordsQuery = request.keywords.join(' OR ');

    const params = new URLSearchParams({
      q: keywordsQuery,
      date_parution_min: isoSince,
      rows: String(request.maxResults ?? 50),
      facets: 'false',
    });

    try {
      const response = await firstValueFrom(
        this.httpService.get<{ results: BoampAvisItem[] }>(
          `${this.baseUrl}/search?${params.toString()}`,
          {
            headers: {
              'User-Agent': 'AxiomProspection/1.0',
              Accept: 'application/json',
            },
            timeout: 15_000,
          },
        ),
      );

      return response.data.results.map((item) =>
        this.mapToMarketOpportunity(item, request.keywords),
      );
    } catch (error) {
      this.logger.error('BOAMP API call failed', { error });
      throw error;
    }
  }

  private mapToMarketOpportunity(
    item: BoampAvisItem,
    keywords: string[],
  ): MarketOpportunity {
    const text = `${item.objet} ${item.descriptif}`.toLowerCase();
    const matches = keywords.filter((k) => text.includes(k.toLowerCase())).length;
    const relevanceScore = Math.min(100, Math.round((matches / keywords.length) * 100));

    return {
      url: item.url ?? `https://www.boamp.fr/avis/${item.idWeb}`,
      companyName: item.acheteur?.nom ?? 'Unknown',
      title: item.objet,
      description: item.descriptif,
      publishedAt: new Date(item.dateParution),
      deadline: item.dateLimite ? new Date(item.dateLimite) : undefined,
      estimatedValue: item.valeurEstimee,
      cpvCodes: item.cpv?.map((c) => c.code) ?? [],
      relevanceScore,
      raw: item as unknown as Record<string, unknown>,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/search?rows=1`, { timeout: 5_000 }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
```

### Enregistrement du module avec swappable implementations

```typescript
// src/modules/agent-veilleur/presentation/agent-veilleur.module.ts

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { VeilleurService } from '../application/services/veilleur.service';
import { VeilleurController } from './controllers/veilleur.controller';
import { IRawLeadRepository } from '../domain/repositories/i-raw-lead.repository';
import { PrismaRawLeadRepository } from '../infrastructure/repositories/prisma-raw-lead.repository';
import { IMarketDataAdapter } from '../application/ports/i-market-data.adapter';
import { BoampAdapter } from '../infrastructure/adapters/boamp.adapter';
import { ILlmAdapter } from '@common/ports/i-llm.adapter';
import { ClaudeAdapter } from '../infrastructure/adapters/claude.adapter';
import { DatabaseModule } from '@core/database/database.module';

@Module({
  imports: [HttpModule, DatabaseModule],
  controllers: [VeilleurController],
  providers: [
    VeilleurService,
    // Enregistrement via abstract class comme token d'injection
    {
      provide: IRawLeadRepository,
      useClass: PrismaRawLeadRepository,
    },
    {
      provide: IMarketDataAdapter,
      useClass: BoampAdapter,
    },
    {
      provide: ILlmAdapter,
      useClass: ClaudeAdapter,
    },
  ],
  exports: [VeilleurService],
})
export class AgentVeilleurModule {}
```

### Swap vers Mock en test (exemple)

```typescript
// Pour les tests, on overrideProvider pour remplacer ClaudeAdapter par MockLlmAdapter
// Voir section 11 Testing pour l'exemple complet
```

---

## 3. Repository Pattern avec Contrats

### Abstract Class Repository (token d'injection)

```typescript
// src/modules/agent-veilleur/domain/repositories/i-raw-lead.repository.ts

import { RawLead } from '../entities/raw-lead.entity';

// Abstract class plutôt qu'interface pour permettre l'injection NestJS via token
export abstract class IRawLeadRepository {
  abstract findById(id: string): Promise<RawLead | null>;
  abstract findBySourceUrl(url: string): Promise<RawLead | null>;
  abstract findPending(limit: number): Promise<RawLead[]>;
  abstract save(lead: RawLead): Promise<RawLead>;
  abstract update(lead: RawLead): Promise<RawLead>;
  abstract countBySourceSince(source: string, since: Date): Promise<number>;
}
```

### Prisma Repository Implementation

```typescript
// src/modules/agent-veilleur/infrastructure/repositories/prisma-raw-lead.repository.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';
import type { RawLead as PrismaRawLead } from '@prisma/client';
import { RawLead, LeadSource, LeadStatus } from '../../domain/entities/raw-lead.entity';
import { IRawLeadRepository } from '../../domain/repositories/i-raw-lead.repository';

@Injectable()
export class PrismaRawLeadRepository extends IRawLeadRepository {
  private readonly logger = new Logger(PrismaRawLeadRepository.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<RawLead | null> {
    const record = await this.prisma.rawLead.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findBySourceUrl(url: string): Promise<RawLead | null> {
    const record = await this.prisma.rawLead.findUnique({
      where: { sourceUrl: url },
    });
    return record ? this.toDomain(record) : null;
  }

  async findPending(limit: number): Promise<RawLead[]> {
    const records = await this.prisma.rawLead.findMany({
      where: { status: 'pending' },
      orderBy: { detectedAt: 'asc' },
      take: limit,
    });
    return records.map((r) => this.toDomain(r));
  }

  async save(lead: RawLead): Promise<RawLead> {
    const data = this.toPrisma(lead);
    const record = await this.prisma.rawLead.create({ data });
    return this.toDomain(record);
  }

  async update(lead: RawLead): Promise<RawLead> {
    const data = this.toPrisma(lead);
    const record = await this.prisma.rawLead.update({
      where: { id: lead.id },
      data,
    });
    return this.toDomain(record);
  }

  async countBySourceSince(source: string, since: Date): Promise<number> {
    return this.prisma.rawLead.count({
      where: {
        source,
        detectedAt: { gte: since },
      },
    });
  }

  // Mapper Pattern: Prisma model → Domain entity
  private toDomain(record: PrismaRawLead): RawLead {
    return RawLead.reconstitute({
      id: record.id,
      sourceUrl: record.sourceUrl,
      companyName: record.companyName,
      source: record.source as LeadSource,
      status: record.status as LeadStatus,
      rawData: record.rawData as Record<string, unknown>,
      detectedAt: record.detectedAt,
      detectionScore: record.detectionScore,
    });
  }

  // Mapper Pattern: Domain entity → Prisma data
  private toPrisma(lead: RawLead): Omit<PrismaRawLead, 'createdAt' | 'updatedAt'> {
    return {
      id: lead.id,
      sourceUrl: lead.sourceUrl,
      companyName: lead.companyName,
      source: lead.source,
      status: lead.status,
      rawData: lead.rawData,
      detectedAt: lead.detectedAt,
      detectionScore: lead.detectionScore,
    };
  }
}
```

### IProspectRepository (repository complet)

```typescript
// src/modules/prospects/domain/repositories/i-prospect.repository.ts

import { Prospect } from '../entities/prospect.entity';
import { ProspectScore } from '../value-objects/prospect-score.vo';

export interface ProspectFilter {
  status?: string[];
  scoreMin?: number;
  scoreMax?: number;
  source?: string;
  createdAfter?: Date;
  tags?: string[];
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export abstract class IProspectRepository {
  abstract findById(id: string): Promise<Prospect | null>;
  abstract findByEmail(email: string): Promise<Prospect | null>;
  abstract findByCompanyDomain(domain: string): Promise<Prospect[]>;
  abstract findAll(filter: ProspectFilter, page: number, pageSize: number): Promise<PaginatedResult<Prospect>>;
  abstract save(prospect: Prospect): Promise<Prospect>;
  abstract update(prospect: Prospect): Promise<Prospect>;
  abstract delete(id: string): Promise<void>;
  abstract updateScore(id: string, score: ProspectScore): Promise<void>;
  abstract countByStatus(): Promise<Record<string, number>>;
}
```

---

## 4. Exception Filters Complets

### DomainException base class

```typescript
// src/common/exceptions/domain.exception.ts

export class DomainException extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number = 422,
  ) {
    super(message);
    this.name = 'DomainException';
    // Nécessaire pour instanceof checks avec TypeScript
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

### Exceptions concrètes

```typescript
// src/common/exceptions/prospect-not-found.exception.ts
import { DomainException } from './domain.exception';

export class ProspectNotFoundException extends DomainException {
  constructor(id: string) {
    super('PROSPECT_NOT_FOUND', `Prospect with id "${id}" not found`, 404);
  }
}
```

```typescript
// src/common/exceptions/blacklisted-contact.exception.ts
import { DomainException } from './domain.exception';

export class BlacklistedContactException extends DomainException {
  constructor(email: string) {
    super(
      'BLACKLISTED_CONTACT',
      `Contact "${email}" is blacklisted and cannot be contacted`,
      403,
    );
  }
}
```

```typescript
// src/common/exceptions/scoring-calculation.exception.ts
import { DomainException } from './domain.exception';

export class ScoringCalculationException extends DomainException {
  constructor(reason: string) {
    super(
      'SCORING_CALCULATION_ERROR',
      `Scoring calculation failed: ${reason}`,
      422,
    );
  }
}
```

```typescript
// src/common/exceptions/claude-api-unavailable.exception.ts
import { DomainException } from './domain.exception';

export class ClaudeApiUnavailableException extends DomainException {
  constructor(detail?: string) {
    super(
      'CLAUDE_API_UNAVAILABLE',
      `Claude API is currently unavailable${detail ? `: ${detail}` : ''}`,
      503,
    );
  }
}
```

### DomainExceptionFilter

```typescript
// src/common/filters/domain-exception.filter.ts

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainException } from '../exceptions/domain.exception';

export interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  timestamp: string;
  path: string;
}

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const statusCode = exception.httpStatus;

    const body: ErrorResponse = {
      statusCode,
      code: exception.code,
      message: exception.message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(body);
  }
}
```

### GlobalExceptionFilter

```typescript
// src/common/filters/global-exception.filter.ts

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred';
    let code = 'INTERNAL_SERVER_ERROR';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as { message: string }).message ?? message;
      code = `HTTP_${statusCode}`;
    } else if (exception instanceof Error) {
      // Log stack trace en dev uniquement
      if (!this.isProduction) {
        this.logger.error(exception.message, exception.stack);
      } else {
        this.logger.error(exception.message);
      }
    }

    const body: Record<string, unknown> = {
      statusCode,
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Stack trace uniquement en développement
    if (!this.isProduction && exception instanceof Error) {
      body['stack'] = exception.stack;
    }

    response.status(statusCode).json(body);
  }
}
```

### Enregistrement global des filtres

```typescript
// src/main.ts (extrait)

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { DomainExceptionFilter } from '@common/filters/domain-exception.filter';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Ordre important : DomainExceptionFilter AVANT GlobalExceptionFilter
  // NestJS évalue dans l'ordre inverse d'enregistrement
  app.useGlobalFilters(
    new GlobalExceptionFilter(configService),
    new DomainExceptionFilter(),
  );

  await app.listen(3000);
}
```

---

## 5. Guards Complets

### JwtAuthGuard

```typescript
// src/common/guards/jwt-auth.guard.ts

import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser>(err: Error | null, user: TUser): TUser {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
```

```typescript
// src/common/decorators/public.decorator.ts

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

### RolesGuard

```typescript
// src/common/guards/roles.guard.ts

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
```

```typescript
// src/common/decorators/roles.decorator.ts

import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

### ApiKeyGuard (service-to-service)

```typescript
// src/common/guards/api-key.guard.ts

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly validApiKeys: Set<string>;

  constructor(private readonly configService: ConfigService) {
    const keys = this.configService
      .getOrThrow<string>('INTERNAL_API_KEYS')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    this.validApiKeys = new Set(keys);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey =
      request.headers['x-api-key'] ?? request.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('Missing API key');
    }

    if (!this.validApiKeys.has(apiKey)) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
```

### Application des guards (ordre et portée)

```typescript
// src/app.module.ts (extrait — guards globaux)

import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';

// Dans @Module providers:
// L'ordre est important : JwtAuthGuard s'exécute AVANT RolesGuard
providers: [
  {
    provide: APP_GUARD,
    useClass: JwtAuthGuard,   // 1er : authentifie l'utilisateur
  },
  {
    provide: APP_GUARD,
    useClass: RolesGuard,     // 2ème : vérifie les rôles
  },
],
```

```typescript
// Exemple d'utilisation dans un controller

import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '@common/decorators/roles.decorator';
import { ApiKeyGuard } from '@common/guards/api-key.guard';
import { Public } from '@common/decorators/public.decorator';

@Controller('agents')
export class AgentController {
  // Route publique (bypass JwtAuthGuard)
  @Public()
  @Get('health')
  health() { return { status: 'ok' }; }

  // Route protégée JWT + rôle admin requis
  @Roles('admin')
  @Get('config')
  getConfig() { /* ... */ }

  // Route protégée par API key uniquement (service interne)
  @UseGuards(ApiKeyGuard)
  @Get('internal/trigger')
  triggerInternal() { /* ... */ }
}
```

---

## 6. Interceptors Complets

### LoggingInterceptor (Pino)

```typescript
// src/common/interceptors/logging.interceptor.ts

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(LoggingInterceptor.name)
    private readonly logger: PinoLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = (request.headers['x-request-id'] as string) ?? uuidv4();
    const startTime = Date.now();

    this.logger.info({
      requestId,
      method: request.method,
      path: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      msg: 'Incoming request',
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.info({
            requestId,
            method: request.method,
            path: request.url,
            statusCode: response.statusCode,
            durationMs: duration,
            msg: 'Request completed',
          });
        },
        error: (error: Error) => {
          const duration = Date.now() - startTime;
          this.logger.error({
            requestId,
            method: request.method,
            path: request.url,
            durationMs: duration,
            errorName: error.name,
            errorMessage: error.message,
            msg: 'Request failed',
          });
        },
      }),
    );
  }
}
```

### TransformInterceptor (response wrapping)

```typescript
// src/common/interceptors/transform.interceptor.ts

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { Request } from 'express';

export interface WrappedResponse<T> {
  success: true;
  data: T;
  meta: {
    timestamp: string;
    requestId: string;
    path: string;
  };
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, WrappedResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<WrappedResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId =
      (request.headers['x-request-id'] as string) ?? 'unknown';

    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          path: request.url,
        },
      })),
    );
  }
}
```

### TimeoutInterceptor

```typescript
// src/common/interceptors/timeout.interceptor.ts

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';

export const TIMEOUT_KEY = 'timeout';
export const Timeout = (ms: number) =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@nestjs/common').SetMetadata(TIMEOUT_KEY, ms);

const DEFAULT_TIMEOUT_MS = 30_000;

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const timeoutMs =
      this.reflector.getAllAndOverride<number>(TIMEOUT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_TIMEOUT_MS;

    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((error) => {
        if (error instanceof TimeoutError) {
          return throwError(
            () =>
              new RequestTimeoutException(
                `Request timed out after ${timeoutMs}ms`,
              ),
          );
        }
        return throwError(() => error);
      }),
    );
  }
}
```

### CacheInterceptor

```typescript
// src/common/interceptors/cache.interceptor.ts

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of, tap } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { Request } from 'express';

export const CACHE_TTL_KEY = 'cacheTtl';
export const CacheTtl = (seconds: number) =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@nestjs/common').SetMetadata(CACHE_TTL_KEY, seconds);

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const ttl = this.reflector.getAllAndOverride<number>(CACHE_TTL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!ttl) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();

    // Ne cache que les GET
    if (request.method !== 'GET') {
      return next.handle();
    }

    const cacheKey = `cache:${request.url}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return of(JSON.parse(cached));
    }

    return next.handle().pipe(
      tap(async (data) => {
        await this.redis.setex(cacheKey, ttl, JSON.stringify(data));
      }),
    );
  }
}
```

### LangfuseInterceptor (tracing LLM)

```typescript
// src/common/interceptors/langfuse.interceptor.ts

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Langfuse } from 'langfuse';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export const LANGFUSE_TRACE_KEY = 'langfuseTrace';
export const LangfuseTrace = (name: string) =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@nestjs/common').SetMetadata(LANGFUSE_TRACE_KEY, name);

@Injectable()
export class LangfuseInterceptor implements NestInterceptor {
  private readonly langfuse: Langfuse;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    this.langfuse = new Langfuse({
      secretKey: this.configService.getOrThrow('LANGFUSE_SECRET_KEY'),
      publicKey: this.configService.getOrThrow('LANGFUSE_PUBLIC_KEY'),
      baseUrl: this.configService.get(
        'LANGFUSE_BASE_URL',
        'https://cloud.langfuse.com',
      ),
    });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const traceName = this.reflector.getAllAndOverride<string>(
      LANGFUSE_TRACE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!traceName) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const trace = this.langfuse.trace({
      name: traceName,
      metadata: {
        path: request.url,
        method: request.method,
        userId: (request.user as { id?: string } | undefined)?.id,
      },
    });

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          trace.update({
            output: { durationMs: Date.now() - startTime, status: 'success' },
          });
        },
        error: (error: Error) => {
          trace.update({
            output: {
              durationMs: Date.now() - startTime,
              status: 'error',
              error: error.message,
            },
          });
        },
      }),
    );
  }
}
```

---

## 7. Pipes — ZodValidationPipe

### Implémentation complète

```typescript
// src/common/pipes/zod-validation.pipe.ts

import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const errors = this.formatErrors(result.error);
      throw new BadRequestException({
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        errors,
      });
    }

    return result.data;
  }

  private formatErrors(error: ZodError): Record<string, string[]> {
    const formatted: Record<string, string[]> = {};

    for (const issue of error.issues) {
      const path = issue.path.join('.') || 'root';
      if (!formatted[path]) {
        formatted[path] = [];
      }
      formatted[path].push(issue.message);
    }

    return formatted;
  }
}
```

### Usage dans un controller

```typescript
// Exemple d'utilisation avec un DTO Zod

import { z } from 'zod';
import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';

const CreateProspectSchema = z.object({
  email: z.string().email('Invalid email format'),
  companyName: z.string().min(2).max(200),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  source: z.enum(['boamp', 'linkedin', 'web', 'manual']),
  tags: z.array(z.string()).max(10).optional().default([]),
});

type CreateProspectDto = z.infer<typeof CreateProspectSchema>;

@Controller('prospects')
export class ProspectController {
  @Post()
  create(
    @Body(new ZodValidationPipe(CreateProspectSchema)) dto: CreateProspectDto,
  ) {
    // dto est typé et validé
    return this.prospectService.create(dto);
  }
}
```

### Enregistrement global

```typescript
// src/main.ts (extrait)

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { z } from 'zod';

// Pour validation globale sans schéma spécifique,
// on préfère utiliser le pipe par route avec son schéma Zod
// Le pipe global ci-dessous est optionnel et ne s'applique que
// si un schéma par défaut est fourni

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Optionnel : validation globale avec un schema générique
  // Préférer l'utilisation par route pour bénéficier du typage fort
  // app.useGlobalPipes(new ZodValidationPipe(z.any()));

  await app.listen(3000);
}
```

---

## 8. Middleware Security Stack

### Stack complète (ordre d'exécution)

```typescript
// src/app.module.ts

import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'short',
            ttl: 1000,
            limit: config.get('RATE_LIMIT_SHORT', 10),
          },
          {
            name: 'medium',
            ttl: 60_000,
            limit: config.get('RATE_LIMIT_MEDIUM', 100),
          },
          {
            name: 'long',
            ttl: 3_600_000,
            limit: config.get('RATE_LIMIT_LONG', 1000),
          },
        ],
      }),
    }),
  ],
  providers: [
    // ThrottlerGuard global
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        // 1. Helmet — headers sécurité HTTP
        helmet({
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'https:'],
            },
          },
          hsts: {
            maxAge: 31_536_000,
            includeSubDomains: true,
            preload: true,
          },
          referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        }),

        // 2. CORS — configuré via NestJS main.ts
        // Voir bootstrap() ci-dessous pour la config CORS complète

        // 3. Body parser — limites strictes
        json({ limit: '1mb' }),
        urlencoded({ extended: true, limit: '1mb' }),

        // 4. Request ID injection
        (req: Request, res: Response, next: NextFunction) => {
          const requestId =
            (req.headers['x-request-id'] as string) ?? uuidv4();
          req.headers['x-request-id'] = requestId;
          res.setHeader('x-request-id', requestId);
          next();
        },

        // 5. Request logger de base (avant Pino interceptor)
        (req: Request, _res: Response, next: NextFunction) => {
          req['startTime'] = Date.now();
          next();
        },
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
```

### Configuration CORS dans main.ts

```typescript
// src/main.ts — configuration complète

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { DomainExceptionFilter } from '@common/filters/domain-exception.filter';
import { LoggingInterceptor } from '@common/interceptors/logging.interceptor';
import { TransformInterceptor } from '@common/interceptors/transform.interceptor';
import { TimeoutInterceptor } from '@common/interceptors/timeout.interceptor';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);

  // Pino logger
  app.useLogger(app.get(Logger));

  // CORS
  const allowedOrigins = configService
    .getOrThrow<string>('ALLOWED_ORIGINS')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'x-request-id',
    ],
    credentials: true,
    maxAge: 3600,
  });

  // Exception filters (ordre : spécifique → général)
  app.useGlobalFilters(
    new GlobalExceptionFilter(configService),
    new DomainExceptionFilter(),
  );

  // Interceptors globaux
  app.useGlobalInterceptors(
    new LoggingInterceptor(app.get('PinoLogger')),
    new TransformInterceptor(),
    new TimeoutInterceptor(app.get('Reflector')),
  );

  // Prefix API
  app.setGlobalPrefix('api/v1');

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}

void bootstrap();
```

---

## 9. CQRS Decision Record

### ADR-004 — Utilisation de CQRS (Architecture Decision Record)

```
Titre     : Adoption sélective de CQRS pour Agents 7 et 9
Date      : 2026-03-23
Statut    : ACCEPTÉ
Auteurs   : Équipe Architecture Axiom
```

#### Contexte

Le système gère 10 agents avec des complexités très différentes. La majorité des agents (1-6, 8, 10) ont des opérations simples (CRUD enrichi, queues BullMQ). Les agents 7 (Analyste) et 9 (Appels d'Offres) ont des logiques de décision complexes avec plusieurs sous-commandes, projections de lecture distinctes, et potentiel d'audit trail.

#### Décision

Adopter CQRS uniquement pour les agents 7 et 9. Pour les autres agents (1-6, 8, 10), utiliser des services NestJS standards (`@Injectable()`).

#### Justification

| Critère | Simple Service | CQRS |
|---------|---------------|------|
| Complexité logique | Faible à moyenne | Élevée |
| Séparation lecture/écriture nécessaire | Non | Oui |
| Audit trail des commandes | Non requis | Requis |
| Nombre de développeurs | 1-2 | 2-3 |

#### Conséquences

- Agents 7 et 9 : utiliser `@nestjs/cqrs` avec `CommandBus`, `QueryBus`, `EventBus`
- Agents 1-6, 8, 10 : services standards avec injection de repositories/adapters
- Ne pas introduire CQRS "par principe" — uniquement si la complexité le justifie

---

### Implémentation CQRS — Agent 7 Analyste

#### Command

```typescript
// src/modules/agent-analyste/application/commands/analyze-tender.command.ts

export class AnalyzeTenderCommand {
  constructor(
    readonly tenderId: string,
    readonly requestedBy: string,
    readonly priority: 'standard' | 'urgent',
  ) {}
}
```

#### Command Handler

```typescript
// src/modules/agent-analyste/application/commands/analyze-tender.command-handler.ts

import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { AnalyzeTenderCommand } from './analyze-tender.command';
import { ITenderRepository } from '../../domain/repositories/i-tender.repository';
import { ILlmAdapter } from '@common/ports/i-llm.adapter';
import { TenderAnalyzedEvent } from '../../domain/events/tender-analyzed.event';
import { TenderNotFoundException } from '../../domain/exceptions/tender-not-found.exception';

@CommandHandler(AnalyzeTenderCommand)
export class AnalyzeTenderCommandHandler
  implements ICommandHandler<AnalyzeTenderCommand>
{
  private readonly logger = new Logger(AnalyzeTenderCommandHandler.name);

  constructor(
    private readonly tenderRepository: ITenderRepository,
    private readonly llmAdapter: ILlmAdapter,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: AnalyzeTenderCommand): Promise<void> {
    this.logger.log(`Analyzing tender ${command.tenderId}`);

    const tender = await this.tenderRepository.findById(command.tenderId);
    if (!tender) {
      throw new TenderNotFoundException(command.tenderId);
    }

    const analysis = await this.llmAdapter.complete({
      model: 'claude-opus-4',
      messages: [
        {
          role: 'user',
          content: `Analyze this tender and provide a GO/NO-GO recommendation:\n\n${tender.description}`,
        },
      ],
      systemPrompt:
        'You are an expert procurement analyst. Analyze tenders for an IT services company. Return JSON with fields: recommendation (GO|NO_GO), score (0-100), strengths (array), weaknesses (array), estimatedEffort (days).',
      maxTokens: 2048,
    });

    const parsed = JSON.parse(analysis.content) as {
      recommendation: 'GO' | 'NO_GO';
      score: number;
      strengths: string[];
      weaknesses: string[];
      estimatedEffort: number;
    };

    const updatedTender = tender.withAnalysis(parsed);
    await this.tenderRepository.update(updatedTender);

    this.eventBus.publish(
      new TenderAnalyzedEvent(
        command.tenderId,
        parsed.recommendation,
        parsed.score,
        command.requestedBy,
      ),
    );

    this.logger.log(
      `Tender ${command.tenderId} analyzed: ${parsed.recommendation} (${parsed.score})`,
    );
  }
}
```

#### Query

```typescript
// src/modules/agent-analyste/application/queries/get-tender-analysis.query.ts

export class GetTenderAnalysisQuery {
  constructor(
    readonly tenderId: string,
    readonly includeHistory: boolean = false,
  ) {}
}
```

#### Query Handler

```typescript
// src/modules/agent-analyste/application/queries/get-tender-analysis.query-handler.ts

import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetTenderAnalysisQuery } from './get-tender-analysis.query';
import { ITenderRepository } from '../../domain/repositories/i-tender.repository';
import { TenderAnalysisResponseDto } from '../dtos/tender-analysis.response.dto';

@QueryHandler(GetTenderAnalysisQuery)
export class GetTenderAnalysisQueryHandler
  implements IQueryHandler<GetTenderAnalysisQuery>
{
  constructor(private readonly tenderRepository: ITenderRepository) {}

  async execute(query: GetTenderAnalysisQuery): Promise<TenderAnalysisResponseDto | null> {
    const tender = await this.tenderRepository.findById(query.tenderId);
    if (!tender) return null;

    return TenderAnalysisResponseDto.fromEntity(tender, query.includeHistory);
  }
}
```

#### Controller utilisant CommandBus et QueryBus

```typescript
// src/modules/agent-analyste/presentation/controllers/analyste.controller.ts

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AnalyzeTenderCommand } from '../../application/commands/analyze-tender.command';
import { GetTenderAnalysisQuery } from '../../application/queries/get-tender-analysis.query';

@Controller('agent/analyste')
export class AnalysteController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('tenders/:id/analyze')
  async analyze(
    @Param('id') tenderId: string,
    @Body() body: { requestedBy: string; priority?: 'standard' | 'urgent' },
  ) {
    await this.commandBus.execute(
      new AnalyzeTenderCommand(
        tenderId,
        body.requestedBy,
        body.priority ?? 'standard',
      ),
    );
    return { queued: true, tenderId };
  }

  @Get('tenders/:id/analysis')
  async getAnalysis(
    @Param('id') tenderId: string,
    @Query('history') history?: string,
  ) {
    return this.queryBus.execute(
      new GetTenderAnalysisQuery(tenderId, history === 'true'),
    );
  }
}
```

#### Module CQRS

```typescript
// src/modules/agent-analyste/presentation/agent-analyste.module.ts

import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AnalysteController } from './controllers/analyste.controller';
import { AnalyzeTenderCommandHandler } from '../application/commands/analyze-tender.command-handler';
import { GetTenderAnalysisQueryHandler } from '../application/queries/get-tender-analysis.query-handler';
import { ITenderRepository } from '../domain/repositories/i-tender.repository';
import { PrismaTenderRepository } from '../infrastructure/repositories/prisma-tender.repository';
import { ILlmAdapter } from '@common/ports/i-llm.adapter';
import { ClaudeAdapter } from '../infrastructure/adapters/claude.adapter';
import { DatabaseModule } from '@core/database/database.module';

const CommandHandlers = [AnalyzeTenderCommandHandler];
const QueryHandlers = [GetTenderAnalysisQueryHandler];

@Module({
  imports: [CqrsModule, DatabaseModule],
  controllers: [AnalysteController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    { provide: ITenderRepository, useClass: PrismaTenderRepository },
    { provide: ILlmAdapter, useClass: ClaudeAdapter },
  ],
})
export class AgentAnalysteModule {}
```

---

## 10. Module Structure Complète

### Arborescence src/ complète du projet Axiom

```
src/
│
├── core/                                    ← Fondations NestJS (sans logique métier)
│   ├── config/
│   │   ├── app.config.ts                    ← ConfigFactory avec validation Zod
│   │   ├── database.config.ts
│   │   └── redis.config.ts
│   ├── database/
│   │   ├── prisma.service.ts                ← PrismaService (onModuleInit/Destroy)
│   │   └── database.module.ts               ← Global module
│   ├── logger/
│   │   ├── pino.config.ts                   ← Configuration nestjs-pino
│   │   └── logger.module.ts                 ← Global module
│   └── health/
│       ├── health.controller.ts             ← GET /health (Terminus)
│       └── health.module.ts
│
├── common/                                  ← Transversal — partagé entre tous les modules
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts
│   │   └── api-key.guard.ts
│   ├── interceptors/
│   │   ├── logging.interceptor.ts
│   │   ├── transform.interceptor.ts
│   │   ├── timeout.interceptor.ts
│   │   ├── cache.interceptor.ts
│   │   └── langfuse.interceptor.ts
│   ├── pipes/
│   │   └── zod-validation.pipe.ts
│   ├── filters/
│   │   ├── domain-exception.filter.ts
│   │   └── global-exception.filter.ts
│   ├── decorators/
│   │   ├── public.decorator.ts
│   │   ├── roles.decorator.ts
│   │   └── current-user.decorator.ts
│   ├── exceptions/
│   │   ├── domain.exception.ts              ← Base class
│   │   ├── prospect-not-found.exception.ts
│   │   ├── blacklisted-contact.exception.ts
│   │   ├── scoring-calculation.exception.ts
│   │   └── claude-api-unavailable.exception.ts
│   └── ports/
│       ├── i-llm.adapter.ts                 ← Port LLM
│       ├── i-email.adapter.ts               ← Port Email
│       └── i-market-data.adapter.ts         ← Port Market Data
│
├── shared/                                  ← Types, constantes, utils purs
│   ├── dtos/
│   │   ├── pagination.dto.ts
│   │   └── id-param.dto.ts
│   ├── types/
│   │   ├── agent-status.type.ts
│   │   └── pipeline-stage.type.ts
│   ├── utils/
│   │   ├── date.utils.ts
│   │   ├── string.utils.ts
│   │   └── crypto.utils.ts
│   └── constants/
│       ├── queue-names.constant.ts
│       └── agent-ids.constant.ts
│
├── modules/
│   │
│   ├── agent-veilleur/                      ← Agent 1 : Détection leads
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   │   └── raw-lead.entity.ts
│   │   │   ├── value-objects/
│   │   │   │   ├── lead-url.vo.ts
│   │   │   │   └── detection-score.vo.ts
│   │   │   ├── events/
│   │   │   │   └── lead-detected.event.ts
│   │   │   ├── exceptions/
│   │   │   │   └── duplicate-lead.exception.ts
│   │   │   └── repositories/
│   │   │       └── i-raw-lead.repository.ts
│   │   ├── application/
│   │   │   ├── services/
│   │   │   │   └── veilleur.service.ts
│   │   │   ├── dtos/
│   │   │   │   ├── detect-lead.dto.ts
│   │   │   │   └── raw-lead.response.dto.ts
│   │   │   └── ports/
│   │   │       └── i-market-data.adapter.ts
│   │   ├── infrastructure/
│   │   │   ├── repositories/
│   │   │   │   └── prisma-raw-lead.repository.ts
│   │   │   ├── adapters/
│   │   │   │   ├── boamp.adapter.ts
│   │   │   │   ├── linkedin-sales.adapter.ts
│   │   │   │   └── puppeteer-scraper.adapter.ts
│   │   │   └── jobs/
│   │   │       └── veilleur.processor.ts
│   │   └── presentation/
│   │       ├── controllers/
│   │       │   └── veilleur.controller.ts
│   │       └── agent-veilleur.module.ts
│   │
│   ├── agent-enrichisseur/                  ← Agent 2 : Enrichissement contact/entreprise
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   │   └── adapters/
│   │   │       ├── pappers.adapter.ts
│   │   │       ├── societe-com.adapter.ts
│   │   │       └── hunter-io.adapter.ts
│   │   └── presentation/
│   │       └── agent-enrichisseur.module.ts
│   │
│   ├── agent-scoreur/                       ← Agent 3 : Scoring 4 axes
│   │   ├── domain/
│   │   │   └── value-objects/
│   │   │       └── prospect-score.vo.ts
│   │   ├── application/
│   │   │   └── services/
│   │   │       └── scoreur.service.ts
│   │   ├── infrastructure/
│   │   └── presentation/
│   │       └── agent-scoreur.module.ts
│   │
│   ├── agent-redacteur/                     ← Agent 4 : Génération emails via Claude
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   │   └── adapters/
│   │   │       └── claude-redacteur.adapter.ts
│   │   └── presentation/
│   │       └── agent-redacteur.module.ts
│   │
│   ├── agent-suiveur/                       ← Agent 5 : Exécution campagnes, classification
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   │   └── adapters/
│   │   │       └── gmail.adapter.ts
│   │   └── presentation/
│   │       └── agent-suiveur.module.ts
│   │
│   ├── agent-nurtureur/                     ← Agent 6 : Nurturing long terme
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │       └── agent-nurtureur.module.ts
│   │
│   ├── agent-analyste/                      ← Agent 7 : Métriques, anomalies (CQRS)
│   │   ├── domain/
│   │   ├── application/
│   │   │   ├── commands/
│   │   │   │   ├── analyze-tender.command.ts
│   │   │   │   └── analyze-tender.command-handler.ts
│   │   │   └── queries/
│   │   │       ├── get-tender-analysis.query.ts
│   │   │       └── get-tender-analysis.query-handler.ts
│   │   ├── infrastructure/
│   │   └── presentation/
│   │       └── agent-analyste.module.ts     ← CqrsModule importé
│   │
│   ├── agent-dealmaker/                     ← Agent 8 : Devis, relances, signature
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   │   └── adapters/
│   │   │       └── yousign.adapter.ts
│   │   └── presentation/
│   │       └── agent-dealmaker.module.ts
│   │
│   ├── agent-appels-offres/                 ← Agent 9 : DCE, GO/NO-GO (CQRS)
│   │   ├── domain/
│   │   ├── application/
│   │   │   ├── commands/
│   │   │   └── queries/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │       └── agent-appels-offres.module.ts ← CqrsModule importé
│   │
│   ├── agent-csm/                           ← Agent 10 : Onboarding, satisfaction
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │       └── agent-csm.module.ts
│   │
│   ├── prospects/                           ← Module CRM prospects (partagé)
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   │   └── prospect.entity.ts
│   │   │   ├── value-objects/
│   │   │   │   └── prospect-score.vo.ts
│   │   │   └── repositories/
│   │   │       └── i-prospect.repository.ts
│   │   ├── application/
│   │   │   └── services/
│   │   │       └── prospect.service.ts
│   │   ├── infrastructure/
│   │   │   └── repositories/
│   │   │       └── prisma-prospect.repository.ts
│   │   └── presentation/
│   │       ├── controllers/
│   │       │   └── prospect.controller.ts
│   │       └── prospects.module.ts
│   │
│   ├── dashboard/                           ← Module dashboard temps réel
│   │   ├── application/
│   │   │   └── services/
│   │   │       └── dashboard.service.ts
│   │   └── presentation/
│   │       ├── controllers/
│   │       │   ├── dashboard.controller.ts
│   │       │   └── dashboard-sse.controller.ts  ← Server-Sent Events
│   │       └── dashboard.module.ts
│   │
│   └── auth/                                ← Authentification JWT
│       ├── application/
│       │   └── services/
│       │       └── auth.service.ts
│       ├── infrastructure/
│       │   └── strategies/
│       │       └── jwt.strategy.ts
│       └── presentation/
│           ├── controllers/
│           │   └── auth.controller.ts
│           └── auth.module.ts
│
└── app.module.ts                            ← Root module
```

### app.module.ts racine

```typescript
// src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from '@core/database/database.module';
import { HealthModule } from '@core/health/health.module';
import { AgentVeilleurModule } from './modules/agent-veilleur/presentation/agent-veilleur.module';
import { AgentEnrichisseurModule } from './modules/agent-enrichisseur/presentation/agent-enrichisseur.module';
import { AgentScoreurModule } from './modules/agent-scoreur/presentation/agent-scoreur.module';
import { AgentRedacteurModule } from './modules/agent-redacteur/presentation/agent-redacteur.module';
import { AgentSuiveurModule } from './modules/agent-suiveur/presentation/agent-suiveur.module';
import { AgentNurtureurModule } from './modules/agent-nurtureur/presentation/agent-nurtureur.module';
import { AgentAnalysteModule } from './modules/agent-analyste/presentation/agent-analyste.module';
import { AgentDealmakerModule } from './modules/agent-dealmaker/presentation/agent-dealmaker.module';
import { AgentAppelsOffresModule } from './modules/agent-appels-offres/presentation/agent-appels-offres.module';
import { AgentCsmModule } from './modules/agent-csm/presentation/agent-csm.module';
import { ProspectsModule } from './modules/prospects/presentation/prospects.module';
import { DashboardModule } from './modules/dashboard/presentation/dashboard.module';
import { AuthModule } from './modules/auth/presentation/auth.module';
import pinoConfig from '@core/logger/pino.config';

@Module({
  imports: [
    // Configuration globale
    ConfigModule.forRoot({ isGlobal: true, cache: true }),

    // Logger Pino global
    LoggerModule.forRootAsync({
      useFactory: pinoConfig,
      inject: [],
    }),

    // EventEmitter pour Domain Events
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      global: true,
    }),

    // BullMQ global
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
          password: process.env.REDIS_PASSWORD,
        },
      }),
    }),

    // Core
    DatabaseModule,
    HealthModule,

    // Auth
    AuthModule,

    // Modules agents
    AgentVeilleurModule,
    AgentEnrichisseurModule,
    AgentScoreurModule,
    AgentRedacteurModule,
    AgentSuiveurModule,
    AgentNurtureurModule,
    AgentAnalysteModule,
    AgentDealmakerModule,
    AgentAppelsOffresModule,
    AgentCsmModule,

    // Modules fonctionnels
    ProspectsModule,
    DashboardModule,
  ],
})
export class AppModule {}
```

---

## 11. Testing avec DI Contracts

### Principe : injecter par abstract class

NestJS permet d'utiliser les abstract classes comme tokens d'injection. Cela rend les mocks trivials : on remplace l'implémentation concrète par une implémentation de test.

### Unit test d'un service avec repository mocké

```typescript
// src/modules/agent-veilleur/application/services/veilleur.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VeilleurService } from './veilleur.service';
import { IRawLeadRepository } from '../../domain/repositories/i-raw-lead.repository';
import { IMarketDataAdapter } from '../ports/i-market-data.adapter';
import { RawLead } from '../../domain/entities/raw-lead.entity';
import type { MarketOpportunity } from '@common/ports/i-market-data.adapter';

// Mock repository inline — implémente l'abstract class
class MockRawLeadRepository extends IRawLeadRepository {
  private store = new Map<string, RawLead>();

  async findById(id: string) {
    return this.store.get(id) ?? null;
  }

  async findBySourceUrl(url: string) {
    return [...this.store.values()].find((l) => l.sourceUrl === url) ?? null;
  }

  async findPending(limit: number) {
    return [...this.store.values()]
      .filter((l) => l.status === 'pending')
      .slice(0, limit);
  }

  async save(lead: RawLead) {
    this.store.set(lead.id, lead);
    return lead;
  }

  async update(lead: RawLead) {
    this.store.set(lead.id, lead);
    return lead;
  }

  async countBySourceSince(_source: string, _since: Date) {
    return 0;
  }
}

// Mock adapter inline
class MockMarketDataAdapter extends IMarketDataAdapter {
  opportunities: MarketOpportunity[] = [];

  async fetchRecentOpportunities(): Promise<MarketOpportunity[]> {
    return this.opportunities;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

describe('VeilleurService', () => {
  let service: VeilleurService;
  let mockRepository: MockRawLeadRepository;
  let mockAdapter: MockMarketDataAdapter;
  let mockEventEmitter: Partial<EventEmitter2>;

  beforeEach(async () => {
    mockRepository = new MockRawLeadRepository();
    mockAdapter = new MockMarketDataAdapter();
    mockEventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VeilleurService,
        { provide: IRawLeadRepository, useValue: mockRepository },
        { provide: IMarketDataAdapter, useValue: mockAdapter },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<VeilleurService>(VeilleurService);
  });

  describe('detectLeads', () => {
    it('should create new leads for each unique opportunity', async () => {
      mockAdapter.opportunities = [
        {
          url: 'https://boamp.fr/avis/123',
          companyName: 'Mairie de Paris',
          title: 'Développement application web',
          description: 'Projet de refonte du portail citoyen',
          publishedAt: new Date(),
          relevanceScore: 85,
          raw: {},
        },
      ];

      const results = await service.detectLeads({
        source: 'boamp',
        since: new Date(Date.now() - 86_400_000),
        keywords: ['développement', 'application'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].companyName).toBe('Mairie de Paris');
      expect(results[0].status).toBe('pending');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'lead.detected',
        expect.objectContaining({ companyName: 'Mairie de Paris' }),
      );
    });

    it('should skip duplicate leads', async () => {
      mockAdapter.opportunities = [
        {
          url: 'https://boamp.fr/avis/456',
          companyName: 'Conseil Régional IDF',
          title: 'Migration cloud',
          description: 'Migration vers infrastructure cloud',
          publishedAt: new Date(),
          relevanceScore: 70,
          raw: {},
        },
      ];

      // Premier passage — crée le lead
      await service.detectLeads({
        source: 'boamp',
        since: new Date(Date.now() - 86_400_000),
        keywords: ['cloud'],
      });

      // Deuxième passage avec la même URL — doit être ignoré
      const secondResults = await service.detectLeads({
        source: 'boamp',
        since: new Date(Date.now() - 86_400_000),
        keywords: ['cloud'],
      });

      expect(secondResults).toHaveLength(0);
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
    });
  });
});
```

### Unit test avec adapter LLM mocké (Claude → MockLlm)

```typescript
// src/modules/agent-redacteur/application/services/redacteur.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { RedacteurService } from './redacteur.service';
import { ILlmAdapter } from '@common/ports/i-llm.adapter';
import { MockLlmAdapter } from '@common/adapters/mock-llm.adapter';
import { IProspectRepository } from '@modules/prospects/domain/repositories/i-prospect.repository';

// Mock prospect repository simple
const mockProspectRepository = {
  findById: jest.fn(),
  findByEmail: jest.fn(),
  findByCompanyDomain: jest.fn(),
  findAll: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  updateScore: jest.fn(),
  countByStatus: jest.fn(),
};

describe('RedacteurService', () => {
  let service: RedacteurService;
  let mockLlm: MockLlmAdapter;

  beforeEach(async () => {
    mockLlm = new MockLlmAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedacteurService,
        {
          provide: ILlmAdapter,
          useValue: mockLlm,       // Swap : ClaudeAdapter → MockLlmAdapter
        },
        {
          provide: IProspectRepository,
          useValue: mockProspectRepository,
        },
      ],
    }).compile();

    service = module.get<RedacteurService>(RedacteurService);
  });

  it('should generate an email using the LLM adapter', async () => {
    const expectedEmail = {
      subject: 'Bonjour, proposition de collaboration',
      body: '<p>Bonjour Marie,</p><p>Suite à votre appel d\'offres...</p>',
    };

    mockLlm.setDefaultResponse(JSON.stringify(expectedEmail));

    const result = await service.generateEmail({
      prospectId: 'prospect-123',
      template: 'cold_outreach',
      tone: 'professional',
    });

    expect(result.subject).toBe(expectedEmail.subject);
    expect(result.body).toContain('Bonjour');

    // Vérifier que l'adapter a bien été appelé
    const calls = mockLlm.getCallLog();
    expect(calls).toHaveLength(1);
    expect(calls[0].messages[0].role).toBe('user');
  });

  it('should retry with fallback model when claude-opus fails', async () => {
    // Simuler une réponse invalide au premier appel
    mockLlm.setDefaultResponse('invalid json {{{{');

    await expect(
      service.generateEmail({
        prospectId: 'prospect-456',
        template: 'cold_outreach',
        tone: 'casual',
      }),
    ).rejects.toThrow();
  });
});
```

### Integration test d'un module complet

```typescript
// src/modules/agent-veilleur/agent-veilleur.integration.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AgentVeilleurModule } from './presentation/agent-veilleur.module';
import { DatabaseModule } from '@core/database/database.module';
import { PrismaService } from '@core/database/prisma.service';
import { IRawLeadRepository } from './domain/repositories/i-raw-lead.repository';
import { PrismaRawLeadRepository } from './infrastructure/repositories/prisma-raw-lead.repository';
import { IMarketDataAdapter } from './application/ports/i-market-data.adapter';
import { MockMarketDataAdapter } from './infrastructure/adapters/mock-market-data.adapter';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

describe('AgentVeilleur — Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mockAdapter: MockMarketDataAdapter;

  beforeAll(async () => {
    mockAdapter = new MockMarketDataAdapter();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ envFilePath: '.env.test' }),
        EventEmitterModule.forRoot(),
        DatabaseModule,
        AgentVeilleurModule,
      ],
    })
      // overrideProvider : remplace le vrai adapter par le mock DANS le module
      .overrideProvider(IMarketDataAdapter)
      .useValue(mockAdapter)
      .compile();

    app = module.createNestApplication();
    prisma = module.get<PrismaService>(PrismaService);

    await app.init();
  });

  afterAll(async () => {
    await prisma.rawLead.deleteMany(); // Nettoyage DB de test
    await app.close();
  });

  beforeEach(async () => {
    await prisma.rawLead.deleteMany(); // Isolation entre tests
    mockAdapter.clearOpportunities();
  });

  describe('POST /api/v1/agent/veilleur/detect', () => {
    it('should detect and persist new leads', async () => {
      mockAdapter.addOpportunity({
        url: 'https://boamp.fr/avis/integration-test-1',
        companyName: 'Département du Rhône',
        title: 'Développement SI',
        description: 'Développement système information',
        publishedAt: new Date(),
        relevanceScore: 90,
        raw: {},
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/agent/veilleur/detect')
        .set('x-api-key', process.env.TEST_API_KEY ?? 'test-key')
        .send({
          source: 'boamp',
          since: new Date(Date.now() - 86_400_000).toISOString(),
          keywords: ['développement', 'SI'],
        })
        .expect(201);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].companyName).toBe('Département du Rhône');

      // Vérifier la persistance en DB
      const dbLead = await prisma.rawLead.findFirst({
        where: { sourceUrl: 'https://boamp.fr/avis/integration-test-1' },
      });
      expect(dbLead).not.toBeNull();
      expect(dbLead?.status).toBe('pending');
    });
  });
});
```

### Utilisation de overrideProvider — référence rapide

```typescript
// Patterns de remplacement dans les tests

const module = await Test.createTestingModule({
  imports: [AgentVeilleurModule],
})
  // Remplacer un adapter concret par une classe mock
  .overrideProvider(ILlmAdapter)
  .useClass(MockLlmAdapter)

  // Remplacer par une valeur directe (objet avec méthodes jest.fn())
  .overrideProvider(IMarketDataAdapter)
  .useValue({
    fetchRecentOpportunities: jest.fn().mockResolvedValue([]),
    isAvailable: jest.fn().mockResolvedValue(true),
  })

  // Remplacer par une factory (accès aux autres providers)
  .overrideProvider(IRawLeadRepository)
  .useFactory({
    factory: (prisma: PrismaService) => new PrismaRawLeadRepository(prisma),
    inject: [PrismaService],
  })

  .compile();
```

### Configuration tsconfig.json avec paths

```json
// tsconfig.json — paths pour les imports @common, @core, etc.
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./src",
    "strict": true,
    "paths": {
      "@core/*": ["core/*"],
      "@common/*": ["common/*"],
      "@shared/*": ["shared/*"],
      "@modules/*": ["modules/*"]
    }
  }
}
```

---

## Règles de code à respecter

### Nomenclature

| Type | Convention | Exemple |
|------|-----------|---------|
| Entity | `PascalCase` suffixe `.entity.ts` | `RawLead`, `Prospect` |
| Value Object | `PascalCase` suffixe `.vo.ts` | `DetectionScore`, `ProspectScore` |
| Repository (port) | `I` prefix + `Repository` suffixe | `IRawLeadRepository` |
| Adapter (port) | `I` prefix + `Adapter` suffixe | `ILlmAdapter`, `IEmailAdapter` |
| Service | `PascalCase` suffixe `.service.ts` | `VeilleurService` |
| Command | `PascalCase` suffixe `.command.ts` | `AnalyzeTenderCommand` |
| Query | `PascalCase` suffixe `.query.ts` | `GetTenderAnalysisQuery` |
| DTO | `PascalCase` suffixe `.dto.ts` ou `.response.dto.ts` | `DetectLeadDto` |
| Exception | `PascalCase` suffixe `.exception.ts` | `DuplicateLeadException` |
| Event | `PascalCase` suffixe `.event.ts` | `LeadDetectedEvent` |

### Règles d'or

1. **Domain = zéro dépendances externes** — pas de Prisma, pas de NestJS, pas d'HTTP dans les entités
2. **Abstract class pour les ports** — nécessaire pour l'injection NestJS par token
3. **Mapper obligatoire** — jamais exposer un model Prisma hors de l'infrastructure
4. **Exception typées** — toujours étendre `DomainException`, jamais `throw new Error()` dans le domain
5. **Test via ports** — toujours mocker via l'abstract class, jamais via `jest.mock()` sur un fichier concret
6. **CQRS seulement si justifié** — Agents 7 et 9 uniquement, pas par principe
