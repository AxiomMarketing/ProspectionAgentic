# Agent 6 — NURTUREUR — Documentation Technique d'Implémentation

**Source de vérité :** `.claude/source-ia/agent/AGENT-6-MASTER.md` + `AGENT-6a-EMAIL-NURTURE.md` + `AGENT-6b-LINKEDIN-PASSIF.md` + `AGENT-6c-RE-SCOREUR.md`

---

## Architecture

```
AGENT 6 — NURTUREUR MASTER
├── 6a Email Nurture (séquences comportementales, Claude, Gmail)
├── 6b LinkedIn Passif (likes/comments via Waalaxy)
└── 6c Re-Scoreur (re-scoring périodique + immédiat → retour Agent 3)

Master = gère le lifecycle nurture (entrée, pause, réactivation, sunset RGPD)
```

### Position dans le pipeline

```
Agent 3 SCOREUR (WARM/COLD)  ──┐
Agent 5 SUIVEUR (PAS_MAINTENANT)──┤──→ nurturer-pipeline ──→ AGENT 6
Scheduler (re-engagement hourly)──┤                              │
Scheduler (sunset daily 06:00) ──┘                              │
                                                                 ├── 6a Email nurture → prospect
                                                                 ├── 6b LinkedIn passif → prospect
                                                                 └── 6c Re-score → scoreur-pipeline → Agent 3
                                                                       (si score ≥ 75 → retour HOT)
```

---

## Communication inter-agents

### INPUT : 3 sources

**Path A — Scoreur (WARM/COLD)**
```typescript
// Job: 'nurture-prospect' sur nurturer-pipeline
{ prospectId, reason: 'Scored as WARM', category: 'WARM', routing: { sequenceId, delayMs, priority } }
```

**Path B — Suiveur (PAS_MAINTENANT reply)**
```typescript
// Job: 'nurture-prospect' sur nurturer-pipeline (delay 30 jours)
{ prospectId, reason: 'Reply: pas maintenant', category: 'WARM' }
```

**Path C — Scheduler crons**
- `re-engagement-check` : toutes les heures → batch query prospects inactifs > 60j
- `sunset-check` : quotidien 06:00 → exit prospects en nurture > 180j (RGPD)

### OUTPUT : vers Agent 3 (re-scoring)

```typescript
// triggerReScore() → scoreur-pipeline
{ prospectId, trigger: 'nurture_engagement' }
```

### Events émis (actuellement SANS listeners)

| Event | Quand |
|-------|-------|
| `nurture.started` | Nouveau prospect en nurture |
| `nurture.reactivated` | Prospect réactivé après pause |
| `nurture.step.processed` | Étape nurture traitée |
| `nurture.exited` | Prospect sunset (180j RGPD) |
| `nurture.rescore.triggered` | Re-scoring déclenché |

---

## Code existant — État actuel

| Composant | Status | Lignes |
|-----------|:------:|:------:|
| Module + DI | Fonctionnel | 23 |
| NurtureurService (5 méthodes) | Squelette | 158 |
| NurtureurProcessor (5 job types) | Fonctionnel | 43 |
| NurtureSequence entity (state machine) | Fonctionnel | 72 |
| Repository (Prisma) | Basique | 73 |
| Controller (3 endpoints) | Sans auth | 24 |
| StartNurtureDto (Zod) | Minimal | 18 |
| **Sub-agent 6a Email Nurture** | **Non implémenté** | 0 |
| **Sub-agent 6b LinkedIn Passif** | **Non implémenté** | 0 |
| **Sub-agent 6c Re-Scoreur** | **Shell seul (triggerReScore jamais appelé)** | 7 |

---

## AUDIT — 20 bugs identifiés

