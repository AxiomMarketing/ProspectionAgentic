# SOUS-AGENT 1d — VEILLEUR JOB BOARDS + SIGNAUX
**Agent parent** : AGENT-1-MASTER.md
**Position dans le pipeline** : Agent 1d → Master Veilleur → Agent 2 (Enrichisseur)

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

