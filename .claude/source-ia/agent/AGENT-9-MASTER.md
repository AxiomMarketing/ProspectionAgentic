# AGENT 9 — APPELS D'OFFRES (MASTER)
**Fichiers associes** : AGENT-9a-DCE.md, AGENT-9b-QUALIFICATEUR.md, AGENT-9c-JURISTE.md, AGENT-9d-CHIFFREUR.md, AGENT-9e-REDACTEUR-MEMOIRE.md, AGENT-9f-CONTROLEUR-QA.md, AGENT-9g-MONITEUR.md
**Position** : Agent 1b → Agent 9 → Agent 7 (metriques)
**Cout** : ~31 EUR/mois

---

# AGENT 9 -- APPELS D'OFFRES (Version 2 -- Fusionne avec Architecture Jonathan OpenLaw)

**Version** : 2.0 FINALE
**Date** : 19 mars 2026
**Auteur** : Systeme Axiom Marketing (Univile SAS)
**Statut** : Version fusionnee finale (remplace v1)
**Origine** : Fusion de 3 drafts :
- AGENT-9-V2-DRAFT-9a-9b.md (sous-agents 9a + 9b)
- AGENT-9-V2-DRAFT-9c-9d-9f.md (sous-agents 9c + 9d + 9f)
- AGENT-9-V2-DRAFT-9e-9g.md (sous-agents 9e + 9g + vue d'ensemble)
**Confidentialite** : Interne Axiom

---

## LEGENDE DES SOURCES

Tout au long de ce document, chaque element est tague avec sa provenance :

| Tag | Signification |
|-----|---------------|
| **[JONATHAN]** | Element provenant du document de Jonathan (superieur, conserve tel quel) |
| **[NOUS]** | Element provenant de notre Agent 9 v1 (unique, conserve tel quel) |
| **[FUSION]** | Element nouveau cree par la fusion des deux sources |

---

## TABLE DES MATIERES

1. [Mission et position dans le pipeline](#1-mission-et-position-dans-le-pipeline)
2. [Input (de Agent 1b Veilleur Marches)](#2-input-de-agent-1b-veilleur-marches)
3. [Les 7 sous-agents](#3-les-7-sous-agents)
   - 3.1 [Sous-Agent 9a -- Analyseur DCE](#31-sous-agent-9a--analyseur-dce)
   - 3.2 [Sous-Agent 9b -- Qualificateur + Decideur GO/NO-GO](#32-sous-agent-9b--qualificateur--decideur-gono-go)
   - 3.3 [Sous-Agent 9c -- Juriste (Legal Compliance)](#33-sous-agent-9c--juriste-legal-compliance)
   - 3.4 [Sous-Agent 9d -- Chiffreur (Pricing Strategist)](#34-sous-agent-9d--chiffreur-pricing-strategist)
   - 3.5 [Sous-Agent 9e -- Redacteur Memoire](#35-sous-agent-9e--redacteur-memoire)
   - 3.6 [Sous-Agent 9f -- Controleur QA (Quality Assurance)](#36-sous-agent-9f--controleur-qa-quality-assurance)
   - 3.7 [Sous-Agent 9g -- Moniteur Post-Depot](#37-sous-agent-9g--moniteur-post-depot)
4. [Donnees Axiom (profil entreprise, references, stack)](#4-donnees-axiom-profil-entreprise-references-stack)
5. [Workflow complet (J-31 a J+30)](#5-workflow-complet-j-31-a-j30)
6. [Structure dossiers fichiers (de Jonathan)](#6-structure-dossiers-fichiers-de-jonathan)
7. [Ressources et templates (liste de tous les fichiers Jonathan)](#7-ressources-et-templates)
8. [Metriques et KPIs](#8-metriques-et-kpis)
9. [Couts](#9-couts)
10. [Integration Agents 1-10](#10-integration-agents-1-10)
11. [Verification coherence](#11-verification-coherence)

---
---

# 1. MISSION ET POSITION DANS LE PIPELINE

## 1.1 Mission

**Agent 9 -- Appels d'Offres** : Analyser, qualifier, preparer et deposer les reponses aux appels d'offres publics.

L'Agent 9 est le plus complexe du systeme avec 7 sous-agents specialises. Il gere le cycle complet d'un appel d'offres, de la reception du lead (depuis Agent 1b Veilleur Marches) jusqu'au suivi post-depot et capitalisation.

## 1.2 Position dans le pipeline global

| Element | Detail |
|---------|--------|
| **Recoit de** | Agent 1b (Veilleur Marches) -- leads marche_public avec score >= 60 |
| **Alimente** | Agent 7 (Analyste) -- donnees de performance (taux de conversion AO, ROI) |
| **Alimente** | Agent 8 (Dealmaker) -- si marche gagne, passage en phase execution |
| **Alimente** | Agent 10 (CSM) -- si marche gagne, suivi client |

## 1.3 Schema du pipeline interne (7 sous-agents)

```
                    AGENT 1b (Veilleur Marches)
                           |
                    Lead marche_public
                    (score >= 60)
                           |
                           v
              +========================+
              |      AGENT 9 v2        |
              |   APPELS D'OFFRES      |
              |   (7 sous-agents)      |
              +========================+
                           |
                           v
                  +-----------------+
                  |   9a ANALYSEUR  |
                  |   DCE           |
                  +--------+--------+
                           |
                           v
                  +-----------------+
                  |   9b QUALIFICA- |
                  |   TEUR+DECIDEUR|
                  +--------+--------+
                           |
                    Si ECARTE: Archive
                    Si GO/RECOMMANDE:
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
    +-----------+    +-----------+    +-----------+
    |   9c      |    |   9d      |    |   9e      |
    | JURISTE   |    | CHIFFREUR |    | REDACTEUR |
    | (dossier  |    | (offre    |    | (memoire  |
    |  admin)   |    |  financ.) |    |  technique|
    +-----------+    +-----------+    +-----------+
          |                |                |
          +----------------+----------------+
                           |
                           v
                  +-----------------+
                  |   9f CONTROLEUR |
                  |   QA            |
                  +--------+--------+
                           |
                           v
                      DEPOT (J-2)
                    (validation Jonathan)
                           |
                           v
                  +-----------------+
                  |   9g MONITEUR   |
                  |   POST-DEPOT   |
                  +-----------------+
                           |
                  +--------+--------+
                  |                 |
                  v                 v
             SI GAGNE:        SI PERDU:
             Signature AE     Courrier R2181-3
             Pieces laureat   RETEX + capitalisation
```

### Pipeline sequentiel et parallele

```
9a (Analyse DCE)
    |
    v
9b (Score GO/NO-GO)
    |
    v (si GO)
    |
    +-- 9c (Juriste)         ]
    +-- 9d (Chiffreur)       ] EN PARALLELE
    +-- 9e (Redacteur)       ]
    |
    v (quand les 3 termines)
9f (Controleur QA)
    |
    v
DEPOT
    |
    v
9g (Moniteur Post-Depot -- continu)
```

### Flux de donnees inter-sous-agents **[FUSION]**

| Source | Destination | Donnees transmises |
|--------|-------------|-------------------|
| 9a Analyseur | 9b Qualificateur | `DCEAnalysis` complet (scoring preliminaire) |
| 9a Analyseur | 9c Juriste | `flags_conditionnels`, `conditions_participation`, `analyse_rc.pieces_exigees`, `analyse_ccap` |
| 9a Analyseur | 9d Chiffreur | `exigences_techniques`, `criteres_evaluation`, `caracteristiques_marche`, `analyse_rc.strategie_prix_recommandee` |
| 9a Analyseur | 9e Redacteur | `exigences_individuelles`, `flags_conditionnels`, `mots_cles_miroir`, `template_memoire` |
| 9d Chiffreur | 9e Redacteur | `offre_financiere` (le chiffrage influence la section "moyens" du memoire) |
| 9c Juriste | 9f Controleur | `dossier_administratif` (DC1/DC2/DUME, attestations, validites) |
| 9d Chiffreur | 9f Controleur | `offre_financiere` (BPU/DQE/DPGF remplis) |
| 9e Redacteur | 9f Controleur | `memoire_technique` (document final) |
| 9f Controleur | Jonathan | `rapport_controle` (GO / CORRECTIONS REQUISES) |

---
---

# 2. INPUT (de Agent 1b Veilleur Marches)

L'Agent 9 recoit de l'Agent 1b (Veilleur Marches) un lead de type `marche_public` avec un score >= 60.

**Donnees recues :**

| Champ | Description | Exemple |
|-------|-------------|---------|
| `boamp_reference` | Reference BOAMP de l'AO | "BOAMP-26-12345" |
| `source_url` | URL de la plateforme de depot | "https://www.marches-publics.gouv.fr/..." |
| `acheteur` | Nom de l'acheteur public | "Communaute d'Agglomeration CINOR" |
| `objet` | Objet du marche | "Refonte du portail internet" |
| `type_procedure` | Type de procedure | "MAPA" |
| `montant_estime` | Estimation du budget | 60000 |
| `date_publication` | Date de publication | "2026-03-01" |
| `date_deadline` | Date limite de depot | "2026-04-15" |
| `dce_urls` | Liens vers les documents du DCE | ["RC.pdf", "CCTP.pdf", "CCAP.pdf"] |
| `score_lead` | Score de qualification du lead | 75 |
| `mots_cles` | Mots-cles extraits | ["refonte", "portail", "React", "accessibilite"] |

---
---

# 3. LES 7 SOUS-AGENTS


---
---

> Les 7 sous-agents sont detailles dans les fichiers dedies :
> - **9a** : AGENT-9a-DCE.md (Analyseur DCE)
> - **9b** : AGENT-9b-QUALIFICATEUR.md (Qualificateur + Decideur)
> - **9c** : AGENT-9c-JURISTE.md (Juriste)
> - **9d** : AGENT-9d-CHIFFREUR.md (Chiffreur)
> - **9e** : AGENT-9e-REDACTEUR-MEMOIRE.md (Redacteur Memoire)
> - **9f** : AGENT-9f-CONTROLEUR-QA.md (Controleur QA)
> - **9g** : AGENT-9g-MONITEUR.md (Moniteur Post-Depot)

---
---

---


# 4. DONNEES AXIOM (profil entreprise, references, stack)


> Source : DC1-UNIVILE-PRE-REMPLI.md + DC2-UNIVILE-PRE-REMPLI.md

```
DONNEES STABLES (a copier tel quel dans chaque formulaire)
==========================================================

Denomination       : UNIVILE SAS
Nom commercial     : Axiom Marketing
SIRET              : 891 146 490 00042
TVA                : FR75891146490
APE                : 6201Z -- Programmation informatique
Forme juridique    : SAS (Societe par Actions Simplifiee)
Capital            : 1 670 EUR
Siege              : 62 Rue Pente Nicole, 97421 Saint-Louis, La Reunion
Pays               : France
Tel                : 0693 46 88 84
Email              : contact@axiom-marketing.io
Site               : https://www.axiom-marketing.io
Representant       : Jonathan Dewaele, President
RCS                : Saint-Denis de la Reunion, 891 146 490
PME                : Oui (micro-entreprise)
Date creation      : Novembre 2020

DONNEES A METTRE A JOUR REGULIEREMENT
======================================

CA 3 derniers exercices  -> demander au comptable
Effectif                 -> MAJ a chaque embauche/depart
RC Pro                   -> MAJ a chaque renouvellement
Kbis                     -> renouveler tous les 3 mois
URSSAF                   -> renouveler tous les 6 mois
Attestation fiscale      -> renouveler en janvier
```

---

*Document genere pour UNIVILE SAS -- Axiom Marketing*
*Sous-agents 9c (Juriste), 9d (Chiffreur), 9f (Controleur QA) -- Agent 9 V2*
*Date : 19 mars 2026*
*Statut : DRAFT pour validation Jonathan*


---
---


# 5. WORKFLOW COMPLET (J-31 a J+30)

## 5.1 Retroplanning standard (>= 31 jours avant deadline) **[JONATHAN]**

| Jour | Action | Responsable | Sous-Agent |
|------|--------|-------------|------------|
| **J-31** | GO confirme -- lancement analyse DCE | IA | 9a |
| **J-28** | Analyse DCE complete -- brief strategie | IA | 9a, 9b |
| **J-25** | Questions a poser a l'acheteur (si necessaire) | Jonathan | 9a |
| **J-20** | Strategie technique validee -- lancement redaction | Jonathan | 9b |
| **J-15** | Premier jet memoire technique | IA | 9e |
| **J-12** | Chiffrage premiere estimation (BPU/DQE/DPGF) | IA + Jonathan | 9d |
| **J-10** | Chiffrage finalise | Jonathan | 9d |
| **J-7** | Relecture complete + controle conformite | Jonathan | 9f |
| **J-5** | Dossier administratif finalise (DC1/DC2/DUME) | IA | 9c |
| **J-3** | Dossier finalise, signature electronique | IA + Jonathan | 9f |
| **J-1** | Depot sur la plateforme | IA | - |
| **J-0** | DEADLINE | Equipe | - |
| **J+1** | Si resultat immediat : traitement | IA | 9g |
| **J+10** | Relance si pas de nouvelle | IA | 9g |
| **J+30** | RETEX si rejet | IA + Jonathan | 9g |

## 5.2 Retroplanning compresse (15-30 jours)

| Jour | Action | Responsable |
|------|--------|-------------|
| **J-N** | GO confirme -- lancement URGENT | IA |
| **J-(N-2)** | Analyse DCE + questions acheteur | IA |
| **J-(N/2)** | Premier jet memoire + chiffrage | IA |
| **J-5** | Relecture Jonathan + corrections | Jonathan |
| **J-2** | Dossier final + signature + depot | IA |
| **J-0** | DEADLINE | Equipe |

## 5.3 Retroplanning ultra-urgent (< 15 jours)

| Jour | Action | Responsable |
|------|--------|-------------|
| **J-N** | GO confirme -- mode SPRINT | IA |
| **J-(N-1)** | Analyse + redaction simultanees | IA |
| **J-2** | Relecture eclair + depot | Jonathan |
| **J-0** | DEADLINE | Equipe |

---
---

# 6. STRUCTURE DOSSIERS FICHIERS (de Jonathan)

## 6.0 Structure globale des dossiers marches publics **[JONATHAN]**

> Source : Jonathan (EQUIPE-MARCHES-PUBLICS-OPENLAW.md, lignes 1249-1317) -- copie integrale

```
/marches-publics/
├── /veille/
│   ├── marches_detectes.json          ← tous les marches detectes
│   ├── marches_qualifies.json         ← marches avec score
│   └── /archive/                      ← marches ecartes
│
├── /en-cours/
│   └── /[ref-marche]/                 ← un dossier par marche
│       ├── fiche_marche.json          ← fiche enrichie
│       ├── decision.json              ← GO/NO-GO + retroplanning
│       ├── /dce/                      ← documents du DCE telecharges
│       │   ├── RC.pdf
│       │   ├── CCTP.pdf
│       │   ├── CCAP.pdf
│       │   ├── AE.pdf
│       │   └── BPU.xlsx
│       ├── /analyse/
│       │   ├── analyse_dce.json       ← extraction d'exigences
│       │   ├── criteres.json          ← criteres d'attribution
│       │   └── questions.md           ← questions pour l'acheteur
│       ├── /administratif/
│       │   ├── DC1.pdf
│       │   ├── DC2.pdf
│       │   ├── attestation_honneur.pdf
│       │   └── checklist_pieces.json
│       ├── /technique/
│       │   ├── memoire_technique.pdf  ← document final
│       │   ├── memoire_technique.md   ← source editable
│       │   ├── cv_jonathan.pdf
│       │   ├── cv_marty.pdf
│       │   └── /schemas/
│       ├── /financier/
│       │   ├── BPU_rempli.xlsx
│       │   ├── DQE.xlsx
│       │   ├── DPGF.xlsx
│       │   └── strategie_prix.json
│       ├── /qa/
│       │   ├── rapport_controle.json
│       │   └── corrections.json
│       └── /depot/                    ← dossier final pret a deposer
│           ├── 01_candidature/
│           ├── 02_offre_technique/
│           └── 03_offre_financiere/
│
├── /references/
│   ├── profil_axiom.json              ← profil entreprise
│   ├── profil_mafate.json
│   ├── references_clients.json        ← fiches references
│   ├── cv_jonathan.json
│   ├── cv_marty.json
│   └── documents_administratifs/      ← Kbis, attestations, etc.
│
├── /templates/
│   ├── memoire_technique_template.md
│   ├── DC1_pre_rempli.pdf
│   ├── DC2_pre_rempli.pdf
│   └── fiche_reference_template.md
│
├── /historique/
│   └── /[ref-marche]/                 ← dossiers des marches passes
│       ├── resultat.json              ← gagne/perdu/sans suite
│       ├── rapport_analyse.pdf        ← si demande post-rejet
│       └── retex.md                   ← retour d'experience
│
└── /stats/
    ├── dashboard.json                 ← KPIs
    └── historique_scores.json         ← evolution scoring
```

---

## 6.1 Structure type du dossier de reponse

```
[REF-MARCHE]/
  |
  +-- 01_CANDIDATURE/
  |     +-- 01_DC1_UNIVILE_[ref].pdf          (ou DUME)
  |     +-- 02_DC2_UNIVILE_[ref].pdf          (si DC1/DC2)
  |     +-- 03_KBIS_UNIVILE_[YYYY-MM].pdf     (au stade attribution)
  |     +-- 04_URSSAF_UNIVILE_[YYYY-MM].pdf   (au stade attribution)
  |     +-- 05_FISCALE_UNIVILE_[YYYY].pdf     (au stade attribution)
  |     +-- 06_RCPRO_UNIVILE_[YYYY-MM].pdf
  |     +-- 07_RIB_UNIVILE.pdf
  |
  +-- 02_OFFRE_TECHNIQUE/
  |     +-- 03_MEMOIRE_TECHNIQUE_UNIVILE_[ref].pdf
  |     +-- CV_JONATHAN_DEWAELE.pdf
  |     +-- CV_MARTY_WONG.pdf
  |     +-- FICHES_REFERENCES_[1-5].pdf
  |     +-- FICHE_RSE_AXIOM.pdf               (si flag RSE)
  |
  +-- 03_OFFRE_FINANCIERE/
  |     +-- 04_BPU_UNIVILE_[ref].pdf           (ou DQE ou DPGF)
  |     +-- 04_BPU_UNIVILE_[ref].xlsx          (si modifiable demande)
  |
  +-- 04_ANNEXES/
  |     +-- ATTESTATIONS/
  |     +-- SCHEMAS_TECHNIQUES/
  |     +-- PLANNING_GANTT.pdf
  |
  +-- 05_INTERNE/                              (non depose)
        +-- analyse_dce.json
        +-- qualification.json
        +-- offre_financiere.json
        +-- rapport_controle.json
        +-- retroplanning.json
        +-- notes_jonathan.md
```

## 6.2 Convention de nommage **[JONATHAN]**

```
Pattern : "NN_TYPE_UNIVILE_[ref-marche].pdf"

NN    : Numero d'ordre (01, 02, 03...)
TYPE  : Type de document en majuscules (DC1, DC2, MEMOIRE_TECHNIQUE, BPU...)
UNIVILE : Nom de l'entreprise
[ref] : Reference du marche
.pdf  : Format (toujours PDF sauf BPU/DQE en .xlsx si demande)
```

## 6.3 Base de connaissances evolutive **[JONATHAN]**

> Source : Jonathan (EQUIPE-MARCHES-PUBLICS-OPENLAW.md, lignes 1321-1331) -- copie integrale

Chaque marche traite alimente la base de connaissances :

| Donnee | Source | Utilisation |
|--------|--------|-------------|
| **Prix du marche** | ATTRI1 / BOAMP attribution | Calibrer les futurs chiffrages |
| **Nombre de candidats** | Rapport d'analyse (post-rejet) | Affiner le scoring concurrence |
| **Score technique obtenu** | Rapport d'analyse | Ameliorer la redaction |
| **Acheteurs connus** | Historique | Personnaliser les futures reponses |
| **Titulaires sortants** | BOAMP / data.gouv.fr | Anticiper la concurrence |
| **TJM du marche** | Prix attribues | Ajuster la strategie prix |

---
---

# 7. RESSOURCES ET TEMPLATES

## 7.1 Fichiers de Jonathan (Source IA/) **[JONATHAN]**

| Fichier | Usage | Sous-agent |
|---------|-------|------------|
| `EQUIPE-MARCHES-PUBLICS-OPENLAW.md` | Source Jonathan : 9 agents marches publics | Reference |
| `DC1-UNIVILE-PRE-REMPLI.md` | DC1 Lettre de candidature pre-remplie | 9c Juriste |
| `dc1-univile.html` | Version HTML print-ready du DC1 | 9c Juriste |
| `DC2-UNIVILE-PRE-REMPLI.md` | DC2 Declaration du candidat pre-remplie | 9c Juriste |
| `dc2-univile.html` | Version HTML print-ready du DC2 | 9c Juriste |
| `GUIDE-DUME-UNIVILE.md` | Guide pas-a-pas remplissage DUME | 9c Juriste |
| `FICHES-REFERENCES-AXIOM.md` | 9 fiches references clients + tableau selection | 9e Redacteur |
| `MEMOIRE-TECHNIQUE-TEMPLATE.md` | Squelette memoire 5 chapitres | 9e Redacteur |
| `memoire-technique-template.html` | Version HTML charte Axiom, print-ready | 9e Redacteur |
| `SECTION-ECOCONCEPTION-MEMOIRE.md` | Section eco-conception RGESN prete a inserer | 9e Redacteur |
| `FICHE-RSE-AXIOM.md` | Fiche RSE 1 page a joindre en annexe | 9e Redacteur + 9c |
| `fiche-rse-axiom.html` | Version HTML export PDF de la fiche RSE | 9e Redacteur |
| `BRAINSTORM-ELEMENTS-BONUS-MARCHES.md` | Arsenal elements bonus si RC le demande | 9e Redacteur |

## 7.2 Fichiers generes par le pipeline (TypeScript)

| Fichier | Usage | Sous-agent |
|---------|-------|------------|
| `9a-analyseur-dce/types.ts` | Interfaces TypeScript DCEAnalysis | 9a |
| `9a-analyseur-dce/extract_pdf.py` | Extraction hybride PyMuPDF + pdfplumber | 9a |
| `9a-analyseur-dce/claude-extract.ts` | Appel Claude API Structured Outputs | 9a |
| `9a-analyseur-dce/chunking.ts` | Gestion DCE > 100 pages | 9a |
| `9b-qualificateur-decideur/scoring.ts` | Matrice scoring 7 criteres sur 100 | 9b |
| `9b-qualificateur-decideur/notifications.ts` | Notifications Slack + email | 9b |
| `9b-qualificateur-decideur/review-response.ts` | Gestion reponses Jonathan GO/NO-GO | 9b |
| `9c-juriste/index.ts` | Dossier admin, DUME/DC1/DC2, validites | 9c |
| `9d-chiffreur/index.ts` | Offre financiere, BPU, marge LODEOM | 9d |
| `9e-redacteur-memoire/index.ts` | Generation memoire technique 5 chapitres | 9e |
| `9e-redacteur-memoire/mermaid-generator.ts` | Schemas Mermaid (Gantt, archi, orga) | 9e |
| `9e-redacteur-memoire/anti-detection.ts` | Ratio 60/40 IA/humain, checklist | 9e |
| `9f-controleur-qa/index.ts` | Rapport controle, 29 points, signatures | 9f |
| `9g-moniteur-post-depot/index.ts` | Surveillance, alertes, RETEX, DECP | 9g |

---
---

# 8. METRIQUES ET KPIs

## 8.1 Metriques par sous-agent

| Sous-agent | Metrique cle | Cible |
|------------|-------------|-------|
| **9a Analyseur** | Temps d'analyse par DCE | < 2 minutes (PDF < 100 pages) |
| **9a Analyseur** | Taux d'extraction exigences | > 95% des exigences identifiees |
| **9b Qualificateur** | Precision scoring | > 80% correlation avec resultat final |
| **9b Qualificateur** | Temps de scoring | < 30 secondes |
| **9c Juriste** | Pieces conformes au premier passage | > 90% |
| **9d Chiffreur** | Ecart prix vs laureat (marches perdus) | < 20% |
| **9e Redacteur** | Ratio IA/humain | 60/40 maximum |
| **9e Redacteur** | Score anti-detection (Copyleaks) | < 20% "likely AI" |
| **9f Controleur** | Taux de detection erreurs | > 99% |
| **9g Moniteur** | Temps de detection resultat | < 24h apres publication |

## 8.2 Metriques globales Agent 9

| Metrique | Cible | Mesure |
|----------|-------|--------|
| **Taux de soumission** (AO qualifies -> deposes) | > 80% des RECOMMANDE | Mensuel |
| **Taux de succes** (deposes -> gagnes) | > 35% MAPA, > 20% AO Ouvert | Trimestriel |
| **Cout moyen par reponse** | < 500 EUR (IA + humain) | Par AO |
| **Temps moyen de reponse** | < 15 jours (reception -> depot) | Par AO |
| **ROI moyen** | > 5x (montant gagne / cout reponse) | Annuel |
| **Capitalisation RETEX** | 100% des rejets analyses | Continu |

## 8.3 Taux de succes par type de marche **[NOUS]**

| Type | Taux typique | Concurrence moyenne | Temps reponse recommande |
|------|-------------|---------------------|--------------------------|
| **MAPA** (< 90k EUR) | 35-50% | 3-8 soumissions | 5-10 jours |
| **AO Ouvert** (> 90k EUR) | 15-25% | 15-30 soumissions | 20-40 jours |
| **AO Restreint** | 40-60% | 5-12 candidats | 15-30 jours |
| **Marche reconduction** | 60-80% | 2-4 concurrents | 10-20 jours |

## 8.4 Dashboard synthetique **[JONATHAN]**

> Source : Jonathan (EQUIPE-MARCHES-PUBLICS-OPENLAW.md, lignes 1447-1479) -- copie integrale

```
═══════════════════════════════════════════════════════
TABLEAU DE BORD MARCHES PUBLICS — Semaine 12/2026
═══════════════════════════════════════════════════════

VEILLE
  Marches detectes cette semaine    : 12
  Marches qualifies (score >= 50)   : 3
  Marches recommandes (>= 70)       : 1

EN COURS
  Dossiers en preparation           : 2
  → Commune Saint-Denis (J-18)      : Redaction memoire ██████░░ 75%
  → Region Reunion (J-25)           : Analyse DCE       ████░░░░ 50%

DEPOSES
  Dossiers deposes ce mois          : 1
  Taux de reponse (deposes/detectes): 8%

RESULTATS
  Marches gagnes (cumul)            : 0
  Marches perdus (cumul)            : 0
  En attente de resultat            : 1

PROCHAINES DEADLINES
  17/04 — Commune Saint-Denis       : Site web vitrine
  28/04 — Region Reunion            : Portail donnees

ALERTES
  ⚠ Attestation URSSAF expire le 15/04 — renouveler
  ⚠ Certificat signature en attente de livraison
═══════════════════════════════════════════════════════
```

---
---

# 9. COUTS

## 9.1 Couts par sous-agent (estimation par AO)

| Sous-agent | Cout IA | Cout humain | Total |
|------------|---------|-------------|-------|
| **9a Analyseur DCE** | ~0.50-1.50 EUR (Claude API) | 0 EUR | ~1 EUR |
| **9b Qualificateur** | ~0.05 EUR (Claude API) | 0 EUR (auto) ou 15 min Jonathan (si POSSIBLE) | ~0.05-20 EUR |
| **9c Juriste** | ~0.10 EUR (generation PDF) | 15 min Jonathan (verification) | ~20 EUR |
| **9d Chiffreur** | ~0.10 EUR | 2-4h Jonathan (validation prix) | ~200-400 EUR |
| **9e Redacteur** | ~0.50-1.50 EUR (Claude API) | 4-8h Jonathan (relecture) | ~400-800 EUR |
| **9f Controleur** | ~0.05 EUR | 1h Jonathan (validation finale) | ~80 EUR |
| **9g Moniteur** | ~0 EUR (scraping + API publiques) | 30 min si rejet (RETEX) | ~0-40 EUR |

## 9.2 Cout total par type d'AO

| Type AO | Cout IA total | Cout humain total | Cout total |
|---------|--------------|-------------------|------------|
| **MAPA simple** (< 40k EUR) | ~2-5 EUR | ~8-16h (~600-1200 EUR) | ~600-1200 EUR |
| **AO standard** (40-200k EUR) | ~3-8 EUR | ~16-32h (~1200-2500 EUR) | ~1200-2500 EUR |
| **AO complexe** (> 200k EUR) | ~5-15 EUR | ~32-60h (~2500-5000 EUR) | ~2500-5000 EUR |

---
---

# 10. INTEGRATION AGENTS 1-10

## 10.1 Position de l'Agent 9 dans le systeme global

```
AGENT 1 (Veilleur)
  |
  +-- 1a (Veilleur Prospects)  --> Agent 2 (Enrichisseur) --> Agent 3 (Scoreur) --> ...
  |
  +-- 1b (Veilleur Marches)    --> AGENT 9 (Appels d'Offres) -+
                                                                |
                                                                +-- SI GAGNE --> Agent 8 (Dealmaker) --> Agent 10 (CSM)
                                                                |
                                                                +-- TOUJOURS --> Agent 7 (Analyste) : metriques performance AO
```

## 10.2 Interactions detaillees

| Agent | Interaction avec Agent 9 | Direction | Donnees |
|-------|-------------------------|-----------|---------|
| **Agent 1b** (Veilleur Marches) | Input | 1b -> 9 | Lead marche_public (boamp_ref, DCE, deadline) |
| **Agent 7** (Analyste) | Reporting | 9 -> 7 | Metriques : taux soumission, taux succes, cout/AO, ROI |
| **Agent 7** (Analyste) | Feedback | 7 -> 9 | Insights : types AO les plus rentables, ajustements scoring |
| **Agent 8** (Dealmaker) | Handoff | 9 -> 8 | Si gagne : dossier complet, conditions marche, contacts acheteur |
| **Agent 10** (CSM) | Handoff | 9 -> 10 | Si gagne : profil client, historique interaction, SLA contractuels |

## 10.3 Base de donnees partagee

L'Agent 9 utilise les tables PostgreSQL suivantes :

| Table | Usage | Alimentee par | Lue par |
|-------|-------|---------------|---------|
| `ao_analyses` | Analyses DCE + decisions | 9a, 9b | 9c, 9d, 9e, 9f, 7 |
| `ao_exigences` | Exigences individuelles EX-001 | 9a | 9e, 9f |
| `ao_questions_acheteur` | Questions pour l'acheteur Q-001 | 9a | 9g |
| `notifications` | Notifications Jonathan (Slack/email) | 9b | - |
| `courriers_post_rejet` | Courriers art. R2181-3 | 9g | - |
| `alertes_moniteur` | Alertes Q/R, modifs, resultats | 9g | - |
| `marches_actifs` | Marches en cours (suivi) | 9b | 9g |
| `leads_bruts` | Leads marches publics | 1b | 9a |

---
---

# COMMUNICATION INTER-AGENTS **[JONATHAN]**

> Source : Jonathan (EQUIPE-MARCHES-PUBLICS-OPENLAW.md, lignes 1180-1241) -- copie integrale

### Bus de messages

Chaque agent communique via un bus de messages structure. Les messages suivent un format standardise :

```json
{
  "id": "msg_20260317_001",
  "from": "sentinel",
  "to": "qualifier",
  "type": "new_market",
  "priority": "normal",
  "timestamp": "2026-03-17T06:20:00Z",
  "payload": { "...fiche_marche..." },
  "requires_ack": true,
  "deadline": "2026-03-17T12:00:00Z"
}
```

### Types de messages

| Type | De → Vers | Contenu |
|------|-----------|---------|
| `new_market` | sentinel → qualifier | Nouvelle fiche marche detectee |
| `qualified_market` | qualifier → decision_gate | Marche qualifie avec score |
| `go_decision` | decision_gate → dce_analyst | Decision GO + retroplanning |
| `nogo_decision` | decision_gate → archive | Decision NO-GO + raison |
| `dce_analysis_complete` | dce_analyst → legal, pricing, writer | Analyse DCE terminee |
| `legal_ready` | legal → quality_assurance | Dossier administratif pret |
| `pricing_ready` | pricing → quality_assurance + writer | Chiffrage pret |
| `draft_ready` | writer → quality_assurance | Memoire technique pret |
| `qa_pass` | quality_assurance → decision_gate | Dossier conforme, pret a deposer |
| `qa_fail` | quality_assurance → [agent concerne] | Corrections requises |
| `alert` | any → decision_gate | Alerte (deadline, probleme, question) |
| `question_acheteur` | dce_analyst → decision_gate | Question a poser a l'acheteur (via Jonathan) |
| `qr_published` | tender_monitor → dce_analyst + writer | Nouvelle Q/R publiee, analyser l'impact |
| `dce_modified` | tender_monitor → dce_analyst + all | Rectificatif DCE detecte, re-analyser |
| `deadline_extended` | tender_monitor → decision_gate | Report de deadline, MAJ retroplanning |
| `result_won` | tender_monitor → decision_gate + legal | Marche gagne, preparer signature + pieces laureat |
| `result_lost` | tender_monitor → decision_gate | Marche perdu, declencher demande info art. R2181-3 |
| `debrief_received` | tender_monitor → decision_gate | Rapport d'analyse recu, generer RETEX |
| `no_news_30d` | tender_monitor → decision_gate | Pas de nouvelle 30j apres depot, relancer acheteur |

### Escalade et alertes

```
NIVEAU 1 (automatique) :
→ Agent bloque → relance avec plus de contexte
→ Delai interne depasse → notification agent suivant

NIVEAU 2 (notification Jonathan) :
→ Decision GO/NO-GO requise
→ Question a poser a l'acheteur
→ Information manquante (attestation, reference)
→ Incoherence detectee dans le DCE

NIVEAU 3 (alerte urgente) :
→ Deadline < 5 jours et dossier incomplet
→ Piece administrative expiree
→ Erreur critique detectee par QA
```

---
---

# 11. VERIFICATION COHERENCE


## 11.1 Tableau comparatif Agent 9 v1 vs v2

| Aspect | v1 (4 sous-agents) | v2 (7 sous-agents) |
|--------|-------------------|-------------------|
| **Sous-agents** | 9a, 9b, 9c, 9d | 9a, 9b, 9c, 9d, 9e, 9f, 9g |
| **Analyseur CCTP** | 9a | 9a (inchange) |
| **Scoreur GO/NO-GO** | 9b | 9b (inchange) |
| **Redacteur Memoire** | 9c (basique) | 9e (fusion Jonathan + nous) |
| **Chiffreur (prix)** | Dans 9c | 9c (dedie, separe du redacteur) |
| **Conformite Admin** | Dans 9d | 9d (dedie, DUME/DC1/DC2) |
| **Assembleur Dossier** | 9d (tout en un) | 9f (dedie, PDF + signature + depot) |
| **Moniteur Post-Depot** | ABSENT | 9g (100% nouveau, de Jonathan) |
| **Structure memoire** | Generique | 5 chapitres Jonathan |
| **Selection references** | Manuelle | Automatique via FICHES-REFERENCES-AXIOM.md |
| **Sections conditionnelles** | Absentes | FLAGS (RSE, Social, RGAA) |
| **Post-depot** | Rien | Q/R, modifs, resultat, courrier R2181-3, RETEX |
| **Capitalisation** | Basique | RETEX structuree, calibration prix, veille concurrentielle |

---



## 11.2 Tracabilite : ce qui vient de ou

| Element | Source Jonathan | Source Nous | Fusionne |
|---------|---------------|-------------|----------|
| **Structure 5 chapitres memoire** | X | | |
| **Regles redaction (miroir, preuves > promesses)** | X | | |
| **FLAGS conditionnels (RSE, Social, RGAA)** | X | | |
| **Templates references (9 fiches + selection)** | X | | |
| **Volume adapte MAPA/AO** | X | | |
| **Section eco-conception RGESN** | X | | |
| **Elements bonus marches** | X | | |
| **Modele courrier post-rejet** | X | | |
| **RETEX template** | X | | |
| **3 phases moniteur** | X | | |
| **Tableau 9 alertes** | X | | |
| **Obligations legales (art. R2181-3 etc.)** | X | | |
| **Workflow post-rejet 5 etapes** | X | | |
| **Integration DECP data.gouv.fr** | X | | |
| **Claude API generation memoire** | | X | |
| **Generation Mermaid (Gantt, archi, orga)** | | X | |
| **Ratio 60/40 IA/humain** | | X | |
| **Detection anti-IA (checklist 7 points)** | | X | |
| **Structured Outputs TypeScript** | | X | |
| **Integration BullMQ pipeline** | | X | |
| **Prompt Claude (system + user)** | | | X |
| **Structure miroir criteres RC** | | | X |
| **Fiche technique resumee** | | | X |
| **Code TypeScript complet** | | | X |

---



## 11.3 Checklist exhaustive -- RIEN n'est perdu -- RIEN n'est perdu

### Jonathan Agent #7 (Technical Writer) -- TOUT preserve dans 9e

- [x] Structure memoire 5 chapitres (Presentation, Comprehension, Solution, Methodologie, Maintenance)
- [x] Regles de redaction (7 regles : miroir, CCTP point par point, preuves > promesses, chiffres, pas copier-coller, mise en page pro, volume adapte)
- [x] Sections conditionnelles avec FLAGS (ACTIVER_SECTION_RSE, ACTIVER_VOLET_SOCIAL, ACTIVER_SECTION_RGAA)
- [x] Scan criteres conditionnels (detection dans RC/CCTP)
- [x] Templates references (MEMOIRE-TECHNIQUE-TEMPLATE.md, memoire-technique-template.html)
- [x] Fichiers de reference (FICHES-REFERENCES-AXIOM.md, SECTION-ECOCONCEPTION-MEMOIRE.md, FICHE-RSE-AXIOM.md)
- [x] Tableau de selection references par type de marche (7 categories)
- [x] Regle absolue : ne pas inserer si flag = false
- [x] Volume adapte (MAPA 15-25 pages, AO 30-50 pages)
- [x] Formulation validee volet social ("Axiom s'engage a etudier...")
- [x] Sous-sections detaillees (1.1 a 5.5 avec sous-niveaux)
- [x] Annexes (CV, attestations, fiches references, schemas)

### Jonathan Agent #9 (Tender Monitor) -- TOUT preserve dans 9g

- [x] 3 phases (consultation, attente resultat, post-attribution)
- [x] Surveillance Q/R, modifications DCE, reports deadline
- [x] Workflow post-rejet 5 etapes (detection, demande, reception, capitalisation, RETEX)
- [x] Modele courrier post-rejet (texte integral art. R2181-3)
- [x] Template RETEX complet (scores, motifs, lecons, concurrent)
- [x] Tableau 9 alertes (evenement, urgence, action)
- [x] Obligations legales completes (R2132-6, R2181-1, R2181-3, R2182-1, R2184-6, L2196-2, R2196-1)
- [x] Integration DECP data.gouv.fr (seuil 40K, delai 2 mois)
- [x] Avis attribution BOAMP (seuils, contenu)
- [x] Delai standstill (11j / 16j)
- [x] Actions SI GAGNE (AE, pieces, certificat)
- [x] Actions SI PERDU (courrier J+1, relance J+10, RETEX J+17)
- [x] Archivage /historique/[ref-marche]/
- [x] Schema workflow complet (encadre textuel)

### Fichiers de contenu Jonathan -- TOUT reference dans 9e

- [x] FICHES-REFERENCES-AXIOM.md (9 fiches + tableau selection + donnees manquantes)
- [x] SECTION-ECOCONCEPTION-MEMOIRE.md (RGESN, resultats mesurables, outils audit)
- [x] BRAINSTORM-ELEMENTS-BONUS-MARCHES.md (regles deploiement, contexte reglementaire)

### Notre Agent 9c existant -- TOUT preserve dans 9e

- [x] Claude API pour generation (system + user prompt)
- [x] Structured Outputs TypeScript (interfaces MemoireTechnique)
- [x] Generation Mermaid (Gantt, architecture, organigramme) -- code complet
- [x] Ratio 60/40 IA/humain
- [x] Detection anti-IA (checklist 7 points, phrases generiques)
- [x] Integration donnees Axiom JSON (getAxiomData)
- [x] Longueur automatique selon type procedure et montant
- [x] Sections humain requis ([HUMAIN REQUIS])
- [x] Metriques generation (modele, tokens, cout, date)
- [x] Exemples Mermaid (Gantt, architecture, organigramme)
- [x] Parties 100% humaines (tableau 5 parties)
- [x] Code complet index.ts + mermaid-generator.ts + anti-detection.ts

---



## 11.4 Resume des ameliorations V2 vs V1 (sous-agents 9a et 9b)


### Sous-Agent 9a : Analyseur DCE

| Aspect | v1 | v2 (fusion) |
|--------|-----|-------------|
| **Perimetre d'analyse** | CCTP seulement | DCE complet : RC + CCTP + CCAP |
| **Exigences** | Liste par lot (specs_cles) | Exigences individuelles EX-001 avec classification ELIMINATOIRE/OBLIGATOIRE/SOUHAITABLE |
| **Criteres attribution** | Liste simple | Analyse RC detaillee avec sous-criteres, ponderations, recommandations par critere |
| **Clauses admin** | Non analysees | Analyse CCAP : penalites, garanties, assurances, delais |
| **Detection suspicion** | Non | Detection marche fausse (6 indicateurs, score 0-100) |
| **Questions acheteur** | Non | Generation automatique Q-001..Q-NNN avec priorite |
| **FLAGS conditionnels** | Non | ACTIVER_SECTION_RSE, ACTIVER_VOLET_SOCIAL, ACTIVER_SECTION_RGAA |
| **Claude Vision** | Oui | Oui (conserve) |
| **Structured Outputs** | Oui | Oui (conserve, schema enrichi) |
| **Chunking > 100 pages** | Oui | Oui (conserve, ameliore pour multi-documents) |

### Sous-Agent 9b : Qualificateur + Decideur

| Aspect | v1 | v2 (fusion) |
|--------|-----|-------------|
| **Niveaux de decision** | 3 (GO/REVIEW/NO-GO) | 4 (RECOMMANDE/POSSIBLE/MARGINAL/ECARTE) |
| **Matrice scoring** | 7 criteres echelle 0-5 x poids | 7 criteres sur 100 pts avec sous-criteres detailles |
| **Critere "Modalites"** | Absent | 15 pts (full remote vs presence) |
| **Critere "Strategique"** | Absent | 10 pts (reconduction, accord-cadre, reference) |
| **Critere "Effort"** | Absent | 5 pts (complexite dossier) |
| **Procedure collective** | Non | Detection + penalite -15 pts automatique |
| **Brief decision** | Non | Template 1 page format Jonathan |
| **Retroplanning** | Non | Automatique J-31 a J-0 avec jalons |
| **Charge de travail** | Non | Verification conflits calendrier |
| **Expected Value** | Oui | Oui (conserve) |
| **Taux succes par type** | Oui | Oui (conserve) |
| **Slack notification** | Oui | Oui (enrichie avec EV + brief + retroplanning) |
| **Auto-archive MARGINAL** | Non | Oui (48h sans reponse = ECARTE) |



## 11.5 Les 7 sous-agents Agent 9 v2 -- Recapitulatif

| # | Nom | Role | Source | Statut draft |
|---|-----|------|--------|-------------|
| 9a | **Analyseur CCTP** | Parse DCE, extrait exigences, genere flags conditionnels | Nous (v1) + enrichi Jonathan (flags) | AGENT-9-V2-DRAFT-9a-9b.md |
| 9b | **Scoreur GO/NO-GO** | Score 7 criteres, decide GO/REVIEW/NO-GO | Nous (v1) + enrichi Jonathan (criteres) | AGENT-9-V2-DRAFT-9a-9b.md |
| 9c | **Chiffreur** | Offre financiere : BPU, DQE, DPGF | Nous (separe du redacteur v1) | AGENT-9-V2-DRAFT-9c-9d-9f.md |
| 9d | **Conformite Admin** | DUME, DC1, DC2, attestations | Nous (separe de l'assembleur v1) | AGENT-9-V2-DRAFT-9c-9d-9f.md |
| 9e | **Redacteur Memoire** | Memoire technique 5 chapitres + schemas Mermaid | **FUSION** (Jonathan #7 + notre 9c) | **CE FICHIER** |
| 9f | **Assembleur Dossier** | PDF multi-docs, signature eIDAS, depot J-2 | Nous (ancien 9d allege) | AGENT-9-V2-DRAFT-9c-9d-9f.md |
| 9g | **Moniteur Post-Depot** | Q/R, modifications, resultats, RETEX | **JONATHAN #9** (100% nouveau) | **CE FICHIER** |

---

## 11.6 Fichiers de reference de l'Agent 9 v2

```
worspace/agent/
  AGENT-9-APPELS-OFFRES-SPECS-COMPLETES.md    -- v1 originale (4 sous-agents)
  AGENT-9-V2-DRAFT-9a-9b.md                   -- v2 draft sous-agents 9a + 9b
  AGENT-9-V2-DRAFT-9c-9d-9f.md                -- v2 draft sous-agents 9c + 9d + 9f
  AGENT-9-V2-DRAFT-9e-9g.md                   -- v2 draft sous-agents 9e + 9g (CE FICHIER)

Source IA/
  EQUIPE-MARCHES-PUBLICS-OPENLAW.md            -- Source Jonathan (Agent #7 + #9)
  FICHES-REFERENCES-AXIOM.md                   -- 9 fiches references clients
  SECTION-ECOCONCEPTION-MEMOIRE.md             -- Section eco-conception RGESN
  BRAINSTORM-ELEMENTS-BONUS-MARCHES.md         -- Elements bonus marches
```

---



---
---

*Document final genere le 19 mars 2026*
*Agent 9 v2 -- Fusion complete Jonathan + pipeline Axiom*
*7 sous-agents : 9a (Analyseur DCE), 9b (Qualificateur+Decideur), 9c (Juriste), 9d (Chiffreur), 9e (Redacteur Memoire), 9f (Controleur QA), 9g (Moniteur Post-Depot)*
*UNIVILE SAS -- Axiom Marketing*
