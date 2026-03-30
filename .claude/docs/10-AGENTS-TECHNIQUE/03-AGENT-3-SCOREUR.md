# Agent 3 — SCOREUR — Documentation Technique d'Implémentation

**Source de vérité :** `.claude/source-ia/agent/AGENT-3-MASTER.md` + `AGENT-3-MODELE-SCORING.md` + `AGENT-3-FEEDBACK-CALIBRATION.md`

---

## Architecture

```
AGENT 3 — SCOREUR
├── ScoringEngine (calcul pur, 4 axes + malus/bonus)
├── ScoreurService (orchestration, DB, dispatch)
└── ScoringCoefficient (DB-driven, non implémenté)

Pas de sous-agents — agent monolithique avec moteur de scoring déterministe.
```

### Position dans le pipeline

```
Agent 2 ENRICHISSEUR                      Agent 4 RÉDACTEUR
  ↓                                          ↑ (HOT)
  scoreur-pipeline ──→ AGENT 3 ──┬──→ redacteur-pipeline
                                  └──→ nurturer-pipeline (WARM/COLD)
                                                ↓
                                        Agent 6 NURTUREUR
```

---

## Communication inter-agents

### INPUT : Ce que l'Agent 2 envoie (queue `scoreur-pipeline`)

```typescript
// Job name: 'score-prospect'
{
  prospectId: string,        // UUID du Prospect enrichi
  enrichedAt: string,        // ISO timestamp (ignoré par le Scoreur)
}
// Priority: 1 (complétude >= 70%) ou 5
```

Le Scoreur ne lit PAS le job data — il charge le Prospect complet depuis la DB.

### Ce que le Scoreur lit sur le Prospect (DB)

| Champ Prospect | Utilisé pour | Source (Agent 2) |
|---------------|-------------|-----------------|
| `companySize` | ICP Fit — taille entreprise | `employeeRange` via INSEE |
| `companyTechStack` (JSON) | Technique — `hasModernFramework`, `hasMobileOptimization`, `hasSecurityCerts` | `techResult.stack` |
| `emailVerified` | Engagement + malus/bonus | Confidence >= 75 via Reacher |
| `phone` | Engagement — `phoneAvailable` | Non implémenté |
| `linkedinUrl` | Engagement — `hasLinkedinProfile` | Depuis RawLead |
| `email` | `emailInvalid` check | Via email finder |
| `consentGiven` | `isOptedOut` check | Non écrit par enrichisseur |
| `rgpdErasedAt` | `isRgpdBlocked` check | Via RGPD flow |
| `enrichmentData.industry` | ICP Fit — secteur | `nafLabel` |
| `enrichmentData.region` | ICP Fit — géographie | `address.city` (BUG: devrait être région) |
| `enrichmentData.signals[]` | Intent Signals (30 pts max) | **BUG: toujours `[]`** |
| `enrichmentData.lighthouseScore` | Technique — performance | Lighthouse score |
| `enrichmentData.websiteTraffic` | Engagement | **Toujours `null`** |
| `enrichmentData.segment` | Coefficients segment | **Toujours `null`** |
| `enrichmentData.isCompetitor` | Hard disqualification | `false` |
| `enrichmentData.isBankrupt` | Hard disqualification | `hasCollectiveProcedure` |

### OUTPUT : Ce que l'Agent 3 dispatche

**HOT (A/B/C) → `redacteur-pipeline`**

```typescript
// Job name: 'generate-message'
{
  prospectId: string,
  channel: 'email',                    // Toujours email (LinkedIn non routé)
  category: 'HOT_A' | 'HOT_B' | 'HOT_C',
  routing: { sequenceId, canal, slaHours, priority, delayMs },
  breakdown: { icpFit, signalsIntention, stackTechnique, engagement, malusTotal, bonusTotal, rawScore },
}
```

**WARM/COLD → `nurturer-pipeline`**

