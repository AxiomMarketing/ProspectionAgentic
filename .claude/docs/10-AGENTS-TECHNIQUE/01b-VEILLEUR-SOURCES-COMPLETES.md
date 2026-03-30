# Agent 1 — VEILLEUR — Sources de données complètes

**Complément à :** `01-AGENT-1-VEILLEUR.md`
**Sources analysées :** Specs IA (`source-ia/agent/AGENT-1*.md`) + Brainstorm 26/03/2026

---

## INVENTAIRE EXHAUSTIF DES SOURCES — Par sous-agent

### Sous-Agent 1a — LinkedIn (Signaux business)

#### Sources documentées dans les specs

| # | Source | API/Outil | Coût/mois | Ce qu'elle fournit |
|---|--------|-----------|:---------:|-------------------|
| 1 | **Netrows API** | REST API | 99€ (40K crédits) | Profils LinkedIn, employés entreprise, changements poste |
| 2 | **SignalsAPI** | REST API | 99$ | Job postings, hiring velocity, headcount changes |
| 3 | **Crunchbase RSS** | RSS gratuit | 0€ | Levées de fonds (via Maddyness, BPI France) |
| 4 | **n8n** (self-hosted) | Workflows | 0€ | Conversion RSS → webhooks pour monitoring posts |
| 5 | **Hunter.io** | REST API | 49€ (partagé) | Email extraction des contacts identifiés |

#### Sources additionnelles identifiées (brainstorm)

| # | Source | API/Outil | Coût/mois | Ce qu'elle fournit |
|---|--------|-----------|:---------:|-------------------|
| 6 | **People Data Labs** (alt. Netrows) | REST API | 98$/mois | Profils professionnels, alternative budget |
| 7 | **Cognism** | SaaS | ~500€/mois | Données B2B RGPD-compliant, signaux intent |
| 8 | **Pharow** | SaaS | ~100€/mois | 4M entreprises FR, 1300+ filtres, stack tech |

#### 5 types de signaux détectés

```
TIER 1 (ROI > 40%, latence max 24h) :
├── changement_poste     → nouveau CMO/CTO/DG nommé        → 25-35 pts
└── levee_fonds          → Série A/B/C annoncée             → 25-35 pts

TIER 2 (ROI 15-40%, latence max 48h) :
├── recrutement_actif    → ≥3 postes tech ouverts           → 15-25 pts
├── croissance_equipe    → +10% headcount en 90j            → 15-25 pts
└── post_besoin_tech     → post LinkedIn avec mots-clés     → 10-20 pts

TIER 3 (ROI < 15%, latence max 72h) :
└── engagement_contenu   → like/comment sur contenu tech    → 5-15 pts
```

#### Processus détaillé (5 étapes parallèles)

```
1.1 Changements de poste (Netrows)
    GET /api/v1/companies/{id}/employees?changed_since=6h
    → Filtrer : rôles C-level + segments cibles
    → Output : {person, old_role, new_role, company}

1.2 Annonces de recrutement (SignalsAPI)
    → Filtrer : postes marketing/digital/dev/IT
    → Seuil : ≥3 postes ouverts = signal fort
    → Output : {company, jobs_count, job_titles}

1.3 Croissance équipe (Netrows)
    → Comparer avec snapshot précédent (DB)
    → Seuil : +10% en 90 jours
    → Output : {company, old_count, new_count, growth_rate}

1.4 Levées de fonds (RSS)
    → Crunchbase, Maddyness, BPI France
    → Output : {company, round_type, amount, date}

1.5 Posts avec mots-clés (RSS + n8n)
    → Filtrage NLP sur mots-clés
    → Output : {author, company, post_text, keywords_matched}
```

#### Extraction contact

```
Après détection du signal, chercher le décideur :
├── Segment pme_metro     → CMO, DG, CTO
├── Segment ecommerce     → Founder, Head of Growth
├── Segment collectivite  → DGS, DSI
├── Segment startup       → Founder, CTO
└── Segment agence_wl     → Fondateur
```

---

### Sous-Agent 1b — Marchés Publics

#### Sources documentées dans les specs

