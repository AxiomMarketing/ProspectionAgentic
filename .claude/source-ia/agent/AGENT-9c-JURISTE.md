# SOUS-AGENT 9c — JURISTE
**Agent parent** : AGENT-9-MASTER.md

---

---
---


## 3.3 SOUS-AGENT 9c -- JURISTE (Legal Compliance)

> Source : Jonathan Agent #5 "LE JURISTE" (EQUIPE-MARCHES-PUBLICS-OPENLAW.md, lignes 394-518) + integration pipeline V2

---

## 9c.1 Mission precise

**[JONATHAN]** Garantir la conformite administrative et juridique du dossier de reponse.

**Ce qu'il fait** :
- **[JONATHAN]** Preparer le DUME (option A recommandee) ou remplir DC1/DC2 (fallback)
- **[JONATHAN]** Preparer le DC4 si sous-traitance
- **[JONATHAN]** Verifier l'eligibilite (pas d'interdiction de soumissionner, art. L2141-1 a L2141-11)
- **[JONATHAN]** Constituer le dossier de candidature conforme
- **[JONATHAN]** Gerer les habilitations et attestations requises
- **[JONATHAN]** Verifier les validites : Kbis < 3 mois, URSSAF < 6 mois, fiscale annee en cours, RC Pro en cours
- **[JONATHAN]** Verifier les assurances (RC Pro, decennale si applicable)
- **[JONATHAN]** Gerer le cas procedure collective (redressement judiciaire) :
  - Declarer la situation dans le DUME (section procedures collectives) ou DC1
  - Joindre la copie du jugement d'ouverture (art. R2143-9)
  - Verifier que l'administrateur judiciaire autorise la candidature
  - Obtenir la co-signature de l'AJ si mission d'assistance
  - RAPPEL : seule la liquidation judiciaire interdit de soumissionner (art. L2141-3)
- **[NOUS]** Automatiser le remplissage des formulaires a partir des templates pre-remplis
- **[NOUS]** Generer les PDF print-ready via export HTML
- **[FUSION]** Produire un JSON structure du dossier admin pour le 9f Controleur

