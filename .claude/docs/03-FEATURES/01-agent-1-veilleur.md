# Agent 1 — VEILLEUR (Master Orchestrateur)

## Vue d'Ensemble

L'Agent 1 (VEILLEUR) est le premier maillon du pipeline de prospection Axiom Marketing. Il détecte en continu les opportunités commerciales sur 4 canaux parallèles — LinkedIn, marchés publics, sites web, et job boards — et transmet des leads normalisés et pré-scorés à l'Agent 2 (ENRICHISSEUR). Il ne contacte aucun prospect, n'enrichit aucune donnée, et ne porte aucun jugement de qualité finale : sa responsabilité est de capturer les signaux d'achat, de dédupliquer les détections multi-sources, et de prioriser la file d'attente d'enrichissement.

## Sous-Agents

| ID | Nom | Rôle | Fréquence | API Principale |
|----|-----|------|-----------|----------------|
| 1a | Veilleur LinkedIn | Détecte signaux business (levées de fonds, changements de poste, recrutements, croissance) | 4x/jour (07h, 12h, 18h, 23h) | Netrows API + SignalsAPI |
| 1b | Veilleur Marchés Publics | Scrute BOAMP, DECP, profils acheteurs DOM-TOM pour AO IT/digital | 2x/jour (06h, 14h) | BOAMP API (gratuit) + APProch |
| 1c | Veilleur Web (Sites & Tech) | Scan Lighthouse, stack technique, RGAA sur 100-500 sites/nuit | 1x/jour (02h) | Playwright + axe-core (gratuit) |
| 1d | Veilleur Job Boards | Détecte offres recrutement dev web/digital comme signal de besoin externalisable | 1x/jour (06h) | Apify + HasData Indeed |

## Input / Output

### Input (depuis l'extérieur — sources web)

L'Agent 1 n'a pas d'input structuré depuis un autre agent. Il consomme des sources externes :

```json
{
  "sources_1a": ["Netrows API LinkedIn signals", "SignalsAPI Crunchbase/LinkedIn", "RSS flux LinkedIn"],
  "sources_1b": ["BOAMP API REST", "DECP data.gouv.fr", "profil-acheteur.fr", "e-marches.fr"],
  "sources_1c": ["Liste sites_a_scanner (table PostgreSQL)", "PageSpeed Insights API", "Playwright headless"],
  "sources_1d": ["Apify LinkedIn Jobs scraper", "Apify WTTJ scraper", "HasData Indeed API", "HelloWork scraper"]
}
```

### Output (vers Agent 2 — ENRICHISSEUR)

Transmis via queue BullMQ `enrichisseur-pipeline` :

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
      "detail": "Nommée CMO chez TechCorp il y a 3 semaines",
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

## Workflow

**Étape 1 — Collecte parallèle (06h-23h)**
- 1a LinkedIn tourne 4 fois/jour via Netrows API + SignalsAPI : récupère les signaux `levee_fonds`, `changement_poste`, `recrutement_actif`, `croissance_equipe`, `post_besoin_tech`, `engagement_contenu`
- 1b Marchés Publics tourne 2 fois/jour : interroge BOAMP sur les codes CPV `72212200`, `72212210`, `72212216`, `72000000`, `72200000` (services IT/web), filtre par région (priorité DOM-TOM)
- 1c Veille Web tourne à 02h en batch : lance Playwright + Lighthouse sur 100-500 sites de la table `sites_a_scanner`, évalue performance/stack/accessibilité
- 1d Job Boards tourne à 06h : scrape WTTJ, Indeed, LinkedIn Jobs, HelloWork sur mots-clés `développeur web`, `développeur react`, `chef de projet digital`, `webmaster`, `développeur shopify`

**Étape 2 — Consolidation Master (08h, 15h, 21h)**
- Le Master collecte tous les leads bruts produits depuis la dernière consolidation
- Calcule la clé de déduplication : priorité SIRET → domaine web → LinkedIn URL → nom normalisé (Levenshtein < 3)
- Fusionne les signaux si même entreprise détectée sur plusieurs canaux
- Applique le bonus multi-source : `nb_detections >= 3` → +15 pts, `nb_detections == 2` → +10 pts

