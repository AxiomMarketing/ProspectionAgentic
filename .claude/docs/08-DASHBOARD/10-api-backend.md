# API Backend — Dashboard Axiom

## Vue d'ensemble

Le dashboard communique avec le backend NestJS via deux canaux :

1. **REST API** — requêtes CRUD classiques avec pagination
2. **SSE (Server-Sent Events)** — flux temps réel unidirectionnel pour les événements agents

Base URL : `https://api.axiom.internal` (prod) / `http://localhost:3000` (dev)

---

## Conventions générales

### Authentification

Toutes les routes sont protégées. Le dashboard tourne en réseau interne, donc l'authentification utilise un **Bearer token** stocké en mémoire (pas de localStorage pour éviter XSS).

```
Authorization: Bearer <jwt_token>
```

En développement local, un token statique peut être configuré via `VITE_DEV_TOKEN`.

### Pagination

Deux formats selon le contexte :

**Offset-based** (listes : prospects, tenders, deals, actions)

```typescript
interface PaginationQuery {
  page?: number      // default: 1
  limit?: number     // default: 20, max: 100
}

interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}
```

**Cursor-based** (flux d'événements — pour ne pas perdre d'events entre pages)

```typescript
interface CursorPaginationQuery {
  cursor?: string    // ID du dernier event recu
  limit?: number     // default: 50, max: 200
  direction?: 'forward' | 'backward'
}

interface CursorPaginatedResponse<T> {
  data: T[]
  meta: {
    nextCursor: string | null
    prevCursor: string | null
    hasMore: boolean
    total: number
  }
}
```

### Tri et filtres

Convention uniformisée pour tous les endpoints de liste :

```
GET /api/prospects?sort=score&order=desc&filter[status]=active&search=acme
```

- `sort` — nom du champ (snake_case)
- `order` — `asc` | `desc`
- `filter[field]` — filtre exact sur un champ
- `filter[field][gte]` / `filter[field][lte]` — comparaisons
- `search` — recherche full-text (si supporté)

### Format des erreurs

```typescript
interface ApiError {
  statusCode: number
  error: string
  message: string | string[]
  timestamp: string    // ISO 8601
  path: string
}
```

Exemple :
```json
{
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "message": ["score must be between 0 and 100"],
  "timestamp": "2025-10-15T14:32:00.000Z",
  "path": "/api/prospects/clx1234/score"
}
```

### Rate limiting

