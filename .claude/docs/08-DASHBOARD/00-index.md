# Axiom Dashboard — Index & Overview

**Version :** 1.0.0
**Dernière mise à jour :** 23 mars 2026
**Stack :** React 19 + Vite 6 + TypeScript 5.9 + Tailwind CSS v4 + shadcn/ui
**Brainstorm source :** [`.claude/brainstorming/13-BRAINSTORM-DASHBOARD.md`](../../brainstorming/13-BRAINSTORM-DASHBOARD.md)

---

## Objectif

Le dashboard Axiom est un **outil opérationnel interne** conçu pour Jonathan — l'opérateur humain unique du système multi-agents. Ce n'est pas un dashboard de monitoring technique (celui-là existe dans `05-OBSERVABILITE/`). C'est un **poste de commandement métier** qui permet de :

- Surveiller l'état et l'activité en temps réel des 10 agents autonomes
- Retrouver n'importe quel prospect avec son historique complet d'interactions
- Gérer le pipeline des appels d'offres publics de la détection à la soumission
- Visualiser les deals commerciaux en cours sur un Kanban drag-and-drop
- Traiter les actions urgentes qui nécessitent une décision humaine (réponses prospects, validation GO/NO-GO)
- Comprendre visuellement comment les agents communiquent entre eux

Le dashboard consomme l'API REST NestJS du backend et reçoit des mises à jour en temps réel via Server-Sent Events (SSE). Il n'a aucune logique métier propre — il est un miroir de l'état du système backend.

---

## Navigation

| Document | Contenu | Quand lire |
|----------|---------|------------|
| **`00-index.md`** (vous êtes ici) | Vue d'ensemble, structure, quick start, mockups | En premier |
| [**`01-architecture.md`**](./01-architecture.md) | Structure src/, composants, data flow, routing, types, tests | Développement |

---

## Structure des fichiers

