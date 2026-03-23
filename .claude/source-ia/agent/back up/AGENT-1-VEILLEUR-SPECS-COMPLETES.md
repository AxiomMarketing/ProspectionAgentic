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

## 3. SOUS-AGENT 1a -- VEILLEUR LINKEDIN

### 3.1 Mission precise

**Ce qu'il fait** :
- Detecte les signaux d'achat sur LinkedIn via APIs tierces (pas de scraping direct)
- Surveille les changements de poste, annonces de recrutement, levees de fonds, posts revealant un besoin digital
- Detecte les entreprises en croissance (headcount tracking)
- Extrait les contacts des decideurs identifies

**Ce qu'il ne fait PAS** :
- Il n'envoie AUCUN message LinkedIn (c'est le REDACTEUR)
- Il ne scrape PAS directement LinkedIn (trop risque -- APIs tierces utilisees)
- Il n'enrichit PAS les donnees entreprise au-dela de ce que fournissent les APIs (c'est l'ENRICHISSEUR)
- Il ne valide PAS les emails (c'est l'ENRICHISSEUR)

### 3.2 Architecture technique

**Stack et APIs** :

| Composant | Service | Cout mensuel | Justification |
|-----------|---------|-------------|---------------|
| **Donnees profils/entreprises** | Netrows API | 99 EUR/mois (40K credits) | Remplacant legal de Proxycurl, 48+ endpoints, donnees publiques |
| **Job postings + hiring velocity** | SignalsAPI | 99 USD/mois (starter) | Detection postes ouverts, croissance equipe |
| **Levees de fonds** | Crunchbase API (free tier) + RSS Maddyness | 0 EUR/mois | Funding announcements |
| **Posts monitoring** | RSS feeds LinkedIn pages + Make.com | 29 EUR/mois (Make Pro) | Conversion RSS vers webhooks |
| **Email extraction** | Hunter.io | 49 EUR/mois (1500 lookups) | Partagee avec les autres sous-agents |
| **Infrastructure** | Redis + PostgreSQL (self-hosted) | 0 EUR (inclus infra) | Queue + cache + stockage |

**Total sous-agent 1a** : ~276 EUR/mois

**Architecture alternative (Option B - Budget)** :

| Composant | Service | Cout mensuel |
|-----------|---------|-------------|
| Donnees profils | People Data Labs | 98 USD/mois |
| Job postings | Apify LinkedIn Jobs Scraper | 49 USD/mois |
| Email | Skrapp.io Pro | 30 USD/mois |
| **Total Option B** | | ~177 USD/mois |

### 3.3 Donnees d'entree (Input)

```typescript
interface LinkedInScanConfig {
  // Segments a surveiller
  segments: Array<{
    name: string                    // 'pme_metro' | 'ecommerce_shopify' | etc.
    targetRoles: string[]           // ['CMO', 'CTO', 'DG', 'Founder']
    industries: string[]            // ['SaaS', 'E-commerce', 'Manufacturing']
    companySize: { min: number, max: number }  // { min: 50, max: 500 }
    geography: string[]             // ['France', 'Paris', 'Lyon']
  }>

  // Mots-cles pour monitoring de posts
  keywords: {
    besoin_web: string[]            // ['refonte site', 'nouveau site', 'cherche agence web']
    transformation: string[]        // ['transformation digitale', 'digitalisation']
    techno: string[]                // ['react', 'shopify', 'flutter', 'RGAA']
    growth: string[]                // ['levee de fonds', 'serie A', 'croissance']
    pain: string[]                  // ['site trop lent', 'probleme technique', 'accessibilite']
  }

  // Types de signaux a tracker
  signalTypes: Array<
    'job_change' |       // Changement de poste
    'hiring' |           // Annonces de recrutement
    'headcount_change' | // Croissance equipe
    'funding' |          // Levee de fonds
    'post_keyword' |     // Posts avec mots-cles
    'engagement'         // Engagement sur contenu tech
  >

  // Rate limits
  rateLimits: {
    netrowsCallsPerMinute: number   // 60
    maxProfilesPerRun: number       // 500
    delayBetweenCallsMs: number     // 1000
  }
}
```

**Frequence d'execution** : 4 fois/jour (07h, 12h, 18h, 23h)

### 3.4 Processus detaille

```
ETAPE 1 : INGESTION DES SIGNAUX (parallele)
├── 1.1 Changements de poste
│   ├── Netrows API : company employee tracking
│   ├── Requete : GET /api/v1/companies/{id}/employees?changed_since=6h
│   ├── Filtrer : roles C-level + segments cibles
│   └── Output : liste de {person, old_role, new_role, company}
│
├── 1.2 Annonces de recrutement
│   ├── SignalsAPI : job postings par entreprise
│   ├── Filtrer : postes marketing/digital/dev/IT
│   ├── Seuil : >= 3 postes ouverts = signal fort
│   └── Output : liste de {company, jobs_count, job_titles}
│
├── 1.3 Croissance equipe (headcount)
│   ├── Netrows API : company data (employee_count)
│   ├── Comparer avec snapshot precedent (stocke en DB)
│   ├── Seuil : +10% en 90 jours = signal
│   └── Output : liste de {company, old_count, new_count, growth_rate}
│
├── 1.4 Levees de fonds
│   ├── Crunchbase API free : /organizations/search?funding_rounds.last_funding_at > 7d
│   ├── RSS Maddyness : parser maddymoney newsletter
│   ├── RSS BPI France : bigmedia.bpifrance.fr
│   └── Output : liste de {company, round_type, amount, date}
│
└── 1.5 Posts avec mots-cles
    ├── RSS feeds pages entreprises cibles
    ├── Make.com : conversion RSS --> webhook --> n8n
    ├── Filtrage NLP : correspondance mots-cles
    └── Output : liste de {author, company, post_text, keywords_matched}

ETAPE 2 : CLASSIFICATION DES SIGNAUX
├── Tier 1 (ROI > 40%) : changement_poste, levee_fonds
│   → Score signal : 25-35 points
│   → Latence max : 24h
│
├── Tier 2 (ROI 15-40%) : recrutement_actif, croissance_equipe, post_besoin
│   → Score signal : 15-25 points
│   → Latence max : 48h
│
└── Tier 3 (ROI < 15%) : engagement_contenu, anniversaire_entreprise
    → Score signal : 5-15 points
    → Latence max : 72h

ETAPE 3 : EXTRACTION CONTACT
├── Si signal contient deja un contact (changement poste) → garder
├── Sinon → chercher le decideur via Netrows/PDL :
│   ├── Segment pme_metro → chercher CMO, DG, CTO
│   ├── Segment ecommerce → chercher Founder, Head of Growth
│   ├── Segment collectivite → chercher DGS, DSI
│   ├── Segment startup → chercher Founder, CTO
│   └── Segment agence_wl → chercher Fondateur
└── Extraire : prenom, nom, poste, linkedin_url

ETAPE 4 : FORMATAGE OUTPUT
└── Generer un objet RawLead (cf. schema section 2.5)
```

### 3.5 Code d'implementation

