# Agent 2 — ENRICHISSEUR — Documentation Technique d'Implémentation

**Source de vérité :** `.claude/source-ia/agent/AGENT-2-MASTER.md` + `AGENT-2a-CONTACT.md` + `AGENT-2b-ENTREPRISE.md` + `AGENT-2c-TECHNIQUE.md`

---

## Architecture

```
AGENT 2 — ENRICHISSEUR MASTER
├── 2a Contact (trouver le décideur + email vérifié)
├── 2b Entreprise (SIRET, CA, dirigeants, BODACC)
└── 2c Technique (stack web, Lighthouse, accessibilité)

Master = orchestre les 3 en parallèle, fusionne, déduplique, contrôle qualité, dispatche
```

### Position dans le pipeline

```
Agent 1 VEILLEUR                    Agent 3 SCOREUR
  ├── 1a LinkedIn ──┐                    ↑
  ├── 1c Web Audit ─┼──→ enrichisseur-pipeline ──→ AGENT 2 ──→ scoreur-pipeline
  └── 1d Job Boards ┘
  └── 1b Marchés ────→ appels-offres-pipeline (PAS l'enrichisseur)
```

---

## Communication inter-agents

### INPUT : Ce que l'Agent 1 envoie (queue `enrichisseur-pipeline`)

```typescript
// Job data reçu dans le BullMQ processor
{
  leadId: string,       // UUID du RawLead en base
  source: string,       // 'linkedin' | 'web_audit' | 'job_board'
  preScore: number,     // 0-100 (pré-score du Veilleur)
  highPriority: boolean,// true si preScore >= 60
  dispatchedAt: string, // ISO timestamp
}
```

Le **RawLead** en base contient dans `rawData` (JSON) :
- Depuis LinkedIn (1a) : `{ companyName, companyLinkedinUrl, contactName, contactRole, signals[], segment }`
- Depuis Web Audit (1c) : `{ companyName, companyWebsite, lighthousePerf, lighthouseA11y, stackCms, axeViolations }`
- Depuis Job Boards (1d) : `{ companyName, jobTitle, platform, signals[], location }`

### OUTPUT : Ce que l'Agent 2 envoie à l'Agent 3 (queue `scoreur-pipeline`)

```typescript
// Job data dispatché vers scoreur-pipeline
{
  prospectId: string,       // UUID du Prospect enrichi
  enrichedAt: string,       // ISO timestamp
}
```

Le **Prospect** en base (après enrichissement) contient :
- `email` : email trouvé et vérifié (ou null)
- `emailVerified` : boolean (confidence >= 75)
- `companySiren` : SIREN trouvé via INSEE/Pappers
- `companySize` : tranche effectif INSEE
- `enrichmentData` : JSON complet (voir section Output JSON)
- `status` : `'enriched'`
- `source` : hérité du RawLead

### SLA de traitement

| Priorité (preScore) | Délai max | Qualité min |
|---------------------|-----------|-------------|
| HOT (>= 60) | 15 min | Email vérifié obligatoire |
| WARM (40-59) | 2 heures | Email trouvé ou flag "manual" |
| COLD (< 40) | 24 heures | Best effort |

---

## Sous-Agent 2a — Contact (Trouver le décideur)

### Mission
Trouver le BON décideur selon le segment, récupérer son email vérifié + téléphone + LinkedIn.

### Décideurs cibles par segment

| Segment | Cible 1 | Cible 2 | Cible 3 |
|---------|---------|---------|---------|
| `pme_metro` | CMO | DG | CTO/DSI |
| `ecommerce` | Fondateur | Head of Growth | CMO |
| `collectivite` | DGS | DSI | Élus numériques |
| `startup` | Founder/CEO | CTO | Head of Growth |
| `agence_wl` | Fondateur | CEO | Account Manager |

### Stratégie Waterfall (ordre de priorité)