```typescript
// Job name: 'nurture-prospect'
{
  prospectId: string,
  reason: 'Scored as WARM' | 'Scored as COLD',
  category: 'WARM' | 'COLD',
  routing: { sequenceId, canal, slaHours, priority, delayMs },
}
```

**DISQUALIFIÉ → Aucun dispatch**

---

## Modèle de scoring — 4 axes

### Axe 1 : ICP Fit (max 35 pts)

| Sous-axe | Max | Logique |
|----------|:---:|---------|
| Taille entreprise | 15 | `11-50`→15, `51-200`→12, `201-500`→8, `1-10`→5, `501+`→3, inconnu→5 |
| Secteur/industrie | 10 | Prioritaire (digital/web/SaaS)→10, autre→3, absent→0 |
| Géographie | 10 | IDF/Provence→10, Auvergne/Occitanie→8, Nouvelle-Aquitaine→7, autre→5 |

### Axe 2 : Intent Signals (max 30 pts) — AXLE PLUS DYNAMIQUE

Décroissance temporelle exponentielle : `score = base × 0.5^(joursÉcoulés / halfLife)`

| Signal | Base | Half-life (j) |
|--------|:----:|:-------------:|
| `form_submission` | 25 | 14 |
| `funding_round` | 22 | 180 |
| `expansion` | 16 | 120 |
| `changement_poste` | 15 | 90 |
| `email_click` | 15 | 10 |
| `recrutement_dev_web` | 14 | 60 |
| `technology_adoption` | 14 | 45 |
| `job_posting` | 12 | 60 |
| `news_mention` | 10 | 90 |
| `website_update` | 8 | 30 |

Rank multiplier : `[1.0, 0.5, 0.25, 0.1]` (top 4 signals)
Multi-source bonus : +5 (3+ sources), +3 (2 sources)

### Axe 3 : Technique (max 20 pts)

| Condition | Points |
|-----------|:------:|
| `hasModernFramework` | +8 |
| `hasMobileOptimization` | +6 |
| `hasSecurityCerts` | +3 |
| `lighthouseScore >= 80` | +3 |

### Axe 4 : Engagement (max 15 pts)

| Condition | Points |
|-----------|:------:|
| `emailVerified` | +3 |
| `phoneAvailable` | +3 |
| `hasLinkedinProfile` | +4 |
| Email + phone combo | +3 |
| `websiteTraffic >= 1000` | +2 |

### Coefficients par segment

| Segment | ICP | Signaux | Technique | Engagement |
|---------|:---:|:-------:|:---------:|:----------:|
| `pme_metro` | 1.0 | 1.2 | 0.8 | 0.9 |
| `ecommerce` | 0.9 | 1.0 | 1.3 | 1.1 |
| `collectivite` | 1.1 | 0.9 | 0.9 | 1.0 |
| `startup` | 0.8 | 1.4 | 1.1 | 1.2 |
| `agence_wl` | 1.0 | 1.1 | 1.2 | 1.0 |

### Malus / Bonus

| Condition | Impact |
|-----------|:------:|
| Email non vérifié | -5 |
| Aucun canal de contact | -10 |
| Pas de framework moderne NI lighthouse | -8 |
| Tous signaux > 60j | -15 |
| Email vérifié + téléphone | +5 |
| Signal < 7 jours | +8 |

### Hard disqualification (score = 0, aucun dispatch)

- `isCompetitor` = true
- `isOptedOut` = true (pas de consentement)
- `isRgpdBlocked` = true
- `emailInvalid` = true
- `isBankrupt` = true

### Catégorisation

| Score | Catégorie | Routing |
|:-----:|-----------|---------|
| ≥ 90 | HOT_A | → Rédacteur, SLA 1h, priority 100 |
| ≥ 80 | HOT_B | → Rédacteur, SLA 4h, priority 75, delay 5min |
| ≥ 75 | HOT_C | → Rédacteur, SLA 8h, priority 50, delay 1h |
| ≥ 50 | WARM | → Nurtureur, delay 24h |
| ≥ 25 | COLD | → Nurtureur, delay 7j |
| < 25 | DISQUALIFIÉ | Aucun dispatch |

