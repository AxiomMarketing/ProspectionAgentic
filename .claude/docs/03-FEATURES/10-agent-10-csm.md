# Agent 10 — CSM (Master)

## Vue d'Ensemble

L'Agent 10 (CSM) est le gardien de la relation client post-vente du pipeline Axiom Marketing. Il prend le relais immédiatement après la signature du contrat (webhook Yousign confirmé par l'Agent 8) et gère l'intégralité du cycle de vie client : onboarding, satisfaction, upsell, rétention, collecte d'avis et referral. Il boucle le système complet en renvoyant les referrals vers l'Agent 1, les opportunités upsell vers l'Agent 8, et les clients churned vers l'Agent 6. Coût : ~125 EUR/mois (jusqu'à 255 EUR/mois).

## Sous-Agents

| ID | Nom | Rôle | Fréquence | API Principale |
|----|-----|------|-----------|----------------|
| 10a | Onboarding | Séquence welcome J1-J30 (emails + appels + kick-off), collecte des accès, création backlog projet, tracking TTV (Time to Value) | Événementiel + cron | Gmail API + Slack API |
| 10b | Upsell | Détection signaux upsell selon la matrice cross-sell, scoring opportunité, proposition de services complémentaires, dispatch vers Agent 8 si score >= 60 | Cron mensuel + événementiel | Gmail API + Claude API |
| 10c | Satisfaction | Health Score composite quotidien, NPS automatisé (J+30 / J+90 / J+180 / anniversaire), CSAT post-livraison, détection churn précoce, playbooks de remédiation | Cron `0 8 * * *` + événementiel | Typeform + Slack API |
| 10d | Avis | Séquences de demande d'avis sur 5 plateformes (Google, Trustpilot, Clutch, Malt, LinkedIn), gestion des avis négatifs, réponses publiques | Événementiel (Health Score vert) | Gmail API + APIs plateformes |
| 10e | Referral | Programme ambassadeur : tracking des parrainages, commissions automatiques, envoi des codes referral, dispatch des leads referral vers Agent 1 avec +40 pts de boost | Événementiel (Health Score >= 80) | Gmail API |

## Input / Output

### Input (depuis Agent 8 — Deal signé)

Reçu via queue BullMQ `csm-onboarding` quand le webhook Yousign confirme la signature :

```typescript
interface DealToCSM {
  deal_id: string
  prospect_id: string

  prospect: {
    prenom: string; nom: string; email: string
    telephone?: string; linkedin_url?: string; poste: string
  }

  entreprise: {
    nom: string; siret: string; site_web: string; secteur: string; taille: number
  }

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

  metadata: {
    agent: 'agent_8_dealmaker'
    created_at: string
    deal_cycle_days: number
    nb_relances: number
    engagement_score_final: number
    version: string
  }
}
```

### Output (vers Agent 1 — Leads referral)

Transmis via queue BullMQ `veilleur-referral-leads` quand un ambassadeur soumet un referral :

```typescript
interface ReferralToAgent1 {
  type: 'referral_lead'
  referral_id: string
  referred_by: { client_id: string; referral_code: string }
  lead: { prenom: string; nom: string; email: string; entreprise: string; besoin: string; source: 'referral' }
  priority_boost: number    // +40 points au lead score (taux conversion referral 30-40% vs 1-3% cold)
  metadata: { agent: 'agent_10_csm'; created_at: string; version: string }
}
```

### Output (vers Agent 8 — Opportunité upsell)

Transmis via queue BullMQ `dealmaker-upsell` quand upsell_score >= 60 :

```typescript
interface UpsellToAgent8 {
  type: 'upsell_opportunity'
  client_id: string; existing_deal_id: string
  client: { prenom: string; nom: string; email: string; telephone?: string; entreprise_nom: string; siret: string; secteur: string; site_web: string }
  upsell: {
    product_target: 'site_vitrine' | 'ecommerce_shopify' | 'app_flutter' | 'app_metier' | 'rgaa' | 'tracking_server_side'
    estimated_value: number
    upsell_score: number       // 0-100
    priority: 'high' | 'medium'
    signals_detected: string[]
    recommended_timing: string
    template_id: string
  }
  current_services: string[]; health_score: number; last_nps_score: number
  customer_since: string; total_revenue_to_date: number; notes: string
  metadata: { agent: 'agent_10_csm'; created_at: string; version: string }
}
```

