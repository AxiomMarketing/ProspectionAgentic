# SPECIFICATIONS DETAILLEES — 7 AGENTS DE PROSPECTION AXIOM

**Date** : 18 mars 2026
**Contexte** : Tout est developpe en interne. Stack : Claude API, n8n, AdonisJS, React, PostgreSQL, scraping custom.
**Principe** : Chaque agent a une mission claire, des inputs precis, un processus detaille, et des outputs structures.

---

## VISION GLOBALE

```
                         ┌──────────────────────────────────────┐
                         │        BASE DE DONNEES CENTRALE      │
                         │           (PostgreSQL)               │
                         │                                      │
                         │  prospects / entreprises / signaux   │
                         │  sequences / interactions / scores   │
                         │  marches_publics / templates         │
                         └──────────┬───────────────────────────┘
                                    │
        ┌───────────────┬───────────┼───────────┬───────────────┐
        │               │           │           │               │
   ┌────▼────┐    ┌─────▼────┐ ┌────▼────┐ ┌───▼─────┐  ┌─────▼─────┐
   │ AGENT 1 │    │ AGENT 2  │ │ AGENT 3 │ │ AGENT 4 │  │ AGENT 5   │
   │ VEILLEUR│───→│ENRICHISS.│→│ SCOREUR │→│REDACTEUR│─→│ SUIVEUR   │
   └─────────┘    └──────────┘ └─────────┘ └─────────┘  └─────┬─────┘
                                                               │
                                                    ┌──────────┼──────────┐
                                                    │                     │
                                              ┌─────▼─────┐       ┌─────▼─────┐
                                              │ AGENT 6   │       │ AGENT 7   │
                                              │ NURTUREUR │       │ ANALYSTE  │
                                              └───────────┘       └───────────┘
```

**Flux principal** :
1. Le VEILLEUR detecte un signal ou un nouveau lead
2. L'ENRICHISSEUR complete la fiche avec toutes les donnees necessaires
3. Le SCOREUR attribue un score et decide du traitement (HOT / WARM / COLD)
4. Le REDACTEUR ecrit le message personnalise adapte au canal et au score
5. Le SUIVEUR gere la sequence (quand envoyer quoi, relances, escalade)
6. Le NURTUREUR prend en charge les non-convertis pour les rechauffer
7. L'ANALYSTE mesure tout et recommande des ajustements

**Regle absolue** : Jonathan et Marty ne touchent que 2 choses :
- Valider l'envoi des messages HOT (prospects a forte valeur)
- Prendre les appels decouverte et closer

Tout le reste est automatise.

---

## SCHEMA DE LA BASE DE DONNEES CENTRALE

Avant de detailler les agents, voici la structure de donnees que tous partagent :

```sql
-- Table principale des prospects
CREATE TABLE prospects (
  id              SERIAL PRIMARY KEY,
  statut          VARCHAR(20) DEFAULT 'nouveau',
    -- nouveau | enrichi | score | contacte | en_sequence |
    -- rdv_pris | proposition | gagne | perdu | nurture
  score           INTEGER DEFAULT 0,
  categorie       VARCHAR(10),  -- HOT | WARM | COLD
  segment         VARCHAR(50),  -- pme_metro | ecommerce_shopify |
                                -- collectivite | startup | agence_wl

  -- Contact
  prenom          VARCHAR(100),
  nom             VARCHAR(100),
  email           VARCHAR(255),
  telephone       VARCHAR(20),
  linkedin_url    VARCHAR(500),
  poste           VARCHAR(200),

  -- Entreprise
  entreprise      VARCHAR(200),
  siret           VARCHAR(20),
  site_web        VARCHAR(500),
  secteur         VARCHAR(100),
  taille          VARCHAR(50),   -- 1-10 | 10-50 | 50-200 | 200-500 | 500+
  ca_estime       VARCHAR(50),
  localisation    VARCHAR(200),

  -- Donnees techniques (enrichies)
  stack_tech      JSONB,         -- {cms: "wordpress", framework: null, ...}
  lighthouse_score INTEGER,
  rgaa_conforme   BOOLEAN,
  temps_chargement FLOAT,

  -- Signaux detectes
  signaux         JSONB,         -- [{type: "recrutement", detail: "cherche dev react", date: "..."}]
  signal_principal VARCHAR(200),
  date_signal     TIMESTAMP,

  -- Suivi prospection
  source          VARCHAR(50),   -- veille_linkedin | veille_boamp | veille_jobboard |
                                 -- veille_web | referral | inbound | annuaire
  canal_prefere   VARCHAR(20),   -- email | linkedin | phone | multicanal
  sequence_id     INTEGER,
  nb_contacts     INTEGER DEFAULT 0,
  dernier_contact TIMESTAMP,
  prochaine_action VARCHAR(200),
  date_prochaine  TIMESTAMP,

  -- Meta
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- Historique de toutes les interactions
CREATE TABLE interactions (
  id              SERIAL PRIMARY KEY,
  prospect_id     INTEGER REFERENCES prospects(id),
  type            VARCHAR(30),   -- email_envoye | email_ouvert | email_repondu |
                                 -- linkedin_connexion | linkedin_message |
                                 -- linkedin_accepte | linkedin_repondu |
                                 -- appel | rdv | proposition | signature
  canal           VARCHAR(20),   -- email | linkedin | phone | visio
  contenu         TEXT,           -- le message envoye ou recu
  template_id     VARCHAR(50),   -- reference au template utilise
  resultat        VARCHAR(30),   -- envoye | ouvert | clique | repondu | ignore | refuse
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Marches publics detectes
CREATE TABLE marches_publics (
  id              SERIAL PRIMARY KEY,
  reference       VARCHAR(100),
  titre           TEXT,
  acheteur        VARCHAR(200),
  type            VARCHAR(30),   -- mapa | ao_ouvert | ao_restreint | accord_cadre
  montant_estime  DECIMAL,
  date_limite     TIMESTAMP,
  url_source      VARCHAR(500),
  plateforme      VARCHAR(50),   -- boamp | france_marches | place | aws
  mots_cles       JSONB,
  score_pertinence INTEGER,      -- 0-100
  decision        VARCHAR(20),   -- a_qualifier | go | no_go | en_cours | soumis | gagne | perdu
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Templates de messages
CREATE TABLE templates (
  id              VARCHAR(50) PRIMARY KEY,  -- ex: "challenger_sale_v2"
  canal           VARCHAR(20),              -- email | linkedin_connexion | linkedin_message
  segment         VARCHAR(50),              -- pme_metro | ecommerce_shopify | ...
  etape_sequence  INTEGER,                  -- 1 = premier contact, 2 = relance, ...
  sujet           TEXT,                      -- sujet email (null si linkedin)
  corps           TEXT,                      -- corps avec variables {{prenom}}, {{entreprise}}, etc.
  variables       JSONB,                    -- liste des variables requises
  taux_reponse    FLOAT,                    -- taux de reponse historique
  nb_envois       INTEGER DEFAULT 0,
  nb_reponses     INTEGER DEFAULT 0,
  actif           BOOLEAN DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Sequences multicanales
CREATE TABLE sequences (
  id              SERIAL PRIMARY KEY,
  nom             VARCHAR(100),
  segment         VARCHAR(50),
  etapes          JSONB,
  -- Exemple etapes :
  -- [
  --   {jour: 0, canal: "linkedin", action: "connexion", template_id: "li_connexion_signal_v1"},
  --   {jour: 2, canal: "email", action: "envoi", template_id: "challenger_sale_v2"},
  --   {jour: 5, canal: "linkedin", action: "engagement", template_id: null},
  --   {jour: 8, canal: "email", action: "relance", template_id: "relance_cas_client_v1"},
  --   {jour: 14, canal: "linkedin", action: "breakup", template_id: "li_breakup_v1"}
  -- ]
  duree_jours     INTEGER,
  actif           BOOLEAN DEFAULT true
);

-- Metriques globales (snapshots quotidiens)
CREATE TABLE metriques_daily (
  id              SERIAL PRIMARY KEY,
  date            DATE,
  nouveaux_leads  INTEGER,
  emails_envoyes  INTEGER,
  emails_ouverts  INTEGER,
  emails_repondus INTEGER,
  linkedin_envoyes INTEGER,
  linkedin_acceptes INTEGER,
  linkedin_repondus INTEGER,
  rdv_pris        INTEGER,
  propositions    INTEGER,
  deals_gagnes    INTEGER,
  revenue_gagne   DECIMAL,
  created_at      TIMESTAMP DEFAULT NOW()
);
```

