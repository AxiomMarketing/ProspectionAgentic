# V3 Prospects CRM

## Objectif

Vue CRM centrale pour la gestion des prospects B2B. Tableau avec tri/filtre/recherche avancés via TanStack Table. Chaque prospect est cliquable pour ouvrir une fiche détaillée avec scoring, signaux commerciaux, timeline d'interactions, et actions manuelles. Permet à l'équipe commerciale de travailler avec les données enrichies par les agents.

---

## Wireframe (ASCII mockup)

### Vue liste

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ AXIOM — Prospects CRM                           [+ Nouveau] [Export CSV]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [🔍 Rechercher entreprise, contact, SIRET...]          [Filtres ▼] [↕]   │
│                                                                             │
│  Catégorie: [Tous ▼]  Segment: [Tous ▼]  Période: [Tous ▼]               │
│  Statut: [○Tous ●HOT ○WARM ○COLD ○DISQUALIFIÉ]                            │
│                                                                             │
│  1 247 prospects  ·  312 HOT  ·  489 WARM  ·  446 COLD                    │
│                                                                             │
│  ┌──────┬────────┬──────────────────┬──────────────────┬──────────┬──────┐ │
│  │Score↓│ Statut │ Entreprise       │ Contact          │ Segment  │Signal│ │
│  ├──────┼────────┼──────────────────┼──────────────────┼──────────┼──────┤ │
│  │  94  │ 🔴HOT  │ Nexans SA        │ J. Martin, DAF   │ Grand c. │ ★★★★ │ │
│  │  91  │ 🔴HOT  │ Eiffage Énergie  │ S. Dupont, DSI   │ ETI      │ ★★★☆ │ │
│  │  87  │ 🔴HOT  │ Enedis Région SE │ —                │ Public   │ ★★★★ │ │
│  │  82  │ 🟡WARM │ Schneider Elect. │ A. Bernard, DG   │ Grand c. │ ★★☆☆ │ │
│  │  78  │ 🟡WARM │ Bouygues Télécom │ M. Leblanc, CTO  │ Grand c. │ ★★★☆ │ │
│  │  71  │ 🟡WARM │ Orange Business  │ C. Petit, Achats │ Grand c. │ ★★☆☆ │ │
│  │  65  │ 🔵COLD │ La Poste Group   │ —                │ Public   │ ★☆☆☆ │ │
│  │  ...  │       │                  │                  │          │      │ │
│  └──────┴────────┴──────────────────┴──────────────────┴──────────┴──────┘ │
│                                                                             │
│  [← Précédent]  Page 1 / 63  [Suivant →]     Lignes par page: [20 ▼]     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Vue détail prospect (ProspectDetailPage)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Retour                    Nexans SA          [🔴 HOT]  Score: 94/100     │
├──────────────────────────────┬──────────────────────────────────────────────┤
│  INFORMATIONS CONTACT        │  SCORE BREAKDOWN                            │
│  ─────────────────────────── │  ─────────────────────────────────────────  │
│  Jean Martin                 │  Signaux web        ████████████░  85/100  │
│  Directeur Administratif     │  Technologie        █████████████  90/100  │
│  j.martin@nexans.com         │  Taille entreprise  ████████░░░░░  70/100  │
│  +33 1 23 45 67 89           │  Signaux d'achat    ██████████░░░  80/100  │
│  ─────────────────────────── │                                             │
│  INFORMATIONS ENTREPRISE     │  Score global: 94/100                      │
│  ─────────────────────────── │  Tendance: ↑ +12 pts cette semaine         │
│  Nexans SA                   │                                             │
│  SIRET: 393 066 284 00103    │  IMPACT ESTIMÉ                             │
│  CA: 6.8 Md€                 │  ─────────────────────────────────────────  │
│  Effectif: 26 000            │  Deal potentiel: 280 000 — 450 000€       │
│  Secteur: Câbles & Énergie   │  Probabilité: 34%                          │
│  Adresse: 4 allée de l'Arche │  Expected value: ~129 400€                 │
│  92400 Courbevoie            │  Délai estimé: 60–90 jours                 │
│                              │                                             │
│  PROFIL TECHNOLOGIQUE        │  ACTIONS MANUELLES                         │
│  ─────────────────────────── │  ─────────────────────────────────────────  │
│  Stack: SAP, Salesforce,     │  [Forcer HOT]  [Disqualifier]              │
│         Azure, Power BI      │  [Override score: ___]  [Ajouter note]     │
│  Signaux: Recrutement BI,    │  [Assigner à: ___]                         │
│           Offres Azure AD    │                                             │
├──────────────────────────────┴──────────────────────────────────────────────┤
│  SIGNAUX DÉTECTÉS                                                           │
│  ───────────────────────────────────────────────────────────────────────── │
│  ★ Offre emploi "Data Engineer Azure"     [il y a 2j]  ████████  Force: 85│
│  ★ Croissance LinkedIn +12%               [il y a 5j]  █████░░░  Force: 60│
│  ★ Appel d'offres DSI Q2                  [il y a 8j]  ███████░  Force: 72│
│  ☆ Conférence CloudExpo mention           [il y a 15j] ████░░░░  Force: 45│
│                                                                             │
│  TIMELINE INTERACTIONS                                                      │
│  ───────────────────────────────────────────────────────────────────────── │
│  14/03 ● Email envoyé (objet: "Démonstration Axiom Platform")              │
│  10/03 ● Prospect créé (source: INPI scraping)                             │
│  10/03 ● Enrichissement: LinkedIn, Societe.com, BuiltWith                  │
│  10/03 ● Score initial calculé: 82/100                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Composants React