### Output (vers Agent 6 — Client churné)

Transmis via queue BullMQ `nurturer-churned-client` quand un client est confirmé churné :

```typescript
interface ChurnedClientToAgent6 {
  type: 'churned_client'
  client_id: string; deal_id: string
  client: { prenom: string; nom: string; email: string; telephone?: string; entreprise_nom: string; secteur: string; poste: string }
  churn_reason: 'insatisfaction' | 'budget' | 'concurrent' | 'silence' | 'interne' | 'autre'
  churn_detail: string; last_health_score: number; last_nps_score: number; last_contact_date: string
  total_revenue: number; services_utilises: string[]; duree_relation_mois: number; nb_projets_realises: number
  win_back_strategy: string; recontact_date: string; offre_speciale_suggeree?: string
  metadata: { agent: 'agent_10_csm'; created_at: string; version: string }
}
```

### Output (vers Agent 7 — Métriques CSM)

Snapshot quotidien à 08h30 via queue BullMQ `analyste-csm-metrics` : distribution Health Score, churn rate, NRR, pipeline upsell, taux referral, métriques onboarding.

## Workflow

**Étape 1 — Onboarding J1-J30 (sous-agent 10a)**

Déclenchement immédiat à réception du `DealToCSM` :
- J+0 : Email de bienvenue personnalisé + accès aux outils partagés (Drive, Slack client)
- J+1 : Appel téléphonique kick-off (30 min) — planifié automatiquement via Calendly
- J+3 : Création backlog projet à partir du `scope_detaille` du contrat
- J+7 : Premier point de suivi — check satisfaction initiale
- J+14 : Revue mi-onboarding — ajustements si nécessaire
- J+30 : Clôture onboarding — premier NPS (sous-agent 10c)

**Étape 2 — Health Score quotidien (sous-agent 10c)**

Cron à 08h00 chaque jour. Calcul pour chaque client actif :

```
HEALTH SCORE (0-100) =
  ENGAGEMENT (40%) × [
    Fréquence login (30%) + Taux ouverture email (25%) +
    Fréquence contact (20%) + Participation formation (15%) + Taux réponse CTA (10%)
  ]
  + SATISFACTION (30%) × [
    Dernier NPS normalisé (50%) + Moyenne CSAT (30%) +
    Pénalité tickets critiques (10%) + Sentiment communication (10%)
  ]
  + CROISSANCE (30%) × [
    Évolution MRR normalisée (40%) + Adoption features % (30%) +
    Croissance trafic normalisée (20%) + Score upsell (10%)
  ]
```

**Seuils et actions automatiques :**

| Score | Couleur | Actions automatiques | SLA |
|---|---|---|---|
| 80-100 | Vert | Tag "promoteur", trigger referral (10e), trigger demande avis (10d) | 30 jours |
| 60-79 | Jaune | Email check-in, contenu nurture | 14 jours |
| 50-59 | Orange | Alerte CSM Slack, email "checking in" | 48h |
| 30-49 | Orange foncé | Alerte manager, plan remédiation auto, proposer credits service | 24h |
| < 30 | Rouge | Alerte executive, escalade Jonathan, décision fight/accept | Immédiat |

**Étape 3 — Détection upsell (sous-agent 10b)**

Vérification mensuelle selon la matrice cross-sell. Si `upsell_score >= 60` et aucun blocker (impayé, churn imminent, onboarding en cours) → dispatch vers Agent 8.

**Étape 4 — Prévention churn (sous-agent 10c)**

6 signaux surveillés avec séquences automatiques :
1. Silence radio > 60 jours → séquence J+60/J+75/J+90/J+120
2. Usage drops > 40% → alerte CSM + séquence J+1/J+7/J+14
3. Tickets support × 3 → escalade + root cause analysis
4. Retard paiement > 15 jours → relances J+15/J+25/J+35/J+45
5. NPS < 6 → alerte + appel CSM + plan d'action
6. Health Score chute > 20 pts/30j → alerte + appel 24h

**Étape 5 — Collecte avis (sous-agent 10d)**

