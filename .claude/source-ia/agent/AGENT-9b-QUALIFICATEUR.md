# SOUS-AGENT 9b — QUALIFICATEUR + DECIDEUR
**Agent parent** : AGENT-9-MASTER.md

---



---
---


## 3.2 SOUS-AGENT 9b -- QUALIFICATEUR + DECIDEUR GO/NO-GO

> Ancien nom : "Scoreur GO/NO-GO" -- renomme "Qualificateur + Decideur" car il combine les roles des Agents 2 (Qualifier) et 3 (Decision Gate) de Jonathan. **[FUSION]**

## 9b.1 Mission precise **[FUSION]**

**Ce qu'il fait** :
- **[NOUS]** Recoit le JSON DCEAnalysis du sous-agent 9a
- **[JONATHAN]** Applique un scoring multi-criteres a 7 criteres avec sous-criteres detailles (sur 100 points)
- **[JONATHAN]** Produit une decision a 4 niveaux : RECOMMANDE (>= 70) / POSSIBLE (50-69) / MARGINAL (30-49) / ECARTE (< 30)
- **[JONATHAN]** Detecte et penalise les marches ou la capacite financiere est un critere fort (procedure collective)
- **[JONATHAN]** Genere un Brief Decision format Jonathan (template 1 page)
- **[JONATHAN]** Produit un retroplanning automatique (J-31 a J-0 avec jalons)
- **[JONATHAN]** Verifie la charge de travail en cours (conflits calendrier)
- **[NOUS]** Calcule l'Expected Value (EV = montant x marge x proba - cout)
- **[NOUS]** Estime le taux de succes par type de marche
- **[NOUS]** Notifie Jonathan via Slack pour les cas POSSIBLE et MARGINAL
- **[NOUS]** Journalise la decision avec justification detaillee

**Ce qu'il ne fait PAS** :
- Il ne modifie PAS l'analyse DCE
- Il ne genere PAS le memoire technique
- Il ne prend PAS de decision autonome sur les cas POSSIBLE (decision humaine requise)

---

## 9b.2 Les 7 criteres ponderes **[JONATHAN]**

> Matrice de scoring de Jonathan avec poids sur 100 points (superieure a notre ancienne matrice 0-5 x poids).

| # | Critere | Poids | Sous-criteres | Echelle |
|---|---------|-------|---------------|---------|
| 1 | **Adequation technique** | 30 pts | Technologies demandees vs stack Axiom, complexite, expertise requise | 0-30 |
| 2 | **Taille du marche** | 15 pts | Sweet spot 15-80K = max, < 5K ou > 200K = penalite | 0-15 |
| 3 | **Modalites d'execution** | 15 pts | Full remote=15, presence ponctuelle=10, presence reguliere=5 (si 974 sinon 0), presence permanente=0 | 0-15 |
| 4 | **Chances de succes** | 15 pts | Nb concurrents estimes, barrieres a l'entree, historique acheteur | 0-15 |
| 5 | **Delai de reponse** | 10 pts | > 30j=10, 20-30j=7, 10-20j=4, < 10j=1 | 0-10 |
| 6 | **Potentiel strategique** | 10 pts | Renouvellement possible, client de reference, accord-cadre | 0-10 |
| 7 | **Effort de reponse** | 5 pts | Complexite du dossier, nombre de pieces demandees | 0-5 |

### Comparaison avec l'ancienne matrice

| Aspect | v1 (nous) | v2 (fusion) |
|--------|-----------|-------------|
| Echelle | 0-5 par critere x poids => 0-100 | 0-N par critere (total direct = 100) |
| Nb niveaux decision | 3 (GO/REVIEW/NO-GO) | 4 (RECOMMANDE/POSSIBLE/MARGINAL/ECARTE) **[JONATHAN]** |
| Critere "Modalites execution" | Absent | **[JONATHAN]** 15 pts (critique pour Axiom remote) |
| Critere "Potentiel strategique" | Absent | **[JONATHAN]** 10 pts (reconduction, accord-cadre) |
| Critere "Effort reponse" | Absent | **[JONATHAN]** 5 pts |
| Budget vs Rentabilite | 20% (fusionne) | Separe : Taille marche 15 pts **[JONATHAN]** |
| RSE | 5% | Integre dans adequation technique si FLAG actif |

### Mapping explicite entre les deux formats de scoring **[FUSION]**

| # | Critere | Points Jonathan (v2) | Ancien format v1 (0-5 x poids) | Conversion |
|---|---------|---------------------|-------------------------------|------------|
| 1 | Adequation technique | **30 pts** (0-30) | score 0-5 x poids 6 | score_v1 x 6 = score_v2 |
| 2 | Taille du marche | **15 pts** (0-15) | score 0-5 x poids 3 | score_v1 x 3 = score_v2 |
| 3 | Modalites d'execution | **15 pts** (0-15) | ABSENT en v1 | Nouveau critere Jonathan |
| 4 | Chances de succes | **15 pts** (0-15) | score 0-5 x poids 3 | score_v1 x 3 = score_v2 |
| 5 | Delai de reponse | **10 pts** (0-10) | score 0-5 x poids 2 | score_v1 x 2 = score_v2 |
| 6 | Potentiel strategique | **10 pts** (0-10) | ABSENT en v1 | Nouveau critere Jonathan |
| 7 | Effort de reponse | **5 pts** (0-5) | ABSENT en v1 | Nouveau critere Jonathan |
| | **TOTAL** | **100 pts** | | |

**Seuils de decision (Jonathan) :**

| Decision | Seuil | Action |
|----------|-------|--------|
| **RECOMMANDE** | >= 70/100 | Lancement auto pipeline, traiter en priorite |
| **POSSIBLE** | 50-69/100 | Decision humaine Jonathan requise |
| **MARGINAL** | 30-49/100 | Basse priorite, archive auto si pas de reponse 48h |
| **ECARTE** | < 30/100 | Archive auto, aucune action humaine |

---

## 9b.3 Filtre procedure collective **[JONATHAN]**

```
DETECTION PROCEDURE COLLECTIVE
═══════════════════════════════

Le Qualificateur DOIT detecter et penaliser les marches ou la capacite
financiere est un critere fort :

1. RC exige un CA minimum → verifier si Axiom est eligible
   → Si CA demande > CA Axiom : ECARTE automatique

2. Critere "solidite financiere" pondere > 10% → penalite -15 pts
   → Score ajuste = Score brut - 15

3. Marche > 90K EUR et exigence de garantie financiere → alerte
   → Flag warning dans le brief decision

REGLE : Ces verifications sont AUTOMATIQUES et non overridables.
```