```
dashboard/                              — Racine du projet frontend
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx                        — Point d'entrée React 19 (createRoot)
│   ├── app.tsx                         — Router + QueryClientProvider + ThemeProvider
│   │
│   ├── routes/                         — Pages = 1 fichier par vue
│   │   ├── index.tsx                   — V1 Centre de Contrôle (home)
│   │   ├── timeline.tsx                — V2 Timeline Agents
│   │   ├── prospects/
│   │   │   ├── index.tsx               — V3 Liste prospects (table)
│   │   │   └── $prospectId.tsx         — V3 Fiche prospect (drill-down)
│   │   ├── tenders/
│   │   │   ├── index.tsx               — V4 Liste marchés publics
│   │   │   └── $tenderId.tsx           — V4 Fiche marché (drill-down)
│   │   ├── deals.tsx                   — V5 Pipeline Kanban
│   │   ├── graph.tsx                   — V6 Graph agents (React Flow)
│   │   └── actions.tsx                 — V7 Actions Rapides
│   │
│   ├── components/
│   │   ├── agents/
│   │   │   ├── AgentCard.tsx           — Carte statut agent (status + dernière action)
│   │   │   ├── AgentDetail.tsx         — Panel détail agent (slide-over)
│   │   │   └── AgentGraph.tsx          — Visualisation React Flow v12
│   │   │
│   │   ├── prospects/
│   │   │   ├── ProspectTable.tsx       — Table TanStack Table v8 (tri, filtre, pagination)
│   │   │   ├── ProspectDetail.tsx      — Fiche complète (onglets)
│   │   │   ├── ScoreBreakdown.tsx      — 4 barres de progression (ICP/Signaux/Tech/Engagement)
│   │   │   ├── SignalList.tsx          — Liste signaux avec indicateur de décroissance
│   │   │   └── InteractionTimeline.tsx — Historique emails/LinkedIn/nurturing
│   │   │
│   │   ├── tenders/
│   │   │   ├── TenderTable.tsx         — Table marchés (TanStack Table)
│   │   │   ├── TenderDetail.tsx        — Fiche marché (onglets)
│   │   │   ├── TenderScoring.tsx       — 7 barres GO/NO-GO
│   │   │   ├── TenderProgress.tsx      — Checklist 9a→9g avec statuts
│   │   │   └── TenderTimeline.tsx      — Retroplanning J-31 → J0
│   │   │
│   │   ├── deals/
│   │   │   ├── DealKanban.tsx          — Board @hello-pangea/dnd (7 colonnes)
│   │   │   ├── DealCard.tsx            — Carte deal (montant, chaleur, prochaine action)
│   │   │   └── DealMetrics.tsx         — Bandeau métriques pipeline (CA, vélocité, win rate)
│   │   │
│   │   ├── shared/
│   │   │   ├── StatusBadge.tsx         — Badge statut coloré (agent, prospect, tender)
│   │   │   ├── MetricCard.tsx          — Carte métrique avec icône et delta
│   │   │   ├── EventCard.tsx           — Carte événement timeline expandable
│   │   │   ├── ActionItem.tsx          — Item action rapide avec SLA countdown
│   │   │   ├── PriorityBadge.tsx       — Badge priorité (URGENT/IMPORTANT/NORMAL/INFO)
│   │   │   └── EmptyState.tsx          — Placeholder pour listes vides
│   │   │
│   │   └── layout/
│   │       ├── AppLayout.tsx           — Wrapper global (sidebar + main)
│   │       ├── Sidebar.tsx             — Navigation latérale collapsible
│   │       ├── Header.tsx              — Barre supérieure (titre + actions globales)
│   │       └── NotificationBell.tsx    — Cloche actions urgentes (badge count)
│   │
│   ├── hooks/
│   │   ├── useSSE.ts                   — Hook générique EventSource avec reconnexion
│   │   ├── useAgentStatus.ts           — TanStack Query: /api/agents/status
│   │   ├── useAgentEvents.ts           — SSE: /api/events/stream + cache local
│   │   ├── useProspects.ts             — TanStack Query: /api/prospects (liste + filtres)
│   │   ├── useProspect.ts              — TanStack Query: /api/prospects/:id
│   │   ├── useTenders.ts               — TanStack Query: /api/tenders
│   │   ├── useTender.ts                — TanStack Query: /api/tenders/:id
│   │   ├── useDeals.ts                 — TanStack Query: /api/deals
│   │   ├── useActionItems.ts           — TanStack Query: /api/actions (pending)
│   │   ├── useAgentGraph.ts            — TanStack Query: /api/graph/agents
│   │   └── useMetrics.ts               — TanStack Query: /api/metrics/today
│   │
│   ├── lib/
│   │   ├── api.ts                      — Client fetch centralisé (base URL, auth, retry)
│   │   ├── sse.ts                      — Classe SSEClient (reconnexion exponentielle)
│   │   ├── query-client.ts             — Configuration TanStack Query (staleTime, retry)
│   │   └── utils.ts                    — cn(), formatDate(), formatCurrency(), etc.
│   │
│   └── types/
│       ├── agent.ts                    — Agent, AgentStatus, AgentEvent, AgentGraph
│       ├── prospect.ts                 — Prospect, ProspectScore, Signal, Interaction
│       ├── tender.ts                   — Tender, TenderScore, TenderProgress, DCEDoc
│       ├── deal.ts                     — Deal, DealStage, Quote, DealInteraction
│       └── event.ts                    — AgentEventType (enum), AgentEventRecord, ActionItem
│
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── package.json
└── vitest.config.ts
```

---

## Quick Start

### Prérequis

- Node.js >= 22.22.1
- pnpm >= 9.x
- Backend NestJS en cours d'exécution sur `http://localhost:3000`

### Installation

```bash
# Depuis la racine du monorepo
cd dashboard
pnpm install

# Configurer les variables d'environnement
cp .env.example .env.local
# Éditer .env.local :
# VITE_API_BASE_URL=http://localhost:3000
# VITE_SSE_URL=http://localhost:3000/api/events/stream
```

### Développement

```bash
pnpm dev
# Dashboard disponible sur http://localhost:5173
```

### Build production

```bash
pnpm build
# Output dans dist/
# Servir avec : pnpm preview (ou Caddy en production)
```

### Tests

```bash
pnpm test           # Vitest en mode watch
pnpm test:run       # Vitest une seule fois (CI)
pnpm typecheck      # tsc --noEmit
pnpm lint           # ESLint
```

---

## Les 7 Vues en Détail

### V1 — Centre de Contrôle

**Route :** `/`
**Refresh :** SSE temps réel (5 secondes)
**Objectif :** Vue d'ensemble instantanée de l'état du système.

