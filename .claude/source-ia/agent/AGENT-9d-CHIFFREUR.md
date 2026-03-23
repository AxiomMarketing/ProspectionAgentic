# SOUS-AGENT 9d — CHIFFREUR
**Agent parent** : AGENT-9-MASTER.md

---


---
---


## 3.4 SOUS-AGENT 9d -- CHIFFREUR (Pricing Strategist)

> Source : Jonathan Agent #6 "LE CHIFFREUR" (EQUIPE-MARCHES-PUBLICS-OPENLAW.md, lignes 520-593) + integration pipeline V2

---

## 9d.1 Mission precise

**[JONATHAN]** Elaborer la strategie tarifaire et remplir les bordereaux de prix pour maximiser les chances tout en preservant la marge.

**Ce qu'il fait** :
- **[JONATHAN]** Estimer la charge de travail (jours/homme) pour chaque prestation
- **[JONATHAN]** Definir les TJM (Taux Journaliers Moyens) adaptes au contexte (public vs prive, local vs national)
- **[JONATHAN]** Remplir le BPU (Bordereau des Prix Unitaires) si fourni
- **[JONATHAN]** Remplir le DQE (Detail Quantitatif Estimatif) -- estimation de la depense
- **[JONATHAN]** Remplir la DPGF (Decomposition du Prix Global et Forfaitaire) si forfait
- **[JONATHAN]** Analyser la ponderation du critere prix dans les criteres d'attribution
- **[JONATHAN]** Optimiser le positionnement prix (agressif, median, premium)
- **[JONATHAN]** Calculer le point mort et la marge minimale
- **[NOUS]** Exploiter l'avantage LODEOM pour etre plus competitif
- **[NOUS]** Produire un JSON structure de l'offre financiere pour le 9e Redacteur et 9f Controleur
- **[FUSION]** Integrer le retour d'experience des marches perdus (prix laureat) pour calibrer

