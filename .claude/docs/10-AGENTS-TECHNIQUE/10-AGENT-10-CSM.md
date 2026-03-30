# Agent 10 — CSM — Documentation Technique d'Implémentation

**Source de vérité :** `.claude/source-ia/agent/AGENT-10-MASTER.md` + `AGENT-10a-ONBOARDING.md` + `AGENT-10b-UPSELL.md` + `AGENT-10c-SATISFACTION.md` + `AGENT-10d-AVIS.md` + `AGENT-10e-REFERRAL.md`

---

## Architecture

```
AGENT 10 — CSM MASTER (dernier agent, boucle le système complet)
├── 10a Onboardeur (séquence welcome J1-J30, kick-off, collecte accès, TTV tracking)
├── 10b Détecteur Upsell (signaux comportementaux, matrice cross-sell, scoring opportunités)
├── 10c Mesureur Satisfaction (Health Score composite, NPS/CSAT automatisé, détection churn)
├── 10d Collecteur Avis (5 plateformes, séquences demandes, gestion avis négatifs)
└── 10e Gestionnaire Referral (programme ambassadeur, commissions, tracking, boucle vers Agent 1)

Pipeline : 10a (onboarding) → 10c (satisfaction continue) → 10b/10d/10e (déclenchés par seuils)
```

### Position dans le pipeline global

```
Agent 8 (Dealmaker)
    │ [Deal signé — webhook Yousign confirmé]
    ▼
═══════════════════════════════════════
║  AGENT 10 (CSM)                     ║
║  Queue: csm-onboarding              ║
║  5 sous-agents (10a-10e)            ║
║  Cycle de vie client complet        ║
═══════════════════════════════════════
    │
    ├── Referrals      → Agent 1 (Veilleur) via veilleur-referral-leads
    ├── Métriques CSM  → Agent 7 (Analyste) via analyste-csm-metrics
    ├── Churn/Win-back → Agent 6 (Nurtureur) via nurturer-churned-client
    ├── Upsell         → Agent 8 (Dealmaker) via dealmaker-upsell
    └── Win-back réussi ← Agent 6 (Nurtureur) reboucle vers Agent 10
```

### Différence clé avec les autres agents

Agent 10 est **unique** dans le pipeline :
- **Dernier agent** — boucle le système complet de 10 agents
- **Post-vente** : seul agent qui gère des CLIENTS (pas des prospects)
- **Cycle long** : opère sur des mois/années (vs jours/semaines pour les autres agents)
- **4 outputs vers d'autres agents** : le plus connecté du système (referral→1, metrics→7, churn→6, upsell→8)
- **Boucle retour** : les referrals réinjectent des leads en haut du pipeline
- **Revenue expansion** : responsable de l'upsell/cross-sell (tracking = "golden cross-sell" 65-80%)
- **Health Score composite** : scoring continu (vs scoring unique pour Agent 3)
- **Pas de CQRS** : utilise le pattern Service classique (contrairement aux Agents 7 et 9)
- **Coût ~125 EUR/mois** — ROI estimé 7 200% (vs acquisition)

---

## Communication inter-agents

### INPUT : depuis Agent 8 (Dealmaker)

```typescript
// Queue : csm-onboarding
// Job : onboard-customer
interface DealToCSM {
  deal_id: string;                    // UUID du deal signé
  prospect_id: string;                // UUID du prospect devenu client
  prospect: {
    prenom: string;
    nom: string;
    email: string;
    telephone?: string;
    linkedin_url?: string;
    poste: string;
  };
  entreprise: {
    nom: string;
    siret: string;
    site_web: string;
    secteur: string;
    taille: number;                   // Nombre d'employés
  };
  contrat: {
    montant_ht: number;
    tier: 'bronze' | 'silver' | 'gold';
    type_projet: 'site_vitrine' | 'ecommerce_shopify' | 'app_flutter' | 'app_metier' | 'rgaa' | 'tracking_server_side';
    scope_detaille: string[];
    date_signature: string;           // ISO 8601
    date_demarrage_prevue: string;    // ISO 8601
    duree_estimee_semaines: number;
    conditions_paiement: '50/50' | '30/40/30' | 'mensuel';
    contrat_pdf_url: string;
  };
  notes_vente: string;                // Notes du commercial
  metadata: {
    agent: 'agent_8_dealmaker';
    created_at: string;
    deal_cycle_days: number;
    nb_relances: number;
    engagement_score_final: number;
    version: string;
  };
}
```

### OUTPUT : 4 destinations

| Destination | Queue BullMQ | Quand | Payload |
|------------|-------------|-------|---------|
| Agent 1 Veilleur | `veilleur-referral-leads` | Client NPS >= 9 + Health >= 80 accepte programme ambassadeur | `ReferralToAgent1` (+40 priority boost) |
| Agent 6 Nurtureur | `nurturer-churned-client` | Client churné (Health < 30, silence 120j, résiliation) | `ChurnedClientToAgent6` (stratégie win-back) |
| Agent 7 Analyste | `analyste-csm-metrics` | Quotidien (cron 8h) + événements ponctuels | `CSMMetricsSnapshot` (distribution health, churn, NRR, reviews) |
| Agent 8 Dealmaker | `dealmaker-upsell` | Upsell score >= 60, pas de blocker actif | `UpsellToAgent8` (produit recommandé, valeur estimée) |

