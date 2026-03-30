# Agent 6 — NURTUREUR — Détails d'implémentation complets

**Complément à :** `06-AGENT-6-NURTUREUR.md`
**Comble les gaps identifiés par l'audit final + brainstorm du 27/03/2026**

---

## 1. INPUT CONTRACT COMPLET (spec NurturerInput)

Le DTO actuel (`StartNurtureDto`) est trop minimal. La spec définit un `NurturerInput` riche :

```typescript
interface NurturerInput {
  prospectId: string;
  reason: string;           // 'SCORED_WARM' | 'SCORED_COLD' | 'PAS_MAINTENANT' | 'RE_ENGAGEMENT'
  category: 'WARM' | 'COLD';
  routing?: {
    sequenceId: string;
    canal: string;
    slaHours: number;
    priority: number;
    delayMs: number;
  };
  // Champs spec manquants dans le code actuel :
  segment?: string;         // pme_metro, ecommerce, collectivite, startup, agence_wl
  scoringCategorie?: string;// WARM, COLD
  engagementScoreInitial?: number;
  sequenceType?: 'WARM_NURTURE' | 'COLD_NURTURE' | 'PAS_MAINTENANT_NURTURE';
}
```

### Délais initiaux par type (spec)

| Type séquence | Délai initial | Contenu |
|---------------|:------------:|---------|
| `WARM_NURTURE` | 7 jours | Éducatif, case studies |
| `COLD_NURTURE` | 21 jours | Awareness, tendances marché |
| `PAS_MAINTENANT_NURTURE` | 30-42 jours | Doux, permission-based |

---

## 2. SUB-AGENT 6a — EMAIL NURTURE BEHAVIORAL

### Séquence comportementale (branching)

```
Email envoyé
  ├── Ouvert + cliqué → ACCÉLÉRER
  │   delay: 3 jours
  │   contenu: upgrade (consideration → decision)
  │   engagement: +10 pts
  │
  ├── Ouvert, pas cliqué → CHANGER CTA
  │   delay: 5 jours
  │   contenu: même, CTA différent
  │   engagement: +2 pts
  │
  ├── Pas ouvert (1ère fois) → RETRY
  │   delay: 3 jours
  │   contenu: même, subject line différent
  │   engagement: +0 pts
  │
  ├── Pas ouvert (2ème fois) → PIVOT
  │   delay: 10 jours
  │   action: si LinkedIn dispo → Agent 6b, sinon pause 30j
  │   engagement: +0 pts
  │
  └── Pas ouvert (3ème fois) → SORTIE
      action: pause nurture, re-engagement dans 60j
```

### Ratio valeur/promo (spec)

```typescript
function getContentType(totalSent: number): 'valeur' | 'promo' {
  return (totalSent + 1) % 4 === 0 ? 'promo' : 'valeur';
  // 3 emails valeur, 1 email promo, 3 valeur, 1 promo...
}
```

### Journey stages

| Stage | Contenu | Durée |
|-------|---------|:-----:|
| **Awareness** | Tendances marché, guides génériques, statistiques secteur | Semaines 1-4 |
| **Consideration** | Case studies, comparatifs, ROI calculators | Semaines 5-8 |
| **Decision** | Démo, pricing, témoignages clients, essai gratuit | Semaines 9-12 |

### Claude prompt pour personnalisation nurture

```typescript
const NURTURE_SYSTEM_PROMPT = `Tu rédiges des emails de nurture B2B pour Axiom Marketing.
RÈGLES:
- Max 150 mots
- Ton éducatif, pas commercial
- Apporter de la VALEUR (pas vendre)
- Référencer le secteur du prospect
- CTA doux : question ou ressource gratuite
- Vouvoiement sauf segment startup
- JAMAIS mentionner que c'est un email automatisé`;

