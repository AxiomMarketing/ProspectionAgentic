# V1 Centre de Contrôle

## Objectif

Vue principale (home) du dashboard Axiom. Donne une visibilité instantanée sur l'état opérationnel des 10 agents, les KPIs du jour, et les derniers événements système. C'est le point d'entrée unique pour diagnostiquer rapidement si le système fonctionne correctement ou si une intervention est nécessaire.

---

## Wireframe (ASCII mockup)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ AXIOM DASHBOARD                              [23 mars 2026 — 14:32]  ● LIVE │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MÉTRIQUES DU JOUR                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │Prospects │ │  Marchés │ │  Emails  │ │  Deals   │ │ Alertes  │        │
│  │analysés  │ │détectés  │ │ envoyés  │ │ avancés  │ │ actives  │        │
│  │   247    │ │    18    │ │    34    │ │    5     │ │    2     │        │
│  │ +12% ↑  │ │  +3 ↑   │ │  =0%    │ │ +2 ↑   │ │  ↓ ok   │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                                   │
│  │  Score   │ │ Pipeline │ │ Taux     │                                   │
│  │  moyen   │ │  total   │ │ réponse  │                                   │
│  │   72/100 │ │ 340k€    │ │  18.4%   │                                   │
│  │  +4 ↑   │ │ +45k ↑  │ │  -1% ↓  │                                   │
│  └──────────┘ └──────────┘ └──────────┘                                   │
│                                                                             │
│  AGENTS                                                                     │
│  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐        │
│  │ ScrapingAgent     │ │ ScoringAgent      │ │ EnrichmentAgent   │        │
│  │ ● RUNNING         │ │ ● IDLE            │ │ ● RUNNING         │        │
│  │ Scraping: INPI    │ │ —                 │ │ Enriching: Soc.   │        │
│  │ Dernière: 14:31   │ │ Dernière: 14:28   │ │ Dernière: 14:30   │        │
│  │ Aujourd'hui: 247  │ │ Aujourd'hui: 189  │ │ Aujourd'hui: 203  │        │
│  └───────────────────┘ └───────────────────┘ └───────────────────┘        │
│  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐        │
│  │ TenderAgent       │ │ MatchingAgent     │ │ EmailAgent        │        │
│  │ ● RUNNING         │ │ ● IDLE            │ │ ● ERROR           │        │
│  │ Parsing DCE #442  │ │ —                 │ │ SMTP timeout      │        │
│  │ Dernière: 14:29   │ │ Dernière: 14:15   │ │ Dernière: 14:22   │        │
│  │ Aujourd'hui: 18   │ │ Aujourd'hui: 312  │ │ Aujourd'hui: 34   │        │
│  └───────────────────┘ └───────────────────┘ └───────────────────┘        │
│  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐        │
│  │ NegotiationAgent  │ │ AlertingAgent     │ │ OrchestratorAgent │        │
│  │ ● IDLE            │ │ ● RUNNING         │ │ ● RUNNING         │        │
│  │ —                 │ │ Checking SLAs     │ │ Scheduling tasks  │        │
│  │ Dernière: 13:45   │ │ Dernière: 14:32   │ │ Dernière: 14:32   │        │
│  │ Aujourd'hui: 3    │ │ Aujourd'hui: 7    │ │ Aujourd'hui: 892  │        │
│  └───────────────────┘ └───────────────────┘ └───────────────────┘        │
│  ┌───────────────────┐                                                      │
│  │ AnalyticsAgent    │                                                      │
│  │ ● IDLE            │                                                      │
│  │ —                 │                                                      │
│  │ Dernière: 12:00   │                                                      │
│  │ Aujourd'hui: 12   │                                                      │
│  └───────────────────┘                                                      │
│                                                                             │
│  ACTIVITÉ RÉCENTE                              [Voir tout →]               │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 14:32 ● OrchestratorAgent  Scheduled ScoringAgent run               │  │
│  │ 14:31 ● ScrapingAgent      247 prospects scraped from INPI          │  │
│  │ 14:30 ● EnrichmentAgent    Enriched: Nexans SA (score: 78)          │  │
│  │ 14:29 ● TenderAgent        DCE #442 parsed — GO (score: 84)         │  │
│  │ 14:28 ● ScoringAgent       189 prospects rescored                   │  │
│  │ 14:27 ● AlertingAgent      SLA breach detected: EmailAgent SMTP     │  │
│  │ 14:26 ● EmailAgent         ERROR: SMTP connection refused           │  │
│  │ 14:25 ● OrchestratorAgent  EmailAgent retry #2 scheduled            │  │
│  │ ...                                                                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Composants React

