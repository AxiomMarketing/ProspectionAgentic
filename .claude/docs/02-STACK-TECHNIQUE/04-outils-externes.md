# Outils Externes et APIs

## Vue d'ensemble

Ce document recense tous les outils tiers utilisés: infrastructure d'observabilité (n8n, Langfuse, Metabase, Bull Board) et APIs externes avec leurs coûts, limites, et intégrations.

---

## n8n Self-Hosted (>=1.123.17)

### Architecture

n8n est le moteur d'orchestration des workflows. Il déclenche les agents NestJS via webhooks et traite les événements entrants des APIs externes (Mailgun webhooks, Waalaxy callbacks, etc.).

### Sécurité n8n

```yaml
# docker-compose.yml (extrait n8n)
n8n:
  environment:
    # Désactiver l'accès depuis internet (Caddy bloque par IP)
    N8N_BLOCK_ENV_ACCESS_IN_NODE: 'true'
    N8N_BLOCK_FILE_ACCESS_FROM_WORKFLOW: 'true'

    # Audit logs
    N8N_LOG_LEVEL: info
    N8N_LOG_OUTPUT: console

    # Désactiver les téléchargements de community nodes non approuvés
    N8N_COMMUNITY_PACKAGES_ENABLED: 'false'

    # Webhook URL exacte (protection SSRF)
    WEBHOOK_URL: https://n8n.votre-domaine.com/

    # Timeout des exécutions
    EXECUTIONS_TIMEOUT: 3600
    EXECUTIONS_TIMEOUT_MAX: 7200

    # Nettoyage automatique
    EXECUTIONS_DATA_PRUNE: 'true'
    EXECUTIONS_DATA_MAX_AGE: 336     # 14 jours
    EXECUTIONS_DATA_PRUNE_MAX_COUNT: 50000
```

### Protection SSRF dans n8n

```javascript
// Dans les HTTP Request nodes n8n, TOUJOURS valider les URLs cibles
// Utiliser la liste blanche suivante dans les credentials

const ALLOWED_DOMAINS = [
  'api.anthropic.com',
  'api.dropcontact.io',
  'api.hunter.io',
  'api.zerobounce.net',
  'api.kaspr.io',
  'api.pappers.fr',
  'boamp.fr',
  'api.insee.fr',
  'api.mailgun.net',
  'api.waalaxy.com',
  'api.yousign.com',
  'slack.com',
  'api.typeform.com',
];

// Ajouter une validation dans chaque workflow HTTP
function validateUrl(url) {
  try {
    const parsed = new URL(url);
    const isAllowed = ALLOWED_DOMAINS.some(
      domain => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
    );
    if (!isAllowed) {
      throw new Error(`URL not in allowlist: ${parsed.hostname}`);
    }
    // Bloquer les IPs privées
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|::1|localhost)/
        .test(parsed.hostname)) {
      throw new Error('Private IP ranges not allowed');
    }
    return url;
  } catch (e) {
    throw new Error(`Invalid URL: ${e.message}`);
  }
}
```

### Workflows n8n principaux

```
Workflow 1: BOAMP → Discovery Agent
  Trigger: Schedule (toutes les 4h)
  → GET https://boamp.fr/api/v2/consultations?...
  → Filter nouveaux appels d'offres
  → POST https://app.votre-domaine.com/api/v1/webhooks/boamp
  → Notify Slack si >5 nouveaux DCEs

Workflow 2: Mailgun Webhooks → Reply Agent
  Trigger: Webhook POST /webhook/mailgun
  → Validate HMAC Mailgun
  → POST https://app.votre-domaine.com/api/v1/webhooks/email-event
  → Log dans Langfuse

Workflow 3: Waalaxy → LinkedIn Reply Handler
  Trigger: Webhook POST /webhook/waalaxy
  → Parse reply data
  → POST https://app.votre-domaine.com/api/v1/webhooks/linkedin-reply

Workflow 4: Daily Digest
  Trigger: Schedule (9:00 lundi-vendredi)
  → GET métriques depuis PostgreSQL
  → Formatter le résumé
  → POST Slack #prospection-daily
```

---

## Langfuse (v3.143)

### Configuration déploiement

