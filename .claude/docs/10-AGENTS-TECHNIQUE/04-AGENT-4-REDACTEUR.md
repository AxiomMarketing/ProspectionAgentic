# Agent 4 — RÉDACTEUR — Documentation Technique d'Implémentation

**Source de vérité :** `.claude/source-ia/agent/AGENT-4-MASTER.md` + `AGENT-4a-EMAIL.md` + `AGENT-4b-LINKEDIN.md` + `AGENT-4c-IMPACT.md`

---

## Architecture

```
AGENT 4 — RÉDACTEUR MASTER
├── 4a Email (génération emails froids via Claude Sonnet)
├── 4b LinkedIn (notes de connexion + messages post-connexion)
└── 4c Impact (calcul déterministe d'impact financier)

Master = orchestre la génération, valide, persiste, dispatche au Suiveur
```

### Position dans le pipeline

```
Agent 3 SCOREUR                           Agent 5 SUIVEUR
  ├── HOT_A/B → email + linkedin ─┐         ↑
  ├── HOT_C → email seul ─────────┼──→ AGENT 4 ──→ suiveur-pipeline
  └── WARM/COLD → nurtureur       │     (génère le message)
                                   │
                             redacteur-pipeline
```

---

## Communication inter-agents

### INPUT : Ce que l'Agent 3 envoie (queue `redacteur-pipeline`)

```typescript
// Job name: 'generate-message'
{
  prospectId: string,
  channel: 'email' | 'linkedin',
  category: 'HOT_A' | 'HOT_B' | 'HOT_C',
  routing: {
    sequenceId: string,     // 'SEQ_HOT_A_PREMIUM', 'SEQ_HOT_B_PRIORITY', etc.
    canal: string,
    slaHours: number,       // 1h, 2h, 4h
    priority: number,       // 100, 75, 50
    delayMs: number,
  },
  breakdown: Record<string, number>,  // Score breakdown
  templateId?: string,                // Optionnel
}
```

### OUTPUT : Ce que l'Agent 4 envoie à l'Agent 5 (queue `suiveur-pipeline`)

```typescript
// Job name: 'message.generated'
{
  prospectId: string,
  messageId: string,    // GeneratedMessage.id
  channel: string,      // 'email' | 'linkedin'
}
```

### Modèles LLM utilisés

| Tâche | Modèle | Coût/1M tokens |
|-------|--------|:--------------:|
| `GENERATE_EMAIL` | claude-sonnet-4 | 3€ in / 15€ out |
| `GENERATE_LINKEDIN_MESSAGE` | claude-sonnet-4 | 3€ in / 15€ out |
| `PERSONALIZE_TEMPLATE` | claude-sonnet-4 | 3€ in / 15€ out |

---

## Sous-Agent 4a — Email (Génération via Claude)

### Flow complet

```
1. Fetch Prospect + latest Score (segment)
2. Select SEGMENT_CONTEXT par segment
3. Calculate impact financier (4c)
4. Build systemPrompt = EMAIL_SYSTEM_PROMPT + segmentContext
5. Build userPrompt = données prospect + impact + signaux
6. Call Claude Sonnet (maxTokens: 600, temp: 0.7)
7. Parse response (OBJET: / CORPS:)
8. Validate (50-125 mots, subject 36-50 chars, spam words)
9. Si invalide: retry 1x (temp: 0.5, contraintes rappelées)
10. Persist GeneratedMessage (isApproved: false)
11. Dispatch au Suiveur (message.generated)
```

### System Prompt (existant)

7 règles : structure, longueur 50-125 mots, texte brut, objet 36-50 chars, CTA doux, vouvoiement, référence au signal d'achat.

### Segment Contexts (existants)

5 contextes : `pme_metro`, `ecommerce`, `collectivite`, `startup`, `agence_wl`. Chacun définit les pain points, le ton et l'angle d'approche.

### Validation (existante)

- Longueur body : 50-125 mots
- Longueur subject : 36-50 caractères
- 12 spam words interdits (gratuit, offre, promo, etc.)

### Code existant : `redacteur.service.ts` (269 lignes), `prompt-templates.ts` (61 lignes), `message-validator.service.ts` (33 lignes)

---

## Sous-Agent 4b — LinkedIn

### 2 types de messages

| Type | Max caractères | Usage |
|------|:--------------:|-------|
| Note de connexion | 300 | Envoyée avec la demande de connexion |
| Message post-connexion | 500 | Envoyé après acceptation |

### Code existant : `generateLinkedinMessage()` dans `redacteur.service.ts` (lignes 173-226)

---

## Sous-Agent 4c — Impact Calculator

### 4 formules (spec) — 1 seule implémentée

| Formule | Segment | Input | Status |
|---------|---------|-------|:------:|
| `calculatePerformanceImpact` | pme_metro | Lighthouse score + CA | Implémenté |
| `calculateAttributionImpact` | startup/ecommerce | Ad spend tracking | Manquant |
| `calculateRGAAImpact` | collectivite | Accessibilité RGAA | Manquant |
| `calculateCartAbandonImpact` | ecommerce (Shopify) | Taux abandon panier | Manquant |

