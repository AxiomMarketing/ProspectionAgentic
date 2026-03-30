# Agent 5 — SUIVEUR — Documentation Technique d'Implémentation

**Source de vérité :** `.claude/source-ia/agent/AGENT-5-MASTER.md` + `AGENT-5a-EMAIL.md` + `AGENT-5b-LINKEDIN.md` + `AGENT-5c-REPONSES.md` + `AGENT-5d-SEQUENCES.md`

---

## Architecture

```
AGENT 5 — SUIVEUR MASTER
├── 5a Email (envoi Gmail/Mailgun, throttle, domain rotation)
├── 5b LinkedIn (via Waalaxy, connexion + message + InMail)
├── 5c Réponses (détection Gmail Watch, matching, classification LLM)
└── 5d Séquences (widening-gap scheduling, timezone, business hours)

Master = orchestre l'envoi, détecte les réponses, classifie, route les actions
```

### Position dans le pipeline

```
Agent 4 RÉDACTEUR                        Agents aval
  ↓                                      ├── INTERESSE → Agent 8 Dealmaker / Notification Jonathan
  suiveur-pipeline ──→ AGENT 5 ──────────├── INTERESSE_SOFT → Pause séquence + suivi
  (message.generated)    │                ├── PAS_MAINTENANT → Agent 6 Nurtureur (30j)
                         │                ├── PAS_INTERESSE → Suppression séquence
                         │                ├── MAUVAISE_PERSONNE → Re-enrichir (Agent 2)
                         ├── Envoi email  ├── DEMANDE_INFO → Pause + répondre
                         ├── Envoi LinkedIn├── OUT_OF_OFFICE → Pause + reprendre à retour
                         └── Détection    └── SPAM → Archiver
                            réponses
```

---

## Communication inter-agents

### INPUT : Ce que l'Agent 4 envoie (queue `suiveur-pipeline`)

```typescript
// Job name: 'message.generated'
{
  prospectId: string,
  messageId: string,      // GeneratedMessage.id (FK valide)
  channel: 'email' | 'linkedin',
  sequenceId?: string,    // 'SEQ_HOT_A_PREMIUM' etc. (peut être undefined)
  category?: string,      // 'HOT_A', 'HOT_B', etc.
}
```

### OUTPUT : Actions émises après classification réponse

| Catégorie | Action | Séquence | Destination |
|-----------|--------|----------|-------------|
| `INTERESSE` | Notifier Jonathan (urgent) | Stop | Agent 8 Dealmaker |
| `INTERESSE_SOFT` | Pause séquence, suivi | Pause | — |
| `PAS_MAINTENANT` | Reschedule 30 jours | Stop | Agent 6 Nurtureur |
| `PAS_INTERESSE` | Supprimer de la séquence | Stop | — |
| `MAUVAISE_PERSONNE` | Re-enrichir le contact | Stop | Agent 2 Enrichisseur |
| `DEMANDE_INFO` | Pause, préparer réponse | Pause | — |
| `OUT_OF_OFFICE` | Pause, reprendre à retour | Pause | — |
| `SPAM` | Archiver | — | — |

### Crons (scheduler)

| Cron | Action | Fichier |
|------|--------|---------|
| `*/5 * * * *` | Polling réponses email | `agent-scheduler.service.ts` |
| `0 9 * * 1-5` | (affiché dans dashboard mais incorrect — réel = */5) | — |

---

## Sous-Agent 5a — Email (Envoi)

### Code existant : `gmail.adapter.ts` (module email/)

| Méthode | Rôle | Status |
|---------|------|:------:|
| `sendEmail()` | Envoi via Gmail API (OAuth2, raw MIME) | Implémenté |
| `getUnreadReplies()` | Polling Gmail inbox | Implémenté mais JAMAIS appelé |
| `markAsRead()` | Marquer comme lu | Implémenté |
| `isAvailable()` | Health check | Implémenté |

### 5 séquences prédéfinies

| ID | Délais (jours) | Steps | Usage |
|----|--------------:|:-----:|-------|
| `seq_hot_a_vip` | [0, 2, 5, 10] | 4 | HOT_A |
| `seq_hot_b_standard` | [0, 2, 5, 10] | 4 | HOT_B |
| `seq_hot_c_nurture` | [0, 3, 7, 14] | 4 | HOT_C |
| `seq_warm_nurture` | [0, 3, 7, 14, 21] | 5 | WARM |
| `seq_cold_newsletter` | [0, 3, 7, 14, 21, 30, 45] | 7 | COLD |

---

## Sous-Agent 5c — Réponses (Classification LLM)

### 8 catégories de classification

Classification via Claude Haiku (temperature 0.1, max 500 tokens).

