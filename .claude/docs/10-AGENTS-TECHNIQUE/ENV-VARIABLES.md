# Variables d'environnement — Par agent

**Objectif :** Référence complète de chaque variable d'environnement nécessaire, organisée par agent.
**Convention :** `[REQUIRED]` = obligatoire pour que l'agent fonctionne, `[OPTIONAL]` = fallback gracieux.

---

## Socle commun (tous les agents)

```env
# ──────────── Application ────────────
NODE_ENV=development                          # [REQUIRED] development | production | test
APP_PORT=3000                                 # [REQUIRED] Port du serveur NestJS
ALLOWED_ORIGINS=http://localhost:5173          # [OPTIONAL] CORS origins (virgules), défaut: localhost:5173
LOG_LEVEL=debug                               # [OPTIONAL] fatal | error | warn | info | debug | trace

# ──────────── Base de données ────────────
DATABASE_URL=postgresql://prospection:changeme@localhost:5433/prospection_dev  # [REQUIRED]
# Production: ajouter ?connection_limit=20&pool_timeout=10

# ──────────── Redis + BullMQ ────────────
REDIS_URL=redis://:changeme@localhost:6381    # [REQUIRED] URL complète Redis
REDIS_HOST=localhost                          # [OPTIONAL] Alternative si pas d'URL
REDIS_PORT=6381                               # [OPTIONAL] Default: 6379 (dev=6381)
REDIS_PASSWORD=changeme                       # [OPTIONAL] Password Redis AUTH

# ──────────── Claude API (LLM) ────────────
ANTHROPIC_API_KEY=                            # [OPTIONAL] Clé API Anthropic — fallback sur mock adapter en dev
LLM_MONTHLY_BUDGET_EUR=500                    # [OPTIONAL] Budget mensuel max (€)
LLM_DAILY_BUDGET_EUR=25                       # [OPTIONAL] Budget quotidien max (€)

# ──────────── Authentification JWT ────────────
JWT_SECRET=CHANGE_ME_64_CHARS_MIN             # [REQUIRED] openssl rand -hex 32
JWT_EXPIRATION=15m                            # [OPTIONAL] Durée access token
JWT_REFRESH_EXPIRATION=7d                     # [OPTIONAL] Durée refresh token

# ──────────── API Keys internes ────────────
INTERNAL_API_KEYS=dev-api-key-1               # [OPTIONAL] Clés service-to-service (virgules)

# ──────────── Observabilité ────────────
LANGFUSE_PUBLIC_KEY=                          # [OPTIONAL] Langfuse LLM tracing
LANGFUSE_SECRET_KEY=                          # [OPTIONAL]
LANGFUSE_HOST=                                # [OPTIONAL] URL self-hosted Langfuse

# ──────────── Notifications ────────────
SLACK_WEBHOOK_URL=                            # [OPTIONAL] Webhook Slack pour alertes/rapports
```

---

## Agent 1 — VEILLEUR

### 1a LinkedIn (Signaux business)