```
ProspectsPage (page)
├── ProspectFilters
│   ├── SearchInput
│   ├── CategorySelect
│   ├── SegmentSelect
│   ├── PeriodSelect
│   └── StatusFilterGroup
├── ProspectStatsBar (compteurs HOT/WARM/COLD)
├── ProspectTable (TanStack Table)
│   ├── ScoreCell
│   ├── StatusBadgeCell
│   ├── CompanyCell
│   ├── ContactCell
│   ├── SegmentCell
│   └── SignalStrengthCell
└── Pagination

ProspectDetailPage (page)
├── ProspectHeader (nom, badge statut, score global)
├── ContactInfo
├── CompanyInfo
├── TechProfile
├── ScoreBreakdown (4 barres horizontales)
├── SignalList
│   └── SignalRow × n (avec barre de decay)
├── ImpactEstimate
├── InteractionTimeline
│   └── InteractionRow × n
└── ManualActions
    ├── ForceHotButton
    ├── DisqualifyButton
    ├── ScoreOverrideInput
    └── AddNoteForm
```

### Signatures des composants

```tsx
export default function ProspectsPage(): JSX.Element
export default function ProspectDetailPage({ params }: { params: { id: string } }): JSX.Element

export function ProspectTable({
  data,
  sorting,
  onSortingChange,
  pagination,
  onPaginationChange,
}: ProspectTableProps): JSX.Element

export function ScoreBreakdown({ breakdown }: { breakdown: ScoreBreakdown }): JSX.Element
export function SignalList({ signals }: { signals: Signal[] }): JSX.Element
export function SignalRow({ signal }: { signal: Signal }): JSX.Element
export function InteractionTimeline({ interactions }: { interactions: Interaction[] }): JSX.Element
export function ManualActions({ prospectId, onAction }: ManualActionsProps): JSX.Element
export function ImpactEstimate({ estimate }: { estimate: ImpactEstimate }): JSX.Element
```

---

## Props & Types (TypeScript interfaces)