```
┌─────────────────────────────────────────────────────────────────────┐
│  AXIOM DASHBOARD          [⚡ Actions: 3 urgentes]   [10:23:15 ✓]  │
├───────────┬─────────────────────────────────────────────────────────┤
│           │  CENTRE DE CONTRÔLE                                     │
│  V1 Home  │                                                         │
│  V2 Feed  │  ┌─────────────────┐  ┌─────────────────┐              │
│  V3 Prosp │  │ 🟢 VEILLEUR     │  │ 🟢 ENRICHISSEUR │              │
│  V4 Appel │  │ Scraping LinkedIn│  │ 12 leads en     │              │
│  V5 Deals │  │ 23 leads/h      │  │ attente         │              │
│  V6 Graph │  │ Dernière: 10:21 │  │ Dernière: 10:22 │              │
│  V7 Actes │  └─────────────────┘  └─────────────────┘              │
│           │                                                         │
│           │  ┌─────────────────┐  ┌─────────────────┐              │
│           │  │ 🟡 SCOREUR      │  │ 🟢 REDACTEUR    │              │
│           │  │ En attente leads│  │ 3 emails générés│              │
│           │  │ Dernière: 09:45 │  │ Dernière: 10:20 │              │
│           │  └─────────────────┘  └─────────────────┘              │
│           │                                                         │
│           │  ── Métriques du jour ──────────────────────────────── │
│           │  [47 Leads] [31 Enrichis] [8 HOT] [12 Emails] [3 Rép] │
│           │  [0.34€ LLM] [2 Marchés] [1 Deal]                      │
└───────────┴─────────────────────────────────────────────────────────┘
```

---

### V2 — Timeline Agents

**Route :** `/timeline`
**Refresh :** SSE temps réel (nouvelles entrées en tête)
**Objectif :** Fil d'activité chronologique de tous les agents.

```
┌─────────────────────────────────────────────────────────────────────┐
│  TIMELINE AGENTS                                                    │
│  [Tous les agents ▼] [Tous types ▼] [Toutes sévérités ▼] [Recherch│
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  10:23:15  🔍 VEILLEUR → ENRICHISSEUR                               │
│  Lead détecté: TechCorp SAS | Signal: Recrutement dev React        │
│  Pré-score: 65 | Source: LinkedIn                                  │
│  [Voir le lead →]  [Détails ▼]                                     │
│  ─────────────────────────────────────────────────────────────────  │
│  10:22:47  📊 ENRICHISSEUR → SCOREUR                                │
│  Lead enrichi: BuildSoft SARL | CA: 2.1M€ | Stack: WordPress      │
│  Contacts: 3 trouvés | Durée: 4.2s                                 │
│  [Voir le lead →]  [Détails ▼]                                     │
│  ─────────────────────────────────────────────────────────────────  │
│  10:22:31  🎯 SCOREUR → REDACTEUR                          [HOT]   │
│  Lead scoré: DevAgency Paris | Score: 87/100                       │
│  ICP:24 Signaux:28 Tech:22 Engage:13                               │
│  [Voir le lead →]  [Détails ▼]                                     │
│  ─────────────────────────────────────────────────────────────────  │
│  10:21:05  ✉️ REDACTEUR → SUIVEUR                                   │
│  Email généré: "Votre site perd 23% de CA" | Entreprise: WebShop  │
│  Modèle: claude-3-5-haiku | Coût: 0.0032€                         │
│  [Voir l'email →]  [Détails ▼]                                     │
│                                                                     │
│  [Charger 50 événements de plus]                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

### V3 — Prospects (CRM)

**Routes :** `/prospects` (liste) + `/prospects/:id` (fiche)
**Refresh :** TanStack Query (30s staleTime) + invalidation SSE sur LEAD_SCORED/RECLASSIFIED

```
┌─────────────────────────────────────────────────────────────────────┐
│  PROSPECTS CRM                          [Rechercher...] [Export CSV]│
│  [HOT ▼] [Segment ▼] [Période ▼]                                   │
├──────┬──────────────────┬──────────┬────────────┬───────────┬───────┤
│ Scr  │ Entreprise       │ Statut   │ Segment    │ Signal    │ Détec │
├──────┼──────────────────┼──────────┼────────────┼───────────┼───────┤
│  87  │ DevAgency Paris  │ 🔴 HOT   │ Agence Web │ Recrut.  │ Auj.  │
│  74  │ TechCorp SAS     │ 🔴 HOT   │ SaaS B2B   │ Levée fds│ Hier  │
│  61  │ BuildSoft SARL   │ 🟡 WARM  │ ESN        │ Job React│ 3j    │
│  45  │ WebShop Lyon     │ 🟡 WARM  │ E-commerce │ LightHse │ 1sem  │
│  23  │ StartupXY        │ ⚪ COLD  │ Startup    │ Presse   │ 2sem  │
├──────┴──────────────────┴──────────┴────────────┴───────────┴───────┤
│  [← Précédent]  Page 1/12  [Suivant →]          Affichage: 25 ▼    │
└─────────────────────────────────────────────────────────────────────┘

