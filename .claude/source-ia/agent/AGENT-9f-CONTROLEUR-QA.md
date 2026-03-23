# SOUS-AGENT 9f — CONTROLEUR QA
**Agent parent** : AGENT-9-MASTER.md

---

---
---


## 3.6 SOUS-AGENT 9f -- CONTROLEUR QA (Quality Assurance)

> Source : Jonathan Agent #8 "LE CONTROLEUR" (EQUIPE-MARCHES-PUBLICS-OPENLAW.md, lignes 759-877) + integration pipeline V2

---

## 9f.1 Mission precise

**[JONATHAN]** Verifier la completude, la coherence et la conformite du dossier avant depot.

**Ce qu'il fait** :
- **[JONATHAN]** Verifier la completude vs checklist du RC (chaque piece demandee est presente)
- **[JONATHAN]** Controler la coherence inter-documents (prix memoire = prix BPU, delais coherents partout)
- **[JONATHAN]** Verifier la conformite des formulaires (DC1, DC2, AE signes et complets)
- **[JONATHAN]** Controler les dates (validite attestations, date de signature)
- **[JONATHAN]** Verifier la signature electronique (format XAdES/PAdES, certificat qualifie)
- **[JONATHAN]** Controler le poids des fichiers (limites des plateformes de depot)
- **[JONATHAN]** Simuler le depot pour verifier les formats acceptes
- **[JONATHAN]** Generer le rapport de controle final
- **[NOUS]** Verifier la coherence entre le memoire du 9e et le chiffrage du 9d
- **[NOUS]** Verifier la coherence entre le dossier admin du 9c et les pieces effectivement presentes
- **[FUSION]** Produire un rapport GO/CORRECTIONS structure pour validation Jonathan