```typescript
// ─── Statuts prospect ────────────────────────────────────────────────────

type ProspectStatus = 'HOT' | 'WARM' | 'COLD' | 'DISQUALIFIED';

type ProspectSegment =
  | 'GRAND_COMPTE'       // CA > 500M€
  | 'ETI'                // CA 50–500M€
  | 'PME'                // CA < 50M€
  | 'PUBLIC'             // Collectivités, établissements publics
  | 'STARTUP';

type ProspectCategory =
  | 'ENERGIE'
  | 'TELECOM'
  | 'INDUSTRIE'
  | 'SERVICES'
  | 'SANTE'
  | 'TRANSPORT'
  | 'FINANCE'
  | 'OTHER';

// ─── Prospect (vue liste) ─────────────────────────────────────────────────

interface ProspectListItem {
  id: string;
  score: number;                     // 0–100
  status: ProspectStatus;
  companyName: string;
  contactName: string | null;
  contactTitle: string | null;
  segment: ProspectSegment;
  category: ProspectCategory;
  signalStrength: number;            // 0–4 étoiles
  latestSignalDate: string | null;   // ISO date
  createdAt: string;
}

// ─── Prospect (vue détail) ────────────────────────────────────────────────

interface ProspectDetail {
  id: string;
  score: number;
  status: ProspectStatus;
  segment: ProspectSegment;
  category: ProspectCategory;
  scoreBreakdown: ScoreBreakdown;
  contact: ContactInfo | null;
  company: CompanyInfo;
  techProfile: TechProfile;
  signals: Signal[];
  interactions: Interaction[];
  impactEstimate: ImpactEstimate | null;
  assignedTo: string | null;
  notes: ProspectNote[];
  createdAt: string;
  updatedAt: string;
}

// ─── Score breakdown ──────────────────────────────────────────────────────

interface ScoreBreakdown {
  webSignals: number;               // 0–100
  technology: number;               // 0–100
  companySize: number;              // 0–100
  purchaseSignals: number;          // 0–100
  // Pondération: webSignals×0.3 + technology×0.25 + companySize×0.2 + purchaseSignals×0.25
  globalScore: number;              // score final pondéré
  trendDelta: number;               // +/- par rapport à la semaine dernière
  lastScoredAt: string;
}

// ─── Contact ──────────────────────────────────────────────────────────────

interface ContactInfo {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  department: string | null;
}

// ─── Entreprise ───────────────────────────────────────────────────────────

interface CompanyInfo {
  name: string;
  siret: string | null;
  siren: string | null;
  revenue: number | null;           // en euros
  headcount: number | null;
  sector: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  sourceUrl: string | null;
}

// ─── Profil technologique ─────────────────────────────────────────────────

interface TechProfile {
  detectedStack: string[];          // ex: ['SAP', 'Salesforce', 'Azure']
  recruitmentSignals: string[];     // ex: ['Data Engineer', 'Cloud Architect']
  cloudProvider: string | null;     // ex: 'Azure', 'AWS', 'GCP'
  dataMaturity: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  lastAnalyzedAt: string | null;
}

// ─── Signaux commerciaux ──────────────────────────────────────────────────

type SignalType =
  | 'JOB_POSTING'          // offre d'emploi détectée
  | 'LINKEDIN_GROWTH'      // croissance LinkedIn
  | 'TENDER_MATCH'         // appel d'offres correspondant
  | 'CONFERENCE_MENTION'   // mention dans conférence
  | 'TECH_ADOPTION'        // adoption d'une technologie cible
  | 'NEWS_MENTION'         // mention dans la presse
  | 'BUDGET_ANNOUNCEMENT'; // annonce budgétaire

interface Signal {
  id: string;
  type: SignalType;
  label: string;
  detectedAt: string;              // ISO datetime
  strength: number;                // 0–100 (force du signal)
  decayedStrength: number;         // force après decay temporel
  sourceUrl: string | null;
  rawData: Record<string, unknown>;
}

// ─── Interactions ─────────────────────────────────────────────────────────

type InteractionType =
  | 'EMAIL_SENT'
  | 'EMAIL_OPENED'
  | 'EMAIL_REPLIED'
  | 'NOTE_ADDED'
  | 'SCORE_CHANGED'
  | 'STATUS_CHANGED'
  | 'PROSPECT_CREATED'
  | 'ENRICHMENT_RUN';

interface Interaction {
  id: string;
  type: InteractionType;
  label: string;
  details: string | null;
  performedBy: 'SYSTEM' | string;  // 'SYSTEM' = agent, sinon nom utilisateur
  createdAt: string;
}

// ─── Impact estimé ────────────────────────────────────────────────────────

interface ImpactEstimate {
  minDealAmount: number;
  maxDealAmount: number;
  probability: number;             // 0–1
  expectedValue: number;           // probability × avg(min, max)
  estimatedDurationDays: number;
  rationale: string | null;        // texte généré par LLM
}

// ─── Notes ────────────────────────────────────────────────────────────────

interface ProspectNote {
  id: string;
  content: string;
  authorName: string;
  createdAt: string;
}

// ─── Props composants ─────────────────────────────────────────────────────

interface ProspectTableProps {
  data: ProspectListItem[];
  totalCount: number;
  sorting: SortingState;           // TanStack Table SortingState
  onSortingChange: OnChangeFn<SortingState>;
  pagination: PaginationState;     // TanStack Table PaginationState
  onPaginationChange: OnChangeFn<PaginationState>;
  isLoading?: boolean;
}

interface ManualActionsProps {
  prospectId: string;
  currentStatus: ProspectStatus;
  currentScore: number;
  onAction: (action: ManualAction) => Promise<void>;
}

type ManualAction =
  | { type: 'FORCE_HOT' }
  | { type: 'DISQUALIFY'; reason: string }
  | { type: 'OVERRIDE_SCORE'; score: number }
  | { type: 'ADD_NOTE'; content: string }
  | { type: 'ASSIGN'; userId: string };

// ─── Filtres ──────────────────────────────────────────────────────────────

interface ProspectFilters {
  searchQuery: string;
  categories: ProspectCategory[];
  segments: ProspectSegment[];
  statuses: ProspectStatus[];
  periodFrom: string | null;
  periodTo: string | null;
  minScore: number | null;
  maxScore: number | null;
}
```