### Schémas de sortie détaillés

```typescript
// → Agent 1 (Veilleur) — Referral leads
interface ReferralToAgent1 {
  type: 'referral_lead';
  referral_id: string;
  referred_by: {
    client_id: string;
    referral_code: string;            // "AXIOM-DUP-A3F2"
  };
  lead: {
    prenom: string;
    nom: string;
    email: string;
    entreprise: string;
    besoin: string;
    source: 'referral';               // Toujours 'referral'
  };
  priority_boost: 40;                 // +40 points de scoring
  metadata: {
    agent: 'agent_10_csm';
    created_at: string;
    version: string;
  };
}

// → Agent 6 (Nurtureur) — Client churné pour win-back
interface ChurnedClientToAgent6 {
  type: 'churned_client';
  client_id: string;
  deal_id: string;
  client: {
    prenom: string;
    nom: string;
    email: string;
    telephone?: string;
    entreprise_nom: string;
    secteur: string;
    poste: string;
  };
  churn_reason: 'insatisfaction' | 'budget' | 'concurrent' | 'silence' | 'interne' | 'autre';
  churn_detail: string;
  last_health_score: number;
  last_nps_score?: number;
  last_contact_date: string;
  total_revenue: number;
  services_utilises: string[];
  duree_relation_mois: number;
  nb_projets_realises: number;
  win_back_strategy: string;          // Recommandation IA
  recontact_date: string;             // Date suggérée pour win-back
  offre_speciale_suggeree?: string;
  metadata: {
    agent: 'agent_10_csm';
    created_at: string;
    version: string;
  };
}

// → Agent 7 (Analyste) — Snapshot métriques CSM quotidien
interface CSMMetricsSnapshot {
  type: 'csm_daily_snapshot';
  date: string;                       // ISO 8601
  // Health distribution
  health_distribution: { vert: number; jaune: number; orange: number; orange_fonce: number; rouge: number };
  avg_health_score: number;
  // Satisfaction
  avg_nps: number;
  avg_csat: number;
  // Churn
  churn_risk_count: number;
  churned_this_month: number;
  churn_rate_monthly: number;
  churn_rate_annualized: number;
  retention_rate_monthly: number;
  net_revenue_retention: number;      // NRR = (MRR début + expansion - contraction - churn) / MRR début
  avg_customer_lifetime_months: number;
  // Upsell
  upsell_opportunities_active: number;
  upsell_revenue_pipeline: number;
  upsell_conversion_rate: number;
  cross_sell_rate: number;
  // Reviews
  avg_review_score: number;           // /5
  total_reviews_collected: number;
  review_response_rate: number;
  // Referral
  active_ambassadors: number;
  referrals_submitted_month: number;
  referrals_converted_month: number;
  referral_conversion_rate: number;
  total_commission_paid_month: number;
  // Onboarding
  active_onboardings: number;
  avg_ttv_days: number;
  onboarding_completion_rate: number;
  at_risk_onboardings: number;
  metadata: {
    agent: 'agent_10_csm';
    generated_at: string;
    total_active_clients: number;
    version: string;
  };
}

// → Agent 8 (Dealmaker) — Opportunité upsell
interface UpsellToAgent8 {
  type: 'upsell_opportunity';
  client_id: string;
  existing_deal_id: string;
  client: {
    prenom: string;
    nom: string;
    email: string;
    telephone?: string;
    entreprise_nom: string;
    siret: string;
    secteur: string;
    site_web: string;
  };
  upsell: {
    product_target: 'site_vitrine' | 'ecommerce_shopify' | 'app_flutter' | 'app_metier' | 'rgaa' | 'tracking_server_side';
    estimated_value: number;          // EUR HT
    upsell_score: number;             // 0-100
    priority: 'high' | 'medium';      // >= 80 = high, >= 60 = medium
    signals_detected: string[];       // ["traffic_growth_50pct", "feature_request"]
    recommended_timing: string;       // "Mois 3-4"
    template_id: string;              // ID du template email upsell
  };
  current_services: string[];
  health_score: number;
  last_nps_score?: number;
  customer_since: string;             // ISO 8601
  total_revenue_to_date: number;
  notes: string;
  metadata: {
    agent: 'agent_10_csm';
    created_at: string;
    version: string;
  };
}
```

### Flux de données inter-sous-agents

