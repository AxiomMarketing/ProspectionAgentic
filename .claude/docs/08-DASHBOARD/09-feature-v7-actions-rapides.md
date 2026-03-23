# V7 Actions Rapides

## Objectif

Centre de notification et d'action prioritaire. Liste triée par urgence de toutes les actions en attente générées par le système (alertes SLA, opportunités à saisir, validations requises, erreurs à corriger). Chaque item a un timer SLA avec décompte, une couleur de priorité, et un bouton d'action directe. SSE pour l'apparition en temps réel. Son de notification pour les items URGENT. Badge de comptage dans la navigation.

---

## Wireframe (ASCII mockup)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ AXIOM — Actions Rapides                [🔔 Son: ON]  [Tout marquer lu]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [●Toutes (12)]  [🔴 URGENT (2)]  [🟡 IMPORTANT (5)]  [🔵 NORMAL (4)]    │
│  [⚪ INFO (1)]                                      [🗑 Effacer résolues]  │
│                                                                             │
│  ──────────────── 🔴 URGENT ─────────────────────────────────────────────  │
│                                                                             │
│  🔴 ┌────────────────────────────────────────────────────────────────┐    │
│     │ ⚠️  DEADLINE MARCHÉ — 5h 23m restantes                        │    │
│     │ DCE #442 — Enedis SI Maintenance — Soumission avant 20:00      │    │
│     │ [↗ Voir le marché]                      [✓ Marquer comme fait] │    │
│     └────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  🔴 ┌────────────────────────────────────────────────────────────────┐    │
│     │ 🚨 AGENT EN ERREUR — Depuis 1h 12m                             │    │
│     │ EmailAgent: SMTP connection refused (smtp.sendgrid.net:587)     │    │
│     │ [↗ Voir les logs]  [↻ Redémarrer]       [✓ Marquer comme fait] │    │
│     └────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ──────────────── 🟡 IMPORTANT ──────────────────────────────────────────  │
│                                                                             │
│  🟡 ┌────────────────────────────────────────────────────────────────┐    │
│     │ ⭐ NOUVEAU PROSPECT HOT — Score 94/100                          │    │
│     │ Nexans SA — Signal fort détecté: offre emploi Data Engineer     │    │
│     │ [↗ Voir le prospect]                    [✓ Marquer comme fait] │    │
│     └────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  🟡 ┌────────────────────────────────────────────────────────────────┐    │
│     │ 📬 RÉPONSE EMAIL REÇUE — Il y a 23 min                         │    │
│     │ jean.martin@nexans.com a répondu à votre email du 14/03         │    │
│     │ [↗ Voir le deal]  [📧 Répondre]         [✓ Marquer comme fait] │    │
│     └────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  🟡 ┌────────────────────────────────────────────────────────────────┐    │
│     │ 🤝 DEAL INACTIF — 8 jours sans action                          │    │
│     │ SNCF Réseau — Stade DEVIS — 520 000€ en jeu                    │    │
│     │ [↗ Voir le deal]  [📅 Planifier action] [✓ Marquer comme fait] │    │
│     └────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  🟡 ┌────────────────────────────────────────────────────────────────┐    │
│     │ 📋 VALIDATION REQUISE — Nouveau marché détecté                  │    │
│     │ ARS Île-de-France — SI Hospitalier — 340 000€ — Score: 71/100  │    │
│     │ [↗ Voir le marché]  [✅ Valider GO]  [❌ NO-GO]               │    │
│     └────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  🟡 ┌────────────────────────────────────────────────────────────────┐    │
│     │ 📊 SCORE DÉGRADÉ — Prospect important                           │    │
│     │ Bouygues Télécom — Score passé de 82 à 61 (-21 pts en 7 jours) │    │
│     │ [↗ Voir le prospect]                    [✓ Marquer comme fait] │    │
│     └────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ──────────────── 🔵 NORMAL ─────────────────────────────────────────────  │
│                                                                             │
│  🔵 ┌────────────────────────────────────────────────────────────────┐    │
│     │ 📝 RAPPORT JOURNALIER DISPONIBLE — Généré à 08:00              │    │
│     │ Résumé: 247 prospects, 18 marchés, 3 emails envoyés            │    │
│     │ [↗ Télécharger]                         [✓ Marquer comme fait] │    │
│     └────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ...  3 autres actions normales                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Composants React