**Étape 3 — Pré-scoring**
Calcul rapide 0-100 basé sur : force du signal principal (max 35 pts), bonus multi-source (max 15 pts), segment match (max 25 pts), fraîcheur du signal (max 10 pts), géographie (max 15 pts)

**Étape 4 — Dispatch vers l'Enrichisseur**
- Trier par pre_score décroissant
- Envoyer en BullMQ avec priorité 1 (HOT, pre_score >= 60), 5 (WARM, 40-59), 10 (COLD, < 40)
- Max 3 tentatives, backoff exponentiel 5s

**Étape 5 — Rapport quotidien (23h30)**
Génère `DailyReport` avec volumes par source, taux de déduplication, top signaux, erreurs, coûts API

## APIs & Coûts

| API | Coût/mois | Crédits | Rate Limit |
|-----|-----------|---------|------------|
| Netrows API (signaux LinkedIn) | 99 EUR | Illimité (plan mensuel) | Variable |
| SignalsAPI (Crunchbase/LinkedIn) | 99 USD (~93 EUR) | Inclus plan | Variable |
| Make.com (workflows automation) | 29 EUR | 10 000 ops | N/A |
| Hunter.io (partage entre agents) | 12 EUR (1/4 du plan 49 EUR) | 375 crédits/mois alloués | 30 req/min |
| Apify (LinkedIn Jobs + WTTJ + HelloWork) | 49 USD (~46 EUR) | Selon usage | 1 req/s |
| HasData Indeed API | 50 USD (~47 EUR) | 5 000 requêtes | 10 req/s |
| WhoisFreaks (lookup domaines) | 29 USD (~27 EUR) | 5 000 lookups | 10 req/s |
| Infrastructure VPS (Redis + PostgreSQL + Workers) | 40 EUR | N/A | N/A |
| Hunter.io (reste alloué aux autres sous-agents 1) | 37 EUR | Reste du plan | N/A |

**Total Agent 1 : ~430 EUR/mois**

## Base de Données

### Tables Principales

