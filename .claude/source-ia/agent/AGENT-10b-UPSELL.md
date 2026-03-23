# SOUS-AGENT 10b — DETECTEUR UPSELL
**Agent parent** : AGENT-10-MASTER.md

**Version :** 1.0
**Date :** 2026-03-19

---

## 1. MISSION

Le Detecteur Upsell identifie les opportunites de cross-sell et upsell parmi les clients existants d'Axiom, en analysant les signaux comportementaux, la sante du compte, et le timing optimal. Il score chaque opportunite et genere des propositions personnalisees.

**Regle cardinale :** Ne JAMAIS proposer d'upsell si le client est en difficulte, insatisfait, ou n'a pas atteint le Time-to-Value.

---

## 2. MATRICE CROSS-SELL PAR SERVICE AXIOM

| Depuis (service actuel) | Vers (upsell) | Probabilite | Montant moyen | Timing optimal | Effort closing |
|---|---|---|---|---|---|
| Site vitrine | E-commerce Shopify | 45% | +8 000 EUR | Mois 3-4 | Moyen |
| Site vitrine | Tracking server-side | 65% | +990 EUR + 89 EUR/mois | Mois 1-2 | Faible |
| Site vitrine | App Flutter | 15% | +30 000 EUR | Mois 6+ | Eleve |
| E-commerce Shopify | Tracking server-side | 80% | +990 EUR + 89 EUR/mois | Mois 1-2 | Faible |
| E-commerce Shopify | App Flutter | 30% | +20 000 EUR | Mois 4-6 | Eleve |
| App Flutter | Tracking server-side | 70% | +990 EUR + 89 EUR/mois | Mois 2 | Faible |
| App Flutter | App metier | 25% | +15 000 EUR | Mois 6+ | Eleve |
| App metier | Tracking server-side | 70% | +990 EUR + 89 EUR/mois | Mois 2 | Faible |
| App metier | App Flutter (complement) | 20% | +20 000 EUR | Mois 6+ | Eleve |
| RGAA | Site vitrine (refonte) | 35% | +8 000 EUR | Mois 2-3 | Moyen |
| RGAA | E-commerce Shopify | 20% | +10 000 EUR | Mois 4-6 | Moyen |
| Tracking server-side | Site vitrine | 25% | +7 500 EUR | Mois 3-4 | Moyen |
| Tracking server-side | E-commerce Shopify | 30% | +10 000 EUR | Mois 3-4 | Moyen |

**Insight strategique :** Le tracking server-side est le "golden cross-sell" -- plus haute probabilite (65-80%), revenu recurrent, et friction minimale.

---

## 3. SIGNAUX COMPORTEMENTAUX DE DETECTION

| Signal | Definition | Timing detection | Probabilite upsell |
|---|---|---|---|
| Usage au-dela du scope | Client utilise plus de pages/produits que prevu | Mois 2-3 | 60% |
| Demande de feature | "Peut-on ajouter X ?" = besoin croissant | Mois 2-4 | 55% |
| Croissance trafic/ventes | Client rapporte +50% trafic ou ventes | Mois 2-3 | 70% |
| Expansion equipe | "On recrute 3 personnes dans [departement]" | Mois 3-6 | 65% |
| Outil complementaire | Client utilise outils externes pour combler un manque | Mois 2-4 | 75% |
| Demande integration | "Peut-on connecter ca a [outil] ?" | Mois 1-3 | 80% |
| Approbation budget | Client approuve budget supplementaire | Anytime | 70% |
| Levee de fonds | Client annonce financement / Serie A | Mois 3-6 | 65% |
| Croissance publique | Client promeut son produit sur LinkedIn/PR | Mois 3-6 | 60% |

---

## 4. SCORING OPPORTUNITE UPSELL (0-100)

