# AGENT 2 -- ENRICHISSEUR : SPECIFICATIONS COMPLETES ET EXHAUSTIVES

**Date** : 18 mars 2026
**Auteur** : Axiom Marketing -- Systeme de prospection automatise
**Version** : 1.0
**Contexte** : Stack interne -- Claude API, n8n, AdonisJS, React, PostgreSQL, scraping custom
**Pipeline** : VEILLEUR (Agent 1) --> **ENRICHISSEUR (ce doc)** --> SCOREUR (Agent 3) --> REDACTEUR --> SUIVEUR --> NURTUREUR --> ANALYSTE

---

## TABLE DES MATIERES

1. [Mission de l'Enrichisseur](#1-mission-de-lenrichisseur)
2. [Input : Schema JSON recu de l'Agent 1](#2-input--schema-json-recu-de-lagent-1)
3. [Sous-Agent 2a -- Enrichisseur Contact](#3-sous-agent-2a--enrichisseur-contact)
4. [Sous-Agent 2b -- Enrichisseur Entreprise](#4-sous-agent-2b--enrichisseur-entreprise)
5. [Sous-Agent 2c -- Enrichisseur Technique](#5-sous-agent-2c--enrichisseur-technique)
6. [Agent Master Enrichisseur -- Orchestrateur](#6-agent-master-enrichisseur--orchestrateur)
7. [RGPD -- Conformite complete](#7-rgpd--conformite-complete)
8. [Couts detailles](#8-couts-detailles)
9. [Schema SQL](#9-schema-sql)
10. [Verification de coherence](#10-verification-de-coherence)
11. [Integration avec les Agents 8, 9, 10](#11-integration-avec-les-agents-8-9-10)

---

## 1. MISSION DE L'ENRICHISSEUR

### 1.1 Position dans le pipeline

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        AGENT 2 -- ENRICHISSEUR                               │
│                                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                             │
│  │  2a         │  │  2b         │  │  2c         │                             │
│  │  Contact    │  │  Entreprise │  │  Technique  │                             │
│  │  (Decideur) │  │  (Finance)  │  │  (Stack+Perf│                             │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘                             │
│         │               │               │                                    │
│         └───────────────┴───────┬───────┘                                    │
│                                 │                                            │
│                    ┌────────────▼────────────┐                               │
│                    │   MASTER ENRICHISSEUR   │                               │
│                    │   - Fusion resultats    │                               │
│                    │   - Dedup BDD           │                               │
│                    │   - Fiche prospect      │                               │
│                    │   - Controle qualite    │                               │
│                    └────────────┬────────────┘                               │
│                                 │                                            │
└─────────────────────────────────┼────────────────────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ AGENT 1         │   │ AGENT 3         │   │ BASE DE DONNEES │
│ VEILLEUR        │   │ SCOREUR         │   │ prospects        │
│ (input)         │   │ (output)        │   │ (persistance)   │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

### 1.2 Mission precise

**Ce que fait l'Enrichisseur** :
- Recoit les leads bruts normalises de l'Agent 1 (VEILLEUR) via la queue BullMQ
- Trouve le BON decideur pour chaque lead (email, telephone, LinkedIn) selon le segment
- Enrichit les donnees entreprise (SIRET, CA, effectif, dirigeants, procedures collectives)
- Complete les donnees techniques du site web (stack, performance, accessibilite) si non fait par Agent 1c
- Fusionne les 3 flux d'enrichissement en une fiche prospect unique et complete
- Deduplique avec les prospects deja existants en base de donnees
- Transmet la fiche enrichie a l'Agent 3 (SCOREUR) pour scoring final

**Ce que l'Enrichisseur ne fait PAS** :
- Il ne detecte PAS les signaux d'achat (c'est le VEILLEUR)
- Il ne score PAS la qualite finale du lead (c'est le SCOREUR)
- Il ne redige PAS les messages de prospection (c'est le REDACTEUR)
- Il n'envoie AUCUN message ou email au prospect
- Il ne gere PAS les sequences de relance
- Il ne fait PAS de veille continue (il reagit aux leads recus)

### 1.3 Les 5 segments et leurs decideurs cibles

| Segment | Cible | Decideurs a trouver (ordre de priorite) |
|---------|-------|----------------------------------------|
| `pme_metro` | PME France metropolitaine, 50-500 salaries | 1. CMO 2. DG 3. CTO/DSI |
| `ecommerce_shopify` | E-commercants Shopify, toutes tailles | 1. Fondateur 2. Head of Growth 3. CMO |
| `collectivite` | Collectivites DOM-TOM | 1. DGS 2. DSI 3. Elus numeriques |
| `startup` | Startups / SaaS, 5-200 salaries | 1. Founder/CEO 2. CTO 3. Head of Growth |
| `agence_wl` | Agences en marque blanche, 2-50 salaries | 1. Fondateur 2. CEO 3. Account Manager principal |

### 1.4 SLA de traitement

| Priorite lead (pre_score) | Delai max enrichissement | Qualite min requise |
|---------------------------|-------------------------|---------------------|
| Hot (>= 60) | 15 minutes | Email verifie obligatoire |
| Warm (40-59) | 2 heures | Email trouve ou flag "manual" |
| Cold (< 40) | 24 heures | Best effort |

---

## 2. INPUT : SCHEMA JSON RECU DE L'AGENT 1

Le schema ci-dessous est **exactement** le format de sortie du Master Veilleur (Agent 1, section 2.5 de ses specs). L'Enrichisseur le recoit via la queue BullMQ `enrichisseur-pipeline`.

```json
{
  "lead_id": "uuid-v4",
  "created_at": "2026-03-18T08:00:00Z",
  "source_primaire": "veille_linkedin",
  "sources": ["veille_linkedin", "veille_jobboard"],
  "nb_detections": 2,

  "entreprise": {
    "nom": "TechCorp SAS",
    "siret": null,
    "site_web": "https://www.techcorp.fr",
    "linkedin_company_url": "https://linkedin.com/company/techcorp",
    "secteur": null,
    "taille_estimee": "50-200",
    "localisation": "Paris, France",
    "segment_estime": "pme_metro"
  },

  "contact": {
    "prenom": "Sophie",
    "nom": "Martin",
    "poste": "Chief Marketing Officer",
    "linkedin_url": "https://linkedin.com/in/sophie-martin",
    "email": null,
    "telephone": null
  },

  "signaux": [
    {
      "type": "changement_poste",
      "source": "1a_linkedin",
      "detail": "Nommee CMO chez TechCorp il y a 3 semaines",
      "date_signal": "2026-02-25T00:00:00Z",
      "tier": 1,
      "score_signal": 30
    },
    {
      "type": "recrutement_dev_web",
      "source": "1d_jobboard",
      "detail": "Offre dev React senior sur WTTJ",
      "date_signal": "2026-03-15T00:00:00Z",
      "tier": 2,
      "score_signal": 20
    }
  ],

  "signal_principal": "Nouveau CMO + recrutement dev = besoin digital probable",

  "pre_score": {
    "total": 50,
    "detail": {
      "signal_force": 30,
      "multi_source_bonus": 5,
      "segment_match": 15
    }
  },

  "metadata": {
    "sous_agent_primaire": "1a_linkedin",
    "batch_id": "batch-2026-03-18-08",
    "traitement_requis": ["enrichissement_contact", "enrichissement_entreprise", "scan_technique"]
  }
}
```

### 2.1 Champs critiques pour l'Enrichisseur

| Champ input | Utilise par | Obligatoire | Fallback si absent |
|-------------|-----------|-------------|-------------------|
| `entreprise.nom` | 2a, 2b | Oui | ERREUR -- lead rejete |
| `entreprise.site_web` | 2a, 2c | Non | 2b tente de le trouver via Pappers/SIRENE |
| `entreprise.siret` | 2b | Non | 2b le recherche via INSEE/Pappers |
| `entreprise.linkedin_company_url` | 2a | Non | 2a cherche via Netrows |
| `entreprise.localisation` | 2b | Non | 2b enrichit via INSEE |
| `entreprise.segment_estime` | 2a | Oui | Defaut `pme_metro` |
| `contact.prenom` | 2a | Non | 2a cherche le decideur from scratch |
| `contact.nom` | 2a | Non | 2a cherche le decideur from scratch |
| `contact.linkedin_url` | 2a | Non | 2a cherche via search |
| `contact.email` | 2a | Non | 2a le trouve (mission principale) |
| `metadata.traitement_requis` | Master | Oui | Defaut = tous les enrichissements |

### 2.2 Determination du traitement requis

Le champ `metadata.traitement_requis` est un tableau qui indique quels sous-agents doivent etre actives. Il est rempli par le Master Veilleur selon ces regles :

```typescript
function determineTraitement(lead: NormalizedLead): string[] {
  const traitements: string[] = []

  // Contact toujours requis sauf si email deja present ET verifie
  if (!lead.contact?.email) {
    traitements.push('enrichissement_contact')
  }

  // Entreprise toujours requis sauf si SIRET + CA deja presents
  if (!lead.entreprise.siret) {
    traitements.push('enrichissement_entreprise')
  }

  // Technique requis sauf si Agent 1c l'a deja fait
  const hasAuditTech = lead.sources.includes('veille_web')
  if (!hasAuditTech && lead.entreprise.site_web) {
    traitements.push('scan_technique')
  }

  // Toujours au moins 1 traitement
  if (traitements.length === 0) {
    traitements.push('enrichissement_contact') // Verifier au minimum
  }

  return traitements
}
```

---

## 3. SOUS-AGENT 2a -- ENRICHISSEUR CONTACT

### 3.1 Mission precise

**Ce qu'il fait** :
- Trouve le BON decideur pour chaque lead selon le segment cible
- Recupere l'email professionnel verifie du decideur
- Recupere le telephone professionnel (quand disponible)
- Recupere le profil LinkedIn du decideur
- Applique une strategie waterfall multi-outils pour maximiser le taux de couverture
- Verifie la deliverabilite de l'email avant de le transmettre

**Ce qu'il ne fait PAS** :
- Il n'envoie AUCUN email (c'est le REDACTEUR)
- Il ne scrape PAS directement LinkedIn (APIs tierces)
- Il ne stocke PAS les emails dans une base marketing (RGPD -- pas de base email non-consentie)

### 3.2 Architecture technique

**Stack et APIs** :

| Composant | Service | Cout/mois | Credits inclus | Role |
|-----------|---------|----------|---------------|------|
| **Email finding (primaire)** | Dropcontact API | 39 EUR | 2,500 credits | RGPD-compliant, France, email + SIREN + verification incluse |
| **Email finding (fallback)** | Hunter.io API | 49 EUR | 1,500 credits | Couverture internationale, recherche par domaine, rapidite |
| **Email verification** | ZeroBounce | 16 USD | 2,000 verifs | Catch-all detection, verification avancee |
| **Telephone** | Kaspr API | 79 EUR | 3,000 credits | Extraction LinkedIn, telephones EU |
| **Infrastructure** | Redis + PostgreSQL | 0 EUR (inclus) | - | Cache + queue |

**Total sous-agent 2a** : ~183 EUR/mois

### 3.3 Strategie Waterfall -- Trouver le decideur

La strategie waterfall est l'approche cle : on essaie les outils dans un ordre precis, en s'arretant des qu'on obtient un resultat satisfaisant.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ WATERFALL ENRICHISSEMENT CONTACT                                            │
│                                                                             │
│  ETAPE 0 : IDENTIFICATION DU DECIDEUR CIBLE                                │
│  ├── Si contact deja fourni par Agent 1 --> verifier pertinence titre       │
│  └── Sinon --> determiner titre cible selon segment (cf. table 1.3)         │
│                                                                             │
│  ETAPE 1 : DROPCONTACT (primaire -- RGPD-conforme)        [30-120s]        │
│  ├── Input : prenom + nom + entreprise (ou domaine)                         │
│  ├── Output : email + verification + SIREN + TVA                            │
│  ├── Taux succes France : ~98% (algorithmique temps reel)                   │
│  └── Si FOUND + confidence >= 95% --> STOP, go ETAPE 5                      │
│                                                                             │
│  ETAPE 2 : HUNTER.IO DOMAIN SEARCH (fallback)             [1-5s]           │
│  ├── Input : domaine entreprise                                             │
│  ├── Filtre : seniority=executive, department=marketing|it|executive        │
│  ├── Output : liste emails + confiance + postes                             │
│  ├── Taux succes : 35-40% (base de donnees, moins precis en France)         │
│  └── Si FOUND + confidence >= 85% --> STOP, go ETAPE 5                      │
│                                                                             │
│  ETAPE 3 : HUNTER.IO EMAIL FINDER (si nom connu)          [1-10s]          │
│  ├── Input : prenom + nom + domaine                                         │
│  ├── Output : email unique + score confiance                                │
│  ├── Taux succes : ~70% si nom + domaine corrects                           │
│  └── Si FOUND + confidence >= 85% --> STOP, go ETAPE 5                      │
│                                                                             │
│  ETAPE 4 : PATTERN MATCHING + SMTP CHECK (dernier recours) [5-30s]         │
│  ├── Generer 10 patterns email (firstname@, first.last@, flast@, etc.)      │
│  ├── Tester chaque pattern via SMTP RCPT TO (sans envoyer)                  │
│  ├── Filtrer les catch-all domains                                          │
│  └── Si 1+ pattern valide --> STOP, go ETAPE 5                              │
│                                                                             │
│  ETAPE 5 : VERIFICATION ZEROBOUNCE                         [1-3s]          │
│  ├── Verifier email trouve (quelle que soit la source)                      │
│  ├── Statuts : valid | invalid | catch_all | unknown                        │
│  ├── Si valid --> enrichissement_email = SUCCES                              │
│  ├── Si catch_all --> flag "risky", decision selon politique                 │
│  ├── Si invalid --> remonter waterfall (ETAPE suivante)                      │
│  └── Si unknown --> flag "unverified"                                        │
│                                                                             │
│  ETAPE 6 : TELEPHONE (optionnel, en parallele)             [2-5s]          │
│  ├── Kaspr : extraction telephone LinkedIn (si linkedin_url dispo)          │
│  ├── Dropcontact : telephone parfois inclus dans enrichissement             │
│  └── Standard telephonique : fallback manuel (flag pour SUIVEUR)            │
│                                                                             │
│  RESULTAT FINAL :                                                           │
│  ├── email_status : 'verified' | 'catch_all' | 'unverified' | 'not_found' │
│  ├── phone_status : 'found' | 'not_found'                                  │
│  └── contact_quality : 'high' (email verified) | 'medium' | 'low'          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 APIs -- Endpoints exacts, authentification, reponses

#### 3.4.1 Dropcontact API

**Base URL** : `https://api.dropcontact.com/v1/`
**Authentification** : Header `X-Access-Token: YOUR_API_KEY`
**Content-Type** : `application/json`
**Rate limit** : 60 requetes/seconde
**Mode** : ASYNCHRONE (soumettre, puis polling ou webhook)

**Endpoint principal -- ENRICH ALL** :

```
POST /enrich/all
```

**Request body** :
```json
{
  "data": [
    {
      "first_name": "Sophie",
      "last_name": "Martin",
      "company": "TechCorp SAS",
      "job": "Chief Marketing Officer",
      "website": "www.techcorp.fr"
    }
  ],
  "siren": true,
  "language": "fr"
}
```

**Reponse initiale (202 Accepted)** :
```json
{
  "error": false,
  "request_id": "req_abc123def456",
  "success": true,
  "credits_left": 2450,
  "accepted_count": 1
}
```

**Recuperation des resultats** :
```
GET /enrich/all/{request_id}
```

**Reponse en cours (200 -- pas pret)** :
```json
{
  "error": false,
  "reason": "Request not ready yet, try again in 30 seconds",
  "success": false
}
```

**Reponse finale (200 -- pret)** :
```json
{
  "data": [
    {
      "first_name": "Sophie",
      "last_name": "Martin",
      "email": [
        {
          "email": "sophie.martin@techcorp.fr",
          "qualification": "nominative@pro",
          "confidence": 98
        }
      ],
      "company": "TechCorp SAS",
      "website": "www.techcorp.fr",
      "phone": "+33123456789",
      "num_siren": "123456789",
      "naf": "6202A",
      "tva": "FR12123456789"
    }
  ],
  "error": false,
  "success": true
}
```

**Limites** :
- Max 250 contacts par requete batch
- Temps de reponse : 30-120 secondes (asynchrone)
- 1 credit = 1 enrichissement complet (email + verification + SIREN/TVA inclus)
- Code `429 Too Many Requests` si depassement rate limit

**Pricing Dropcontact 2026** :

| Plan | Cout/mois | Credits | Prix/contact |
|------|----------|---------|-------------|
| Free | 0 EUR | 25 | Gratuit (tests) |
| Starter | 24 EUR | 1,000 | 0.024 EUR |
| Growth | 29 EUR | 1,500 | 0.019 EUR |
| **Pro** | **39 EUR** | **2,500** | **0.016 EUR** |
| Scale | Custom | 5,000-150,000 | <0.02 EUR |

**Recommandation Axiom** : Plan Pro a 39 EUR/mois (2,500 credits) couvre 500 leads/mois avec marge.

#### 3.4.2 Hunter.io API

**Base URL** : `https://api.hunter.io/v2/`
**Authentification** : Query param `api_key=KEY` ou header `X-API-KEY: KEY` ou Bearer token
**Rate limit** : 15 requetes/seconde, 500 requetes/minute
**Mode** : SYNCHRONE (reponse immediate)

**Endpoint 1 -- DOMAIN SEARCH** (mapper les employes d'un domaine) :

```
GET /domain-search?domain=techcorp.fr&type=personal&seniority=executive&department=marketing&limit=10&api_key=KEY
```

**Parametres** :
- `domain` (requis*) : nom de domaine exact
- `company` (requis*) : alternative au domaine (nom entreprise)
- `limit` : 1-10 (defaut: 10)
- `offset` : pagination
- `type` : `personal` ou `generic`
- `seniority` : `junior`, `senior`, `executive`
- `department` : `it`, `sales`, `marketing`, `finance`, `hr`, `operations`

*Au moins `domain` ou `company` requis.

**Reponse JSON** :
```json
{
  "data": {
    "domain": "techcorp.fr",
    "organization": "TechCorp SAS",
    "emails": [
      {
        "value": "sophie.martin@techcorp.fr",
        "type": "personal",
        "confidence": 92,
        "first_name": "Sophie",
        "last_name": "Martin",
        "position": "Chief Marketing Officer",
        "seniority": "executive",
        "department": "marketing",
        "twitter": null,
        "linkedin_url": "https://www.linkedin.com/in/sophie-martin",
        "sources": ["https://www.example.com"]
      }
    ]
  },
  "meta": {
    "results": 35,
    "limit": 10,
    "offset": 0
  }
}
```

**Consommation** : 1 credit par email trouve dans les resultats.

**Endpoint 2 -- EMAIL FINDER** (trouver l'email d'une personne precise) :

```
GET /email-finder?domain=techcorp.fr&first_name=Sophie&last_name=Martin&api_key=KEY
```

**Parametres** :
- `domain` ou `company` (requis) : domaine/nom entreprise
- `first_name` + `last_name` ou `full_name` (requis) : identite
- `max_duration` : 3-20 secondes (defaut: 10s)

**Reponse JSON** :
```json
{
  "data": {
    "email": "sophie.martin@techcorp.fr",
    "first_name": "Sophie",
    "last_name": "Martin",
    "score": 97,
    "confidence": 97,
    "position": "CMO",
    "company": "TechCorp SAS",
    "linkedin_url": "https://www.linkedin.com/in/sophie-martin",
    "phone_number": null
  }
}
```

**Consommation** : 1 credit par recherche.

**Endpoint 3 -- EMAIL VERIFIER** :

```
GET /email-verifier?email=sophie.martin@techcorp.fr&api_key=KEY
```

**Reponse JSON** :
```json
{
  "data": {
    "email": "sophie.martin@techcorp.fr",
    "status": "valid",
    "score": 100,
    "regexp": true,
    "disposable": false,
    "webmail": false,
    "mx_records": true,
    "smtp_check": true,
    "accept_all": false
  }
}
```

**Statuts possibles** :
- `valid` : email existant et deliverable
- `invalid` : format invalide ou domaine inexistant
- `accept_all` : domaine catch-all (DANGER -- bounce 30-50%)
- `webmail` : Gmail, Yahoo, Outlook
- `disposable` : adresse temporaire
- `unknown` : impossible a determiner

**Rate limits** :
- Email verifier : 10 req/s, 300 req/min
- Consommation : 1 credit par verification

**Pricing Hunter.io 2026** :

| Plan | Cout/mois | Credits | Prix/contact |
|------|----------|---------|-------------|
| Free | 0 EUR | 50 | Gratuit (tests) |
| **Starter** | **49 USD** | **500** | **0.098 USD** |
| Growth | 149 USD | 1,500 | 0.099 USD |
| Scale | 299 USD | 3,000 | 0.100 USD |

**Rabais annuels** : -30% (Starter a 34 USD/mois)

**Recommandation Axiom** : Plan Starter a 49 USD/mois (500 credits). Hunter est le fallback (40% des leads seulement), donc 500 credits suffisent pour ~200 lookups/mois.

#### 3.4.3 ZeroBounce API

**Base URL** : `https://api.zerobounce.net/v2/`
**Authentification** : Query param `api_key=KEY`
**Rate limit** : Variable selon plan
**Mode** : SYNCHRONE

**Endpoint -- VALIDATE** :

```
GET /validate?api_key=KEY&email=sophie.martin@techcorp.fr&ip_address=
```

**Reponse JSON** :
```json
{
  "address": "sophie.martin@techcorp.fr",
  "status": "valid",
  "sub_status": "",
  "free_email": false,
  "did_you_mean": "",
  "account": "sophie.martin",
  "domain": "techcorp.fr",
  "domain_age_days": "3650",
  "smtp_provider": "google",
  "mx_found": "true",
  "mx_record": "aspmx.l.google.com",
  "firstname": "Sophie",
  "lastname": "Martin",
  "gender": "female",
  "country": "France",
  "region": "Ile-de-France",
  "city": "Paris",
  "zipcode": "75001",
  "processed_at": "2026-03-18T09:15:00Z"
}
```

**Statuts possibles** :
- `valid` : email deliverable
- `invalid` : n'existe pas
- `catch-all` : domaine accepte tout (risque bounce)
- `unknown` : impossible de verifier
- `spamtrap` : piege a spam (NE PAS ENVOYER)
- `abuse` : adresse abuse@ (NE PAS ENVOYER)
- `do_not_mail` : ne pas contacter

**Pricing ZeroBounce 2026** :

| Volume | Cout | Prix/email |
|--------|------|-----------|
| 2,000 | 16 USD | 0.008 USD |
| 5,000 | 35 USD | 0.007 USD |
| 10,000 | 64 USD | 0.0064 USD |

**Recommandation Axiom** : Pack 2,000 a 16 USD/mois. Suffisant pour verifier les emails trouves (pas tous les leads -- seulement ceux avec email).

#### 3.4.4 Kaspr API

**Base URL** : Via API sur demande (plans Business+)
**Authentification** : Token API
**Rate limit** : 60 requetes/minute (Business plan)
**Mode** : SYNCHRONE
**Specialite** : Extraction emails + telephones depuis profils LinkedIn

**Pricing Kaspr 2026** :

| Plan | Cout/mois | Credits | API |
|------|----------|---------|-----|
| Free | 0 EUR | 50 | Non |
| Starter | 45 EUR | 1,000 | Basique |
| **Business** | **79 EUR** | **3,000** | **Oui (60 req/min)** |
| Enterprise | Custom | Illimite | Oui (avance) |

**Donnees retournees** :
- Email professionnel (quand disponible)
- Telephone direct (fixe ou mobile)
- Poste actuel
- Entreprise actuelle

**Taux de couverture** :
- Emails : variable (depends du profil LinkedIn)
- Telephones : ~70% de couverture pour contacts EU

**Recommandation Axiom** : Plan Business a 79 EUR/mois. Utilise uniquement pour les telephones et en fallback email quand Dropcontact + Hunter echouent.

### 3.5 Mapping decideur par segment

```typescript
// mapping_decideur.ts

interface DecideurMapping {
  segment: string
  titres_prioritaires: string[]    // Ordre de recherche
  titres_regex: RegExp[]           // Patterns de matching
  departements_hunter: string[]    // Filtres Hunter domain-search
  seniority_hunter: string         // Filtre seniority
  strategy_notes: string
}

const DECIDEUR_MAPPINGS: Record<string, DecideurMapping> = {
  'pme_metro': {
    segment: 'pme_metro',
    titres_prioritaires: ['CMO', 'Directeur Marketing', 'DG', 'Directeur General', 'CTO', 'DSI'],
    titres_regex: [
      /\b(CMO|Chief Marketing Officer|Directeur Marketing|VP Marketing)\b/i,
      /\b(DG|Directeur G[eé]n[eé]ral|CEO|PDG|G[eé]rant)\b/i,
      /\b(CTO|Chief Technology|DSI|Directeur (des )?Syst[eè]mes|Director IT)\b/i,
    ],
    departements_hunter: ['marketing', 'executive', 'it'],
    seniority_hunter: 'executive',
    strategy_notes: 'Multi-thread : contacter CMO + DG simultanement pour augmenter le taux de reponse',
  },

  'ecommerce_shopify': {
    segment: 'ecommerce_shopify',
    titres_prioritaires: ['Founder', 'Fondateur', 'Head of Growth', 'CMO', 'CEO'],
    titres_regex: [
      /\b(Founder|Fondateur|Co-?Founder|Co-?Fondateur)\b/i,
      /\b(Head of Growth|Growth Manager|Growth Lead)\b/i,
      /\b(CMO|Head of Marketing|Responsable Marketing)\b/i,
      /\b(CEO|PDG|DG)\b/i,
    ],
    departements_hunter: ['executive', 'marketing', 'sales'],
    seniority_hunter: 'executive',
    strategy_notes: 'Les e-commercants Shopify sont souvent petites structures -- le fondateur est souvent le decideur direct',
  },

  'collectivite': {
    segment: 'collectivite',
    titres_prioritaires: ['DGS', 'DSI', 'Directeur Numerique', 'Elu delegue numerique'],
    titres_regex: [
      /\b(DGS|Directeur G[eé]n[eé]ral des Services)\b/i,
      /\b(DSI|Directeur (des )?Syst[eè]mes d.Information)\b/i,
      /\b(Directeur (du )?Num[eé]rique|CDO|Chief Digital)\b/i,
      /\b([EÉ]lu|Adjoint|D[eé]l[eé]gu[eé]).*(num[eé]rique|digital|informatique)\b/i,
    ],
    departements_hunter: ['it', 'executive'],
    seniority_hunter: 'senior',
    strategy_notes: 'Les collectivites ont souvent des emails generiques (contact@mairie-...). Privilegier annuaires officiels + appel standard',
  },

  'startup': {
    segment: 'startup',
    titres_prioritaires: ['Founder', 'CEO', 'CTO', 'Head of Growth'],
    titres_regex: [
      /\b(Founder|CEO|Co-?Founder|Fondateur)\b/i,
      /\b(CTO|Chief Technology|VP Engineering)\b/i,
      /\b(Head of Growth|Growth|VP Product)\b/i,
    ],
    departements_hunter: ['executive', 'it'],
    seniority_hunter: 'executive',
    strategy_notes: 'Startups : email souvent en firstname@ (pattern simple). Verifier GitHub commits pour trouver emails devs',
  },

  'agence_wl': {
    segment: 'agence_wl',
    titres_prioritaires: ['Fondateur', 'CEO', 'Directeur', 'Account Manager'],
    titres_regex: [
      /\b(Fondateur|Founder|CEO|PDG|DG|G[eé]rant)\b/i,
      /\b(Directeur|Director|Managing Director)\b/i,
      /\b(Account Manager|Business Developer|Responsable Grands Comptes)\b/i,
    ],
    departements_hunter: ['executive', 'sales'],
    seniority_hunter: 'executive',
    strategy_notes: 'Agences : structures plates, le fondateur decide. Verifier aussi LinkedIn company page',
  },
}
```

### 3.6 Code d'implementation complet

```typescript
// agents/enrichisseur/contact/enrichisseur_contact.ts
import { DropcontactClient } from '../clients/dropcontact'
import { HunterClient } from '../clients/hunter'
import { ZeroBounceClient } from '../clients/zerobounce'
import { KasprClient } from '../clients/kaspr'
import { PatternMatcher } from '../utils/pattern_matcher'
import { DECIDEUR_MAPPINGS } from './mapping_decideur'

interface ContactEnrichmentInput {
  lead_id: string
  entreprise: {
    nom: string
    site_web?: string | null
    linkedin_company_url?: string | null
    segment_estime: string
  }
  contact?: {
    prenom?: string | null
    nom?: string | null
    poste?: string | null
    linkedin_url?: string | null
  } | null
}

interface ContactEnrichmentResult {
  status: 'success' | 'partial' | 'failed'
  contact: {
    prenom: string | null
    nom: string | null
    poste: string | null
    linkedin_url: string | null
    email: string | null
    email_status: 'verified' | 'catch_all' | 'unverified' | 'not_found'
    email_confidence: number | null
    email_source: 'dropcontact' | 'hunter_domain' | 'hunter_finder' | 'pattern_match' | null
    telephone: string | null
    telephone_source: 'kaspr' | 'dropcontact' | null
  }
  contacts_secondaires: Array<{
    prenom: string
    nom: string
    poste: string
    email: string | null
    linkedin_url: string | null
  }>
  decideur_score: number  // 1-10 : pertinence du titre par rapport au segment
  metadata: {
    waterfall_steps: string[]
    credits_consumed: Record<string, number>
    duration_ms: number
    errors: string[]
  }
}

export class ContactEnrichisseur {
  private dropcontact: DropcontactClient
  private hunter: HunterClient
  private zerobounce: ZeroBounceClient
  private kaspr: KasprClient
  private patternMatcher: PatternMatcher

  constructor() {
    this.dropcontact = new DropcontactClient({
      apiKey: process.env.DROPCONTACT_API_KEY!,
      maxRetries: 3,
    })
    this.hunter = new HunterClient({
      apiKey: process.env.HUNTER_API_KEY!,
      rateLimitPerSecond: 15,
    })
    this.zerobounce = new ZeroBounceClient({
      apiKey: process.env.ZEROBOUNCE_API_KEY!,
    })
    this.kaspr = new KasprClient({
      apiKey: process.env.KASPR_API_KEY!,
      rateLimitPerMinute: 60,
    })
    this.patternMatcher = new PatternMatcher()
  }

  async enrich(input: ContactEnrichmentInput): Promise<ContactEnrichmentResult> {
    const startTime = Date.now()
    const waterfall: string[] = []
    const errors: string[] = []
    const credits: Record<string, number> = {}

    const mapping = DECIDEUR_MAPPINGS[input.entreprise.segment_estime] || DECIDEUR_MAPPINGS['pme_metro']
    const domain = input.entreprise.site_web
      ? new URL(input.entreprise.site_web).hostname.replace('www.', '')
      : null

    // Determiner si on a deja un contact ou si on doit en trouver un
    let targetContact = input.contact || null
    let email: string | null = null
    let emailStatus: string = 'not_found'
    let emailConfidence: number | null = null
    let emailSource: string | null = null
    let telephone: string | null = null
    let telephoneSource: string | null = null
    let contactsSecondaires: any[] = []

    // ═══════════════════════════════════════════════════════════
    // ETAPE 0 : Verifier si le contact existant est le bon decideur
    // ═══════════════════════════════════════════════════════════
    if (targetContact?.poste) {
      const isRelevant = mapping.titres_regex.some(r => r.test(targetContact!.poste!))
      if (!isRelevant) {
        // Le contact fourni n'est pas le bon decideur -> chercher le bon
        waterfall.push('step0_contact_not_relevant_decideur')
        targetContact = null // Reset pour chercher le bon
      } else {
        waterfall.push('step0_contact_is_relevant_decideur')
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ETAPE 1 : DROPCONTACT (primaire)
    // ═══════════════════════════════════════════════════════════
    try {
      waterfall.push('step1_dropcontact')

      if (targetContact?.prenom && targetContact?.nom) {
        // On a un nom -> enrichir directement
        const dcResult = await this.dropcontact.enrich({
          first_name: targetContact.prenom,
          last_name: targetContact.nom,
          company: input.entreprise.nom,
          website: domain,
          siren: true,
          language: 'fr',
        })
        credits['dropcontact'] = (credits['dropcontact'] || 0) + 1

        if (dcResult.email?.[0]?.confidence >= 95) {
          email = dcResult.email[0].email
          emailConfidence = dcResult.email[0].confidence
          emailSource = 'dropcontact'
          emailStatus = 'verified' // Dropcontact inclut la verification
          telephone = dcResult.phone || null
          if (telephone) telephoneSource = 'dropcontact'
          waterfall.push('step1_dropcontact_SUCCESS')
        } else {
          waterfall.push('step1_dropcontact_LOW_CONFIDENCE')
        }
      } else if (domain) {
        // Pas de nom -> chercher par domaine
        const dcResult = await this.dropcontact.enrich({
          company: input.entreprise.nom,
          website: domain,
          siren: true,
          language: 'fr',
        })
        credits['dropcontact'] = (credits['dropcontact'] || 0) + 1

        if (dcResult.email?.[0]?.confidence >= 95) {
          email = dcResult.email[0].email
          emailConfidence = dcResult.email[0].confidence
          emailSource = 'dropcontact'
          emailStatus = 'verified'
          waterfall.push('step1_dropcontact_SUCCESS')
        }
      }
    } catch (err) {
      errors.push(`Dropcontact error: ${(err as Error).message}`)
      waterfall.push('step1_dropcontact_ERROR')
    }

    // ═══════════════════════════════════════════════════════════
    // ETAPE 2 : HUNTER DOMAIN SEARCH (fallback -- si Dropcontact a echoue)
    // ═══════════════════════════════════════════════════════════
    if (!email && domain) {
      try {
        waterfall.push('step2_hunter_domain_search')
        const hunterResults = await this.hunter.domainSearch({
          domain,
          type: 'personal',
          seniority: mapping.seniority_hunter,
          department: mapping.departements_hunter[0], // Priorite 1
          limit: 10,
        })
        credits['hunter'] = (credits['hunter'] || 0) + Math.min(hunterResults.emails.length, 10)

        // Trouver le meilleur match parmi les resultats
        const bestMatch = this.findBestDecideur(hunterResults.emails, mapping)

        if (bestMatch && bestMatch.confidence >= 85) {
          email = bestMatch.value
          emailConfidence = bestMatch.confidence
          emailSource = 'hunter_domain'
          targetContact = {
            prenom: bestMatch.first_name,
            nom: bestMatch.last_name,
            poste: bestMatch.position,
            linkedin_url: bestMatch.linkedin_url,
          }
          waterfall.push('step2_hunter_domain_SUCCESS')
        } else {
          waterfall.push('step2_hunter_domain_NO_MATCH')
        }

        // Stocker les contacts secondaires pour multi-threading
        contactsSecondaires = hunterResults.emails
          .filter((e: any) => e.value !== email)
          .slice(0, 3)
          .map((e: any) => ({
            prenom: e.first_name,
            nom: e.last_name,
            poste: e.position,
            email: e.value,
            linkedin_url: e.linkedin_url,
          }))
      } catch (err) {
        errors.push(`Hunter domain-search error: ${(err as Error).message}`)
        waterfall.push('step2_hunter_domain_ERROR')
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ETAPE 3 : HUNTER EMAIL FINDER (si on a un nom mais pas d'email)
    // ═══════════════════════════════════════════════════════════
    if (!email && targetContact?.prenom && targetContact?.nom && domain) {
      try {
        waterfall.push('step3_hunter_email_finder')
        const finderResult = await this.hunter.emailFinder({
          domain,
          first_name: targetContact.prenom,
          last_name: targetContact.nom,
          max_duration: 10,
        })
        credits['hunter'] = (credits['hunter'] || 0) + 1

        if (finderResult.email && finderResult.confidence >= 85) {
          email = finderResult.email
          emailConfidence = finderResult.confidence
          emailSource = 'hunter_finder'
          waterfall.push('step3_hunter_finder_SUCCESS')
        } else {
          waterfall.push('step3_hunter_finder_LOW_CONFIDENCE')
        }
      } catch (err) {
        errors.push(`Hunter email-finder error: ${(err as Error).message}`)
        waterfall.push('step3_hunter_finder_ERROR')
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ETAPE 4 : PATTERN MATCHING + SMTP (dernier recours)
    // ═══════════════════════════════════════════════════════════
    if (!email && targetContact?.prenom && targetContact?.nom && domain) {
      try {
        waterfall.push('step4_pattern_matching')
        const patternResult = await this.patternMatcher.findEmail({
          firstName: targetContact.prenom,
          lastName: targetContact.nom,
          domain,
        })

        if (patternResult.email) {
          email = patternResult.email
          emailConfidence = patternResult.confidence
          emailSource = 'pattern_match'
          emailStatus = 'unverified' // Pattern match = pas encore verifie
          waterfall.push('step4_pattern_SUCCESS')
        } else {
          waterfall.push('step4_pattern_NO_MATCH')
        }
      } catch (err) {
        errors.push(`Pattern matching error: ${(err as Error).message}`)
        waterfall.push('step4_pattern_ERROR')
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ETAPE 5 : VERIFICATION ZEROBOUNCE (si email trouve)
    // ═══════════════════════════════════════════════════════════
    if (email && emailSource !== 'dropcontact') {
      // Dropcontact inclut deja la verification -- pas besoin de ZeroBounce
      try {
        waterfall.push('step5_zerobounce_verify')
        const verifyResult = await this.zerobounce.validate(email)
        credits['zerobounce'] = (credits['zerobounce'] || 0) + 1

        switch (verifyResult.status) {
          case 'valid':
            emailStatus = 'verified'
            waterfall.push('step5_zerobounce_VALID')
            break
          case 'catch-all':
            emailStatus = 'catch_all'
            waterfall.push('step5_zerobounce_CATCH_ALL')
            break
          case 'invalid':
          case 'spamtrap':
          case 'abuse':
          case 'do_not_mail':
            // Email invalide -> remonter le waterfall ou marquer comme failed
            email = null
            emailStatus = 'not_found'
            emailConfidence = null
            emailSource = null
            waterfall.push('step5_zerobounce_INVALID')
            break
          default:
            emailStatus = 'unverified'
            waterfall.push('step5_zerobounce_UNKNOWN')
        }
      } catch (err) {
        errors.push(`ZeroBounce error: ${(err as Error).message}`)
        emailStatus = 'unverified'
        waterfall.push('step5_zerobounce_ERROR')
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ETAPE 6 : TELEPHONE (en parallele si LinkedIn dispo)
    // ═══════════════════════════════════════════════════════════
    if (!telephone && targetContact?.linkedin_url) {
      try {
        waterfall.push('step6_kaspr_telephone')
        const kasprResult = await this.kaspr.getContactInfo(targetContact.linkedin_url)
        credits['kaspr'] = (credits['kaspr'] || 0) + 1

        if (kasprResult.phone) {
          telephone = kasprResult.phone
          telephoneSource = 'kaspr'
          waterfall.push('step6_kaspr_SUCCESS')
        }
        // Bonus : si Kaspr trouve aussi un email et qu'on n'en a pas
        if (!email && kasprResult.email) {
          email = kasprResult.email
          emailSource = 'kaspr'
          emailStatus = 'unverified' // Kaspr ne verifie pas
          waterfall.push('step6_kaspr_EMAIL_BONUS')
        }
      } catch (err) {
        errors.push(`Kaspr error: ${(err as Error).message}`)
        waterfall.push('step6_kaspr_ERROR')
      }
    }

    // ═══════════════════════════════════════════════════════════
    // CALCUL DU DECIDEUR SCORE
    // ═══════════════════════════════════════════════════════════
    let decideurScore = 0
    if (targetContact?.poste) {
      for (let i = 0; i < mapping.titres_regex.length; i++) {
        if (mapping.titres_regex[i].test(targetContact.poste)) {
          decideurScore = 10 - (i * 2) // Premier match = 10, deuxieme = 8, etc.
          break
        }
      }
    }
    if (decideurScore === 0 && targetContact?.poste) {
      decideurScore = 3 // Poste trouve mais pas dans les cibles prioritaires
    }

    // ═══════════════════════════════════════════════════════════
    // RESULTAT
    // ═══════════════════════════════════════════════════════════
    const status = email && emailStatus === 'verified'
      ? 'success'
      : email
        ? 'partial'
        : 'failed'

    return {
      status,
      contact: {
        prenom: targetContact?.prenom || null,
        nom: targetContact?.nom || null,
        poste: targetContact?.poste || null,
        linkedin_url: targetContact?.linkedin_url || null,
        email,
        email_status: emailStatus as any,
        email_confidence: emailConfidence,
        email_source: emailSource as any,
        telephone,
        telephone_source: telephoneSource as any,
      },
      contacts_secondaires: contactsSecondaires,
      decideur_score: decideurScore,
      metadata: {
        waterfall_steps: waterfall,
        credits_consumed: credits,
        duration_ms: Date.now() - startTime,
        errors,
      },
    }
  }

  private findBestDecideur(emails: any[], mapping: DecideurMapping): any | null {
    // Scorer chaque email selon le matching de titre
    const scored = emails.map(e => {
      let titleScore = 0
      for (let i = 0; i < mapping.titres_regex.length; i++) {
        if (mapping.titres_regex[i].test(e.position || '')) {
          titleScore = 10 - (i * 2)
          break
        }
      }
      return { ...e, titleScore }
    })

    // Trier par score titre decroissant, puis confiance decroissante
    scored.sort((a, b) => {
      if (b.titleScore !== a.titleScore) return b.titleScore - a.titleScore
      return (b.confidence || 0) - (a.confidence || 0)
    })

    return scored[0]?.titleScore > 0 ? scored[0] : scored[0] || null
  }
}
```

### 3.7 Pattern Matching -- Algorithme de generation d'emails

```typescript
// utils/pattern_matcher.ts
import dns from 'dns/promises'
import net from 'net'

interface PatternMatchInput {
  firstName: string
  lastName: string
  domain: string
}

interface PatternMatchResult {
  email: string | null
  confidence: number
  pattern_used: string | null
  is_catch_all: boolean
}

export class PatternMatcher {

  // Patterns ordonnes par frequence en France
  private readonly PATTERNS = [
    { name: 'first.last',   gen: (f: string, l: string) => `${f}.${l}` },           // 48% (entreprises > 200)
    { name: 'firstname',    gen: (f: string, l: string) => `${f}` },                 // 35% (PME < 50)
    { name: 'f.last',       gen: (f: string, l: string) => `${f[0]}.${l}` },         // 18%
    { name: 'flast',        gen: (f: string, l: string) => `${f[0]}${l}` },          // 12%
    { name: 'first_last',   gen: (f: string, l: string) => `${f}_${l}` },            // 8%
    { name: 'first.l',      gen: (f: string, l: string) => `${f}.${l[0]}` },         // 6%
    { name: 'lastfirst',    gen: (f: string, l: string) => `${l}${f[0]}` },          // 5%
    { name: 'last.first',   gen: (f: string, l: string) => `${l}.${f}` },            // 5%
    { name: 'fl',           gen: (f: string, l: string) => `${f[0]}${l[0]}` },       // 2%
    { name: 'last',         gen: (f: string, l: string) => `${l}` },                 // 2%
  ]

  async findEmail(input: PatternMatchInput): Promise<PatternMatchResult> {
    const firstName = this.normalize(input.firstName)
    const lastName = this.normalize(input.lastName)

    // Verifier les MX records du domaine
    let mxRecords: dns.MxRecord[]
    try {
      mxRecords = await dns.resolveMx(input.domain)
    } catch {
      return { email: null, confidence: 0, pattern_used: null, is_catch_all: false }
    }

    if (mxRecords.length === 0) {
      return { email: null, confidence: 0, pattern_used: null, is_catch_all: false }
    }

    const mxHost = mxRecords.sort((a, b) => a.priority - b.priority)[0].exchange

    // Test catch-all : envoyer un email impossible
    const isCatchAll = await this.testCatchAll(mxHost, input.domain)

    if (isCatchAll) {
      // Si catch-all, on ne peut pas verifier via SMTP -- generer le pattern le plus probable
      const mostLikely = `${firstName}.${lastName}@${input.domain}`
      return {
        email: mostLikely,
        confidence: 40, // Faible confiance car catch-all
        pattern_used: 'first.last (catch-all fallback)',
        is_catch_all: true,
      }
    }

    // Tester chaque pattern via SMTP
    for (const pattern of this.PATTERNS) {
      const localPart = pattern.gen(firstName, lastName)
      const email = `${localPart}@${input.domain}`

      const isValid = await this.smtpCheck(mxHost, email)

      if (isValid) {
        return {
          email,
          confidence: 75, // SMTP check OK mais pas 100% fiable
          pattern_used: pattern.name,
          is_catch_all: false,
        }
      }
    }

    return { email: null, confidence: 0, pattern_used: null, is_catch_all: false }
  }

  private async testCatchAll(mxHost: string, domain: string): Promise<boolean> {
    const fakeEmail = `zzznonexistent999@${domain}`
    return this.smtpCheck(mxHost, fakeEmail)
  }

  private smtpCheck(mxHost: string, email: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        socket.destroy()
        resolve(false)
      }, 5000)

      const socket = net.createConnection(25, mxHost, () => {
        let step = 0
        socket.on('data', (data) => {
          const response = data.toString()
          if (step === 0 && response.startsWith('220')) {
            socket.write(`HELO prospection.axiom-marketing.fr\r\n`)
            step = 1
          } else if (step === 1 && response.startsWith('250')) {
            socket.write(`MAIL FROM:<verify@axiom-marketing.fr>\r\n`)
            step = 2
          } else if (step === 2 && response.startsWith('250')) {
            socket.write(`RCPT TO:<${email}>\r\n`)
            step = 3
          } else if (step === 3) {
            socket.write('QUIT\r\n')
            clearTimeout(timeout)
            socket.destroy()
            resolve(response.startsWith('250'))
          }
        })
      })

      socket.on('error', () => {
        clearTimeout(timeout)
        resolve(false)
      })
    })
  }

  private normalize(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Retirer accents
      .replace(/[^a-z]/g, '')          // Garder que lettres
      .trim()
  }
}
```

### 3.8 Format JSON de sortie du sous-agent 2a

```json
{
  "sous_agent": "2a_contact",
  "lead_id": "uuid-du-lead",
  "status": "success",

  "contact_principal": {
    "prenom": "Sophie",
    "nom": "Martin",
    "poste": "Chief Marketing Officer",
    "linkedin_url": "https://linkedin.com/in/sophie-martin",
    "email": "sophie.martin@techcorp.fr",
    "email_status": "verified",
    "email_confidence": 98,
    "email_source": "dropcontact",
    "telephone": "+33123456789",
    "telephone_source": "dropcontact"
  },

  "contacts_secondaires": [
    {
      "prenom": "Jean",
      "nom": "Dupont",
      "poste": "CTO",
      "email": "jean.dupont@techcorp.fr",
      "linkedin_url": "https://linkedin.com/in/jean-dupont"
    }
  ],

  "decideur_score": 10,
  "contact_quality": "high",

  "metadata": {
    "waterfall_steps": [
      "step0_contact_is_relevant_decideur",
      "step1_dropcontact",
      "step1_dropcontact_SUCCESS"
    ],
    "credits_consumed": {
      "dropcontact": 1
    },
    "duration_ms": 45200,
    "errors": []
  }
}
```

### 3.9 Gestion des erreurs et fallbacks

```typescript
const ERROR_HANDLERS_2A: Record<string, ErrorHandler> = {
  'DROPCONTACT_429_RATE_LIMIT': {
    action: 'wait_and_retry',
    waitMs: 2000,
    maxRetries: 3,
    fallback: 'skip_to_hunter',
    alert: 'none',
  },

  'DROPCONTACT_500_SERVER_ERROR': {
    action: 'retry_with_backoff',
    backoffMs: [5000, 15000, 60000],
    maxRetries: 3,
    fallback: 'skip_to_hunter',
    alert: 'slack_warning',
  },

  'DROPCONTACT_TIMEOUT': {
    action: 'retry_once',
    timeoutMs: 180000, // 3 min max pour async
    fallback: 'skip_to_hunter',
    alert: 'none',
  },

  'HUNTER_429_RATE_LIMIT': {
    action: 'wait_and_retry',
    waitMs: 60000, // Hunter rate limit = 1 minute
    maxRetries: 2,
    fallback: 'skip_to_pattern_matching',
    alert: 'none',
  },

  'HUNTER_402_CREDITS_EXHAUSTED': {
    action: 'skip_to_pattern_matching',
    alert: 'slack_critical', // Plus de credits Hunter !
    notify: 'recharger_credits_hunter',
  },

  'ZEROBOUNCE_ERROR': {
    action: 'mark_unverified',
    fallback: 'email_unverified_flag',
    alert: 'slack_info',
  },

  'KASPR_ERROR': {
    action: 'skip_telephone',
    fallback: 'telephone_not_found',
    alert: 'none',
  },

  'ALL_WATERFALL_FAILED': {
    action: 'flag_manual_enrichment',
    fallback: 'mark_lead_manual_required',
    alert: 'slack_info',
  },
}
```

### 3.10 Cache et rate limiting

```typescript
// cache/contact_cache.ts
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

// TTL : 7 jours pour les emails (les gens changent de poste)
const EMAIL_CACHE_TTL = 7 * 24 * 60 * 60 // 604800 secondes

interface CacheEntry {
  email: string | null
  email_status: string
  telephone: string | null
  contact: any
  cached_at: string
  source: string
}

async function getCachedContact(domain: string, fullName: string): Promise<CacheEntry | null> {
  const key = `contact:${domain}:${fullName.toLowerCase().replace(/\s/g, '_')}`
  const cached = await redis.get(key)
  return cached ? JSON.parse(cached) : null
}

async function cacheContact(domain: string, fullName: string, data: CacheEntry): Promise<void> {
  const key = `contact:${domain}:${fullName.toLowerCase().replace(/\s/g, '_')}`
  await redis.set(key, JSON.stringify(data), 'EX', EMAIL_CACHE_TTL)
}

// Rate limiter distribue (Redis-based)
async function checkRateLimit(apiName: string, maxPerMinute: number): Promise<boolean> {
  const key = `ratelimit:${apiName}:${Math.floor(Date.now() / 60000)}`
  const current = await redis.incr(key)
  if (current === 1) {
    await redis.expire(key, 60)
  }
  return current <= maxPerMinute
}
```

### 3.11 Temps de traitement estime

| Etape | Temps moyen | Temps max |
|-------|------------|-----------|
| Step 0 : Verification decideur | <10 ms | <10 ms |
| Step 1 : Dropcontact | 30-120 s | 180 s (async) |
| Step 2 : Hunter Domain Search | 1-3 s | 5 s |
| Step 3 : Hunter Email Finder | 1-10 s | 20 s |
| Step 4 : Pattern Matching SMTP | 5-30 s | 60 s |
| Step 5 : ZeroBounce Verification | 1-3 s | 5 s |
| Step 6 : Kaspr Telephone | 2-5 s | 10 s |
| **Total best case** (Dropcontact OK) | **35-125 s** | **180 s** |
| **Total worst case** (full waterfall) | **40-170 s** | **280 s** |

---

## 4. SOUS-AGENT 2b -- ENRICHISSEUR ENTREPRISE

### 4.1 Mission precise

**Ce qu'il fait** :
- Trouve le SIRET/SIREN de l'entreprise si non fourni par l'Agent 1
- Recupere les donnees financieres : CA des 3 derniers exercices, resultat net
- Recupere les donnees legales : forme juridique, dirigeants, beneficiaires effectifs
- Detecte les entreprises en difficulte (procedures collectives, liquidation, redressement)
- Recupere l'effectif exact (tranches SIRENE ou effectif reel Pappers)
- Enrichit le code APE/NAF et le secteur d'activite
- Detecte les evenements recents via BODACC (levees, cessions, modifications)

**Ce qu'il ne fait PAS** :
- Il n'analyse PAS la stack technique (c'est le sous-agent 2c)
- Il ne contacte PAS l'entreprise
- Il ne juge PAS la qualite commerciale du lead (c'est le SCOREUR)

### 4.2 Architecture technique

**Stack et APIs** :

| Composant | Service | Cout/mois | Acces | Role |
|-----------|---------|----------|-------|------|
| **Donnees SIRENE** | API INSEE Sirene (v3.11) | 0 EUR | Gratuit (cle API requise) | SIRET, effectif (tranches), APE, adresse, statut |
| **Donnees financieres** | API Pappers (v2) | ~25 EUR | 100 credits gratuits + payant | CA, bilans, dirigeants, beneficiaires, BODACC |
| **Donnees legales complementaires** | API Societe.com Pro | ~40 EUR | Payant par credit | Cross-check dirigeants, beneficiaires effectifs |
| **Publications legales** | API BODACC (OpenData) | 0 EUR | Gratuit | Procedures collectives, modifications, cessions |
| **Annuaire officiel** | Annuaire-entreprises.data.gouv.fr | 0 EUR | Gratuit | Fallback open data |
| **Infrastructure** | Redis + PostgreSQL | 0 EUR (inclus) | - | Cache 30 jours |

**Total sous-agent 2b** : ~65 EUR/mois

### 4.3 Strategie Waterfall -- Trouver le SIRET et enrichir

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ WATERFALL ENRICHISSEMENT ENTREPRISE                                         │
│                                                                             │
│  ETAPE 1 : TROUVER LE SIRET (si non fourni)                                │
│  ├── 1a. Cache Redis (TTL 30j) --> si hit, skip API                         │
│  ├── 1b. API INSEE Sirene : recherche par nom + localisation                │
│  │       GET /api-sirene/3.11/siret?q=NOM&nombre=5                          │
│  ├── 1c. Si Dropcontact (2a) a deja retourne le SIREN --> utiliser          │
│  └── 1d. Fallback : Annuaire-entreprises.data.gouv.fr                       │
│                                                                             │
│  ETAPE 2 : DONNEES SIRENE DE BASE                         [<1s]            │
│  ├── API INSEE : GET /api-sirene/3.11/siret/{SIRET}                         │
│  ├── Extract : SIREN, SIRET, APE, adresse, effectif tranches, date creation │
│  ├── Etat administratif : A (actif) ou F (ferme) --> si F, flag ALERTE      │
│  └── Cache result (TTL 30 jours)                                            │
│                                                                             │
│  ETAPE 3 : DONNEES FINANCIERES PAPPERS                    [1-2s]           │
│  ├── API Pappers : GET /v2/entreprise?siren={SIREN}&api_token=KEY           │
│  ├── Extract : CA 3 derniers exercices, resultat net, bilans                │
│  ├── Extract : dirigeants (noms, fonctions, dates nomination)               │
│  ├── Extract : beneficiaires effectifs                                      │
│  ├── Extract : procedures collectives (si existantes)                       │
│  └── Cache result (TTL 30 jours)                                            │
│                                                                             │
│  ETAPE 4 : PUBLICATIONS BODACC                             [1-3s]          │
│  ├── API BODACC OpenData : recherche par SIREN sur 12 derniers mois         │
│  ├── Detecter : creations etablissements (signal croissance)                │
│  ├── Detecter : cessions de parts (levees de fonds potentielles)            │
│  ├── Detecter : procedures collectives (redressement, liquidation)          │
│  ├── Detecter : modifications statuts (changement strategique)              │
│  └── Cache result (TTL 7 jours -- info plus volatile)                       │
│                                                                             │
│  ETAPE 5 : CROSS-CHECK SOCIETE.COM (optionnel)            [1-2s]          │
│  ├── Si lead hot (pre_score >= 60) : enrichir avec Societe.com              │
│  ├── Verifier coherence dirigeants entre Pappers et Societe.com             │
│  └── Completer beneficiaires effectifs si manquants                         │
│                                                                             │
│  RESULTAT FINAL :                                                           │
│  ├── siret_status : 'found' | 'not_found'                                  │
│  ├── financial_status : 'healthy' | 'warning' | 'danger' | 'unknown'       │
│  └── data_completeness : 0-100% (% de champs remplis)                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 APIs -- Endpoints exacts, authentification, reponses

#### 4.4.1 API INSEE Sirene

**Base URL** : `https://api.insee.fr/api-sirene/3.11/`
**Authentification** : Header `X-INSEE-Api-Key-Integration: {token}`
**Rate limit** : 30 requetes/minute (open data)
**Disponibilite** : 99.5%

**Endpoint 1 -- Lookup par SIRET** :

```
GET /siret/{SIRET_NUMBER}
```

**Reponse JSON** :
```json
{
  "header": {
    "statut": 200,
    "message": "OK"
  },
  "etablissement": {
    "siren": "123456789",
    "nic": "00012",
    "siret": "12345678900012",
    "statutDiffusionEtablissement": "O",
    "dateCreationEtablissement": "2015-03-15",
    "trancheEffectifsEtablissement": "22",
    "anneeEffectifsEtablissement": "2024",
    "etatAdministratifEtablissement": "A",
    "uniteLegale": {
      "denominationUniteLegale": "TECHCORP",
      "categorieJuridiqueUniteLegale": "5710",
      "activitePrincipaleUniteLegale": "6202A",
      "trancheEffectifsUniteLegale": "22",
      "categorieEntreprise": "PME"
    },
    "adresseEtablissement": {
      "numeroVoieEtablissement": "12",
      "typeVoieEtablissement": "RUE",
      "libelleVoieEtablissement": "DE LA REPUBLIQUE",
      "codePostalEtablissement": "75011",
      "libelleCommuneEtablissement": "PARIS",
      "codeCommuneEtablissement": "75111"
    }
  }
}
```

**Mapping tranches effectifs** :

| Code tranche | Effectif |
|-------------|---------|
| 00 | 0 salarie |
| 01 | 1-2 |
| 02 | 3-5 |
| 03 | 6-9 |
| 11 | 10-19 |
| 12 | 20-49 |
| 21 | 50-99 |
| 22 | 100-199 |
| 31 | 200-249 |
| 32 | 250-499 |
| 41 | 500-999 |
| 42 | 1000-1999 |
| 51 | 2000-4999 |
| 52 | 5000-9999 |
| 53 | 10000+ |

**Endpoint 2 -- Recherche multi-criteres** :

```
GET /siret?q=denominationUniteLegale:"TechCorp"&nombre=5
```

**Limites critiques de l'API INSEE** :
- PAS de CA (chiffre d'affaires)
- PAS de bilans financiers
- PAS de dirigeants nominatifs
- PAS d'effectif exact (seulement tranches)
- Ces donnees doivent etre obtenues via Pappers

#### 4.4.2 API Pappers

**Base URL** : `https://api.pappers.fr/v2/`
**Authentification** : Query param `api_token=KEY`
**Disponibilite** : 99.9% 24/7
**Fraicheur** : Mise a jour QUOTIDIENNE depuis INSEE, INPI, BODACC

**Endpoint principal -- Recherche entreprise** :

```
GET /entreprise?siren=123456789&api_token=KEY
```

**Reponse JSON (extraits pertinents)** :
```json
{
  "siren": "123456789",
  "siret_siege": "12345678900012",
  "denomination": "TECHCORP SAS",
  "forme_juridique": "SAS - Societe par actions simplifiee",
  "date_creation": "2015-03-15",
  "capital": 50000,
  "effectif": "120",
  "tranche_effectif": "100 a 199 salaries",
  "code_naf": "6202A",
  "libelle_code_naf": "Conseil en systemes et logiciels informatiques",
  "adresse_siege": "12 Rue de la Republique, 75011 Paris",

  "dirigeants": [
    {
      "nom": "Dupont",
      "prenom": "Pierre",
      "fonction": "President",
      "date_nomination": "2015-03-15"
    },
    {
      "nom": "Martin",
      "prenom": "Sophie",
      "fonction": "Directeur General",
      "date_nomination": "2025-12-01"
    }
  ],

  "beneficiaires_effectifs": [
    {
      "nom": "Dupont",
      "prenom": "Pierre",
      "pourcentage_parts": 60,
      "pourcentage_votes": 60
    }
  ],

  "finances": [
    {
      "annee": 2025,
      "chiffre_affaires": 5200000,
      "resultat": 320000,
      "effectif": 120
    },
    {
      "annee": 2024,
      "chiffre_affaires": 4800000,
      "resultat": 280000,
      "effectif": 105
    },
    {
      "annee": 2023,
      "chiffre_affaires": 4200000,
      "resultat": 210000,
      "effectif": 90
    }
  ],

  "procedures_collectives": [],

  "publications_bodacc": [
    {
      "type": "creation",
      "date": "2025-06-15",
      "description": "Creation d'un etablissement secondaire a Lyon"
    }
  ]
}
```

**Pricing Pappers 2026** :
- 100 credits gratuits a la creation du compte professionnel
- Au-dela : prix par credit (degressif selon volume)
- Estimation : ~0.05 EUR par lookup entreprise (variable selon champs demandes)
- Budget mensuel pour 500 leads : ~25 EUR

**Donnees obtenues via Pappers que INSEE ne fournit PAS** :
- CA (chiffre d'affaires) des 3 derniers exercices
- Resultat net
- Effectif exact (pas juste tranches)
- Noms des dirigeants et leurs fonctions
- Beneficiaires effectifs
- Procedures collectives
- Publications BODACC

#### 4.4.3 API Societe.com Pro

**Base URL** : `https://api.societe.com/api/v1/`
**Authentification** : Header `X-Authorization: socapi {token}` ou query param `token={token}`
**Rate limit** : 60 requetes/minute
**Note** : IP autorisation requise

**Endpoints cles** :
- `/entreprise/{siret}/infoslegales` : Infos legales + financieres
- `/entreprise/{siret}/dirigeants` : Liste des dirigeants
- `/entreprise/{siret}/beneficiaires-effectifs` : Beneficiaires
- `/entreprise/search?q={nom}` : Recherche par nom

**Format** : JSON (UTF-8) par defaut
**Couverture** : 12 millions d'entreprises francaises
**Mise a jour** : quotidienne depuis SIRENE, INPI, BODACC
**Cout** : Chaque requete consomme des credits (meme les 404 avec parametres valides)

**Utilisation Axiom** : Reserve aux leads hot (pre_score >= 60) pour cross-check et completer les donnees Pappers si necessaire. Budget : ~40 EUR/mois.

#### 4.4.4 API BODACC (OpenData)

**Console** : `https://opendata.datainfogreffe.fr/api/v1/console`
**Acces** : GRATUIT, libre
**Contact** : donnees-dila@dila.gouv.fr

**Donnees accessibles** :
- Ventes et transferts de parts
- Creations d'etablissements
- Modifications de statuts
- Cancellations (fermetures)
- Procedures collectives (redressements, liquidations)
- Depots de bilans

**Utilite pour l'enrichissement** :
- Detecter les levees de fonds (cessions de participations)
- Detecter les faillites/redressements (signal negatif -- EXCLURE le lead)
- Detecter la croissance (creations d'etablissements)
- Suivre les modifications strategiques

#### 4.4.5 Annuaire-entreprises.data.gouv.fr (Fallback gratuit)

**Endpoint** : `https://annuaire-entreprises.data.gouv.fr/donnees/api-entreprises`
**Acces** : GRATUIT, open data, officiel gouvernement (DINUM)
**GitHub** : `https://github.com/annuaire-entreprises-data-gouv-fr/search-api`

**Utilisation** : Fallback quand l'API INSEE est down ou que les quotas sont atteints.

### 4.5 Code d'implementation complet

```typescript
// agents/enrichisseur/entreprise/enrichisseur_entreprise.ts
import { InseeClient } from '../clients/insee'
import { PappersClient } from '../clients/pappers'
import { BodaccClient } from '../clients/bodacc'
import { SocieteComClient } from '../clients/societecom'

interface EntrepriseEnrichmentInput {
  lead_id: string
  entreprise: {
    nom: string
    siret?: string | null
    site_web?: string | null
    localisation?: string | null
    segment_estime: string
  }
  pre_score: number
  siren_from_dropcontact?: string | null // Bonus : Dropcontact retourne parfois le SIREN
}

interface EntrepriseEnrichmentResult {
  status: 'success' | 'partial' | 'failed'

  identite: {
    siren: string | null
    siret: string | null
    denomination: string | null
    forme_juridique: string | null
    date_creation: string | null
    capital: number | null
    code_naf: string | null
    libelle_naf: string | null
    categorie_entreprise: string | null  // 'PME' | 'ETI' | 'GE' | 'TPE'
    tva_intracommunautaire: string | null
  }

  effectif: {
    tranche_sirene: string | null    // Code INSEE
    effectif_exact: number | null    // Via Pappers
    tranche_libelle: string | null   // "100 a 199 salaries"
  }

  adresse: {
    rue: string | null
    code_postal: string | null
    ville: string | null
    region: string | null
    departement: string | null
    pays: string
  }

  finances: {
    ca_dernier: number | null
    ca_n_moins_1: number | null
    ca_n_moins_2: number | null
    resultat_dernier: number | null
    croissance_ca_pct: number | null  // % croissance CA entre N-1 et N
    annee_dernier_bilan: number | null
  }

  dirigeants: Array<{
    prenom: string
    nom: string
    fonction: string
    date_nomination: string | null
  }>

  beneficiaires_effectifs: Array<{
    prenom: string
    nom: string
    pourcentage_parts: number | null
    pourcentage_votes: number | null
  }>

  signaux_bodacc: Array<{
    type: string  // 'creation' | 'cession' | 'modification' | 'procedure_collective'
    date: string
    description: string
    impact: 'positif' | 'neutre' | 'negatif'
  }>

  alertes: {
    procedure_collective: boolean
    entreprise_fermee: boolean
    ca_en_baisse: boolean
    effectif_en_baisse: boolean
  }

  metadata: {
    sources_utilisees: string[]
    data_completeness_pct: number  // % de champs remplis
    duration_ms: number
    credits_consumed: Record<string, number>
    errors: string[]
    cached: boolean
  }
}

export class EntrepriseEnrichisseur {
  private insee: InseeClient
  private pappers: PappersClient
  private bodacc: BodaccClient
  private societecom: SocieteComClient

  constructor() {
    this.insee = new InseeClient({
      apiKey: process.env.INSEE_API_KEY!,
      rateLimitPerMinute: 30,
    })
    this.pappers = new PappersClient({
      apiToken: process.env.PAPPERS_API_TOKEN!,
    })
    this.bodacc = new BodaccClient() // Gratuit, pas de cle
    this.societecom = new SocieteComClient({
      token: process.env.SOCIETECOM_API_TOKEN!,
    })
  }

  async enrich(input: EntrepriseEnrichmentInput): Promise<EntrepriseEnrichmentResult> {
    const startTime = Date.now()
    const sources: string[] = []
    const errors: string[] = []
    const credits: Record<string, number> = {}

    // Verifier le cache
    const cacheKey = input.entreprise.siret || input.entreprise.nom
    const cached = await this.getCache(cacheKey)
    if (cached) {
      return { ...cached, metadata: { ...cached.metadata, cached: true } }
    }

    let siret = input.entreprise.siret || null
    let siren = input.siren_from_dropcontact || null

    // ═══════════════════════════════════════════════════════════
    // ETAPE 1 : TROUVER LE SIRET (si non fourni)
    // ═══════════════════════════════════════════════════════════
    if (!siret) {
      try {
        // 1a. Si on a le SIREN de Dropcontact, chercher le siege
        if (siren) {
          const inseeResult = await this.insee.getSiren(siren)
          siret = inseeResult?.etablissement?.siret || null
          credits['insee'] = (credits['insee'] || 0) + 1
          sources.push('insee_siren')
        }

        // 1b. Recherche par nom + localisation
        if (!siret) {
          const searchResult = await this.insee.searchByName(
            input.entreprise.nom,
            input.entreprise.localisation
          )
          credits['insee'] = (credits['insee'] || 0) + 1

          if (searchResult.etablissements?.length > 0) {
            // Prendre le premier resultat actif
            const actif = searchResult.etablissements.find(
              (e: any) => e.etatAdministratifEtablissement === 'A'
            )
            siret = actif?.siret || searchResult.etablissements[0].siret
            siren = siret?.substring(0, 9) || null
            sources.push('insee_search')
          }
        }

        // 1c. Fallback annuaire-entreprises.data.gouv.fr
        if (!siret) {
          const fallbackResult = await this.searchAnnuaireEntreprises(input.entreprise.nom)
          if (fallbackResult) {
            siret = fallbackResult.siret
            siren = fallbackResult.siren
            sources.push('annuaire_entreprises')
          }
        }
      } catch (err) {
        errors.push(`SIRET search error: ${(err as Error).message}`)
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ETAPE 2 : DONNEES SIRENE (si SIRET trouve)
    // ═══════════════════════════════════════════════════════════
    let inseeData: any = null
    if (siret) {
      try {
        inseeData = await this.insee.getSiret(siret)
        credits['insee'] = (credits['insee'] || 0) + 1
        sources.push('insee_siret')
      } catch (err) {
        errors.push(`INSEE SIRET lookup error: ${(err as Error).message}`)
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ETAPE 3 + 4 en PARALLELE : Pappers + BODACC
    // ═══════════════════════════════════════════════════════════
    let pappersData: any = null
    let bodaccData: any[] = []

    if (siren) {
      const [pappersResult, bodaccResult] = await Promise.allSettled([
        this.pappers.getEntreprise(siren),
        this.bodacc.searchBySiren(siren, { months: 12 }),
      ])

      if (pappersResult.status === 'fulfilled') {
        pappersData = pappersResult.value
        credits['pappers'] = (credits['pappers'] || 0) + 1
        sources.push('pappers')
      } else {
        errors.push(`Pappers error: ${pappersResult.reason}`)
      }

      if (bodaccResult.status === 'fulfilled') {
        bodaccData = bodaccResult.value || []
        sources.push('bodacc')
      } else {
        errors.push(`BODACC error: ${bodaccResult.reason}`)
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ETAPE 5 : CROSS-CHECK SOCIETE.COM (leads hot seulement)
    // ═══════════════════════════════════════════════════════════
    let societecomData: any = null
    if (siret && input.pre_score >= 60) {
      try {
        societecomData = await this.societecom.getInfosLegales(siret)
        credits['societecom'] = (credits['societecom'] || 0) + 1
        sources.push('societecom')
      } catch (err) {
        errors.push(`Societe.com error: ${(err as Error).message}`)
      }
    }

    // ═══════════════════════════════════════════════════════════
    // CONSOLIDATION DES RESULTATS
    // ═══════════════════════════════════════════════════════════
    const result = this.consolidate(inseeData, pappersData, bodaccData, societecomData)

    // Calculer le taux de completude
    const totalFields = 20
    let filledFields = 0
    if (result.identite.siret) filledFields++
    if (result.identite.denomination) filledFields++
    if (result.identite.forme_juridique) filledFields++
    if (result.identite.date_creation) filledFields++
    if (result.identite.code_naf) filledFields++
    if (result.effectif.effectif_exact || result.effectif.tranche_sirene) filledFields++
    if (result.adresse.ville) filledFields++
    if (result.adresse.code_postal) filledFields++
    if (result.finances.ca_dernier) filledFields++
    if (result.finances.resultat_dernier) filledFields++
    if (result.dirigeants.length > 0) filledFields++
    // ... etc.

    const dataCompleteness = Math.round((filledFields / totalFields) * 100)

    // Determiner le statut
    const status = siret && pappersData ? 'success' : siret ? 'partial' : 'failed'

    return {
      status,
      ...result,
      metadata: {
        sources_utilisees: sources,
        data_completeness_pct: dataCompleteness,
        duration_ms: Date.now() - startTime,
        credits_consumed: credits,
        errors,
        cached: false,
      },
    }
  }

  private consolidate(
    insee: any, pappers: any, bodacc: any[], societecom: any
  ): Omit<EntrepriseEnrichmentResult, 'status' | 'metadata'> {

    // Priorite des sources : Pappers > INSEE > Societe.com > BODACC

    const identite = {
      siren: pappers?.siren || insee?.etablissement?.siren || null,
      siret: pappers?.siret_siege || insee?.etablissement?.siret || null,
      denomination: pappers?.denomination || insee?.etablissement?.uniteLegale?.denominationUniteLegale || null,
      forme_juridique: pappers?.forme_juridique || null,
      date_creation: pappers?.date_creation || insee?.etablissement?.dateCreationEtablissement || null,
      capital: pappers?.capital || null,
      code_naf: pappers?.code_naf || insee?.etablissement?.uniteLegale?.activitePrincipaleUniteLegale || null,
      libelle_naf: pappers?.libelle_code_naf || null,
      categorie_entreprise: insee?.etablissement?.uniteLegale?.categorieEntreprise || null,
      tva_intracommunautaire: pappers?.numero_tva_intracommunautaire || null,
    }

    const effectif = {
      tranche_sirene: insee?.etablissement?.trancheEffectifsEtablissement || null,
      effectif_exact: pappers?.effectif ? parseInt(pappers.effectif) : null,
      tranche_libelle: pappers?.tranche_effectif || null,
    }

    const adresseInsee = insee?.etablissement?.adresseEtablissement
    const adresse = {
      rue: adresseInsee
        ? `${adresseInsee.numeroVoieEtablissement || ''} ${adresseInsee.typeVoieEtablissement || ''} ${adresseInsee.libelleVoieEtablissement || ''}`.trim()
        : null,
      code_postal: adresseInsee?.codePostalEtablissement || null,
      ville: adresseInsee?.libelleCommuneEtablissement || null,
      region: null, // A deduire du code postal
      departement: adresseInsee?.codePostalEtablissement?.substring(0, 2) || null,
      pays: 'France',
    }

    // Finances
    const financesRaw = pappers?.finances || []
    const lastFinance = financesRaw[0]
    const prevFinance = financesRaw[1]
    const croissance = lastFinance?.chiffre_affaires && prevFinance?.chiffre_affaires
      ? Math.round(((lastFinance.chiffre_affaires - prevFinance.chiffre_affaires) / prevFinance.chiffre_affaires) * 100)
      : null

    const finances = {
      ca_dernier: lastFinance?.chiffre_affaires || null,
      ca_n_moins_1: prevFinance?.chiffre_affaires || null,
      ca_n_moins_2: financesRaw[2]?.chiffre_affaires || null,
      resultat_dernier: lastFinance?.resultat || null,
      croissance_ca_pct: croissance,
      annee_dernier_bilan: lastFinance?.annee || null,
    }

    // Dirigeants
    const dirigeants = (pappers?.dirigeants || []).map((d: any) => ({
      prenom: d.prenom,
      nom: d.nom,
      fonction: d.fonction,
      date_nomination: d.date_nomination || null,
    }))

    // Beneficiaires effectifs
    const beneficiaires = (pappers?.beneficiaires_effectifs || []).map((b: any) => ({
      prenom: b.prenom,
      nom: b.nom,
      pourcentage_parts: b.pourcentage_parts || null,
      pourcentage_votes: b.pourcentage_votes || null,
    }))

    // Signaux BODACC
    const signaux_bodacc = (bodacc || []).map((pub: any) => ({
      type: this.categorizeBodacc(pub.type),
      date: pub.date,
      description: pub.description,
      impact: this.evaluateBodaccImpact(pub.type),
    }))

    // Alertes
    const alertes = {
      procedure_collective: (pappers?.procedures_collectives || []).length > 0,
      entreprise_fermee: insee?.etablissement?.etatAdministratifEtablissement === 'F',
      ca_en_baisse: croissance !== null && croissance < -10,
      effectif_en_baisse: false, // A calculer si historique dispo
    }

    return {
      identite,
      effectif,
      adresse,
      finances,
      dirigeants,
      beneficiaires_effectifs: beneficiaires,
      signaux_bodacc,
      alertes,
    }
  }

  private categorizeBodacc(type: string): string {
    const mapping: Record<string, string> = {
      'creation': 'creation',
      'vente': 'cession',
      'modification': 'modification',
      'radiation': 'procedure_collective',
      'jugement': 'procedure_collective',
    }
    return mapping[type] || 'autre'
  }

  private evaluateBodaccImpact(type: string): 'positif' | 'neutre' | 'negatif' {
    if (['creation'].includes(type)) return 'positif'
    if (['radiation', 'jugement'].includes(type)) return 'negatif'
    return 'neutre'
  }

  private async getCache(key: string): Promise<EntrepriseEnrichmentResult | null> {
    const cached = await redis.get(`entreprise:${key}`)
    return cached ? JSON.parse(cached) : null
  }
}
```

### 4.6 Format JSON de sortie du sous-agent 2b

```json
{
  "sous_agent": "2b_entreprise",
  "lead_id": "uuid-du-lead",
  "status": "success",

  "identite": {
    "siren": "123456789",
    "siret": "12345678900012",
    "denomination": "TECHCORP SAS",
    "forme_juridique": "SAS - Societe par actions simplifiee",
    "date_creation": "2015-03-15",
    "capital": 50000,
    "code_naf": "6202A",
    "libelle_naf": "Conseil en systemes et logiciels informatiques",
    "categorie_entreprise": "PME",
    "tva_intracommunautaire": "FR12123456789"
  },

  "effectif": {
    "tranche_sirene": "22",
    "effectif_exact": 120,
    "tranche_libelle": "100 a 199 salaries"
  },

  "adresse": {
    "rue": "12 RUE DE LA REPUBLIQUE",
    "code_postal": "75011",
    "ville": "PARIS",
    "region": "Ile-de-France",
    "departement": "75",
    "pays": "France"
  },

  "finances": {
    "ca_dernier": 5200000,
    "ca_n_moins_1": 4800000,
    "ca_n_moins_2": 4200000,
    "resultat_dernier": 320000,
    "croissance_ca_pct": 8,
    "annee_dernier_bilan": 2025
  },

  "dirigeants": [
    {
      "prenom": "Pierre",
      "nom": "Dupont",
      "fonction": "President",
      "date_nomination": "2015-03-15"
    },
    {
      "prenom": "Sophie",
      "nom": "Martin",
      "fonction": "Directeur General",
      "date_nomination": "2025-12-01"
    }
  ],

  "beneficiaires_effectifs": [
    {
      "prenom": "Pierre",
      "nom": "Dupont",
      "pourcentage_parts": 60,
      "pourcentage_votes": 60
    }
  ],

  "signaux_bodacc": [
    {
      "type": "creation",
      "date": "2025-06-15",
      "description": "Creation d'un etablissement secondaire a Lyon",
      "impact": "positif"
    }
  ],

  "alertes": {
    "procedure_collective": false,
    "entreprise_fermee": false,
    "ca_en_baisse": false,
    "effectif_en_baisse": false
  },

  "metadata": {
    "sources_utilisees": ["insee_search", "insee_siret", "pappers", "bodacc"],
    "data_completeness_pct": 85,
    "duration_ms": 3200,
    "credits_consumed": {
      "insee": 2,
      "pappers": 1
    },
    "errors": [],
    "cached": false
  }
}
```

### 4.7 Gestion des erreurs et fallbacks

```typescript
const ERROR_HANDLERS_2B: Record<string, ErrorHandler> = {
  'INSEE_429_RATE_LIMIT': {
    action: 'wait_and_retry',
    waitMs: 60000, // 30 req/min -> attendre 1 min
    maxRetries: 3,
    fallback: 'use_annuaire_entreprises',
    alert: 'none',
  },

  'INSEE_503_UNAVAILABLE': {
    action: 'use_cached_or_fallback',
    fallback: 'use_annuaire_entreprises',
    alert: 'slack_warning',
  },

  'PAPPERS_CREDITS_EXHAUSTED': {
    action: 'skip_financial_data',
    fallback: 'finances_unknown',
    alert: 'slack_critical',
    notify: 'recharger_credits_pappers',
  },

  'PAPPERS_404_NOT_FOUND': {
    action: 'skip',
    fallback: 'entreprise_not_in_pappers',
    alert: 'none', // Normal pour les TPE
  },

  'BODACC_ERROR': {
    action: 'skip',
    fallback: 'no_bodacc_signals',
    alert: 'none',
  },

  'SIRET_NOT_FOUND': {
    action: 'flag_manual',
    fallback: 'mark_siret_not_found',
    alert: 'slack_info',
  },

  'ENTREPRISE_FERMEE': {
    action: 'flag_exclude',
    fallback: 'mark_lead_excluded',
    alert: 'none', // Pas une erreur, juste un filtre
    reason: 'Entreprise fermee (etat F dans INSEE)',
  },
}
```

### 4.8 Cache et rate limiting

```typescript
// Cache entreprise : TTL 30 jours (les donnees legales changent rarement)
const ENTREPRISE_CACHE_TTL = 30 * 24 * 60 * 60 // 2592000 secondes

// Cache BODACC : TTL 7 jours (publications plus frequentes)
const BODACC_CACHE_TTL = 7 * 24 * 60 * 60 // 604800 secondes

// Rate limiting INSEE : 30 requetes/minute
// Implementation via le rate limiter distribue Redis (cf. section 3.10)
```

### 4.9 Temps de traitement estime

| Etape | Temps moyen | Temps max |
|-------|------------|-----------|
| Etape 1 : Recherche SIRET | 0.5-2 s | 5 s |
| Etape 2 : Lookup INSEE | 0.3-1 s | 3 s |
| Etape 3 : Pappers (parallele) | 0.8-2 s | 5 s |
| Etape 4 : BODACC (parallele avec 3) | 1-3 s | 5 s |
| Etape 5 : Societe.com (optionnel) | 1-2 s | 3 s |
| **Total** | **2-5 s** | **10 s** |

---

## 5. SOUS-AGENT 2c -- ENRICHISSEUR TECHNIQUE

### 5.1 Mission precise

**Ce qu'il fait** :
- Detecte la stack technique complete du site web du prospect (CMS, frameworks, analytics, etc.)
- Mesure la performance du site (Lighthouse Core Web Vitals)
- Evalue l'accessibilite (score axe-core / RGAA)
- Identifie les problemes techniques exploitables commercialement

**Ce qu'il ne fait PAS** :
- Il ne duplique PAS le travail de l'Agent 1c (Veilleur Web)
- Si l'Agent 1c a deja fait un scan technique, les resultats sont reutilises
- Il n'envoie AUCUN message au prospect

### 5.2 Coordination avec l'Agent 1c (pas de redondance)

```typescript
// Logique de decision : faut-il scanner ?
function shouldRunTechScan(lead: NormalizedLead): boolean {
  // Si le lead vient de la veille web (Agent 1c), les donnees tech existent deja
  if (lead.sources.includes('veille_web')) {
    return false // NE PAS re-scanner
  }

  // Si le lead n'a pas de site web, impossible de scanner
  if (!lead.entreprise.site_web) {
    return false
  }

  // Si un scan recent existe en BDD (< 30 jours), reutiliser
  const existingScan = await db.query(
    `SELECT * FROM audits_techniques
     WHERE url = $1 AND scanned_at > NOW() - INTERVAL '30 days'
     ORDER BY scanned_at DESC LIMIT 1`,
    [lead.entreprise.site_web]
  )

  if (existingScan.rows.length > 0) {
    return false // Reutiliser le scan existant
  }

  // Sinon, scanner
  return true
}
```

**Regle claire** : L'Agent 2c ne scanne QUE si :
1. Le lead ne vient PAS de la source `veille_web` (Agent 1c)
2. Le lead a un `site_web`
3. Il n'y a pas de scan de moins de 30 jours en base `audits_techniques`

### 5.3 Architecture technique

**Stack et outils** :

| Composant | Service | Cout/mois | Role |
|-----------|---------|----------|------|
| **Stack detection** | Wappalyzer API | ~30 EUR | Detection frameworks, CMS, analytics |
| **Performance** | Google Lighthouse CLI | 0 EUR | Core Web Vitals, scores perf/a11y/SEO |
| **Accessibilite** | axe-core (npm) | 0 EUR | Violations RGAA/WCAG |
| **Navigateur headless** | Playwright | 0 EUR | Rendu pages pour analyse |
| **Infrastructure** | Worker dedie (CPU-intensif) | 0 EUR (inclus VPS) | Isolation charge CPU |

**Total sous-agent 2c** : ~30 EUR/mois

### 5.4 Wappalyzer API

**Base URL** : `https://api.wappalyzer.com/v2/`
**Authentification** : Token API
**Mode** : SYNCHRONE

**Alternatives npm** (si API trop chere) :
- `@ryntab/wappalyzer-node` (v2.1.4, plus a jour que le package officiel deprecie)
- `wappalyzer-core` (aussi deprecie -- API recommandee)

**Donnees retournees** :
```json
{
  "urls": {
    "https://www.techcorp.fr": {
      "status": 200,
      "technologies": [
        {
          "name": "React",
          "slug": "react",
          "confidence": 100,
          "version": "18.2.0",
          "categories": [
            { "id": 12, "slug": "javascript-frameworks", "name": "JavaScript frameworks" }
          ]
        },
        {
          "name": "Next.js",
          "slug": "next-js",
          "confidence": 100,
          "version": "14.0.0",
          "categories": [
            { "id": 12, "slug": "javascript-frameworks", "name": "JavaScript frameworks" }
          ]
        },
        {
          "name": "Google Analytics",
          "slug": "google-analytics",
          "confidence": 100,
          "categories": [
            { "id": 10, "slug": "analytics", "name": "Analytics" }
          ]
        },
        {
          "name": "Vercel",
          "slug": "vercel",
          "confidence": 100,
          "categories": [
            { "id": 62, "slug": "paas", "name": "PaaS" }
          ]
        }
      ]
    }
  }
}
```

**Precision** : ~94% de detection (superieure a BuiltWith pour le front-end)

**Pricing Wappalyzer** :
- Free tier : 50 lookups/mois
- Pro : ~30 EUR/mois (1000 lookups)
- Enterprise : tarif custom

### 5.5 Google Lighthouse CLI

**Installation** : `npm install -g @lhci/cli@latest`
**Execution** : Via Playwright (headless Chrome)
**Cout** : GRATUIT

**Metriques retournees (JSON)** :
```json
{
  "categories": {
    "performance": { "score": 0.72 },
    "accessibility": { "score": 0.85 },
    "best-practices": { "score": 0.90 },
    "seo": { "score": 0.95 }
  },
  "audits": {
    "first-contentful-paint": { "numericValue": 1200, "displayValue": "1.2 s" },
    "largest-contentful-paint": { "numericValue": 3500, "displayValue": "3.5 s" },
    "cumulative-layout-shift": { "numericValue": 0.05, "displayValue": "0.05" },
    "total-blocking-time": { "numericValue": 450, "displayValue": "450 ms" },
    "speed-index": { "numericValue": 2800, "displayValue": "2.8 s" }
  }
}
```

**Core Web Vitals -- Seuils** :

| Metrique | Bon | A ameliorer | Mauvais |
|----------|-----|------------|---------|
| LCP (Largest Contentful Paint) | <= 2.5s | 2.5-4s | > 4s |
| CLS (Cumulative Layout Shift) | <= 0.1 | 0.1-0.25 | > 0.25 |
| TBT (Total Blocking Time) | <= 300ms | 300-600ms | > 600ms |

### 5.6 axe-core (Accessibilite RGAA/WCAG)

**Installation** : `npm install @axe-core/playwright`
**Execution** : Via Playwright
**Cout** : GRATUIT

**Metriques retournees** :
```json
{
  "violations": [
    {
      "id": "image-alt",
      "impact": "critical",
      "description": "Images must have alternate text",
      "nodes": 12
    },
    {
      "id": "color-contrast",
      "impact": "serious",
      "description": "Elements must have sufficient color contrast",
      "nodes": 8
    }
  ],
  "passes": 45,
  "incomplete": 3,
  "summary": {
    "total_violations": 20,
    "critical": 12,
    "serious": 8,
    "moderate": 0,
    "minor": 0
  }
}
```

### 5.7 Code d'implementation

```typescript
// agents/enrichisseur/technique/enrichisseur_technique.ts
import { chromium, Browser, Page } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

interface TechEnrichmentInput {
  lead_id: string
  site_web: string
}

interface TechEnrichmentResult {
  status: 'success' | 'partial' | 'failed'

  stack: {
    cms: string | null
    cms_version: string | null
    framework_js: string | null
    framework_js_version: string | null
    server: string | null
    analytics: string[]
    ecommerce_platform: string | null
    cdn: string | null
    all_technologies: Array<{
      name: string
      version: string | null
      category: string
      confidence: number
    }>
  }

  performance: {
    score: number | null           // 0-100
    lcp_ms: number | null
    cls: number | null
    tbt_ms: number | null
    fcp_ms: number | null
    speed_index_ms: number | null
    verdict: 'bon' | 'moyen' | 'mauvais' | null
  }

  accessibilite: {
    score: number | null           // 0-100
    violations_total: number
    violations_critical: number
    violations_serious: number
    passes: number
    top_violations: Array<{
      id: string
      impact: string
      description: string
      count: number
    }>
    rgaa_compliant: boolean | null
  }

  seo: {
    score: number | null           // 0-100
    has_robots_txt: boolean
    has_sitemap: boolean
  }

  ssl: {
    valid: boolean
    days_remaining: number | null
  }

  page_weight_mb: number | null

  problemes_detectes: string[]     // Liste des problemes exploitables commercialement

  metadata: {
    url_scanned: string
    duration_ms: number
    errors: string[]
    cached: boolean
  }
}

export class TechEnrichisseur {
  private browser: Browser | null = null

  async enrich(input: TechEnrichmentInput): Promise<TechEnrichmentResult> {
    const startTime = Date.now()
    const errors: string[] = []

    // Verifier le cache (30 jours)
    const cached = await this.getCache(input.site_web)
    if (cached) {
      return { ...cached, metadata: { ...cached.metadata, cached: true } }
    }

    // Lancer les 3 analyses en parallele
    const [stackResult, lighthouseResult, a11yResult] = await Promise.allSettled([
      this.analyzeStack(input.site_web),
      this.runLighthouse(input.site_web),
      this.runAccessibility(input.site_web),
    ])

    // Stack technique
    let stack = this.defaultStack()
    if (stackResult.status === 'fulfilled') {
      stack = stackResult.value
    } else {
      errors.push(`Wappalyzer error: ${stackResult.reason}`)
    }

    // Performance Lighthouse
    let performance = this.defaultPerformance()
    let seo = { score: null as number | null, has_robots_txt: false, has_sitemap: false }
    if (lighthouseResult.status === 'fulfilled') {
      performance = lighthouseResult.value.performance
      seo = lighthouseResult.value.seo
    } else {
      errors.push(`Lighthouse error: ${lighthouseResult.reason}`)
    }

    // Accessibilite
    let accessibilite = this.defaultAccessibilite()
    if (a11yResult.status === 'fulfilled') {
      accessibilite = a11yResult.value
    } else {
      errors.push(`axe-core error: ${a11yResult.reason}`)
    }

    // SSL check
    const ssl = await this.checkSSL(input.site_web)

    // Detecter les problemes exploitables
    const problemes = this.detectProblemes(performance, accessibilite, stack, ssl)

    const status = errors.length === 0 ? 'success' : errors.length < 3 ? 'partial' : 'failed'

    const result: TechEnrichmentResult = {
      status,
      stack,
      performance,
      accessibilite,
      seo,
      ssl,
      page_weight_mb: null, // A completer via Lighthouse
      problemes_detectes: problemes,
      metadata: {
        url_scanned: input.site_web,
        duration_ms: Date.now() - startTime,
        errors,
        cached: false,
      },
    }

    // Cacher le resultat
    await this.setCache(input.site_web, result)

    return result
  }

  private detectProblemes(
    perf: any, a11y: any, stack: any, ssl: any
  ): string[] {
    const problemes: string[] = []

    // Performance
    if (perf.score !== null && perf.score < 30) {
      problemes.push('PERFORMANCE CRITIQUE : score < 30/100 -- site tres lent')
    } else if (perf.score !== null && perf.score < 50) {
      problemes.push('Performance faible : score < 50/100 -- optimisation necessaire')
    }

    if (perf.lcp_ms && perf.lcp_ms > 4000) {
      problemes.push(`LCP trop lent : ${perf.lcp_ms}ms (seuil Google : 2500ms)`)
    }

    // Accessibilite
    if (a11y.violations_critical > 0) {
      problemes.push(`${a11y.violations_critical} violations accessibilite CRITIQUES (RGAA non conforme)`)
    }
    if (a11y.score !== null && a11y.score < 50) {
      problemes.push('Accessibilite insuffisante : score < 50/100')
    }

    // Stack
    if (stack.cms && ['WordPress', 'Joomla', 'Drupal'].includes(stack.cms)) {
      if (stack.cms_version) {
        // Verifier si version obsolete (simplification)
        problemes.push(`CMS ${stack.cms} detecte (version ${stack.cms_version}) -- potentiel de modernisation`)
      }
    }

    // SSL
    if (!ssl.valid) {
      problemes.push('ALERTE : Certificat SSL invalide ou absent')
    } else if (ssl.days_remaining !== null && ssl.days_remaining < 30) {
      problemes.push(`Certificat SSL expire dans ${ssl.days_remaining} jours`)
    }

    return problemes
  }

  // ... methodes privees (analyzeStack, runLighthouse, runAccessibility, checkSSL)
}
```

### 5.8 Format JSON de sortie du sous-agent 2c

```json
{
  "sous_agent": "2c_technique",
  "lead_id": "uuid-du-lead",
  "status": "success",

  "stack": {
    "cms": "WordPress",
    "cms_version": "6.4.3",
    "framework_js": null,
    "framework_js_version": null,
    "server": "Apache",
    "analytics": ["Google Analytics", "Facebook Pixel"],
    "ecommerce_platform": "WooCommerce",
    "cdn": "Cloudflare",
    "all_technologies": [
      { "name": "WordPress", "version": "6.4.3", "category": "CMS", "confidence": 100 },
      { "name": "WooCommerce", "version": "8.5.2", "category": "Ecommerce", "confidence": 100 },
      { "name": "Apache", "version": null, "category": "Web servers", "confidence": 95 },
      { "name": "Cloudflare", "version": null, "category": "CDN", "confidence": 100 },
      { "name": "Google Analytics", "version": null, "category": "Analytics", "confidence": 100 }
    ]
  },

  "performance": {
    "score": 42,
    "lcp_ms": 4200,
    "cls": 0.15,
    "tbt_ms": 620,
    "fcp_ms": 2100,
    "speed_index_ms": 3800,
    "verdict": "mauvais"
  },

  "accessibilite": {
    "score": 62,
    "violations_total": 18,
    "violations_critical": 5,
    "violations_serious": 8,
    "passes": 42,
    "top_violations": [
      { "id": "image-alt", "impact": "critical", "description": "Images must have alternate text", "count": 12 },
      { "id": "color-contrast", "impact": "serious", "description": "Insufficient color contrast", "count": 6 }
    ],
    "rgaa_compliant": false
  },

  "seo": {
    "score": 78,
    "has_robots_txt": true,
    "has_sitemap": true
  },

  "ssl": {
    "valid": true,
    "days_remaining": 245
  },

  "page_weight_mb": 3.2,

  "problemes_detectes": [
    "Performance faible : score 42/100 -- optimisation necessaire",
    "LCP trop lent : 4200ms (seuil Google : 2500ms)",
    "5 violations accessibilite CRITIQUES (RGAA non conforme)",
    "CMS WordPress detecte (version 6.4.3) -- potentiel de modernisation"
  ],

  "metadata": {
    "url_scanned": "https://www.techcorp.fr",
    "duration_ms": 12500,
    "errors": [],
    "cached": false
  }
}
```

### 5.9 Gestion des erreurs

```typescript
const ERROR_HANDLERS_2C: Record<string, ErrorHandler> = {
  'WAPPALYZER_API_ERROR': {
    action: 'retry_once',
    fallback: 'use_builtin_detection', // Headers HTTP basiques
    alert: 'none',
  },

  'LIGHTHOUSE_TIMEOUT': {
    action: 'retry_with_reduced_config',
    config: { onlyCategories: ['performance'] }, // Reduire le scope
    timeoutMs: 120000,
    fallback: 'skip_performance',
    alert: 'slack_info',
  },

  'PLAYWRIGHT_CRASH': {
    action: 'restart_browser_and_retry',
    maxRetries: 2,
    fallback: 'skip_tech_scan',
    alert: 'slack_warning',
  },

  'SITE_UNREACHABLE': {
    action: 'flag_site_down',
    fallback: 'mark_site_unreachable',
    alert: 'none', // Le site du prospect est down, ce n'est pas notre probleme
    addSignal: 'site_down', // Ajouter comme signal negatif pour le SCOREUR
  },

  'SSL_ERROR': {
    action: 'continue_without_ssl',
    fallback: 'ssl_unknown',
    addSignal: 'ssl_invalide', // Signal commercial exploitable
    alert: 'none',
  },
}
```

### 5.10 Temps de traitement estime

| Analyse | Temps moyen | Temps max |
|---------|------------|-----------|
| Wappalyzer API | 2-5 s | 10 s |
| Lighthouse (performance + a11y + SEO) | 5-15 s | 60 s |
| axe-core (accessibilite detaillee) | 3-8 s | 20 s |
| SSL check | <1 s | 3 s |
| **Total** (parallele) | **8-15 s** | **60 s** |

---

## 6. AGENT MASTER ENRICHISSEUR -- ORCHESTRATEUR

### 6.1 Mission

Orchestrer les 3 sous-agents (2a, 2b, 2c), fusionner leurs resultats en une fiche prospect unique et complete, deduplicater avec les prospects existants en base, et transmettre la fiche enrichie a l'Agent 3 (SCOREUR).

### 6.2 Architecture d'orchestration

```
┌──────────────────────────────────────────────────────────────────────────┐
│ MASTER ENRICHISSEUR -- WORKFLOW COMPLET                                  │
│                                                                          │
│  INPUT (queue BullMQ 'enrichisseur-pipeline')                            │
│  ├── lead_data : NormalizedLead (schema Agent 1)                         │
│  ├── priority : 1 (hot) | 5 (warm) | 10 (cold)                          │
│  └── attempts : max 3 (retry automatique)                                │
│                                                                          │
│  STEP 1 : VERIFICATION PRE-ENRICHISSEMENT                               │
│  ├── Lead deja enrichi en BDD ? --> skip                                 │
│  ├── Entreprise exclue (procedure collective, fermee) ? --> skip         │
│  ├── Email deja blackliste (opposition RGPD) ? --> skip                  │
│  └── Determiner les traitements requis                                   │
│                                                                          │
│  STEP 2 : LANCEMENT PARALLELE DES SOUS-AGENTS                           │
│  ├── 2a Contact ─────────┐                                               │
│  ├── 2b Entreprise ──────┤──> Promise.allSettled()                       │
│  └── 2c Technique ───────┘    (max 3 minutes timeout global)             │
│                                                                          │
│  STEP 3 : FUSION DES RESULTATS                                          │
│  ├── Merger contact (2a) + entreprise (2b) + technique (2c)              │
│  ├── Resoudre les conflits de donnees (priorite des sources)             │
│  ├── Calculer le score de completude global                              │
│  └── Generer la fiche prospect enrichie                                  │
│                                                                          │
│  STEP 4 : DEDUPLICATION BDD                                             │
│  ├── Chercher doublon par SIRET (100% fiable)                            │
│  ├── Chercher doublon par email (95% fiable)                             │
│  ├── Chercher doublon par domaine (90% fiable)                           │
│  ├── Si doublon : fusionner signaux + enrichir fiche existante           │
│  └── Si nouveau : inserer dans table prospects                           │
│                                                                          │
│  STEP 5 : CONTROLE QUALITE                                              │
│  ├── Verifier que les champs critiques sont remplis                      │
│  ├── Verifier la coherence des donnees                                   │
│  ├── Flagger les leads incomplets pour enrichissement manuel             │
│  └── Logger les metriques                                                │
│                                                                          │
│  STEP 6 : DISPATCH VERS SCOREUR                                         │
│  ├── Envoyer la fiche enrichie vers queue 'scoreur-pipeline'             │
│  ├── Priorite basee sur completude + pre_score                           │
│  └── Logger le throughput                                                │
│                                                                          │
│  OUTPUT : Fiche Prospect Enrichie (schema section 6.6)                   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Parallelisation des sous-agents

```typescript
// agents/enrichisseur/master/orchestrateur.ts
import { ContactEnrichisseur } from '../contact/enrichisseur_contact'
import { EntrepriseEnrichisseur } from '../entreprise/enrichisseur_entreprise'
import { TechEnrichisseur } from '../technique/enrichisseur_technique'
import { Queue, Worker } from 'bullmq'

const GLOBAL_TIMEOUT_MS = 180000 // 3 minutes max par lead

export class MasterEnrichisseur {
  private contactAgent: ContactEnrichisseur
  private entrepriseAgent: EntrepriseEnrichisseur
  private techAgent: TechEnrichisseur
  private scoreurQueue: Queue

  constructor() {
    this.contactAgent = new ContactEnrichisseur()
    this.entrepriseAgent = new EntrepriseEnrichisseur()
    this.techAgent = new TechEnrichisseur()
    this.scoreurQueue = new Queue('scoreur-pipeline', { connection: redis })
  }

  async enrichLead(lead: NormalizedLead): Promise<EnrichedProspect> {
    const startTime = Date.now()

    // ═══════════════════════════════════════════════════════════
    // STEP 1 : VERIFICATION PRE-ENRICHISSEMENT
    // ═══════════════════════════════════════════════════════════
    const preCheck = await this.preEnrichmentCheck(lead)
    if (preCheck.skip) {
      return preCheck.existingProspect! // Deja enrichi ou exclu
    }

    const traitements = lead.metadata.traitement_requis || [
      'enrichissement_contact',
      'enrichissement_entreprise',
      'scan_technique',
    ]

    // ═══════════════════════════════════════════════════════════
    // STEP 2 : LANCEMENT PARALLELE
    // ═══════════════════════════════════════════════════════════
    const tasks: Promise<any>[] = []

    // 2a Contact
    if (traitements.includes('enrichissement_contact')) {
      tasks.push(
        Promise.race([
          this.contactAgent.enrich({
            lead_id: lead.lead_id,
            entreprise: lead.entreprise,
            contact: lead.contact,
          }),
          this.timeout(GLOBAL_TIMEOUT_MS, '2a_contact_timeout'),
        ]).catch(err => ({ status: 'failed', error: err.message }))
      )
    } else {
      tasks.push(Promise.resolve(null))
    }

    // 2b Entreprise
    if (traitements.includes('enrichissement_entreprise')) {
      tasks.push(
        Promise.race([
          this.entrepriseAgent.enrich({
            lead_id: lead.lead_id,
            entreprise: lead.entreprise,
            pre_score: lead.pre_score.total,
          }),
          this.timeout(GLOBAL_TIMEOUT_MS, '2b_entreprise_timeout'),
        ]).catch(err => ({ status: 'failed', error: err.message }))
      )
    } else {
      tasks.push(Promise.resolve(null))
    }

    // 2c Technique
    if (traitements.includes('scan_technique') && lead.entreprise.site_web) {
      const shouldScan = await this.shouldRunTechScan(lead)
      if (shouldScan) {
        tasks.push(
          Promise.race([
            this.techAgent.enrich({
              lead_id: lead.lead_id,
              site_web: lead.entreprise.site_web,
            }),
            this.timeout(GLOBAL_TIMEOUT_MS, '2c_technique_timeout'),
          ]).catch(err => ({ status: 'failed', error: err.message }))
        )
      } else {
        // Recuperer le scan existant
        tasks.push(this.getExistingTechScan(lead.entreprise.site_web))
      }
    } else {
      tasks.push(Promise.resolve(null))
    }

    // Lancer les 3 en parallele
    const [contactResult, entrepriseResult, techResult] = await Promise.allSettled(tasks)

    // ═══════════════════════════════════════════════════════════
    // STEP 3 : FUSION DES RESULTATS
    // ═══════════════════════════════════════════════════════════
    const enrichedProspect = this.fuseResults(
      lead,
      contactResult.status === 'fulfilled' ? contactResult.value : null,
      entrepriseResult.status === 'fulfilled' ? entrepriseResult.value : null,
      techResult.status === 'fulfilled' ? techResult.value : null,
    )

    // ═══════════════════════════════════════════════════════════
    // STEP 4 : DEDUPLICATION BDD
    // ═══════════════════════════════════════════════════════════
    const dedupResult = await this.deduplicateWithBDD(enrichedProspect)
    const finalProspect = dedupResult.isNew
      ? enrichedProspect
      : this.mergeWithExisting(enrichedProspect, dedupResult.existingProspect!)

    // ═══════════════════════════════════════════════════════════
    // STEP 5 : CONTROLE QUALITE
    // ═══════════════════════════════════════════════════════════
    const qualityCheck = this.checkQuality(finalProspect)
    finalProspect.enrichissement.qualite = qualityCheck

    // Persister en BDD
    await this.saveProspect(finalProspect, dedupResult.isNew)

    // ═══════════════════════════════════════════════════════════
    // STEP 6 : DISPATCH VERS SCOREUR
    // ═══════════════════════════════════════════════════════════
    if (qualityCheck.enrichable) {
      await this.scoreurQueue.add('score_prospect', {
        prospect_id: finalProspect.prospect_id,
        prospect_data: finalProspect,
        priority: finalProspect.enrichissement.qualite.completude_pct >= 70 ? 1 : 5,
      }, {
        priority: finalProspect.enrichissement.qualite.completude_pct >= 70 ? 1 : 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      })
    }

    // Metriques
    await this.logMetrics(finalProspect, Date.now() - startTime)

    return finalProspect
  }

  // ═══════════════════════════════════════════════════════════
  // METHODES PRIVEES
  // ═══════════════════════════════════════════════════════════

  private async preEnrichmentCheck(lead: NormalizedLead): Promise<{
    skip: boolean
    reason?: string
    existingProspect?: EnrichedProspect
  }> {
    // Verifier si deja enrichi
    const existing = await db.query(
      `SELECT * FROM prospects WHERE lead_id = $1 AND enrichissement_status = 'complet'`,
      [lead.lead_id]
    )
    if (existing.rows.length > 0) {
      return { skip: true, reason: 'deja_enrichi', existingProspect: existing.rows[0] }
    }

    // Verifier blacklist RGPD
    if (lead.contact?.email) {
      const blacklisted = await db.query(
        `SELECT * FROM rgpd_oppositions WHERE email = $1`,
        [lead.contact.email]
      )
      if (blacklisted.rows.length > 0) {
        return { skip: true, reason: 'opposition_rgpd' }
      }
    }

    return { skip: false }
  }

  private fuseResults(
    lead: NormalizedLead,
    contact: any | null,
    entreprise: any | null,
    technique: any | null,
  ): EnrichedProspect {
    return {
      prospect_id: crypto.randomUUID(),
      lead_id: lead.lead_id,
      created_at: new Date().toISOString(),

      // --- Entreprise (fusion 2b + lead original) ---
      entreprise: {
        nom: entreprise?.identite?.denomination || lead.entreprise.nom,
        siren: entreprise?.identite?.siren || null,
        siret: entreprise?.identite?.siret || lead.entreprise.siret || null,
        forme_juridique: entreprise?.identite?.forme_juridique || null,
        date_creation: entreprise?.identite?.date_creation || null,
        capital: entreprise?.identite?.capital || null,
        code_naf: entreprise?.identite?.code_naf || null,
        libelle_naf: entreprise?.identite?.libelle_naf || null,
        categorie: entreprise?.identite?.categorie_entreprise || null,
        tva_intracommunautaire: entreprise?.identite?.tva_intracommunautaire || null,
        site_web: lead.entreprise.site_web || null,
        linkedin_url: lead.entreprise.linkedin_company_url || null,
        secteur: entreprise?.identite?.libelle_naf || lead.entreprise.secteur || null,
        segment: lead.entreprise.segment_estime,

        effectif: {
          tranche: entreprise?.effectif?.tranche_libelle || lead.entreprise.taille_estimee || null,
          exact: entreprise?.effectif?.effectif_exact || null,
        },

        adresse: entreprise?.adresse || {
          rue: null,
          code_postal: null,
          ville: null,
          departement: null,
          region: null,
          pays: 'France',
        },

        finances: entreprise?.finances || {
          ca_dernier: null,
          ca_n_moins_1: null,
          ca_n_moins_2: null,
          resultat_dernier: null,
          croissance_ca_pct: null,
          annee_dernier_bilan: null,
        },

        dirigeants: entreprise?.dirigeants || [],
        beneficiaires_effectifs: entreprise?.beneficiaires_effectifs || [],
        signaux_bodacc: entreprise?.signaux_bodacc || [],
        alertes: entreprise?.alertes || {
          procedure_collective: false,
          entreprise_fermee: false,
          ca_en_baisse: false,
          effectif_en_baisse: false,
        },
      },

      // --- Contact principal (fusion 2a + lead original) ---
      contact: {
        prenom: contact?.contact_principal?.prenom || lead.contact?.prenom || null,
        nom: contact?.contact_principal?.nom || lead.contact?.nom || null,
        poste: contact?.contact_principal?.poste || lead.contact?.poste || null,
        linkedin_url: contact?.contact_principal?.linkedin_url || lead.contact?.linkedin_url || null,
        email: contact?.contact_principal?.email || lead.contact?.email || null,
        email_status: contact?.contact_principal?.email_status || 'not_found',
        email_confidence: contact?.contact_principal?.email_confidence || null,
        telephone: contact?.contact_principal?.telephone || null,
        decideur_score: contact?.decideur_score || 0,
      },

      contacts_secondaires: contact?.contacts_secondaires || [],

      // --- Donnees techniques (fusion 2c) ---
      technique: technique ? {
        stack: technique.stack,
        performance: technique.performance,
        accessibilite: technique.accessibilite,
        seo: technique.seo,
        ssl: technique.ssl,
        problemes_detectes: technique.problemes_detectes,
      } : null,

      // --- Signaux (du Veilleur) ---
      signaux: lead.signaux,
      signal_principal: lead.signal_principal,
      sources: lead.sources,
      nb_detections: lead.nb_detections,
      pre_score: lead.pre_score,

      // --- Enrichissement metadata ---
      enrichissement: {
        status: 'complet',
        date_enrichissement: new Date().toISOString(),
        sous_agents_utilises: [
          contact ? '2a_contact' : null,
          entreprise ? '2b_entreprise' : null,
          technique ? '2c_technique' : null,
        ].filter(Boolean) as string[],
        qualite: { completude_pct: 0, champs_manquants: [], enrichable: true },
        duration_ms: 0,
        credits_total: {},
      },
    }
  }

  private async deduplicateWithBDD(prospect: EnrichedProspect): Promise<{
    isNew: boolean
    existingProspect?: EnrichedProspect
    matchType?: string
  }> {
    // Priorite 1 : SIRET
    if (prospect.entreprise.siret) {
      const existing = await db.query(
        `SELECT * FROM prospects WHERE siret = $1 LIMIT 1`,
        [prospect.entreprise.siret]
      )
      if (existing.rows.length > 0) {
        return { isNew: false, existingProspect: existing.rows[0], matchType: 'siret' }
      }
    }

    // Priorite 2 : Email
    if (prospect.contact.email) {
      const existing = await db.query(
        `SELECT * FROM prospects WHERE email = $1 LIMIT 1`,
        [prospect.contact.email]
      )
      if (existing.rows.length > 0) {
        return { isNew: false, existingProspect: existing.rows[0], matchType: 'email' }
      }
    }

    // Priorite 3 : Domaine du site web
    if (prospect.entreprise.site_web) {
      const domain = new URL(prospect.entreprise.site_web).hostname.replace('www.', '')
      const existing = await db.query(
        `SELECT * FROM prospects WHERE site_web LIKE $1 LIMIT 1`,
        [`%${domain}%`]
      )
      if (existing.rows.length > 0) {
        return { isNew: false, existingProspect: existing.rows[0], matchType: 'domain' }
      }
    }

    return { isNew: true }
  }

  private mergeWithExisting(
    newData: EnrichedProspect, existing: EnrichedProspect
  ): EnrichedProspect {
    // Fusionner les signaux (ajouter les nouveaux, ne pas dupliquer)
    const existingSignalKeys = new Set(
      existing.signaux.map(s => `${s.type}:${s.source}:${s.date_signal}`)
    )
    const newSignaux = newData.signaux.filter(
      s => !existingSignalKeys.has(`${s.type}:${s.source}:${s.date_signal}`)
    )
    existing.signaux.push(...newSignaux)

    // Completer les champs manquants
    if (!existing.contact.email && newData.contact.email) {
      existing.contact.email = newData.contact.email
      existing.contact.email_status = newData.contact.email_status
    }
    if (!existing.entreprise.finances.ca_dernier && newData.entreprise.finances.ca_dernier) {
      existing.entreprise.finances = newData.entreprise.finances
    }
    if (!existing.technique && newData.technique) {
      existing.technique = newData.technique
    }

    // Incrementer detections
    existing.nb_detections = (existing.nb_detections || 0) + 1
    existing.sources = [...new Set([...existing.sources, ...newData.sources])]

    return existing
  }

  private checkQuality(prospect: EnrichedProspect): {
    completude_pct: number
    champs_manquants: string[]
    enrichable: boolean
  } {
    const champsManquants: string[] = []

    // Champs critiques
    if (!prospect.contact.email) champsManquants.push('email')
    if (!prospect.contact.prenom) champsManquants.push('contact_prenom')
    if (!prospect.contact.nom) champsManquants.push('contact_nom')
    if (!prospect.entreprise.siret) champsManquants.push('siret')

    // Champs importants
    if (!prospect.entreprise.finances.ca_dernier) champsManquants.push('chiffre_affaires')
    if (!prospect.entreprise.effectif.exact) champsManquants.push('effectif_exact')
    if (!prospect.contact.telephone) champsManquants.push('telephone')
    if (!prospect.technique) champsManquants.push('donnees_techniques')

    // Champs secondaires
    if (!prospect.entreprise.site_web) champsManquants.push('site_web')
    if (prospect.entreprise.dirigeants.length === 0) champsManquants.push('dirigeants')

    const totalChamps = 10
    const champsRemplis = totalChamps - champsManquants.length
    const completude = Math.round((champsRemplis / totalChamps) * 100)

    // Enrichable = au minimum le nom entreprise + 1 moyen de contact
    const enrichable = !!(
      prospect.entreprise.nom &&
      (prospect.contact.email || prospect.contact.telephone || prospect.contact.linkedin_url)
    )

    return {
      completude_pct: completude,
      champs_manquants: champsManquants,
      enrichable,
    }
  }

  private timeout(ms: number, label: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${label} after ${ms}ms`)), ms)
    )
  }
}
```

### 6.4 Worker BullMQ

```typescript
// workers/enrichisseur_worker.ts
import { Worker, Job } from 'bullmq'

const enrichisseur = new MasterEnrichisseur()

const worker = new Worker('enrichisseur-pipeline', async (job: Job) => {
  const { lead_data, priority } = job.data

  try {
    const result = await enrichisseur.enrichLead(lead_data)

    // Logger le succes
    await db.query(
      `UPDATE leads_bruts SET statut = 'enrichi', updated_at = NOW() WHERE id = $1`,
      [lead_data.lead_id]
    )

    return result
  } catch (error) {
    // Logger l'erreur
    await db.query(
      `UPDATE leads_bruts SET statut = 'erreur_enrichissement', metadata = metadata || $2, updated_at = NOW() WHERE id = $1`,
      [lead_data.lead_id, JSON.stringify({ enrichment_error: (error as Error).message })]
    )
    throw error // BullMQ va retry
  }
}, {
  connection: redis,
  concurrency: 5,           // 5 leads en parallele
  limiter: {
    max: 10,                 // Max 10 jobs par minute
    duration: 60000,
  },
  settings: {
    stalledInterval: 300000, // 5 minutes avant de considerer un job bloque
  },
})

worker.on('completed', (job, result) => {
  console.log(`Lead ${job.data.lead_data.lead_id} enrichi en ${result.enrichissement.duration_ms}ms`)
})

worker.on('failed', (job, err) => {
  console.error(`Lead ${job?.data?.lead_data?.lead_id} FAILED: ${err.message}`)
})
```

### 6.5 Gestion des donnees manquantes

| Donnee manquante | Action | Impact sur scoring |
|-----------------|--------|-------------------|
| Email non trouve | Flag `email_status: 'not_found'`, marquer pour enrichissement manuel | -20 pts (pas de canal de contact direct) |
| Telephone non trouve | Pas bloquant, continuer | Neutre |
| SIRET non trouve | Marquer `siret_status: 'not_found'`, continuer avec nom | -10 pts (donnees financieres indisponibles) |
| CA non disponible | Normal pour TPE/startups, marquer `unknown` | Neutre pour startups, -5 pts pour PME |
| Site web absent | Pas de scan technique possible | -5 pts |
| Procedure collective detectee | EXCLURE le lead automatiquement | Lead rejete |
| Entreprise fermee | EXCLURE le lead automatiquement | Lead rejete |
| Contact poste non pertinent | Chercher un autre decideur | -5 pts si fallback |

### 6.6 Schema JSON de sortie COMPLET (fiche prospect enrichie)

```json
{
  "prospect_id": "uuid-v4-prospect",
  "lead_id": "uuid-v4-lead-original",
  "created_at": "2026-03-18T09:15:00Z",

  "entreprise": {
    "nom": "TechCorp SAS",
    "siren": "123456789",
    "siret": "12345678900012",
    "forme_juridique": "SAS - Societe par actions simplifiee",
    "date_creation": "2015-03-15",
    "capital": 50000,
    "code_naf": "6202A",
    "libelle_naf": "Conseil en systemes et logiciels informatiques",
    "categorie": "PME",
    "tva_intracommunautaire": "FR12123456789",
    "site_web": "https://www.techcorp.fr",
    "linkedin_url": "https://linkedin.com/company/techcorp",
    "secteur": "Conseil en systemes et logiciels informatiques",
    "segment": "pme_metro",

    "effectif": {
      "tranche": "100 a 199 salaries",
      "exact": 120
    },

    "adresse": {
      "rue": "12 RUE DE LA REPUBLIQUE",
      "code_postal": "75011",
      "ville": "PARIS",
      "departement": "75",
      "region": "Ile-de-France",
      "pays": "France"
    },

    "finances": {
      "ca_dernier": 5200000,
      "ca_n_moins_1": 4800000,
      "ca_n_moins_2": 4200000,
      "resultat_dernier": 320000,
      "croissance_ca_pct": 8,
      "annee_dernier_bilan": 2025
    },

    "dirigeants": [
      {
        "prenom": "Pierre",
        "nom": "Dupont",
        "fonction": "President",
        "date_nomination": "2015-03-15"
      },
      {
        "prenom": "Sophie",
        "nom": "Martin",
        "fonction": "Directeur General",
        "date_nomination": "2025-12-01"
      }
    ],

    "beneficiaires_effectifs": [
      {
        "prenom": "Pierre",
        "nom": "Dupont",
        "pourcentage_parts": 60,
        "pourcentage_votes": 60
      }
    ],

    "signaux_bodacc": [
      {
        "type": "creation",
        "date": "2025-06-15",
        "description": "Creation d'un etablissement secondaire a Lyon",
        "impact": "positif"
      }
    ],

    "alertes": {
      "procedure_collective": false,
      "entreprise_fermee": false,
      "ca_en_baisse": false,
      "effectif_en_baisse": false
    }
  },

  "contact": {
    "prenom": "Sophie",
    "nom": "Martin",
    "poste": "Chief Marketing Officer",
    "linkedin_url": "https://linkedin.com/in/sophie-martin",
    "email": "sophie.martin@techcorp.fr",
    "email_status": "verified",
    "email_confidence": 98,
    "telephone": "+33123456789",
    "decideur_score": 10
  },

  "contacts_secondaires": [
    {
      "prenom": "Jean",
      "nom": "Dupont",
      "poste": "CTO",
      "email": "jean.dupont@techcorp.fr",
      "linkedin_url": "https://linkedin.com/in/jean-dupont"
    }
  ],

  "technique": {
    "stack": {
      "cms": "WordPress",
      "cms_version": "6.4.3",
      "framework_js": null,
      "framework_js_version": null,
      "server": "Apache",
      "analytics": ["Google Analytics", "Facebook Pixel"],
      "ecommerce_platform": "WooCommerce",
      "cdn": "Cloudflare",
      "all_technologies": [
        { "name": "WordPress", "version": "6.4.3", "category": "CMS", "confidence": 100 },
        { "name": "WooCommerce", "version": "8.5.2", "category": "Ecommerce", "confidence": 100 },
        { "name": "Apache", "version": null, "category": "Web servers", "confidence": 95 }
      ]
    },
    "performance": {
      "score": 42,
      "lcp_ms": 4200,
      "cls": 0.15,
      "tbt_ms": 620,
      "fcp_ms": 2100,
      "speed_index_ms": 3800,
      "verdict": "mauvais"
    },
    "accessibilite": {
      "score": 62,
      "violations_total": 18,
      "violations_critical": 5,
      "violations_serious": 8,
      "passes": 42,
      "top_violations": [
        { "id": "image-alt", "impact": "critical", "description": "Images must have alternate text", "count": 12 }
      ],
      "rgaa_compliant": false
    },
    "seo": {
      "score": 78,
      "has_robots_txt": true,
      "has_sitemap": true
    },
    "ssl": {
      "valid": true,
      "days_remaining": 245
    },
    "problemes_detectes": [
      "Performance faible : score 42/100",
      "5 violations accessibilite CRITIQUES",
      "CMS WordPress 6.4.3 -- potentiel de modernisation"
    ]
  },

  "signaux": [
    {
      "type": "changement_poste",
      "source": "1a_linkedin",
      "detail": "Nommee CMO chez TechCorp il y a 3 semaines",
      "date_signal": "2026-02-25T00:00:00Z",
      "tier": 1,
      "score_signal": 30
    },
    {
      "type": "recrutement_dev_web",
      "source": "1d_jobboard",
      "detail": "Offre dev React senior sur WTTJ",
      "date_signal": "2026-03-15T00:00:00Z",
      "tier": 2,
      "score_signal": 20
    }
  ],

  "signal_principal": "Nouveau CMO + recrutement dev = besoin digital probable",
  "sources": ["veille_linkedin", "veille_jobboard"],
  "nb_detections": 2,

  "pre_score": {
    "total": 50,
    "detail": {
      "signal_force": 30,
      "multi_source_bonus": 5,
      "segment_match": 15
    }
  },

  "enrichissement": {
    "status": "complet",
    "date_enrichissement": "2026-03-18T09:15:45Z",
    "sous_agents_utilises": ["2a_contact", "2b_entreprise", "2c_technique"],
    "qualite": {
      "completude_pct": 90,
      "champs_manquants": ["effectif_historique"],
      "enrichable": true
    },
    "duration_ms": 48500,
    "credits_total": {
      "dropcontact": 1,
      "insee": 2,
      "pappers": 1,
      "zerobounce": 0,
      "wappalyzer": 1
    }
  }
}
```

### 6.7 Monitoring du Master Enrichisseur

```typescript
interface EnrichisseurHealthStatus {
  status: 'healthy' | 'degraded' | 'down'
  queue: {
    waiting: number
    active: number
    completed_last_hour: number
    failed_last_hour: number
    avg_duration_ms: number
  }
  subagents: {
    '2a_contact': { success_rate_pct: number, avg_duration_ms: number, credits_remaining: Record<string, number> }
    '2b_entreprise': { success_rate_pct: number, avg_duration_ms: number, credits_remaining: Record<string, number> }
    '2c_technique': { success_rate_pct: number, avg_duration_ms: number }
  }
  last_enrichment_at: string
  completude_moyenne_pct: number
  email_found_rate_pct: number       // % de leads avec email trouve
  siret_found_rate_pct: number       // % de leads avec SIRET trouve
  deduplication_rate_pct: number     // % de leads dedupliques
}

// Alertes
const ALERT_THRESHOLDS = {
  queue_waiting_warn: 50,        // > 50 leads en attente
  queue_waiting_critical: 200,   // > 200 leads en attente
  email_found_rate_warn: 60,     // < 60% d'emails trouves
  email_found_rate_critical: 40, // < 40% d'emails trouves
  avg_duration_warn: 120000,     // > 2 minutes en moyenne
  failed_rate_warn: 20,          // > 20% d'echecs
}
```

---

## 7. RGPD -- CONFORMITE COMPLETE

### 7.1 Base legale : Interet legitime B2B

**Fondement juridique** : Article 6.1(f) du RGPD -- Interet legitime

En B2B (prospection entre professionnels), le consentement prealable N'EST PAS requis a condition de respecter les 3 conditions suivantes :

| Condition | Application Axiom |
|-----------|------------------|
| **Pertinence** | Le message doit se rapporter a l'activite professionnelle du destinataire. Axiom propose des services de dev web/IA -- pertinent pour les profils CMO, CTO, DSI, fondateurs |
| **Transparence** | Information au 1er contact (Article 14 RGPD) : d'ou viennent les donnees, pourquoi le contact, quels droits |
| **Opposition facile** | Lien de desinscription 1-clic dans chaque email, sans justification requise |

### 7.2 Distinction email nominatif vs generique

**Email nominatif** = DONNEE PERSONNELLE (RGPD s'applique) :
```
sophie.martin@techcorp.fr     <-- Identifie une personne physique
jean.dupont@techcorp.fr       <-- Identifie une personne physique
```

**Email generique** = PAS une donnee personnelle :
```
contact@techcorp.fr           <-- Identifie l'entite, pas une personne
info@techcorp.fr              <-- Identifie l'entite, pas une personne
```

**Consequence** : L'enrichissement d'emails nominatifs (ce que fait l'Agent 2a) est soumis au RGPD, y compris le droit d'opposition et l'obligation d'information.

### 7.3 Obligations RGPD de l'Enrichisseur

#### 7.3.1 Obligation d'information (Article 14)

Quand les donnees ne sont PAS collectees directement aupres de la personne (cas de l'enrichissement), l'Article 14 du RGPD impose d'informer la personne dans un "delai raisonnable" (max 1 mois) ou au plus tard au premier contact.

**Information a fournir** :
1. Identite du responsable de traitement (Axiom Marketing / UNIVILE SAS)
2. Finalite du traitement (prospection commerciale B2B)
3. Categories de donnees (email professionnel, poste, entreprise)
4. Source des donnees (sources publiques, LinkedIn, annuaires professionnels)
5. Duree de conservation (3 ans apres le dernier contact)
6. Droits de la personne (opposition, acces, rectification, effacement)
7. Coordonnees du DPO (si designe)

#### 7.3.2 Droit d'opposition (Article 21)

Le droit d'opposition doit etre :
- **Inconditionnel** : pas besoin de justification
- **Immediat** : traitement dans les 72h
- **Simple** : lien 1-clic ou email simple
- **Gratuit** : aucun frais

**Implementation technique** :

```typescript
// rgpd/opposition.ts

async function handleOpposition(email: string, source: string): Promise<void> {
  // 1. Ajouter a la table des oppositions
  await db.query(
    `INSERT INTO rgpd_oppositions (email, date_opposition, source, status)
     VALUES ($1, NOW(), $2, 'active')
     ON CONFLICT (email) DO UPDATE SET date_opposition = NOW(), status = 'active'`,
    [email, source]
  )

  // 2. Supprimer de la table prospects (ou anonymiser)
  await db.query(
    `UPDATE prospects SET
       email = NULL,
       telephone = NULL,
       contact_prenom = '[OPPOSE]',
       contact_nom = '[OPPOSE]',
       statut = 'oppose_rgpd',
       updated_at = NOW()
     WHERE email = $1`,
    [email]
  )

  // 3. Supprimer des sequences de relance en cours
  await db.query(
    `DELETE FROM sequences_emails WHERE prospect_email = $1`,
    [email]
  )

  // 4. Logger dans le registre des traitements
  await db.query(
    `INSERT INTO rgpd_log (action, email, date_action, detail)
     VALUES ('opposition', $1, NOW(), $2)`,
    [email, `Opposition recue via ${source}`]
  )
}
```

#### 7.3.3 Registre des traitements

**Obligatoire si** : plus de 1,000 contacts actifs OU traitement systematique.

**Contenu du registre** :

| Champ | Valeur |
|-------|--------|
| Responsable de traitement | UNIVILE SAS (Axiom Marketing) |
| DPO | [A designer si necessaire] |
| Finalite | Prospection commerciale B2B -- services dev web et IA |
| Base legale | Interet legitime (Art. 6.1.f) |
| Categories de personnes | Decideurs d'entreprises (CMO, CTO, DG, DSI, Fondateurs) |
| Categories de donnees | Email pro, telephone pro, poste, nom, prenom, entreprise, LinkedIn |
| Sources | LinkedIn (publique), annuaires pro, APIs Dropcontact/Hunter, registres legaux |
| Destinataires | Outils internes (n8n, AdonisJS, PostgreSQL), Dropcontact, Hunter.io, ZeroBounce |
| Transfert hors UE | ZeroBounce (USA) -- clauses contractuelles types requises |
| Duree conservation | 3 ans apres le dernier contact actif |
| Mesures de securite | Chiffrement transit (TLS) + repos (AES-256), acces restreint, logs d'acces |

#### 7.3.4 Duree de conservation

```
┌─────────────────────────────────────────────────────────────────────────┐
│ REGLES DE CONSERVATION DES DONNEES                                     │
│                                                                         │
│  PROSPECTS ACTIFS (reponse ou interaction dans les 3 ans) :             │
│  └── Conservation illimitee tant qu'il y a interaction                   │
│                                                                         │
│  PROSPECTS INACTIFS (aucune interaction depuis 3 ans) :                 │
│  └── Suppression automatique apres 3 ans                                │
│  └── OU anonymisation (garder les stats, supprimer les donnees perso)   │
│                                                                         │
│  PROSPECTS OPPOSES (droit d'opposition exerce) :                        │
│  └── Suppression immediate des donnees de contact                       │
│  └── Conservation du hash email dans la blacklist (pour ne pas          │
│      re-contacter)                                                      │
│                                                                         │
│  CRON DE NETTOYAGE : 1x/mois                                           │
│  └── Supprimer les prospects sans interaction depuis 3 ans              │
│  └── Verifier les oppositions en attente                                │
│  └── Generer un rapport de conformite                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

```typescript
// cron/rgpd_cleanup.ts
// Execution : 1er de chaque mois a 03:00

async function rgpdCleanup() {
  // 1. Supprimer les prospects inactifs > 3 ans
  const deleted = await db.query(
    `UPDATE prospects SET
       email = NULL, telephone = NULL,
       contact_prenom = '[EXPIRE]', contact_nom = '[EXPIRE]',
       statut = 'expire_rgpd'
     WHERE last_interaction_at < NOW() - INTERVAL '3 years'
       AND statut NOT IN ('oppose_rgpd', 'expire_rgpd')
     RETURNING id`
  )
  console.log(`${deleted.rowCount} prospects expires et anonymises`)

  // 2. Verifier coherence blacklist
  const orphans = await db.query(
    `SELECT p.email FROM prospects p
     JOIN rgpd_oppositions o ON p.email = o.email
     WHERE p.statut != 'oppose_rgpd'`
  )
  for (const orphan of orphans.rows) {
    await handleOpposition(orphan.email, 'cleanup_auto')
  }

  // 3. Rapport
  const stats = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE statut = 'actif') as actifs,
       COUNT(*) FILTER (WHERE statut = 'oppose_rgpd') as opposes,
       COUNT(*) FILTER (WHERE statut = 'expire_rgpd') as expires,
       COUNT(*) as total
     FROM prospects`
  )
  await slack.send('#ops-rgpd', {
    text: `Rapport RGPD mensuel : ${stats.rows[0].actifs} actifs, ${stats.rows[0].opposes} opposes, ${stats.rows[0].expires} expires`,
  })
}
```

### 7.4 Conformite des outils tiers

| Outil | Serveurs | DPA requis | RGPD-compliant |
|-------|---------|-----------|----------------|
| **Dropcontact** | France (EU) | Inclus | OUI -- audite CNIL |
| **Hunter.io** | EU | Oui (a signer) | OUI (avec DPA) |
| **ZeroBounce** | USA | Oui + Clauses Contractuelles Types | ATTENTION -- transfert hors UE |
| **Kaspr** | EU | Oui (a signer) | OUI (avec DPA) |
| **INSEE** | France | Non requis (donnees publiques) | OUI |
| **Pappers** | France | Non requis (donnees publiques) | OUI |
| **BODACC** | France | Non requis (donnees publiques) | OUI |

**Action requise pour ZeroBounce** : Signer les Clauses Contractuelles Types (CCT/SCC) pour le transfert de donnees UE --> USA. Alternative : utiliser NeverBounce (serveurs EU) a la place.

### 7.5 Template mention legale email (premier contact)

```
---
Vous recevez cet email car vous etes [POSTE] chez [ENTREPRISE].
Vos donnees professionnelles (email, poste, entreprise) proviennent
de sources publiques (LinkedIn, annuaires professionnels, registres legaux).

Conformement au RGPD, vous disposez d'un droit d'opposition, d'acces,
de rectification et de suppression de vos donnees.

[SE DESINSCRIRE EN 1 CLIC]

Pour exercer vos droits : rgpd@axiom-marketing.fr
Responsable de traitement : UNIVILE SAS, [adresse]
---
```

### 7.6 Checklist conformite RGPD Enrichisseur

| Point | Statut | Detail |
|-------|--------|--------|
| Base legale definie (interet legitime B2B) | A IMPLEMENTER | Documenter dans le registre |
| Information Article 14 au 1er contact | A IMPLEMENTER | Template ci-dessus integre dans Agent 4 (REDACTEUR) |
| Lien desinscription 1-clic | A IMPLEMENTER | Dans chaque email envoye |
| Gestion droit d'opposition (72h max) | A IMPLEMENTER | Fonction handleOpposition() |
| Registre des traitements | A REDIGER | Contenu defini section 7.3.3 |
| DPA signes avec sous-traitants | A SIGNER | Hunter, ZeroBounce, Kaspr |
| Duree conservation 3 ans | A IMPLEMENTER | Cron mensuel rgpdCleanup() |
| Blacklist des opposes | A IMPLEMENTER | Table rgpd_oppositions |
| Transfert hors UE (ZeroBounce) | A EVALUER | CCT a signer ou changer pour EU-only |
| Designation DPO | A EVALUER | Obligatoire si > 5000 contacts ou suivi systematique |

---

## 8. COUTS DETAILLES

### 8.1 Couts par API et par mois (base : 500 leads/mois)

| Service | Plan | Cout/mois | Credits inclus | Usage prevu (500 leads) | Credits restants |
|---------|------|----------|---------------|------------------------|-----------------|
| **Dropcontact** | Pro | 39 EUR | 2,500 | ~500 (1 par lead) | ~2,000 |
| **Hunter.io** | Starter | 49 USD (~46 EUR) | 500 | ~200 (40% fallback) | ~300 |
| **ZeroBounce** | Pack 2K | 16 USD (~15 EUR) | 2,000 | ~300 (emails non-Dropcontact) | ~1,700 |
| **Kaspr** | Business | 79 EUR | 3,000 | ~150 (30% des leads) | ~2,850 |
| **INSEE Sirene** | Gratuit | 0 EUR | Illimite (30/min) | ~1,000 (2 par lead) | Illimite |
| **Pappers** | Pay-per-use | ~25 EUR | ~500 lookups | ~500 | 0 |
| **Societe.com** | Pay-per-use | ~40 EUR | ~400 lookups | ~100 (leads hot) | ~300 |
| **BODACC** | Gratuit | 0 EUR | Illimite | ~500 | Illimite |
| **Wappalyzer** | Pro | ~30 EUR | 1,000 | ~300 (60% des leads) | ~700 |
| **Lighthouse** | Gratuit (CLI) | 0 EUR | Illimite | ~300 | Illimite |
| **axe-core** | Gratuit (npm) | 0 EUR | Illimite | ~300 | Illimite |

### 8.2 Total mensuel

| Poste | Cout/mois |
|-------|----------|
| Sous-agent 2a (Contact) | ~183 EUR |
| Sous-agent 2b (Entreprise) | ~65 EUR |
| Sous-agent 2c (Technique) | ~30 EUR |
| **TOTAL AGENT 2 -- ENRICHISSEUR** | **~278 EUR/mois** |

### 8.3 Total annuel

| Poste | Cout annuel |
|-------|-----------|
| APIs et services | ~3,336 EUR |
| Avec rabais annuels (-15% moyenne) | ~2,836 EUR |

### 8.4 Cout par lead enrichi

| Metrique | Valeur |
|----------|--------|
| Leads enrichis par mois | 500 |
| Cout total mensuel | ~278 EUR |
| **Cout par lead enrichi** | **~0.56 EUR** |
| Cout par lead avec email verifie (~80% des leads) | ~0.70 EUR |
| Cout par lead complet (email + SIRET + CA + tech) | ~0.75 EUR |

### 8.5 Scenarios de montee en charge

| Volume mensuel | Cout estime | Cout/lead |
|---------------|------------|----------|
| 250 leads | ~220 EUR | ~0.88 EUR |
| 500 leads | ~278 EUR | ~0.56 EUR |
| 1,000 leads | ~380 EUR | ~0.38 EUR |
| 2,000 leads | ~550 EUR | ~0.28 EUR |
| 5,000 leads | ~900 EUR | ~0.18 EUR |

**Economies d'echelle** : A partir de 1,000 leads/mois, les plans superieurs deviennent plus avantageux (Dropcontact Scale, Hunter Growth, etc.).

### 8.6 Comparaison cout Enrichisseur vs pipeline total

| Agent | Cout/mois | Part budget |
|-------|----------|------------|
| Agent 1 -- Veilleur | ~430 EUR | 61% |
| **Agent 2 -- Enrichisseur** | **~278 EUR** | **39%** |
| **Total Agents 1+2** | **~708 EUR** | 100% |
| Agents 3-7 (estimation) | ~500-800 EUR | - |
| **Pipeline complet (estimation)** | **~1,200-1,500 EUR** | - |

---

## 9. SCHEMA SQL

### 9.1 Tables specifiques a l'Enrichisseur

Ces tables s'ajoutent a celles definies dans les specs de l'Agent 1 (leads_bruts, audits_techniques, etc.).

```sql
-- ═══════════════════════════════════════════════════════════
-- TABLE PRINCIPALE : prospects (fiche enrichie)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE prospects (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                 UUID REFERENCES leads_bruts(id),
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW(),

  -- Entreprise
  entreprise              VARCHAR(255) NOT NULL,
  siren                   VARCHAR(9),
  siret                   VARCHAR(14),
  forme_juridique         VARCHAR(100),
  date_creation           DATE,
  capital                 DECIMAL,
  code_naf                VARCHAR(10),
  libelle_naf             VARCHAR(255),
  categorie_entreprise    VARCHAR(20),   -- 'TPE' | 'PME' | 'ETI' | 'GE'
  tva_intracommunautaire  VARCHAR(20),
  site_web                VARCHAR(500),
  linkedin_url            VARCHAR(500),
  secteur                 VARCHAR(255),
  segment                 VARCHAR(50),   -- 'pme_metro' | 'ecommerce_shopify' | etc.

  -- Effectif
  effectif_tranche        VARCHAR(100),
  effectif_exact          INTEGER,

  -- Adresse
  adresse_rue             VARCHAR(300),
  adresse_code_postal     VARCHAR(10),
  adresse_ville           VARCHAR(100),
  adresse_departement     VARCHAR(5),
  adresse_region          VARCHAR(50),
  adresse_pays            VARCHAR(50) DEFAULT 'France',

  -- Finances
  ca_dernier              DECIMAL,
  ca_n_moins_1            DECIMAL,
  ca_n_moins_2            DECIMAL,
  resultat_dernier        DECIMAL,
  croissance_ca_pct       DECIMAL,
  annee_dernier_bilan     INTEGER,

  -- Contact principal
  contact_prenom          VARCHAR(100),
  contact_nom             VARCHAR(100),
  contact_poste           VARCHAR(200),
  contact_linkedin        VARCHAR(500),
  email                   VARCHAR(255),
  email_status            VARCHAR(20),   -- 'verified' | 'catch_all' | 'unverified' | 'not_found'
  email_confidence        INTEGER,
  email_source            VARCHAR(30),   -- 'dropcontact' | 'hunter_domain' | 'hunter_finder' | 'pattern_match'
  telephone               VARCHAR(30),
  telephone_source        VARCHAR(20),   -- 'kaspr' | 'dropcontact'
  decideur_score          INTEGER DEFAULT 0,

  -- Contacts secondaires
  contacts_secondaires    JSONB DEFAULT '[]'::JSONB,

  -- Dirigeants et beneficiaires
  dirigeants              JSONB DEFAULT '[]'::JSONB,
  beneficiaires_effectifs JSONB DEFAULT '[]'::JSONB,

  -- Signaux BODACC
  signaux_bodacc          JSONB DEFAULT '[]'::JSONB,

  -- Alertes
  alerte_procedure_collective BOOLEAN DEFAULT false,
  alerte_entreprise_fermee    BOOLEAN DEFAULT false,
  alerte_ca_en_baisse         BOOLEAN DEFAULT false,

  -- Donnees techniques (si scan effectue)
  tech_cms                VARCHAR(100),
  tech_cms_version        VARCHAR(50),
  tech_framework_js       VARCHAR(100),
  tech_analytics          TEXT[],
  tech_ecommerce          VARCHAR(100),
  tech_stack_complete     JSONB,
  perf_score              INTEGER,       -- 0-100
  perf_lcp_ms             INTEGER,
  perf_cls                DECIMAL,
  perf_tbt_ms             INTEGER,
  perf_verdict            VARCHAR(20),   -- 'bon' | 'moyen' | 'mauvais'
  a11y_score              INTEGER,       -- 0-100
  a11y_violations_critical INTEGER DEFAULT 0,
  a11y_violations_serious INTEGER DEFAULT 0,
  a11y_rgaa_compliant     BOOLEAN,
  seo_score               INTEGER,
  ssl_valid               BOOLEAN,
  ssl_days_remaining      INTEGER,
  problemes_detectes      TEXT[],

  -- Signaux (du Veilleur)
  signaux                 JSONB DEFAULT '[]'::JSONB,
  signal_principal        TEXT,
  sources                 TEXT[],
  nb_detections           INTEGER DEFAULT 1,
  pre_score               INTEGER DEFAULT 0,
  pre_score_detail        JSONB,

  -- Enrichissement metadata
  enrichissement_status   VARCHAR(20) DEFAULT 'en_attente',
    -- 'en_attente' | 'en_cours' | 'complet' | 'partiel' | 'echec'
  enrichissement_date     TIMESTAMP,
  enrichissement_sous_agents TEXT[],
  enrichissement_completude INTEGER DEFAULT 0, -- 0-100
  enrichissement_champs_manquants TEXT[],
  enrichissement_duration_ms INTEGER,
  enrichissement_credits  JSONB,

  -- Statut pipeline
  statut                  VARCHAR(30) DEFAULT 'enrichi',
    -- 'enrichi' | 'score' | 'contacte' | 'en_sequence' | 'converti' | 'perdu' | 'oppose_rgpd' | 'expire_rgpd'
  score_final             INTEGER,       -- Rempli par Agent 3

  -- Interaction tracking (pour RGPD conservation 3 ans)
  last_interaction_at     TIMESTAMP,
  nb_interactions         INTEGER DEFAULT 0
);

-- Index pour performance
CREATE INDEX idx_prospects_siret ON prospects(siret);
CREATE INDEX idx_prospects_siren ON prospects(siren);
CREATE INDEX idx_prospects_email ON prospects(email);
CREATE INDEX idx_prospects_site_web ON prospects(site_web);
CREATE INDEX idx_prospects_segment ON prospects(segment);
CREATE INDEX idx_prospects_statut ON prospects(statut);
CREATE INDEX idx_prospects_score ON prospects(score_final DESC NULLS LAST);
CREATE INDEX idx_prospects_enrichissement ON prospects(enrichissement_status);
CREATE INDEX idx_prospects_lead_id ON prospects(lead_id);
CREATE INDEX idx_prospects_last_interaction ON prospects(last_interaction_at DESC);
CREATE INDEX idx_prospects_nom ON prospects USING gin(to_tsvector('french', entreprise));
CREATE INDEX idx_prospects_completude ON prospects(enrichissement_completude DESC);

-- ═══════════════════════════════════════════════════════════
-- TABLE : RGPD Oppositions (blacklist)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE rgpd_oppositions (
  id                  SERIAL PRIMARY KEY,
  email               VARCHAR(255) UNIQUE NOT NULL,
  email_hash          VARCHAR(64) NOT NULL,   -- SHA-256 pour verification rapide
  date_opposition     TIMESTAMP DEFAULT NOW(),
  source              VARCHAR(50),            -- 'email_link' | 'manual' | 'cnil' | 'cleanup'
  status              VARCHAR(20) DEFAULT 'active',
    -- 'active' | 'archived'
  prospect_id         UUID REFERENCES prospects(id),
  notes               TEXT,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rgpd_email ON rgpd_oppositions(email);
CREATE INDEX idx_rgpd_hash ON rgpd_oppositions(email_hash);
CREATE INDEX idx_rgpd_status ON rgpd_oppositions(status);

-- ═══════════════════════════════════════════════════════════
-- TABLE : RGPD Log d'actions
-- ═══════════════════════════════════════════════════════════
CREATE TABLE rgpd_log (
  id                  SERIAL PRIMARY KEY,
  action              VARCHAR(50) NOT NULL,
    -- 'opposition' | 'acces' | 'rectification' | 'effacement' | 'export' | 'conservation_expire'
  email               VARCHAR(255),
  prospect_id         UUID,
  date_action         TIMESTAMP DEFAULT NOW(),
  detail              TEXT,
  traite_par          VARCHAR(100),   -- 'auto' | 'operateur_nom'
  delai_traitement_h  INTEGER         -- Nombre d'heures entre demande et traitement
);

CREATE INDEX idx_rgpd_log_action ON rgpd_log(action);
CREATE INDEX idx_rgpd_log_date ON rgpd_log(date_action DESC);

-- ═══════════════════════════════════════════════════════════
-- TABLE : Enrichissement batches (metriques)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE enrichissement_batches (
  id                      SERIAL PRIMARY KEY,
  batch_id                VARCHAR(100) NOT NULL UNIQUE,
  nb_leads_recus          INTEGER DEFAULT 0,
  nb_leads_enrichis       INTEGER DEFAULT 0,
  nb_leads_partiels       INTEGER DEFAULT 0,
  nb_leads_echec          INTEGER DEFAULT 0,
  nb_leads_dedupliques    INTEGER DEFAULT 0,
  nb_leads_exclus         INTEGER DEFAULT 0,  -- procedure collective, ferme, oppose

  -- Taux de succes par sous-agent
  taux_email_found_pct    DECIMAL,
  taux_siret_found_pct    DECIMAL,
  taux_ca_found_pct       DECIMAL,
  taux_tech_scan_pct      DECIMAL,

  -- Performance
  avg_duration_ms         INTEGER,
  max_duration_ms         INTEGER,

  -- Credits consommes
  credits_dropcontact     INTEGER DEFAULT 0,
  credits_hunter          INTEGER DEFAULT 0,
  credits_zerobounce      INTEGER DEFAULT 0,
  credits_kaspr           INTEGER DEFAULT 0,
  credits_pappers         INTEGER DEFAULT 0,
  credits_societecom      INTEGER DEFAULT 0,
  credits_wappalyzer      INTEGER DEFAULT 0,

  -- Cout estime
  cout_estime_eur         DECIMAL,

  created_at              TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_enrich_batches_date ON enrichissement_batches(created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- TABLE : Cache enrichissement (eviter re-queries)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE enrichissement_cache (
  id                  SERIAL PRIMARY KEY,
  cache_type          VARCHAR(30) NOT NULL,
    -- 'contact' | 'entreprise' | 'technique'
  cache_key           VARCHAR(500) NOT NULL,  -- ex: "domain:techcorp.fr:sophie_martin"
  data                JSONB NOT NULL,
  source              VARCHAR(50),            -- API source
  expires_at          TIMESTAMP NOT NULL,
  created_at          TIMESTAMP DEFAULT NOW(),

  UNIQUE(cache_type, cache_key)
);

CREATE INDEX idx_cache_type_key ON enrichissement_cache(cache_type, cache_key);
CREATE INDEX idx_cache_expires ON enrichissement_cache(expires_at);

-- Nettoyage automatique du cache expire
-- (a executer via cron quotidien)
-- DELETE FROM enrichissement_cache WHERE expires_at < NOW();

-- ═══════════════════════════════════════════════════════════
-- TABLE : Extension api_usage (ajout colonnes Agent 2)
-- ═══════════════════════════════════════════════════════════
-- La table api_usage existe deja (Agent 1). On ajoute les providers de l'Agent 2 :
-- 'dropcontact' | 'zerobounce' | 'kaspr' | 'pappers' | 'societecom' | 'wappalyzer' | 'insee'
-- Pas de changement de schema necessaire, les nouveaux providers utilisent la meme table.

-- ═══════════════════════════════════════════════════════════
-- VUES pour monitoring
-- ═══════════════════════════════════════════════════════════
CREATE VIEW v_enrichissement_daily_summary AS
SELECT
  DATE(enrichissement_date) as jour,
  COUNT(*) as total_enrichis,
  COUNT(*) FILTER (WHERE enrichissement_status = 'complet') as complets,
  COUNT(*) FILTER (WHERE enrichissement_status = 'partiel') as partiels,
  COUNT(*) FILTER (WHERE enrichissement_status = 'echec') as echecs,
  AVG(enrichissement_completude) as completude_moyenne,
  COUNT(*) FILTER (WHERE email IS NOT NULL AND email_status = 'verified') as avec_email_verifie,
  COUNT(*) FILTER (WHERE siret IS NOT NULL) as avec_siret,
  COUNT(*) FILTER (WHERE ca_dernier IS NOT NULL) as avec_ca,
  COUNT(*) FILTER (WHERE perf_score IS NOT NULL) as avec_tech_scan,
  AVG(enrichissement_duration_ms) as avg_duration_ms
FROM prospects
WHERE enrichissement_date IS NOT NULL
GROUP BY DATE(enrichissement_date)
ORDER BY jour DESC;

CREATE VIEW v_prospects_a_scorer AS
SELECT *
FROM prospects
WHERE enrichissement_status = 'complet'
  AND statut = 'enrichi'
  AND enrichissement_completude >= 50
  AND NOT alerte_procedure_collective
  AND NOT alerte_entreprise_fermee
ORDER BY pre_score DESC, enrichissement_completude DESC;

CREATE VIEW v_prospects_enrichissement_manuel AS
SELECT id, entreprise, email, email_status, enrichissement_champs_manquants, pre_score
FROM prospects
WHERE enrichissement_status IN ('partiel', 'echec')
  AND email_status IN ('not_found', 'unverified')
  AND pre_score >= 50
ORDER BY pre_score DESC;
```

---

## 10. VERIFICATION DE COHERENCE

### 10.1 Input Agent 2 == Output Agent 1

**Verification champ par champ** :

| Champ Output Agent 1 | Champ Input Agent 2 | Present | Coherent |
|----------------------|---------------------|---------|----------|
| `lead_id` (UUID) | `lead_id` | OUI | OUI |
| `created_at` | `created_at` | OUI | OUI |
| `source_primaire` | `source_primaire` | OUI | OUI |
| `sources[]` | `sources[]` | OUI | OUI |
| `nb_detections` | `nb_detections` | OUI | OUI |
| `entreprise.nom` | `entreprise.nom` | OUI | OUI -- utilise par 2a et 2b |
| `entreprise.siret` | `entreprise.siret` | OUI (parfois null) | OUI -- 2b le cherche si null |
| `entreprise.site_web` | `entreprise.site_web` | OUI (souvent) | OUI -- utilise par 2a et 2c |
| `entreprise.linkedin_company_url` | `entreprise.linkedin_company_url` | OUI | OUI -- utilise par 2a |
| `entreprise.secteur` | `entreprise.secteur` | OUI (souvent null) | OUI -- 2b enrichit |
| `entreprise.taille_estimee` | `entreprise.taille_estimee` | OUI | OUI -- 2b precise |
| `entreprise.localisation` | `entreprise.localisation` | OUI | OUI -- 2b enrichit |
| `entreprise.segment_estime` | `entreprise.segment_estime` | OUI | OUI -- utilise par 2a pour mapping decideur |
| `contact.prenom` | `contact.prenom` | OUI (parfois null) | OUI -- 2a le cherche si null |
| `contact.nom` | `contact.nom` | OUI (parfois null) | OUI |
| `contact.poste` | `contact.poste` | OUI (parfois null) | OUI |
| `contact.linkedin_url` | `contact.linkedin_url` | OUI (parfois null) | OUI -- utilise par 2a |
| `contact.email` | `contact.email` | OUI (souvent null) | OUI -- 2a le trouve |
| `contact.telephone` | `contact.telephone` | OUI (souvent null) | OUI -- 2a le trouve |
| `signaux[]` | `signaux[]` | OUI | OUI -- transmis au SCOREUR |
| `signal_principal` | `signal_principal` | OUI | OUI |
| `pre_score.total` | `pre_score.total` | OUI | OUI -- utilise pour priorisation |
| `pre_score.detail` | `pre_score.detail` | OUI | OUI |
| `metadata.traitement_requis[]` | `metadata.traitement_requis[]` | OUI | OUI -- determine quels sous-agents activer |
| `metadata.batch_id` | `metadata.batch_id` | OUI | OUI |

**Verdict** : COMPATIBLE a 100%. Tous les champs du schema de sortie Agent 1 sont mappes et utilises par l'Agent 2.

### 10.2 Output Agent 2 compatible avec Input Agent 3 (SCOREUR)

L'Agent 3 (SCOREUR) a besoin des donnees suivantes pour calculer le score final :

| Donnee requise par le SCOREUR | Fournie par Agent 2 | Champ |
|------------------------------|--------------------|----|
| Signal d'achat (type + tier) | OUI | `signaux[]` (transmis du Veilleur) |
| Email verifie (oui/non) | OUI | `contact.email_status` |
| Segment confirme | OUI | `entreprise.segment` |
| Taille entreprise (effectif) | OUI | `entreprise.effectif.exact` ou `tranche` |
| CA (chiffre d'affaires) | OUI | `entreprise.finances.ca_dernier` |
| Performance site (score) | OUI | `technique.performance.score` |
| Accessibilite (score) | OUI | `technique.accessibilite.score` |
| Stack technique | OUI | `technique.stack` |
| Decideur score | OUI | `contact.decideur_score` |
| Nb detections multi-source | OUI | `nb_detections` |
| Problemes detectes | OUI | `technique.problemes_detectes[]` |
| Pre-score | OUI | `pre_score.total` |
| Procedure collective (alerte) | OUI | `entreprise.alertes.procedure_collective` |
| Entreprise fermee (alerte) | OUI | `entreprise.alertes.entreprise_fermee` |
| Croissance CA | OUI | `entreprise.finances.croissance_ca_pct` |
| Localisation | OUI | `entreprise.adresse` |

**Verdict** : COMPATIBLE. Le schema de sortie de l'Agent 2 (section 6.6) contient toutes les donnees necessaires au SCOREUR pour calculer le score final.

### 10.3 Volumes realistes

| Metrique | Valeur estimee | Validation |
|----------|---------------|-----------|
| Leads recus de l'Agent 1 / jour | 8-20 (qualifies, pre_score >= 40) | COHERENT avec les estimations Agent 1 (30-80 bruts, ~25% qualifies) |
| Leads enrichis / jour | 8-20 | COHERENT -- pas de filtrage supplementaire sauf exclusions |
| Leads exclus / jour (procedure coll., ferme) | 0-2 | REALISTE -- ~5-10% des leads |
| Leads dedupliques avec BDD / jour | 1-3 | REALISTE -- ~10-15% de doublons |
| Leads transmis au SCOREUR / jour | 6-18 | COHERENT avec le debit du SCOREUR |
| Leads par mois | 250-500 | COHERENT avec le budget prevu |
| Temps moyen d'enrichissement / lead | 30-120 secondes | REALISTE -- Dropcontact async + parallele |
| Throughput max (5 workers, 10/min) | ~2,800 leads/jour | SUFFISANT pour les volumes prevus |

### 10.4 Budget coherent

| Verification | Resultat |
|-------------|---------|
| Budget Agent 2 / mois | ~278 EUR |
| Budget Agent 1 / mois | ~430 EUR |
| Budget Agent 1 + Agent 2 | ~708 EUR |
| Part Agent 2 dans budget total 1+2 | 39% |
| Budget pipeline 7 agents (estimation) | ~1,200-1,500 EUR |
| Part Agent 2 dans budget pipeline total | ~19-23% |
| Cout par lead enrichi | ~0.56 EUR |
| Cout par lead qualifie (email verifie) | ~0.70 EUR |
| Cout pipeline complet par lead (Agent 1 + 2) | ~1.42 EUR |
| Valeur moyenne d'un deal Axiom | 10,000-50,000 EUR |
| Conversion estimee leads --> deals | ~2% |
| Cout par deal (pipeline 1+2) | ~71 EUR |
| **ROI estime (pipeline 1+2 seul)** | **140x-700x** |

**Verdict** : COHERENT. Le budget est raisonnable par rapport aux volumes et au ROI potentiel.

### 10.5 Pas de redondance avec Agent 1c (Veille Web)

| Fonctionnalite | Agent 1c (Veilleur Web) | Agent 2c (Enrichisseur Technique) | Redondance ? |
|---------------|------------------------|----------------------------------|-------------|
| Scan Lighthouse | OUI -- batch nocturne, 100-500 sites | OUI -- a la demande, 1 site | NON -- 2c ne scanne QUE si 1c n'a pas deja fait |
| Wappalyzer | OUI -- pendant scan nocturne | OUI -- a la demande | NON -- 2c verifie si scan < 30 jours existe |
| axe-core | OUI -- pendant scan nocturne | OUI -- a la demande | NON -- meme logique |
| Declenchement | Batch programme (02h-06h) | A la reception d'un lead (temps reel) | NON -- contextes differents |
| Donnees stockees | Table `audits_techniques` | Table `prospects` (colonnes tech_*) | NON -- 2c reutilise les donnees de `audits_techniques` |

**Mecanisme anti-redondance** : La fonction `shouldRunTechScan()` (section 5.2) verifie explicitement si :
1. Le lead vient de `veille_web` --> skip (donnees deja presentes)
2. Un scan de moins de 30 jours existe en BDD `audits_techniques` --> reutiliser

**Verdict** : PAS DE REDONDANCE. Le sous-agent 2c est un complement intelligent de l'Agent 1c, pas un doublon.

### 10.6 Checklist finale

| Point de verification | Statut |
|----------------------|--------|
| Input Agent 2 == Output Agent 1 (tous les champs mappes) | VALIDE |
| Output Agent 2 compatible avec Input Agent 3 (SCOREUR) | VALIDE |
| Schema JSON de sortie complet et documente | VALIDE |
| Waterfall d'enrichissement contact documente (Dropcontact --> Hunter --> Pattern --> ZeroBounce) | VALIDE |
| Waterfall d'enrichissement entreprise documente (INSEE --> Pappers --> BODACC --> Societe.com) | VALIDE |
| Pas de redondance avec Agent 1c (veille web) | VALIDE |
| Volumes quotidiens realistes (8-20 leads/jour enrichis) | VALIDE |
| Budget mensuel coherent (~278 EUR pour 500 leads) | VALIDE |
| ROI compatible avec les objectifs Axiom | VALIDE |
| RGPD complet (base legale, information, opposition, conservation) | VALIDE |
| Schema SQL complet avec index | VALIDE |
| Gestion d'erreurs documentee pour chaque sous-agent | VALIDE |
| Cache et rate limiting documentes | VALIDE |
| Deduplication BDD multi-cle (SIRET, email, domaine) | VALIDE |
| Mapping decideur par segment documente | VALIDE |
| Pattern matching email documente | VALIDE |
| Controle qualite et completude integre | VALIDE |
| Monitoring et alertes documentes | VALIDE |
| DPA a signer avec sous-traitants identifies | A FAIRE |
| Template mention legale RGPD pret | VALIDE |
| Parallelisation 2a + 2b + 2c documentee | VALIDE |
| Toutes les APIs listees avec endpoints, auth, pricing | VALIDE |

---

## 11. INTEGRATION AVEC LES AGENTS 8, 9, 10

**Date d'ajout** : 19 mars 2026
**Reference** : Rapport d'impact AGENT-2-IMPACT-AGENTS-8-9-10.md

### 11.1 Optimisation waterfall pour les referrals

Les leads referral envoyes par l'Agent 10 (CSM) transitent par l'Agent 1 (Veilleur) avant d'arriver a l'Agent 2. Lorsqu'un referral arrive avec un email **deja fourni** par le client ambassadeur, le sous-agent 2a applique un waterfall simplifie :

```
SI email fourni par referrer :
  ├── SKIP Etapes 1-4 (Dropcontact, Hunter, Pattern Match)
  ├── GO directement Etape 5 : ZeroBounce verification
  │   ├── Si VALID    --> email_status = 'verified', source = 'referral'
  │   ├── Si INVALID  --> FALLBACK au waterfall complet (Dropcontact etapes 1-4)
  │   └── Si CATCH_ALL --> flag 'risky', utiliser quand meme
  └── Etape 6 : Kaspr telephone (si LinkedIn dispo, inchange)

SI email PAS fourni (referral sans email) :
  └── Waterfall complet classique (comportement identique a un lead non-referral)
```

**Economies estimees** : -0.4 a -1.4 credits/lead referral (skip Dropcontact + Hunter). Impact budgetaire negligeable (~1 EUR/mois) compte tenu du volume projete (25-50 referrals/mois).

### 11.2 Colonne `referral_info JSONB` ajoutee a la table `prospects`

```sql
-- Colonne pour stocker les informations referral sur le prospect enrichi
ALTER TABLE prospects ADD COLUMN referral_info JSONB DEFAULT NULL;
-- Contenu : { referral_id, referred_by_client_id, referral_code, priority_boost, source_type }

-- Index partiel pour filtrer les prospects referral
CREATE INDEX idx_prospects_referral ON prospects USING gin(referral_info) WHERE referral_info IS NOT NULL;
```

Le champ `referral_info` est optionnel et `NULL` pour tous les leads classiques (non-referral). Il est transmis tel quel dans la fiche `EnrichedProspect` vers l'Agent 3 (Scoreur) pour permettre le bonus de scoring referral.

La valeur `'referral'` est ajoutee comme nouvelle valeur possible pour la colonne `email_source` (VARCHAR, pas d'ENUM -- pas de modification de schema necessaire).

### 11.3 Confirmation : pas d'impact sur les flux sortants ni sur les 3 sous-agents pour les leads classiques

| Point | Statut |
|-------|--------|
| **Flux sortants** : l'Agent 2 continue d'envoyer **uniquement** vers `scoreur-pipeline` (Agent 3). Aucun flux vers Agent 8, 9 ou 10. | CONFIRME |
| **Sous-agent 2a (Contact)** : pour les leads classiques (sans `referral_info`), le waterfall est 100% identique. Le check referral est un branchement conditionnel en amont. | CONFIRME |
| **Sous-agent 2b (Entreprise)** : aucune modification. L'enrichissement entreprise (INSEE, Pappers, BODACC, Societe.com) est identique pour referrals et non-referrals. | CONFIRME |
| **Sous-agent 2c (Technique)** : aucune modification. Le scan technique ne depend pas de la source du lead. | CONFIRME |
| **Deduplication BDD** : memes criteres (SIRET, email, domaine). Pas d'impact. | CONFIRME |
| **RGPD** : meme base legale (interet legitime B2B). La mention de source "recommandation client" dans le premier email est geree par l'Agent 4 (Redacteur), pas par l'Agent 2. | CONFIRME |
| **Budget** : variation negligeable (~-1 EUR/mois). | CONFIRME |
| **SLA** : les referrals arrivent avec `pre_score >= 40` et `priority = 1`, traites comme leads Hot/Warm. SLA respectes naturellement. | CONFIRME |

### 11.4 Verification de coherence inter-agents

| Verification | Statut |
|-------------|--------|
| Input Agent 2 == Output Agent 1 (NormalizedLead v2 avec `referral_info` optionnel) | COMPATIBLE |
| Output Agent 2 == Input Agent 3 (EnrichedProspect v2 avec `referral_info` optionnel) | COMPATIBLE |
| Agent 2 --> Agent 8 (Dealmaker) : aucun flux | CONFIRME |
| Agent 2 --> Agent 9 (Appels d'offres) : aucun flux | CONFIRME |
| Agent 2 --> Agent 10 (CSM) : aucun flux | CONFIRME |
| Agent 8 --> Agent 2 : aucun flux | CONFIRME |
| Agent 9 --> Agent 2 : aucun flux | CONFIRME |
| Agent 10 --> Agent 2 : aucun flux (passe par Agent 1) | CONFIRME |
| Retro-compatibilite : champ `referral_info` optionnel, ignore si absent | CONFIRME |
| Schema EnrichedProspect v2 retro-compatible avec Agent 3 existant | CONFIRME |

---

## ANNEXE A : DIAGRAMME DE FLUX COMPLET

```
                   ┌──────────────────────┐
                   │    AGENT 1 VEILLEUR   │
                   │    (leads bruts)      │
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │ Queue BullMQ         │
                   │ 'enrichisseur-       │
                   │  pipeline'           │
                   │ Priority: 1/5/10     │
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │ MASTER ENRICHISSEUR   │
                   │ Pre-check:            │
                   │ - Deja enrichi ?      │
                   │ - Blacklist RGPD ?    │
                   │ - Entreprise fermee ? │
                   └──────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ 2a CONTACT │  │ 2b ENTREP. │  │ 2c TECH    │
     │            │  │            │  │            │
     │ Dropcontact│  │ INSEE      │  │ Wappalyzer │
     │    ↓       │  │    ↓       │  │    ↓       │
     │ Hunter     │  │ Pappers    │  │ Lighthouse │
     │    ↓       │  │    ↓       │  │    ↓       │
     │ Pattern    │  │ BODACC     │  │ axe-core   │
     │    ↓       │  │    ↓       │  │            │
     │ ZeroBounce │  │ Societe.com│  │            │
     │    ↓       │  │            │  │            │
     │ Kaspr (tel)│  │            │  │            │
     └──────┬─────┘  └──────┬─────┘  └──────┬─────┘
            │               │               │
            └───────────────┼───────────────┘
                            │
                            ▼
                   ┌──────────────────────┐
                   │ FUSION + DEDUP BDD    │
                   │ - Merger les 3 flux   │
                   │ - Chercher doublons   │
                   │ - Controle qualite    │
                   │ - Generer fiche       │
                   └──────────┬───────────┘
                              │
                   ┌──────────▼───────────┐
                   │ PERSISTANCE           │
                   │ - Table prospects     │
                   │ - Table RGPD          │
                   │ - Metriques           │
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │ Queue BullMQ         │
                   │ 'scoreur-pipeline'   │
                   │                      │
                   │    AGENT 3 SCOREUR   │
                   └──────────────────────┘
```

---

## ANNEXE B : SOURCES ET REFERENCES

### APIs officielles
- API INSEE Sirene : `https://api.insee.fr/api-sirene/3.11/`
- API Pappers : `https://api.pappers.fr/v2/`
- API Societe.com Pro : `https://api.societe.com/api/v1/`
- API BODACC OpenData : `https://opendata.datainfogreffe.fr/api/v1/console`
- Annuaire Entreprises : `https://annuaire-entreprises.data.gouv.fr/donnees/api-entreprises`

### APIs commerciales
- Dropcontact : `https://api.dropcontact.com/v1/` (39 EUR/mois Pro)
- Hunter.io : `https://api.hunter.io/v2/` (49 USD/mois Starter)
- ZeroBounce : `https://api.zerobounce.net/v2/` (16 USD/2000 verifs)
- Kaspr : API sur plan Business (79 EUR/mois)
- Wappalyzer : `https://api.wappalyzer.com/v2/` (~30 EUR/mois)

### Outils open source
- Lighthouse CLI : `https://github.com/GoogleChrome/lighthouse`
- axe-core : `https://github.com/dequelabs/axe-core`
- Playwright : `https://playwright.dev/`
- BullMQ : `https://bullmq.io/`

### RGPD et conformite
- CNIL Prospection commerciale : `https://www.cnil.fr/fr/la-prospection-commerciale`
- CNIL Prospection B2B par email : `https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique`
- CNIL Registre des traitements : `https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement`
- RGPD et prospection B2B : `https://www.leto.legal/guides/rgpd-et-prospection-btob-quelles-regles-respecter`
- Dropcontact conformite RGPD : `https://support.dropcontact.com/article/54-dropcontact-seule-solution-conforme-au-rgpd`

### Documentation technique
- Portail API INSEE : `https://portail-api.insee.fr/`
- Documentation Pappers : `https://www.pappers.fr/api/documentation`
- Hunter.io API docs : `https://hunter.io/api-documentation`
- ZeroBounce API docs : `https://www.zerobounce.net/docs/`
- Dropcontact API developer : `https://developer.dropcontact.com/`