| Catégorie | Description | Action |
|-----------|-------------|--------|
| `INTERESSE` | Veut un RDV, intéressé explicitement | Stop séquence, notifier Jonathan |
| `INTERESSE_SOFT` | Curieux mais pas engagé | Pause séquence |
| `PAS_MAINTENANT` | Pas le moment mais ouvert plus tard | Stop, reschedule 30j |
| `PAS_INTERESSE` | Refus clair | Stop, supprimer |
| `MAUVAISE_PERSONNE` | Pas le bon interlocuteur | Stop, re-enrichir contact |
| `DEMANDE_INFO` | Demande de précisions | Pause, préparer réponse |
| `OUT_OF_OFFICE` | Absent, date de retour | Pause, reprendre au retour |
| `SPAM` | Auto-reply, notification système | Archiver |

### Code existant : `response-classifier.service.ts` (125 lignes, testé)

---

## AUDIT — 23 bugs identifiés

### Bugs CRITICAL (pipeline complètement cassé)

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B1** | `detectResponses()` **ne fait rien** — n'appelle jamais `emailAdapter.getUnreadReplies()` | `suiveur.service.ts:157-178` | **Détection réponses non fonctionnelle** |
| **B2** | `scheduleNextStep()` **n'enqueue jamais** de BullMQ job → séquences ne progressent jamais | `suiveur.service.ts:180-219` | **Multi-step cassé** |
| **B3** | `ProspectSequence.currentStep` **jamais incrémenté** → toujours step 0 | `suiveur.service.ts` | **Séquences bloquées** |
| **B4** | **Aucun @OnEvent() listener** pour les 7 events reply → actions post-classification perdues | `action-handler.service.ts` | **Pipeline aval mort** |

### Bugs HIGH

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B5** | LinkedIn `channel` ignoré — tout passe par email malgré `channel='linkedin'` | `suiveur.service.ts:55` | LinkedIn non fonctionnel |
| **B6** | Gmail envoie en `text/html` — spec exige `text/plain` pour cold emails | `gmail.adapter.ts` | Deliverability dégradée |
| **B7** | Pas de headers X-Axiom tracking (6 headers spec) → matching réponses impossible | `gmail.adapter.ts` | Reply matching cassé |
| **B8** | `fromEmail` hardcodé `noreply@axiom-marketing.fr` → mismatch avec compte Gmail | `suiveur.service.ts:59` | SPF/DKIM fail |
| **B9** | `provider: 'unknown'` hardcodé → pas de tracking ESP | `prisma-message-send.repository.ts:55` | Data quality |
| **B10** | `providerMessageId` (Gmail message ID) jamais stocké | `suiveur.service.ts` | Tracking impossible |
| **B11** | `ReplyClassification` record jamais créé en DB | `suiveur.service.ts:processReply` | Pas d'audit trail |
| **B12** | Séquence auto-créée toujours `seq_hot_a_vip` quel que soit le segment | `suiveur.processor.ts:84-95` | Mauvaise séquence |

### Bugs sécurité

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **S1** | Pas de `@UseGuards(JwtAuthGuard)` sur controller | `suiveur.controller.ts` | N'importe qui peut trigger |
| **S2** | Pas de check blacklist/RGPD avant envoi email | `suiveur.service.ts` | Violation RGPD |
| **S3** | Pas de rate limiting envoi email (Gmail 500/jour) | `suiveur.service.ts` | Ban Gmail |
| **S4** | LLM injection via `replyBody` dans classification | `response-classifier.service.ts:70` | Manipulation classification |
| **S5** | Pas de LCEN footer dans les emails envoyés | `suiveur.service.ts` | 750€/email amende |
| **S6** | PII prospect envoyée au LLM sans consentement documenté | `response-classifier.service.ts` | Violation RGPD |
| **S7** | `isApproved` gate non vérifiée avant envoi | `suiveur.service.ts:54-81` | Messages non validés envoyés |

### Gaps spec vs code

| # | Manquant | Impact |
|---|---------|--------|
| G1 | **Bounce handling** — BounceEvent jamais créé, pas de blacklist auto | Hard bounces ignorés |
| G2 | **Webhook Mailgun** — pas d'endpoint pour bounces/unsubscribes | Événements perdus |
| G3 | **LinkedIn execution** — pas d'adapter Waalaxy, LinkedinAction jamais créé | Canal mort |
| G4 | **Domain rotation** — spec requiert 3 domaines avec throttle 50/jour/domaine | Deliverability risquée |
| G5 | **Gmail Watch/PubSub** — spec requiert push notifications, code fait du polling stub | Réponses non détectées |
| G6 | **Timezone awareness** — `isBusinessHours()` utilise l'heure serveur, pas celle du prospect | Emails envoyés la nuit |
| G7 | **Dashboard Suiveur** — pas de métriques spécifiques (delivery rate, reply rate, bounce rate) | Pas de visibilité |

---

## Variables d'environnement

