# V4 Marchés Publics

## Objectif

Vue dédiée au suivi du pipeline de marchés publics (appels d'offres). Tableau de pilotage avec compteurs par étape pipeline, tri par score et deadline. Chaque marché est cliquable pour une fiche détaillée incluant le scoring multicritères, la checklist de préparation, le rétro-planning et les documents DCE. Permet à l'équipe de piloter la réponse aux appels d'offres de la détection à la soumission.

---

## Wireframe (ASCII mockup)

### Vue liste

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ AXIOM — Marchés Publics                         [+ Créer]  [Export CSV]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PIPELINE                                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │Détectés  │ │Analysés  │ │   GO     │ │Prépa.    │ │  Soumis  │        │
│  │   87     │ │   54     │ │   18     │ │    7     │ │    3     │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│  ┌──────────┐                                                               │
│  │  Gagnés  │   Total pipeline: 4.2 M€    Taux succès: 38%                │
│  │    1     │                                                               │
│  └──────────┘                                                               │
│                                                                             │
│  [🔍 Rechercher...]  Statut: [Tous ▼]  Période: [Tous ▼]  [Filtres +]   │
│                                                                             │
│  ┌──────┬──────────┬──────────────────────┬────────────────┬────────┬────┐ │
│  │Score↓│ Décision │ Acheteur             │ Objet          │Montant │  J │ │
│  ├──────┼──────────┼──────────────────────┼────────────────┼────────┼────┤ │
│  │  84  │ ✅ GO    │ Enedis (Rég. SE)     │ SI Maintenance │ 280k€  │ 12 │ │
│  │  79  │ ✅ GO    │ SNCF Réseau          │ Infra data     │ 520k€  │ 18 │ │
│  │  74  │ 🟡 POSSI.│ Ville de Lyon        │ Smart city BI  │ 150k€  │  5 │ │
│  │  71  │ ✅ GO    │ ARS Île-de-France    │ SI Hospitalier │ 340k€  │ 22 │ │
│  │  65  │ 🟡 POSSI.│ CD Bouches-du-Rhône │ Infra réseau   │  95k€  │ 30 │ │
│  │  41  │ ❌ NO-GO │ Commune Pontoise     │ Logiciel RH    │  45k€  │ 45 │ │
│  │ ...  │         │                      │                │        │    │ │
│  └──────┴──────────┴──────────────────────┴────────────────┴────────┴────┘ │
│                                                                             │
│  [← Précédent]  Page 1 / 9  [Suivant →]     Lignes par page: [20 ▼]      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Vue détail marché (TenderDetailPage)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Retour    Enedis — SI Maintenance Réseau    [✅ GO]  Score: 84/100  [⚙]  │
├──────────────────────────┬──────────────────────────────────────────────────┤
│  INFORMATIONS GÉNÉRALES  │  SCORING DÉTAILLÉ                               │
│  ──────────────────────  │  ─────────────────────────────────────────────  │
│  Référence: DCE-2024-442 │  Alignement métier    ████████████░  88/100    │
│  Acheteur: Enedis        │  Faisabilité tech.    ███████████░░  82/100    │
│  Objet: SI Maintenance   │  Taille de marché     █████████░░░░  75/100    │
│  Type: Marché de service │  Délai de réponse     ████████████░  90/100    │
│  Procédure: AO ouvert    │  Concurrence estimée  █████████░░░░  70/100    │
│  Montant: 280 000€       │  Historique acheteur  ████████░░░░░  65/100    │
│  Deadline: 04/04/2026    │  Rentabilité estimée  ██████████░░░  80/100    │
│  Statut: EN PRÉPARATION  │  ─────────────────────────────────────────────  │
│  Source: BOAMP           │  Score global: 84/100                          │
│  URL: [↗ Consulter DCE]  │                                                 │
│                          │  VALEUR ATTENDUE                               │
│                          │  ─────────────────────────────────────────────  │
│                          │  Probabilité de gagner: 42%                    │
│                          │  Montant marché: 280 000€                      │
│                          │  Expected value: ~117 600€                     │
├──────────────────────────┴──────────────────────────────────────────────────┤
│  PROGRESSION PRÉPARATION                              7/9 tâches complètes │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ✅ 9a. Téléchargement DCE                           [02/04]               │
│  ✅ 9b. Analyse des exigences extraites              [03/04]               │
│  ✅ 9c. Vérification critères d'éligibilité          [03/04]               │
│  ✅ 9d. Constitution équipe projet                   [03/04]               │
│  ✅ 9e. Rédaction mémoire technique                  [En cours]            │
│  ⏳ 9f. Compilation pièces administratives           [À faire]             │
│  ⏳ 9g. Révision finale et soumission                [À faire]             │
│  (+ 2 tâches optionnelles cachées)                                         │
│                                                                             │
│  RÉTRO-PLANNING                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ──●────────●──────────●──────────────────●──────────●                    │
│  Détecté  DCE reçu  Analyse          Rédaction   Deadline                  │
│  28/03    29/03     30/03             03/04       04/04                     │
│                                                                             │
│  DOCUMENTS DCE                        EXIGENCES EXTRAITES                  │
│  ─────────────────────                ──────────────────────────────────── │
│  📄 CCTP.pdf              [↓] [👁]   • Cert. ISO 27001 obligatoire        │
│  📄 RC.pdf                [↓] [👁]   • Référence projet SI similaire       │
│  📄 AE.docx               [↓] [👁]   • Équipe minimum 3 consultants        │
│  📄 DPGF.xlsx             [↓] [👁]   • Garantie 2 ans sur livrables       │
│  📄 Règlement_consul.pdf  [↓] [👁]   • Assurance RC Pro 2M€ minimum       │
│                                                                             │
│  ACTIONS                                                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  [✅ Valider GO]  [❌ Forcer NO-GO]  [👤 Assigner équipe]  [📝 Note]      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Composants React

```
MarchesPublicsPage (page)
├── PipelineCounters
│   └── PipelineStageCounter × 6
├── TenderFilters
│   ├── TenderSearchInput
│   ├── StatusFilterSelect
│   └── PeriodSelect
├── TenderTable (TanStack Table)
│   ├── ScoreCell
│   ├── DecisionBadgeCell
│   ├── AcheteurCell
│   ├── ObjetCell
│   ├── MontantCell
│   └── DeadlineCountdownCell
└── Pagination

TenderDetailPage (page)
├── TenderDetailHeader
├── TenderGeneralInfo
├── ScoringBreakdown (7 barres + expected value)
├── PreparationProgress
│   └── ChecklistItem × 9
├── Retroplanning (timeline horizontale)
├── DocumentsDCE
│   └── DocumentRow × n
├── ExigencesExtraites
│   └── RequirementItem × n
└── ManualActions
    ├── ValidateGOButton
    ├── ForceNOGOButton
    ├── AssignTeamSelect
    └── AddNoteButton
```

### Signatures des composants

```tsx
export default function MarchesPublicsPage(): JSX.Element
export default function TenderDetailPage({ params }: { params: { id: string } }): JSX.Element

export function PipelineCounters({ counts }: PipelineCountersProps): JSX.Element

export function TenderTable({
  data,
  sorting,
  onSortingChange,
  pagination,
  onPaginationChange,
}: TenderTableProps): JSX.Element

export function DecisionBadge({ decision }: { decision: TenderDecision }): JSX.Element
export function DeadlineCountdown({ deadlineDate }: { deadlineDate: string }): JSX.Element

export function ScoringBreakdown({ breakdown }: { breakdown: TenderScoreBreakdown }): JSX.Element
export function PreparationProgress({ tasks }: { tasks: PreparationTask[] }): JSX.Element
export function Retroplanning({ milestones }: { milestones: Milestone[] }): JSX.Element
export function DocumentsDCE({ documents }: { documents: DCEDocument[] }): JSX.Element
export function ExigencesExtraites({ requirements }: { requirements: Requirement[] }): JSX.Element
export function TenderManualActions({ tenderId, onAction }: TenderManualActionsProps): JSX.Element
```

---

## Props & Types (TypeScript interfaces)

```typescript
// ─── Statuts et décisions ─────────────────────────────────────────────────

type TenderDecision = 'GO' | 'POSSIBLE' | 'NO_GO' | 'PENDING';

type TenderStatus =
  | 'DETECTED'          // détecté, pas encore analysé
  | 'ANALYZED'          // analysé, décision prise
  | 'IN_PREPARATION'    // en cours de préparation du dossier
  | 'SUBMITTED'         // dossier soumis
  | 'WON'               // marché gagné
  | 'LOST'              // marché perdu
  | 'CANCELLED';        // appel d'offres annulé

type TenderProcedure =
  | 'OPEN'              // Appel d'offres ouvert
  | 'RESTRICTED'        // Appel d'offres restreint
  | 'NEGOCIATED'        // Procédure négociée
  | 'MARCHE_SIMPLE'     // Marché de gré à gré simplifié
  | 'CONCOURS';

// ─── Marché (vue liste) ───────────────────────────────────────────────────

interface TenderListItem {
  id: string;
  score: number;
  decision: TenderDecision;
  status: TenderStatus;
  reference: string;                // ex: "DCE-2024-442"
  acheteur: string;                 // nom de l'acheteur public
  objet: string;                    // objet du marché
  montant: number | null;           // montant estimé en euros
  deadline: string;                 // ISO date de la deadline de soumission
  daysUntilDeadline: number;        // calculé
  source: string;                   // ex: "BOAMP", "PLACE", "AWS"
  createdAt: string;
}

// ─── Marché (vue détail) ──────────────────────────────────────────────────

interface TenderDetail {
  id: string;
  reference: string;
  acheteur: string;
  objet: string;
  type: string;                     // ex: "Marché de service"
  procedure: TenderProcedure;
  montant: number | null;
  deadline: string;
  status: TenderStatus;
  decision: TenderDecision;
  score: number;
  scoreBreakdown: TenderScoreBreakdown;
  preparationTasks: PreparationTask[];
  milestones: Milestone[];
  documents: DCEDocument[];
  requirements: Requirement[];
  assignedTeam: string[];           // noms des membres assignés
  notes: TenderNote[];
  sourceUrl: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Score breakdown (7 critères) ────────────────────────────────────────

interface TenderScoreBreakdown {
  alignementMetier: number;         // 0–100
  faisabiliteTech: number;          // 0–100
  tailleMarche: number;             // 0–100
  delaiReponse: number;             // 0–100
  concurrenceEstimee: number;       // 0–100
  historiqueAcheteur: number;       // 0–100
  rentabiliteEstimee: number;       // 0–100
  globalScore: number;              // moyenne pondérée
  // Pondérations: alignement×0.20, faisabilité×0.18, taille×0.12,
  //               délai×0.12, concurrence×0.15, historique×0.10, rentabilité×0.13
  winProbability: number;           // 0–1 — estimation
  expectedValue: number;            // winProbability × montant
}

// ─── Checklist préparation (9 étapes 9a → 9g + 2 optionnelles) ──────────

type TaskStatus = 'DONE' | 'IN_PROGRESS' | 'TODO' | 'BLOCKED' | 'SKIPPED';

interface PreparationTask {
  id: string;
  code: string;                     // ex: "9a", "9b", ..., "9g"
  label: string;
  status: TaskStatus;
  completedAt: string | null;
  assignedTo: string | null;
  notes: string | null;
  isOptional: boolean;
}

const PREPARATION_TASKS: Pick<PreparationTask, 'code' | 'label' | 'isOptional'>[] = [
  { code: '9a', label: 'Téléchargement DCE',                      isOptional: false },
  { code: '9b', label: 'Analyse des exigences extraites',          isOptional: false },
  { code: '9c', label: 'Vérification critères d\'éligibilité',     isOptional: false },
  { code: '9d', label: 'Constitution équipe projet',               isOptional: false },
  { code: '9e', label: 'Rédaction mémoire technique',              isOptional: false },
  { code: '9f', label: 'Compilation pièces administratives',       isOptional: false },
  { code: '9g', label: 'Révision finale et soumission',            isOptional: false },
  { code: '9h', label: 'Relance acheteur post-soumission',         isOptional: true  },
  { code: '9i', label: 'Analyse résultat et retour d\'expérience', isOptional: true  },
];

// ─── Rétro-planning ───────────────────────────────────────────────────────

interface Milestone {
  id: string;
  label: string;
  date: string;                     // ISO date
  type: 'DETECTED' | 'DCE_RECEIVED' | 'ANALYSIS_DONE' | 'WRITING' | 'DEADLINE';
  isCompleted: boolean;
}

// ─── Documents DCE ────────────────────────────────────────────────────────

type DocumentType = 'CCTP' | 'RC' | 'AE' | 'DPGF' | 'REGLEMENT' | 'OTHER';

interface DCEDocument {
  id: string;
  filename: string;
  documentType: DocumentType;
  fileSize: number;                 // en bytes
  uploadedAt: string;
  storageUrl: string;               // URL interne (ex: S3/Supabase Storage)
  mimeType: string;
}

// ─── Exigences extraites (par le TenderAgent LLM) ────────────────────────

type RequirementCategory =
  | 'CERTIFICATION'
  | 'REFERENCE'
  | 'TEAM_SIZE'
  | 'INSURANCE'
  | 'GUARANTEE'
  | 'TECHNICAL'
  | 'FINANCIAL'
  | 'OTHER';

interface Requirement {
  id: string;
  category: RequirementCategory;
  text: string;
  isMandatory: boolean;             // obligatoire vs souhaitable
  isMetByUs: boolean | null;        // null = non encore évalué
  extractedByLlm: boolean;          // true = extrait par LLM, false = manuel
  sourceSection: string | null;     // section du document source
}

// ─── Pipeline counters ────────────────────────────────────────────────────

interface PipelineCounts {
  detected: number;
  analyzed: number;
  go: number;
  inPreparation: number;
  submitted: number;
  won: number;
  totalPipelineAmount: number;      // somme montants status IN_PREPARATION + SUBMITTED
  successRate: number;              // won / (won + lost)
}

// ─── Props composants ─────────────────────────────────────────────────────

interface PipelineCountersProps {
  counts: PipelineCounts;
  isLoading?: boolean;
}

interface TenderTableProps {
  data: TenderListItem[];
  totalCount: number;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  isLoading?: boolean;
}

interface TenderManualActionsProps {
  tenderId: string;
  currentDecision: TenderDecision;
  currentStatus: TenderStatus;
  onAction: (action: TenderManualAction) => Promise<void>;
}

type TenderManualAction =
  | { type: 'VALIDATE_GO' }
  | { type: 'FORCE_NO_GO'; reason: string }
  | { type: 'ASSIGN_TEAM'; members: string[] }
  | { type: 'ADD_NOTE'; content: string }
  | { type: 'UPDATE_TASK'; taskId: string; status: TaskStatus };
```

---

## Données (tables SQL sources + query)

### Tables source

```sql
CREATE TABLE tenders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       TEXT NOT NULL,
  acheteur        TEXT NOT NULL,
  objet           TEXT NOT NULL,
  type            TEXT,
  procedure       TEXT,
  montant         BIGINT,
  deadline        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'DETECTED',
  decision        TEXT NOT NULL DEFAULT 'PENDING',
  score           INTEGER DEFAULT 0,
  source          TEXT,
  source_url      TEXT,
  assigned_team   TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tender_score_breakdowns (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id            UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  alignement_metier    INTEGER DEFAULT 0,
  faisabilite_tech     INTEGER DEFAULT 0,
  taille_marche        INTEGER DEFAULT 0,
  delai_reponse        INTEGER DEFAULT 0,
  concurrence_estimee  INTEGER DEFAULT 0,
  historique_acheteur  INTEGER DEFAULT 0,
  rentabilite_estimee  INTEGER DEFAULT 0,
  global_score         INTEGER DEFAULT 0,
  win_probability      NUMERIC(4,3),
  expected_value       BIGINT,
  scored_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tender_preparation_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,           -- 9a, 9b, ..., 9i
  label           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'TODO',
  completed_at    TIMESTAMPTZ,
  assigned_to     TEXT,
  notes           TEXT,
  is_optional     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tender_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  date            DATE NOT NULL,
  type            TEXT NOT NULL,
  is_completed    BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tender_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  document_type   TEXT NOT NULL DEFAULT 'OTHER',
  file_size       BIGINT,
  storage_url     TEXT NOT NULL,
  mime_type       TEXT,
  uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tender_requirements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  category        TEXT NOT NULL DEFAULT 'OTHER',
  text            TEXT NOT NULL,
  is_mandatory    BOOLEAN DEFAULT true,
  is_met_by_us    BOOLEAN,
  extracted_by_llm BOOLEAN DEFAULT true,
  source_section  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tender_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  author_name     TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Query: liste marchés avec filtres

```sql
SELECT
  t.id,
  t.score,
  t.decision,
  t.status,
  t.reference,
  t.acheteur,
  t.objet,
  t.montant,
  t.deadline,
  (t.deadline - CURRENT_DATE)::integer AS days_until_deadline,
  t.source,
  t.created_at
FROM tenders t
WHERE
  ($search IS NULL
    OR t.acheteur ILIKE '%' || $search || '%'
    OR t.objet    ILIKE '%' || $search || '%'
    OR t.reference ILIKE '%' || $search || '%')
  AND ($statuses  IS NULL OR t.status   = ANY($statuses))
  AND ($decisions IS NULL OR t.decision = ANY($decisions))
  AND ($date_from IS NULL OR t.created_at >= $date_from)
  AND ($date_to   IS NULL OR t.created_at <= $date_to)
ORDER BY t.score DESC, t.deadline ASC
LIMIT $limit OFFSET $offset;
```

### Query: pipeline counters

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'DETECTED')        AS detected,
  COUNT(*) FILTER (WHERE status = 'ANALYZED')         AS analyzed,
  COUNT(*) FILTER (WHERE decision = 'GO')             AS go_count,
  COUNT(*) FILTER (WHERE status = 'IN_PREPARATION')   AS in_preparation,
  COUNT(*) FILTER (WHERE status = 'SUBMITTED')        AS submitted,
  COUNT(*) FILTER (WHERE status = 'WON')              AS won,
  COALESCE(SUM(montant) FILTER (WHERE status IN ('IN_PREPARATION', 'SUBMITTED')), 0)
                                                      AS total_pipeline_amount,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'WON')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE status IN ('WON', 'LOST')), 0) * 100,
    1
  )                                                   AS success_rate
FROM tenders;
```

### Query: détail marché complet

```sql
-- Marché principal + scoring
SELECT t.*, tsb.*
FROM tenders t
LEFT JOIN tender_score_breakdowns tsb ON tsb.tender_id = t.id
WHERE t.id = $tender_id;

-- Tâches préparation (ordonnées par code)
SELECT * FROM tender_preparation_tasks
WHERE tender_id = $tender_id
ORDER BY code;

-- Jalons rétro-planning
SELECT * FROM tender_milestones
WHERE tender_id = $tender_id
ORDER BY date;

-- Documents DCE
SELECT * FROM tender_documents
WHERE tender_id = $tender_id
ORDER BY uploaded_at;

-- Exigences extraites
SELECT * FROM tender_requirements
WHERE tender_id = $tender_id
ORDER BY is_mandatory DESC, category;

-- Notes
SELECT * FROM tender_notes
WHERE tender_id = $tender_id
ORDER BY created_at DESC;
```

---

## Interactions Utilisateur

| Interaction | Comportement |
|---|---|
| Clic ligne tableau | Navigation vers /tenders/:id |
| Clic colonne Score (tri) | Tri côté serveur par score DESC |
| Clic colonne Deadline (tri) | Tri par deadline ASC |
| Clic décision badge dans la liste | Filtre rapide par décision |
| Clic counter pipeline | Filtre la table par statut correspondant |
| Clic "Valider GO" | Dialog confirmation → PATCH /api/tenders/:id/decision |
| Clic "Forcer NO-GO" | Dialog avec champ raison → PATCH /api/tenders/:id/decision |
| Clic checkbox tâche préparation | PATCH /api/tenders/:id/tasks/:taskId |
| Télécharger document | GET /api/tenders/:id/documents/:docId → redirect vers URL signée |
| Clic "Assigner équipe" | Multi-select d'utilisateurs → PATCH /api/tenders/:id/assign |
| Hover barre scoring | Tooltip avec description du critère et logique de calcul |
| Clic "↗ Consulter DCE" | Ouvre source_url dans nouvel onglet |

---

## Temps Réel (SSE events listened)

Point de connexion: `GET /api/sse/tenders`

```typescript
// Nouveau marché détecté — toast notification + ajout en haut de liste
interface TenderDetectedPayload {
  type: 'tender_detected';
  data: TenderListItem;
}

// Score d'un marché mis à jour
interface TenderScoredPayload {
  type: 'tender_scored';
  data: {
    tenderId: string;
    previousScore: number;
    newScore: number;
    decision: TenderDecision;
  };
}

// Deadline imminente (< 48h)
interface TenderDeadlineWarningPayload {
  type: 'tender_deadline_warning';
  data: {
    tenderId: string;
    reference: string;
    acheteur: string;
    hoursRemaining: number;
  };
}
```

---

## Filtres & Recherche

| Filtre | Type | Options |
|---|---|---|
| Recherche texte | Input | acheteur, objet, référence (ILIKE) |
| Décision | Select multi | GO / POSSIBLE / NO-GO / EN ATTENTE |
| Statut pipeline | Select multi | 7 statuts |
| Période détection | Date range | Custom |
| Montant min/max | Input numérique | En euros |

---

## Actions Disponibles

| Action | Endpoint | Méthode |
|---|---|---|
| Valider décision GO | /api/tenders/:id/decision | PATCH |
| Forcer NO-GO | /api/tenders/:id/decision | PATCH |
| Mettre à jour tâche | /api/tenders/:id/tasks/:taskId | PATCH |
| Assigner équipe | /api/tenders/:id/assign | PATCH |
| Télécharger document | /api/tenders/:id/documents/:docId | GET |
| Ajouter note | /api/tenders/:id/notes | POST |
| Exporter CSV liste | /api/tenders/export | POST |
| Déclencher re-scoring | /api/tenders/:id/score | POST |

---

## Edge Cases

| Cas | Comportement attendu |
|---|---|
| deadline < TODAY | Ligne surlignée en rouge, badge "EXPIRÉE" |
| days_until_deadline <= 5 | Countdown en orange avec icône alarme |
| montant = null | Affiche "NC" (non communiqué) |
| score = 0, decision = PENDING | Badge gris "EN ANALYSE" |
| Toutes les tâches préparation DONE | Barre de progression verte 100% + confetti animation |
| Document uploadé mais storage_url inaccessible | Bouton désactivé + tooltip "Document temporairement indisponible" |
| win_probability = null | Expected value non calculée → "—" |
| Marché annulé (CANCELLED) | Ligne grisée, toutes les actions désactivées sauf "Voir détail" |
| requirements vides | Section "Exigences" affiche "Aucune exigence extraite — en attente d'analyse" |
| Timeout analyse LLM | Badge "Analyse en cours..." avec spinner sur la décision |

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
  "canvas-confetti": "^1.x"
}
```

---

## Implémentation Priorité

**Priorité: P1 — Vue métier critique pour le suivi des AO**

### Ordre de développement

```
1. Types TypeScript tenders (tous les interfaces)      [1h]
2. Tables SQL + migrations                             [2h]
3. Query liste + pipeline counters + API              [2h]
4. TenderTable + DecisionBadge + DeadlineCountdown    [2h]
5. PipelineCounters composant                         [1h]
6. Query détail + API GET /api/tenders/:id            [1h]
7. TenderDetailPage layout                            [1h]
8. ScoringBreakdown (7 barres)                        [1h]
9. PreparationProgress (checklist)                    [2h]
10. Retroplanning (timeline SVG)                      [2h]
11. DocumentsDCE + ExigencesExtraites                 [2h]
12. ManualActions + API PATCH endpoints               [2h]
13. SSE integration (tender_detected, deadline_warning) [1h]
```

**Estimation totale: ~22h dev**

### Fichiers à créer

```
src/app/(dashboard)/tenders/page.tsx
src/app/(dashboard)/tenders/[id]/page.tsx
src/components/tenders/TenderTable.tsx
src/components/tenders/TenderFilters.tsx
src/components/tenders/PipelineCounters.tsx
src/components/tenders/DecisionBadge.tsx
src/components/tenders/DeadlineCountdown.tsx
src/components/tenders/ScoringBreakdown.tsx
src/components/tenders/PreparationProgress.tsx
src/components/tenders/ChecklistItem.tsx
src/components/tenders/Retroplanning.tsx
src/components/tenders/DocumentsDCE.tsx
src/components/tenders/ExigencesExtraites.tsx
src/components/tenders/TenderManualActions.tsx
src/hooks/useTenders.ts
src/hooks/useTenderDetail.ts
src/types/tenders.ts
src/app/api/tenders/route.ts
src/app/api/tenders/[id]/route.ts
src/app/api/tenders/[id]/decision/route.ts
src/app/api/tenders/[id]/tasks/[taskId]/route.ts
src/app/api/tenders/[id]/assign/route.ts
src/app/api/tenders/[id]/documents/[docId]/route.ts
src/app/api/tenders/export/route.ts
src/app/api/sse/tenders/route.ts
```
