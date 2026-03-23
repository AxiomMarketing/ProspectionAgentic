# V6 Graph Agents

## Objectif

Visualisation réseau interactive des 10 agents et de leurs communications. Chaque agent est un nœud avec statut coloré. Les arêtes représentent les flux de messages inter-agents avec des métriques de volume (24h) et de latence. Les arêtes s'animent lors des messages en transit. Permet de comprendre l'architecture opérationnelle et de diagnostiquer les goulots d'étranglement ou les agents isolés.

---

## Wireframe (ASCII mockup)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ AXIOM — Graph Agents                        [Réinitialiser vue]  [Export]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [○ Nœuds: ●Tous ○RUNNING ○ERROR]  Période: [24h ▼]  [Afficher latence]  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                                                                     │  │
│  │                    ┌─────────────────┐                             │  │
│  │                    │  Orchestrator   │                             │  │
│  │                    │   ● RUNNING     │                             │  │
│  │                    │   892 actions   │                             │  │
│  │                    └────────┬────────┘                             │  │
│  │           ┌────────────────┼──────────────────┐                   │  │
│  │           │  247 msg       │  189 msg         │  18 msg           │  │
│  │           ▼                ▼                   ▼                   │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │  │
│  │  │  Scraping    │  │  Scoring     │  │  Tender      │           │  │
│  │  │  ● RUNNING   │  │  ● IDLE      │  │  ● RUNNING   │           │  │
│  │  │  247 today   │  │  189 today   │  │  18 today    │           │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │  │
│  │         │ 203 msg          │ 312 msg          │ 84 msg             │  │
│  │         ▼                  ▼                  ▼                   │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │  │
│  │  │  Enrichment  │  │  Matching    │  │  Alerting    │           │  │
│  │  │  ● RUNNING   │  │  ● IDLE      │  │  ● RUNNING   │           │  │
│  │  │  203 today   │  │  312 today   │  │  7 today     │           │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │  │
│  │         │                  │ 34 msg           │                   │  │
│  │         └──────────────────┼──────────────────┘                   │  │
│  │                            ▼                                       │  │
│  │         ┌──────────────────────────────────┐                      │  │
│  │         │            Email                 │                      │  │
│  │         │            ● ERROR               │                      │  │
│  │         │            34 today              │                      │  │
│  │         └────────────────┬─────────────────┘                      │  │
│  │                          │ 3 msg                                   │  │
│  │                          ▼                                         │  │
│  │              ┌──────────────────────┐                             │  │
│  │              │    Negotiation       │                             │  │
│  │              │    ● IDLE            │                             │  │
│  │              │    3 today           │                             │  │
│  │              └──────────────────────┘                             │  │
│  │                                                                     │  │
│  │  ┌──────────────┐                                                  │  │
│  │  │  Analytics   │  (nœud isolé, pas de connexions actives)         │  │
│  │  │  ● IDLE      │                                                  │  │
│  │  │  12 today    │                                                  │  │
│  │  └──────────────┘                                                  │  │
│  │                                                                     │  │
│  │  [Zoom +] [Zoom -] [Fit]   Mini-map ┌───┐                         │  │
│  │                                     │   │                         │  │
│  │                                     └───┘                         │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  LÉGENDE:  ● RUNNING  ● IDLE  ● ERROR  ● STOPPED    ── flux actif         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tooltip arête (hover)

```
┌─────────────────────────────────────┐
│  Orchestrator → Scraping            │
│  247 messages (24h)   Latence: 42ms │
│  ─────────────────────────────────  │
│  Derniers messages:                 │
│  14:32 "SCHEDULE_RUN" (payload: {…})│
│  14:28 "SCHEDULE_RUN" (payload: {…})│
│  14:22 "STOP_REQUESTED" (…)         │
│  14:15 "SCHEDULE_RUN" (…)           │
│  13:58 "SCHEDULE_RUN" (…)           │
└─────────────────────────────────────┘
```

### Drawer nœud (clic agent)