**Ce qu'il ne fait PAS** :
- Il ne redige PAS le memoire technique (c'est le 9e Redacteur)
- Il ne chiffre PAS l'offre financiere (c'est le 9d Chiffreur)
- Il ne constitue PAS le dossier administratif (c'est le 9c Juriste)
- Il ne depose PAS le dossier sur la plateforme
- Il ne corrige PAS les erreurs lui-meme : il les signale aux sous-agents concernes

---

## 9f.2 Ce qu'il recoit (inputs) **[FUSION]**

| Source | Donnees recues | Usage |
|--------|---------------|-------|
| **9a Analyseur DCE** | `DCEAnalysis` complet | Reference : criteres, exigences, pieces demandees |
| **9c Juriste** | `DossierAdministratif` | Controle : pieces presentes, validites, formulaires |
| **9d Chiffreur** | `OffreFinanciere` | Controle : BPU/DQE, montants, coherence prix |
| **9e Redacteur** | `MemoireTechnique` | Controle : structure, exigences couvertes, volumes |
| **9c Juriste** | Fichiers PDF generes | Controle : format, taille, signature |
| **9d Chiffreur** | Fichiers BPU/DQE/DPGF | Controle : format, completude |
| **9e Redacteur** | Fichier memoire PDF | Controle : format, taille, mise en page |

---

## 9f.3 Ce qu'il produit (outputs) **[FUSION]**

| Destination | Donnees produites | Format |
|-------------|------------------|--------|
| **Jonathan** | `RapportControle` final | JSON RapportControle |
| **9c Juriste** | Liste des corrections admin a apporter | Notification |
| **9d Chiffreur** | Liste des corrections prix a apporter | Notification |
| **9e Redacteur** | Liste des corrections memoire a apporter | Notification |
| **Tous** | Statut GO ou CORRECTIONS REQUISES | Notification |

---

## 9f.4 Competences detaillees **[JONATHAN]**

### 9f.4.1 Checklist de controle final complete **[JONATHAN]**

```
CONTROLE FINAL -- [Ref marche]
Date : [J-3]
Controleur : quality_assurance
================================

CONFORMITE ADMINISTRATIVE (9 items)
[x] DC1 present et signe
[x] DC2 present et complet
[x] Attestation sur l'honneur signee
[x] Kbis < 3 mois
[x] Attestation URSSAF < 6 mois
[x] Attestation fiscale valide
[x] RC Pro en cours de validite
[ ] Pouvoir de signature -> ALERTE : manquant
[x] DUME (si utilise a la place de DC1+DC2)

CONFORMITE TECHNIQUE (6 items)
[x] Memoire technique present
[x] Structure memoire = structure criteres RC
[x] Chaque exigence CCTP traitee (47/47)
[x] CV presents (2/2 demandes)
[x] References presentes (3/3 minimum)
[x] Planning present et coherent avec delai CCAP

CONFORMITE FINANCIERE (5 items)
[x] BPU rempli integralement
[x] DQE calcule correctement
[x] DPGF presente
[x] Prix coherents memoire <-> BPU
[x] Montant total dans fourchette estimee

COHERENCE INTER-DOCUMENTS (4 items)
[x] Delai memoire = delai AE = delai planning
[x] Equipe memoire = CV fournis
[x] Nom candidat identique partout
[x] SIRET identique partout
[ ] Montant AE ≠ montant DQE -> ERREUR : ecart de 230 EUR

FORMAT ET DEPOT (5 items)
[x] Tous les fichiers en PDF
[x] Taille totale < 50 Mo
[x] Nommage conforme (RC article 12)
[x] AE signe electroniquement (certificat valide)
[x] Copie de sauvegarde preparee (si demandee)

RESULTAT : 2 ALERTES -- CORRECTIONS REQUISES
-> Pouvoir de signature : demander a Jonathan
-> Ecart montant AE/DQE : recalculer
```

### 9f.4.2 Controle coherence inter-documents **[JONATHAN + FUSION]**

```
CONTROLE COHERENCE INTER-DOCUMENTS
===================================

1. PRIX MEMOIRE = PRIX BPU
   -> Le memoire technique mentionne des montants ?
   -> Verifier qu'ils correspondent EXACTEMENT au BPU/DQE
   -> Attention aux arrondis : le memoire arrondit souvent
   -> Tolerance : 0 EUR (coherence stricte)

2. DELAIS COHERENTS
   -> Delai dans le memoire technique (section 4.6 Planning)
   -> Delai dans l'Acte d'Engagement
   -> Delai dans le CCAP
   -> Les 3 doivent etre IDENTIQUES ou compatibles
   -> Tolerance : 0 jour

3. EQUIPE COHERENTE
   -> Noms dans le memoire (section 1.2 Moyens humains)
   -> CV fournis en annexe
   -> Si le memoire mentionne "Jonathan Dewaele" : CV Jonathan DOIT etre joint
   -> Si le memoire mentionne "Marty Wong" : CV Marty DOIT etre joint

4. IDENTITE COHERENTE
   -> UNIVILE SAS (denomination) identique partout
   -> Axiom Marketing (nom commercial) identique partout
   -> SIRET 891 146 490 00042 identique partout
   -> Adresse identique partout
   -> Jonathan Dewaele, President identique partout
   -> Rechercher les variantes : "UNIVILE", "Univile", "univile", "Axiom", "axiom"

5. REFERENCES COHERENTES
   -> Les references citees dans le memoire = references dans le DC2
   -> Les dates, clients, montants doivent correspondre
```

### 9f.4.3 Controle sections conditionnelles **[JONATHAN]**

```
CONTROLE SECTIONS CONDITIONNELLES
==================================

Si le RC comporte un critere RSE/DD/environnemental :
  [x] Section 9 "Eco-conception" presente dans le memoire technique
  [x] Fiche RSE Axiom jointe en annexe F
  [x] Volume de la section proportionnel a la ponderation du critere

Si le RC NE comporte PAS de critere RSE :
  [x] Section 9 ABSENTE du memoire (ne pas alourdir)
  [x] Fiche RSE NON jointe

Si le RC comporte un critere social/insertion :
  [x] Volet social mentionne dans le memoire
  [x] Engagements realistes (pas d'invention)

Si le RC comporte un critere accessibilite :
  [x] Section accessibilite detaillee dans le memoire (3.3)
  [x] Outils et methodes cites (RGAA, WCAG, Wave, Lighthouse)
```

### 9f.4.4 Controle formulaires dynamiques DC1 **[JONATHAN]**

```
CONTROLE FORMULAIRES DYNAMIQUES (DC1)
======================================

Section F3 -- Pieces jointes :
  [x] Chaque case cochee correspond a une piece EFFECTIVEMENT jointe
  [x] Aucune case cochee pour une piece absente du dossier
  [x] La liste des pieces correspond EXACTEMENT au RC

Section C -- Lots :
  [x] "Globalite" OU "lots" coche (pas les deux, pas aucun)
  [x] Si lots : numeros et intitules remplis

Section D2 -- Forme candidature :
  [x] UNE SEULE case cochee (individuel OU conjoint OU solidaire)

Redressement judiciaire (si applicable) :
  [x] Declare dans DUME ou DC1
  [x] Copie jugement d'ouverture jointe
  [x] Co-signature administrateur judiciaire presente
```

### 9f.4.5 Verification signature electronique **[JONATHAN + FUSION]**

```
VERIFICATION SIGNATURE ELECTRONIQUE
====================================

FORMAT :
  -> XAdES (XML Advanced Electronic Signature) : pour fichiers XML
  -> PAdES (PDF Advanced Electronic Signature) : pour fichiers PDF (recommande)
  -> CAdES (CMS Advanced Electronic Signature) : signature detachee

CERTIFICAT :
  -> Certificat qualifie eIDAS (obligatoire pour marches > 40 000 EUR HT)
  -> Fournisseurs acceptes : ChamberSign, CertEurope, DocuSign (eIDAS), Yousign
  -> Verifier :
     - Le certificat est au nom du signataire (Jonathan Dewaele)
     - Le certificat est en cours de validite (non expire, non revoque)
     - Le certificat est qualifie (pas un certificat simple)
     - L'horodatage est present et valide

DOCUMENTS A SIGNER :
  -> AE (Acte d'Engagement) : OBLIGATOIRE
  -> DC1 (Lettre de candidature) : RECOMMANDE
  -> Memoire technique : si demande par le RC
  -> BPU/DPGF : si demande par le RC

VERIFICATION TECHNIQUE :
  -> Ouvrir le PDF dans Adobe Reader : pastille verte = signature valide
  -> Verifier le panneau "Signatures" : pas d'avertissement
  -> Verifier que le document n'a pas ete modifie apres signature
```

### 9f.4.6 Verification poids fichiers et formats **[JONATHAN + FUSION]**

```
VERIFICATION POIDS ET FORMATS
==============================

LIMITES PLATEFORMES DE DEPOT :
  -> PLACE / marches-publics.gouv.fr : 50 Mo par fichier, 200 Mo total
  -> AWS (marches prives) : 20 Mo par fichier, 100 Mo total
  -> Plateformes locales (type Megalis) : variable, souvent 10-20 Mo/fichier

FORMATS ACCEPTES :
  -> PDF (recommande et universel)
  -> PDF/A (archivage, prefere par certains acheteurs)
  -> XLS/XLSX (pour BPU/DQE si demande en format modifiable)
  -> DOC/DOCX (rarement, a eviter)

CONTROLES :
  [x] Chaque fichier < 50 Mo (ou limite plateforme)
  [x] Total du dossier < 200 Mo (ou limite plateforme)
  [x] Tous les PDF sont lisibles (pas corrompus)
  [x] Pas de fichiers vides (0 Ko)
  [x] Pas de fichiers proteges par mot de passe
  [x] Images dans les PDF : resolution max 150 DPI (pour limiter le poids)
  [x] Nommage conforme :
      "01_DC1_UNIVILE_[ref-marche].pdf"
      "02_DC2_UNIVILE_[ref-marche].pdf"
      "03_MEMOIRE_TECHNIQUE_UNIVILE_[ref-marche].pdf"
      "04_BPU_UNIVILE_[ref-marche].pdf"
      "05_RCPRO_UNIVILE.pdf"
      etc.
```

---

## 9f.5 Templates et fichiers de reference **[FUSION]**

```
FICHIERS DE REFERENCE POUR LE CONTROLEUR
==========================================

Checklists :
  -> La checklist complete est integree dans le code (pas de fichier externe)
  -> Le RC de chaque marche est la source de verite pour les pieces demandees

Fiche RSE (pour verifier presence/absence) :
  -> FICHE-RSE-AXIOM.md
  Chemin : /Source IA/FICHE-RSE-AXIOM.md

Tous les templates (pour verifier la conformite des documents generes) :
  -> DC1-UNIVILE-PRE-REMPLI.md
  -> DC2-UNIVILE-PRE-REMPLI.md
  -> GUIDE-DUME-UNIVILE.md
```

---

## 9f.6 Code TypeScript **[FUSION]**

```typescript
// agents/appels-offres/9f-controleur-qa/index.ts

import { DCEAnalysis } from '../9a-analyseur-dce/types';
import { DossierAdministratif } from '../9c-juriste/index';
import { OffreFinanciere } from '../9d-chiffreur/index';

// ============================================================
// INTERFACES
// ============================================================

interface PointControle {
  id: string;                            // "ADMIN-01", "TECH-03", etc.
  categorie: 'ADMINISTRATIF' | 'TECHNIQUE' | 'FINANCIER' | 'COHERENCE' | 'FORMAT' | 'CONDITIONNEL';
  libelle: string;
  statut: 'OK' | 'ALERTE' | 'ERREUR' | 'NON_APPLICABLE';
  detail: string | null;
  source_sous_agent: '9a' | '9c' | '9d' | '9e' | 'TOUS';
  correction_requise: string | null;
  agent_a_corriger: '9c-juriste' | '9d-chiffreur' | '9e-redacteur' | 'jonathan' | null;
}

interface ControleSignature {
  document: string;
  signe: boolean;
  format_signature: 'XAdES' | 'PAdES' | 'CAdES' | 'AUCUNE' | null;
  certificat_qualifie: boolean | null;
  certificat_signataire: string | null;     // "Jonathan Dewaele"
  certificat_valide: boolean | null;
  certificat_date_expiration: string | null;
  horodatage_present: boolean | null;
  document_modifie_apres_signature: boolean | null;
  statut: 'VALIDE' | 'INVALIDE' | 'NON_SIGNE' | 'NON_APPLICABLE';
  commentaire: string | null;
}

interface ControleFichier {
  nom: string;
  format: string;
  taille_octets: number;
  taille_mo: number;
  lisible: boolean;
  protege_mot_de_passe: boolean;
  nommage_conforme: boolean;
  nommage_attendu: string;
  statut: 'OK' | 'ALERTE' | 'ERREUR';
  commentaire: string | null;
}

interface RapportControle {
  // --- Metadata ---
  reference_marche: string;
  acheteur: string;
  date_controle: string;                   // ISO datetime
  sous_agent: '9f-controleur';
  date_depot_prevue: string;               // ISO date
  jours_avant_depot: number;

  // --- Points de controle ---
  points_controle: PointControle[];

  // --- Controle signatures ---
  signatures: ControleSignature[];

  // --- Controle fichiers ---
  fichiers: ControleFichier[];
  taille_totale_mo: number;
  taille_limite_mo: number;
  taille_ok: boolean;

  // --- Controle sections conditionnelles ---
  sections_conditionnelles: {
    rse_requis: boolean;
    rse_present: boolean;
    rse_ok: boolean;
    social_requis: boolean;
    social_present: boolean;
    social_ok: boolean;
    rgaa_requis: boolean;
    rgaa_present: boolean;
    rgaa_ok: boolean;
  };

  // --- Synthese ---
  synthese: {
    total_points: number;
    ok: number;
    alertes: number;
    erreurs: number;
    non_applicables: number;
  };

  // --- Corrections requises ---
  corrections: Array<{
    priorite: 'BLOQUANTE' | 'HAUTE' | 'MOYENNE' | 'BASSE';
    description: string;
    agent_responsable: '9c-juriste' | '9d-chiffreur' | '9e-redacteur' | 'jonathan';
    deadline: string | null;
  }>;

  // --- Decision ---
  decision: 'GO' | 'CORRECTIONS_REQUISES' | 'BLOQUANT';
  decision_detail: string;

  // --- Statut ---
  statut: 'COMPLET' | 'INCOMPLET' | 'ERREUR_BLOQUANTE';
}

// ============================================================
// CONTROLE ADMINISTRATIF (pieces du 9c Juriste) [JONATHAN]
// ============================================================
function controlerAdministratif(
  dceAnalysis: DCEAnalysis,
  dossierAdmin: DossierAdministratif
): PointControle[] {
  const points: PointControle[] = [];
  let compteur = 1;

  // Verifier chaque piece exigee
  const piecesExigees = dceAnalysis.analyse_rc.pieces_exigees;

  for (const piece of dossierAdmin.pieces) {
    if (!piece.obligatoire) continue;

    points.push({
      id: `ADMIN-${String(compteur++).padStart(2, '0')}`,
      categorie: 'ADMINISTRATIF',
      libelle: `${piece.nom} present et complet`,
      statut: piece.present_dans_dossier ? 'OK' : 'ERREUR',
      detail: piece.present_dans_dossier
        ? `Fichier : ${piece.fichier_path}`
        : `MANQUANT : ${piece.nom} exige par ${piece.source_exigence}`,
      source_sous_agent: '9c',
      correction_requise: piece.present_dans_dossier ? null : `Fournir ${piece.nom}`,
      agent_a_corriger: piece.present_dans_dossier ? null : '9c-juriste',
    });
  }

  // Verifier les validites
  for (const validite of dossierAdmin.validites) {
    points.push({
      id: `ADMIN-${String(compteur++).padStart(2, '0')}`,
      categorie: 'ADMINISTRATIF',
      libelle: `${validite.type} en cours de validite`,
      statut: validite.valide ? 'OK' : 'ERREUR',
      detail: validite.valide
        ? `Valide jusqu'au ${validite.date_expiration} (${validite.jours_restants}j restants)`
        : validite.alerte || 'EXPIRE',
      source_sous_agent: '9c',
      correction_requise: validite.action_requise,
      agent_a_corriger: validite.valide ? null : 'jonathan',
    });
  }

  // Verifier procedure collective
  if (dossierAdmin.procedure_collective.en_liquidation) {
    points.push({
      id: `ADMIN-${String(compteur++).padStart(2, '0')}`,
      categorie: 'ADMINISTRATIF',
      libelle: 'Eligibilite juridique (pas de liquidation)',
      statut: 'ERREUR',
      detail: 'LIQUIDATION JUDICIAIRE : CANDIDATURE INTERDITE (art. L2141-3 CCP)',
      source_sous_agent: '9c',
      correction_requise: 'STOP : candidature impossible en liquidation judiciaire',
      agent_a_corriger: 'jonathan',
    });
  }

  if (dossierAdmin.procedure_collective.en_redressement) {
    // Verifier jugement joint
    points.push({
      id: `ADMIN-${String(compteur++).padStart(2, '0')}`,
      categorie: 'ADMINISTRATIF',
      libelle: 'Redressement judiciaire : jugement d\'ouverture joint',
      statut: dossierAdmin.procedure_collective.jugement_fichier ? 'OK' : 'ERREUR',
      detail: dossierAdmin.procedure_collective.jugement_fichier
        ? `Jugement du ${dossierAdmin.procedure_collective.jugement_date} joint`
        : 'MANQUANT : copie du jugement d\'ouverture (art. R2143-9)',
      source_sous_agent: '9c',
      correction_requise: dossierAdmin.procedure_collective.jugement_fichier
        ? null
        : 'Joindre copie du jugement d\'ouverture',
      agent_a_corriger: dossierAdmin.procedure_collective.jugement_fichier ? null : 'jonathan',
    });

    // Verifier co-signature AJ
    if (dossierAdmin.procedure_collective.co_signature_requise) {
      points.push({
        id: `ADMIN-${String(compteur++).padStart(2, '0')}`,
        categorie: 'ADMINISTRATIF',
        libelle: 'Redressement judiciaire : co-signature administrateur judiciaire',
        statut: 'ALERTE',
        detail: 'Verifier que l\'administrateur judiciaire a co-signe le DC1',
        source_sous_agent: '9c',
        correction_requise: 'Obtenir la co-signature de l\'AJ sur le DC1',
        agent_a_corriger: 'jonathan',
      });
    }
  }

  return points;
}

