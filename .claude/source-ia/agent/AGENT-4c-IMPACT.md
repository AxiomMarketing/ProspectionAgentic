# SOUS-AGENT 4c -- CALCULATEUR D'IMPACT
**Agent parent** : AGENT-4-MASTER.md
**Mission** : Calculer des chiffres d'impact personnalises a injecter dans les messages

---

### 3.3 Agent 4c -- Calculateur d'Impact

#### 3.3.1 Mission

Le sous-agent 4c calcule des chiffres d'impact personnalises pour chaque prospect. Ces chiffres sont ensuite injectes dans les messages email et LinkedIn pour renforcer la personnalisation. Le calcul est DETERMINISTE (pas d'appel API) et local.

#### 3.3.2 Formules de calcul

##### Formule 1 : Impact performance web sur le CA

```typescript
interface PerformanceImpact {
  perte_ca_mensuelle: number
  perte_ca_annuelle: number
  impact_conversion_pct: number
  taux_bounce_estime: number
  message_impact: string
}

function calculatePerformanceImpact(
  lighthousePerformance: number | undefined,
  tempsChargement: number | undefined,
  chiffreAffaires: number | undefined,
): PerformanceImpact | null {
  if (!lighthousePerformance && !tempsChargement) {
    return null // Pas assez de donnees
  }

  // --- Taux de bounce estime vs temps de chargement ---
  // Source : Google/SOASTA research (2017, confirme 2025)
  // 1s : 7% bounce | 3s : 32% bounce | 5s : 90% bounce | 10s : 123% bounce
  // Formule approximative : bounce = 9.56 * ln(temps) + 7
  const temps = tempsChargement || estimateLoadTimeFromLighthouse(lighthousePerformance!)
  const tauxBounce = Math.min(95, Math.round(9.56 * Math.log(temps) + 7))

  // --- Impact sur les conversions ---
  // Source : Contentsquare 2025 Digital Experience Benchmarks
  // Chaque seconde supplementaire au-dela de 2s = -7% de conversion
  // Baseline : site optimal charge en 1.5-2s
  const secondesExces = Math.max(0, temps - 2)
  const impactConversionPct = Math.round(secondesExces * 7) // -7% par seconde

  // --- Lighthouse score -> perte de CA ---
  // Benchmarks (Google/Contentsquare) :
  // 90+ = baseline (pas de perte)
  // 70-89 = -5% de CA
  // 50-69 = -12% de CA
  // <50 = -25% de CA
  let perteRevenuPct: number
  const perf = lighthousePerformance || estimateLighthouseFromLoadTime(temps)

  if (perf >= 90) {
    perteRevenuPct = 0
  } else if (perf >= 70) {
    perteRevenuPct = 5
  } else if (perf >= 50) {
    perteRevenuPct = 12
  } else {
    perteRevenuPct = 25
  }

  // Calculer la perte de CA si on connait le CA
  let perteCaMensuelle = 0
  let perteCaAnnuelle = 0
  if (chiffreAffaires) {
    const caMensuel = chiffreAffaires / 12
    perteCaMensuelle = Math.round(caMensuel * (perteRevenuPct / 100))
    perteCaAnnuelle = perteCaMensuelle * 12
  }

  // Message d'impact personnalise
  let messageImpact: string
  if (chiffreAffaires && perteCaMensuelle > 0) {
    messageImpact = `Votre site charge en ${temps.toFixed(1)}s (Lighthouse: ${perf}/100). ` +
      `Cela represente environ ${perteCaMensuelle.toLocaleString('fr-FR')} EUR/mois de conversions perdues.`
  } else if (temps > 2.5) {
    messageImpact = `Votre site charge en ${temps.toFixed(1)}s. ` +
      `Au-dela de 2s, chaque seconde supplementaire coute environ 7% de conversions.`
  } else {
    messageImpact = `Votre site performe correctement (${temps.toFixed(1)}s de chargement).`
  }

  return {
    perte_ca_mensuelle: perteCaMensuelle,
    perte_ca_annuelle: perteCaAnnuelle,
    impact_conversion_pct: impactConversionPct,
    taux_bounce_estime: tauxBounce,
    message_impact: messageImpact,
  }
}

function estimateLoadTimeFromLighthouse(score: number): number {
  // Estimation inversee : Lighthouse performance -> temps de chargement
  // 100 -> ~1s | 80 -> ~2s | 60 -> ~3.5s | 40 -> ~5s | 20 -> ~8s
  if (score >= 90) return 1.2
  if (score >= 70) return 2.2
  if (score >= 50) return 3.5
  if (score >= 30) return 5.5
  return 8.0
}

function estimateLighthouseFromLoadTime(temps: number): number {
  // Estimation inversee : temps de chargement -> Lighthouse score
  if (temps <= 1.5) return 95
  if (temps <= 2.5) return 78
  if (temps <= 4.0) return 58
  if (temps <= 6.0) return 38
  return 20
}
```