| # | Source | Endpoint | Coût | Ce qu'elle fournit |
|---|--------|----------|:----:|-------------------|
| 1 | **BOAMP API** | `boamp-datadila.opendatasoft.com/api/v2/` | 0€ | Avis de marchés publics |
| 2 | **DECP API** | `data.economie.gouv.fr/explore/dataset/decp-v3-marches-valides/api/` | 0€ | Marchés attribués (veille concurrentielle) |
| 3 | **APProch** | `data.economie.gouv.fr/explore/dataset/projets-dachats-publics/api/` | 0€ | Projets d'achats futurs (AVANT publication AO) |
| 4 | **Profils acheteurs Réunion** | Scraping Playwright | 0€ | AO locaux DOM-TOM |

#### Profils acheteurs DOM-TOM à scraper

| Collectivité | URL | Méthode |
|---|---|---|
| Département 974 | `marchesformalises.cg974.fr` | Playwright |
| CIVIS | `civis.e-marchespublics.com` | Playwright |
| CINOR | `marches.cinor.fr` | Playwright |
| CASUD | `casud.achatpublic.com` | Playwright |
| TCO | `tco.re/pro/marches-publics/` | Playwright |

#### Codes CPV à monitorer (avec scores)

| Code | Description | Score |
|---|---|:---:|
| 72212200-1 | Développement web et intranet | 100 |
| 72212216-8 | Développement logiciels site web | 100 |
| 72000000-5 | Services IT génériques | 90 |
| 72200000-8 | Conseil systèmes informatiques | 85 |
| 72210000-0 | Développement et analyse logiciels | 85 |
| 72212000-3 | Programmation d'applications | 85 |
| 72220000-3 | Maintenance IT | 80 |
| 72250000-1 | Support IT | 75 |
| 72260000-4 | Assistance informatique | 70 |

**Codes à EXCLURE** : 30000000 (matériel), 45000000 (construction), 33000000 (télécom)

#### Scoring marchés publics (5 axes pondérés)

```
SCORE_FINAL = CPV(30%) + MONTANT(25%) + GEO(20%) + KEYWORDS(15%) + FAISABILITE(10%)

CPV : correspondance avec les codes ci-dessus (0-100)
MONTANT : sweet spot 5K-90K€ → 100, > 90K → 70, > 300K → 30
GEO : Réunion → 100, DOM-TOM → 80, IDF → 60, France → 40
KEYWORDS : présence de mots-clés positifs dans le titre/description
FAISABILITE : délai > 30j → 100, 15-30j → 70, < 15j → 30

Si SCORE ≥ 75 → "à répondre" (GO)
Si SCORE 60-74 → "à qualifier" (POSSIBLE)
Si SCORE < 60 → "archivé" (NO-GO)
```

#### ⚠️ ROUTING CRITIQUE

```
Output 1b → PAS vers enrichisseur-pipeline
         → VERS appels-offres-pipeline (Agent 9)
         → Stocké dans table `public_tenders` (PAS `prospects`)
```

---

### Sous-Agent 1c — Veille Web (Audit technique)

#### Stack technique (100% gratuit)

| # | Outil | Rôle | Coût |
|---|-------|------|:----:|
| 1 | **Lighthouse CLI** (npm) | Scores performance, a11y, SEO, best practices | 0€ |
| 2 | **PageSpeed Insights API** | Fallback Lighthouse (25K req/jour gratuites) | 0€ |
| 3 | **Wappalyzer** (npm) | Détection CMS, framework, plugins, versions | 0€ |
| 4 | **axe-core + Pa11y** | Violations WCAG/RGAA | 0€ |
| 5 | **Playwright** | Browser headless, screenshots | 0€ |
| 6 | **Node.js tls** | Check certificat SSL | 0€ |

#### Sources pour constituer la liste de sites à scanner

