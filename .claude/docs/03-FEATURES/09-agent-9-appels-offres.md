# Agent 9 — APPELS D'OFFRES (Master)

## Vue d'Ensemble

L'Agent 9 (APPELS D'OFFRES) est l'agent le plus complexe du système Axiom Marketing avec 7 sous-agents spécialisés. Il gère le cycle complet d'un appel d'offres public, depuis la réception du lead depuis l'Agent 1b (Veilleur Marchés) jusqu'au dépôt du dossier et au suivi post-dépôt avec capitalisation RETEX. Il opère exclusivement sur les marchés publics (BOAMP, DECP, France Marchés) et produit des dossiers complets : mémoire technique, offre financière (BPU/DQE/DPGF), dossier administratif (DC1/DC2/DUME). Coût : ~31 EUR/mois (IA seule — coût humain Jonathan non compris).

## Sous-Agents

| ID | Nom | Rôle | Mode | API Principale |
|----|-----|------|------|----------------|
| 9a | Analyseur DCE | Téléchargement et extraction des documents du DCE (RC, CCTP, CCAP, AE, BPU) via PyMuPDF + pdfplumber + Claude API. Identifie les exigences individuelles EX-001+, conditions de participation, critères d'attribution, stratégie prix recommandée | Événementiel (depuis 9b) | Claude API (Structured Outputs) |
| 9b | Qualificateur + Décideur | Calcule un score GO/NO-GO sur 7 critères (compétences techniques, délai, budget, concurrence, charges admin, stratégie, exclusions). Envoie notification Slack Jonathan pour validation. Gère les réponses GO/RECOMMANDE/POSSIBLE/ECARTE | Événementiel | Slack API |
| 9c | Juriste | Prépare le dossier administratif (DC1/DC2/DUME, attestations, vérification validités). Pré-remplit les formulaires avec les données Axiom stables. Vérifie la conformité RGPD et les exclusions légales | Parallèle (après 9b GO) | Aucune (templates locaux + Puppeteer PDF) |
| 9d | Chiffreur | Stratège prix : calcule l'offre financière (BPU/DQE/DPGF), analyse la marge LODEOM (applicable DOM-TOM), stratégie prix selon la concurrence estimée et les données historiques | Parallèle (après 9b GO) | Aucune (calcul local) |
| 9e | Rédacteur Mémoire | Génère le mémoire technique complet (5 chapitres + annexes) via Claude API. Ratio 60/40 IA/humain, détection anti-IA (Copyleaks < 20% "likely AI"), injection des mots-clés miroir du CCTP, génération schémas Mermaid (Gantt, architecture, orga) | Parallèle (après 9b GO) | Claude API |
| 9f | Contrôleur QA | Vérifie 29 points de conformité sur le dossier complet (dossier administratif + offre financière + mémoire technique). Produit un rapport GO / CORRECTIONS REQUISES pour Jonathan | Séquentiel (après 9c + 9d + 9e) | Aucune |
| 9g | Moniteur Post-Dépôt | Surveille la plateforme de dépôt pour les Q/R, rectificatifs DCE, extensions de délai, résultat. Déclenche RETEX si perdu, prépare les pièces lauréat si gagné, rédige le courrier art. R2181-3 si demande d'analyse | Cron continu après dépôt | Scraping + API publiques BOAMP/DECP |

## Input / Output

### Input (depuis Agent 1b — Veilleur Marchés)

Reçu via queue BullMQ `ao-pipeline` pour les leads de type `marche_public` avec `score_lead >= 60` :

```json
{
  "boamp_reference": "BOAMP-26-12345",
  "source_url": "https://www.marches-publics.gouv.fr/...",
  "acheteur": "Communauté d'Agglomération CINOR",
  "objet": "Refonte du portail internet",
  "type_procedure": "MAPA",
  "montant_estime": 60000,
  "date_publication": "2026-03-01",
  "date_deadline": "2026-04-15",
  "dce_urls": ["RC.pdf", "CCTP.pdf", "CCAP.pdf"],
  "score_lead": 75,
  "mots_cles": ["refonte", "portail", "React", "accessibilite"]
}
```