```
┌───────────────────────────────────────┐
│  ScrapingAgent              [✕]       │
│  ─────────────────────────────────    │
│  Statut: ● RUNNING                    │
│  Action: Scraping INPI page 3         │
│  Uptime 24h: 98.2%                    │
│  Latence moy.: 2 840ms                │
│  Outputs aujourd'hui: 247             │
│  Erreurs (24h): 0                     │
│  ─────────────────────────────────    │
│  MESSAGES REÇUS (TOP 3 émetteurs)     │
│  Orchestrator: 247 messages           │
│  ─────────────────────────────────    │
│  MESSAGES ENVOYÉS (TOP 3 dest.)       │
│  EnrichmentAgent: 203 messages        │
│  ─────────────────────────────────    │
│  [Voir logs]  [Voir timeline]  [↻]    │
└───────────────────────────────────────┘
```

---

## Composants React

```
GraphAgentsPage (page)
├── GraphToolbar
│   ├── NodeFilterChips
│   ├── PeriodSelect
│   └── ShowLatencyToggle
├── AgentGraphCanvas (React Flow)
│   ├── AgentNode × 10 (custom node)
│   │   ├── NodeStatusDot
│   │   ├── NodeName
│   │   ├── NodeMetric (count today)
│   │   └── NodeActionText
│   ├── AgentEdge × n (custom edge)
│   │   ├── EdgeLabel (message count)
│   │   └── AnimatedParticle (when active)
│   └── EdgeTooltip (on hover)
├── GraphLegend
├── AgentNodeDrawer (slide-over)
│   ├── AgentDetailInfo
│   ├── MessageFlowSummary
│   └── AgentQuickActions
└── ReactFlowMiniMap
```

### Signatures des composants

```tsx
export default function GraphAgentsPage(): JSX.Element

export function AgentGraphCanvas({
  nodes,
  edges,
  onNodeClick,
  onEdgeClick,
}: AgentGraphCanvasProps): JSX.Element

// Custom React Flow node
export function AgentNode({ data }: NodeProps<AgentNodeData>): JSX.Element

// Custom React Flow edge
export function AgentEdge({
  id,
  source,
  target,
  data,
  ...props
}: EdgeProps<AgentEdgeData>): JSX.Element

export function EdgeTooltip({
  edge,
  position,
}: EdgeTooltipProps): JSX.Element

export function AgentNodeDrawer({
  agentId,
  isOpen,
  onClose,
}: AgentNodeDrawerProps): JSX.Element
```

---

## Props & Types (TypeScript interfaces)