```
ActionsRapidesPage (page)
├── ActionPageHeader
│   ├── SoundToggle
│   └── MarkAllReadButton
├── PriorityFilterTabs
│   └── PriorityTabCount × 5 (Toutes, URGENT, IMPORTANT, NORMAL, INFO)
├── ActionsList
│   ├── PriorityGroupHeader × 4
│   └── ActionItem × n
│       ├── PriorityIndicator (barre colorée gauche)
│       ├── ActionIcon
│       ├── ActionContent
│       │   ├── ActionTitle
│       │   ├── ActionDescription
│       │   └── EntityLink
│       ├── SLACountdown (timer)
│       └── ActionButtons (1–3 boutons selon le type)
└── EmptyState (quand aucune action)
```

### Signatures des composants

```tsx
export default function ActionsRapidesPage(): JSX.Element

export function ActionsList({
  actions,
  groupByPriority,
}: ActionsListProps): JSX.Element

export function ActionItem({
  action,
  onMarkDone,
  onPrimaryAction,
  onSecondaryAction,
}: ActionItemProps): JSX.Element

export function SLACountdown({ slaDeadline, priority }: SLACountdownProps): JSX.Element

export function PriorityFilterTabs({
  activeFilter,
  counts,
  onChange,
}: PriorityFilterTabsProps): JSX.Element

// Hook pour le son de notification
export function useSoundNotification(): {
  isEnabled: boolean;
  toggle: () => void;
  playUrgent: () => void;
}
```

---

## Props & Types (TypeScript interfaces)