### Output (vers Agent 7 — Métriques)

Métriques performance AO envoyées via queue BullMQ `analyste-ao-metrics` : taux de soumission, taux de succès, coût par réponse, ROI.

### Output (vers Agent 8 — Si gagné)

Si marché gagné : dossier complet + conditions du marché + contacts acheteur transmis à l'Agent 8 (Dealmaker) pour formalisation contractuelle, puis vers Agent 10 (CSM) pour onboarding.

## Workflow

### Workflow complet (J-31 à J+30)

**Retroplanning standard (>= 31 jours avant deadline) :**

| Jour | Action | Responsable | Sous-Agent |
|------|--------|-------------|------------|
| **J-31** | GO confirmé — lancement analyse DCE | IA | 9a |
| **J-28** | Analyse DCE complète — brief stratégie | IA | 9a, 9b |
| **J-25** | Questions à poser à l'acheteur (si nécessaire) | Jonathan | 9a |
| **J-20** | Stratégie technique validée — lancement rédaction | Jonathan | 9b |
| **J-15** | Premier jet mémoire technique | IA | 9e |
| **J-12** | Chiffrage première estimation (BPU/DQE/DPGF) | IA + Jonathan | 9d |
| **J-10** | Chiffrage finalisé | Jonathan | 9d |
| **J-7** | Relecture complète + contrôle conformité | Jonathan | 9f |
| **J-5** | Dossier administratif finalisé (DC1/DC2/DUME) | IA | 9c |
| **J-3** | Dossier finalisé, signature électronique | IA + Jonathan | 9f |
| **J-1** | Dépôt sur la plateforme | IA | — |
| **J-0** | DEADLINE | Équipe | — |
| **J+1** | Si résultat immédiat : traitement | IA | 9g |
| **J+10** | Relance si pas de nouvelles | IA | 9g |
| **J+30** | RETEX si rejet | IA + Jonathan | 9g |

**Retroplanning compressé (15-30 jours) :**

| Jour | Action | Responsable |
|------|--------|-------------|
| J-N | GO confirmé — lancement URGENT | IA |
| J-(N-2) | Analyse DCE + questions acheteur | IA |
| J-(N/2) | Premier jet mémoire + chiffrage | IA |
| J-5 | Relecture Jonathan + corrections | Jonathan |
| J-2 | Dossier final + signature + dépôt | IA |

**Retroplanning ultra-urgent (< 15 jours) :**

| Jour | Action | Responsable |
|------|--------|-------------|
| J-N | GO confirmé — mode SPRINT | IA |
| J-(N-1) | Analyse + rédaction simultanées | IA |
| J-2 | Relecture éclair + dépôt | Jonathan |

### Pipeline séquentiel et parallèle

```
9a (Analyse DCE)
    |
    v
9b (Score GO/NO-GO) — notification Slack Jonathan
    |
    v (si GO/RECOMMANDE)
    |
    +-- 9c (Juriste : dossier administratif)   ]
    +-- 9d (Chiffreur : offre financière)       ] EN PARALLÈLE
    +-- 9e (Rédacteur : mémoire technique)      ]
    |
    v (quand les 3 terminés)
9f (Contrôleur QA — 29 points)
    |
    v (si GO)
DÉPÔT (J-2 — validation Jonathan obligatoire)
    |
    v
9g (Moniteur Post-Dépôt — continu jusqu'au résultat)
    |
    +-- SI GAGNÉ : Pièces lauréat → Agent 8 → Agent 10
    +-- SI PERDU : Courrier R2181-3 + RETEX + capitalisation
```

### Flux de données inter-sous-agents