Déclenché quand Health Score >= 80 (couleur verte) :
- 5 plateformes ciblées : Google Business, Trustpilot, Clutch, Malt, LinkedIn
- Séquence 3 emails sur 21 jours
- Gestion des avis négatifs (réponse publique sous 24h, escalade si < 3 étoiles)

**Étape 6 — Programme referral (sous-agent 10e)**

Déclenché quand Health Score >= 80 et NPS >= 8 (promoteur) :
- Attribution d'un code referral unique
- Email programme ambassadeur avec conditions et commissions
- Tracking des leads soumis → dispatch vers Agent 1 avec `priority_boost: +40`

## APIs & Coûts

| Outil/API | Coût/mois | Utilisation |
|-----------|-----------|-------------|
| Typeform Pro (surveys NPS/CSAT) | 50 EUR | NPS, CSAT, CES — enquêtes automatisées |
| CRM (HubSpot Starter ou Pipedrive) | 0-50 EUR | Gestion clients, workflows, health score |
| Asana/Monday (gestion projets) | 25-50 EUR | Suivi onboarding, backlog projet |
| Redis/BullMQ | 15-30 EUR | Queues workers |
| Serveur workers | 25-50 EUR | Part VPS partagé |
| Monitoring (Sentry, logs) | 10-25 EUR | Erreurs + performance |
| Gmail API / Slack API | 0 EUR | Inclus Google Workspace + workspace existant |

**Total Agent 10 : 125 EUR/mois (minimum) à 255 EUR/mois (maximum)**

ROI estimé :
```
Coût annuel Agent 10 : ~2 000 EUR
Revenu sauvé par rétention (+5%) : ~36 000 EUR
Revenu upsell (20% clients × 3 000 EUR moy.) : ~60 000 EUR
Revenu referral (5 referrals/an × 10 000 EUR moy.) : ~50 000 EUR
ROI total : (146 000 - 2 000) / 2 000 = 7 200%
```

## Base de Données

### Tables Principales