```yaml
# docker-compose.yml (extrait Langfuse)
langfuse-web:
  image: langfuse/langfuse:3.143
  environment:
    DATABASE_URL: postgresql://user:pass@postgres:5432/langfuse_prod
    NEXTAUTH_URL: https://langfuse.votre-domaine.com
    NEXTAUTH_SECRET: ${LANGFUSE_NEXTAUTH_SECRET}  # openssl rand -hex 32
    SALT: ${LANGFUSE_SALT}                          # openssl rand -hex 16
    ENCRYPTION_KEY: ${LANGFUSE_ENCRYPTION_KEY}      # openssl rand -hex 32

    # Désactiver le signup public
    AUTH_DISABLE_SIGNUP: 'true'

    # Rétention des traces
    LANGFUSE_DEFAULT_PROJECT_RETENTION_DAYS: 90

    # Production
    NODE_ENV: production
    HOSTNAME: '0.0.0.0'
```

### SDK Integration NestJS

```typescript
// src/modules/llm/langfuse.service.ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Langfuse, LangfuseTraceClient } from 'langfuse';

@Injectable()
export class LangfuseService implements OnModuleDestroy {
  private readonly client: Langfuse;

  constructor(private readonly config: ConfigService) {
    this.client = new Langfuse({
      publicKey: this.config.get<string>('llm.langfusePublicKey')!,
      secretKey: this.config.get<string>('llm.langfuseSecretKey')!,
      baseUrl: this.config.get<string>('llm.langfuseHost'),
      flushAt: 20,
      flushInterval: 5000,
      enabled: this.config.get('NODE_ENV') !== 'test',
    });
  }

  async onModuleDestroy() {
    await this.client.shutdownAsync();
  }

  createTrace(params: {
    name: string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): LangfuseTraceClient {
    return this.client.trace({
      name: params.name,
      userId: params.userId,
      sessionId: params.sessionId,
      metadata: params.metadata,
      tags: params.tags,
    });
  }

  // Score un trace après évaluation humaine
  async scoreTrace(params: {
    traceId: string;
    name: string;       // Ex: 'email_quality', 'classification_accuracy'
    value: number;      // 0.0 - 1.0
    comment?: string;
  }): Promise<void> {
    await this.client.score({
      traceId: params.traceId,
      name: params.name,
      value: params.value,
      comment: params.comment,
    });
  }

  getClient(): Langfuse {
    return this.client;
  }
}
```

### Structure des traces

```typescript
// Exemple de trace complète pour la génération d'email
async function traceEmailGeneration(prospect: Prospect) {
  const trace = langfuse.createTrace({
    name: 'email_generation_pipeline',
    userId: prospect.id,
    sessionId: `sequence_${sequenceId}`,
    metadata: {
      prospectCompany: prospect.companyName,
      sequenceStep: 1,
      channel: 'email',
    },
    tags: ['email', 'prospecting', `segment_${prospect.score?.segment}`],
  });

  // Span 1: Enrichissement des données
  const enrichSpan = trace.span({ name: 'enrich_prospect_data' });
  const enrichedData = await enrichProspect(prospect);
  enrichSpan.end({ output: { fieldsEnriched: Object.keys(enrichedData) } });

  // Span 2: Génération LLM
  const genSpan = trace.span({ name: 'llm_generation' });
  const generation = genSpan.generation({
    name: 'email_body',
    model: 'claude-sonnet-4',
    input: { systemPrompt, userPrompt },
  });
  const emailContent = await generateEmail(enrichedData);
  generation.end({
    output: emailContent,
    usage: { input: 450, output: 180 },
  });
  genSpan.end();

  trace.update({ output: { emailLength: emailContent.length } });
}
```

---

## Metabase (0.59.1.6)

### Configuration PostgreSQL

```json
// Connexion Metabase → PostgreSQL (via interface admin)
{
  "engine": "postgres",
  "name": "ProspectionAgentic Production",
  "details": {
    "host": "postgres",
    "port": 5432,
    "dbname": "prospection_prod",
    "user": "metabase_reader",
    "password": "METABASE_READER_PASSWORD",
    "schema-filters-type": "inclusion",
    "schema-filters-patterns": "prospection",
    "ssl": false,
    "tunnel-enabled": false
  }
}
```

### Dashboards principaux

```markdown
Dashboard 1: Pipeline Prospection (rafraîchissement auto 30min)
  - Total prospects par statut (donut)
  - Nouveaux prospects cette semaine vs semaine précédente
  - Taux d'ouverture email par segment (A/B/C/D)
  - Taux de réponse par template
  - Entonnoir conversion: raw → contacted → replied → meeting → deal
  - Top 10 prospects par score

Dashboard 2: Performance Agents (rafraîchissement 15min)
  - Jobs BullMQ par agent (réussis/échoués/en attente)
  - Latence moyenne par agent
  - Coûts LLM du jour par modèle
  - Alertes actives

Dashboard 3: Revenus & CRM (rafraîchissement quotidien)
  - MRR, ARR actuels
  - Deals en cours par stade
  - Deals fermés ce mois
  - Customer Health Score distribution
  - Prévision de churn

Dashboard 4: Délivrabilité Email
  - Taux de délivrance par domaine
  - Taux de bounce (hard/soft)
  - Réputation expéditeur
  - Volumes envoyés par jour
```