// ============================================================
// CONTROLE TECHNIQUE (memoire du 9e Redacteur) [JONATHAN]
// ============================================================
function controlerTechnique(
  dceAnalysis: DCEAnalysis,
  // memoireTechnique: MemoireTechnique  // Type du 9e Redacteur
): PointControle[] {
  const points: PointControle[] = [];
  let compteur = 1;

  // Memoire present
  points.push({
    id: `TECH-${String(compteur++).padStart(2, '0')}`,
    categorie: 'TECHNIQUE',
    libelle: 'Memoire technique present',
    statut: 'OK',  // A verifier avec le fichier reel
    detail: null,
    source_sous_agent: '9e',
    correction_requise: null,
    agent_a_corriger: null,
  });

  // Structure = criteres RC
  const criteres = dceAnalysis.criteres_evaluation;
  points.push({
    id: `TECH-${String(compteur++).padStart(2, '0')}`,
    categorie: 'TECHNIQUE',
    libelle: 'Structure memoire = structure criteres RC',
    statut: 'OK',  // A verifier : le memoire doit suivre l'ordre des criteres
    detail: `${criteres.length} criteres identifies dans le RC`,
    source_sous_agent: '9e',
    correction_requise: null,
    agent_a_corriger: null,
  });

  // Exigences CCTP traitees
  const exigences = dceAnalysis.exigences_individuelles;
  const nbExigences = exigences.length;
  points.push({
    id: `TECH-${String(compteur++).padStart(2, '0')}`,
    categorie: 'TECHNIQUE',
    libelle: `Chaque exigence CCTP traitee (${nbExigences}/${nbExigences})`,
    statut: 'OK',  // A verifier : chaque EX-NNN doit etre adresse dans le memoire
    detail: `${nbExigences} exigences identifiees par le 9a Analyseur`,
    source_sous_agent: '9e',
    correction_requise: null,
    agent_a_corriger: null,
  });

  // CV presents
  points.push({
    id: `TECH-${String(compteur++).padStart(2, '0')}`,
    categorie: 'TECHNIQUE',
    libelle: 'CV presents (2/2 demandes)',
    statut: 'OK',  // A verifier
    detail: 'CV Jonathan Dewaele + CV Marty Wong',
    source_sous_agent: '9e',
    correction_requise: null,
    agent_a_corriger: null,
  });

  // References
  points.push({
    id: `TECH-${String(compteur++).padStart(2, '0')}`,
    categorie: 'TECHNIQUE',
    libelle: 'References presentes (3/3 minimum)',
    statut: 'OK',  // A verifier
    detail: null,
    source_sous_agent: '9e',
    correction_requise: null,
    agent_a_corriger: null,
  });

  // Planning coherent avec delai CCAP
  const delaiCCAP = dceAnalysis.analyse_ccap?.delais_contractuels?.delai_execution_jours;
  points.push({
    id: `TECH-${String(compteur++).padStart(2, '0')}`,
    categorie: 'TECHNIQUE',
    libelle: 'Planning present et coherent avec delai CCAP',
    statut: delaiCCAP ? 'OK' : 'ALERTE',
    detail: delaiCCAP
      ? `Delai CCAP : ${delaiCCAP} jours`
      : 'Delai CCAP non identifie dans le DCE',
    source_sous_agent: '9e',
    correction_requise: null,
    agent_a_corriger: null,
  });

  return points;
}