##### Formule 2 : Impact attribution (startups / e-commerce)

```typescript
interface AttributionImpact {
  depenses_pub_mensuelles_estimees: number
  gaspillage_mensuel_estime: number
  revenu_recuperable: number
  message_impact: string
}

function calculateAttributionImpact(
  chiffreAffaires: number | undefined,
  segment: string,
  hasServerSideTracking: boolean,
): AttributionImpact | null {
  // Applicable uniquement pour startups et e-commerce
  if (!['startups', 'shopify_ecommerce'].includes(segment)) {
    return null
  }

  // Estimation du budget pub mensuel
  // Startup SaaS : ~15-25% du CA en marketing
  // E-commerce : ~10-20% du CA en pub
  let pubPct: number
  if (segment === 'startups') {
    pubPct = 0.20 // 20% du CA
  } else {
    pubPct = 0.15 // 15% du CA
  }

  const caMensuel = (chiffreAffaires || 500000) / 12
  const depensesPubMensuelles = Math.round(caMensuel * pubPct)

  // Sans tracking server-side : 20-30% du budget pub est mal attribue
  const gaspillagePct = hasServerSideTracking ? 0.05 : 0.25
  const gaspillageMensuel = Math.round(depensesPubMensuelles * gaspillagePct)

  // ROAS moyen = 3x -> revenu potentiel recuperable
  const roas = 3
  const revenuRecuperable = Math.round(gaspillageMensuel * roas)

  const messageImpact = hasServerSideTracking
    ? `Votre tracking semble en place. Verification recommandee pour confirmer l'attribution.`
    : `Sans tracking server-side, environ ${gaspillageMensuel.toLocaleString('fr-FR')} EUR/mois ` +
      `de votre budget pub est mal attribue. ` +
      `Cela represente potentiellement ${revenuRecuperable.toLocaleString('fr-FR')} EUR de CA recuperable.`

  return {
    depenses_pub_mensuelles_estimees: depensesPubMensuelles,
    gaspillage_mensuel_estime: gaspillageMensuel,
    revenu_recuperable: revenuRecuperable,
    message_impact: messageImpact,
  }
}
```

##### Formule 3 : Impact RGAA (collectivites)

```typescript
interface RGAAImpact {
  nb_criteres_non_conformes_estime: number
  cout_remediation_min: number
  cout_remediation_max: number
  delai_jours: number
  message_impact: string
}