```typescript
// ─── Priorités ────────────────────────────────────────────────────────────

type ActionPriority = 'URGENT' | 'IMPORTANT' | 'NORMAL' | 'INFO';

const PRIORITY_COLORS: Record<ActionPriority, string> = {
  URGENT:    '#ef4444',              // rouge
  IMPORTANT: '#f59e0b',              // jaune/amber
  NORMAL:    '#3b82f6',              // bleu
  INFO:      '#94a3b8',              // gris
};

const PRIORITY_LABELS: Record<ActionPriority, string> = {
  URGENT:    'URGENT',
  IMPORTANT: 'IMPORTANT',
  NORMAL:    'NORMAL',
  INFO:      'INFO',
};

// ─── Types d'actions (8 types) ────────────────────────────────────────────

type QuickActionType =
  | 'TENDER_DEADLINE'         // deadline marché imminente
  | 'AGENT_ERROR'             // agent en erreur
  | 'NEW_HOT_PROSPECT'        // nouveau prospect HOT
  | 'EMAIL_REPLY_RECEIVED'    // réponse email reçue
  | 'DEAL_STALE'              // deal inactif trop longtemps
  | 'TENDER_VALIDATION'       // marché détecté nécessite validation GO/NO-GO
  | 'SCORE_DEGRADED'          // score prospect dégradé significativement
  | 'DAILY_REPORT';           // rapport journalier disponible

// Icônes par type (Lucide icon names)
const ACTION_TYPE_ICONS: Record<QuickActionType, string> = {
  TENDER_DEADLINE:      'Clock',
  AGENT_ERROR:          'AlertTriangle',
  NEW_HOT_PROSPECT:     'Star',
  EMAIL_REPLY_RECEIVED: 'MailOpen',
  DEAL_STALE:           'TrendingDown',
  TENDER_VALIDATION:    'ClipboardCheck',
  SCORE_DEGRADED:       'BarChart2',
  DAILY_REPORT:         'FileBarChart',
};

// Priorité par défaut pour chaque type d'action
const ACTION_TYPE_DEFAULT_PRIORITY: Record<QuickActionType, ActionPriority> = {
  TENDER_DEADLINE:      'URGENT',
  AGENT_ERROR:          'URGENT',
  NEW_HOT_PROSPECT:     'IMPORTANT',
  EMAIL_REPLY_RECEIVED: 'IMPORTANT',
  DEAL_STALE:           'IMPORTANT',
  TENDER_VALIDATION:    'IMPORTANT',
  SCORE_DEGRADED:       'IMPORTANT',
  DAILY_REPORT:         'NORMAL',
};

// ─── Action rapide ────────────────────────────────────────────────────────

interface QuickAction {
  id: string;
  type: QuickActionType;
  priority: ActionPriority;
  title: string;
  description: string;
  entityId: string | null;
  entityType: 'prospect' | 'tender' | 'deal' | 'agent' | 'report' | null;
  entityLabel: string | null;       // ex: "Nexans SA", "DCE #442"
  slaDeadline: string | null;       // ISO datetime — deadline de l'SLA
  slaSeconds: number | null;        // secondes restantes (calculé)
  status: 'PENDING' | 'DONE' | 'DISMISSED' | 'SNOOZED';
  createdAt: string;
  doneAt: string | null;
  // Boutons d'action disponibles (1 à 3 selon le type)
  primaryAction: ActionButton | null;
  secondaryAction: ActionButton | null;
  tertiaryAction: ActionButton | null;
}

interface ActionButton {
  label: string;
  icon: string;                     // Lucide icon name
  variant: 'default' | 'destructive' | 'outline';
  href?: string;                    // si navigation
  apiEndpoint?: string;             // si action API directe
  apiMethod?: 'POST' | 'PATCH' | 'DELETE';
  apiPayload?: Record<string, unknown>;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
}

// ─── Comptages par priorité (pour les tabs) ───────────────────────────────

interface ActionCounts {
  total: number;
  urgent: number;
  important: number;
  normal: number;
  info: number;
}

// ─── Décompte SLA ─────────────────────────────────────────────────────────

interface SLAStatus {
  secondsRemaining: number;
  isExpired: boolean;
  displayText: string;               // ex: "5h 23m", "23 min", "EXPIRÉ"
  urgencyLevel: 'critical' | 'warning' | 'ok';
  // critical = < 1h, warning = 1h–4h, ok = > 4h
}

function computeSLAStatus(slaDeadline: string | null): SLAStatus | null {
  if (!slaDeadline) return null;
  const secondsRemaining = differenceInSeconds(parseISO(slaDeadline), new Date());
  return {
    secondsRemaining,
    isExpired: secondsRemaining <= 0,
    displayText: secondsRemaining <= 0
      ? 'EXPIRÉ'
      : secondsRemaining < 3600
        ? `${Math.floor(secondsRemaining / 60)}m ${secondsRemaining % 60}s`
        : secondsRemaining < 86400
          ? `${Math.floor(secondsRemaining / 3600)}h ${Math.floor((secondsRemaining % 3600) / 60)}m`
          : `${Math.floor(secondsRemaining / 86400)}j ${Math.floor((secondsRemaining % 86400) / 3600)}h`,
    urgencyLevel: secondsRemaining < 3600 ? 'critical' : secondsRemaining < 14400 ? 'warning' : 'ok',
  };
}

// ─── Configuration boutons d'action par type ─────────────────────────────

const ACTION_BUTTONS_CONFIG: Record<QuickActionType, {
  primary: Omit<ActionButton, 'href' | 'apiEndpoint'>;
  secondary?: Omit<ActionButton, 'href' | 'apiEndpoint'>;
  tertiary?: Omit<ActionButton, 'href' | 'apiEndpoint'>;
}> = {
  TENDER_DEADLINE: {
    primary:   { label: 'Voir le marché', icon: 'ExternalLink', variant: 'default' },
  },
  AGENT_ERROR: {
    primary:   { label: 'Voir les logs', icon: 'ScrollText', variant: 'outline' },
    secondary: { label: 'Redémarrer', icon: 'RefreshCw', variant: 'default',
                 requiresConfirmation: true,
                 confirmationMessage: 'Redémarrer cet agent ?' },
  },
  NEW_HOT_PROSPECT: {
    primary:   { label: 'Voir le prospect', icon: 'ExternalLink', variant: 'default' },
  },
  EMAIL_REPLY_RECEIVED: {
    primary:   { label: 'Voir le deal', icon: 'ExternalLink', variant: 'outline' },
    secondary: { label: 'Répondre', icon: 'Mail', variant: 'default' },
  },
  DEAL_STALE: {
    primary:   { label: 'Voir le deal', icon: 'ExternalLink', variant: 'outline' },
    secondary: { label: 'Planifier action', icon: 'Calendar', variant: 'default' },
  },
  TENDER_VALIDATION: {
    primary:   { label: 'Valider GO', icon: 'CheckCircle', variant: 'default',
                 requiresConfirmation: true,
                 confirmationMessage: 'Confirmer la décision GO pour ce marché ?' },
    secondary: { label: 'NO-GO', icon: 'XCircle', variant: 'destructive',
                 requiresConfirmation: true,
                 confirmationMessage: 'Confirmer le NO-GO ? Cette action est irréversible.' },
    tertiary:  { label: 'Voir le marché', icon: 'ExternalLink', variant: 'outline' },
  },
  SCORE_DEGRADED: {
    primary:   { label: 'Voir le prospect', icon: 'ExternalLink', variant: 'default' },
  },
  DAILY_REPORT: {
    primary:   { label: 'Télécharger', icon: 'Download', variant: 'default' },
  },
};

// ─── Props composants ─────────────────────────────────────────────────────

interface ActionsListProps {
  actions: QuickAction[];
  groupByPriority: boolean;
  isLoading?: boolean;
}

interface ActionItemProps {
  action: QuickAction;
  onMarkDone: (actionId: string) => Promise<void>;
  onPrimaryAction: (action: QuickAction) => Promise<void>;
  onSecondaryAction?: (action: QuickAction) => Promise<void>;
}

interface SLACountdownProps {
  slaDeadline: string | null;
  priority: ActionPriority;
  refreshIntervalMs?: number;        // défaut: 1000 (toutes les secondes)
}

interface PriorityFilterTabsProps {
  activeFilter: ActionPriority | 'ALL';
  counts: ActionCounts;
  onChange: (filter: ActionPriority | 'ALL') => void;
}
```

