# Brainstorm: Tableau de Bord Opérationnel Axiom

**Date :** 23 mars 2026
**Objectif :** Concevoir un dashboard interne complet pour visualiser l'activité des agents, les prospects, les marchés publics, et prendre des actions.

---

## Constat

La doc technique existante (05-OBSERVABILITE/01-tableau-de-bord.md) couvre le monitoring TECHNIQUE (health, latency, errors, costs). Ce qui manque est un **tableau de bord OPERATIONNEL BUSINESS** :

- Voir l'activité des agents comme un fil de conversation
- Retrouver n'importe quel prospect avec son historique complet
- Gérer les marchés publics (détectés, scorés, GO/NO-GO, avancement)
- Pipeline de deals visuels (Kanban)
- Actions urgentes à traiter (réponses INTERESSE, devis à valider, marchés à décider)

---

## 7 Vues Identifiées

### V1 — Centre de Contrôle (Home)

**Objectif :** En un coup d'oeil, voir le status de tous les agents et les métriques du jour.

**Contenu :**
- Carte de status par agent (🟢 Actif / 🟡 En attente / 🔴 Erreur / 🔵 Idle)
- Résumé textuel de ce que chaque agent fait MAINTENANT
- Dernière exécution + résultats (ex: "23 leads trouvés")
- Métriques du jour en bas : Leads / Enrichis / HOT / Emails / Réponses / Coût Claude / Marchés / Deals

**Données :** `agent_heartbeats` + `agent_executions` + `llm_calls` agrégés

**Refresh :** SSE toutes les 5 secondes

---

### V2 — Timeline Agents (Fil d'Activité)

**Objectif :** Voir chronologiquement TOUT ce que les agents font et se disent, comme un chat.

**Contenu :**
- Fil scrollable de toutes les actions inter-agents
- Chaque entrée montre : timestamp, agent source → agent destination, type d'action, résumé
- Détail expandable (payload complet, durée, coût, liens vers Langfuse)
- Filtrable par agent, type d'action, prospect, période, sévérité

**Format d'une entrée :**
```
[10:23:15] 🔍 VEILLEUR (1a) → ENRICHISSEUR
Lead détecté: TechCorp SAS | Signal: Recrutement dev React | Pré-score: 65
[Voir le lead →] [Voir la source →]
```

**Types d'événements à logger :**
| Type | Icône | Description |
|------|-------|-------------|
| LEAD_DETECTED | 🔍 | Nouveau lead brut détecté par un veilleur |
| LEAD_ENRICHED | 📊 | Lead enrichi avec données contact/entreprise/tech |
| LEAD_SCORED | 🎯 | Score calculé + catégorisation HOT/WARM/COLD |
| EMAIL_GENERATED | ✉️ | Email généré par Claude |
| EMAIL_SENT | 📨 | Email envoyé via Gmail/Mailgun |
| LINKEDIN_ACTION | 💼 | Connexion/message/like LinkedIn |
| REPLY_DETECTED | 🔔 | Réponse détectée et classifiée |
| REPLY_INTERESSE | 🔴 | Réponse positive — action requise |
| NURTURE_ACTION | 🌱 | Email nurture envoyé |
| RESCORE | 🔄 | Re-scoring périodique (6c) |
| RECLASSIFIED | ⬆️ | Prospect reclassifié (ex: COLD→HOT) |
| TENDER_DETECTED | 🏛️ | Marché public détecté |
| TENDER_SCORED | 📋 | Marché scoré GO/NO-GO |
| TENDER_STEP | ✅ | Étape de préparation AO complétée |
| DEAL_CREATED | 💰 | Nouveau deal dans le pipeline |
| DEAL_STAGE_CHANGE | ➡️ | Deal change d'étape |
| DEAL_SIGNED | 🎉 | Deal signé |
| DEAL_LOST | ❌ | Deal perdu |
| AGENT_ERROR | ⚠️ | Erreur agent |
| AGENT_STARTED | ▶️ | Agent démarré |
| AGENT_COMPLETED | ⏹️ | Agent terminé |
| COST_ALERT | 💸 | Alerte budget LLM |

**Données :** `agent_events` table (event sourcing)