| Source | Destination | Données transmises |
|--------|-------------|-------------------|
| 9a Analyseur | 9b Qualificateur | `DCEAnalysis` complet (scoring préliminaire) |
| 9a Analyseur | 9c Juriste | `flags_conditionnels`, `conditions_participation`, `pieces_exigees`, `analyse_ccap` |
| 9a Analyseur | 9d Chiffreur | `exigences_techniques`, `criteres_evaluation`, `strategie_prix_recommandee` |
| 9a Analyseur | 9e Rédacteur | `exigences_individuelles`, `mots_cles_miroir`, `template_memoire` |
| 9d Chiffreur | 9e Rédacteur | `offre_financiere` (influence la section "moyens" du mémoire) |
| 9c Juriste | 9f Contrôleur | `dossier_administratif` (DC1/DC2/DUME, attestations, validités) |
| 9d Chiffreur | 9f Contrôleur | `offre_financiere` (BPU/DQE/DPGF remplis) |
| 9e Rédacteur | 9f Contrôleur | `memoire_technique` (document final) |
| 9f Contrôleur | Jonathan | `rapport_controle` (GO / CORRECTIONS REQUISES) |

## APIs & Coûts

| API | Coût/AO | Coût/mois estimé | Utilisation |
|-----|---------|-----------------|-------------|
| Claude API (9a analyse DCE + 9e mémoire) | ~1-3 EUR | ~10-15 EUR | Extraction PDF structurée + rédaction mémoire |
| Claude API (9b qualification) | ~0.05 EUR | ~0.50 EUR | Score GO/NO-GO |
| Puppeteer (9c génération PDF DC1/DC2) | ~0.10 EUR | ~1 EUR | PDFs administratifs |
| Scraping + APIs publiques BOAMP/DECP (9g) | ~0 EUR | ~0 EUR | Surveillance résultat |
| Slack API (notifications Jonathan) | 0 EUR | 0 EUR | Inclus workspace |
| Infrastructure partagée | — | ~15 EUR | Part VPS |

**Total Agent 9 IA : ~31 EUR/mois** (hors coût temps Jonathan)

Coût total par type d'AO (IA + humain Jonathan) :
| Type AO | Coût IA | Coût humain | Coût total |
|---------|---------|-------------|------------|
| MAPA simple (< 40k EUR) | ~2-5 EUR | ~8-16h (~600-1200 EUR) | ~600-1200 EUR |
| AO standard (40-200k EUR) | ~3-8 EUR | ~16-32h (~1200-2500 EUR) | ~1200-2500 EUR |
| AO complexe (> 200k EUR) | ~5-15 EUR | ~32-60h (~2500-5000 EUR) | ~2500-5000 EUR |

## Base de Données

### Tables Principales