---

## Données (tables SQL sources + query)

### Tables source

```sql
CREATE TABLE quick_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL,
  priority        TEXT NOT NULL DEFAULT 'NORMAL',
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  entity_id       UUID,
  entity_type     TEXT,
  entity_label    TEXT,
  sla_deadline    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'PENDING',
  done_at         TIMESTAMPTZ,
  -- Boutons (sérialisés en JSON — les liens sont dynamiques)
  primary_action_label    TEXT,
  primary_action_href     TEXT,
  primary_action_api      TEXT,
  secondary_action_label  TEXT,
  secondary_action_href   TEXT,
  secondary_action_api    TEXT,
  tertiary_action_label   TEXT,
  tertiary_action_href    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quick_actions_status   ON quick_actions(status);
CREATE INDEX idx_quick_actions_priority ON quick_actions(priority);
CREATE INDEX idx_quick_actions_created  ON quick_actions(created_at DESC);
```

### Query: liste des actions en attente

```sql
SELECT
  qa.*,
  -- Secondes restantes avant SLA
  CASE
    WHEN qa.sla_deadline IS NOT NULL
    THEN GREATEST(0, EXTRACT(EPOCH FROM qa.sla_deadline - NOW())::integer)
    ELSE NULL
  END AS sla_seconds
FROM quick_actions qa
WHERE qa.status = 'PENDING'
  AND ($priority_filter IS NULL OR qa.priority = $priority_filter)
ORDER BY
  CASE qa.priority
    WHEN 'URGENT'    THEN 1
    WHEN 'IMPORTANT' THEN 2
    WHEN 'NORMAL'    THEN 3
    WHEN 'INFO'      THEN 4
  END ASC,
  -- Au sein d'une même priorité: SLA le plus proche en premier
  qa.sla_deadline ASC NULLS LAST,
  qa.created_at DESC;
```

### Query: comptages par priorité (pour les tabs)

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE priority = 'URGENT')    AS urgent,
  COUNT(*) FILTER (WHERE priority = 'IMPORTANT') AS important,
  COUNT(*) FILTER (WHERE priority = 'NORMAL')    AS normal,
  COUNT(*) FILTER (WHERE priority = 'INFO')      AS info
FROM quick_actions
WHERE status = 'PENDING';
```

### Mutation: marquer comme fait

```sql
UPDATE quick_actions
SET status   = 'DONE',
    done_at  = NOW(),
    updated_at = NOW()
WHERE id = $action_id;
```

### Triggers de création d'actions (exemples)

Les agents créent des QuickActions via des INSERT lors de certains événements:

```sql
-- Exemple: TenderAgent insère une action TENDER_VALIDATION quand score > 60
INSERT INTO quick_actions (type, priority, title, description, entity_id, entity_type, entity_label, sla_deadline)
VALUES (
  'TENDER_VALIDATION',
  'IMPORTANT',
  'Validation requise — Nouveau marché détecté',
  $acheteur || ' — ' || $objet || ' — ' || $montant || '€ — Score: ' || $score || '/100',
  $tender_id,
  'tender',
  $reference,
  NOW() + INTERVAL '48 hours'           -- SLA 48h pour décider GO/NO-GO
);