### Questions SQL custom Metabase

```sql
-- Entonnoir de conversion complet
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as pct
FROM prospection.prospects
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY status
ORDER BY
  CASE status
    WHEN 'raw' THEN 1
    WHEN 'enriched' THEN 2
    WHEN 'scored' THEN 3
    WHEN 'contacted' THEN 4
    WHEN 'replied' THEN 5
    WHEN 'meeting_booked' THEN 6
    WHEN 'deal_in_progress' THEN 7
    WHEN 'won' THEN 8
    ELSE 9
  END;

-- ROI par canal
SELECT
  es.provider as channel,
  COUNT(DISTINCT es.prospect_id) as contacted,
  COUNT(DISTINCT rc.prospect_id) as replied,
  ROUND(COUNT(DISTINCT rc.prospect_id) * 100.0 /
    NULLIF(COUNT(DISTINCT es.prospect_id), 0), 2) as reply_rate,
  ROUND(SUM(gm.cost_eur)::numeric, 4) as total_llm_cost_eur
FROM prospection.email_sends es
LEFT JOIN prospection.reply_classifications rc ON rc.prospect_id = es.prospect_id
LEFT JOIN prospection.generated_messages gm ON gm.id = es.message_id
WHERE es.sent_at >= NOW() - INTERVAL '30 days'
GROUP BY es.provider;
```

---

## Bull Board (BullMQ Monitoring UI)

### Setup

```typescript
// infrastructure/bull-board/server.ts
import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import basicAuth from 'express-basic-auth';

const QUEUES = [
  'discovery-agent',
  'scoring-agent',
  'enrichment-agent',
  'personalization-agent',
  'outreach-agent',
  'reply-agent',
  'nurture-agent',
  'dce-agent',
];

const connection = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

const queues = QUEUES.map(
  (name) => new BullMQAdapter(new Queue(name, { connection })),
);

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/');

createBullBoard({ queues, serverAdapter });

const app = express();

// Auth basique (Caddy ajoute une couche supplémentaire)
app.use(
  basicAuth({
    users: { [process.env.BULL_BOARD_USER!]: process.env.BULL_BOARD_PASSWORD! },
    challenge: true,
    realm: 'BullMQ Monitor',
  }),
);

app.use('/', serverAdapter.getRouter());

app.listen(parseInt(process.env.BULL_BOARD_PORT || '3001'), () => {
  console.log(`Bull Board running on port ${process.env.BULL_BOARD_PORT}`);
});
```

---

## APIs Externes

### 1. BOAMP (Bulletin Officiel des Annonces des Marchés Publics)

```typescript
// src/infrastructure/external-apis/boamp.client.ts
export class BoampClient {
  private readonly BASE_URL = 'https://boamp.fr/api/v2';
  private readonly RATE_LIMIT = 10; // requêtes/minute (API publique)

  // Coût: GRATUIT (API publique)
  // Rate limit: ~10 req/min non documenté
  // Docs: https://boamp.fr/page/api-boamp

  async searchConsultations(params: {
    datePublicationMin?: string;  // ISO date
    cpvCodes?: string[];
    nutsCode?: string;            // Ex: 'FR10' pour Île-de-France
    limit?: number;
    offset?: number;
  }): Promise<BoampConsultation[]> {
    const searchParams = new URLSearchParams({
      'filters[date_publication][gte]': params.datePublicationMin ?? '',
      'pagination[limit]': String(params.limit ?? 50),
      'pagination[offset]': String(params.offset ?? 0),
    });

    if (params.cpvCodes?.length) {
      params.cpvCodes.forEach((code) =>
        searchParams.append('filters[cpv][]', code),
      );
    }

    const response = await fetch(
      `${this.BASE_URL}/consultations?${searchParams}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ProspectionAgentic/1.0',
        },
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) {
      throw new Error(`BOAMP API error: ${response.status}`);
    }

    return response.json();
  }

  async getDceUrl(consultationId: string): Promise<string | null> {
    const response = await fetch(
      `${this.BASE_URL}/consultations/${consultationId}/documents`,
      { signal: AbortSignal.timeout(10000) },
    );

    if (!response.ok) return null;
    const data = await response.json();
    return data.dce_url ?? null;
  }
}
```

### 2. INSEE SIRENE (Données entreprises)

```typescript
// src/infrastructure/external-apis/insee.client.ts
// Coût: GRATUIT
// Rate limit: 7 req/sec avec token, 1 req/sec sans
// Auth: OAuth 2.0 client credentials
// Docs: https://api.insee.fr/catalogue/

