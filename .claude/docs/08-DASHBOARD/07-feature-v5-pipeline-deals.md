# V5 Pipeline Deals

## Objectif

Vue Kanban drag-and-drop du pipeline commercial. 7 colonnes représentant les étapes du cycle de vente. Chaque deal est une carte déplaçable entre les colonnes. Métriques de performance en tête de page (CA total, vélocité, taux de conversion, durée moyenne). Vue synthétique pour piloter le commercial au quotidien.

---

## Wireframe (ASCII mockup)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ AXIOM — Pipeline Deals                                                              [+ Nouveau deal]      │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                          │
│  MÉTRIQUES PIPELINE                                                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                                  │
│  │ Total CA     │ │ Vélocité     │ │ Taux succès  │ │ Durée moy.   │                                  │
│  │ 2 340 000€   │ │  4 250 €/j   │ │    38%       │ │   67 jours   │                                  │
│  │  +340k ↑    │ │   stable     │ │  +3% ↑      │ │  -5j ↑      │                                  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘                                  │
│                                                                                                          │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬─────────┐ │
│  │  QUALIFIÉ    │    DEVIS     │CONSIDÉRATION │ NÉGOCIATION  │  PRÊT SIGNER │    SIGNÉ     │  PERDU  │ │
│  │   6 deals    │   4 deals    │   3 deals    │   2 deals    │   1 deal     │   1 deal     │ 3 deals │ │
│  │   840k€      │   620k€      │   450k€      │   280k€      │   150k€      │   280k€      │  —      │ │
│  ├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────┤ │
│  │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │         │ │
│  │ │ Nexans SA│ │ │SNCF      │ │ │Enedis    │ │ │Bouygues  │ │ │Schneider │ │ │Eiffage   │ │         │ │
│  │ │ J.Martin │ │ │P.Durand  │ │ │—         │ │ │M.Leblanc │ │ │A.Bernard │ │ │S.Dupont  │ │         │ │
│  │ │ 280 000€ │ │ │ 520 000€ │ │ │ 150 000€ │ │ │ 180 000€ │ │ │ 150 000€ │ │ │ 280 000€ │ │         │ │
│  │ │ ⏱ 5j    │ │ │ ⏱ 12j   │ │ │ ⏱ 8j    │ │ │ ⏱ 18j   │ │ │ ⏱ 25j   │ │ │ ✅ Signé │ │         │ │
│  │ │ 🔥 Chaud │ │ │ 📞 Appel │ │ │ 📧 Email │ │ │ 🤝 RDV  │ │ │ 📝 Contrat│ │ │ 03/04   │ │         │ │
│  │ └──────────┘ │ └──────────┘ │ └──────────┘ │ └──────────┘ │ └──────────┘ │ └──────────┘ │         │ │
│  │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │              │              │ ┌──────┐ │ │
│  │ │ Engie    │ │ │ARS IDF   │ │ │La Poste  │ │              │              │              │ │Deal 1│ │ │
│  │ │ —        │ │ │C.Moreau  │ │ │—         │ │              │              │              │ │ 95k€ │ │ │
│  │ │ 120 000€ │ │ │ 340 000€ │ │ │  95 000€ │ │              │              │              │ │ ❌   │ │ │
│  │ │ ⏱ 3j    │ │ │ ⏱ 7j    │ │ │ ⏱ 22j   │ │              │              │              │ └──────┘ │ │
│  │ │ 📧 Email │ │ │ 📄 Devis │ │ │ ⏳ Att.  │ │              │              │              │         │ │
│  │ └──────────┘ │ └──────────┘ │ └──────────┘ │              │              │              │         │ │
│  │     ...      │     ...      │              │              │              │              │         │ │
│  └──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴─────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Composants React

```
PipelineDealsPage (page)
├── PipelineMetrics
│   └── PipelineMetricCard × 4
├── KanbanBoard
│   └── KanbanColumn × 7
│       ├── ColumnHeader (titre, count, montant total)
│       └── DraggableDealCard × n
│           ├── DealCardHeader (company, contact)
│           ├── DealAmount
│           ├── DealActivity (days since last action)
│           ├── NextActionBadge
│           └── HeatIndicator
└── DealDetailDrawer (slide-over)
    ├── DealHeader
    ├── DealInfo
    ├── DealTimeline
    └── DealActions
```

