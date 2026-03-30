# Agent 8 — DEALMAKER — Documentation Technique d'Implémentation

**Source de vérité :** `.claude/source-ia/agent/AGENT-8-MASTER.md` + `AGENT-8a-DEVIS.md` + `AGENT-8b-RELANCES.md` + `AGENT-8c-SIGNATURE.md`

---

## Architecture

```
AGENT 8 — DEALMAKER MASTER
├── 8a Générateur de Devis (Claude API scope + Puppeteer PDF + tiering Bronze/Silver/Gold)
├── 8b Relanceur de Deals (séquences J3/J7/J14/breakup + scoring engagement + objections)
└── 8c Gestionnaire de Signature (Yousign API V3 + contrat PDF + onboarding trigger)

Master = gère le pipeline CRM 7 étapes (Qualification → Devis → Considération → Négociation → Signature → Gagné/Perdu)
```

### Position dans le pipeline

```
Agent 5 SUIVEUR
    │ [Prospect répond "INTÉRESSÉ"]
    │ [Jonathan fait le RDV découverte]
    │ [Jonathan saisit notes via Slack/CRM]
    ▼
═══════════════════════════════
║  AGENT 8 (DEALMAKER)        ║
║  Queue: dealmaker-pipeline  ║
║  8a → Devis personnalisé    ║
║  8b → Relances + objections ║
║  8c → Signature Yousign     ║
═══════════════════════════════
    │
    ├── Deal GAGNÉ → Agent 10 (CSM) via csm-onboarding queue
    ├── Deal PERDU → Agent 6 (NURTUREUR) via nurturer-pipeline queue
    └── Métriques → Agent 7 (ANALYSTE) via tables SQL
```

### Différence clé avec les agents précédents

Agent 8 est le **seul agent avec intervention humaine dans la boucle** :
- Jonathan fait le RDV découverte (15-60 min en personne)
- Jonathan saisit les notes via Slack interactif
- Jonathan valide les concessions lors des négociations
- L'agent automatise tout le reste (devis, relances, signature, transitions)

---

## Communication inter-agents

### INPUT : queue `dealmaker-pipeline`

**Payload `DealmakerInput`** (spec §2.2) — combinant données prospect + notes Jonathan :

```typescript
interface DealmakerInput {
  deal_id: string;
  prospect_id: string;
  lead_id: string;
  prospect: { prenom, nom, email, telephone, linkedin_url, poste };
  entreprise: { nom, siret, site_web, secteur, taille, ca_estime, adresse, ville, code_postal };
  rdv_decouverte: {
    date: string;
    duree_minutes: number;
    notes_jonathan: string;
    besoins_identifies: string[];       // ['refonte_site', 'e-commerce', 'tracking']
    budget_mentionne: number | null;
    timeline_souhaitee: string | null;
    decision_makers: string[];
    objections_detectees: string[];
    urgence_percue: 'haute' | 'moyenne' | 'basse';
    probabilite_jonathan: number;       // 0-100
  };
  scoring: { score_total, categorie, segment, signal_principal };
  historique: { nb_emails_envoyes, nb_emails_ouverts, nb_reponses, canal_principal, reply_classification };
  metadata: { agent, source, version, created_by };
}
```

### OUTPUT : 3 destinations

| Destination | Queue/Table | Quand | Payload |
|------------|------------|-------|---------|
| Agent 10 CSM | `csm-onboarding` | Deal GAGNÉ (Yousign done) | `{ dealId, prospectId, companyName, mrrEur, contractUrl }` |
| Agent 6 Nurtureur | `nurturer-pipeline` | Deal PERDU (timeout 45j) | `{ prospectId, reason: 'deal_lost', category: 'COLD' }` |
| Agent 7 Analyste | Tables SQL (DealCrm, Quote) | Continu | Métriques pipeline lues par collecteur |

### Events émis

| Event | Quand |
|-------|-------|
| `deal.created` | Nouveau deal créé |
| `deal.stage_changed` | Transition de stage pipeline |
| `deal.quote_sent` | Devis envoyé au prospect |
| `deal.quote_opened` | Prospect ouvre le devis (tracking pixel) |
| `deal.objection_detected` | Objection classifiée par Claude |
| `deal.signature_requested` | Contrat envoyé via Yousign |
| `deal.won` | Signature complétée |
| `deal.lost` | Deal perdu (refus, timeout, expiration) |