export class InseeClient {
  private readonly BASE_URL = 'https://api.insee.fr/entreprises/sirene/v3';
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const credentials = Buffer.from(
      `${process.env.INSEE_CLIENT_ID}:${process.env.INSEE_CLIENT_SECRET}`,
    ).toString('base64');

    const response = await fetch(
      'https://api.insee.fr/token',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      },
    );

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken!;
  }

  async getEntreprise(siren: string): Promise<InseeEntreprise | null> {
    const token = await this.getToken();

    const response = await fetch(
      `${this.BASE_URL}/siren/${siren}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`INSEE API: ${response.status}`);

    const data = await response.json();
    return data.uniteLegale;
  }

  async searchEntreprises(params: {
    q: string;             // Requête SOLR: denominationUniteLegale:*digital*
    nombre?: number;
    debut?: number;
  }): Promise<InseeEntreprise[]> {
    const token = await this.getToken();
    const url = new URL(`${this.BASE_URL}/siren`);
    url.searchParams.set('q', params.q);
    url.searchParams.set('nombre', String(params.nombre ?? 20));
    url.searchParams.set('debut', String(params.debut ?? 0));

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`INSEE search: ${response.status}`);
    const data = await response.json();
    return data.unitesLegales ?? [];
  }
}
```

### 3. Dropcontact (Enrichissement email B2B)

```typescript
// Coût: ~0.10€/contact enrichi (selon volume)
// Rate limit: 120 req/min
// Docs: https://www.dropcontact.io/documentation

export class DropcontactClient {
  private readonly BASE_URL = 'https://api.dropcontact.io';

  async enrichContact(params: {
    firstName?: string;
    lastName?: string;
    companyName?: string;
    website?: string;
  }): Promise<DropcontactResult> {
    // Soumettre la requête
    const submitResponse = await fetch(`${this.BASE_URL}/b2b-api/enrich`, {
      method: 'POST',
      headers: {
        'X-Access-Token': process.env.DROPCONTACT_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [params],
        siren: true,
        language: 'FR',
      }),
    });

    const { request_id } = await submitResponse.json();

    // Polling du résultat (async API)
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000));

      const resultResponse = await fetch(
        `${this.BASE_URL}/b2b-api/enrich/${request_id}`,
        {
          headers: { 'X-Access-Token': process.env.DROPCONTACT_API_KEY! },
        },
      );

      const result = await resultResponse.json();
      if (result.success && result.data?.length > 0) {
        return result.data[0];
      }
    }

    throw new Error('Dropcontact: timeout waiting for result');
  }
}
```

### 4. Hunter.io (Recherche d'emails)

```typescript
// Coût: 49€/mois (500 recherches), 149€/mois (5000 recherches)
// Rate limit: 60 req/min (Starter), 200 req/min (Growth)
// Docs: https://hunter.io/api-documentation

export class HunterClient {
  private readonly BASE_URL = 'https://api.hunter.io/v2';

  async findEmail(params: {
    domain: string;
    firstName?: string;
    lastName?: string;
  }): Promise<HunterEmailResult | null> {
    const url = new URL(`${this.BASE_URL}/email-finder`);
    url.searchParams.set('domain', params.domain);
    url.searchParams.set('api_key', process.env.HUNTER_API_KEY!);
    if (params.firstName) url.searchParams.set('first_name', params.firstName);
    if (params.lastName) url.searchParams.set('last_name', params.lastName);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.email ? data.data : null;
  }

  async verifyEmail(email: string): Promise<{
    valid: boolean;
    score: number;
    disposable: boolean;
  }> {
    const url = new URL(`${this.BASE_URL}/email-verifier`);
    url.searchParams.set('email', email);
    url.searchParams.set('api_key', process.env.HUNTER_API_KEY!);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    return {
      valid: data.data?.status === 'valid',
      score: data.data?.score ?? 0,
      disposable: data.data?.disposable ?? false,
    };
  }

  // Trouve tous les emails d'un domaine
  async domainSearch(domain: string, limit = 10): Promise<HunterEmail[]> {
    const url = new URL(`${this.BASE_URL}/domain-search`);
    url.searchParams.set('domain', domain);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('api_key', process.env.HUNTER_API_KEY!);

    const response = await fetch(url.toString());
    const data = await response.json();
    return data.data?.emails ?? [];
  }
}
```

### 5. ZeroBounce (Validation email)

```typescript
// Coût: 16€/2000 validations, 49€/10000 validations
// Rate limit: 500 req/min
// Docs: https://www.zerobounce.net/docs/

export class ZeroBounceClient {
  private readonly BASE_URL = 'https://api.zerobounce.net/v2';

  async validate(email: string, ip?: string): Promise<ZeroBounceResult> {
    const url = new URL(`${this.BASE_URL}/validate`);
    url.searchParams.set('api_key', process.env.ZEROBOUNCE_API_KEY!);
    url.searchParams.set('email', email);
    if (ip) url.searchParams.set('ip_address', ip);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`ZeroBounce: ${response.status}`);
    return response.json();
    // status: 'valid' | 'invalid' | 'catch-all' | 'unknown' | 'spamtrap' | 'abuse' | 'do_not_mail'
  }

  async validateBatch(emails: string[]): Promise<ZeroBounceResult[]> {
    // Max 200 emails par batch
    const response = await fetch(`${this.BASE_URL}/validatebatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.ZEROBOUNCE_API_KEY,
        email_batch: emails.map((email) => ({ email_address: email })),
      }),
    });

    const data = await response.json();
    return data.email_batch;
  }

  async getCredits(): Promise<number> {
    const url = new URL(`${this.BASE_URL}/getcredits`);
    url.searchParams.set('api_key', process.env.ZEROBOUNCE_API_KEY!);
    const data = await fetch(url.toString()).then((r) => r.json());
    return parseInt(data.Credits ?? '0');
  }
}
```

### 6. Kaspr (LinkedIn data enrichment)

```typescript
// Coût: ~0.50€/contact (LinkedIn + téléphone)
// Rate limit: 100 req/min
// Docs: https://www.kaspr.io/api