```
ÉTAPE 0 : Identification du décideur cible
  ├── Si contact fourni par Agent 1 → vérifier pertinence du titre
  └── Sinon → déterminer titre cible selon segment

ÉTAPE 1 : Pattern matching + Reacher (DIY — 0€)
  ├── Générer 15 patterns email (first.last@, f.last@, firstlast@, etc.)
  ├── Détecter catch-all domain d'abord (test email random)
  ├── Si catch-all → retourner premier pattern avec confidence 60
  ├── Sinon → waterfall SMTP verification via Reacher
  └── Si verified → confidence 99, STOP

ÉTAPE 2 : Hunter.io Email Finder (fallback — 49€/mois)
  ├── GET /email-finder?domain=...&first_name=...&last_name=...
  ├── Si confidence >= 85% → STOP
  └── Consomme 1 crédit/recherche

ÉTAPE 3 : Hunter.io Domain Search (si nom inconnu)
  ├── GET /domain-search?domain=...&seniority=executive&department=marketing
  ├── Filtrer par seniority + department correspondant au segment
  └── Retourne liste de contacts potentiels

RÉSULTAT : email_status = 'verified' | 'catch_all' | 'unverified' | 'not_found'
```

### APIs (implémentation actuelle vs spec)

| API Spec | Implémentation actuelle | Status | Coût/mois |
|----------|------------------------|--------|-----------|
| **Dropcontact** (primaire spec) | **Reacher** (DIY) | Remplacé | 0€ (self-hosted) |
| **Hunter.io** (fallback) | Hunter.io | Partiellement implémenté | 49€ |
| **ZeroBounce** (vérification) | **Reacher** (DIY) | Remplacé | 0€ |
| **Kaspr** (téléphone) | Non implémenté | À faire | 79€ |

### Code existant

```
src/modules/agent-enrichisseur/infrastructure/
├── services/
│   ├── email-pattern.service.ts     — 15 patterns, normalisation accents, priorité par taille entreprise
│   ├── email-finder.service.ts      — Waterfall: pattern → Reacher verify → catch-all detection
│   └── company-enricher.service.ts  — Orchestre INSEE + INPI + BODACC en parallèle
├── adapters/
│   ├── reacher.adapter.ts           — SMTP verification (circuit breaker, throttling 5 concurrent)
│   ├── insee.adapter.ts             — API SIRENE v3.11 (searchBySiren, searchByName)
│   ├── inpi.adapter.ts              — RNE API (auth, rate limit 5/min, circuit breaker)
│   └── bodacc.adapter.ts            — BODACC OpenData (notices, procédures collectives)
```

---

## Sous-Agent 2b — Entreprise (Données légales + financières)

### Mission
Trouver le SIRET, enrichir les données financières (CA, effectif, dirigeants), détecter les entreprises en difficulté.

### Stratégie Waterfall

```
ÉTAPE 1 : Trouver le SIRET (si non fourni)
  ├── Cache Redis (TTL 30j) → si hit, skip API
  ├── API INSEE Sirene : recherche par nom + localisation
  ├── Si Dropcontact/Reacher a retourné le SIREN → utiliser
  └── Fallback : annuaire-entreprises.data.gouv.fr

ÉTAPE 2 : Données SIRENE de base (INSEE — gratuit)
  ├── SIREN, SIRET, APE, adresse, effectif tranches, date création
  ├── État administratif : A (actif) ou F (fermé) → si F, ALERTE
  └── Cache 30 jours

ÉTAPE 3 : Données financières (Pappers — 60€/mois)
  ├── CA 3 derniers exercices, résultat net, bilans
  ├── Dirigeants (noms, fonctions, dates nomination)
  ├── Bénéficiaires effectifs
  └── Procédures collectives

ÉTAPE 4 : Publications BODACC (gratuit)
  ├── Créations établissements → signal croissance
  ├── Cessions de parts → levées potentielles
  ├── Procédures collectives → EXCLURE
  └── Cache 7 jours

ÉTAPE 5 : Cross-check optionnel (HOT leads uniquement)
  ├── SocieteInfo API (39€/mois) pour vérification dirigeants
  └── Compléter bénéficiaires effectifs si manquants
```

### APIs

| API | Endpoint | Auth | Coût | Données |
|-----|----------|------|------|---------|
| **INSEE SIRENE** | `api.insee.fr/api-sirene/3.11` | `X-Insee-Api-Key-Integration` | 0€ | SIRET, APE, adresse, effectif tranches, statut |
| **Pappers** | `api.pappers.fr/v2/entreprise` | `api_token` query param | 60€/mois | CA, bilans, dirigeants, bénéficiaires, procédures |
| **BODACC** | `bodacc-datadila.opendatasoft.com` | Aucune | 0€ | Publications légales, procédures collectives |
| **INPI/RNE** | `data.inpi.fr/api` | Username/password + token | 0€ | Dirigeants, bénéficiaires, financials |
| **SocieteInfo** | `societeinfo.com/api` | Token | 39€/mois | Cross-check (optionnel, HOT leads) |