```typescript
// ============================================================
// SCORING UPSELL
// ============================================================

interface UpsellSignals {
  // Product Health (0-30 pts)
  dashboard_active_weekly: boolean       // Client actif 3+/semaine : +15 pts
  zero_complaints_60days: boolean        // Zero plainte 60 jours : +8 pts
  project_on_time_budget: boolean        // Projet dans les temps/budget : +7 pts

  // Usage Growth (0-25 pts)
  traffic_growth_50pct: boolean          // Trafic/usage +50% depuis lancement : +15 pts
  feature_usage_80pct: boolean           // Utilise 80%+ des features : +10 pts

  // Budget Signals (0-20 pts)
  budget_approved: boolean               // Budget supplementaire approuve : +20 pts
  company_growth: boolean                // Entreprise en croissance (financement, CA) : +15 pts
  feature_request_paid: boolean          // Demande feature payante : +10 pts

  // Relationship Strength (0-15 pts)
  nps_promoter: boolean                  // NPS > 8 : +10 pts
  regular_communication: boolean         // Communication hebdo/bi-hebdo : +5 pts

  // Timeline Fit (0-10 pts)
  days_since_launch: number              // 30+ jours post-lancement : +5 pts
  pre_renewal_window: boolean            // 6 mois avant renouvellement : +10 pts
  no_active_crisis: boolean              // Pas de crise en cours : +3 pts
}

interface UpsellOpportunity {
  client_id: string
  deal_id: string
  score: number
  priority: 'high' | 'medium' | 'low' | 'not_ready'
  recommended_product: string
  recommended_timing: string
  estimated_revenue: number
  template_id: string
  signals_detected: string[]
  blocker_reasons: string[]
}

function calculateUpsellScore(signals: UpsellSignals): number {
  let score = 0

  // 1. Product Health (0-30 pts)
  if (signals.dashboard_active_weekly) score += 15
  if (signals.zero_complaints_60days) score += 8
  if (signals.project_on_time_budget) score += 7

  // 2. Usage Growth (0-25 pts)
  if (signals.traffic_growth_50pct) score += 15
  if (signals.feature_usage_80pct) score += 10

  // 3. Budget Signals (0-20 pts)
  if (signals.budget_approved) score += 20
  else if (signals.company_growth) score += 15
  else if (signals.feature_request_paid) score += 10

  // 4. Relationship Strength (0-15 pts)
  if (signals.nps_promoter) score += 10
  if (signals.regular_communication) score += 5

  // 5. Timeline Fit (0-10 pts)
  if (signals.pre_renewal_window) score += 10
  else if (signals.days_since_launch >= 30) score += 5
  if (signals.no_active_crisis) score += 3

  // Plafonner a 100
  return Math.min(score, 100)
}

function evaluateUpsellOpportunity(
  clientId: string,
  dealId: string,
  signals: UpsellSignals,
  currentService: string,
  healthScore: number,
  npsScore: number
): UpsellOpportunity {
  const score = calculateUpsellScore(signals)

  // Verifier les blockers
  const blockerReasons: string[] = []
  if (healthScore < 50) blockerReasons.push('Health score trop bas')
  if (npsScore < 6) blockerReasons.push('NPS detracteur')
  if (signals.days_since_launch < 30) blockerReasons.push('Trop tot post-lancement')
  if (!signals.no_active_crisis) blockerReasons.push('Crise en cours')

  // Determiner la priorite
  let priority: UpsellOpportunity['priority']
  if (blockerReasons.length > 0) {
    priority = 'not_ready'
  } else if (score >= 80) {
    priority = 'high'
  } else if (score >= 60) {
    priority = 'medium'
  } else if (score >= 40) {
    priority = 'low'
  } else {
    priority = 'not_ready'
  }

  // Recommander le produit optimal
  const recommendation = getRecommendedUpsell(currentService, signals)

  // Signaux detectes
  const detectedSignals: string[] = []
  if (signals.dashboard_active_weekly) detectedSignals.push('usage_actif')
  if (signals.traffic_growth_50pct) detectedSignals.push('croissance_trafic')
  if (signals.budget_approved) detectedSignals.push('budget_approuve')
  if (signals.feature_request_paid) detectedSignals.push('demande_feature')
  if (signals.company_growth) detectedSignals.push('croissance_entreprise')
  if (signals.nps_promoter) detectedSignals.push('nps_promoteur')

  return {
    client_id: clientId,
    deal_id: dealId,
    score,
    priority,
    recommended_product: recommendation.product,
    recommended_timing: recommendation.timing,
    estimated_revenue: recommendation.revenue,
    template_id: recommendation.templateId,
    signals_detected: detectedSignals,
    blocker_reasons: blockerReasons,
  }
}

function getRecommendedUpsell(
  currentService: string,
  signals: UpsellSignals
): { product: string; timing: string; revenue: number; templateId: string } {
  // Tracking server-side est TOUJOURS la premiere recommandation (golden cross-sell)
  const hasTracking = false // A verifier en BDD

  if (!hasTracking) {
    return {
      product: 'tracking_server_side',
      timing: 'Mois 1-2 post-lancement',
      revenue: 990 + 89 * 12, // 2 058 EUR annuel
      templateId: 'upsell_tracking',
    }
  }

  // Sinon, matrice par service actuel
  const upsellMatrix: Record<string, { product: string; timing: string; revenue: number; templateId: string }> = {
    site_vitrine: { product: 'ecommerce_shopify', timing: 'Mois 3-4', revenue: 8000, templateId: 'upsell_ecommerce' },
    ecommerce_shopify: { product: 'app_flutter', timing: 'Mois 4-6', revenue: 20000, templateId: 'upsell_app' },
    app_flutter: { product: 'app_metier', timing: 'Mois 6+', revenue: 15000, templateId: 'upsell_app_metier' },
    app_metier: { product: 'app_flutter', timing: 'Mois 6+', revenue: 20000, templateId: 'upsell_app_complement' },
    rgaa: { product: 'site_vitrine', timing: 'Mois 2-3', revenue: 8000, templateId: 'upsell_refonte' },
    tracking_server_side: { product: 'ecommerce_shopify', timing: 'Mois 3-4', revenue: 10000, templateId: 'upsell_ecommerce' },
  }

  return upsellMatrix[currentService] || {
    product: 'tracking_server_side',
    timing: 'Mois 2',
    revenue: 2058,
    templateId: 'upsell_tracking',
  }
}
```