export class KasprClient {
  private readonly BASE_URL = 'https://api.kaspr.io/v1';

  async enrichLinkedinProfile(linkedinUrl: string): Promise<KasprProfile | null> {
    const response = await fetch(`${this.BASE_URL}/profile/enrich`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KASPR_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ linkedin_url: linkedinUrl }),
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Kaspr: ${response.status}`);
    return response.json();
    // Retourne: email, phone, linkedin_data, company_info
  }
}
```

### 7. Pappers (Données légales entreprises françaises)

```typescript
// Coût: 60€/mois (1000 appels/mois), 150€/mois (5000 appels/mois)
// Rate limit: 3 req/sec
// Docs: https://www.pappers.fr/api/documentation

export class PappersClient {
  private readonly BASE_URL = 'https://api.pappers.fr/v2';

  async getEntreprise(siren: string): Promise<PappersEntreprise | null> {
    const url = new URL(`${this.BASE_URL}/entreprise`);
    url.searchParams.set('api_token', process.env.PAPPERS_API_KEY!);
    url.searchParams.set('siren', siren);
    url.searchParams.set('extrait_kbis', 'false');
    url.searchParams.set('beneficiaires_effectifs', 'true');
    url.searchParams.set('finances', 'true');  // Bilan, CA

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Pappers: ${response.status}`);
    return response.json();
    // Retourne: dirigeants, chiffre d'affaires, effectifs, capital, activité
  }

  async searchEntreprises(params: {
    q?: string;
    codeNaf?: string;
    departement?: string;
    trancheCa?: string;     // Ex: '100000_500000'
    page?: number;
  }): Promise<{ resultats: PappersEntreprise[]; total: number }> {
    const url = new URL(`${this.BASE_URL}/recherche`);
    url.searchParams.set('api_token', process.env.PAPPERS_API_KEY!);
    if (params.q) url.searchParams.set('q', params.q);
    if (params.codeNaf) url.searchParams.set('code_naf', params.codeNaf);
    if (params.departement) url.searchParams.set('departement', params.departement);
    if (params.trancheCa) url.searchParams.set('tranche_ca', params.trancheCa);
    url.searchParams.set('par_page', '20');
    url.searchParams.set('page', String(params.page ?? 1));

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Pappers search: ${response.status}`);
    return response.json();
  }
}
```

### 8. Wappalyzer (Détection stack technique)

```typescript
// Coût: 99€/mois (10000 lookups), 199€/mois (50000 lookups)
// Rate limit: 300 req/min
// Alternative: puppeteer + wappalyzer-core (open source, coût: 0)

// Version API hosted
export class WappalyzerApiClient {
  private readonly BASE_URL = 'https://api.wappalyzer.com/v2';

  async analyze(url: string): Promise<WappalyzerResult> {
    const response = await fetch(
      `${this.BASE_URL}/lookup/?urls=${encodeURIComponent(url)}&recursive=true`,
      {
        headers: {
          'x-api-key': process.env.WAPPALYZER_API_KEY!,
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    return response.json();
  }
}

// Version self-hosted avec Puppeteer (préférée pour les coûts)
import Wappalyzer from 'wappalyzer';

export class WappalyzerSelfHostedClient {
  async analyze(websiteUrl: string): Promise<TechStack> {
    const wappalyzer = await Wappalyzer.init({
      debug: false,
      delay: 500,
      headers: {},
      maxDepth: 1,
      maxUrls: 1,
      maxWait: 10000,
      recursive: false,
      probe: true,
      userAgent: 'Mozilla/5.0 (compatible; ProspectionBot/1.0)',
      htmlMaxSize: 2097152,
      noScripts: false,
      noRedirect: false,
    });

    try {
      const site = await wappalyzer.open(websiteUrl);
      const results = await site.analyze();
      await wappalyzer.destroy();
      return this.parseTechnologies(results.technologies);
    } catch {
      await wappalyzer.destroy();
      return { cms: null, ecommerce: null, analytics: [], frameworks: [] };
    }
  }

  private parseTechnologies(techs: any[]): TechStack {
    return {
      cms: techs.find((t) => t.categories.some((c: any) => c.id === 1))?.name ?? null,
      ecommerce: techs.find((t) => t.categories.some((c: any) => c.id === 6))?.name ?? null,
      analytics: techs
        .filter((t) => t.categories.some((c: any) => c.id === 10))
        .map((t) => t.name),
      frameworks: techs
        .filter((t) => t.categories.some((c: any) => c.id === 18))
        .map((t) => t.name),
    };
  }
}
```

### 9. Lighthouse & axe-core (Audit accessibilité)

```typescript
// Coût: GRATUIT (npm packages)
// Usage: analyse du site web du prospect pour le scoring

import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { AxePuppeteer } from '@axe-core/puppeteer';
import puppeteer from 'puppeteer';

export class WebAuditClient {
  async runLighthouse(url: string): Promise<LighthouseScores> {
    const chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
    });

    try {
      const result = await lighthouse(url, {
        port: chrome.port,
        output: 'json',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        settings: {
          formFactor: 'desktop',
          throttling: { cpuSlowdownMultiplier: 1 },
        },
      });

      const categories = result?.lhr.categories;
      return {
        performance: Math.round((categories?.performance?.score ?? 0) * 100),
        accessibility: Math.round((categories?.accessibility?.score ?? 0) * 100),
        bestPractices: Math.round((categories?.['best-practices']?.score ?? 0) * 100),
        seo: Math.round((categories?.seo?.score ?? 0) * 100),
      };
    } finally {
      await chrome.kill();
    }
  }

  async runAxe(url: string): Promise<AxeReport> {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      const results = await new AxePuppeteer(page).analyze();

      return {
        violations: results.violations.length,
        criticalViolations: results.violations.filter(
          (v) => v.impact === 'critical',
        ).length,
        passes: results.passes.length,
        score: Math.max(
          0,
          100 - results.violations.length * 5 - results.violations
            .filter((v) => v.impact === 'critical').length * 10,
        ),
      };
    } finally {
      await browser.close();
    }
  }
}
```

### 10. Gmail API (Envoi emails)

```typescript
// Coût: GRATUIT (quotas généreux pour usage pro)
// Rate limit: 250 quota units/user/sec, 1M emails/jour
// Auth: OAuth 2.0

import { google } from 'googleapis';

export class GmailClient {
  private readonly gmail;

  constructor() {
    const auth = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
    );
    auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    body: string;
    from?: string;
    replyTo?: string;
    threadId?: string;
  }): Promise<{ messageId: string; threadId: string }> {
    const message = [
      `From: ${params.from ?? process.env.GMAIL_FROM_ADDRESS}`,
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      `Reply-To: ${params.replyTo ?? params.from ?? process.env.GMAIL_FROM_ADDRESS}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      params.body,
    ].join('\n');

    const encoded = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encoded,
        threadId: params.threadId,
      },
    });

    return {
      messageId: response.data.id!,
      threadId: response.data.threadId!,
    };
  }
}
```

### 11. Mailgun (Envoi email transactionnel + tracking)

```typescript
// Coût: 35€/mois (50K emails), 80€/mois (100K emails)
// Rate limit: 3200 messages/heure en EU
// Webhooks: bounce, open, click, unsubscribe