```
Agent 8 (Dealmaker)
    │ [DealToCSM via csm-onboarding]
    ▼
10a Onboardeur → Welcome J1, kick-off J5, TTV tracking J1-J30
    │ [onboarding_completed + risk_signals]
    ▼
10c Satisfaction → Health Score quotidien (cron 8h), NPS/CSAT surveys
    │ [health_score + churn_signals + nps_score]
    ├── SI Health >= 80 + NPS >= 9 → 10e Referral (programme ambassadeur)
    ├── SI Health >= 80 + NPS >= 7 → 10d Avis (collecte reviews)
    ├── SI Health >= 60 + pas de blocker → 10b Upsell (scoring opportunités)
    ├── SI Health < 30 → Agent 6 Nurtureur (churn/win-back)
    └── TOUJOURS → Agent 7 Analyste (métriques quotidiennes)
```

---

## Workflow complet (J+0 à J+365)

### Timeline post-signature

| Jour | Action | Responsable | Sous-Agent |
|:----:|--------|:-----------:|:----------:|
| J+0 | Deal signé reçu → création Customer → welcome email | IA | 10a |
| J+2 | Kick-off meeting planifié | IA | 10a |
| J+3 | Email pré-kick-off (préparation) | IA | 10a |
| J+5 | Kick-off meeting réalisé | IA + Axiom | 10a |
| J+7 | Email recap kick-off + actions | IA | 10a |
| J+10 | Collecte accès techniques | IA | 10a |
| J+14 | Premier livrable envoyé + email milestone | IA | 10a |
| J+30 | Premier check-in mensuel | IA | 10a, 10c |
| J+30 | Premier Health Score calculé (baseline) | IA | 10c |
| J+35 | NPS post-livraison (si TTV atteint) | IA | 10c |
| J+40 | SI NPS >= 7 → séquence review D+5/D+10/D+15 | IA | 10d |
| J+60 | Évaluation upsell (si Health >= 60) | IA | 10b |
| J+60 | SI NPS >= 9 + Health >= 80 → invitation ambassadeur | IA | 10e |
| J+90 | NPS trimestriel | IA | 10c |
| J+120 | SI silence 60j → alerte churn | IA | 10c |
| J+180 | NPS semestriel + révision upsell | IA | 10c, 10b |
| J+300 | Email pré-renouvellement (si contrat annuel) | IA | 10b |
| J+365 | Bilan annuel + renouvellement | IA + Jonathan | 10c, 10b |

---

## Code existant — État actuel

| Composant | Status | Lignes |
|-----------|:------:|:------:|
| Module (BullModule) | Fonctionnel | 23 |
| CsmService (3 méthodes) | Basique — onboarding + health score simpliste + predict churn | 148 |
| CsmController (3 endpoints) | Fonctionnel avec @Roles | 40 |
| CsmProcessor (BullMQ) | Minimal — traite onboard-customer seulement | 25 |
| OnboardCustomerDto (Zod) | Fonctionnel | 35 |
| Customer entity | Complet (status, churn, reactivate) | 65 |
| HealthScore entity | Complet (supercede, isLatest) | 60 |
| ICustomerRepository + Prisma | Fonctionnel (6 méthodes) | 120 |
| IHealthScoreRepository + Prisma | Fonctionnel (2 méthodes) | 60 |
| csm.service.spec.ts | 11 tests, ~90% couverture service | 95 |
| **Sous-agent 10a Onboardeur** | **Non implémenté** (onboarding basique dans le service) | 0 |
| **Sous-agent 10b Détecteur Upsell** | **Non implémenté** | 0 |
| **Sous-agent 10c Mesureur Satisfaction** | **Partiel** (Health Score simpliste dans le service) | 0 |
| **Sous-agent 10d Collecteur Avis** | **Non implémenté** | 0 |
| **Sous-agent 10e Gestionnaire Referral** | **Non implémenté** | 0 |

**Total : 12 fichiers, ~590 lignes. 5 sous-agents à implémenter.**

---

## AUDIT — 28 bugs identifiés

### Bugs CRITICAL (5)

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B1** | **5 sous-agents entièrement absents** — seuls onboarding basique et health score simpliste existent | — | 85% des fonctionnalités manquantes |
| **B2** | **Health Score trop simpliste** — Engagement = count events × 10, Satisfaction = sentiment seul, Growth = MRR / 10 | `csm.service.ts:108-147` | Score non fiable, détection churn impossible |
| **B3** | **Pas de communication vers les 4 agents cibles** — aucun output vers Agent 1/6/7/8 | — | CSM isolé, pas de boucle pipeline |
| **B4** | **predictChurn() requête N+1** — charge TOUS les customers actifs avec deals pour filtrer en JS | `csm.service.ts:86-106` | Performance catastrophique avec > 100 clients |
| **B5** | **Pas de tables Prisma dédiées CSM** — manquent onboarding_steps, upsell_opportunities, review_requests, referral_programs, nps_surveys | `schema.prisma` | Sous-agents impossibles à implémenter |