── Fiche Prospect (drill-down) ─────────────────────────────────────────
│ DevAgency Paris                              [HOT] [Score: 87/100]   │
│ Jean Dupont, CTO | jean@devagency.fr ✓ | +33 6 xx xx xx xx         │
├─ Scoring Détaillé ─────────────────────────────────────────────────  │
│  ICP:          ████████████████████░░░░  24/25                       │
│  Signaux:      ███████████████████████░  28/30                       │
│  Tech:         ████████████████████░░░░  22/25                       │
│  Engagement:   █████████████░░░░░░░░░░░  13/20                       │
│  Négatif:      -0  Total: 87/100                                     │
├─ Signaux Détectés ────────────────────────────────────────────────   │
│  🔥 Recrutement React (J-2)  ↑ fort                                  │
│  📈 Levée de fonds (J-15)    ↓ décroit                               │
│  🏆 Récompense innovation (J-30) ↓↓ faible                           │
├─ Historique Interactions ─────────────────────────────────────────   │
│  10:21 ✉️ Email envoyé "Votre site perd 23% de CA"                   │
│  09:45 🔍 Lead détecté + enrichi                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### V4 — Marchés Publics

**Routes :** `/tenders` (liste) + `/tenders/:id` (fiche)
**Refresh :** TanStack Query (60s staleTime) + invalidation SSE sur TENDER_SCORED/TENDER_STEP

```
┌─────────────────────────────────────────────────────────────────────┐
│  MARCHÉS PUBLICS                                                    │
│  [GO: 3] [POSSIBLE: 7] [NO-GO: 12]  [En prépa: 2]  [Soumis: 1]   │
├──────┬─────────────────────────────┬──────────┬──────────┬──────────┤
│ Scr  │ Objet                       │ Décision │ Deadline │ Montant  │
├──────┼─────────────────────────────┼──────────┼──────────┼──────────┤
│  82  │ Refonte site ministère X    │ ✅ GO    │ J-8      │ 120k€    │
│  71  │ Application mobile préfect  │ 🟡 POSS  │ J-15     │ 85k€     │
│  65  │ Portail citoyen commune Y   │ 🟡 POSS  │ J-22     │ 45k€     │
│  31  │ ERP collectivité Z          │ ❌ NO-GO │ J-5      │ 800k€    │
└──────┴─────────────────────────────┴──────────┴──────────┴──────────┘

── Fiche Marché (drill-down) ────────────────────────────────────────
│ Refonte site Ministère X           [GO] [Score: 82/100]  [J-8]    │
│ Réf: BOAMP-2026-00123 | Procédure: MAPA | Budget: 120k€           │
├─ Scoring GO/NO-GO ────────────────────────────────────────────────  │
│  Pertinence:      ████████████████░░░░  16/20                       │
│  Compétences:     ██████████████████░░  18/20                       │
│  Budget viable:   ███████████████░░░░░  15/20                       │
│  Concurrence:     ████████████░░░░░░░░  12/20  ← faible point       │
│  Délai réaliste:  ████████████████████  20/20  ← point fort         │
├─ Avancement Préparation ──────────────────────────────────────────  │
│  ✅ 9a - Analyse DCE complète           (J-30)                       │
│  ✅ 9b - Exigences extraites (47 items) (J-25)                       │
│  🔄 9c - Mémoire technique (en cours)  (J-15) ← AUJOURD'HUI         │
│  ◻  9d - Références clients                   (J-12)                │
│  ◻  9e - Prix et planning                     (J-10)                │
│  ◻  9f - Relecture et validation              (J-3)                 │
│  ◻  9g - Dépôt sur plateforme                (J-0)                  │
├─ Actions ─────────────────────────────────────────────────────────  │
│  [✅ Valider GO]  [❌ Forcer NO-GO]  [📝 Ajouter note]              │
└─────────────────────────────────────────────────────────────────────┘
```

---

### V5 — Pipeline Deals (Kanban)