| # | Source | Méthode | Volume | Coût |
|---|--------|---------|:------:|:----:|
| 1 | **API SIRENE** | Filtre NAF + département | 25M entreprises | 0€ |
| 2 | **Google Maps** (Outscraper) | Scraping par catégorie + zone | 200M+ | ~$3/1K |
| 3 | **Pages Jaunes** (Apify scraper) | Scraping par catégorie + département | 4.5M | ~$10/mois |
| 4 | **Annuaires sectoriels** | CCI, notaires, immobilier | Variable | 0€ |
| 5 | **Google Search** (SerpAPI) | Recherche par activité + ville | Illimité | $50/mois |
| 6 | **Pappers alertes** | Nouvelles créations → site web à scanner | Continu | 60€/mois |
| 7 | **BODACC créations** | Entreprises créées < 6 mois | Continu | 0€ |
| 8 | **Injection depuis 1a/1d** | Si LinkedIn/Job Board détecte une entreprise → scanner son site | Variable | 0€ |

#### Scoring technique (spec complète)

```typescript
// Poids : Performance(40%) + Accessibilité(25%) + Stack(20%) + PageWeight(10%) + SSL/SEO(5%)

// Performance Lighthouse
< 30  → 40 pts (critique, refonte nécessaire)
< 50  → 30 pts (faible)
< 75  → 15 pts (à améliorer)
≥ 75  → 0 pts (correct)

// Accessibilité
< 50  → 25 pts (non conforme RGAA, risque légal)
< 70  → 15 pts (faible)

// Stack technique
WordPress < 6      → 15 pts (obsolète)
jQuery seul        → 10 pts (pas de framework moderne)
Pas de CMS/fw      → 5 pts (fait maison)

// Page weight
> 5 MB → 10 pts (très lourd)
> 3 MB → 5 pts (lourd)

// SSL / SEO
Pas HTTPS          → 5 pts
SSL expire < 30j   → 3 pts
Pas de sitemap     → 2 pts

// Classification
≥ 70 → URGENT : refonte complète nécessaire
50-69 → HIGH : problèmes sérieux
30-49 → MEDIUM : améliorations possibles
< 30 → LOW : pas de problème majeur
```

#### Processus (batch nocturne 02:00-06:00)

```
1. Charger sites depuis table `sites_a_scanner`
2. Exclure ceux scannés dans les 48h (cache TTL)
3. Prioriser : jamais scannés > ancien scan > en cache
4. Limiter à 500 sites/nuit
5. Pour chaque site (5 workers parallèles) :
   a. Lighthouse → scores perf/a11y/seo/bp + métriques LCP/FCP/CLS
   b. Wappalyzer → CMS, version, framework, serveur, plugins
   c. axe-core → violations WCAG critical/serious/moderate
   d. SSL check → validité, jours restants
   e. robots.txt + sitemap.xml → existence
   f. Page weight → poids total en MB
   g. Screenshot → capture PNG
6. Calculer score technique
7. Si score ≥ 30 → générer RawLead → envoyer au Master
8. Stocker résultat en DB (table audits_techniques)
```

---

### Sous-Agent 1d — Job Boards + Signaux

#### Plateformes de scraping

| # | Plateforme | Outil | Coût/mois | Max résultats/run |
|---|-----------|-------|:---------:|:----------------:|
| 1 | **LinkedIn Jobs** | Apify actor | 49$ | 500 |
| 2 | **WTTJ** | Apify actor | 10$ | 200 |
| 3 | **Indeed** | HasData API | 50$ | 500 |
| 4 | **HelloWork** | Apify scraper | Inclus | 300 |
| 5 | **APEC** | API si dispo | 0€ | Variable |

#### Mots-clés de recherche

```
Catégorie développement :
  développeur web, développeur react, développeur frontend, développeur fullstack,
  développeur shopify, développeur mobile, intégrateur web, webmaster

Catégorie management :
  chef de projet digital, product manager web, scrum master

Catégorie design :
  UX designer, webdesigner, directeur artistique digital

Catégorie marketing :
  growth hacker, responsable marketing digital, SEO manager
```

#### Logique : offre d'emploi → signal d'achat

```
SI recrute "développeur web" OU "chef de projet digital"
  → L'entreprise a un budget tech/web
  → Signal "budget_tech_disponible" (15-25 pts)

SI offre mentionne "refonte", "migration", "nouveau site"
  → Besoin immédiat externalisable
  → Signal "besoin_externalisable" (25-30 pts)

SI multiples offres tech (≥3) pour la même entreprise
  → Forte croissance, gros budget
  → Bonus "multi_offres" (+10 pts)

SI "premier recrutement" OU "équipe à créer"
  → Startup qui débute, très externalisable
  → Signal "startup_debut" (20 pts)

SI CDD/freelance + profil spécialisé
  → Besoin ponctuel, parfait pour agence
  → Signal "mission_ponctuelle" (20 pts)
```