---

## Pipeline CRM — 7 étapes (spec §4)

| # | Stage | Probabilité | Trigger auto | Durée moy |
|---|-------|:----------:|-------------|:---------:|
| 1 | QUALIFICATION | 40% | Job DealmakerInput créé | 1-3j |
| 2 | DEVIS_CREE | 50% | PDF généré + email envoyé (8a) | 1-2j |
| 3 | DEVIS_EN_CONSIDERATION | 65% | Tracking ouverture >= 2 OU réponse | 5-7j |
| 4 | NEGOCIATION | 75% | Objection détectée OU demande modif | 7-14j |
| 5 | SIGNATURE_EN_COURS | 90% | Yousign signature request activée | 2-7j |
| 6 | GAGNE | 100% | Webhook Yousign `signature_request.done` | — |
| 7 | PERDU | 0% | Refus OU timeout 45j OU Yousign expired | — |

**Note :** Le code actuel a 6 stages (DISCOVERY, QUALIFICATION, PROPOSAL, NEGOTIATION, CLOSED_WON, CLOSED_LOST). La spec en a 7. Il faut ajouter DEVIS_EN_CONSIDERATION et SIGNATURE_EN_COURS.

---

## Code existant — État actuel

| Composant | Status | Lignes |
|-----------|:------:|:------:|
| Module + DI | Fonctionnel | 29 |
| DealmakerService (4 méthodes) | Basique | 93 |
| DealmakerController (4 endpoints) | Fonctionnel | 37 |
| DealmakerProcessor (1 action) | Minimal | 34 |
| Deal entity + state machine | Fonctionnel | 137 |
| Quote entity | Fonctionnel | 77 |
| PricingService | Basique (6 services) | 30 |
| IDealRepository + Prisma impl | Fonctionnel | ~80 |
| IQuoteRepository + Prisma impl | Fonctionnel | ~60 |
| DTOs (CreateDeal, GenerateQuote) | Fonctionnel | 31 |
| pricing.service.spec.ts | Tests basiques | ~40 |
| **Sub-agent 8a Devis (Puppeteer + Claude)** | **Non implémenté** | 0 |
| **Sub-agent 8b Relances (séquences + objections)** | **Non implémenté** | 0 |
| **Sub-agent 8c Signature (Yousign API V3)** | **Non implémenté** | 0 |

**Total : 13 fichiers, ~648 lignes. 3 sous-agents entièrement absents.**

---

## AUDIT — 24 bugs identifiés

### Bugs CRITICAL (5)

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B1** | Deal entity a 6 stages au lieu de 7 — manque DEVIS_EN_CONSIDERATION et SIGNATURE_EN_COURS | `deal.entity.ts:1-8` | Pipeline incomplet, transitions automatiques impossibles |
| **B2** | `DealmakerInput` (spec §2.2) non implémenté — le DTO actuel est basique (prospectId, title, amount) | `dealmaker.dto.ts` | Impossible de recevoir les notes RDV Jonathan |
| **B3** | Processor ne gère qu'une seule action (`advance_stage`) — manque `create-deal`, `generate-quote`, `follow-up`, `sign-contract` | `dealmaker.processor.ts:23-31` | 80% des job types absents |
| **B4** | 3 sous-agents (8a, 8b, 8c) **entièrement absents** — aucune génération de devis, relance, ni signature | — | 100% des fonctionnalités métier manquantes |
| **B5** | Pas de transfert vers Agent 6 quand deal PERDU — prospects perdus non nurturés | `dealmaker.service.ts` | Perte de prospects récupérables |

### Bugs HIGH (7)

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B6** | PricingService a des prix simplistes (1 prix par tier) — spec exige fourchettes min/max + features détaillées | `pricing.service.ts:5-12` | Devis non conformes à la grille tarifaire |
| **B7** | Pas de scoring d'engagement post-devis (signaux d'achat) | — | Impossible de détecter les prospects chauds |
| **B8** | Pas de tracking d'ouverture du devis (pixel tracking) | — | Stage DEVIS_EN_CONSIDERATION jamais atteint |
| **B9** | Pas de détection/classification des objections (Claude) | — | Négociation impossible |
| **B10** | Pas de templates de relance (5 objections × templates) | — | Relances non personnalisées |
| **B11** | Pas d'intégration Yousign API V3 (signature électronique) | — | Signature manuelle obligatoire |
| **B12** | Pas de Slack notifications (signaux forts, signature, alertes) | — | Jonathan non informé en temps réel |