### Code existant
- `company-enricher.service.ts` : orchestre INSEE (séquentiel) + INPI + BODACC (parallèle)
- `insee.adapter.ts` : searchBySiren(), searchByName(), isAvailable()
- `inpi.adapter.ts` : getBySiren() avec auth, rate limit 5/min, circuit breaker (5 failures → 5min reset)
- `bodacc.adapter.ts` : getNoticesBySiren(), getRecentCreations(), hasCollectiveProcedure()

### ⚠️ Ce qui manque par rapport à la spec
1. **Pappers API** — Non implémenté. L'INPI fournit une partie des données mais pas le CA, pas les bilans détaillés
2. **Cache Redis** — Non implémenté. Chaque appel API est fait à chaque fois
3. **Annuaire-entreprises fallback** — Non implémenté
4. **SocieteInfo cross-check** — Non implémenté

---

## Sous-Agent 2c — Technique (Audit web)

### Mission
Compléter les données techniques du site web SI PAS DÉJÀ FAIT par l'Agent 1c.

### ⚠️ Règle anti-redondance avec Agent 1c

```typescript
function shouldRunTechScan(lead: RawLead): boolean {
  // Si le lead vient de la veille web (Agent 1c), les données tech existent déjà
  if (lead.source === 'web_audit') return false;

  // Si pas de site web, impossible de scanner
  if (!prospect.companyWebsite) return false;

  // Si un scan récent existe en BDD (< 30 jours), réutiliser
  const existingScan = await prisma.auditTechnique.findFirst({
    where: { url: prospect.companyWebsite, createdAt: { gte: thirtyDaysAgo } },
  });
  if (existingScan) return false;

  return true; // Scanner
}
```

### Stack (identique à Agent 1c — réutilisation des mêmes outils)

| Outil | Rôle | Coût |
|-------|------|:----:|
| Lighthouse CLI | Performance, a11y, SEO, best practices | 0€ |
| Wappalyzer (npm) | CMS, framework, plugins | 0€ |
| axe-core | Violations WCAG/RGAA | 0€ |
| Playwright | Browser headless | 0€ |
| Node.js tls | SSL check | 0€ |

### Code existant
- `WebScannerAdapter` (créé pour Agent 1c) — **réutilisable directement** par l'Agent 2c
- `WebScanService` (créé pour Agent 1c) — logique de batch, réutilisable

### Output JSON (stocké dans `enrichmentData.technique`)

```json
{
  "stack": { "cms": "WordPress", "cms_version": "6.4", "framework_js": null, "server": "Apache" },
  "performance": { "score": 42, "lcp_ms": 4200, "cls": 0.15, "verdict": "mauvais" },
  "accessibilite": { "score": 62, "violations_total": 18, "violations_critical": 5 },
  "seo": { "score": 78, "has_robots_txt": true, "has_sitemap": true },
  "ssl": { "valid": true, "days_remaining": 245 },
  "problemes_detectes": ["Performance faible", "5 violations accessibilité CRITIQUES"]
}
```

---

## Master Enrichisseur — Orchestration

### Workflow complet (6 étapes)

```
STEP 1 : VÉRIFICATION PRÉ-ENRICHISSEMENT
  ├── Lead déjà enrichi en BDD ? → skip
  ├── Entreprise exclue (procédure collective, fermée) ? → skip
  ├── Email blacklisté RGPD ? → skip
  └── Déterminer les traitements requis

STEP 2 : LANCEMENT PARALLÈLE DES SOUS-AGENTS
  ├── 2a Contact ─────────┐
  ├── 2b Entreprise ──────┤──> Promise.allSettled() (timeout 3 min)
  └── 2c Technique ───────┘

STEP 3 : FUSION DES RÉSULTATS
  ├── Merger contact (2a) + entreprise (2b) + technique (2c)
  ├── Résoudre les conflits de données (priorité des sources)
  └── Calculer le score de complétude global

STEP 4 : DÉDUPLICATION BDD
  ├── Chercher doublon par SIRET (100% fiable)
  ├── Chercher doublon par email (95% fiable)
  ├── Chercher doublon par domaine web (90% fiable)
  ├── Si doublon : fusionner signaux + enrichir fiche existante
  └── Si nouveau : insérer dans table prospects

STEP 5 : CONTRÔLE QUALITÉ
  ├── Vérifier champs critiques remplis
  ├── Calculer complétude (0-100%)
  ├── Enrichable = nom entreprise + au moins 1 moyen de contact
  └── Flagger leads incomplets pour enrichissement manuel

STEP 6 : DISPATCH VERS SCOREUR
  ├── Envoyer vers queue 'scoreur-pipeline'
  ├── Priorité basée sur complétude + preScore
  └── Logger métriques
```

