# AGENT 10 — CSM (MASTER)
**Fichiers associes** : AGENT-10a-ONBOARDING.md, AGENT-10b-UPSELL.md, AGENT-10c-SATISFACTION.md, AGENT-10d-AVIS.md, AGENT-10e-REFERRAL.md
**Position** : Agent 8 → Agent 10 → Agent 1 (referrals) / Agent 7 (metriques)
**Cout** : ~125 EUR/mois

**Version :** 1.0
**Date :** 2026-03-19
**Auteur :** Systeme Axiom Marketing
**Contexte :** Pipeline de prospection automatise B2B -- Phase post-vente et retention client
**Public :** Jonathan Dewaele, Marty Wong, equipe tech Univile
**Statut :** DERNIER AGENT -- Boucle le systeme complet de 10 agents

---

## TABLE DES MATIERES

1. [Mission](#1-mission)
2. [Input : Schema JSON recu de l'Agent 8 (DealToCSM)](#2-input--schema-json-recu-de-lagent-8-dealtocsm)
3. [Health Score](#3-health-score)
4. [Matrice Cross-Sell Axiom](#4-matrice-cross-sell-axiom)
5. [Prevention Churn](#5-prevention-churn)
6. [Output : Schemas JSON](#6-output--schemas-json)
7. [Couts](#7-couts)
8. [Verification de coherence & Schema global 10 agents](#8-verification-de-coherence--schema-global-10-agents)

---

## 1. MISSION

### 1.1 Definition

L'Agent 10 (CSM) est le **gardien de la relation client post-vente** du pipeline Axiom Marketing. Il prend le relais **immediatement apres** la signature du contrat (webhook Yousign confirme par l'Agent 8 DEALMAKER) et gere l'integralite du cycle de vie client : onboarding, satisfaction, upsell, retention, collecte d'avis et referral.

**Entree :** Deal signe recu de l'Agent 8 (DealToCSM) via queue BullMQ `csm-onboarding`.
**Sortie :** Referrals vers Agent 1 (VEILLEUR), metriques vers Agent 7 (ANALYSTE), churn vers Agent 6 (NURTUREUR), upsell vers Agent 8 (DEALMAKER).

**Objectif strategique :** Maximiser la Customer Lifetime Value (CLV) de chaque client Axiom en assurant satisfaction, expansion et advocacy.

### 1.2 Responsabilites exactes

| Responsabilite | Agent 10 fait | Autres agents font |
|---|---|---|
| **Onboarding** | Sequence welcome J1-J30, kick-off, collecte acces, TTV tracking | Agent 8 a gere le closing et transmet le deal signe |
| **Satisfaction** | Health Score composite, NPS/CSAT automatise, detection churn | Agent 7 analyse les metriques globales |
| **Upsell/Cross-sell** | Detection signaux, scoring opportunite, proposition | Agent 8 reprend pour le closing upsell |
| **Collecte avis** | Sequences demande avis, 5 plateformes, gestion negatifs | Agent 4 exploite les avis pour le contenu |
| **Referral** | Programme ambassadeur, tracking, commissions | Agent 1 recoit les leads referral pour enrichissement |
| **Prevention churn** | Detection signaux, actions preventives, playbooks | Agent 6 gere le win-back des clients churnes |

### 1.3 Ce que l'Agent 10 NE fait PAS

- Ne fait PAS la prospection initiale (responsabilite Agents 1-5)
- Ne fait PAS le closing des deals (responsabilite Agent 8 DEALMAKER)
- Ne fait PAS le nurturing des prospects froids (responsabilite Agent 6 NURTUREUR)
- Ne fait PAS l'analyse globale du pipeline (responsabilite Agent 7 ANALYSTE)
- Ne fait PAS les appels d'offres (responsabilite Agent 9)
- Ne fait PAS la redaction de contenu marketing (responsabilite Agent 4 REDACTEUR)

### 1.4 Position dans le pipeline

```
PIPELINE AXIOM MARKETING -- 10 AGENTS

Agent 1 (VEILLEUR)     ─→ Agent 2 (ENRICHISSEUR) ─→ Agent 3 (SCOREUR)
                                                          │
                                                          v
Agent 6 (NURTUREUR) ←── Agent 5 (SUIVEUR)  ←──── Agent 4 (REDACTEUR)
       │                      │
       │                      v
       │                Jonathan (RDV Decouverte)
       │                      │
       │                      v
       │               Agent 8 (DEALMAKER) ──→ Agent 9 (APPELS D'OFFRES)
       │                      │
       │          ┌───────────┼───────────┐
       │          v           v           v
       │   Agent 10 (CSM)  Agent 7    Agent 6
       │   [Deal signe]   [Metriques] [Deal perdu]
       │          │
       │          ├── Referrals ──→ Agent 1 (boucle)
       │          ├── Metriques ──→ Agent 7
       │          ├── Churn     ──→ Agent 6
       │          └── Upsell    ──→ Agent 8 (boucle)
       │
       └── Win-back reussi ──→ Agent 10 (boucle)
```

### 1.5 Chiffres cles justifiant l'Agent 10

| Metrique | Valeur | Source |
|---|---|---|
| Cout acquisition vs retention | 5x plus cher d'acquerir | Benchmark B2B 2026 |
| Impact retention +5% | +25 a 95% de profit | Harvard Business Review |
| Churn onboarding | 67% des churns en onboarding | SaaS Benchmark |
| Upsell vs new business | 3-5x moins cher | B2B Services 2026 |
| Conversion referral vs cold | 30-40% vs 1-3% | B2B Benchmark 2026 |
| LTV avec upsell | +25 a 98% | Modele Axiom |
| Retention multi-services | 95% (3+ services) vs 75% (1 service) | Agences web 2026 |

---

## 2. INPUT : SCHEMA JSON RECU DE L'AGENT 8 (DealToCSM)

### 2.1 Source et declencheur

L'Agent 10 recoit ses donnees via la queue BullMQ `csm-onboarding` quand le webhook Yousign de l'Agent 8 confirme la signature du contrat.

### 2.2 Schema JSON exact

```typescript
interface DealToCSM {
  deal_id: string
  prospect_id: string

  prospect: {
    prenom: string
    nom: string
    email: string
    telephone?: string
    linkedin_url?: string
    poste: string
  }

  entreprise: {
    nom: string
    siret: string
    site_web: string
    secteur: string
    taille: number
  }

  contrat: {
    montant_ht: number
    tier: 'bronze' | 'silver' | 'gold'
    type_projet: 'site_vitrine' | 'ecommerce_shopify' | 'app_flutter' | 'app_metier' | 'rgaa' | 'tracking_server_side'
    scope_detaille: string[]          // Liste des livrables convenus
    date_signature: string            // ISO 8601
    date_demarrage_prevue: string     // ISO 8601
    duree_estimee_semaines: number
    conditions_paiement: '50/50' | '30/40/30' | 'mensuel'
    contrat_pdf_url: string           // URL du contrat signe
  }

  notes_vente: string                 // Contexte commercial (objections levees, attentes speciales)

  metadata: {
    agent: 'agent_8_dealmaker'
    created_at: string
    deal_cycle_days: number           // Nombre de jours du cycle de vente
    nb_relances: number
    engagement_score_final: number
    version: string
  }
}
```

### 2.3 Validation de l'input

```typescript
import { z } from 'zod'

const DealToCSMSchema = z.object({
  deal_id: z.string().uuid(),
  prospect_id: z.string().uuid(),

  prospect: z.object({
    prenom: z.string().min(1),
    nom: z.string().min(1),
    email: z.string().email(),
    telephone: z.string().optional(),
    linkedin_url: z.string().url().optional(),
    poste: z.string().min(1),
  }),

  entreprise: z.object({
    nom: z.string().min(1),
    siret: z.string().regex(/^\d{14}$/),
    site_web: z.string().url(),
    secteur: z.string().min(1),
    taille: z.number().int().positive(),
  }),

  contrat: z.object({
    montant_ht: z.number().positive(),
    tier: z.enum(['bronze', 'silver', 'gold']),
    type_projet: z.enum([
      'site_vitrine', 'ecommerce_shopify', 'app_flutter',
      'app_metier', 'rgaa', 'tracking_server_side'
    ]),
    scope_detaille: z.array(z.string()).min(1),
    date_signature: z.string().datetime(),
    date_demarrage_prevue: z.string().datetime(),
    duree_estimee_semaines: z.number().int().positive(),
    conditions_paiement: z.enum(['50/50', '30/40/30', 'mensuel']),
    contrat_pdf_url: z.string().url(),
  }),

  notes_vente: z.string(),

  metadata: z.object({
    agent: z.literal('agent_8_dealmaker'),
    created_at: z.string().datetime(),
    deal_cycle_days: z.number().int().nonnegative(),
    nb_relances: z.number().int().nonnegative(),
    engagement_score_final: z.number().min(0).max(100),
    version: z.string(),
  }),
})

// Validation a la reception
export function validateDealInput(data: unknown): DealToCSM {
  const result = DealToCSMSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`Input Agent 8 invalide: ${result.error.message}`)
  }
  return result.data
}
```

### 2.4 Verification de coherence avec l'output Agent 8

| Champ output Agent 8 (DealToCSM) | Requis par Agent 10 | Statut |
|---|---|---|
| `deal_id` | Identifiant unique du deal | VALIDE |
| `prospect_id` | Lien vers le prospect en BDD | VALIDE |
| `prospect.prenom/nom/email` | Pour les communications onboarding | VALIDE |
| `prospect.telephone` | Pour appels kick-off et interventions | VALIDE |
| `prospect.poste` | Pour adapter le ton des communications | VALIDE |
| `entreprise.nom/siret` | Pour la facturation et le suivi | VALIDE |
| `entreprise.site_web` | Pour monitoring post-livraison | VALIDE |
| `entreprise.secteur` | Pour personnaliser les templates | VALIDE |
| `contrat.montant_ht` | Pour le calcul de valeur client | VALIDE |
| `contrat.tier` | Pour adapter le niveau de service | VALIDE |
| `contrat.type_projet` | Pour router vers le bon workflow onboarding | VALIDE |
| `contrat.scope_detaille` | Pour creer le backlog du projet | VALIDE |
| `contrat.date_demarrage_prevue` | Pour planifier le kickoff | VALIDE |
| `contrat.duree_estimee_semaines` | Pour fixer les jalons | VALIDE |
| `contrat.conditions_paiement` | Pour la gestion des factures | VALIDE |
| `contrat.contrat_pdf_url` | Archive du contrat signe | VALIDE |
| `notes_vente` | Contexte pour l'equipe projet | VALIDE |
| `metadata.deal_cycle_days` | Pour analyse performance pipeline | VALIDE |
| `metadata.engagement_score_final` | Pour calibrer l'approche onboarding | VALIDE |

**Resultat : 100% des champs requis sont presents dans l'output Agent 8.**

---

## 3. HEALTH SCORE -- DETAIL COMPLET

### 3.1 Formule detaillee

```
HEALTH SCORE (0-100) =
  ENGAGEMENT (40%) x [
    Login frequency (30%)
    + Email open rate (25%)
    + Contact frequency (20%)
    + Training participation (15%)
    + CTA response rate (10%)
  ]
  + SATISFACTION (30%) x [
    Last NPS normalized (50%)
    + CSAT average (30%)
    + Critical tickets penalty (10%)
    + Communication sentiment (10%)
  ]
  + CROISSANCE (30%) x [
    MRR change normalized (40%)
    + Feature adoption % (30%)
    + Traffic growth normalized (20%)
    + Upsell score (10%)
  ]
```

### 3.2 Seuils et actions detailles

| Score | Couleur | Actions automatiques | Actions manuelles | SLA |
|---|---|---|---|---|
| 80-100 (Vert) | Vert | Tag "promoteur", trigger referral, trigger avis | Planifier upsell conversation | 30 jours |
| 60-79 (Jaune) | Jaune | Email check-in, content nurture | Appel proactif bi-mensuel | 14 jours |
| 50-59 (Orange) | Orange | Alert CSM, email "checking in" | Appel CSM 48h, webinaire offert | 48h |
| 30-49 (Orange fonce) | Orange | Alert manager, remediation plan auto | Account review meeting, credits service | 24h |
| < 30 (Rouge) | Rouge | Alert executive, escalade Jonathan | Intervention fondateur, decision fight/accept | Immediat |

### 3.3 Detection churn -- Precision du modele

**Combinaison 8-12 metriques = 75-85% de precision en prediction churn 60-90 jours avant.**

| Facteur | Poids dans prediction | Signal |
|---|---|---|
| Health Score chute > 20 pts/30j | 25% | Deterioration rapide |
| Usage drops > 40% | 20% | Desengagement |
| NPS < 6 | 15% | Insatisfaction declaree |
| Support tickets x3 | 15% | Problemes non resolus |
| Silence radio > 60j | 10% | Abandon |
| Retard paiement | 10% | Difficulte financiere |
| Sentiment negatif | 5% | Frustration detectee |

### 3.4 Calcul quotidien automatise

```typescript
// CRON : Tous les jours a 8h00
// Calcule le Health Score de chaque client actif

async function dailyHealthScoreCalculation(): Promise<void> {
  const activeClients = await db.getActiveClients()

  for (const client of activeClients) {
    const components = await gatherHealthComponents(client.client_id)
    const result = calculateHealthScore(
      client.client_id,
      client.current_deal_id,
      components
    )

    // Sauvegarder le score
    await db.saveHealthScore(client.client_id, result)

    // Verifier si le score a chute
    const previousScore = await db.getPreviousHealthScore(client.client_id)
    if (previousScore && previousScore.total_score - result.total_score > 20) {
      // Chute de 20+ points = alerte
      await triggerHealthScoreDropAlert(client, previousScore.total_score, result.total_score)
    }

    // Actions selon le niveau
    if (result.color === 'orange' || result.color === 'rouge') {
      // Envoyer au sous-agent churn prevention
      await churnPreventionQueue.add(`churn-check-${client.client_id}`, {
        client_id: client.client_id,
        health_score: result,
      })
    }

    if (result.color === 'vert' && result.total_score >= 80) {
      // Candidat referral/avis
      await referralCandidateQueue.add(`referral-check-${client.client_id}`, {
        client_id: client.client_id,
        health_score: result.total_score,
      })
    }
  }

  // Envoyer metriques a l'Agent 7 (ANALYSTE)
  await sendHealthMetricsToAnalyste(activeClients)
}
```

---

## 4. MATRICE CROSS-SELL AXIOM -- TABLEAU COMPLET

### 4.1 Matrice detaillee avec templates

| # | Depuis | Vers | Prob. | Montant | Timing | Template | Pitch cle |
|---|---|---|---|---|---|---|---|
| 1 | Site vitrine | E-commerce Shopify | 45% | +8 000 EUR | M3-4 | `upsell_ecommerce` | "Votre trafic merite d'etre monetise" |
| 2 | Site vitrine | Tracking server-side | 65% | +990 + 89/mois | M1-2 | `upsell_tracking` | "Comprenez pourquoi vos visiteurs convertissent" |
| 3 | Site vitrine | App Flutter | 15% | +30 000 EUR | M6+ | `upsell_app` | "Vos clients sont sur mobile" |
| 4 | E-commerce | Tracking server-side | 80% | +990 + 89/mois | M1-2 | `upsell_tracking` | "Mesurez chaque conversion avec precision" |
| 5 | E-commerce | App Flutter | 30% | +20 000 EUR | M4-6 | `upsell_app` | "40% des achats sont sur mobile" |
| 6 | App Flutter | Tracking server-side | 70% | +990 + 89/mois | M2 | `upsell_tracking` | "Mesurez l'engagement utilisateur" |
| 7 | App Flutter | App metier | 25% | +15 000 EUR | M6+ | `upsell_app_metier` | "Vos processus internes meritent une app" |
| 8 | App metier | Tracking server-side | 70% | +990 + 89/mois | M2 | `upsell_tracking` | "Suivez l'adoption par vos equipes" |
| 9 | App metier | App Flutter (mobile) | 20% | +20 000 EUR | M6+ | `upsell_app_complement` | "Version mobile pour vos equipes terrain" |
| 10 | RGAA | Site vitrine (refonte) | 35% | +8 000 EUR | M2-3 | `upsell_refonte` | "Profitez de l'audit pour moderniser" |
| 11 | RGAA | E-commerce | 20% | +10 000 EUR | M4-6 | `upsell_ecommerce` | "Site accessible = meilleur taux conversion" |
| 12 | Tracking | Site vitrine | 25% | +7 500 EUR | M3-4 | `upsell_site` | "Les data montrent qu'il faut refondre" |
| 13 | Tracking | E-commerce | 30% | +10 000 EUR | M3-4 | `upsell_ecommerce` | "Vos donnees confirment le potentiel e-commerce" |

### 4.2 Impact LTV par parcours upsell

| Parcours client | LTV sans upsell | LTV avec upsell | Augmentation |
|---|---|---|---|
| Vitrine seul (3 ans) | 22 500 EUR | -- | -- |
| Vitrine + E-commerce (an 2) | -- | 32 500 EUR | +44% |
| Vitrine + E-com + Tracking | -- | 44 636 EUR | +98% |
| E-commerce seul (3 ans) | 25 000 EUR | -- | -- |
| E-commerce + Tracking | -- | 27 068 EUR | +8% |
| App Flutter seul | 45 000 EUR | -- | -- |
| App Flutter + Tracking | -- | 47 058 EUR | +4% |

### 4.3 Retention par nombre de services

| Nombre services | Retention 1 an | Retention 3 ans |
|---|---|---|
| 1 service (initial) | 75% | 45% |
| 2 services (1 upsell) | 88% | 70% |
| 3+ services (multi) | 95% | 88% |

**Chaque service supplementaire augmente la retention de 10-15 points.**

---

## 5. PREVENTION CHURN

### 5.1 Signaux et actions automatiques

#### Signal 1 : Silence radio (60+ jours sans contact)

```
Condition : Aucun login/contact depuis 60 jours
Urgence : CRITIQUE (churn imminent)

Sequence automatique :
  J+60 : Email "On pense a vous" avec case study de succes similaire
  J+75 : SMS ou appel du CSM
  J+90 : Email du fondateur (Jonathan) "Let's reconnect"
  J+120 : Decision finale : offre speciale ou accepter le churn

Objectif : 30-40% de win-back dans les 60 jours
```

#### Signal 2 : Usage drops > 40%

```
Condition : Usage ce mois < 60% de la moyenne historique
Urgence : HAUTE

Sequence automatique :
  Immediat : Alert CSM + manager (Slack)
  J+1 : Appel proactif "On a remarque moins d'activite, tout va bien ?"
  J+7 : Offrir webinaire formation / session guidee
  J+14 : Check-in appel

Objectif : Retour a l'usage normal dans 30 jours
```

#### Signal 3 : Spike support (tickets x3)

```
Condition : Tickets support x3 le taux normal (ex: 5+ en 7 jours vs 1-2)
Urgence : HAUTE

Sequence automatique :
  Immediat : QA review + escalade
  J+1 : Appel executive (pas support) "On a vu des soucis"
  J+3 : Root cause analysis partagee + roadmap de fix
  J+7 : Appel verification "Probleme resolu ?"

Objectif : Resoudre spike + retour taux normal dans 14 jours
```

#### Signal 4 : Retard paiement (15+ jours)

```
Condition : Facture impayee > 15 jours
Urgence : MOYENNE

Sequence automatique :
  J+15 : Rappel email amical automatique
  J+25 : Appel telephonique (professionnel, pas agressif)
  J+35 : Discussion plan de paiement
  J+45 : Notice formelle

Objectif : Paiement recu ou plan en place dans 30 jours
```

#### Signal 5 : NPS detracteur (< 6)

```
Condition : Score NPS recu < 6
Urgence : MOYENNE-HAUTE

Sequence automatique :
  Immediat : Alert CSM + manager
  J+1 : Appel CSM "Merci pour votre honnetete, parlons-en"
  J+7 : Plan d'action partage avec le client
  J+30 : Re-survey pour verifier amelioration

Objectif : Remonter a passif (7+) dans 30 jours
```

#### Signal 6 : Health Score chute > 20 pts/30j

```
Condition : Health Score a baisse de 20+ points en 30 jours
Urgence : HAUTE

Sequence automatique :
  Immediat : Alert CSM + directeur
  J+1 : Revue contexte client (interactions, usage, tickets, sentiment)
  J+1 : Appel 30 min CSM dans les 24h
  J+7 : Si probleme identifie : fix + deadline
  J+7 : Si malentendu : re-baseline health score

Objectif : 50% des clients "jaune" retournent en "vert" dans 30 jours
```

### 5.2 Playbook par niveau de sante

```
NIVEAU VERT (80-100) -- Croissance
  Actions : Upsell, referral, avis, celebration succes
  Frequence contact : Mensuel (proactif)
  Objectif : Maximiser LTV

NIVEAU JAUNE (60-79) -- Monitoring
  Actions : Check-in proactif, contenu valeur, re-engagement
  Frequence contact : Bi-mensuel (proactif)
  Objectif : Remonter en vert

NIVEAU ORANGE (50-59) -- Intervention
  Actions : Appel CSM 48h, webinaire offert, credits service
  Frequence contact : Hebdomadaire (reactif)
  Objectif : Stabiliser et remonter

NIVEAU ORANGE FONCE (30-49) -- Remediation
  Actions : Account review meeting, plan remediation, offre speciale
  Frequence contact : 2x/semaine (reactif intensif)
  Objectif : Eviter le rouge

NIVEAU ROUGE (< 30) -- Crise
  Actions : Intervention executive, appel Jonathan, decision fight/accept
  Frequence contact : Quotidien (crise)
  Objectif : Sauver le client ou exit propre
```

### 5.3 Benchmarks retention agences web

| Modele commercial | Churn annuel | Churn 6 mois | Duree vie client |
|---|---|---|---|
| Retainer (maintenance mensuelle) | 18% | 8% | 56 mois |
| Hybride (projet + maintenance) | 28% | ~14% | 36 mois |
| Performance-based | 33% | ~15% | 30 mois |
| Projet uniquement | 42% | 28% | 24 mois |

| Taille agence | Churn annuel | CA |
|---|---|---|
| 1-10 employes | 32% | < 1M EUR |
| 11-25 employes | 24% | 1-5M EUR |
| 26-50 employes | 19% | 5-10M EUR |
| 51+ employes | 15% | 10M+ EUR |

**Cible Axiom :** Churn < 20% annuel (modele hybride projet + tracking recurrent).
**CLV:CAC cible :** Minimum 3:1, idealement 4:1+.

### 5.4 Impact financier retention

```
Client moyen Axiom : ~10 000 EUR/an
CAC moyen : ~3 000 EUR (30% du contrat)
CLV (3 ans) : 30 000 EUR

Si churn passe de 30% a 18% (retainer) :
  - 12 clients supplementaires retenus sur 100
  - Valeur sauvee : 12 x 30 000 EUR = 360 000 EUR
  - Cout intervention preventive : ~300 EUR/client x 12 = 3 600 EUR
  - ROI : 100:1

Impact retention +5% :
  - +25 a 95% de profit supplementaire
  - Source : Harvard Business Review
```

---

## 6. OUTPUT : SCHEMAS JSON

### 6.1 Output vers Agent 1 (VEILLEUR) -- Leads referral

Envoye via la queue BullMQ `veilleur-referral-leads` quand un ambassadeur soumet un referral.

```typescript
interface ReferralToAgent1 {
  type: 'referral_lead'
  referral_id: string

  referred_by: {
    client_id: string
    referral_code: string
  }

  lead: {
    prenom: string
    nom: string
    email: string
    entreprise: string
    besoin: string
    source: 'referral'
  }

  priority_boost: number               // +40 points au lead score

  metadata: {
    agent: 'agent_10_csm'
    created_at: string                  // ISO 8601
    version: string
  }
}
```

### 6.2 Output vers Agent 7 (ANALYSTE) -- Metriques CSM

Envoye via la queue BullMQ `analyste-csm-metrics` quotidiennement et sur evenement.

```typescript
// Snapshot quotidien (envoye chaque jour a 8h30)
interface CSMMetricsSnapshot {
  type: 'csm_daily_snapshot'
  date: string                          // ISO 8601

  // Health Score distribution
  health_distribution: {
    vert: number                        // Nombre clients score 80-100
    jaune: number                       // 60-79
    orange: number                      // 50-59
    orange_fonce: number                // 30-49
    rouge: number                       // < 30
  }

  // Moyennes
  avg_health_score: number
  avg_nps: number
  avg_csat: number

  // Churn
  churn_risk_count: number              // Clients avec churn_risk = true
  churned_this_month: number
  churn_rate_monthly: number            // %
  churn_rate_annualized: number         // %

  // Retention
  retention_rate_monthly: number        // %
  net_revenue_retention: number         // % (NRR)
  avg_customer_lifetime_months: number

  // Upsell
  upsell_opportunities_active: number
  upsell_revenue_pipeline: number       // EUR
  upsell_conversion_rate: number        // %
  cross_sell_rate: number               // %

  // Avis
  avg_review_score: number              // /5
  total_reviews_collected: number
  review_response_rate: number          // %

  // Referral
  active_ambassadors: number
  referrals_submitted_month: number
  referrals_converted_month: number
  referral_conversion_rate: number      // %
  total_commission_paid_month: number   // EUR

  // Onboarding
  active_onboardings: number
  avg_ttv_days: number
  onboarding_completion_rate: number    // %
  at_risk_onboardings: number

  metadata: {
    agent: 'agent_10_csm'
    generated_at: string
    total_active_clients: number
    version: string
  }
}

// Event ponctuel
interface CSMEvent {
  type: 'churn_detected' | 'upsell_opportunity' | 'referral_converted'
    | 'review_collected' | 'health_score_drop' | 'onboarding_at_risk'
    | 'nps_detracteur'
  client_id: string
  deal_id: string
  date: string

  // Donnees specifiques a l'event
  details: Record<string, any>

  metadata: {
    agent: 'agent_10_csm'
    created_at: string
    version: string
  }
}
```

### 6.3 Output vers Agent 6 (NURTUREUR) -- Client churne

Envoye via la queue BullMQ `nurturer-churned-client` quand un client est confirme churne (Health Score rouge prolonge + confirmation).

```typescript
interface ChurnedClientToAgent6 {
  type: 'churned_client'
  client_id: string
  deal_id: string

  // Informations client
  client: {
    prenom: string
    nom: string
    email: string
    telephone?: string
    entreprise_nom: string
    secteur: string
    poste: string
  }

  // Historique du churn
  churn_reason: 'insatisfaction' | 'budget' | 'concurrent' | 'silence' | 'interne' | 'autre'
  churn_detail: string                  // Description detaillee
  last_health_score: number
  last_nps_score: number
  last_contact_date: string             // ISO 8601

  // Historique engagement
  total_revenue: number                 // Revenue total genere
  services_utilises: string[]           // Types de projets realises
  duree_relation_mois: number
  nb_projets_realises: number

  // Recommandation win-back
  win_back_strategy: string             // Strategie suggeree
  recontact_date: string                // ISO 8601, date suggeree
  offre_speciale_suggeree?: string      // Discount ou service gratuit

  metadata: {
    agent: 'agent_10_csm'
    created_at: string
    version: string
  }
}
```

### 6.4 Output vers Agent 8 (DEALMAKER) -- Opportunite upsell

Envoye via la queue BullMQ `dealmaker-upsell` quand une opportunite upsell est qualifiee (score >= 60 et aucun blocker).

```typescript
interface UpsellToAgent8 {
  type: 'upsell_opportunity'
  client_id: string
  existing_deal_id: string

  // Client existant
  client: {
    prenom: string
    nom: string
    email: string
    telephone?: string
    entreprise_nom: string
    siret: string
    secteur: string
    site_web: string
  }

  // Opportunite
  upsell: {
    product_target: 'site_vitrine' | 'ecommerce_shopify' | 'app_flutter'
      | 'app_metier' | 'rgaa' | 'tracking_server_side'
    estimated_value: number             // EUR
    upsell_score: number                // 0-100
    priority: 'high' | 'medium'
    signals_detected: string[]          // Ex: ['croissance_trafic', 'demande_feature']
    recommended_timing: string          // Ex: "Mois 3-4"
    template_id: string                 // ID du template email upsell
  }

  // Contexte relation
  current_services: string[]            // Services actuels du client
  health_score: number
  last_nps_score: number
  customer_since: string                // ISO 8601
  total_revenue_to_date: number

  // Notes utiles pour le closing
  notes: string                         // Contexte, objections potentielles, points d'entree

  metadata: {
    agent: 'agent_10_csm'
    created_at: string
    version: string
  }
}
```

---

## 7. COUTS

### 7.1 Outils SaaS

| Outil | Usage | Cout mensuel | Cout annuel |
|---|---|---|---|
| **Typeform** | Surveys NPS/CSAT/CES | 50 EUR/mois (Pro) | 600 EUR |
| **SurveyMonkey** | Alternative surveys | 32 EUR/mois (Pro) | 384 EUR |
| **CRM (HubSpot ou Pipedrive)** | Gestion clients, health score, workflows | 0-50 EUR/mois | 0-600 EUR |
| **Asana/Monday** | Gestion projets onboarding | 25-50 EUR/mois | 300-600 EUR |
| **Slack** | Notifications internes | Inclus (workspace existant) | 0 EUR |
| **Google Workspace** | Drive, Forms, Sheets | Inclus (workspace existant) | 0 EUR |

### 7.2 Infrastructure

| Composant | Cout mensuel | Cout annuel |
|---|---|---|
| **Redis (BullMQ queues)** | 15-30 EUR/mois | 180-360 EUR |
| **Base de donnees** | Inclus (partage avec autres agents) | 0 EUR |
| **Serveur workers** | 25-50 EUR/mois (partage) | 300-600 EUR |
| **Monitoring (Sentry, logs)** | 10-25 EUR/mois | 120-300 EUR |

### 7.3 Cout total Agent 10

| Categorie | Minimum | Maximum |
|---|---|---|
| Outils SaaS | 75 EUR/mois | 150 EUR/mois |
| Infrastructure | 50 EUR/mois | 105 EUR/mois |
| **Total mensuel** | **125 EUR/mois** | **255 EUR/mois** |
| **Total annuel** | **1 500 EUR/an** | **3 060 EUR/an** |

### 7.4 ROI estime

```
Cout annuel Agent 10 : ~2 000 EUR
Revenu sauve par retention (+5%) : ~36 000 EUR (sur 100 clients a 10K avg)
Revenu upsell (20% clients, 3 000 EUR avg) : ~60 000 EUR
Revenu referral (5 referrals/an, 10 000 EUR avg) : ~50 000 EUR

ROI total : (146 000 - 2 000) / 2 000 = 7 200%
```

---

## 8. VERIFICATION DE COHERENCE & SCHEMA GLOBAL 10 AGENTS

### 8.1 Input Agent 10 == Output Agent 8

```
VERIFICATION :

Output Agent 8 (DealToCSM) :
  - deal_id                    --> Recu et utilise par Agent 10   OK
  - prospect_id                --> Recu et utilise par Agent 10   OK
  - prospect.prenom/nom/email  --> Utilise pour emails            OK
  - prospect.telephone         --> Utilise pour appels             OK
  - prospect.linkedin_url      --> Utilise pour referral           OK
  - prospect.poste             --> Personnalisation communications OK
  - entreprise.nom/siret       --> Facturation et suivi            OK
  - entreprise.site_web        --> Monitoring post-livraison       OK
  - entreprise.secteur         --> Personnalisation templates      OK
  - entreprise.taille          --> Segmentation                    OK
  - contrat.montant_ht         --> Calcul valeur client            OK
  - contrat.tier               --> Niveau de service adapte        OK
  - contrat.type_projet        --> Routing workflow onboarding     OK
  - contrat.scope_detaille     --> Backlog projet                  OK
  - contrat.date_signature     --> Calcul TTV                      OK
  - contrat.date_demarrage     --> Planning kickoff                OK
  - contrat.duree_estimee      --> Jalons                          OK
  - contrat.conditions_paiement --> Facturation                    OK
  - contrat.contrat_pdf_url    --> Archive                         OK
  - notes_vente                --> Contexte equipe projet          OK
  - metadata.*                 --> Analyse performance pipeline    OK

RESULTAT : 100% COMPATIBLE -- Tous les champs sont recus et utilises.
```

### 8.2 Outputs Agent 10 compatibles avec destinataires

#### Output vers Agent 1 (VEILLEUR) -- Referrals

| Champ output Agent 10 (ReferralToAgent1) | Requis par Agent 1 | Statut |
|---|---|---|
| `lead.prenom/nom/email` | Pour identifier et enrichir le prospect | VALIDE |
| `lead.entreprise` | Pour recherche firmographique | VALIDE |
| `lead.besoin` | Pour qualifier le besoin | VALIDE |
| `lead.source = 'referral'` | Pour tagger la source dans le pipeline | VALIDE |
| `priority_boost` (+40) | Pour prioriser dans le scoring | VALIDE |
| `referred_by.client_id` | Pour tracer l'ambassadeur | VALIDE |

#### Output vers Agent 7 (ANALYSTE) -- Metriques

| Champ output Agent 10 (CSMMetricsSnapshot) | Requis par Agent 7 | Statut |
|---|---|---|
| `health_distribution` | Pour dashboard sante clients | VALIDE |
| `churn_rate_*` | Pour analyse retention | VALIDE |
| `net_revenue_retention` | Pour KPI financier | VALIDE |
| `upsell_*` | Pour pipeline expansion | VALIDE |
| `referral_*` | Pour tracking programme referral | VALIDE |
| `onboarding_*` | Pour suivi TTV et onboarding | VALIDE |

#### Output vers Agent 6 (NURTUREUR) -- Churn

| Champ output Agent 10 (ChurnedClientToAgent6) | Requis par Agent 6 | Statut |
|---|---|---|
| `client.*` | Pour communications win-back | VALIDE |
| `churn_reason/detail` | Pour adapter strategie nurture | VALIDE |
| `last_health_score/nps` | Pour comprendre le contexte | VALIDE |
| `win_back_strategy` | Pour guider le contenu win-back | VALIDE |
| `recontact_date` | Pour planifier la reprise | VALIDE |
| `services_utilises` | Pour personnaliser l'offre | VALIDE |

#### Output vers Agent 8 (DEALMAKER) -- Upsell

| Champ output Agent 10 (UpsellToAgent8) | Requis par Agent 8 | Statut |
|---|---|---|
| `client.*` | Pour generer devis upsell | VALIDE |
| `upsell.product_target` | Pour router vers le bon tiering | VALIDE |
| `upsell.estimated_value` | Pour le devis | VALIDE |
| `upsell.signals_detected` | Pour personnaliser l'approche | VALIDE |
| `current_services` | Pour eviter doublons | VALIDE |
| `health_score/nps` | Pour valider la readiness | VALIDE |

### 8.3 Resume de coherence Agent 10

```
COHERENCE GLOBALE AGENT 10 : 100% VALIDE

Input Agent 10 :
  - DealToCSM (Agent 8 via BullMQ)        --> OK, 100% champs compatibles

Output Agent 10 :
  - Vers Agent 1 (VEILLEUR) : Referrals   --> OK, tous champs presents
  - Vers Agent 7 (ANALYSTE) : Metriques   --> OK, tous champs presents
  - Vers Agent 6 (NURTUREUR) : Churn      --> OK, tous champs presents
  - Vers Agent 8 (DEALMAKER) : Upsell     --> OK, tous champs presents
```

---

### 8.4 SCHEMA GLOBAL 10 AGENTS -- FLUX COMPLET

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    AXIOM MARKETING -- SYSTEME 10 AGENTS                     ║
║                    Pipeline de Prospection B2B Automatise                    ║
╚═══════════════════════════════════════════════════════════════════════════════╝

  ┌─────────────────────────────────────────────────────────────────────┐
  │                    PHASE 1 : DECOUVERTE & QUALIFICATION             │
  └─────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
  │  AGENT 1          │     │  AGENT 2          │     │  AGENT 3          │
  │  VEILLEUR         │────>│  ENRICHISSEUR     │────>│  SCOREUR          │
  │                   │     │                   │     │                   │
  │  - Scraping web   │     │  - Firmographics  │     │  - ICP scoring    │
  │  - Apollo/Hunter  │     │  - Technographics │     │  - Lead scoring   │
  │  - LinkedIn       │     │  - Intent data    │     │  - Segmentation   │
  │  - Referrals (10) │     │  - Email valid.   │     │  - Priorisation   │
  └──────────────────┘     └──────────────────┘     └──────────────────┘
         ^                                                    │
         │                                                    v
         │                                          ┌──────────────────┐
         │                                          │  AGENT 4          │
         │                                          │  REDACTEUR        │
         │                                          │                   │
         │                                          │  - Emails perso   │
         │                                          │  - LinkedIn msgs  │
         │                                          │  - Follow-ups     │
         │                                          │  - A/B testing    │
         │                                          └──────────────────┘
         │                                                    │
         │                                                    v
  ┌──────┴───────────────────────────────────────────────────────────────┐
  │                    PHASE 2 : ENGAGEMENT & SUIVI                      │
  └──────────────────────────────────────────────────────────────────────┘
         │
         │                                          ┌──────────────────┐
         │                                          │  AGENT 5          │
         │                                          │  SUIVEUR          │
         │                                          │                   │
         │                                          │  - Reply classif. │
         │                                          │  - Multi-touch    │
         │                                          │  - Calendly book  │
         │                                          │  - Intent detect  │
         │                                          └──────────────────┘
         │                                                    │
         │                              ┌─────────────────────┼──────────┐
         │                              │                     │          │
         │                              v                     v          v
         │                    ┌──────────────┐    ┌────────────────┐ ┌───────┐
         │                    │  INTERESSE    │    │  PAS INTERESSE │ │ AUTRE │
         │                    │  (RDV)        │    │  (Nurture)     │ │       │
         │                    └──────┬───────┘    └───────┬────────┘ └───────┘
         │                           │                    │
         │                           v                    v
  ┌──────┴───────────────────────────────────────────────────────────────┐
  │                    PHASE 3 : NURTURING & CLOSING                     │
  └──────────────────────────────────────────────────────────────────────┘
         │
         │                    ┌──────────────────┐
         │                    │  JONATHAN         │
         │                    │  (RDV Decouverte) │
         │                    │                   │
         │                    │  - Appel humain   │
         │                    │  - Qualification  │
         │                    │  - Notes saisies  │
         │                    └──────────────────┘
         │                              │
         │                              v
         │                    ┌──────────────────┐     ┌──────────────────┐
         │                    │  AGENT 8          │     │  AGENT 9          │
         │                    │  DEALMAKER         │     │  APPELS D'OFFRES  │
         │                    │                   │     │                   │
         │                    │  - Devis auto     │     │  - BOAMP/JOUE     │
         │                    │  - Relance intel. │     │  - Analyse DCE    │
         │                    │  - Yousign e-sign │     │  - Generation RC  │
         │                    │  - Objections     │     │  - Scoring AO     │
         │                    └──────────────────┘     └──────────────────┘
         │                        │         │
         │              ┌─────────┼─────────┼───────┐
         │              │         │         │       │
         │              v         v         v       v
         │         ┌────────┐ ┌──────┐ ┌────────┐
         │         │ SIGNE  │ │PERDU │ │METRICS │
         │         └───┬────┘ └──┬───┘ └───┬────┘
         │             │         │         │
  ┌──────┴──────────── │ ────────│─────────│────────────────────────────┐
  │                    │ PHASE 4 │: POST-  │VENTE & RETENTION           │
  └────────────────────│─────────│─────────│────────────────────────────┘
                       │         │         │
                       v         │         v
              ┌──────────────────┐│    ┌──────────────────┐
              │  AGENT 10         ││    │  AGENT 7          │
              │  CSM              ││    │  ANALYSTE         │
              │                   ││    │                   │
              │  10a Onboardeur   ││    │  - Pipeline KPIs  │
              │  10b Upsell       ││    │  - Conversion     │
              │  10c Satisfaction ││    │  - Predictions     │
              │  10d Avis         ││    │  - Rapports        │
              │  10e Referral     ││    │  - Recommandations │
              └──────────────────┘│    └──────────────────┘
                  │  │  │  │      │              ^
                  │  │  │  │      v              │
                  │  │  │  │  ┌──────────────────┐│
                  │  │  │  │  │  AGENT 6          ││
                  │  │  │  │  │  NURTUREUR        ││
                  │  │  │  │  │                   ││
                  │  │  │  │  │  - Win-back       ││
                  │  │  │  │  │  - Re-nurture     ││
                  │  │  │  │  │  - Long terme     ││
                  │  │  │  │  └──────────────────┘│
                  │  │  │  │                       │
                  │  │  │  └── Metriques CSM ──────┘
                  │  │  └───── Churn ──────> Agent 6
                  │  └──────── Upsell ─────> Agent 8 (boucle)
                  └─────────── Referrals ──> Agent 1 (boucle)


  ╔═════════════════════════════════════════════════════════════════╗
  ║  BOUCLES DE RETOUR (FEEDBACK LOOPS) :                         ║
  ║                                                                ║
  ║  1. Agent 10 (Referral) ──> Agent 1 (nouveau lead warm)       ║
  ║     Conversion 30-40% vs 1-3% cold                            ║
  ║                                                                ║
  ║  2. Agent 10 (Upsell) ──> Agent 8 (closing upsell)            ║
  ║     3-5x moins cher que new business                          ║
  ║                                                                ║
  ║  3. Agent 10 (Churn) ──> Agent 6 (win-back)                   ║
  ║     5-15% recovery rate, 30% du CAC                           ║
  ║                                                                ║
  ║  4. Agent 6 (Win-back reussi) ──> Agent 10 (re-onboarding)    ║
  ║     Client recupere = nouveau cycle CSM                       ║
  ║                                                                ║
  ║  5. Agent 10 (Metriques) ──> Agent 7 (analyse globale)        ║
  ║     Dashboard complet pipeline + retention                     ║
  ╚═════════════════════════════════════════════════════════════════╝
```

### 8.5 Flux de donnees inter-agents -- Resume

| De | Vers | Donnee | Queue BullMQ | Priorite |
|---|---|---|---|---|
| Agent 1 | Agent 2 | Prospect brut | `enrichisseur-prospects` | Normal |
| Agent 2 | Agent 3 | Prospect enrichi | `scoreur-prospects` | Normal |
| Agent 3 | Agent 4 | Prospect score | `redacteur-sequences` | Normal |
| Agent 4 | Agent 5 | Sequence envoyee | `suiveur-tracking` | Normal |
| Agent 5 | Agent 8 | Prospect INTERESSE | `dealmaker-pipeline` | Haute |
| Agent 5 | Agent 6 | Prospect PAS INTERESSE | `nurturer-prospects` | Normal |
| Agent 8 | **Agent 10** | **Deal signe (DealToCSM)** | **`csm-onboarding`** | **Haute** |
| Agent 8 | Agent 7 | Metriques deal | `analyste-metrics` | Normal |
| Agent 8 | Agent 6 | Deal perdu | `nurturer-lost-deal` | Normal |
| **Agent 10** | **Agent 1** | **Lead referral** | **`veilleur-referral-leads`** | **Haute** |
| **Agent 10** | **Agent 7** | **Metriques CSM** | **`analyste-csm-metrics`** | **Normal** |
| **Agent 10** | **Agent 6** | **Client churne** | **`nurturer-churned-client`** | **Haute** |
| **Agent 10** | **Agent 8** | **Opportunite upsell** | **`dealmaker-upsell`** | **Normal** |
| Agent 6 | Agent 10 | Win-back reussi | `csm-onboarding` | Haute |
| Agent 7 | Tous | Rapports/alertes | Slack + dashboard | Variable |
| Agent 9 | Agent 8 | AO qualifie | `dealmaker-pipeline` | Haute |

### 8.6 Coherence globale systeme 10 agents

```
╔══════════════════════════════════════════════════════════════╗
║           COHERENCE GLOBALE : 100% VALIDE               ║
╠══════════════════════════════════════════════════════════════╣
║                                                          ║
║  Agent 1  (VEILLEUR)        Input: Web/APIs/Referrals    ║
║                              Output: --> Agent 2    OK   ║
║                                                          ║
║  Agent 2  (ENRICHISSEUR)    Input: Agent 1          OK   ║
║                              Output: --> Agent 3    OK   ║
║                                                          ║
║  Agent 3  (SCOREUR)         Input: Agent 2          OK   ║
║                              Output: --> Agent 4    OK   ║
║                                                          ║
║  Agent 4  (REDACTEUR)       Input: Agent 3          OK   ║
║                              Output: --> Agent 5    OK   ║
║                                                          ║
║  Agent 5  (SUIVEUR)         Input: Agent 4          OK   ║
║                              Output: --> Agent 8    OK   ║
║                              Output: --> Agent 6    OK   ║
║                                                          ║
║  Agent 6  (NURTUREUR)       Input: Agent 5/8/10     OK   ║
║                              Output: --> Agent 10   OK   ║
║                                                          ║
║  Agent 7  (ANALYSTE)        Input: Agent 8/10       OK   ║
║                              Output: Dashboard      OK   ║
║                                                          ║
║  Agent 8  (DEALMAKER)       Input: Agent 5/10       OK   ║
║                              Output: --> Agent 10   OK   ║
║                              Output: --> Agent 7    OK   ║
║                              Output: --> Agent 6    OK   ║
║                                                          ║
║  Agent 9  (APPELS D'OFFRES) Input: BOAMP/JOUE       OK   ║
║                              Output: --> Agent 8    OK   ║
║                                                          ║
║  Agent 10 (CSM)             Input: Agent 8          OK   ║
║                              Output: --> Agent 1    OK   ║
║                              Output: --> Agent 7    OK   ║
║                              Output: --> Agent 6    OK   ║
║                              Output: --> Agent 8    OK   ║
║                                                          ║
║  BOUCLES FERMEES :                                       ║
║  Agent 10 --> Agent 1 (referrals)              OK        ║
║  Agent 10 --> Agent 8 (upsell)                 OK        ║
║  Agent 10 --> Agent 6 (churn)                  OK        ║
║  Agent 6  --> Agent 10 (win-back)              OK        ║
║                                                          ║
║  SYSTEME COMPLET : TOUTES CONNEXIONS VALIDEES            ║
╚══════════════════════════════════════════════════════════════╝
```

---

## ANNEXE : METRIQUES CLES DE SUCCES AGENT 10

| KPI | Cible | Frequence mesure |
|---|---|---|
| Health Score moyen | > 75 | Quotidien |
| NPS moyen | > 50 | Trimestriel |
| CSAT moyen | > 80% | Post-interaction |
| Churn rate annuel | < 20% | Mensuel |
| NRR (Net Revenue Retention) | > 108% | Mensuel |
| TTV moyen (tous projets) | < 14 jours | Par projet |
| Taux completion onboarding | > 70% | Par projet |
| Taux conversion upsell | > 20% | Trimestriel |
| Taux conversion referral | > 30% | Mensuel |
| Nombre avis Google/Trustpilot | > 5/mois | Mensuel |
| Score moyen avis | > 4.5/5 | Mensuel |
| Ambassadeurs actifs | > 20% des clients | Trimestriel |
| ROI programme referral | > 500% | Annuel |
| Cout retention vs acquisition | < 20% du CAC | Annuel |

---

**FIN DU DOCUMENT -- AGENT 10 CSM (MASTER) -- DERNIER AGENT DU SYSTEME AXIOM MARKETING**

*Ce document boucle le systeme complet de 10 agents. Toutes les connexions inter-agents sont validees. Le pipeline est un circuit ferme avec 4 boucles de retour (referral, upsell, churn, win-back) qui maximisent la Customer Lifetime Value.*