---

## 9b.4 Les 4 seuils de decision **[JONATHAN]**

```
SEUILS DE DECISION (4 niveaux)
═══════════════════════════════

  RECOMMANDE  : Score >= 70/100
    → Forte adequation, traiter en priorite
    → Lancement automatique du pipeline 9c (redaction)
    → Notification Slack #ao-go (vert)

  POSSIBLE    : Score 50-69/100
    → Adequation partielle, decision humaine REQUISE
    → Brief decision genere et envoye a Jonathan
    → Notification Slack #ao-reviews (orange)
    → Jonathan repond GO / NO-GO

  MARGINAL    : Score 30-49/100
    → Faible adequation, seulement si charge le permet
    → Brief decision genere mais marque comme "basse priorite"
    → Notification Slack #ao-reviews (jaune)
    → Archive automatique si pas de reponse Jonathan sous 48h

  ECARTE      : Score < 30/100
    → Pas pertinent, archive automatique
    → Lecon apprise capitalisee
    → Notification Slack #ao-archive (gris)
    → Aucune action humaine requise
```

---

## 9b.5 Formule de scoring **[FUSION]**

```typescript
// agents/appels-offres/9b-qualificateur-decideur/scoring.ts

// ============================================================
// INTERFACE DE SCORING [FUSION]
// Combine la matrice 7 criteres de Jonathan + nos calculs ROI
// ============================================================
interface QualificationScore {
  // --- Scoring Jonathan (7 criteres sur 100) ---
  criteres: {
    adequation_technique: {
      score: number             // 0-30
      max: 30
      sous_scores: {
        technologies_match: number        // 0-15
        complexite_compatible: number     // 0-10
        expertise_equipe: number          // 0-5
      }
      justification: string
    }
    taille_marche: {
      score: number             // 0-15
      max: 15
      montant_ht: number | null
      zone: 'sweet_spot' | 'acceptable' | 'hors_cible'
      justification: string
    }
    modalites_execution: {
      score: number             // 0-15
      max: 15
      mode: 'full_remote' | 'presence_ponctuelle' | 'presence_reguliere' | 'presence_permanente'
      localisation_acheteur: string
      justification: string
    }
    chances_succes: {
      score: number             // 0-15
      max: 15
      nb_concurrents_estimes: number | null
      barriere_entree: 'haute' | 'moyenne' | 'basse'
      acheteur_connu: boolean
      justification: string
    }
    delai_reponse: {
      score: number             // 0-10
      max: 10
      jours_restants: number
      justification: string
    }
    potentiel_strategique: {
      score: number             // 0-10
      max: 10
      renouvellement_possible: boolean
      client_reference: boolean
      accord_cadre: boolean
      justification: string
    }
    effort_reponse: {
      score: number             // 0-5
      max: 5
      complexite_dossier: 'simple' | 'moyen' | 'complexe'
      nb_pieces_demandees: number
      justification: string
    }
  }

  // --- Score agrege ---
  score_brut: number              // 0-100 (somme directe)
  penalite_procedure_collective: number  // [JONATHAN] 0 ou -15
  score_ajuste: number            // score_brut + penalite
  score_final: number             // = score_ajuste, borne a 0-100

  // --- Decision [JONATHAN] (4 niveaux) ---
  decision: 'RECOMMANDE' | 'POSSIBLE' | 'MARGINAL' | 'ECARTE'
  reasoning: string

  // --- Calculs ROI [NOUS] ---
  effort_estimation_heures: number
  cout_reponse_estime: number     // heures x TJM interne
  revenue_estime: number          // montant HT du marche
  marge_previsionnelle_pct: number
  roi_simple: number              // revenue / cout_reponse
  probabilite_gagner_percent: number
  expected_value: number          // montant x marge x proba - cout_reponse
  taux_succes_type_marche: number // [NOUS] Taux historique par type

  // --- Recommandations ---
  conditions_go: string[]
  risques_identifies: string[]    // [JONATHAN]
  avantages_axiom: string[]       // [JONATHAN]
  entite_candidate: 'AXIOM' | 'MAFATE' | 'GROUPEMENT'  // [JONATHAN]
  lots_cibles: number[]           // [JONATHAN]

  // --- Retroplanning [JONATHAN] ---
  retroplanning: RetroPlanningJalon[]

  // --- Brief decision [JONATHAN] ---
  brief_decision: string          // Texte formate 1 page

  // --- Charge de travail [JONATHAN] ---
  conflit_calendrier: boolean
  ao_en_cours: number             // Nb de reponses en parallele
  charge_dispo_pct: number        // % disponibilite equipe
}

// [JONATHAN] Jalons du retroplanning
interface RetroPlanningJalon {
  jour: string                    // "J-31", "J-28", "J-20", etc.
  date_estimee: string            // ISO 8601
  action: string                  // "GO confirme -> lancement analyse DCE"
  responsable: 'IA' | 'Jonathan' | 'Marty' | 'Equipe'
  statut: 'a_faire' | 'en_cours' | 'fait'
}
```

---

## 9b.6 Code TypeScript du Qualificateur + Decideur **[FUSION]**