-- Exemple: AlertingAgent insère TENDER_DEADLINE quand deadline < 24h
INSERT INTO quick_actions (type, priority, title, description, entity_id, entity_type, entity_label, sla_deadline)
VALUES (
  'TENDER_DEADLINE',
  'URGENT',
  'DEADLINE MARCHÉ — ' || to_char(NOW() + $hours_remaining * interval '1 hour', 'HH24h MMm restantes'),
  $reference || ' — ' || $acheteur || ' — Soumission avant ' || to_char($deadline, 'HH24:MI'),
  $tender_id,
  'tender',
  $reference,
  $deadline
);
```

---

## Interactions Utilisateur

| Interaction | Comportement |
|---|---|
| Clic "Marquer comme fait" | PATCH /api/actions/:id/done → item disparaît avec animation slide-out |
| Clic bouton primaire (navigation) | Navigation vers l'entité concernée |
| Clic bouton primaire (API directe) | Call API + toast résultat + item marqué done |
| Clic bouton avec confirmation | Dialog confirmation → si confirmé: call API |
| Clic tab priorité | Filtre la liste (côté client, pas de re-fetch) |
| Clic "Tout marquer lu" | Dialog confirmation → PATCH /api/actions/mark-all-done |
| Clic "Effacer résolues" | DELETE /api/actions/done — supprime les DONE de + 24h |
| Toggle son | Sauvegarde préférence en localStorage; icône change |
| Nouvel item URGENT via SSE | Animation slide-down + son de notification (si activé) |
| Hover SLACountdown | Tooltip avec datetime exact de la deadline |

---

## Temps Réel (SSE events listened)

Point de connexion: `GET /api/sse/actions`

```typescript
// Nouvelle action créée par un agent
interface NewActionPayload {
  type: 'new_quick_action';
  data: QuickAction;
}

// Action résolue par un autre utilisateur (multi-user)
interface ActionResolvedPayload {
  type: 'action_resolved';
  data: {
    actionId: string;
    resolvedBy: string;
  };
}

// Mise à jour des compteurs (toutes les 30s)
interface ActionCountsUpdatedPayload {
  type: 'action_counts_updated';
  data: ActionCounts;
}
```

### Logique de notification sonore

```typescript
// Son unique: bip court (800Hz, 150ms) pour URGENT
// Joué seulement si:
// 1. L'utilisateur a activé le son (localStorage: 'axiom_sound_enabled' = 'true')
// 2. La priorité du nouvel item est 'URGENT'
// 3. La page est active (document.visibilityState === 'visible') OU
//    notification navigateur si permission accordée

function playUrgentSound(): void {
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioContextClass();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.frequency.value = 800;
  oscillator.type = 'sine';
  gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.15);
}

// Notification navigateur (fallback si page en arrière-plan)
function showBrowserNotification(action: QuickAction): void {
  if (Notification.permission === 'granted') {
    new Notification('AXIOM — Action URGENTE', {
      body: action.title + '\n' + action.description,
      icon: '/favicon.ico',
      badge: '/badge-icon.png',
      tag: action.id,                // évite les duplicatas
    });
  }
}
```

### Badge de comptage dans la navigation

```typescript
// Le badge dans le menu latéral affiche le count total d'actions PENDING
// Mis à jour via l'event SSE 'action_counts_updated'
// Rouge si count > 0 d'URGENT, jaune sinon

