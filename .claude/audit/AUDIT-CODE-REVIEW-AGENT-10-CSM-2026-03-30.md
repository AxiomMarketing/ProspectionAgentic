# Audit Code Review — Agent 10 CSM

**Date :** 30 mars 2026
**Commit :** `fceb529e8b89c439ef58306e0aafaa47ac10fe16`
**Scope :** Implémentation complète Agent 10 CSM (5 sous-agents, 79 tests, 12 tables Prisma)
**Méthode :** 4 agents review parallèles (2 CLAUDE.md compliance Sonnet, 2 bug scan Opus) + 6 agents validation
**Commentaire GitHub :** [commitcomment-180937980](https://github.com/AxiomMarketing/ProspectionAgentic/commit/fceb529e8b89c439ef58306e0aafaa47ac10fe16#commitcomment-180937980)

---

## Résumé

**6 issues validées** sur ~310 fichiers changés (+58 974 lignes).

| Sévérité | Count |
|---|:---:|
| BLOCKING | 2 |
| CRITICAL | 3 |
| HIGH | 1 |
| **Total** | **6** |

---

## Issues BLOCKING (2)

### B1 — `EmailModule` non importé dans `AgentCsmModule`

**Fichier :** `src/modules/agent-csm/agent-csm.module.ts`
**Impact :** Crash DI au démarrage — NestJS ne peut pas résoudre `IEmailAdapter` pour `OnboardingService`
**Détection :** Agent CLAUDE.md compliance #1

**Constat :**
- `OnboardingService` injecte `IEmailAdapter` via constructeur (ligne 86)
- `AgentCsmModule.imports` ne contient que des `BullModule.registerQueue()`
- `EmailModule` n'est pas `@Global()` — importé dans `AppModule` mais pas propagé aux modules enfants
- Ni `CommonModule` ni `SharedModule` n'exportent `IEmailAdapter`

**Fix :**
```typescript
// agent-csm.module.ts
import { EmailModule } from '@modules/email/email.module';

@Module({
  imports: [
    EmailModule, // ← AJOUTER
    BullModule.registerQueue({ name: QUEUE_NAMES.CSM_ONBOARDING }),
    // ...
  ],
})
```

**Règle CLAUDE.md violée :** "Adapter Pattern pour toutes les APIs externes (ILlmAdapter, IEmailAdapter, IMarketDataAdapter)" — l'adapter doit être importable via son module provider.

---

### B2 — `csm.config.ts` non enregistré dans `AppModule`

**Fichier :** `src/app.module.ts` (ligne 61)
**Impact :** Tous les `configService.get('csm.*')` retournent `undefined` — les 30+ variables de config CSM sont mortes
**Détection :** Agent CLAUDE.md compliance #1

**Constat :**
- `src/core/config/csm.config.ts` utilise `registerAs('csm', () => ({ ... }))` correctement
- `AppModule.ConfigModule.forRoot({ load: [...] })` contient 6 configs mais PAS `csmConfig`
- `SatisfactionService` appelle `configService.get('csm.churnSilenceDays')` → retourne `undefined` → fallback au default hardcodé
- Tous les seuils Health Score, timing NPS, paramètres upsell/referral/review sont silencieusement ignorés

**Fix :**
```typescript
// app.module.ts
import csmConfig from '@core/config/csm.config';

ConfigModule.forRoot({
  load: [appConfig, databaseConfig, redisConfig, llmConfig, jwtConfig, enrichmentConfig, csmConfig], // ← AJOUTER
})
```

---

## Issues CRITICAL (3)

### C1 — Processor silently drops 5 implemented actions

**Fichier :** `src/modules/agent-csm/infrastructure/jobs/csm.processor.ts` (lignes 86-97)
**Impact :** Les jobs BullMQ pour evaluate-upsell, request-review, invite-to-referral, check-onboarding-risks, check-churn-signals sont acceptés par le Zod schema mais ne font RIEN. Ils complètent sans erreur (pas de retry).
**Détection :** Agents bug scan #3 et #4

**Constat :**
Le `switch(data.action)` ne wire que 3 actions sur 9 :
- `onboard-customer` → `csmService.onboardCustomer()` ✓
- `calculate-health` → `csmService.calculateHealthScore()` ✓
- `daily-health-snapshot` → `csmService.dailyHealthSnapshot()` ✓
- **5 autres → log "deferred" et return void** ✗

Pourtant `CsmService` a des méthodes fonctionnelles pour les 5 :

| Action déférée | Méthode CsmService | Ligne |
|---|---|:---:|
| `evaluate-upsell` | `evaluateUpsell(customerId)` | 94 |
| `request-review` | `requestReviews(customerId, npsScore)` | 98 |
| `invite-to-referral` | `inviteToReferral(customerId)` | 102 |
| `check-onboarding-risks` | `checkOnboardingRisks()` | 110 |
| `check-churn-signals` | `detectChurnSignals(customerId)` | 155 |

**Fix :**
```typescript
case 'evaluate-upsell':
  await this.csmService.evaluateUpsell(data.customerId);
  break;
case 'request-review':
  await this.csmService.requestReviews(data.customerId, data.npsScore);
  break;
case 'invite-to-referral':
  await this.csmService.inviteToReferral(data.customerId);
  break;
case 'check-onboarding-risks':
  await this.csmService.checkOnboardingRisks();
  break;
case 'check-churn-signals':
  await this.csmService.detectChurnSignals(data.customerId);
  break;
```

---

### C2 — `existing_deal_id` set to `customerId`

**Fichier :** `src/modules/agent-csm/application/services/upsell.service.ts` (ligne 368)
**Impact :** Agent 8 Dealmaker reçoit un customer UUID là où il attend un deal UUID — lookup failures ou corruption de données
**Détection :** Agent bug scan #3

**Constat :**
```typescript
// ACTUEL (bug) :
existing_deal_id: opportunity.customerId,  // ← customer UUID !

// CORRECT :
existing_deal_id: opportunity.dealId,      // ← deal UUID (champ existant sur UpsellOpportunity)
```

Le modèle Prisma `UpsellOpportunity` a un champ `dealId String?` dédié à cet usage. De plus, `client_id` à la ligne 367 est déjà correctement set à `customerId`, rendant la ligne 368 un doublon erroné.

**Fix :**
```typescript
existing_deal_id: opportunity.dealId ?? '',
```

---

### C3 — Race condition health score supercede (pas de transaction)

**Fichier :** `src/modules/agent-csm/application/services/satisfaction.service.ts` (lignes 55-70)
**Impact :** Deux appels concurrents `calculateHealthScore` pour le même client créent 2 records `isLatest: true`, corrompant toutes les requêtes downstream
**Détection :** Agent bug scan #4

**Constat :**
Le pattern read-supercede-insert est en 3 opérations Prisma séparées sans transaction :
1. `findLatestByCustomerId(customerId)` — lit le record `isLatest: true`
2. `save(existing.supercede())` — met `isLatest: false`
3. `save(score)` — insère nouveau `isLatest: true`

`checkAllCustomersHealth()` (ligne 182-191) lance `Promise.all` sur des batches de 50 clients. Si un `calculateHealthScore` manuel (via controller) coïncide avec le batch cron, le même customer peut être traité 2× en même temps.

Il n'y a pas non plus d'index unique partiel `(customerId, isLatest) WHERE isLatest = true` dans le schema Prisma.

**Fix :**
```typescript
// Wrapper dans une transaction Prisma
await this.prisma.$transaction(async (tx) => {
  await tx.customerHealthScore.updateMany({
    where: { customerId, isLatest: true },
    data: { isLatest: false },
  });
  await tx.customerHealthScore.create({
    data: { ...score.toPlainObject(), signals: score.signals as any },
  });
});
```

---

## Issue HIGH (1)

### H1 — `submitReferral` endpoint sans auth ni validation

**Fichier :** `src/modules/agent-csm/presentation/controllers/csm.controller.ts` (lignes 156-170)
**Impact :** Tout utilisateur authentifié (y compris viewer) peut soumettre des referrals générant des obligations financières (commissions). Body non validé → injection possible.
**Détection :** Agents CLAUDE.md compliance #2 et bug scan #4

**Constat :**
- Seul endpoint du controller sans `@Roles()` — les 20 autres en ont
- `@Body()` sans `ZodValidationPipe` — TypeScript interface inline, pas de validation runtime
- L'email du lead n'est pas validé (format), les champs texte n'ont pas de max length
- Le body passe directement à `referralService.submitReferral()` puis à la DB et au dispatch Agent 1

**Fix :**
```typescript
// Option 1 : Endpoint authentifié (ambassadeurs connectés)
@Post('referral/submit/:code')
@Roles('admin', 'manager')
async submitReferral(
  @Param('code') code: string,
  @Body(new ZodValidationPipe(ReferralSubmitSchema)) body: ReferralSubmitDto,
) { ... }

// Option 2 : Endpoint public (formulaire externe) — nécessite rate limiting
@Post('referral/submit/:code')
@Public()
@Throttle({ default: { limit: 5, ttl: 60000 } })
async submitReferral(
  @Param('code') code: string,
  @Body(new ZodValidationPipe(ReferralSubmitSchema)) body: ReferralSubmitDto,
) { ... }
```

**Règle CLAUDE.md violée :** "Guards (JWT, ApiKey, Roles)" + "ZodValidationPipe"

---

## Issues additionnelles identifiées (non bloquantes, pour référence)

| # | Sévérité | Issue | Fichier |
|---|:---:|---|---|
| A1 | MEDIUM | `CsmService` bypass `ICustomerRepository` pour 13 méthodes read-only (Prisma direct) | `csm.service.ts:81-239` |
| A2 | MEDIUM | `PATCH /customers/:id` accepte `@Body() body: any` sans validation Zod | `csm.controller.ts:56` |
| A3 | MEDIUM | Commission tiers hardcodés dans `referral.service.ts` dupliquent `csm.config.ts` | `referral.service.ts:18-28` |
| A4 | MEDIUM | `deal-to-csm.dto.ts` valide `siret` à 9 chars (= SIREN) mais le champ s'appelle `siret` (14 chars) | `deal-to-csm.dto.ts` |
| A5 | LOW | `UpsellService.calculateUpsellScore` fait 13 requêtes Prisma séquentielles (N+1 variant) | `upsell.service.ts:175-289` |
| A6 | LOW | `checkAllCustomersHealth` commente "5 concurrent" mais exécute 50 via `Promise.all` | `satisfaction.service.ts:182-191` |

---

## Métriques de l'audit

| Métrique | Valeur |
|---|:---:|
| Fichiers reviewés | ~30 (CSM + shared + config + scheduler) |
| Agents de review lancés | 4 (2 Sonnet CLAUDE.md + 2 Opus bugs) |
| Agents de validation lancés | 6 (5 Opus + 1 Sonnet) |
| Issues trouvées (pre-validation) | ~15 |
| Issues validées (post-validation) | **6** |
| Faux positifs filtrés | ~9 |
| Temps total | ~5 min |

---

## Prochaines étapes

1. **Fix les 2 BLOCKING** en priorité absolue (EmailModule + csmConfig) — le module ne démarre pas sans
2. **Fix les 3 CRITICAL** — processor wiring, dealId bug, transaction
3. **Fix le HIGH** — submitReferral auth + validation
4. Commit + push les fixes
5. Re-run les tests pour confirmer (79 tests doivent toujours passer)