### Signatures des composants

```tsx
export default function PipelineDealsPage(): JSX.Element

export function PipelineMetrics({ metrics }: PipelineMetricsProps): JSX.Element

export function KanbanBoard({
  deals,
  onDealMove,
  onDealClick,
}: KanbanBoardProps): JSX.Element

export function KanbanColumn({
  stage,
  deals,
  isOver,
}: KanbanColumnProps): JSX.Element

export function DraggableDealCard({
  deal,
  onClick,
}: DraggableDealCardProps): JSX.Element

export function HeatIndicator({ heat }: { heat: DealHeat }): JSX.Element
export function NextActionBadge({ action }: { action: NextAction | null }): JSX.Element

export function DealDetailDrawer({
  dealId,
  isOpen,
  onClose,
}: DealDetailDrawerProps): JSX.Element
```

---

## Props & Types (TypeScript interfaces)

```typescript
// ─── Étapes du pipeline ───────────────────────────────────────────────────

type DealStage =
  | 'QUALIFIE'
  | 'DEVIS'
  | 'CONSIDERATION'
  | 'NEGOCIATION'
  | 'PRET_SIGNER'
  | 'SIGNE'
  | 'PERDU';

const STAGE_ORDER: DealStage[] = [
  'QUALIFIE',
  'DEVIS',
  'CONSIDERATION',
  'NEGOCIATION',
  'PRET_SIGNER',
  'SIGNE',
  'PERDU',
];

const STAGE_LABELS: Record<DealStage, string> = {
  QUALIFIE:     'Qualifié',
  DEVIS:        'Devis',
  CONSIDERATION:'Considération',
  NEGOCIATION:  'Négociation',
  PRET_SIGNER:  'Prêt à signer',
  SIGNE:        'Signé',
  PERDU:        'Perdu',
};

// ─── Indicateur de chaleur ────────────────────────────────────────────────

type DealHeat = 'HOT' | 'WARM' | 'COLD' | 'STALE';
// HOT  = activité < 3j, momentum positif
// WARM = activité 3–7j
// COLD = activité 7–21j
// STALE = inactif > 21j → alerte

// ─── Prochaine action ────────────────────────────────────────────────────

type NextActionType =
  | 'CALL'
  | 'EMAIL'
  | 'MEETING'
  | 'SEND_PROPOSAL'
  | 'SEND_CONTRACT'
  | 'FOLLOW_UP'
  | 'WAIT_RESPONSE';

interface NextAction {
  type: NextActionType;
  label: string;
  dueDate: string | null;
}

// ─── Deal (vue Kanban card) ───────────────────────────────────────────────

interface DealCard {
  id: string;
  stage: DealStage;
  companyName: string;
  contactName: string | null;
  contactTitle: string | null;
  amount: number;                    // en euros
  daysSinceLastAction: number;       // calculé
  nextAction: NextAction | null;
  heat: DealHeat;
  prospectId: string | null;        // lien vers V3 Prospects
  tenderId: string | null;          // lien vers V4 Marchés Publics (si deal issu d'un AO)
  columnPosition: number;           // ordre dans la colonne pour le drag-and-drop
  createdAt: string;
  stageUpdatedAt: string;
}

// ─── Deal (vue détail) ────────────────────────────────────────────────────

interface DealDetail extends DealCard {
  description: string | null;
  probability: number;               // 0–1, par stage par défaut
  expectedCloseDate: string | null;
  lastActionDate: string | null;
  lastActionDescription: string | null;
  assignedTo: string | null;
  tags: string[];
  timeline: DealTimelineEvent[];
  notes: DealNote[];
}

interface DealTimelineEvent {
  id: string;
  type: string;
  label: string;
  performedBy: string;
  createdAt: string;
}

interface DealNote {
  id: string;
  content: string;
  authorName: string;
  createdAt: string;
}

// ─── Métriques pipeline ───────────────────────────────────────────────────

interface PipelineMetrics {
  totalPipelineAmount: number;        // somme CA hors SIGNE et PERDU
  totalPipelineAmountDelta: number;   // variation vs il y a 7j
  velocityPerDay: number;             // CA moyen progressé par jour (30j glissants)
  velocityTrend: 'up' | 'down' | 'stable';
  winRate: number;                    // % deals SIGNE / (SIGNE + PERDU)
  winRateDelta: number;               // variation vs mois précédent
  avgCycleDays: number;               // durée moyenne QUALIFIE → SIGNE
  avgCycleDaysDelta: number;          // variation vs mois précédent (négatif = amélioration)
}

// ─── Colonnes Kanban (pour l'agrégation header) ───────────────────────────

interface KanbanColumnSummary {
  stage: DealStage;
  label: string;
  dealCount: number;
  totalAmount: number;
}

// ─── Payload déplacement drag-and-drop ───────────────────────────────────

interface DealMovePayload {
  dealId: string;
  fromStage: DealStage;
  toStage: DealStage;
  newPosition: number;               // position dans la colonne destination
}

// ─── Props composants ─────────────────────────────────────────────────────

interface KanbanBoardProps {
  deals: DealCard[];
  onDealMove: (payload: DealMovePayload) => Promise<void>;
  onDealClick: (dealId: string) => void;
  isLoading?: boolean;
}

interface KanbanColumnProps {
  stage: DealStage;
  deals: DealCard[];
  isOver: boolean;                   // drag-over state
}

interface DraggableDealCardProps {
  deal: DealCard;
  isDragging?: boolean;
  onClick: (dealId: string) => void;
}

interface PipelineMetricsProps {
  metrics: PipelineMetrics;
  isLoading?: boolean;
}

interface DealDetailDrawerProps {
  dealId: string | null;
  isOpen: boolean;
  onClose: () => void;
}
```