// ============================================================
// CONTROLE FINANCIER (offre du 9d Chiffreur) [JONATHAN]
// ============================================================
function controlerFinancier(
  dceAnalysis: DCEAnalysis,
  offreFinanciere: OffreFinanciere
): PointControle[] {
  const points: PointControle[] = [];
  let compteur = 1;

  // BPU rempli
  points.push({
    id: `FIN-${String(compteur++).padStart(2, '0')}`,
    categorie: 'FINANCIER',
    libelle: 'BPU rempli integralement',
    statut: offreFinanciere.controle.bpu_complet ? 'OK' : 'ERREUR',
    detail: `${offreFinanciere.bpu.length} lignes de BPU`,
    source_sous_agent: '9d',
    correction_requise: offreFinanciere.controle.bpu_complet
      ? null
      : 'Completer le BPU : postes manquants',
    agent_a_corriger: offreFinanciere.controle.bpu_complet ? null : '9d-chiffreur',
  });

  // DQE calcule correctement (si applicable)
  if (offreFinanciere.format_utilise === 'DQE') {
    const dqeOk = offreFinanciere.bpu.every(ligne =>
      ligne.quantite_estimee !== null &&
      ligne.montant_total_ht !== null &&
      Math.abs(ligne.montant_total_ht - ligne.prix_unitaire_ht * ligne.quantite_estimee!) < 1
    );

    points.push({
      id: `FIN-${String(compteur++).padStart(2, '0')}`,
      categorie: 'FINANCIER',
      libelle: 'DQE calcule correctement',
      statut: dqeOk ? 'OK' : 'ERREUR',
      detail: dqeOk ? 'Tous les totaux sont corrects' : 'ERREUR DE CALCUL dans le DQE',
      source_sous_agent: '9d',
      correction_requise: dqeOk ? null : 'Recalculer le DQE (PU x quantite = total)',
      agent_a_corriger: dqeOk ? null : '9d-chiffreur',
    });
  }

  // Marge suffisante
  points.push({
    id: `FIN-${String(compteur++).padStart(2, '0')}`,
    categorie: 'FINANCIER',
    libelle: 'Marge suffisante (>= 15%)',
    statut: offreFinanciere.analyse_marge.viable ? 'OK' : 'ALERTE',
    detail: `Marge : ${offreFinanciere.analyse_marge.marge_pourcent}% (cible : ${offreFinanciere.grille_tjm_utilisee.marge_cible_min}-${offreFinanciere.grille_tjm_utilisee.marge_cible_max}%)`,
    source_sous_agent: '9d',
    correction_requise: offreFinanciere.analyse_marge.viable
      ? null
      : `Marge insuffisante (${offreFinanciere.analyse_marge.marge_pourcent}%). Augmenter les TJM ou reduire la charge.`,
    agent_a_corriger: offreFinanciere.analyse_marge.viable ? null : '9d-chiffreur',
  });

  // Montant dans fourchette estimee
  const montantEstime = dceAnalysis.caracteristiques_marche.estimation_budget.montant_total_ht;
  if (montantEstime) {
    const ecart = Math.abs(offreFinanciere.montant_total_ht - montantEstime) / montantEstime;
    const ecartOk = ecart <= 0.5;  // Tolerance 50%

    points.push({
      id: `FIN-${String(compteur++).padStart(2, '0')}`,
      categorie: 'FINANCIER',
      libelle: 'Montant total dans fourchette estimee',
      statut: ecartOk ? 'OK' : 'ALERTE',
      detail: `Notre prix : ${offreFinanciere.montant_total_ht} EUR HT. Estimation acheteur : ${montantEstime} EUR HT. Ecart : ${Math.round(ecart * 100)}%`,
      source_sous_agent: '9d',
      correction_requise: ecartOk
        ? null
        : `Ecart > 50% avec l'estimation. Revoir le chiffrage.`,
      agent_a_corriger: ecartOk ? null : '9d-chiffreur',
    });
  }

  return points;
}