### Code existant : `impact-calculator.service.ts` (49 lignes, 10 tests)

---

## AUDIT — 20 bugs identifiés

### Bugs critiques (pipeline/données)

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B1** | LinkedIn messages **jamais persistés** ni dispatchés au Suiveur | `redacteur.service.ts:173-226` | LinkedIn = dead code |
| **B2** | LinkedIn fallback a un placeholder `{entreprise}` non substitué | `redacteur.service.ts:261` | Message cassé |
| **B3** | LinkedIn validation absente (pas de check 300/500 chars) | `redacteur.service.ts` | Messages trop longs |
| **B4** | `stepNumber` hardcodé à 1 → les steps 2-4 des séquences jamais trouvés | `prisma-generated-message.repository.ts:52` | Séquences multi-step cassées |
| **B5** | `category`/`routing`/`breakdown` du Scoreur = acceptés mais **jamais utilisés** | `redacteur.service.ts` | Pas de différenciation HOT_A/B/C |
| **B6** | Impact calculator = 1 formule sur 4 implémentée | `impact-calculator.service.ts` | Collectivités/startups = même pitch |
| **B7** | Signaux d'achat **pas injectés** dans le prompt LLM | `redacteur.service.ts:73-82` | Messages génériques, spec violée |
| **B8** | Few-shot examples absents du prompt | `redacteur.service.ts` | Qualité LLM dégradée |
| **B9** | `sequenceId` non propagé au Suiveur → fallback hardcodé `seq_hot_a_vip` | `redacteur.service.ts:143-147` | Mauvaise séquence sélectionnée |
| **B10** | `segment` lookup case mismatch : SEGMENT_CONTEXTS clés lowercase vs ProspectScore.segment = catégorie (HOT_A) | `redacteur.service.ts:56` | Toujours fallback pme_metro |

### Bugs sécurité / qualité

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **S1** | **Pas de sanitization** du output LLM avant stockage/envoi | `redacteur.service.ts` | XSS, HTML injection |
| **S2** | **Prompt injection** via champs prospect (companyName, jobTitle) non sanitisés | `redacteur.service.ts:73` | LLM manipulation |
| **S3** | **Pas de gate isApproved** dans le Suiveur → messages envoyés sans review | `suiveur.service.ts:54` | Contenu non validé envoyé |
| **S4** | **Pas d'auth guard** sur le controller Rédacteur | `redacteur.controller.ts` | N'importe qui peut trigger |
| **S5** | **Pas de check RGPD** avant génération (consentGiven, rgpdErasedAt, blacklist) | `redacteur.service.ts:40` | Violation RGPD |
| **S6** | `CostTrackerService` **in-memory only** → reset au restart | `cost-tracker.service.ts` | Budget non enforced |
| **S7** | `messageId` FK cassée dans Suiveur (random UUID au lieu de GeneratedMessage.id) | `suiveur.service.ts:62` | Jointure email_sends/generated_messages cassée |
| **S8** | `provider: 'unknown'` hardcodé dans MessageSend | `prisma-message-send.repository.ts:55` | Pas de tracking provider |
| **S9** | `personalizationData` JSON jamais écrit | `prisma-generated-message.repository.ts` | Pas d'audit trail |
| **S10** | `langfuseTraceId` jamais écrit | `redacteur.service.ts` | Pas de LLM tracing |

### Gaps spec vs code

| # | Manquant | Impact |
|---|---------|--------|
| G1 | **Template engine** (MessageTemplate) non câblé | Pas de templates réutilisables |
| G2 | **Multi-step sequence** generation absente | Seulement step 1, jamais follow-ups |
| G3 | **Approval workflow** modélisé mais non implémenté | isApproved = cosmétique |
| G4 | **Dashboard Rédacteur** absent | Pas de métriques LLM visibles |
| G5 | **llmCostEur = 0** hardcodé dans dashboard | Coûts non affichés |
| G6 | **Few-shot examples** absents des prompts | Qualité messages dégradée |
| G7 | **JSON output format** (spec) vs texte brut (code) | Parsing fragile (regex) |

---

## Variables d'environnement

```env
# ══════════════════════════════════════════════
#          AGENT 4 — RÉDACTEUR
# ══════════════════════════════════════════════
# Utilise ANTHROPIC_API_KEY du socle commun
# Modèle : Claude Sonnet 4 (via MODEL_ROUTING dans llm.types.ts)
REDACTEUR_ENABLED=true
REDACTEUR_MAX_TOKENS=600                      # Max tokens par génération
REDACTEUR_TEMPERATURE=0.7                     # Température par défaut
REDACTEUR_RETRY_TEMPERATURE=0.5               # Température pour retry après validation fail
REDACTEUR_REQUIRE_APPROVAL=false              # true → messages attendent approbation avant envoi
LLM_DAILY_BUDGET_EUR=25                       # Budget quotidien (déjà dans socle)
LLM_MONTHLY_BUDGET_EUR=500                    # Budget mensuel (déjà dans socle)
```