const NURTURE_USER_PROMPT = `
Prospect: ${sanitize(prospect.fullName)} — ${sanitize(prospect.jobTitle)} chez ${sanitize(prospect.companyName)}
Segment: ${segment}
Journey stage: ${journeyStage}
Content type: ${contentType} (valeur ou promo)
Emails précédents envoyés: ${emailsSent}
Signal original: ${originalSignal}

Sujet du contenu à partager: ${contentTitle}
Résumé du contenu: ${contentSummary}

Rédige un email nurture court et engageant.`;
```

---

## 3. SUB-AGENT 6c — RE-SCOREUR

### Engagement score tracking

| Action | Points | Source |
|--------|:------:|--------|
| Email ouvert | +2 | Mailgun webhook `opened` |
| Email cliqué | +5 | Mailgun webhook `clicked` |
| Contenu téléchargé | +8 | Tracking lien |
| Page pricing visitée | +10 | Analytics webhook |
| Réponse email | +15 | Agent 5 classification |
| Contact spontané | +25 | Formulaire site |
| Visite site | +3 | Analytics |

### Decay hebdomadaire (spec section 9.2)

```typescript
@Cron('0 3 * * 0') // Dimanche 03:00
async weeklyEngagementDecay(): Promise<void> {
  // Réduire de 5% tous les engagement scores > 0
  await this.prisma.$executeRaw`
    UPDATE nurture_prospects
    SET engagement_score_current = GREATEST(0, engagement_score_current * 0.95)
    WHERE status = 'active' AND engagement_score_current > 0
  `;
}
```

### Triggers de re-scoring

| Trigger | Fréquence | Condition |
|---------|-----------|-----------|
| **Périodique** | Mensuel | Tous les prospects en nurture active |
| **Bi-hebdomadaire** | 2x/mois | Prospects WARM uniquement |
| **Immédiat** | Temps réel | Page pricing visitée |
| **Immédiat** | Temps réel | Réponse email (any reply) |
| **Immédiat** | Temps réel | 3+ interactions en 7 jours |

### HOT handoff payload (spec ScoreurResubmission)

```typescript
// Quand score combiné ≥ 75, envoyer au scoreur-pipeline :
{
  prospectId: string,
  trigger: 'nurture_engagement',
  nurture_data: {
    engagementScoreInitial: number,
    engagementScoreCurrent: number,
    emailsSent: number,
    emailsOpened: number,
    emailsClicked: number,
    lastInteractionAt: Date,
    journeyStage: string,
    sequenceType: string,
    daysInNurture: number,
  },
}
```

---

## 4. PRISMA SCHEMA — Champs manquants (~25)

### NurtureProspect — champs à ajouter

```prisma
model NurtureProspect {
  // Existants (garder)
  id, createdAt, updatedAt, prospectId, entryReason, entryDate, status, reactivatedAt, exitReason, notes, tags

  // À AJOUTER :
  sequenceType          String?   // WARM_NURTURE | COLD_NURTURE | PAS_MAINTENANT_NURTURE
  currentStep           Int       @default(0)
  totalSteps            Int       @default(12)
  segment               String?   // pme_metro, ecommerce, etc.
  scoringCategorie      String?   // WARM, COLD
  journeyStage          String    @default("awareness") // awareness | consideration | decision

  engagementScoreInitial  Float   @default(0)
  engagementScoreCurrent  Float   @default(0)
  lastScoreUpdate         DateTime?

  emailsNurtureSent       Int     @default(0)
  emailsOpened            Int     @default(0)
  emailsClicked           Int     @default(0)
  repliesReceived         Int     @default(0)
  contentDownloaded       Int     @default(0)

  nextEmailScheduledAt    DateTime?
  nextRescoreAt           DateTime?
  lastInteractionAt       DateTime?
  lastEmailSentAt         DateTime?
  inactiveSince           DateTime?

  consentBasis            String   @default("legitimate_interest") // legitimate_interest | consent | pre_contractual
  optOutAt                DateTime?
  dataRetentionUntil      DateTime?
}
```

### NurtureInteraction — champs à ajouter

```prisma
model NurtureInteraction {
  // Existants (garder)
  id, createdAt, nurtureId, prospectId, interactionType, channel, contentTitle, contentUrl, opened, clicked, replied, replySentiment

  // À AJOUTER :
  scoreDelta    Float?    // +2, +5, +10, etc.
  scoreAfter    Float?    // Score après cette interaction
  details       Json?     // Métadonnées libres (url visitée, temps passé, etc.)
}
```

---

## 5. RE-ENGAGEMENT WORKFLOW (spec section 6)

Séquence de 3 emails avant sunset :

| Jour | Email | Objet | Action si pas de réponse |
|:----:|-------|-------|--------------------------|
| J+0 | Re-engagement #1 | "Ça fait un moment..." | Attendre 8j |
| J+8 | Contenu premium | Ressource exclusive (guide, webinar) | Attendre 7j |
| J+15 | Re-permission | "Souhaitez-vous continuer ?" (CTA Oui/Non) | Attendre 7j |
| J+22 | — | — | **Sunset automatique** + blacklist RGPD |

```typescript
async startReEngagementSequence(prospectId: string): Promise<void> {
  // Jour 0 : email re-engagement
  await this.sendNurtureEmail(prospectId, 're_engagement_1', 0);
  // Jour 8 : contenu premium
  await this.suiveurQueue.add('execute-nurture-step', { prospectId, step: 're_engagement_2' }, { delay: 8 * 86400000 });
  // Jour 15 : re-permission
  await this.suiveurQueue.add('execute-nurture-step', { prospectId, step: 're_permission' }, { delay: 15 * 86400000 });
  // Jour 22 : sunset auto si pas de réponse
  await this.suiveurQueue.add('sunset-prospect', { prospectId }, { delay: 22 * 86400000 });
}
```

---

## 6. SEQUENCE BRANCHING RULES (spec section 4.6)

7 conditions de branchement :

| Condition | Score | Action |
|-----------|:-----:|--------|
| `EMAIL_CLICKED_PRICING` | +20 | Immédiat → re-score → si ≥75 handoff HOT |
| `EMAIL_REPLIED_POSITIVE` | +25 | Pause nurture → Agent 5 prend le relais |
| `ENGAGEMENT_SCORE_HIGH` (≥75) | — | Handoff HOT via scoreur-pipeline |
| `MULTIPLE_CLICKS` (3+ en 7j) | +15 | Accélérer cadence (2x/semaine) |
| `NO_OPENS_3_CONSECUTIVE` | -5 | Pause, retry sujets différents, puis LinkedIn |
| `LOW_ENGAGEMENT` (score < 10 après 60j) | — | Sunset anticipé |
| `INACTIVE_180_DAYS` | — | RGPD sunset obligatoire |

---

## 7. RGPD — BASE LÉGALE PAR SOURCE

| Source prospect | Base légale | Durée max nurture | Action sunset |
|----------------|-------------|:-----------------:|---------------|
| Cold outreach (Agent 1) | Consentement (Art. 6(1)(a)) | 30 jours sans consentement | Re-permission email, sinon blacklist |
| WARM (Agent 3) | Intérêt légitime (Art. 6(1)(f)) | 90 jours | Re-permission email J+85, sunset J+90 |
| PAS_MAINTENANT (Agent 5) | Intérêt légitime + reply explicite | 180 jours | Re-permission J+175, sunset J+180 |
| Re-engagement | Intérêt légitime | 30 jours | Si pas de réaction J+22 → blacklist |

### Email de re-permission (obligatoire)

```
Subject: "Une dernière question avant de vous laisser tranquille"

