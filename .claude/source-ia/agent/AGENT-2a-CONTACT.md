# SOUS-AGENT 2a — ENRICHISSEUR CONTACT
**Agent parent** : AGENT-2-MASTER.md
**Mission** : Trouver le bon decideur avec email verifie et telephone

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