### Score de complétude (10 champs vérifiés)

| Champ | Criticité | Impact si absent |
|-------|-----------|------------------|
| `email` | Critique | -20 pts scoring |
| `contact.prenom` | Critique | Personnalisation impossible |
| `contact.nom` | Critique | Personnalisation impossible |
| `companySiren` | Important | Données financières indisponibles |
| `finances.ca` | Important | Scoring taille impossible |
| `effectif.exact` | Important | Scoring firmographique dégradé |
| `telephone` | Secondaire | Neutre |
| `technique` | Secondaire | -5 pts scoring |
| `site_web` | Secondaire | Pas de scan technique possible |
| `dirigeants` | Secondaire | Neutre |

### Gestion des exclusions automatiques

| Condition | Action | Impact |
|-----------|--------|--------|
| Procédure collective détectée | EXCLURE automatiquement | Lead rejeté |
| Entreprise fermée (état F) | EXCLURE automatiquement | Lead rejeté |
| Email blacklisté RGPD | EXCLURE automatiquement | Lead rejeté |
| Email spamtrap/abuse | EXCLURE automatiquement | Lead rejeté |

---

## Output JSON complet (enrichmentData)

```json
{
  "contact": {
    "email": "sophie.martin@techcorp.fr",
    "confidence": 99,
    "source": "smtp_verified",
    "patternsChecked": ["sophie.martin@techcorp.fr", "s.martin@techcorp.fr"],
    "domain": "techcorp.fr"
  },
  "company": {
    "siren": "123456789",
    "legalName": "TECHCORP SAS",
    "tradeName": "TechCorp",
    "nafCode": "6202A",
    "nafLabel": "Conseil en systèmes et logiciels informatiques",
    "legalCategory": "SAS",
    "creationDate": "2015-03-15",
    "address": { "street": "12 RUE DE LA REPUBLIQUE", "postalCode": "75011", "city": "PARIS" },
    "employeeRange": "100-199",
    "isActive": true,
    "capital": 50000,
    "directors": [{ "name": "Jean Dupont", "role": "Président", "since": "2015-03-15" }],
    "beneficialOwners": [],
    "financials": [{ "year": 2025, "revenue": 3500000, "netIncome": 280000 }],
    "legalNotices": [],
    "hasCollectiveProcedure": false,
    "sourcesUsed": ["insee", "inpi", "bodacc"],
    "sourcesUnavailable": []
  },
  "technique": {
    "stack": { "cms": "WordPress", "cms_version": "6.4", "framework_js": null },
    "performance": { "score": 42, "lcp_ms": 4200, "verdict": "mauvais" },
    "accessibilite": { "score": 62, "violations_critical": 5 },
    "problemes_detectes": ["Performance faible", "Accessibilité non conforme"]
  }
}
```

---

## Variables d'environnement (→ ajoutées dans ENV-VARIABLES.md)

```env
# ──────────── 2a Contact — Email finding ────────────
HUNTER_API_KEY=                               # 49€/mois (partagé avec Agent 1a)
REACHER_URL=http://localhost:8080             # Self-hosted email verifier (0€)
REACHER_MAX_CONCURRENT=5
REACHER_TIMEOUT_MS=30000
REACHER_MAX_REQUESTS_PER_DAY=500

# ──────────── 2b Entreprise — Données légales ────────────
SIRENE_API_TOKEN=                             # Gratuit (déjà déclaré Agent 1c)
INPI_API_URL=https://data.inpi.fr/api
INPI_USERNAME=
INPI_PASSWORD=
PAPPERS_API_KEY=                              # 60€/mois (partagé avec Agent 1c)
SOCIETEINFO_API_KEY=                          # 39€/mois (optionnel, HOT leads)

# ──────────── 2c Technique — Audit web ────────────
# Réutilise les mêmes outils que Agent 1c (Lighthouse, Wappalyzer, axe-core)
# Pas de variable d'env supplémentaire

# ──────────── Master Enrichisseur ────────────
ENRICHISSEUR_ENABLED=true
ENRICHISSEUR_GLOBAL_TIMEOUT_MS=180000         # 3 min max par lead
ENRICHISSEUR_CONCURRENCY=5                    # Leads enrichis en parallèle
```