### Bugs HIGH (8)

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B6** | **CsmProcessor sans error handling** — si onboardCustomer() throw, job silencieusement perdu | `csm.processor.ts:16-26` | Clients jamais onboardés |
| **B7** | **CsmProcessor ignore la majorité du payload DealToCSM** — ne lit que companyName + mrrEur | `csm.processor.ts:17` | Données contrat/prospect perdues |
| **B8** | **Pas de cron pour Health Score quotidien** — calculé uniquement on-demand via API | — | Pas de détection proactive du churn |
| **B9** | **calculateEngagement() compte AgentEvent avec prospectId** — mais Customer n'est pas un Prospect | `csm.service.ts:108-116` | Score engagement toujours 0 pour les clients |
| **B10** | **Pas de NPS/CSAT** — satisfaction basée uniquement sur ReplyClassification de prospects | `csm.service.ts:118-141` | Score satisfaction non pertinent post-vente |
| **B11** | **Pas d'emails automatiques** — ni welcome, ni check-in, ni review request, ni upsell | — | Aucune communication client automatisée |
| **B12** | **Pas de tracking TTV** (Time-to-Value) — aucune mesure du délai premier livrable | — | Onboarding non monitoré |
| **B13** | **Customer entity sans champs essentiels** — manquent typeProjet, tier, scopeDetaille, conditionsPaiement | `customer.entity.ts` | Personnalisation impossible |

### Bugs sécurité (7)

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **S1** | **Données financières client en clair** — MRR, montants contrat non chiffrés | `prisma-customer.repository.ts` | Compliance RGPD données financières |
| **S2** | **Pas de rate limiting sur calculateHealthScore** — appels multiples = charge Prisma | `csm.controller.ts` | DoS applicatif |
| **S3** | **predictChurn() expose TOUS les clients à risque** — pas de filtre par rôle/périmètre | `csm.controller.ts:30` | Sur-exposition données clients |
| **S4** | **Commission referral sans plafond** — pas de max commission par ambassadeur/période | spec 10e | Fraude/abus programme ambassadeur |
| **S5** | **NPS/CSAT surveys sans opt-out** — pas de gestion désinscription/RGPD | spec 10c | Non-conformité RGPD consentement |
| **S6** | **Avis négatifs : réponse publique template** — si mal calibré, aggrave la situation | spec 10d | Réputation Axiom |
| **S7** | **Referral code prévisible** — si basé sur nom + random court, brute-forceable | spec 10e | Fraude commissions |

### Gaps spec vs code (8)

| # | Manquant | Spec |
|---|---------|------|
| G1 | **10a Onboardeur** : séquence J1-J30, kick-off, collecte accès, 5 emails templates, TTV tracking, risk detection | AGENT-10a |
| G2 | **10b Détecteur Upsell** : matrice cross-sell 13 chemins, scoring 0-100 avec blockers, 3 email templates | AGENT-10b |
| G3 | **10c Satisfaction** : Health Score composite (engagement/satisfaction/croissance), NPS/CSAT automatisé, 7 signaux churn | AGENT-10c |
| G4 | **10d Collecteur Avis** : 5 plateformes, séquence 3 emails, gestion négatifs < 24h, monitoring plateformes | AGENT-10d |
| G5 | **10e Referral** : programme ambassadeur, 3 tiers commission, tracking conversion, boucle Agent 1 | AGENT-10e |
| G6 | **Communication inter-agents** : 4 queues de sortie vers Agents 1/6/7/8 totalement absentes | MASTER |
| G7 | **Cron Health Score quotidien** : calcul automatique à 8h pour tous les clients actifs | AGENT-10c |
| G8 | **Matrice cross-sell Axiom** : 13 chemins upsell avec probabilités, montants, timing optimal | AGENT-10b |

---

## Variables d'environnement