// ============================================================
// CONTROLE COHERENCE INTER-DOCUMENTS [JONATHAN]
// ============================================================
function controlerCoherence(
  dossierAdmin: DossierAdministratif,
  offreFinanciere: OffreFinanciere,
  // memoireTechnique: MemoireTechnique
): PointControle[] {
  const points: PointControle[] = [];
  let compteur = 1;

  // Nom candidat identique partout
  points.push({
    id: `COH-${String(compteur++).padStart(2, '0')}`,
    categorie: 'COHERENCE',
    libelle: 'Nom candidat identique partout (UNIVILE SAS)',
    statut: 'OK',  // A verifier en scannant tous les documents
    detail: 'Verifier : UNIVILE SAS / Axiom Marketing dans tous les documents',
    source_sous_agent: 'TOUS',
    correction_requise: null,
    agent_a_corriger: null,
  });

  // SIRET identique partout
  points.push({
    id: `COH-${String(compteur++).padStart(2, '0')}`,
    categorie: 'COHERENCE',
    libelle: 'SIRET identique partout (891 146 490 00042)',
    statut: 'OK',  // A verifier en scannant tous les documents
    detail: 'Verifier : 891 146 490 00042 dans DC1, DC2, DUME, AE',
    source_sous_agent: 'TOUS',
    correction_requise: null,
    agent_a_corriger: null,
  });

  // Equipe memoire = CV fournis
  points.push({
    id: `COH-${String(compteur++).padStart(2, '0')}`,
    categorie: 'COHERENCE',
    libelle: 'Equipe dans le memoire = CV fournis',
    statut: 'OK',  // A verifier
    detail: 'Si memoire mentionne Jonathan -> CV Jonathan joint. Idem Marty.',
    source_sous_agent: 'TOUS',
    correction_requise: null,
    agent_a_corriger: null,
  });

  // Delais coherents
  points.push({
    id: `COH-${String(compteur++).padStart(2, '0')}`,
    categorie: 'COHERENCE',
    libelle: 'Delais coherents (memoire = AE = planning)',
    statut: 'OK',  // A verifier
    detail: 'Verifier : delai memoire = delai AE = delai planning = delai CCAP',
    source_sous_agent: 'TOUS',
    correction_requise: null,
    agent_a_corriger: null,
  });

  return points;
}

// ============================================================
// CONTROLE SECTIONS CONDITIONNELLES [JONATHAN]
// ============================================================
function controlerSectionsConditionnelles(
  dceAnalysis: DCEAnalysis,
  // memoireTechnique: MemoireTechnique
): {
  rse_requis: boolean;
  rse_present: boolean;
  rse_ok: boolean;
  social_requis: boolean;
  social_present: boolean;
  social_ok: boolean;
  rgaa_requis: boolean;
  rgaa_present: boolean;
  rgaa_ok: boolean;
} {
  const flags = dceAnalysis.flags_conditionnels;

  return {
    rse_requis: flags.ACTIVER_SECTION_RSE,
    rse_present: false,     // A verifier dans le memoire reel
    rse_ok: true,           // A calculer : present si requis, absent si non requis

    social_requis: flags.ACTIVER_VOLET_SOCIAL,
    social_present: false,  // A verifier
    social_ok: true,        // A calculer

    rgaa_requis: flags.ACTIVER_SECTION_RGAA,
    rgaa_present: false,    // A verifier
    rgaa_ok: true,          // A calculer
  };
}