```sql
-- Leads bruts (output Veilleur, input Enrichisseur)
CREATE TABLE leads_bruts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  source_primaire     VARCHAR(20) NOT NULL, -- '1a_linkedin' | '1b_marches' | '1c_web' | '1d_jobboards'
  sources             TEXT[] DEFAULT ARRAY[]::TEXT[],
  nb_detections       INTEGER DEFAULT 1,
  entreprise_nom      VARCHAR(255),
  entreprise_siret    VARCHAR(20),
  entreprise_site_web VARCHAR(500),
  entreprise_linkedin VARCHAR(500),
  segment_estime      VARCHAR(50),
  contact_prenom      VARCHAR(100),
  contact_nom         VARCHAR(100),
  contact_poste       VARCHAR(200),
  contact_linkedin    VARCHAR(500),
  contact_email       VARCHAR(255),
  signaux             JSONB DEFAULT '[]'::JSONB,
  signal_principal    TEXT,
  signal_tier         INTEGER, -- 1, 2, 3
  pre_score           INTEGER DEFAULT 0,
  pre_score_detail    JSONB,
  statut              VARCHAR(20) DEFAULT 'nouveau', -- 'nouveau'|'envoye_enrichisseur'|'deduplique'|'archive'
  batch_id            VARCHAR(100),
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- Marchés publics détectés
CREATE TABLE marches_publics (
  id                  SERIAL PRIMARY KEY,
  reference           VARCHAR(100) UNIQUE,
  titre               TEXT NOT NULL,
  acheteur            VARCHAR(255),
  acheteur_siret      VARCHAR(20),
  type_marche         VARCHAR(30), -- 'mapa' | 'ao_ouvert' | 'ao_restreint' | 'accord_cadre'
  montant_estime      DECIMAL,
  date_publication    TIMESTAMP,
  date_limite         TIMESTAMP,
  score_pertinence    INTEGER DEFAULT 0,
  action              VARCHAR(30) DEFAULT 'a_qualifier', -- 'a_repondre'|'a_qualifier'|'archive'
  decision            VARCHAR(20), -- 'go'|'no_go'|'en_cours'|'soumis'|'gagne'|'perdu'
  cpv_codes           TEXT[],
  lead_id             UUID REFERENCES leads_bruts(id),
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Audits techniques (résultats 1c)
CREATE TABLE audits_techniques (
  id                  SERIAL PRIMARY KEY,
  url                 VARCHAR(500) NOT NULL,
  lh_performance      INTEGER,
  lh_accessibility    INTEGER,
  lh_seo              INTEGER,
  stack_cms           VARCHAR(100),
  stack_cms_version   VARCHAR(50),
  a11y_violations     INTEGER DEFAULT 0,
  a11y_critical       INTEGER DEFAULT 0,
  ssl_valid           BOOLEAN,
  prospect_score      INTEGER DEFAULT 0,
  prospect_tier       VARCHAR(10), -- 'URGENT'|'HIGH'|'MEDIUM'|'LOW'
  lead_id             UUID REFERENCES leads_bruts(id),
  scanned_at          TIMESTAMP DEFAULT NOW()
);

-- Offres d'emploi détectées
CREATE TABLE offres_emploi (
  id                  SERIAL PRIMARY KEY,
  plateforme          VARCHAR(30) NOT NULL, -- 'linkedin_jobs'|'wttj'|'indeed'|'hellowork'
  url_offre           VARCHAR(500) UNIQUE,
  titre               VARCHAR(300),
  entreprise_nom      VARCHAR(255),
  score_pertinence    INTEGER DEFAULT 0,
  externalisabilite   VARCHAR(20), -- 'haute'|'moyenne'|'faible'
  lead_id             UUID REFERENCES leads_bruts(id),
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Signaux LinkedIn
CREATE TABLE signaux_linkedin (
  id                  SERIAL PRIMARY KEY,
  signal_type         VARCHAR(50) NOT NULL,
  tier                INTEGER NOT NULL, -- 1, 2, 3
  score_signal        INTEGER DEFAULT 0,
  entreprise_nom      VARCHAR(255),
  contact_linkedin    VARCHAR(500),
  date_signal         TIMESTAMP,
  api_source          VARCHAR(50), -- 'netrows'|'signalsapi'|'rss'|'crunchbase'
  lead_id             UUID REFERENCES leads_bruts(id),
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Table déduplication
CREATE TABLE deduplication_log (
  id                  SERIAL PRIMARY KEY,
  lead_source_id      UUID NOT NULL,
  lead_merged_into_id UUID NOT NULL,
  match_type          VARCHAR(50) -- 'siret'|'domain'|'linkedin'|'name_fuzzy'
);

-- Table batchs Master
CREATE TABLE veilleur_batches (
  id                  SERIAL PRIMARY KEY,
  batch_id            VARCHAR(100) NOT NULL UNIQUE,
  nb_leads_bruts      INTEGER DEFAULT 0,
  nb_leads_dedupliques INTEGER DEFAULT 0,
  nb_leads_hot        INTEGER DEFAULT 0,
  nb_leads_warm       INTEGER DEFAULT 0,
  nb_leads_cold       INTEGER DEFAULT 0,
  duree_seconds       INTEGER,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Sites à scanner (input 1c)
CREATE TABLE sites_a_scanner (
  id                  SERIAL PRIMARY KEY,
  url                 VARCHAR(500) NOT NULL UNIQUE,
  entreprise_nom      VARCHAR(255),
  segment             VARCHAR(50),
  priorite            INTEGER DEFAULT 5,
  dernier_scan        TIMESTAMP,
  actif               BOOLEAN DEFAULT true
);
```

## Scheduling

| Cron | Action | Description |
|------|--------|-------------|
| `0 2 * * *` | runWebScan() | 1c scan Lighthouse 100-500 sites, concurrency 5 |
| `0 6,14 * * *` | runMarchesPublics() | 1b query BOAMP + DECP, CPV codes IT |
| `0 6 * * *` | runJobBoards() | 1d scrape WTTJ + Indeed + LinkedIn Jobs + HelloWork |
| `0 7,12,18,23 * * *` | runLinkedInScan() | 1a signaux Tier 1+2+3, 5 segments |
| `0 8,15,21 * * *` | runConsolidation() | Master dédup + normalisation + pre_score + dispatch |
| `30 23 * * *` | runDailyReport() | Rapport quotidien métriques + coûts API |

## Error Handling