- Dashboard : **100 requêtes/minute** par IP
- SSE : **5 connexions simultanées** par IP
- En-têtes retournés :

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1697378520
```

### CORS

```typescript
// main.ts NestJS
app.enableCors({
  origin: [
    'http://localhost:5173',          // dev
    'http://localhost:4173',          // preview
    'https://dashboard.axiom.internal', // prod
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-Total-Count'],
})
```

---

## Endpoints

---

### 1. GET /api/agents/status

Retourne l'état en temps réel de tous les agents du système.

**URL** : `GET /api/agents/status`
**Auth** : Requis
**Rate limit** : Standard (100/min)

**Query params** : Aucun

**Response body**

```typescript
interface AgentStatusResponse {
  agents: AgentStatus[]
  summary: {
    total: number
    active: number
    idle: number
    error: number
    stopped: number
  }
  lastUpdated: string  // ISO 8601
}

interface AgentStatus {
  id: string
  name: string
  type: AgentType
  status: 'active' | 'idle' | 'error' | 'stopped'
  currentTask: string | null
  lastHeartbeat: string       // ISO 8601
  metrics: {
    eventsProcessedToday: number
    avgResponseTimeMs: number
    errorRateLast1h: number   // 0-1
  }
  uptime: number              // seconds since last start
}

type AgentType =
  | 'orchestrator'
  | 'crawler'
  | 'enricher'
  | 'scorer'
  | 'tender_monitor'
  | 'email_drafter'
  | 'crm_sync'
```

**Exemple de réponse**

```json
{
  "agents": [
    {
      "id": "agent-orchestrator-01",
      "name": "Orchestrator",
      "type": "orchestrator",
      "status": "active",
      "currentTask": "Coordinating enrichment batch #447",
      "lastHeartbeat": "2025-10-15T14:32:45.000Z",
      "metrics": {
        "eventsProcessedToday": 1247,
        "avgResponseTimeMs": 234,
        "errorRateLast1h": 0.002
      },
      "uptime": 86400
    },
    {
      "id": "agent-crawler-01",
      "name": "Web Crawler",
      "type": "crawler",
      "status": "idle",
      "currentTask": null,
      "lastHeartbeat": "2025-10-15T14:32:30.000Z",
      "metrics": {
        "eventsProcessedToday": 89,
        "avgResponseTimeMs": 1840,
        "errorRateLast1h": 0.0
      },
      "uptime": 86400
    }
  ],
  "summary": {
    "total": 7,
    "active": 4,
    "idle": 2,
    "error": 1,
    "stopped": 0
  },
  "lastUpdated": "2025-10-15T14:32:45.000Z"
}
```

**Codes d'erreur** : `401` Unauthorized, `500` Internal Server Error

**NestJS controller**

```typescript
@Controller('agents')
@UseGuards(JwtAuthGuard)
@UseInterceptors(CacheInterceptor)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get('status')
  @CacheTTL(10) // 10 secondes de cache
  async getStatus(): Promise<AgentStatusResponse> {
    return this.agentsService.getAllStatus()
  }
}
```

---

### 2. GET /api/agents/:id/events

Historique paginé des events pour un agent spécifique.

**URL** : `GET /api/agents/:id/events`
**Auth** : Requis

**Path params**
- `id` — ID de l'agent (string)

**Query params**

```typescript
interface AgentEventsQuery {
  cursor?: string           // cursor-based pagination
  limit?: number            // default: 50, max: 200
  type?: string             // filtrer par type d'event
  since?: string            // ISO 8601 — events après cette date
  until?: string            // ISO 8601 — events avant cette date
}
```

**Response body**

```typescript
type AgentEventsResponse = CursorPaginatedResponse<AgentEvent>

interface AgentEvent {
  id: string
  agentId: string
  agentName: string
  type: string
  severity: 'debug' | 'info' | 'warning' | 'error'
  message: string
  payload: Record<string, unknown> | null
  durationMs: number | null
  createdAt: string  // ISO 8601
}
```

**Exemple de requête**

```
GET /api/agents/agent-crawler-01/events?limit=5&type=crawl_completed
```

**Exemple de réponse**

```json
{
  "data": [
    {
      "id": "evt_01HX2K3M4N5P6Q7R8S9T",
      "agentId": "agent-crawler-01",
      "agentName": "Web Crawler",
      "type": "crawl_completed",
      "severity": "info",
      "message": "Crawled linkedin.com/company/acme-corp",
      "payload": {
        "url": "https://linkedin.com/company/acme-corp",
        "pagesScanned": 3,
        "dataPoints": 47
      },
      "durationMs": 2340,
      "createdAt": "2025-10-15T14:30:00.000Z"
    }
  ],
  "meta": {
    "nextCursor": "evt_01HX2K3M4N5P6Q7R8S8S",
    "prevCursor": null,
    "hasMore": true,
    "total": 89
  }
}
```

**Codes d'erreur** : `400` Bad Request (cursor invalide), `401` Unauthorized, `404` Agent not found

---

### 3. GET /api/events/stream (SSE)

Flux SSE temps réel pour tous les events agents. Le dashboard s'abonne à ce flux au démarrage.

**URL** : `GET /api/events/stream`
**Auth** : Requis (token dans le query param ou header)
**Content-Type** : `text/event-stream`

**Query params**

```typescript
interface SSEStreamQuery {
  token?: string        // Bearer token (alternative au header pour SSE)
  agents?: string       // CSV d'agent IDs à filtrer
  types?: string        // CSV de types d'events à filtrer
  severity?: string     // 'debug' | 'info' | 'warning' | 'error'
}
```

**Format des events SSE**

```
id: evt_01HX2K3M4N5P6Q7R8S9T
event: agent_event
data: {"id":"evt_01HX2K3M4N5P6Q7R8S9T","agentId":"agent-orchestrator-01","type":"task_started","severity":"info","message":"Starting enrichment for prospect clx_abc123","payload":{"prospectId":"clx_abc123"},"createdAt":"2025-10-15T14:33:00.000Z"}