Bonjour {prénom},

Ça fait maintenant {durée} qu'on vous partage des contenus sur {sujet}.
Avant de vous laisser tranquille :

[Oui, continuez] → Renouvelle 180j, met à jour consentBasis
[Non, arrêtez] → Exit immédiat + blacklist permanent

Si aucun clic dans 5 jours → exit automatique (interprétation la plus sûre RGPD).
```

---

## 8. EDGE CASES

| # | Scénario | Comportement attendu |
|---|---------|---------------------|
| E1 | Prospect répond à email nurture | Agent 5 (Suiveur) classifie → si INTERESSE, handoff HOT + pause nurture |
| E2 | Visite page pricing pendant nurture | Re-score immédiat → si ≥75, handoff HOT |
| E3 | HOT → COLD → nurture → engage → HOT | Cycle complet autorisé, re-scoring à chaque engagement |
| E4 | Double entrée nurture (Scoreur + Suiveur) | Upsert : si séquence active existe, fusionner les reasons |
| E5 | Entreprise fait faillite pendant nurture | Signal Agent 1 → exit immédiat + blacklist permanent |
| E6 | 3 emails non ouverts consécutifs | Pause → pivot LinkedIn (si dispo) → sinon re-engagement dans 60j |
| E7 | Prospect désabonné via Mailgun | Exit immédiat + blacklist RGPD + arrêt toutes séquences |
| E8 | Re-permission sans réponse 5j | Sunset automatique + blacklist |
| E9 | Nurture WARM atteint 90j sans engagement | Re-permission obligatoire (intérêt légitime expire) |

---

## 9. ENV VARS MANQUANTES

```env
# Ajouts pour sous-agents 6b et 6c :
WAALAXY_API_KEY=                              # LinkedIn passif (Phase 5)
NURTURE_EMAIL_DOMAIN=insights.axiom-marketing.fr  # Domaine dédié nurture
# Re-scoring business signals (mêmes APIs que Agent 1) :
# INDEED_API_KEY, DEALROOM_API_KEY, BUILTWITH_API_KEY → déjà dans Agent 1 env vars
```

---

## 10. ROADMAP MISE À JOUR

### Phase 0 — Fixes critiques (1.5 jours)
- [ ] B1-B5 : Status 'nurturing', boucle infinie, duplicate check, processNurtureStep, triggerReScore
- [ ] B7-B10 : updatedAt→lastInteractionAt, email count logic, Prisma fields, findByProspectId filter
- [ ] S1-S6 : Auth guard, RGPD checks, rate limiting, sunset→blacklist, event listeners
- [ ] Upsert logic dans startNurture (empêcher P2002)

### Phase 1 — 6a Email Nurture (2 jours)
- [ ] NurtureEmailService : Claude personnalisation + behavioral branching
- [ ] Content pool (JSON config initial, 10-15 contenus par segment)
- [ ] Journey stages progression (awareness → consideration → decision)
- [ ] Ratio 3:1 valeur/promo
- [ ] LCEN footer dans emails nurture
- [ ] Rate limiting (max 2/semaine, min 3j)
- [ ] Re-engagement workflow (3 emails + sunset)
- [ ] Re-permission email

### Phase 2 — 6c Re-Scoreur (1 jour)
- [ ] Engagement score tracking (opens +2, clicks +5, pricing +10)
- [ ] Decay hebdomadaire (-5%)
- [ ] Cron mensuel re-scoring
- [ ] Triggers immédiats (pricing, 3+ interactions)
- [ ] HOT handoff avec payload complet
- [ ] Branching rules (7 conditions)

### Phase 3 — Prisma schema + interactions (0.5 jour)
- [ ] Migration : ajouter ~25 champs à NurtureProspect
- [ ] Migration : ajouter scoreDelta, scoreAfter, details à NurtureInteraction
- [ ] Écrire NurtureInteraction records sur chaque action

### Phase 4 — Dashboard + tests (0.5 jour)
- [ ] Dashboard : prospects en nurture, engagement rates, journey stages, re-scores
- [ ] Tests : behavioral branching, re-scoring, RGPD sunset, re-permission, dedup

### Phase 5 — LinkedIn passif (optionnel, 1 jour)
- [ ] Waalaxy adapter (ILinkedinAdapter)
- [ ] Like 70% / comment 30%, max 3/semaine, blackout 22h-7h

### Dépendances

```
Phase 0 (fixes) — BLOQUANTE
  ↓
Phase 1 (6a email) + Phase 2 (6c re-score) — parallélisables
  ↓
Phase 3 (Prisma schema) — dépend de 1+2
Phase 4 (dashboard + tests) — dépend de 3
  ↓
Phase 5 (LinkedIn) — indépendant, dépend de 0
```
