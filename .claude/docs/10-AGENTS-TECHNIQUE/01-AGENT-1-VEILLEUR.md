# Agent 1 — VEILLEUR — Documentation Technique d'Implémentation

**Source de vérité :** `.claude/source-ia/agent/AGENT-1-MASTER.md` + `AGENT-1a-LINKEDIN.md` + `AGENT-1b-MARCHES-PUBLICS.md` + `AGENT-1c-VEILLE-WEB.md` + `AGENT-1d-JOBBOARDS.md`

---

## Architecture

```
AGENT 1 — VEILLEUR MASTER
├── 1a LinkedIn (signaux business)     → PROSPECTS (via Enrichisseur)
├── 1b Marchés Publics (appels d'offres) → MARCHÉS PUBLICS (via Agent 9)
├── 1c Veille Web (audit technique)    → PROSPECTS (via Enrichisseur)
└── 1d Job Boards (signaux emploi)     → PROSPECTS (via Enrichisseur)

Master = orchestre, déduplique, pré-score, dispatche
```

### Routing CRITIQUE

| Sous-agent | Destination | Queue BullMQ | Table DB |
|---|---|---|---|
| 1a LinkedIn | Enrichisseur (Agent 2) | `enrichisseur-pipeline` | `raw_leads` → `prospects` |
| 1b Marchés Publics | AppelsOffres (Agent 9) | `appels-offres-pipeline` | `public_tenders` |
| 1c Veille Web | Enrichisseur (Agent 2) | `enrichisseur-pipeline` | `raw_leads` → `prospects` |
| 1d Job Boards | Enrichisseur (Agent 2) | `enrichisseur-pipeline` | `raw_leads` → `prospects` |

**⚠️ ERREUR ACTUELLE : 1b Marchés Publics dispatche vers `enrichisseur-pipeline` et crée des Prospects. Il devrait dispatcher vers `appels-offres-pipeline` et créer des PublicTender.**

---

## Sous-Agent 1a — LinkedIn

### APIs requises

| API | Coût/mois | Rôle |
|---|---|---|
| Netrows API | 99 EUR | Données profils/entreprises LinkedIn (légal, pas de scraping) |
| SignalsAPI | 99 USD | Job postings, hiring velocity, headcount |
| Crunchbase RSS | 0 EUR | Levées de fonds |
| n8n (self-hosted) | 0 EUR | Workflow RSS → webhooks |
| Hunter.io | 49 EUR (partagé) | Email extraction |
| **Total** | **~276 EUR/mois** | |

### Signaux détectés

| Signal | Type | Score | Exemple |
|---|---|---|---|
| Changement de poste | `job_change` | 25-30 pts | Nouveau CMO nommé |
| Recrutement actif | `hiring` | 15-25 pts | Recrute dev React |
| Levée de fonds | `funding` | 25-30 pts | Série A 2M€ |
| Croissance équipe | `headcount_change` | 10-20 pts | +30% en 6 mois |
| Post avec mot-clé | `post_keyword` | 10-15 pts | "cherche agence web" |
| Engagement contenu | `engagement` | 5-10 pts | Like/comment sur contenu tech |

### Output JSON (vers Master)

```json
{
  "source": "1a_linkedin",
  "entreprise": {
    "nom": "TechCorp SAS",
    "linkedin_url": "https://linkedin.com/company/techcorp",
    "site_web": "https://www.techcorp.fr",
    "taille_estimee": "50-200",
    "localisation": "Paris, France",
    "secteur": "SaaS B2B",
    "segment_estime": "pme_metro"
  },
  "contact": {
    "prenom": "Sophie",
    "nom": "Martin",
    "poste": "CMO",
    "linkedin_url": "https://linkedin.com/in/sophie-martin"
  },
  "signaux": [
    {
      "type": "job_change",
      "detail": "Nommée CMO il y a 3 semaines",
      "date_signal": "2026-02-25",
      "score_signal": 30
    }
  ],
  "pre_score_partiel": 45
}
```

### Implémentation requise