```typescript
import type { Node, Edge, NodeProps, EdgeProps } from '@xyflow/react';

// ─── Données nœud (agent) ─────────────────────────────────────────────────

interface AgentNodeData {
  agentId: string;
  agentName: AgentName;
  status: AgentStatus;
  todayOutputCount: number;
  todayOutputLabel: string;
  currentAction: string | null;
  errorMessage: string | null;
  uptimePercent: number;
  avgExecutionMs: number | null;
  // Couleur du nœud selon le statut
  statusColor: string;               // ex: '#22c55e' (RUNNING), '#94a3b8' (IDLE), '#ef4444' (ERROR)
}

// ─── Données arête (communication inter-agents) ───────────────────────────

interface AgentEdgeData {
  sourceAgentId: string;
  targetAgentId: string;
  messageCount24h: number;
  avgLatencyMs: number | null;
  lastMessages: EdgeMessage[];       // 5 derniers messages
  isCurrentlyActive: boolean;        // true si message en transit en ce moment
  lastActivityAt: string | null;
}

interface EdgeMessage {
  id: string;
  type: string;                      // ex: 'SCHEDULE_RUN', 'SCORE_REQUEST'
  timestamp: string;
  payloadPreview: string;            // ex: '{"agent": "Scraping", "priority": 1}'
}

// ─── Nœud React Flow typé ────────────────────────────────────────────────

type AgentFlowNode = Node<AgentNodeData>;
type AgentFlowEdge = Edge<AgentEdgeData>;

// ─── Messages inter-agents (table source) ────────────────────────────────

interface AgentMessage {
  id: string;
  fromAgentId: string;
  fromAgentName: AgentName;
  toAgentId: string;
  toAgentName: AgentName;
  messageType: string;
  payload: Record<string, unknown>;
  sentAt: string;
  processedAt: string | null;
  latencyMs: number | null;
}

// ─── Configuration layout dagre ───────────────────────────────────────────

interface DagreLayoutConfig {
  direction: 'TB' | 'LR' | 'BT' | 'RL';  // TB = top-to-bottom
  nodeSeparation: number;            // distance horizontale entre nœuds (px)
  rankSeparation: number;            // distance verticale entre rangs (px)
  nodeWidth: number;                 // largeur de nœud pour dagre (px)
  nodeHeight: number;                // hauteur de nœud pour dagre (px)
}

const DEFAULT_DAGRE_CONFIG: DagreLayoutConfig = {
  direction: 'TB',
  nodeSeparation: 80,
  rankSeparation: 120,
  nodeWidth: 160,
  nodeHeight: 80,
};

// ─── Props composants ─────────────────────────────────────────────────────

interface AgentGraphCanvasProps {
  nodes: AgentFlowNode[];
  edges: AgentFlowEdge[];
  onNodeClick: (agentId: string) => void;
  onEdgeClick: (edgeId: string) => void;
  isLoading?: boolean;
}

interface EdgeTooltipProps {
  edge: AgentFlowEdge;
  position: { x: number; y: number };
  isVisible: boolean;
}

interface AgentNodeDrawerProps {
  agentId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

// ─── Filtres graph ────────────────────────────────────────────────────────

interface GraphFilters {
  statusFilter: AgentStatus[] | 'ALL';   // 'ALL' = tous les nœuds
  period: '1h' | '6h' | '24h' | '7d';
  showLatency: boolean;
  minMessageCount: number;               // masque les arêtes < N messages
}

// ─── Payload SSE pour animations ─────────────────────────────────────────

interface AgentMessageFlowPayload {
  type: 'agent_message_sent';
  data: {
    fromAgentId: string;
    toAgentId: string;
    messageType: string;
    edgeId: string;                  // pour identifier l'arête à animer
  };
}
```

---

## Données (tables SQL sources + query)

### Tables source

```sql
-- Table des messages inter-agents
CREATE TABLE agent_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id   UUID NOT NULL REFERENCES agents(id),
  to_agent_id     UUID NOT NULL REFERENCES agents(id),
  message_type    TEXT NOT NULL,
  payload         JSONB DEFAULT '{}',
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ,
  latency_ms      INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM processed_at - sent_at) * 1000
  ) STORED
);

CREATE INDEX idx_agent_messages_sent_at ON agent_messages(sent_at DESC);
CREATE INDEX idx_agent_messages_from_to ON agent_messages(from_agent_id, to_agent_id);
```

### Query: nœuds (état des agents)

```sql
-- Réutilise la query des agents depuis V1 Centre de Contrôle
SELECT
  a.id,
  a.name,
  a.status,
  a.current_action,
  a.error_message,
  a.uptime_24h,
  a.avg_exec_ms,
  COALESCE(daily.output_count, 0) AS today_output_count
FROM agents a
LEFT JOIN (
  SELECT agent_id, COUNT(*) AS output_count
  FROM agent_events
  WHERE created_at >= CURRENT_DATE
  GROUP BY agent_id
) daily ON daily.agent_id = a.id
ORDER BY a.name;
```

### Query: arêtes (communications inter-agents sur la période)

```sql
-- Paramètre: $period_hours (ex: 24 pour 24h)

SELECT
  am.from_agent_id,
  fa.name AS from_agent_name,
  am.to_agent_id,
  ta.name AS to_agent_name,
  COUNT(*) AS message_count,
  ROUND(AVG(am.latency_ms), 0) AS avg_latency_ms,
  MAX(am.sent_at) AS last_activity_at
FROM agent_messages am
JOIN agents fa ON fa.id = am.from_agent_id
JOIN agents ta ON ta.id = am.to_agent_id
WHERE am.sent_at >= NOW() - ($period_hours || ' hours')::interval
GROUP BY am.from_agent_id, fa.name, am.to_agent_id, ta.name
HAVING COUNT(*) > 0
ORDER BY message_count DESC;
```

### Query: 5 derniers messages pour une arête (tooltip)

