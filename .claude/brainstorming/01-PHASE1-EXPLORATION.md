# Phase 1 — Exploration Expansive

**Rôle adopté :** CURIOUS EXPLORER — Générer un maximum de découvertes sans filtrage
**Méthode :** 7 agents de recherche lancés en parallèle
**Couverture :** 60+ fichiers de specs internes + état de l'art technologique 2025-2026

---

## 1. Cartographie Complète du Système

### 1.1 Vue d'Ensemble — Le Pipeline Axiom

Le système comprend **10 agents orchestrateurs (MASTER)** et **~40 sous-agents** formant un pipeline complet de prospection B2B. Chaque agent MASTER orchestre ses sous-agents et communique avec les autres via des queues de messages (BullMQ/Redis).

```
┌─────────────────────────── PIPELINE PRINCIPAL ───────────────────────────┐
│                                                                          │
│  Agent 1 (VEILLEUR)     → Détection de leads (4 sources)                │
│    ├─ 1a LinkedIn         ├─ 1b Marchés Publics                         │
│    ├─ 1c Veille Web       └─ 1d Job Boards                              │
│                    ↓                                                     │
│  Agent 2 (ENRICHISSEUR) → Enrichissement données (3 axes)               │
│    ├─ 2a Contact          ├─ 2b Entreprise                              │
│    └─ 2c Technique                                                      │
│                    ↓                                                     │
│  Agent 3 (SCOREUR)      → Scoring 4 axes (ICP/Signaux/Tech/Engagement) │
│    └─ Modèle déterministe + Feedback Calibration                        │
│                    ↓                                                     │
│  Agent 4 (REDACTEUR)    → Génération messages personnalisés             │
│    ├─ 4a Email            ├─ 4b LinkedIn                                │
│    └─ 4c Impact (calcul ROI)                                            │
│                    ↓                                                     │
│  Agent 5 (SUIVEUR)      → Exécution multicanal + détection réponses    │
│    ├─ 5a Email            ├─ 5b LinkedIn                                │
│    ├─ 5c Réponses         └─ 5d Séquences                               │
│                    ↓                                                     │
│  Agent 6 (NURTUREUR)    → Nurturing long terme                          │
│    ├─ 6a Email Nurture    ├─ 6b LinkedIn Passif                         │
│    └─ 6c Re-Scoreur                                                     │
│                                                                          │
│  ───── AGENTS TRANSVERSAUX ─────                                        │
│                                                                          │
│  Agent 7 (ANALYSTE)     → Analytics, anomalies, recommandations        │
│    ├─ 7a Collecteur       ├─ 7b Rapports                                │
│    ├─ 7c Anomalies        └─ 7d Recommandeur                            │
│                                                                          │
│  Agent 8 (DEALMAKER)    → Closing (devis → signature)                   │
│    ├─ 8a Devis            ├─ 8b Relances                                │
│    └─ 8c Signature                                                      │
│                                                                          │
│  Agent 9 (APPELS D'OFFRES) → Marchés publics (7 sous-agents)          │
│    ├─ 9a DCE Analyseur    ├─ 9b Qualificateur                           │
│    ├─ 9c Juriste          ├─ 9d Chiffreur                               │
│    ├─ 9e Rédacteur Mémoire├─ 9f Contrôleur QA                          │
│    └─ 9g Moniteur                                                       │
│                                                                          │
│  Agent 10 (CSM)         → Customer Success (5 sous-agents)              │
│    ├─ 10a Onboarding      ├─ 10b Upsell                                │
│    ├─ 10c Satisfaction     ├─ 10d Avis                                  │
│    └─ 10e Referral                                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Flux de Données Inter-Agents

```
FLUX PRINCIPAL (linéaire) :
Agent 1 → [BullMQ: enrichisseur-pipeline] → Agent 2
Agent 2 → [BullMQ: scoreur-pipeline] → Agent 3
Agent 3 → [BullMQ: redacteur-pipeline] → Agent 4
Agent 4 → [BullMQ: suiveur-pipeline] → Agent 5
Agent 5 → [BullMQ: nurturer-pipeline] → Agent 6

FLUX TRANSVERSAUX (feedback loops) :
Agent 5 (réponse INTERESSE) → [BullMQ: dealmaker-pipeline] → Agent 8
Agent 6 (re-classifié HOT) → [BullMQ: scoreur-pipeline] → Agent 3
Agent 8 (deal signé) → [BullMQ: csm-onboarding] → Agent 10
Agent 8 (deal perdu) → [BullMQ: nurturer-pipeline] → Agent 6
Agent 10 (upsell) → [BullMQ: dealmaker-pipeline] → Agent 8
Agent 10 (churn) → [BullMQ: nurturer-pipeline] → Agent 6
Agent 10 (referral) → [BullMQ: veilleur-pipeline] → Agent 1
Agent 1b (marché public score >= 60) → Agent 9

FLUX ANALYTIQUE (lecture seule) :
Agents 1-6, 8, 10 → [SQL Views matérialisées] → Agent 7