---

## 5. CONDITIONS DE BLOCAGE -- QUAND NE PAS PROPOSER D'UPSELL

**Blockers absolus -- NE JAMAIS proposer si :**

| Condition | Raison | Action alternative |
|---|---|---|
| Projet en retard 2+ semaines | Client frustre, mauvais timing | Focus livraison |
| Client a escalade un probleme | Confiance cassee | Resolution + 30 jours cooling |
| Bugs non resolus sur core | Valeur actuelle pas demontree | Fix d'abord |
| Presence aux calls < 50% | Engagement insuffisant | Re-engager d'abord |
| NPS < 6 (Detracteur) | Client insatisfait | Intervention retention |
| Plaintes multiples non resolues | Confiance a reconstruire | Resolution prioritaire |
| Retard paiement | Stress financier | Discussion payment plan |
| Client demande remboursement | Deal en danger | Retention d'abord |
| Onboarding incomplet | TTV pas atteint | Completer onboarding |
| Contact cle quitte l'entreprise | Relation a reconstruire | Identifier nouveau champion |

---

## 6. SEQUENCES EMAIL UPSELL -- 3 TEMPLATES

### Template Upsell 1 : E-commerce (M3-4 post-vitrine)

**Timing :** 90 jours post-lancement site vitrine
**Taux ouverture attendu :** 30-40%
**Taux booking meeting :** 15-20%