```
src/modules/agent-veilleur/infrastructure/adapters/
├── linkedin/
│   ├── netrows.adapter.ts          — API Netrows (profils, entreprises)
│   ├── signals-api.adapter.ts      — API SignalsAPI (hiring, headcount)
│   ├── crunchbase-rss.adapter.ts   — RSS levées de fonds
│   └── linkedin.service.ts         — Orchestrateur 1a
```

### Schedule

| Heure | Action |
|-------|--------|
| 07:00 | Passe 1/4 — signaux LinkedIn |
| 12:00 | Passe 2/4 |
| 18:00 | Passe 3/4 |
| 23:00 | Passe 4/4 |

---

## Sous-Agent 1b — Marchés Publics

### APIs (toutes gratuites)

| API | Endpoint | Auth | Rôle |
|---|---|---|---|
| BOAMP | `boamp-datadila.opendatasoft.com/api/v2/` | Aucune | Avis de marchés |
| DECP | `data.economie.gouv.fr/explore/dataset/decp-v3-marches-valides/api/` | Aucune | Marchés attribués (veille concurrentielle) |
| APProch | `projets-achats.marches-publics.gouv.fr` | Inscription | Projets d'achats futurs |
| Profils acheteurs | Scraping Playwright | N/A | Collectivités DOM-TOM |

### Codes CPV à monitorer

| Code | Description | Pertinence |
|---|---|---|
| 72212200-1 | Développement web et intranet | 100% |
| 72212216-8 | Développement logiciels site web | 100% |
| 72000000-5 | Services IT génériques | 90% |
| 72200000-8 | Conseil systèmes informatiques | 85% |
| 72210000-0 | Développement et analyse logiciels | 85% |

### Output JSON (vers Master → Agent 9)

```json
{
  "source": "1b_marches",
  "type": "appel_offres",
  "reference_boamp": "26-29262",
  "titre": "Mission d'accompagnement informatique et développement numérique",
  "description_resume": "Développement d'applications web et mobile pour la collectivité...",
  "acheteur": {
    "nom": "Commune de Saint-Joseph",
    "siret": "21974012300019",
    "type": "collectivite",
    "departement": "974"
  },
  "montant_estime": 190000,
  "date_publication": "2026-03-20",
  "date_limite": "2026-04-15",
  "cpv_codes": ["72212200", "72212216"],
  "url_avis": "https://www.boamp.fr/pages/avis/?q=idweb:26-29262",
  "score_pertinence": 85,
  "score_detail": {
    "cpv_match": 40,
    "budget_viable": 20,
    "geo_proximite": 15,
    "delai_suffisant": 10
  }
}
```

**⚠️ Cet output ne va PAS dans les Prospects mais dans `public_tenders` et est dispatché vers `appels-offres-pipeline` (Agent 9)**

### Schedule

| Heure | Action |
|-------|--------|
| 06:00 | Première passe BOAMP |
| 14:00 | Deuxième passe BOAMP |

---

## Sous-Agent 1c — Veille Web

### Stack (100% gratuit)

| Outil | Usage |
|---|---|
| Lighthouse CLI (npm) | Score performance, a11y, SEO |
| PageSpeed Insights API | Fallback (25K req/jour gratuites) |
| Wappalyzer (npm) | Détection CMS/framework/plugins |
| axe-core + Pa11y | Violations WCAG/RGAA |
| Playwright | Browser headless, screenshots |
| Node.js tls | Check SSL expiration |

### Ce qui constitue un signal d'opportunité

| Signal | Seuil | Score |
|---|---|---|
| Performance critique | Lighthouse < 30 | 35 pts |
| Performance faible | Lighthouse < 50 | 25 pts |
| Accessibilité non conforme | Score a11y < 50 | 30 pts |
| LCP lent | > 4000ms | 20 pts |
| CLS mauvais | > 0.25 | 15 pts |
| Page > 5MB | Trop lourde | 15 pts |
| SSL expire < 30j | Certificat bientôt expiré | 20 pts |
| Techno obsolète | WordPress < 5, PHP < 7, jQuery | 25 pts |
| Pas de HTTPS | HTTP only | 30 pts |
| Pas de sitemap | SEO basique manquant | 10 pts |