---

## Données (tables SQL sources + query)

### Tables source

```sql
CREATE TABLE deals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage                TEXT NOT NULL DEFAULT 'QUALIFIE',
  company_name         TEXT NOT NULL,
  contact_name         TEXT,
  contact_title        TEXT,
  amount               BIGINT NOT NULL DEFAULT 0,
  description          TEXT,
  probability          NUMERIC(4,3),
  expected_close_date  DATE,
  last_action_date     TIMESTAMPTZ,
  last_action_description TEXT,
  assigned_to          TEXT,
  tags                 TEXT[] DEFAULT '{}',
  column_position      INTEGER DEFAULT 0,
  prospect_id          UUID REFERENCES prospects(id),
  tender_id            UUID REFERENCES tenders(id),
  stage_updated_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE deal_timeline_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  label           TEXT NOT NULL,
  performed_by    TEXT DEFAULT 'SYSTEM',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE deal_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  author_name     TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Query: tous les deals pour le Kanban

```sql
SELECT
  d.id,
  d.stage,
  d.company_name,
  d.contact_name,
  d.contact_title,
  d.amount,
  d.column_position,
  d.prospect_id,
  d.tender_id,
  d.stage_updated_at,
  d.created_at,
  -- Jours sans activité
  EXTRACT(EPOCH FROM NOW() - COALESCE(d.last_action_date, d.created_at)) / 86400
    AS days_since_last_action,
  -- Indicateur chaleur calculé
  CASE
    WHEN EXTRACT(EPOCH FROM NOW() - COALESCE(d.last_action_date, d.created_at)) / 86400 < 3
      THEN 'HOT'
    WHEN EXTRACT(EPOCH FROM NOW() - COALESCE(d.last_action_date, d.created_at)) / 86400 < 7
      THEN 'WARM'
    WHEN EXTRACT(EPOCH FROM NOW() - COALESCE(d.last_action_date, d.created_at)) / 86400 < 21
      THEN 'COLD'
    ELSE 'STALE'
  END AS heat
FROM deals d
WHERE d.stage != 'PERDU' OR d.stage_updated_at >= NOW() - INTERVAL '30 days'
ORDER BY d.stage, d.column_position, d.amount DESC;
```

### Query: métriques pipeline

```sql
SELECT
  -- Total pipeline (hors PERDU)
  COALESCE(SUM(amount) FILTER (WHERE stage NOT IN ('PERDU', 'SIGNE')), 0)
    AS total_pipeline_amount,
  -- Nombre de deals par étape
  COUNT(*) FILTER (WHERE stage = 'QUALIFIE')      AS qualifie_count,
  COUNT(*) FILTER (WHERE stage = 'DEVIS')         AS devis_count,
  COUNT(*) FILTER (WHERE stage = 'CONSIDERATION') AS consideration_count,
  COUNT(*) FILTER (WHERE stage = 'NEGOCIATION')   AS negociation_count,
  COUNT(*) FILTER (WHERE stage = 'PRET_SIGNER')   AS pret_signer_count,
  COUNT(*) FILTER (WHERE stage = 'SIGNE')         AS signe_count,
  COUNT(*) FILTER (WHERE stage = 'PERDU')         AS perdu_count,
  -- Taux de succès (30 derniers jours)
  ROUND(
    COUNT(*) FILTER (WHERE stage = 'SIGNE' AND stage_updated_at >= NOW() - INTERVAL '30 days')::numeric
    / NULLIF(
        COUNT(*) FILTER (WHERE stage IN ('SIGNE', 'PERDU')
                         AND stage_updated_at >= NOW() - INTERVAL '30 days'), 0
      ) * 100,
    1
  ) AS win_rate_30d