### Bugs CRITICAL (pipeline cassé)

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B1** | `Prospect.status` jamais mis à jour à `'nurturing'` | `nurtureur.service.ts:24-33` | Dashboard metrics = 0 |
| **B2** | **Boucle infinie** : sunset → exit → re-engagement → re-enroll | `nurtureur.service.ts` | Prospects sunset réinscrits toutes les heures |
| **B3** | `startNurture()` ne check pas si séquence active existe → crash Prisma P2002 | `nurtureur.service.ts:24` | Erreur unique constraint |
| **B4** | `processNurtureStep()` est un **stub** — n'envoie rien, ne génère rien | `nurtureur.service.ts:54-73` | Aucune action nurture |
| **B5** | `triggerReScore()` **jamais appelé** — dead code | `nurtureur.service.ts:151` | Boucle retour Agent 3 cassée |

### Bugs HIGH

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B6** | 3 sous-agents (6a, 6b, 6c) **entièrement absents** | — | 100% des fonctionnalités nurture manquantes |
| **B7** | `checkReEngagement()` utilise `prospect.updatedAt` au lieu de `last_interaction_at` | `nurtureur.service.ts:76` | Faux positifs/négatifs |
| **B8** | `processNurtureStep()` logique incorrecte : `emailSent > 0 ? linkedin : email` compte TOUS les emails (incluant cold outreach) | `nurtureur.service.ts:63` | Mauvais type de step |
| **B9** | Prisma `NurtureProspect` manque ~20 champs de la spec | `schema.prisma` | Sous-agents impossibles à implémenter |
| **B10** | `findByProspectId()` sans filtre status → retourne séquences exitées | `prisma-nurture-sequence.repository.ts:32` | Traitement de séquences mortes |

### Bugs sécurité

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **S1** | Pas de `@UseGuards(JwtAuthGuard)` sur controller | `nurtureur.controller.ts` | Accès public |
| **S2** | Pas de check RGPD/blacklist avant enrollment | `nurtureur.service.ts` | Violation RGPD |
| **S3** | Pas de check `consentGiven` avant envoi nurture | `nurtureur.service.ts` | Violation RGPD Art.6 |
| **S4** | Pas de rate limiting sur emails nurture | `nurtureur.service.ts` | Spec: max 2/semaine, min 3j entre emails |
| **S5** | Sunset ne met pas à jour Prospect.status ni RgpdBlacklist | `nurtureur.service.ts:113-149` | Re-enrollment possible |
| **S6** | Events émis sans aucun listener (5 events dans le vide) | `nurtureur.service.ts` | Actions post-nurture perdues |

### Gaps spec vs code

| # | Manquant | Spec |
|---|---------|------|
| G1 | **6a Email Nurture** : séquences comportementales, Claude personnalisation, branching (ouvert/cliqué/ignoré), ratio 3:1 valeur/promo | AGENT-6a |
| G2 | **6b LinkedIn Passif** : likes/comments Waalaxy, quotas anti-spam, blackout 22h-7h | AGENT-6b |
| G3 | **6c Re-Scoreur** : re-scoring mensuel + immédiat (page pricing, download, 3+ interactions/7j) | AGENT-6c |
| G4 | **Content library** : pool de contenus (articles, case studies, guides, webinars) | AGENT-6a |
| G5 | **Journey stages** : awareness → consideration → decision | AGENT-6a |
| G6 | **Engagement score** : opens +2, clicks +5, pricing +10 | AGENT-6c |
| G7 | **NurtureInteraction** : aucun record jamais écrit | `schema.prisma` |
| G8 | **Dashboard Nurtureur** : pas de métriques spécifiques | `dashboard.service.ts` |

---

## Variables d'environnement

```env
# ══════════════════════════════════════════════
#          AGENT 6 — NURTUREUR
# ══════════════════════════════════════════════
NURTUREUR_ENABLED=true
NURTUREUR_MAX_EMAILS_PER_WEEK=2              # Max emails nurture par prospect par semaine
NURTUREUR_MIN_DAYS_BETWEEN_EMAILS=3          # Min jours entre 2 emails nurture
NURTUREUR_SUNSET_DAYS=180                    # Jours avant sunset RGPD
NURTUREUR_RE_ENGAGEMENT_DAYS=60              # Jours d'inactivité avant re-engagement
NURTUREUR_RESCORE_THRESHOLD=75               # Score pour handoff HOT vers Agent 3
```

---

## Roadmap d'Implémentation