```typescript
// agents/veilleur/linkedin/scanner.ts
import { NetrowsClient } from '../clients/netrows'
import { SignalsAPIClient } from '../clients/signalsapi'
import { RSSParser } from '../utils/rss'

export class LinkedInScanner {
  private netrows: NetrowsClient
  private signalsApi: SignalsAPIClient
  private rss: RSSParser

  constructor(config: LinkedInScanConfig) {
    this.netrows = new NetrowsClient({
      apiKey: process.env.NETROWS_API_KEY!,
      rateLimitPerMinute: config.rateLimits.netrowsCallsPerMinute,
    })
    this.signalsApi = new SignalsAPIClient({
      apiKey: process.env.SIGNALSAPI_KEY!,
    })
    this.rss = new RSSParser()
  }

  async scan(): Promise<RawLead[]> {
    const results: RawLead[] = []

    // Paralleliser les 5 canaux
    const [jobChanges, hiring, headcount, funding, posts] = await Promise.allSettled([
      this.scanJobChanges(),
      this.scanHiring(),
      this.scanHeadcount(),
      this.scanFunding(),
      this.scanPosts(),
    ])

    // Collecter les resultats reussis
    for (const result of [jobChanges, hiring, headcount, funding, posts]) {
      if (result.status === 'fulfilled') {
        results.push(...result.value)
      } else {
        // Logger l'erreur mais continuer
        await this.logError('linkedin_scan', result.reason)
      }
    }

    return results
  }

  private async scanJobChanges(): Promise<RawLead[]> {
    const leads: RawLead[] = []

    // Pour chaque segment, chercher les changements de poste
    for (const segment of this.config.segments) {
      const companies = await this.netrows.searchCompanies({
        industry: segment.industries,
        employeeCount: segment.companySize,
        location: segment.geography,
        limit: 100,
      })

      for (const company of companies) {
        const employees = await this.netrows.getCompanyEmployees({
          companyId: company.id,
          changedSince: '6h',
          roles: segment.targetRoles,
        })

        for (const employee of employees) {
          if (this.isRelevantJobChange(employee)) {
            leads.push({
              source: '1a_linkedin',
              type: 'signal_linkedin',
              signal_type: 'changement_poste',
              detail: `${employee.firstName} ${employee.lastName} nomme(e) ${employee.currentTitle} chez ${company.name}`,
              tier: 1,
              score_signal: 30,
              date_signal: new Date().toISOString(),
              entreprise: {
                nom: company.name,
                linkedin_company_url: company.linkedinUrl,
                site_web: company.website,
                taille_estimee: this.categorizeSize(company.employeeCount),
                localisation: company.headquarters,
                segment_estime: segment.name,
              },
              contact: {
                prenom: employee.firstName,
                nom: employee.lastName,
                poste: employee.currentTitle,
                linkedin_url: employee.linkedinUrl,
              },
            })
          }
        }
      }
    }

    return leads
  }

  private async scanHiring(): Promise<RawLead[]> {
    const leads: RawLead[] = []

    const hiringSignals = await this.signalsApi.getHiringSignals({
      industries: this.config.segments.flatMap(s => s.industries),
      locations: ['France'],
      minOpenPositions: 3,
      positionKeywords: ['marketing', 'digital', 'web', 'developer', 'tech'],
    })

    for (const signal of hiringSignals) {
      leads.push({
        source: '1a_linkedin',
        type: 'signal_linkedin',
        signal_type: 'recrutement_actif',
        detail: `${signal.companyName} a ${signal.openPositions} postes ouverts dont ${signal.relevantPositions.join(', ')}`,
        tier: signal.openPositions >= 5 ? 1 : 2,
        score_signal: signal.openPositions >= 5 ? 25 : 15,
        date_signal: new Date().toISOString(),
        entreprise: {
          nom: signal.companyName,
          site_web: signal.website,
          taille_estimee: this.categorizeSize(signal.employeeCount),
          localisation: signal.location,
        },
        contact: null, // A trouver par l'Enrichisseur
      })
    }

    return leads
  }

  private async scanHeadcount(): Promise<RawLead[]> {
    // Comparer le headcount actuel avec le snapshot precedent (DB)
    const leads: RawLead[] = []

    const previousSnapshots = await db.query(
      `SELECT company_linkedin_url, employee_count, snapshot_date
       FROM headcount_snapshots
       WHERE snapshot_date > NOW() - INTERVAL '90 days'
       ORDER BY company_linkedin_url, snapshot_date DESC`
    )

    // Grouper par entreprise
    const grouped = groupBy(previousSnapshots, 'company_linkedin_url')

    for (const [url, snapshots] of Object.entries(grouped)) {
      if (snapshots.length < 2) continue

      const latest = snapshots[0].employee_count
      const oldest = snapshots[snapshots.length - 1].employee_count
      const growthRate = (latest - oldest) / oldest

      if (growthRate >= 0.10) { // +10% en 90 jours
        const company = await this.netrows.getCompanyByLinkedIn(url)
        leads.push({
          source: '1a_linkedin',
          type: 'signal_linkedin',
          signal_type: 'croissance_equipe',
          detail: `${company.name} : +${Math.round(growthRate * 100)}% d'effectif en 90 jours (${oldest} -> ${latest})`,
          tier: growthRate >= 0.20 ? 1 : 2,
          score_signal: growthRate >= 0.20 ? 25 : 15,
          date_signal: new Date().toISOString(),
          entreprise: {
            nom: company.name,
            linkedin_company_url: url,
            site_web: company.website,
            taille_estimee: this.categorizeSize(latest),
            localisation: company.headquarters,
          },
          contact: null,
        })
      }
    }

    return leads
  }

  private async scanFunding(): Promise<RawLead[]> {
    const leads: RawLead[] = []

    // Source 1 : RSS Maddyness MaddyMoney
    const maddyFeed = await this.rss.parse('https://www.maddyness.com/feed/?tag=levee-de-fonds')
    for (const item of maddyFeed.items.filter(i => this.isRecent(i.pubDate, 24))) {
      const extracted = this.extractFundingInfo(item.title, item.description)
      if (extracted) {
        leads.push({
          source: '1a_linkedin',
          type: 'signal_linkedin',
          signal_type: 'levee_fonds',
          detail: `${extracted.company} a leve ${extracted.amount} (${extracted.round})`,
          tier: 1,
          score_signal: 35,
          date_signal: new Date(item.pubDate).toISOString(),
          entreprise: {
            nom: extracted.company,
            localisation: extracted.location || 'France',
          },
          contact: null,
        })
      }
    }

    // Source 2 : RSS BPI France
    const bpiFeed = await this.rss.parse('https://bigmedia.bpifrance.fr/feed')
    // ... meme logique

    return leads
  }

  private async scanPosts(): Promise<RawLead[]> {
    // Via Make.com/n8n : RSS feeds des pages entreprises --> webhook --> traitement
    const leads: RawLead[] = []

    // Recuperer les posts non-traites depuis la queue
    const unprocessedPosts = await db.query(
      `SELECT * FROM linkedin_posts_queue WHERE processed = false ORDER BY received_at ASC LIMIT 100`
    )

    for (const post of unprocessedPosts) {
      const matchedKeywords = this.matchKeywords(post.content, this.config.keywords)

      if (matchedKeywords.length > 0) {
        leads.push({
          source: '1a_linkedin',
          type: 'signal_linkedin',
          signal_type: 'post_besoin_tech',
          detail: `Post de ${post.author_name} (${post.company_name}) mentionne: ${matchedKeywords.join(', ')}`,
          tier: 2,
          score_signal: Math.min(25, matchedKeywords.length * 5 + 10),
          date_signal: new Date(post.published_at).toISOString(),
          entreprise: {
            nom: post.company_name,
            linkedin_company_url: post.company_linkedin_url,
          },
          contact: {
            prenom: post.author_first_name,
            nom: post.author_last_name,
            linkedin_url: post.author_linkedin_url,
          },
        })
      }

      // Marquer comme traite
      await db.query('UPDATE linkedin_posts_queue SET processed = true WHERE id = $1', [post.id])
    }

    return leads
  }
}
```

### 3.6 Donnees de sortie (Output)

```json
{
  "type": "signal_linkedin",
  "source": "1a_linkedin",
  "date_detection": "2026-03-18T09:15:00Z",
  "signal_type": "changement_poste",
  "tier": 1,
  "score_signal": 30,
  "detail": "Sophie Martin nommee CMO chez TechCorp il y a 3 semaines",
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
  "metadata": {
    "api_source": "netrows",
    "credits_consumed": 2,
    "confidence": 0.95
  }
}
```

### 3.7 Scoring / Filtrage

| Signal | Tier | Score | Seuil de declenchement |
|--------|------|-------|----------------------|
| Levee de fonds annoncee | 1 | 35 pts | Toute levee detectee |
| Changement de poste C-level | 1 | 30 pts | Roles CMO, CTO, DG, DSI |
| Recrutement actif (5+ postes) | 1 | 25 pts | >= 5 postes ouverts tech/marketing |
| Croissance equipe >= 20% | 1 | 25 pts | +20% headcount en 90 jours |
| Post avec mots-cles forts | 2 | 20 pts | Match >= 2 keywords |
| Recrutement actif (3-4 postes) | 2 | 15 pts | 3-4 postes ouverts |
| Croissance equipe 10-19% | 2 | 15 pts | +10-19% headcount |
| Engagement contenu tech | 3 | 10 pts | 3+ engagements tech en 30 jours |
| Anniversaire entreprise | 3 | 5 pts | 1, 5 ou 10 ans |

**Seuil de retention** : score_signal >= 10 (les signaux < 10 sont archives mais pas transmis)

### 3.8 Volumes et performance

| Metrique | Valeur estimee |
|----------|---------------|
| Profils entreprises scannes par run | 100-500 |
| Signaux detectes par run | 5-15 |
| Signaux detectes par jour (4 runs) | 20-60 |
| Signaux Tier 1 par jour | 3-8 |
| Signaux Tier 2 par jour | 8-20 |
| Signaux Tier 3 par jour | 10-30 |
| Temps par run | 15-30 min |
| Credits Netrows par run | 200-1000 |
| Credits Netrows par jour | 800-4000 |

### 3.9 Couts detailles

| API | Cout/mois | Credits inclus | Usage prevu/mois | Cout/lead |
|-----|----------|----------------|-----------------|-----------|
| Netrows | 99 EUR | 40,000 credits | 25,000-30,000 | ~0.004 EUR |
| SignalsAPI | 99 USD | Starter plan | Variable | ~0.01 USD |
| Make.com | 29 EUR | 10,000 ops | ~5,000 ops | ~0.006 EUR |
| Hunter.io | 49 EUR | 1,500 lookups | Partage 4 agents | ~0.03 EUR |
| **Total 1a** | **~276 EUR** | | | |

### 3.10 Gestion des erreurs

```typescript
const errorHandlers = {
  // Netrows API down
  'NETROWS_API_ERROR': {
    action: 'retry_with_backoff',
    maxRetries: 3,
    backoffMs: [5000, 15000, 60000],
    fallback: 'skip_job_changes_and_headcount', // Les autres canaux continuent
    alert: 'slack_warning',
  },

  // SignalsAPI down
  'SIGNALSAPI_ERROR': {
    action: 'retry_with_backoff',
    maxRetries: 3,
    fallback: 'use_cached_hiring_data', // Cache Redis TTL 24h
    alert: 'slack_warning',
  },

  // Rate limit atteint
  'RATE_LIMIT_429': {
    action: 'pause_and_resume',
    pauseMs: 60000, // Attendre 1 minute
    maxPauses: 5,
    fallback: 'reduce_batch_size',
    alert: 'slack_info',
  },

  // RSS feed inaccessible
  'RSS_FEED_ERROR': {
    action: 'skip_and_log',
    fallback: 'use_cached_feed', // Cache RSS TTL 6h
    alert: 'none',
  },

  // Timeout general
  'SCAN_TIMEOUT': {
    action: 'save_partial_results',
    fallback: 'dispatch_partial_batch',
    alert: 'slack_warning',
  },
}
```

### 3.11 Monitoring

| Metrique | Seuil alerte | Action |
|----------|-------------|--------|
| Leads/jour < 5 | WARN | Verifier APIs |
| Leads/jour < 2 | CRITICAL | Verifier credentials + quotas |
| Taux erreur > 20% | WARN | Analyser logs |
| Taux erreur > 50% | CRITICAL | Pause automatique + alerte |
| Temps de run > 60 min | WARN | Verifier rate limits |
| Credits Netrows restants < 5000 | WARN | Prevoir upgrade |

---

## 4. SOUS-AGENT 1b -- VEILLEUR MARCHES PUBLICS

### 4.1 Mission precise

**Ce qu'il fait** :
- Interroge l'API BOAMP (gratuite) pour les avis d'appels d'offres IT/numerique
- Interroge l'API DECP pour les marches attribues (veille concurrentielle)
- Scrape les profils acheteurs des collectivites de La Reunion
- Interroge APProch pour les projets d'achats futurs
- Filtre par codes CPV, mots-cles, montant, geographie
- Calcule un score de pertinence composite (0-100)

**Ce qu'il ne fait PAS** :
- Il ne repond PAS aux appels d'offres
- Il ne telecharge PAS le CCTP/DCE (c'est l'ENRICHISSEUR)
- Il ne contacte PAS les acheteurs publics

### 4.2 Architecture technique

**Stack et APIs** :

| Composant | Service | Cout mensuel | Acces |
|-----------|---------|-------------|-------|
| **BOAMP API** | API OpenDataSoft BOAMP | 0 EUR | Gratuit, sans cle API |
| **DECP API** | data.economie.gouv.fr | 0 EUR | Gratuit, sans cle API |
| **APProch** | projets-achats.marches-publics.gouv.fr | 0 EUR | Inscription gratuite |
| **Profils acheteurs Reunion** | Scraping Playwright | 0 EUR | Custom scraper |
| **Infrastructure** | Redis + PostgreSQL | 0 EUR (inclus) | Self-hosted |

**Total sous-agent 1b** : 0 EUR/mois (toutes sources gratuites)

### 4.3 Sources de donnees detaillees

#### Source 1 : API BOAMP

```
Endpoint principal :
https://boamp-datadila.opendatasoft.com/api/v2/catalog/datasets/boamp/records