export class MailgunClient {
  private readonly BASE_URL = 'https://api.eu.mailgun.net/v3';
  private readonly domain: string;

  constructor() {
    this.domain = process.env.MAILGUN_DOMAIN!;
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    from?: string;
    trackingVariables?: Record<string, string>;
  }): Promise<{ messageId: string }> {
    const formData = new FormData();
    formData.append('from', params.from ?? `Prospection <noreply@${this.domain}>`);
    formData.append('to', params.to);
    formData.append('subject', params.subject);
    formData.append('html', params.html);
    formData.append('o:tracking', 'yes');
    formData.append('o:tracking-clicks', 'yes');
    formData.append('o:tracking-opens', 'yes');
    formData.append('o:tag', 'prospecting');

    if (params.trackingVariables) {
      formData.append(
        'h:X-Mailgun-Variables',
        JSON.stringify(params.trackingVariables),
      );
    }

    const response = await fetch(`${this.BASE_URL}/${this.domain}/messages`, {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64'),
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mailgun error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return { messageId: data.id };
  }

  // Validation HMAC pour les webhooks Mailgun
  validateWebhookSignature(params: {
    timestamp: string;
    token: string;
    signature: string;
  }): boolean {
    const { createHmac } = require('crypto');
    const expected = createHmac('sha256', process.env.MAILGUN_WEBHOOK_SIGNING_KEY!)
      .update(params.timestamp + params.token)
      .digest('hex');
    return expected === params.signature;
  }
}
```

### 12. Waalaxy (Automatisation LinkedIn)

```typescript
// Coût: 120€/mois/siège (Business plan)
// Rate limit: limites LinkedIn (env. 100 connexions/semaine)
// Docs: API disponible sur demande

export class WaalaxyClient {
  private readonly BASE_URL = 'https://api.waalaxy.com/v1';

  async addToSequence(params: {
    linkedinUrl: string;
    sequenceName: string;
    templateId?: string;
    variables?: Record<string, string>;
  }): Promise<{ actionId: string }> {
    const response = await fetch(`${this.BASE_URL}/prospects/add`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WAALAXY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        linkedin_url: params.linkedinUrl,
        campaign_name: params.sequenceName,
        template_id: params.templateId,
        custom_variables: params.variables,
      }),
    });

    if (!response.ok) throw new Error(`Waalaxy: ${response.status}`);
    const data = await response.json();
    return { actionId: data.id };
  }

  async getProspectStatus(linkedinUrl: string): Promise<WaalaxyProspectStatus> {
    const response = await fetch(
      `${this.BASE_URL}/prospects/status?linkedin_url=${encodeURIComponent(linkedinUrl)}`,
      {
        headers: { Authorization: `Bearer ${process.env.WAALAXY_API_KEY}` },
      },
    );
    return response.json();
  }
}
```

### 13. Yousign (Signature électronique)

```typescript
// Coût: 69€/mois (100 signatures), 149€/mois (250 signatures)
// Conforme eIDAS, RGPD, certifié ISO 27001
// Docs: https://developers.yousign.com/