### Phase 0 — Fix bugs critiques + sécurité (1.5 jours)
- [ ] **B1** : Mettre à jour `Prospect.status = 'nurturing'` dans startNurture()
- [ ] **B2** : Fix boucle infinie : dans checkSunset(), mettre `Prospect.status = 'unsubscribed'` + ajouter en RgpdBlacklist
- [ ] **B3** : Check si séquence active existe avant startNurture() → upsert ou skip
- [ ] **B5** : Câbler triggerReScore() : appeler depuis processNurtureStep() quand engagement > seuil
- [ ] **B7** : Utiliser `NurtureInteraction` last createdAt au lieu de `prospect.updatedAt`
- [ ] **B8** : Compter uniquement les emails nurture (channel='email', templateId contient 'nurture')
- [ ] **B10** : Ajouter filtre `status: 'active'` dans findByProspectId()
- [ ] **S1** : Auth guard sur controller
- [ ] **S2** : RGPD/blacklist check avant enrollment
- [ ] **S3** : Check consentGiven avant toute action
- [ ] **S5** : Sunset → update Prospect.status + RgpdBlacklist

### Phase 1 — Sub-agent 6a Email Nurture (2 jours)
- [ ] **G1** : Service `NurtureEmailService` : sélection contenu par segment+stage, Claude personnalisation, envoi Gmail
- [ ] Behavioral branching : ouvert+cliqué → accélérer (3j), ouvert seul → 5j, ignoré → 10j
- [ ] Ratio 3:1 valeur/promo : `(totalSent + 1) % 4 === 0 ? 'promo' : 'valeur'`
- [ ] LCEN footer dans les emails nurture
- [ ] **S4** : Rate limiting (max 2/semaine, min 3j entre emails)
- [ ] **G4** : Content pool (articles, case studies, guides) — table ou JSON config
- [ ] **G5** : Journey stages (awareness → consideration → decision)

### Phase 2 — Sub-agent 6c Re-Scoreur (1 jour)
- [ ] **G6** : Engagement score tracking : opens +2, clicks +5, pricing_page +10, download +8
- [ ] **G3** : Cron mensuel re-scoring pour tous les prospects en nurture active
- [ ] Immediate triggers : 3+ interactions en 7j → re-score immédiat
- [ ] HOT handoff : si score combiné ≥ 75 → `scoreur-pipeline` avec payload complet
- [ ] Update nurture_status = 'RECLASSIFIED_HOT' sur handoff

### Phase 3 — Prisma schema + interactions (0.5 jour)
- [ ] **B9** : Ajouter les ~20 champs manquants à NurtureProspect (engagement scores, sequence tracking, timestamps)
- [ ] **G7** : Écrire des NurtureInteraction records sur chaque action (email open, click, reply)
- [ ] Migration Prisma
- [ ] **G8** : Dashboard metrics (engagement rates, journey stage distribution, re-score count)

### Phase 4 — Dashboard + tests (0.5 jour)
- [ ] Dashboard Nurtureur : prospects en nurture (actifs/pausés/exitées), engagement rates, re-scores triggered
- [ ] Tests startNurture (upsert, RGPD check)
- [ ] Tests checkReEngagement (inactivité correcte)
- [ ] Tests checkSunset (RGPD exit + blacklist)
- [ ] Tests behavioral branching (6a)
- [ ] Tests triggerReScore (6c)

### Phase 5 — LinkedIn passif (optionnel, 1 jour)
- [ ] **G2** : ILinkedinAdapter stub + Waalaxy integration
- [ ] Likes automatiques (70%) + comments (30%), max 3/semaine
- [ ] Blackout 22h-7h, anti-spam quotas

### Dépendances

```
Phase 0 (bug fixes) — BLOQUANTE
  ↓
Phase 1 (6a email) + Phase 2 (6c re-score) — parallélisables
  ↓
Phase 3 (schema + interactions) — dépend de 1+2
Phase 4 (dashboard + tests) — dépend de 3
  ↓
Phase 5 (LinkedIn) — indépendant mais dépend de 0
```