Authentification : AUCUNE (API ouverte)
Format : JSON
Mise a jour : 2x/jour (matin et soir)
Rate limits : Non specifies (raisonnable usage)
```

**Codes CPV a monitorer** :

| Code CPV | Description | Pertinence Axiom |
|----------|-------------|-----------------|
| `72212200-1` | Services de developpement web et intranet | 100% |
| `72212216-8` | Services de developpement de logiciels de site web | 100% |
| `72000000-5` | Services IT generiques | 90% |
| `72200000-8` | Services de conseil en systemes informatiques | 85% |
| `72210000-0` | Developpement et analyse de logiciels | 85% |
| `72212000-3` | Services de programmation d'applications | 85% |
| `72220000-3` | Conseils en systemes informatiques | 80% |
| `72250000-1` | Services de maintenance et support IT | 75% |
| `72260000-4` | Assistance informatique | 70% |
| `72230000-6` | Gestion centres informatiques | 65% |
| `72240000-9` | Services d'exploitation (infogerance) | 65% |

**Codes CPV a EXCLURE** (faux positifs) :
- `30000000` : Fournitures informatiques (materiel)
- `45000000` : Construction (travaux)
- `32200000` : Administration d'infrastructure
- `33000000` : Telecommunication

#### Source 2 : DECP (Marches attribues)

```
Endpoint :
https://data.economie.gouv.fr/explore/dataset/decp-v3-marches-valides/api/

Utilite : Identifier les concurrents qui gagnent regulierement sur les AO IT.
Champs cles : titulaire, siret_titulaire, montant_attribue, cpv_code
```

#### Source 3 : Profils acheteurs Reunion

| Collectivite | URL plateforme | SIRET |
|--------------|----------------|-------|
| Departement 974 | `http://marchesformalises.cg974.fr/` | 28974012800029 |
| CIVIS | `https://civis.e-marchespublics.com/` | - |
| CINOR | `https://marches.cinor.fr/` | - |
| CASUD | `https://casud.achatpublic.com` | - |
| TCO | `https://www.tco.re/pro/marches-publics/` | - |

#### Source 4 : APProch (projets futurs)

```
Endpoint :
https://data.economie.gouv.fr/explore/dataset/projets-dachats-publics/api/

Utilite : Detecter les projets IT en phase de programmation AVANT publication officielle.
Frequence de scan : 2x/semaine (lundi et jeudi)
```

### 4.4 Donnees d'entree (Input)

```typescript
interface MarchesScanConfig {
  // Filtres BOAMP
  boamp: {
    cpvCodes: string[]          // ['72212200', '72212216', '72000000', ...]
    montantMin: number          // 5000
    montantMax: number          // 300000
    regionsCode: string[]       // ['974', '976', '75', '69', '13', ...]
    excludeKeywords: string[]   // ['travaux', 'fournitures', 'batiment', 'nettoyage']
    maxAgeDays: number          // 30 (ne pas remonter au-dela de 30 jours)
  }

  // Filtres scoring
  scoring: {
    keywordsPositifs: Record<string, number>
    keywordsNegatifs: Record<string, number>
    sweetSpotMontant: { min: number, max: number }  // { min: 5000, max: 90000 }
    prioriteGeo: Record<string, number>
    seuilAlerter: number        // 60
    seuilRepondre: number       // 75
  }

  // Profils acheteurs Reunion
  profilsReunion: Array<{
    nom: string
    url: string
    scrapingMethod: 'playwright' | 'api' | 'rss'
  }>
}
```

**Frequence** : 2x/jour (06:00 et 14:00) pour BOAMP ; 2x/semaine pour APProch ; 1x/jour pour profils Reunion

### 4.5 Processus detaille

