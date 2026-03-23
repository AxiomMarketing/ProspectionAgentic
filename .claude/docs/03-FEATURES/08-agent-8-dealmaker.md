# Agent 8 — DEALMAKER (Master)

## Vue d'Ensemble

L'Agent 8 (DEALMAKER) est le moteur de closing du pipeline Axiom Marketing. Il prend le relais après qu'un prospect a répondu positivement (classification "INTERESSE" par l'Agent 5) et qu'un RDV découverte a été effectué par Jonathan. Il automatise l'intégralité du processus de closing, du devis personnalisé à la signature électronique, en passant par la relance intelligente et la gestion des objections. Coût : ~62 EUR/mois.

## Sous-Agents

| ID | Nom | Rôle | Fréquence | API Principale |
|----|-----|------|-----------|----------------|
| 8a | Générateur de Devis | Crée automatiquement un devis personnalisé en < 30s avec tiering Bronze/Silver/Gold, génération PDF via Puppeteer, scope technique via Claude API | Événementiel (BullMQ `dealmaker-pipeline`) | Claude API + Puppeteer (PDF) |
| 8b | Relanceur de Deals | Séquences de relance J3/J7/J14 + breakup email, scoring engagement post-devis (signaux d'achat), gestion des prospects fantômes, classification objections via Claude API | Cron + événementiel | Claude API + Gmail API |
| 8c | Gestionnaire de Signature | Yousign API V3 (9 endpoints), génération contrat PDF, relance signature J2/J5/J7, webhook signature confirmée → trigger onboarding Agent 10 | Événementiel + webhook | Yousign API V3 |

## Input / Output

### Input (depuis Jonathan après RDV découverte)

Le flux d'entrée vers l'Agent 8 n'est pas un transfert automatique direct depuis l'Agent 5. Le processus est :
1. L'Agent 5 détecte une réponse "INTERESSE" et notifie Jonathan en < 5 min
2. Jonathan effectue le RDV découverte avec le prospect (15-60 min)
3. Jonathan saisit ses notes de RDV via formulaire Slack interactif
4. Le système crée un `DealmakerInput` et l'envoie dans la queue BullMQ `dealmaker-pipeline`

```typescript
interface DealmakerInput {
  deal_id: string              // UUID v4 unique du deal
  prospect_id: string
  lead_id: string
  created_at: string           // ISO 8601

  prospect: {
    prenom: string; nom: string; email: string
    telephone: string | null; linkedin_url: string | null; poste: string
  }

  entreprise: {
    nom: string; siret: string; site_web: string; secteur: string
    taille: number; ca_estime: number
    adresse: string | null; ville: string | null; code_postal: string | null
  }

  rdv_decouverte: {
    date: string               // ISO 8601
    duree_minutes: number
    notes_jonathan: string
    besoins_identifies: string[]  // 'refonte_site' | 'site_vitrine' | 'e-commerce' | 'ecommerce_shopify' | 'app_flutter' | 'app_mobile' | 'app_metier' | 'rgaa' | 'accessibilite' | 'tracking' | 'tracking_server_side'
    budget_mentionne: number | null
    budget_fourchette: { min: number | null; max: number | null } | null
    timeline_souhaitee: string | null
    decision_makers: string[]
    processus_decision: string | null
    objections_detectees: string[]  // 'prix_eleve' | 'timing' | 'concurrence' | 'budget' | 'indecision'
    concurrent_mentionne: string | null
    points_sensibles: string | null
    urgence_percue: 'haute' | 'moyenne' | 'basse'
    probabilite_jonathan: number   // 0-100
  }

  scoring: {
    score_total: number; categorie: 'HOT_A' | 'HOT_B' | 'HOT_C' | 'WARM'
    segment: string; signal_principal: string
  }

  historique: {
    nb_emails_envoyes: number; nb_emails_ouverts: number
    nb_clics: number; nb_reponses: number
    canal_principal: 'email' | 'linkedin'
    date_premier_contact: string; date_reponse_interesse: string
    reply_classification: { category: 'INTERESSE' | 'INTERESSE_SOFT'; confidence: number; phrase_cle: string }
    sequence_id: string; dernier_message_envoye: string
  }

  metadata: { agent: 'agent_8_dealmaker'; source: 'pipeline_prospection' | 'referral' | 'inbound' | 'appel_entrant'; version: string; created_by: 'system' | 'jonathan' }
}
```

**Estimation de valeur du deal (fonction `estimateDealValue`) :**

| Besoin identifié | Estimation par défaut |
|---|---|
| refonte_site / site_vitrine | 5 000 EUR |
| e-commerce / ecommerce_shopify | 10 000 EUR |
| app_flutter / app_mobile | 35 000 EUR |
| app_metier | 50 000 EUR |
| rgaa / accessibilite | 20 000 EUR |
| tracking / tracking_server_side | 990 EUR |

### Output (vers Agent 10 — Deal signé)

Transmis via queue BullMQ `csm-onboarding` quand le webhook Yousign confirme la signature :

```typescript
interface DealToCSM {
  deal_id: string; prospect_id: string
  prospect: { prenom: string; nom: string; email: string; telephone?: string; linkedin_url?: string; poste: string }
  entreprise: { nom: string; siret: string; site_web: string; secteur: string; taille: number }
  contrat: {
    montant_ht: number
    tier: 'bronze' | 'silver' | 'gold'
    type_projet: 'site_vitrine' | 'ecommerce_shopify' | 'app_flutter' | 'app_metier' | 'rgaa' | 'tracking_server_side'
    scope_detaille: string[]
    date_signature: string          // ISO 8601
    date_demarrage_prevue: string   // ISO 8601
    duree_estimee_semaines: number
    conditions_paiement: '50/50' | '30/40/30' | 'mensuel'
    contrat_pdf_url: string
  }
  notes_vente: string
  metadata: { agent: 'agent_8_dealmaker'; created_at: string; deal_cycle_days: number; nb_relances: number; engagement_score_final: number; version: string }
}
```

### Output (vers Agent 6 — Deal perdu)

Transmis via queue BullMQ `nurturer-lost-deal` quand un deal est marqué PERDU (refus ou timeout 45 jours) :

```typescript
interface LostDealToNurturer {
  prospect_id: string; deal_id: string
  reason: 'PRIX' | 'TIMING' | 'CONCURRENCE' | 'INACTION' | 'AUTRE'
  detail: string
  dernier_contact: string; historique_touches: number
  montant_estime: number; type_projet: string; tier_propose: string
  recommendation: string; recontact_date: string
  prospect: { prenom: string; nom: string; email: string; entreprise_nom: string; poste: string; segment: string }
  metadata: { agent: 'agent_8_dealmaker'; lost_at: string; deal_cycle_days: number; nb_relances: number; engagement_score_final: number; version: string }
}
```

## Workflow

**Étape 1 — Réception et validation**

Validation des champs obligatoires : `deal_id`, `prospect.email`, `entreprise.siret`, `rdv_decouverte.notes_jonathan`, `rdv_decouverte.besoins_identifies` (au moins 1), `scoring.categorie`, `historique.reply_classification.category` (doit être `INTERESSE` ou `INTERESSE_SOFT`). Vérification qu'aucun deal actif n'existe déjà pour ce prospect.

**Étape 2 — Génération du devis (sous-agent 8a)**

Claude API génère le scope technique détaillé selon les besoins identifiés. Puppeteer génère le PDF devis avec tiering Bronze/Silver/Gold et le design Axiom. Envoi par email dans les < 2 heures (Time to Quote cible). Notification Slack Jonathan avec lien vers le devis.

**Étape 3 — Suivi et relances (sous-agent 8b)**

Séquence de relance automatique selon les signaux d'engagement (ouvertures, clics) :
- J+3 : Relance #1 — message de valeur
- J+7 : Relance #2 — témoignage / cas d'usage similaire
- J+14 : Relance breakup — FOMO/urgence douce
- Détection automatique des objections via Claude API sur les réponses reçues

**Étape 4 — Gestion des objections**

5 templates d'objection activés automatiquement selon la classification Claude API :

| Objection | % des deals perdus | Template activé |
|---|---|---|
| Prix trop élevé | 35% | Proposer tier inférieur + échelonnement 2-3 fois + ROI chiffré |
| Pas le bon moment | 25% | Identifier trigger temporel + fixer date + qualifier budget |
| Concurrence en lice | 20% | Différenciation ROI + case studies + zéro sous-traitance |
| Pas de budget alloué | 15% | Unbundling en phases + projet pilote Bronze |
| Indécision / paralysie | 5% | Simplifier à 2 options claires (A ou B) |

**Étape 5 — Signature électronique (sous-agent 8c)**

Quand le prospect accepte : génération du contrat PDF complet via Puppeteer, envoi via Yousign API V3, relances J+2/J+5/J+7 si non signé, webhook `signature_request.done` déclenche le transfert vers Agent 10.

**Étape 6 — Clôture**

Deal GAGNÉ : dispatch `DealToCSM` vers Agent 10 + métriques vers Agent 7.
Deal PERDU (refus ou timeout 45 jours) : dispatch `LostDealToNurturer` vers Agent 6 + métriques vers Agent 7.

## APIs & Coûts

| API | Coût/mois | Utilisation |
|-----|-----------|-------------|
| Yousign Plus | 28 EUR | API V3, signatures illimitées, rappels auto, branding |
| Infrastructure (part Agent 8 sur VPS) | 20 EUR | Puppeteer, Node.js, Redis (BullMQ), stockage PDF |
| Claude API | 8 EUR | ~100 devis/mois × $0.0009 + ~200 classifications objections × $0.003 |
| Stockage S3/Minio (PDF devis + contrats) | 5 EUR | ~100 PDF/mois × 0.5 MB = ~600 MB/an |
| Domaine tracking (devis.axiom-marketing.fr) | 1 EUR | Sous-domaine suivi ouverture devis |

**Total Agent 8 : ~62 EUR/mois (~744 EUR/an)**

ROI projeté : Coût annuel 744 EUR / Revenu incrémental +52 000 à 78 000 EUR (4-6 deals/mois × 13 000 EUR) = ROI 70x à 105x.

## Base de Données

### Tables Principales

```sql
-- Pipeline CRM 7 étapes
CREATE TABLE deals (
  id                    SERIAL PRIMARY KEY,
  deal_id               UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  prospect_id           UUID NOT NULL REFERENCES prospects(prospect_id),
  stage                 VARCHAR(30) NOT NULL DEFAULT 'QUALIFICATION'
    CHECK (stage IN ('QUALIFICATION','DEVIS_CREE','DEVIS_EN_CONSIDERATION','NEGOCIATION','SIGNATURE_EN_COURS','GAGNE','PERDU')),
  montant_estime        NUMERIC(12,2),
  montant_final         NUMERIC(12,2),
  tier                  VARCHAR(10) CHECK (tier IN ('bronze','silver','gold')),
  type_projet           VARCHAR(50),
  probabilite_closing   INTEGER,      -- 0-100, mise à jour selon le stage
  source                VARCHAR(30) NOT NULL DEFAULT 'pipeline_prospection',
  notes_jonathan        TEXT,
  objection_type        VARCHAR(30),  -- 'prix_eleve'|'timing'|'concurrence'|'budget'|'inaction'
  lost_reason           VARCHAR(30),  -- 'PRIX'|'TIMING'|'CONCURRENCE'|'INACTION'|'AUTRE'
  engagement_score      INTEGER DEFAULT 0,  -- 0-100, score post-devis
  nb_relances           INTEGER DEFAULT 0,
  devis_pdf_url         VARCHAR(500),
  contrat_pdf_url       VARCHAR(500),
  yousign_request_id    VARCHAR(100),
  yousign_status        VARCHAR(30),  -- 'pending'|'done'|'expired'|'canceled'
  date_devis_envoye     TIMESTAMP WITH TIME ZONE,
  date_signature        TIMESTAMP WITH TIME ZONE,
  cycle_vente_jours     INTEGER,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Activité et relances sur les deals
CREATE TABLE deal_activities (
  id                  SERIAL PRIMARY KEY,
  deal_id             UUID NOT NULL REFERENCES deals(deal_id),
  prospect_id         UUID NOT NULL REFERENCES prospects(prospect_id),
  type                VARCHAR(50) NOT NULL,
    -- 'devis_envoye'|'devis_ouvert'|'relance_envoyee'|'reponse_recue'|
    -- 'objection_traitee'|'contrat_envoye'|'contrat_signe'|'deal_perdu'|'stage_change'
  canal               VARCHAR(20),  -- 'email'|'slack'|'yousign'
  details             JSONB,        -- données spécifiques à l'action
  from_stage          VARCHAR(30),
  to_stage            VARCHAR(30),
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Métriques quotidiennes deals (alimentant Agent 7)
CREATE TABLE deal_metrics_daily (
  id                        SERIAL PRIMARY KEY,
  date_snapshot             DATE NOT NULL UNIQUE,
  deals_actifs              INTEGER DEFAULT 0,
  pipeline_value_total      NUMERIC(12,2) DEFAULT 0,
  pipeline_coverage         NUMERIC(5,2) DEFAULT 0,
  win_rate_30j              NUMERIC(5,2) DEFAULT 0,
  avg_deal_size             NUMERIC(10,2) DEFAULT 0,
  avg_cycle_days            NUMERIC(5,1) DEFAULT 0,
  deals_won_mtd             INTEGER DEFAULT 0,
  revenue_won_mtd           NUMERIC(12,2) DEFAULT 0,
  deals_lost_mtd            INTEGER DEFAULT 0,
  deal_velocity             NUMERIC(10,2) DEFAULT 0,
  avg_time_to_quote_hours   NUMERIC(5,1) DEFAULT 0,
  avg_time_to_sign_hours    NUMERIC(5,1) DEFAULT 0,
  breakup_recovery_rate     NUMERIC(5,2) DEFAULT 0,
  top_loss_reason           VARCHAR(30),
  created_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

## Scheduling

| Trigger | Action | Description |
|---------|--------|-------------|
| BullMQ `dealmaker-pipeline` (événementiel) | `generateDevis(input)` | Déclenché par saisie notes Jonathan post-RDV |
| Cron J+3 après envoi devis | `sendRelance(1)` | Première relance post-devis |
| Cron J+7 après envoi devis | `sendRelance(2)` | Deuxième relance — témoignage |
| Cron J+14 après envoi devis | `sendBreakup()` | Email breakup FOMO |
| Cron J+2 après envoi Yousign | `relanceSignature(1)` | Rappel signature |
| Cron J+5 après envoi Yousign | `relanceSignature(2)` | Deuxième rappel signature |
| Cron J+7 après envoi Yousign | `relanceSignature(3)` | Dernier rappel — expiration imminente |
| Cron `0 22 * * *` | `snapshotDealMetrics()` | Snapshot quotidien métriques → Agent 7 |
| Cron `0 3 * * *` | `checkTimeoutDeals()` | Marquer PERDU les deals inactifs 45+ jours |
| Webhook Yousign POST `/webhooks/yousign` | `handleSignatureEvent()` | `signature_request.done` → Agent 10 ; `signature_request.expired` → retour NÉGOCIATION |

## Error Handling

| Erreur | Action | Fallback |
|--------|--------|----------|
| Yousign API indisponible lors de l'envoi du contrat | Retry 3x avec backoff 30s/60s/120s | Alerter Jonathan Slack, deal reste en DEVIS_EN_CONSIDERATION |
| Prospect déjà en deal actif (doublon) | Retourner le `deal_id` existant sans créer de doublon | Log `duplicate_deal_prevented` |
| Claude API timeout lors génération scope devis | Retry 2x, puis utiliser scope template statique | Log `scope_static_fallback` |
| Devis PDF Puppeteer échoue | Retry 2x, puis envoyer devis en HTML formaté | Log `pdf_fallback_html` |
| Webhook Yousign reçu hors séquence (`canceled` avant `done`) | Traiter selon le type reçu indépendamment | Log `yousign_unexpected_event` |
| Deal timeout 45 jours mais prospect en négociation active | Ne pas auto-clore si activité récente (< 7 jours) | Log `timeout_skipped_active_deal` |
| Objection classifiée avec confidence < 0.7 | Envoyer notification Jonathan pour traitement manuel | Log `low_confidence_objection` |
| Yousign signature expirée | Relancer le flow signature depuis NÉGOCIATION | Log `yousign_expired_restart` |

## KPIs & Métriques

| Métrique | Cible Axiom | Benchmark industrie (agences web) |
|----------|-------------|----------------------------------|
| Win Rate | 35-40% | 20-30% |
| Deal Velocity | 3 250 EUR/jour | Variable |
| Pipeline Coverage | 3.0-3.5x quota mensuel | 3.0x minimum |
| Cycle de vente moyen | 30-40 jours | 50-60 jours |
| Conversion Devis → Signé | 35-40% | 25-35% |
| Taux relance efficace | 25-30% | 20% |
| Time to Quote | < 2 heures | 3-5 jours |
| Time to Sign | < 48h | 5-7 jours |
| Engagement Score moyen (deals actifs) | > 25 | — |
| Breakup Recovery Rate | 33% | 20% |

**Calcul Deal Velocity :**
```
Deal Velocity = (Nb deals × Deal size moyen × Win rate) / Cycle moyen

Baseline (sans DEALMAKER) :
  (15 deals × 10 000 EUR × 0.25) / 50 jours = 750 EUR/jour

Objectif (avec DEALMAKER) :
  (25 deals × 13 000 EUR × 0.40) / 40 jours = 3 250 EUR/jour

Amélioration : +333% vs baseline
```

## Pipeline CRM — 7 Étapes

| # | Stage | Définition | Probabilité closing | Durée moyenne |
|---|-------|-----------|---------------------|---------------|
| 1 | Qualification Avancée | RDV découverte effectué, besoins confirmés, notes Jonathan saisies | 40% | 1-3 jours |
| 2 | Devis Créé | Proposition générée (3 tiers) et envoyée | 50% | 1-2 jours |
| 3 | Devis en Consideration | Prospect a ouvert le devis 2+ fois OU a répondu à une relance | 65% | 5-7 jours |
| 4 | Négociation | Objection soulevée et traitée, ajustements en cours | 75% | 7-14 jours |
| 5 | Signature en Cours | Contrat envoyé via Yousign pour e-signature | 90% | 2-7 jours |
| 6 | Gagné | Contrat signé par le prospect | 100% | — |
| 7 | Perdu | Refus explicite OU inaction 45+ jours OU Yousign expiré | 0% | — |

## Tiering Bronze / Silver / Gold

| Service | Bronze | Silver (cible 60-70%) | Gold |
|---------|--------|-----------------------|------|
| Site vitrine | 1 500 EUR — Essentiel | 5 000 EUR — Professionnel | 9 500 EUR — Premium |
| E-commerce Shopify | 5 000 EUR — Starter | 10 000 EUR — Growth | 15 000 EUR — Scale |
| App Flutter | 15 000 EUR — MVP | 35 000 EUR — Complete | 60 000 EUR — Enterprise |
| App métier | 25 000 EUR — Module Unique | 50 000 EUR — Multi-Modules | 75 000 EUR — Sur-Mesure |
| RGAA collectivités | 8 000 EUR — Audit + Essentiels | 20 000 EUR — Refonte Partielle | 40 000 EUR — Conformité Totale |
| Tracking server-side | 990 EUR + 89/mois — Standard | 1 490 EUR + 129/mois — Avancé | 2 490 EUR + 189/mois — Enterprise |

**Psychologie du tiering (Dan Ariely, Decoy Effect) :**
- Bronze = leurre d'entrée, features volontairement limitées
- Silver = cible : "sweet spot" valeur/prix, badge "Le plus choisi", position centrale. Objectif : 60-70% des conversions
- Gold = ancrage haut, rend le Silver "raisonnable" par comparaison. +30% de revenu à volume égal grâce au decoy effect

## Edge Cases

- **Budget mentionné en dessous du Bronze** : Jonathan est notifié immédiatement (score probabilité réduit à < 20%). L'agent propose une version "Starter" ou un paiement en 3 fois
- **Prospect sans SIRET** (personne physique ou étranger) : Bloquer la génération du contrat Yousign, alerter Jonathan. Le devis peut être envoyé mais pas le contrat
- **Deal gagné mais webhook Yousign perdu** : Mécanisme de polling toutes les 2h sur les contrats en statut `pending`. Si `done` détecté en poll, déclencher le dispatch vers Agent 10
- **Concurrent mentionné lors du RDV** : Le champ `concurrent_mentionne` est conservé dans `notes_jonathan`. L'agent 8b injecte automatiquement le template "différenciation" dans la relance J+7
- **Deal entrant de l'Agent 10 (upsell)** : Traité comme un `DealmakerInput` normal avec `metadata.source = 'upsell'`. Le cycle est généralement 30-40% plus court (client existant, confiance établie)
- **Yousign signature expirée** : Relancer le flow depuis NÉGOCIATION avec un nouveau lien. Ne pas créer un nouveau deal

## Budget

| Poste | Coût/mois |
|-------|-----------|
| Yousign Plus (API V3) | 28 EUR |
| Infrastructure (Puppeteer, Node.js, Redis) | 20 EUR |
| Claude API (scope + classification objections) | 8 EUR |
| Stockage S3/Minio (PDF devis + contrats) | 5 EUR |
| Domaine tracking devis.axiom-marketing.fr | 1 EUR |
| **Total** | **~62 EUR/mois** |

## Référence Spec

`.claude/source-ia/agent/AGENT-8-MASTER.md`
Sous-agents détaillés : `AGENT-8a-DEVIS.md`, `AGENT-8b-RELANCES.md`, `AGENT-8c-SIGNATURE.md`