#### Scoring des offres d'emploi

```
SCORE = Pertinence(30%) + Taille(20%) + Budget(20%) + Externalisabilité(20%) + Géo(10%)

Pertinence : dev react → 30, dev web → 25, chef projet → 25, webmaster → 20
Taille : 10-200 → 20, 200-500 → 15, < 10 → 10, > 500 → 5
Budget : salaire * 1.5 dans range 15K-100K → 20
Externalisabilité : freelance/CDD → 20, premier recrutement → 18, CDI → 10
Géo : Réunion → 10, Paris/Lyon → 8, France → 7
```

#### Sources supplémentaires (en parallèle)

| Source | Fréquence | Signal |
|--------|-----------|--------|
| RSS Maddyness MaddyMoney | 4x/jour | Levées de fonds |
| RSS BPI France Big Media | 4x/jour | Levées de fonds |
| RSS Les Échos Startups | 4x/jour | Levées de fonds |
| SSL monitoring (domaines watchlist) | 1x/semaine | Maintenance IT négligée |
| Avis Google/Trustpilot (agences concurrentes) | 1x/semaine | Clients mécontents = leads |

---

## SOURCES ADDITIONNELLES (non dans les specs originales)

### Google Maps / Google Places

| Attribut | Valeur |
|----------|--------|
| **Recommandation** | Outscraper (pay-as-you-go, $3/1K résultats) |
| **Usage** | Scraper les entreprises par catégorie + zone géo |
| **Données** | Nom, adresse, téléphone, site web, avis, note, catégorie |
| **Signal** | Pas de site web = prospect ultra-chaud |
| **Volume** | 200M+ entreprises mondiales |

### Pages Jaunes

| Attribut | Valeur |
|----------|--------|
| **Recommandation** | Apify PagesJaunes scraper |
| **Usage** | Complémentaire à Google Maps, spécifiquement français |
| **Données** | Nom, adresse, téléphone, site web, SIRET, 130+ champs |
| **Coût** | Inclus dans abonnement Apify |

### Pappers Alertes (création d'entreprises)

| Attribut | Valeur |
|----------|--------|
| **Recommandation** | API Pappers surveillance (60€/mois) |
| **Usage** | Alertes automatiques quand une entreprise se crée dans un secteur cible |
| **Signal** | Entreprise nouvelle = besoin immédiat de site web (score 35 pts) |
| **Données** | SIREN, activité, dirigeant, adresse |

### SocieteInfo

| Attribut | Valeur |
|----------|--------|
| **Recommandation** | API SocieteInfo (39€/mois) |
| **Usage** | Enrichissement batch — croiser données légales + données web |
| **Données** | 10M établissements, sites web, réseaux sociaux, emails |
| **Signal** | Entreprise sans site web identifiée dans les données légales |

### BODACC Créations (gratuit, déjà implémenté)

| Attribut | Valeur |
|----------|--------|
| **Usage** | Détecter les entreprises créées dans les 6 derniers mois |
| **Signal** | Nouvelle entreprise = besoin de site web (score 35 pts) |
| **Coût** | 0€ (open data) |
| **Implémentation** | Adapter BODACC déjà codé → ajouter filtre `type = 'creation'` |

---

## SCHEMA SQL COMPLET (extrait des specs)

### Table `leads_bruts` (output Veilleur → input Enrichisseur)