**Schema SQL :**
```sql
CREATE TABLE agent_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  agent_source VARCHAR(30) NOT NULL,
  agent_destination VARCHAR(30),
  prospect_id UUID,
  tender_id UUID,
  deal_id UUID,
  summary TEXT NOT NULL,
  payload JSONB,
  payload_hash VARCHAR(64),
  duration_ms INTEGER,
  cost_eur DECIMAL(10,6),
  severity VARCHAR(10) DEFAULT 'info',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_events_type ON agent_events(event_type);
CREATE INDEX idx_agent_events_source ON agent_events(agent_source);
CREATE INDEX idx_agent_events_prospect ON agent_events(prospect_id);
CREATE INDEX idx_agent_events_tender ON agent_events(tender_id);
CREATE INDEX idx_agent_events_created ON agent_events(created_at DESC);
CREATE INDEX idx_agent_events_severity ON agent_events(severity) WHERE severity != 'info';
```

---

### V3 — Prospects (CRM Interne)

**Objectif :** Retrouver n'importe quel prospect avec tout son historique.

**Liste principale :**
- Tableau tri/filtrable : Score, Statut (HOT/WARM/COLD/DISQUAL), Entreprise, Contact, Segment, Signal principal, Date détection
- Recherche full-text sur nom, entreprise, email
- Filtres rapides : par catégorie, par segment, par période
- Export CSV

**Fiche prospect détaillée (drill-down) :**

| Section | Contenu |
|---------|---------|
| Infos Contact | Nom, poste, email (statut vérification), téléphone, LinkedIn |
| Infos Entreprise | SIRET, CA, effectifs, secteur, localisation, NAF |
| Données Techniques | Stack web, Lighthouse score, accessibilité RGAA |
| Scoring Détaillé | 4 barres de progression (ICP/Signaux/Tech/Engagement) + négatif + total |
| Signaux Détectés | Liste chronologique avec décroissance affichée |
| Historique Interactions | Timeline : emails envoyés/ouverts/répondus, actions LinkedIn, nurturing |
| Impact Estimé | Perte de CA estimée, coût RGAA, impact attribution |
| Actions Manuelles | Override score, disqualifier, forcer HOT, planifier RDV, ajouter note |

**Données :** `prospects` + `prospect_scores` + `email_sends` + `linkedin_actions` + `reply_classifications` + `nurture_interactions`

---

### V4 — Marchés Publics

**Objectif :** Gérer le pipeline des appels d'offres de la détection à la soumission.

**Liste principale :**
- Tableau : Score GO/NO-GO, Décision (GO/POSSIBLE/NO-GO), Acheteur, Objet, Montant estimé, Deadline, Statut préparation
- Filtres : par décision, par date limite, par montant
- Indicateurs pipeline : Détectés / Analysés / GO / En préparation / Soumis / En attente / Gagnés

**Fiche marché détaillée :**

| Section | Contenu |
|---------|---------|
| Informations Générales | Référence BOAMP, acheteur, objet, type procédure, montant, dates |
| Scoring GO/NO-GO | 7 barres de progression + Expected Value calculé |
| Avancement Préparation | Checklist 9a→9g avec statut (✅/◻/🔄) et dates |
| Retroplanning | Timeline J-31 → J0 avec jalons |
| Documents DCE | Liste des fichiers PDF avec statut d'analyse |
| Exigences Extraites | Liste des 30-50 exigences du CCTP avec scoring Axiom |
| Actions | Valider GO, Forcer NO-GO, Assigner à l'équipe, Ajouter note |

**Données :** `public_tenders` + `tender_dce_analysis` + `tender_scoring` + `tender_progress`

---

### V5 — Pipeline Deals (Kanban)

**Objectif :** Visualiser les deals en cours dans un Kanban drag-and-drop.

**Colonnes :**
1. QUALIFIÉ (RDV fait)
2. DEVIS ENVOYÉ
3. EN CONSIDÉRATION
4. NÉGOCIATION
5. PRÊT À SIGNER
6. SIGNÉ ✅
7. PERDU ❌

**Chaque carte affiche :**
- Nom entreprise + contact
- Montant du deal
- Jours depuis dernière action
- Prochaine action planifiée
- Indicateur de chaleur (chaud/tiède/froid basé sur engagement)

**Métriques en haut :**
- CA total en pipeline
- Vélocité (€/jour)
- Win rate (30 derniers jours)
- Cycle moyen (jours)