```sql
SELECT
  am.id,
  am.message_type AS type,
  am.sent_at AS timestamp,
  am.payload::text AS payload_preview  -- sera tronqué côté applicatif
FROM agent_messages am
WHERE am.from_agent_id = $from_id
  AND am.to_agent_id   = $to_id
ORDER BY am.sent_at DESC
LIMIT 5;
```

### Algorithme de layout dagre

```typescript
import dagre from '@dagrejs/dagre';
import type { AgentFlowNode, AgentFlowEdge } from '@/types/graph';

function applyDagreLayout(
  nodes: AgentFlowNode[],
  edges: AgentFlowEdge[],
  config: DagreLayoutConfig = DEFAULT_DAGRE_CONFIG
): { nodes: AgentFlowNode[]; edges: AgentFlowEdge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir:  config.direction,
    nodesep:  config.nodeSeparation,
    ranksep:  config.rankSeparation,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width:  config.nodeWidth,
      height: config.nodeHeight,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - config.nodeWidth  / 2,
        y: dagreNode.y - config.nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
```

---

## Interactions Utilisateur

| Interaction | Comportement |
|---|---|
| Clic sur nœud agent | Ouvre AgentNodeDrawer avec détails + métriques |
| Hover sur arête | Affiche EdgeTooltip avec volume + latence + 5 derniers messages |
| Clic sur arête | Navigue vers V2 Timeline filtré sur cette connexion agent→agent |
| Zoom molette / pinch | Zoom natif React Flow |
| Pan (drag canvas vide) | Déplacement de la vue natif React Flow |
| Clic "Réinitialiser vue" | fitView() → recenter sur tous les nœuds |
| Clic "Fit" (bouton zoom) | fitView() |
| Filtre nœuds par statut | Masque visuellement les nœuds non-matching (opacity: 0.2) |
| Changement période | Re-fetch les arêtes avec nouvelle période |
| Toggle "Afficher latence" | Affiche/masque les labels de latence sur les arêtes |
| Clic "View logs" dans drawer | Navigue vers V2 Timeline filtré sur cet agent |
| Clic "View timeline" dans drawer | Navigue vers V2 Timeline filtré sur cet agent |

---

## Temps Réel (SSE events listened)

Point de connexion: `GET /api/sse/graph`

```typescript
// Changement statut agent → mise à jour couleur nœud sans re-layout
interface AgentStatusChangedForGraph {
  type: 'agent_status_changed';
  data: {
    agentId: string;
    newStatus: AgentStatus;
    currentAction: string | null;
  };
}

// Message envoyé → animation de particule sur l'arête concernée
interface AgentMessageSentPayload {
  type: 'agent_message_sent';
  data: {
    fromAgentId: string;
    toAgentId: string;
    messageType: string;
  };
}

// Mise à jour des compteurs d'arête (toutes les 30s)
interface EdgeCountersUpdatedPayload {
  type: 'edge_counters_updated';
  data: Array<{
    fromAgentId: string;
    toAgentId: string;
    messageCount24h: number;
    avgLatencyMs: number;
  }>;
}
```

### Logique d'animation des arêtes

```typescript
// Quand un événement agent_message_sent est reçu:
// 1. Trouver l'arête React Flow correspondante (source → target)
// 2. Mettre isCurrentlyActive = true sur l'arête
// 3. Activer l'animation de particule (classe CSS ou SVG stroke-dashoffset)
// 4. Après 1500ms: remettre isCurrentlyActive = false

function handleMessageFlowSSE(
  fromAgentId: string,
  toAgentId: string,
  setEdges: React.Dispatch<React.SetStateAction<AgentFlowEdge[]>>
): void {
  const edgeId = `${fromAgentId}-${toAgentId}`;
  setEdges((prev) =>
    prev.map((e) =>
      e.id === edgeId ? { ...e, data: { ...e.data, isCurrentlyActive: true } } : e
    )
  );
  setTimeout(() => {
    setEdges((prev) =>
      prev.map((e) =>
        e.id === edgeId ? { ...e, data: { ...e.data, isCurrentlyActive: false } } : e
      )
    );
  }, 1500);
}
```

---

## Filtres & Recherche