```sql
CREATE TABLE leads_bruts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_primaire     VARCHAR(20) NOT NULL,
  sources             TEXT[] DEFAULT ARRAY[]::TEXT[],
  nb_detections       INTEGER DEFAULT 1,
  entreprise_nom      VARCHAR(255),
  entreprise_siret    VARCHAR(20),
  entreprise_site_web VARCHAR(500),
  entreprise_linkedin VARCHAR(500),
  entreprise_secteur  VARCHAR(100),
  entreprise_taille   VARCHAR(50),
  entreprise_localisation VARCHAR(200),
  segment_estime      VARCHAR(50),
  contact_prenom      VARCHAR(100),
  contact_nom         VARCHAR(100),
  contact_poste       VARCHAR(200),
  contact_linkedin    VARCHAR(500),
  contact_email       VARCHAR(255),
  signaux             JSONB DEFAULT '[]'::JSONB,
  signal_principal    TEXT,
  signal_type         VARCHAR(50),
  signal_tier         INTEGER,
  pre_score           INTEGER DEFAULT 0,
  pre_score_detail    JSONB,
  statut              VARCHAR(20) DEFAULT 'nouveau',
  batch_id            VARCHAR(100),
  metadata            JSONB,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);
```

### Table `audits_techniques` (résultats 1c)

```sql
CREATE TABLE audits_techniques (
  id                  SERIAL PRIMARY KEY,
  url                 VARCHAR(500) NOT NULL,
  entreprise_nom      VARCHAR(255),
  lh_performance      INTEGER,
  lh_accessibility    INTEGER,
  lh_best_practices   INTEGER,
  lh_seo              INTEGER,
  lh_metrics          JSONB,
  stack_cms           VARCHAR(100),
  stack_cms_version   VARCHAR(50),
  stack_framework     VARCHAR(100),
  stack_server        VARCHAR(100),
  stack_complete      JSONB,
  axe_violations      INTEGER DEFAULT 0,
  axe_critical        INTEGER DEFAULT 0,
  axe_serious         INTEGER DEFAULT 0,
  ssl_valid           BOOLEAN,
  ssl_days_remaining  INTEGER,
  has_sitemap         BOOLEAN,
  has_robots_txt      BOOLEAN,
  page_weight_mb      DECIMAL,
  screenshot_path     VARCHAR(500),
  score_technique     INTEGER DEFAULT 0,
  classification      VARCHAR(20),
  reasons             TEXT[],
  scanned_at          TIMESTAMP DEFAULT NOW(),
  lead_id             UUID
);
```

### Table `sites_a_scanner` (input 1c)

```sql
CREATE TABLE sites_a_scanner (
  id                  SERIAL PRIMARY KEY,
  url                 VARCHAR(500) NOT NULL UNIQUE,
  entreprise_nom      VARCHAR(255),
  siret               VARCHAR(20),
  segment             VARCHAR(50),
  source              VARCHAR(50),
  priority            INTEGER DEFAULT 5,
  last_scanned_at     TIMESTAMP,
  scan_count          INTEGER DEFAULT 0,
  active              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMP DEFAULT NOW()
);
```

---

## MONITORING ET HEALTH CHECK

### Structure du health check Master

```typescript
interface MasterHealthStatus {
  status: 'healthy' | 'degraded' | 'down'
  subagents: {
    '1a_linkedin': { status, lastRunAt, leadsProduced, errorsLast24h, nextScheduledRun }
    '1b_marches':  { status, lastRunAt, leadsProduced, errorsLast24h, nextScheduledRun }
    '1c_web':      { status, lastRunAt, leadsProduced, errorsLast24h, nextScheduledRun }
    '1d_jobboards': { status, lastRunAt, leadsProduced, errorsLast24h, nextScheduledRun }
  }
  lastBatchAt: string
  leadsLast24h: number
  deduplicationRate: number
  errorRate: number
}

// Alerte si :
// - leadsLast24h < 10 → warning
// - status === 'down' → critical
// - errorRate > 20% → degraded
```

### Structure du rapport quotidien (23h30)

```typescript
interface DailyReport {
  date: string
  leads_total: number
  leads_par_source: { linkedin, marches, web, jobboards }
  leads_dedupliques: number
  taux_deduplication: number
  pre_score_moyen: number
  leads_hot: number    // ≥ 60
  leads_warm: number   // 40-59
  leads_cold: number   // < 40
  top_signaux: Array<{ type, count }>
  erreurs: Array<{ subagent, error, count }>
  couts_api: { netrows, hunter, pagespeed, apify, total }
  recommandations: string[]
}
```
