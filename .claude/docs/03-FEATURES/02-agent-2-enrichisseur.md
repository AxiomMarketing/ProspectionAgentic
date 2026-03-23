# Agent 2 — ENRICHISSEUR (Master Orchestrateur)

## Vue d'Ensemble

L'Agent 2 (ENRICHISSEUR) reçoit les leads bruts normalisés de l'Agent 1 (VEILLEUR) et les transforme en fiches prospects complètes et exploitables. Il orchestre 3 sous-agents en parallèle — Contact (trouver le bon décideur avec email vérifié), Entreprise (SIRET, CA, dirigeants, alertes financières), et Technique (Lighthouse, stack, accessibilité RGAA) — puis fusionne les résultats en une fiche unique, déduplique avec la base existante, et transmet à l'Agent 3 (SCOREUR). Il respecte strictement le RGPD : aucune base email, traitement sur intérêt légitime, droit à l'oubli automatisé.

## Sous-Agents

| ID | Nom | Rôle | Fréquence | API Principale |
|----|-----|------|-----------|----------------|
| 2a | Enrichisseur Contact | Trouve le bon décideur selon le segment, récupère email vérifié + téléphone + LinkedIn via waterfall Dropcontact → Hunter → SMTP check → ZeroBounce | Événementiel (BullMQ) | Dropcontact API + Hunter.io + ZeroBounce + Kaspr |
| 2b | Enrichisseur Entreprise | Enrichit SIRET, CA, effectif, dirigeants, bénéficiaires effectifs, alertes BODACC (procédures collectives, créations, cessions) | Événementiel (BullMQ) | Pappers API + INSEE SIRENE + BODACC |
| 2c | Enrichisseur Technique | Audit Lighthouse (performance/SEO/accessibilité), détection stack (CMS, framework, CDN), RGAA | Événementiel (BullMQ, si non fait par 1c) | Playwright + axe-core + Wappalyzer |

## Input / Output

### Input (depuis Agent 1 — VEILLEUR)

Reçu via queue BullMQ `enrichisseur-pipeline` :

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
    "segment_estime": "pme_metro",
    "taille_estimee": "50-200",
    "localisation": "Paris, France"
  },
  "contact": {
    "prenom": "Sophie", "nom": "Martin",
    "poste": "Chief Marketing Officer",
    "linkedin_url": "https://linkedin.com/in/sophie-martin",
    "email": null, "telephone": null
  },
  "signaux": [ ... ],
  "pre_score": { "total": 50, "detail": { ... } },
  "metadata": {
    "traitement_requis": ["enrichissement_contact", "enrichissement_entreprise", "scan_technique"]
  }
}
```

**Champs critiques** : `entreprise.nom` (obligatoire — lead rejeté si absent), `entreprise.segment_estime` (défaut `pme_metro`). Tous les autres champs sont optionnels — le rôle de l'Enrichisseur est précisément de les compléter.

### Output (vers Agent 3 — SCOREUR)

Transmis via queue BullMQ `scoreur-pipeline` — fiche prospect enrichie complète :

```json
{
  "prospect_id": "uuid-v4-prospect",
  "lead_id": "uuid-v4-lead-original",
  "created_at": "2026-03-18T09:15:00Z",
  "entreprise": {
    "nom": "TechCorp SAS", "siren": "123456789", "siret": "12345678900012",
    "forme_juridique": "SAS", "code_naf": "6202A",
    "libelle_naf": "Conseil en systèmes et logiciels informatiques",
    "segment": "pme_metro", "effectif": { "tranche": "100 à 199 salariés", "exact": 120 },
    "finances": { "ca_dernier": 5200000, "croissance_ca_pct": 8, "annee_dernier_bilan": 2025 },
    "dirigeants": [ { "prenom": "Pierre", "nom": "Dupont", "fonction": "Président" } ],
    "alertes": {
      "procedure_collective": false, "entreprise_fermee": false,
      "ca_en_baisse": false, "effectif_en_baisse": false
    }
  },
  "contact": {
    "prenom": "Sophie", "nom": "Martin", "poste": "Chief Marketing Officer",
    "email": "sophie.martin@techcorp.fr", "email_status": "verified",
    "email_confidence": 98, "telephone": "+33123456789", "decideur_score": 9
  },
  "technique": {
    "stack": { "cms": "WordPress", "cms_version": "6.4", "framework_js": null, "cdn": null },
    "performance": { "score": 42, "lcp": 3800, "cls": 0.18 },
    "accessibilite": { "score": 61, "rgaa_compliant": false, "violations_critical": 3 }
  },
  "signaux": [ ... ],
  "enrichissement": {
    "status": "complet",
    "sous_agents_utilises": ["2a_contact", "2b_entreprise", "2c_technique"],
    "qualite": { "completude_pct": 90, "champs_manquants": [], "enrichable": true }
  }
}
```

## Workflow

**Étape 1 — Vérification pré-enrichissement**
- Lead déjà enrichi en BDD (`enrichissement_status = 'complet'`) → skip
- Entreprise fermée ou en procédure collective → skip automatique
- Email en liste d'opposition RGPD → skip automatique
- Déterminer `traitement_requis` : si email déjà présent → pas de 2a ; si SIRET présent → pas de 2b ; si source `veille_web` dans `lead.sources` → pas de 2c

**Étape 2 — Lancement parallèle des 3 sous-agents** (timeout global : 3 minutes)

2a — Waterfall contact (stratégie complète) :
```
Étape 0 : Identifier le décideur cible selon le segment
  - pme_metro      → 1. CMO  2. DG  3. CTO/DSI
  - ecommerce      → 1. Fondateur  2. Head of Growth  3. CMO
  - collectivite   → 1. DGS  2. DSI  3. Élu numérique
  - startup        → 1. Founder/CEO  2. CTO  3. Head of Growth
  - agence_wl      → 1. Fondateur  2. CEO  3. Account Manager