export class YousignClient {
  private readonly BASE_URL = process.env.NODE_ENV === 'production'
    ? 'https://api.yousign.app/v3'
    : 'https://api-sandbox.yousign.app/v3';

  async createSignatureRequest(params: {
    name: string;
    documentBase64: string;
    signatories: Array<{
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
    }>;
    externalId?: string;
    redirectUrl?: string;
  }): Promise<YousignProcedure> {
    const headers = {
      Authorization: `Bearer ${process.env.YOUSIGN_API_KEY}`,
      'Content-Type': 'application/json',
    };

    // 1. Créer la signature request
    const srResponse = await fetch(`${this.BASE_URL}/signature_requests`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: params.name,
        delivery_mode: 'email',
        timezone: 'Europe/Paris',
        expiration_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        ordered_signers: false,
        reminder_settings: {
          interval_in_days: 3,
          max_occurrences: 3,
        },
        email_custom_note: 'Veuillez signer ce document.',
        external_id: params.externalId,
        redirect_url: params.redirectUrl,
      }),
    });

    const sr = await srResponse.json();

    // 2. Upload le document
    const docResponse = await fetch(
      `${this.BASE_URL}/signature_requests/${sr.id}/documents`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          nature: 'signable_document',
          content: params.documentBase64,
          filename: `${params.name}.pdf`,
          parse_anchors: true,
        }),
      },
    );
    const doc = await docResponse.json();

    // 3. Ajouter les signataires
    for (const signatory of params.signatories) {
      await fetch(`${this.BASE_URL}/signature_requests/${sr.id}/signers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          info: {
            first_name: signatory.firstName,
            last_name: signatory.lastName,
            email: signatory.email,
            phone_number: signatory.phone,
            locale: 'fr',
          },
          signature_level: 'electronic_signature',
          signature_authentication_mode: 'no_otp',
          fields: [
            {
              document_id: doc.id,
              type: 'signature',
              page: 1,
              x: 50,
              y: 700,
              width: 200,
              height: 80,
            },
          ],
        }),
      });
    }

    // 4. Activer la procédure
    await fetch(
      `${this.BASE_URL}/signature_requests/${sr.id}/activate`,
      { method: 'POST', headers },
    );

    return sr;
  }
}
```

### 14. Slack (Notifications)

```typescript
// Coût: GRATUIT (API webhooks) ou inclus dans plan Slack
// Rate limit: 1 req/sec par webhook, 50 req/min par token

export class SlackNotificationService {
  async sendAlert(params: {
    severity: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
    fields?: Array<{ title: string; value: string; short?: boolean }>;
    channel?: string;
  }): Promise<void> {
    const colors = {
      info: '#36a64f',
      warning: '#ff9500',
      critical: '#ff0000',
    };

    const emojis = { info: ':information_source:', warning: ':warning:', critical: ':rotating_light:' };

    const payload = {
      channel: params.channel ?? process.env.SLACK_ALERT_CHANNEL ?? '#alerts',
      attachments: [
        {
          color: colors[params.severity],
          title: `${emojis[params.severity]} ${params.title}`,
          text: params.message,
          fields: params.fields,
          footer: 'ProspectionAgentic',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async sendDailyDigest(metrics: DailyMetrics): Promise<void> {
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':bar_chart: Digest Prospection' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Nouveaux prospects:*\n${metrics.newProspects}` },
          { type: 'mrkdwn', text: `*Emails envoyés:*\n${metrics.emailsSent}` },
          { type: 'mrkdwn', text: `*Taux de réponse:*\n${metrics.replyRate}%` },
          { type: 'mrkdwn', text: `*Coût LLM:*\n${metrics.llmCostEur.toFixed(2)}€` },
        ],
      },
    ];

    await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
  }
}
```

### 15. Typeform (Qualification inbound)

```typescript
// Coût: 25€/mois (Basic), 50€/mois (Plus)
// Rate limit: 60 req/min
// Webhooks: réponses au formulaire en temps réel

