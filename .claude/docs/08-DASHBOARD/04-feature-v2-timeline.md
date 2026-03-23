# V2 Timeline Agents

## Objectif

Feed chronologique complet de TOUTES les actions exécutées par les 10 agents. Permet l'audit, le débogage et le suivi opérationnel fin du système. Chaque événement est expandable pour révéler le payload complet. Navigation rapide vers les traces Langfuse et les entités métier concernées.

---

## Wireframe (ASCII mockup)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ AXIOM — Timeline Agents                                  ● LIVE  [Refresh]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FILTRES                                                                    │
│  Agent: [Tous ▼]  Type: [Tous ▼]  Prospect: [Rechercher...]               │
│  Période: [Aujourd'hui ▼]  Sévérité: [○ALL ○INFO ○WARN ●ERROR]            │
│  [Réinitialiser filtres]                            492 événements trouvés │
│                                                                             │
│  ─────────────────────── AUJOURD'HUI ────────────────────────────────      │
│                                                                             │
│  14:32:17 ┤ ▶ ORCHESTRATOR  [TASK_SCHEDULED]       ● INFO                 │
│  │         │   ScoringAgent run scheduled for 14:33                        │
│                                                                             │
│  14:31:44 ┤ ▼ SCRAPING      [PROSPECT_BATCH_SAVED]  ● SUCCESS  [↗ INPI]  │
│  │         │   247 prospects sauvegardés depuis INPI — batch #2024-03-23   │
│  │         │   ┌─────────────────────────────────────────────────────┐    │
│  │         │   │ PAYLOAD                                              │    │
│  │         │   │ {                                                    │    │
│  │         │   │   "batch_id": "batch_20240323_002",                  │    │
│  │         │   │   "source": "INPI",                                  │    │
│  │         │   │   "count": 247,                                      │    │
│  │         │   │   "new_prospects": 31,                               │    │
│  │         │   │   "updated": 216,                                    │    │
│  │         │   │   "duration_ms": 4821                                │    │
│  │         │   │ }                                                    │    │
│  │         │   └─────────────────────────────────────────────────────┘    │
│                                                                             │
│  14:30:12 ┤ ▶ ENRICHMENT    [PROSPECT_ENRICHED]     ● INFO  [↗ Nexans SA] │
│  │         │   Nexans SA enrichi — score: 78 (+12)                        │
│                                                                             │
│  14:29:33 ┤ ▶ TENDER        [TENDER_SCORED]          ● SUCCESS [↗ DCE#442]│
│  │         │   DCE #442 analysé — décision: GO (score: 84)                 │
│                                                                             │
│  14:26:07 ┤ ▶ EMAIL         [EMAIL_SEND_FAILED]      ● ERROR               │
│  │         │   SMTP connection refused — host: smtp.sendgrid.net:587       │
│                                                                             │
│  14:22:55 ┤ ▶ EMAIL         [EMAIL_SENT]             ● SUCCESS [↗ Deal#89] │
│  │         │   Email envoyé à j.martin@nexans.com (deal #89)               │
│                                                                             │
│  ─────────────────────── HIER ───────────────────────────────────────      │
│                                                                             │
│  23:58:44 ┤ ▶ ANALYTICS     [DAILY_REPORT_GENERATED] ● INFO                │
│  │                                                                          │
│  ...                                                                        │
│                                                                             │
│  [─────────────── Charger 20 événements supplémentaires ───────────────]  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Composants React

```
TimelinePage (page)
├── TimelineFilters
│   ├── AgentFilterSelect
│   ├── EventTypeFilterSelect
│   ├── ProspectSearchInput
│   ├── PeriodFilterSelect
│   └── SeverityFilterGroup
├── TimelineResultCount
├── TimelineList
│   ├── DateGroupDivider
│   └── TimelineEventCard × n
│       ├── EventHeader (timestamp, agent badge, type badge, severity dot)
│       ├── EventSummary (message texte)
│       ├── EntityLink (→ prospect / tender / deal)
│       ├── LangfuseLink (→ trace)
│       └── EventPayloadDrawer (expandable JSON viewer)
└── InfiniteScrollTrigger
```

### Signatures des composants

```tsx
export default function TimelinePage(): JSX.Element

export function TimelineFilters({
  filters,
  onFiltersChange,
  totalCount,
}: TimelineFiltersProps): JSX.Element

export function TimelineList({
  events,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: TimelineListProps): JSX.Element

export function TimelineEventCard({
  event,
  isExpanded,
  onToggleExpand,
}: TimelineEventCardProps): JSX.Element

export function EventPayloadDrawer({
  payload,
  isOpen,
}: EventPayloadDrawerProps): JSX.Element

export function AgentBadge({ agentName }: { agentName: AgentName }): JSX.Element
export function EventTypeBadge({ eventType }: { eventType: string }): JSX.Element
export function SeverityDot({ severity }: { severity: EventSeverity }): JSX.Element
export function EntityLink({ entityId, entityType, label }: EntityLinkProps): JSX.Element
```

---

## Props & Types (TypeScript interfaces)

```typescript
// ─── Catalogue des 22 types d'événements ─────────────────────────────────

type EventType =
  // Scraping
  | 'PROSPECT_SCRAPED'
  | 'PROSPECT_BATCH_SAVED'
  | 'SCRAPE_SOURCE_FAILED'
  // Scoring & Enrichissement
  | 'PROSPECT_SCORED'
  | 'PROSPECT_ENRICHED'
  | 'SCORE_DEGRADED'
  // Marchés publics
  | 'TENDER_DETECTED'
  | 'TENDER_PARSED'
  | 'TENDER_SCORED'
  | 'TENDER_DEADLINE_WARNING'
  // Emails
  | 'EMAIL_SENT'
  | 'EMAIL_OPENED'
  | 'EMAIL_REPLIED'
  | 'EMAIL_SEND_FAILED'
  // Deals & Négociation
  | 'DEAL_STAGE_CHANGED'
  | 'DEAL_CREATED'
  | 'DEAL_WON'
  | 'DEAL_LOST'
  // Système & Orchestration
  | 'TASK_SCHEDULED'
  | 'AGENT_ERROR'
  | 'ALERT_TRIGGERED'
  | 'DAILY_REPORT_GENERATED';

// Icônes associées (Lucide icon names)
const EVENT_TYPE_ICONS: Record<EventType, string> = {
  PROSPECT_SCRAPED:          'Search',
  PROSPECT_BATCH_SAVED:      'Database',
  SCRAPE_SOURCE_FAILED:      'WifiOff',
  PROSPECT_SCORED:           'Star',
  PROSPECT_ENRICHED:         'Sparkles',
  SCORE_DEGRADED:            'TrendingDown',
  TENDER_DETECTED:           'FileSearch',
  TENDER_PARSED:             'FileText',
  TENDER_SCORED:             'BarChart',
  TENDER_DEADLINE_WARNING:   'Clock',
  EMAIL_SENT:                'Send',
  EMAIL_OPENED:              'MailOpen',
  EMAIL_REPLIED:             'MessageSquare',
  EMAIL_SEND_FAILED:         'MailX',
  DEAL_STAGE_CHANGED:        'ArrowRight',
  DEAL_CREATED:              'PlusCircle',
  DEAL_WON:                  'Trophy',
  DEAL_LOST:                 'XCircle',
  TASK_SCHEDULED:            'Calendar',
  AGENT_ERROR:               'AlertTriangle',
  ALERT_TRIGGERED:           'Bell',
  DAILY_REPORT_GENERATED:    'FileBarChart',
};

// ─── Événement timeline complet ──────────────────────────────────────────

interface TimelineEvent {
  id: string;
  timestamp: string;                   // ISO 8601
  agentName: AgentName;
  eventType: EventType;
  message: string;
  severity: EventSeverity;
  payload: Record<string, unknown>;    // JSON brut de l'événement
  entityId?: string;
  entityType?: 'prospect' | 'tender' | 'deal';
  entityLabel?: string;                // ex: "Nexans SA", "DCE #442"
  traceId?: string;                    // Langfuse trace ID
  durationMs?: number;                 // durée de l'opération si applicable
}

// ─── Filtres ─────────────────────────────────────────────────────────────

type PeriodFilter =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'custom';

interface TimelineFilters {
  agentNames: AgentName[];             // [] = tous
  eventTypes: EventType[];             // [] = tous
  prospectId: string | null;
  period: PeriodFilter;
  customDateFrom?: string;             // ISO date string si period === 'custom'
  customDateTo?: string;
  severities: EventSeverity[];         // [] = tous
  searchQuery: string;                 // full-text sur message
}

// ─── Pagination curseur ───────────────────────────────────────────────────

interface TimelinePage {
  events: TimelineEvent[];
  nextCursor: string | null;           // ISO timestamp du dernier event
  totalCount: number;
  hasNextPage: boolean;
}

// ─── Props composants ─────────────────────────────────────────────────────

interface TimelineFiltersProps {
  filters: TimelineFilters;
  onFiltersChange: (filters: Partial<TimelineFilters>) => void;
  totalCount: number;
  isLoading?: boolean;
}

interface TimelineListProps {
  events: TimelineEvent[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

interface TimelineEventCardProps {
  event: TimelineEvent;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
}

interface EventPayloadDrawerProps {
  payload: Record<string, unknown>;
  isOpen: boolean;
}

interface EntityLinkProps {
  entityId: string;
  entityType: 'prospect' | 'tender' | 'deal';
  label: string;
}
```

---

## Données (tables SQL sources + query)

### Tables source

```sql
-- Réutilise agent_events (défini en V1)
-- + jointures vers prospects, tenders, deals pour les labels
```

### Query: timeline avec filtres (cursor-based pagination)

```sql
-- Paramètres: $agent_names, $event_types, $severity, $date_from, $date_to,
--             $search_query, $cursor (ISO timestamp), $limit (défaut 20)

SELECT
  ae.id,
  ae.created_at              AS timestamp,
  a.name                     AS agent_name,
  ae.event_type,
  ae.message,
  ae.severity,
  ae.payload,
  ae.entity_id,
  ae.entity_type,
  ae.trace_id,
  ae.duration_ms,
  -- Label de l'entité associée
  CASE ae.entity_type
    WHEN 'prospect' THEN p.company_name
    WHEN 'tender'   THEN CONCAT('DCE #', t.reference)
    WHEN 'deal'     THEN CONCAT('Deal #', d.id::text)
    ELSE NULL
  END AS entity_label
FROM agent_events ae
JOIN agents a ON a.id = ae.agent_id
LEFT JOIN prospects p ON p.id = ae.entity_id AND ae.entity_type = 'prospect'
LEFT JOIN tenders   t ON t.id = ae.entity_id AND ae.entity_type = 'tender'
LEFT JOIN deals     d ON d.id = ae.entity_id AND ae.entity_type = 'deal'
WHERE
  -- Filtre agent
  ($agent_names IS NULL OR a.name = ANY($agent_names))
  -- Filtre event type
  AND ($event_types IS NULL OR ae.event_type = ANY($event_types))
  -- Filtre sévérité
  AND ($severity IS NULL OR ae.severity = ANY($severity))
  -- Filtre période
  AND ae.created_at >= $date_from
  AND ae.created_at <= $date_to
  -- Filtre full-text
  AND ($search_query IS NULL OR ae.message ILIKE '%' || $search_query || '%')
  -- Pagination curseur (keyset pagination)
  AND ($cursor IS NULL OR ae.created_at < $cursor::timestamptz)
ORDER BY ae.created_at DESC
LIMIT $limit + 1;                      -- +1 pour détecter hasNextPage
```

### Query: count total (pour afficher "X événements trouvés")

```sql
SELECT COUNT(*) AS total_count
FROM agent_events ae
JOIN agents a ON a.id = ae.agent_id
WHERE
  ($agent_names IS NULL OR a.name = ANY($agent_names))
  AND ($event_types IS NULL OR ae.event_type = ANY($event_types))
  AND ($severity IS NULL OR ae.severity = ANY($severity))
  AND ae.created_at >= $date_from
  AND ae.created_at <= $date_to
  AND ($search_query IS NULL OR ae.message ILIKE '%' || $search_query || '%');
```

### Query: options pour les selects de filtres

```sql
-- Agents disponibles (pour le select agent)
SELECT DISTINCT name FROM agents ORDER BY name;

-- Types d'événements présents dans la période (pour le select type)
SELECT DISTINCT event_type
FROM agent_events
WHERE created_at >= NOW() - INTERVAL '30 days'
ORDER BY event_type;
```

### Index recommandés

```sql
CREATE INDEX idx_agent_events_created_at ON agent_events(created_at DESC);
CREATE INDEX idx_agent_events_agent_id   ON agent_events(agent_id);
CREATE INDEX idx_agent_events_event_type ON agent_events(event_type);
CREATE INDEX idx_agent_events_severity   ON agent_events(severity);
CREATE INDEX idx_agent_events_entity     ON agent_events(entity_id, entity_type);
-- Full-text search sur message
CREATE INDEX idx_agent_events_message_fts
  ON agent_events USING GIN(to_tsvector('french', message));
```

---

## Interactions Utilisateur

| Interaction | Comportement |
|---|---|
| Clic sur EventCard (collapse/expand) | Toggle `isExpanded` → révèle payload JSON formaté avec syntax highlighting |
| Clic sur EntityLink | Navigation vers fiche entité: /prospects/:id, /tenders/:id, /deals/:id |
| Clic sur LangfuseLink | Ouvre `https://cloud.langfuse.com/trace/:traceId` dans nouvel onglet |
| Changement de filtre | Re-fetch immédiat, réinitialise pagination au curseur le plus récent |
| Scroll jusqu'au bas | Déclenche chargement de 20 événements supplémentaires (infinite scroll) |
| Clic "Charger plus" (bouton fallback) | Même effet que scroll |
| Clic "Réinitialiser filtres" | Remet tous les filtres à leur valeur par défaut |
| Saisie dans ProspectSearch | Debounce 300ms avant re-fetch |
| Copier payload | Bouton "Copier JSON" dans le drawer payload |
| Nouvel événement SSE | Apparaît en haut avec animation slide-down + badge counter si l'utilisateur a scrollé |

---

## Temps Réel (SSE events listened)

Point de connexion: `GET /api/sse/timeline`

### Événements reçus

```typescript
// Nouvel événement — ajouté au sommet de la liste si correspond aux filtres actifs
interface NewTimelineEventPayload extends TimelineEvent {}

// Gestion du "vous avez N nouveaux événements" quand l'utilisateur a scrollé
interface NewEventsCounterPayload {
  count: number;
  latestTimestamp: string;
}
```

### Comportement d'insertion

```typescript
// Logique d'insertion SSE:
// 1. Reçoit new_timeline_event
// 2. Vérifie si l'event match les filtres actifs côté client
// 3. Si oui ET si scroll position = top: insère en tête de liste avec animation
// 4. Si oui ET si scroll position > top: incrémente compteur "N nouveaux"
//    → clic sur le compteur → scroll to top + merge des nouveaux événements
// 5. Si non: ignore silencieusement

function matchesFilters(event: TimelineEvent, filters: TimelineFilters): boolean {
  if (filters.agentNames.length > 0 && !filters.agentNames.includes(event.agentName)) return false;
  if (filters.eventTypes.length > 0 && !filters.eventTypes.includes(event.eventType)) return false;
  if (filters.severities.length > 0 && !filters.severities.includes(event.severity)) return false;
  if (filters.searchQuery && !event.message.toLowerCase().includes(filters.searchQuery.toLowerCase())) return false;
  return true;
}
```

---

## Filtres & Recherche

### Filtres disponibles

| Filtre | Type UI | Options | Comportement |
|---|---|---|---|
| Agent | Select multi | 10 agents + "Tous" | Filtre par agentName |
| Type événement | Select multi groupé | 22 types groupés par domaine | Filtre par eventType |
| Prospect/Entité | Search input | Full-text | Recherche entityLabel + message |
| Période | Select + date picker | Aujourd'hui / Hier / 7j / 30j / Personnalisé | Filtre sur created_at |
| Sévérité | Radio group | ALL / INFO / WARNING / ERROR | Filtre par severity |
| Recherche texte | Input | Full-text | Filtre sur message ILIKE |

### Groupement des types d'événements dans le select

```typescript
const EVENT_TYPE_GROUPS = {
  'Scraping':        ['PROSPECT_SCRAPED', 'PROSPECT_BATCH_SAVED', 'SCRAPE_SOURCE_FAILED'],
  'Scoring':         ['PROSPECT_SCORED', 'SCORE_DEGRADED', 'PROSPECT_ENRICHED'],
  'Marchés publics': ['TENDER_DETECTED', 'TENDER_PARSED', 'TENDER_SCORED', 'TENDER_DEADLINE_WARNING'],
  'Emails':          ['EMAIL_SENT', 'EMAIL_OPENED', 'EMAIL_REPLIED', 'EMAIL_SEND_FAILED'],
  'Deals':           ['DEAL_STAGE_CHANGED', 'DEAL_CREATED', 'DEAL_WON', 'DEAL_LOST'],
  'Système':         ['TASK_SCHEDULED', 'AGENT_ERROR', 'ALERT_TRIGGERED', 'DAILY_REPORT_GENERATED'],
};
```

### Persistence des filtres

Les filtres sont sérialisés dans les query params URL (ex: `?agent=ScrapingAgent&severity=ERROR&period=today`) pour permettre le partage de liens filtrés.

---

## Actions Disponibles

| Action | Contexte | Comportement |
|---|---|---|
| Copier ID événement | Menu contextuel sur EventCard | Copie `event.id` dans le presse-papier |
| Copier payload JSON | Dans le drawer payload | Copie le JSON formaté |
| Lien Langfuse | Si `traceId` présent | Ouvre trace dans nouvel onglet |
| Naviguer vers entité | Si `entityId` présent | Navigation interne |
| Filtrer par cet agent | Menu contextuel | Ajoute l'agent aux filtres actifs |
| Filtrer par ce type | Menu contextuel | Ajoute le type aux filtres actifs |
| Export CSV | Bouton header | Exporte les événements filtrés (max 10 000) |

---

## Edge Cases

| Cas | Comportement attendu |
|---|---|
| Aucun événement correspondant aux filtres | Illustration vide + "Aucun événement trouvé" + bouton "Réinitialiser filtres" |
| Payload JSON invalide | Affiche le payload brut en `<pre>` sans syntax highlighting |
| entityLabel null | Affiche l'entityId tronqué (8 premiers chars UUID) |
| traceId présent mais Langfuse injoignable | Le lien s'ouvre quand même — Langfuse gère l'erreur |
| Scroll rapide (>1000 événements) | Virtualisation de liste avec `@tanstack/react-virtual` |
| Filtre période "personnalisé" date de fin < début | Validation inline, désactive le bouton de recherche |
| SSE trop rapide (burst d'événements) | Buffer de 500ms — batching avant insertion dans la liste |
| Message très long (> 500 chars) | Tronqué à 200 chars dans le résumé; complet dans le payload drawer |
| Même ID reçu deux fois via SSE | Déduplication par `event.id` avant insertion |

---

## Dépendances (npm packages used)

```json
{
  "@tanstack/react-query": "^5.x",
  "@tanstack/react-virtual": "^3.x",
  "date-fns": "^3.x",
  "lucide-react": "^0.x",
  "react-json-view-lite": "^1.x",
  "clsx": "^2.x"
}
```

Notes:
- `@tanstack/react-virtual` pour la virtualisation si liste > 500 items
- `react-json-view-lite` pour le syntax highlighting du payload JSON (léger, ~4KB)
- La pagination cursor-based évite les problèmes de décalage lors des insertions SSE

---

## Implémentation Priorité

**Priorité: P1 — Vue secondaire critique pour le débogage**

### Ordre de développement

```
1. Types TimelineEvent + EventType catalogue       [1h]
2. SQL query + index + API route GET /api/timeline [2h]
3. TimelineFilters composant                       [2h]
4. TimelineEventCard + payload drawer              [2h]
5. Infinite scroll + cursor pagination             [2h]
6. SSE integration + filtre côté client            [1h]
7. Export CSV                                      [1h]
8. URL sync filtres (query params)                 [1h]
```

**Estimation totale: ~12h dev**

### Fichiers à créer

```
src/app/(dashboard)/timeline/page.tsx
src/components/timeline/TimelineFilters.tsx
src/components/timeline/TimelineList.tsx
src/components/timeline/TimelineEventCard.tsx
src/components/timeline/EventPayloadDrawer.tsx
src/components/timeline/EntityLink.tsx
src/components/timeline/AgentBadge.tsx
src/components/timeline/EventTypeBadge.tsx
src/hooks/useTimeline.ts
src/types/timeline.ts
src/app/api/timeline/route.ts
src/app/api/sse/timeline/route.ts
```