**Route :** `/deals`
**Refresh :** TanStack Query (30s) + invalidation SSE sur DEAL_CREATED/DEAL_STAGE_CHANGE

```
┌─────────────────────────────────────────────────────────────────────┐
│  PIPELINE DEALS  │ CA Total: 347k€ │ Vélocité: 4.2k€/j │ Win:38% │
├─────────┬─────────┬──────────┬──────────┬──────────┬───────┬───────┤
│QUALIFIÉ │ DEVIS   │CONSIDÉR. │NÉGOCIAT. │ PRÊT SIG │SIGNÉ  │ PERDU │
│   (2)   │  (3)   │   (1)    │   (2)    │   (1)    │  (4)  │  (2)  │
├─────────┼─────────┼──────────┼──────────┼──────────┼───────┼───────┤
│┌───────┐│┌───────┐│          │┌────────┐│┌────────┐│       │       │
││DevAgcy│││WebS.fr│││          ││BuildSoft││TechCorp││       │       │
││45k€   │││28k€   │││          ││60k€    ││95k€    ││       │       │
││🔥 J+2 │││🔥 J+1 │││          ││🌡 J+8  ││🔥 J+0  ││       │       │
│└───────┘│└───────┘││          │└────────┘│└────────┘│       │       │
│┌───────┐│┌───────┐││          │┌────────┐│          │       │       │
││Startup│││ESN Lyo│││          ││Agency  ││          │       │       │
││12k€   │││35k€   │││          ││42k€    ││          │       │       │
││❄ J+14 │││🌡 J+5 │││          ││🔥 J+2  ││          │       │       │
│└───────┘│└───────┘││          │└────────┘│          │       │       │
└─────────┴─────────┴──────────┴──────────┴──────────┴───────┴───────┘
```

---

### V6 — Graph Agents

**Route :** `/graph`
**Refresh :** Polling 30s sur `/api/graph/agents`

```
┌─────────────────────────────────────────────────────────────────────┐
│  GRAPH AGENTS — Communications inter-agents (24 dernières heures)  │
│                                                                     │
│              ┌─────────────┐                                        │
│              │  VEILLEUR   │ ← 🟢 Actif                            │
│              │  23 leads/h │                                        │
│              └──────┬──────┘                                        │
│                     │ 23 msgs / 12KB                                │
│              ┌──────▼──────┐        ┌─────────────┐                │
│              │ENRICHISSEUR │──12ms──│   SCOREUR   │                │
│              │  12 leads   │  15msg │  8 HOT      │                │
│              └──────┬──────┘        └──────┬──────┘                │
│                     │ 8 msgs                │ 8 msgs               │
│              ┌──────▼──────┐        ┌──────▼──────┐                │
│              │  REDACTEUR  │───────►│   SUIVEUR   │                │
│              │  3 emails   │  3msg  │  1 réponse  │                │
│              └─────────────┘        └─────────────┘                │
│                                                                     │
│  [Hover arête → 5 derniers msgs]  [Clic noeud → détail agent]      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### V7 — Actions Rapides

**Route :** `/actions`
**Refresh :** SSE temps réel + polling 10s

```
┌─────────────────────────────────────────────────────────────────────┐
│  ACTIONS RAPIDES                       3 URGENTES  4 IMPORTANTES   │
├─────────────────────────────────────────────────────────────────────┤
│  🔴 URGENT — SLA: 3 min restantes                                   │
│  Jean Martin (DevAgency) a répondu "Très intéressé, pouvez-vous    │
│  me rappeler ?"                                                     │
│  [📞 Ouvrir prospect →]  [✅ Marquer traité]                        │
├─────────────────────────────────────────────────────────────────────┤
│  🔴 URGENT — SLA: 45 min restantes                                  │
│  Sarah Dupont (TechCorp) demande des informations sur vos tarifs   │
│  [✉️ Voir email →]  [📋 Ouvrir prospect →]  [✅ Marquer traité]      │
├─────────────────────────────────────────────────────────────────────┤
│  🟡 IMPORTANT — SLA: 6h restantes                                   │
│  Marché BOAMP-2026-00123 : Décision GO/NO-GO requise (deadline J-8)│
│  [📋 Voir le marché →]  [✅ GO]  [❌ NO-GO]                          │
├─────────────────────────────────────────────────────────────────────┤
│  🟡 IMPORTANT — SLA: 1h 20min restantes                             │
│  Devis BuildSoft SARL généré (60k€) — à vérifier avant envoi      │
│  [📄 Voir le devis →]  [📨 Envoyer]  [✏️ Modifier]                  │
├─────────────────────────────────────────────────────────────────────┤
│  🔵 NORMAL                                                          │
│  ESN Lyon reclassifié COLD → HOT (signal: +2 recrutements React)  │
│  [📋 Voir le prospect →]  [✅ Vu]                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Relation avec le Backend