---

## Roadmap d'Implémentation

### Phase 0 — Fix bugs critiques (1.5 jours)
- [ ] **B1** : Persister LinkedIn messages en DB + dispatch au Suiveur
- [ ] **B2** : Fix fallback LinkedIn placeholder substitution
- [ ] **B3** : Ajouter validation LinkedIn (300 chars connexion, 500 chars post-connexion)
- [ ] **B4** : Accepter stepNumber dans GeneratedMessage, le propager depuis la séquence
- [ ] **B5** : Utiliser `category` pour adapter le prompt (ton plus urgent pour HOT_A)
- [ ] **B7** : Injecter les signaux d'achat dans le user prompt (enrichmentData.signals)
- [ ] **B9** : Propager sequenceId au Suiveur dans le job data
- [ ] **B10** : Fix segment lookup (lire enrichmentData.segment, pas ProspectScore.segment)
- [ ] **S1** : Sanitizer le output LLM (strip HTML/script, texte brut forcé)
- [ ] **S2** : Sanitizer les champs prospect avant injection dans le prompt
- [ ] **S4** : Ajouter @UseGuards(JwtAuthGuard) sur le controller
- [ ] **S5** : Check RGPD (consentGiven, rgpdErasedAt, blacklist) avant génération
- [ ] **S7** : Fix messageId FK dans Suiveur (utiliser GeneratedMessage.id)

### Phase 1 — Impact Calculator complet (0.5 jour)
- [ ] **B6** : Implémenter `calculateAttributionImpact()` (startups/ecommerce)
- [ ] **B6** : Implémenter `calculateRGAAImpact()` (collectivités)
- [ ] **B6** : Implémenter `calculateCartAbandonImpact()` (Shopify)
- [ ] Router vers la bonne formule selon le segment

### Phase 2 — Prompts enrichis (1 jour)
- [ ] **B7** : Injecter signaux dans le prompt (type, date, detail)
- [ ] **B8** : Ajouter 2 few-shot examples par segment
- [ ] **G7** : Migrer vers output JSON structuré (subject_line, body, cta, word_count)
- [ ] Adapter parsing pour JSON au lieu de regex OBJET/CORPS
- [ ] Ajouter données techniques dans le prompt (CMS, Lighthouse, axe-core)

### Phase 3 — LinkedIn complet (0.5 jour)
- [ ] Persister messages LinkedIn en DB (table generated_messages, channel='linkedin')
- [ ] Créer LinkedinAction dans le Suiveur (pas juste EmailSend)
- [ ] Route processor vers generateLinkedinMessage() quand channel='linkedin'
- [ ] Validation chars (300 connexion, 500 post-connexion)

### Phase 4 — Multi-step sequences (1 jour)
- [ ] **B4** : Générer messages pour steps 2-4 (follow-ups)
- [ ] Accepter `stepNumber` dans le DTO
- [ ] Templates de relance différents par step (rappel, valeur ajoutée, dernier essai)
- [ ] Timer entre steps configurable

### Phase 5 — Approval workflow (0.5 jour)
- [ ] **G3** : Endpoint POST `/agents/redacteur/messages/:id/approve`
- [ ] Gate dans Suiveur : check `isApproved === true` avant envoi
- [ ] Feature flag `REDACTEUR_REQUIRE_APPROVAL` pour activer/désactiver
- [ ] Dashboard : liste des messages en attente d'approbation

### Phase 6 — Sécurité + monitoring (0.5 jour)
- [ ] **S6** : Persister coûts LLM dans MetriquesDaily ou Redis
- [ ] **S9** : Écrire personalizationData JSON (quels champs utilisés)
- [ ] **S10** : Capturer langfuseTraceId depuis le LLM call
- [ ] **G4** : Dashboard Rédacteur (messages générés/jour, coûts LLM, taux validation, temps moyen)
- [ ] **G5** : Fix llmCostEur dans dashboard (lire depuis DB)

### Phase 7 — Tests (0.5 jour)
- [ ] Tests prompt injection sanitization
- [ ] Tests LinkedIn persistence + validation
- [ ] Tests multi-step generation
- [ ] Tests approval gate
- [ ] Tests impact calculator (4 formules)
- [ ] Tests RGPD check before generation

### Dépendances entre phases

```
Phase 0 (bug fixes) — BLOQUANTE
  ↓
Phase 1 (impact) + Phase 2 (prompts) + Phase 3 (LinkedIn) — parallélisables
  ↓
Phase 4 (multi-step) — dépend de 0
Phase 5 (approval) — dépend de 0
  ↓
Phase 6 (monitoring) + Phase 7 (tests) — dépendent de tout
```