function calculateRGAAImpact(
  lighthouseAccessibility: number | undefined,
): RGAAImpact | null {
  // RGAA a 106 criteres au total, dont 68 sont testables automatiquement
  // Lighthouse accessibility correle (approximativement) avec RGAA

  const accessScore = lighthouseAccessibility || 50

  // Estimation du nombre de criteres non conformes
  // Lighthouse 100 -> ~5 criteres non conformes
  // Lighthouse 85 -> ~15 criteres non conformes
  // Lighthouse 70 -> ~25 criteres non conformes
  // Lighthouse 50 -> ~40 criteres non conformes
  // Lighthouse 30 -> ~55 criteres non conformes
  let nbNonConformes: number
  if (accessScore >= 95) {
    nbNonConformes = 5
  } else if (accessScore >= 85) {
    nbNonConformes = 15
  } else if (accessScore >= 70) {
    nbNonConformes = 25
  } else if (accessScore >= 50) {
    nbNonConformes = 40
  } else {
    nbNonConformes = 55
  }

  // Cout de remediation :
  // ~200-300 EUR par critere a corriger
  const coutMin = nbNonConformes * 200
  const coutMax = nbNonConformes * 350

  // Delai : ~1-2 jours par critere complexe, ~0.5 jour par critere simple
  const delai = Math.ceil(nbNonConformes * 0.7)

  const messageImpact = `Votre site presente environ ${nbNonConformes} criteres RGAA non conformes ` +
    `(estimation basee sur un score d'accessibilite de ${accessScore}/100). ` +
    `Remediation estimee entre ${coutMin.toLocaleString('fr-FR')} et ${coutMax.toLocaleString('fr-FR')} EUR ` +
    `en ${delai} jours.`

  return {
    nb_criteres_non_conformes_estime: nbNonConformes,
    cout_remediation_min: coutMin,
    cout_remediation_max: coutMax,
    delai_jours: delai,
    message_impact: messageImpact,
  }
}
```

##### Formule 4 : Impact abandon de panier (e-commerce)

```typescript
interface CartAbandonImpact {
  taux_abandon_estime: number
  panier_moyen_estime: number
  ca_perdu_mensuel: number
  ca_recuperable: number
  message_impact: string
}

function calculateCartAbandonImpact(
  chiffreAffaires: number | undefined,
  tempsChargement: number | undefined,
  segment: string,
): CartAbandonImpact | null {
  if (segment !== 'shopify_ecommerce') {
    return null
  }

  // Taux d'abandon panier moyen e-commerce : 70%
  // Correlation avec temps de chargement :
  // <2s : 65% abandon | 2-3s : 70% | 3-5s : 78% | >5s : 85%
  const temps = tempsChargement || 3.0
  let tauxAbandon: number
  if (temps < 2) {
    tauxAbandon = 65
  } else if (temps < 3) {
    tauxAbandon = 70
  } else if (temps < 5) {
    tauxAbandon = 78
  } else {
    tauxAbandon = 85
  }

  // Panier moyen estime (si CA connu)
  // Hypothese : 500 commandes/mois pour un CA de 500K/an
  const caMensuel = (chiffreAffaires || 300000) / 12
  const nbCommandesMois = Math.round(caMensuel / 80) // panier moyen 80 EUR
  const panierMoyen = Math.round(caMensuel / nbCommandesMois)

  // CA perdu = visiteurs abandonnant x panier moyen
  // Si 30% des visiteurs arrivent au checkout et 70% abandonnent :
  const caPerduMensuel = Math.round(caMensuel * (tauxAbandon / 100) * 0.3)

  // Recuperable : on peut typiquement reduire l'abandon de 15-25%
  const tauxRecuperation = 0.20 // 20% du perdu est recuperable
  const caRecuperable = Math.round(caPerduMensuel * tauxRecuperation)

  return {
    taux_abandon_estime: tauxAbandon,
    panier_moyen_estime: panierMoyen,
    ca_perdu_mensuel: caPerduMensuel,
    ca_recuperable: caRecuperable,
    message_impact: `Avec un temps de chargement de ${temps.toFixed(1)}s, ` +
      `votre taux d'abandon panier est probablement autour de ${tauxAbandon}%. ` +
      `Cela represente environ ${caRecuperable.toLocaleString('fr-FR')} EUR/mois de CA recuperable.`,
  }
}
```

#### 3.3.3 Orchestration du Calculateur d'Impact

```typescript
interface ImpactCalculation {
  performance: PerformanceImpact | null
  attribution: AttributionImpact | null
  rgaa: RGAAImpact | null
  cart_abandon: CartAbandonImpact | null
  // Champs agreres pour injection dans le prompt
  perte_ca_mensuelle: number | null
  perte_ca_annuelle: number | null
  taux_bounce_estime: number | null
  impact_conversion_pct: number | null
  message_impact: string
}