FLUX NOTIFICATIONS :
Tous les agents → [Slack API] → Jonathan (alertes, rapports, actions requises)
```

**Edge Cases du flux de données :**
- **Prospect détecté par plusieurs sources** : La déduplication est faite par Agent 1 MASTER avant dispatch vers Agent 2. Clé de dédup : SIRET + nom_entreprise + site_web. Si même SIRET détecté par LinkedIn et Job Boards, les signaux sont fusionnés
- **Prospect déjà client** : Agent 3 applique un hard disqualification (-100 points). Le prospect est archivé, jamais contacté
- **Prospect qui se désinscrit (RGPD opt-out)** : Blacklist anti-recontact vérifié à CHAQUE étape (Agent 4 avant rédaction, Agent 5 avant envoi, Agent 6 avant nurturing). Le prospect est supprimé de tous les traitements
- **Rate limit API atteint** : Chaque sous-agent a un circuit breaker avec backoff exponentiel (3 retries max). Si l'API est indisponible pendant >1h, alerte Slack à Jonathan

---

## 2. Détail Complet des 10 Agents MASTER

### Agent 1 — VEILLEUR (Monitoring & Lead Discovery)

**Mission :** Surveiller en continu 4 sources de données pour détecter des opportunités de prospection, dédupliquer les leads bruts, normaliser les données, et transmettre les leads qualifiés à l'Agent 2.

**Sous-agents :**

| ID | Nom | Source | Fréquence | Signaux Détectés |
|----|-----|--------|-----------|-----------------|
| 1a | Veilleur LinkedIn | LinkedIn (via Netrows, SignalsAPI) | 4x/jour (07h, 12h, 18h, 23h) | Changement de poste, recrutement, posts besoins tech, levées de fonds, croissance effectifs |
| 1b | Veilleur Marchés Publics | BOAMP, DECP, APProch | 2x/jour (06h, 14h) | Appels d'offres numériques (refonte web, SI, accessibilité) |
| 1c | Veilleur Web (Tech) | 100-500 sites web/nuit | 1x/jour (02h) | Performance Lighthouse mauvaise, stack obsolète, accessibilité non-conforme |
| 1d | Veilleur Job Boards | WTTJ, Indeed, LinkedIn Jobs, HelloWork | 1x/jour (06h) | Recrutement dev web actif, postes techniques ouverts |

**Output normalisé :**
```json
{
  "entreprise": {
    "nom": "TechCorp SAS",
    "siret": "12345678901234",
    "site_web": "https://techcorp.fr",
    "localisation": {"ville": "Lyon", "code_postal": "69001", "pays": "FR"}
  },
  "contact": {
    "linkedin_url": "https://linkedin.com/in/sophie-martin"
  },
  "signaux": [
    {
      "type": "recrutement_dev_web",
      "source": "wttj",
      "date_detection": "2026-03-23T06:15:00Z",
      "details": "Recherche Développeur React Senior - CDI",
      "score_signal": 22
    }
  ],
  "segment_estime": "PME_METRO",
  "pre_score": 65,
  "sources": ["wttj", "linkedin"],
  "nb_detections": 2
}
```

**Scheduling détaillé :**
```
02:00 UTC — 1c Veille Web : batch scan nocturne (100-500 sites)
06:00 UTC — 1b Marchés + 1d Job Boards : en parallèle
07:00 UTC — 1a LinkedIn : 1er pass quotidien
08:00 UTC — MASTER : consolidation batch 1 (dédup + normalisation + pré-score)
12:00 UTC — 1a LinkedIn : 2ème pass
14:00 UTC — 1b Marchés : 2ème pass
15:00 UTC — MASTER : consolidation batch 2
18:00 UTC — 1a LinkedIn : 3ème pass
21:00 UTC — MASTER : consolidation batch 3
23:00 UTC — 1a LinkedIn : 4ème pass
23:30 UTC — MASTER : rapport quotidien
```

**Budget mensuel :** ~430 EUR
- LinkedIn APIs (Netrows 99€ + SignalsAPI 99$ + n8n self-hosted 0€ + Hunter.io 12€) = ~204€
- Job Boards (Apify 49$ + HasData 50$ + WhoisFreaks 29$) = ~120€
- Web scanning (Lighthouse, Wappalyzer npm, axe-core) = 0€
- Marchés publics (BOAMP, DECP) = 0€
- Infrastructure partagée = ~40€

**Edge cases spécifiques :**
- **LinkedIn rate limiting** : Netrows impose 1000 requêtes/jour. Si atteint, les signaux LinkedIn sont retardés au lendemain
- **BOAMP indisponible** : Arrive ~2-3 fois/an pour maintenance. Les marchés sont rattrapés au prochain pass
- **Site web qui ne répond pas** : Timeout après 30s, marqué comme "scan_failed", réessayé au prochain batch
- **Faux positifs de signaux** : Un post LinkedIn "nous recrutons" peut être du contenu marketing, pas un vrai recrutement. Le pré-score aide à filtrer, mais des faux positifs passent (~10-15%)

---

### Agent 2 — ENRICHISSEUR (Data Enrichment)

**Mission :** Prendre les leads normalisés de l'Agent 1 et les enrichir avec des données complètes : contact décideur (email, téléphone), données entreprise (financières, légales, effectifs), et profil technique (stack, performance, accessibilité).

**Sous-agents :**

| ID | Nom | Rôle | APIs | Coût/mois |
|----|-----|------|------|-----------|
| 2a | Enrichisseur Contact | Trouver email + téléphone du décideur | Dropcontact (39€), Hunter.io (49$), ZeroBounce (16$), Kaspr (79€) | 183€ |
| 2b | Enrichisseur Entreprise | Données financières, légales, effectifs | INSEE Sirene (gratuit), Pappers (25€), Societe.com (40€), BODACC (gratuit) | 65€ |
| 2c | Enrichisseur Technique | Stack technique, performance, accessibilité | Wappalyzer API (30€), Lighthouse (gratuit), axe-core (gratuit) | 30€ |

**Stratégie Waterfall de l'Agent 2a (recherche de contact) :**

L'enrichissement de contact suit une cascade de 6 étapes, chaque étape n'est exécutée que si la précédente échoue :

```
Étape 0: Vérifier si le contact fourni est le bon décideur (par regex de titre)
   ↓ (échec)