```
ETAPE 1 : QUERY BOAMP API
├── Construire la requete ODSQL
│   SELECT * FROM boamp
│   WHERE cpv_code IN ('72212200', '72212216', '72000000', '72200000', ...)
│   AND montant >= 5000 AND montant <= 300000
│   AND date_limite_remise >= NOW()
│   AND publication_date >= NOW() - INTERVAL '1 day'
│   ORDER BY publication_date DESC
│   LIMIT 100
│
├── Parser les resultats JSON
├── Extraire les champs normalises
└── Stocker les nouveaux avis (dedup par notice_number)

ETAPE 2 : QUERY DECP (hebdomadaire)
├── Chercher les marches attribues recemment (7 derniers jours)
├── Filtrer par CPV IT
├── Identifier les titulaires recurrents (concurrents Axiom)
└── Stocker pour analyse concurrentielle

ETAPE 3 : SCRAPE PROFILS ACHETEURS REUNION (daily)
├── Pour chaque profil acheteur (CIVIS, CINOR, CASUD, TCO, Dept 974)
│   ├── Ouvrir la page avec Playwright
│   ├── Rechercher les avis publies dans les 24h
│   ├── Extraire : titre, acheteur, date limite, montant, description
│   └── Verifier si deja present en DB (dedup par titre + acheteur)
└── Stocker les nouveaux avis

ETAPE 4 : QUERY APPROCH (2x/semaine)
├── Chercher les projets IT en preparation
├── Filtrer par code CPV + region
├── Extraire : organisme, nature du besoin, date estimee
└── Stocker comme leads "pre-appel d'offres"

ETAPE 5 : SCORING AUTOMATIQUE
├── Pour chaque avis non score :
│   ├── Calculer SCORE_CPV (0-100) * 0.30
│   ├── Calculer SCORE_MONTANT (0-100) * 0.25
│   ├── Calculer SCORE_GEOGRAPHIE (0-100) * 0.20
│   ├── Calculer SCORE_KEYWORDS (0-100) * 0.15
│   ├── Calculer SCORE_FAISABILITE (0-100) * 0.10
│   └── SCORE_FINAL = somme ponderee
├── Si SCORE >= 75 : marquer "a_repondre"
├── Si SCORE 60-74 : marquer "a_qualifier"
└── Si SCORE < 60 : marquer "archive"

ETAPE 6 : GENERER LES LEADS
├── Pour chaque avis score >= 60 :
│   ├── Creer un RawLead avec type "marche_public"
│   ├── Ajouter les metadata du marche
│   └── Envoyer au Master Veilleur
└── Fin
```

### 4.6 Code du scoring

```typescript
// agents/veilleur/marches/scoring.ts

interface AvisMarche {
  id: string
  titre: string
  description: string
  cpv_codes: string[]
  montant_estime: number | null
  date_limite: Date
  acheteur_region: string
  date_publication: Date
}

function scoreAvis(avis: AvisMarche): ScoredAvis {
  // 1. Score CPV (30%)
  const CPV_SCORE_MAP: Record<string, number> = {
    '72212200': 100, '72212216': 100,  // Web dev
    '72000000': 90,                     // IT generique
    '72200000': 85, '72210000': 85,     // IT consulting
    '72212000': 85,                     // Programmation
    '72220000': 80,                     // Maintenance IT
    '72250000': 75,                     // Support IT
    '72260000': 70,                     // Assistance IT
    '72230000': 65, '72240000': 65,     // Infogerance
  }

  let scoreCpv = 0
  for (const cpv of avis.cpv_codes) {
    const cpvScore = CPV_SCORE_MAP[cpv] || (cpv.startsWith('72') ? 70 : 0)
    scoreCpv = Math.max(scoreCpv, cpvScore)
  }

  // 2. Score Montant (25%)
  let scoreMontant = 70 // Defaut si montant inconnu
  if (avis.montant_estime !== null) {
    if (avis.montant_estime < 5000) scoreMontant = 20
    else if (avis.montant_estime <= 90000) scoreMontant = 100  // Sweet spot
    else if (avis.montant_estime <= 200000) scoreMontant = 80
    else if (avis.montant_estime <= 500000) scoreMontant = 50
    else scoreMontant = 10
  }

  // 3. Score Geographie (20%)
  const GEO_SCORES: Record<string, number> = {
    '974': 100, // La Reunion
    '976': 85,  // Mayotte
    '75': 80, '69': 80, '13': 80,  // Paris, Lyon, Marseille
  }
  const scoreGeo = GEO_SCORES[avis.acheteur_region] || 60 // Defaut France

  // 4. Score Keywords (15%)
  const KEYWORDS_POSITIFS: Record<string, number> = {
    'site web': 10, 'web': 8, 'portail': 10,
    'application': 8, 'mobile': 7, 'api': 5,
    'rgaa': 15, 'accessibilite': 15,
    'wordpress': 5, 'drupal': 5, 'react': 5,
    'developpement': 10, 'agence': 8,
    'maintenance': 8, 'support': 5,
    'hebergement': 5, 'cloud': 5,
  }

  const KEYWORDS_NEGATIFS: Record<string, number> = {
    'travaux': -20, 'btp': -20, 'construction': -20,
    'fournitures': -15, 'materiel': -15,
    'transport': -15, 'logistique': -15,
    'restauration': -15, 'nettoyage': -10,
    'gardiennage': -10,
  }

  const texte = `${avis.titre} ${avis.description}`.toLowerCase()
  let rawKeywordScore = 0
  for (const [kw, pts] of Object.entries(KEYWORDS_POSITIFS)) {
    if (texte.includes(kw)) rawKeywordScore += pts
  }
  for (const [kw, pts] of Object.entries(KEYWORDS_NEGATIFS)) {
    if (texte.includes(kw)) rawKeywordScore += pts
  }
  const scoreKeywords = Math.max(0, Math.min(100, 50 + rawKeywordScore))

  // 5. Score Faisabilite (10%)
  const daysToDeadline = Math.floor(
    (avis.date_limite.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  let scoreFaisabilite = 0
  if (daysToDeadline < 3) scoreFaisabilite = 0
  else if (daysToDeadline < 7) scoreFaisabilite = 30
  else if (daysToDeadline < 14) scoreFaisabilite = 70
  else if (daysToDeadline < 45) scoreFaisabilite = 100
  else scoreFaisabilite = 80

  // Bonus RGAA
  if (texte.includes('rgaa') || texte.includes('accessibilite')) {
    scoreFaisabilite += 20
  }
  scoreFaisabilite = Math.min(100, scoreFaisabilite)

  // Score final pondere
  const scoreFinal = Math.round(
    scoreCpv * 0.30 +
    scoreMontant * 0.25 +
    scoreGeo * 0.20 +
    scoreKeywords * 0.15 +
    scoreFaisabilite * 0.10
  )

  // Action
  let action: string
  if (scoreFinal >= 75) action = 'a_repondre'
  else if (scoreFinal >= 60) action = 'a_qualifier'
  else action = 'archive'

  return {
    ...avis,
    score_final: scoreFinal,
    score_detail: {
      cpv: scoreCpv,
      montant: scoreMontant,
      geo: scoreGeo,
      keywords: scoreKeywords,
      faisabilite: scoreFaisabilite,
    },
    action,
    raison: `CPV:${scoreCpv} Mont:${scoreMontant} Geo:${scoreGeo} KW:${scoreKeywords} Fais:${scoreFaisabilite}`,
  }
}
```

### 4.7 Donnees de sortie (Output)

```json
{
  "type": "marche_public",
  "source": "1b_marches",
  "date_detection": "2026-03-18T07:00:00Z",
  "signal_type": "marche_public",
  "tier": 1,
  "reference": "BOAMP-2026-123456",
  "titre": "Refonte du site internet de la commune de Saint-Denis",
  "acheteur": "Mairie de Saint-Denis",
  "acheteur_siret": "21974411000019",
  "type_marche": "mapa",
  "montant_estime": 35000,
  "date_limite": "2026-04-15T12:00:00Z",
  "url_source": "https://boamp-datadila.opendatasoft.com/explore/dataset/boamp/...",
  "plateforme": "boamp",
  "cpv_codes": ["72212200", "72212216"],
  "mots_cles_detectes": ["site web", "RGAA", "accessibilite", "collectivite"],
  "score_pertinence": 85,
  "score_detail": {
    "cpv": 100,
    "montant": 100,
    "geo": 100,
    "keywords": 75,
    "faisabilite": 70
  },
  "action": "a_repondre",
  "localisation": "La Reunion",
  "entreprise": {
    "nom": "Mairie de Saint-Denis",
    "siret": "21974411000019",
    "localisation": "Saint-Denis, La Reunion",
    "segment_estime": "collectivite"
  },
  "contact": null
}
```

