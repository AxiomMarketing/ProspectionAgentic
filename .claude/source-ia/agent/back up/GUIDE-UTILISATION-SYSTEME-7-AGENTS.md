# GUIDE D'UTILISATION — SYSTEME DE PROSPECTION 7 AGENTS AXIOM

**Version** : 1.0 | **Date** : 18 mars 2026
**Pour** : Jonathan Dewaele, Marty Wong, equipe technique Axiom
**A lire avec** : Les 7 fichiers de specs detaillees (AGENT-1 a AGENT-7-SPECS-COMPLETES.md)

---

## TABLE DES MATIERES

1. [Vue d'ensemble du systeme](#1-vue-densemble)
2. [Le flux complet — de la detection au deal](#2-le-flux-complet)
3. [Ce que fait chaque agent — resume actionnable](#3-ce-que-fait-chaque-agent)
4. [Le parcours d'un prospect reel — exemple complet](#4-parcours-dun-prospect-reel)
5. [Ce que Jonathan et Marty doivent faire chaque jour](#5-actions-humaines-quotidiennes)
6. [Demarrage du systeme — mise en route](#6-demarrage)
7. [Operations quotidiennes](#7-operations-quotidiennes)
8. [Comprendre les notifications](#8-comprendre-les-notifications)
9. [Comprendre les rapports](#9-comprendre-les-rapports)
10. [Que faire quand...](#10-que-faire-quand)
11. [Les 5 segments — comment le systeme les traite differemment](#11-les-5-segments)
12. [Schema de la base de donnees — vue simplifiee](#12-schema-bdd)
13. [Cout et ROI](#13-cout-et-roi)
14. [Glossaire](#14-glossaire)

---

## 1. VUE D'ENSEMBLE

### Qu'est-ce que ce systeme ?

Un pipeline de prospection **100% automatise** compose de 7 agents IA qui travaillent en chaine pour :
1. **Trouver** des prospects (entreprises qui ont besoin des services Axiom)
2. **Qualifier** ces prospects (sont-ils un bon fit ? ont-ils le budget ? le timing ?)
3. **Contacter** ces prospects (email + LinkedIn personnalise)
4. **Suivre** les reponses et relancer automatiquement
5. **Entretenir** la relation avec ceux qui ne sont pas prets maintenant
6. **Mesurer** tout et optimiser en continu

### Ce que Jonathan et Marty touchent

```
╔═══════════════════════════════════════════════════════════════╗
║  CE QUE LE SYSTEME FAIT TOUT SEUL (24h/24, 7j/7) :         ║
║                                                               ║
║  ✓ Detecter des prospects (LinkedIn, BOAMP, sites, jobs)     ║
║  ✓ Enrichir les fiches (email, SIRET, CA, stack technique)   ║
║  ✓ Scorer et classifier (HOT / WARM / COLD)                 ║
║  ✓ Ecrire les messages personnalises                         ║
║  ✓ Envoyer les emails et messages LinkedIn (WARM)            ║
║  ✓ Relancer automatiquement (sequences multicanales)         ║
║  ✓ Classifier les reponses (interesse / pas maintenant / non)║
║  ✓ Entretenir la relation long terme (nurture)               ║
║  ✓ Mesurer et generer des rapports                           ║
╚═══════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════╗
║  CE QUE JONATHAN / MARTY FONT (30-45 min/jour) :            ║
║                                                               ║
║  1. Valider les messages HOT avant envoi (~5 min)            ║
║     → Notification Slack avec bouton "Approuver"             ║
║                                                               ║
║  2. Repondre aux prospects interesses (~10-15 min)           ║
║     → Notification Slack quand quelqu'un repond positivement ║
║                                                               ║
║  3. Prendre les appels decouverte (~15-30 min)               ║
║     → Le systeme planifie le RDV, Jonathan le prend          ║
║                                                               ║
║  4. Lire le rapport quotidien (~2 min)                       ║
║     → Digest Slack a 22h : chiffres cles du jour             ║
║                                                               ║
║  5. Actions LinkedIn manuelles (~10-15 min, optionnel)       ║
║     → Liker/commenter les posts de prospects cles            ║
╚═══════════════════════════════════════════════════════════════╝
```

### Le schema global

```
SOURCES                    AGENTS AUTOMATISES                    HUMAIN
═══════                    ══════════════════                    ══════

LinkedIn ─────┐
BOAMP ────────┤
Sites web ────┼── VEILLEUR ── ENRICHISSEUR ── SCOREUR ── REDACTEUR ── SUIVEUR
Job boards ───┤      1            2              3           4           5
Levees fonds ─┘                                                    ↓         ↓
                                                              NURTUREUR   Jonathan
                                                                  6      valide +
                                                                  ↓      repond
                                                              ANALYSTE
                                                                  7
                                                                  ↓
                                                            Rapports +
                                                            Recommandations
```

---

## 2. LE FLUX COMPLET

### Etape par etape, voici ce qui se passe quand le systeme detecte un nouveau prospect :

```
HEURE 0:00 — DETECTION (Agent 1 : VEILLEUR)
══════════════════════════════════════════════
Le Veilleur scanne ses sources en permanence :
  • LinkedIn : changements de poste, recrutements, posts
  • BOAMP : nouveaux appels d'offres IT
  • Sites web : Lighthouse scan de sites lents/obsoletes
  • Job boards : offres d'emploi "dev web" (besoin non satisfait)

EXEMPLE :
  Signal detecte : "Sophie Martin nommee CMO chez TechCorp (120 salaries, Paris)"
  Source : LinkedIn (sous-agent 1a)
  Priorite : Haute (changement poste C-level)

  → Le Veilleur cree un LEAD BRUT et l'envoie a l'Enrichisseur
```

```
HEURE 0:01 — DEDUPLICATION (Agent 1 : VEILLEUR Master)
══════════════════════════════════════════════════════════
Avant d'envoyer le lead :
  • Verifie si TechCorp existe deja en base (par SIRET, domaine, ou nom)
  • Si oui : ajoute le nouveau signal au prospect existant
  • Si non : cree un nouveau lead brut

  → Lead brut normalise envoye dans la queue "enrichisseur-pipeline"
```

```
HEURE 0:02 — ENRICHISSEMENT (Agent 2 : ENRICHISSEUR)
═════════════════════════════════════════════════════════
L'Enrichisseur lance 3 sous-agents EN PARALLELE :

  [2a] CONTACT : Cherche l'email de Sophie Martin
       Waterfall : Dropcontact → Hunter.io → Pattern matching → SMTP check
       Resultat : sophie.martin@techcorp.fr (confiance 98%, verifie)

  [2b] ENTREPRISE : Cherche les donnees de TechCorp
       Waterfall : API INSEE → Pappers → BODACC
       Resultat : SIRET 12345678900012, CA 5.2M EUR, 120 salaries, SAS

  [2c] TECHNIQUE : Scanne le site techcorp.fr
       Outils : Lighthouse + Wappalyzer + axe-core
       Resultat : Performance 42/100, WordPress 6.4, accessibilite 62/100

  → Les 3 resultats sont fusionnes en une FICHE PROSPECT ENRICHIE (~100 champs)
  → Envoyee dans la queue "scoreur-pipeline"
```

```
HEURE 0:02 (instantane) — SCORING (Agent 3 : SCOREUR)
═══════════════════════════════════════════════════════════
Le Scoreur calcule un score 0-100 sur 4 axes :

  Axe 1 — ICP Fit (35 pts max)
    Taille 120 salaries : +10
    Secteur IT/conseil : +10
    Paris : +8
    CMO (C-level) : +7
    → Total axe 1 : 35/35

  Axe 2 — Signaux (30 pts max)
    Changement poste (il y a 21 jours, demi-vie 60j) : +22
    Recrutement dev (il y a 3 jours, demi-vie 45j) : +10
    → Total axe 2 : 30/30 (plafonne)

  Axe 3 — Technique (20 pts max)
    Lighthouse 42/100 : +7
    WordPress (pas obsolete mais pas moderne) : +4
    Accessibilite 62/100 : +5
    → Total axe 3 : 16/20

  Axe 4 — Engagement (15 pts max)
    Email verifie : +2
    Telephone trouve : +1
    → Total axe 4 : 3/15

  SCORE TOTAL : 84/100
  CATEGORIE : HOT (sous-categorie HOT_B)
  DECISION : Contact immediat, validation Jonathan requise

  → Fiche scoree envoyee dans la queue "redacteur-pipeline"
```

```
HEURE 0:04 — REDACTION (Agent 4 : REDACTEUR)
═══════════════════════════════════════════════
Le Redacteur genere un message personnalise :

  1. Choisit le template : "challenger_sale_pme_metro_v3"
  2. Calcule l'impact : "3.2s chargement = ~1 250 EUR/mois de conversions perdues"
  3. Appelle Claude API avec les donnees prospect + template
  4. Genere l'email + le message LinkedIn

  EMAIL GENERE :
  ┌──────────────────────────────────────────────────────────┐
  │ Objet : Le site TechCorp vs concurrent — ecart de perf  │
  │                                                          │
  │ Bonjour Sophie,                                         │
  │                                                          │
  │ Observation rapide : TechCorp charge en 3.2s, contre     │
  │ 1.8s en moyenne pour votre secteur.                      │
  │ Cet ecart represente environ 1 250 EUR/mois en           │
  │ conversions perdues.                                     │
  │                                                          │
  │ On a aide une PME similaire a diviser son temps de       │
  │ chargement par 2 — resultat : +12% de CA en un trimestre.│
  │                                                          │
  │ Ca vaut 15 minutes pour en discuter ?                    │
  │                                                          │
  │ Jonathan                                                 │
  │ Axiom Marketing                                          │
  └──────────────────────────────────────────────────────────┘

  QUALITE CHECKS : longueur OK, spam words OK, ton OK, personnalisation OK

  → Score HOT_B → VALIDATION JONATHAN REQUISE
  → Notification Slack envoyee a Jonathan
```

```
HEURE 0:05 — NOTIFICATION (Agent 4 → Jonathan)
═══════════════════════════════════════════════════
Jonathan recoit sur Slack :

  ┌──────────────────────────────────────────────────────────┐
  │ 🔥 PROSPECT HOT — Validation requise                    │
  │                                                          │
  │ Sophie Martin — CMO @ TechCorp (Paris, 120 sal.)        │
  │ Score : 84/100 (HOT_B)                                  │
  │ Signal : Nouveau CMO + recrutement dev React            │
  │ Site : techcorp.fr (Lighthouse 42, WordPress)           │
  │                                                          │
  │ Email propose :                                         │
  │ "Bonjour Sophie, Observation rapide : TechCorp          │
  │  charge en 3.2s..."                                     │
  │                                                          │
  │ [✅ Approuver]  [✏️ Modifier]  [❌ Rejeter]              │
  │                                                          │
  │ SLA : Repondre avant 11:05 (2h)                         │
  └──────────────────────────────────────────────────────────┘
```

```
HEURE 0:10 — VALIDATION (Jonathan)
════════════════════════════════════
Jonathan clique "Approuver" sur Slack.

  → Le message est marque "approved"
  → Envoye dans la queue "suiveur-pipeline"
```

```
HEURE 0:15 — ENVOI (Agent 5 : SUIVEUR)
════════════════════════════════════════════
Le Suiveur envoie le message :

  1. Verifie le meilleur moment : mardi-jeudi, 8h-10h ou 14h-16h (heure du prospect)
  2. Si maintenant est un bon creneau → ENVOIE immediatement
  3. Si non → PLANIFIE pour le prochain creneau optimal

  ENVOI EMAIL :
  • Via Gmail API (domaine : axiom-marketing.fr)
  • Pixel de tracking insere (detecte ouverture)
  • Liens trackes (detecte clics)

  ENVOI LINKEDIN (si canal secondaire) :
  • Connexion envoyee avec note personnalisee
  • Via Waalaxy (volumes surs : 20/jour)

  → Interaction loggee en BDD : "email_envoye"
  → Sequence demarree : etape 1/4
```

```
HEURE 0:15 → JOUR 10 — SEQUENCE AUTOMATIQUE (Agent 5)
══════════════════════════════════════════════════════════
Le Suiveur gere la sequence complete :

  JOUR 0  : Email envoye ✓ (fait ci-dessus)
  JOUR 2  : Verifier si email ouvert
            • Si OUI → Envoyer connexion LinkedIn
            • Si NON → Attendre jour 5
  JOUR 5  : Liker 2-3 posts LinkedIn de Sophie
  JOUR 5  : Email relance (angle different, cas client)
  JOUR 10 : Dernier message LinkedIn (break-up)

  A CHAQUE ETAPE le Suiveur verifie :
  • Sophie a-t-elle repondu ? → Si OUI : STOPPER la sequence, classifier la reponse
  • Email a-t-il bounce ? → Si OUI : STOPPER, marquer invalide
  • Sophie s'est-elle desabonnee ? → Si OUI : STOPPER, supprimer (RGPD)

  PENDANT CE TEMPS :
  • Le Suiveur poll l'inbox Gmail toutes les minutes (Gmail API Watch)
  • Le Suiveur verifie les notifications LinkedIn
```

```
SCENARIO A : SOPHIE REPOND POSITIVEMENT (Jour 3)
══════════════════════════════════════════════════════
Sophie repond : "Bonjour, oui ca m'interesse. On peut en parler la semaine prochaine ?"

  1. Le Suiveur detecte la reponse (Gmail API Watch)
  2. Classification Claude : "INTERESSE" (confiance 97%)
  3. Sequence STOPPEE immediatement
  4. Notification Slack a Jonathan :

  ┌──────────────────────────────────────────────────────────┐
  │ 🎉 REPONSE POSITIVE — Sophie Martin @ TechCorp          │
  │                                                          │
  │ "Bonjour, oui ca m'interesse. On peut en parler          │
  │  la semaine prochaine ?"                                 │
  │                                                          │
  │ Score : 84 (HOT_B) | Signal : CMO + recrutement dev     │
  │                                                          │
  │ [📞 Repondre]  [📅 Planifier RDV]  [⏰ Reporter]         │
  └──────────────────────────────────────────────────────────┘

  5. Jonathan repond manuellement et planifie un RDV decouverte
  6. Statut prospect → "rdv_pris"
```

```
SCENARIO B : SOPHIE NE REPOND PAS (Jour 10, fin de sequence)
══════════════════════════════════════════════════════════════
Aucune reponse apres 4 touches sur 10 jours.

  1. Le Suiveur marque la sequence comme "terminee sans reponse"
  2. Le prospect est transmis a l'Agent 6 (NURTUREUR) via le NurturerHandoff :
     - Raison : SEQUENCE_COMPLETED_NO_REPLY
     - Historique : 2 emails envoyes, 1 ouvert (jamais clique), 1 connexion LinkedIn envoyee
     - Recommendation : reprendre dans 30 jours avec un case study

  → Sophie entre en NURTURE (relation long terme)
```

```
JOURS 10 → MOIS 6 — NURTURE (Agent 6 : NURTUREUR)
═══════════════════════════════════════════════════════
Le Nurtureur maintient la relation sans etre intrusif :

  SEMAINE 2 : Email nurture #1 — Article blog Axiom pertinent
              "5 erreurs qui ralentissent les sites WordPress"
  SEMAINE 4 : Liker 2 posts LinkedIn de Sophie
  SEMAINE 6 : Email nurture #2 — Cas client PME similaire
  SEMAINE 8 : Commenter un post LinkedIn de Sophie (1 phrase pertinente)
  SEMAINE 10 : Email nurture #3 — Invitation webinaire

  CHAQUE MOIS : Le sous-agent Re-Scoreur verifie :
  • Sophie a-t-elle ouvert les emails nurture ? → Si OUI : +2 pts/email ouvert
  • Sophie a-t-elle clique un lien ? → Si OUI : +5 pts
  • Nouveau signal business detecte ? → Si OUI : re-scorer
  • Sophie a-t-elle visite le site Axiom ? → Si OUI : +15 pts

  SCENARIO : Au mois 3, Sophie ouvre 3 emails + clique le cas client + visite la page pricing
  → Score engagement monte de 3 a 52
  → Reclassification : COLD → WARM
  → Le Nurtureur renvoie Sophie au Scoreur (Agent 3) pour re-routing
  → Le Scoreur re-calcule : score 72 → categorie WARM
  → Nouvelle sequence automatique declenchee par l'Agent 5

  SCENARIO : Apres 6 mois sans aucune interaction
  → Sunset policy : Sophie est archivee
  → Plus aucun email envoye
```

```
EN CONTINU — MESURE (Agent 7 : ANALYSTE)
══════════════════════════════════════════
L'Analyste tourne en arriere-plan et produit :

  TOUS LES SOIRS (22h Reunion) :
  • Digest quotidien Slack (5 lignes) :
    "Aujourd'hui : 42 leads detectes, 8 emails envoyes, 2 reponses, 1 RDV"

  CHAQUE DIMANCHE SOIR :
  • Rapport hebdomadaire complet (Slack + email) :
    - Funnel de la semaine (leads → reponses → RDV → deals)
    - Top templates (meilleur taux de reponse)
    - Segments qui performent / sous-performent
    - Recommandations concretes

  CHAQUE FIN DE MOIS :
  • Rapport mensuel strategique :
    - ROI du systeme
    - CAC par segment
    - Previsions pipeline
    - Calibration scoring (ajuster les poids)

  EN TEMPS REEL :
  • Alerte si anomalie detectee :
    "⚠️ Taux de bounce email a 8% (seuil : 3%). Verifier domaine axiom-marketing.fr"
```

---

## 3. CE QUE FAIT CHAQUE AGENT — RESUME

### Tableau synoptique

| Agent | Quand il tourne | Ce qu'il recoit | Ce qu'il fait | Ce qu'il produit | Cout |
|-------|----------------|-----------------|---------------|-----------------|------|
| **1. VEILLEUR** | 24h/24 (cron toutes les 6h) | Rien (il scrape les sources) | Detecte signaux + leads | Lead brut normalise (JSON) | 430 EUR |
| **2. ENRICHISSEUR** | A chaque nouveau lead | Lead brut | Complete avec email, SIRET, CA, stack | Fiche prospect enrichie (~100 champs) | 278 EUR |
| **3. SCOREUR** | A chaque prospect enrichi | Fiche enrichie | Calcule score 0-100, classe HOT/WARM/COLD | Prospect score + routing | 0 EUR |
| **4. REDACTEUR** | Pour chaque HOT + WARM | Prospect score | Ecrit email + LinkedIn personnalise | Message pret a envoyer | 12 EUR |
| **5. SUIVEUR** | 24h/24 (verifie chaque heure) | Message valide | Envoie, relance, detecte reponses | Interactions loggees | 150 EUR |
| **6. NURTUREUR** | Pour les non-convertis | Prospects WARM/COLD | Emails valeur, engagement LinkedIn, re-scoring | Leads rechauffes → re-scoring | 37 EUR |
| **7. ANALYSTE** | 24h/24 (rapports planifies) | Donnees de tous les agents | Mesure KPIs, detecte anomalies, recommande | Rapports + alertes | 50 EUR |

### Qui parle a qui

```
Agent 1 ──→ Agent 2 ──→ Agent 3 ──→ Agent 4 ──→ Agent 5
VEILLEUR    ENRICHISS.   SCOREUR    REDACTEUR    SUIVEUR
                                                    │
                                                    ├──→ Jonathan (notifications)
                                                    │
                                                    ├──→ Agent 6 (prospects non convertis)
                                                    │    NURTUREUR
                                                    │        │
                                                    │        └──→ Agent 3 (re-scoring boucle)
                                                    │
                                                    └──→ Agent 7 (metriques)
                                                         ANALYSTE
                                                             │
                                                             └──→ Jonathan (rapports)
                                                             └──→ Agents 1-6 (recommandations)
```

---

## 4. PARCOURS D'UN PROSPECT REEL — EXEMPLE COMPLET

### Prospect : Marie Leroux, Directrice Marketing, BoutiqueShop (e-commerce Shopify, Lyon)

```
JOUR 0 — DETECTION
  Agent 1d (Veilleur Job Boards) detecte :
    "BoutiqueShop recrute un Developpeur Shopify senior sur WTTJ"
  Signal : recrutement_dev_web
  Segment estime : ecommerce_shopify

JOUR 0 — ENRICHISSEMENT
  Agent 2a (Contact) : marie.leroux@boutiqueshop.fr (verifie, 96%)
  Agent 2b (Entreprise) : SIRET 987654321, CA 800K EUR, 12 salaries
  Agent 2c (Technique) : Shopify theme standard, Lighthouse 68

JOUR 0 — SCORING
  ICP Fit : 25/35 (Shopify, bonne taille, Lyon)
  Signaux : 18/30 (recrutement dev, recent)
  Technique : 8/20 (pas terrible mais pas critique)
  Engagement : 2/15 (email verifie)
  TOTAL : 53/100 → WARM

JOUR 0 — REDACTION
  Template : "tracking_roi_v1" (segment Shopify, etape 1)
  Message : "Bonjour Marie, BoutiqueShop perd ~40% de ses conversions
  Meta Ads a cause des adblockers. Notre tracking server-side recupere
  ces conversions — resultat : +47% conversions, ROAS x1.6..."
  Validation : Auto (WARM = pas besoin de Jonathan)

JOUR 1 — ENVOI
  Email envoye a 9h14 (heure Lyon)

JOUR 3 — RELANCE
  Marie a ouvert l'email (pixel detecte) mais n'a pas repondu
  → Connexion LinkedIn envoyee avec note personnalisee
  → LinkedIn acceptee le meme jour

JOUR 5 — ENGAGEMENT
  Agent 5 like 2 posts LinkedIn de Marie

JOUR 7 — RELANCE 2
  Email relance avec cas client Shopify chiffre
  Marie clique le lien du cas client

JOUR 10 — MESSAGE LINKEDIN
  Message LinkedIn post-connexion : "Merci d'avoir accepte Marie !
  J'ai vu que vous avez regarde notre cas client Shopify.
  Des questions ? 15 min d'echange ?"

JOUR 11 — REPONSE !
  Marie repond sur LinkedIn : "Oui pourquoi pas, envoyez-moi un lien Calendly"
  → Classification : INTERESSE (confiance 95%)
  → Sequence STOPPEE
  → Notification Slack Jonathan
  → Jonathan envoie son Calendly
  → RDV planifie

JOUR 18 — RDV DECOUVERTE
  Jonathan fait l'appel decouverte (30 min)
  → Marie est interessee par le tracking server-side (990 EUR + 89 EUR/mois)
  → Proposition envoyee

JOUR 25 — DEAL SIGNE
  Marie signe pour le tracking server-side
  → Statut : "gagne"
  → Montant : 990 EUR + 89 EUR/mois
  → L'Agent 7 enregistre le deal dans les metriques
```

---

## 5. ACTIONS HUMAINES QUOTIDIENNES

### Planning type de Jonathan (30-45 min/jour)

```
08h00 — MATIN (10 min)
═══════════════════════
  1. Ouvrir Slack → Canal #prospects-hot
  2. Voir les notifications de la nuit :
     • Messages HOT a valider (cliquer Approuver/Modifier)
     • Reponses positives a traiter (repondre ou planifier RDV)
  3. Si RDV prevu → preparer (2 min de relecture de la fiche prospect)

12h00 — MIDI (5 min)
═════════════════════
  1. Checker Slack → nouvelles notifications
  2. Valider les messages HOT en attente (s'il y en a)
  3. Repondre aux prospects chauds

17h00 — FIN DE JOURNEE (10-15 min)
═══════════════════════════════════
  1. Actions LinkedIn manuelles (optionnel mais recommande) :
     • Ouvrir LinkedIn
     • Liker 5-10 posts de prospects en sequence
     • Commenter 2-3 posts de prospects HOT
     • Accepter les connexions entrantes
  2. Checker les dernières notifications Slack

22h00 — RAPPORT DU JOUR (2 min)
═══════════════════════════════════
  Le systeme envoie le digest quotidien sur Slack :
  → Lire en 2 min, noter si quelque chose est anormal
```

### Planning type de Marty (15-20 min/jour)

```
09h00 — CONTENU (15 min)
═════════════════════════
  1. Rediger 1 post LinkedIn pour le profil Jonathan (3-5/semaine)
  2. Preparer le prochain article blog (si jour prevu)
  3. Creer le prochain cas client / template email

HEBDOMADAIRE (30 min)
═════════════════════
  1. Lire le rapport hebdomadaire de l'Analyste
  2. Ajuster les templates si recommande
  3. Creer le contenu nurture du mois (emails, blog posts)
```

---

## 6. DEMARRAGE DU SYSTEME

### Avant de lancer (checklist)

```
INFRASTRUCTURE (1 jour)
  [ ] Serveur VPS commande (Scaleway ou Hetzner)
  [ ] PostgreSQL installe + schema cree
  [ ] Redis installe (pour BullMQ)
  [ ] n8n installe (orchestration)
  [ ] Node.js 22+ installe

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

DOMAINES EMAIL (1 semaine)
  [ ] 3 domaines achetes (axiom-marketing.fr, axiom-studio.fr, axiom-dev.fr)
  [ ] SPF configure sur chaque domaine
  [ ] DKIM configure sur chaque domaine
  [ ] DMARC configure (mode "none" au debut)
  [ ] Warmup demarre (6 semaines avant envoi reel)

CONTENU (2-3 jours)
  [ ] 35 templates de messages rediges (ou verifier ceux des specs Agent 4)
  [ ] 5 cas clients prepares (1 par segment)
  [ ] 10 articles blog publies (pour le nurturing)
  [ ] Profil LinkedIn Jonathan optimise
  [ ] Page Calendly configuree

DONNEES (1 jour)
  [ ] Liste initiale de 200-300 prospects importee
  [ ] Blocklist configuree (concurrents, clients existants)
  [ ] Segments configures (pme_metro, ecommerce_shopify, collectivite, startup, agence_wl)
```

### Ordre de lancement des agents

```
SEMAINE 1 : Lancer Agent 3 (SCOREUR) + Agent 7 (ANALYSTE)
  → Les plus simples, permettent de tester la logique
  → Importer 50 prospects manuellement, verifier le scoring

SEMAINE 2 : Lancer Agent 1c (VEILLEUR Web) + Agent 2 (ENRICHISSEUR)
  → Scanner 100 sites, enrichir, scorer
  → Verifier la qualite des fiches enrichies

SEMAINE 3 : Lancer Agent 4 (REDACTEUR) + Agent 5 (SUIVEUR) en mode TEST
  → Generer les messages mais NE PAS envoyer
  → Jonathan valide 20 messages manuellement
  → Verifier la qualite, ajuster les templates

SEMAINE 4 : Lancer Agent 5 (SUIVEUR) en mode PRODUCTION
  → Commencer a envoyer 10 emails/jour (warmup)
  → Augmenter progressivement

SEMAINE 5 : Lancer Agent 1a (LinkedIn) + Agent 1b (Marches) + Agent 1d (Jobs)
  → Toutes les sources de detection actives

SEMAINE 6 : Lancer Agent 6 (NURTUREUR)
  → Les premiers prospects non-convertis commencent a arriver
```

---

## 7. OPERATIONS QUOTIDIENNES

### Ce qui tourne automatiquement

| Heure (Reunion UTC+4) | Agent | Action |
|----------------------|-------|--------|
| 03h00 | Agent 1c | Scan Lighthouse de 200 sites |
| 07h00 | Agent 1b | 1ere verification BOAMP |
| 07h30 | Agent 1a | Scan LinkedIn signaux |
| 08h00 | Agent 1d | Scan job boards |
| 08h00-10h00 | Agent 5 | Envoi emails (creneau optimal metro) |
| 09h00-11h00 | Agent 5 | Actions LinkedIn (creneau optimal) |
| 12h00 | Agent 7 | Collecte metriques mi-journee |
| 13h30 | Agent 1a | 2eme scan LinkedIn |
| 14h00 | Agent 1b | 2eme verification BOAMP |
| 14h00-16h00 | Agent 5 | 2eme creneau envoi emails |
| 19h30 | Agent 1a | 3eme scan LinkedIn |
| 22h00 | Agent 7 | Rapport quotidien → Slack |
| 23h00 | Agent 6c | Re-scoring mensuel (1er du mois uniquement) |
| Continu | Agent 5c | Detection reponses (polling chaque minute) |
| Continu | Agent 2 | Enrichissement des leads en queue |
| Continu | Agent 3 | Scoring des prospects enrichis |
| Continu | Agent 4 | Redaction des messages |

### Monitoring

Le systeme surveille sa propre sante :

```
CHECKS AUTOMATIQUES (toutes les 5 min) :
  ✓ PostgreSQL accessible
  ✓ Redis accessible
  ✓ Gmail API fonctionnelle
  ✓ Queues BullMQ actives (pas de jobs bloques)
  ✓ Aucun agent crashe

ALERTES AUTOMATIQUES (Slack #ops) :
  ⚠️ Queue enrichisseur bloquee > 50 jobs → verifier API Dropcontact
  ⚠️ Bounce rate > 3% → verifier domaine email
  ⚠️ LinkedIn restriction detectee → pause Waalaxy 48h
  ⚠️ Taux reponse < 3% sur 7 jours → verifier templates
  🔴 Agent crashe → redemarrage automatique + alerte
```

---

## 8. COMPRENDRE LES NOTIFICATIONS

### Types de notifications Slack

| Emoji | Canal | Signification | Action requise |
|-------|-------|---------------|----------------|
| 🔥 | #prospects-hot | Message HOT a valider | Cliquer Approuver/Modifier/Rejeter |
| 🎉 | #prospects-hot | Reponse positive recue | Repondre au prospect dans l'heure |
| 📊 | #rapports | Digest quotidien (22h) | Lire (2 min) |
| 📈 | #rapports | Rapport hebdomadaire (dimanche) | Lire + noter les recommandations |
| ⚠️ | #ops | Anomalie detectee | Verifier si action necessaire |
| 🔴 | #ops | Erreur critique | Action immediate requise |
| 💬 | #prospects-hot | Prospect demande info | Jonathan repond manuellement |
| ⏰ | #prospects-hot | Rappel : validation en attente > 2h | Valider le message |

---

## 9. COMPRENDRE LES RAPPORTS

### Rapport quotidien (22h, Slack, 5 lignes)

```
📊 DIGEST — Mardi 18 mars 2026

  Leads detectes : 42 (+8 vs hier)
  Emails envoyes : 18 | Ouverts : 7 (39%) | Reponses : 2
  LinkedIn : 12 connexions, 3 acceptees
  RDV : 1 planifie (Sophie Martin, TechCorp)
  Pipeline actif : 124 prospects en sequence, 450 en nurture
```

### Rapport hebdomadaire (dimanche, Slack + email, 1 page)

```
📈 RAPPORT SEMAINE 12 — 11-17 mars 2026

FUNNEL :
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

TOP TEMPLATES :
  1. challenger_sale_pme_metro_v3 → 14.3% reponse ✅
  2. tracking_roi_v1 → 12.1% reponse ✅
  3. whitelabel_v1 → 1.2% reponse ❌ A REVOIR

RECOMMANDATIONS :
  1. Desactiver template whitelabel_v1 (sous-performe)
  2. Augmenter le poids du signal "recrutement dev" dans le scoring
  3. Segment collectivite : aucun lead cette semaine → ajouter mots-cles BOAMP
```

### Rapport mensuel (1er du mois, email, 3 pages)

```
📊 RAPPORT MENSUEL — Fevrier 2026

RESULTATS :
  Deals signes       : 3 (18K + 25K + 990 EUR recurrent)
  Revenue genere     : 43 990 EUR
  CAC moyen          : 319 EUR
  LTV:CAC            : 4.7x
  Pipeline actif     : 180K EUR

COUT SYSTEME :
  Outils             : 957 EUR
  ROI                : 45x

CALIBRATION SCORING :
  Precision HOT      : 78% (objectif 75%) ✅
  Faux positifs      : 22% → ajuster seuil a 78 au lieu de 75

PREVISIONS :
  Pipeline 30 jours  : 85K EUR (coverage 2.3x)
  Pipeline 60 jours  : 140K EUR
  Deals prevus M+1   : 4-6
```

---

## 10. QUE FAIRE QUAND...

### Un prospect repond "pas maintenant"

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 5 classifie la reponse : "PAS_MAINTENANT"
  2. Sequence STOPPEE
  3. Prospect transfere a l'Agent 6 (NURTUREUR)
  4. Le Nurtureur programme une reprise dans 30-60 jours
  5. Emails nurture (contenu de valeur) envoyes 1-2x/mois

CE QUE JONATHAN FAIT :
  → Rien. Le systeme gere. Sophie sera recontactee automatiquement
     quand un nouveau signal sera detecte ou quand elle s'engagera.
```

### Un prospect repond negativement

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 5 classifie : "PAS_INTERESSE"
  2. Sequence STOPPEE definitivement
  3. Prospect marque "perdu"
  4. Pas de nurture (respecter le refus)
  5. Si le prospect dit "ne me contactez plus" → suppression RGPD immediate

CE QUE JONATHAN FAIT :
  → Rien. Le systeme respecte le refus.
```

### Un email bounce (adresse invalide)

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 5 detecte le bounce
  2. Hard bounce → email marque invalide, prospect mis en pause
  3. Le systeme essaie de trouver un autre email (via Agent 2)
  4. Si pas d'alternative → prospect contacte uniquement par LinkedIn

CE QUE JONATHAN FAIT :
  → Rien. Le systeme gere les bounces automatiquement.
```

### LinkedIn restreint le compte

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 5b detecte la restriction (3 niveaux : warning, restricted, banned)
  2. Toutes les actions LinkedIn sont PAUSEES immediatement
  3. Alerte Slack #ops envoyee
  4. Timer de recovery : 48h (warning), 7 jours (restricted), 30 jours (banned)
  5. Reprise automatique apres le timer, a volume reduit (50%)

CE QUE JONATHAN FAIT :
  → Ne pas utiliser LinkedIn manuellement pendant la restriction
  → Attendre la notification "LinkedIn restriction levee"
```

### Un appel d'offre interessant est detecte

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 1b detecte l'AO sur BOAMP
  2. Score de pertinence calcule (CPV + montant + geographie + mots-cles)
  3. Si score > 75 : alerte Slack immediate avec details + lien vers le DCE
  4. Si score 60-75 : inclus dans le digest quotidien

CE QUE JONATHAN FAIT :
  → Lire l'alerte, cliquer le lien, evaluer si ca vaut de repondre
  → Si GO : telecharger le DCE, preparer le memoire technique
     (le systeme de prospection detecte l'AO, la reponse est manuelle)
```

### Le taux de reponse baisse

```
CE QUI SE PASSE AUTOMATIQUEMENT :
  1. Agent 7 detecte l'anomalie (taux reponse < seuil 7 jours)
  2. Alerte Slack #ops
  3. Analyse automatique : quel template, quel segment, quel canal est en cause
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
```

---

## 12. SCHEMA BDD — VUE SIMPLIFIEE

### Tables principales (par agent)

```
AGENT 1 (VEILLEUR)
├─ leads_bruts           → Leads detectes avant enrichissement
├─ marches_publics       → AO detectes sur BOAMP
├─ audits_techniques     → Resultats scans Lighthouse/Wappalyzer
├─ signaux_linkedin      → Signaux LinkedIn detectes
├─ offres_emploi         → Offres d'emploi detectees
└─ veilleur_batches      → Suivi des batchs

AGENT 2 (ENRICHISSEUR)
├─ prospects             → TABLE PRINCIPALE — fiches enrichies
├─ enrichissement_cache  → Cache des enrichissements (TTL)
└─ rgpd_oppositions      → Blacklist opt-out

AGENT 3 (SCOREUR)
├─ scores                → Scores actuels de chaque prospect
├─ score_history         → Historique des changements de score
├─ blocklists            → Listes de blocage (concurrents, etc.)
└─ prospect_outcomes     → Resultats finaux (gagne/perdu/nurture)

AGENT 4 (REDACTEUR)
├─ messages_generes      → Messages rediges avec metadata
├─ validation_requests   → Demandes de validation Jonathan
└─ ab_tests              → Tests A/B en cours

AGENT 5 (SUIVEUR)
├─ email_sends           → Emails envoyes avec tracking
├─ linkedin_actions      → Actions LinkedIn effectuees
├─ reply_classifications → Reponses classifiees
├─ prospect_sequences    → Etat des sequences en cours
├─ notifications         → Notifications Slack envoyees
└─ bounce_events         → Bounces detectes

AGENT 6 (NURTUREUR)
├─ nurture_prospects     → Prospects en nurturing
├─ nurture_interactions  → Interactions nurture
└─ nurture_emails        → Emails nurture envoyes

AGENT 7 (ANALYSTE)
├─ metriques_daily       → Snapshots quotidiens de toutes les metriques
├─ alertes               → Anomalies detectees
└─ recommandations       → Recommandations generees
```

### La table `prospects` (coeur du systeme)

C'est la table centrale que TOUS les agents utilisent. Creee par l'Agent 2, lue par tous.

```
prospects
├─ prospect_id (UUID, cle primaire)
├─ lead_id (UUID, reference vers leads_bruts)
├─ statut (nouveau → enrichi → score → contacte → en_sequence → rdv → proposition → gagne/perdu → nurture)
├─ score_actuel (0-100)
├─ categorie (HOT / WARM / COLD / DISQUALIFIE)
├─ segment (pme_metro / ecommerce_shopify / collectivite / startup / agence_wl)
│
├─ prenom, nom, email, telephone, linkedin_url, poste
├─ entreprise, siret, site_web, secteur, taille, ca_estime
├─ stack_tech (JSONB), lighthouse_score, rgaa_conforme
├─ signaux (JSONB), signal_principal
│
├─ nb_contacts, dernier_contact, prochaine_action
├─ source (veille_linkedin / veille_boamp / veille_web / veille_jobboard)
└─ created_at, updated_at
```

---

## 13. COUT ET ROI

### Couts mensuels

| Poste | Montant |
|-------|---------|
| Agent 1 (APIs veille) | 430 EUR |
| Agent 2 (APIs enrichissement) | 278 EUR |
| Agent 3 (calcul local) | 0 EUR |
| Agent 4 (Claude API) | 12 EUR |
| Agent 5 (envoi + Waalaxy) | 150 EUR |
| Agent 6 (Claude + infra) | 37 EUR |
| Agent 7 (Claude + Metabase) | 50 EUR |
| **TOTAL** | **957 EUR/mois** |

### ROI attendu

```
HYPOTHESE CONSERVATIVE :
  Leads/mois          : 600-1500
  Prospects enrichis  : 540-1350
  HOT                 : 54-135
  Emails envoyes      : 300-600
  Reponses positives  : 15-30
  RDV                 : 8-15
  Deals signes        : 3-8
  Panier moyen        : 10 000-25 000 EUR
  Revenue/mois        : 30 000-200 000 EUR

  COUT SYSTEME        : 957 EUR/mois
  ROI MINIMUM         : 30x (30K / 957)
  ROI OPTIMISTE       : 200x (200K / 957)
```

---

## 14. GLOSSAIRE

| Terme | Definition |
|-------|-----------|
| **Lead brut** | Prospect detecte par le Veilleur, pas encore enrichi |
| **Prospect enrichi** | Lead avec toutes ses donnees (email, SIRET, CA, stack) |
| **Score** | Note 0-100 attribuee par le Scoreur |
| **HOT** | Score 75-100 : prospect prioritaire, contact immediat |
| **WARM** | Score 50-74 : prospect interessant, sequence automatique |
| **COLD** | Score 25-49 : prospect a nurture long terme |
| **DISQUALIFIE** | Score 0-24 : prospect hors cible, archive |
| **Sequence** | Serie de messages envoyes a un prospect sur X jours |
| **Nurture** | Relation long terme avec prospects non convertis |
| **Signal** | Evenement qui indique un besoin (recrutement, levee, site lent...) |
| **Signal decay** | Perte de valeur d'un signal avec le temps |
| **Re-scoring** | Recalcul du score quand un nouveau signal est detecte |
| **Handoff** | Transfert d'un prospect d'un agent a un autre |
| **ICP** | Ideal Customer Profile — profil du client ideal |
| **CAC** | Customer Acquisition Cost — cout d'acquisition d'un client |
| **LTV** | Lifetime Value — valeur totale d'un client dans le temps |
| **MAPA** | Marche A Procedure Adaptee (marche public < 90K EUR) |
| **RGAA** | Referentiel General d'Amelioration de l'Accessibilite |
| **Bounce** | Email qui n'arrive pas (adresse invalide ou boite pleine) |
| **Warmup** | Periode de montee en charge progressive des envois email |
| **Break-up** | Dernier message d'une sequence (paradoxe psychologique) |
| **Sunset** | Politique d'arret des envois apres X mois sans engagement |
| **BullMQ** | Systeme de file d'attente (queue) entre les agents |

---

*Document de reference pour l'utilisation quotidienne du systeme de prospection Axiom Marketing.*
*A lire en complement des 7 fichiers de specifications detaillees.*