---

## Données (tables SQL sources + query)

### Tables source

```sql
CREATE TABLE prospects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name    TEXT NOT NULL,
  siret           TEXT,
  siren           TEXT,
  revenue         BIGINT,
  headcount       INTEGER,
  sector          TEXT,
  address         TEXT,
  city            TEXT,
  postal_code     TEXT,
  website_url     TEXT,
  linkedin_url    TEXT,
  source_url      TEXT,
  score           INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'COLD',
  segment         TEXT,
  category        TEXT,
  assigned_to     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  first_name      TEXT,
  last_name       TEXT,
  title           TEXT,
  email           TEXT,
  phone           TEXT,
  linkedin_url    TEXT,
  department      TEXT,
  is_primary      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE score_breakdowns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  web_signals     INTEGER DEFAULT 0,
  technology      INTEGER DEFAULT 0,
  company_size    INTEGER DEFAULT 0,
  purchase_signals INTEGER DEFAULT 0,
  global_score    INTEGER DEFAULT 0,
  trend_delta     INTEGER DEFAULT 0,
  last_scored_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  label           TEXT NOT NULL,
  strength        INTEGER NOT NULL,
  detected_at     TIMESTAMPTZ NOT NULL,
  source_url      TEXT,
  raw_data        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE prospect_interactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  label           TEXT NOT NULL,
  details         TEXT,
  performed_by    TEXT DEFAULT 'SYSTEM',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE prospect_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  author_name     TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE impact_estimates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  min_deal_amount BIGINT,
  max_deal_amount BIGINT,
  probability     NUMERIC(4,3),
  expected_value  BIGINT,
  duration_days   INTEGER,
  rationale       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tech_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  detected_stack  TEXT[] DEFAULT '{}',
  recruitment_signals TEXT[] DEFAULT '{}',
  cloud_provider  TEXT,
  data_maturity   TEXT,
  last_analyzed_at TIMESTAMPTZ
);
```

### Query: liste des prospects avec filtres

```sql
SELECT
  p.id,
  p.score,
  p.status,
  p.company_name,
  c.first_name || ' ' || c.last_name AS contact_name,
  c.title                            AS contact_title,
  p.segment,
  p.category,
  -- Signal strength: nombre de signaux actifs forts (strength > 60), capped à 4
  LEAST(
    (SELECT COUNT(*) FROM signals s
     WHERE s.prospect_id = p.id AND s.strength > 60
     AND s.detected_at > NOW() - INTERVAL '30 days'),
    4
  )::integer                         AS signal_strength,
  (SELECT MAX(detected_at) FROM signals WHERE prospect_id = p.id)
                                     AS latest_signal_date,
  p.created_at
FROM prospects p
LEFT JOIN contacts c ON c.prospect_id = p.id AND c.is_primary = true
WHERE
  ($search IS NULL
    OR p.company_name ILIKE '%' || $search || '%'
    OR c.first_name   ILIKE '%' || $search || '%'
    OR c.last_name    ILIKE '%' || $search || '%'
    OR p.siret        ILIKE '%' || $search || '%')
  AND ($categories IS NULL OR p.category = ANY($categories))
  AND ($segments   IS NULL OR p.segment  = ANY($segments))
  AND ($statuses   IS NULL OR p.status   = ANY($statuses))
  AND ($date_from  IS NULL OR p.created_at >= $date_from)
  AND ($date_to    IS NULL OR p.created_at <= $date_to)
  AND ($min_score  IS NULL OR p.score >= $min_score)
  AND ($max_score  IS NULL OR p.score <= $max_score)
ORDER BY p.score DESC, p.updated_at DESC
LIMIT $limit OFFSET $offset;
```