### 4.8 Volumes et performance

| Metrique | Valeur estimee |
|----------|---------------|
| Avis BOAMP scannes par jour | 80-130 (IT) |
| Avis pertinents (score >= 60) par semaine | 2-10 |
| Avis haute pertinence (score >= 75) par semaine | 1-3 |
| Avis Reunion specifiques par semaine | 1-5 |
| Marches attribues (DECP) analyses par semaine | 50-100 |
| Temps par run BOAMP | 2-5 min |
| Temps par run profils Reunion | 5-15 min |

### 4.9 Couts detailles

| API/Service | Cout/mois | Notes |
|-------------|----------|-------|
| BOAMP API | 0 EUR | API ouverte gratuite |
| DECP API | 0 EUR | API ouverte gratuite |
| APProch | 0 EUR | Inscription gratuite |
| Playwright (self-hosted) | 0 EUR | Inclus infrastructure |
| **Total 1b** | **0 EUR** | |

### 4.10 Gestion des erreurs

```typescript
const errorHandlers = {
  'BOAMP_API_DOWN': {
    action: 'retry_in_1h',
    maxRetries: 4,
    fallback: 'use_rss_boamp', // https://www.boamp.fr/pages/entreprise-service-dalerte/
    alert: 'slack_warning',
  },
  'PROFIL_ACHETEUR_CHANGED': {
    action: 'log_and_skip',
    fallback: 'manual_check_required',
    alert: 'slack_warning_with_url',
  },
  'SCRAPER_BLOCKED': {
    action: 'rotate_user_agent',
    maxRetries: 3,
    fallback: 'skip_source',
    alert: 'slack_info',
  },
  'PARSING_ERROR': {
    action: 'save_raw_and_skip',
    fallback: 'manual_review_queue',
    alert: 'slack_info',
  },
}
```

### 4.11 Monitoring

| Metrique | Seuil alerte | Action |
|----------|-------------|--------|
| BOAMP API response time > 10s | WARN | Verifier API status |
| 0 avis retournes sur 24h | WARN | Verifier filtres CPV |
| Scraper Reunion echoue 3x | CRITICAL | Verifier structure HTML |
| Score moyen des avis < 40 | INFO | Affiner les filtres |

---

## 5. SOUS-AGENT 1c -- VEILLEUR WEB (Sites & Tech)

### 5.1 Mission precise

**Ce qu'il fait** :
- Prend une liste d'entreprises cibles (injectee manuellement ou depuis scraping sectoriel)
- Scanne leur site web avec Lighthouse (performance, accessibilite, SEO, best practices)
- Detecte la stack technique (CMS, framework, serveur, plugins) via Wappalyzer
- Identifie les sites lents, non accessibles, en technologie obsolete
- Detecte les problemes SSL, HTTPS, sitemap, robots.txt
- Genere un lead avec le signal technique associe