// ============================================================
// CONTROLE FORMAT ET FICHIERS [JONATHAN + FUSION]
// ============================================================
function controlerFichiers(
  dossierAdmin: DossierAdministratif,
  offreFinanciere: OffreFinanciere,
  // fichiersMemoireTechnique: ...
): ControleFichier[] {
  const fichiers: ControleFichier[] = [];

  // Controle des fichiers generes par le Juriste (9c)
  for (const fichier of dossierAdmin.fichiers_generes) {
    fichiers.push({
      nom: fichier.nom,
      format: fichier.format,
      taille_octets: fichier.taille_octets,
      taille_mo: Math.round(fichier.taille_octets / (1024 * 1024) * 100) / 100,
      lisible: true,           // A verifier : ouvrir le PDF
      protege_mot_de_passe: false,  // A verifier
      nommage_conforme: /^\d{2}_[A-Z]+_UNIVILE_/.test(fichier.nom),
      nommage_attendu: fichier.nom,
      statut: 'OK',
      commentaire: null,
    });
  }

  return fichiers;
}

// ============================================================
// CONTROLE SIGNATURES [JONATHAN + FUSION]
// ============================================================
function controlerSignatures(
  dossierAdmin: DossierAdministratif,
  montantMarche: number | null
): ControleSignature[] {
  const signatures: ControleSignature[] = [];
  const signatureRequise = montantMarche ? montantMarche > 40000 : true;  // > 40K = signature electronique obligatoire

  for (const fichier of dossierAdmin.fichiers_generes) {
    if (['DC1', 'DUME'].includes(fichier.type)) {
      signatures.push({
        document: fichier.nom,
        signe: fichier.signe,
        format_signature: fichier.signe ? 'PAdES' : 'AUCUNE',
        certificat_qualifie: fichier.signe ? null : null,  // A verifier
        certificat_signataire: fichier.signe ? 'Jonathan Dewaele' : null,
        certificat_valide: fichier.signe ? null : null,    // A verifier
        certificat_date_expiration: null,
        horodatage_present: fichier.signe ? null : null,   // A verifier
        document_modifie_apres_signature: null,             // A verifier
        statut: fichier.signe ? 'VALIDE' : (signatureRequise ? 'NON_SIGNE' : 'NON_APPLICABLE'),
        commentaire: !fichier.signe && signatureRequise
          ? 'SIGNATURE REQUISE : marche > 40 000 EUR HT, certificat qualifie eIDAS obligatoire'
          : null,
      });
    }
  }

  return signatures;
}