id: evt_01HX2K3M4N5P6Q7R8S0U
event: agent_heartbeat
data: {"agentId":"agent-crawler-01","status":"active","timestamp":"2025-10-15T14:33:00.000Z"}

event: ping
data: {"timestamp":"2025-10-15T14:33:30.000Z"}
```

**Types d'events SSE**

| event | Description |
|---|---|
| `agent_event` | Event fonctionnel d'un agent |
| `agent_heartbeat` | Statut d'un agent (toutes les 30s) |
| `agent_status_changed` | Changement de statut d'un agent |
| `prospect_updated` | Prospect enrichi ou score changé |
| `tender_detected` | Nouvel appel d'offres détecté |
| `action_created` | Nouvelle action créée pour Jonathan |
| `ping` | Keep-alive (toutes les 30s) |

**Stratégie de reconnexion côté client**

```typescript
// src/hooks/use-sse.ts
import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const SSE_RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000] // backoff exponentiel

export function useSSE() {
  const queryClient = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    const url = new URL('/api/events/stream', window.location.origin)
    const token = getAuthToken() // récupéré du store auth

    if (token) url.searchParams.set('token', token)

    const es = new EventSource(url.toString(), { withCredentials: true })
    eventSourceRef.current = es

    es.addEventListener('agent_event', (e) => {
      const event = JSON.parse(e.data) as AgentEvent
      // Invalider les queries concernées
      void queryClient.invalidateQueries({ queryKey: ['agents', 'status'] })
      void queryClient.invalidateQueries({ queryKey: ['agents', event.agentId, 'events'] })
    })

    es.addEventListener('prospect_updated', (e) => {
      const { prospectId } = JSON.parse(e.data) as { prospectId: string }
      void queryClient.invalidateQueries({ queryKey: ['prospects', prospectId] })
    })

    es.addEventListener('ping', () => {
      retryCountRef.current = 0 // reset backoff on successful ping
    })

    es.onerror = () => {
      es.close()
      const delay = SSE_RETRY_DELAYS[
        Math.min(retryCountRef.current, SSE_RETRY_DELAYS.length - 1)
      ] ?? 30000
      retryCountRef.current++
      retryTimerRef.current = setTimeout(connect, delay)
    }
  }, [queryClient])

  useEffect(() => {
    connect()
    return () => {
      eventSourceRef.current?.close()
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [connect])
}
```

**NestJS controller**

```typescript
@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('stream')
  @Sse()
  stream(@Query() query: SSEStreamQuery): Observable<MessageEvent> {
    return this.eventsService.createStream(query).pipe(
      map((event) => ({
        id: event.id,
        type: event.sseType,
        data: JSON.stringify(event.payload),
      })),
    )
  }
}
```

**Codes d'erreur** : `401` Unauthorized, `429` Too Many Connections

---

### 4. GET /api/events

Liste paginée de tous les events (historique, pour la vue logs).

**URL** : `GET /api/events`
**Auth** : Requis

**Query params**

```typescript
interface EventsQuery {
  cursor?: string
  limit?: number              // default: 50
  agentId?: string
  type?: string
  severity?: 'debug' | 'info' | 'warning' | 'error'
  since?: string              // ISO 8601
  until?: string              // ISO 8601
  search?: string             // full-text sur message
}
```

**Response body** : `CursorPaginatedResponse<AgentEvent>`

**Exemple de requête**

```
GET /api/events?severity=error&since=2025-10-15T00:00:00Z&limit=20
```

**Exemple de réponse**

```json
{
  "data": [
    {
      "id": "evt_01HX2K3M4N5P6Q7R8S9T",
      "agentId": "agent-enricher-01",
      "agentName": "Enricher",
      "type": "enrichment_failed",
      "severity": "error",
      "message": "Failed to enrich prospect clx_xyz: timeout after 30s",
      "payload": {
        "prospectId": "clx_xyz",
        "source": "linkedin",
        "errorCode": "TIMEOUT"
      },
      "durationMs": 30000,
      "createdAt": "2025-10-15T10:15:33.000Z"
    }
  ],
  "meta": {
    "nextCursor": "evt_01HX2K3M4N5P6Q7R8S8S",
    "prevCursor": null,
    "hasMore": true,
    "total": 47
  }
}
```

**Codes d'erreur** : `400` Bad Request, `401` Unauthorized

---

### 5. GET /api/prospects

Liste paginée des prospects avec tri, filtres et recherche.

**URL** : `GET /api/prospects`
**Auth** : Requis

**Query params**

```typescript
interface ProspectsQuery {
  // Pagination
  page?: number               // default: 1
  limit?: number              // default: 20, max: 100

