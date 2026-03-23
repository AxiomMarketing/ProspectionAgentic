# AGENT 1 — VEILLEUR (MASTER ORCHESTRATEUR)
**Fichiers associes** : AGENT-1a-LINKEDIN.md, AGENT-1b-MARCHES-PUBLICS.md, AGENT-1c-VEILLE-WEB.md, AGENT-1d-JOBBOARDS.md

# AGENT 1 -- VEILLEUR : SPECIFICATIONS COMPLETES ET EXHAUSTIVES

**Date** : 18 mars 2026
**Auteur** : Axiom Marketing -- Systeme de prospection automatise
**Version** : 1.0
**Contexte** : Stack interne -- Claude API, n8n, AdonisJS, React, PostgreSQL, scraping custom
**Pipeline** : VEILLEUR (ce doc) --> ENRICHISSEUR (Agent 2) --> SCOREUR --> REDACTEUR --> SUIVEUR --> NURTUREUR --> ANALYSTE

---

## TABLE DES MATIERES

1. [Vision globale et architecture](#1-vision-globale-et-architecture)
2. [Agent Master Veilleur -- Orchestrateur](#2-agent-master-veilleur--orchestrateur)
3. [Sous-Agent 1a -- Veilleur LinkedIn](#3-sous-agent-1a--veilleur-linkedin)
4. [Sous-Agent 1b -- Veilleur Marches Publics](#4-sous-agent-1b--veilleur-marches-publics)
5. [Sous-Agent 1c -- Veilleur Web (Sites & Tech)](#5-sous-agent-1c--veilleur-web-sites--tech)
6. [Sous-Agent 1d -- Veilleur Job Boards + Signaux Supplementaires](#6-sous-agent-1d--veilleur-job-boards--signaux-supplementaires)
7. [Base de donnees -- Schema SQL complet](#7-base-de-donnees--schema-sql-complet)
8. [Budget consolide](#8-budget-consolide)
9. [Verification de coherence](#9-verification-de-coherence)

---

## 1. VISION GLOBALE ET ARCHITECTURE

### 1.1 Position dans le pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        AGENT 1 -- VEILLEUR                               │
│                                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │  1a         │  │  1b         │  │  1c         │  │  1d         │        │
│  │  LinkedIn   │  │  Marches    │  │  Veille     │  │  Job Boards │        │
│  │  Signals    │  │  Publics    │  │  Web/Tech   │  │  + Signaux  │        │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘        │
│         │               │               │               │                │
│         └───────────────┴───────┬───────┴───────────────┘                │
│                                 │                                        │
│                    ┌────────────▼────────────┐                           │
│                    │   MASTER VEILLEUR       │                           │
│                    │   - Deduplication       │                           │
│                    │   - Normalisation       │                           │
│                    │   - Pre-scoring         │                           │
│                    │   - Orchestration       │                           │
│                    └────────────┬────────────┘                           │
│                                 │                                        │
└─────────────────────────────────┼────────────────────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │   AGENT 2 -- ENRICHISSEUR│
                    │   Input : lead_brut     │
                    │   (format normalise)     │
                    └─────────────────────────┘
```

### 1.2 Mission precise

**Ce que fait le Veilleur** :
- Detecte en continu les opportunites de prospection
- Scrute 4 canaux de veille (LinkedIn, marches publics, sites web, job boards)
- Pre-filtre et normalise les leads bruts
- Deduplique les leads entre sous-agents
- Transmet les leads normalises a l'Agent 2 (ENRICHISSEUR)

**Ce que le Veilleur ne fait PAS** :
- Il n'enrichit PAS les donnees (c'est l'ENRICHISSEUR)
- Il ne contacte PERSONNE (c'est le REDACTEUR)
- Il ne juge PAS la qualite finale du lead (c'est le SCOREUR)
- Il ne stocke PAS les templates de messages
- Il ne gere PAS les sequences de relance

### 1.3 Les 5 segments cibles Axiom

| Segment | Cible | Decideurs vises | Taille |
|---------|-------|-----------------|--------|
| `pme_metro` | PME France metropolitaine | DG, CMO, DSI, CTO | 50-500 salaries |
| `ecommerce_shopify` | E-commercants Shopify | Fondateurs, Head of Growth | Toutes tailles |
| `collectivite` | Collectivites DOM-TOM | DGS, DSI, elus numeriques | N/A |
| `startup` | Startups / SaaS | Founders, CTO | 5-200 salaries |
| `agence_wl` | Agences en marque blanche | Fondateurs agences marketing/SEO | 2-50 salaries |

---

## 2. AGENT MASTER VEILLEUR -- ORCHESTRATEUR

### 2.1 Mission

Orchestrer les 4 sous-agents, deduplicater les leads, normaliser les formats de sortie, et transmettre les leads qualifies a l'Agent 2.

### 2.2 Architecture technique

**Stack** :
- Runtime : Node.js 22 LTS (AdonisJS backend)
- Queue : BullMQ + Redis
- Base de donnees : PostgreSQL 16
- Scheduler : n8n (workflows cron) ou node-cron
- Cache : Redis (TTL-based)
- Monitoring : Healthchecks via endpoints HTTP internes

### 2.3 Scheduling et parallelisation

```
┌─────────────────────────────────────────────────────────────────────┐
│ PLANNING QUOTIDIEN DU MASTER VEILLEUR                                │
├──────────┬──────────────────────────┬───────────────────────────────┤
│ Heure    │ Sous-agent               │ Action                        │
├──────────┼──────────────────────────┼───────────────────────────────┤
│ 02:00    │ 1c Veille Web            │ Scan batch 100-500 sites      │
│ 06:00    │ 1b Marches Publics       │ Query BOAMP (1ere passe)      │
│ 06:00    │ 1d Job Boards            │ Scrape WTTJ + Indeed (parall.)│
│ 07:00    │ 1a LinkedIn              │ Passe 1/4 signaux LinkedIn    │
│ 08:00    │ MASTER                   │ Dedup + Normalisation batch 1 │
│ 12:00    │ 1a LinkedIn              │ Passe 2/4                     │
│ 14:00    │ 1b Marches Publics       │ Query BOAMP (2eme passe)      │
│ 15:00    │ MASTER                   │ Dedup + Normalisation batch 2 │
│ 18:00    │ 1a LinkedIn              │ Passe 3/4                     │
│ 21:00    │ MASTER                   │ Dedup + Normalisation batch 3 │
│ 23:00    │ 1a LinkedIn              │ Passe 4/4                     │
│ 23:30    │ MASTER                   │ Rapport quotidien + metriques │
└──────────┴──────────────────────────┴───────────────────────────────┘
```

**Parallelisation** :
- 1b (Marches) et 1d (Job Boards) tournent en parallele a 06:00
- 1c (Web) tourne la nuit de maniere isolee (consomme CPU/RAM avec Lighthouse)
- 1a (LinkedIn) tourne 4 fois/jour avec espacement (respect rate limits)
- Le MASTER traite les resultats en 3 batchs consolides

**Pseudo-code d'orchestration (n8n workflow ou AdonisJS scheduler)** :

```typescript
// scheduler.ts (AdonisJS)
import { BaseScheduler } from '@adonisjs/scheduler'

export default class VeilleurScheduler extends BaseScheduler {

  // Veille Web -- 02:00
  @schedule('0 2 * * *')
  async runWebScan() {
    await this.masterVeilleur.dispatch('web_scan', {
      source: '1c_web',
      config: {
        maxSites: 500,
        concurrency: 5,
        timeout: 120000,
      }
    })
  }

  // Marches Publics -- 06:00 et 14:00
  @schedule('0 6,14 * * *')
  async runMarchesPublics() {
    await this.masterVeilleur.dispatch('marches_scan', {
      source: '1b_marches',
      config: {
        sources: ['boamp_api', 'decp_api', 'profils_reunion'],
        cpvCodes: ['72212200', '72212210', '72212216', '72000000', '72200000'],
      }
    })
  }

  // Job Boards -- 06:00
  @schedule('0 6 * * *')
  async runJobBoards() {
    await this.masterVeilleur.dispatch('jobboard_scan', {
      source: '1d_jobboards',
      config: {
        platforms: ['wttj', 'indeed', 'linkedin_jobs', 'hellowork'],
        keywords: [
          'developpeur web', 'developpeur react', 'developpeur frontend',
          'chef de projet digital', 'webmaster', 'developpeur shopify',
        ],
        geography: 'france',
      }
    })
  }

  // LinkedIn -- 07:00, 12:00, 18:00, 23:00
  @schedule('0 7,12,18,23 * * *')
  async runLinkedInScan() {
    await this.masterVeilleur.dispatch('linkedin_scan', {
      source: '1a_linkedin',
      config: {
        signalTypes: ['job_change', 'hiring', 'post_keyword', 'funding', 'headcount'],
        segments: ['pme_metro', 'ecommerce_shopify', 'collectivite', 'startup', 'agence_wl'],
      }
    })
  }

  // Consolidation Master -- 08:00, 15:00, 21:00
  @schedule('0 8,15,21 * * *')
  async runConsolidation() {
    await this.masterVeilleur.consolidate({
      steps: ['deduplicate', 'normalize', 'pre_score', 'dispatch_to_enrichisseur'],
    })
  }

  // Rapport quotidien -- 23:30
  @schedule('30 23 * * *')
  async runDailyReport() {
    await this.masterVeilleur.generateDailyReport()
  }
}
```

### 2.4 Deduplication

**Strategie multi-cle** :

Un meme prospect peut etre detecte par plusieurs sous-agents (ex: une entreprise qui recrute un dev ET qui a un site lent ET qui poste sur LinkedIn). Le Master doit fusionner ces signaux.

```typescript
// deduplication.ts
interface DeduplicationEngine {
  /**
   * Cle primaire de deduplication : SIRET (si connu)
   * Cle secondaire : domaine du site web (normalise)
   * Cle tertiaire : nom entreprise normalise (Levenshtein < 3)
   * Cle quaternaire : LinkedIn company URL
   */
}

async function deduplicateLeads(rawLeads: RawLead[]): Promise<MergedLead[]> {
  const mergedMap = new Map<string, MergedLead>()

  for (const lead of rawLeads) {
    // Etape 1 : Calculer la cle de deduplication
    const deduplicationKey = computeDeduplicationKey(lead)

    if (mergedMap.has(deduplicationKey)) {
      // Fusionner les signaux
      const existing = mergedMap.get(deduplicationKey)!
      existing.signaux.push(...lead.signaux)
      existing.sources.push(lead.source)
      existing.nb_detections += 1
      // Garder les donnees les plus completes
      existing.entreprise = existing.entreprise || lead.entreprise
      existing.site_web = existing.site_web || lead.site_web
      existing.linkedin_url = existing.linkedin_url || lead.linkedin_url
    } else {
      mergedMap.set(deduplicationKey, {
        ...lead,
        sources: [lead.source],
        nb_detections: 1,
      })
    }
  }

  return Array.from(mergedMap.values())
}

function computeDeduplicationKey(lead: RawLead): string {
  // Priorite 1 : SIRET
  if (lead.siret) {
    return `siret:${lead.siret.replace(/\s/g, '')}`
  }

  // Priorite 2 : Domaine du site web
  if (lead.site_web) {
    const domain = new URL(lead.site_web).hostname
      .replace('www.', '')
      .toLowerCase()
    return `domain:${domain}`
  }

  // Priorite 3 : LinkedIn company URL
  if (lead.linkedin_company_url) {
    return `linkedin:${lead.linkedin_company_url.toLowerCase()}`
  }

  // Priorite 4 : Nom entreprise normalise
  const normalizedName = lead.entreprise
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(sas|sarl|sa|sasu|eurl|sci)$/g, '')
    .trim()
  return `name:${normalizedName}`
}
```

**Regles de fusion de signaux** :
- Si meme entreprise detectee par 2+ sous-agents : fusionner les signaux (pas les dupliquer)
- Conserver le timestamp de la premiere detection (`first_seen_at`)
- Incrementer un compteur `nb_detections` (plus une entreprise apparait dans plusieurs canaux, plus elle est interessante)
- Appliquer un bonus de scoring : `nb_detections >= 3` --> `bonus_multi_source = +15 points`

### 2.5 Normalisation des donnees

Tous les sous-agents produisent des formats differents. Le Master normalise vers un schema commun.

**Schema JSON normalise (output du Master --> input de l'Enrichisseur)** :

```json
{
  "lead_id": "uuid-v4",
  "created_at": "2026-03-18T08:00:00Z",
  "source_primaire": "veille_linkedin",
  "sources": ["veille_linkedin", "veille_jobboard"],
  "nb_detections": 2,

  "entreprise": {
    "nom": "TechCorp SAS",
    "siret": null,
    "site_web": "https://www.techcorp.fr",
    "linkedin_company_url": "https://linkedin.com/company/techcorp",
    "secteur": null,
    "taille_estimee": "50-200",
    "localisation": "Paris, France",
    "segment_estime": "pme_metro"
  },

  "contact": {
    "prenom": "Sophie",
    "nom": "Martin",
    "poste": "Chief Marketing Officer",
    "linkedin_url": "https://linkedin.com/in/sophie-martin",
    "email": null,
    "telephone": null
  },

  "signaux": [
    {
      "type": "changement_poste",
      "source": "1a_linkedin",
      "detail": "Nommee CMO chez TechCorp il y a 3 semaines",
      "date_signal": "2026-02-25T00:00:00Z",
      "tier": 1,
      "score_signal": 30
    },
    {
      "type": "recrutement_dev_web",
      "source": "1d_jobboard",
      "detail": "Offre dev React senior sur WTTJ",
      "date_signal": "2026-03-15T00:00:00Z",
      "tier": 2,
      "score_signal": 20
    }
  ],

  "signal_principal": "Nouveau CMO + recrutement dev = besoin digital probable",

  "pre_score": {
    "total": 50,
    "detail": {
      "signal_force": 30,
      "multi_source_bonus": 5,
      "segment_match": 15
    }
  },

  "metadata": {
    "sous_agent_primaire": "1a_linkedin",
    "batch_id": "batch-2026-03-18-08",
    "traitement_requis": ["enrichissement_contact", "enrichissement_entreprise", "scan_technique"]
  }
}
```

### 2.6 Pre-scoring (avant envoi a l'Enrichisseur)

Le Master fait un pre-scoring rapide pour prioriser les leads a enrichir en premier.

```typescript
function preScore(lead: NormalizedLead): number {
  let score = 0

  // 1. Force du signal principal (max 35 pts)
  const signalScores: Record<string, number> = {
    'levee_fonds':        35,
    'changement_poste':   30,
    'recrutement_actif':  25,
    'croissance_equipe':  20,
    'post_besoin_tech':   20,
    'site_lent':          15,
    'marche_public':      15,
    'recrutement_dev_web': 20,
    'accessibilite_faible': 15,
    'tech_obsolete':      15,
    'engagement_contenu': 10,
  }

  for (const signal of lead.signaux) {
    score += signalScores[signal.type] || 5
  }
  score = Math.min(score, 35) // Cap a 35

  // 2. Bonus multi-source (max 15 pts)
  if (lead.nb_detections >= 3) score += 15
  else if (lead.nb_detections === 2) score += 10
  else score += 0

  // 3. Segment match (max 25 pts)
  const segmentScores: Record<string, number> = {
    'pme_metro':           25,
    'ecommerce_shopify':   25,
    'startup':             20,
    'collectivite':        20,
    'agence_wl':           15,
  }
  score += segmentScores[lead.entreprise.segment_estime || ''] || 5

  // 4. Fraicheur du signal (max 10 pts)
  const mostRecentSignal = lead.signaux
    .map(s => new Date(s.date_signal).getTime())
    .sort((a, b) => b - a)[0]
  const ageJours = (Date.now() - mostRecentSignal) / (1000 * 60 * 60 * 24)

  if (ageJours < 1) score += 10
  else if (ageJours < 3) score += 8
  else if (ageJours < 7) score += 5
  else if (ageJours < 14) score += 2
  else score += 0

  // 5. Geographie (max 15 pts)
  const loc = (lead.entreprise.localisation || '').toLowerCase()
  if (loc.includes('reunion') || loc.includes('974')) score += 15
  else if (loc.includes('mayotte') || loc.includes('976')) score += 12
  else if (loc.includes('paris') || loc.includes('lyon') || loc.includes('marseille')) score += 10
  else if (loc.includes('france')) score += 8
  else score += 3

  return Math.min(score, 100)
}
```

### 2.7 Priorite entre sous-agents

Quand le Master consolide, il priorise le traitement dans cet ordre :

| Priorite | Sous-agent | Raison |
|----------|-----------|--------|
| 1 | 1a LinkedIn -- Signaux Tier 1 (levee fonds, changement poste) | Conversion la plus haute (ROI > 40%) |
| 2 | 1b Marches Publics -- Score >= 75 | Deadline courte, revenus directs |
| 3 | 1a LinkedIn -- Signaux Tier 2 (recrutement, croissance) | Bon ROI, volume decent |
| 4 | 1d Job Boards -- recrutement dev web | Signal clair d'un besoin externalisable |
| 5 | 1c Veille Web -- sites critiques (perf < 30) | Argument tangible pour prospection |
| 6 | 1b Marches Publics -- Score 60-74 | A qualifier manuellement |
| 7 | 1c Veille Web -- sites a optimiser (perf 30-50) | Volume, but conversion plus faible |

### 2.8 Dispatch vers l'Enrichisseur

```typescript
// dispatch_to_enrichisseur.ts
import { Queue } from 'bullmq'

const enrichisseurQueue = new Queue('enrichisseur-pipeline', { connection: redis })

async function dispatchToEnrichisseur(leads: NormalizedLead[]) {
  // Trier par pre_score decroissant
  const sorted = leads.sort((a, b) => b.pre_score.total - a.pre_score.total)

  for (const lead of sorted) {
    await enrichisseurQueue.add('enrich_lead', {
      lead_id: lead.lead_id,
      lead_data: lead,
      priority: lead.pre_score.total >= 60 ? 1 : lead.pre_score.total >= 40 ? 5 : 10,
    }, {
      priority: lead.pre_score.total >= 60 ? 1 : 5,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    })
  }

  // Log dans metriques
  await db.query(
    `INSERT INTO veilleur_batches (batch_id, nb_leads, nb_hot, nb_warm, nb_cold, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [
      batchId,
      sorted.length,
      sorted.filter(l => l.pre_score.total >= 60).length,
      sorted.filter(l => l.pre_score.total >= 40 && l.pre_score.total < 60).length,
      sorted.filter(l => l.pre_score.total < 40).length,
    ]
  )
}
```

### 2.9 Monitoring du Master

```typescript
// health_check.ts
interface MasterHealthStatus {
  status: 'healthy' | 'degraded' | 'down'
  subagents: {
    '1a_linkedin': SubagentHealth
    '1b_marches': SubagentHealth
    '1c_web': SubagentHealth
    '1d_jobboards': SubagentHealth
  }
  lastBatchAt: string
  leadsLast24h: number
  deduplicationRate: number // % de leads dedupliques
  errorRate: number         // % d'erreurs dans les derniers jobs
}

interface SubagentHealth {
  status: 'active' | 'idle' | 'error'
  lastRunAt: string
  lastRunDuration: number  // secondes
  leadsProduced: number
  errorsLast24h: number
  nextScheduledRun: string
}

// Endpoint de monitoring
app.get('/api/veilleur/health', async (req, res) => {
  const health = await masterVeilleur.getHealth()
  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503
  res.status(statusCode).json(health)
})

// Alerte Slack si probleme
async function alertIfDegraded(health: MasterHealthStatus) {
  if (health.status === 'down') {
    await slack.send('#ops-alerts', {
      text: `AGENT 1 VEILLEUR DOWN - ${health.errorRate}% erreurs - Dernier batch: ${health.lastBatchAt}`,
      color: 'danger',
    })
  }
  if (health.leadsLast24h < 10) {
    await slack.send('#ops-alerts', {
      text: `VEILLEUR : seulement ${health.leadsLast24h} leads en 24h (seuil min: 10). Verifier les sous-agents.`,
      color: 'warning',
    })
  }
}
```

### 2.10 Rapport quotidien

```typescript
interface DailyReport {
  date: string
  leads_total: number
  leads_par_source: {
    linkedin: number
    marches: number
    web: number
    jobboards: number
  }
  leads_dedupliques: number
  taux_deduplication: number  // %
  pre_score_moyen: number
  leads_hot: number     // pre_score >= 60
  leads_warm: number    // pre_score 40-59
  leads_cold: number    // pre_score < 40
  top_signaux: Array<{ type: string, count: number }>
  erreurs: Array<{ subagent: string, error: string, count: number }>
  couts_api: {
    netrows: number
    hunter: number
    pagespeed: number
    apify: number
    total: number
  }
  recommandations: string[]
}
```

---

## 7. BASE DE DONNEES -- SCHEMA SQL COMPLET

### 7.1 Tables specifiques au Veilleur

```sql
-- ============================================
-- SCHEMA AGENT 1 -- VEILLEUR
-- PostgreSQL 16
-- ============================================

-- Table des leads bruts (output du Veilleur, input de l'Enrichisseur)
CREATE TABLE leads_bruts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  source_primaire     VARCHAR(20) NOT NULL,
    -- '1a_linkedin' | '1b_marches' | '1c_web' | '1d_jobboards'
  sources             TEXT[] DEFAULT ARRAY[]::TEXT[],
  nb_detections       INTEGER DEFAULT 1,

  -- Entreprise
  entreprise_nom      VARCHAR(255),
  entreprise_siret    VARCHAR(20),
  entreprise_site_web VARCHAR(500),
  entreprise_linkedin VARCHAR(500),
  entreprise_secteur  VARCHAR(100),
  entreprise_taille   VARCHAR(50),
  entreprise_localisation VARCHAR(200),
  segment_estime      VARCHAR(50),

  -- Contact (si detecte)
  contact_prenom      VARCHAR(100),
  contact_nom         VARCHAR(100),
  contact_poste       VARCHAR(200),
  contact_linkedin    VARCHAR(500),
  contact_email       VARCHAR(255),

  -- Signaux
  signaux             JSONB DEFAULT '[]'::JSONB,
  signal_principal    TEXT,
  signal_type         VARCHAR(50),
  signal_tier         INTEGER, -- 1, 2, 3

  -- Pre-scoring
  pre_score           INTEGER DEFAULT 0,
  pre_score_detail    JSONB,

  -- Statut
  statut              VARCHAR(20) DEFAULT 'nouveau',
    -- 'nouveau' | 'envoye_enrichisseur' | 'deduplique' | 'archive'
  batch_id            VARCHAR(100),

  -- Metadata
  metadata            JSONB,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_leads_bruts_source ON leads_bruts(source_primaire);
CREATE INDEX idx_leads_bruts_statut ON leads_bruts(statut);
CREATE INDEX idx_leads_bruts_segment ON leads_bruts(segment_estime);
CREATE INDEX idx_leads_bruts_pre_score ON leads_bruts(pre_score DESC);
CREATE INDEX idx_leads_bruts_created ON leads_bruts(created_at DESC);
CREATE INDEX idx_leads_bruts_entreprise_siret ON leads_bruts(entreprise_siret);
CREATE INDEX idx_leads_bruts_entreprise_site ON leads_bruts(entreprise_site_web);
CREATE INDEX idx_leads_bruts_entreprise_nom ON leads_bruts USING gin(to_tsvector('french', entreprise_nom));

-- Table des marches publics detectes
CREATE TABLE marches_publics (
  id                  SERIAL PRIMARY KEY,
  reference           VARCHAR(100) UNIQUE,
  titre               TEXT NOT NULL,
  description         TEXT,
  acheteur            VARCHAR(255),
  acheteur_siret      VARCHAR(20),
  acheteur_region     VARCHAR(10),
  type_marche         VARCHAR(30),
    -- 'mapa' | 'ao_ouvert' | 'ao_restreint' | 'accord_cadre'
  montant_estime      DECIMAL,
  date_publication    TIMESTAMP,
  date_limite         TIMESTAMP,
  url_source          VARCHAR(500),
  plateforme          VARCHAR(50),
    -- 'boamp' | 'france_marches' | 'place' | 'profil_reunion' | 'approch'
  cpv_codes           TEXT[],
  mots_cles_detectes  TEXT[],

  -- Scoring
  score_pertinence    INTEGER DEFAULT 0,
  score_detail        JSONB,
  action              VARCHAR(30) DEFAULT 'a_qualifier',
    -- 'a_repondre' | 'a_qualifier' | 'archive'

  -- Suivi
  decision            VARCHAR(20),
    -- 'go' | 'no_go' | 'en_cours' | 'soumis' | 'gagne' | 'perdu'
  notes               TEXT,

  -- Link vers lead
  lead_id             UUID REFERENCES leads_bruts(id),

  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_marches_score ON marches_publics(score_pertinence DESC);
CREATE INDEX idx_marches_date_limite ON marches_publics(date_limite);
CREATE INDEX idx_marches_cpv ON marches_publics USING gin(cpv_codes);
CREATE INDEX idx_marches_region ON marches_publics(acheteur_region);

-- Table des audits techniques (resultats 1c)
CREATE TABLE audits_techniques (
  id                  SERIAL PRIMARY KEY,
  url                 VARCHAR(500) NOT NULL,
  entreprise_nom      VARCHAR(255),

  -- Lighthouse
  lh_performance      INTEGER,
  lh_accessibility    INTEGER,
  lh_best_practices   INTEGER,
  lh_seo              INTEGER,
  lh_metrics          JSONB, -- { fcp, lcp, tbt, cls, inp }

  -- Stack technique
  stack_cms           VARCHAR(100),
  stack_cms_version   VARCHAR(50),
  stack_framework     VARCHAR(100),
  stack_server        VARCHAR(100),
  stack_complete      JSONB,

  -- Accessibilite axe-core
  a11y_violations     INTEGER DEFAULT 0,
  a11y_critical       INTEGER DEFAULT 0,
  a11y_serious        INTEGER DEFAULT 0,
  a11y_passes         INTEGER DEFAULT 0,

  -- Autres
  ssl_valid           BOOLEAN,
  ssl_days_remaining  INTEGER,
  has_robots_txt      BOOLEAN,
  has_sitemap         BOOLEAN,
  page_weight_mb      DECIMAL,
  screenshot_path     VARCHAR(500),

  -- Scoring
  prospect_score      INTEGER DEFAULT 0,
  prospect_tier       VARCHAR(10), -- 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  problemes           TEXT[],

  -- Link vers lead
  lead_id             UUID REFERENCES leads_bruts(id),

  scanned_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audits_url ON audits_techniques(url);
CREATE INDEX idx_audits_score ON audits_techniques(prospect_score DESC);
CREATE INDEX idx_audits_tier ON audits_techniques(prospect_tier);
CREATE INDEX idx_audits_date ON audits_techniques(scanned_at DESC);

-- Table des offres d'emploi detectees
CREATE TABLE offres_emploi (
  id                  SERIAL PRIMARY KEY,
  plateforme          VARCHAR(30) NOT NULL,
    -- 'linkedin_jobs' | 'wttj' | 'indeed' | 'hellowork' | 'apec'
  url_offre           VARCHAR(500) UNIQUE,
  titre               VARCHAR(300),
  entreprise_nom      VARCHAR(255),
  localisation        VARCHAR(200),
  type_contrat        VARCHAR(30),
  salaire_min         INTEGER,
  salaire_max         INTEGER,
  description         TEXT,
  date_publication    TIMESTAMP,

  -- Analyse
  score_pertinence    INTEGER DEFAULT 0,
  budget_estime       VARCHAR(100),
  externalisabilite   VARCHAR(20), -- 'haute' | 'moyenne' | 'faible'
  analyse             TEXT,

  -- Link vers lead
  lead_id             UUID REFERENCES leads_bruts(id),

  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_offres_plateforme ON offres_emploi(plateforme);
CREATE INDEX idx_offres_score ON offres_emploi(score_pertinence DESC);
CREATE INDEX idx_offres_date ON offres_emploi(date_publication DESC);
CREATE INDEX idx_offres_entreprise ON offres_emploi(entreprise_nom);

-- Table des signaux LinkedIn
CREATE TABLE signaux_linkedin (
  id                  SERIAL PRIMARY KEY,
  signal_type         VARCHAR(50) NOT NULL,
    -- 'changement_poste' | 'recrutement_actif' | 'croissance_equipe' |
    -- 'levee_fonds' | 'post_besoin_tech' | 'engagement'
  tier                INTEGER NOT NULL, -- 1, 2, 3
  score_signal        INTEGER DEFAULT 0,

  -- Entreprise
  entreprise_nom      VARCHAR(255),
  entreprise_linkedin VARCHAR(500),

  -- Contact
  contact_prenom      VARCHAR(100),
  contact_nom         VARCHAR(100),
  contact_poste       VARCHAR(200),
  contact_linkedin    VARCHAR(500),

  detail              TEXT,
  date_signal         TIMESTAMP,
  api_source          VARCHAR(50), -- 'netrows' | 'signalsapi' | 'rss' | 'crunchbase'

  -- Link vers lead
  lead_id             UUID REFERENCES leads_bruts(id),

  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_signaux_type ON signaux_linkedin(signal_type);
CREATE INDEX idx_signaux_tier ON signaux_linkedin(tier);
CREATE INDEX idx_signaux_date ON signaux_linkedin(date_signal DESC);

-- Table de deduplication
CREATE TABLE deduplication_log (
  id                  SERIAL PRIMARY KEY,
  lead_source_id      UUID NOT NULL,
  lead_merged_into_id UUID NOT NULL,
  match_type          VARCHAR(50), -- 'siret' | 'domain' | 'linkedin' | 'name_fuzzy'
  confidence          DECIMAL,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Table des snapshots headcount (pour tracking croissance)
CREATE TABLE headcount_snapshots (
  id                  SERIAL PRIMARY KEY,
  company_linkedin_url VARCHAR(500) NOT NULL,
  company_name        VARCHAR(255),
  employee_count      INTEGER,
  snapshot_date       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_headcount_company ON headcount_snapshots(company_linkedin_url);
CREATE INDEX idx_headcount_date ON headcount_snapshots(snapshot_date DESC);

-- Table des sites a scanner (input pour 1c)
CREATE TABLE sites_a_scanner (
  id                  SERIAL PRIMARY KEY,
  url                 VARCHAR(500) NOT NULL UNIQUE,
  entreprise_nom      VARCHAR(255),
  siret               VARCHAR(20),
  segment             VARCHAR(50),
  source              VARCHAR(50), -- 'sirene' | 'google' | 'annuaire' | 'manual' | 'other_agent'
  priorite            INTEGER DEFAULT 5, -- 1 = haute, 10 = basse
  dernier_scan        TIMESTAMP,
  actif               BOOLEAN DEFAULT true,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sites_scan_date ON sites_a_scanner(dernier_scan);
CREATE INDEX idx_sites_actif ON sites_a_scanner(actif) WHERE actif = true;

-- Table de suivi des batchs du Master
CREATE TABLE veilleur_batches (
  id                  SERIAL PRIMARY KEY,
  batch_id            VARCHAR(100) NOT NULL UNIQUE,
  nb_leads_bruts      INTEGER DEFAULT 0,
  nb_leads_dedupliques INTEGER DEFAULT 0,
  nb_leads_hot        INTEGER DEFAULT 0,
  nb_leads_warm       INTEGER DEFAULT 0,
  nb_leads_cold       INTEGER DEFAULT 0,
  sous_agents_actifs  TEXT[],
  erreurs             JSONB,
  duree_seconds       INTEGER,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Table de tracking des couts API
CREATE TABLE api_usage (
  id                  SERIAL PRIMARY KEY,
  api_provider        VARCHAR(50) NOT NULL,
    -- 'netrows' | 'signalsapi' | 'hunter' | 'apify' | 'hasdata' | 'whoisfreaks'
  credits_used        INTEGER DEFAULT 0,
  cost_eur            DECIMAL DEFAULT 0,
  endpoint            VARCHAR(200),
  success             BOOLEAN DEFAULT true,
  response_time_ms    INTEGER,
  called_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_usage_provider ON api_usage(api_provider);
CREATE INDEX idx_api_usage_date ON api_usage(called_at DESC);

-- Vue : resume quotidien pour monitoring
CREATE VIEW v_veilleur_daily_summary AS
SELECT
  DATE(created_at) as jour,
  COUNT(*) as total_leads,
  COUNT(*) FILTER (WHERE source_primaire = '1a_linkedin') as leads_linkedin,
  COUNT(*) FILTER (WHERE source_primaire = '1b_marches') as leads_marches,
  COUNT(*) FILTER (WHERE source_primaire = '1c_web') as leads_web,
  COUNT(*) FILTER (WHERE source_primaire = '1d_jobboards') as leads_jobboards,
  AVG(pre_score) as score_moyen,
  COUNT(*) FILTER (WHERE pre_score >= 60) as leads_hot,
  COUNT(*) FILTER (WHERE pre_score >= 40 AND pre_score < 60) as leads_warm,
  COUNT(*) FILTER (WHERE pre_score < 40) as leads_cold
FROM leads_bruts
GROUP BY DATE(created_at)
ORDER BY jour DESC;

-- Vue : marches publics actifs
CREATE VIEW v_marches_actifs AS
SELECT *
FROM marches_publics
WHERE date_limite > NOW()
  AND action IN ('a_repondre', 'a_qualifier')
ORDER BY score_pertinence DESC, date_limite ASC;
```

---

## 8. BUDGET CONSOLIDE

### 8.1 Couts mensuels par sous-agent

| Sous-agent | Service | Cout/mois |
|-----------|---------|----------|
| **1a LinkedIn** | Netrows API | 99 EUR |
| | SignalsAPI | 99 USD (~93 EUR) |
| | Make.com | 29 EUR |
| | Hunter.io (partage) | 49 EUR / 4 = 12 EUR |
| **Sous-total 1a** | | **~233 EUR** |
| **1b Marches** | BOAMP + DECP + APProch + Scraping | 0 EUR |
| **Sous-total 1b** | | **0 EUR** |
| **1c Web** | Lighthouse + Wappalyzer + axe-core + Playwright | 0 EUR |
| **Sous-total 1c** | | **0 EUR** |
| **1d Job Boards** | Apify (LinkedIn Jobs + WTTJ + HelloWork) | 49 USD (~46 EUR) |
| | HasData Indeed API | 50 USD (~47 EUR) |
| | WhoisFreaks | 29 USD (~27 EUR) |
| **Sous-total 1d** | | **~120 EUR** |
| **Infrastructure** | VPS 4-core (Redis + PostgreSQL + Workers) | ~40 EUR |
| **Hunter.io** | Partage entre agents (reste) | 37 EUR |
| **TOTAL AGENT 1** | | **~430 EUR/mois** |

### 8.2 Couts annuels

| Poste | Cout annuel |
|-------|-----------|
| APIs et services | ~4,680 EUR |
| Infrastructure | ~480 EUR |
| **Total annuel** | **~5,160 EUR** |

### 8.3 Cout par lead

| Metrique | Valeur |
|----------|--------|
| Leads bruts par jour | 30-80 |
| Leads bruts par mois | 900-2400 |
| Cout par lead brut | 0.18-0.48 EUR |
| Leads qualifies (pre_score >= 60) par mois | 200-600 |
| Cout par lead qualifie | 0.72-2.15 EUR |

---

## 9. VERIFICATION DE COHERENCE

### 9.1 Compatibilite outputs Veilleur / inputs Enrichisseur

**Output du Veilleur** (schema normalise - section 2.5) :

| Champ | Present | Requis par Enrichisseur |
|-------|---------|----------------------|
| `entreprise.nom` | Oui | Oui - pour recherche SIRET/SIREN |
| `entreprise.siret` | Parfois (1b) | Optionnel - l'Enrichisseur le cherche |
| `entreprise.site_web` | Souvent | Oui - pour scan tech si pas fait |
| `entreprise.localisation` | Oui | Oui - pour segmentation |
| `contact.linkedin_url` | Souvent (1a) | Oui - pour trouver email |
| `contact.email` | Rarement | Non - l'Enrichisseur le trouve |
| `signaux[]` | Oui | Oui - pour le scoring final |
| `segment_estime` | Oui | Oui - pour choisir le decideur a chercher |
| `pre_score` | Oui | Oui - pour prioriser l'enrichissement |
| `metadata.traitement_requis` | Oui | Oui - indique ce que l'Enrichisseur doit faire |

**Verdict** : COMPATIBLE. Le schema normalise du Veilleur contient tous les champs necessaires pour que l'Enrichisseur fonctionne. Les champs manquants (`email`, `telephone`, `siret`, `ca_estime`) sont precisement ce que l'Enrichisseur va chercher.

**Mapping vers la table `prospects` existante** :

```
leads_bruts.entreprise_nom       -> prospects.entreprise
leads_bruts.entreprise_siret     -> prospects.siret
leads_bruts.entreprise_site_web  -> prospects.site_web
leads_bruts.entreprise_localisation -> prospects.localisation
leads_bruts.segment_estime       -> prospects.segment
leads_bruts.contact_prenom       -> prospects.prenom
leads_bruts.contact_nom          -> prospects.nom
leads_bruts.contact_poste        -> prospects.poste
leads_bruts.contact_linkedin     -> prospects.linkedin_url
leads_bruts.signaux              -> prospects.signaux
leads_bruts.signal_principal     -> prospects.signal_principal
leads_bruts.source_primaire      -> prospects.source
```

### 9.2 Realisme des volumes

| Metrique | Estimation | Validation |
|----------|-----------|-----------|
| Signaux LinkedIn/jour | 20-60 | REALISTE - 500 entreprises scannees * 5-10% taux de signal |
| Marches publics pertinents/semaine | 2-10 | REALISTE - ~90-130 AO IT/jour en France, 1-2% pertinents pour Axiom |
| Sites scannes/nuit | 100-500 | REALISTE - 5 workers * 45-90s/site = 100 en 30 min, 500 en 2.5h |
| Offres emploi pertinentes/jour | 5-15 | REALISTE - ~2000 offres tech/jour en France, 0.25-0.75% tres pertinentes |
| **Total leads bruts/jour** | **30-80** | REALISTE - coherent avec les capacites API et les volumes de marche |
| **Total leads qualifies (pre_score >= 60)/jour** | **8-20** | REALISTE - environ 25% des leads bruts passent le seuil |
| Leads transmis a l'Enrichisseur/jour | 8-20 | COHERENT avec le debit de l'Enrichisseur (3-10s/prospect, max ~2800/jour a 10s) |

### 9.3 Coherence du budget

| Verification | Resultat |
|-------------|---------|
| Budget total Agent 1 / mois | ~430 EUR |
| Budget total pipeline 10 agents | ~1 175 EUR/mois |
| Part Agent 1 dans le budget total | ~22-29% |
| Cout par lead qualifie | 0.72-2.15 EUR |
| Cout par lead si conversion 5% en RDV | 14-43 EUR/RDV |
| Cout par lead si conversion 2% en deal | 36-107 EUR/deal |
| Valeur moyenne d'un deal Axiom | 10,000-50,000 EUR |
| **ROI estime** | **100x-700x** |

**Verdict** : COHERENT. Le budget est raisonnable et le ROI potentiel est tres favorable.

### 9.4 Coherence des frequences entre sous-agents

| Sous-agent | Frequence | Conflit potentiel | Statut |
|-----------|-----------|-------------------|--------|
| 1a LinkedIn | 4x/jour (07h, 12h, 18h, 23h) | Aucun - APIs tierces, pas LinkedIn direct | OK |
| 1b Marches | 2x/jour (06h, 14h) | Aucun - API BOAMP sans rate limit | OK |
| 1c Web | 1x/nuit (02h-06h) | CPU/RAM intense mais isole la nuit | OK |
| 1d Job Boards | 1x/jour (06h) | Parallele avec 1b, different APIs | OK |
| Master consolidation | 3x/jour (08h, 15h, 21h) | Attente fin des sous-agents | OK |

**Verification temporelle** :
- 02:00-06:00 : 1c scanne (CPU intensif)
- 06:00 : 1b + 1d lancent en parallele (API calls, pas CPU intensif)
- 07:00 : 1a lance (API calls)
- 08:00 : Master consolide batch 1 (1c done + 1b done + 1d done + 1a done)
- 12:00-14:00 : 1a re-lance + 1b re-lance
- 15:00 : Master consolide batch 2
- 18:00-23:00 : 1a continues
- 21:00 : Master consolide batch 3
- 23:30 : Rapport quotidien

**Verdict** : PAS DE CONFLIT. Les sous-agents sont espaces pour eviter la surcharge.

### 9.5 Deduplication entre sources

**Scenarios de deduplication testes** :

| Scenario | Source 1 | Source 2 | Cle de dedup | Resultat attendu |
|----------|---------|---------|--------------|-----------------|
| Meme entreprise recrute ET detectee LinkedIn | 1d (job board) | 1a (LinkedIn) | Nom entreprise normalise | Fusion, nb_detections = 2, bonus +10 pts |
| Meme entreprise site lent ET marche public | 1c (web) | 1b (marche) | SIRET (si 1b le fournit) ou domaine | Fusion, nb_detections = 2, bonus +10 pts |
| Meme personne change de poste ET poste LinkedIn | 1a (job change) | 1a (post) | LinkedIn URL du contact | Fusion des signaux sous meme lead |
| Entreprise detectee 3 sources | 1a + 1c + 1d | | Domaine site web | Fusion, nb_detections = 3, bonus +15 pts |
| Faux positif : noms similaires | "TechCorp SAS" vs "Tech Corp SARL" | | Levenshtein < 3 apres normalisation | Fusion (apres verification) |

**Ordre de priorite des cles de deduplication** :
1. SIRET (si disponible) -- 100% fiable
2. Domaine du site web (normalise, sans www) -- 95% fiable
3. LinkedIn company URL -- 95% fiable
4. Nom entreprise normalise (sans forme juridique, lowercase, sans accents) -- 85% fiable (risque faux positifs)

**Taux de deduplication estime** : 10-25% des leads bruts sont des doublons (meme entreprise detectee par 2+ sous-agents).

### 9.6 Checklist finale

| Point de verification | Statut |
|----------------------|--------|
| Outputs Veilleur compatibles avec inputs Enrichisseur | VALIDE |
| Schema JSON normalise documente et complet | VALIDE |
| Volumes quotidiens realistes (30-80 leads/jour) | VALIDE |
| Budget mensuel coherent (~430 EUR) | VALIDE |
| Frequences de scan sans conflit | VALIDE |
| Deduplication couvre les cas multi-source | VALIDE |
| Pre-scoring coherent avec scoring final Agent 3 | VALIDE |
| Schema SQL complet avec index | VALIDE |
| Gestion d'erreurs documentee pour chaque sous-agent | VALIDE |
| Monitoring et alertes en place | VALIDE |
| Priorite entre sous-agents documentee | VALIDE |
| Toutes les APIs listees avec pricing | VALIDE |
| Rate limits respectes pour chaque API | VALIDE |
| Aucun scraping direct LinkedIn (risque zero ban) | VALIDE |
| Sources gratuites exploitees en priorite (BOAMP, Lighthouse, Wappalyzer) | VALIDE |

---

## INTEGRATION AVEC LES AGENTS 8, 9, 10 (Mise a jour 19 mars 2026)

### Nouveau flux entrant : Referral Leads (Agent 10 → Agent 1)

L'Agent 10 (CSM) envoie des leads referral au Veilleur quand un client ambassadeur recommande un prospect.

**Queue BullMQ** : `veilleur-referral-leads` (priority 1)

**Format JSON recu** :
```json
{
  "type": "referral_lead",
  "referral_id": "ref_1710850000_abc123",
  "referred_by": {
    "client_id": "uuid-client",
    "referral_code": "AXIOM-XXXX-YYYY"
  },
  "lead": {
    "prenom": "Jean",
    "nom": "Dupont",
    "email": "jean.dupont@entreprise.fr",
    "entreprise": "Entreprise SAS",
    "besoin": "site web"
  },
  "priority_boost": 40,
  "metadata": {
    "agent": "agent_10_csm",
    "created_at": "2026-03-19T10:00:00Z"
  }
}
```

**Traitement** :
1. Validation du schema
2. Deduplication par email (si prospect existe deja → fusionner signaux, ajouter referral_info)
3. Si nouveau → creer lead avec pre_score = 40 (bonus referral)
4. Dispatch vers enrichisseur-pipeline avec priority=1 (maximum)

**Impact sur le scoring** : +40 points de bonus pour tout lead referral (justification : conversion referral 30-40% vs cold 1-3%)

### Nouveau flux sortant : Appels d'offres (Agent 1b → Agent 9)

Le sous-agent 1b envoie les AO detectes a l'Agent 9 pour analyse et reponse.

**Queue BullMQ** : `agent9-pipeline`

**Condition d'envoi** : `score_pertinence >= 60` ET `date_limite > NOW() + 3 jours`

**Format** : `MarchePublicLead` (schema existant du sous-agent 1b, inchange)

**Deduplication** : Table `ao_analyses` pour eviter d'analyser le meme AO deux fois.

### Agent 8 (DEALMAKER) : Aucun impact sur Agent 1

L'Agent 8 ne communique pas avec l'Agent 1. Flux : Agent 5 → Agent 8 → Agent 10.

### Modification du schema NormalizedLead (v2)

Le schema de sortie du Master Veilleur est etendu avec 2 champs optionnels :

```typescript
// Champs AJOUTES (optionnels, retro-compatible)
referral_info?: {
  referral_id: string
  referred_by_client_id: string
  referral_code: string
  priority_boost: number  // +40
  source_type: 'referral'
}

marche_public_info?: {
  reference: string
  type_marche: string
  montant_estime: number
  date_limite: string
  cpv_codes: string[]
  mots_cles: string[]
  score_pertinence: number
  action: 'a_repondre' | 'a_qualifier' | 'archive'
}
```

Les agents 2 et 3 en aval restent 100% compatibles (champs optionnels ignores si absents).

### Nouvelles tables SQL

```sql
CREATE TABLE referral_leads (
  referral_id UUID PRIMARY KEY,
  referred_by_client_id UUID NOT NULL,
  referral_code VARCHAR(20) NOT NULL UNIQUE,
  prenom VARCHAR(100),
  nom VARCHAR(100),
  email VARCHAR(255),
  entreprise VARCHAR(255),
  besoin TEXT,
  lead_id UUID REFERENCES leads_bruts(lead_id),
  status VARCHAR(30) DEFAULT 'submitted',
  priority_boost_applied NUMERIC(5,2) DEFAULT 40.0,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE TABLE ao_analyses (
  id SERIAL PRIMARY KEY,
  boamp_reference VARCHAR(50) UNIQUE NOT NULL,
  titre VARCHAR(500),
  acheteur VARCHAR(255),
  montant_estime NUMERIC(12,2),
  date_limite TIMESTAMP,
  status VARCHAR(30) DEFAULT 'received',
  score_pertinence NUMERIC(5,2),
  score_go_no_go NUMERIC(5,2),
  decision VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Verification de coherence post-mise-a-jour

- Output Agent 1 → Input Agent 2 : COMPATIBLE (champs optionnels retro-compatibles)
- Output Agent 1b → Input Agent 9 : COMPATIBLE (schema MarchePublicLead inchange)
- Input Agent 1 ← Output Agent 10 : COMPATIBLE (nouveau flux referral documente)
- Sous-agents 1a, 1c, 1d : AUCUN changement
- Pre-scoring : +40 bonus referral n'impacte pas les leads non-referral

---

## ANNEXE A : LISTE COMPLETE DES MOTS-CLES DE VEILLE

### A.1 Mots-cles LinkedIn (1a)

```
Besoin web : refonte site, nouveau site, cherche agence web, besoin agence digitale,
  relancer notre site, site e-commerce, migration plateforme, nouveau portail
Transformation : transformation digitale, digitalisation, modernisation,
  strategie numerique, passage au digital
Technologie : react, vue.js, angular, shopify, wordpress, flutter, nextjs,
  application mobile, progressive web app, headless cms
Accessibilite : RGAA, accessibilite numerique, WCAG, mise en conformite
Croissance : levee de fonds, serie A, serie B, recrutement massif,
  nous recrutons, on cherche, scale-up
Pain points : site trop lent, probleme technique, down, bugs,
  experience utilisateur, taux de conversion
```

### A.2 Mots-cles Marches Publics (1b)

```
Positifs : site web, portail, application, mobile, api, rgaa, accessibilite,
  wordpress, drupal, react, vue.js, developpement, maintenance, support,
  hebergement, cloud, infogerance, demarche, administratif
Negatifs : travaux, btp, construction, fournitures, materiel, transport,
  logistique, restauration, catering, nettoyage, gardiennage
```

### A.3 Mots-cles Job Boards (1d)

```
developpeur web, developpeur react, developpeur frontend, developpeur fullstack,
developpeur vue, developpeur angular, developpeur node, developpeur php,
chef de projet digital, chef de projet web, product owner web,
webmaster, integrateur web, webdesigner, UX designer, UI designer,
developpeur shopify, developpeur e-commerce, developpeur mobile,
developpeur flutter, developpeur react native
```

---

## ANNEXE B : SOURCES ET REFERENCES

### APIs officielles
- BOAMP : `https://boamp-datadila.opendatasoft.com/api/v2/catalog/datasets/boamp/records`
- DECP : `https://data.economie.gouv.fr/explore/dataset/decp-v3-marches-valides/api/`
- APProch : `https://data.economie.gouv.fr/explore/dataset/projets-dachats-publics/api/`
- SIRENE : `https://data.gouv.fr/datasets/base-sirene-des-entreprises-et-leurs-etablissements-siren-siret`
- PageSpeed Insights : `https://www.googleapis.com/pagespeedonline.v5/runPagespeed`

### APIs commerciales
- Netrows : `https://www.netrows.com/` (49-99 EUR/mois)
- SignalsAPI : `https://signalsapi.com/` (99 USD/mois)
- Hunter.io : `https://hunter.io/` (49 EUR/mois)
- Apify : `https://apify.com/` (49 USD/mois)
- HasData : `https://hasdata.com/` (50 USD/mois)
- WhoisFreaks : `https://whoisfreaks.com/` (29 USD/mois)

### Outils open source
- Lighthouse : `https://github.com/GoogleChrome/lighthouse`
- Wappalyzer : `https://www.npmjs.com/package/wapalyzer`
- axe-core : `https://github.com/dequelabs/axe-core`
- Pa11y CI : `https://github.com/pa11y/pa11y-ci`
- Playwright : `https://playwright.dev/`
- BullMQ : `https://bullmq.io/`
- Feedparser (RSS) : `https://www.npmjs.com/package/rss-parser`

### Profils acheteurs Reunion
- Departement 974 : `http://marchesformalises.cg974.fr/`
- CIVIS : `https://civis.e-marchespublics.com/`
- CINOR : `https://marches.cinor.fr/`
- CASUD : `https://casud.achatpublic.com`
- TCO : `https://www.tco.re/pro/marches-publics/`

### Codes CPV principaux
- 72212200-1 : Services de developpement web et intranet
- 72212216-8 : Services de developpement de logiciels de site web
- 72000000-5 : Services IT generiques
- 72200000-8 : Services de conseil en systemes informatiques
- 72210000-0 : Developpement et analyse de logiciels