```
CentreControle (page)
├── MetricBar
│   └── MetricCard × 8
├── AgentStatusGrid
│   └── AgentCard × 10
└── MiniActivityFeed
    └── ActivityRow × 20
```

### Signatures des composants

```tsx
// Page racine
export default function CentreControle(): JSX.Element

// Barre de métriques
export function MetricBar({ metrics }: MetricBarProps): JSX.Element
export function MetricCard({ metric }: MetricCardProps): JSX.Element

// Grille agents
export function AgentStatusGrid({ agents }: AgentStatusGridProps): JSX.Element
export function AgentCard({ agent, onClick }: AgentCardProps): JSX.Element
export function StatusBadge({ status }: { status: AgentStatus }): JSX.Element

// Feed activité
export function MiniActivityFeed({ events }: MiniActivityFeedProps): JSX.Element
export function ActivityRow({ event }: { event: ActivityEvent }): JSX.Element
```

---

## Props & Types (TypeScript interfaces)

```typescript
// ─── Statuts agent ───────────────────────────────────────────────────────────

type AgentStatus = 'RUNNING' | 'IDLE' | 'ERROR' | 'STOPPED' | 'STARTING';

type AgentName =
  | 'ScrapingAgent'
  | 'ScoringAgent'
  | 'EnrichmentAgent'
  | 'TenderAgent'
  | 'MatchingAgent'
  | 'EmailAgent'
  | 'NegotiationAgent'
  | 'AlertingAgent'
  | 'OrchestratorAgent'
  | 'AnalyticsAgent';

interface Agent {
  id: string;                        // UUID stable
  name: AgentName;
  status: AgentStatus;
  currentAction: string | null;      // texte libre ex: "Scraping: INPI page 3"
  lastExecutionAt: string | null;    // ISO 8601
  todayOutputCount: number;          // nbr d'entités traitées aujourd'hui
  todayOutputLabel: string;          // ex: "prospects", "marchés", "emails"
  errorMessage: string | null;       // présent si status === 'ERROR'
  uptimePercent: number;             // sur les 24 dernières heures
  avgExecutionMs: number | null;     // latence moyenne dernière exécution
}

// ─── Métriques ───────────────────────────────────────────────────────────────

type MetricTrend = 'up' | 'down' | 'stable';

interface Metric {
  id: string;
  label: string;
  value: number | string;
  unit?: string;                     // ex: '€', '%', ''
  trend: MetricTrend;
  trendValue: string;                // ex: '+12%', '+3', '=0%'
  trendLabel?: string;               // ex: 'vs hier'
  isAlert?: boolean;                 // true si valeur anormale
}

// ─── Activité feed ───────────────────────────────────────────────────────────

type EventSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';

interface ActivityEvent {
  id: string;
  timestamp: string;                 // ISO 8601
  agentName: AgentName;
  eventType: string;                 // ex: 'PROSPECT_SCORED', 'EMAIL_SENT'
  message: string;
  severity: EventSeverity;
  entityId?: string;
  entityType?: 'prospect' | 'tender' | 'deal';
  traceId?: string;                  // Langfuse trace ID
}

// ─── Props composants ────────────────────────────────────────────────────────

interface MetricBarProps {
  metrics: Metric[];
  isLoading?: boolean;
}

interface MetricCardProps {
  metric: Metric;
}

interface AgentStatusGridProps {
  agents: Agent[];
  isLoading?: boolean;
  onAgentClick?: (agent: Agent) => void;
}

interface AgentCardProps {
  agent: Agent;
  onClick?: (agent: Agent) => void;
}

interface MiniActivityFeedProps {
  events: ActivityEvent[];
  isLoading?: boolean;
  maxItems?: number;                 // défaut: 20
}

// ─── State page ──────────────────────────────────────────────────────────────

interface CentreControleState {
  agents: Agent[];
  metrics: Metric[];
  recentEvents: ActivityEvent[];
  lastRefresh: string;
  isConnected: boolean;              // SSE connection alive
}
```

---

## Données (tables SQL sources + query)

### Tables source