Étape 1: Dropcontact (primaire — 30-120s async, ~98% succès France)
   ↓ (échec)
Étape 2: Hunter Domain Search (1-5s, 35-40% succès)
   ↓ (échec)
Étape 3: Hunter Email Finder (1-10s si nom connu, ~70% succès)
   ↓ (échec)
Étape 4: Pattern Matching + vérification SMTP (5-30s)
   Génère 10 patterns d'email et teste via SMTP RCPT TO
   Patterns par fréquence France:
   1. prenom.nom (48%)   2. prenom (35%)      3. p.nom (18%)
   4. prenomnom (12%)     5. prenom_nom (8%)   6. prenom.n (6%)
   7. nomprénom (5%)      8. nom.prenom (5%)   9. pn (2%)
   10. nom (2%)
   ↓ (échec)
Étape 5: ZeroBounce Verification (1-3s, classifie le statut email)
   ↓ (en parallèle)
Étape 6: Kaspr Telephone (2-5s, ~70% couverture EU)
```

**Mapping décideur par segment :**
| Segment | Décideurs prioritaires |
|---------|----------------------|
| PME Métro | CMO, Directeur Marketing, DG, CTO, DSI |
| E-commerce Shopify | Founder, Head of Growth, CMO, CEO |
| Collectivités | DGS, DSI, Directeur Numérique, Élu délégué numérique |
| Startups | Founder, CEO, CTO, Head of Growth |
| Agences Web (White Label) | Fondateur, CEO, Directeur, Account Manager |

**Budget mensuel :** ~278 EUR

**Edge cases :**
- **Entreprise sans site web** : Agent 2c skippé. Complétude réduite mais pas bloquant
- **Catch-all email** : Certains domaines acceptent tout. ZeroBounce détecte ce cas. L'email est marqué "catch_all" avec confiance réduite (-5 points au scoring)
- **Données INSEE périmées** : Les données Sirene sont mises à jour mensuellement par l'INSEE. Pour les entreprises très récentes (<3 mois), les données peuvent être incomplètes
- **Non-redondance avec Agent 1c** : Agent 2c vérifie si source='veille_web' OU si le dernier scan technique date de <30 jours. Si oui, skip pour éviter les doublons de requêtes API

---

### Agent 3 — SCOREUR (Lead Scoring & Categorization)

**Mission :** Scorer chaque prospect enrichi sur 4 axes avec un modèle 100% déterministe (pas de ML), catégoriser en HOT/WARM/COLD/DISQUALIFIÉ, et router vers l'Agent 4 avec la priorité appropriée.

**Aucun sous-agent** — moteur de scoring monolithique.

**Modèle de scoring 4 axes :**

```
SCORE TOTAL = clamp(0, 100, Axe1 + Axe2 + Axe3 + Axe4 + ScoringNégatif)

AXE 1 — ICP FIT (35 pts max)
├── Taille entreprise (10 pts) : 50-250 employés + 2M-25M€ CA = 10pts (idéal PME)
├── Secteur d'activité (10 pts) : E-commerce/Retail/SaaS/Tech = 10pts
├── Localisation (8 pts) : France métro = 8pts, DOM-TOM = 7pts, Belg/Suisse = 6pts
└── Profil décideur (7 pts) : C-Level = 7pts, VP/Dir = 6pts, Manager = 3pts

AXE 2 — SIGNAL D'INTENTION (30 pts max, avec décroissance temporelle)
├── Levée de fonds : 30pts, demi-vie 45j
├── Changement de poste : 28pts, demi-vie 60j
├── Marché public : 25pts, demi-vie 30j
├── Recrutement actif : 22pts, demi-vie 45j
├── Post besoin tech : 20pts, demi-vie 30j
├── Site lent / accessibilité faible / tech obsolète : 15pts, demi-vie 90-120j
└── Formule de décroissance : score(t) = score_base × (0.5)^(t / demi_vie)

    Multi-signal : Signal1 = 100%, Signal2 = 50%, Signal3 = 25%, Signal4+ = 10%
    Bonus +3pts si 3+ détections. Plafond : 30pts max.

AXE 3 — DONNÉES TECHNIQUES (20 pts max)
├── Performance Lighthouse (8 pts) : 0-29 = 8pts (catastrophique), 90-100 = 0pts
├── Stack obsolète (6 pts) : WordPress <6.0 = 3pts, Joomla = 3pts, pas de JS moderne = 2pts
└── Accessibilité RGAA (6 pts) : Non-conforme + 5+ violations = 6pts
    Bonus collectivité : +2pts extra (RGAA obligatoire)

AXE 4 — ENGAGEMENT (15 pts max)
├── Email vérifié : 2pts
├── Téléphone trouvé : 1pt
├── LinkedIn engagement : 3pts
├── Multi-source (nb_detections >= 2) : 2pts
└── Complétude data >= 80% : 2pts