```typescript
// agents/appels-offres/9b-qualificateur-decideur/index.ts

// ============================================================
// FONCTION PRINCIPALE DE SCORING [FUSION]
// Matrice Jonathan + Calculs ROI de nous
// ============================================================
function calculateQualification(analysis: DCEAnalysis): QualificationScore {

  // ========================================
  // CRITERE 1 : Adequation technique (30 pts) [JONATHAN]
  // ========================================
  const techScore = scoreTechnique(analysis)

  // ========================================
  // CRITERE 2 : Taille du marche (15 pts) [JONATHAN]
  // ========================================
  const tailleScore = scoreTailleMarche(analysis)

  // ========================================
  // CRITERE 3 : Modalites d'execution (15 pts) [JONATHAN]
  // ========================================
  const modalitesScore = scoreModalites(analysis)

  // ========================================
  // CRITERE 4 : Chances de succes (15 pts) [JONATHAN]
  // ========================================
  const chancesScore = scoreChancesSucces(analysis)

  // ========================================
  // CRITERE 5 : Delai de reponse (10 pts) [JONATHAN]
  // ========================================
  const delaiScore = scoreDelai(analysis)

  // ========================================
  // CRITERE 6 : Potentiel strategique (10 pts) [JONATHAN]
  // ========================================
  const strategiqueScore = scorePotentielStrategique(analysis)

  // ========================================
  // CRITERE 7 : Effort de reponse (5 pts) [JONATHAN]
  // ========================================
  const effortScore = scoreEffortReponse(analysis)

  // ========================================
  // AGREGATION
  // ========================================
  const scoreBrut = techScore.score + tailleScore.score + modalitesScore.score +
                    chancesScore.score + delaiScore.score + strategiqueScore.score +
                    effortScore.score

  // [JONATHAN] Penalite procedure collective
  const penalite = detecterPenaliteProcedureCollective(analysis)
  const scoreAjuste = Math.max(0, Math.min(100, scoreBrut + penalite))

  // [JONATHAN] Decision 4 niveaux
  let decision: 'RECOMMANDE' | 'POSSIBLE' | 'MARGINAL' | 'ECARTE'
  if (scoreAjuste >= 70) decision = 'RECOMMANDE'
  else if (scoreAjuste >= 50) decision = 'POSSIBLE'
  else if (scoreAjuste >= 30) decision = 'MARGINAL'
  else decision = 'ECARTE'

  // [JONATHAN] Verification si marche fausse detectee par 9a
  if (analysis.detection_marche_fausse?.est_suspecte &&
      analysis.detection_marche_fausse.score_suspicion >= 70) {
    decision = 'ECARTE'
  }

  // [NOUS] Calculs ROI
  const montantEstime = analysis.caracteristiques_marche.estimation_budget.montant_total_ht || 0
  const effortHeures = estimerEffortReponse(analysis)
  const coutReponse = effortHeures * 80  // TJM moyen interne 80 EUR/h
  const margePrevue = analysis.scoring_axiom?.budget_rentabilite?.margin_previsionnelle || 30
  const revenueNet = montantEstime * (margePrevue / 100)
  const probaGagner = estimerProbabiliteGain(analysis, scoreAjuste)
  const expectedValue = revenueNet * (probaGagner / 100) - coutReponse

  // [JONATHAN] Retroplanning
  const retroplanning = genererRetroplanning(analysis)

  // [JONATHAN] Brief decision
  const briefDecision = genererBriefDecision(analysis, scoreAjuste, decision, {
    techScore, tailleScore, modalitesScore, chancesScore,
    delaiScore, strategiqueScore, effortScore
  })

  // [JONATHAN] Charge de travail
  const chargeInfo = verifierChargeTravail()

  return {
    criteres: {
      adequation_technique: techScore,
      taille_marche: tailleScore,
      modalites_execution: modalitesScore,
      chances_succes: chancesScore,
      delai_reponse: delaiScore,
      potentiel_strategique: strategiqueScore,
      effort_reponse: effortScore
    },
    score_brut: scoreBrut,
    penalite_procedure_collective: penalite,
    score_ajuste: scoreAjuste,
    score_final: scoreAjuste,
    decision,
    reasoning: generateReasoning(scoreAjuste, decision, analysis),
    effort_estimation_heures: effortHeures,
    cout_reponse_estime: coutReponse,
    revenue_estime: montantEstime,
    marge_previsionnelle_pct: margePrevue,
    roi_simple: coutReponse > 0 ? Math.round(montantEstime / coutReponse * 100) / 100 : 0,
    probabilite_gagner_percent: probaGagner,
    expected_value: Math.round(expectedValue),
    taux_succes_type_marche: getTauxSuccesParType(analysis.caracteristiques_marche.type_procedure),
    conditions_go: analysis.decision_preliminaire?.conditions_go || [],
    risques_identifies: extractRisques(analysis),
    avantages_axiom: extractAvantages(analysis),
    entite_candidate: determinerEntiteCandidate(analysis),
    lots_cibles: determinerLotsCibles(analysis),
    retroplanning,
    brief_decision: briefDecision,
    conflit_calendrier: chargeInfo.conflit,
    ao_en_cours: chargeInfo.nbEnCours,
    charge_dispo_pct: chargeInfo.dispoPct
  }
}

// ============================================================
// FONCTIONS DE SCORING PAR CRITERE
// ============================================================

function scoreTechnique(analysis: DCEAnalysis): QualificationScore['criteres']['adequation_technique'] {
  const scoring = analysis.scoring_axiom
  const techScore = scoring?.adequation_technique?.score || 0

  // [JONATHAN] Convertir notre echelle 0-5 en 0-30
  // + sous-scoring detaille
  const technologiesMatch = Math.round((techScore / 5) * 15)
  const complexiteCompatible = estimerComplexiteCompatible(analysis)
  const expertiseEquipe = estimerExpertiseEquipe(analysis)

  return {
    score: Math.min(30, technologiesMatch + complexiteCompatible + expertiseEquipe),
    max: 30,
    sous_scores: {
      technologies_match: technologiesMatch,
      complexite_compatible: complexiteCompatible,
      expertise_equipe: expertiseEquipe
    },
    justification: scoring?.adequation_technique?.justification || 'Non evalue'
  }
}

function scoreTailleMarche(analysis: DCEAnalysis): QualificationScore['criteres']['taille_marche'] {
  const montant = analysis.caracteristiques_marche.estimation_budget.montant_total_ht

  // [JONATHAN] Sweet spot 15-80K = max, < 5K ou > 200K = penalite
  let score: number
  let zone: 'sweet_spot' | 'acceptable' | 'hors_cible'

  if (montant === null) {
    score = 8  // Par defaut si non specifie
    zone = 'acceptable'
  } else if (montant >= 15000 && montant <= 80000) {
    score = 15  // Sweet spot
    zone = 'sweet_spot'
  } else if (montant >= 5000 && montant < 15000) {
    score = 8  // Petit mais faisable
    zone = 'acceptable'
  } else if (montant > 80000 && montant <= 200000) {
    score = 10  // Grand mais faisable
    zone = 'acceptable'
  } else if (montant > 200000 && montant <= 300000) {
    score = 5  // Limite haute
    zone = 'hors_cible'
  } else if (montant < 5000) {
    score = 2  // Trop petit
    zone = 'hors_cible'
  } else {
    score = 0  // > 300K, trop grand
    zone = 'hors_cible'
  }

  return {
    score,
    max: 15,
    montant_ht: montant,
    zone,
    justification: montant
      ? `Montant ${montant} EUR HT — zone ${zone}`
      : 'Montant non specifie dans le DCE'
  }
}

function scoreModalites(analysis: DCEAnalysis): QualificationScore['criteres']['modalites_execution'] {
  // [JONATHAN] Full remote = 15, presence ponctuelle = 10,
  // presence reguliere = 5 si 974 sinon 0, presence permanente = 0
  // Heuristique : detecter dans les exigences et le CCTP
  const exigences = analysis.exigences_individuelles || []
  const localisation = analysis.metadata?.acheteur?.region || ''

  let mode: 'full_remote' | 'presence_ponctuelle' | 'presence_reguliere' | 'presence_permanente'
  let score: number

  // Detecter dans les exigences
  const presenceExigences = exigences.filter(ex =>
    ex.libelle.toLowerCase().includes('presence') ||
    ex.libelle.toLowerCase().includes('sur site') ||
    ex.libelle.toLowerCase().includes('in situ') ||
    ex.libelle.toLowerCase().includes('reunions') ||
    ex.libelle.toLowerCase().includes('comite')
  )

  if (presenceExigences.length === 0) {
    mode = 'full_remote'
    score = 15
  } else {
    const hasPresencePermanente = presenceExigences.some(ex =>
      ex.libelle.toLowerCase().includes('permanent') ||
      ex.libelle.toLowerCase().includes('quotidien')
    )
    const hasPresenceReguliere = presenceExigences.some(ex =>
      ex.libelle.toLowerCase().includes('regulier') ||
      ex.libelle.toLowerCase().includes('hebdomadaire')
    )

    if (hasPresencePermanente) {
      mode = 'presence_permanente'
      score = 0
    } else if (hasPresenceReguliere) {
      mode = 'presence_reguliere'
      // [JONATHAN] 5 si 974, sinon 0
      score = localisation.toLowerCase().includes('reunion') ||
              localisation.toLowerCase().includes('974') ? 5 : 0
    } else {
      mode = 'presence_ponctuelle'
      score = 10
    }
  }

  return {
    score,
    max: 15,
    mode,
    localisation_acheteur: localisation,
    justification: `Mode ${mode}, acheteur ${localisation}`
  }
}

function scoreChancesSucces(analysis: DCEAnalysis): QualificationScore['criteres']['chances_succes'] {
  const scoring = analysis.scoring_axiom
  const concurrenceEstimee = scoring?.concurrence?.estimation_concurrent || null
  const probaScore = scoring?.probabilite_gain?.score || 3

  // [JONATHAN] Combiner estimation concurrence + historique
  let score: number
  let barriere: 'haute' | 'moyenne' | 'basse'

  if (concurrenceEstimee !== null) {
    if (concurrenceEstimee <= 3) { score = 15; barriere = 'haute' }
    else if (concurrenceEstimee <= 8) { score = 10; barriere = 'moyenne' }
    else if (concurrenceEstimee <= 15) { score = 5; barriere = 'basse' }
    else { score = 2; barriere = 'basse' }
  } else {
    // Estimation par type de procedure [NOUS]
    const type = analysis.caracteristiques_marche.type_procedure
    switch (type) {
      case 'MAPA': score = 10; barriere = 'moyenne'; break
      case 'AO Ouvert': score = 5; barriere = 'basse'; break
      case 'AO Restreint': score = 12; barriere = 'haute'; break
      default: score = 7; barriere = 'moyenne'
    }
  }

  // Bonus si acheteur connu
  const acheteurConnu = false  // A enrichir via historique DB
  if (acheteurConnu) score = Math.min(15, score + 3)

  return {
    score,
    max: 15,
    nb_concurrents_estimes: concurrenceEstimee,
    barriere_entree: barriere,
    acheteur_connu: acheteurConnu,
    justification: scoring?.concurrence?.justification || `Estimation ${concurrenceEstimee || 'inconnue'}`
  }
}

function scoreDelai(analysis: DCEAnalysis): QualificationScore['criteres']['delai_reponse'] {
  const jours = analysis.metadata?.jours_avant_deadline || 0

  // [JONATHAN] > 30j = 10, 20-30j = 7, 10-20j = 4, < 10j = 1
  let score: number
  if (jours > 30) score = 10
  else if (jours >= 20) score = 7
  else if (jours >= 10) score = 4
  else score = 1

  return {
    score,
    max: 10,
    jours_restants: jours,
    justification: `${jours} jours avant deadline`
  }
}

function scorePotentielStrategique(analysis: DCEAnalysis): QualificationScore['criteres']['potentiel_strategique'] {
  // [JONATHAN] Renouvellement possible, client de reference, accord-cadre
  let score = 0
  let renouvellement = false
  let clientRef = false
  let accordCadre = false

  // Detecter dans les exigences et le texte
  const description = analysis.caracteristiques_marche.description_courte.toLowerCase()
  const exigences = analysis.exigences_individuelles || []

  if (description.includes('reconduction') || description.includes('renouvellement') ||
      description.includes('accord-cadre')) {
    renouvellement = true
    score += 4
  }
  if (description.includes('accord-cadre')) {
    accordCadre = true
    score += 3
  }

  // Client de reference potentiel (collectivite, ministere)
  const acheteur = analysis.metadata?.acheteur?.nom?.toLowerCase() || ''
  if (acheteur.includes('ministere') || acheteur.includes('region') ||
      acheteur.includes('departement') || acheteur.includes('metropole')) {
    clientRef = true
    score += 3
  }

  return {
    score: Math.min(10, score),
    max: 10,
    renouvellement_possible: renouvellement,
    client_reference: clientRef,
    accord_cadre: accordCadre,
    justification: `Renouvellement: ${renouvellement}, Reference: ${clientRef}, Accord-cadre: ${accordCadre}`
  }
}

function scoreEffortReponse(analysis: DCEAnalysis): QualificationScore['criteres']['effort_reponse'] {
  // [JONATHAN] Complexite du dossier, nombre de pieces demandees
  const piecesExigees = analysis.analyse_rc?.pieces_exigees?.length || 0
  const nbExigences = analysis.exigences_individuelles?.length || 0
  const nbLots = analysis.exigences_techniques?.lots?.length || 1

  let complexite: 'simple' | 'moyen' | 'complexe'
  let score: number

  if (piecesExigees <= 5 && nbExigences <= 10 && nbLots <= 1) {
    complexite = 'simple'
    score = 5
  } else if (piecesExigees <= 10 && nbExigences <= 25 && nbLots <= 3) {
    complexite = 'moyen'
    score = 3
  } else {
    complexite = 'complexe'
    score = 1
  }

  return {
    score,
    max: 5,
    complexite_dossier: complexite,
    nb_pieces_demandees: piecesExigees,
    justification: `Dossier ${complexite} : ${piecesExigees} pieces, ${nbExigences} exigences, ${nbLots} lot(s)`
  }
}

// ============================================================
// PENALITE PROCEDURE COLLECTIVE [JONATHAN]
// ============================================================
function detecterPenaliteProcedureCollective(analysis: DCEAnalysis): number {
  let penalite = 0

  // Verifier si critere solidite financiere > 10%
  const criteres = analysis.criteres_evaluation || []
  for (const critere of criteres) {
    if ((critere.nom.toLowerCase().includes('financier') ||
         critere.nom.toLowerCase().includes('capacite economique')) &&
        critere.ponderation_pourcent > 10) {
      penalite = -15
    }
  }

  // Verifier CA minimum exige
  const caMin = analysis.conditions_participation?.capacite_financiere?.chiffre_affaires_minimum
  if (caMin && caMin > 500000) {  // A ajuster selon CA reel Axiom
    penalite = Math.min(penalite, -15)
  }

  return penalite
}

// ============================================================
// TAUX DE SUCCES PAR TYPE DE MARCHE [NOUS]
// ============================================================
function getTauxSuccesParType(type: string): number {
  switch (type) {
    case 'MAPA': return 40            // 35-50% typique
    case 'AO Ouvert': return 20       // 15-25% typique
    case 'AO Restreint': return 50    // 40-60% typique
    default: return 25
  }
}

// ============================================================
// ESTIMATION PROBABILITE DE GAIN [NOUS]
// ============================================================
function estimerProbabiliteGain(analysis: DCEAnalysis, score: number): number {
  const baseProbabilite = getTauxSuccesParType(analysis.caracteristiques_marche.type_procedure)

  // Ajustement par score
  let adjusted: number
  if (score >= 80) adjusted = baseProbabilite * 1.5
  else if (score >= 70) adjusted = baseProbabilite * 1.2
  else if (score >= 60) adjusted = baseProbabilite * 1.0
  else adjusted = baseProbabilite * 0.5

  // [JONATHAN] Penalite si marche fausse detectee
  if (analysis.detection_marche_fausse?.est_suspecte) {
    adjusted *= 0.3  // Reduire de 70%
  }

  return Math.min(80, Math.round(adjusted))
}

// ============================================================
// ESTIMATION EFFORT REPONSE [NOUS]
// ============================================================
function estimerEffortReponse(analysis: DCEAnalysis): number {
  const typeProcedure = analysis.caracteristiques_marche.type_procedure
  const montant = analysis.caracteristiques_marche.estimation_budget.montant_total_ht || 0

  let baseHeures: number
  switch (typeProcedure) {
    case 'MAPA':
      baseHeures = montant < 40000 ? 20 : 40
      break
    case 'AO Ouvert':
      baseHeures = montant < 200000 ? 60 : 120
      break
    case 'AO Restreint':
      baseHeures = 80
      break
    default:
      baseHeures = 60
  }

  // Ajustements
  const nbLots = analysis.exigences_techniques?.lots?.length || 1
  if (nbLots > 3) baseHeures *= 1.3
  if ((analysis.clauses_rse?.length || 0) > 2) baseHeures *= 1.1
  if ((analysis.exigences_individuelles?.length || 0) > 20) baseHeures *= 1.2

  return Math.round(baseHeures)
}

// ============================================================
// RETROPLANNING AUTOMATIQUE [JONATHAN]
// ============================================================
function genererRetroplanning(analysis: DCEAnalysis): RetroPlanningJalon[] {
  const deadline = new Date(analysis.metadata.date_deadline_offre)
  const jours = analysis.metadata.jours_avant_deadline

  function dateJ(joursAvant: number): string {
    const d = new Date(deadline)
    d.setDate(d.getDate() - joursAvant)
    return d.toISOString().split('T')[0]
  }

  // [JONATHAN] Template retroplanning adapte au delai disponible
  if (jours >= 31) {
    return [
      { jour: 'J-31', date_estimee: dateJ(31), action: 'GO confirme — lancement analyse DCE', responsable: 'IA', statut: 'a_faire' },
      { jour: 'J-28', date_estimee: dateJ(28), action: 'Analyse DCE complete — brief strategie', responsable: 'IA', statut: 'a_faire' },
      { jour: 'J-25', date_estimee: dateJ(25), action: 'Questions a poser a l\'acheteur (si necessaire)', responsable: 'Jonathan', statut: 'a_faire' },
      { jour: 'J-20', date_estimee: dateJ(20), action: 'Strategie technique validee — lancement redaction', responsable: 'Jonathan', statut: 'a_faire' },
      { jour: 'J-15', date_estimee: dateJ(15), action: 'Premier jet memoire technique', responsable: 'IA', statut: 'a_faire' },
      { jour: 'J-10', date_estimee: dateJ(10), action: 'Chiffrage finalise (BPU/DQE/DPGF)', responsable: 'Jonathan', statut: 'a_faire' },
      { jour: 'J-7',  date_estimee: dateJ(7),  action: 'Relecture complete + controle conformite', responsable: 'Jonathan', statut: 'a_faire' },
      { jour: 'J-3',  date_estimee: dateJ(3),  action: 'Dossier finalise, signature electronique', responsable: 'IA', statut: 'a_faire' },
      { jour: 'J-1',  date_estimee: dateJ(1),  action: 'Depot sur la plateforme', responsable: 'IA', statut: 'a_faire' },
      { jour: 'J-0',  date_estimee: dateJ(0),  action: 'DEADLINE', responsable: 'Equipe', statut: 'a_faire' }
    ]
  } else if (jours >= 15) {
    // Planning compresse
    return [
      { jour: `J-${jours}`, date_estimee: dateJ(jours), action: 'GO confirme — lancement URGENT', responsable: 'IA', statut: 'a_faire' },
      { jour: `J-${jours - 2}`, date_estimee: dateJ(jours - 2), action: 'Analyse DCE + questions acheteur', responsable: 'IA', statut: 'a_faire' },
      { jour: `J-${Math.floor(jours / 2)}`, date_estimee: dateJ(Math.floor(jours / 2)), action: 'Premier jet memoire + chiffrage', responsable: 'IA', statut: 'a_faire' },
      { jour: 'J-5', date_estimee: dateJ(5), action: 'Relecture Jonathan + corrections', responsable: 'Jonathan', statut: 'a_faire' },
      { jour: 'J-2', date_estimee: dateJ(2), action: 'Dossier final + signature + depot', responsable: 'IA', statut: 'a_faire' },
      { jour: 'J-0', date_estimee: dateJ(0), action: 'DEADLINE', responsable: 'Equipe', statut: 'a_faire' }
    ]
  } else {
    // Ultra-urgent
    return [
      { jour: `J-${jours}`, date_estimee: dateJ(jours), action: 'GO confirme — mode SPRINT', responsable: 'IA', statut: 'a_faire' },
      { jour: `J-${jours - 1}`, date_estimee: dateJ(jours - 1), action: 'Analyse + redaction simultanées', responsable: 'IA', statut: 'a_faire' },
      { jour: 'J-2', date_estimee: dateJ(2), action: 'Relecture eclair + depot', responsable: 'Jonathan', statut: 'a_faire' },
      { jour: 'J-0', date_estimee: dateJ(0), action: 'DEADLINE', responsable: 'Equipe', statut: 'a_faire' }
    ]
  }
}

// ============================================================
// BRIEF DECISION FORMAT JONATHAN [JONATHAN]
// ============================================================
function genererBriefDecision(
  analysis: DCEAnalysis,
  score: number,
  decision: string,
  scores: Record<string, any>
): string {
  const montant = analysis.caracteristiques_marche.estimation_budget.montant_total_ht
  const jours = analysis.metadata.jours_avant_deadline
  const acheteur = analysis.metadata.acheteur.nom
  const titre = analysis.caracteristiques_marche.description_courte.substring(0, 60)
  const type = analysis.caracteristiques_marche.type_procedure

  // [JONATHAN] Extraire avantages et risques
  const avantages = extractAvantages(analysis)
  const risques = extractRisques(analysis)

  // [JONATHAN] Charge de travail
  const charge = verifierChargeTravail()

  return `${'='.repeat(50)}