---

## AUDIT — Bugs critiques identifiés (26 mars 2026)

### 5 bugs bloquants à corriger AVANT toute implémentation

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B1** | rawData extraction hardcodée BOAMP (`nomacheteur`, `objet`, `url_avis`) mais les 3 sources actives (linkedin, web_audit, job_board) utilisent des clés différentes (`companyName`, `entrepriseNom`, `url`) → **tous les prospects créés avec companyName='Inconnu'** | `enrichisseur.processor.ts:33-35` | Pipeline cassé |
| **B2** | `enrichmentData` écrit en nested (`company.*`, `contact.*`) mais le Scoreur lit en flat (`industry`, `signals`, `lighthouseScore`) → **tous les scoring inputs sont undefined** | `enrichisseur.service.ts` vs `scoreur.service.ts` | Scoring cassé |
| **B3** | `prospect.companySize` jamais mis à jour (stocké dans JSON, Scoreur lit la colonne directe) | `enrichisseur.service.ts:95` | Scoring dégradé |
| **B4** | `enrichContact()` est un no-op si firstName/lastName/companyWebsite manquent → la majorité des leads n'ont pas ces infos | `enrichisseur.service.ts:134` | Email jamais trouvé |
| **B5** | Bug catch-all : vérifie `isReachable === 'safe'` au lieu de `isCatchAll === true` pour détecter les domaines catch-all | `email-finder.service.ts:57` | Faux positifs |

### Fix requis pour B1 — rawData extraction multi-source

```typescript
// enrichisseur.processor.ts — AVANT (cassé)
const companyName = (rawData.nomacheteur as string) ?? (rawData.objet as string) ?? 'Inconnu';
const companyWebsite = (rawData.url_avis as string) ?? null;

// enrichisseur.processor.ts — APRÈS (corrigé)
const companyName = (rawData.companyName as string)      // linkedin, job_board
  ?? (rawData.entrepriseNom as string)                    // web_audit
  ?? (rawData.nomacheteur as string)                      // boamp (legacy)
  ?? (rawData.objet as string)                            // boamp fallback
  ?? 'Inconnu';
const companyWebsite = (rawData.companyWebsite as string) // linkedin
  ?? (rawData.url as string)                              // web_audit
  ?? (rawData.url_avis as string)                         // boamp
  ?? null;
const companySiren = (rawData.companySiren as string) ?? null;
```

### Fix requis pour B2 — enrichmentData schema alignment

```typescript
// enrichisseur.service.ts — ajouter les champs flat que le Scoreur attend
const enrichmentData = {
  contact: { ... },
  company: { ... },
  technique: { ... },
  // --- Champs flat pour compatibilité Scoreur ---
  industry: companyData?.nafLabel ?? null,
  region: companyData?.address?.city ?? null,
  signals: prospect.rawLead?.rawData?.signals ?? [],
  lighthouseScore: techData?.performance?.score ?? null,
  websiteTraffic: null, // pas disponible
  segment: prospect.source === 'web_audit' ? 'pme_metro' : null,
  isCompetitor: false,
  isBankrupt: companyData?.hasCollectiveProcedure ?? false,
};
// + mettre à jour prospect.companySize depuis companyData.employeeRange
// + mettre à jour prospect.companyTechStack depuis techData.stack
```

---

## Roadmap d'Implémentation (mise à jour post-audit)

### Phase 0 — Fix bugs critiques pipeline (URGENT — 1 jour)
- [ ] **B1** : Fix rawData extraction multi-source dans `enrichisseur.processor.ts` (linkedin, web_audit, job_board)
- [ ] **B2** : Aligner enrichmentData schema avec ce que le Scoreur attend (champs flat)
- [ ] **B3** : Mettre à jour `prospect.companySize` et `prospect.companyTechStack` après enrichissement
- [ ] **B4** : Permettre enrichContact() sans firstName/lastName (chercher le décideur from scratch)
- [ ] **B5** : Fix bug catch-all dans `email-finder.service.ts` (vérifier `isCatchAll` pas `isReachable`)
- [ ] **B6** : Ajouter auth guard sur POST `/agents/enrichisseur/enrich`
- [ ] **B7** : Activer les exclusions (procédure collective → rejeter, entreprise fermée → rejeter)
- [ ] Tests de non-régression pour chaque fix