### Output JSON (vers Master → Enrichisseur)

```json
{
  "source": "1c_web",
  "entreprise": {
    "nom": "Boulangerie Martin",
    "site_web": "https://www.boulangerie-martin.fr",
    "localisation": "Saint-Denis, La Réunion"
  },
  "audit_technique": {
    "lighthouse_performance": 28,
    "lighthouse_accessibility": 42,
    "lighthouse_seo": 55,
    "lighthouse_best_practices": 60,
    "lcp_ms": 5200,
    "cls": 0.35,
    "page_weight_mb": 6.2,
    "stack": {
      "cms": "WordPress 4.9",
      "server": "Apache",
      "php_version": "7.0",
      "plugins": ["woocommerce", "yoast-seo"]
    },
    "ssl_valid": true,
    "ssl_expires_days": 15,
    "has_sitemap": false,
    "has_https": true,
    "rgaa_violations": 23,
    "wcag_level": "non-conforme"
  },
  "signal_principal": "Site extrêmement lent (Lighthouse 28) avec techno obsolète (WP 4.9, PHP 7.0)",
  "pre_score_partiel": 55
}
```

### Sources pour constituer la liste de sites

1. **API SIRENE** — filtrer par code APE (agences immobilières, notaires, restaurants, etc.) + département
2. **Annuaires sectoriels** — Pages Jaunes, CCI
3. **Google Search** — via Apify ou SerpAPI
4. **Injection manuelle** — prospects identifiés par d'autres sources
5. **Injection depuis 1a/1d** — si LinkedIn ou Job Board détecte une entreprise, scanner son site

### Schedule

| Heure | Action |
|-------|--------|
| 02:00 | Scan batch nocturne (100-500 sites) |

---

## Sous-Agent 1d — Job Boards

### Plateformes

| Plateforme | API/Scraping | Coût |
|---|---|---|
| LinkedIn Jobs | Apify actor | 49 USD/mois |
| Welcome to the Jungle | Apify actor | 10 USD/mois |
| Indeed | HasData API | 50 USD/mois |
| HelloWork | Apify scraper | Inclus |
| APEC | API si disponible | 0 EUR |

### Mots-clés de recherche

```
développeur web, développeur react, développeur frontend, développeur fullstack,
chef de projet digital, webmaster, intégrateur web, développeur shopify,
développeur mobile, product manager web, UX designer, webdesigner
```

### Logique : comment une offre d'emploi devient un signal

```
SI une entreprise recrute un "développeur web" ou "chef de projet digital"
ALORS elle a potentiellement un budget tech/web
ET elle pourrait externaliser une partie du besoin
→ Signal de type "budget_tech_disponible" (15-25 pts)

SI l'offre mentionne "refonte", "migration", "nouveau site"
ALORS besoin immédiat externalisable
→ Signal de type "besoin_externalisable" (25-30 pts)

SI multiples offres tech pour la même entreprise
ALORS forte croissance, budget important
→ Bonus "multi_offres" (+10 pts)
```

### Output JSON (vers Master → Enrichisseur)

```json
{
  "source": "1d_jobboards",
  "entreprise": {
    "nom": "StartupXY",
    "localisation": "Lyon",
    "taille_estimee": "20-50"
  },
  "offres_detectees": [
    {
      "titre": "Développeur React Senior",
      "plateforme": "wttj",
      "url": "https://www.welcometothejungle.com/...",
      "date_publication": "2026-03-20",
      "salaire_estime": "50-60K"
    }
  ],
  "signal_principal": "Recrute dev React senior — besoin tech externalisable",
  "pre_score_partiel": 25
}
```

### Schedule

| Heure | Action |
|-------|--------|
| 06:00 | Scrape toutes les plateformes (parallèle) |

---

## Master Veilleur — Orchestration

### Planning quotidien