```sql
-- agents: état courant de chaque agent
CREATE TABLE agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'IDLE',       -- RUNNING | IDLE | ERROR | STOPPED | STARTING
  current_action  TEXT,
  last_execution_at TIMESTAMPTZ,
  error_message   TEXT,
  uptime_24h      NUMERIC(5,2) DEFAULT 100,           -- pourcentage
  avg_exec_ms     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- agent_events: log de tous les événements produits par les agents
CREATE TABLE agent_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     UUID NOT NULL REFERENCES agents(id),
  event_type   TEXT NOT NULL,
  message      TEXT NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'INFO',
  payload      JSONB DEFAULT '{}',
  entity_id    UUID,
  entity_type  TEXT,
  trace_id     TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- prospects, tenders, deals: pour les comptages journaliers
-- (voir features V3, V4, V5 pour le schéma complet)
```

### Query: état des 10 agents

```sql
SELECT
  a.id,
  a.name,
  a.status,
  a.current_action,
  a.last_execution_at,
  a.error_message,
  a.uptime_24h,
  a.avg_exec_ms,
  COALESCE(daily.output_count, 0) AS today_output_count
FROM agents a
LEFT JOIN (
  SELECT
    agent_id,
    COUNT(*) AS output_count
  FROM agent_events
  WHERE created_at >= CURRENT_DATE
  GROUP BY agent_id
) daily ON daily.agent_id = a.id
ORDER BY a.name;
```

### Query: métriques du jour

```sql
SELECT
  (SELECT COUNT(*) FROM prospects WHERE created_at >= CURRENT_DATE)             AS prospects_today,
  (SELECT COUNT(*) FROM prospects WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
                                    AND created_at < CURRENT_DATE)               AS prospects_yesterday,
  (SELECT COUNT(*) FROM tenders  WHERE created_at >= CURRENT_DATE)              AS tenders_today,
  (SELECT COUNT(*) FROM tenders  WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
                                    AND created_at < CURRENT_DATE)               AS tenders_yesterday,
  (SELECT COUNT(*) FROM emails_sent WHERE sent_at >= CURRENT_DATE)              AS emails_today,
  (SELECT COUNT(*) FROM deals    WHERE stage_updated_at >= CURRENT_DATE)        AS deals_moved_today,
  (SELECT COUNT(*) FROM quick_actions WHERE status = 'PENDING')                 AS active_alerts,
  (SELECT ROUND(AVG(score), 0) FROM prospects WHERE score IS NOT NULL)          AS avg_score,
  (SELECT COALESCE(SUM(amount), 0) FROM deals WHERE stage != 'PERDU')          AS pipeline_total,
  (SELECT ROUND(AVG(reply_rate) * 100, 1) FROM email_campaigns
   WHERE sent_at >= NOW() - INTERVAL '30 days')                                  AS reply_rate_30d;
```

### Query: activité récente (20 derniers événements)

```sql
SELECT
  ae.id,
  ae.created_at AS timestamp,
  a.name        AS agent_name,
  ae.event_type,
  ae.message,
  ae.severity,
  ae.entity_id,
  ae.entity_type,
  ae.trace_id
FROM agent_events ae
JOIN agents a ON a.id = ae.agent_id
ORDER BY ae.created_at DESC
LIMIT 20;
```

---

## Interactions Utilisateur

| Interaction | Comportement |
|---|---|
| Clic sur AgentCard | Ouvre drawer latéral avec détail agent (logs, métriques, historique) |
| Clic sur StatusBadge ERROR | Popup avec message d'erreur complet et stack trace |
| Clic sur "Voir tout →" | Navigation vers V2 Timeline (/timeline) |
| Clic sur ActivityRow | Si entityId présent: navigation vers la fiche entité (prospect/tender/deal) |
| Clic sur ActivityRow (traceId présent) | Ouvre Langfuse dans nouvel onglet |
| Hover MetricCard | Tooltip avec valeur exacte + historique 7 jours mini-sparkline |
| Hover AgentCard | Affiche uptime 24h et avg latency en tooltip |
| Clic refresh manuel | Déclenche re-fetch de toutes les queries (bouton en haut à droite) |

---

## Temps Réel (SSE events listened)

Point de connexion: `GET /api/sse/dashboard`

### Événements reçus

```typescript
// Type discriminant commun
interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data: T;
  timestamp: string;
}

type SSEEventType =
  | 'agent_status_changed'
  | 'agent_metric_updated'
  | 'new_activity_event'
  | 'metric_updated'
  | 'heartbeat';

// Payload: changement de statut agent
interface AgentStatusChangedPayload {
  agentId: string;
  agentName: AgentName;
  previousStatus: AgentStatus;
  newStatus: AgentStatus;
  currentAction: string | null;
  errorMessage: string | null;
}

// Payload: mise à jour métrique
interface MetricUpdatedPayload {
  metricId: string;
  newValue: number | string;
  trend: MetricTrend;
  trendValue: string;
}

// Payload: nouvel événement d'activité
interface NewActivityEventPayload extends ActivityEvent {}
```