### Query: détail prospect complet

```sql
-- Prospect + score breakdown + tech profile
SELECT
  p.*,
  sb.web_signals, sb.technology, sb.company_size, sb.purchase_signals,
  sb.global_score, sb.trend_delta, sb.last_scored_at,
  tp.detected_stack, tp.recruitment_signals, tp.cloud_provider,
  tp.data_maturity, tp.last_analyzed_at,
  ie.min_deal_amount, ie.max_deal_amount, ie.probability,
  ie.expected_value, ie.duration_days, ie.rationale
FROM prospects p
LEFT JOIN score_breakdowns sb ON sb.prospect_id = p.id
LEFT JOIN tech_profiles    tp ON tp.prospect_id = p.id
LEFT JOIN impact_estimates ie ON ie.prospect_id = p.id
WHERE p.id = $prospect_id;

-- Contacts
SELECT * FROM contacts WHERE prospect_id = $prospect_id ORDER BY is_primary DESC;

-- Signaux (triés par strength décroissant)
SELECT *,
  -- Decay: strength × exp(-0.05 × jours_depuis_détection)
  ROUND(strength * EXP(-0.05 * EXTRACT(EPOCH FROM NOW() - detected_at) / 86400))
    AS decayed_strength
FROM signals
WHERE prospect_id = $prospect_id
ORDER BY strength DESC;

-- Interactions (timeline)
SELECT * FROM prospect_interactions
WHERE prospect_id = $prospect_id
ORDER BY created_at DESC;

-- Notes
SELECT * FROM prospect_notes
WHERE prospect_id = $prospect_id
ORDER BY created_at DESC;
```

---

## Interactions Utilisateur

| Interaction | Comportement |
|---|---|
| Clic ligne tableau | Navigation vers /prospects/:id |
| Tri colonne (Score, Date, etc.) | Tri côté serveur via re-fetch avec ORDER BY |
| Saisie dans SearchInput | Debounce 300ms → re-fetch |
| Changement filtre Catégorie/Segment/Statut | Re-fetch immédiat |
| Clic "Export CSV" | POST /api/prospects/export → download fichier |
| Clic "Forcer HOT" | Dialog confirmation → PATCH /api/prospects/:id/status |
| Clic "Disqualifier" | Dialog avec champ raison → PATCH /api/prospects/:id/status |
| Override score (input) | Validation 0–100 → PATCH /api/prospects/:id/score |
| Clic "Ajouter note" | Textarea → POST /api/prospects/:id/notes |
| Hover barre SignalRow | Tooltip: force brute, date détection, URL source |
| Clic sur signal source URL | Ouvre URL source dans nouvel onglet |

---

## Temps Réel (SSE events listened)

Point de connexion: `GET /api/sse/prospects`

```typescript
// Prospect rescored — met à jour le score + statut dans la liste
interface ProspectRescored {
  type: 'prospect_rescored';
  data: {
    prospectId: string;
    previousScore: number;
    newScore: number;
    newStatus: ProspectStatus;
  };
}

// Nouveau signal détecté — badge "Nouveau signal" sur la ligne
interface NewSignalDetected {
  type: 'new_signal_detected';
  data: {
    prospectId: string;
    signal: Signal;
  };
}
```

---

## Filtres & Recherche

| Filtre | Type | Options |
|---|---|---|
| Recherche texte | Input | company_name, contact, SIRET (ILIKE) |
| Catégorie | Select multi | 8 catégories sectorielles |
| Segment | Select multi | GRAND_COMPTE / ETI / PME / PUBLIC / STARTUP |
| Statut | Radio group | Tous / HOT / WARM / COLD / DISQUALIFIÉ |
| Période création | Date range | Calendrier custom |
| Score min/max | Slider range | 0–100 |