```
02:00  → 1c Veille Web (batch nocturne)
06:00  → 1b Marchés Publics (BOAMP passe 1) + 1d Job Boards (parallèle)
07:00  → 1a LinkedIn (passe 1/4)
08:00  → MASTER : Consolidation batch 1 (dédup + normalisation + pre-scoring)
12:00  → 1a LinkedIn (passe 2/4)
14:00  → 1b Marchés Publics (BOAMP passe 2)
15:00  → MASTER : Consolidation batch 2
18:00  → 1a LinkedIn (passe 3/4)
21:00  → MASTER : Consolidation batch 3
23:00  → 1a LinkedIn (passe 4/4)
23:30  → MASTER : Rapport quotidien + métriques
```

### Déduplication (algorithme Master)

```
Clé de dédup (par priorité) :
1. SIRET (si disponible)
2. Domaine web (normalisation : www.example.com → example.com)
3. LinkedIn URL entreprise
4. Nom normalisé (Levenshtein distance < 3)

Si même entreprise détectée par plusieurs sous-agents :
- Fusionner les signaux
- Bonus multi-source : 2 sources → +10 pts, 3+ sources → +15 pts
```

### Pre-scoring (0-100)

```
Score = signal_force (max 35) + multi_source (max 15) + segment_match (max 25) + fraicheur (max 10) + geo (max 15)

signal_force : meilleur signal de l'entreprise (0-35)
multi_source : nb_sources >= 3 → 15, == 2 → 10, == 1 → 0
segment_match : si dans les 5 segments Axiom → 20-25
fraicheur : signal < 7j → 10, < 14j → 7, < 30j → 3
geo : DOM-TOM → 15, Île-de-France → 10, France → 5
```

### Dispatch

```
pre_score >= 60 → priorité 1 (HOT) → enrichisseur-pipeline
pre_score 40-59 → priorité 5 (WARM) → enrichisseur-pipeline
pre_score < 40  → priorité 10 (COLD) → enrichisseur-pipeline

Source 1b (marchés publics) → TOUJOURS → appels-offres-pipeline (Agent 9)
```

---

## Roadmap d'Implémentation

### Phase 1 — Correction urgente (immédiat)
- [ ] Séparer le routing : 1b → `public_tenders` + `appels-offres-pipeline`, pas `prospects`
- [ ] Enrichir les données BOAMP dans le Prospect (titre, description, acheteur, montant, CPV)
- [ ] Afficher les données complètes dans le dashboard

### Phase 2 — Sous-agent 1c Veille Web (1-2 jours)
- [ ] Installer Lighthouse CLI + Wappalyzer + axe-core
- [ ] Créer `web-scanner.adapter.ts` (Playwright + Lighthouse)
- [ ] Créer `web-scan.service.ts` (orchestrateur)
- [ ] Table `sites_a_scanner` avec batch nocturne
- [ ] Cron 02:00 pour le scan batch

### Phase 3 — Sous-agent 1d Job Boards (1-2 jours)
- [ ] Intégrer Apify (LinkedIn Jobs, WTTJ)
- [ ] Intégrer HasData (Indeed)
- [ ] Créer `jobboard-scanner.adapter.ts`
- [ ] Logique : offre → signal d'achat
- [ ] Cron 06:00

### Phase 4 — Sous-agent 1a LinkedIn (2-3 jours)
- [ ] Intégrer Netrows API
- [ ] Intégrer SignalsAPI
- [ ] RSS Crunchbase/Maddyness
- [ ] 6 types de signaux détectés
- [ ] 4 passes/jour (07h, 12h, 18h, 23h)

### Phase 5 — Master orchestration complète (1 jour)
- [ ] Déduplication multi-source (SIRET → domaine → LinkedIn → Levenshtein)
- [ ] Fusion des signaux
- [ ] Pre-scoring complet (5 axes)
- [ ] Consolidation en 3 batchs (08h, 15h, 21h)
- [ ] Rapport quotidien (23h30)