| Erreur | Action | Fallback |
|--------|--------|----------|
| Netrows API timeout (>30s) | Log erreur, skip batch 1a | Utiliser SignalsAPI seul |
| BOAMP API indisponible | Retry 3x avec backoff 5s | Skip 1b, attendre prochain cron |
| Playwright crash sur site | Log URL, continuer avec site suivant | Flag site comme `scan_failed` |
| Apify rate limit 429 | Attendre 60s, retry | Passer à scraper suivant |
| BullMQ connexion Redis perdue | Circuit breaker, alerte Slack | Stocker leads en table tampon |
| Lead sans `entreprise.nom` | Rejeter avec log `ERREUR_LEAD_INCOMPLET` | Aucun fallback — champ obligatoire |
| Deduplication key collision SIRET | Merge signaux sur lead existant | Incrémenter `nb_detections` |
| `nb_detections >= 3` mais sources identiques | Normaliser sources, ne pas doubler le bonus | Compter sources uniques seulement |
| Alerte Slack si `leadsLast24h < 10` | Notification #ops-alerts | Investigation manuelle |
| Sous-agent status `down` | Alerte Slack #ops-alerts niveau danger | Mode dégradé : continuer les autres sous-agents |

## KPIs & Métriques

| KPI | Cible | Fréquence |
|-----|-------|-----------|
| Leads bruts / jour | 30-80 | Quotidien |
| Leads qualifiés (pre_score >= 60) / jour | 8-20 | Quotidien |
| Taux de déduplication | 10-25% | Quotidien |
| Coût par lead brut | 0,18-0,48 EUR | Quotidien |
| Coût par lead qualifié | 0,72-2,15 EUR | Hebdomadaire |
| Erreurs sous-agents / 24h | < 5% | Quotidien |
| Temps de consolidation (batch) | < 10 min | Quotidien |

## Edge Cases

- **Double détection simultanée** : Si 1a et 1d détectent la même entreprise dans le même batch, la fusion est gérée par `computeDeduplicationKey()` — le lead résultant reçoit `nb_detections: 2` et le bonus multi-source de +10 pts
- **SIRET absent** : La déduplication tombe en fallback domaine → LinkedIn URL → nom normalisé Levenshtein. Risque de faux doublons si noms d'entreprises similaires sans domaine
- **Site web inaccessible lors du scan 1c** : Playwright timeout à 120s. Le site est marqué `scan_failed` mais génère quand même un lead si d'autres signaux existent
- **Marché public avec délai < 7 jours** : Pré-score renforcé (bonus fraîcheur max) + priorité 1 en queue
- **Levée de fonds non confirmée** : SignalsAPI peut détecter des fausses levées (annonces avant clôture). Le signal `levee_fonds` est conservé avec `confidence` dans les métadonnées
- **Segment inconnu** : Si `segment_estime` ne peut pas être déterminé, défaut `pme_metro` avec pénalité dans le pre_score
- **Candidat déjà client Axiom** : Détection par domaine dans `clients_actifs`. Skip automatique avant dispatch vers Enrichisseur

## Budget

| Poste | Coût/mois |
|-------|-----------|
| Netrows API (1a signaux LinkedIn) | 99 EUR |
| SignalsAPI (1a LinkedIn/Crunchbase) | ~93 EUR |
| Make.com (1a workflows) | 29 EUR |
| Hunter.io partagé (1a quota) | 12 EUR |
| Apify (1d job boards) | ~46 EUR |
| HasData Indeed (1d) | ~47 EUR |
| WhoisFreaks (1d) | ~27 EUR |
| Infrastructure VPS | 40 EUR |
| Hunter.io reste alloué | 37 EUR |
| **Total** | **~430 EUR/mois** |

ROI estimé : leads bruts 900-2400/mois à 0,18-0,48 EUR/lead ; si 2% en deal à 10 000 EUR avg = ROI 100x-700x

## Référence Spec

`.claude/source-ia/agent/AGENT-1-MASTER.md`
Sous-agents détaillés : `AGENT-1a-LINKEDIN.md`, `AGENT-1b-MARCHES-PUBLICS.md`, `AGENT-1c-VEILLE-WEB.md`, `AGENT-1d-JOBBOARDS.md`