```env
# ══════════════════════════════════════════════
#          AGENT 10 — CSM
# ══════════════════════════════════════════════
CSM_ENABLED=true

# ──────────── Onboarding (10a) ────────────
ONBOARDING_KICKOFF_DELAY_DAYS=2             # Jours avant kick-off planifié
ONBOARDING_TTV_ALERT_DAYS=14               # Alerte si TTV dépassé de N jours
ONBOARDING_RISK_SILENCE_DAYS=5             # Jours sans activité = at-risk

# ──────────── Health Score (10c) ────────────
HEALTH_SCORE_CRON=0 8 * * *                # Calcul quotidien 8h
HEALTH_SCORE_GREEN_THRESHOLD=80
HEALTH_SCORE_YELLOW_THRESHOLD=60
HEALTH_SCORE_ORANGE_THRESHOLD=50
HEALTH_SCORE_DARK_ORANGE_THRESHOLD=30
CHURN_SILENCE_DAYS=60                      # Jours silence = signal churn
CHURN_CRITICAL_SILENCE_DAYS=120            # Jours silence = churn confirmé

# ──────────── NPS/CSAT (10c) ────────────
NPS_POST_DELIVERY_DELAY_DAYS=30            # NPS 30 jours post-livraison
NPS_QUARTERLY_CRON=0 9 1 */3 *            # NPS trimestriel (1er du trimestre)
TYPEFORM_API_KEY=                           # API Typeform pour NPS/CSAT
TYPEFORM_NPS_FORM_ID=                       # ID formulaire NPS
TYPEFORM_CSAT_FORM_ID=                      # ID formulaire CSAT

# ──────────── Upsell (10b) ────────────
UPSELL_MIN_SCORE=60                        # Score minimum pour proposer upsell
UPSELL_EVALUATION_DELAY_DAYS=60            # Jours post-signature avant évaluation
UPSELL_COOLDOWN_DAYS=90                    # Jours entre 2 propositions upsell

# ──────────── Reviews (10d) ────────────
REVIEW_REQUEST_DELAY_DAYS=5                # Jours post-livraison avant 1ère demande
REVIEW_REMINDER_1_DAYS=10                  # 2ème demande
REVIEW_REMINDER_2_DAYS=15                  # 3ème et dernière demande
REVIEW_MIN_NPS=7                           # NPS minimum pour demander un avis

# ──────────── Referral (10e) ────────────
REFERRAL_MIN_NPS=9                         # NPS minimum pour inviter au programme
REFERRAL_MIN_HEALTH=80                     # Health Score minimum
REFERRAL_MIN_DAYS=60                       # Jours client minimum
REFERRAL_COMMISSION_TIER1_PCT=20           # Commission < 15K EUR ACV
REFERRAL_COMMISSION_TIER2_PCT=15           # Commission 15-40K EUR ACV
REFERRAL_COMMISSION_TIER3_PCT=10           # Commission > 40K EUR ACV
REFERRAL_RETENTION_BONUS_PCT=5             # Bonus mensuel si client retenu

# ──────────── URLs plateformes avis ────────────
REVIEW_URL_GOOGLE=https://g.page/axiom-marketing/review
REVIEW_URL_TRUSTPILOT=https://trustpilot.com/review/axiom-marketing.fr
REVIEW_URL_CLUTCH=https://clutch.co/profile/axiom-marketing
REVIEW_URL_SORTLIST=https://sortlist.com/agency/axiom-marketing
REVIEW_URL_LINKEDIN=https://linkedin.com/company/axiom-marketing

# Utilise ANTHROPIC_API_KEY (socle) pour Claude (health score analysis, upsell detection)
# Utilise SLACK_WEBHOOK_URL (socle) pour notifications (churn alerts, referrals, reviews)
# Utilise MAILGUN_* (socle) pour emails (onboarding, NPS, reviews, upsell, referral)
```

---

## Roadmap d'Implémentation

### Phase 0 — Prisma + Entities + Pipeline orchestration (1 jour)
- [ ] Prisma migration : onboarding_steps, upsell_opportunities, review_requests, referral_programs, nps_surveys, customer enrichi
- [ ] Customer entity enrichi (typeProjet, tier, scopeDetaille, conditionsPaiement)
- [ ] HealthScore entity enrichi (composantes détaillées, NPS, CSAT)
- [ ] 4 queues de sortie (veilleur-referral-leads, nurturer-churned-client, analyste-csm-metrics, dealmaker-upsell)
- [ ] CsmProcessor enrichi avec error handling + retry logic
- [ ] Fix predictChurn() N+1 → requête Prisma optimisée

### Phase 1 — 10a Onboardeur + 10c Satisfaction (2 jours)
- [ ] OnboardingService : séquence J1-J30 avec steps tracking
- [ ] 5 email templates onboarding (welcome, pre-kickoff, recap, milestone, monthly)
- [ ] TTV tracking par type de projet (5-21 jours)
- [ ] Risk detection (silence, no assets, missed calls)
- [ ] SatisfactionService : Health Score composite réel (engagement + satisfaction + croissance)
- [ ] NPS/CSAT automation (Typeform API)
- [ ] Cron quotidien Health Score (8h)
- [ ] 7 signaux churn avec actions automatiques

### Phase 2 — 10b Détecteur Upsell + 10d Collecteur Avis (1.5 jours, parallélisables)
- [ ] UpsellService : matrice cross-sell 13 chemins Axiom
- [ ] Scoring opportunité 0-100 avec 10 blockers absolus
- [ ] 3 email templates upsell (e-commerce, tracking, renouvellement)
- [ ] ReviewService : séquence 3 emails sur 5 plateformes
- [ ] Gestion avis négatifs < 24h (alerte + template réponse)
- [ ] Monitoring plateformes (scraping scores)

### Phase 3 — 10e Gestionnaire Referral (1 jour)
- [ ] ReferralService : programme ambassadeur 3 tiers
- [ ] Génération code referral sécurisé
- [ ] Tracking conversion referral → deal
- [ ] Calcul et suivi commissions
- [ ] 3 email templates referral (invitation VIP, social proof, reminder)
- [ ] Dispatch vers Agent 1 (Veilleur) via veilleur-referral-leads