FROM deals;

-- Vélocité (CA progressé par jour, 30j glissants)
SELECT
  COALESCE(SUM(amount), 0) / 30.0 AS velocity_per_day
FROM deal_timeline_events dte
JOIN deals d ON d.id = dte.deal_id
WHERE dte.type = 'STAGE_CHANGED'
  AND dte.created_at >= NOW() - INTERVAL '30 days';

-- Durée moyenne cycle complet
SELECT
  ROUND(AVG(
    EXTRACT(EPOCH FROM stage_updated_at - created_at) / 86400
  ), 0) AS avg_cycle_days
FROM deals
WHERE stage = 'SIGNE'
  AND stage_updated_at >= NOW() - INTERVAL '90 days';
```

### Query: détail d'un deal

```sql
SELECT d.*
FROM deals d
WHERE d.id = $deal_id;

-- Timeline
SELECT * FROM deal_timeline_events
WHERE deal_id = $deal_id
ORDER BY created_at DESC;

-- Notes
SELECT * FROM deal_notes
WHERE deal_id = $deal_id
ORDER BY created_at DESC;
```

### Query: mise à jour après drag-and-drop

```sql
-- 1. Mise à jour du stage du deal déplacé
UPDATE deals
SET stage           = $new_stage,
    stage_updated_at = NOW(),
    column_position  = $new_position,
    updated_at       = NOW()
WHERE id = $deal_id;

-- 2. Réordonnancement des deals dans la colonne destination
UPDATE deals
SET column_position = column_position + 1
WHERE stage = $new_stage
  AND column_position >= $new_position
  AND id != $deal_id;

-- 3. Création d'un événement timeline
INSERT INTO deal_timeline_events (deal_id, type, label, performed_by)
VALUES (
  $deal_id,
  'STAGE_CHANGED',
  $from_stage || ' → ' || $new_stage,
  $user_name
);
```

---

## Interactions Utilisateur

| Interaction | Comportement |
|---|---|
| Drag card vers une autre colonne | Optimistic update immédiat → PATCH /api/deals/:id/stage |
| Drop dans la même colonne | Réordonnancement de la position dans la colonne |
| Clic sur une DealCard | Ouvre DealDetailDrawer (slide-over depuis la droite) |
| Clic "+ Nouveau deal" | Ouvre formulaire création (modal ou page dédiée) |
| Hover HeatIndicator STALE | Tooltip "Inactif depuis X jours — action requise" |
| Clic companyName dans la card | Navigation vers /prospects/:prospectId si lié |
| Scroll horizontal | Kanban board scrollable horizontalement sur petits écrans |
| Resize colonne | Non supporté (colonnes de largeur fixe) |
| Double-clic montant | Inline edit du montant |

---

## Temps Réel (SSE events listened)

Point de connexion: `GET /api/sse/deals`

```typescript
// Nouveau deal créé — apparaît dans la colonne QUALIFIÉ
interface DealCreatedPayload {
  type: 'deal_created';
  data: DealCard;
}

// Deal déplacé par un autre utilisateur — mise à jour optimiste inverse
interface DealMovedPayload {
  type: 'deal_stage_changed';
  data: {
    dealId: string;
    fromStage: DealStage;
    toStage: DealStage;
    movedBy: string;
  };
}