  // Tri
  sort?: 'score' | 'createdAt' | 'updatedAt' | 'name' | 'revenue'
  order?: 'asc' | 'desc'     // default: desc

  // Filtres
  'filter[status]'?: 'active' | 'inactive' | 'archived'
  'filter[score][gte]'?: number
  'filter[score][lte]'?: number
  'filter[sector]'?: string
  'filter[size]'?: 'tpe' | 'pme' | 'eti' | 'ge'
  'filter[hasTender]'?: boolean
  'filter[lastContactedDaysAgo][lte]'?: number

  // Recherche
  search?: string             // full-text: name, domain, contacts
}
```

**Response body**

```typescript
type ProspectsResponse = PaginatedResponse<ProspectSummary>

interface ProspectSummary {
  id: string
  name: string
  domain: string
  sector: string
  size: 'tpe' | 'pme' | 'eti' | 'ge'
  score: number               // 0-100
  scoreOverride: number | null
  effectiveScore: number      // scoreOverride ?? score
  status: 'active' | 'inactive' | 'archived'
  revenue: number | null      // EUR
  employeeCount: number | null
  city: string | null
  country: string
  lastContactedAt: string | null
  createdAt: string
  updatedAt: string
  _counts: {
    contacts: number
    tenders: number
    deals: number
    events: number
  }
}
```

**Exemple de requête**

```
GET /api/prospects?sort=score&order=desc&filter[status]=active&filter[score][gte]=70&page=1&limit=20
```

**Exemple de réponse**

```json
{
  "data": [
    {
      "id": "clx_p_01HX2K3M4N5P6",
      "name": "Acme Corp",
      "domain": "acme.com",
      "sector": "Software",
      "size": "pme",
      "score": 87,
      "scoreOverride": null,
      "effectiveScore": 87,
      "status": "active",
      "revenue": 5000000,
      "employeeCount": 45,
      "city": "Paris",
      "country": "FR",
      "lastContactedAt": "2025-10-10T09:00:00.000Z",
      "createdAt": "2025-09-01T00:00:00.000Z",
      "updatedAt": "2025-10-15T12:00:00.000Z",
      "_counts": {
        "contacts": 3,
        "tenders": 2,
        "deals": 1,
        "events": 47
      }
    }
  ],
  "meta": {
    "total": 342,
    "page": 1,
    "limit": 20,
    "totalPages": 18,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

**Codes d'erreur** : `400` Bad Request (params invalides), `401` Unauthorized

---

### 6. GET /api/prospects/:id

Détail complet d'un prospect avec toutes ses relations.

**URL** : `GET /api/prospects/:id`
**Auth** : Requis

**Path params**
- `id` — ID du prospect (CUID2)

**Response body**

```typescript
interface ProspectDetail extends ProspectSummary {
  description: string | null
  linkedinUrl: string | null
  twitterUrl: string | null
  website: string | null
  phone: string | null
  address: {
    street: string | null
    city: string | null
    zipCode: string | null
    country: string
  }
  contacts: Contact[]
  deals: DealSummary[]
  tenders: TenderSummary[]
  tags: string[]
  enrichmentSources: EnrichmentSource[]
  scoreHistory: ScoreHistoryEntry[]
  lastEnrichedAt: string | null
}

interface Contact {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  role: string | null
  isPrimaryContact: boolean
}

interface EnrichmentSource {
  source: 'linkedin' | 'pappers' | 'sirene' | 'manual'
  enrichedAt: string
  fieldsUpdated: string[]
}

interface ScoreHistoryEntry {
  score: number
  reason: string
  computedAt: string
}
```

**Codes d'erreur** : `401` Unauthorized, `404` Not Found

---

### 7. GET /api/prospects/:id/timeline

Historique chronologique des interactions avec un prospect.

**URL** : `GET /api/prospects/:id/timeline`
**Auth** : Requis

**Query params**

```typescript
interface TimelineQuery {
  cursor?: string
  limit?: number              // default: 20
  types?: string              // CSV: 'event,email,deal,note,tender'
}
```

**Response body**

```typescript
type TimelineResponse = CursorPaginatedResponse<TimelineEntry>

interface TimelineEntry {
  id: string
  type: 'agent_event' | 'email_sent' | 'deal_created' | 'note' | 'tender_linked' | 'score_changed'
  title: string
  description: string | null
  metadata: Record<string, unknown>
  author: 'system' | 'jonathan'
  occurredAt: string
}
```

**Exemple de réponse**

```json
{
  "data": [
    {
      "id": "tl_01HX2K3M",
      "type": "score_changed",
      "title": "Score mis a jour : 72 → 87",
      "description": "Nouvel AO détecté + profil LinkedIn enrichi",
      "metadata": { "previousScore": 72, "newScore": 87 },
      "author": "system",
      "occurredAt": "2025-10-15T12:00:00.000Z"
    },
    {
      "id": "tl_01HX2K3N",
      "type": "tender_linked",
      "title": "Appel d'offres lié : Refonte SI RH 2025",
      "description": null,
      "metadata": { "tenderId": "ao_01HX2K3P" },
      "author": "system",
      "occurredAt": "2025-10-14T09:30:00.000Z"
    }
  ],
  "meta": {
    "nextCursor": "tl_01HX2K2Z",
    "prevCursor": null,
    "hasMore": true,
    "total": 23
  }
}
```

**Codes d'erreur** : `401` Unauthorized, `404` Not Found

---

### 8. PATCH /api/prospects/:id/score

Override manuel du score d'un prospect par Jonathan.

**URL** : `PATCH /api/prospects/:id/score`
**Auth** : Requis
**Content-Type** : `application/json`

**Request body**

```typescript
interface ScoreOverrideBody {
  score: number           // 0-100
  reason: string          // texte libre, max 500 chars
}
```

**Validation Zod**

```typescript
const scoreOverrideSchema = z.object({
  score: z.number().int().min(0).max(100),
  reason: z.string().min(1).max(500),
})
```

**Exemple de requête**

```json
PATCH /api/prospects/clx_p_01HX2K3M4N5P6/score
Content-Type: application/json

{
  "score": 95,
  "reason": "Réunion très positive hier, décision prévue ce mois"
}
```

**Response body** : `ProspectSummary` (prospect mis à jour)

**Codes d'erreur** : `400` Validation failed, `401` Unauthorized, `404` Not Found, `422` Unprocessable Entity

**NestJS controller**

```typescript
@Patch(':id/score')
@HttpCode(HttpStatus.OK)
async overrideScore(
  @Param('id') id: string,
  @Body() dto: ScoreOverrideDto,
  @CurrentUser() user: User,
): Promise<ProspectSummary> {
  return this.prospectsService.overrideScore(id, dto, user.id)
}
```

---

### 9. GET /api/tenders

Liste paginée des appels d'offres détectés.

**URL** : `GET /api/tenders`
**Auth** : Requis

**Query params**

```typescript
interface TendersQuery {
  page?: number
  limit?: number
  sort?: 'detectedAt' | 'deadline' | 'value' | 'relevanceScore'
  order?: 'asc' | 'desc'
  'filter[decision]'?: 'pending' | 'go' | 'no_go' | 'submitted'
  'filter[relevanceScore][gte]'?: number
  'filter[deadline][lte]'?: string  // ISO 8601
  search?: string
}
```

**Response body**

```typescript
type TendersResponse = PaginatedResponse<TenderSummary>

interface TenderSummary {
  id: string
  title: string
  issuer: string
  sourceUrl: string
  estimatedValue: number | null   // EUR
  deadline: string | null
  relevanceScore: number          // 0-100, calculé par l'agent
  decision: 'pending' | 'go' | 'no_go' | 'submitted'
  linkedProspectId: string | null
  detectedAt: string
  createdAt: string
}
```

**Codes d'erreur** : `400` Bad Request, `401` Unauthorized

---

### 10. GET /api/tenders/:id

Détail complet d'un appel d'offres.

**URL** : `GET /api/tenders/:id`
**Auth** : Requis

**Response body**

```typescript
interface TenderDetail extends TenderSummary {
  description: string
  requirements: string[]
  contactInfo: {
    name: string | null
    email: string | null
    phone: string | null
  } | null
  documents: TenderDocument[]
  linkedProspect: ProspectSummary | null
  aiAnalysis: {
    summary: string
    strengths: string[]
    risks: string[]
    recommendedAction: string
    analysedAt: string
  } | null
  history: Array<{
    action: string
    by: 'system' | 'jonathan'
    at: string
    note: string | null
  }>
}

interface TenderDocument {
  id: string
  name: string
  url: string
  type: 'specification' | 'contract' | 'notice' | 'other'
  sizeBytes: number
}
```

**Codes d'erreur** : `401` Unauthorized, `404` Not Found

---

### 11. PATCH /api/tenders/:id/decision

Jonathan prend une décision sur un appel d'offres (go / no-go / soumis).

**URL** : `PATCH /api/tenders/:id/decision`
**Auth** : Requis
**Content-Type** : `application/json`

**Request body**

```typescript
interface TenderDecisionBody {
  decision: 'go' | 'no_go' | 'submitted'
  note: string | null         // optionnel, max 1000 chars
}
```

**Exemple de requête**

```json
PATCH /api/tenders/ao_01HX2K3P/decision

{
  "decision": "go",
  "note": "Budget dans notre fourchette, bonne adéquation technique"
}
```

**Response body** : `TenderSummary` (mis à jour)

**Codes d'erreur** : `400` Validation failed, `401` Unauthorized, `404` Not Found

---

### 12. GET /api/deals

Liste paginée des deals pour le kanban pipeline.

**URL** : `GET /api/deals`
**Auth** : Requis

**Query params**

```typescript
interface DealsQuery {
  page?: number
  limit?: number              // default: 50 (pour charger tout le kanban)
  sort?: 'createdAt' | 'updatedAt' | 'value' | 'probability'
  order?: 'asc' | 'desc'
  'filter[stage]'?: DealStage
  'filter[value][gte]'?: number
  prospectId?: string
}

type DealStage =
  | 'discovery'
  | 'qualification'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost'
```

**Response body**

```typescript
type DealsResponse = PaginatedResponse<Deal>

interface Deal {
  id: string
  title: string
  stage: DealStage
  value: number               // EUR
  probability: number         // 0-100
  expectedCloseDate: string | null
  prospect: {
    id: string
    name: string
    domain: string
  }
  primaryContact: {
    id: string
    firstName: string
    lastName: string
    role: string | null
  } | null
  notes: string | null
  createdAt: string
  updatedAt: string
  stageChangedAt: string
}
```

**Codes d'erreur** : `400` Bad Request, `401` Unauthorized

---

### 13. PATCH /api/deals/:id/stage

Met à jour le stage d'un deal (drag-and-drop dans le kanban).

**URL** : `PATCH /api/deals/:id/stage`
**Auth** : Requis
**Content-Type** : `application/json`

**Request body**

```typescript
interface DealStageBody {
  stage: DealStage
  note: string | null
}
```

**Exemple de requête**

```json
PATCH /api/deals/deal_01HX2K3Q/stage

{
  "stage": "proposal",
  "note": null
}
```

**Response body** : `Deal` (mis à jour)

**Codes d'erreur** : `400` Validation failed, `401` Unauthorized, `404` Not Found, `409` Conflict (transition invalide)

**Note** : les transitions invalides (ex: closed_won → discovery) retournent `409 Conflict`. Les transitions autorisées suivent un état machine défini côté backend.

---

### 14. GET /api/actions

Liste des actions à faire pour Jonathan (todo list).

**URL** : `GET /api/actions`
**Auth** : Requis

**Query params**

```typescript
interface ActionsQuery {
  page?: number
  limit?: number
  sort?: 'createdAt' | 'dueDate' | 'priority'
  order?: 'asc' | 'desc'
  'filter[status]'?: 'pending' | 'completed' | 'overdue'
  'filter[priority]'?: 'low' | 'medium' | 'high' | 'urgent'
  'filter[type]'?: ActionType
  prospectId?: string
}

type ActionType =
  | 'follow_up_email'
  | 'call'
  | 'demo'
  | 'send_proposal'
  | 'linkedin_connect'
  | 'review_tender'
  | 'update_deal'
  | 'manual'
```

**Response body**

```typescript
type ActionsResponse = PaginatedResponse<ActionItem>

interface ActionItem {
  id: string
  type: ActionType
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'pending' | 'completed' | 'overdue'
  dueDate: string | null
  prospectId: string | null
  prospectName: string | null
  tenderId: string | null
  dealId: string | null
  generatedBy: 'system' | 'jonathan'
  completedAt: string | null
  createdAt: string
}
```

**Codes d'erreur** : `400` Bad Request, `401` Unauthorized

---

### 15. PATCH /api/actions/:id/complete

Marquer une action comme complétée.

**URL** : `PATCH /api/actions/:id/complete`
**Auth** : Requis
**Content-Type** : `application/json`

**Request body**

```typescript
interface ActionCompleteBody {
  note: string | null         // optionnel, max 500 chars
  outcomeType: 'success' | 'partial' | 'failed' | null
}
```

**Exemple de requête**

```json
PATCH /api/actions/act_01HX2K3R/complete

{
  "note": "Email envoyé, Jonathan a répondu positivement",
  "outcomeType": "success"
}
```

**Response body** : `ActionItem` (mis à jour, `status: "completed"`)

**Codes d'erreur** : `400` Bad Request, `401` Unauthorized, `404` Not Found, `409` Already completed

---

### 16. GET /api/metrics/today

Métriques agrégées du jour pour la vue dashboard principale.

**URL** : `GET /api/metrics/today`
**Auth** : Requis

**Query params** : Aucun (toujours pour aujourd'hui UTC)

**Response body**

```typescript
interface TodayMetrics {
  date: string                // YYYY-MM-DD
  agents: {
    totalEvents: number
    errorCount: number
    avgResponseTimeMs: number
    activeAgents: number
  }
  prospects: {
    totalActive: number
    newToday: number
    enrichedToday: number
    scoreAvg: number
    highScore: number         // nombre de prospects score >= 80
  }
  tenders: {
    detectedToday: number
    pendingDecision: number
    goToday: number
    noGoToday: number
  }
  deals: {
    totalActive: number
    totalValue: number        // EUR, somme des deals actifs
    weightedValue: number     // somme(value * probability/100)
    wonToday: number
    lostToday: number
    wonValueToday: number
  }
  actions: {
    pending: number
    overdue: number
    completedToday: number
    urgent: number
  }
  pipeline: {
    discovery: number
    qualification: number
    proposal: number
    negotiation: number
    closed_won: number
    closed_lost: number
  }
}
```

**Exemple de réponse**

```json
{
  "date": "2025-10-15",
  "agents": {
    "totalEvents": 1247,
    "errorCount": 3,
    "avgResponseTimeMs": 412,
    "activeAgents": 5
  },
  "prospects": {
    "totalActive": 342,
    "newToday": 7,
    "enrichedToday": 23,
    "scoreAvg": 64,
    "highScore": 87
  },
  "tenders": {
    "detectedToday": 4,
    "pendingDecision": 12,
    "goToday": 2,
    "noGoToday": 1
  },
  "deals": {
    "totalActive": 18,
    "totalValue": 840000,
    "weightedValue": 462000,
    "wonToday": 1,
    "lostToday": 0,
    "wonValueToday": 45000
  },
  "actions": {
    "pending": 9,
    "overdue": 2,
    "completedToday": 5,
    "urgent": 3
  },
  "pipeline": {
    "discovery": 6,
    "qualification": 5,
    "proposal": 4,
    "negotiation": 3,
    "closed_won": 1,
    "closed_lost": 0
  }
}
```

**NestJS controller**

```typescript
@Get('metrics/today')
@CacheTTL(60) // 1 minute de cache — données agrégées
async getTodayMetrics(): Promise<TodayMetrics> {
  return this.metricsService.getTodayMetrics()
}
```

**Codes d'erreur** : `401` Unauthorized, `500` Internal Server Error

---

### 17. GET /api/graph/agents

Topologie du graphe agent pour la visualisation React Flow.

**URL** : `GET /api/graph/agents`
**Auth** : Requis

**Query params** : Aucun

**Response body**

```typescript
interface AgentGraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  lastUpdated: string
}

interface GraphNode {
  id: string
  type: 'orchestrator' | 'worker' | 'external'
  data: {
    label: string
    agentType: AgentType
    status: 'active' | 'idle' | 'error' | 'stopped'
    eventsLastHour: number
    errorRate: number
  }
  position: { x: number; y: number }  // positions calculées par le backend
}

interface GraphEdge {
  id: string
  source: string
  target: string
  type: 'message' | 'trigger' | 'data'
  data: {
    label: string | null
    messageCount: number      // messages échangés dans les dernières 24h
    lastMessageAt: string | null
    avgLatencyMs: number | null
  }
  animated: boolean           // true si edge actif dans la dernière minute
}
```

**Exemple de réponse**

```json
{
  "nodes": [
    {
      "id": "agent-orchestrator-01",
      "type": "orchestrator",
      "data": {
        "label": "Orchestrator",
        "agentType": "orchestrator",
        "status": "active",
        "eventsLastHour": 147,
        "errorRate": 0.001
      },
      "position": { "x": 400, "y": 50 }
    },
    {
      "id": "agent-crawler-01",
      "type": "worker",
      "data": {
        "label": "Web Crawler",
        "agentType": "crawler",
        "status": "idle",
        "eventsLastHour": 12,
        "errorRate": 0.0
      },
      "position": { "x": 100, "y": 200 }
    }
  ],
  "edges": [
    {
      "id": "edge-orch-crawler",
      "source": "agent-orchestrator-01",
      "target": "agent-crawler-01",
      "type": "trigger",
      "data": {
        "label": "crawl_request",
        "messageCount": 89,
        "lastMessageAt": "2025-10-15T14:30:00.000Z",
        "avgLatencyMs": 234
      },
      "animated": false
    }
  ],
  "lastUpdated": "2025-10-15T14:33:00.000Z"
}
```

**Codes d'erreur** : `401` Unauthorized, `500` Internal Server Error

---

## Exemples d'utilisation côté client

### Configuration TanStack Query

```typescript
// src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,         // 30s avant refetch
      gcTime: 5 * 60_000,        // 5 min en cache GC
      retry: (failureCount, error) => {
        // Ne pas retry les 4xx
        if (error instanceof ApiError && error.status < 500) return false
        return failureCount < 3
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})
```

### Client API centralisé

```typescript
// src/lib/api-client.ts
import { env } from '@lib/env'

class ApiClient {
  private baseUrl = env.VITE_API_URL
  private token: string | null = null

  setToken(token: string) {
    this.token = token
  }

  private async request<T>(
    method: string,
    path: string,
    options?: { body?: unknown; params?: Record<string, string | number | boolean | undefined> },
  ): Promise<T> {
    const url = new URL(path, this.baseUrl)

    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new ApiError(response.status, error)
    }

    return response.json() as Promise<T>
  }

  get<T>(path: string, params?: Record<string, string | number | boolean | undefined>) {
    return this.request<T>('GET', path, { params })
  }

  patch<T>(path: string, body: unknown) {
    return this.request<T>('PATCH', path, { body })
  }
}

export const apiClient = new ApiClient()
```

### Hook exemple : prospects avec filtres

```typescript
// src/hooks/use-prospects.ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@lib/api-client'
import type { ProspectsResponse, ProspectsQuery } from '@types/prospect'

export function useProspects(params: ProspectsQuery) {
  return useQuery({
    queryKey: ['prospects', params],
    queryFn: () =>
      apiClient.get<ProspectsResponse>('/api/prospects', params as Record<string, string>),
    placeholderData: (prev) => prev,  // keep previous data during refetch
  })
}

export function useProspect(id: string) {
  return useQuery({
    queryKey: ['prospects', id],
    queryFn: () => apiClient.get(`/api/prospects/${id}`),
    enabled: !!id,
  })
}
```

### Mutation exemple : override de score

```typescript
// src/hooks/use-prospects.ts (suite)
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useOverrideScore(prospectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (body: { score: number; reason: string }) =>
      apiClient.patch(`/api/prospects/${prospectId}/score`, body),
    onSuccess: (updated) => {
      // Mise à jour optimiste du cache
      qc.setQueryData(['prospects', prospectId], updated)
      void qc.invalidateQueries({ queryKey: ['prospects'] })
    },
  })
}
```