```sql
-- Analyses DCE et décisions
CREATE TABLE ao_analyses (
  id                    SERIAL PRIMARY KEY,
  boamp_reference       VARCHAR(50) NOT NULL UNIQUE,
  acheteur              VARCHAR(200) NOT NULL,
  objet                 VARCHAR(500) NOT NULL,
  type_procedure        VARCHAR(30) NOT NULL,  -- 'MAPA'|'AO_OUVERT'|'AO_RESTREINT'|'MARCHE_NEGOCIE'
  montant_estime        NUMERIC(12,2),
  date_publication      DATE NOT NULL,
  date_deadline         DATE NOT NULL,
  score_qualification   INTEGER,               -- 0-100, calculé par 9b
  decision              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (decision IN ('PENDING','GO','RECOMMANDE','POSSIBLE','ECARTE')),
  raison_decision       TEXT,
  jonathan_validated_at TIMESTAMP WITH TIME ZONE,
  statut_dossier        VARCHAR(30) NOT NULL DEFAULT 'EN_ANALYSE'
    CHECK (statut_dossier IN ('EN_ANALYSE','EN_PREPARATION','DEPOSE','GAGNE','PERDU','SANS_SUITE','ARCHIVE')),
  cpv_codes             TEXT[],                -- ex: ['72212200', '72413000']
  dce_urls              JSONB,                 -- liens documents DCE téléchargés
  retroplanning         JSONB,                 -- dates clés calculées
  source_url            VARCHAR(500),
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Exigences individuelles extraites du DCE par 9a
CREATE TABLE ao_exigences (
  id                  SERIAL PRIMARY KEY,
  boamp_reference     VARCHAR(50) NOT NULL REFERENCES ao_analyses(boamp_reference),
  ref_exigence        VARCHAR(20) NOT NULL,   -- ex: 'EX-001', 'EX-002'
  source_doc          VARCHAR(30) NOT NULL,   -- 'CCTP'|'RC'|'CCAP'|'AE'
  page                INTEGER,
  texte_original      TEXT NOT NULL,
  interpretation      TEXT,                   -- Analyse Claude
  type_exigence       VARCHAR(30),           -- 'technique'|'administrative'|'qualitative'|'eliminatoire'
  reponse_memoire     TEXT,                   -- Réponse de 9e dans le mémoire
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Questions posées à l'acheteur
CREATE TABLE ao_questions_acheteur (
  id                  SERIAL PRIMARY KEY,
  boamp_reference     VARCHAR(50) NOT NULL REFERENCES ao_analyses(boamp_reference),
  ref_question        VARCHAR(20) NOT NULL,   -- ex: 'Q-001'
  question            TEXT NOT NULL,
  categorie           VARCHAR(50),            -- 'delai'|'technique'|'budget'|'administratif'
  statut              VARCHAR(20) DEFAULT 'EN_ATTENTE',
  reponse_acheteur    TEXT,
  date_reponse        TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Alertes du moniteur post-dépôt (9g)
CREATE TABLE alertes_ao_moniteur (
  id                  SERIAL PRIMARY KEY,
  boamp_reference     VARCHAR(50) NOT NULL REFERENCES ao_analyses(boamp_reference),
  type_alerte         VARCHAR(50) NOT NULL,
    -- 'qr_publiee'|'dce_modifie'|'deadline_prolongee'|'resultat_gagne'|'resultat_perdu'|'silence_radio'
  message             TEXT NOT NULL,
  urgence             VARCHAR(10) NOT NULL CHECK (urgence IN ('CRITIQUE','HAUTE','NORMALE')),
  traite              BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Résultats et capitalisation RETEX
CREATE TABLE ao_resultats (
  id                    SERIAL PRIMARY KEY,
  boamp_reference       VARCHAR(50) NOT NULL REFERENCES ao_analyses(boamp_reference),
  resultat              VARCHAR(20) NOT NULL CHECK (resultat IN ('GAGNE','PERDU','SANS_SUITE')),
  montant_marche        NUMERIC(12,2),
  nb_candidats          INTEGER,
  rang_obtenu           INTEGER,              -- Notre rang si perdu
  score_technique       NUMERIC(5,2),
  score_financier       NUMERIC(5,2),
  titulaire_nom         VARCHAR(200),         -- Concurrent qui a gagné
  titulaire_prix        NUMERIC(12,2),
  retex                 TEXT,                 -- Retour d'expérience
  capitalisation        JSONB,               -- Données pour base de connaissances
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

### Structure fichiers `/marches-publics/`

```
/marches-publics/
├── /veille/                      ← marchés détectés par Agent 1b
├── /en-cours/
│   └── /[ref-marche]/
│       ├── fiche_marche.json     ← fiche enrichie
│       ├── decision.json         ← GO/NO-GO + retroplanning
│       ├── /dce/                 ← RC.pdf, CCTP.pdf, CCAP.pdf, AE.pdf, BPU.xlsx
│       ├── /analyse/             ← analyse_dce.json, criteres.json, questions.md
│       ├── /administratif/       ← DC1.pdf, DC2.pdf, checklist_pieces.json
│       ├── /technique/           ← memoire_technique.pdf, cv_jonathan.pdf, cv_marty.pdf
│       ├── /financier/           ← BPU_rempli.xlsx, DQE.xlsx, strategie_prix.json
│       ├── /qa/                  ← rapport_controle.json, corrections.json
│       └── /depot/
│           ├── 01_candidature/
│           ├── 02_offre_technique/
│           └── 03_offre_financiere/
├── /references/                  ← profil_axiom.json, references_clients.json, cv_jonathan.json
├── /templates/                   ← memoire_technique_template.md, DC1/DC2 pré-remplis
├── /historique/                  ← résultats.json, retex.md par marché passé
└── /stats/                       ← dashboard.json, historique_scores.json
```

## Scheduling

| Trigger | Action | Sous-agent |
|---------|--------|------------|
| BullMQ `ao-pipeline` (événementiel) | `analyserDCE(lead)` | 9a → 9b |
| Notification Slack Jonathan (événementiel) | `attendreDecisionGO()` | 9b |
| Après validation GO Jonathan | `lancerParallele()` | 9c + 9d + 9e simultanément |
| Après 9c + 9d + 9e complétés | `controleQA()` | 9f |
| Après rapport QA GO + validation Jonathan | `deposerDossier()` | — |
| `0 8 * * *` (cron quotidien) | `surveillerPlateforme()` | 9g |
| `0 8 * * *` (cron quotidien) | `verifierValiditesDocuments()` | 9c (attestations URSSAF, Kbis) |
| J+10 après dépôt sans résultat | `relancerAcheteur()` | 9g |
| J+30 après dépôt avec résultat négatif | `genererRETEX()` | 9g |

## Error Handling

| Erreur | Action | Fallback |
|--------|--------|----------|
| DCE inaccessible (plateforme down) | Retry toutes les 2h pendant 48h | Alerter Jonathan Slack HAUTE si toujours inaccessible J-15 |
| Claude API timeout lors analyse DCE > 100 pages | Découper en chunks de 50 pages, analyser par chunks | Log `dce_chunked_analysis` |
| Score GO/NO-GO calculé mais Jonathan ne répond pas | Relance Slack à J+1 et J+2 | Si pas de réponse J+3 : escalade email Jonathan |
| Attestation URSSAF expirée détectée en J-5 | Alerte CRITIQUE Jonathan | Bloquer le dépôt jusqu'à renouvellement |
| Mémoire technique score anti-détection > 20% | Remettre à 9e pour réécriture avec davantage de paraphrase | Max 2 tentatives, puis Jonathan complète manuellement |
| Plateforme de dépôt hors ligne à J-1 | Alerter Jonathan IMMÉDIATEMENT + contacter acheteur pour signalement | Dépôt par email si la procédure le permet |
| Q/R publiée modifiant les exigences | 9a re-analyse les exigences modifiées + 9e met à jour les sections concernées | Alerte Jonathan sur l'impact |
| DCE rectificatif détecté par 9g | Re-analyser uniquement les documents modifiés | Log `dce_rectificatif_[ref]` |

## KPIs & Métriques

| KPI | Cible | Fréquence |
|-----|-------|-----------|
| Temps d'analyse par DCE (9a) | < 2 minutes (PDF < 100 pages) | Par AO |
| Taux d'extraction exigences (9a) | > 95% des exigences identifiées | Par AO |
| Précision scoring GO/NO-GO (9b) | > 80% corrélation avec résultat final | Trimestriel |
| Pièces conformes au premier passage (9c) | > 90% | Par AO |
| Écart prix vs lauréat (9d, marchés perdus) | < 20% | Trimestriel |
| Ratio IA/humain mémoire (9e) | 60/40 maximum | Par AO |
| Score anti-détection Copyleaks (9e) | < 20% "likely AI" | Par AO |
| Taux de détection erreurs QA (9f) | > 99% | Par AO |
| Temps de détection résultat (9g) | < 24h après publication | Par AO |
| **Taux de soumission** (qualifiés → déposés) | > 80% des RECOMMANDE | Mensuel |
| **Taux de succès MAPA** | > 35% | Trimestriel |
| **Taux de succès AO Ouvert** | > 20% | Trimestriel |
| **Coût moyen par réponse** | < 500 EUR (IA + humain) | Par AO |
| **Temps moyen de réponse** | < 15 jours (réception → dépôt) | Par AO |
| **ROI moyen** | > 5x (montant gagné / coût réponse) | Annuel |

**Taux de succès par type de marché :**

| Type | Taux typique | Concurrence moyenne | Temps réponse |
|------|-------------|---------------------|---------------|
| MAPA (< 90k EUR) | 35-50% | 3-8 soumissions | 5-10 jours |
| AO Ouvert (> 90k EUR) | 15-25% | 15-30 soumissions | 20-40 jours |
| AO Restreint | 40-60% | 5-12 candidats | 15-30 jours |
| Marché reconduction | 60-80% | 2-4 concurrents | 10-20 jours |

## Données Axiom (profil entreprise pour les formulaires)

Données stables à copier tel quel dans chaque formulaire DC1/DC2/DUME :

```
Dénomination       : UNIVILE SAS
Nom commercial     : Axiom Marketing
SIRET              : 891 146 490 00042
TVA                : FR75891146490
APE                : 6201Z — Programmation informatique
Forme juridique    : SAS (Société par Actions Simplifiée)
Capital            : 1 670 EUR
Siège              : 62 Rue Pente Nicole, 97421 Saint-Louis, La Réunion
Pays               : France
Tél                : 0693 46 88 84
Email              : contact@axiom-marketing.io
Site               : https://www.axiom-marketing.io
Représentant       : Jonathan Dewaele, Président
RCS                : Saint-Denis de la Réunion, 891 146 490
PME                : Oui (micro-entreprise)
Date création      : Novembre 2020
```

Codes CPV principaux ciblés :
- `72212200` — Services de développement de logiciels d'application
- `72413000` — Services de conception de sites WWW (World Wide Web)
- `72222300` — Services de technologies de l'information
- `72315000` — Services de gestion de réseaux de données

## Edge Cases

- **Délai < 15 jours à la réception du lead** : Retroplanning ultra-urgent activé. 9a et 9e travaillent en simultané sans attendre la validation Jonathan du scoring 9b. Jonathan est alerté immédiatement
- **AO demandant du DUME plutôt que DC1/DC2** : Le sous-agent 9c génère automatiquement le DUME selon le guide `GUIDE-DUME-UNIVILE.md`. Vérification de la plateforme ESPD pour la soumission en ligne
- **Marché comportant un critère RSE** : Flag détecté par 9a → 9e injecte automatiquement la section `FICHE-RSE-AXIOM.md` en annexe du mémoire
- **DCE avec > 100 pages** : 9a utilise le module `chunking.ts` pour découper et analyser par sections. Chaque chunk est analysé indépendamment puis consolidé
- **Marché avec clause d'allotissement** : Chaque lot est traité comme un AO indépendant avec son propre dossier, son propre scoring 9b et son propre mémoire
- **Marchés reconduction (titulaire sortant identifié)** : 9b booste le score concurrence si Axiom était titulaire sortant (+20 pts). Si concurrent connu, le chiffrage 9d s'aligne 5-10% sous son prix estimé
- **Attestations fiscales ou URSSAF expirées** : 9c détecte les dates de validité et déclenche une alerte J-30 avant expiration pour renouvellement proactif

## Budget

| Poste | Coût/mois |
|-------|-----------|
| Claude API (analyse DCE + mémoires) | ~15 EUR |
| Puppeteer (génération PDFs) | ~1 EUR |
| Infrastructure partagée (part VPS) | ~15 EUR |
| Scraping + APIs publiques BOAMP/DECP | 0 EUR |
| Slack API (notifications) | 0 EUR |
| **Total IA** | **~31 EUR/mois** |

**Note importante** : Le coût humain (Jonathan : chiffrage 9d, validation finale 9f, relecture mémoire) représente 90%+ du coût total par AO (600-5 000 EUR/AO selon complexité). Le coût IA ~31 EUR/mois ne représente que la part automatisée.

## Référence Spec

`.claude/source-ia/agent/AGENT-9-MASTER.md`
Sous-agents détaillés : `AGENT-9a-DCE.md`, `AGENT-9b-QUALIFICATEUR.md`, `AGENT-9c-JURISTE.md`, `AGENT-9d-CHIFFREUR.md`, `AGENT-9e-REDACTEUR-MEMOIRE.md`, `AGENT-9f-CONTROLEUR-QA.md`, `AGENT-9g-MONITEUR.md`