### Phase 6 — Dashboard : Centre de Contrôle amélioré (0.5 jour)
- [ ] KPIs Veilleur dans la Home : leads détectés aujourd'hui par source (linkedin/web/jobboards/marchés)
- [ ] Taux de déduplication affiché
- [ ] Indicateur "prochain run" par sous-agent (countdown basé sur les crons)
- [ ] Card Veilleur cliquable avec statut des 4 sous-agents (running/idle/error)

### Phase 7 — Dashboard : Page Agent Veilleur enrichie (1 jour)
- [ ] Onglet **Sous-agents** dans `agent-detail.tsx` quand `agentName === 'veilleur'`
  - [ ] 4 cards : 1a LinkedIn, 1b Marchés Publics, 1c Veille Web, 1d Job Boards
  - [ ] Chaque card : statut (running/idle/error), dernier run, leads produits, prochaine exécution
  - [ ] Bouton "Déclencher" individuel par sous-agent
- [ ] Onglet **Métriques** enrichi pour le Veilleur
  - [ ] Graphe leads/jour par source (bar chart empilé, 7 derniers jours)
  - [ ] Taux de déduplication (pie chart ou gauge)
  - [ ] Top 5 signaux détectés cette semaine
  - [ ] Coûts API par source (Netrows, Apify, HasData, etc.)
- [ ] Onglet **Configuration** enrichi
  - [ ] Feature flags par sous-agent (VEILLEUR_*_ENABLED) avec toggle on/off
  - [ ] Crons affichés avec prochaine exécution calculée
  - [ ] Seuils pre-scoring (HOT/WARM) éditables

### Phase 8 — Dashboard : Prospects avec source Veilleur (0.5 jour)
- [ ] Colonne **"Source"** dans `ProspectTable.tsx` (linkedin / web_audit / jobboard / manual)
- [ ] Badge coloré par source (bleu=LinkedIn, vert=Web, orange=JobBoard, gris=Manuel)
- [ ] Filtre par source dans la barre de filtres (`Select` source)
- [ ] Fiche prospect : afficher la source de détection + date du signal original
- [ ] Fiche prospect : si source = `web_audit`, afficher les scores Lighthouse dans l'onglet Scoring
- [ ] Fiche prospect : si source = `jobboard`, afficher les offres d'emploi détectées

### Phase 9 — Dashboard : Marchés Publics connectés (1 jour)
- [ ] Endpoint API `GET /api/tenders` → requête table `public_tenders` (pas `prospects`)
- [ ] Liste marchés avec données BOAMP réelles : ref, titre, acheteur, montant, deadline, CPV
- [ ] Scoring détaillé dans la fiche : CPV match, budget, géo, keywords, faisabilité
- [ ] Pipeline kanban visuel : Détecté → Analysé → GO → Préparation → Soumis → Gagné
- [ ] Compteurs par étape pipeline dans le header de la page
- [ ] Countdown J-XX avant deadline avec couleur (vert > 14j, jaune 7-14j, rouge < 7j)
- [ ] Lien vers l'avis BOAMP original (URL cliquable)

### Phase 10 — Dashboard : Rapport quotidien Veilleur (0.5 jour)
- [ ] Page ou modal "Rapport du jour" accessible depuis la card Veilleur
- [ ] Résumé : leads total, par source, dédupliqués, HOT/WARM/COLD
- [ ] Top signaux détectés
- [ ] Erreurs éventuelles par sous-agent
- [ ] Coûts API du jour
- [ ] Historique des rapports (7 derniers jours consultables)

---

## Variables d'environnement requises

```env
# Sous-agent 1a LinkedIn
NETROWS_API_KEY=             # 99 EUR/mois
SIGNALSAPI_KEY=              # 99 USD/mois
N8N_WEBHOOK_URL=             # Webhook n8n pour RSS

# Sous-agent 1d Job Boards
APIFY_API_TOKEN=             # Token Apify (49 USD/mois)
HASDATA_API_KEY=             # HasData Indeed (50 USD/mois)
WHOISFREAKS_API_KEY=         # WHOIS lookups (29 USD/mois)

# Les sous-agents 1b (BOAMP) et 1c (Web) sont 100% gratuits
```