SCORING NÉGATIF
├── Hard disqualification (-100 → score = 0) :
│   Procédure collective, entreprise fermée, RGPD opt-out, concurrent,
│   client existant, pays sanctionné, secteur interdit
└── Soft malus :
    CA < 50K€ = -15pts, CA en baisse >20% = -10pts, effectifs en baisse = -5pts,
    email non trouvé = -10pts, email catch-all = -5pts, email perso = -8pts,
    pas de décideur = -10pts, pas de signal = -5pts, enrichissement <40% = -5pts
```

**Coefficients par segment (multiplicateurs sur les axes) :**
| Segment | Axe1 | Axe2 | Axe3 | Axe4 | Bonus |
|---------|------|------|------|------|-------|
| PME Métro (baseline) | 1.0 | 1.0 | 1.0 | 1.0 | — |
| E-commerce Shopify | 0.85 | 1.0 | 1.15 | 1.1 | +5pts Shopify, +3pts WooCommerce |
| Collectivité | 1.2 | 0.9 | 1.1 | 0.7 | +5pts marché public, +3pts RGAA non-conforme |
| Startup | 0.8 | 1.2 | 0.9 | 1.2 | +5pts levée <60j, +3pts CA growth >30% |
| Agence Web | 0.9 | 1.0 | 1.1 | 1.1 | — |

**Catégorisation :**
| Catégorie | Score | % estimé | Action |
|-----------|-------|----------|--------|
| HOT-A | 90-100 | ~2% | Contact dans l'heure |
| HOT-B | 80-89 | ~3% | Contact dans 2 heures |
| HOT-C | 75-79 | ~5% | Séquence premium automatisée |
| WARM | 50-74 | ~30% | Séquences auto, gaps 3-8 jours |
| COLD | 25-49 | ~40% | Nurturing long terme |
| DISQUALIFIÉ | 0-24 | ~20% | Archivé, aucune action |

**Recalcul quotidien :** Cron à 04:00 UTC pour recalculer tous les scores (la décroissance temporelle change les scores chaque jour)

**Edge cases du scoring :**
- **Prospect sans aucun signal** : Axe2 = 0, mais peut encore avoir 35+20+15 = 70 points max sur les autres axes. Un prospect PME métro parfait en ICP avec stack obsolète mais sans signal intentionnel peut être WARM (score ~55-65)
- **Signal très ancien** : Un signal de levée de fonds vieux de 90 jours a perdu 75% de sa valeur (demi-vie 45j, 2 demi-vies écoulées). Score résiduel = 30 × 0.25 = 7.5 pts
- **Conflit de données** : Si Dropcontact dit "CMO" et Hunter dit "Marketing Manager", le titre avec la confiance la plus élevée est retenu
- **Entreprise avec procédure collective partielle** : Hard disqualification quand même. Le risque de non-paiement est trop élevé

**Feedback et calibration :**
- Après les phases de prospection, les résultats (réponses, conversions, deals signés) sont injectés dans le modèle
- Métriques suivies : precision_hot (% des HOT qui répondent), recall (% des réponses qui étaient HOT), f1_score, taux de conversion par catégorie
- Si precision < 30% ou recall < 50% → ajustement des règles de scoring
- Phase future (mois 4-6) : transition vers un modèle ML entraîné sur les données collectées

---

### Agent 4 — REDACTEUR (Message Composition)

**Mission :** Recevoir les prospects scorés et générer des messages d'outreach personnalisés (email + LinkedIn) en utilisant Claude API. Valider la qualité et la délivrabilité avant transmission à l'Agent 5.

**Sous-agents :**

| ID | Nom | Rôle | LLM | Contraintes |
|----|-----|------|-----|-------------|
| 4a | Rédacteur Email | Génération email froid personnalisé | Claude Sonnet 4, temp 0.7 | Sujet: 36-50 chars, Corps: 40-125 mots |
| 4b | Rédacteur LinkedIn | Messages LinkedIn (connexion, DM, commentaire) | Claude Sonnet 4, temp 0.7 | Connexion: max 300 chars, DM: max 500 chars |
| 4c | Calculateur Impact | Quantification ROI prospect-spécifique | Déterministe (formules) | Sélection de l'angle avec le plus fort impact monétaire |

**Formules du Calculateur d'Impact (4c) :**

```
IMPACT PERFORMANCE :
  Taux de rebond = 9.56 × ln(temps_chargement) + 7
  Perte de conversion = -7% par seconde au-delà de 2s
  Mapping Lighthouse : 90+ = 0%, 70-89 = -5%, 50-69 = -12%, <50 = -25%

IMPACT ATTRIBUTION :
  Tracking server-side (GTM/GA4) : 5% de perte vs client-side : 25% de perte
  Budget pub concerné : 20% startups, 15% e-commerce, 10% PME

IMPACT RGAA (accessibilité) :
  Score accessibilité → critères non-conformes estimés
  Coût par critère à corriger : 200-350€
  95→5 critères, 85→15, 70→25, 50→40, 30→55

IMPACT ABANDON PANIER :
  Taux par temps : <2s=65%, 2-3s=70%, 3-5s=78%, >5s=85%
  Taux de récupération via re-engagement : 20%