function calculateAllImpacts(prospect: RedacteurInput): ImpactCalculation {
  const segment = prospect.score.segment_primaire

  const performance = calculatePerformanceImpact(
    prospect.technique?.lighthouse?.performance,
    prospect.technique?.temps_chargement_s,
    prospect.entreprise.chiffre_affaires,
  )

  const attribution = calculateAttributionImpact(
    prospect.entreprise.chiffre_affaires,
    segment,
    false, // Assume pas de tracking server-side (sinon il ne serait pas prospect)
  )

  const rgaa = calculateRGAAImpact(
    prospect.technique?.lighthouse?.accessibility,
  )

  const cartAbandon = calculateCartAbandonImpact(
    prospect.entreprise.chiffre_affaires,
    prospect.technique?.temps_chargement_s,
    segment,
  )

  // Selectionner le meilleur message d'impact selon le segment
  let messageImpact = ''
  let perteCaMensuelle: number | null = null
  let perteCaAnnuelle: number | null = null

  switch (segment) {
    case 'pme_metro':
      if (performance) {
        messageImpact = performance.message_impact
        perteCaMensuelle = performance.perte_ca_mensuelle
        perteCaAnnuelle = performance.perte_ca_annuelle
      }
      break

    case 'shopify_ecommerce':
      if (cartAbandon && cartAbandon.ca_recuperable > 0) {
        messageImpact = cartAbandon.message_impact
        perteCaMensuelle = cartAbandon.ca_perdu_mensuel
      } else if (performance) {
        messageImpact = performance.message_impact
        perteCaMensuelle = performance.perte_ca_mensuelle
      }
      break

    case 'collectivites':
      if (rgaa) {
        messageImpact = rgaa.message_impact
      }
      break

    case 'startups':
      if (attribution) {
        messageImpact = attribution.message_impact
        perteCaMensuelle = attribution.gaspillage_mensuel_estime
      }
      break

    case 'agences_wl':
      // Pas de chiffre d'impact specifique, axer sur le scaling
      messageImpact = 'Les agences partenaires passent en moyenne de 3 a 6+ projets/mois avec notre support technique.'
      break
  }

  return {
    performance,
    attribution,
    rgaa,
    cart_abandon: cartAbandon,
    perte_ca_mensuelle: perteCaMensuelle,
    perte_ca_annuelle: perteCaAnnuelle,
    taux_bounce_estime: performance?.taux_bounce_estime || null,
    impact_conversion_pct: performance?.impact_conversion_pct || null,
    message_impact: messageImpact,
  }
}
```

#### 3.3.4 Format de sortie JSON -- Calculateur d'Impact

```json
{
  "performance": {
    "perte_ca_mensuelle": 1250,
    "perte_ca_annuelle": 15000,
    "impact_conversion_pct": 8,
    "taux_bounce_estime": 32,
    "message_impact": "Votre site charge en 3.2s (Lighthouse: 62/100). Cela represente environ 1 250 EUR/mois de conversions perdues."
  },
  "attribution": null,
  "rgaa": null,
  "cart_abandon": null,
  "perte_ca_mensuelle": 1250,
  "perte_ca_annuelle": 15000,
  "taux_bounce_estime": 32,
  "impact_conversion_pct": 8,
  "message_impact": "Votre site charge en 3.2s (Lighthouse: 62/100). Cela represente environ 1 250 EUR/mois de conversions perdues."
}
```