```env
# ══════════════════════════════════════════════
#          AGENT 5 — SUIVEUR
# ══════════════════════════════════════════════
SUIVEUR_ENABLED=true
SUIVEUR_MAX_EMAILS_PER_DAY=100             # Limite quotidienne envois (Gmail safe: 100)
SUIVEUR_MIN_HOURS_BETWEEN_STEPS=48          # Minimum entre 2 steps même prospect
SUIVEUR_BUSINESS_HOURS_START=8              # Heure début envoi
SUIVEUR_BUSINESS_HOURS_END=18               # Heure fin envoi
SUIVEUR_DEFAULT_TIMEZONE=Europe/Paris       # Timezone par défaut prospects

# Gmail → déjà déclaré dans socle (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, etc.)
# LCEN → déjà déclaré (AXIOM_SIRET, AXIOM_ADDRESS, UNSUBSCRIBE_BASE_URL)
```

---

## Roadmap d'Implémentation

### Phase 0 — Fix bugs critiques pipeline (2 jours)
- [ ] **B1** : Implémenter `detectResponses()` : appeler `emailAdapter.getUnreadReplies()`, matcher avec EmailSend, créer jobs `process-reply`
- [ ] **B2** : `scheduleNextStep()` → ajouter `this.suiveurQueue.add('execute-step', data, { delay: delayMs })`
- [ ] **B3** : Incrémenter `ProspectSequence.currentStep` après envoi réussi
- [ ] **B4** : Créer `@OnEvent()` listeners pour les 7 events reply (dans un EventListenerService dédié)
- [ ] **B5** : Router `channel='linkedin'` vers un handler spécifique (stub pour l'instant)
- [ ] **B8** : Lire `fromEmail` depuis env `GMAIL_USER` au lieu de hardcoder
- [ ] **B10** : Stocker `providerMessageId` retourné par Gmail
- [ ] **B11** : Créer `ReplyClassification` record dans `processReply()`
- [ ] **B12** : Utiliser `category` du job pour sélectionner la bonne séquence
- [ ] **S1** : Auth guard sur controller
- [ ] **S2** : Check blacklist/RGPD/unsubscribed avant envoi
- [ ] **S5** : Injecter LCEN footer (SIRET + désinscription) dans le body avant envoi
- [ ] **S7** : Gate `isApproved` si `REDACTEUR_REQUIRE_APPROVAL=true`

### Phase 1 — Email deliverability (1 jour)
- [ ] **B6** : Passer en `text/plain` pour cold emails
- [ ] **B7** : Ajouter 6 headers X-Axiom tracking dans `buildRawEmail()`
- [ ] **B9** : Écrire `provider: 'gmail'` dans EmailSend
- [ ] **S3** : Rate limiting email (max 100/jour configurable)
- [ ] **G4** : Domain rotation (3 domaines, 50/jour/domaine)

### Phase 2 — Reply detection complète (1.5 jours)
- [ ] **B1** complet : `detectResponses()` appelle `getUnreadReplies()`, matche via X-Axiom headers ou sujet, crée `process-reply` jobs
- [ ] **G2** : Endpoint webhook Mailgun `/api/webhooks/mailgun` pour bounces, unsubscribes, complaints
- [ ] **G1** : Bounce handling — créer BounceEvent, blacklister prospect sur hard bounce
- [ ] **S4** : Sanitiser `replyBody` avant injection dans prompt LLM

### Phase 3 — Séquences complètes (1 jour)
- [ ] **B2+B3** complets : scheduling BullMQ delayed + currentStep increment + nextStepAt update
- [ ] **G6** : Timezone awareness (prospect timezone depuis enrichmentData ou code postal)
- [ ] Conditions de sortie : si reply → stop, si bounce → stop, si unsubscribe → stop
- [ ] Séquence `status = 'completed'` quand dernière étape envoyée

### Phase 4 — Dashboard + monitoring (0.5 jour)
- [ ] **G7** : `DashboardService.getSuiveurMetrics()` — emails envoyés, delivery rate, reply rate, bounce rate, séquences actives/complétées
- [ ] Dashboard tab Suiveur : métriques + séquences progression
- [ ] Fix cron display (*/5 au lieu de 0 9)

### Phase 5 — LinkedIn (1 jour, optionnel)
- [ ] **G3** : Stub LinkedIn adapter (ILinkedinAdapter)
- [ ] Créer LinkedinAction records
- [ ] Router vers LinkedIn quand channel='linkedin'
- [ ] Intégrer Waalaxy API (si disponible)

### Phase 6 — Tests (0.5 jour)
- [ ] Tests detectResponses() avec mock emailAdapter
- [ ] Tests scheduleNextStep() → BullMQ job created
- [ ] Tests currentStep increment
- [ ] Tests event listeners (7 categories)
- [ ] Tests RGPD/blacklist gate
- [ ] Tests LCEN footer injection
- [ ] Tests rate limiting

### Dépendances

```
Phase 0 (fixes critiques) — BLOQUANTE
  ↓
Phase 1 (deliverability) + Phase 2 (reply detection) — parallélisables
  ↓
Phase 3 (séquences) — dépend de 0
Phase 4 (dashboard) — dépend de 0+1
  ↓
Phase 5 (LinkedIn) — indépendant mais dépend de 0
Phase 6 (tests) — dépend de tout
```