### Bugs sécurité (6)

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **S1** | Pas de `@Roles()` sur le controller — accès public aux deals | `dealmaker.controller.ts` | Tout utilisateur peut créer/modifier des deals |
| **S2** | `advanceStage` accepte n'importe quel stage via body — pas de validation | `dealmaker.controller.ts:33` | Peut forcer un deal en CLOSED_WON sans signature |
| **S3** | Notes Jonathan (RDV) envoyées à Claude API — données business sensibles | spec AGENT-8a | Data exfiltration si API key compromise |
| **S4** | Yousign webhook sans validation HMAC — forgeable | spec AGENT-8c | Fausse signature = faux deal gagné |
| **S5** | PDF devis contient des prix en clair — pas de watermark ni protection | spec AGENT-8a | Prospect forwarde le devis à un concurrent |
| **S6** | Pas de validation SIRET avant génération devis/contrat | spec | Contrat avec une entreprise inexistante |

### Gaps spec vs code (6)

| # | Manquant | Spec |
|---|---------|------|
| G1 | **8a Devis** : Claude API scope analysis + Puppeteer PDF + tiering 3 tiers + tracking | AGENT-8a |
| G2 | **8b Relances** : séquence J3/J7/J14/breakup + scoring engagement + 8 signaux d'achat | AGENT-8b |
| G3 | **8c Signature** : Yousign API V3 (9 endpoints) + contrat PDF + webhooks + relance | AGENT-8c |
| G4 | **Pipeline 7 stages** : transitions automatiques selon triggers | MASTER §4 |
| G5 | **Gestion objections** : 5 types × templates + classification Claude | MASTER §6 |
| G6 | **Formulaire Slack** : modal interactif pour saisie notes RDV Jonathan | MASTER §2.4 |

---

## Variables d'environnement

```env
# ══════════════════════════════════════════════
#          AGENT 8 — DEALMAKER
# ══════════════════════════════════════════════
DEALMAKER_ENABLED=true

# ──────────── Yousign API V3 (Signature électronique) ────────────
YOUSIGN_API_KEY=                                # API key Yousign
YOUSIGN_WEBHOOK_SECRET=                         # Secret pour validation HMAC webhooks
YOUSIGN_SANDBOX=true                            # true = sandbox, false = production
# Yousign pricing: 9€/signature OU forfait 49€/mois (10 signatures)

# ──────────── PDF Generation ────────────
# Puppeteer : pas de clé API (self-hosted, 0€)
DEVIS_PDF_STORAGE_PATH=/tmp/devis               # Stockage local des PDFs
DEVIS_TRACKING_BASE_URL=https://t.axiom-marketing.fr  # Base URL pixel tracking

# ──────────── Pipeline CRM ────────────
DEALMAKER_TIMEOUT_DAYS=45                       # Jours avant auto-PERDU
DEALMAKER_FOLLOW_UP_J3=3                        # Jours avant 1ère relance
DEALMAKER_FOLLOW_UP_J7=7                        # Jours avant 2ème relance
DEALMAKER_FOLLOW_UP_J14=14                      # Jours avant breakup
DEALMAKER_ENGAGEMENT_THRESHOLD=25               # Score pour escalade Jonathan

# Utilise ANTHROPIC_API_KEY (socle) pour Claude Sonnet (scope analysis, objection classification)
# Utilise GMAIL_* (Agent 5) pour envoi emails relance
# Utilise SLACK_WEBHOOK_URL (socle) pour notifications Jonathan
```

---

## Roadmap d'Implémentation

### Phase 0 — Entity + DTO + Pipeline (1 jour)
- [ ] **B1** : Ajouter stages DEVIS_EN_CONSIDERATION + SIGNATURE_EN_COURS au Deal entity + transitions
- [ ] **B2** : Créer DealmakerInputSchema (Zod) complet avec notes RDV
- [ ] **B3** : Enrichir processor avec job types : create-deal, generate-quote, follow-up, sign-contract, check-timeout
- [ ] **G4** : Implémenter transitions automatiques du pipeline CRM
- [ ] **S1** : @Roles sur controller + ParseUUIDPipe
- [ ] **S2** : Validation stage transition via Zod enum