**Ce qu'il ne fait PAS** :
- Il ne construit PAS la liste de sites a scanner (c'est un input)
- Il ne contacte PAS les entreprises
- Il ne fait PAS d'audit approfondi (juste un scan rapide)

### 5.2 Architecture technique

**Stack** :

| Composant | Outil | Cout mensuel | Usage |
|-----------|-------|-------------|-------|
| **Scan performance** | Lighthouse CLI (npm) | 0 EUR | Score perf, a11y, SEO |
| **Fallback perf** | PageSpeed Insights API | 0 EUR | 25,000 req/jour gratuites |
| **Detection stack** | Wappalyzer (npm) | 0 EUR | CMS, framework, plugins |
| **Scan accessibilite** | axe-core + Pa11y | 0 EUR | Violations WCAG/RGAA |
| **Browser headless** | Playwright | 0 EUR | Rendering + screenshots |
| **Queue** | BullMQ + Redis | 0 EUR (inclus) | Gestion batch |
| **SSL check** | Node.js tls module | 0 EUR | Certificat expiration |

**Total sous-agent 1c** : 0 EUR/mois (tout open source)

### 5.3 Donnees d'entree (Input)

```typescript
interface WebScanConfig {
  // Liste de sites a scanner
  sites: Array<{
    url: string
    entreprise: string
    siret?: string
    segment?: string
    source: string // 'annuaire_reunion' | 'sirene_api' | 'google_search' | 'manual'
  }>

  // Seuils de detection
  seuils: {
    performance_critique: number     // < 30
    performance_faible: number       // < 50
    accessibilite_non_conforme: number // < 50
    accessibilite_faible: number     // < 70
    lcp_lent: number                 // > 4000 (ms)
    cls_mauvais: number              // > 0.25
    page_weight_lourd: number        // > 5 (MB)
    ssl_expiration_jours: number     // < 30
  }

  // Configuration scan
  scan: {
    concurrency: number              // 5 (workers paralleles)
    timeoutPerSite: number           // 120000 (ms)
    maxSitesPerNight: number         // 500
    retries: number                  // 3
    cacheTTLSeconds: number          // 172800 (48h)
  }
}
```

**Constitution de la liste de sites** :
- Source 1 : API SIRENE (data.gouv.fr) - filtrer par code APE + departement
- Source 2 : Annuaires sectoriels (notaires, avocats, immobilier, etc.)
- Source 3 : Google Search scraping via Apify
- Source 4 : CCI Reunion + registres locaux
- Source 5 : Injection manuelle (prospects identifies par d'autres sous-agents)

**Frequence** : 1x/jour (nuit, 02:00-06:00), 100-500 sites par run

### 5.4 Processus detaille

```
ETAPE 1 : CHARGER LA LISTE DES SITES
├── Lire la liste depuis la table `sites_a_scanner` en DB
├── Exclure les sites scannes dans les derniers `cacheTTLSeconds`
├── Prioriser : sites jamais scannes > sites avec ancien scan > sites en cache
└── Limiter a `maxSitesPerNight`

ETAPE 2 : ENQUEUE DANS BULLMQ
├── Creer un job BullMQ par site
├── Concurrency : 5 workers en parallele
├── Timeout : 120s par site
└── Retries : 3 avec backoff exponentiel

ETAPE 3 : POUR CHAQUE SITE (worker)
├── 3.1 Lighthouse Audit
│   ├── Lancer chrome-launcher (headless)
│   ├── Executer lighthouse(url, options)
│   ├── Extraire : performance, accessibility, bestPractices, seo
│   ├── Extraire : LCP, FCP, TBT, CLS, INP
│   └── Stocker le rapport complet en JSONB
│
├── 3.2 Wappalyzer Detection
│   ├── Charger le npm wappalyzer
│   ├── Analyser l'URL
│   ├── Extraire : CMS, framework, serveur, analytics, CDN
│   ├── Detecter la version (WordPress, Shopify, etc.)
│   └── Classifier : moderne | acceptable | obsolete
│
├── 3.3 axe-core Accessibilite
│   ├── Ouvrir la page avec Playwright
│   ├── Injecter axe-core
│   ├── Executer analyse WCAG 2.1 AA
│   ├── Compter : violations critical, serious, moderate, minor
│   └── Calculer score accessibilite (0-100)
│
├── 3.4 Verifications complementaires
│   ├── SSL : verifier certificat, date expiration
│   ├── HTTPS : redirection HTTP → HTTPS ?
│   ├── robots.txt : existe ?
│   ├── sitemap.xml : existe ?
│   ├── Page weight : poids total (HTML + CSS + JS + images)
│   └── Screenshot : capture PNG pour reference
│
└── 3.5 Scoring prospect
    ├── Calculer le score technique (cf. section 5.6)
    ├── Si score >= seuil : generer un RawLead
    └── Stocker le resultat en DB

ETAPE 4 : CLASSIFICATION ET OUTPUT
├── URGENT (score >= 70) : site critique, refonte necessaire
├── HIGH (score 50-69) : problemes serieux, optimisation requise
├── MEDIUM (score 30-49) : ameliorations possibles
└── LOW (score < 30) : pas de probleme majeur, archiver
```

### 5.5 Code d'implementation

```typescript
// agents/veilleur/web/scanner.ts
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'
import Wappalyzer from 'wappalyzer'
import { chromium } from 'playwright'
import { injectAxe } from 'axe-playwright'
import * as tls from 'tls'

export class WebScanner {
  async scanSite(url: string): Promise<WebScanResult> {
    const results: Partial<WebScanResult> = { url }

    // 1. Lighthouse
    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] })
    try {
      const lhResult = await lighthouse(url, {
        logLevel: 'error',
        output: 'json',
        port: chrome.port,
      })
      const report = JSON.parse(lhResult!.report as string)

      results.lighthouse = {
        performance: Math.round(report.categories.performance.score * 100),
        accessibility: Math.round(report.categories.accessibility.score * 100),
        bestPractices: Math.round(report.categories['best-practices'].score * 100),
        seo: Math.round(report.categories.seo.score * 100),
        metrics: {
          fcp: report.audits['first-contentful-paint'].numericValue,
          lcp: report.audits['largest-contentful-paint'].numericValue,
          tbt: report.audits['total-blocking-time'].numericValue,
          cls: report.audits['cumulative-layout-shift'].numericValue,
        },
      }
    } finally {
      await chrome.kill()
    }

    // 2. Wappalyzer
    const wappalyzer = new Wappalyzer()
    try {
      const techResult = await wappalyzer.detect({ url, wait: 5000 })
      results.stack = {
        cms: techResult.technologies.find(t => t.categories?.some(c => c.name === 'CMS'))?.name || null,
        cmsVersion: techResult.technologies.find(t => t.categories?.some(c => c.name === 'CMS'))?.version || null,
        framework: techResult.technologies.find(t => t.categories?.some(c => c.name === 'JavaScript frameworks'))?.name || null,
        server: techResult.technologies.find(t => t.categories?.some(c => c.name === 'Web servers'))?.name || null,
        analytics: techResult.technologies.filter(t => t.categories?.some(c => c.name === 'Analytics')).map(t => t.name),
        allTechnologies: techResult.technologies.map(t => ({
          name: t.name,
          version: t.version,
          category: t.categories?.[0]?.name,
        })),
      }
    } catch (e) {
      results.stack = null
    }

    // 3. axe-core accessibilite
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
      await injectAxe(page)
      const axeResults = await page.evaluate(() => {
        return new Promise((resolve) => {
          (window as any).axe.run({ standard: 'wcag2aa' }, (err: any, results: any) => {
            resolve(results)
          })
        })
      })
      results.accessibilite = {
        violations: (axeResults as any).violations?.length || 0,
        violationsCritical: (axeResults as any).violations?.filter((v: any) => v.impact === 'critical').length || 0,
        violationsSerious: (axeResults as any).violations?.filter((v: any) => v.impact === 'serious').length || 0,
        passes: (axeResults as any).passes?.length || 0,
      }

      // Screenshot
      await page.screenshot({ path: `/tmp/screenshots/${encodeURIComponent(url)}.png`, fullPage: false })
    } finally {
      await browser.close()
    }

    // 4. SSL check
    results.ssl = await this.checkSSL(url)

    // 5. SEO checks
    results.seo = await this.checkSEO(url)

    // 6. Page weight
    results.pageWeight = await this.measurePageWeight(url)

    return results as WebScanResult
  }

  private async checkSSL(url: string): Promise<SSLResult> {
    try {
      const hostname = new URL(url).hostname
      return new Promise((resolve) => {
        const socket = tls.connect(443, hostname, {}, () => {
          const cert = socket.getPeerCertificate()
          const expiryDate = new Date(cert.valid_to)
          const daysRemaining = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          socket.end()
          resolve({
            valid: daysRemaining > 0,
            daysRemaining,
            expiryDate: expiryDate.toISOString(),
            warning: daysRemaining < 30 ? 'EXPIRING_SOON' : null,
          })
        })
        socket.on('error', () => resolve({ valid: false, daysRemaining: 0, expiryDate: '', warning: 'SSL_ERROR' }))
      })
    } catch {
      return { valid: false, daysRemaining: 0, expiryDate: '', warning: 'NO_SSL' }
    }
  }

  private async checkSEO(url: string): Promise<SEOResult> {
    const baseUrl = new URL(url).origin
    const [robots, sitemap] = await Promise.allSettled([
      fetch(`${baseUrl}/robots.txt`),
      fetch(`${baseUrl}/sitemap.xml`),
    ])

    return {
      hasRobotsTxt: robots.status === 'fulfilled' && robots.value.status === 200,
      hasSitemap: sitemap.status === 'fulfilled' && sitemap.value.status === 200,
    }
  }

  private async measurePageWeight(url: string): Promise<number> {
    const browser = await chromium.launch()
    let totalBytes = 0
    try {
      const page = await browser.newPage()
      page.on('response', (response) => {
        const headers = response.headers()
        const contentLength = parseInt(headers['content-length'] || '0', 10)
        totalBytes += contentLength
      })
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    } finally {
      await browser.close()
    }
    return totalBytes / (1024 * 1024) // Convertir en MB
  }
}
```

### 5.6 Scoring technique

```typescript
function calculateProspectScore(result: WebScanResult): ProspectClassification {
  let score = 0
  const reasons: string[] = []

  // 1. Performance Lighthouse (poids 40%)
  if (result.lighthouse.performance < 30) {
    score += 40
    reasons.push(`Performance critique (${result.lighthouse.performance}/100)`)
  } else if (result.lighthouse.performance < 50) {
    score += 30
    reasons.push(`Performance faible (${result.lighthouse.performance}/100)`)
  } else if (result.lighthouse.performance < 75) {
    score += 15
    reasons.push(`Performance a ameliorer (${result.lighthouse.performance}/100)`)
  }

  // 2. Accessibilite (poids 25%)
  if (result.lighthouse.accessibility < 50) {
    score += 25
    reasons.push(`Accessibilite non conforme (${result.lighthouse.accessibility}/100) - risque legal RGAA`)
  } else if (result.lighthouse.accessibility < 70) {
    score += 15
    reasons.push(`Accessibilite faible (${result.lighthouse.accessibility}/100)`)
  }

  // 3. Stack technique (poids 20%)
  if (result.stack) {
    // WordPress obsolete
    if (result.stack.cms === 'WordPress' && result.stack.cmsVersion) {
      const majorVersion = parseInt(result.stack.cmsVersion.split('.')[0])
      if (majorVersion < 6) {
        score += 15
        reasons.push(`WordPress obsolete (v${result.stack.cmsVersion})`)
      }
    }
    // jQuery sans framework moderne
    if (result.stack.framework === 'jQuery' && !result.stack.allTechnologies.some(t =>
      ['React', 'Vue.js', 'Angular', 'Next.js', 'Nuxt.js'].includes(t.name)
    )) {
      score += 10
      reasons.push('Stack obsolete (jQuery seul, pas de framework moderne)')
    }
    // Pas de CMS ni framework = fait maison
    if (!result.stack.cms && !result.stack.framework) {
      score += 5
      reasons.push('Site potentiellement fait maison (pas de CMS/framework detecte)')
    }
  }

  // 4. Page weight (poids 10%)
  if (result.pageWeight > 5) {
    score += 10
    reasons.push(`Site tres lourd (${result.pageWeight.toFixed(1)} MB)`)
  } else if (result.pageWeight > 3) {
    score += 5
    reasons.push(`Site lourd (${result.pageWeight.toFixed(1)} MB)`)
  }

  // 5. SSL et SEO (poids 5%)
  if (result.ssl.warning === 'NO_SSL') {
    score += 5
    reasons.push('Pas de HTTPS')
  } else if (result.ssl.warning === 'EXPIRING_SOON') {
    score += 3
    reasons.push(`Certificat SSL expire dans ${result.ssl.daysRemaining} jours`)
  }
  if (!result.seo.hasSitemap) {
    score += 2
    reasons.push('Pas de sitemap.xml')
  }

  // Classification
  const tier = score >= 70 ? 'URGENT' : score >= 50 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW'

  return {
    score: Math.min(100, score),
    tier,
    reasons,
    recommendation: tier === 'URGENT'
      ? 'Refonte complete necessaire - contacter en priorite'
      : tier === 'HIGH'
      ? 'Optimisation serieuse requise - proposer audit gratuit'
      : tier === 'MEDIUM'
      ? 'Ameliorations possibles - approche consultative'
      : 'Pas de besoin evident',
  }
}
```

### 5.7 Donnees de sortie (Output)

```json
{
  "type": "signal_web",
  "source": "1c_web",
  "date_detection": "2026-03-18T03:30:00Z",
  "signal_type": "site_lent",
  "tier": 1,
  "score_signal": 40,
  "site_web": "https://www.entreprise-exemple.fr",
  "entreprise": {
    "nom": "Entreprise Exemple",
    "siret": "12345678900012",
    "site_web": "https://www.entreprise-exemple.fr",
    "segment_estime": "pme_metro",
    "localisation": "Lyon, France"
  },
  "contact": null,
  "audit": {
    "lighthouse": {
      "performance": 28,
      "accessibility": 45,
      "bestPractices": 67,
      "seo": 71,
      "metrics": {
        "fcp": 3200,
        "lcp": 6800,
        "tbt": 450,
        "cls": 0.32
      }
    },
    "stack": {
      "cms": "WordPress",
      "cmsVersion": "5.3",
      "framework": "jQuery",
      "server": "Apache",
      "analytics": ["Google Analytics"],
      "plugins_count": 23
    },
    "accessibilite": {
      "violations": 18,
      "violationsCritical": 5,
      "violationsSerious": 8,
      "passes": 42
    },
    "ssl": {
      "valid": true,
      "daysRemaining": 45,
      "warning": null
    },
    "seo": {
      "hasRobotsTxt": true,
      "hasSitemap": false
    },
    "pageWeight": 4.2
  },
  "problemes_detectes": [
    "Performance critique (28/100)",
    "Accessibilite non conforme (45/100) - risque legal RGAA",
    "WordPress obsolete (v5.3)",
    "Stack obsolete (jQuery seul)",
    "Site lourd (4.2 MB)",
    "Pas de sitemap.xml"
  ],
  "classification": {
    "score": 82,
    "tier": "URGENT",
    "recommendation": "Refonte complete necessaire - contacter en priorite"
  }
}
```

### 5.8 Volumes et performance

| Metrique | Valeur |
|----------|--------|
| Sites scannes par nuit | 100-500 |
| Temps par site (Lighthouse + Wappalyzer + axe) | 45-90 secondes |
| Avec 5 workers paralleles | 100 sites en ~30 min, 500 en ~2.5h |
| Sites "URGENT" detectes par nuit | 5-15 |
| Sites "HIGH" detectes par nuit | 10-30 |
| Stockage screenshots | ~70KB/site = 35 MB/nuit pour 500 sites |
| Cache Redis (resultats) | ~2KB/site = 1 MB pour 500 sites |

### 5.9 Couts

| Service | Cout/mois |
|---------|----------|
| Lighthouse CLI | 0 EUR |
| Wappalyzer npm | 0 EUR |
| axe-core | 0 EUR |
| Playwright | 0 EUR |
| PageSpeed Insights API (fallback) | 0 EUR |
| VPS 4-core pour workers (inclus infra globale) | 0 EUR |
| **Total 1c** | **0 EUR** |

### 5.10 Gestion des erreurs

```typescript
const errorHandlers = {
  'SITE_TIMEOUT': {
    action: 'mark_as_unreachable',
    data: { status: 'unreachable', error: 'TIMEOUT_120S' },
    retry: false,
    alert: 'none', // Normal pour certains sites
  },
  'DNS_FAILED': {
    action: 'mark_as_invalid',
    data: { status: 'invalid_domain' },
    retry: false,
    alert: 'none',
  },
  'WAF_BLOCKED': {
    action: 'retry_with_different_user_agent',
    maxRetries: 2,
    fallback: 'use_pagespeed_api_only',
    alert: 'slack_info',
  },
  'LIGHTHOUSE_CRASH': {
    action: 'retry_with_reduced_config',
    config: { onlyPerformance: true },
    maxRetries: 2,
    alert: 'slack_warning',
  },
  'OUT_OF_MEMORY': {
    action: 'restart_worker',
    reduceConcurrency: true,
    alert: 'slack_critical',
  },
}
```

### 5.11 Monitoring

| Metrique | Seuil alerte |
|----------|-------------|
| Taux d'echec scan > 30% | WARN |
| Taux d'echec scan > 50% | CRITICAL |
| Temps total run > 4h | WARN |
| 0 leads URGENT detectes en 7 jours | INFO (revoir seuils) |
| RAM usage worker > 2GB | WARN |
| Disk usage screenshots > 1GB | INFO (purger anciens) |

---

## 6. SOUS-AGENT 1d -- VEILLEUR JOB BOARDS + SIGNAUX SUPPLEMENTAIRES

### 6.1 Mission precise

**Ce qu'il fait** :
- Scrape les offres d'emploi sur LinkedIn Jobs, Indeed, Welcome to the Jungle, HelloWork
- Filtre les offres revelant un besoin web/dev externalisable
- Detecte les entreprises qui recrutent des profils tech (signal : budget tech disponible)
- Surveille les levees de fonds et actualites via flux RSS
- Monitore les expirations SSL et les avis clients negatifs

**Ce qu'il ne fait PAS** :
- Il ne postule PAS aux offres d'emploi
- Il ne contacte PAS les entreprises
- Il ne scrape PAS directement LinkedIn (utilise des services tiers)

### 6.2 Architecture technique

**Stack et APIs** :

| Composant | Service | Cout mensuel | Usage |
|-----------|---------|-------------|-------|
| **LinkedIn Jobs** | Apify LinkedIn Jobs Scraper | 49 USD/mois | Scraping structure job posts |
| **WTTJ** | Apify WTTJ Scraper | 10 USD/mois | Startups/tech FR |
| **Indeed** | HasData Indeed API | 50 USD/mois | Large volume offres |
| **HelloWork** | Apify scraper | Inclus Apify | Offres regionales |
| **RSS news** | Feedparser (npm) | 0 EUR | Levees, actualites |
| **SSL monitoring** | Node.js tls module | 0 EUR | Expirations certificats |
| **WHOIS** | WhoisFreaks API | 29 USD/mois | Expirations domaines |

**Total sous-agent 1d** : ~138 USD/mois (~130 EUR)

### 6.3 Donnees d'entree (Input)

```typescript
interface JobBoardScanConfig {
  // Mots-cles de veille
  keywords: string[]
  // ['developpeur web', 'developpeur react', 'developpeur frontend',
  //  'developpeur fullstack', 'chef de projet digital', 'webmaster',
  //  'integrateur web', 'developpeur shopify', 'developpeur mobile',
  //  'product manager web', 'UX designer', 'webdesigner']

  // Plateformes
  platforms: Array<{
    name: 'linkedin_jobs' | 'wttj' | 'indeed' | 'hellowork' | 'apec'
    enabled: boolean
    maxResults: number  // par run
  }>

  // Filtre geographique
  geography: string[]  // ['France', 'Paris', 'Lyon', 'Marseille', 'Reunion']

  // Sources supplementaires
  rssFeedsLevees: string[]
  // ['https://www.maddyness.com/feed/?tag=levee-de-fonds',
  //  'https://bigmedia.bpifrance.fr/feed']

  sslMonitoring: {
    domains: string[]  // Liste de domaines a surveiller
    alertThresholdDays: number  // 30
  }
}
```

**Frequence** : 1x/jour (06:00) pour job boards ; 4x/jour pour RSS ; 1x/semaine pour SSL

### 6.4 Processus detaille

```
ETAPE 1 : SCRAPE JOB BOARDS (parallele)
├── 1.1 LinkedIn Jobs (via Apify)
│   ├── Lancer l'actor Apify avec keywords + location
│   ├── Max 500 resultats par run
│   ├── Extraire : titre, entreprise, localisation, description, date
│   └── Filtrer : garder les offres < 7 jours
│
├── 1.2 Welcome to the Jungle (via Apify)
│   ├── Lancer l'actor WTTJ
│   ├── Max 200 resultats
│   ├── Extraire : idem + salaire, stack technique, culture
│   └── Avantage : startups/tech FR = source premium
│
├── 1.3 Indeed (via HasData API)
│   ├── Query API HasData
│   ├── Max 500 resultats
│   └── Extraire : idem
│
└── 1.4 HelloWork (via Apify)
    ├── Max 300 resultats
    └── Focus offres regionales

ETAPE 2 : ANALYSE DES OFFRES
├── Pour chaque offre :
│   ├── Classifier le type de besoin :
│   │   ├── "developpeur web" = projet web actif
│   │   ├── "chef de projet digital" = transformation digitale
│   │   ├── "webmaster" = maintenance/refonte site
│   │   ├── "product manager" = scaling produit
│   │   └── "UX designer" = refonte design
│   │
│   ├── Estimer le budget externalisable :
│   │   ├── Salaire propose * 1.5 = budget comparable
│   │   ├── Ex: offre a 3K/mois -> budget ~4.5K/mois externalisable
│   │   └── Ex: offre a 50K/an -> Axiom livre en 4-6 semaines pour 15-30K
│   │
│   ├── Evaluer la "externalisabilite" :
│   │   ├── CDI + profil generaliste = potentiel moyen
│   │   ├── CDD/freelance + profil specialise = potentiel fort
│   │   ├── Plusieurs postes ouverts = grosse equipe, moins externalisable
│   │   └── Premier poste tech = start-up qui debute, tres externalisable
│   │
│   └── Scorer l'offre (0-100) :
│       ├── Pertinence du poste (30%)
│       ├── Taille entreprise (20%)
│       ├── Budget estime (20%)
│       ├── Externalisabilite (20%)
│       └── Geographie (10%)

ETAPE 3 : VEILLE SUPPLEMENTAIRE (parallele)
├── 3.1 RSS Levees de fonds
│   ├── Parser Maddyness MaddyMoney
│   ├── Parser BPI France Big Media
│   ├── Parser Les Echos Startups
│   ├── Extraire : entreprise, montant, type round
│   └── Generer signal "levee_fonds" si pertinent
│
├── 3.2 SSL Monitoring (hebdomadaire)
│   ├── Verifier tous les domaines de la watchlist
│   ├── Alerter si expiration < 30 jours
│   └── Signal = maintenance IT negligee
│
└── 3.3 Avis clients (optionnel, hebdomadaire)
    ├── Surveiller Trustpilot/Google Reviews des agences web concurrentes
    ├── Avis 1-2 etoiles = client mecontent = lead potentiel
    └── Generer signal "churn_concurrent"

ETAPE 4 : GENERER LES LEADS
├── Pour chaque offre score >= 50 : generer un RawLead
├── Pour chaque levee de fonds : generer un RawLead (Tier 1)
├── Pour chaque SSL expirant : generer un RawLead (Tier 3)
└── Envoyer au Master Veilleur
```

### 6.5 Scoring des offres d'emploi

```typescript
function scoreJobPosting(job: JobPosting): number {
  let score = 0

  // 1. Pertinence du poste (30 pts max)
  const roleScores: Record<string, number> = {
    'developpeur web': 25,
    'developpeur react': 30,
    'developpeur frontend': 25,
    'developpeur fullstack': 20,
    'chef de projet digital': 25,
    'webmaster': 20,
    'integrateur web': 15,
    'developpeur shopify': 30,
    'developpeur mobile': 20,
    'product manager': 15,
    'ux designer': 15,
    'webdesigner': 15,
  }
  for (const [role, pts] of Object.entries(roleScores)) {
    if (job.title.toLowerCase().includes(role)) {
      score += pts
      break
    }
  }

  // 2. Taille entreprise (20 pts max)
  if (job.companySize) {
    if (job.companySize >= 10 && job.companySize <= 200) score += 20
    else if (job.companySize > 200 && job.companySize <= 500) score += 15
    else if (job.companySize < 10) score += 10
    else score += 5 // > 500 = grosse boite, moins externalisable
  } else {
    score += 10 // Inconnu
  }

  // 3. Budget estime (20 pts max)
  if (job.salaryMax) {
    const budgetExternalisable = job.salaryMax * 1.5
    if (budgetExternalisable >= 15000 && budgetExternalisable <= 100000) score += 20
    else if (budgetExternalisable > 100000) score += 10
    else score += 5
  } else {
    score += 10
  }

  // 4. Externalisabilite (20 pts max)
  const desc = (job.description || '').toLowerCase()
  if (desc.includes('freelance') || desc.includes('mission')) score += 20
  else if (desc.includes('cdd') || desc.includes('stage')) score += 15
  else if (desc.includes('premier recrutement') || desc.includes('equipe a creer')) score += 18
  else score += 10 // CDI standard

  // 5. Geographie (10 pts max)
  const loc = (job.location || '').toLowerCase()
  if (loc.includes('reunion') || loc.includes('974')) score += 10
  else if (loc.includes('paris') || loc.includes('lyon') || loc.includes('marseille')) score += 8
  else if (loc.includes('france') || loc.includes('remote')) score += 7
  else score += 3

  return Math.min(100, score)
}
```

### 6.6 Donnees de sortie (Output)

**Output job board** :
```json
{
  "type": "signal_jobboard",
  "source": "1d_jobboards",
  "date_detection": "2026-03-18T06:30:00Z",
  "signal_type": "recrutement_dev_web",
  "tier": 2,
  "score_signal": 20,
  "offre": {
    "titre": "Developpeur React Senior",
    "plateforme": "wttj",
    "url": "https://www.welcometothejungle.com/fr/companies/meditech/jobs/dev-react",
    "date_publication": "2026-03-15",
    "localisation": "Lyon",
    "type_contrat": "CDI",
    "salaire_min": 45000,
    "salaire_max": 55000
  },
  "entreprise": {
    "nom": "MediTech Solutions",
    "site_web": "https://www.meditech.fr",
    "taille_estimee": "50-200",
    "localisation": "Lyon, France",
    "segment_estime": "pme_metro"
  },
  "analyse": {
    "budget_estime_externe": "15000-30000 EUR (projet)",
    "externalisabilite": "haute",
    "raison": "L'entreprise cherche un dev React senior en CDI. Cout emploi ~65K/an + 6 mois recrutement. Alternative Axiom : projet livre en 4-6 semaines pour 15-30K EUR."
  },
  "contact": null
}
```

**Output levee de fonds** :
```json
{
  "type": "signal_supplementaire",
  "source": "1d_jobboards",
  "date_detection": "2026-03-18T10:00:00Z",
  "signal_type": "levee_fonds",
  "tier": 1,
  "score_signal": 35,
  "detail": "DataViz SAS a leve 5M EUR en Serie A aupres de Partech",
  "entreprise": {
    "nom": "DataViz SAS",
    "localisation": "Paris, France",
    "segment_estime": "startup"
  },
  "contact": null,
  "metadata": {
    "rss_source": "maddyness",
    "round_type": "Serie A",
    "amount": 5000000,
    "investors": ["Partech"]
  }
}
```

### 6.7 Volumes et performance

| Metrique | Valeur |
|----------|--------|
| Offres scrapees par jour (toutes plateformes) | 1000-2000 |
| Offres pertinentes (score >= 50) par jour | 30-80 |
| Offres haute pertinence (score >= 70) par jour | 5-15 |
| Levees de fonds detectees par semaine | 3-10 |
| Alertes SSL par semaine | 0-5 |
| Temps de run job boards | 15-30 min |
| Temps de run RSS | 2-5 min |

### 6.8 Couts detailles

| Service | Cout/mois | Usage |
|---------|----------|-------|
| Apify (LinkedIn Jobs + WTTJ + HelloWork) | 49 USD | Starter plan |
| HasData Indeed | 50 USD | ~25K offres/mois |
| WhoisFreaks | 29 USD | Monitoring domaines |
| RSS parsing | 0 EUR | Open source |
| **Total 1d** | **~128 USD (120 EUR)** | |

### 6.9 Gestion des erreurs

```typescript
const errorHandlers = {
  'APIFY_ACTOR_FAILED': {
    action: 'retry_actor',
    maxRetries: 2,
    fallback: 'use_cached_results_24h',
    alert: 'slack_warning',
  },
  'INDEED_API_429': {
    action: 'pause_1h_and_retry',
    maxRetries: 3,
    fallback: 'skip_indeed_this_run',
    alert: 'slack_info',
  },
  'WTTJ_STRUCTURE_CHANGED': {
    action: 'log_and_alert',
    fallback: 'disable_wttj_until_fix',
    alert: 'slack_critical',
  },
  'RSS_FEED_EMPTY': {
    action: 'retry_in_2h',
    maxRetries: 3,
    fallback: 'skip',
    alert: 'none',
  },
}
```

### 6.10 Monitoring

| Metrique | Seuil alerte |
|----------|-------------|
| Offres scrapees/jour < 100 | WARN |
| Offres scrapees/jour < 10 | CRITICAL |
| Apify actor fail 2x consecutif | CRITICAL |
| RSS feeds 0 articles en 48h | WARN |
| Budget Apify > 80% du plan | WARN |

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
| Budget total pipeline 7 agents (estime) | ~1500-2000 EUR |
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