---

## AUDIT — 10 bugs identifiés

### Bugs critiques (pipeline cassé)

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B1** | `enrichmentData.signals` toujours `[]` → Axe 2 (30 pts max) = 0 en permanence | `enrichisseur.service.ts:170` | **Scoring amputé de 30%** |
| **B2** | `enrichmentData.segment` toujours `null` → coefficients segment jamais appliqués | `enrichisseur.service.ts:173` | Différenciation segment morte |
| **B3** | `enrichmentData.region` = city name (ex: "Paris") au lieu de région ("ile-de-france") → géographie toujours 5 pts par défaut | `enrichisseur.service.ts:169` | ICP Fit géo dégradé |
| **B4** | `companySize` format mismatch : INSEE écrit "50 a 99 salaries", scoring attend "51-200" → toujours 5 pts par défaut | `scoring-engine.ts:sizeMap` | ICP Fit taille dégradé |
| **B5** | `emailInvalid` disqualifie les prospects SANS email (pas seulement les emails invalides) → leads BOAMP/jobs sans contact = score 0 | `scoreur.service.ts:65` | **Disqualification abusive** |

### Bugs modérés

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B6** | `accessibilityScore` reçoit `engagementNormalized` (doublon) au lieu d'un score accessibilité réel | `scoreur.service.ts:81` | Données DB incorrectes |
| **B7** | `Prospect.status` jamais mis à jour à `'scored'` après scoring | `scoreur.service.ts` | Idempotence cassée |
| **B8** | SLA spec: HOT_B=2h, HOT_C=4h / Code: HOT_B=4h, HOT_C=8h | `scoring-engine.ts:routing` | SLA non respecté |
| **B9** | `ScoringCoefficient` modèle DB existe mais jamais utilisé (hardcodé) | `scoring-engine.ts` | Pas de recalibration |
| **B10** | Pas de garde auth sur POST `/agents/scoreur/calculate` | `scoreur.controller.ts` | Faille sécurité |

### Gaps spec vs code

| # | Manquant | Impact |
|---|---------|--------|
| G1 | **Décideur scoring** absent dans ICP Fit (7 pts spec, 0 pts code) | Qualité contact non valorisée |
| G2 | **NAF code scoring** absent (string match au lieu de mapping NAF) | Secteur imprécis |
| G3 | **RGAA accessibilité** absent dans Axe 3 (6 pts spec) | Pertinent pour collectivités |
| G4 | **LinkedIn channel routing** absent (toujours email) | HOT_A/B devraient aussi recevoir LinkedIn DM |
| G5 | **Feedback loop** / table `prospect_outcomes` absente | Pas de recalibration possible |
| G6 | **Input validation** avant scoring absente | Scoring sur données incomplètes |
| G7 | **Redacteur** ignore `category`, `routing`, `breakdown` du job | Données calculées perdues |
| G8 | **Nurtureur** ignore `category` et `routing` du job | Pas de différenciation WARM/COLD |
| G9 | **Dashboard scoreur** — pas de métriques spécifiques | Pas de visibilité distribution HOT/WARM/COLD |
| G10 | **Slack alerts** pour HOT_A / erreurs scoring absentes | Pas de notification temps réel |

---

## Variables d'environnement

```env
# ══════════════════════════════════════════════
#          AGENT 3 — SCOREUR
# ══════════════════════════════════════════════
# Pas de clé API — calcul 100% local
# Pas de coût mensuel
SCOREUR_ENABLED=true
SCOREUR_MODEL_VERSION=2.0.0              # Version du modèle de scoring
SCOREUR_HOT_THRESHOLD=75                 # Score min → HOT (A/B/C)
SCOREUR_WARM_THRESHOLD=50                # Score min → WARM
SCOREUR_COLD_THRESHOLD=25                # Score min → COLD
```