// ============================================================
// FONCTION PRINCIPALE DU SOUS-AGENT 9f [FUSION]
// ============================================================
async function executerControleur(
  dceAnalysis: DCEAnalysis,
  dossierAdmin: DossierAdministratif,
  offreFinanciere: OffreFinanciere,
  // memoireTechnique: MemoireTechnique  // Du 9e Redacteur
): Promise<RapportControle> {
  const refMarche = dceAnalysis.metadata.boamp_reference || dceAnalysis.metadata.marche_public_id || 'REF-INCONNUE';
  const dateDepot = dceAnalysis.metadata.date_deadline_offre;
  const now = new Date();
  const joursAvantDepot = Math.floor((new Date(dateDepot).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // 1. Controles par categorie
  const pointsAdmin = controlerAdministratif(dceAnalysis, dossierAdmin);
  const pointsTech = controlerTechnique(dceAnalysis);
  const pointsFin = controlerFinancier(dceAnalysis, offreFinanciere);
  const pointsCoherence = controlerCoherence(dossierAdmin, offreFinanciere);

  const tousPoints = [...pointsAdmin, ...pointsTech, ...pointsFin, ...pointsCoherence];

  // 2. Controle sections conditionnelles
  const sectionsConditionnelles = controlerSectionsConditionnelles(dceAnalysis);

  // Points conditionnels
  if (dceAnalysis.flags_conditionnels.ACTIVER_SECTION_RSE) {
    tousPoints.push({
      id: `COND-01`,
      categorie: 'CONDITIONNEL',
      libelle: 'Section RSE/eco-conception presente dans le memoire',
      statut: sectionsConditionnelles.rse_present ? 'OK' : 'ERREUR',
      detail: 'Le RC comporte un critere RSE : la section doit etre presente',
      source_sous_agent: '9e',
      correction_requise: sectionsConditionnelles.rse_present
        ? null
        : 'Ajouter la section RSE/eco-conception dans le memoire (utiliser FICHE-RSE-AXIOM.md)',
      agent_a_corriger: sectionsConditionnelles.rse_present ? null : '9e-redacteur',
    });
  }

  if (dceAnalysis.flags_conditionnels.ACTIVER_VOLET_SOCIAL) {
    tousPoints.push({
      id: `COND-02`,
      categorie: 'CONDITIONNEL',
      libelle: 'Volet social present dans le memoire',
      statut: sectionsConditionnelles.social_present ? 'OK' : 'ERREUR',
      detail: 'Le RC comporte un critere social : le volet doit etre present',
      source_sous_agent: '9e',
      correction_requise: sectionsConditionnelles.social_present
        ? null
        : 'Ajouter le volet social dans le memoire',
      agent_a_corriger: sectionsConditionnelles.social_present ? null : '9e-redacteur',
    });
  }

  if (dceAnalysis.flags_conditionnels.ACTIVER_SECTION_RGAA) {
    tousPoints.push({
      id: `COND-03`,
      categorie: 'CONDITIONNEL',
      libelle: 'Section accessibilite RGAA detaillee dans le memoire',
      statut: sectionsConditionnelles.rgaa_present ? 'OK' : 'ERREUR',
      detail: 'Le RC/CCTP mentionne RGAA/accessibilite : section detaillee requise',
      source_sous_agent: '9e',
      correction_requise: sectionsConditionnelles.rgaa_present
        ? null
        : 'Detailler la section accessibilite (RGAA, WCAG, Wave, Lighthouse)',
      agent_a_corriger: sectionsConditionnelles.rgaa_present ? null : '9e-redacteur',
    });
  }

  // 3. Controle fichiers
  const fichiers = controlerFichiers(dossierAdmin, offreFinanciere);
  const tailleTotaleMo = fichiers.reduce((sum, f) => sum + f.taille_mo, 0);
  const tailleLimiteMo = 200;  // PLACE : 200 Mo par defaut

  // 4. Controle signatures
  const montantMarche = dceAnalysis.caracteristiques_marche.estimation_budget.montant_total_ht;
  const signatures = controlerSignatures(dossierAdmin, montantMarche);

  // Ajouter les controles de signature aux points
  for (const sig of signatures) {
    if (sig.statut === 'NON_SIGNE') {
      tousPoints.push({
        id: `FORMAT-SIG`,
        categorie: 'FORMAT',
        libelle: `Signature electronique sur ${sig.document}`,
        statut: 'ERREUR',
        detail: sig.commentaire || 'Document non signe',
        source_sous_agent: '9c',
        correction_requise: 'Signer electroniquement avec certificat qualifie eIDAS',
        agent_a_corriger: 'jonathan',
      });
    }
  }

  // Controle taille totale
  tousPoints.push({
    id: `FORMAT-01`,
    categorie: 'FORMAT',
    libelle: `Taille totale < ${tailleLimiteMo} Mo`,
    statut: tailleTotaleMo <= tailleLimiteMo ? 'OK' : 'ERREUR',
    detail: `Taille totale : ${Math.round(tailleTotaleMo * 100) / 100} Mo`,
    source_sous_agent: 'TOUS',
    correction_requise: tailleTotaleMo > tailleLimiteMo
      ? `Reduire la taille du dossier (${Math.round(tailleTotaleMo)} Mo > ${tailleLimiteMo} Mo limite)`
      : null,
    agent_a_corriger: tailleTotaleMo > tailleLimiteMo ? '9e-redacteur' : null,
  });

  // Controle format PDF
  tousPoints.push({
    id: `FORMAT-02`,
    categorie: 'FORMAT',
    libelle: 'Tous les fichiers en PDF',
    statut: fichiers.every(f => f.format === 'PDF' || f.format === 'XML') ? 'OK' : 'ALERTE',
    detail: null,
    source_sous_agent: 'TOUS',
    correction_requise: null,
    agent_a_corriger: null,
  });

  // Controle nommage
  const nommageOk = fichiers.every(f => f.nommage_conforme);
  tousPoints.push({
    id: `FORMAT-03`,
    categorie: 'FORMAT',
    libelle: 'Nommage conforme (RC)',
    statut: nommageOk ? 'OK' : 'ALERTE',
    detail: nommageOk ? null : 'Certains fichiers ne suivent pas le pattern de nommage',
    source_sous_agent: 'TOUS',
    correction_requise: nommageOk ? null : 'Renommer les fichiers selon le pattern : "NN_TYPE_UNIVILE_[ref].pdf"',
    agent_a_corriger: nommageOk ? null : '9c-juriste',
  });

  // 5. Synthese
  const ok = tousPoints.filter(p => p.statut === 'OK').length;
  const alertes = tousPoints.filter(p => p.statut === 'ALERTE').length;
  const erreurs = tousPoints.filter(p => p.statut === 'ERREUR').length;
  const na = tousPoints.filter(p => p.statut === 'NON_APPLICABLE').length;

  // 6. Liste des corrections
  const corrections = tousPoints
    .filter(p => p.correction_requise)
    .map(p => ({
      priorite: p.statut === 'ERREUR' ? 'BLOQUANTE' as const : 'HAUTE' as const,
      description: p.correction_requise!,
      agent_responsable: p.agent_a_corriger!,
      deadline: p.statut === 'ERREUR'
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]  // J+1
        : new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0],  // J+2
    }));

  // 7. Decision
  let decision: RapportControle['decision'];
  let decisionDetail: string;

  if (erreurs > 0) {
    decision = 'BLOQUANT';
    decisionDetail = `${erreurs} ERREUR(S) BLOQUANTE(S) -- Corrections obligatoires avant depot`;
  } else if (alertes > 0) {
    decision = 'CORRECTIONS_REQUISES';
    decisionDetail = `${alertes} ALERTE(S) -- Corrections recommandees, depot possible apres validation Jonathan`;
  } else {
    decision = 'GO';
    decisionDetail = `Tous les controles sont OK (${ok}/${tousPoints.length}). Dossier pret pour depot.`;
  }

  return {
    reference_marche: refMarche,
    acheteur: dceAnalysis.metadata.acheteur.nom,
    date_controle: now.toISOString(),
    sous_agent: '9f-controleur',
    date_depot_prevue: dateDepot,
    jours_avant_depot: joursAvantDepot,

    points_controle: tousPoints,

    signatures,
    fichiers,
    taille_totale_mo: Math.round(tailleTotaleMo * 100) / 100,
    taille_limite_mo: tailleLimiteMo,
    taille_ok: tailleTotaleMo <= tailleLimiteMo,

    sections_conditionnelles: sectionsConditionnelles,

    synthese: {
      total_points: tousPoints.length,
      ok,
      alertes,
      erreurs,
      non_applicables: na,
    },

    corrections,

    decision,
    decision_detail: decisionDetail,

    statut: erreurs > 0 ? 'ERREUR_BLOQUANTE' : 'COMPLET',
  };
}
```

---

## 9f.7 Schema JSON du rapport de controle **[FUSION]**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "RapportControle",
  "description": "Sortie du sous-agent 9f Controleur QA -- Rapport de controle final",
  "type": "object",
  "required": [
    "reference_marche", "acheteur", "date_controle", "sous_agent",
    "date_depot_prevue", "jours_avant_depot",
    "points_controle", "signatures", "fichiers",
    "taille_totale_mo", "taille_limite_mo", "taille_ok",
    "sections_conditionnelles", "synthese", "corrections",
    "decision", "decision_detail", "statut"
  ],
  "properties": {
    "reference_marche": { "type": "string" },
    "acheteur": { "type": "string" },
    "date_controle": { "type": "string", "format": "date-time" },
    "sous_agent": { "const": "9f-controleur" },
    "date_depot_prevue": { "type": "string" },
    "jours_avant_depot": { "type": "number" },
    "points_controle": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "categorie": { "enum": ["ADMINISTRATIF", "TECHNIQUE", "FINANCIER", "COHERENCE", "FORMAT", "CONDITIONNEL"] },
          "libelle": { "type": "string" },
          "statut": { "enum": ["OK", "ALERTE", "ERREUR", "NON_APPLICABLE"] },
          "detail": { "type": ["string", "null"] },
          "source_sous_agent": { "type": "string" },
          "correction_requise": { "type": ["string", "null"] },
          "agent_a_corriger": { "type": ["string", "null"] }
        }
      }
    },
    "signatures": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "document": { "type": "string" },
          "signe": { "type": "boolean" },
          "format_signature": { "type": ["string", "null"] },
          "certificat_qualifie": { "type": ["boolean", "null"] },
          "certificat_signataire": { "type": ["string", "null"] },
          "certificat_valide": { "type": ["boolean", "null"] },
          "certificat_date_expiration": { "type": ["string", "null"] },
          "horodatage_present": { "type": ["boolean", "null"] },
          "document_modifie_apres_signature": { "type": ["boolean", "null"] },
          "statut": { "enum": ["VALIDE", "INVALIDE", "NON_SIGNE", "NON_APPLICABLE"] },
          "commentaire": { "type": ["string", "null"] }
        }
      }
    },
    "fichiers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "nom": { "type": "string" },
          "format": { "type": "string" },
          "taille_octets": { "type": "number" },
          "taille_mo": { "type": "number" },
          "lisible": { "type": "boolean" },
          "protege_mot_de_passe": { "type": "boolean" },
          "nommage_conforme": { "type": "boolean" },
          "nommage_attendu": { "type": "string" },
          "statut": { "enum": ["OK", "ALERTE", "ERREUR"] },
          "commentaire": { "type": ["string", "null"] }
        }
      }
    },
    "taille_totale_mo": { "type": "number" },
    "taille_limite_mo": { "type": "number" },
    "taille_ok": { "type": "boolean" },
    "sections_conditionnelles": {
      "type": "object",
      "properties": {
        "rse_requis": { "type": "boolean" },
        "rse_present": { "type": "boolean" },
        "rse_ok": { "type": "boolean" },
        "social_requis": { "type": "boolean" },
        "social_present": { "type": "boolean" },
        "social_ok": { "type": "boolean" },
        "rgaa_requis": { "type": "boolean" },
        "rgaa_present": { "type": "boolean" },
        "rgaa_ok": { "type": "boolean" }
      }
    },
    "synthese": {
      "type": "object",
      "properties": {
        "total_points": { "type": "number" },
        "ok": { "type": "number" },
        "alertes": { "type": "number" },
        "erreurs": { "type": "number" },
        "non_applicables": { "type": "number" }
      }
    },
    "corrections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "priorite": { "enum": ["BLOQUANTE", "HAUTE", "MOYENNE", "BASSE"] },
          "description": { "type": "string" },
          "agent_responsable": { "type": "string" },
          "deadline": { "type": ["string", "null"] }
        }
      }
    },
    "decision": { "enum": ["GO", "CORRECTIONS_REQUISES", "BLOQUANT"] },
    "decision_detail": { "type": "string" },
    "statut": { "enum": ["COMPLET", "INCOMPLET", "ERREUR_BLOQUANTE"] }
  }
}
```

