# GUIDE D'UTILISATION — SYSTEME DE PROSPECTION 10 AGENTS AXIOM

**Version** : 2.0 | **Date** : 19 mars 2026
**Pour** : Jonathan Dewaele, Marty Wong, equipe technique Axiom
**A lire avec** : Les 10 fichiers MASTER + 39 fichiers sous-agents (voir section 12)

---

## TABLE DES MATIERES

1. [Vue d'ensemble du systeme](#1-vue-densemble)
2. [Le flux complet en 10 etapes](#2-le-flux-complet-en-10-etapes)
3. [Ce que fait chaque agent — resume actionnable](#3-ce-que-fait-chaque-agent)
4. [Parcours d'un prospect reel — 2 exemples complets](#4-parcours-dun-prospect-reel)
5. [Ce que Jonathan et Marty font chaque jour](#5-ce-que-jonathan-et-marty-font)
6. [Demarrage du systeme — mise en route](#6-demarrage-du-systeme)
7. [Operations quotidiennes](#7-operations-quotidiennes)
8. [Comprendre les notifications](#8-comprendre-les-notifications)
9. [Comprendre les rapports](#9-comprendre-les-rapports)
10. [Que faire quand...](#10-que-faire-quand)
11. [Les 5 segments](#11-les-5-segments)
12. [Architecture des fichiers](#12-architecture-des-fichiers)
13. [Cout et ROI](#13-cout-et-roi)
14. [Glossaire](#14-glossaire)

---

## 1. VUE D'ENSEMBLE

### Qu'est-ce que ce systeme ?

Un pipeline commercial **complet** compose de 10 agents IA et 39 sous-agents qui couvrent l'integralite du cycle de vie client :

1. **Trouver** des prospects (entreprises qui ont besoin des services Axiom)
2. **Qualifier** ces prospects (sont-ils un bon fit ? budget ? timing ?)
3. **Contacter** ces prospects (email + LinkedIn personnalise)
4. **Suivre** les reponses et relancer automatiquement
5. **Entretenir** la relation avec ceux qui ne sont pas prets maintenant
6. **Mesurer** tout et optimiser en continu
7. **Closer** les deals (devis, relance, signature electronique)
8. **Repondre aux appels d'offres** (analyse DCE, memoire technique, depot)
9. **Fideliser** les clients (onboarding, satisfaction, upsell, referral)

### Les 3 phases du systeme

```
╔═══════════════════════════════════════════════════════════════════════╗
║                     PHASE 1 — PROSPECTION                            ║
║                     Agents 1 → 2 → 3 → 4 → 5                        ║
║                                                                       ║
║  Detecter → Enrichir → Scorer → Rediger → Envoyer + Relancer        ║
╠═══════════════════════════════════════════════════════════════════════╣
║                     PHASE 2 — CLOSING                                ║
║                     Agents 6, 7, 8                                    ║
║                                                                       ║
║  Nurturer les non-convertis → Analyser la performance →              ║
║  Closer les deals (devis → signature)                                ║
╠═══════════════════════════════════════════════════════════════════════╣
║                     PHASE 3 — POST-VENTE                             ║
║                     Agents 9, 10                                      ║
║                                                                       ║
║  Repondre aux appels d'offres → Fideliser les clients                ║
║  (onboarding → satisfaction → upsell → avis → referral)             ║
╚═══════════════════════════════════════════════════════════════════════╝
```

### Ce que le systeme fait tout seul vs ce que Jonathan/Marty font

```
╔═══════════════════════════════════════════════════════════════════════╗
║  CE QUE LE SYSTEME FAIT TOUT SEUL (24h/24, 7j/7) :                  ║
║                                                                       ║
║  PROSPECTION :                                                        ║
║  + Detecter des prospects (LinkedIn, BOAMP, sites, jobs)             ║
║  + Enrichir les fiches (email, SIRET, CA, stack technique)           ║
║  + Scorer et classifier (HOT / WARM / COLD)                         ║
║  + Ecrire les messages personnalises (email + LinkedIn)              ║
║  + Envoyer les messages et relancer automatiquement                  ║
║  + Classifier les reponses (interesse / pas maintenant / non)        ║
║  + Entretenir la relation long terme (nurture)                       ║
║                                                                       ║
║  CLOSING :                                                            ║
║  + Generer les devis personnalises (Bronze/Silver/Gold)              ║
║  + Relancer intelligemment post-devis (J3/J7/J14)                   ║
║  + Gerer la signature electronique (Yousign)                         ║
║  + Transferer les deals perdus en nurture                            ║
║                                                                       ║
║  APPELS D'OFFRES :                                                    ║
║  + Analyser les DCE automatiquement (CCTP, RC, CCAP)                ║
║  + Scorer GO/NO-GO et recommander                                    ║
║  + Preparer le dossier admin, chiffrage, memoire technique           ║
║  + Controler la qualite avant depot                                  ║
║                                                                       ║
║  POST-VENTE :                                                         ║
║  + Onboarding automatise (welcome sequence J1-J30)                   ║
║  + Health Score composite (engagement + satisfaction + croissance)    ║
║  + Detection churn 60-90 jours avant                                 ║
║  + Propositions upsell/cross-sell intelligentes                      ║
║  + Collecte d'avis sur 5 plateformes                                 ║
║  + Programme referral automatise                                     ║
║                                                                       ║
║  TRANSVERSE :                                                         ║
║  + Mesurer KPIs et generer rapports (quotidien/hebdo/mensuel)        ║
║  + Detecter anomalies et recommander des ajustements                 ║
╚═══════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════╗
║  CE QUE JONATHAN FAIT (~1h/jour) :                                   ║
║                                                                       ║
║  1. Valider les messages HOT avant envoi (~5 min)                    ║
║     → Notification Slack avec bouton "Approuver"                     ║
║                                                                       ║
║  2. Repondre aux prospects interesses (~10 min)                      ║
║     → Notification Slack quand quelqu'un repond positivement         ║
║                                                                       ║
║  3. Prendre les appels decouverte (~30 min)                          ║
║     → Le systeme planifie le RDV, Jonathan le prend                  ║
║                                                                       ║
║  4. Valider les devis Agent 8 avant envoi (~5 min)                   ║
║     → Notification Slack avec resume du devis                        ║
║                                                                       ║
║  5. Decision GO/NO-GO appels d'offres Agent 9 (~10 min)             ║
║     → Notification Slack avec score + recommandation                 ║
║                                                                       ║
║  6. Lire le rapport quotidien (~2 min)                               ║
║     → Digest Slack a 22h : chiffres cles du jour                     ║
╚═══════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════╗
║  CE QUE MARTY FAIT (~30 min/jour) :                                  ║
║                                                                       ║
║  1. Contenu LinkedIn pour le profil Jonathan (~15 min)               ║
║     → 3-5 posts par semaine                                         ║
║                                                                       ║
║  2. Contenu blog et nurture (~15 min)                                ║
║     → Articles, cas clients, emails nurture                         ║
╚═══════════════════════════════════════════════════════════════════════╝
```

### Le schema global des 10 agents

```
SOURCES                PHASE 1 — PROSPECTION                          PHASE 2          PHASE 3
═══════                ═══════════════════════                         ════════         ════════

LinkedIn ─────┐
BOAMP ────────┤
Sites web ────┼── VEILLEUR ── ENRICHISSEUR ── SCOREUR ── REDACTEUR ── SUIVEUR
Job boards ───┤      1            2              3           4           5
Levees fonds ─┘                                                    ┌────┤
                                                                   │    │
                                                                   │    ├──→ Jonathan (RDV)
                                                                   │    │         │
                                                              NURTUREUR  │    DEALMAKER ──→ CSM
                                                                  6      │       8           10
                                                                  │      │       │           │
                                                              ANALYSTE   │       │       Referral
                                                                  7      │       │       → Agent 1
                                                                         │       │
                                                                  AO ←───┘   Deals perdus
                                                                  9      → Agent 6 (nurture)
```

### Schema detaille avec les 4 boucles

```
            ┌──────────── BOUCLE REFERRAL (10 → 1) ──────────────────┐
            │                                                         │
            v                                                         │
┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                   │
│  1   │→│  2   │→│  3   │→│  4   │→│  5   │                   │
│VEILL.│  │ENRICH│  │SCORE │  │REDAC.│  │SUIV. │                   │
└──────┘  └──────┘  └──┬───┘  └──────┘  └──┬───┘                   │
                        ^                    │                        │
   BOUCLE RE-SCORING    │                    ├──→ Jonathan (RDV)      │
      (6 → 3)          │                    │         │              │
                        │                    │         v              │
                   ┌────┘               ┌────┘    ┌──────┐           │
                   │                    │         │  8   │           │
              ┌──────┐             ┌──────┐       │DEAL  │           │
              │  6   │←────────────│  6   │←──────│MAKER │           │
              │NURT. │ non-conv.   │NURT. │perdu  └──┬───┘           │
              └──────┘             └──────┘    signe │               │
                                     ^               │               │
                        BOUCLE DEALS │          ┌────┘               │
                        PERDUS       │          │                    │
                        (8 → 6)      │     ┌──────┐  ┌──────┐       │
                                     │     │  9   │  │  10  │───────┘
                        BOUCLE CHURN │     │ A.O. │  │ CSM  │
                        (10 → 6)     └─────│      │  │      │
                                           └──────┘  └──────┘
                                                          │
              ┌──────┐                                    │
              │  7   │←── metriques de TOUS les agents ──┘
              │ANALY.│
              └──────┘
```

---

## 2. LE FLUX COMPLET EN 10 ETAPES

### Etape par etape, de la detection au client fidele

```
ETAPE 1 — DETECTION (Agent 1 : VEILLEUR)
════════════════════════════════════════════
Le Veilleur scanne 4 sources en permanence :
  * LinkedIn : changements de poste, recrutements, posts (1a)
  * BOAMP : nouveaux appels d'offres IT (1b)
  * Sites web : Lighthouse scan de sites lents/obsoletes (1c)
  * Job boards : offres d'emploi "dev web" (1d)

  → Deduplication et normalisation
  → Lead brut envoye dans la queue "enrichisseur-pipeline"
```

```
ETAPE 2 — ENRICHISSEMENT (Agent 2 : ENRICHISSEUR)
═══════════════════════════════════════════════════
3 sous-agents tournent EN PARALLELE :
  [2a] CONTACT : Cherche l'email du decideur
       Waterfall : Dropcontact → Hunter.io → Pattern matching → SMTP check
  [2b] ENTREPRISE : Cherche les donnees financieres
       Waterfall : API INSEE → Pappers → BODACC
  [2c] TECHNIQUE : Scanne le site web
       Outils : Lighthouse + Wappalyzer + axe-core

  → Fusion en une FICHE PROSPECT ENRICHIE (~100 champs)
  → Envoyee dans la queue "scoreur-pipeline"
```

```
ETAPE 3 — SCORING (Agent 3 : SCOREUR)
═══════════════════════════════════════
Score 0-100 sur 4 axes :
  Axe 1 — ICP Fit (35 pts max) : taille, secteur, localisation, decideur
  Axe 2 — Signaux (30 pts max) : force et fraicheur des signaux
  Axe 3 — Technique (20 pts max) : performance site, stack, accessibilite
  Axe 4 — Engagement (15 pts max) : canaux trouves, interactions passees

  CATEGORISATION :
    HOT (75-100) → Contact immediat, validation Jonathan
    WARM (50-74) → Sequence automatique
    COLD (25-49) → Nurture long terme
    DISQUALIFIE (0-24) → Archive

  → Fiche scoree envoyee dans la queue "redacteur-pipeline"
```

```
ETAPE 4 — REDACTION (Agent 4 : REDACTEUR)
═══════════════════════════════════════════
3 sous-agents :
  [4a] EMAIL : Genere l'email froid personnalise via Claude API
  [4b] LINKEDIN : Genere la note de connexion + message LinkedIn
  [4c] IMPACT : Calcule les chiffres d'impact (perte CA, taux bounce...)

  Controles qualite : longueur, spam words, ton, hallucinations
  HOT → Validation Jonathan requise avant envoi
  WARM → Envoi automatique

  → Message pret envoye dans la queue "suiveur-pipeline"
```

```
ETAPE 5 — ENVOI + SUIVI (Agent 5 : SUIVEUR)
═════════════════════════════════════════════
4 sous-agents :
  [5a] EMAIL : Envoi Gmail API, tracking opens/clicks, gestion bounces
  [5b] LINKEDIN : Connexions + messages via Waalaxy, likes/comments
  [5c] REPONSES : Detecte et classifie les reponses (Claude API)
  [5d] SEQUENCES : Orchestre les sequences multicanales (4-6 touches)

  SCENARIO A — Reponse positive :
    → Classification "INTERESSE" → Sequence STOPPEE
    → Notification Slack Jonathan → RDV decouverte
    → Transfert vers Agent 8 (DEALMAKER)

  SCENARIO B — Pas de reponse :
    → Sequence terminee → Transfert vers Agent 6 (NURTUREUR)

  SCENARIO C — "Pas maintenant" :
    → Sequence STOPPEE → Transfert vers Agent 6 (NURTUREUR)
```

```
ETAPE 6 — NURTURE (Agent 6 : NURTUREUR)
════════════════════════════════════════════
3 sous-agents :
  [6a] EMAIL NURTURE : Emails de valeur (cas clients, articles, webinaires)
  [6b] LINKEDIN PASSIF : Likes, comments sur posts des prospects
  [6c] RE-SCOREUR : Re-scoring mensuel + reclassification

  Objectif : Transformer COLD/WARM en HOT via nurturing patient
  Duree : 3 a 12 mois
  Frequence : 1-2 emails/mois, engagement LinkedIn hebdomadaire

  → Si engagement suffisant : renvoi vers Agent 3 (BOUCLE RE-SCORING)
  → Si 6 mois sans interaction : sunset policy (archive)
```

```
ETAPE 7 — ANALYSE (Agent 7 : ANALYSTE)
════════════════════════════════════════════
4 sous-agents :
  [7a] COLLECTEUR : Requetes SQL sur TOUTES les tables du pipeline
  [7b] RAPPORTS : Digest quotidien, rapport hebdo, rapport mensuel
  [7c] ANOMALIES : Z-score, seuils, moving averages, alertes Slack
  [7d] RECOMMANDEUR : Ajustements concrets pour chaque agent

  Tourne en continu. Produit :
  * Digest quotidien (22h)
  * Rapport hebdomadaire (dimanche)
  * Rapport mensuel (1er du mois)
  * Alertes temps reel si anomalie
  * Recommandations d'optimisation → validation Jonathan
```

```
ETAPE 8 — CLOSING (Agent 8 : DEALMAKER)
════════════════════════════════════════════
3 sous-agents :
  [8a] DEVIS : Genere le devis personnalise (tiering Bronze/Silver/Gold)
  [8b] RELANCES : Sequences post-devis J3/J7/J14, detection signaux achat
  [8c] SIGNATURE : Contrat + e-signature Yousign V3

  Pipeline CRM 7 etapes :
  QUALIFICATION → PROPOSITION → NEGOCIATION → ENGAGEMENT VERBAL →
  CONTRAT ENVOYE → SIGNE → PERDU

  → Deal signe → Transfert vers Agent 10 (CSM)
  → Deal perdu → Transfert vers Agent 6 (BOUCLE DEALS PERDUS)
  → Metriques → Agent 7 (ANALYSTE)
```

```
ETAPE 9 — APPELS D'OFFRES (Agent 9 : AO)
═══════════════════════════════════════════
7 sous-agents :
  [9a] ANALYSEUR DCE : Analyse CCTP, RC, CCAP, extrait exigences
  [9b] QUALIFICATEUR : Score GO/NO-GO + recommandation Jonathan
  [9c] JURISTE : Dossier administratif (DC1/DC2/DUME, attestations)
  [9d] CHIFFREUR : Offre financiere (BPU/DQE/DPGF)
  [9e] REDACTEUR MEMOIRE : Memoire technique personnalise
  [9f] CONTROLEUR QA : Verification complete avant depot
  [9g] MONITEUR : Suivi post-depot, capitalisation RETEX

  Workflow : J-31 (detection) → J-2 (depot) → J+30 (resultat)
  9a → 9b → [9c + 9d + 9e en parallele] → 9f → DEPOT → 9g

  → Marche gagne → Agent 10 (CSM) pour onboarding
  → Marche perdu → RETEX + capitalisation
```

```
ETAPE 10 — FIDELISATION (Agent 10 : CSM)
══════════════════════════════════════════
5 sous-agents :
  [10a] ONBOARDING : Welcome sequence J1-J30, kick-off, collecte acces
  [10b] UPSELL : Detection signaux, scoring opportunite, proposition
  [10c] SATISFACTION : Health Score composite, NPS/CSAT, detection churn
  [10d] AVIS : Collecte avis 5 plateformes (Google, Trustpilot, Clutch...)
  [10e] REFERRAL : Programme ambassadeur, tracking, commissions

  Health Score (0-100) = Engagement (40%) + Satisfaction (30%) + Croissance (30%)

  → Referral recu → Transfert vers Agent 1 (BOUCLE REFERRAL)
  → Client a risque (churn) → Agent 6 (BOUCLE CHURN)
  → Opportunite upsell → Agent 8 (BOUCLE UPSELL)
  → Metriques → Agent 7 (ANALYSTE)
```

### Schema ASCII complet du flux avec les 4 boucles

```
   DETECTION        ENRICHIR         SCORER          REDIGER          ENVOYER
      1                2               3                4               5
  ┌────────┐      ┌────────┐      ┌────────┐      ┌────────┐      ┌────────┐
  │LinkedIn│      │Contact │      │ICP Fit │      │Email   │      │Envoi   │
  │BOAMP   │─────→│Entrep. │─────→│Signaux │─────→│LinkedIn│─────→│Sequence│
  │Web     │      │Tech    │      │Tech    │      │Impact  │      │Reponses│
  │Jobs    │      │        │      │Engagem.│      │        │      │Notifs  │
  └────────┘      └────────┘      └───┬────┘      └────────┘      └───┬────┘
       ^                              ^                                │
       │                              │                ┌───────────────┤
       │          BOUCLE              │                │               │
       │        RE-SCORING            │                v               v
       │          (6→3)               │          ┌────────┐     Jonathan
       │                              │          │NURTURE │     (RDV decouverte)
       │                         ┌────┘          │   6    │          │
       │                         │               │Email   │          v
       │                         └───────────────│LinkedIn│     ┌────────┐
       │                                         │ReScoreu│     │CLOSING │
       │                                         └────┬───┘     │   8    │
       │                                              ^         │Devis   │
       │                                              │         │Relance │
       │                            BOUCLE DEALS      │         │Signat. │
       │                            PERDUS (8→6)      │         └───┬────┘
       │                                              │         ┌───┘ └───┐
       │                                              │         │         │
       │   ┌────────┐      ┌────────┐                 │         v         v
       │   │A.O.    │      │CSM     │                 │    Agent 10   Agent 6
       │   │   9    │      │  10    │           BOUCLE│    (signe)    (perdu)
       │   │DCE     │      │Onboard │           CHURN │
       │   │Qualif. │      │Upsell  │──→Agent 8 (10→6)│
       │   │Chiffr. │      │Satisf. │                 │
       │   │Memoire │      │Avis    │─────────────────┘
       │   │QA      │      │Referral│
       │   │Monitor │      │        │        ┌────────┐
       │   └────────┘      └───┬────┘        │ANALYSE │
       │                       │             │   7    │
       │    BOUCLE REFERRAL    │             │Collect.│
       └───────────────────────┘             │Rapport │
              (10→1)                         │Anomali.│
                                             │Recomm. │
                                             └────────┘
                                        (metriques de tous)
```

---

## 3. CE QUE FAIT CHAQUE AGENT — RESUME

### Tableau synoptique des 10 agents

| # | Agent | Mission (1 ligne) | Quand il tourne | Input | Output | Sous-agents | Cout/mois |
|---|-------|-------------------|-----------------|-------|--------|-------------|-----------|
| **1** | **VEILLEUR** | Detecte les signaux et leads sur 4 sources | 24h/24 (cron 4x/jour) | Rien (il scrape) | Lead brut normalise | 1a LinkedIn, 1b Marches, 1c Web, 1d Jobs | 430 EUR |
| **2** | **ENRICHISSEUR** | Complete les fiches avec email, SIRET, CA, stack | A chaque nouveau lead | Lead brut | Fiche enrichie (~100 champs) | 2a Contact, 2b Entreprise, 2c Technique | 278 EUR |
| **3** | **SCOREUR** | Calcule score 0-100 et classe HOT/WARM/COLD | A chaque prospect enrichi | Fiche enrichie | Prospect score + routing | Aucun (+ 2 fichiers modele/calibration) | 0 EUR |
| **4** | **REDACTEUR** | Ecrit email + LinkedIn personnalise via Claude | Pour chaque HOT + WARM | Prospect score | Message pret a envoyer | 4a Email, 4b LinkedIn, 4c Impact | 12 EUR |
| **5** | **SUIVEUR** | Envoie, relance, detecte et classifie les reponses | 24h/24 (chaque heure) | Message valide | Interactions loggees | 5a Email, 5b LinkedIn, 5c Reponses, 5d Sequences | 150 EUR |
| **6** | **NURTUREUR** | Maintient la relation long terme, re-score | Pour les non-convertis | Prospects WARM/COLD | Leads rechauffes → re-scoring | 6a Email Nurture, 6b LinkedIn Passif, 6c Re-Scoreur | 37 EUR |
| **7** | **ANALYSTE** | Mesure KPIs, detecte anomalies, recommande | 24h/24 (rapports planifies) | Donnees de TOUS les agents | Rapports + alertes + recommandations | 7a Collecteur, 7b Rapports, 7c Anomalies, 7d Recommandeur | 50 EUR |
| **8** | **DEALMAKER** | Close les deals : devis, relance, signature | Quand un prospect est INTERESSE | Notes RDV Jonathan | Deal signe ou perdu | 8a Devis, 8b Relances, 8c Signature | 62 EUR |
| **9** | **APPELS D'OFFRES** | Analyse, qualifie et prepare les reponses AO | Quand un AO est detecte | Lead marche public | Dossier complet pret a deposer | 9a DCE, 9b Qualif., 9c Juriste, 9d Chiffreur, 9e Redacteur, 9f QA, 9g Moniteur | 31 EUR |
| **10** | **CSM** | Fidelise : onboarding, satisfaction, upsell, referral | Post-signature (continu) | Deal signe (Agent 8) | Clients fideles + referrals | 10a Onboarding, 10b Upsell, 10c Satisfaction, 10d Avis, 10e Referral | 125 EUR |

### Qui parle a qui — Schema des flux

```
Agent 1 ──→ Agent 2 ──→ Agent 3 ──→ Agent 4 ──→ Agent 5
VEILLEUR    ENRICHISS.   SCOREUR    REDACTEUR    SUIVEUR
  ^                        ^                       │
  │                        │                       ├──→ Jonathan (notifications + RDV)
  │                        │                       │         │
  │                   BOUCLE                       │         v
  │                 RE-SCORING                     │    Agent 8 (DEALMAKER)
  │                   (6→3)                        │         │
  │                        │                       │    ┌────┤────┐
  │                        │                       │    │    │    │
  │                   Agent 6 ←────────────────────┘    │    │    │
  │                  NURTUREUR                          │    │    │
  │                   (non-convertis + deals perdus     │    │    │
  │                    + clients churn)                  │    │    │
  │                                                     │    │    │
  │                                                     v    v    v
  │                                              Agent 10  Ag.7  Ag.6
  │                                                CSM    ANAL.  NURT.
  │                                               (signe) (metr) (perdu)
  │                                                 │
  │             BOUCLE REFERRAL (10→1)               │
  └──────────────────────────────────────────────────┘
                                                    │
                                            Agent 9 (AO)
                                            ← Agent 1b
```

### Detail des sous-agents (39 au total)

| Agent | Sous-agent | Nom | Role |
|-------|-----------|------|------|
| 1 | 1a | LinkedIn | Signaux LinkedIn (changements poste, recrutements, posts) |
| 1 | 1b | Marches Publics | Veille BOAMP, DECP, profils acheteurs |
| 1 | 1c | Veille Web | Scan Lighthouse, Wappalyzer, axe-core |
| 1 | 1d | Job Boards | Scrape WTTJ, Indeed, HelloWork, LinkedIn Jobs |
| 2 | 2a | Contact | Trouve l'email du decideur (waterfall APIs) |
| 2 | 2b | Entreprise | Donnees financieres (INSEE, Pappers, BODACC) |
| 2 | 2c | Technique | Stack technique + performance site |
| 3 | -- | *(pas de sous-agent)* | + MODELE-SCORING.md + FEEDBACK-CALIBRATION.md |
| 4 | 4a | Email | Genere l'email froid via Claude API |
| 4 | 4b | LinkedIn | Genere note connexion + message LinkedIn |
| 4 | 4c | Impact | Calcule chiffres d'impact personnalises |
| 5 | 5a | Email | Envoi Gmail API, tracking, bounces |
| 5 | 5b | LinkedIn | Connexions + messages Waalaxy |
| 5 | 5c | Reponses | Classification IA des reponses |
| 5 | 5d | Sequences | Orchestration sequences multicanales |
| 6 | 6a | Email Nurture | Emails de valeur sur la duree |
| 6 | 6b | LinkedIn Passif | Likes, comments sur posts prospects |
| 6 | 6c | Re-Scoreur | Re-scoring mensuel + reclassification |
| 7 | 7a | Collecteur | Requetes SQL sur toutes les tables |
| 7 | 7b | Rapports | Generation digest/hebdo/mensuel |
| 7 | 7c | Anomalies | Detection anomalies, alertes Slack |
| 7 | 7d | Recommandeur | Ajustements concrets par agent |
| 8 | 8a | Devis | Generation devis tiering Bronze/Silver/Gold |
| 8 | 8b | Relances | Sequences post-devis J3/J7/J14 |
| 8 | 8c | Signature | Contrat + e-signature Yousign V3 |
| 9 | 9a | Analyseur DCE | Analyse CCTP, RC, CCAP, exigences |
| 9 | 9b | Qualificateur | Score GO/NO-GO + recommandation |
| 9 | 9c | Juriste | Dossier admin (DC1, DC2, DUME) |
| 9 | 9d | Chiffreur | Offre financiere (BPU, DQE, DPGF) |
| 9 | 9e | Redacteur Memoire | Memoire technique personnalise |
| 9 | 9f | Controleur QA | Verification complete avant depot |
| 9 | 9g | Moniteur | Suivi post-depot, RETEX, capitalisation |
| 10 | 10a | Onboarding | Welcome sequence J1-J30, kick-off |
| 10 | 10b | Upsell | Detection signaux + proposition cross-sell |
| 10 | 10c | Satisfaction | Health Score, NPS/CSAT, detection churn |
| 10 | 10d | Avis | Collecte avis 5 plateformes |
| 10 | 10e | Referral | Programme ambassadeur + tracking |

---

## 4. PARCOURS D'UN PROSPECT REEL — 2 EXEMPLES COMPLETS

### Exemple 1 : PME metro detectee sur LinkedIn → traverse les 10 agents

```
JOUR 0 — DETECTION (Agent 1a : Veilleur LinkedIn)
  Signal detecte : "Sophie Martin nommee CMO chez TechCorp (120 salaries, Paris)"
  Signal secondaire : "TechCorp recrute un dev React senior (WTTJ)"
  Segment estime : pme_metro

JOUR 0 — ENRICHISSEMENT (Agent 2)
  Agent 2a (Contact) : sophie.martin@techcorp.fr (verifie, 98%)
  Agent 2b (Entreprise) : SIRET 12345678900012, CA 5.2M EUR, 120 salaries
  Agent 2c (Technique) : Lighthouse 42/100, WordPress 6.4, accessibilite 62/100

JOUR 0 — SCORING (Agent 3)
  ICP Fit : 35/35 (taille, secteur, localisation, decideur C-level)
  Signaux : 30/30 (changement poste + recrutement dev)
  Technique : 16/20 (site lent, WordPress, accessibilite moyenne)
  Engagement : 3/15 (email verifie + tel trouve)
  TOTAL : 84/100 → HOT_B
  DECISION : Contact immediat, validation Jonathan requise

JOUR 0 — REDACTION (Agent 4)
  Template : "challenger_sale_pme_metro_v3"
  Agent 4c calcule : "3.2s chargement = ~1 250 EUR/mois de conversions perdues"
  Email genere par 4a + message LinkedIn genere par 4b
  → Notification Slack a Jonathan pour validation

JOUR 0 — VALIDATION (Jonathan)
  Jonathan recoit la notification, lit l'email propose, clique "Approuver"
  → 5 min de son temps

JOUR 1 — ENVOI (Agent 5)
  Agent 5a envoie l'email a 9h14 (heure Paris, creneau optimal)
  Pixel de tracking insere, liens trackes

JOUR 3 — RELANCE (Agent 5d orchestre la sequence)
  Sophie a ouvert l'email (pixel detecte) mais n'a pas repondu
  → Agent 5b envoie connexion LinkedIn avec note personnalisee

JOUR 5 — ENGAGEMENT (Agent 5b)
  Like 2 posts LinkedIn de Sophie

JOUR 7 — RELANCE 2 (Agent 5a)
  Email relance avec cas client PME similaire
  Sophie clique le lien du cas client

JOUR 8 — REPONSE ! (Agent 5c)
  Sophie repond : "Bonjour, ca m'interesse. On peut en parler ?"
  Classification Claude : "INTERESSE" (confiance 97%)
  Sequence STOPPEE
  Notification Slack Jonathan :
  ┌──────────────────────────────────────────────┐
  │ 🎉 REPONSE POSITIVE — Sophie Martin          │
  │ Score : 84 (HOT_B) | TechCorp (Paris)        │
  │ "Bonjour, ca m'interesse. On peut en parler?" │
  │ [Repondre]  [Planifier RDV]  [Reporter]       │
  └──────────────────────────────────────────────┘

JOUR 10 — RDV DECOUVERTE (Jonathan)
  Jonathan fait l'appel decouverte (30 min)
  Sophie veut une refonte site + tracking server-side
  Budget : ~15K EUR
  → Jonathan saisit ses notes dans le formulaire Slack

JOUR 10 — CREATION DEAL (Agent 8)
  Agent 8a genere le devis personnalise :
    Option Bronze : Refonte site WordPress → 5 000 EUR
    Option Silver : Refonte + tracking server-side → 12 000 EUR
    Option Gold : Refonte + tracking + maintenance 12 mois → 18 000 EUR
  → Notification Jonathan pour validation du devis

JOUR 11 — ENVOI DEVIS (Agent 8a)
  Jonathan valide le devis Silver + Gold
  Devis PDF envoye a Sophie par email

JOUR 14 — RELANCE DEVIS (Agent 8b)
  J+3 : Email de relance "Avez-vous pu regarder le devis ?"
  Sophie repond : "On hesite entre Silver et Gold, le Gold inclut quoi exactement ?"
  → Agent 8b detecte un signal d'achat (question sur l'offre superieure)
  → Notification Jonathan : signal fort

JOUR 15 — NEGOCIATION (Jonathan + Agent 8)
  Jonathan repond avec les details du Gold
  Sophie demande un geste sur le Gold → Jonathan accorde -5%
  Agent 8b met a jour le pipeline : NEGOCIATION → ENGAGEMENT VERBAL

JOUR 18 — SIGNATURE (Agent 8c)
  Sophie accepte le Gold a 17 100 EUR
  Agent 8c genere le contrat et l'envoie via Yousign
  Sophie signe electroniquement le jour meme
  → Deal SIGNE
  → Notification Slack :
  ┌──────────────────────────────────────────────┐
  │ 🏆 DEAL SIGNE — TechCorp                     │
  │ Gold 17 100 EUR — Refonte + Tracking + Maint.│
  │ Cycle : 18 jours | Score engagement : 87     │
  └──────────────────────────────────────────────┘

JOUR 18 — TRANSFERT CSM (Agent 10)
  Agent 8c envoie le DealToCSM a l'Agent 10
  Agent 10a demarre l'onboarding :
    J+1 : Email welcome + collecte acces (hebergeur, CMS, analytics)
    J+3 : Appel kick-off 30 min (planifie automatiquement)
    J+7 : Premier livrable (audit technique detaille)

JOUR 48 — SATISFACTION (Agent 10c)
  J+30 post-signature : NPS automatise
  Sophie repond 9/10
  Health Score : 85/100 (vert)
  → Agent 10d declenche demande d'avis Google + Clutch

JOUR 60 — UPSELL (Agent 10b)
  Agent 10b detecte un signal : Sophie a visite la page "App Flutter" sur le site Axiom
  Scoring opportunite upsell : 72 → Signal fort
  → Notification Jonathan : "TechCorp potentiel upsell App Flutter"
  → Agent 8 reprend pour un nouveau deal (BOUCLE UPSELL)

JOUR 90 — REFERRAL (Agent 10e)
  Sophie est promotrice (NPS 9, Health Score 88)
  Agent 10e envoie la demande de referral :
    "Sophie, connaissez-vous d'autres entreprises qui auraient les memes besoins ?"
  Sophie recommande 2 contacts
  → Agent 10e cree les leads referral
  → Transfert vers Agent 1 pour enrichissement (BOUCLE REFERRAL 10→1)
```

### Exemple 2 : Marche public detecte sur BOAMP → traverse agents 1→9

```
JOUR 0 — DETECTION (Agent 1b : Veilleur Marches)
  AO detecte : "Refonte portail internet de la CINOR (La Reunion)"
  Reference : BOAMP-26-12345
  Procedure : MAPA
  Montant estime : 60 000 EUR
  Date limite : J+30
  Score lead : 78 → Signal Slack immediat a Jonathan

JOUR 0 — TRANSFERT AGENT 9
  L'AO a un score >= 60 → transfert automatique vers Agent 9
  Agent 9a (Analyseur DCE) telecharge les documents :
    RC.pdf, CCTP.pdf, CCAP.pdf, DPGF.xlsx, DC1-DC4, DUME
  Analyse automatique :
    Exigences techniques : React, RGAA AA, responsive, CMS
    Criteres d'evaluation : 60% technique / 40% prix
    Pieces exigees : 12 documents
    Delai execution : 4 mois
    Conditions : Visite site obligatoire

JOUR 1 — QUALIFICATION (Agent 9b)
  Score GO/NO-GO calcule :
    Adequation technique : 92/100
    Capacite a livrer : 85/100
    Rentabilite estimee : 78/100
    Risque : faible
    SCORE GLOBAL : 85 → RECOMMANDATION : GO FORT
  → Notification Slack Jonathan :
  ┌──────────────────────────────────────────────────┐
  │ 📋 APPEL D'OFFRES — Decision requise             │
  │ CINOR — Refonte portail internet                  │
  │ Budget : 60K EUR | Deadline : J+29                │
  │ Score : 85/100 | Recommandation : GO FORT         │
  │ Adequation tech 92% | Rentabilite 78%             │
  │ [GO]  [NO-GO]  [Voir details]                     │
  └──────────────────────────────────────────────────┘
  Jonathan clique GO → ~10 min de son temps

JOUR 2-15 — PREPARATION (Agents 9c + 9d + 9e EN PARALLELE)
  Agent 9c (Juriste) :
    Prepare DC1, DC2, DUME
    Collecte attestations (URSSAF, impots, assurance)
    Verifie la conformite juridique
    Statut : 12/12 pieces pretes

  Agent 9d (Chiffreur) :
    Remplit le DPGF (decomposition prix)
    Strategie prix : positionnement a 52 000 EUR
    Marge cible : 35%
    Comparaison avec marches similaires

  Agent 9e (Redacteur Memoire) :
    Genere le memoire technique (40 pages)
    Sections : Comprehension du besoin, Methodologie, Planning,
               Equipe, References, Stack technique
    Personnalise avec les mots-cles du CCTP
    Integre les references Axiom pertinentes

JOUR 16-17 — CONTROLE QUALITE (Agent 9f)
  Verification complete :
    Pieces administratives : 12/12 OK
    Coherence prix vs memoire : OK
    Reponse a chaque critere du RC : OK
    Qualite redactionnelle : OK
    RESULTAT : PRET POUR DEPOT
  → Notification Jonathan pour validation finale

JOUR 18 — VALIDATION + DEPOT
  Jonathan relit le resume (pas les 40 pages) → valide
  Depot sur la plateforme de marches publics

JOUR 18-48 — SUIVI POST-DEPOT (Agent 9g)
  Monitoring quotidien de la plateforme
  Veille sur les questions/reponses publiees
  Alerte si demande de complement

JOUR 48 — RESULTAT
  Notification receptionee par Agent 9g :
  SCENARIO A — GAGNE :
    → Signature de l'AE (Acte d'Engagement)
    → Transfert vers Agent 10 (CSM) pour onboarding
    → Metriques → Agent 7

  SCENARIO B — PERDU :
    → Demande automatique du courrier de notification (R2181-3)
    → Analyse comparative avec le laureeat
    → RETEX capitalise pour les prochains AO
    → Metriques → Agent 7
```

---

## 5. CE QUE JONATHAN ET MARTY FONT

### Planning quotidien de Jonathan (~1h/jour)

```
08h00 — MATIN (15 min)
═══════════════════════
  1. Ouvrir Slack → Canal #prospects-hot
  2. Valider les messages HOT en attente (Approuver/Modifier)     ~5 min
  3. Repondre aux prospects interesses (repondre ou planifier RDV) ~10 min

10h00-11h00 — RDV DECOUVERTE (si planifie, 30 min)
═══════════════════════════════════════════════════
  1. Prendre l'appel decouverte
  2. Saisir les notes dans le formulaire Slack apres l'appel
  → Le systeme cree automatiquement le deal dans Agent 8

12h00 — MIDI (5 min)
═════════════════════
  1. Checker Slack → nouvelles notifications
  2. Valider les devis Agent 8 en attente                          ~5 min
     → Notification Slack avec resume du devis
     → Cliquer "Envoyer" ou "Modifier"

14h00 — APRES-MIDI (10 min, si besoin)
════════════════════════════════════════
  1. Decision GO/NO-GO sur les AO detectes (Agent 9)              ~10 min
     → Notification Slack avec score + recommandation
     → Cliquer GO ou NO-GO

22h00 — RAPPORT DU JOUR (2 min)
════════════════════════════════
  Le systeme envoie le digest quotidien sur Slack
  → Lire en 2 min, noter si quelque chose est anormal

TOTAL : ~1h/jour (dont ~30 min de RDV si planifie)
```

### Planning quotidien de Marty (~30 min/jour)

```
09h00 — CONTENU (30 min)
═════════════════════════
  1. Rediger 1 post LinkedIn pour le profil Jonathan (3-5/semaine) ~15 min
  2. Preparer le contenu blog / emails nurture                     ~15 min

HEBDOMADAIRE (45 min)
═════════════════════
  1. Lire le rapport hebdomadaire de l'Analyste (Agent 7)
  2. Ajuster les templates si recommande
  3. Creer le contenu nurture du mois (emails, blog posts)
  4. Verifier les contenus generes par Agent 9e (memoires techniques) si AO en cours
```

### Recapitulatif temps par tache

| Tache | Qui | Frequence | Temps |
|-------|-----|-----------|-------|
| Valider messages HOT | Jonathan | Quotidien | ~5 min |
| Repondre aux interesses | Jonathan | Quotidien | ~10 min |
| RDV decouverte | Jonathan | 2-3x/semaine | ~30 min/RDV |
| Valider devis Agent 8 | Jonathan | Quand deal actif | ~5 min |
| Decision GO/NO-GO AO | Jonathan | Quand AO detecte | ~10 min |
| Lire rapport quotidien | Jonathan | Quotidien | ~2 min |
| Contenu LinkedIn | Marty | Quotidien | ~15 min |
| Contenu blog/nurture | Marty | Quotidien | ~15 min |

---

## 6. DEMARRAGE DU SYSTEME

### Checklist avant de lancer

```
INFRASTRUCTURE (1 jour)
  [ ] Serveur VPS commande (Scaleway ou Hetzner)
  [ ] PostgreSQL 16 installe + schema cree
  [ ] Redis installe (pour BullMQ)
  [ ] n8n installe (orchestration)
  [ ] Node.js 22+ installe (AdonisJS)

COMPTES & APIS (1 jour)
  [ ] API INSEE Sirene : token obtenu
  [ ] API Pappers : compte cree (100 credits gratuits)
  [ ] BOAMP : alertes configurees
  [ ] Dropcontact : compte cree + API key
  [ ] Hunter.io : compte cree + API key
  [ ] ZeroBounce : compte cree + API key
  [ ] Claude API : cle obtenue (Anthropic)
  [ ] Gmail : OAuth2 configure pour envoi programmatique
  [ ] Slack : App creee + webhook configure
  [ ] LinkedIn Sales Navigator : abonnement actif
  [ ] Waalaxy : compte cree
  [ ] Yousign : compte V3 cree + API key (pour Agent 8)
  [ ] Metabase : instance self-hosted configuree (pour Agent 7)

DOMAINES EMAIL (1 semaine)
  [ ] 3 domaines achetes (axiom-marketing.fr, axiom-studio.fr, axiom-dev.fr)
  [ ] SPF configure sur chaque domaine
  [ ] DKIM configure sur chaque domaine
  [ ] DMARC configure (mode "none" au debut)
  [ ] Warmup demarre (6 semaines avant envoi reel)

CONTENU (2-3 jours)
  [ ] 35 templates de messages rediges (specs Agent 4)
  [ ] 5 cas clients prepares (1 par segment)
  [ ] 10 articles blog publies (pour le nurturing Agent 6)
  [ ] Profil LinkedIn Jonathan optimise
  [ ] Page Calendly configuree
  [ ] Tiering devis configure (Bronze/Silver/Gold pour Agent 8)
  [ ] Profil entreprise Axiom renseigne (pour Agent 9 : references, stack, certifications)
  [ ] Modeles contrats prepares (pour Agent 8c Yousign)

DONNEES (1 jour)
  [ ] Liste initiale de 200-300 prospects importee
  [ ] Blocklist configuree (concurrents, clients existants)
  [ ] Segments configures (pme_metro, ecommerce_shopify, collectivite, startup, agence_wl)
  [ ] Matrice cross-sell Axiom renseignee (pour Agent 10b)
  [ ] Programme referral defini (commissions, conditions, pour Agent 10e)
```

### Ordre de lancement en 10 semaines

```
SEMAINE 1-2 : Fondations
══════════════════════════
  Lancer Agent 3 (SCOREUR) + Agent 7 (ANALYSTE)
  → Les plus simples, pas d'API externe pour Agent 3
  → Importer 50 prospects manuellement, verifier le scoring
  → Agent 7 commence a collecter les metriques

SEMAINE 3 : Detection + Enrichissement
════════════════════════════════════════
  Lancer Agent 1c (VEILLEUR Web) + Agent 2 (ENRICHISSEUR)
  → Scanner 100 sites, enrichir, scorer
  → Verifier la qualite des fiches enrichies

SEMAINE 4 : Redaction en mode test
═════════════════════════════════════
  Lancer Agent 4 (REDACTEUR) + Agent 5 (SUIVEUR) en mode TEST
  → Generer les messages mais NE PAS envoyer
  → Jonathan valide 20 messages manuellement
  → Verifier la qualite, ajuster les templates

SEMAINE 5 : Envoi en production
════════════════════════════════
  Lancer Agent 5 (SUIVEUR) en mode PRODUCTION
  → Commencer a envoyer 10 emails/jour (warmup)
  → Augmenter progressivement (20, 30, 50/jour)

SEMAINE 6 : Toutes les sources actives
═══════════════════════════════════════
  Lancer Agent 1a (LinkedIn) + Agent 1b (Marches) + Agent 1d (Jobs)
  → Toutes les sources de detection actives

SEMAINE 7 : Nurture + Closing
═════════════════════════════
  Lancer Agent 6 (NURTUREUR)
  → Les premiers prospects non-convertis commencent a arriver

  Lancer Agent 8 (DEALMAKER)
  → Les premiers RDV decouverte sont faits
  → Tester le flux devis → relance → signature

SEMAINE 8 : Appels d'offres
═══════════════════════════
  Lancer Agent 9 (APPELS D'OFFRES)
  → Agent 1b detecte deja des AO
  → Tester sur 1-2 AO non critiques
  → Verifier la qualite du memoire technique genere

SEMAINE 9-10 : Post-vente
═════════════════════════
  Lancer Agent 10 (CSM)
  → Les premiers deals sont signes
  → Tester l'onboarding sur les 2-3 premiers clients
  → Activer le programme referral
  → Activer la collecte d'avis
```

---

## 7. OPERATIONS QUOTIDIENNES

### Ce qui tourne automatiquement

| Heure (Reunion UTC+4) | Agent | Action |
|----------------------|-------|--------|
| 02:00 | Agent 1c | Scan Lighthouse de 200-500 sites |
| 06:00 | Agent 1b + 1d | Verification BOAMP (1ere passe) + Scan job boards |
| 07:00 | Agent 1a | Passe 1/4 signaux LinkedIn |
| 08:00 | Agent 1 Master | Dedup + Normalisation batch 1 |
| 08:00-10:00 | Agent 5a | Envoi emails (creneau optimal metro) |
| 09:00-11:00 | Agent 5b | Actions LinkedIn (creneau optimal) |
| 12:00 | Agent 1a | Passe 2/4 signaux LinkedIn |
| 12:00 | Agent 7a | Collecte metriques mi-journee |
| 14:00 | Agent 1b | Verification BOAMP (2eme passe) |
| 14:00-16:00 | Agent 5a | 2eme creneau envoi emails |
| 15:00 | Agent 1 Master | Dedup + Normalisation batch 2 |
| 18:00 | Agent 1a | Passe 3/4 signaux LinkedIn |
| 21:00 | Agent 1 Master | Dedup + Normalisation batch 3 |
| 22:00 | Agent 7b | Rapport quotidien → Slack |
| 23:00 | Agent 1a | Passe 4/4 signaux LinkedIn |
| 23:00 | Agent 6c | Re-scoring mensuel (1er du mois uniquement) |
| 23:30 | Agent 1 Master | Rapport quotidien + metriques veilleur |
| Continu | Agent 5c | Detection reponses (polling chaque minute) |
| Continu | Agent 2 | Enrichissement des leads en queue |
| Continu | Agent 3 | Scoring des prospects enrichis |
| Continu | Agent 4 | Redaction des messages |
| Continu | Agent 8 | Suivi pipeline deals (relances selon J+) |
| Continu | Agent 9 | Suivi AO en cours (deadlines, QA) |
| Continu | Agent 10 | Suivi clients (health score, onboarding) |

### Monitoring

Le systeme surveille sa propre sante :

```
CHECKS AUTOMATIQUES (toutes les 5 min) :
  + PostgreSQL accessible
  + Redis accessible
  + Gmail API fonctionnelle
  + Queues BullMQ actives (pas de jobs bloques)
  + Aucun agent crashe
  + API Claude fonctionnelle
  + Yousign API fonctionnelle

ALERTES AUTOMATIQUES (Slack #ops) :
  Queue enrichisseur bloquee > 50 jobs → verifier API Dropcontact
  Bounce rate > 3% → verifier domaine email
  LinkedIn restriction detectee → pause Waalaxy 48h
  Taux reponse < 3% sur 7 jours → verifier templates
  Pipeline deals bloque > 30 jours → alerter Jonathan
  Health Score client < 30 → intervention urgente Jonathan
  AO deadline < 5 jours + dossier non pret → alerte critique
  Agent crashe → redemarrage automatique + alerte
```

---

## 8. COMPRENDRE LES NOTIFICATIONS

### Types de notifications Slack

| Emoji | Canal | Signification | Action requise | Agent source |
|-------|-------|---------------|----------------|-------------|
| 🔥 | #prospects-hot | Message HOT a valider | Cliquer Approuver/Modifier/Rejeter | Agent 4 |
| 🎉 | #prospects-hot | Reponse positive recue | Repondre au prospect dans l'heure | Agent 5c |
| 💬 | #prospects-hot | Prospect demande info | Jonathan repond manuellement | Agent 5c |
| ⏰ | #prospects-hot | Rappel : validation en attente > 2h | Valider le message | Agent 5 |
| 📋 | #deals | AO detecte — decision GO/NO-GO | Cliquer GO ou NO-GO | Agent 9b |
| 💰 | #deals | Devis pret a valider | Verifier et envoyer | Agent 8a |
| 🔔 | #deals | Signal d'achat detecte post-devis | Contacter le prospect | Agent 8b |
| 🏆 | #deals | Deal signe ! | Celebrer + preparer le projet | Agent 8c |
| ❌ | #deals | Deal perdu | Lire la raison, rien a faire | Agent 8b |
| 📊 | #rapports | Digest quotidien (22h) | Lire (2 min) | Agent 7b |
| 📈 | #rapports | Rapport hebdomadaire (dimanche) | Lire + noter les recommandations | Agent 7b |
| 🏗️ | #clients | Onboarding demarre | Preparer le kick-off | Agent 10a |
| 😊 | #clients | NPS recu (score 9-10) | Rien (avis auto-demande) | Agent 10c |
| 😐 | #clients | NPS moyen (score 7-8) | Appeler le client | Agent 10c |
| 😞 | #clients | NPS faible (score 0-6) | Action immediate | Agent 10c |
| 🔴 | #clients | Health Score client < 30 (churn) | Intervention urgente Jonathan | Agent 10c |
| 🎁 | #clients | Referral recu | Rien (auto-traite par Agent 1) | Agent 10e |
| 🛒 | #clients | Opportunite upsell detectee | Planifier une conversation | Agent 10b |
| ⚠️ | #ops | Anomalie detectee | Verifier si action necessaire | Agent 7c |
| 🔴 | #ops | Erreur critique | Action immediate requise | Agent 7c |

---

## 9. COMPRENDRE LES RAPPORTS

### Rapport quotidien (22h, Slack, 8 lignes)

```
📊 DIGEST — Mardi 19 mars 2026

  PROSPECTION :
  Leads detectes : 42 (+8 vs hier) | Emails envoyes : 18 | Ouverts : 7 (39%)
  Reponses : 2 (1 interesse, 1 pas maintenant) | LinkedIn : 12 connexions, 3 acceptees

  CLOSING :
  Deals actifs : 4 | Devis envoyes : 1 | Signatures : 0 | Pipeline : 85K EUR

  POST-VENTE :
  Clients actifs : 8 | Health Score moyen : 78 | NPS moyen : 8.4 | Referrals : 0

  RDV : 1 planifie demain (Sophie Martin, TechCorp, 10h)
```

### Rapport hebdomadaire (dimanche, Slack + email, 1 page)

```
📈 RAPPORT SEMAINE 12 — 11-17 mars 2026

FUNNEL PROSPECTION :
  Leads detectes     : 285
  Prospects enrichis : 256 (90%)
  HOT                : 12 (5%)
  WARM               : 78 (30%)
  COLD               : 112 (44%)
  DISQUALIFIES       : 54 (21%)

OUTREACH :
  Emails envoyes     : 89
  Taux ouverture     : 32%
  Taux reponse       : 8.9%
  Reponses positives : 4
  RDV pris           : 2

CLOSING (Agent 8) :
  Deals en cours     : 6
  Devis envoyes      : 3
  Deals signes       : 1 (TechCorp, 17.1K EUR)
  Deals perdus       : 1 (raison : budget)
  Pipeline actif     : 142K EUR
  Taux conversion    : 33% (devis → signature)

APPELS D'OFFRES (Agent 9) :
  AO detectes        : 5
  AO qualifies GO    : 2
  Dossiers en cours  : 1 (CINOR — deadline J+12)
  Resultats          : 0 (en attente)

POST-VENTE (Agent 10) :
  Clients actifs     : 8
  Health Score moyen : 78
  Clients a risque   : 1 (Health Score 45 — suivi en cours)
  NPS moyen          : 8.4
  Avis collectes     : 2 (Google 5*, Clutch 4.8*)
  Referrals          : 1 (en cours d'enrichissement)
  Upsells detectes   : 1 (TechCorp — App Flutter)

TOP TEMPLATES :
  1. challenger_sale_pme_metro_v3 → 14.3% reponse
  2. tracking_roi_v1 → 12.1% reponse
  3. whitelabel_v1 → 1.2% reponse → A REVOIR

RECOMMANDATIONS :
  1. Desactiver template whitelabel_v1 (sous-performe)
  2. Augmenter le poids du signal "recrutement dev" dans le scoring
  3. Client BoutiqueShop (Health Score 45) : planifier appel cette semaine
  4. Segment collectivite : aucun lead → ajouter mots-cles BOAMP
```

### Rapport mensuel (1er du mois, email, 3 pages)

```
📊 RAPPORT MENSUEL — Mars 2026

RESULTATS GLOBAUX :
  Revenue genere     : 62 100 EUR (3 deals + 1 AO)
  Deals signes       : 3 (17.1K + 25K + 990 EUR recurrent)
  AO gagnes          : 1 (60K EUR — execution en cours)
  CAC moyen          : 293 EUR
  LTV:CAC            : 5.1x

FUNNEL COMPLET :
  Leads detectes     : 1 240
  Prospects enrichis : 1 116
  HOT                : 62
  Emails envoyes     : 380
  Reponses positives : 19
  RDV                : 10
  Devis envoyes      : 7
  Deals signes       : 3
  AO deposes         : 2 (1 gagne, 1 en attente)

RETENTION CLIENTS :
  Clients actifs     : 11
  Churn              : 0
  NPS moyen          : 8.2
  Avis collectes     : 5 (moyenne 4.7/5)
  Referrals generes  : 2 (1 converti en deal)
  Revenue upsell     : 4 500 EUR

COUT SYSTEME :
  Outils + APIs      : 1 175 EUR
  ROI                : 52x (62K / 1.175K)

CALIBRATION SCORING :
  Precision HOT      : 81% (objectif 75%)
  Faux positifs      : 19% → ajuster seuil a 78 au lieu de 75

PREVISIONS :
  Pipeline 30 jours  : 95K EUR (coverage 2.5x)
  Pipeline 60 jours  : 160K EUR
  Deals prevus M+1   : 4-6
  AO en attente      : 1 (resultat prevu semaine 14)
```

---

## 10. QUE FAIRE QUAND...

### 1. Un prospect repond "interesse" → Agent 8

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 5c classifie la reponse : "INTERESSE"
  2. Sequence STOPPEE
  3. Notification Slack Jonathan avec la reponse + fiche prospect
  4. Jonathan fait le RDV decouverte et saisit ses notes
  5. Agent 8 genere le devis et gere le closing

CE QUE JONATHAN FAIT :
  → Repondre au prospect, planifier le RDV decouverte
  → Faire le RDV (30 min) et saisir les notes
  → Valider le devis quand Agent 8 le genere
```

### 2. Un prospect repond "pas maintenant"

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 5c classifie : "PAS_MAINTENANT"
  2. Sequence STOPPEE
  3. Prospect transfere a l'Agent 6 (NURTUREUR)
  4. Emails nurture 1-2x/mois + engagement LinkedIn

CE QUE JONATHAN FAIT :
  → Rien. Le systeme gere. Le prospect sera recontacte
    automatiquement quand un signal sera detecte ou quand
    il s'engagera avec le contenu.
```

### 3. Un prospect repond negativement

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 5c classifie : "PAS_INTERESSE"
  2. Sequence STOPPEE definitivement
  3. Prospect marque "perdu"
  4. Si "ne me contactez plus" → suppression RGPD immediate

CE QUE JONATHAN FAIT :
  → Rien. Le systeme respecte le refus.
```

### 4. Un AO est detecte → Agent 9

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 1b detecte l'AO sur BOAMP
  2. Si score >= 60 → transfert automatique vers Agent 9
  3. Agent 9a analyse le DCE (CCTP, RC, CCAP)
  4. Agent 9b calcule le score GO/NO-GO + recommandation
  5. Notification Slack Jonathan avec le score et la recommandation

CE QUE JONATHAN FAIT :
  → Lire la notification, regarder le score et la recommandation
  → Cliquer GO ou NO-GO (~10 min)
  → Si GO : Agent 9 prepare automatiquement le dossier complet
  → Valider le dossier final avant depot (J-2)
```

### 5. Un deal est signe → Agent 10

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 8c confirme la signature (webhook Yousign)
  2. Deal transmis a l'Agent 10 (CSM)
  3. Agent 10a demarre l'onboarding :
     J+1 : Email welcome + collecte acces
     J+3 : Appel kick-off planifie
     J+7 : Premier livrable
     J+30 : NPS automatise
  4. Agent 10c calcule le Health Score en continu

CE QUE JONATHAN FAIT :
  → Faire le kick-off (30 min)
  → Delivrer le projet normalement
  → Le systeme gere le suivi satisfaction et les upsells
```

### 6. Un client est mecontent → Agent 10c

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 10c detecte un signal negatif :
     - NPS < 6 ou CSAT faible
     - Health Score qui chute de > 20 pts en 30 jours
     - Silence radio > 60 jours
     - Tickets support x3
  2. Alerte Slack immediat avec le detail
  3. Si Health Score < 30 : alerte rouge, intervention urgente

CE QUE JONATHAN FAIT :
  → Appeler le client dans les 24h
  → Comprendre le probleme, proposer un plan d'action
  → Le systeme suit l'evolution du Health Score
```

### 7. Un referral est recu → Agent 1

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 10e recoit le referral du client promoteur
  2. Lead referral cree avec tag "referral" + source client
  3. Transfert automatique vers Agent 1 (BOUCLE REFERRAL 10→1)
  4. Le lead suit le pipeline normal (Agent 1→2→3→4→5)
     mais avec un bonus scoring (taux conversion referral : 30-40%)

CE QUE JONATHAN FAIT :
  → Rien. Le systeme traite le referral automatiquement.
  → Le referral sera contacte comme un prospect normal mais prioritaire.
```

### 8. Un email bounce (adresse invalide)

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 5a detecte le bounce
  2. Hard bounce → email marque invalide, prospect mis en pause
  3. Le systeme essaie de trouver un autre email (via Agent 2a)
  4. Si pas d'alternative → prospect contacte uniquement par LinkedIn

CE QUE JONATHAN FAIT :
  → Rien. Le systeme gere les bounces automatiquement.
```

### 9. LinkedIn restreint le compte

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 5b detecte la restriction (3 niveaux : warning, restricted, banned)
  2. Toutes les actions LinkedIn PAUSEES immediatement
  3. Alerte Slack #ops
  4. Timer de recovery : 48h (warning), 7 jours (restricted), 30 jours (banned)
  5. Reprise automatique apres le timer, a volume reduit (50%)

CE QUE JONATHAN FAIT :
  → Ne pas utiliser LinkedIn manuellement pendant la restriction
  → Attendre la notification "LinkedIn restriction levee"
```

### 10. Le taux de reponse baisse

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 7c detecte l'anomalie (taux reponse < seuil 7 jours)
  2. Alerte Slack #ops
  3. Agent 7d analyse : quel template, quel segment, quel canal
  4. Recommandation generee : "Desactiver template X, tester variante Y"

CE QUE JONATHAN FAIT :
  → Lire la recommandation
  → Approuver ou refuser dans Slack
  → Si approuve : le systeme ajuste automatiquement
```

---

## 11. LES 5 SEGMENTS

### Comment le systeme traite chaque segment differemment

#### PME France Metro (50-500 salaries)

```
DECIDEURS CIBLES : DG, CMO, CTO, DSI
SERVICES PROPOSES : Sites vitrines, apps metier, e-commerce
CANAL PRINCIPAL : Email (puis LinkedIn)
TON : Vouvoiement, professionnel, Challenger Sale
SEQUENCE : 4-6 touches sur 14 jours
ARGUMENT CLE : "Qualite agence parisienne, prix -40%"
SCORING BONUS : Aucun specifique
TIERING DEVIS : Bronze/Silver/Gold standard
```

#### E-commerce Shopify

```
DECIDEURS CIBLES : Fondateur, Head of Growth, CMO
SERVICES PROPOSES : Tracking server-side, refonte Shopify, Hydrogen headless
CANAL PRINCIPAL : Email (puis LinkedIn)
TON : Semi-decontracte, axe ROI/chiffres
SEQUENCE : 5-7 touches sur 21 jours
ARGUMENT CLE : "+47% conversions, ROAS x1.6"
SCORING BONUS : +5 si Shopify detecte par Wappalyzer
TIERING DEVIS : Adapte (tracking = offre unique)
```

#### Collectivites DOM-TOM

```
DECIDEURS CIBLES : DGS, DSI, Elus numeriques
SERVICES PROPOSES : Sites RGAA, portails citoyens
CANAL PRINCIPAL : Email formel (LinkedIn secondaire)
TON : Vouvoiement strict, formel, references reglementaires
SEQUENCE : 4 touches sur 30 jours (cycle plus long)
ARGUMENT CLE : "Conformite RGAA, sanctions 50K EUR, prestataire local"
SCORING BONUS : +3 si non-conforme RGAA detecte
AO : Principal canal d'acquisition (Agent 9 prioritaire)
```

#### Startups / SaaS

```
DECIDEURS CIBLES : Founder, CTO
SERVICES PROPOSES : MVP Flutter, apps metier, dashboards
CANAL PRINCIPAL : LinkedIn (puis email)
TON : Tutoiement, direct, technique
SEQUENCE : 6 touches sur 14 jours (rapide)
ARGUMENT CLE : "Livraison 4-6 semaines, code propre, IA-augmente"
SCORING BONUS : +5 si levee de fonds recente
TIERING DEVIS : Focus MVP (Bronze = MVP, Silver = MVP + iterations)
```

#### Agences en marque blanche

```
DECIDEURS CIBLES : Fondateur d'agence marketing/SEO/growth
SERVICES PROPOSES : Sous-traitance dev, white-label
CANAL PRINCIPAL : Email (puis LinkedIn)
TON : Vouvoiement, partenariat, business
SEQUENCE : 5 touches sur 28 jours
ARGUMENT CLE : "Vos clients obtiennent du code sur-mesure, vous gardez la marge"
SCORING BONUS : Aucun specifique
TIERING DEVIS : Tarif partenaire (marges ajustees)
```

---

## 12. ARCHITECTURE DES FICHIERS

### 49 fichiers organises par agent (10 masters + 39 sous-agents)

```
AGENT 1 — VEILLEUR (5 fichiers)
├── AGENT-1-MASTER.md              ← Orchestrateur, deduplication, normalisation
├── AGENT-1a-LINKEDIN.md           ← Signaux LinkedIn
├── AGENT-1b-MARCHES-PUBLICS.md    ← Veille BOAMP
├── AGENT-1c-VEILLE-WEB.md         ← Scans Lighthouse/Wappalyzer
└── AGENT-1d-JOBBOARDS.md          ← Scraping job boards

AGENT 2 — ENRICHISSEUR (4 fichiers)
├── AGENT-2-MASTER.md              ← Orchestrateur, fusion, dedup BDD
├── AGENT-2a-CONTACT.md            ← Recherche email decideur
├── AGENT-2b-ENTREPRISE.md         ← Donnees financieres (INSEE, Pappers)
└── AGENT-2c-TECHNIQUE.md          ← Stack technique + performance site

AGENT 3 — SCOREUR (3 fichiers)
├── AGENT-3-MASTER.md              ← Scoring 4 axes, categorisation, routing
├── AGENT-3-MODELE-SCORING.md      ← Coefficients, signal decay, code TypeScript
└── AGENT-3-FEEDBACK-CALIBRATION.md ← Feedback loop, recalibration, transition ML

AGENT 4 — REDACTEUR (4 fichiers)
├── AGENT-4-MASTER.md              ← Orchestrateur, templates, validation
├── AGENT-4a-EMAIL.md              ← Generation email via Claude API
├── AGENT-4b-LINKEDIN.md           ← Generation messages LinkedIn
└── AGENT-4c-IMPACT.md             ← Calcul chiffres d'impact

AGENT 5 — SUIVEUR (5 fichiers)
├── AGENT-5-MASTER.md              ← Orchestrateur, envoi, detection, sequences
├── AGENT-5a-EMAIL.md              ← Envoi Gmail API, tracking, bounces
├── AGENT-5b-LINKEDIN.md           ← Actions LinkedIn via Waalaxy
├── AGENT-5c-REPONSES.md           ← Classification IA des reponses
└── AGENT-5d-SEQUENCES.md          ← Orchestration sequences multicanales

AGENT 6 — NURTUREUR (4 fichiers)
├── AGENT-6-MASTER.md              ← Orchestrateur, nurturing long terme
├── AGENT-6a-EMAIL-NURTURE.md      ← Emails de valeur
├── AGENT-6b-LINKEDIN-PASSIF.md    ← Likes, comments passifs
└── AGENT-6c-RE-SCOREUR.md         ← Re-scoring mensuel

AGENT 7 — ANALYSTE (5 fichiers)
├── AGENT-7-MASTER.md              ← Orchestrateur, metriques globales
├── AGENT-7a-COLLECTEUR.md         ← Requetes SQL quotidiennes
├── AGENT-7b-RAPPORTS.md           ← Generation rapports (quotidien/hebdo/mensuel)
├── AGENT-7c-ANOMALIES.md          ← Detection anomalies, alertes Slack
└── AGENT-7d-RECOMMANDEUR.md       ← Ajustements concrets par agent

AGENT 8 — DEALMAKER (4 fichiers)
├── AGENT-8-MASTER.md              ← Orchestrateur, pipeline CRM 7 etapes
├── AGENT-8a-DEVIS.md              ← Generation devis tiering Bronze/Silver/Gold
├── AGENT-8b-RELANCES.md           ← Sequences post-devis, signaux achat
└── AGENT-8c-SIGNATURE.md          ← Contrat + e-signature Yousign V3

AGENT 9 — APPELS D'OFFRES (8 fichiers)
├── AGENT-9-MASTER.md              ← Orchestrateur, workflow J-31 a J+30
├── AGENT-9a-DCE.md                ← Analyse CCTP, RC, CCAP
├── AGENT-9b-QUALIFICATEUR.md      ← Score GO/NO-GO + recommandation
├── AGENT-9c-JURISTE.md            ← Dossier admin (DC1, DC2, DUME)
├── AGENT-9d-CHIFFREUR.md          ← Offre financiere (BPU, DQE, DPGF)
├── AGENT-9e-REDACTEUR-MEMOIRE.md  ← Memoire technique personnalise
├── AGENT-9f-CONTROLEUR-QA.md      ← Verification complete avant depot
└── AGENT-9g-MONITEUR.md           ← Suivi post-depot, RETEX, capitalisation

AGENT 10 — CSM (6 fichiers)
├── AGENT-10-MASTER.md             ← Orchestrateur, cycle de vie client
├── AGENT-10a-ONBOARDING.md        ← Welcome sequence J1-J30, kick-off
├── AGENT-10b-UPSELL.md            ← Detection signaux, scoring opportunite
├── AGENT-10c-SATISFACTION.md      ← Health Score, NPS/CSAT, detection churn
├── AGENT-10d-AVIS.md              ← Collecte avis 5 plateformes
└── AGENT-10e-REFERRAL.md          ← Programme ambassadeur, tracking

GUIDE
└── GUIDE-UTILISATION-SYSTEME-10-AGENTS.md  ← Ce document

TOTAL : 49 fichiers (10 masters + 39 sous-agents) + 1 guide
```

---

## 13. COUT ET ROI

### Couts mensuels detailles

| Agent | Poste principal | Montant |
|-------|----------------|---------|
| **Agent 1** — VEILLEUR | APIs veille (LinkedIn, BOAMP, Lighthouse) | 430 EUR |
| **Agent 2** — ENRICHISSEUR | APIs enrichissement (Dropcontact, Hunter, INSEE, Pappers) | 278 EUR |
| **Agent 3** — SCOREUR | Calcul local (pas d'API) | 0 EUR |
| **Agent 4** — REDACTEUR | Claude API (generation messages) | 12 EUR |
| **Agent 5** — SUIVEUR | Envoi email + Waalaxy | 150 EUR |
| **Agent 6** — NURTUREUR | Claude API + emails nurture | 37 EUR |
| **Agent 7** — ANALYSTE | Claude API + Metabase | 50 EUR |
| **Agent 8** — DEALMAKER | Claude API + Yousign | 62 EUR |
| **Agent 9** — APPELS D'OFFRES | Claude API (analyse + redaction) | 31 EUR |
| **Agent 10** — CSM | Claude API + NPS/CSAT tools + avis platforms | 125 EUR |
| | **TOTAL** | **1 175 EUR/mois** |

### ROI attendu

```
HYPOTHESE CONSERVATIVE :
  Leads/mois          : 600-1 500
  Prospects enrichis  : 540-1 350
  HOT                 : 54-135
  Emails envoyes      : 300-600
  Reponses positives  : 15-30
  RDV                 : 8-15
  Deals signes        : 3-8
  Panier moyen        : 10 000-25 000 EUR
  Revenue deals/mois  : 30 000-200 000 EUR
  Revenue AO/mois     : 0-60 000 EUR (1 AO tous les 2 mois)
  Revenue upsell/mois : 5 000-15 000 EUR

  REVENUE TOTAL       : 35 000-275 000 EUR/mois

  COUT SYSTEME        : 1 175 EUR/mois
  ROI MINIMUM         : 29x (35K / 1.175K)
  ROI OPTIMISTE       : 234x (275K / 1.175K)

IMPACT INDIRECT (non mesure en EUR) :
  + Avis clients positifs → reputation en ligne
  + Referrals → leads gratuits avec 30-40% conversion
  + Health Score → retention clients + upsell
  + RETEX AO → amelioration continue du taux de succes
```

---

## 14. GLOSSAIRE

| Terme | Definition |
|-------|-----------|
| **A/B Test** | Test comparatif de 2 versions d'un message ou template |
| **AE** | Acte d'Engagement (document contractuel marche public) |
| **AO** | Appel d'offres (marche public) |
| **BODACC** | Bulletin officiel des annonces civiles et commerciales |
| **BOAMP** | Bulletin officiel des annonces de marches publics |
| **Bounce** | Email qui n'arrive pas (adresse invalide ou boite pleine) |
| **BPU** | Bordereau de Prix Unitaires (document financier AO) |
| **Break-up** | Dernier message d'une sequence (paradoxe psychologique) |
| **BullMQ** | Systeme de file d'attente (queue) entre les agents |
| **CAC** | Customer Acquisition Cost — cout d'acquisition d'un client |
| **CCAP** | Cahier des Clauses Administratives Particulieres |
| **CCTP** | Cahier des Clauses Techniques Particulieres |
| **Churn** | Perte d'un client (resiliation, non-renouvellement) |
| **CLV / LTV** | Customer Lifetime Value — valeur totale d'un client dans le temps |
| **COLD** | Score 25-49 : prospect a nurture long terme |
| **CSAT** | Customer Satisfaction Score — note de satisfaction client |
| **CSM** | Customer Success Manager — gestion de la relation client |
| **CTA** | Call To Action — action demandee au prospect |
| **DCE** | Dossier de Consultation des Entreprises (ensemble des documents AO) |
| **Deal** | Opportunite commerciale en cours de closing |
| **Devis** | Proposition commerciale chiffree avec tiering |
| **DISQUALIFIE** | Score 0-24 : prospect hors cible, archive |
| **DPGF** | Decomposition du Prix Global et Forfaitaire |
| **DQE** | Detail Quantitatif Estimatif |
| **DUME** | Document Unique de Marche Europeen |
| **Handoff** | Transfert d'un prospect d'un agent a un autre |
| **Health Score** | Score composite 0-100 de sante client (engagement + satisfaction + croissance) |
| **HOT** | Score 75-100 : prospect prioritaire, contact immediat |
| **ICP** | Ideal Customer Profile — profil du client ideal |
| **Lead brut** | Prospect detecte par le Veilleur, pas encore enrichi |
| **MAPA** | Marche A Procedure Adaptee (marche public < 90K EUR) |
| **Memoire technique** | Document detaillant la reponse technique a un AO |
| **NPS** | Net Promoter Score — mesure de la recommandation client (0-10) |
| **Nurture** | Relation long terme avec prospects non convertis |
| **Pipeline** | Ensemble des deals en cours a differentes etapes |
| **Prospect enrichi** | Lead avec toutes ses donnees (email, SIRET, CA, stack) |
| **R2181-3** | Article du Code de la commande publique — courrier de notification de rejet |
| **Referral** | Recommandation d'un client existant vers un nouveau prospect |
| **Re-scoring** | Recalcul du score quand un nouveau signal est detecte |
| **RETEX** | Retour d'experience (analyse post-AO) |
| **RGAA** | Referentiel General d'Amelioration de l'Accessibilite |
| **Score** | Note 0-100 attribuee par le Scoreur |
| **Sequence** | Serie de messages envoyes a un prospect sur X jours |
| **Signal** | Evenement qui indique un besoin (recrutement, levee, site lent...) |
| **Signal decay** | Perte de valeur d'un signal avec le temps |
| **Sunset** | Politique d'arret des envois apres X mois sans engagement |
| **Tiering** | Systeme d'offres par niveaux (Bronze/Silver/Gold) |
| **TTV** | Time To Value — temps entre signature et premier resultat client |
| **Upsell** | Vente additionnelle a un client existant |
| **WARM** | Score 50-74 : prospect interessant, sequence automatique |
| **Warmup** | Periode de montee en charge progressive des envois email |

---

*Document de reference pour l'utilisation quotidienne du systeme de prospection Axiom Marketing.*
*10 agents, 39 sous-agents, 49 fichiers de specifications.*
*A lire en complement des 10 fichiers MASTER et des 39 fichiers sous-agents.*