interface NavigationBadgeProps {
  urgentCount: number;
  totalCount: number;
}
// Rendu: si urgentCount > 0 → badge rouge avec urgentCount
//        si totalCount > 0  → badge jaune avec totalCount
//        si totalCount = 0  → pas de badge
```

---

## Filtres & Recherche

| Filtre | Type | Comportement |
|---|---|---|
| Priorité | Tabs | ALL / URGENT / IMPORTANT / NORMAL / INFO |
| Type d'action | Select (dans filtres avancés) | 8 types |
| Statut | Chips | PENDING / DONE (pour audit) |
| Groupe par priorité | Toggle | Active/désactive les séparateurs de groupe |

Pas de recherche texte sur cette vue — les actions sont peu nombreuses et doivent être scannées visuellement rapidement.

---

## Actions Disponibles

| Action | Endpoint | Méthode |
|---|---|---|
| Marquer comme fait | /api/actions/:id/done | PATCH |
| Tout marquer comme fait | /api/actions/mark-all-done | PATCH |
| Effacer actions résolues | /api/actions/done | DELETE |
| Redémarrer agent (depuis AGENT_ERROR) | /api/agents/:id/restart | POST |
| Valider GO (depuis TENDER_VALIDATION) | /api/tenders/:id/decision | PATCH |
| Forcer NO-GO (depuis TENDER_VALIDATION) | /api/tenders/:id/decision | PATCH |
| Demander permission notif navigateur | API navigateur native | — |

---

## Edge Cases

| Cas | Comportement attendu |
|---|---|
| Aucune action en attente | Illustration vide "Tout est à jour" + confetti animation |
| SLA expiré (sla_deadline < NOW()) | Badge "EXPIRÉ" rouge clignotant; item reste en URGENT jusqu'à être traité |
| Action URGENT reçue en arrière-plan | Notification navigateur si permission accordée + badge onglet |
| Plusieurs actions TENDER_DEADLINE pour le même marché | Déduplication par entity_id — une seule action affichée |
| Son désactivé au niveau OS | playUrgentSound() silencieux — pas d'erreur |
| AudioContext suspendu (politique navigateur) | Resume avant play: `await ctx.resume()` |
| Action déjà résolue par un autre user (SSE) | Disparition de la liste avec animation + toast "Résolu par [user]" |
| > 50 actions en attente | Pagination: 20 items par page, ou scroll virtuel |
| Bouton API directe échoue | Toast erreur + item reste PENDING + message "Réessayer" |
| Confirmation dialog pendant navigation | Dialog bloque la navigation (modal avec backdrop) |

---

## Dépendances (npm packages used)

```json
{
  "@tanstack/react-query": "^5.x",
  "date-fns": "^3.x",
  "lucide-react": "^0.x",
  "clsx": "^2.x",
  "@radix-ui/react-dialog": "^1.x",
  "@radix-ui/react-tabs": "^1.x",
  "canvas-confetti": "^1.x"
}
```

Notes:
- Son généré via Web Audio API native — pas de fichier audio à héberger
- Badge navigation partagé avec le layout via un context React `ActionCountContext`
- `canvas-confetti` pour l'animation "tout est à jour" (réutilisé depuis V4)
- Les SLA countdowns utilisent `setInterval` à 1s, nettoyés dans le `useEffect` cleanup

---

## Implémentation Priorité

**Priorité: P1 — Vue critique pour la réactivité opérationnelle**

### Ordre de développement

```
1. Types TypeScript QuickAction + ActionButton           [1h]
2. Table SQL quick_actions + index + API routes          [2h]
3. Query liste + comptages + tri                         [1h]
4. ActionItem composant (layout + boutons)               [2h]
5. SLACountdown hook (setInterval + formatage)           [1h]
6. PriorityFilterTabs composant + ActionCounts           [1h]
7. ActionsRapidesPage assembly                           [1h]
8. SSE integration + slide-down animation                [1h]
9. Son Web Audio API + useSoundNotification hook         [1h]
10. Notification navigateur (Notification API)           [1h]
11. Badge navigation via ActionCountContext              [1h]
12. Actions directes API (restart, GO/NO-GO)             [2h]
13. Edge cases (expiry, dedup, confetti)                 [1h]
```

**Estimation totale: ~16h dev**

### Fichiers à créer

```
src/app/(dashboard)/actions/page.tsx
src/components/actions/ActionItem.tsx
src/components/actions/ActionsList.tsx
src/components/actions/SLACountdown.tsx
src/components/actions/PriorityFilterTabs.tsx
src/components/actions/ActionPageHeader.tsx
src/components/actions/PriorityGroupHeader.tsx
src/hooks/useQuickActions.ts
src/hooks/useSoundNotification.ts
src/hooks/useActionCounts.ts
src/context/ActionCountContext.tsx
src/types/actions.ts
src/lib/sla.ts
src/app/api/actions/route.ts
src/app/api/actions/[id]/done/route.ts
src/app/api/actions/mark-all-done/route.ts
src/app/api/actions/done/route.ts
src/app/api/sse/actions/route.ts
```