```env
# ──────────── Netrows API ────────────
# Profils LinkedIn, employés, changements de poste
# Inscription : https://netrows.com — 99€/mois (40K crédits)
NETROWS_API_KEY=                              # [REQUIRED pour 1a] Clé API Netrows
NETROWS_API_URL=https://api.netrows.com/v1    # [OPTIONAL] URL de base (défaut hardcodé)
NETROWS_MONTHLY_CREDITS=40000                 # [OPTIONAL] Limite crédits/mois pour alerting

# ──────────── SignalsAPI ────────────
# Job postings, hiring velocity, headcount changes
# Inscription : https://signalsapi.com — 99$/mois (Starter)
SIGNALSAPI_KEY=                               # [REQUIRED pour 1a] Clé API SignalsAPI
SIGNALSAPI_BASE_URL=https://api.signalsapi.com/v1  # [OPTIONAL] URL de base

# ──────────── RSS Levées de fonds ────────────
# Sources gratuites : Crunchbase, Maddyness MaddyMoney, BPI France Big Media
# Pas de clé API nécessaire — flux RSS publics
RSS_CRUNCHBASE_URL=https://news.crunchbase.com/feed/        # [OPTIONAL] URL RSS Crunchbase
RSS_MADDYNESS_URL=https://www.maddyness.com/feed/           # [OPTIONAL] URL RSS Maddyness
RSS_BPI_URL=https://bigmedia.bpifrance.fr/feed/              # [OPTIONAL] URL RSS BPI France
RSS_ECHOS_STARTUPS_URL=https://start.lesechos.fr/feed/       # [OPTIONAL] URL RSS Les Échos Startups

# ──────────── n8n (RSS → Webhooks) ────────────
# n8n self-hosted — conversion RSS LinkedIn pages → webhooks internes
# Pas de coût supplémentaire (déjà dans la stack)
N8N_WEBHOOK_URL=http://localhost:5678/webhook/  # [OPTIONAL] URL base webhooks n8n
N8N_RSS_WORKFLOW_ID=                          # [OPTIONAL] ID du workflow RSS LinkedIn dans n8n

# ──────────── Hunter.io (partagé avec Agent 2) ────────────
# Email finder + domain search — 49€/mois (1500 lookups, partagé entre agents)
# Inscription : https://hunter.io
HUNTER_API_KEY=                               # [REQUIRED pour 1a+2a] Clé API Hunter.io
HUNTER_MONTHLY_QUOTA=1500                     # [OPTIONAL] Limite lookups/mois
HUNTER_AGENT1_QUOTA=375                       # [OPTIONAL] Quota réservé Agent 1 (25%)
```

### 1b Marchés Publics

```env
# ──────────── BOAMP (Bulletin Officiel) ────────────
# 100% gratuit, pas d'authentification
BOAMP_API_URL=https://boamp-datadila.opendatasoft.com/api/explore/v2.1  # [OPTIONAL] URL API BOAMP
BOAMP_PAGE_SIZE=100                           # [OPTIONAL] Résultats par page (max 100)

# ──────────── DECP (Données Essentielles Commande Publique) ────────────
# 100% gratuit, pas d'authentification — veille concurrentielle marchés attribués
DECP_API_URL=https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/decp-v3-marches-valides  # [OPTIONAL]

# ──────────── APProch (Projets d'achats futurs) ────────────
# Gratuit, inscription requise sur marches-publics.gouv.fr
APPROCH_API_URL=https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/projets-dachats-publics  # [OPTIONAL]
APPROCH_API_KEY=                              # [OPTIONAL] Clé si inscription API requise

# ──────────── Profils acheteurs DOM-TOM (scraping Playwright) ────────────
# Pas de variable d'env — URLs hardcodées dans le code
# Collectivités : CG974, CIVIS, CINOR, CASUD, TCO
# Les URLs sont dans 01b-VEILLEUR-SOURCES-COMPLETES.md
```

### 1c Veille Web (Audit technique)