### Phase 1 — Compléter 2a Contact : Hunter.io + sélection décideur (1.5 jours)
- [ ] Créer `hunter.adapter.ts` : domain-search + email-finder + email-verifier
- [ ] Intégrer dans EmailFinderService (waterfall : Reacher → Hunter domain → Hunter finder)
- [ ] Implémenter DECIDEUR_MAPPINGS par segment (5 segments × 3 priorités)
- [ ] Fallback : si pas de contact fourni, chercher décideur via Hunter domain-search
- [ ] Tests unitaires waterfall complet

### Phase 2 — Ajouter Pappers API à 2b Entreprise (1 jour)
- [ ] Créer `pappers.adapter.ts` : GET /v2/entreprise?siren=...
- [ ] Données : CA 3 exercices, résultat net, dirigeants nominatifs, bénéficiaires, procédures
- [ ] Alertes financières : `ca_en_baisse`, `effectif_en_baisse` (comparaison N vs N-1)
- [ ] Intégrer dans CompanyEnricherService (INSEE → Pappers → INPI → BODACC)
- [ ] Tests Pappers adapter

### Phase 3 — Câbler 2c Technique dans l'enrichisseur (0.5 jour)
- [ ] Importer `WebScannerAdapter` de l'Agent 1c dans AgentEnrichisseurModule
- [ ] Implémenter `shouldRunTechScan()` (skip si source=web_audit ou scan < 30j)
- [ ] Appeler le scan dans enrichProspect() et stocker dans `enrichmentData.technique`
- [ ] Mapper `lighthouseScore` et `companyTechStack` vers les colonnes Prospect

### Phase 4 — Master orchestration complète (1.5 jours)
- [ ] Timeout global 3 minutes (Promise.race sur les 3 sous-agents)
- [ ] `metadata.traitement_requis` : activer conditionnellement chaque sous-agent
- [ ] Déduplication BDD : SIRET → email → domaine (3 niveaux de priorité)
- [ ] Fusion signaux si doublon trouvé (mergeWithExisting)
- [ ] Score de complétude (0-100%, 10 champs vérifiés)
- [ ] Dispatch priorité Scoreur basée sur complétude (>=70% → priority 1, sinon 5)
- [ ] Skip already-enriched (idempotency guard)
- [ ] SLA : HOT leads (preScore >= 60) priorité max dans la queue
- [ ] Worker config : concurrency 5, limiter 10/min, stalledInterval 5min

### Phase 5 — Cache Redis (0.5 jour)
- [ ] Cache INSEE (TTL 30j) — clé `insee:{siren}`
- [ ] Cache Pappers (TTL 30j) — clé `pappers:{siren}`
- [ ] Cache BODACC (TTL 7j) — clé `bodacc:{siren}`
- [ ] Cache INPI (TTL 30j) — clé `inpi:{siren}`
- [ ] Rate limiter INPI stocké en Redis (pas in-memory)

### Phase 6 — RGPD complet (0.5 jour)
- [ ] `handleOpposition()` : anonymiser prospect (nullifier email/phone, status='oppose_rgpd')
- [ ] Écrire `consentGiven`/`consentDate` lors de l'enrichissement
- [ ] Filtrer emails spamtrap/abuse/do_not_mail (ajouter statuts Reacher)

### Phase 7 — Dashboard Enrichisseur (1 jour)
- [ ] Page agent-detail enrichie (agentName === 'enrichisseur')
- [ ] Métriques : taux couverture email, temps moyen, sources utilisées
- [ ] Sous-agents status (2a/2b/2c) avec dernière activité
- [ ] Top prospects enrichis récemment
- [ ] Coûts API par source

### Phase 8 — Tests complets (0.5 jour)
- [ ] Tests enrichisseur.processor.ts rawData extraction (3 formats)
- [ ] Tests enrichmentData → Scoreur alignment
- [ ] Tests Hunter.io adapter
- [ ] Tests Pappers adapter
- [ ] Tests déduplication BDD
- [ ] Tests contrôle qualité + exclusions
- [ ] Tests RGPD opposition flow