| Filtre | Type | Comportement |
|---|---|---|
| Statut nœud | Chips multi | Réduit l'opacité des nœuds non-sélectionnés (pas de suppression) |
| Période | Select | 1h / 6h / 24h / 7j → re-fetch des métriques d'arêtes |
| Afficher latence | Toggle | Affiche/masque les labels de latence sur les arêtes |
| Volume min. messages | Slider | Masque les arêtes avec < N messages |

---

## Actions Disponibles

| Action | Contexte | Comportement |
|---|---|---|
| Restart agent | Depuis drawer, si status ERROR | POST /api/agents/:id/restart |
| Voir logs agent | Depuis drawer | Navigation V2 Timeline filtré |
| Voir timeline agent | Depuis drawer | Navigation V2 Timeline filtré |
| Filtrer timeline sur connexion | Clic arête | Navigation V2 Timeline filtré sur agent_from + agent_to |
| Export image PNG | Toolbar | React Flow toObject() → canvas → download |
| Réinitialiser layout | Toolbar | Re-apply dagre layout |

---

## Edge Cases

| Cas | Comportement attendu |
|---|---|
| Aucune communication dans la période | Graph affiché avec nœuds mais sans arêtes + message "Aucune communication dans la période sélectionnée" |
| Agent isolé (0 connexions) | Nœud placé à gauche du graphe par dagre, pas d'arêtes |
| messageCount24h = 0 sur une arête | Arête masquée (filtrée côté client) |
| avgLatencyMs = null | Label latence affiché comme "—" |
| React Flow > 50 nœuds (extension future) | Performance: utiliser nodesDraggable = false + simplifier les nœuds |
| Fenêtre très petite | Mini-map cachée sous 768px, pan/zoom toujours actifs |
| Agent ERROR avec arêtes actives | Arêtes sortantes grisées, arêtes entrantes normales |
| Burst de messages SSE | Throttling de l'animation: max 1 animation par arête simultanément |
| payload_preview > 100 chars | Tronqué à 80 chars + "…" dans l'EdgeTooltip |

---

## Dépendances (npm packages used)

```json
{
  "@xyflow/react": "^12.x",
  "@dagrejs/dagre": "^1.x",
  "@tanstack/react-query": "^5.x",
  "date-fns": "^3.x",
  "lucide-react": "^0.x",
  "clsx": "^2.x"
}
```

Notes:
- `@xyflow/react` est la version React 18+ de ReactFlow (ex `reactflow`)
- `@dagrejs/dagre` pour le layout hiérarchique automatique — pas de positioning manuel
- L'animation des particules sur les arêtes est implémentée en CSS keyframes sur un SVG circle

---

## Implémentation Priorité

**Priorité: P2 — Vue de monitoring avancé, utile mais non bloquante**

### Ordre de développement

```
1. Types TypeScript graph (AgentNodeData, AgentEdgeData)  [1h]
2. Table SQL agent_messages + index                       [1h]
3. Query nœuds (réutilise V1) + Query arêtes + API       [2h]
4. AgentNode custom component                             [2h]
5. AgentEdge custom component (avec animation CSS)        [2h]
6. dagre layout function                                  [1h]
7. AgentGraphCanvas (React Flow setup)                    [2h]
8. EdgeTooltip (hover + 5 derniers messages)              [2h]
9. AgentNodeDrawer                                        [2h]
10. SSE animation handler                                 [1h]
11. Filtres + toolbar                                     [1h]
12. Export PNG                                            [1h]
```

**Estimation totale: ~18h dev**

### Fichiers à créer

```
src/app/(dashboard)/graph/page.tsx
src/components/graph/AgentGraphCanvas.tsx
src/components/graph/AgentNode.tsx
src/components/graph/AgentEdge.tsx
src/components/graph/EdgeTooltip.tsx
src/components/graph/GraphToolbar.tsx
src/components/graph/GraphLegend.tsx
src/components/graph/AgentNodeDrawer.tsx
src/lib/graph/dagreLayout.ts
src/hooks/useGraphData.ts
src/types/graph.ts
src/app/api/graph/nodes/route.ts
src/app/api/graph/edges/route.ts
src/app/api/graph/edges/[edgeId]/messages/route.ts
src/app/api/sse/graph/route.ts
```