### Phase 1 — 8a Devis (2 jours)
- [ ] **G1** : QuoteGeneratorService — Claude API analyse notes → scope + tier recommandé
- [ ] PricingService étendu — fourchettes min/max + features par tier (6 services × 3 tiers)
- [ ] PDF generation avec Puppeteer (HTML Handlebars template → PDF)
- [ ] Tracking pixel (ouverture devis) → event `deal.quote_opened`
- [ ] Slack notification à Jonathan après génération
- [ ] Envoi email avec PDF attaché

### Phase 2 — 8b Relances (1.5 jours)
- [ ] **G2** : DealFollowUpService — séquence J3/J7/J14/breakup
- [ ] **G5** : Scoring engagement (8 signaux d'achat) + seuils (25=escalade, 75=ready-to-sign)
- [ ] Classification objections via Claude (5 types)
- [ ] Templates de relance par objection (5 × templates email + LinkedIn)
- [ ] Transfert PERDU → Agent 6 Nurtureur (**B5**)

### Phase 3 — 8c Signature (1.5 jours)
- [ ] **G3** : YousignService — client API V3 (create request, add signer, upload doc, activate)
- [ ] Contrat PDF depuis devis accepté (Puppeteer)
- [ ] Webhooks Yousign (signature.done, expired, canceled) avec validation HMAC (**S4**)
- [ ] Relance signature J2/J5/J7
- [ ] Transfert GAGNÉ → Agent 10 CSM via csm-onboarding queue

### Phase 4 — Integration + Tests (1 jour)
- [ ] Module update : LlmModule, EmailModule, HttpModule (Slack)
- [ ] Cron check timeout 45j (deals stagnants)
- [ ] Tests : entity state machine, pricing, scoring engagement, A/B objections, pipeline transitions
- [ ] Dashboard métriques pour Agent 7

### Dépendances

```
Phase 0 (entity + DTO + pipeline) — BLOQUANTE
  ↓
Phase 1 (8a devis) + Phase 2 (8b relances) — parallélisables
  ↓
Phase 3 (8c signature) — dépend de 1 (devis accepté → contrat)
Phase 4 (tests) — dépend de tout
```

---

## Vérifications de cohérence (spec MASTER §10)

### Input == Output Agent 5 "INTÉRESSÉ"

| Donnée requise par Agent 8 | Source | Statut |
|----------------------------|--------|:------:|
| `prospect_id` | BDD (Agents 1-3) | VALIDÉ |
| `prospect.prenom/nom/email` | BDD (Agent 2 Enrichisseur) | VALIDÉ |
| `entreprise.nom/siret` | BDD (Agent 2 Enrichisseur) | VALIDÉ |
| `scoring.score_total/categorie/segment` | BDD (Agent 3 Scoreur) | VALIDÉ |
| `historique.reply_classification` | BDD (Agent 5 Suiveur) | VALIDÉ |
| `rdv_decouverte.notes_jonathan` | Formulaire Slack (saisie humaine) | VALIDÉ |

### Output compatible Agents 10, 7, 6

| Output | Destination | Tous champs présents | Statut |
|--------|-----------|:-------------------:|:------:|
| `DealToCSM` | Agent 10 CSM | Oui (spec §8.1 validé) | VALIDÉ |
| `DealMetricsEvent` | Agent 7 Analyste | Oui (spec §8.2 validé) | VALIDÉ |
| `LostDealToNurturer` | Agent 6 Nurtureur | Oui (spec §8.3 validé) | VALIDÉ |

### Résultat : 100% de cohérence input/output

---

## Points clés de l'audit final

### 8 gaps comblés dans la doc

| Gap | Ajout | Section 08b |
|-----|-------|:-----------:|
| 4 services manquants dans PricingService | Grille complète 6 services × 3 tiers | §7 |
| Templates relance non détaillés | 6 templates + 5 objections avec variables Handlebars | §8 |
| 3 endpoints Yousign manquants | 9 endpoints complets documentés | §9 |
| Conditions de paiement auto | Logique 30/40/30 vs 50/50 par montant | §9 |
| Formulaire Slack Jonathan | Block Kit modal 6 inputs | §10 |
| processFollowUp guards | 4 guards avant chaque relance | §11 |
| 3 features brainstormées additionnelles | Multi-signataires, devis multi-services, comparatif concurrent | §12 |
| Numérotation sections corrigée | 14 sections au lieu de 9 | — |