DECISION MARCHE -- ${titre}
${'='.repeat(50)}

SCORE : ${score}/100 -- ${decision}
ENTITE : Axiom Marketing (UNIVILE SAS)
ACHETEUR : ${acheteur}
MONTANT ESTIME : ${montant ? montant.toLocaleString('fr-FR') : 'Non specifie'} EUR HT
TYPE : ${type}
DEADLINE : ${analysis.metadata.date_deadline_offre} (${jours} jours restants)

EN BREF :
${analysis.caracteristiques_marche.description_courte.substring(0, 200)}

SCORING DETAILLE :
  Adequation technique : ${scores.techScore.score}/30
  Taille marche        : ${scores.tailleScore.score}/15
  Modalites execution  : ${scores.modalitesScore.score}/15
  Chances succes       : ${scores.chancesScore.score}/15
  Delai reponse        : ${scores.delaiScore.score}/10
  Potentiel strategique: ${scores.strategiqueScore.score}/10
  Effort reponse       : ${scores.effortScore.score}/5
  ${scores.penalite ? `Penalite proc. coll.: ${scores.penalite}` : ''}

POURQUOI Y ALLER :
${avantages.map(a => `+ ${a}`).join('\n')}

RISQUES :
${risques.map(r => `- ${r}`).join('\n')}