Étape 1 : Dropcontact API (RGPD-conforme, France ~98% succès)
  - POST /enrich/all → polling résultat (asynchrone 30-120s)
  - Si confidence >= 95% → STOP, aller à l'étape 5 (ZeroBounce)

Étape 2 : Hunter.io Domain Search (fallback)
  - GET /domain-search?domain=techcorp.fr&seniority=executive
  - Si confidence >= 85% → STOP, aller à l'étape 5

Étape 3 : Hunter.io Email Finder (si nom connu)
  - GET /email-finder?first_name=Sophie&last_name=Martin&domain=techcorp.fr
  - Si confidence >= 85% → STOP, aller à l'étape 5

Étape 4 : Pattern Matching + SMTP Check (dernier recours)
  - Générer 10 patterns (firstname@, first.last@, flast@, etc.)
  - Tester via SMTP RCPT TO (sans envoyer)
  - Filtrer les catch-all domains

Étape 5 : ZeroBounce verification (systématique)
  - Statuts : valid | invalid | catch_all | unknown
  - Si invalid → remonter waterfall
  - Si catch_all → flag "risky"

Étape 6 : Kaspr (téléphone LinkedIn, en parallèle)
  - Extraction LinkedIn → téléphone EU
```

2b — Enrichissement entreprise :
- Pappers API : identité (SIREN, SIRET, formes juridiques, NAF), finances (CA N, N-1, N-2), dirigeants, bénéficiaires effectifs
- INSEE SIRENE : confirmation siège, effectif officiel
- BODACC : alertes procédures collectives, créations établissement, cessions

2c — Audit technique (si non fait par 1c) :
- Playwright headless → Lighthouse JSON (performance, SEO, a11y)
- Wappalyzer → détection stack (CMS + version, framework JS, CDN, serveur)
- axe-core → violations RGAA (critical, serious, moderate)

**Étape 3 — Fusion des résultats**
- Priorité des sources : 2b (Pappers/INSEE) > 1a (LinkedIn) > 1d (job boards)
- Conflits résolus par source la plus fiable
- Calcul `completude_pct` = (champs remplis / 10 champs critiques) × 100

**Étape 4 — Déduplication BDD**
- Par SIRET (100% fiable) → merge signaux + enrichir fiche existante
- Par email (95% fiable)
- Par domaine web (90% fiable)
- Si nouveau → INSERT dans table `prospects`

**Étape 5 — Contrôle qualité**
- `enrichable` = `entreprise.nom` présent ET (email OU téléphone OU linkedin_url)
- Si `completude_pct < 40%` → flag `enrichissement_manuel_requis`

**Étape 6 — Dispatch vers Scoreur**
- Queue BullMQ `scoreur-pipeline`
- Priorité 1 si `completude_pct >= 70%`, sinon priorité 5

## APIs & Coûts

| API | Coût/mois | Crédits | Rate Limit |
|-----|-----------|---------|------------|
| Dropcontact API (2a email principal) | 39 EUR | 2 500 crédits | 60 req/s |
| Hunter.io API (2a fallback, partagé avec 1a) | 49 EUR total (partagé) | 1 500 crédits/mois | 30 req/min |
| ZeroBounce (2a vérification email) | 16 USD (~15 EUR) | 2 000 vérifications | 100 req/s |
| Kaspr API (2a téléphone LinkedIn) | 79 EUR | 3 000 crédits | Variable |
| Pappers API (2b entreprise France) | ~60 EUR | 3 000 requêtes | 10 req/s |
| INSEE SIRENE API (2b SIRET gratuit) | 0 EUR | Illimité | 100 req/min |
| Playwright + Lighthouse (2c, infra incluse) | 0 EUR | N/A | Limité par CPU |

**Total sous-agent 2a : ~183 EUR/mois**
**Total Agent 2 (estimé) : ~300 EUR/mois**

## Base de Données

### Tables Principales

```sql
-- Table prospects (fiche enrichie finale)
CREATE TABLE prospects (
  prospect_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             UUID REFERENCES leads_bruts(lead_id),
  -- Entreprise
  nom                 VARCHAR(255) NOT NULL,
  siren               VARCHAR(9),
  siret               VARCHAR(14) UNIQUE,
  code_naf            VARCHAR(6),
  libelle_naf         VARCHAR(200),
  segment             VARCHAR(50), -- 'pme_metro'|'ecommerce_shopify'|'collectivite'|'startup'|'agence_wl'
  effectif_tranche    VARCHAR(50),
  effectif_exact      INTEGER,
  ca_dernier          DECIMAL,
  croissance_ca_pct   DECIMAL,
  site_web            VARCHAR(500),
  linkedin_url        VARCHAR(500),
  -- Contact décideur
  prenom              VARCHAR(100),
  nom_contact         VARCHAR(100),
  poste               VARCHAR(200),
  email               VARCHAR(255),
  email_status        VARCHAR(20), -- 'verified'|'catch_all'|'unverified'|'not_found'
  email_confidence    INTEGER,
  telephone           VARCHAR(30),
  decideur_score      INTEGER DEFAULT 0, -- 0-10
  -- Alertes
  procedure_collective BOOLEAN DEFAULT false,
  entreprise_fermee   BOOLEAN DEFAULT false,
  -- Enrichissement meta
  enrichissement_status VARCHAR(20) DEFAULT 'pending', -- 'pending'|'complet'|'incomplet'|'erreur'
  completude_pct      INTEGER DEFAULT 0,
  sous_agents_utilises TEXT[],
  -- Données techniques (JSONB)
  technique           JSONB,
  signaux             JSONB DEFAULT '[]'::JSONB,
  -- RGPD
  consent_status      VARCHAR(30) DEFAULT 'LEGITIMATE_INTEREST',
  opt_out_at          TIMESTAMP,
  data_retention_until TIMESTAMP,
  -- Timestamps
  created_at          TIMESTAMP DEFAULT NOW(),
  enriched_at         TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- Table enrichment_log (traçabilité)
CREATE TABLE enrichment_log (
  id                  SERIAL PRIMARY KEY,
  prospect_id         UUID REFERENCES prospects(prospect_id),
  api                 VARCHAR(50),
  result              VARCHAR(20), -- 'success'|'not_found'|'error'|'timeout'
  credits_used        INTEGER DEFAULT 1,
  duration_ms         INTEGER,
  called_at           TIMESTAMP DEFAULT NOW()
);

-- Table RGPD oppositions
CREATE TABLE rgpd_oppositions (
  id                  SERIAL PRIMARY KEY,
  email               VARCHAR(255) UNIQUE,
  raison              VARCHAR(50),
  created_at          TIMESTAMP DEFAULT NOW()
);
```

## Scheduling

| Cron | Action | Description |
|------|--------|-------------|
| Événementiel (BullMQ) | enrichLead(lead) | Déclenché par chaque job dans `enrichisseur-pipeline` |
| Concurrency | 5 leads en parallèle | Max 10 jobs/minute (rate limiter BullMQ) |
| Timeout global | 3 minutes par lead | `Promise.race()` + timeout |
| Retry | 3 tentatives | Backoff exponentiel 5s |

**SLA selon pre_score du lead :**

| Priorité | pre_score | Délai max | Qualité min |
|----------|-----------|-----------|-------------|
| Hot | >= 60 | 15 minutes | Email vérifié obligatoire |
| Warm | 40-59 | 2 heures | Email trouvé ou flag "manual" |
| Cold | < 40 | 24 heures | Best effort |

## Error Handling

| Erreur | Action | Fallback |
|--------|--------|----------|
| Dropcontact timeout (>120s) | Passer à Hunter.io | Flag `dropcontact_timeout` dans log |
| Hunter.io 429 rate limit | Attendre 60s, retry | Passer à pattern matching SMTP |
| ZeroBounce quota épuisé | Flag `email_status: 'unverified'` | Continuer sans vérification |
| Kaspr API non disponible | Skip téléphone | Flag `phone_status: 'not_found'` |
| Pappers API timeout | Utiliser INSEE SIRENE seul | Données financières = null |
| Procédure collective détectée | Exclure lead automatiquement | Archiver, ne pas dispatcher vers Scoreur |
| Entreprise fermée (INSEE) | Exclure lead automatiquement | Archiver |
| Email opposition RGPD | Skip avant enrichissement | Log `reason: 'opposition_rgpd'` |
| `completude_pct < 40%` | Flag `enrichissement_manuel_requis` | Dispatch quand même si `enrichable = true` |
| Tous les sous-agents échouent | Dispatcher avec données minimales | `enrichable = false` → pas de dispatch vers Scoreur |

## KPIs & Métriques

| KPI | Cible | Fréquence |
|-----|-------|-----------|
| Taux enrichissement email | >= 70% Phase 1, >= 80% Phase 2 | Quotidien |
| Taux email valide (ZeroBounce status='valid') | >= 85% | Quotidien |
| Temps moyen enrichissement complet | < 10s | Quotidien |
| Taux enrichissement téléphone | >= 30% | Hebdomadaire |
| Completude moyenne des fiches | >= 70% | Hebdomadaire |
| Coût par enrichissement | < 0,20 EUR | Mensuel |

## Edge Cases

- **Contact déjà connu mais poste changé** : La fiche existante est mise à jour avec le nouveau poste et la date de nomination ; les anciens signaux sont conservés
- **Dropcontact renvoie plusieurs emails pour le même contact** : Prendre celui avec `qualification: 'nominative@pro'` en priorité, sinon le plus haut `confidence`
- **Entreprise sans site web** : 2c est skippé, le champ `technique` reste `null`, malus de -5 pts au scoring
- **SIRET trouvé mais différent du SIRET du lead (multi-établissements)** : Conserver le SIRET de l'établissement principal (siège social)
- **CA négatif (perte comptable)** : Conserver la valeur, ne pas la masquer ; l'alerte `ca_en_baisse` est positionnée si tendance baissière sur 2 ans
- **Email trouvé = email personnel (@gmail, @yahoo)** : Flag `email_type: 'personnel'`, malus -8 pts au scoring
- **Concurrent Axiom détecté** : Domaine dans `COMPETITOR_BLOCKLIST` → exclusion avant dispatch vers Scoreur

## Budget

| Poste | Coût/mois |
|-------|-----------|
| Dropcontact API (2 500 crédits) | 39 EUR |
| Hunter.io (partagé, 1 500 crédits) | 49 EUR |
| ZeroBounce (2 000 vérifications) | ~15 EUR |
| Kaspr API (3 000 crédits téléphone) | 79 EUR |
| Pappers API (3 000 requêtes) | ~60 EUR |
| INSEE SIRENE (gratuit) | 0 EUR |
| Infrastructure (incluse Agent 1) | 0 EUR |
| **Total estimé** | **~242 EUR/mois** |

## Référence Spec

`.claude/source-ia/agent/AGENT-2-MASTER.md`
Sous-agents détaillés : `AGENT-2a-CONTACT.md`, `AGENT-2b-ENTREPRISE.md`, `AGENT-2c-TECHNIQUE.md`