**Ce qu'il ne fait PAS** :
- Il ne redige PAS le memoire technique (c'est le 9e Redacteur)
- Il ne chiffre PAS l'offre financiere (c'est le 9d Chiffreur)
- Il ne depose PAS le dossier sur la plateforme
- Il ne prend PAS la decision GO/NO-GO (c'est le 9b)

---

## 9c.2 Ce qu'il recoit (inputs) **[FUSION]**

| Source | Donnees recues | Usage |
|--------|---------------|-------|
| **9a Analyseur DCE** | `flags_conditionnels` | Determine si RSE, Social, RGAA sont actives |
| **9a Analyseur DCE** | `conditions_participation.documents_obligatoires` | Liste des pieces exigees par le RC |
| **9a Analyseur DCE** | `analyse_rc.pieces_exigees` | Liste exhaustive des pieces demandees |
| **9a Analyseur DCE** | `analyse_ccap` | Assurances requises, sous-traitance autorisee, groupement |
| **9a Analyseur DCE** | `metadata` | Reference marche, acheteur, dates |
| **9a Analyseur DCE** | `caracteristiques_marche` | Type de procedure, montant estime |
| **Base documentaire** | Templates DC1, DC2, DUME pre-remplis | Remplissage automatique |
| **Base documentaire** | Attestations en stock (Kbis, URSSAF, fiscale, RC Pro) | Verification validites |

---

## 9c.3 Ce qu'il produit (outputs) **[FUSION]**

| Destination | Donnees produites | Format |
|-------------|------------------|--------|
| **9f Controleur QA** | `dossier_administratif` complet | JSON DossierAdministratif |
| **9f Controleur QA** | Fichiers PDF generes (DC1, DC2 ou DUME) | PDF |
| **9f Controleur QA** | Rapport de validite des pieces | JSON ValiditesPieces |
| **Jonathan** | Alertes si pieces manquantes ou expirees | Notification |

---

## 9c.4 Competences detaillees **[JONATHAN]**

### 9c.4.1 Checklist documents administratifs **[JONATHAN]**

```
DOSSIER DE CANDIDATURE
=======================

OPTION A -- DUME (recommande, a privilegier)
[x] DUME -- Document Unique de Marche Europeen
    -> Remplace DC1 + DC2 + attestation sur l'honneur en 1 seul document
    -> Import XML pre-rempli, juste MAJ ref marche
    -> Auto-declaration : preuves demandees seulement au laureat
    -> L'acheteur est OBLIGE de l'accepter (Code commande publique 2019)
[ ] Pouvoir de la personne habilitee a engager le candidat

OPTION B -- DC1/DC2 (fallback si fournis dans le DCE)
[x] DC1 -- Lettre de candidature (formulaire CERFA)
[x] DC2 -- Declaration du candidat individuel
[ ] Pouvoir de la personne habilitee a engager le candidat
[x] Attestation sur l'honneur (art. R2143-3)

PIECES COMPLEMENTAIRES (selon RC, avec DUME ou DC1/DC2)
[ ] Attestation d'assurance RC Professionnelle en cours
[x] Liste des principales references (3 dernieres annees)
[ ] RIB

PIECES AU STADE DE L'ATTRIBUTION UNIQUEMENT (demandees au laureat)
[ ] ATTRI1 -- Acte d'engagement signe electroniquement
[ ] Kbis -- validite < 3 mois (renouveler 4x/an)
[ ] Attestation URSSAF de vigilance -- validite 6 mois (art. D8222-5 Code du travail)
[ ] Attestation fiscale -- validite annee civile en cours (couvre N-1)
[ ] Bilans ou extraits de bilans (3 derniers exercices)
```

### 9c.4.2 Regle de choix DUME vs DC1/DC2 **[JONATHAN]**

```
RC fournit DC1/DC2 dans le DCE        -> utiliser DC1/DC2
RC mentionne le DUME ou pas de formulaire -> utiliser DUME
Marche > 221K EUR                      -> DUME quasi-obligatoire
Dans le doute                          -> DUME (c'est le droit du candidat)
```

### 9c.4.3 Gestion procedure collective / redressement judiciaire **[JONATHAN]**

```
PROCEDURE COLLECTIVE -- REGLES
==============================

Liquidation judiciaire (art. L640-1 Code de commerce) :
  -> INTERDIT de soumissionner (art. L2141-3 CCP)
  -> Pas de candidature possible

Redressement judiciaire (art. L631-1 Code de commerce) :
  -> AUTORISE a soumissionner SI habilitation a poursuivre l'activite
  -> Obligations :
     1. Declarer dans le DUME (Partie III, section C "insolvabilite")
        OU dans le DC1 (section F1, cocher la ligne redressement)
     2. Joindre la copie du jugement d'ouverture (art. R2143-9 CCP)
     3. L'administrateur judiciaire doit etre informe
     4. Co-signature AJ sur le DC1 si mission d'assistance
     5. Si mission de representation : l'AJ signe SEUL

Sauvegarde (art. L620-1 Code de commerce) :
  -> AUTORISE a soumissionner
  -> Joindre copie du jugement d'ouverture
  -> Moins de contraintes que le redressement

Conciliation (art. L611-4 Code de commerce) :
  -> AUTORISE a soumissionner
  -> Pas d'obligation de declaration
  -> La conciliation est CONFIDENTIELLE
```

### 9c.4.4 Regles juridiques cles **[JONATHAN]**

| Regle | Reference | Application |
|-------|-----------|-------------|
| Seuils MAPA | Art. R2123-1 | < 40 000 EUR : publicite non obligatoire. < 221 000 EUR : MAPA possible |
| Interdictions de soumissionner | Art. L2141-1 a L2141-11 | Verifier pour Axiom/UNIVILE avant chaque candidature |
| Sous-traitance | Art. L2193-1 et suivants | DC4 obligatoire, declaration a la signature du marche |
| Groupement | Art. R2142-19 a R2142-27 | Conjoint ou solidaire, mandataire designe dans DC1 |
| Delai de validite des offres | Art. R2151-5 | Generalement 90-120 jours -- verifier dans le RC |
| Dematerialisation | Art. R2132-7 | Obligatoire au-dessus de 40 000 EUR depuis 2019 |
| Signature electronique | RGS** | Certificat qualifie eIDAS obligatoire pour l'AE |

### 9c.4.5 Verification validites automatique **[JONATHAN]**

```
VALIDITES DES PIECES (l'agent doit verifier avant depot)
========================================================

Kbis                -> < 3 mois depuis date de delivrance
Attestation URSSAF  -> 6 mois depuis date de delivrance
Attestation fiscale -> annee civile en cours (demander en janvier)
RC Pro              -> en cours de validite (date fin contrat)
```

### 9c.4.6 Calendrier de renouvellement des pieces **[FUSION]**

```
CALENDRIER RENOUVELLEMENT PIECES ADMINISTRATIVES
=================================================

KBIS (validite 3 mois)
  -> Renouveler 4x/an : 1er janvier, 1er avril, 1er juillet, 1er octobre
  -> Source : infogreffe.fr (SIRET 891 146 490)
  -> Cout : ~4 EUR/exemplaire
  -> Format : PDF
  -> Nommage : "KBIS_UNIVILE_[YYYY-MM].pdf"
  -> ALERTE : lancer le renouvellement 5 jours AVANT expiration

ATTESTATION URSSAF (validite 6 mois)
  -> Renouveler 2x/an : 1er janvier, 1er juillet
  -> Source : urssaf.fr -- espace employeur
  -> Cout : gratuit
  -> Format : PDF
  -> Nommage : "URSSAF_UNIVILE_[YYYY-MM].pdf"
  -> ALERTE : lancer le renouvellement 10 jours AVANT expiration
  -> Prerequis : etre a jour de TOUTES les cotisations

ATTESTATION FISCALE (validite annee civile)
  -> Renouveler 1x/an : janvier (des que disponible)
  -> Source : impots.gouv.fr -- espace professionnel
  -> Cout : gratuit
  -> Format : PDF
  -> Nommage : "FISCALE_UNIVILE_[YYYY].pdf"
  -> Couvre l'annee N-1
  -> ALERTE : rappel le 15 janvier chaque annee

RC PRO (validite contrat annuel)
  -> Renouveler a l'echeance du contrat (variable selon assureur)
  -> Source : votre assureur
  -> Format : PDF attestation en cours de validite
  -> Nommage : "RCPRO_UNIVILE_[YYYY-MM].pdf"
  -> ALERTE : rappel 30 jours AVANT expiration
  -> Verifier que les activites couvertes incluent :
     - Developpement web
     - Conseil IT
     - Design graphique (si applicable)
```

---

## 9c.5 Templates et fichiers de reference **[JONATHAN]**

```
FICHIERS DE REFERENCE POUR LE JURISTE
======================================

DC1 (Lettre de candidature) :
  -> dc1-univile.html    -- Version HTML print-ready (export PDF via Cmd+P)
  -> DC1-UNIVILE-PRE-REMPLI.md -- Version markdown de reference
  Chemin : /Source IA/DC1-UNIVILE-PRE-REMPLI.md

DC2 (Declaration du candidat) :
  -> dc2-univile.html    -- Version HTML print-ready (export PDF via Cmd+P)
  -> DC2-UNIVILE-PRE-REMPLI.md -- Version markdown de reference
  Chemin : /Source IA/DC2-UNIVILE-PRE-REMPLI.md

DUME :
  -> GUIDE-DUME-UNIVILE.md -- Guide pas-a-pas pour remplir sur chorus-pro.gouv.fr
  -> Importer le XML pre-rempli, MAJ ref marche, exporter PDF
  Chemin : /Source IA/GUIDE-DUME-UNIVILE.md

RSE :
  -> FICHE-RSE-AXIOM.md -- Engagements RSE a integrer si critere RSE
  Chemin : /Source IA/FICHE-RSE-AXIOM.md

References clients :
  -> FICHES-REFERENCES-AXIOM.md -- 9 fiches avec tableau de selection rapide

REGLES IMPORTANTES POUR LE JURISTE :
  1. Les cases a cocher dans le DC1 (section F3 "Pieces jointes") sont DYNAMIQUES
     -> Cocher UNIQUEMENT les pieces demandees par le RC ET presentes dans le dossier
     -> Ne JAMAIS cocher une case si la piece n'est pas jointe
  2. La forme de candidature (D2) est DYNAMIQUE
     -> Par defaut : candidat individuel
     -> Cocher groupement uniquement si groupement constitue
  3. Les rappels internes (signature electronique, redressement judiciaire)
     sont en commentaires HTML <!-- --> et n'apparaissent PAS dans le PDF final
  4. En cas de redressement judiciaire :
     -> Declarer dans le DUME ou DC1
     -> Joindre copie jugement d'ouverture (art. R2143-9)
     -> Co-signature administrateur judiciaire
```

### Contenu du DC1 pre-rempli (resume des sections) **[JONATHAN]**

Le DC1 pre-rempli (`DC1-UNIVILE-PRE-REMPLI.md`) contient :

| Section | Contenu | Status |
|---------|---------|--------|
| **A -- Identification acheteur** | `[A_REMPLIR]` pour chaque marche | Dynamique |
| **B -- Objet consultation** | `[A_REMPLIR]` objet, reference, procedure | Dynamique |
| **C -- Candidature** | Globalite ou lots (cases dynamiques) | Dynamique |
| **D -- Presentation candidat** | UNIVILE SAS, SIRET 891 146 490 00042, Jonathan Dewaele President | Pre-rempli |
| **D2 -- Groupement** | Candidat individuel par defaut | Pre-rempli |
| **E -- Groupement** | NON APPLICABLE (candidat individuel) | Pre-rempli |
| **F1 -- Declaration honneur** | Toutes cases cochees (sauf si redressement) | Pre-rempli |
| **F2 -- Documents en ligne** | Kbis infogreffe, URSSAF, fiscale | Pre-rempli |
| **F3 -- Pieces jointes** | DYNAMIQUE -- cocher selon RC | Dynamique |
| **G -- Signature** | Jonathan Dewaele, President, `[A_REMPLIR]` date | Semi-rempli |

### Contenu du DC2 pre-rempli (resume des sections) **[JONATHAN]**

Le DC2 pre-rempli (`DC2-UNIVILE-PRE-REMPLI.md`) contient :

| Section | Contenu | Status |
|---------|---------|--------|
| **A -- Identification acheteur** | `[A_REMPLIR]` | Dynamique |
| **B -- Objet consultation** | `[A_REMPLIR]` | Dynamique |
| **C -- Identification candidat** | UNIVILE SAS complet (SIRET, TVA, APE, capital, adresse) | Pre-rempli |
| **C2 -- Statut entreprise** | PME, micro-entreprise | Pre-rempli |
| **C3 -- Effectifs** | 2-4 personnes, `[A_REMPLIR]` CDI/CDD | Semi-rempli |
| **D -- Conditions participation** | RCS Saint-Denis, certifications | Pre-rempli |
| **E -- Aptitude professionnelle** | 6201Z, pas d'autorisation requise | Pre-rempli |
| **F -- Capacite economique** | CA `[A_REMPLIR]`, RC Pro `[A_REMPLIR]` | Dynamique |
| **G -- Capacite technique** | Moyens humains + techniques + references | Pre-rempli |
| **H -- Sous-traitance** | `[A_REMPLIR]` si applicable | Dynamique |

### Contenu du guide DUME (resume) **[JONATHAN]**

Le DUME (`GUIDE-DUME-UNIVILE.md`) couvre :

```
DUME -- 6 PARTIES
=================

Partie I   : Informations sur la procedure (pre-rempli ou A_REMPLIR)
Partie II  : Informations operateur economique (pre-rempli UNIVILE)
Partie III : Motifs d'exclusion (toutes cases NON, sauf si redressement)
Partie IV  : Criteres de selection (RCS, CA, RC Pro, references)
Partie V   : Reduction du nombre de candidats (NON APPLICABLE pour MAPA)
Partie VI  : Declarations finales (toutes cases OUI)

AVANTAGE DUME :
  DC1 + DC2 + Attestation sur l'honneur = 3 documents = 45 minutes
  DUME = 1 document = 10 minutes (apres la 1ere fois)
  Le DUME est une auto-declaration. Les preuves ne sont demandees qu'au LAUREAT.
  L'acheteur est OBLIGE de l'accepter (Code de la commande publique, 2019).
```

---

## 9c.6 Code TypeScript **[FUSION]**

```typescript
// agents/appels-offres/9c-juriste/index.ts

import { DCEAnalysis } from '../9a-analyseur-dce/types';

// ============================================================
// DONNEES STABLES UNIVILE (pre-remplies dans tous les formulaires)
// Source : DC1-UNIVILE-PRE-REMPLI.md + DC2-UNIVILE-PRE-REMPLI.md
// ============================================================
const UNIVILE_DATA = {
  denomination: 'UNIVILE SAS',
  nom_commercial: 'Axiom Marketing',
  siret: '891 146 490 00042',
  tva: 'FR75891146490',
  ape: '6201Z',
  forme_juridique: 'SAS (Societe par Actions Simplifiee)',
  capital: 1670,
  adresse: '62 Rue Pente Nicole',
  code_postal: '97421',
  ville: 'Saint-Louis, La Reunion',
  pays: 'France',
  telephone: '0693 46 88 84',
  email: 'contact@axiom-marketing.io',
  site: 'https://www.axiom-marketing.io',
  representant: 'Jonathan Dewaele',
  qualite_representant: 'President',
  rcs: 'Saint-Denis de la Reunion',
  rcs_numero: '891 146 490',
  pme: true,
  micro_entreprise: true,
  date_creation: '2020-11',
} as const;

// ============================================================
// INTERFACES
// ============================================================

interface PieceAdministrative {
  nom: string;
  type: 'DUME' | 'DC1' | 'DC2' | 'DC4' | 'ATTESTATION' | 'KBIS' | 'URSSAF' | 'FISCALE' | 'RCPRO' | 'RIB' | 'BILAN' | 'AUTRE';
  obligatoire: boolean;
  source_exigence: string;             // "RC article 5.2"
  present_dans_dossier: boolean;
  fichier_path: string | null;
  date_document: string | null;        // ISO date
  date_expiration: string | null;      // ISO date
  validite_ok: boolean;
  commentaire: string | null;
}

interface ValiditePiece {
  type: 'KBIS' | 'URSSAF' | 'FISCALE' | 'RCPRO';
  date_document: string;               // ISO date de delivrance
  date_expiration: string;             // ISO date d'expiration calculee
  jours_restants: number;
  valide: boolean;
  alerte: string | null;               // null si ok, message si probleme
  action_requise: string | null;       // "Renouveler sur infogreffe.fr"
}

interface CalendrierRenouvellement {
  piece: string;
  prochaine_date_renouvellement: string;  // ISO date
  source: string;                          // URL ou instruction
  cout: string;
  format: string;
  nommage: string;                         // Pattern de nommage
}

interface FormulaireChoix {
  choix: 'DUME' | 'DC1_DC2';
  raison: string;
  documents_a_generer: string[];
}

interface ProcedureCollective {
  en_redressement: boolean;
  en_sauvegarde: boolean;
  en_conciliation: boolean;
  en_liquidation: boolean;               // Si true -> INTERDIT de candidater
  jugement_date: string | null;
  jugement_fichier: string | null;
  administrateur_judiciaire: string | null;
  co_signature_requise: boolean;
  declaration_dume: string | null;        // Texte a mettre dans le DUME
  declaration_dc1: string | null;         // Texte pour le DC1
}

// ============================================================
// SORTIE PRINCIPALE DU SOUS-AGENT 9c
// ============================================================
interface DossierAdministratif {
  // --- Metadata ---
  reference_marche: string;
  acheteur: string;
  date_generation: string;               // ISO datetime
  sous_agent: '9c-juriste';

  // --- Choix formulaire ---
  formulaire_choix: FormulaireChoix;

  // --- Procedure collective ---
  procedure_collective: ProcedureCollective;

  // --- Pieces du dossier ---
  pieces: PieceAdministrative[];

  // --- Validites ---
  validites: ValiditePiece[];

  // --- Calendrier de renouvellement ---
  calendrier_renouvellement: CalendrierRenouvellement[];

  // --- Champs dynamiques remplis ---
  champs_remplis: Record<string, string>;   // "[A_REMPLIR]" -> valeur

  // --- Fichiers generes ---
  fichiers_generes: Array<{
    nom: string;                           // "01_DC1_UNIVILE_26-12345.pdf"
    type: 'DC1' | 'DC2' | 'DUME' | 'DC4' | 'ATTESTATION' | 'AUTRE';
    path: string;
    taille_octets: number;
    format: 'PDF' | 'XML';
    signe: boolean;
  }>;

  // --- Controle interne ---
  controle: {
    toutes_pieces_presentes: boolean;
    toutes_validites_ok: boolean;
    procedure_collective_ok: boolean;      // false si liquidation
    alertes: string[];
    erreurs_bloquantes: string[];
  };

  // --- Statut ---
  statut: 'COMPLET' | 'INCOMPLET' | 'ERREUR_BLOQUANTE';
}

// ============================================================
// LOGIQUE DE CHOIX DUME vs DC1/DC2 [JONATHAN]
// ============================================================
function choisirFormulaire(dceAnalysis: DCEAnalysis): FormulaireChoix {
  const rc = dceAnalysis.analyse_rc;
  const montant = dceAnalysis.caracteristiques_marche.estimation_budget.montant_total_ht;
  const piecesExigees = rc.pieces_exigees;

  // Regle 1 : Marche > 221K EUR -> DUME quasi-obligatoire
  if (montant && montant > 221000) {
    return {
      choix: 'DUME',
      raison: 'Marche > 221 000 EUR HT : DUME quasi-obligatoire (seuil europeen)',
      documents_a_generer: ['DUME_PDF', 'DUME_XML'],
    };
  }

  // Regle 2 : RC fournit DC1/DC2 dans le DCE -> utiliser DC1/DC2
  const dc1FourniDansDCE = piecesExigees.some(p =>
    p.toLowerCase().includes('dc1') || p.toLowerCase().includes('lettre de candidature')
  );
  const dc2FourniDansDCE = piecesExigees.some(p =>
    p.toLowerCase().includes('dc2') || p.toLowerCase().includes('declaration du candidat')
  );

  if (dc1FourniDansDCE && dc2FourniDansDCE) {
    return {
      choix: 'DC1_DC2',
      raison: 'RC fournit DC1 et DC2 dans le DCE : utilisation des formulaires fournis',
      documents_a_generer: ['DC1_PDF', 'DC2_PDF'],
    };
  }

  // Regle 3 : RC mentionne le DUME -> utiliser DUME
  const dumeMentionne = piecesExigees.some(p =>
    p.toLowerCase().includes('dume') || p.toLowerCase().includes('document unique')
  );

  if (dumeMentionne) {
    return {
      choix: 'DUME',
      raison: 'RC mentionne le DUME : utilisation du DUME',
      documents_a_generer: ['DUME_PDF', 'DUME_XML'],
    };
  }

  // Regle 4 : Dans le doute -> DUME (c'est le droit du candidat)
  return {
    choix: 'DUME',
    raison: 'Aucun formulaire specifie dans le RC : DUME par defaut (droit legal du candidat, CCP 2019)',
    documents_a_generer: ['DUME_PDF', 'DUME_XML'],
  };
}

// ============================================================
// VERIFICATION VALIDITES AUTOMATIQUE [JONATHAN]
// ============================================================
function verifierValidites(pieces: {
  kbis_date?: string;
  urssaf_date?: string;
  fiscale_annee?: number;
  rcpro_date_fin?: string;
}, dateDepot: string): ValiditePiece[] {
  const depot = new Date(dateDepot);
  const validites: ValiditePiece[] = [];

  // --- KBIS : < 3 mois depuis date de delivrance ---
  if (pieces.kbis_date) {
    const dateKbis = new Date(pieces.kbis_date);
    const expirationKbis = new Date(dateKbis);
    expirationKbis.setMonth(expirationKbis.getMonth() + 3);
    const joursRestants = Math.floor((expirationKbis.getTime() - depot.getTime()) / (1000 * 60 * 60 * 24));

    validites.push({
      type: 'KBIS',
      date_document: pieces.kbis_date,
      date_expiration: expirationKbis.toISOString().split('T')[0],
      jours_restants: joursRestants,
      valide: joursRestants > 0,
      alerte: joursRestants <= 0
        ? `EXPIRE : Kbis expire depuis ${Math.abs(joursRestants)} jours`
        : joursRestants <= 10
        ? `URGENT : Kbis expire dans ${joursRestants} jours`
        : null,
      action_requise: joursRestants <= 10
        ? 'Renouveler sur infogreffe.fr (SIRET 891 146 490, ~4 EUR)'
        : null,
    });
  }

  // --- URSSAF : 6 mois depuis date de delivrance ---
  if (pieces.urssaf_date) {
    const dateUrssaf = new Date(pieces.urssaf_date);
    const expirationUrssaf = new Date(dateUrssaf);
    expirationUrssaf.setMonth(expirationUrssaf.getMonth() + 6);
    const joursRestants = Math.floor((expirationUrssaf.getTime() - depot.getTime()) / (1000 * 60 * 60 * 24));

    validites.push({
      type: 'URSSAF',
      date_document: pieces.urssaf_date,
      date_expiration: expirationUrssaf.toISOString().split('T')[0],
      jours_restants: joursRestants,
      valide: joursRestants > 0,
      alerte: joursRestants <= 0
        ? `EXPIRE : URSSAF expire depuis ${Math.abs(joursRestants)} jours`
        : joursRestants <= 15
        ? `URGENT : URSSAF expire dans ${joursRestants} jours`
        : null,
      action_requise: joursRestants <= 15
        ? 'Renouveler sur urssaf.fr -- espace employeur (gratuit, prerequis: cotisations a jour)'
        : null,
    });
  }

  // --- FISCALE : annee civile en cours ---
  if (pieces.fiscale_annee) {
    const anneeDepot = depot.getFullYear();
    const valide = pieces.fiscale_annee === anneeDepot;

    validites.push({
      type: 'FISCALE',
      date_document: `${pieces.fiscale_annee}-01-01`,
      date_expiration: `${pieces.fiscale_annee}-12-31`,
      jours_restants: valide
        ? Math.floor((new Date(`${pieces.fiscale_annee}-12-31`).getTime() - depot.getTime()) / (1000 * 60 * 60 * 24))
        : 0,
      valide,
      alerte: !valide
        ? `EXPIRE : Attestation fiscale de ${pieces.fiscale_annee}, il faut celle de ${anneeDepot}`
        : null,
      action_requise: !valide
        ? `Telecharger sur impots.gouv.fr -- espace professionnel (attestation ${anneeDepot})`
        : null,
    });
  }

  // --- RC PRO : en cours de validite (date fin contrat) ---
  if (pieces.rcpro_date_fin) {
    const dateFinRcpro = new Date(pieces.rcpro_date_fin);
    const joursRestants = Math.floor((dateFinRcpro.getTime() - depot.getTime()) / (1000 * 60 * 60 * 24));

    validites.push({
      type: 'RCPRO',
      date_document: pieces.rcpro_date_fin,  // On utilise la date de fin comme reference
      date_expiration: pieces.rcpro_date_fin,
      jours_restants: joursRestants,
      valide: joursRestants > 0,
      alerte: joursRestants <= 0
        ? `EXPIRE : RC Pro expiree depuis ${Math.abs(joursRestants)} jours`
        : joursRestants <= 30
        ? `ATTENTION : RC Pro expire dans ${joursRestants} jours`
        : null,
      action_requise: joursRestants <= 30
        ? 'Contacter votre assureur pour renouvellement RC Pro. Verifier couverture : dev web + conseil IT'
        : null,
    });
  }

  return validites;
}

// ============================================================
// VERIFICATION PROCEDURE COLLECTIVE [JONATHAN]
// ============================================================
function verifierProcedureCollective(situation: {
  redressement?: boolean;
  sauvegarde?: boolean;
  conciliation?: boolean;
  liquidation?: boolean;
  jugement_date?: string;
  jugement_fichier?: string;
  administrateur_judiciaire?: string;
}): ProcedureCollective {
  // REGLE ABSOLUE : liquidation judiciaire = INTERDIT
  if (situation.liquidation) {
    return {
      en_redressement: false,
      en_sauvegarde: false,
      en_conciliation: false,
      en_liquidation: true,
      jugement_date: null,
      jugement_fichier: null,
      administrateur_judiciaire: null,
      co_signature_requise: false,
      declaration_dume: null,
      declaration_dc1: null,
    };
  }

  const result: ProcedureCollective = {
    en_redressement: situation.redressement || false,
    en_sauvegarde: situation.sauvegarde || false,
    en_conciliation: situation.conciliation || false,
    en_liquidation: false,
    jugement_date: situation.jugement_date || null,
    jugement_fichier: situation.jugement_fichier || null,
    administrateur_judiciaire: situation.administrateur_judiciaire || null,
    co_signature_requise: false,
    declaration_dume: null,
    declaration_dc1: null,
  };

  if (situation.redressement) {
    result.co_signature_requise = true;
    result.declaration_dume = `Jugement d'ouverture du ${situation.jugement_date} -- L'entreprise est autorisee a poursuivre son activite`;
    result.declaration_dc1 = 'Cocher la ligne redressement judiciaire dans la section F1';
  }

  if (situation.sauvegarde) {
    result.declaration_dume = `Jugement de sauvegarde du ${situation.jugement_date}`;
    result.declaration_dc1 = 'Joindre copie du jugement de sauvegarde';
  }

  // Conciliation : confidentielle, pas de declaration obligatoire

  return result;
}

// ============================================================
// REMPLISSAGE AUTOMATIQUE DC1 [FUSION]
// ============================================================
function remplirDC1(dceAnalysis: DCEAnalysis, procedureCollective: ProcedureCollective): Record<string, string> {
  const champs: Record<string, string> = {};
  const meta = dceAnalysis.metadata;

  // Section A -- Identification acheteur
  champs['A_designation_acheteur'] = meta.acheteur.nom;
  champs['A_adresse_acheteur'] = meta.acheteur.region || '[A_REMPLIR]';
  champs['A_courriel_acheteur'] = meta.acheteur.contact_email || '[A_REMPLIR]';

  // Section B -- Objet consultation
  champs['B_objet_marche'] = dceAnalysis.caracteristiques_marche.description_courte;
  champs['B_reference'] = meta.boamp_reference || meta.marche_public_id || '[A_REMPLIR]';
  champs['B_procedure'] = dceAnalysis.caracteristiques_marche.type_procedure;

  // Section C -- Lots
  if (dceAnalysis.caracteristiques_marche.lot_possible) {
    champs['C_candidature_type'] = 'LOTS';
    dceAnalysis.exigences_techniques.lots.forEach((lot, i) => {
      champs[`C_lot_${i + 1}_numero`] = String(lot.numero_lot);
      champs[`C_lot_${i + 1}_intitule`] = lot.nom;
    });
  } else {
    champs['C_candidature_type'] = 'GLOBALITE';
  }

  // Section D -- Pre-rempli (UNIVILE_DATA)
  // Pas besoin de remplir, deja dans le template

  // Section F1 -- Redressement judiciaire
  if (procedureCollective.en_redressement) {
    champs['F1_redressement'] = 'OUI';
    champs['F1_redressement_detail'] = procedureCollective.declaration_dc1 || '';
  }

  // Section G -- Signature
  champs['G_date_signature'] = new Date().toISOString().split('T')[0];

  return champs;
}

// ============================================================
// GENERATION CALENDRIER RENOUVELLEMENT [FUSION]
// ============================================================
function genererCalendrierRenouvellement(): CalendrierRenouvellement[] {
  const now = new Date();
  const annee = now.getFullYear();

  return [
    {
      piece: 'Kbis',
      prochaine_date_renouvellement: calculerProchaineDate([
        `${annee}-01-01`, `${annee}-04-01`, `${annee}-07-01`, `${annee}-10-01`,
        `${annee + 1}-01-01`,
      ]),
      source: 'https://www.infogreffe.fr (SIRET 891 146 490)',
      cout: '~4 EUR/exemplaire',
      format: 'PDF',
      nommage: `KBIS_UNIVILE_[YYYY-MM].pdf`,
    },
    {
      piece: 'Attestation URSSAF',
      prochaine_date_renouvellement: calculerProchaineDate([
        `${annee}-01-01`, `${annee}-07-01`, `${annee + 1}-01-01`,
      ]),
      source: 'https://www.urssaf.fr -- espace employeur',
      cout: 'Gratuit',
      format: 'PDF',
      nommage: `URSSAF_UNIVILE_[YYYY-MM].pdf`,
    },
    {
      piece: 'Attestation fiscale',
      prochaine_date_renouvellement: `${annee + 1}-01-15`,
      source: 'https://www.impots.gouv.fr -- espace professionnel',
      cout: 'Gratuit',
      format: 'PDF',
      nommage: `FISCALE_UNIVILE_[YYYY].pdf`,
    },
    {
      piece: 'RC Pro',
      prochaine_date_renouvellement: '[A_REMPLIR selon date echeance contrat]',
      source: 'Votre assureur',
      cout: 'Variable',
      format: 'PDF attestation',
      nommage: `RCPRO_UNIVILE_[YYYY-MM].pdf`,
    },
  ];
}

function calculerProchaineDate(dates: string[]): string {
  const now = new Date();
  for (const d of dates) {
    if (new Date(d) > now) return d;
  }
  return dates[dates.length - 1];
}

// ============================================================
// FONCTION PRINCIPALE DU SOUS-AGENT 9c [FUSION]
// ============================================================
async function executerJuriste(
  dceAnalysis: DCEAnalysis,
  piecesEnStock: {
    kbis_date?: string;
    urssaf_date?: string;
    fiscale_annee?: number;
    rcpro_date_fin?: string;
  },
  situationCollective: {
    redressement?: boolean;
    sauvegarde?: boolean;
    conciliation?: boolean;
    liquidation?: boolean;
    jugement_date?: string;
    jugement_fichier?: string;
    administrateur_judiciaire?: string;
  }
): Promise<DossierAdministratif> {
  const dateDepot = dceAnalysis.metadata.date_deadline_offre;
  const refMarche = dceAnalysis.metadata.boamp_reference || dceAnalysis.metadata.marche_public_id || 'REF-INCONNUE';

  // 1. Verification procedure collective
  const procCollective = verifierProcedureCollective(situationCollective);
  if (procCollective.en_liquidation) {
    return {
      reference_marche: refMarche,
      acheteur: dceAnalysis.metadata.acheteur.nom,
      date_generation: new Date().toISOString(),
      sous_agent: '9c-juriste',
      formulaire_choix: { choix: 'DUME', raison: '', documents_a_generer: [] },
      procedure_collective: procCollective,
      pieces: [],
      validites: [],
      calendrier_renouvellement: [],
      champs_remplis: {},
      fichiers_generes: [],
      controle: {
        toutes_pieces_presentes: false,
        toutes_validites_ok: false,
        procedure_collective_ok: false,
        alertes: [],
        erreurs_bloquantes: ['LIQUIDATION JUDICIAIRE : INTERDIT DE CANDIDATER (art. L2141-3 CCP)'],
      },
      statut: 'ERREUR_BLOQUANTE',
    };
  }

  // 2. Choix formulaire DUME vs DC1/DC2
  const formulaireChoix = choisirFormulaire(dceAnalysis);

  // 3. Verification validites
  const validites = verifierValidites(piecesEnStock, dateDepot);

  // 4. Remplissage champs dynamiques
  const champsRemplis = remplirDC1(dceAnalysis, procCollective);

  // 5. Construction liste des pieces
  const piecesExigees = dceAnalysis.analyse_rc.pieces_exigees;
  const pieces: PieceAdministrative[] = construirePieces(piecesExigees, dceAnalysis, validites);

  // 6. Calendrier de renouvellement
  const calendrier = genererCalendrierRenouvellement();

  // 7. Controle interne
  const toutesPresentes = pieces.every(p => !p.obligatoire || p.present_dans_dossier);
  const toutesValiditesOk = validites.every(v => v.valide);
  const alertes: string[] = [];
  const erreurs: string[] = [];

  validites.filter(v => v.alerte).forEach(v => alertes.push(v.alerte!));
  pieces.filter(p => p.obligatoire && !p.present_dans_dossier).forEach(p =>
    erreurs.push(`PIECE MANQUANTE : ${p.nom} (exige par ${p.source_exigence})`)
  );

  if (procCollective.en_redressement && !procCollective.jugement_fichier) {
    erreurs.push('REDRESSEMENT JUDICIAIRE : copie du jugement d\'ouverture manquante (art. R2143-9)');
  }

  const statut: DossierAdministratif['statut'] = erreurs.length > 0
    ? 'ERREUR_BLOQUANTE'
    : toutesPresentes && toutesValiditesOk
    ? 'COMPLET'
    : 'INCOMPLET';

  return {
    reference_marche: refMarche,
    acheteur: dceAnalysis.metadata.acheteur.nom,
    date_generation: new Date().toISOString(),
    sous_agent: '9c-juriste',
    formulaire_choix: formulaireChoix,
    procedure_collective: procCollective,
    pieces,
    validites,
    calendrier_renouvellement: calendrier,
    champs_remplis: champsRemplis,
    fichiers_generes: [],  // Rempli apres generation effective des PDF
    controle: {
      toutes_pieces_presentes: toutesPresentes,
      toutes_validites_ok: toutesValiditesOk,
      procedure_collective_ok: !procCollective.en_liquidation,
      alertes,
      erreurs_bloquantes: erreurs,
    },
    statut,
  };
}

// ============================================================
// CONSTRUCTION LISTE DES PIECES [FUSION]
// ============================================================
function construirePieces(
  piecesExigees: string[],
  dceAnalysis: DCEAnalysis,
  validites: ValiditePiece[]
): PieceAdministrative[] {
  const pieces: PieceAdministrative[] = [];

  // Mapping des pieces standard
  const mappingPieces: Array<{
    pattern: RegExp;
    nom: string;
    type: PieceAdministrative['type'];
  }> = [
    { pattern: /dume/i, nom: 'DUME', type: 'DUME' },
    { pattern: /dc1|lettre.+candidature/i, nom: 'DC1 -- Lettre de candidature', type: 'DC1' },
    { pattern: /dc2|declaration.+candidat/i, nom: 'DC2 -- Declaration du candidat', type: 'DC2' },
    { pattern: /dc4|sous.?traitance/i, nom: 'DC4 -- Sous-traitance', type: 'DC4' },
    { pattern: /kbis|extrait.+rcs/i, nom: 'Extrait Kbis < 3 mois', type: 'KBIS' },
    { pattern: /urssaf|vigilance|social/i, nom: 'Attestation URSSAF de vigilance', type: 'URSSAF' },
    { pattern: /fiscal/i, nom: 'Attestation fiscale', type: 'FISCALE' },
    { pattern: /rc.?pro|assurance|responsabilite/i, nom: 'Attestation RC Professionnelle', type: 'RCPRO' },
    { pattern: /rib|bancaire/i, nom: 'RIB', type: 'RIB' },
    { pattern: /bilan|compte|liasse/i, nom: 'Bilans 3 derniers exercices', type: 'BILAN' },
    { pattern: /memoire|technique/i, nom: 'Memoire technique', type: 'AUTRE' },
    { pattern: /bpu|bordereau|prix/i, nom: 'BPU -- Bordereau des Prix Unitaires', type: 'AUTRE' },
    { pattern: /cv|curriculum/i, nom: 'CV des personnes affectees', type: 'AUTRE' },
    { pattern: /reference/i, nom: 'Fiches references', type: 'AUTRE' },
  ];

  for (const pieceExigee of piecesExigees) {
    const mapping = mappingPieces.find(m => m.pattern.test(pieceExigee));
    const validite = mapping
      ? validites.find(v => v.type === mapping.type)
      : null;

    pieces.push({
      nom: mapping?.nom || pieceExigee,
      type: mapping?.type || 'AUTRE',
      obligatoire: true,  // Par defaut, tout ce que le RC exige est obligatoire
      source_exigence: 'RC -- Pieces de candidature',
      present_dans_dossier: false,  // A mettre a jour apres verification
      fichier_path: null,
      date_document: validite?.date_document || null,
      date_expiration: validite?.date_expiration || null,
      validite_ok: validite?.valide ?? true,
      commentaire: validite?.alerte || null,
    });
  }

  return pieces;
}
```

---

## 9c.7 Schema JSON de sortie **[FUSION]**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "DossierAdministratif",
  "description": "Sortie du sous-agent 9c Juriste -- Dossier administratif complet",
  "type": "object",
  "required": [
    "reference_marche", "acheteur", "date_generation", "sous_agent",
    "formulaire_choix", "procedure_collective", "pieces", "validites",
    "calendrier_renouvellement", "champs_remplis", "fichiers_generes",
    "controle", "statut"
  ],
  "properties": {
    "reference_marche": { "type": "string" },
    "acheteur": { "type": "string" },
    "date_generation": { "type": "string", "format": "date-time" },
    "sous_agent": { "const": "9c-juriste" },
    "formulaire_choix": {
      "type": "object",
      "properties": {
        "choix": { "enum": ["DUME", "DC1_DC2"] },
        "raison": { "type": "string" },
        "documents_a_generer": { "type": "array", "items": { "type": "string" } }
      }
    },
    "procedure_collective": {
      "type": "object",
      "properties": {
        "en_redressement": { "type": "boolean" },
        "en_sauvegarde": { "type": "boolean" },
        "en_conciliation": { "type": "boolean" },
        "en_liquidation": { "type": "boolean" },
        "jugement_date": { "type": ["string", "null"] },
        "jugement_fichier": { "type": ["string", "null"] },
        "administrateur_judiciaire": { "type": ["string", "null"] },
        "co_signature_requise": { "type": "boolean" },
        "declaration_dume": { "type": ["string", "null"] },
        "declaration_dc1": { "type": ["string", "null"] }
      }
    },
    "pieces": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "nom": { "type": "string" },
          "type": { "enum": ["DUME", "DC1", "DC2", "DC4", "ATTESTATION", "KBIS", "URSSAF", "FISCALE", "RCPRO", "RIB", "BILAN", "AUTRE"] },
          "obligatoire": { "type": "boolean" },
          "source_exigence": { "type": "string" },
          "present_dans_dossier": { "type": "boolean" },
          "fichier_path": { "type": ["string", "null"] },
          "date_document": { "type": ["string", "null"] },
          "date_expiration": { "type": ["string", "null"] },
          "validite_ok": { "type": "boolean" },
          "commentaire": { "type": ["string", "null"] }
        }
      }
    },
    "validites": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": { "enum": ["KBIS", "URSSAF", "FISCALE", "RCPRO"] },
          "date_document": { "type": "string" },
          "date_expiration": { "type": "string" },
          "jours_restants": { "type": "number" },
          "valide": { "type": "boolean" },
          "alerte": { "type": ["string", "null"] },
          "action_requise": { "type": ["string", "null"] }
        }
      }
    },
    "calendrier_renouvellement": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "piece": { "type": "string" },
          "prochaine_date_renouvellement": { "type": "string" },
          "source": { "type": "string" },
          "cout": { "type": "string" },
          "format": { "type": "string" },
          "nommage": { "type": "string" }
        }
      }
    },
    "champs_remplis": {
      "type": "object",
      "additionalProperties": { "type": "string" }
    },
    "fichiers_generes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "nom": { "type": "string" },
          "type": { "enum": ["DC1", "DC2", "DUME", "DC4", "ATTESTATION", "AUTRE"] },
          "path": { "type": "string" },
          "taille_octets": { "type": "number" },
          "format": { "enum": ["PDF", "XML"] },
          "signe": { "type": "boolean" }
        }
      }
    },
    "controle": {
      "type": "object",
      "properties": {
        "toutes_pieces_presentes": { "type": "boolean" },
        "toutes_validites_ok": { "type": "boolean" },
        "procedure_collective_ok": { "type": "boolean" },
        "alertes": { "type": "array", "items": { "type": "string" } },
        "erreurs_bloquantes": { "type": "array", "items": { "type": "string" } }
      }
    },
    "statut": { "enum": ["COMPLET", "INCOMPLET", "ERREUR_BLOQUANTE"] }
  }
}
```

---

## 9c.8 Gestion des erreurs **[FUSION]**

| Erreur | Severite | Action automatique | Escalade |
|--------|----------|-------------------|----------|
| Liquidation judiciaire | BLOQUANTE | STOP immediat, statut `ERREUR_BLOQUANTE` | Jonathan : candidature impossible |
| Piece obligatoire manquante | BLOQUANTE | Lister dans `erreurs_bloquantes` | Jonathan : fournir la piece |
| Kbis expire | HAUTE | Alerte + action requise (infogreffe.fr) | Jonathan : commander nouveau Kbis |
| URSSAF expiree | HAUTE | Alerte + action requise (urssaf.fr) | Jonathan : telecharger attestation |
| Attestation fiscale perimee | HAUTE | Alerte + action requise (impots.gouv.fr) | Jonathan : telecharger attestation |
| RC Pro expiree | HAUTE | Alerte + action requise (contacter assureur) | Jonathan : renouveler RC Pro |
| Kbis expire dans < 10 jours | MOYENNE | Alerte preemptive | Jonathan : anticiper renouvellement |
| URSSAF expire dans < 15 jours | MOYENNE | Alerte preemptive | Jonathan : anticiper renouvellement |
| RC Pro expire dans < 30 jours | MOYENNE | Alerte preemptive | Jonathan : contacter assureur |
| Redressement sans jugement joint | BLOQUANTE | `ERREUR_BLOQUANTE` | Jonathan : fournir jugement d'ouverture |
| Redressement sans co-signature AJ | HAUTE | Alerte | Jonathan : obtenir co-signature |
| Format PDF non conforme | MOYENNE | Tenter re-export | Si echec : alerte Jonathan |
| Template DC1/DC2 introuvable | BLOQUANTE | Utiliser DUME en fallback | Log + alerte |

---

---