```env
# ──────────── PageSpeed Insights API (fallback Lighthouse CLI) ────────────
# 25K requêtes/jour gratuites — nécessite clé Google Cloud
# Console : https://console.cloud.google.com/apis/credentials
PAGESPEED_API_KEY=                            # [OPTIONAL] Clé API Google PageSpeed Insights
PAGESPEED_DAILY_LIMIT=25000                   # [OPTIONAL] Limite requêtes/jour

# ──────────── Lighthouse CLI ────────────
# npm install -g lighthouse — exécution locale, pas de clé API
# Configuration via variables
LIGHTHOUSE_MAX_CONCURRENT=5                   # [OPTIONAL] Workers parallèles max (défaut: 5)
LIGHTHOUSE_TIMEOUT_MS=60000                   # [OPTIONAL] Timeout par audit (défaut: 60s)

# ──────────── Wappalyzer ────────────
# npm install wappalyzer — détection stack technique locale, pas de clé API
# Aucune variable nécessaire

# ──────────── axe-core + Pa11y ────────────
# npm install axe-core pa11y — audit accessibilité locale
# Aucune variable nécessaire

# ──────────── Sources de sites à scanner ────────────

# API SIRENE (INSEE) — déjà dans le socle Enrichisseur
SIRENE_API_TOKEN=                             # [REQUIRED pour 1c+2b] Token API INSEE SIRENE
# Inscription : https://api.insee.fr — gratuit

# Google Maps / Outscraper — scraping par catégorie + zone géo
# Inscription : https://outscraper.com — ~$3/1K résultats (pay-as-you-go)
OUTSCRAPER_API_KEY=                           # [OPTIONAL] Clé API Outscraper
OUTSCRAPER_MONTHLY_BUDGET_USD=50              # [OPTIONAL] Budget mensuel max ($)

# Pages Jaunes via Apify — scraper spécifiquement français
# Utilise le même token Apify que l'agent 1d
# Pas de variable supplémentaire (APIFY_API_TOKEN partagé)

# SerpAPI (Google Search) — recherche par activité + ville
# Inscription : https://serpapi.com — $50/mois (5000 recherches)
SERPAPI_KEY=                                  # [OPTIONAL] Clé API SerpAPI
SERPAPI_MONTHLY_SEARCHES=5000                 # [OPTIONAL] Limite recherches/mois

# Pappers Alertes — nouvelles créations d'entreprises
# Inscription : https://www.pappers.fr/api — 60€/mois
PAPPERS_API_KEY=                              # [OPTIONAL] Clé API Pappers
PAPPERS_MONTHLY_BUDGET_EUR=60                 # [OPTIONAL] Budget mensuel

# SocieteInfo — enrichissement batch
# Inscription : https://societeinfo.com/api — 39€/mois
SOCIETEINFO_API_KEY=                          # [OPTIONAL] Clé API SocieteInfo

# ──────────── Scan batch config ────────────
WEBSCAN_BATCH_SIZE=500                        # [OPTIONAL] Sites max par nuit (défaut: 500)
WEBSCAN_CRON=0 2 * * *                        # [OPTIONAL] Cron scan nocturne (défaut: 02:00)
WEBSCAN_MIN_SCORE=30                          # [OPTIONAL] Score min pour générer un lead (défaut: 30)
WEBSCAN_CACHE_TTL_HOURS=48                    # [OPTIONAL] Durée avant re-scan (défaut: 48h)
```

### 1d Job Boards (Signaux emploi)

```env
# ──────────── Apify (LinkedIn Jobs + WTTJ + HelloWork) ────────────
# Inscription : https://apify.com — 49$/mois (Starter)
# Utilisé aussi par 1c (Pages Jaunes scraper)
APIFY_API_TOKEN=                              # [REQUIRED pour 1d] Token API Apify
APIFY_MONTHLY_BUDGET_USD=49                   # [OPTIONAL] Budget max ($)

# Actor IDs Apify (identifiants des scrapers)
APIFY_LINKEDIN_JOBS_ACTOR=                    # [OPTIONAL] ID actor LinkedIn Jobs scraper
APIFY_WTTJ_ACTOR=                             # [OPTIONAL] ID actor Welcome to the Jungle scraper
APIFY_HELLOWORK_ACTOR=                        # [OPTIONAL] ID actor HelloWork scraper
APIFY_PAGESJAUNES_ACTOR=                      # [OPTIONAL] ID actor Pages Jaunes scraper (pour 1c)

# ──────────── HasData (Indeed) ────────────
# Inscription : https://hasdata.com — 50$/mois (5000 requêtes)
HASDATA_API_KEY=                              # [REQUIRED pour 1d] Clé API HasData
HASDATA_BASE_URL=https://api.hasdata.com/scrape/indeed  # [OPTIONAL] URL de base
HASDATA_MONTHLY_REQUESTS=5000                 # [OPTIONAL] Limite requêtes/mois

# ──────────── WhoisFreaks (lookup domaines) ────────────
# Inscription : https://whoisfreaks.com — 29$/mois (5000 lookups)
WHOISFREAKS_API_KEY=                          # [OPTIONAL] Clé API WhoisFreaks
WHOISFREAKS_MONTHLY_LOOKUPS=5000              # [OPTIONAL] Limite lookups/mois

# ──────────── APEC (API publique si disponible) ────────────
# API APEC — accès gratuit si disponible
APEC_API_URL=                                 # [OPTIONAL] URL API APEC
APEC_API_KEY=                                 # [OPTIONAL] Clé si auth requise
```

### Master Veilleur (orchestration)