**Données :** `deals_crm` + `quotes` + `deal_interactions`

---

### V6 — Graph Agents (Visualisation Réseau)

**Objectif :** Voir visuellement comment les agents communiquent entre eux.

**Implémentation :** React Flow avec des noeuds personnalisés pour chaque agent.

**Chaque noeud affiche :**
- Nom de l'agent
- Status (couleur du bord : vert/jaune/rouge)
- Mini-métrique (ex: "23 leads" pour le Veilleur)

**Chaque arête affiche :**
- Nombre de messages (dernières 24h)
- Volume en octets
- Latence moyenne

**Interactivité :**
- Hover sur une arête → voir les 5 derniers messages
- Clic sur un noeud → ouvrir le détail de l'agent
- Clic sur une arête → filtrer la timeline sur cette connexion

**Données :** `agent_messages` agrégés par paire source/destination

---

### V7 — Actions Rapides (Command Center)

**Objectif :** Liste priorisée des actions à traiter par Jonathan.

**Types d'actions :**

| Priorité | Type | Description | SLA |
|----------|------|-------------|-----|
| 🔴 URGENT | REPLY_INTERESSE | Réponse positive d'un prospect | < 5 min |
| 🔴 URGENT | REPLY_INTERESSE_SOFT | Demande d'infos d'un prospect | < 1h |
| 🟡 IMPORTANT | TENDER_GO_DECISION | Marché public à valider GO/NO-GO | < 24h |
| 🟡 IMPORTANT | QUOTE_REVIEW | Devis généré à vérifier et envoyer | < 2h |
| 🟡 IMPORTANT | DEAL_STALLED | Deal sans action depuis 7+ jours | < 24h |
| 🔵 NORMAL | PROSPECT_RECLASSIFIED | Prospect passé de COLD → HOT | < 8h |
| 🔵 NORMAL | AGENT_ERROR | Agent en erreur nécessitant intervention | < 4h |
| ⚪ INFO | DAILY_DIGEST | Résumé quotidien des métriques | Lecture |

**Chaque action a :**
- Bouton d'action directe (Répondre, Valider, Voir)
- Lien vers l'entité concernée (prospect, marché, deal)
- Compteur de temps restant avant SLA

**Données :** `action_items` table avec statut (pending/done/expired)

```sql
CREATE TABLE action_items (
  id SERIAL PRIMARY KEY,
  type VARCHAR(30) NOT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  title TEXT NOT NULL,
  description TEXT,
  entity_type VARCHAR(20), -- prospect, tender, deal, agent
  entity_id UUID,
  sla_deadline TIMESTAMPTZ,
  status VARCHAR(10) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_by VARCHAR(30) -- agent qui a créé l'action
);

CREATE INDEX idx_action_items_status ON action_items(status) WHERE status = 'pending';
CREATE INDEX idx_action_items_priority ON action_items(priority, created_at);
```

---

## Stack Technique Dashboard

| Composant | Choix | Justification |
|-----------|-------|---------------|
| Framework | React 19 + Vite 6 + TypeScript | Performance, écosystème, types |
| CSS | Tailwind CSS v4 + shadcn/ui | Composants prêts, customisables |
| Tables | TanStack Table v8 | Tri, filtre, pagination, virtualisation |
| Graphe réseau | React Flow v12 | Interactif, maintenu, customisable |
| Charts | Recharts v2 | Simple, léger, React-native |
| Kanban | @hello-pangea/dnd | Fork maintenu de react-beautiful-dnd |
| Temps réel | SSE (EventSource API) | One-way, simple, reconnexion auto |
| State management | TanStack Query v5 | Cache, invalidation, polling, SSE |
| Routing | React Router v7 | Standard, bien maintenu |
| API backend | NestJS REST + SSE endpoints | Cohérent avec le backend agents |
| Embeds | Metabase (iframe) | Dashboards SQL existants |

---