### Architecture système

```
┌──────────────────────────────────────────────────────────┐
│                    AXIOM DASHBOARD                        │
│              React 19 + Vite 6 (port 5173)               │
│                                                          │
│  TanStack Query         React Context                    │
│  (server state)         (UI state)                       │
│       │                      │                           │
│       └──────────┬───────────┘                           │
│                  │                                        │
│         API Client (lib/api.ts)                          │
│         SSE Client (lib/sse.ts)                          │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP/SSE (port 3000)
┌──────────────────────▼───────────────────────────────────┐
│                  NESTJS 11 API                            │
│                                                          │
│  REST Endpoints         SSE Endpoints                    │
│  /api/agents/*          /api/events/stream               │
│  /api/prospects/*       /api/actions/stream              │
│  /api/tenders/*                                          │
│  /api/deals/*                                            │
│  /api/actions/*                                          │
│  /api/metrics/*                                          │
│  /api/graph/*                                            │
│       │                      │                           │
│  PostgreSQL 16          Redis 7 (pub/sub SSE)            │
│  (données métier)       (événements temps réel)          │
└──────────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│               10 AGENTS AUTONOMES                         │
│  Veilleur / Enrichisseur / Scoreur / Rédacteur / Suiveur │
│  Nurtureur / Analyste / Dealmaker / AO / CSM             │
└──────────────────────────────────────────────────────────┘
```

### Endpoints API consommés

| Endpoint | Méthode | Vue | Refresh |
|----------|---------|-----|---------|
| `/api/agents/status` | GET | V1 | SSE 5s |
| `/api/metrics/today` | GET | V1 | SSE 5s |
| `/api/events/stream` | GET (SSE) | V2 | Temps réel |
| `/api/events` | GET | V2 | SSE trigger |
| `/api/prospects` | GET | V3 | 30s stale |
| `/api/prospects/:id` | GET | V3 | 60s stale |
| `/api/prospects/:id/timeline` | GET | V3 | 60s stale |
| `/api/prospects/:id/score` | PATCH | V3 | mutation |
| `/api/tenders` | GET | V4 | 60s stale |
| `/api/tenders/:id` | GET | V4 | 60s stale |
| `/api/tenders/:id/decision` | PATCH | V4 | mutation |
| `/api/deals` | GET | V5 | 30s stale |
| `/api/deals/:id/stage` | PATCH | V5 | mutation |
| `/api/graph/agents` | GET | V6 | polling 30s |
| `/api/actions` | GET | V7 | SSE temps réel |
| `/api/actions/:id/complete` | PATCH | V7 | mutation |

### Authentification

Le dashboard utilise l'authentification JWT émise par NestJS, stockée dans un cookie `httpOnly` (pas de localStorage). Toutes les requêtes API incluent automatiquement le cookie. La session expire après 8 heures d'inactivité. Voir `01-architecture.md` pour les détails d'implémentation.

### Server-Sent Events

Le backend publie des événements SSE via Redis pub/sub vers un endpoint NestJS SSE. Le dashboard maintient une connexion SSE persistante qui :
1. Met à jour le cache TanStack Query en temps réel (pas de polling)
2. Affiche les nouvelles entrées en tête de la timeline V2
3. Met à jour les compteurs de la notification bell
4. Déclenche l'invalidation des requêtes concernées (ex: score prospect changé → invalider `/api/prospects/:id`)

---

## Brainstorm Source

Ce dashboard est issu du brainstorming documenté dans :
[`.claude/brainstorming/13-BRAINSTORM-DASHBOARD.md`](../../brainstorming/13-BRAINSTORM-DASHBOARD.md)

Le brainstorm contient :
- La justification des 7 vues et leur priorité d'implémentation
- Les schémas SQL des tables `agent_events` et `action_items`
- La liste complète des 20 types d'événements agents
- Les choix de stack technique et leurs justifications
- L'ordre recommandé d'implémentation (V7 → V2 → V3 → V1 → V4 → V5 → V6)