---

## AGENT 1 — VEILLEUR

### Mission

Detecter en continu les opportunites de prospection : nouveaux leads, signaux d'achat, marches publics, offres d'emploi revelant un besoin.

### Ce qu'il ne fait PAS

- Il n'enrichit pas les donnees (c'est l'ENRICHISSEUR)
- Il ne contacte personne (c'est le REDACTEUR)
- Il ne juge pas la qualite du lead (c'est le SCOREUR)

### Sous-agents

#### 1a. Veilleur LinkedIn

**Ce qu'il fait** :
- Scrape les posts LinkedIn contenant des mots-cles cibles
- Detecte les changements de poste (nouveau CMO, nouveau CTO = nouveau decideur)
- Detecte les annonces de recrutement dans les profils d'entreprises
- Detecte les posts d'entreprises qui parlent de "refonte", "digitalisation", "nouveau site", "transformation"

**Ce dont il a besoin** :
- Acces LinkedIn (via Sales Navigator API ou scraping Phantombuster/maison)
- Liste de mots-cles : ["refonte site", "nouveau site", "cherche agence web", "transformation digitale", "e-commerce", "shopify", "accessibilite", "RGAA", "application mobile", "flutter", "react"]
- Liste de secteurs cibles
- Liste de zones geographiques

**Ce qu'il produit** :
```json
{
  "type": "signal_linkedin",
  "date_detection": "2026-03-18T09:15:00",
  "signal": "changement_poste",
  "detail": "Sophie Martin nommee CMO chez TechCorp",
  "prospect": {
    "prenom": "Sophie",
    "nom": "Martin",
    "poste": "Chief Marketing Officer",
    "linkedin_url": "https://linkedin.com/in/sophie-martin",
    "entreprise": "TechCorp",
    "localisation": "Paris"
  },
  "priorite": "haute",
  "raison": "Nouveau CMO = nouveaux projets digitaux dans les 3-6 mois"
}
```

**Frequence** : Toutes les 6h (4x/jour)
**Volume attendu** : 10-30 signaux/jour

---

#### 1b. Veilleur Marches Publics

**Ce qu'il fait** :
- Interroge l'API BOAMP et scrape France Marches quotidiennement
- Filtre par mots-cles IT/numerique + geographie (priorite La Reunion, puis France)
- Extrait les informations cles de chaque AO detecte
- Calcule un score de pertinence initial (base sur mots-cles et montant)

**Ce dont il a besoin** :
- Acces API BOAMP (gratuit)
- Scraper France Marches (custom, headless browser)
- Liste de mots-cles de veille (cf. section precedente)
- Regles de scoring initial :
  ```
  +30 si contient "site web" OU "application" OU "portail"
  +20 si contient "RGAA" OU "accessibilite"
  +20 si La Reunion ou DOM-TOM
  +15 si MAPA (< 90K)
  +10 si contient "maintenance" OU "hebergement"
  -20 si contient "travaux" OU "fournitures" OU "batiment"
  -30 si montant > 500K (hors scope Axiom)
  ```

**Ce qu'il produit** :
```json
{
  "type": "marche_public",
  "date_detection": "2026-03-18T07:00:00",
  "reference": "BOAMP-2026-123456",
  "titre": "Refonte du site internet de la commune de Saint-Denis",
  "acheteur": "Mairie de Saint-Denis",
  "type_marche": "mapa",
  "montant_estime": 35000,
  "date_limite": "2026-04-15",
  "url": "https://boamp.fr/...",
  "mots_cles_detectes": ["site web", "RGAA", "collectivite"],
  "score_pertinence": 85,
  "localisation": "La Reunion"
}
```

**Frequence** : 2x/jour (7h et 14h)
**Volume attendu** : 2-10 marches pertinents/semaine

---

#### 1c. Veilleur Web (Sites & Tech)

**Ce qu'il fait** :
- Prend une liste d'entreprises cibles (injectee manuellement ou depuis un scraping sectoriel)
- Scanne leur site web avec Lighthouse (via API ou ligne de commande)
- Detecte la stack technique (via headers HTTP, meta tags, ou API BuiltWith)
- Identifie les sites lents (>3s), non accessibles, en techno obsolete
- Genere un lead avec le signal technique associe

**Ce dont il a besoin** :
- Google Lighthouse CLI (gratuit, en local ou via API PageSpeed Insights)
- Wappalyzer ou BuiltWith (API ou scraping)
- Liste d'URLs a scanner (par secteur/zone)
- Seuils de detection :
  ```
  Site lent : temps_chargement > 3.0s
  Score Lighthouse faible : performance < 50 OU accessibility < 70
  Tech obsolete : WordPress < 5.0, jQuery sans framework moderne, PHP ancien
  Non RGAA : accessibility score < 60
  ```

**Ce qu'il produit** :
```json
{
  "type": "signal_web",
  "date_detection": "2026-03-18T10:30:00",
  "signal": "site_lent",
  "site_web": "https://www.entreprise-exemple.fr",
  "entreprise": "Entreprise Exemple",
  "lighthouse": {
    "performance": 38,
    "accessibility": 52,
    "seo": 71,
    "best_practices": 67
  },
  "temps_chargement": 5.2,
  "stack_detectee": {"cms": "wordpress", "version": "5.3", "theme": "flavor", "plugins": 23},
  "problemes": ["site_lent", "accessibilite_faible", "wordpress_ancien", "trop_de_plugins"],
  "priorite": "haute"
}
```

**Frequence** : 1x/jour (nuit, 100-200 sites scannes)
**Volume attendu** : 5-20 leads techniques/jour

---

#### 1d. Veilleur Job Boards

**Ce qu'il fait** :
- Scrape les offres d'emploi sur LinkedIn Jobs, Indeed, Welcome to the Jungle
- Filtre les offres qui revelent un besoin web : "developpeur front", "dev react", "webmaster", "chef de projet digital"
- Logique : si une entreprise recrute un dev web, c'est qu'elle a un besoin. Alternative : externaliser chez Axiom au lieu de recruter.
- Extrait l'entreprise, le poste, la localisation

**Ce dont il a besoin** :
- Scraper LinkedIn Jobs / Indeed / WTTJ (headless browser ou API quand disponible)
- Mots-cles de veille : ["developpeur web", "developpeur react", "developpeur frontend", "developpeur fullstack", "chef de projet digital", "webmaster", "integrateur web", "developpeur shopify", "developpeur mobile"]
- Filtre geographique : France entiere (priorite : metropole pour le segment PME metro)

**Ce qu'il produit** :
```json
{
  "type": "signal_jobboard",
  "date_detection": "2026-03-18T08:00:00",
  "signal": "recrutement_dev_web",
  "offre_titre": "Developpeur React Senior",
  "entreprise": "MediTech Solutions",
  "localisation": "Lyon",
  "plateforme": "linkedin_jobs",
  "url_offre": "https://linkedin.com/jobs/...",
  "analyse": "L'entreprise cherche un dev React senior en CDI. Cout estime : 55-65K/an + 6 mois de recrutement. Alternative : Axiom livre le projet en 4-6 semaines pour 15-30K.",
  "priorite": "moyenne"
}
```

**Frequence** : 1x/jour
**Volume attendu** : 5-15 signaux/jour

---

### Synthese Agent 1

| Sous-agent | Input | Output | Frequence | Volume |
|-----------|-------|--------|-----------|--------|
| 1a LinkedIn | Mots-cles, filtres | Signal LinkedIn + prospect brut | 4x/jour | 10-30/jour |
| 1b Marches | API BOAMP, scraping | Fiche marche + score pertinence | 2x/jour | 2-10/semaine |
| 1c Web | Liste URLs, Lighthouse | Signal technique + audit rapide | 1x/jour | 5-20/jour |
| 1d Job Boards | Mots-cles, scraping | Signal recrutement + entreprise | 1x/jour | 5-15/jour |

**Total output** : 20-65 leads bruts/jour → envoyes a l'ENRICHISSEUR

---

## AGENT 2 — ENRICHISSEUR

### Mission

Prendre chaque lead brut du Veilleur et le transformer en fiche prospect complete avec toutes les donnees necessaires pour scorer et contacter.

### Ce qu'il ne fait PAS

- Il ne decide pas de contacter ou non (c'est le SCOREUR)
- Il ne redige aucun message (c'est le REDACTEUR)
- Il ne detecte pas les leads (c'est le VEILLEUR)

### Processus detaille

Pour chaque lead brut recu du VEILLEUR :

```
ETAPE 1 : Identifier le decideur
  - Si le lead a deja un contact (LinkedIn signal) → garder
  - Sinon → chercher le decideur dans l'entreprise :
    - Segment PME metro : chercher CMO, CTO, DG
    - Segment e-commerce : chercher Fondateur, Head of Growth
    - Segment collectivite : chercher DGS, DSI
    - Segment startup : chercher Founder, CTO

ETAPE 2 : Trouver les coordonnees
  - Email : Hunter.io API (ou pattern email entreprise + verification)
  - Telephone : si disponible dans les sources
  - LinkedIn : URL profil complet

ETAPE 3 : Enrichir les donnees entreprise
  - SIRET/SIREN : via API INSEE (Sirene) ou Societe.com scraping
  - CA et effectif : via API INSEE ou Pappers
  - Secteur d'activite : depuis code APE
  - Site web : depuis registre ou Google

ETAPE 4 : Enrichir les donnees techniques
  - Stack tech : Wappalyzer/BuiltWith (si pas deja fait par le Veilleur Web)
  - Lighthouse score : si pas deja fait
  - Presence reseaux sociaux

ETAPE 5 : Compiler les signaux
  - Agreger tous les signaux du VEILLEUR pour ce prospect
  - Ajouter des signaux complementaires :
    - Le prospect a-t-il visite le site Axiom ? (Warmly.ai)
    - Le prospect engage-t-il sur LinkedIn ? (likes, comments recents)
    - L'entreprise a-t-elle leve des fonds recemment ?
    - L'entreprise a-t-elle publie des offres d'emploi tech ?

ETAPE 6 : Ecrire dans la BDD
  - Creer ou mettre a jour la fiche prospect dans PostgreSQL
  - Statut → "enrichi"
  - Passer au SCOREUR
```

### Ce dont il a besoin

| Ressource | Usage | Cout |
|-----------|-------|------|
| **Hunter.io API** | Trouver emails pro | 49 EUR/mois (2000 recherches) |
| **API INSEE Sirene** | SIRET, effectif, secteur | Gratuit |
| **Pappers API** | CA, dirigeants, bilans | Gratuit (limite) ou 29 EUR/mois |
| **Wappalyzer** | Stack technique site | Gratuit (npm package) ou API |
| **Lighthouse CLI** | Performance site | Gratuit (npm package) |
| **Warmly.ai API** | Visiteurs du site Axiom | Gratuit (tier basique) |
| **Claude API** | Analyser et resumer les donnees | ~0.01 EUR/prospect |

### Ce qu'il produit

La fiche prospect enrichie (mise a jour dans la BDD) :

```json
{
  "id": 1234,
  "statut": "enrichi",

  "prenom": "Sophie",
  "nom": "Martin",
  "email": "s.martin@techcorp.fr",
  "telephone": "+33 6 12 34 56 78",
  "linkedin_url": "https://linkedin.com/in/sophie-martin",
  "poste": "Chief Marketing Officer",

  "entreprise": "TechCorp",
  "siret": "123 456 789 00012",
  "site_web": "https://www.techcorp.fr",
  "secteur": "SaaS B2B",
  "taille": "50-200",
  "ca_estime": "5-10M EUR",
  "localisation": "Paris",

  "stack_tech": {
    "cms": null,
    "framework": "angular",
    "version": "12",
    "hosting": "aws",
    "analytics": "google_analytics"
  },
  "lighthouse_score": 42,
  "rgaa_conforme": false,
  "temps_chargement": 4.8,

  "signaux": [
    {"type": "changement_poste", "detail": "Nommee CMO il y a 3 semaines", "date": "2026-02-25"},
    {"type": "site_lent", "detail": "Lighthouse 42/100, 4.8s chargement", "date": "2026-03-18"},
    {"type": "recrutement", "detail": "Offre dev frontend sur WTTJ", "date": "2026-03-15"}
  ],
  "signal_principal": "Nouveau CMO + site lent + recrutement dev = besoin refonte probable",

  "segment": "pme_metro",
  "source": "veille_linkedin",
  "date_signal": "2026-03-18T09:15:00"
}
```

### Temps de traitement

- Par prospect : 3-10 secondes (APIs paralleles)
- Volume quotidien : 20-65 prospects enrichis/jour
- Cout API par prospect : ~0.05-0.15 EUR

---

## AGENT 3 — SCOREUR

### Mission

Attribuer un score numerique (0-100) a chaque prospect enrichi, le categoriser (HOT / WARM / COLD), et decider du traitement : contact immediat, sequence standard, ou nurturing.

### Ce qu'il ne fait PAS

- Il ne contacte personne
- Il n'enrichit pas les donnees
- Il n'ecrit pas de messages

### Grille de scoring detaillee

```
SCORE TOTAL = ICP_FIT + SIGNAUX + ENGAGEMENT + TIMING + BUDGET
(max 100 points)

═══════════════════════════════════════════════════════
ICP_FIT (max 25 points)
═══════════════════════════════════════════════════════
  Segment prioritaire (PME metro, e-commerce Shopify)    +25
  Segment moyen (collectivite, startup)                  +20
  Segment bas (agence WL, autre)                         +10
  Hors ICP                                                +0

  Taille entreprise 50-500 salaries                      +5 (bonus)
  Decideur C-level (CEO, CMO, CTO, DG)                   +5 (bonus)
  Decideur mid-level (Head of, Manager)                  +2 (bonus)

═══════════════════════════════════════════════════════
SIGNAUX (max 30 points)
═══════════════════════════════════════════════════════
  Levee de fonds recente                                 +15
  Changement de poste decideur                           +12
  Recrutement dev/tech en cours                          +10
  Site lent (>3s) ou Lighthouse < 50                     +10
  Non conforme RGAA (si collectivite)                    +15
  Publication AO/MAPA pertinent                          +15
  Tech obsolete detectee                                  +8
  Post LinkedIn parlant de refonte/digital                +8
  Offre emploi "dev web" / "webmaster"                   +10
  Aucun signal                                            +0

  (si plusieurs signaux, additionner mais plafonner a 30)

═══════════════════════════════════════════════════════
ENGAGEMENT (max 20 points)
═══════════════════════════════════════════════════════
  A visite le site axiom-marketing.io                    +15
  A engage avec un post LinkedIn d'Axiom                 +10
  A telecharge un lead magnet / audit                    +20
  A rempli le formulaire de contact                      +20
  Connexion LinkedIn acceptee                             +5
  A ouvert un email precedent                             +5
  Aucun engagement                                        +0

═══════════════════════════════════════════════════════
TIMING (max 15 points)
═══════════════════════════════════════════════════════
  Signal date < 48h                                      +15
  Signal date < 1 semaine                                +10
  Signal date < 1 mois                                    +5
  Signal date > 1 mois                                    +0

═══════════════════════════════════════════════════════
BUDGET ESTIME (max 10 points)
═══════════════════════════════════════════════════════
  Budget probable > 30K EUR                              +10
  Budget probable 10-30K EUR                              +7
  Budget probable 5-10K EUR                               +4
  Budget probable < 5K EUR                                +1
```

### Categories et decisions

| Score | Categorie | Decision | Delai |
|-------|-----------|----------|-------|
| **75-100** | **HOT** | Contact personnalise immediat. Jonathan valide le message avant envoi. Priorite maximale. | < 24h |
| **50-74** | **WARM** | Sequence multicanale automatique. Pas de validation humaine. Sequence standard adaptee au segment. | < 48h |
| **25-49** | **COLD** | Nurturing long terme. Ajout a la newsletter. Engagement LinkedIn passif. | 1 semaine |
| **0-24** | **DISQUALIFIE** | Archive. Pas d'action. Peut etre re-score si nouveau signal. | Jamais |

### Ce dont il a besoin

- Fiche prospect enrichie (output de l'ENRICHISSEUR)
- Regles de scoring (ci-dessus, stockees en config)
- Historique des interactions precedentes (si prospect deja connu)
- Donnees Warmly.ai (visites site Axiom)

### Ce qu'il produit

```json
{
  "prospect_id": 1234,
  "score": 82,
  "categorie": "HOT",
  "detail_score": {
    "icp_fit": 25,
    "signaux": 27,
    "engagement": 15,
    "timing": 10,
    "budget": 5
  },
  "decision": "contact_immediat",
  "canal_recommande": "linkedin_puis_email",
  "segment": "pme_metro",
  "sequence_recommandee": "seq_pme_metro_hot",
  "raison": "Nouveau CMO + site lent Lighthouse 42 + recrutement dev. Signal frais (<48h). PME 50-200 salaries Paris. Visite recente site Axiom.",
  "action_humaine_requise": true,
  "assigne_a": "jonathan"
}
```

### Temps de traitement

- Par prospect : < 1 seconde (calcul deterministe, pas d'IA necessaire)
- Peut scorer en batch tous les prospects enrichis du jour
- Aucun cout API (calcul local)

---

## AGENT 4 — REDACTEUR

### Mission

Ecrire le premier message de contact (et les relances) personnalise pour chaque prospect, adapte au canal (email / LinkedIn), au segment, au score, et au signal detecte.

### Ce qu'il ne fait PAS

- Il n'envoie pas le message (c'est le SUIVEUR)
- Il ne decide pas quand envoyer (c'est le SUIVEUR)
- Il ne choisit pas qui contacter (c'est le SCOREUR)

### Processus detaille

```
ETAPE 1 : Recevoir le prospect score
  - Categorie (HOT / WARM / COLD)
  - Segment (pme_metro, ecommerce_shopify, collectivite, startup, agence_wl)
  - Canal recommande (linkedin, email, multicanal)
  - Sequence recommandee
  - Signaux et donnees enrichies

ETAPE 2 : Selectionner le template de base
  - Choisir dans la table "templates" en fonction de :
    - segment + canal + etape_sequence
  - Exemple : segment="pme_metro", canal="email", etape=1
    → template "challenger_sale_pme_metro_v3"

ETAPE 3 : Personnaliser avec Claude API
  - Prompt systeme :
    "Tu es le redacteur commercial d'Axiom Marketing,
     studio d'ingenierie web IA-augmente.
     Tu ecris des messages de prospection courts (80-150 mots),
     directs, sans flatterie excessive.
     Framework : Challenger Sale (teach + tailor + question).
     Ton : professionnel mais decontracte, pas corporate.
     Tu utilises le tutoiement pour les startups,
     le vouvoiement pour les PME et collectivites."

  - Prompt utilisateur :
    "Ecris un email de premier contact pour ce prospect :
     Prenom : {{prenom}}
     Poste : {{poste}}
     Entreprise : {{entreprise}}
     Secteur : {{secteur}}
     Signal : {{signal_principal}}
     Lighthouse : {{lighthouse_score}}
     Temps chargement : {{temps_chargement}}s
     Stack : {{stack_tech}}

     Template de base :
     {{corps_template}}

     Personnalise le template avec les donnees du prospect.
     Le message doit mentionner le signal specifique.
     Termine par une question ouverte + CTA Calendly."

ETAPE 4 : Validation
  - Si HOT → marquer "en_attente_validation", notifier Jonathan
  - Si WARM → marquer "pret_a_envoyer", passer au SUIVEUR
  - Si COLD → pas de message redige, passer directement au NURTUREUR

ETAPE 5 : Stocker le draft
  - Ecrire dans la table "interactions" avec type="draft_email" ou "draft_linkedin"
  - Lier au prospect_id et au template_id
```

### Templates de base (par segment x canal x etape)

**Il faut un minimum de templates pour couvrir tous les cas :**

```
SEGMENT              CANAL       ETAPE 1         ETAPE 2         ETAPE 3
                                 (1er contact)   (relance)       (break-up)
─────────────────────────────────────────────────────────────────────────
pme_metro            email       challenger_v1   cas_client_v1   breakup_v1
pme_metro            linkedin    li_signal_v1    li_cas_v1       li_breakup_v1
ecommerce_shopify    email       tracking_roi_v1 tracking_cas_v1 breakup_v1
ecommerce_shopify    linkedin    li_tracking_v1  li_tracking_v2  li_breakup_v1
collectivite         email       rgaa_alerte_v1  rgaa_cas_v1     breakup_formel_v1
collectivite         linkedin    li_rgaa_v1      li_rgaa_cas_v1  li_breakup_v1
startup              email       speed_v1        cas_mvp_v1      breakup_v1
startup              linkedin    li_speed_v1     li_mvp_v1       li_breakup_v1
agence_wl            email       whitelabel_v1   wl_cas_v1       breakup_v1
```

**= 30 templates a creer et maintenir**

Chaque template contient des variables ({{prenom}}, {{entreprise}}, {{signal}}, {{chiffre_cle}}) que Claude remplit avec les donnees du prospect.

### Ce dont il a besoin

| Ressource | Usage | Cout |
|-----------|-------|------|
| **Claude API** | Personnalisation des messages | ~0.01-0.03 EUR/message |
| **Templates (table SQL)** | Base de chaque message | 0 EUR (maintenu en interne) |
| **Fiche prospect enrichie + scoree** | Donnees pour personnaliser | Deja dans la BDD |

### Ce qu'il produit

```json
{
  "prospect_id": 1234,
  "type": "draft_email",
  "canal": "email",
  "template_id": "challenger_sale_pme_metro_v3",
  "sujet": "TechCorp : 4.8s de chargement = combien de clients perdus ?",
  "corps": "Bonjour Sophie,\n\nVotre site TechCorp charge en 4.8 secondes...[message personnalise complet]",
  "variables_utilisees": ["prenom", "entreprise", "temps_chargement", "lighthouse_score"],
  "statut": "en_attente_validation",
  "assigne_a": "jonathan",
  "etape_sequence": 1
}
```

### Temps de traitement

- Par message : 2-5 secondes (appel Claude API)
- Volume quotidien : 20-50 messages rediges
- Cout : 0.50-1.50 EUR/jour en API Claude

---

## AGENT 5 — SUIVEUR

### Mission

Orchestrer l'envoi des messages au bon moment, sur le bon canal, gerer les relances automatiques, et detecter les reponses pour escalader a l'humain.

### Ce qu'il ne fait PAS

- Il n'ecrit pas les messages (c'est le REDACTEUR)
- Il ne qualifie pas les prospects (c'est le SCOREUR)
- Il ne prend pas les appels decouverte (c'est Jonathan/Marty)

### Processus detaille

```
BOUCLE PRINCIPALE (tourne toutes les heures) :

POUR chaque prospect en statut "en_sequence" :
  1. Verifier si une reponse a ete recue
     - Email : checker inbox (IMAP ou API Gmail)
     - LinkedIn : checker notifications (scraping ou API)

     SI reponse recue :
       - Classifier la reponse avec Claude :
         - "interesse" → statut = "rdv_a_planifier", notifier Jonathan
         - "pas_maintenant" → reporter de 30 jours, statut = "nurture"
         - "pas_interesse" → statut = "perdu", archiver
         - "demande_info" → notifier Jonathan pour reponse manuelle
       - STOP la sequence pour ce prospect

  2. Verifier si c'est le moment d'envoyer la prochaine etape
     - Regarder la sequence assignee (table "sequences")
     - Calculer : jour_actuel = (maintenant - date_debut_sequence)
     - Si jour_actuel == jour de la prochaine etape :

       SI etape.action == "envoi" ou "connexion" ou "relance" :
         - Recuperer le draft du REDACTEUR
         - SI validation_requise ET pas_encore_valide → attendre
         - SINON → ENVOYER :
           - Email : via API Gmail / SMTP
           - LinkedIn : via automation (API ou action programmee)
         - Logger dans table "interactions"
         - Incrementer nb_contacts du prospect
         - Mettre a jour dernier_contact

       SI etape.action == "engagement" :
         - Liker 2-3 posts recents du prospect sur LinkedIn
         - Commenter si pertinent (draft par Claude, court)
         - Logger dans "interactions"

  3. Si la sequence est terminee (toutes les etapes envoyees) :
     - Si aucune reponse → statut = "nurture", passer au NURTUREUR
     - Logger la fin de sequence

POUR chaque prospect en statut "en_attente_validation" :
  - Verifier si Jonathan a valide le message
  - Si oui → envoyer et passer en "en_sequence"
  - Si non depuis > 24h → envoyer notification de rappel
```

### Gestion des envois

**Regles de delivrabilite email** :
- Maximum 50 emails/jour (commencer a 20, augmenter progressivement)
- Delai entre chaque envoi : 30-120 secondes (randomise)
- Pas d'envoi le weekend
- Horaires : 8h-10h et 14h-16h (heure du prospect)
- Rotation de domaines d'envoi si volume > 30/jour

**Regles LinkedIn** :
- Maximum 20 connexions/jour
- Maximum 50 messages/jour
- Delai entre actions : 30-60 secondes
- Escalade progressive sur 2 semaines

### Gestion des reponses (classification IA)

```
Prompt Claude pour classifier une reponse :

"Classifie cette reponse a un email de prospection.
Reponds UNIQUEMENT par un de ces codes :

INTERESSE - le prospect veut en savoir plus ou accepte un RDV
PAS_MAINTENANT - le prospect est interesse mais pas le bon moment
PAS_INTERESSE - le prospect refuse clairement
DEMANDE_INFO - le prospect pose une question avant de decider
HORS_SUJET - reponse automatique, absence, ou non pertinente

Reponse recue :
{{contenu_reponse}}"
```

### Ce dont il a besoin

| Ressource | Usage | Cout |
|-----------|-------|------|
| **API Gmail / SMTP** | Envoyer et recevoir emails | Gratuit (Gmail) ou ~5 EUR/mois (SMTP pro) |
| **Automation LinkedIn** | Envoyer connexions et messages | Waalaxy 19 EUR/mois ou custom |
| **Claude API** | Classifier les reponses | ~0.005 EUR/classification |
| **Cron scheduler** | Declencher la boucle toutes les heures | n8n ou cron system |

### Ce qu'il produit

**A chaque envoi** :
```json
{
  "type": "email_envoye",
  "prospect_id": 1234,
  "canal": "email",
  "template_id": "challenger_sale_pme_metro_v3",
  "sujet": "TechCorp : 4.8s de chargement...",
  "etape_sequence": 1,
  "heure_envoi": "2026-03-19T09:14:32",
  "statut": "envoye"
}
```

**A chaque reponse detectee** :
```json
{
  "type": "reponse_recue",
  "prospect_id": 1234,
  "canal": "email",
  "classification": "INTERESSE",
  "contenu": "Bonjour, oui ca m'interesse. On peut en parler la semaine prochaine ?",
  "action": "rdv_a_planifier",
  "notifie_a": "jonathan",
  "heure_detection": "2026-03-20T14:22:00"
}
```

### Notifications a Jonathan/Marty

L'agent envoie des notifications (Slack, email, ou SMS) dans ces cas :
- Prospect HOT a valider avant envoi
- Reponse "INTERESSE" recue → planifier RDV
- Reponse "DEMANDE_INFO" → repondre manuellement
- Prospect qui visite le site Axiom alors qu'il est en sequence active
- Rappel si validation en attente > 24h

---

## AGENT 6 — NURTUREUR

### Mission

Maintenir une relation avec les prospects WARM et COLD qui n'ont pas converti, jusqu'a ce qu'un nouveau signal ou engagement les fasse remonter en priorite.

### Ce qu'il ne fait PAS

- Il ne fait pas de prospection active (pas de cold outreach)
- Il ne qualifie pas (c'est le SCOREUR qui re-score)
- Il ne close pas (c'est Jonathan)

### Processus detaille

```
POUR chaque prospect en statut "nurture" :

  1. ENGAGEMENT LINKEDIN PASSIF (hebdomadaire)
     - Liker 1-2 posts recents du prospect
     - Commenter si un post est pertinent (draft Claude, 1-2 phrases)
     - Objectif : rester visible sans etre intrusif

  2. EMAIL MENSUEL DE VALEUR (pas de vente)
     - Envoyer 1 email/mois avec du contenu utile :
       - Nouveau blog post Axiom pertinent pour le secteur du prospect
       - Cas d'etude recent (si similaire au secteur)
       - Insight sectoriel (tendance, stat, changement reglementaire)
       - Invitation webinaire
     - Personnalise par segment :
       - pme_metro → contenu performance web, ROI digital
       - ecommerce_shopify → contenu tracking, conversions, Shopify
       - collectivite → contenu RGAA, accessibilite, conformite
       - startup → contenu rapidite, MVP, stack moderne

  3. RE-SCORING MENSUEL
     - Tous les 30 jours, re-interroger les sources de signaux :
       - Nouveau post LinkedIn du prospect ?
       - Visite recente du site Axiom ?
       - Nouveau signal (recrutement, levee, AO) ?
       - Email nurture ouvert ou clique ?
     - Si nouveau signal ou engagement → re-scorer via AGENT 3
     - Si score remonte > 50 → reclassifier en WARM et relancer sequence
     - Si score remonte > 75 → reclassifier en HOT et notifier Jonathan

  4. NETTOYAGE (trimestriel)
     - Si prospect en nurture depuis > 6 mois sans aucun engagement :
       - Marquer "archive"
       - Plus aucun email envoye
       - Garde en BDD pour reference
```

### Ce dont il a besoin

| Ressource | Usage | Cout |
|-----------|-------|------|
| **Claude API** | Personnaliser emails nurture et commentaires LinkedIn | ~0.01 EUR/prospect/mois |
| **Blog Axiom** | Contenu a partager | 0 (deja produit par l'equipe) |
| **LinkedIn** | Engagement passif | 0 (actions manuelles simulees) |
| **Scheduler** | Declencher actions mensuelles | n8n cron |

### Ce qu'il produit

**Email nurture personnalise** :
```json
{
  "type": "email_nurture",
  "prospect_id": 1234,
  "sujet": "Lighthouse 2026 : les nouveaux criteres de Google",
  "corps": "Bonjour Sophie,\n\nGoogle vient de mettre a jour ses criteres Lighthouse...[contenu educatif]...\n\nSi vous voulez qu'on regarde votre score ensemble, je reste disponible.\n\nBonne semaine,\nJonathan",
  "contenu_partage": "https://axiom-marketing.io/blog/lighthouse-2026",
  "etape_nurture": 3
}
```

**Alerte re-scoring** :
```json
{
  "type": "alerte_re_scoring",
  "prospect_id": 1234,
  "ancien_score": 35,
  "nouveau_score": 72,
  "ancienne_categorie": "COLD",
  "nouvelle_categorie": "WARM",
  "raison": "A ouvert les 3 derniers emails nurture + a visite la page /services/site-vitrine + nouveau signal : offre emploi dev React",
  "action": "relancer_sequence_warm"
}
```

---

## AGENT 7 — ANALYSTE

### Mission

Mesurer la performance de chaque etape du pipeline, identifier les goulots d'etranglement, et recommander des ajustements concrets (meilleurs templates, meilleurs segments, meilleurs horaires).

### Ce qu'il ne fait PAS

- Il ne modifie rien lui-meme (il recommande, l'humain decide)
- Il ne contacte aucun prospect
- Il ne cree pas de contenu

### Processus detaille

```
QUOTIDIEN (chaque soir a 22h) :
  1. Compter les metriques du jour :
     - Leads detectes par le VEILLEUR (par sous-agent)
     - Prospects enrichis par l'ENRICHISSEUR
     - Prospects scores par le SCOREUR (par categorie)
     - Messages envoyes par le SUIVEUR (par canal)
     - Emails ouverts, cliques, repondus
     - LinkedIn acceptes, repondus
     - RDV pris
     - Propositions envoyees
     - Deals gagnes et montants
  2. Ecrire le snapshot dans "metriques_daily"

HEBDOMADAIRE (chaque dimanche soir) :
  1. Calculer les taux de conversion par etape :
     - Lead → Enrichi : devrait etre ~90%+
     - Enrichi → Contacte : selon scoring
     - Contacte → Reponse : cible 10-20%
     - Reponse → RDV : cible 40-50%
     - RDV → Proposition : cible 50-70%
     - Proposition → Gagne : cible 25-40%

  2. Identifier les goulots :
     - Si taux reponse email < 5% → recommander changement templates
     - Si taux reponse LinkedIn < 15% → recommander changement approche
     - Si taux RDV→Proposition < 40% → revoir qualification
     - Si aucun lead dans un segment → revoir veille

  3. Comparer les templates :
     - Pour chaque template, calculer taux_reponse = nb_reponses / nb_envois
     - Classer les templates du meilleur au pire
     - Recommander de desactiver les templates < 3% de reponse
     - Recommander de dupliquer/iterer les templates > 10% de reponse

  4. Analyser par segment :
     - Quel segment genere le plus de deals ?
     - Quel segment a le meilleur CAC ?
     - Faut-il reequilibrer l'effort ?

  5. Generer le rapport hebdomadaire (via Claude)

MENSUEL :
  1. Rapport complet avec :
     - Funnel complet (leads → clients)
     - Revenue genere
     - CAC par canal et par segment
     - ROI du systeme de prospection
     - Recommandations strategiques
  2. Envoyer a Jonathan par email
```

### Ce dont il a besoin

| Ressource | Usage | Cout |
|-----------|-------|------|
| **PostgreSQL** | Requetes sur toutes les tables | 0 (deja en place) |
| **Claude API** | Generer les rapports en langage naturel | ~0.05 EUR/rapport |
| **n8n** | Scheduler + aggregation | Deja en place |
| **Canal de notification** | Slack ou email pour envoyer les rapports | 0 |

### Ce qu'il produit

**Rapport hebdomadaire** :
```
═══════════════════════════════════════════
RAPPORT PROSPECTION — SEMAINE 12 (2026)
═══════════════════════════════════════════

PIPELINE GLOBAL
  Leads detectes         : 142 (+12% vs S11)
  Prospects enrichis     : 128 (90%)
  HOT                    : 8
  WARM                   : 47
  COLD                   : 73

OUTREACH
  Emails envoyes         : 89
  Taux ouverture         : 28% (cible: 25%) ✓
  Taux reponse           : 11.2% (cible: 10%) ✓
  LinkedIn connexions    : 62
  LinkedIn acceptees     : 23 (37%)
  LinkedIn reponses      : 8 (13%)

CONVERSION
  RDV pris               : 4 (+1 vs S11)
  Propositions envoyees  : 2
  Deals gagnes           : 1 (18 000 EUR)

MEILLEURS TEMPLATES
  1. challenger_sale_pme_metro_v3    → 14.3% reponse (21 envois)
  2. tracking_roi_v1                 → 12.1% reponse (33 envois)
  3. rgaa_alerte_v1                  → 8.5% reponse (12 envois)

TEMPLATES A REVOIR
  ✗ whitelabel_v1                   → 1.2% reponse (25 envois)
  → Recommandation : reecrire ou desactiver

SEGMENTS
  PME metro         : 3 RDV, 1 deal (18K)  → ROI excellent
  E-commerce Shopify: 1 RDV, 0 deal        → En cours
  Collectivites     : 0 RDV                 → Volume faible, augmenter veille
  Startups          : 0 RDV                 → Revoir ciblage

RECOMMANDATIONS
  1. Augmenter volume veille collectivites (ajouter mots-cles)
  2. Dupliquer template challenger_sale_pme_metro_v3 avec variantes A/B
  3. Desactiver template whitelabel_v1, reecrire
  4. Segment startup sous-performe : affiner ICP ou reduire effort
  5. CAC actuel : 187 EUR → cible atteinte (< 300 EUR) ✓

═══════════════════════════════════════════
```

---

## COUT TOTAL DU SYSTEME

### Infrastructure

| Composant | Cout mensuel |
|-----------|-------------|
| **Serveur** (AdonisJS + PostgreSQL + n8n) | 20-50 EUR (Scaleway DEV1-M) |
| **Claude API** (redaction + classification) | 30-80 EUR/mois (selon volume) |
| **Hunter.io** (emails) | 49 EUR/mois |
| **Warmly.ai** (intent tracking) | 0 EUR (tier gratuit) |
| **LinkedIn Sales Navigator** | 65 EUR/mois |
| **Waalaxy** (automation LinkedIn) | 19 EUR/mois |
| **Domaine + SMTP** (delivrabilite email) | 5-15 EUR/mois |
| **TOTAL** | **~190-280 EUR/mois** |

### Temps de developpement estime

| Agent | Complexite | Temps dev estime |
|-------|-----------|-----------------|
| Agent 1 — Veilleur | Haute (4 sous-agents, scraping, APIs) | 3-5 jours |
| Agent 2 — Enrichisseur | Moyenne (APIs, pipeline) | 2-3 jours |
| Agent 3 — Scoreur | Faible (logique, pas d'IA) | 1 jour |
| Agent 4 — Redacteur | Moyenne (Claude API, templates) | 2-3 jours |
| Agent 5 — Suiveur | Haute (envoi, detection reponses, scheduler) | 3-5 jours |
| Agent 6 — Nurtureur | Faible (cron + emails) | 1-2 jours |
| Agent 7 — Analyste | Moyenne (requetes SQL, rapport Claude) | 2-3 jours |
| **Base de donnees + API** | Moyenne | 2-3 jours |
| **Dashboard front (React)** | Moyenne | 3-5 jours |
| **TOTAL** | | **~20-30 jours** |

### ROI attendu

```
INVESTISSEMENT
  Dev initial : 20-30 jours × TJM interne
  Cout mensuel : ~250 EUR/mois (outils + infra)

RESULTATS (apres 3 mois de rodage)
  Leads/mois : 300-500
  Contacts/mois : 150-250
  RDV/mois : 8-15
  Deals/mois : 2-5
  Revenue/mois : 20-80K EUR

PAYBACK : 1-2 mois apres mise en production
```

---

## ORDRE DE CONSTRUCTION RECOMMANDE

```
SPRINT 1 (Semaine 1-2) : Fondations
  ├─ Base de donnees PostgreSQL (schema complet)
  ├─ Agent 3 — Scoreur (le plus simple, teste la logique)
  └─ Agent 7 — Analyste (requetes SQL basiques)

SPRINT 2 (Semaine 2-3) : Collecte
  ├─ Agent 1c — Veilleur Web (Lighthouse + Wappalyzer)
  ├─ Agent 1d — Veilleur Job Boards (scraping Indeed/WTTJ)
  └─ Agent 2 — Enrichisseur (Hunter + INSEE + Pappers)

SPRINT 3 (Semaine 3-4) : Outreach
  ├─ Agent 4 — Redacteur (Claude API + 15 premiers templates)
  ├─ Agent 5 — Suiveur (envoi email + detection reponses)
  └─ Dashboard React (vue pipeline + notifications)

SPRINT 4 (Semaine 4-5) : LinkedIn + Marches
  ├─ Agent 1a — Veilleur LinkedIn (scraping + signaux)
  ├─ Agent 1b — Veilleur Marches Publics (BOAMP API)
  ├─ Agent 5 — Suiveur (ajout canal LinkedIn)
  └─ Agent 6 — Nurtureur (emails mensuels + re-scoring)

SPRINT 5 (Semaine 5-6) : Optimisation
  ├─ A/B testing templates
  ├─ Affinage scoring (poids ajustes selon donnees reelles)
  ├─ Agent 7 — Analyste (rapports complets + recommandations)
  └─ Integration Warmly.ai (intent tracking)
```

---

*Specifications redigees le 18 mars 2026*
*Pret pour developpement en interne par l'equipe Axiom*