### Phase 4 — Communications inter-agents + Intégration (1 jour)
- [ ] Queue output → Agent 1 (referral leads avec +40 priority)
- [ ] Queue output → Agent 6 (churn clients pour win-back)
- [ ] Queue output → Agent 7 (métriques CSM quotidiennes)
- [ ] Queue output → Agent 8 (opportunités upsell)
- [ ] Gestion win-back réussi (Agent 6 → Agent 10)
- [ ] Slack notifications (#csm-wins, #csm-urgent, #csm-referrals)

### Phase 5 — Tests + Monitoring (1 jour)
- [ ] Tests unitaires pour chaque sous-agent service
- [ ] Tests CsmProcessor enrichi
- [ ] Tests controller avec endpoints manquants
- [ ] Tests intégration inter-agents (mocks BullMQ)
- [ ] Dashboard Grafana : Health distribution, churn rate, NRR, upsell pipeline

### Dépendances

```
Phase 0 (foundation) — BLOQUANTE
  ↓
Phase 1 (10a + 10c) — BLOQUANTE (onboarding + health score = base de tout)
  ↓
Phase 2 (10b + 10d) — PARALLÉLISABLES (dépendent de health score)
Phase 3 (10e) — PARALLÉLISABLE avec Phase 2 (dépend de NPS)
  ↓
Phase 4 (integration) — dépend de tout
Phase 5 (tests) — dépend de tout
```

---

## Coûts Agent 10

| Poste | Coût/mois | Détail |
|-------|:---------:|--------|
| 10a Onboardeur | ~10 EUR | Emails Mailgun (5 templates × clients/mois) |
| 10b Détecteur Upsell | ~5 EUR | Claude API scoring (hebdomadaire) |
| 10c Satisfaction | ~50 EUR | Typeform NPS/CSAT + Claude API analysis |
| 10d Collecteur Avis | ~5 EUR | Emails (3 par client) + monitoring |
| 10e Referral | ~5 EUR | Emails + tracking |
| Infrastructure | ~25 EUR | Redis workers, Prisma queries |
| **TOTAL mensuel** | **~100-125 EUR** | **Budget mensuel** |
| **TOTAL annuel** | **~1 200-1 500 EUR** | **Budget annuel** |

### ROI estimé

| Levier | Gain annuel estimé | Hypothèse |
|--------|:------------------:|-----------|
| Rétention +5% | ~36 000 EUR | 20 clients × 18K EUR MRR moyen × 5% rétention |
| Upsell 20% clients | ~60 000 EUR | 4 clients × 15K EUR upsell moyen |
| Referrals convertis | ~50 000 EUR | 5 leads × 10K EUR deal moyen |
| **TOTAL gains** | **~146 000 EUR** | |
| **ROI** | **~7 200%** | Gain 146K / Coût 2K |

---

## Audit final — Vérifications de cohérence

### 8 gaps initiaux documentés dans le 10b

| Gap | Ce qui manquait | Section ajoutée |
|-----|----------------|:---------------:|
| G1 | Health Score composite réel (3 composantes × sous-indicateurs) | §10c détaillé |
| G2 | Matrice cross-sell 13 chemins avec probabilités et timing | §10b matrice |
| G3 | Timeline onboarding par type de projet (6 types) | §10a timeline |
| G4 | Programme ambassadeur 3 tiers commission | §10e commissions |
| G5 | 7 signaux churn avec SLA d'intervention | §10c churn signals |
| G6 | Séquence review sur 5 plateformes avec timing optimal | §10d plateformes |
| G7 | 4 outputs inter-agents avec schémas JSON complets | §MASTER outputs |
| G8 | LTV impact par combinaison services (+98% avec 3 services) | §10b LTV |

---

## AUDIT APPROFONDI — Cohérence inter-agents (29 mars 2026)

### PROBLÈME CRITIQUE #1 : Agent 8 → Agent 10 payload dégradé

**Constat :** `dealmaker.service.ts:145-150` envoie **4 champs** (`dealId`, `prospectId`, `companyName`, `mrrEur`). La spec `DealToCSM` définit **~30 champs** (prospect, entreprise, contrat, metadata).

**Impact :** Le CsmProcessor ignore `dealId` et `prospectId`, ne lit que `companyName` + `mrrEur`. Toutes les données prospect, contrat, notes de vente sont perdues. L'onboarding démarre à l'aveugle.

**Fix requis :** Agent 8 doit construire le payload complet `DealToCSM` en enrichissant depuis Prisma (Prospect, DealCrm avec typeProjet/tierFinal/rdvNotes) avant dispatch.

### PROBLÈME CRITIQUE #2 : 4 queues output non déclarées

| Queue documentée | Définie dans `queue-names.constant.ts` ? | Code consommateur existant ? |
|---|:---:|:---:|
| `veilleur-referral-leads` | **NON** | **NON** |
| `nurturer-churned-client` | **NON** | **NON** |
| `analyste-csm-metrics` | **NON** | **NON** |
| `dealmaker-upsell` | **NON** | **NON** |

**Fix requis :** Ajouter les 4 queues dans `queue-names.constant.ts` + créer les processors dans les agents récepteurs.

### PROBLÈME CRITIQUE #3 : Aucun agent récepteur n'est prêt

| Agent récepteur | Processor pour CSM ? | Compatibilité payload ? |
|---|:---:|:---:|
| Agent 1 Veilleur | **NON** — Pas de handler referral leads | `ReferralToAgent1` ≠ `DetectLeadDto` |
| Agent 6 Nurtureur | **NON** — Pas de handler churned client | `ChurnedClientToAgent6` opère sur Customer, Nurtureur sur Prospect — **entity mismatch** |
| Agent 7 Analyste | **NON** — Architecture SQL-only (pas de queue input) | `CSMMetricsSnapshot` devrait être persisté en table, pas envoyé par queue |
| Agent 8 Dealmaker | **NON** — Pas d'action 'upsell' dans le processor | `UpsellToAgent8` incompatible avec `JobDataSchema` discriminated union |

**Fix requis pour chaque agent :**
- **Agent 1** : Nouveau processor `ReferralLeadProcessor` ou méthode `handleReferralLead()` dans VeilleurService
- **Agent 6** : Mapping Customer → Prospect via `primaryContactId`, nouveau type de séquence "win-back"
- **Agent 7** : Persister `CSMMetricsSnapshot` en table `csm_metrics_daily` que le collecteur Agent 7 lit (architecture SQL-only respectée)
- **Agent 8** : Ajouter action `upsell` dans `JobDataSchema`, handler dédié dans DealmakerProcessor

### PROBLÈME CRITIQUE #4 : Agent 9 envoie directement au CSM avec payload invalide

`moniteur.service.ts:205-209` envoie `{ companyName, source: 'appels-offres', tenderId }` au CSM — **sans `mrrEur`** (requis). Le CsmProcessor log "deferred" et ne fait rien. Le marché gagné n'est jamais onboardé.

**Fix requis :** Agent 9 doit passer par Agent 8 (comme la spec le prévoit : Agent 9 → Agent 8 → Agent 10), OU envoyer un payload complet.

### PROBLÈME HIGH #5 : Win-back loop non documentée côté Agent 6

La boucle "Agent 6 win-back réussi → Agent 10 reactivate" est documentée dans les docs Agent 10 mais **absente** des docs Agent 6 (`06-AGENT-6-NURTUREUR.md`). Agent 6 n'a aucun concept de "win-back" pour clients churnés.

**Fix requis :** Documenter dans Agent 6 + implémenter : (1) Agent 6 accepte `ChurnedClientToAgent6`, (2) séquence nurture "win-back", (3) si succès → dispatch vers `csm-onboarding` avec flag `reactivation: true`.

### PROBLÈME HIGH #6 : Architecture Agent 7 incompatible

Agent 7 (Analyste) fonctionne en **architecture SQL-only** (lit les tables Prisma, pas de queue BullMQ en input). L'output `analyste-csm-metrics` via queue est un **mismatch architectural**.

**Fix :** Persister le `CSMMetricsSnapshot` quotidien dans une table `csm_metrics_daily` que l'Agent 7 MetricsCollector lit naturellement. Pas de queue nécessaire.

---

## AUDIT APPROFONDI — Prisma schema (29 mars 2026)

### État actuel vs requis

| Élément | Existe ? | Action |
|---------|:--------:|--------|
| 9 nouvelles tables (OnboardingStep, OnboardingRisk, etc.) | **NON** | CREATE dans une migration |
| 7 nouveaux champs Customer (typeProjet, tier, etc.) | **NON** | ALTER TABLE customers |
| 5 nouvelles relations Customer (onboardingSteps, etc.) | **NON** | Ajouter |
| CustomerHealthScore | **OUI, conforme** | Aucun changement |
| Index `@@index([typeProjet])` sur Customer | **NON** | Ajouter |
| Back-relations OnboardingRisk/ChurnSignal sur Customer | **OMIS dans spec** | Ajouter `onboardingRisks` et `churnSignals` relations |

**Complexité migration : MOYENNE** — Tous les nouveaux champs nullable/default, pas de backfill. Single migration ~200 lignes SQL. Zero downtime.

### Relations DealCrm → Customer déjà en place

DealCrm a déjà les champs utiles : `customerId`, `typeProjet`, `tierRecommande`, `tierFinal`, `rdvNotes`, `amountEur`. Le handoff Agent 8 → Agent 10 peut enrichir le Customer depuis DealCrm.

---

## BRAINSTORM APPROFONDI — Features manquantes (29 mars 2026)

### P0 — Bloquantes (9 items, à traiter AVANT implémentation)

| # | Feature | Effort | Impact | Pourquoi pour Axiom |
|---|---------|:------:|:------:|-----|
| **F1** | **Project delivery lifecycle tracking** — Le CSM ne sait pas quand un projet est livré. Sans ça, TTV impossible, NPS mal timé, reviews prématurées, upsell trop tôt. Modèle `ProjectMilestone` requis. | 3j | Critique | Axiom livre des projets (sites, apps). Si le CSM ne détecte pas la livraison, tous les timers sont faux. |
| **F2** | **Contract RENEWAL workflow** — Pas de modèle `RenewalOpportunity`, pas de reminders, pas de pipeline renouvellement. Le tracking (89 EUR/mois) dépend du renouvellement. | 2j | Critique | Le revenu récurrent d'Axiom disparaît silencieusement si les contrats expirent sans conversation. |
| **F3** | **Yousign webhook → CSM flow complet** — Le webhook n8n doit parser Yousign, matcher au deal, construire le payload `DealToCSM` complet. Bridging logic absente. | 1j | Critique | Aujourd'hui un contrat signé arrive avec juste `companyName` + `mrrEur`. |
| **F4** | **Mailgun webhook CSM** — L'email open rate = 25% de l'engagement (10% du Health Score total). Sans tracking Mailgun pour les emails CSM, ce score est toujours 0. | 1.5j | Critique | Health Score systématiquement déprimé → fausses alertes churn pour tous les clients. |
| **F5** | **Typeform webhook NPS real-time** — Sans webhook, le NPS est traité au prochain cron (23h de latence). SLA détracteur = "immédiat". | 1j | Haut | Un détracteur NPS 2 doit déclencher un appel < 24h. Avec polling, le timer démarre trop tard. |
| **F6** | **MRR expansion tracking** — NRR = LA métrique de valeur Agent 10. Pas de tracking MRR historique = NRR fabricé. | 1j | Critique | Les investisseurs et Jonathan ont besoin du vrai NRR pour prouver la valeur post-vente. |
| **F7** | **Statut "onboarding" sur Customer** — Sans ça, un client J+3 est évalué par le cron Health Score, reçoit un score bas (pas assez de données), déclenche une fausse alerte churn. | 0.5j | Haut | Anti-pattern AP4 : "Calculer Health Score sans données suffisantes (< 30j)". |
| **F8** | **typeProjet sur Customer** — La matrice cross-sell est le cœur de l'upsell. Sans savoir ce que le client a, les 13 chemins sont inutilisables. | 0.5j | Critique | L'engine upsell entier est aveugle sans cette donnée. |
| **F9** | **Agent 8 DealToCSM handoff complet** — Côté Agent 8, construire le payload riche depuis Prisma. | 1j | Critique | Point d'entrée du pipeline CSM. Sans payload complet, Agent 10 démarre à l'aveugle. |

### P1 — Importantes (16 items)

| # | Feature | Effort | Impact |
|---|---------|:------:|:------:|
| F10 | **QBRs (Quarterly Business Reviews)** pour clients gold | 1j | Haut |
| F11 | **Service credits** — modèle + budget + approval workflow | 1.5j | Haut |
| F12 | **Multi-stakeholder management** — ContactRole (decision_maker, technical, champion) | 2j | Haut |
| F13 | **Win-back success criteria** — re-signed OU MRR repris 2+ mois | 0.5j | Moyen |
| F14 | **Dashboard API endpoints** — 9+ endpoints manquants pour le frontend React | 2j | Haut |
| F15 | **Customer journey stages** — ONBOARDING → ADOPTION → EXPANSION → ADVOCACY | 1j | Haut |
| F16 | **Churn risk scoring avec décroissance temporelle** — signaux anciens pèsent moins | 1.5j | Haut |
| F17 | **Review response approval workflow** — notification Jonathan + approve/edit/reject | 1j | Haut |
| F18 | **Payment tracking** — intégration Stripe/comptabilité pour le signal "retard paiement" | 2j | Haut |
| F19 | **Agent 6 ↔ Agent 10 win-back loop** — implémenter les 2 côtés | 1.5j | Haut |
| F20 | **Agent 7 CSM metrics table** — `csm_metrics_daily` pour architecture SQL-only | 1j | Moyen |
| F21 | **Health Score cron batching** — 50 clients × 5 concurrent, timeout 5 min | 1j | Haut |
| F22 | **Email rate limiting** — priorité : churn > onboarding > NPS > reviews > referral | 0.5j | Haut |
| F23 | **BullMQ job priorities** — interventions churn priority 1, reviews priority 4 | 0.5j | Moyen |
| F24 | **Jonathan interaction logging** — POST /customers/:id/interactions pour feedback humain | 1.5j | Haut |
| F25 | **Graceful degradation** — circuit breaker sur Mailgun, Claude, Slack + dead-letter | 1j | Haut |

### P2 — Pour l'excellence (11 items)

| # | Feature | Effort |
|---|---------|:------:|
| F26 | **Health Score prédictif** — ML model sur historique | 3j |
| F27 | **NPS text mining** — analyse sémantique commentaires | 1j |
| F28 | **Upsell timing optimizer** — A/B test timing | 2j |
| F29 | **Referral gamification** — badges, leaderboard | 2j |
| F30 | **Slack interactive messages** — boutons action pour Jonathan | 2j |
| F31 | **CRM bidirectionnel** — sync HubSpot/Pipedrive | 3j |
| F32 | **Bulk operations** — recalcul mass health scores, NPS batch | 1j |
| F33 | **WebSocket/SSE** — real-time dashboard updates | 1.5j |
| F34 | **Metabase views** — materialized views CSM | 1j |
| F35 | **E2E integration tests** — lifecycle simulé J0→J365 | 2j |
| F36 | **Email domain separation** — success@axiom-marketing.fr pour CSM | 0.5j |