Persistence: filtres dans URL query params (`?status=HOT&segment=ETI`).

---

## Actions Disponibles

| Action | Endpoint | Méthode |
|---|---|---|
| Override statut vers HOT | /api/prospects/:id/status | PATCH |
| Disqualifier | /api/prospects/:id/status | PATCH |
| Override score | /api/prospects/:id/score | PATCH |
| Ajouter note | /api/prospects/:id/notes | POST |
| Assigner à un utilisateur | /api/prospects/:id/assign | PATCH |
| Déclencher re-enrichissement | /api/prospects/:id/enrich | POST |
| Exporter CSV (liste filtrée) | /api/prospects/export | POST |
| Créer manuellement | /api/prospects | POST |

---

## Edge Cases

| Cas | Comportement attendu |
|---|---|
| contact_name = null | Affiche "—" dans la colonne Contact |
| score = 0 (jamais scoré) | Badge gris "N/A" au lieu du score |
| Tous les signaux expirés (> 90j) | SignalList affiche "Aucun signal actif" avec dernière date |
| revenue = null | Affiche "NC" dans CompanyInfo |
| Override score invalide (hors 0–100) | Validation inline + blocage soumission |
| Disqualification sans raison | Champ raison obligatoire dans le dialog |
| Export > 10 000 lignes | Warning: "Export limité à 10 000 lignes" + génération asynchrone avec lien de téléchargement |
| Prospect sans contact | ContactInfo affiche "Aucun contact renseigné" + bouton "Ajouter contact" |
| Score tie (plusieurs prospects mêmes score) | Tri secondaire par `updated_at DESC` |
| Signal strength decay → 0 | Signal affiché en grisé avec label "(expiré)" |

---

## Dépendances (npm packages used)

```json
{
  "@tanstack/react-table": "^8.x",
  "@tanstack/react-query": "^5.x",
  "date-fns": "^3.x",
  "lucide-react": "^0.x",
  "clsx": "^2.x",
  "@radix-ui/react-dialog": "^1.x",
  "@radix-ui/react-select": "^2.x",
  "@radix-ui/react-slider": "^1.x",
  "papaparse": "^5.x"
}
```

---

## Implémentation Priorité

**Priorité: P1 — Vue métier principale pour l'équipe commerciale**

### Ordre de développement

```
1. Types TypeScript prospects (tous les interfaces)    [1h]
2. Tables SQL + migrations                             [2h]
3. Query liste + API GET /api/prospects                [2h]
4. ProspectTable (TanStack Table) + colonnes           [3h]
5. ProspectFilters composant                           [2h]
6. Query détail + API GET /api/prospects/:id           [1h]
7. ProspectDetailPage layout + composants              [3h]
8. ScoreBreakdown + SignalList + decay visualization   [2h]
9. InteractionTimeline                                 [1h]
10. ManualActions + API endpoints PATCH/POST           [2h]
11. Export CSV                                         [1h]
12. SSE integration                                    [1h]
```

**Estimation totale: ~21h dev**

### Fichiers à créer

```
src/app/(dashboard)/prospects/page.tsx
src/app/(dashboard)/prospects/[id]/page.tsx
src/components/prospects/ProspectTable.tsx
src/components/prospects/ProspectFilters.tsx
src/components/prospects/ProspectStatsBar.tsx
src/components/prospects/StatusBadge.tsx
src/components/prospects/ScoreBreakdown.tsx
src/components/prospects/SignalList.tsx
src/components/prospects/SignalRow.tsx
src/components/prospects/InteractionTimeline.tsx
src/components/prospects/ManualActions.tsx
src/components/prospects/ImpactEstimate.tsx
src/components/prospects/ContactInfo.tsx
src/components/prospects/CompanyInfo.tsx
src/components/prospects/TechProfile.tsx
src/hooks/useProspects.ts
src/hooks/useProspectDetail.ts
src/types/prospects.ts
src/app/api/prospects/route.ts
src/app/api/prospects/[id]/route.ts
src/app/api/prospects/[id]/status/route.ts
src/app/api/prospects/[id]/score/route.ts
src/app/api/prospects/[id]/notes/route.ts
src/app/api/prospects/export/route.ts
src/app/api/sse/prospects/route.ts
```