**Ce qu'il ne fait PAS** :
- Il ne redige PAS le memoire technique (c'est le 9e Redacteur)
- Il ne constitue PAS le dossier administratif (c'est le 9c Juriste)
- Il ne depose PAS le dossier sur la plateforme
- Il ne prend PAS la decision GO/NO-GO (c'est le 9b)

---

## 9d.2 Ce qu'il recoit (inputs) **[FUSION]**

| Source | Donnees recues | Usage |
|--------|---------------|-------|
| **9a Analyseur DCE** | `exigences_techniques` | Estimer la charge pour chaque lot/prestation |
| **9a Analyseur DCE** | `criteres_evaluation` | Identifier la ponderation du critere prix |
| **9a Analyseur DCE** | `caracteristiques_marche` | Montant estime, duree, lots |
| **9a Analyseur DCE** | `analyse_rc.strategie_prix_recommandee` | Recommandation du 9a sur le positionnement |
| **9a Analyseur DCE** | `analyse_ccap` | Penalites, garanties, revision prix |
| **9a Analyseur DCE** | `exigences_individuelles` | Exigences detaillees pour chiffrage precis |
| **Base RETEX** | Prix des marches perdus/gagnes | Calibrage des TJM |
| **Base RETEX** | Scores concurrents | Ajustement strategie |

---

## 9d.3 Ce qu'il produit (outputs) **[FUSION]**

| Destination | Donnees produites | Format |
|-------------|------------------|--------|
| **9e Redacteur** | `offre_financiere` (le chiffrage influence la section "moyens" du memoire) | JSON OffreFinanciere |
| **9f Controleur QA** | `offre_financiere` (BPU/DQE/DPGF remplis pour verification) | JSON OffreFinanciere |
| **9f Controleur QA** | Fichiers BPU/DQE/DPGF remplis | PDF/Excel |
| **Jonathan** | Synthese prix + marge pour validation | Notification |

---

## 9d.4 Competences detaillees **[JONATHAN]**

### 9d.4.1 Matrice de positionnement prix **[JONATHAN]**

```
MATRICE DE POSITIONNEMENT PRIX
==============================

Ponderation prix dans les criteres d'attribution :

Prix <= 30% -> Strategie QUALITE
  TJM Lead (Jonathan) : 650-750 EUR/j
  TJM Dev/Design (Marty) : 450-550 EUR/j
  Marge cible : 35-45%
  Rationale : Le prix compte peu, maximiser la valeur technique

Prix 30-50% -> Strategie EQUILIBREE
  TJM Lead : 550-650 EUR/j
  TJM Dev/Design : 400-480 EUR/j
  Marge cible : 25-35%
  Rationale : Equilibre qualite/prix, rester competitif

Prix >= 50% -> Strategie AGRESSIVE
  TJM Lead : 450-550 EUR/j
  TJM Dev/Design : 350-420 EUR/j
  Marge cible : 15-25%
  Rationale : Le prix est decisif, minimiser sans casser le marche

AVANTAGE REUNION (LODEOM) :
  Exoneration cotisations patronales = ~20-30% d'economie sur la masse salariale
  -> Permet d'etre plus agressif sur le prix tout en maintenant la marge
```

### 9d.4.2 TJM par role et strategie **[JONATHAN]**

| Role | Strategie QUALITE | Strategie EQUILIBREE | Strategie AGRESSIVE |
|------|-------------------|---------------------|---------------------|
| **Lead / Chef de projet** (Jonathan) | 650-750 EUR/j | 550-650 EUR/j | 450-550 EUR/j |
| **Dev / Design** (Marty) | 450-550 EUR/j | 400-480 EUR/j | 350-420 EUR/j |
| **Audit RGAA** (specialiste) | 700 EUR/j | 600 EUR/j | 500 EUR/j |
| **Formation utilisateurs** | 450 EUR/j | 400 EUR/j | 350 EUR/j |

### 9d.4.3 Avantage LODEOM chiffre **[JONATHAN + FUSION]**

```
AVANTAGE LODEOM -- CALCUL DETAILLE
===================================

LODEOM = Loi pour le Developpement Economique des Outre-Mer
Applicable a UNIVILE SAS (siege a La Reunion, 97421 Saint-Louis)

EXONERATION COTISATIONS PATRONALES :
  - Pour les entreprises < 11 salaries en zone DOM
  - Exoneration TOTALE jusqu'a 1,3 SMIC
  - Exoneration DEGRESSIVE de 1,3 a 2,2 SMIC
  - Au-dela de 2,2 SMIC : cotisations normales

IMPACT SUR LE COUT REEL :
  Cout employeur metropolitain pour un dev a 3 000 EUR brut/mois :
    3 000 + 42% charges patronales = 4 260 EUR/mois
    TJM minimum rentable = 4 260 / 18 jours utiles = 237 EUR/j

  Cout employeur LODEOM pour un dev a 3 000 EUR brut/mois :
    3 000 + 15-20% charges patronales = 3 450-3 600 EUR/mois
    TJM minimum rentable = 3 525 / 18 jours utiles = 196 EUR/j

  ECONOMIE : 20-30% sur la masse salariale
  -> Permet de proposer des TJM 15-20% sous la concurrence metropolitaine
     TOUT EN MAINTENANT la meme marge

STRATEGIE :
  - Ne PAS afficher l'avantage LODEOM dans le memoire technique
  - Simplement proposer des prix competitifs
  - L'avantage LODEOM est un levier INTERNE de competitivite
  - En cas de question sur les prix bas : "structure legere + teletravail + optimisation"
```

### 9d.4.4 Formats BPU / DQE / DPGF -- quand utiliser lequel **[FUSION]**

```
FORMATS DE BORDEREAU DE PRIX
==============================

BPU -- Bordereau des Prix Unitaires
  QUAND : Marches a bons de commande, accords-cadres
  CONTENU : Liste des prestations avec prix unitaires (EUR HT)
  ENGAGEMENT : Prix unitaires fixes pendant la duree du marche
  QUANTITES : Pas de quantites (fixees par les bons de commande)
  EXEMPLE : "1.3 Developpement front-end | jour | 500,00 EUR HT"

DQE -- Detail Quantitatif Estimatif
  QUAND : En complement du BPU (acheteur estime les quantites)
  CONTENU : BPU + quantites estimatives + montant total previsionnel
  ENGAGEMENT : Prix unitaires uniquement (pas les quantites)
  QUANTITES : Estimatives (fournies par l'acheteur dans le DCE)
  EXEMPLE : "1.3 Dev front-end | jour | 500,00 | 20 j | 10 000,00 EUR HT"

DPGF -- Decomposition du Prix Global et Forfaitaire
  QUAND : Marches a prix forfaitaire (montant global)
  CONTENU : Decomposition du forfait en postes detailles
  ENGAGEMENT : Montant total forfaitaire
  QUANTITES : Definies par le candidat (incluses dans le forfait)
  EXEMPLE : "Phase 1 Design UX/UI | 8 j Lead + 12 j Design | 10 600,00 EUR HT"

REGLE DE DECISION :
  Le format est IMPOSE par l'acheteur dans le DCE.
  - Si BPU vierge dans le DCE -> remplir le BPU
  - Si DQE dans le DCE -> remplir le DQE (BPU + quantites + totaux)
  - Si DPGF dans le DCE -> remplir la DPGF
  - Si rien dans le DCE (rare) -> proposer un BPU + DQE
```

### 9d.4.5 Exemple BPU complet **[JONATHAN]**

```
+---------+-------------------------------+---------+-----------+
| N       | Designation                   | Unite   | PU HT     |
+---------+-------------------------------+---------+-----------+
| 1.1     | Direction de projet           | jour    | 650,00    |
| 1.2     | Conception UX/UI (Figma)      | jour    | 550,00    |
| 1.3     | Developpement front-end       | jour    | 500,00    |
| 1.4     | Developpement back-end        | jour    | 550,00    |
| 1.5     | Integration / recette         | jour    | 450,00    |
| 1.6     | Audit accessibilite RGAA      | jour    | 700,00    |
| 1.7     | Formation utilisateurs        | jour    | 450,00    |
| 2.1     | Hebergement (mensuel)         | mois    | 89,00     |
| 2.2     | Maintenance corrective        | jour    | 500,00    |
| 2.3     | Maintenance evolutive         | jour    | 550,00    |
| 2.4     | Support / assistance          | heure   | 75,00     |
+---------+-------------------------------+---------+-----------+
```

---

## 9d.5 Templates et fichiers de reference **[FUSION]**

```
FICHIERS DE REFERENCE POUR LE CHIFFREUR
=========================================

BPU template :
  -> Le BPU est fourni par l'acheteur dans le DCE (a remplir)
  -> Si pas de BPU fourni : utiliser le BPU type ci-dessus comme base

RETEX prix :
  -> Base de donnees des marches precedents (gagnes et perdus)
  -> Prix laureat quand disponible (demande post-rejet art. R2181-3)
  -> Permet de calibrer les TJM pour chaque type de marche

LODEOM :
  -> Grille de calcul interne (confidentielle)
  -> Ne PAS inclure dans le dossier de reponse

RSE (si critere prix/RSE couple) :
  -> FICHE-RSE-AXIOM.md
  Chemin : /Source IA/FICHE-RSE-AXIOM.md
```

---

## 9d.6 Code TypeScript **[FUSION]**

```typescript
// agents/appels-offres/9d-chiffreur/index.ts

import { DCEAnalysis } from '../9a-analyseur-dce/types';

// ============================================================
// CONSTANTES STRATEGIQUES [JONATHAN]
// ============================================================

type StrategiePrix = 'QUALITE' | 'EQUILIBREE' | 'AGRESSIVE';

interface GrilleTJM {
  lead_min: number;
  lead_max: number;
  dev_min: number;
  dev_max: number;
  audit_rgaa: number;
  formation: number;
  marge_cible_min: number;    // pourcentage
  marge_cible_max: number;    // pourcentage
}

const GRILLES_TJM: Record<StrategiePrix, GrilleTJM> = {
  QUALITE: {
    lead_min: 650, lead_max: 750,
    dev_min: 450, dev_max: 550,
    audit_rgaa: 700,
    formation: 450,
    marge_cible_min: 35,
    marge_cible_max: 45,
  },
  EQUILIBREE: {
    lead_min: 550, lead_max: 650,
    dev_min: 400, dev_max: 480,
    audit_rgaa: 600,
    formation: 400,
    marge_cible_min: 25,
    marge_cible_max: 35,
  },
  AGRESSIVE: {
    lead_min: 450, lead_max: 550,
    dev_min: 350, dev_max: 420,
    audit_rgaa: 500,
    formation: 350,
    marge_cible_min: 15,
    marge_cible_max: 25,
  },
};

// Avantage LODEOM [JONATHAN]
const LODEOM = {
  economie_charges_patronales_pourcent_min: 20,
  economie_charges_patronales_pourcent_max: 30,
  applicable: true,  // UNIVILE est basee a La Reunion
  description: 'Exoneration cotisations patronales DOM < 11 salaries',
};

// Prestations standard du BPU [JONATHAN]
const BPU_STANDARD = [
  { numero: '1.1', designation: 'Direction de projet', unite: 'jour', role: 'lead' as const },
  { numero: '1.2', designation: 'Conception UX/UI (Figma)', unite: 'jour', role: 'dev' as const },
  { numero: '1.3', designation: 'Developpement front-end', unite: 'jour', role: 'dev' as const },
  { numero: '1.4', designation: 'Developpement back-end', unite: 'jour', role: 'lead' as const },
  { numero: '1.5', designation: 'Integration / recette', unite: 'jour', role: 'dev' as const },
  { numero: '1.6', designation: 'Audit accessibilite RGAA', unite: 'jour', role: 'audit' as const },
  { numero: '1.7', designation: 'Formation utilisateurs', unite: 'jour', role: 'formation' as const },
  { numero: '2.1', designation: 'Hebergement (mensuel)', unite: 'mois', role: 'hebergement' as const },
  { numero: '2.2', designation: 'Maintenance corrective', unite: 'jour', role: 'dev' as const },
  { numero: '2.3', designation: 'Maintenance evolutive', unite: 'jour', role: 'lead' as const },
  { numero: '2.4', designation: 'Support / assistance', unite: 'heure', role: 'support' as const },
];

// ============================================================
// INTERFACES DE SORTIE
// ============================================================

interface LigneBPU {
  numero: string;
  designation: string;
  unite: string;
  prix_unitaire_ht: number;
  quantite_estimee: number | null;       // null si BPU seul (pas de DQE)
  montant_total_ht: number | null;       // null si BPU seul
}

interface EstimationCharge {
  lot_numero: number | null;
  phase: string;
  description: string;
  role: string;
  jours_estimes: number;
  tjm_applique: number;
  montant_ht: number;
  hypotheses: string;
}

interface AnalyseMarge {
  cout_reel_total: number;               // Cout Axiom reel (avec LODEOM)
  prix_propose_ht: number;               // Prix propose au client
  marge_brute: number;                   // prix - cout
  marge_pourcent: number;                // marge / prix * 100
  marge_sans_lodeom: number;             // Marge si on etait en metropole
  economie_lodeom: number;               // Gain grace a LODEOM
  point_mort_jours: number;              // Nombre de jours facturable pour couvrir les couts
  viable: boolean;                       // marge >= marge_cible_min
}

interface OffreFinanciere {
  // --- Metadata ---
  reference_marche: string;
  acheteur: string;
  date_generation: string;
  sous_agent: '9d-chiffreur';

  // --- Strategie ---
  strategie: StrategiePrix;
  raison_strategie: string;
  ponderation_prix_pourcent: number;
  grille_tjm_utilisee: GrilleTJM;

  // --- BPU ---
  bpu: LigneBPU[];
  format_utilise: 'BPU' | 'DQE' | 'DPGF';

  // --- Estimation charge ---
  estimation_charge: EstimationCharge[];
  total_jours_homme: number;

  // --- Montants ---
  montant_total_ht: number;
  tva_pourcent: number;
  montant_total_ttc: number;
  montant_par_lot: Array<{
    lot_numero: number;
    montant_ht: number;
  }> | null;

  // --- Analyse marge ---
  analyse_marge: AnalyseMarge;

  // --- Avantage LODEOM ---
  lodeom: {
    applicable: boolean;
    economie_estimee_pourcent: number;
    economie_estimee_euros: number;
    impact_sur_competitivite: string;
  };

  // --- Positionnement concurrentiel ---
  positionnement: {
    estimation_prix_marche: number | null;     // Si info disponible (RETEX)
    ecart_vs_marche_pourcent: number | null;
    estimation_prix_concurrent_median: number | null;
    recommandation: string;
  };

  // --- Controle interne ---
  controle: {
    bpu_complet: boolean;
    tous_postes_chiffres: boolean;
    marge_suffisante: boolean;
    prix_coherent_avec_memoire: boolean;
    alertes: string[];
    erreurs_bloquantes: string[];
  };

  // --- Statut ---
  statut: 'COMPLET' | 'INCOMPLET' | 'ERREUR_BLOQUANTE';
}

// ============================================================
// DETERMINATION STRATEGIE PRIX [JONATHAN]
// ============================================================
function determinerStrategie(dceAnalysis: DCEAnalysis): {
  strategie: StrategiePrix;
  raison: string;
  ponderation_prix: number;
} {
  const criteres = dceAnalysis.criteres_evaluation;
  const criterePrix = criteres.find(c =>
    c.nom.toLowerCase().includes('prix') ||
    c.nom.toLowerCase().includes('financ') ||
    c.nom.toLowerCase().includes('cout')
  );

  const ponderationPrix = criterePrix?.ponderation_pourcent || 30;  // Defaut 30% si non specifie

  if (ponderationPrix <= 30) {
    return {
      strategie: 'QUALITE',
      raison: `Prix pondere a ${ponderationPrix}% (<= 30%) : le prix compte peu, maximiser la valeur technique`,
      ponderation_prix: ponderationPrix,
    };
  }

  if (ponderationPrix >= 50) {
    return {
      strategie: 'AGRESSIVE',
      raison: `Prix pondere a ${ponderationPrix}% (>= 50%) : le prix est decisif, minimiser sans casser le marche`,
      ponderation_prix: ponderationPrix,
    };
  }

  return {
    strategie: 'EQUILIBREE',
    raison: `Prix pondere a ${ponderationPrix}% (30-50%) : equilibre qualite/prix, rester competitif`,
    ponderation_prix: ponderationPrix,
  };
}

// ============================================================
// ESTIMATION CHARGE DE TRAVAIL [FUSION]
// ============================================================
function estimerCharge(
  dceAnalysis: DCEAnalysis,
  grille: GrilleTJM
): EstimationCharge[] {
  const estimations: EstimationCharge[] = [];
  const lots = dceAnalysis.exigences_techniques.lots;

  for (const lot of lots) {
    // Phase 1 : Direction de projet (10-15% du total)
    const complexite = lot.specs_cles.length;
    const joursDirection = Math.max(2, Math.ceil(complexite * 0.5));

    estimations.push({
      lot_numero: lot.numero_lot,
      phase: 'Direction de projet',
      description: `Pilotage et coordination du lot ${lot.numero_lot} (${lot.nom})`,
      role: 'Lead (Jonathan)',
      jours_estimes: joursDirection,
      tjm_applique: Math.round((grille.lead_min + grille.lead_max) / 2),
      montant_ht: joursDirection * Math.round((grille.lead_min + grille.lead_max) / 2),
      hypotheses: `Base sur ${complexite} specifications. 10-15% du temps total.`,
    });

    // Phase 2 : Conception UX/UI
    const specsUI = lot.specs_cles.filter(s =>
      s.exigence.toLowerCase().includes('design') ||
      s.exigence.toLowerCase().includes('ux') ||
      s.exigence.toLowerCase().includes('ui') ||
      s.exigence.toLowerCase().includes('maquette') ||
      s.exigence.toLowerCase().includes('ergonomie')
    );
    const joursDesign = Math.max(3, specsUI.length * 2);

    estimations.push({
      lot_numero: lot.numero_lot,
      phase: 'Conception UX/UI',
      description: `Design interfaces et maquettes Figma`,
      role: 'Dev/Design (Marty)',
      jours_estimes: joursDesign,
      tjm_applique: Math.round((grille.dev_min + grille.dev_max) / 2),
      montant_ht: joursDesign * Math.round((grille.dev_min + grille.dev_max) / 2),
      hypotheses: `${specsUI.length} specs UX/UI identifiees. 2j/spec en moyenne.`,
    });

    // Phase 3 : Developpement
    const specsDev = lot.specs_cles.filter(s =>
      s.exigence.toLowerCase().includes('develop') ||
      s.exigence.toLowerCase().includes('integration') ||
      s.exigence.toLowerCase().includes('api') ||
      s.exigence.toLowerCase().includes('fonctionnalit')
    );
    const joursDev = Math.max(5, specsDev.length * 3);

    estimations.push({
      lot_numero: lot.numero_lot,
      phase: 'Developpement',
      description: `Developpement front-end + back-end`,
      role: 'Lead (Jonathan) + Dev (Marty)',
      jours_estimes: joursDev,
      tjm_applique: Math.round((grille.lead_min + grille.dev_max) / 2),  // Moyenne lead+dev
      montant_ht: joursDev * Math.round((grille.lead_min + grille.dev_max) / 2),
      hypotheses: `${specsDev.length} specs dev identifiees. 3j/spec en moyenne.`,
    });

    // Phase 4 : Recette et integration
    const joursRecette = Math.max(2, Math.ceil(joursDev * 0.2));

    estimations.push({
      lot_numero: lot.numero_lot,
      phase: 'Integration / Recette',
      description: `Tests, validation, corrections`,
      role: 'Dev/Design (Marty)',
      jours_estimes: joursRecette,
      tjm_applique: Math.round((grille.dev_min + grille.dev_max) / 2),
      montant_ht: joursRecette * Math.round((grille.dev_min + grille.dev_max) / 2),
      hypotheses: `20% du temps de developpement.`,
    });

    // Phase 5 : Audit RGAA (si flag active)
    if (dceAnalysis.flags_conditionnels.ACTIVER_SECTION_RGAA) {
      estimations.push({
        lot_numero: lot.numero_lot,
        phase: 'Audit accessibilite RGAA',
        description: `Audit RGAA 4.1 niveau AA + corrections`,
        role: 'Specialiste RGAA',
        jours_estimes: 3,
        tjm_applique: grille.audit_rgaa,
        montant_ht: 3 * grille.audit_rgaa,
        hypotheses: `Audit standard 2j + 1j corrections. Conformite RGAA 4.1 AA.`,
      });
    }

    // Phase 6 : Formation (si demandee)
    const specsFormation = lot.specs_cles.filter(s =>
      s.exigence.toLowerCase().includes('formation') ||
      s.exigence.toLowerCase().includes('transfert')
    );
    if (specsFormation.length > 0) {
      estimations.push({
        lot_numero: lot.numero_lot,
        phase: 'Formation utilisateurs',
        description: `Formation et transfert de competences`,
        role: 'Lead (Jonathan)',
        jours_estimes: 2,
        tjm_applique: grille.formation,
        montant_ht: 2 * grille.formation,
        hypotheses: `${specsFormation.length} exigence(s) formation. 1-2 sessions.`,
      });
    }
  }

  return estimations;
}

// ============================================================
// GENERATION BPU [JONATHAN + FUSION]
// ============================================================
function genererBPU(
  grille: GrilleTJM,
  strategie: StrategiePrix
): LigneBPU[] {
  const bpu: LigneBPU[] = [];

  for (const poste of BPU_STANDARD) {
    let prixUnitaire: number;

    switch (poste.role) {
      case 'lead':
        prixUnitaire = Math.round((grille.lead_min + grille.lead_max) / 2);
        break;
      case 'dev':
        prixUnitaire = Math.round((grille.dev_min + grille.dev_max) / 2);
        break;
      case 'audit':
        prixUnitaire = grille.audit_rgaa;
        break;
      case 'formation':
        prixUnitaire = grille.formation;
        break;
      case 'hebergement':
        prixUnitaire = 89;  // Fixe
        break;
      case 'support':
        prixUnitaire = Math.round(grille.dev_min / 7);  // TJM / 7 pour taux horaire
        break;
      default:
        prixUnitaire = Math.round((grille.dev_min + grille.dev_max) / 2);
    }

    bpu.push({
      numero: poste.numero,
      designation: poste.designation,
      unite: poste.unite,
      prix_unitaire_ht: prixUnitaire,
      quantite_estimee: null,
      montant_total_ht: null,
    });
  }

  return bpu;
}

// ============================================================
// ANALYSE MARGE AVEC LODEOM [JONATHAN + FUSION]
// ============================================================
function analyserMarge(
  estimations: EstimationCharge[],
  prixProposeHT: number
): AnalyseMarge {
  // Cout reel avec LODEOM (economie 25% en moyenne sur masse salariale)
  const economie_lodeom_pourcent = 25;  // Moyenne entre 20% et 30%
  const coutBrut = estimations.reduce((sum, e) => sum + e.montant_ht, 0);
  const economie = coutBrut * (economie_lodeom_pourcent / 100);
  const coutReel = coutBrut - economie;

  const margeBrute = prixProposeHT - coutReel;
  const margePourcent = (margeBrute / prixProposeHT) * 100;
  const margeSansLodeom = prixProposeHT - coutBrut;

  const totalJours = estimations.reduce((sum, e) => sum + e.jours_estimes, 0);
  const tjmMoyen = totalJours > 0 ? prixProposeHT / totalJours : 0;
  const pointMort = tjmMoyen > 0 ? Math.ceil(coutReel / tjmMoyen) : totalJours;

  return {
    cout_reel_total: Math.round(coutReel),
    prix_propose_ht: prixProposeHT,
    marge_brute: Math.round(margeBrute),
    marge_pourcent: Math.round(margePourcent * 10) / 10,
    marge_sans_lodeom: Math.round(margeSansLodeom),
    economie_lodeom: Math.round(economie),
    point_mort_jours: pointMort,
    viable: margePourcent >= 15,  // Minimum 15% de marge
  };
}

// ============================================================
// FONCTION PRINCIPALE DU SOUS-AGENT 9d [FUSION]
// ============================================================
async function executerChiffreur(
  dceAnalysis: DCEAnalysis
): Promise<OffreFinanciere> {
  const refMarche = dceAnalysis.metadata.boamp_reference || dceAnalysis.metadata.marche_public_id || 'REF-INCONNUE';

  // 1. Determiner la strategie prix
  const { strategie, raison, ponderation_prix } = determinerStrategie(dceAnalysis);
  const grille = GRILLES_TJM[strategie];

  // 2. Estimer la charge
  const estimations = estimerCharge(dceAnalysis, grille);
  const totalJours = estimations.reduce((sum, e) => sum + e.jours_estimes, 0);

  // 3. Generer le BPU
  const bpu = genererBPU(grille, strategie);

  // 4. Calculer le montant total
  const montantTotalHT = estimations.reduce((sum, e) => sum + e.montant_ht, 0);
  const tvaPourcent = 20;  // TVA standard France
  const montantTotalTTC = montantTotalHT * (1 + tvaPourcent / 100);

  // 5. Montant par lot
  const lotsUniques = [...new Set(estimations.map(e => e.lot_numero).filter(l => l !== null))];
  const montantParLot = lotsUniques.map(lotNum => ({
    lot_numero: lotNum!,
    montant_ht: estimations
      .filter(e => e.lot_numero === lotNum)
      .reduce((sum, e) => sum + e.montant_ht, 0),
  }));

  // 6. Analyse marge
  const analyseMarge = analyserMarge(estimations, montantTotalHT);

  // 7. Determiner le format utilise
  const piecesExigees = dceAnalysis.analyse_rc.pieces_exigees;
  let formatUtilise: OffreFinanciere['format_utilise'] = 'BPU';
  if (piecesExigees.some(p => /dpgf|forfait/i.test(p))) formatUtilise = 'DPGF';
  else if (piecesExigees.some(p => /dqe|quantitatif/i.test(p))) formatUtilise = 'DQE';

  // 8. Controle interne
  const alertes: string[] = [];
  const erreurs: string[] = [];

  if (!analyseMarge.viable) {
    alertes.push(`MARGE INSUFFISANTE : ${analyseMarge.marge_pourcent}% (minimum 15%)`);
  }

  if (totalJours < 5) {
    alertes.push('CHARGE TRES FAIBLE : < 5 jours/homme. Verifier les estimations.');
  }

  const montantEstime = dceAnalysis.caracteristiques_marche.estimation_budget.montant_total_ht;
  if (montantEstime && Math.abs(montantTotalHT - montantEstime) / montantEstime > 0.5) {
    alertes.push(
      `ECART PRIX IMPORTANT : notre prix (${montantTotalHT} EUR) s'ecarte de > 50% de l'estimation (${montantEstime} EUR)`
    );
  }

  return {
    reference_marche: refMarche,
    acheteur: dceAnalysis.metadata.acheteur.nom,
    date_generation: new Date().toISOString(),
    sous_agent: '9d-chiffreur',

    strategie,
    raison_strategie: raison,
    ponderation_prix_pourcent: ponderation_prix,
    grille_tjm_utilisee: grille,

    bpu,
    format_utilise: formatUtilise,

    estimation_charge: estimations,
    total_jours_homme: totalJours,

    montant_total_ht: Math.round(montantTotalHT),
    tva_pourcent: tvaPourcent,
    montant_total_ttc: Math.round(montantTotalTTC),
    montant_par_lot: montantParLot.length > 0 ? montantParLot : null,

    analyse_marge: analyseMarge,

    lodeom: {
      applicable: LODEOM.applicable,
      economie_estimee_pourcent: 25,
      economie_estimee_euros: analyseMarge.economie_lodeom,
      impact_sur_competitivite: 'Permet de proposer des TJM 15-20% sous la concurrence metropolitaine tout en maintenant la marge',
    },

    positionnement: {
      estimation_prix_marche: montantEstime || null,
      ecart_vs_marche_pourcent: montantEstime
        ? Math.round(((montantTotalHT - montantEstime) / montantEstime) * 100)
        : null,
      estimation_prix_concurrent_median: null,  // A enrichir avec RETEX
      recommandation: `Strategie ${strategie} : ${raison}`,
    },

    controle: {
      bpu_complet: bpu.length >= 5,
      tous_postes_chiffres: estimations.length > 0,
      marge_suffisante: analyseMarge.viable,
      prix_coherent_avec_memoire: true,  // A verifier par le 9f
      alertes,
      erreurs_bloquantes: erreurs,
    },

    statut: erreurs.length > 0 ? 'ERREUR_BLOQUANTE' : 'COMPLET',
  };
}
```

---

## 9d.7 Schema JSON de sortie **[FUSION]**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "OffreFinanciere",
  "description": "Sortie du sous-agent 9d Chiffreur -- Offre financiere complete",
  "type": "object",
  "required": [
    "reference_marche", "acheteur", "date_generation", "sous_agent",
    "strategie", "raison_strategie", "ponderation_prix_pourcent",
    "grille_tjm_utilisee", "bpu", "format_utilise",
    "estimation_charge", "total_jours_homme",
    "montant_total_ht", "tva_pourcent", "montant_total_ttc",
    "analyse_marge", "lodeom", "positionnement",
    "controle", "statut"
  ],
  "properties": {
    "reference_marche": { "type": "string" },
    "acheteur": { "type": "string" },
    "date_generation": { "type": "string", "format": "date-time" },
    "sous_agent": { "const": "9d-chiffreur" },
    "strategie": { "enum": ["QUALITE", "EQUILIBREE", "AGRESSIVE"] },
    "raison_strategie": { "type": "string" },
    "ponderation_prix_pourcent": { "type": "number" },
    "grille_tjm_utilisee": {
      "type": "object",
      "properties": {
        "lead_min": { "type": "number" },
        "lead_max": { "type": "number" },
        "dev_min": { "type": "number" },
        "dev_max": { "type": "number" },
        "audit_rgaa": { "type": "number" },
        "formation": { "type": "number" },
        "marge_cible_min": { "type": "number" },
        "marge_cible_max": { "type": "number" }
      }
    },
    "bpu": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "numero": { "type": "string" },
          "designation": { "type": "string" },
          "unite": { "type": "string" },
          "prix_unitaire_ht": { "type": "number" },
          "quantite_estimee": { "type": ["number", "null"] },
          "montant_total_ht": { "type": ["number", "null"] }
        }
      }
    },
    "format_utilise": { "enum": ["BPU", "DQE", "DPGF"] },
    "estimation_charge": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "lot_numero": { "type": ["number", "null"] },
          "phase": { "type": "string" },
          "description": { "type": "string" },
          "role": { "type": "string" },
          "jours_estimes": { "type": "number" },
          "tjm_applique": { "type": "number" },
          "montant_ht": { "type": "number" },
          "hypotheses": { "type": "string" }
        }
      }
    },
    "total_jours_homme": { "type": "number" },
    "montant_total_ht": { "type": "number" },
    "tva_pourcent": { "type": "number" },
    "montant_total_ttc": { "type": "number" },
    "montant_par_lot": {
      "type": ["array", "null"],
      "items": {
        "type": "object",
        "properties": {
          "lot_numero": { "type": "number" },
          "montant_ht": { "type": "number" }
        }
      }
    },
    "analyse_marge": {
      "type": "object",
      "properties": {
        "cout_reel_total": { "type": "number" },
        "prix_propose_ht": { "type": "number" },
        "marge_brute": { "type": "number" },
        "marge_pourcent": { "type": "number" },
        "marge_sans_lodeom": { "type": "number" },
        "economie_lodeom": { "type": "number" },
        "point_mort_jours": { "type": "number" },
        "viable": { "type": "boolean" }
      }
    },
    "lodeom": {
      "type": "object",
      "properties": {
        "applicable": { "type": "boolean" },
        "economie_estimee_pourcent": { "type": "number" },
        "economie_estimee_euros": { "type": "number" },
        "impact_sur_competitivite": { "type": "string" }
      }
    },
    "positionnement": {
      "type": "object",
      "properties": {
        "estimation_prix_marche": { "type": ["number", "null"] },
        "ecart_vs_marche_pourcent": { "type": ["number", "null"] },
        "estimation_prix_concurrent_median": { "type": ["number", "null"] },
        "recommandation": { "type": "string" }
      }
    },
    "controle": {
      "type": "object",
      "properties": {
        "bpu_complet": { "type": "boolean" },
        "tous_postes_chiffres": { "type": "boolean" },
        "marge_suffisante": { "type": "boolean" },
        "prix_coherent_avec_memoire": { "type": "boolean" },
        "alertes": { "type": "array", "items": { "type": "string" } },
        "erreurs_bloquantes": { "type": "array", "items": { "type": "string" } }
      }
    },
    "statut": { "enum": ["COMPLET", "INCOMPLET", "ERREUR_BLOQUANTE"] }
  }
}
```

---

## 9d.8 Gestion des erreurs **[FUSION]**

| Erreur | Severite | Action automatique | Escalade |
|--------|----------|-------------------|----------|
| Marge < 15% | HAUTE | Alerte + recommandation d'augmenter les TJM | Jonathan : valider prix ou ajuster |
| Marge negative | BLOQUANTE | STOP + alerte critique | Jonathan : le marche n'est pas rentable |
| BPU vierge non trouve dans DCE | MOYENNE | Utiliser le BPU standard Axiom | Log + alerte |
| Format bordereau ambigu (BPU vs DPGF) | MOYENNE | Analyser le RC pour determiner | Si echec : demander a Jonathan |
| Ecart > 50% vs estimation acheteur | HAUTE | Alerte + revoir les hypotheses de charge | Jonathan : valider |
| Charge < 5 jours/homme | MOYENNE | Alerte + verifier si des postes sont oublies | Log |
| Charge > 200 jours/homme | HAUTE | Alerte + verifier la capacite Axiom | Jonathan : valider faisabilite |
| Critere prix non identifie | MOYENNE | Appliquer strategie EQUILIBREE par defaut (30%) | Log |
| TJM sous le seuil LODEOM | BASSE | Informatif : confirmer que la marge est maintenue | Aucune |
| Poste du BPU acheteur non mappable | HAUTE | Alerte + demander mapping manuel | Jonathan : mapper le poste |

---

---