```

**Personnalisation par segment :**
| Segment | Angle privilégié | Ton |
|---------|-----------------|-----|
| PME Métro | Comparaison performance vs concurrent | Professionnel |
| E-commerce Shopify | Optimisation post-migration, taux conversion | Dynamique, orienté résultats |
| Collectivités | Conformité RGAA, obligation légale | Formel, vouvoiement |
| Startups | Métriques post-levée, growth | Pair-à-pair, tutoiement |
| Agences Web (WL) | Scaling white-label, partenariat | Partenaire |

**Validation avant envoi :**
- Longueur du sujet (36-50 chars)
- Nombre de mots du corps (40-125)
- Détection de mots spam (gratuit, offre exclusive, promotion, etc.)
- Vérification d'hallucination (le nom de l'entreprise est-il correct ?)
- Retry avec température descendante : 0.7 → 0.55 → 0.4 (max 3 tentatives)
- Si toutes les tentatives échouent → fallback template hardcodé

**Coût par message :** ~0.0054 USD (1050 tokens input @3$/M + 150 tokens output @15$/M)
**Budget mensuel :** ~12€ (5000 messages × 0.0054$ ÷ taux de change)

**Edge cases :**
- **Claude API indisponible** : Fallback immédiat vers template statique avec variables de personnalisation basiques (prénom, entreprise, signal principal)
- **Prospect sans données techniques** : L'angle performance/RGAA est impossible. Fallback vers angle ICP (taille entreprise, secteur)
- **Même prospect contacté par email ET LinkedIn** : Le contenu est cohérent mais différent pour ne pas paraître robotique. Le sujet email et la note LinkedIn utilisent des angles complémentaires

---

### Agent 5 — SUIVEUR (Campaign Execution & Response Management)

**Mission :** Moteur d'exécution. Reçoit les messages prêts de l'Agent 4, exécute les campagnes multicanal (email + LinkedIn), détecte les réponses entrantes, les classifie avec Claude AI, gère les séquences automatisées avec gaps progressifs, et notifie Jonathan des événements importants.

**Sous-agents :**

| ID | Nom | Rôle | Outil | SLA |
|----|-----|------|-------|-----|
| 5a | Email Executor | Envoi via Gmail API + Mailgun | Gmail OAuth, Mailgun API | Bounce <3%, spam <0.3% |
| 5b | LinkedIn Executor | Connexions + messages via Waalaxy | Waalaxy API | 25 connexions/jour max, 80 messages/jour |
| 5c | Response Classifier | Détection + classification des réponses | Gmail Watch (Pub/Sub), Claude API | HOT: notification <5min |
| 5d | Sequence Manager | Orchestration séquences multi-touch | BullMQ, moment-timezone | Gaps croissants, jours ouvrés |

**Classification des réponses (Agent 5c) — 8 catégories :**

| Catégorie | Action | SLA notification |
|-----------|--------|-----------------|
| INTERESSE | Stop séquence, notifier | < 5 minutes |
| INTERESSE_SOFT | Pause séquence, notifier | < 1 heure |
| PAS_MAINTENANT | Stop, planifier reprise (date donnée ou J+30) | < 8 heures |
| PAS_INTERESSE | Stop tout, supprimer prospect | Aucune |
| MAUVAISE_PERSONNE | Créer lead référé, notifier | < 8 heures |
| DEMANDE_INFO | Pause, notifier | < 8 heures |
| OUT_OF_OFFICE | Pause, reprendre J+2 après retour (ou J+14 défaut) | Aucune |
| SPAM | Archiver silencieusement | Aucune |

**Séquences à gaps croissants (Agent 5d) :**
| Catégorie | Gaps entre étapes | Heures optimales |
|-----------|-------------------|-----------------|
| HOT | [0, 2, 5, 10] jours | Mardi-Jeudi 8-10h |
| WARM | [0, 3, 7, 14, 21] jours | Mardi-Jeudi 8-10h |
| COLD | [0, 3, 7, 14, 21, 30, 45] jours | Mardi-Jeudi 8-10h |

**Jours fériés exclus :** 1er jan, 1er mai, 8 mai, 14 jul, 15 août, 1er nov, 11 nov, 25 déc, lundi Pâques, Ascension, lundi Pentecôte. La Réunion : +20 déc.
**Périodes creuses (volume -50%) :** 22 déc-3 jan, 15 jul-31 août, semaine Ascension.

**Domaines email :**
- axiom-marketing.fr (PRINCIPAL — JAMAIS pour cold outreach)
- axiom-agency.com (cold outreach domaine 1)
- axiom-growth.fr (cold outreach domaine 2)
- [3ème domaine à définir]
- Throttling : 50 emails/jour/domaine, 10/heure, 6 min entre envois
- Monitoring : bounce_rate <3%, spam_rate <0.3%

**Budget mensuel :** ~150 EUR

**Edge cases :**
- **Bounce dur** : Email supprimé immédiatement, toutes les étapes suivantes annulées. Le prospect est marqué "email_invalide"
- **Restriction LinkedIn** : Détection en temps réel (>30% actions échouées OU >3 rate-limited en 24h). Pause immédiate 48h → reprise manuelle à 10/jour pendant 7 jours → retour graduel sur 30 jours
- **Réponse ambiguë** : Si la confiance de classification Claude est <0.6, le message est routé vers une file de revue manuelle pour Jonathan
- **Double réponse** : Si un prospect répond sur email ET LinkedIn, seule la première réponse déclenche l'action. La seconde est loguée mais n'a pas d'effet

---

### Agent 6 — NURTUREUR (Long-Term Relationship Guardian)

**Mission :** Gérer les prospects qui n'ont pas converti après la séquence Agent 5. Maintenir l'engagement par du contenu de valeur, de l'engagement LinkedIn passif, et du re-scoring périodique. Transformer les COLD/WARM en HOT sans être intrusif.

**Sous-agents :**

| ID | Nom | Rôle | Fréquence |
|----|-----|------|-----------|
| 6a | Email Nurture | Séquences comportementales par segment | Max 2 emails/semaine, ratio 3:1 valeur:promo |
| 6b | LinkedIn Passif | Likes/commentaires sur posts prospects | Max 3 interactions/semaine/prospect, scan 2x/jour (9h, 15h) |
| 6c | Re-Scoreur Périodique | Scan mensuel signaux business + engagement | Mensuel (tous), bi-hebdo (WARM), immédiat (triggers) |

**Parcours nurturing (3 étapes) :**
```
Awareness → Consideration (sur clic) → Decision (sur engagement soutenu)
```

**Engagement scoring (Agent 6c) :**
- Formule : 60% signaux business + 40% engagement
- Signaux business : recrutement (+15pts), levée (+25pts), changement tech (+10pts), contrat public (+12pts), news (+5-20pts)
- Seuils de reclassification : HOT >= 75, WARM 40-74, COLD < 40
- Triggers immédiats : visite page tarifs, réponse email, 3+ interactions en 7 jours

**Politique de sunset :**
- Max 12 mois de nurturing
- Décroissance engagement : -1 à -20 points selon durée d'inactivité
- Après 180 jours sans activité : nettoyage automatique

**Budget mensuel :** ~37 EUR

**Edge cases :**
- **Prospect qui ouvre tous les emails mais ne clique jamais** : L'engagement est faible malgré les ouvertures. Le re-scoreur ne requalifie pas en HOT sans signal de clic ou d'interaction LinkedIn
- **Prospect qui change d'entreprise** : Détecté par scan LinkedIn. Deux options : (1) suivre la personne dans sa nouvelle entreprise (si elle matche l'ICP), (2) qualifier la nouvelle entreprise comme lead séparé
- **Opt-out d'un prospect nurturé** : Suppression immédiate de tous les traitements. Ajout au blacklist anti-recontact. Vérification du blacklist avant chaque email envoyé

---

### Agent 7 — ANALYSTE (Pipeline Analytics & Intelligence)

**Mission :** Cerveau analytique du pipeline. Mesure la performance de chaque étape, détecte les anomalies et goulots d'étranglement, recommande des ajustements concrets aux autres agents. NE contacte PAS de prospects, NE modifie PAS le scoring, NE touche PAS aux templates.

**Sous-agents :**

| ID | Nom | Rôle | Fréquence |
|----|-----|------|-----------|
| 7a | Collecteur | Snapshots SQL quotidiens sur TOUTES les tables | 21:30 UTC |
| 7b | Générateur Rapports | Digest quotidien, hebdo, mensuel | 22:00 (daily), lundi 9:00 (weekly), 1er du mois (monthly) |
| 7c | Détecteur Anomalies | Analyse Z-score sur 10 métriques clés | Horaire (critique), quotidien (warning) |
| 7d | Recommandeur | Recommandations actionnables + A/B test | Hebdo (lundi 9:30) |

**Seuils d'alerte anomalies :**
| Sévérité | Seuil Z-score | Action |
|----------|--------------|--------|
| WARNING | > 1.5σ | Log + notification Slack #pipeline-metrics |
| CRITICAL | > 2.5σ | Alerte immédiate Slack #alerts-critical + SMS |

**Métriques suivies (60+ par jour) :**
- Par agent : leads générés, taux d'enrichissement, distribution des scores, taux d'ouverture/clic/réponse, taux de reclassification, win rate, deal velocity
- Pipeline global : funnel conversion à chaque étape, attribution multi-touch, pipeline coverage ratio, CAC, LTV, forecast accuracy

**Budget mensuel :** ~50 EUR (Claude API pour rapports et résumés + Slack API + infrastructure partagée Metabase)

---

### Agent 8 — DEALMAKER (Closing Engine)

**Mission :** Moteur de closing. Prend le relais après qu'un prospect réponde positivement (classifié "INTERESSE" par Agent 5) ET que Jonathan ait conduit un rendez-vous de découverte. Automatise le processus complet de closing : devis personnalisé → relances → signature électronique.

**Sous-agents :**

| ID | Nom | Rôle | Outil principal |
|----|-----|------|----------------|
| 8a | Générateur de Devis | Crée des devis Bronze/Silver/Gold en <30s | Puppeteer PDF + Claude API |
| 8b | Relanceur de Deals | Séquences post-devis J3/J7/J14 | Gmail API + Claude |
| 8c | Gestionnaire Signature | Workflow e-signature | Yousign API V3 |

**Pipeline CRM en 7 étapes :**
```
QUALIFIED → QUOTED → CONSIDERATION → NEGOTIATION → READY_TO_SIGN → SIGNED → LOST
```

**Flux de sortie :**
- Deal signé → Agent 10 (CSM) via `csm-onboarding`
- Deal perdu → Agent 6 (Nurtureur) pour séquence win-back
- Métriques → Agent 7 via DB writes

**KPIs cibles :**
| KPI | Cible |
|-----|-------|
| Win Rate | 35-40% |
| Deal Velocity | 3,250 EUR/jour |
| Taille moyenne deal | 10,000-13,000 EUR |
| Cycle time | 30-40 jours |
| Devis → Signature | 35-40% |
| Time to quote | < 2 heures |

**Budget mensuel :** ~60 EUR

---

### Agent 9 — APPELS D'OFFRES (Public Tender Response)

**Mission :** Analyser, qualifier, préparer et soumettre les réponses aux appels d'offres publics (DCE/BOAMP). Gérer le cycle complet du DCE reçu au suivi post-soumission.

**Sous-agents (7 — le plus complexe) :**

| ID | Nom | Rôle | Exécution |
|----|-----|------|-----------|
| 9a | Analyseur DCE | Parse RC/CCTP/CCAP, extrait exigences | Séquentiel (premier) |
| 9b | Qualificateur | Score GO/NO-GO sur 7 critères (100 pts) | Séquentiel (après 9a) |
| 9c | Juriste | Valide DC1/DC2/DUME, vérifie conformité | Parallèle (avec 9d, 9e) |
| 9d | Chiffreur | BPU/DQE/DPGF, positionnement tarifaire | Parallèle (avec 9c, 9e) |
| 9e | Rédacteur Mémoire | Rédige mémoire technique répondant au CCTP | Parallèle (avec 9c, 9d) |
| 9f | Contrôleur QA | Revue finale du dossier complet | Séquentiel (après 9c+9d+9e) |
| 9g | Moniteur | Suivi post-dépôt, RETEX | Continu (90+ jours) |

**Workflow :**
```
J-31: 9a (analyse DCE) → 9b (GO/NO-GO)
J-15: Si GO → [9c + 9d + 9e] en parallèle
J-2:  9f (validation QA)
J-1/J0: Soumission
J+1 à J+90: 9g (monitoring)
```

**Seuils de décision GO/NO-GO :**
| Score | Décision |
|-------|----------|
| > 70 | GO |
| 50-70 | POSSIBLE (notification Jonathan) |
| 40-50 | REEXAMINE |
| < 40 | NO-GO |

**Budget mensuel :** ~30 EUR (principalement Claude Vision pour l'analyse de PDFs)

---

### Agent 10 — CSM (Customer Success Manager)

**Mission :** Gardien post-vente. Prend le relais immédiatement après la signature du contrat (webhook Yousign de l'Agent 8). Gère l'ensemble du cycle de vie client : onboarding, satisfaction, upsell, rétention, collecte d'avis, et programme de parrainage.

**Sous-agents :**

| ID | Nom | Rôle | Timing |
|----|-----|------|--------|
| 10a | Onboarding | Séquence welcome J1-J30, kick-off, formation | J1-J30 post-signature |
| 10b | Détecteur Upsell | Score d'opportunité 80pts, matrice cross-sell 14 services | Continu |
| 10c | Satisfaction | Health Score composite (40% engagement + 30% satisfaction + 30% growth) | Quotidien |
| 10d | Collecteur Avis | Demandes avis sur 5 plateformes | J+5-15 post-livraison |
| 10e | Gestionnaire Referral | Programme ambassadeur, commissions | Continu |

**Health Score :**
| Niveau | Score | Action |
|--------|-------|--------|
| Vert | 80-100 | Normal — demander avis + referral |
| Jaune | 60-79 | Attention — check-in proactif |
| Orange | 50-59 | Risque — intervention ciblée |
| Orange foncé | 30-49 | Critique — escalade Jonathan |
| Rouge | 0-29 | Urgence — appel immédiat |

**Programme Referral (10e) :**
| Tier | ACV | Commission | Bonus rétention |
|------|-----|-----------|----------------|
| Tier 1 | < 15K€ | 20% | +5% |
| Tier 2 | 15K-40K€ | 15% | +5% |
| Tier 3 | > 40K€ | 10% | +5% |

**Budget mensuel :** 125-255 EUR (Typeform, Gmail, intégrations plateformes avis)

---

## 3. État de l'Art Technologique (2025-2026)

### 3.1 Frameworks d'Orchestration Multi-Agents

| Framework | Type | Forces | Faiblesses | Recommandé pour |
|-----------|------|--------|------------|----------------|
| **LangGraph** | Code-first SDK | Contrôle précis via graphes d'états, stateful, 25-35s/workflow | Courbe d'apprentissage élevée | Systèmes complexes avec 10+ agents |
| **CrewAI** | Role-based | YAML simple, collaboration autonome | 56% plus de tokens que LangGraph, debugging limité | Prototypage rapide |
| **n8n** | Visual/Low-code | 1000+ intégrations, self-hosted, JS custom | Limité pour logique agent complexe | Orchestration business + intégrations |
| **AutoGen/Semantic Kernel** | Enterprise | Multi-langage, Azure natif, merger en cours | Complexe, dépendant Microsoft | Écosystème Azure |
| **Temporal.io** | Workflow engine | Replay déterministe, fault tolerance, audit | Cluster séparé à gérer | Workflows critiques nécessitant fiabilité |
| **Inngest** | Serverless | Zéro infra, event-driven, auto-retry | Moins de contrôle fin | Alternative serverless à Temporal |
| **Dify** | Visual builder | Web IDE, drag-and-drop, RAG intégré | Moins flexible que code | Démo et POC rapides |

**Statistiques marché :**
- Marché global des agents IA : 7.84B$ en 2025, projeté 52.62B$ en 2030 (CAGR 46.3%)
- ~400 entreprises utilisent LangGraph Platform (Cisco, Uber, LinkedIn, BlackRock, JPMorgan)

### 3.2 MCP — Model Context Protocol (Standard Émergent)

Spécification publiée en novembre 2025 par Anthropic, donné à la Linux Foundation en décembre 2025 :
- **Tasks Primitive** : Opérations asynchrones long-running avec suivi de progression
- **JSON-RPC 2.0** : Protocole de base avec connexions stateful
- **Fonctionnalités serveur** : Resources, Prompts, Tools
- **Fonctionnalités client** : Sampling, Roots, Elicitation
- **Roadmap 2026** : Scalabilité transport, cycle de vie communication agent (retry, expiry), enterprise readiness

### 3.3 Patterns de Communication Inter-Agents

| Pattern | Description | Use Case |
|---------|-------------|----------|
| Message Queue | 1 producteur → 1 consommateur | Agent-to-agent direct |
| Pub/Sub | 1 producteur → N consommateurs | Diffusion événements |
| Event Streams | Log durable, rejouable | Audit trail, reconstruction d'état |
| Shared State/Blackboard | Agents R/W sur mémoire partagée | État courant partagé |
| Hybrid (recommandé) | Redis (hot) + PostgreSQL (cold) | Production |

### 3.4 Fiabilité des Systèmes Multi-Agents

**Statistiques critiques :**
- **41-86.7%** de taux d'échec sur 1,642 traces d'exécution dans 7 systèmes SOTA
- **79%** des échecs viennent de la coordination/spécification, PAS de la qualité du modèle
- **17x** amplification d'erreurs dans les systèmes "bag of agents" (non structurés) vs 4.4x dans les systèmes orchestrés

**Patterns essentiels en production :**
1. **Schemas typés à chaque frontière** : JSON Schema strict, unions discriminées
2. **Agent Juge indépendant** : Un agent dédié valide les outputs des autres
3. **Idempotency tokens** : Prévention des retries ambigus et actions dupliquées
4. **Protocole de handoff explicite** : Agents déclarent leurs cibles de transmission à l'avance
5. **Contrats de communication structurés** : Traiter les agents comme des systèmes distribués, pas des interfaces chat

### 3.5 LLM — Pricing et Optimisation (mars 2026)

| Modèle | Input | Output | Meilleur pour |
|--------|-------|--------|--------------|
| Claude Opus 4.6 | $5/MTok | $25/MTok | Raisonnement complexe (analyse DCE) |
| Claude Sonnet 4.6 | $3/MTok | $15/MTok | Meilleur rapport qualité/prix (rédaction) |
| Claude Haiku 4.5 | $1/MTok | $5/MTok | High-throughput (classification réponses) |
| GPT-5.2 | $1.75/MTok | $14/MTok | Raisonnement multimodal |

**Stratégies d'optimisation (60-80% de réduction possible) :**
1. **Model routing** : 70% Haiku, 20% Sonnet, 10% Opus → coût effectif -85%
2. **Prompt caching** : Réduction jusqu'à 90% pour system prompts répétés
3. **Batch processing** : -50% via OpenAI Batch API pour tâches non temps réel
4. **Gestion de context window** : Résumé des anciennes conversations avant nouveaux tours

### 3.6 Sources de Données Gratuites (France)

| Source | API | Données | Coût |
|--------|-----|---------|------|
| BOAMP | api.gouv.fr | Annonces marchés publics | Gratuit |
| INSEE Sirene | api.gouv.fr | Données entreprises (SIRET, effectifs, activité) | Gratuit |
| annuaire-entreprises.data.gouv.fr | REST | Données légales entreprises | Gratuit |
| BODACC | data.gouv.fr | Bulletin officiel (procédures, cessions) | Gratuit |
| DECP | data.gouv.fr | Données essentielles commande publique | Gratuit |
| Lighthouse CLI | npm | Scores performance web | Gratuit |
| Wappalyzer | npm | Détection stack technique | Gratuit |
| axe-core | npm | Audit accessibilité RGAA | Gratuit |

---

## 4. Questions Soulevées par l'Exploration

1. **Complexité architecturale** : 40+ sous-agents — est-ce que le système devient ingérable ?
2. **Dépendances API** : ~15 APIs externes — quelle résilience si l'une tombe ?
3. **Ordre de développement** : Par quel agent commencer ? Quelle est la dépendance critique ?
4. **Infrastructure** : Self-hosted vs cloud ? VPS unique vs microservices ?
5. **Coût LLM** : Model routing (Haiku/Sonnet/Opus) pour optimiser 60-80% — comment implémenter ?
6. **Scraping LinkedIn** : Risques légaux et de ban avec Waalaxy/Netrows ? Alternative RGPD-compliant ?
7. **RGPD** : Conformité du stockage des données de prospection ? Précédent Kaspr/CNIL ?
8. **Domaines email** : Comment warm-up 3 domaines en parallèle ? Quel service ?
9. **Observabilité** : Aucune mention de monitoring LLM dans les specs — comment tracer les appels Claude ?
10. **Test du funnel** : Les taux de conversion annoncés sont-ils validés ou théoriques ?

---

*Phase 1 complète. Ces découvertes sont passées au crible dans la Phase 2 (Challenge).*