```sql
-- Clients actifs (post-signature)
CREATE TABLE clients (
  id                    SERIAL PRIMARY KEY,
  client_id             UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  deal_id               UUID NOT NULL,          -- Référence vers deals.deal_id
  prospect_id           UUID NOT NULL REFERENCES prospects(prospect_id),
  prenom                VARCHAR(100) NOT NULL,
  nom                   VARCHAR(100) NOT NULL,
  email                 VARCHAR(200) NOT NULL,
  telephone             VARCHAR(30),
  poste                 VARCHAR(100),
  entreprise_nom        VARCHAR(200) NOT NULL,
  siret                 VARCHAR(20),
  site_web              VARCHAR(500),
  secteur               VARCHAR(100),
  taille_entreprise     INTEGER,
  statut                VARCHAR(20) NOT NULL DEFAULT 'ONBOARDING'
    CHECK (statut IN ('ONBOARDING','ACTIF','AT_RISK','CHURNED','PAUSED')),
  type_projet           VARCHAR(50) NOT NULL,
  tier                  VARCHAR(10) NOT NULL,
  montant_contrat_ht    NUMERIC(12,2) NOT NULL,
  conditions_paiement   VARCHAR(20),
  date_signature        DATE NOT NULL,
  date_demarrage        DATE,
  duree_estimee_semaines INTEGER,
  services_actifs       TEXT[],                -- Services en cours
  health_score_current  INTEGER DEFAULT 0,
  health_score_color    VARCHAR(20) DEFAULT 'jaune',
  nps_score_last        INTEGER,
  csat_score_last       NUMERIC(3,1),
  churn_risk            BOOLEAN DEFAULT FALSE,
  referral_code         VARCHAR(20) UNIQUE,
  nb_projets_realises   INTEGER DEFAULT 0,
  total_revenue         NUMERIC(12,2) DEFAULT 0,
  customer_since        DATE NOT NULL,
  last_contact_date     DATE,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Historique Health Score quotidien
CREATE TABLE health_scores (
  id                  SERIAL PRIMARY KEY,
  client_id           UUID NOT NULL REFERENCES clients(client_id),
  date_score          DATE NOT NULL,
  total_score         INTEGER NOT NULL,
  color               VARCHAR(20) NOT NULL,
  engagement_score    INTEGER NOT NULL,
  satisfaction_score  INTEGER NOT NULL,
  croissance_score    INTEGER NOT NULL,
  -- Sous-composantes ENGAGEMENT
  login_frequency     INTEGER,
  email_open_rate     NUMERIC(5,2),
  contact_frequency   INTEGER,
  -- Sous-composantes SATISFACTION
  nps_normalized      INTEGER,
  csat_avg            NUMERIC(3,1),
  tickets_penalty     INTEGER,
  -- Sous-composantes CROISSANCE
  mrr_change          NUMERIC(5,2),
  feature_adoption    NUMERIC(5,2),
  traffic_growth      NUMERIC(5,2),
  -- Delta vs précédent
  delta_vs_prev       INTEGER,
  alerte_declenchee   BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, date_score)
);

-- Surveys NPS/CSAT
CREATE TABLE surveys (
  id                  SERIAL PRIMARY KEY,
  client_id           UUID NOT NULL REFERENCES clients(client_id),
  type_survey         VARCHAR(20) NOT NULL CHECK (type_survey IN ('NPS','CSAT','CES')),
  trigger_event       VARCHAR(50),  -- 'j30'|'j90'|'j180'|'anniversaire'|'post_livraison'
  score               INTEGER,
  verbatim            TEXT,
  typeform_response_id VARCHAR(100),
  sent_at             TIMESTAMP WITH TIME ZONE,
  answered_at         TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Opportunités upsell
CREATE TABLE upsell_opportunities (
  id                    SERIAL PRIMARY KEY,
  client_id             UUID NOT NULL REFERENCES clients(client_id),
  product_target        VARCHAR(50) NOT NULL,
  upsell_score          INTEGER NOT NULL,
  estimated_value       NUMERIC(12,2),
  signals_detected      TEXT[],
  recommended_timing    VARCHAR(50),
  statut                VARCHAR(20) DEFAULT 'DETECTED'
    CHECK (statut IN ('DETECTED','DISPATCHED_TO_AGENT8','WON','LOST','DEFERRED')),
  dispatched_at         TIMESTAMP WITH TIME ZONE,
  deal_id_upsell        UUID,          -- Deal créé par Agent 8 si gagné
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Programme referral
CREATE TABLE referrals (
  id                    SERIAL PRIMARY KEY,
  referral_id           UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  ambassador_client_id  UUID NOT NULL REFERENCES clients(client_id),
  referral_code         VARCHAR(20) NOT NULL,
  referred_prenom       VARCHAR(100) NOT NULL,
  referred_nom          VARCHAR(100) NOT NULL,
  referred_email        VARCHAR(200) NOT NULL,
  referred_entreprise   VARCHAR(200),
  besoin                TEXT,
  statut                VARCHAR(20) DEFAULT 'SUBMITTED'
    CHECK (statut IN ('SUBMITTED','DISPATCHED_TO_AGENT1','QUALIFIED','CONVERTED','REJECTED')),
  lead_id_created       UUID,          -- Lead créé par Agent 1
  commission_due        NUMERIC(8,2),
  commission_paid_at    TIMESTAMP WITH TIME ZONE,
  dispatched_at         TIMESTAMP WITH TIME ZONE,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

## Scheduling

| Cron | Heure | Sous-agent | Action |
|------|-------|------------|--------|
| `0 8 * * *` | 08h00 | 10c | Calcul Health Score tous clients actifs |
| `30 8 * * *` | 08h30 | 10c | Snapshot métriques CSM → Agent 7 |
| `0 9 * * 1` | Lun 09h | 10b | Scan opportunités upsell (clients 30+ jours) |
| `0 1 * * *` | 01h00 | 10c | Vérification silence radio (> 60 jours) |
| `0 1 * * *` | 01h00 | 10c | Vérification retards paiement |
| `0 2 */30 * *` | 2h, tous les 30j | 10c | Envoi NPS automatique (J+30/J+90/J+180) |
| BullMQ `csm-onboarding` | Événementiel | 10a | Onboarding immédiat post-signature |
| Événementiel (Health Score >= 80) | — | 10d + 10e | Déclencher demande avis + invitation referral |
| Événementiel (churn confirmé) | — | 10c | Dispatch `ChurnedClientToAgent6` |
| Événementiel (upsell_score >= 60) | — | 10b | Dispatch `UpsellToAgent8` |
| Événementiel (referral soumis) | — | 10e | Dispatch `ReferralToAgent1` (+40 pts boost) |

## Error Handling

| Erreur | Action | Fallback |
|--------|--------|----------|
| Health Score impossible à calculer (données manquantes) | Utiliser le dernier score connu + flag `data_incomplete` | Log `health_score_incomplete_[client_id]` |
| Typeform survey non répondu après 14 jours | Archiver la tentative, reprogrammer à la prochaine échéance | Log `survey_no_response` |
| Upsell dispatché vers Agent 8 mais deal_id non reçu en retour | Marquer `DISPATCHED` et attendre webhook Agent 8 (timeout 72h) | Alerter Jonathan si pas de retour |
| Referral soumis avec email déjà en BDD prospects | Merger les données, conserver la source `referral` + `priority_boost` | Log `referral_duplicate_prospect` |
| Churn confirmé mais client a une facture impayée | Bloquer le dispatch vers Agent 6 jusqu'à résolution financière | Alerter Jonathan |
| NPS détracteur (< 6) après un upsell | Suspendre immédiatement tout email upsell en cours. Déclencher playbook remédiation | Log `nps_detracteur_upsell_suspended` |
| Gmail API bounce sur email onboarding | Vérifier l'email, alerter Jonathan, essayer l'email alternatif si disponible | Log `onboarding_email_bounce` |
| Health Score chute brutale (> 30 pts en 24h) | Alerte CRITIQUE immédiate Jonathan + escalade executive | Pas de fallback automatique pour les crises |

## KPIs & Métriques

| KPI | Cible Axiom | Fréquence |
|-----|-------------|-----------|
| Health Score moyen (clients actifs) | >= 70 (Jaune/Vert) | Quotidien |
| Churn rate mensuel | < 20%/an (soit < 1.7%/mois) | Mensuel |
| NPS moyen | >= 50 | Mensuel |
| CSAT moyen post-livraison | >= 4.2/5 | Par projet |
| TTV (Time to Value, J+30 kickoff) | 100% onboardings J+30 | Mensuel |
| Taux upsell (clients avec 2+ services) | >= 20% à 12 mois | Trimestriel |
| Valeur upsell moyen | >= 5 000 EUR | Trimestriel |
| Taux referral (ambassadeurs actifs) | >= 5% des clients Vert | Trimestriel |
| Conversion referral | >= 30% | Trimestriel |
| NRR (Net Revenue Retention) | >= 110% | Mensuel |
| CLV:CAC ratio | >= 3:1 (cible 4:1+) | Trimestriel |
| Rétention 1 an (1 service) | 75% (cible) | Annuel |
| Rétention 1 an (3+ services) | 95% (cible) | Annuel |

## Matrice Cross-Sell Axiom

| # | Depuis | Vers | Probabilité | Montant | Timing | Pitch clé |
|---|---|---|---|---|---|---|
| 1 | Site vitrine | E-commerce Shopify | 45% | +8 000 EUR | M3-4 | "Votre trafic mérite d'être monétisé" |
| 2 | Site vitrine | Tracking server-side | 65% | +990 + 89/mois | M1-2 | "Comprenez pourquoi vos visiteurs convertissent" |
| 3 | Site vitrine | App Flutter | 15% | +30 000 EUR | M6+ | "Vos clients sont sur mobile" |
| 4 | E-commerce | Tracking server-side | 80% | +990 + 89/mois | M1-2 | "Mesurez chaque conversion avec précision" |
| 5 | E-commerce | App Flutter | 30% | +20 000 EUR | M4-6 | "40% des achats sont sur mobile" |
| 6 | App Flutter | Tracking server-side | 70% | +990 + 89/mois | M2 | "Mesurez l'engagement utilisateur" |
| 7 | App Flutter | App métier | 25% | +15 000 EUR | M6+ | "Vos processus internes méritent une app" |
| 8 | App métier | Tracking server-side | 70% | +990 + 89/mois | M2 | "Suivez l'adoption par vos équipes" |
| 9 | App métier | App Flutter (mobile) | 20% | +20 000 EUR | M6+ | "Version mobile pour vos équipes terrain" |
| 10 | RGAA | Site vitrine (refonte) | 35% | +8 000 EUR | M2-3 | "Profitez de l'audit pour moderniser" |
| 11 | RGAA | E-commerce | 20% | +10 000 EUR | M4-6 | "Site accessible = meilleur taux conversion" |
| 12 | Tracking | Site vitrine | 25% | +7 500 EUR | M3-4 | "Les data montrent qu'il faut refondre" |
| 13 | Tracking | E-commerce | 30% | +10 000 EUR | M3-4 | "Vos données confirment le potentiel e-commerce" |

**Impact LTV par parcours upsell :**

| Parcours client | LTV sans upsell | LTV avec upsell | Augmentation |
|---|---|---|---|
| Vitrine seul (3 ans) | 22 500 EUR | — | — |
| Vitrine + E-commerce | — | 32 500 EUR | +44% |
| Vitrine + E-com + Tracking | — | 44 636 EUR | +98% |
| E-commerce seul (3 ans) | 25 000 EUR | — | — |
| E-commerce + Tracking | — | 27 068 EUR | +8% |

**Impact rétention par nombre de services :**

| Nombre services | Rétention 1 an | Rétention 3 ans |
|---|---|---|
| 1 service | 75% | 45% |
| 2 services | 88% | 70% |
| 3+ services | 95% | 88% |

## Edge Cases

- **Client churné puis revenu (win-back réussi par Agent 6)** : Créer un nouveau `client_id` avec historique lié à l'ancien. Onboarding allégé (pas de kick-off, welcome ciblé). Health Score part de 50 (Jaune) au lieu du calcul normal
- **Client avec plusieurs projets simultanés** : Un `client_id` unique, un `deal_id` par projet actif. Health Score calculé sur l'ensemble des projets, NPS envoyé une seule fois par trimestre (déduplication)
- **Upsell opportunité détectée pendant l'onboarding (< J+30)** : Bloquer le dispatch vers Agent 8. Conserver en `DEFERRED` jusqu'à J+45 minimum pour laisser le client s'installer
- **NPS 6-7 (passif, ni promoteur ni détracteur)** : Pas de trigger avis ni referral. Suivre la progression sur 2 trimestres avant d'activer ces programmes
- **Client collectivité (RGAA)** : Les surveys NPS/CSAT utilisent le vouvoiement institutionnel et les références aux obligations légales plutôt qu'aux indicateurs commerciaux. Le churn est moins fréquent mais le cycle décisionnel upsell est plus long (6-12 mois)
- **Deal perdu Agent 8 (upsell refusé)** : Marquer l'opportunité comme `LOST` dans `upsell_opportunities`. Déclencher une séquence de nurture soft (3 mois minimum avant reproposer)
- **Client sans activité mesurable** (ex: site vitrine sans analytics connectée) : Health Score calculé uniquement sur les composantes disponibles (SATISFACTION + communication sentiment). Engagement = N/A. Notifier Jonathan pour mise en place du tracking

## Budget

| Catégorie | Minimum | Maximum |
|---|---|---|
| Typeform Pro (surveys) | 50 EUR/mois | 50 EUR/mois |
| CRM (HubSpot/Pipedrive) | 0 EUR/mois | 50 EUR/mois |
| Asana/Monday (gestion projets) | 25 EUR/mois | 50 EUR/mois |
| Redis/BullMQ queues | 15 EUR/mois | 30 EUR/mois |
| Serveur workers | 25 EUR/mois | 50 EUR/mois |
| Monitoring (Sentry, logs) | 10 EUR/mois | 25 EUR/mois |
| **Total mensuel** | **125 EUR/mois** | **255 EUR/mois** |
| **Total annuel** | **1 500 EUR/an** | **3 060 EUR/an** |

## Référence Spec

`.claude/source-ia/agent/AGENT-10-MASTER.md`
Sous-agents détaillés : `AGENT-10a-ONBOARDING.md`, `AGENT-10b-UPSELL.md`, `AGENT-10c-SATISFACTION.md`, `AGENT-10d-AVIS.md`, `AGENT-10e-REFERRAL.md`