EFFORT ESTIME : ${Math.ceil(estimerEffortReponse(analysis) / 8)} jour(s) de redaction
CHARGE ACTUELLE : ${charge.nbEnCours} autre(s) reponse(s) en cours
DISPONIBILITE EQUIPE : ${charge.dispoPct}%
${analysis.detection_marche_fausse?.est_suspecte ? '\n*** ALERTE : MARCHE POTENTIELLEMENT FAUSSE (score suspicion: ' + analysis.detection_marche_fausse.score_suspicion + '/100) ***\n' : ''}
[ ] GO  [ ] NO-GO  [ ] A DISCUTER
${'='.repeat(50)}`
}

// ============================================================
// VERIFICATION CHARGE DE TRAVAIL [JONATHAN]
// ============================================================
function verifierChargeTravail(): { conflit: boolean; nbEnCours: number; dispoPct: number } {
  // A connecter a la base PostgreSQL pour verifier les AO en cours
  // Placeholder : a implementer avec requete DB
  // SELECT COUNT(*) FROM ao_analyses WHERE status = 'in_progress'
  return {
    conflit: false,
    nbEnCours: 0,
    dispoPct: 100
  }
}

// ============================================================
// HELPERS
// ============================================================
function extractAvantages(analysis: DCEAnalysis): string[] {
  const avantages: string[] = []
  const scoring = analysis.scoring_axiom

  if (scoring?.adequation_technique?.score >= 4) {
    avantages.push(`Technologies dans notre stack (${scoring.adequation_technique.justification})`)
  }
  if (scoring?.probabilite_gain?.score >= 4) {
    avantages.push(`Forte probabilite de gain`)
  }
  if (analysis.flags_conditionnels?.ACTIVER_SECTION_RGAA) {
    avantages.push('Expertise RGAA/accessibilite = avantage competitif')
  }

  // Detecter reconduction / accord-cadre
  const desc = analysis.caracteristiques_marche.description_courte.toLowerCase()
  if (desc.includes('reconduction')) {
    avantages.push('Potentiel reconduction = revenus recurrents')
  }

  if (avantages.length === 0) avantages.push('A evaluer')
  return avantages
}

function extractRisques(analysis: DCEAnalysis): string[] {
  const risques: string[] = []

  if (analysis.risques_axiom) {
    for (const r of analysis.risques_axiom) {
      if (r.severite >= 3) {
        risques.push(`${r.description} (${r.mitigation})`)
      }
    }
  }

  if (analysis.detection_marche_fausse?.est_suspecte) {
    risques.push(`MARCHE SUSPECTE : ${analysis.detection_marche_fausse.recommandation}`)
  }

  if (risques.length === 0) risques.push('Aucun risque majeur identifie')
  return risques
}

function estimerComplexiteCompatible(analysis: DCEAnalysis): number {
  // Score 0-10 : complexite du projet vs capacite Axiom
  const nbLots = analysis.exigences_techniques?.lots?.length || 1
  const nbExigences = analysis.exigences_individuelles?.length || 0

  if (nbLots <= 1 && nbExigences <= 10) return 10
  if (nbLots <= 2 && nbExigences <= 20) return 7
  if (nbLots <= 3 && nbExigences <= 30) return 5
  return 3
}

function estimerExpertiseEquipe(analysis: DCEAnalysis): number {
  // Score 0-5 : expertise equipe pour ce type de projet
  const refs = analysis.scoring_axiom?.probabilite_gain?.actions_augmenter || []
  if (refs.length === 0) return 3
  return Math.min(5, 3 + (refs.length > 2 ? 2 : refs.length))
}

function determinerEntiteCandidate(analysis: DCEAnalysis): 'AXIOM' | 'MAFATE' | 'GROUPEMENT' {
  // Par defaut AXIOM, a enrichir selon les regles metier
  return 'AXIOM'
}

function determinerLotsCibles(analysis: DCEAnalysis): number[] {
  const lots = analysis.exigences_techniques?.lots || []
  if (lots.length === 0) return [1]

  // Cibler les lots IT avec score Axiom >= 3
  return lots
    .filter(lot => lot.type === 'IT' && lot.specs_cles.some(s => s.score_axiom >= 3))
    .map(lot => lot.numero_lot)
}

function generateReasoning(score: number, decision: string, analysis: DCEAnalysis): string {
  const points_forts: string[] = []
  const points_faibles: string[] = []
  const scoring = analysis.scoring_axiom

  if (scoring) {
    if (scoring.adequation_technique?.score >= 4) points_forts.push('Stack technique compatible')
    if (scoring.budget_rentabilite?.score >= 4) points_forts.push('Budget dans le sweet spot')
    if (scoring.adequation_technique?.score <= 2) points_faibles.push('Stack technique incompatible')
    if (scoring.delai_reponse?.score <= 2) points_faibles.push('Delai de reponse tres court')
  }

  if (analysis.detection_marche_fausse?.est_suspecte) {
    points_faibles.push('Suspicion marche fausse')
  }

  return `Score ${score}/100 -> ${decision}. ` +
    `Points forts: ${points_forts.join('; ') || 'aucun notable'}. ` +
    `Points faibles: ${points_faibles.join('; ') || 'aucun notable'}.`
}

export { calculateQualification, QualificationScore }
```