```
Objet : Votre trafic web croit -- et si on captait ces ventes ?

Bonjour {{prenom}},

Observation rapide : votre {{site_nom}} genere un trafic solide
(~{{visites_mensuelles}} visites/mois d'apres vos analytics).

Quelques-uns de vos concurrents dans {{secteur}} ont ajoute
un e-commerce a leur site et voient {{pct_revenue_ecom}}%
de leur CA venir des ventes en ligne.

Est-ce qu'un e-commerce aurait du sens pour {{entreprise_nom}} ?

CE QUE CA IMPLIQUERAIT :
- Integration Shopify a votre site existant
- Catalogue produits avec images et descriptions
- Paiement en ligne (Stripe/PayPal)
- Gestion des stocks
- ~5 000-10 000 EUR d'investissement, ~8-10 semaines

IMPACT POTENTIEL :
- Capter 15-25% de vos visiteurs comme clients
- Revenu additionnel estime : {{estimation_revenu_annuel}} EUR/an

Pas de pression -- juste pour savoir si c'est dans vos plans.

Un appel de 15 minutes pour en discuter ?
{{lien_calendly}}

{{signature_axiom}}
```

### Template Upsell 2 : Tracking server-side (M1-2 post-lancement)

**Timing :** 30-45 jours post-lancement (any project)
**Taux ouverture attendu :** 40-50%
**Taux booking meeting :** 20-25%

```
Objet : Une question : est-ce que vous trackez {{conversion_principale}} ?

Bonjour {{prenom}},

Maintenant que {{nom_projet}} est en ligne, un point important :

Votre analytics actuel (Google Analytics) vous dit D'OU viennent
vos visiteurs. Le tracking server-side vous dit POURQUOI ils convertissent.

C'est utile si vous suivez :
- Les soumissions de formulaires (contacts, inscriptions)
- Les conversions e-commerce (si applicable)
- Les actions utilisateur specifiques (telechargements, videos, clics)
- Les donnees respectueuses de la vie privee (conformite RGPD)

CE QU'ON A CONSTATE :
Les clients qui implementent le tracking server-side voient
en general 20-30% de meilleure attribution marketing et
detectent les erreurs analytics 2x plus vite.

NOTRE OFFRE :
- 990 EUR de mise en place (one-shot)
- 89 EUR/mois de maintenance
- ~5 jours d'implementation
- Integration complete avec vos outils existants

Ca vous interesse ? Un rapide tour d'horizon ?
{{lien_calendly}}

Ou dites-moi simplement ce que vous trackez aujourd'hui --
je vous dirai si ca vaut le coup.

{{signature_axiom}}
```

### Template Upsell 3 : Renewal + expansion (M10, pre-renewal)

**Timing :** 90 jours avant renouvellement annuel
**Taux ouverture attendu :** 50-60%
**Taux booking meeting :** 40%+

```
Objet : Votre renouvellement approche -- et une idee pour l'an 2

Bonjour {{prenom}},

Votre contrat pour {{nom_projet}} se renouvelle le {{date_renouvellement}}.
Avant de confirmer, j'aimerais faire le point sur trois choses :

1. BILAN DE L'ANNEE
   {{nom_projet}} tourne depuis {{nb_mois}} mois maintenant.
   J'aimerais savoir : qu'est-ce qui fonctionne bien ? Des defis ?

   Repondez avec votre plus grande victoire cette annee.

2. ET APRES ?
   D'apres votre usage et votre croissance, je vois {{opportunite}}.

   Concretement :
   {{donnees_specifiques}}

   Ca sugere que {{upsell_produit}} pourrait vous aider :
   - Resoudrait {{probleme_specifique}}
   - ROI estime : {{roi_estime}}

3. PARLONS-EN
   J'aimerais discuter de la strategie annee 2 :

   Option A : Etendre {{nom_projet}} + ajouter {{produit_upsell}}
   Option B : Renouveler l'actuel + optimiser
   Option C : Autre chose que vous avez en tete

   Planifions un appel de 30 min : {{lien_calendly}}

Investissement actuel : {{montant_annuel}} EUR/an
Potentiel avec expansion : {{montant_expansion}} EUR/an

Aucune pression -- juste pour m'assurer que vous etes positionne
pour un maximum de succes en annee 2.

{{signature_axiom}}
```