### Gestion de la connexion

```typescript
// Reconnexion automatique avec backoff exponentiel
const SSE_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // ms

// Indicateur visuel dans le header:
// ● LIVE (vert) = connexion active
// ● RECONNECTING (jaune clignotant) = tentative reconnexion
// ● OFFLINE (rouge) = déconnecté > 30s
```

---

## Filtres & Recherche

Pas de filtres complexes sur cette vue (c'est une vue synthèse).

| Filtre léger | Comportement |
|---|---|
| Filtre statut agents (chips: ALL / RUNNING / IDLE / ERROR) | Filtre la grille AgentStatusGrid côté client |
| Période métriques (boutons: Aujourd'hui / 7j / 30j) | Re-fetch les métriques avec la période sélectionnée |

---

## Actions Disponibles

| Action | Conditions | Comportement |
|---|---|---|
| Restart agent | status === 'ERROR' ou 'STOPPED' | POST /api/agents/:id/restart — confirmation dialog |
| Stop agent | status === 'RUNNING' | POST /api/agents/:id/stop — confirmation dialog |
| View logs | Toujours disponible | Ouvre drawer avec logs texte streaming |
| Refresh global | Toujours | Re-fetch toutes les données |
| Export métriques | Toujours | Download CSV des métriques du jour |

---

## Edge Cases

| Cas | Comportement attendu |
|---|---|
| Aucun agent en base | Affiche grille vide avec message "Aucun agent enregistré" + lien vers documentation |
| Tous les agents en ERROR | Banner rouge en haut de page: "ALERTE SYSTÈME: X agents en erreur" |
| SSE déconnecté > 30s | Toast warning + badge OFFLINE dans header + polling fallback toutes les 10s |
| Metric query timeout | Affiche skeleton loader + retry silencieux; toast si > 3 échecs consécutifs |
| today_output_count = 0 pour tous | Normal la nuit — pas d'alerte. Alerte seulement si status = ERROR |
| AgentCard currentAction = null | Affiche "—" en grisé |
| lastExecutionAt = null | Affiche "Jamais" en grisé |
| Très long currentAction text | Tronqué à 40 chars avec "..." et tooltip sur hover |
| Fenêtre réduite (mobile) | AgentCard grid passe en 2 colonnes puis 1 colonne (responsive CSS grid) |

---

## Dépendances (npm packages used)

```json
{
  "@tanstack/react-query": "^5.x",
  "date-fns": "^3.x",
  "lucide-react": "^0.x",
  "clsx": "^2.x",
  "tailwind-merge": "^2.x"
}
```

Notes d'implémentation:
- Pas de librairie de chart sur cette vue (sparklines = CSS pur ou inline SVG)
- SSE géré via hook custom `useSSE(url, handlers)` — pas de lib externe
- React Query gère le cache + staleTime (30s pour agents, 60s pour métriques)

---

## Implémentation Priorité

**Priorité: P0 — Vue critique, premier livrable**

### Ordre de développement

```
1. Types TypeScript (Agent, Metric, ActivityEvent)      [1h]
2. SQL queries + API routes GET /api/dashboard/*        [2h]
3. Hook useSSE + reconnect logic                        [2h]
4. AgentCard + StatusBadge composants                   [2h]
5. AgentStatusGrid (layout CSS grid)                    [1h]
6. MetricCard + MetricBar                               [1h]
7. MiniActivityFeed + ActivityRow                       [1h]
8. CentreControle page assembly                         [1h]
9. SSE integration + optimistic updates                 [2h]
10. Tests manuels + edge cases                          [1h]
```

**Estimation totale: ~14h dev**

### Fichiers à créer

```
src/app/(dashboard)/page.tsx                        ← CentreControle page
src/components/dashboard/AgentCard.tsx
src/components/dashboard/AgentStatusGrid.tsx
src/components/dashboard/StatusBadge.tsx
src/components/dashboard/MetricCard.tsx
src/components/dashboard/MetricBar.tsx
src/components/dashboard/MiniActivityFeed.tsx
src/components/dashboard/ActivityRow.tsx
src/hooks/useSSE.ts
src/hooks/useDashboardData.ts
src/types/agents.ts
src/types/metrics.ts
src/app/api/dashboard/agents/route.ts
src/app/api/dashboard/metrics/route.ts
src/app/api/dashboard/activity/route.ts
src/app/api/sse/dashboard/route.ts
```