---

## 9b.7 Exemples concrets de scoring **[FUSION]**

### Scenario A : AO ATTRACTIVE (ministere, 60k EUR, React + Node.js, 35j delai)

```
Adequation technique  : 27/30  (React/Node full match, complexite OK, equipe competente)
Taille du marche      : 15/15  (60K EUR = sweet spot 15-80K)
Modalites execution   : 15/15  (full remote)
Chances de succes     : 10/15  (MAPA, ~5 concurrents estimes)
Delai de reponse      : 10/10  (35j > 30j = max)
Potentiel strategique :  6/10  (ministere = reference, pas d'accord-cadre)
Effort de reponse     :  3/5   (dossier moyen, 8 pieces)
──────────────────────────────────────────────────
Score brut           : 86/100
Penalite proc. coll. :   0
Score final          : 86/100  --> RECOMMANDE

Expected Value [NOUS] :
  Montant = 60 000 EUR | Marge = 35% | Proba gain = 60%
  EV = 60000 x 0.35 x 0.60 - (40h x 80 EUR) = 12 600 - 3 200 = +9 400 EUR
```

### Scenario B : AO FAIBLE (commune, 8k EUR, jQuery/PHP legacy, 8j delai)

```
Adequation technique  :  5/30  (jQuery != stack Axiom, expertise inexistante)
Taille du marche      :  8/15  (8K EUR = petit, < sweet spot)
Modalites execution   :  0/15  (presence reguliere exigee, hors 974)
Chances de succes     : 10/15  (MAPA, concurrence locale faible)
Delai de reponse      :  1/10  (8j < 10j = penalise)
Potentiel strategique :  0/10  (commune, pas de renouvellement)
Effort de reponse     :  5/5   (dossier simple)
──────────────────────────────────────────────────
Score brut           : 29/100
Penalite proc. coll. :   0
Score final          : 29/100  --> ECARTE

Expected Value [NOUS] :
  EV = 8000 x 0.25 x 0.20 - (20h x 80) = 400 - 1 600 = -1 200 EUR (negatif)
```