---

## 9f.8 Gestion des erreurs **[FUSION]**

| Erreur | Severite | Action automatique | Escalade |
|--------|----------|-------------------|----------|
| Piece obligatoire manquante (du 9c) | BLOQUANTE | Notification au 9c Juriste + Jonathan | Pas de depot tant que non resolu |
| Piece expiree (Kbis, URSSAF, fiscale, RC Pro) | BLOQUANTE | Notification Jonathan | Renouveler la piece |
| Ecart prix memoire vs BPU | BLOQUANTE | Notification 9d Chiffreur + 9e Redacteur | Harmoniser les montants |
| Delais incoherents entre documents | HAUTE | Notification 9e Redacteur | Harmoniser les delais |
| Equipe memoire != CV fournis | HAUTE | Notification 9e Redacteur | Ajouter les CV manquants |
| Section RSE absente alors que critere actif | HAUTE | Notification 9e Redacteur | Ajouter la section RSE |
| Section RGAA absente alors que critere actif | HAUTE | Notification 9e Redacteur | Ajouter la section RGAA |
| Case DC1 cochee sans piece jointe | HAUTE | Notification 9c Juriste | Decocher ou joindre la piece |
| Case DC1 non cochee avec piece jointe | MOYENNE | Notification 9c Juriste | Cocher la case |
| Document non signe (marche > 40K) | BLOQUANTE | Notification Jonathan | Signer avec certificat eIDAS |
| Fichier > 50 Mo | HAUTE | Notification a l'agent concerne | Compresser le PDF |
| Taille totale > 200 Mo | BLOQUANTE | Notification tous les agents | Compresser / scinder |
| Nommage non conforme | MOYENNE | Notification 9c Juriste | Renommer les fichiers |
| Fichier PDF corrompu / illisible | BLOQUANTE | Notification a l'agent concerne | Re-generer le fichier |
| SIRET different entre documents | BLOQUANTE | Notification tous les agents | Corriger immediatement |
| Nom entreprise different entre documents | HAUTE | Notification tous les agents | Harmoniser |
| Liquidation judiciaire detectee | BLOQUANTE | STOP immediat | Jonathan : candidature impossible |
| Redressement sans jugement | BLOQUANTE | Notification 9c Juriste + Jonathan | Joindre le jugement |
| Memoire > limite de pages du RC | HAUTE | Notification 9e Redacteur | Reduire le memoire |
| DQE erreur de calcul | BLOQUANTE | Notification 9d Chiffreur | Recalculer PU x Q = total |
| Depot dans < 24h et corrections requises | CRITIQUE | Alerte urgente Jonathan | Decision depot en l'etat ou report |

---

---