## Endpoints API Nécessaires

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/agents/status` | GET | Status de tous les agents |
| `/api/agents/:id/events` | GET | Événements d'un agent (paginé) |
| `/api/events/stream` | GET (SSE) | Flux temps réel des événements |
| `/api/events` | GET | Timeline paginée avec filtres |
| `/api/prospects` | GET | Liste prospects (tri, filtre, search) |
| `/api/prospects/:id` | GET | Fiche prospect complète |
| `/api/prospects/:id/timeline` | GET | Historique interactions prospect |
| `/api/prospects/:id/score` | PATCH | Override score manuellement |
| `/api/tenders` | GET | Liste marchés publics |
| `/api/tenders/:id` | GET | Détail marché avec scoring |
| `/api/tenders/:id/decision` | PATCH | Valider GO/NO-GO |
| `/api/deals` | GET | Pipeline deals |
| `/api/deals/:id/stage` | PATCH | Changer l'étape d'un deal |
| `/api/actions` | GET | Actions en attente |
| `/api/actions/:id/complete` | PATCH | Marquer une action comme faite |
| `/api/metrics/today` | GET | Métriques du jour agrégées |
| `/api/graph/agents` | GET | Données du graphe agent (noeuds + arêtes) |

---

## Architecture Frontend

```
src/
├── app/
│   ├── layout.tsx
│   └── routes/
│       ├── index.tsx              — V1 Centre de Contrôle
│       ├── timeline.tsx           — V2 Timeline Agents
│       ├── prospects/
│       │   ├── index.tsx          — V3 Liste prospects
│       │   └── [id].tsx           — V3 Fiche prospect
│       ├── tenders/
│       │   ├── index.tsx          — V4 Liste marchés
│       │   └── [id].tsx           — V4 Fiche marché
│       ├── deals.tsx              — V5 Pipeline Kanban
│       ├── graph.tsx              — V6 Graph agents
│       └── actions.tsx            — V7 Actions rapides
├── components/
│   ├── agents/
│   │   ├── AgentCard.tsx          — Carte status agent
│   │   ├── AgentTimeline.tsx      — Timeline d'un agent
│   │   └── AgentGraph.tsx         — Graph React Flow
│   ├── prospects/
│   │   ├── ProspectTable.tsx      — Table TanStack
│   │   ├── ProspectCard.tsx       — Fiche détaillée
│   │   ├── ScoreBreakdown.tsx     — Barres 4 axes
│   │   └── SignalList.tsx         — Liste signaux avec decay
│   ├── tenders/
│   │   ├── TenderTable.tsx        — Table marchés
│   │   ├── TenderCard.tsx         — Fiche marché
│   │   ├── TenderScoring.tsx      — Barres 7 critères
│   │   └── TenderProgress.tsx     — Checklist 9a→9g
│   ├── deals/
│   │   ├── DealKanban.tsx         — Kanban drag-and-drop
│   │   └── DealCard.tsx           — Carte deal
│   ├── shared/
│   │   ├── EventCard.tsx          — Carte événement timeline
│   │   ├── ActionItem.tsx         — Item action rapide
│   │   ├── StatusBadge.tsx        — Badge 🟢/🟡/🔴/🔵
│   │   └── MetricCard.tsx         — Mini-carte métrique
│   └── layout/
│       ├── Sidebar.tsx            — Navigation latérale
│       ├── Header.tsx             — Barre supérieure
│       └── NotificationBell.tsx   — Cloche notifications
├── hooks/
│   ├── useAgentEvents.ts          — SSE pour événements temps réel
│   ├── useProspects.ts            — TanStack Query prospects
│   ├── useTenders.ts              — TanStack Query marchés
│   └── useActionItems.ts          — TanStack Query actions
├── lib/
│   ├── api.ts                     — Client API fetch/axios
│   └── sse.ts                     — Helper Server-Sent Events
└── types/
    ├── agent.ts                   — Types agents
    ├── prospect.ts                — Types prospects
    ├── tender.ts                  — Types marchés
    └── deal.ts                    — Types deals
```

---

## Prochaines Étapes

1. **Créer le projet React** (Vite + Tailwind + shadcn/ui)
2. **Implémenter V7 (Actions Rapides)** — le plus utile immédiatement
3. **Implémenter V2 (Timeline)** — visibilité sur l'activité
4. **Implémenter V3 (Prospects)** — CRM interne
5. **Implémenter V1 (Centre de Contrôle)** — vue globale
6. **Implémenter V4 (Marchés)** — Phase 4
7. **Implémenter V5 (Deals Kanban)** — Phase 4
8. **Implémenter V6 (Graph)** — cerise sur le gâteau