### Scenario C : AO POSSIBLE (collectivite Reunion, 45k EUR, React/PHP, 25j delai)

```
Adequation technique  : 18/30  (React OK, PHP partiel, complexite moyenne)
Taille du marche      : 15/15  (45K EUR = sweet spot)
Modalites execution   : 10/15  (presence ponctuelle acceptable)
Chances de succes     : 12/15  (MAPA local, concurrence reduite, acheteur stable)
Delai de reponse      :  7/10  (25j = confortable)
Potentiel strategique :  7/10  (collectivite = reference locale, reconduction possible)
Effort de reponse     :  3/5   (dossier moyen)
──────────────────────────────────────────────────
Score brut           : 72/100  --> RECOMMANDE (>= 70)

Mais si adequation technique = 12/30 (PHP plus important) :
Score brut           : 66/100  --> POSSIBLE (50-69, decision Jonathan requise)

Expected Value [NOUS] :
  EV = 45000 x 0.30 x 0.55 - (40h x 80) = 7 425 - 3 200 = +4 225 EUR
```

---

## 9b.8 Taux de succes par type de marche **[NOUS]**

| Type | Taux de succes typique | Concurrence moyenne | Temps reponse recommande |
|------|------------------------|---------------------|--------------------------|
| **MAPA** (< 90k EUR) | 35-50% | 3-8 soumissions | 5-10 jours |
| **AO Ouvert** (> 90k EUR) | 15-25% | 15-30 soumissions | 20-40 jours |
| **AO Restreint** | 40-60% | 5-12 candidats | 15-30 jours |
| **Marche reconduction** | 60-80% | 2-4 concurrents | 10-20 jours |

**Implications pour Axiom** :
- Privilegier AO Restreint et reconductions (meilleur ROI)
- MAPA : repondre si budget > 15k EUR ET score >= 70 (RECOMMANDE)
- AO Ouvert : ultra-selectif (repondre seulement si SCORE >= 80)

---

## 9b.9 Estimation de la concurrence **[NOUS]**

**Heuristique empirique** :

| Type acheteur | Multiplicateur concurrence |
|---------------|---------------------------|
| Ministeres (Etat) | x1.5 |
| Grandes villes | x1.2 |
| Petites communes / MAPA | x0.8 |
| DOM-TOM | x0.6 |

**Sources pour estimer** :
1. Historique avis d'attribution (DECP via data.gouv.fr)
2. Nombre de telechargements DCE (si disponible sur plateforme)
3. Analyse sectorielle : ministere vs. petite commune

---

## 9b.10 Notifications Jonathan **[FUSION]**