// Deal heat changed (recalcul automatique)
interface DealHeatChangedPayload {
  type: 'deal_heat_changed';
  data: {
    dealId: string;
    previousHeat: DealHeat;
    newHeat: DealHeat;
  };
}
```

---

## Filtres & Recherche

La vue Kanban n'a pas de filtres complexes par défaut. Filtres simples disponibles via toolbar:

| Filtre | Type | Comportement |
|---|---|---|
| Recherche | Input | Filtre les cards par companyName côté client |
| Assigné à | Select | Filtre par assignedTo |
| Heat | Chips | Filtre par indicateur de chaleur |
| Montant min | Input | Masque les cards sous le seuil |

---

## Actions Disponibles

| Action | Endpoint | Méthode |
|---|---|---|
| Déplacer deal (drag-drop) | /api/deals/:id/stage | PATCH |
| Créer deal | /api/deals | POST |
| Modifier deal | /api/deals/:id | PATCH |
| Ajouter note | /api/deals/:id/notes | POST |
| Archiver deal perdu | /api/deals/:id/archive | PATCH |
| Exporter CSV pipeline | /api/deals/export | POST |
| Déclencher action (call/email) | /api/deals/:id/actions | POST |

---

## Edge Cases

| Cas | Comportement attendu |
|---|---|
| Drag vers colonne PERDU | Dialog confirmation "Êtes-vous sûr de clore ce deal comme perdu ?" |
| Drag vers SIGNE | Dialog confirmation + champ "Date de signature" |
| Colonne vide | Affiche zone "Déposer ici" avec outline en pointillés |
| > 20 deals dans une colonne | Virtualisation verticale dans la colonne, scroll interne |
| amount = 0 | Affiche "Montant NC" en grisé |
| Conflit SSE (deux users déplacent en même temps) | Dernier write gagne; toast "Ce deal a été déplacé par [user]" |
| Perte connexion réseau pendant drag | Rollback optimiste + toast erreur |
| Deal STALE (> 21j) | Bordure de card en rouge + badge "Inactif" visible |
| Pipeline vide | Kanban avec colonnes vides + CTA "+ Créer votre premier deal" |
| Montant très grand (> 1M€) | Formaté en "1,2 M€" |

---

## Dépendances (npm packages used)

```json
{
  "@hello-pangea/dnd": "^16.x",
  "@tanstack/react-query": "^5.x",
  "date-fns": "^3.x",
  "lucide-react": "^0.x",
  "clsx": "^2.x",
  "@radix-ui/react-dialog": "^1.x",
  "@radix-ui/react-scroll-area": "^1.x"
}
```

Notes:
- `@hello-pangea/dnd` est le fork maintenu de `react-beautiful-dnd` — API identique, compatible React 18+
- Pas de librairie Kanban externe — le layout est du CSS Grid/Flex custom
- L'optimistic update est géré via React Query `useMutation` + `onMutate` / `onError` rollback

---

## Implémentation Priorité

**Priorité: P2 — Vue commerciale importante mais moins urgente que V3/V4**

### Ordre de développement

```
1. Types TypeScript deals                            [1h]
2. Tables SQL + migrations                           [1h]
3. Query deals Kanban + métriques + API routes       [2h]
4. KanbanColumn composant (layout CSS)               [2h]
5. DraggableDealCard composant                       [2h]
6. @hello-pangea/dnd intégration + DragDropContext   [2h]
7. Optimistic update + rollback sur PATCH stage      [2h]
8. PipelineMetrics composant                         [1h]
9. DealDetailDrawer (slide-over)                     [2h]
10. SSE integration (deal_created, deal_moved)       [1h]
11. Filtres légers                                   [1h]
```

**Estimation totale: ~17h dev**

### Fichiers à créer

```
src/app/(dashboard)/deals/page.tsx
src/components/deals/KanbanBoard.tsx
src/components/deals/KanbanColumn.tsx
src/components/deals/DraggableDealCard.tsx
src/components/deals/HeatIndicator.tsx
src/components/deals/NextActionBadge.tsx
src/components/deals/PipelineMetrics.tsx
src/components/deals/DealDetailDrawer.tsx
src/hooks/useDeals.ts
src/hooks/usePipelineMetrics.ts
src/types/deals.ts
src/app/api/deals/route.ts
src/app/api/deals/[id]/route.ts
src/app/api/deals/[id]/stage/route.ts
src/app/api/deals/[id]/notes/route.ts
src/app/api/deals/export/route.ts
src/app/api/sse/deals/route.ts
```