```env
# ──────────── Scheduling ────────────
VEILLEUR_ENABLED=true                         # [OPTIONAL] Activer/désactiver tout l'agent (défaut: true)
VEILLEUR_LINKEDIN_ENABLED=true                # [OPTIONAL] Activer sous-agent 1a
VEILLEUR_MARCHES_ENABLED=true                 # [OPTIONAL] Activer sous-agent 1b
VEILLEUR_WEB_ENABLED=true                     # [OPTIONAL] Activer sous-agent 1c
VEILLEUR_JOBBOARDS_ENABLED=true               # [OPTIONAL] Activer sous-agent 1d

# Crons (format crontab standard)
VEILLEUR_LINKEDIN_CRON=0 7,12,18,23 * * *    # [OPTIONAL] 4 passes/jour LinkedIn
VEILLEUR_MARCHES_CRON=0 6,14 * * *           # [OPTIONAL] 2 passes/jour BOAMP
VEILLEUR_WEB_CRON=0 2 * * *                  # [OPTIONAL] Batch nocturne scan web
VEILLEUR_JOBBOARDS_CRON=0 6 * * *            # [OPTIONAL] 1 passe/jour Job Boards
VEILLEUR_CONSOLIDATION_CRON=0 8,15,21 * * *  # [OPTIONAL] 3 batchs consolidation/jour
VEILLEUR_REPORT_CRON=30 23 * * *             # [OPTIONAL] Rapport quotidien 23h30

# ──────────── Déduplication ────────────
VEILLEUR_DEDUP_LEVENSHTEIN_THRESHOLD=3        # [OPTIONAL] Distance Levenshtein max pour noms (défaut: 3)
VEILLEUR_MULTI_SOURCE_BONUS_2=10              # [OPTIONAL] Bonus points 2 sources (défaut: 10)
VEILLEUR_MULTI_SOURCE_BONUS_3=15              # [OPTIONAL] Bonus points 3+ sources (défaut: 15)

# ──────────── Pre-scoring seuils ────────────
VEILLEUR_HOT_THRESHOLD=60                     # [OPTIONAL] Score min pour HOT (défaut: 60)
VEILLEUR_WARM_THRESHOLD=40                    # [OPTIONAL] Score min pour WARM (défaut: 40)
# < WARM_THRESHOLD = COLD

# ──────────── Rate limiting global ────────────
VEILLEUR_MAX_LEADS_PER_DAY=1000               # [OPTIONAL] Limite leads/jour (protection budget)
VEILLEUR_MAX_API_ERRORS_BEFORE_PAUSE=50       # [OPTIONAL] Erreurs max avant pause sous-agent
```

---

## Résumé Agent 1 — Coûts et clés requises

| Variable | Agent | Coût/mois | Obligatoire |
|----------|-------|:---------:|:-----------:|
| `NETROWS_API_KEY` | 1a | 99€ | Oui (1a) |
| `SIGNALSAPI_KEY` | 1a | ~93€ | Oui (1a) |
| `HUNTER_API_KEY` | 1a+2a | 49€ (partagé) | Oui (1a) |
| `APIFY_API_TOKEN` | 1c+1d | 49$ | Oui (1d) |
| `HASDATA_API_KEY` | 1d | 50$ | Oui (1d) |
| `SIRENE_API_TOKEN` | 1c+2b | 0€ | Oui (1c) |
| `PAGESPEED_API_KEY` | 1c | 0€ | Non (fallback Lighthouse CLI) |
| `OUTSCRAPER_API_KEY` | 1c | ~$50 | Non |
| `SERPAPI_KEY` | 1c | $50 | Non |
| `PAPPERS_API_KEY` | 1c | 60€ | Non |
| `SOCIETEINFO_API_KEY` | 1c | 39€ | Non |
| `WHOISFREAKS_API_KEY` | 1d | $29 | Non |
| `N8N_WEBHOOK_URL` | 1a | 0€ | Non |

### Budget Agent 1

| Scénario | Coût mensuel |
|----------|:----------:|
| **Minimum viable** (1b BOAMP + 1c Lighthouse) | **0€** |
| **Recommandé** (1a + 1b + 1c + 1d sans optionnels) | **~370€** |
| **Complet** (toutes les sources) | **~550€** |

---

*Les Agents 2-10 seront ajoutés progressivement dans ce fichier.*