```typescript
// agents/appels-offres/9b-qualificateur-decideur/notifications.ts

interface QualificationNotification {
  type: 'ao_qualification_result'
  priority: 'high' | 'medium' | 'low'
  reference: string
  titre: string
  acheteur: string
  score: number
  decision: 'RECOMMANDE' | 'POSSIBLE' | 'MARGINAL' | 'ECARTE'
  deadline: string
  jours_restants: number
  brief_decision: string         // [JONATHAN] Brief complet 1 page
  retroplanning: RetroPlanningJalon[]  // [JONATHAN]
  expected_value: number         // [NOUS]
  action_requise: string
}

async function notifyQualificationResult(
  analysis: DCEAnalysis,
  qualScore: QualificationScore
): Promise<void> {

  // [FUSION] Determiner le canal et la priorite selon la decision
  const config = {
    RECOMMANDE: { channel: '#ao-go', color: '#2ecc71', priority: 'medium' as const, emoji: ':white_check_mark:' },
    POSSIBLE:   { channel: '#ao-reviews', color: '#f39c12', priority: 'high' as const, emoji: ':warning:' },
    MARGINAL:   { channel: '#ao-reviews', color: '#f1c40f', priority: 'medium' as const, emoji: ':question:' },
    ECARTE:     { channel: '#ao-archive', color: '#95a5a6', priority: 'low' as const, emoji: ':no_entry_sign:' }
  }

  const cfg = config[qualScore.decision]

  // [NOUS] Slack notification
  await sendSlackNotification({
    channel: cfg.channel,
    text: `${cfg.emoji} *AO ${qualScore.decision}* - ${analysis.metadata.boamp_reference}\n` +
      `*${analysis.caracteristiques_marche.description_courte.substring(0, 100)}*\n` +
      `Acheteur: ${analysis.metadata.acheteur.nom}\n` +
      `Score: ${qualScore.score_final}/100\n` +
      `Montant: ${qualScore.revenue_estime.toLocaleString('fr-FR')} EUR HT\n` +
      `Deadline: ${analysis.metadata.date_deadline_offre} (${analysis.metadata.jours_avant_deadline}j)\n` +
      `EV: ${qualScore.expected_value > 0 ? '+' : ''}${qualScore.expected_value.toLocaleString('fr-FR')} EUR\n` +
      `${qualScore.decision === 'POSSIBLE' || qualScore.decision === 'MARGINAL'
        ? 'Action requise : decision Jonathan GO/NO-GO' : ''}`,
    attachments: [
      {
        color: cfg.color,
        fields: [
          { title: 'Score', value: `${qualScore.score_final}/100`, short: true },
          { title: 'Decision', value: qualScore.decision, short: true },
          { title: 'Jours restants', value: `${analysis.metadata.jours_avant_deadline}j`, short: true },
          { title: 'Expected Value', value: `${qualScore.expected_value} EUR`, short: true }
        ],
        // [JONATHAN] Boutons seulement pour POSSIBLE et MARGINAL
        ...(qualScore.decision === 'POSSIBLE' || qualScore.decision === 'MARGINAL' ? {
          actions: [
            { type: 'button', text: 'GO', value: 'go', style: 'primary' },
            { type: 'button', text: 'NO-GO', value: 'nogo', style: 'danger' },
            { type: 'button', text: 'Voir Brief', value: 'brief' }
          ]
        } : {})
      }
    ]
  })

  // [NOUS] Email pour POSSIBLE (decision requise)
  if (qualScore.decision === 'POSSIBLE') {
    await sendEmail({
      to: 'jonathan@axiom-marketing.com',
      subject: `[AO POSSIBLE] ${analysis.metadata.boamp_reference} - Score ${qualScore.score_final}/100`,
      body: qualScore.brief_decision
    })
  }

  // [NOUS] Stockage notification DB
  await db.query(
    `INSERT INTO notifications (type, priority, agent, data, read_at)
     VALUES ('ao_qualification', $1, 'agent_9b', $2, NULL)`,
    [cfg.priority, JSON.stringify({
      reference: analysis.metadata.boamp_reference,
      score: qualScore.score_final,
      decision: qualScore.decision,
      brief: qualScore.brief_decision,
      retroplanning: qualScore.retroplanning,
      expected_value: qualScore.expected_value
    })]
  )
}

export { notifyQualificationResult }
```

---

## 9b.11 Gestion des reponses Jonathan **[FUSION]**

```typescript
// agents/appels-offres/9b-qualificateur-decideur/review-response.ts

async function processJonathanReview(
  boampReference: string,
  decision: 'GO' | 'NO-GO',
  commentaire: string | null
): Promise<void> {

  // [FUSION] Mapper la decision Jonathan vers les 4 niveaux
  const decisionFinale = decision === 'GO' ? 'RECOMMANDE' : 'ECARTE'

  await db.query(
    `UPDATE ao_analyses
     SET decision_finale = $1, validated_by = 'jonathan', validated_at = NOW(),
         status = CASE WHEN $1 IN ('RECOMMANDE', 'POSSIBLE') THEN 'validated' ELSE 'abandoned' END
     WHERE boamp_reference = $2`,
    [decisionFinale, boampReference]
  )

  if (decision === 'GO') {
    // Lancer le pipeline 9c (redaction memoire)
    const analysis = await db.query(
      'SELECT extraction_json FROM ao_analyses WHERE boamp_reference = $1',
      [boampReference]
    )
    await agent9cQueue.add('generate-memoire', {
      boamp_reference: boampReference,
      analysis: analysis.rows[0].extraction_json,
      commentaire_jonathan: commentaire
    })

    // [NOUS] Notification Slack confirmation GO
    await sendSlackNotification({
      channel: '#ao-go',
      text: `:rocket: *GO CONFIRME* - ${boampReference}\nJonathan a valide. Lancement redaction memoire technique.`
    })
  } else {
    // Archiver et capitaliser
    await capitaliserDecisionNoGo(boampReference, commentaire)

    // [JONATHAN] Auto-archive MARGINAL non repondu sous 48h
    // (gere par un cron job separe)
  }
}

// [JONATHAN] Auto-archivage des MARGINAL non repondus
async function autoArchiveMarginal(): Promise<void> {
  const result = await db.query(
    `UPDATE ao_analyses
     SET decision_finale = 'ECARTE', status = 'abandoned',
         validated_by = 'auto_archive', validated_at = NOW()
     WHERE decision = 'MARGINAL'
       AND decision_finale IS NULL
       AND created_at < NOW() - INTERVAL '48 hours'
     RETURNING boamp_reference`
  )

  for (const row of result.rows) {
    await capitaliserDecisionNoGo(row.boamp_reference, 'Auto-archive : MARGINAL non repondu sous 48h')
  }
}

export { processJonathanReview, autoArchiveMarginal }
```

---