---

## Roadmap d'Implémentation

### Phase 0 — Fix bugs critiques (1 jour)
- [ ] **B1** : Propager les signaux Agent 1 → Agent 2 → enrichmentData.signals (modifier enrichisseur.service.ts pour lire rawLead.rawData.signals)
- [ ] **B2** : Propager le segment estimé du Veilleur → enrichmentData.segment
- [ ] **B3** : Mapper `address.city` → nom de région via table de correspondance département→région
- [ ] **B4** : Normaliser `companySize` : ajouter `parseCompanySize()` dans scoring-engine qui accepte les 2 formats (INSEE français + ranges anglais)
- [ ] **B5** : Fix `emailInvalid` : ne disqualifier QUE si email exists ET bounce/invalid, PAS si email absent
- [ ] **B6** : Fix `accessibilityScore` : utiliser `enrichmentData.lighthouseScore` ou axe séparé, pas `engagementNormalized`
- [ ] **B7** : Mettre à jour `Prospect.status = 'scored'` après scoring
- [ ] **B8** : Corriger SLA : HOT_B=2h, HOT_C=4h (comme la spec)
- [ ] **B10** : Ajouter `@UseGuards(JwtAuthGuard)` sur scoreur controller
- [ ] Tests de non-régression

### Phase 1 — Enrichir ICP Fit (0.5 jour)
- [ ] Ajouter décideur scoring (7 pts) dans `calculateICPFit` : lire `prospect.jobTitle`, mapper vers score via regex
- [ ] Ajouter mapping NAF code → score (priorité aux codes digitaux 62xx, 73xx, 58xx)
- [ ] Ajouter scoring CA si disponible (finances de Pappers)

### Phase 2 — Propager les signaux (1 jour)
- [ ] Modifier `enrichisseur.processor.ts` : lire `rawLead.rawData.signals` et les stocker dans `enrichmentData.signals`
- [ ] Modifier `enrichisseur.service.ts` : propager signaux vers enrichmentData (pas hardcoder `[]`)
- [ ] Modifier `enrichisseur.service.ts` : propager segment vers enrichmentData (pas hardcoder `null`)
- [ ] Ajouter table département → région française
- [ ] Tests intégration : vérifier que les signaux du Veilleur arrivent au Scoreur

### Phase 3 — Fix contrats aval (0.5 jour)
- [ ] **G7** : Étendre `RedacteurProcessor` pour lire `category`, `routing.sequenceId`, `routing.slaHours`
- [ ] **G8** : Étendre `StartNurtureDto` pour accepter `category` et `routing`
- [ ] **G4** : Ajouter routing LinkedIn pour HOT_A/HOT_B (dispatch 2 jobs : email + linkedin)

### Phase 4 — Dashboard Scoreur (0.5 jour)
- [ ] `DashboardService.getScoreurMetrics()` : distribution HOT/WARM/COLD/DISQUALIFIÉ, score moyen par axe, top 10 prospects
- [ ] Agent detail page enrichie : graphe distribution, histogramme des scores
- [ ] Scoreur-specific tab dans agent-detail.tsx

### Phase 5 — Feedback & Calibration (optionnel, 1 jour)
- [ ] Créer modèle Prisma `ProspectOutcome` (converted, no_response, nurture, etc.)
- [ ] Implémenter `ScoringCoefficientRepository` pour coefficients DB-driven
- [ ] Job mensuel analyste : comparer scores vs outcomes → recommander ajustements

### Phase 6 — Tests (0.5 jour)
- [ ] Tests scoring avec signaux réels (décroissance temporelle)
- [ ] Tests format `companySize` (INSEE + ranges)
- [ ] Tests région mapping
- [ ] Tests décideur scoring
- [ ] Tests dispatch contrats (Rédacteur reçoit category, Nurtureur reçoit routing)