export class TypeformClient {
  private readonly BASE_URL = 'https://api.typeform.com';

  // Validation signature webhook Typeform
  validateWebhook(rawBody: string, signature: string): boolean {
    const { createHmac } = require('crypto');
    const expected = createHmac('sha256', process.env.TYPEFORM_WEBHOOK_SECRET!)
      .update(rawBody)
      .digest('base64');
    return `sha256=${expected}` === signature;
  }

  // Récupérer les réponses d'un formulaire
  async getResponses(formId: string, params?: {
    since?: string;
    until?: string;
    pageSize?: number;
  }): Promise<TypeformResponse[]> {
    const url = new URL(`${this.BASE_URL}/forms/${formId}/responses`);
    if (params?.since) url.searchParams.set('since', params.since);
    if (params?.until) url.searchParams.set('until', params.until);
    url.searchParams.set('page_size', String(params?.pageSize ?? 200));

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${process.env.TYPEFORM_API_KEY}` },
    });

    const data = await response.json();
    return data.items ?? [];
  }
}
```

---

## Tableau de bord des coûts externes

| Service | Coût mensuel estimé | Notes |
|---------|--------------------|----|
| Claude API (Haiku) | ~30€ | Classification, scoring |
| Claude API (Sonnet) | ~150€ | Génération emails |
| Claude API (Opus) | ~100€ | Analyse DCE |
| Dropcontact | ~200€ | 2000 enrichissements/mois |
| Hunter.io | 49€ | Plan Starter |
| ZeroBounce | 16€ | 2000 validations |
| Kaspr | ~100€ | 200 LinkedIn lookups |
| Pappers | 60€ | Plan Starter |
| Mailgun | 35€ | 50K emails |
| Waalaxy | 120€ | 1 siège Business |
| Yousign | 69€ | Plan Starter |
| Typeform | 25€ | Plan Basic |
| Langfuse | GRATUIT | Self-hosted |
| n8n | GRATUIT | Self-hosted |
| Metabase | GRATUIT | Open source |
| **TOTAL** | **~954€/mois** | Hors VPS (~40€/mois) |
