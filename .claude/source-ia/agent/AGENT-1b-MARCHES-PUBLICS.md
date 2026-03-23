# SOUS-AGENT 1b — VEILLEUR MARCHES PUBLICS
**Agent parent** : AGENT-1-MASTER.md
**Position dans le pipeline** : Agent 1b → Master Veilleur → Agent 9 (Appels d'Offres)


### 4.1 Mission precise

**Ce qu'il fait** :
- Interroge l'API BOAMP (gratuite) pour les avis d'appels d'offres IT/numerique
- Interroge l'API DECP pour les marches attribues (veille concurrentielle)
- Scrape les profils acheteurs des collectivites de La Reunion
- Interroge APProch pour les projets d'achats futurs
- Filtre par codes CPV, mots-cles, montant, geographie
- Calcule un score de pertinence composite (0-100)

**Ce qu'il ne fait PAS** :
- Il ne repond PAS aux appels d'offres
- Il ne telecharge PAS le CCTP/DCE (c'est l'ENRICHISSEUR)
- Il ne contacte PAS les acheteurs publics

### 4.2 Architecture technique

**Stack et APIs** :

| Composant | Service | Cout mensuel | Acces |
|-----------|---------|-------------|-------|
| **BOAMP API** | API OpenDataSoft BOAMP | 0 EUR | Gratuit, sans cle API |
| **DECP API** | data.economie.gouv.fr | 0 EUR | Gratuit, sans cle API |
| **APProch** | projets-achats.marches-publics.gouv.fr | 0 EUR | Inscription gratuite |
| **Profils acheteurs Reunion** | Scraping Playwright | 0 EUR | Custom scraper |
| **Infrastructure** | Redis + PostgreSQL | 0 EUR (inclus) | Self-hosted |

**Total sous-agent 1b** : 0 EUR/mois (toutes sources gratuites)

### 4.3 Sources de donnees detaillees

#### Source 1 : API BOAMP

```
Endpoint principal :
https://boamp-datadila.opendatasoft.com/api/v2/catalog/datasets/boamp/records

Authentification : AUCUNE (API ouverte)
Format : JSON
Mise a jour : 2x/jour (matin et soir)
Rate limits : Non specifies (raisonnable usage)
```

**Codes CPV a monitorer** :

| Code CPV | Description | Pertinence Axiom |
|----------|-------------|-----------------|
| `72212200-1` | Services de developpement web et intranet | 100% |
| `72212216-8` | Services de developpement de logiciels de site web | 100% |
| `72000000-5` | Services IT generiques | 90% |
| `72200000-8` | Services de conseil en systemes informatiques | 85% |
| `72210000-0` | Developpement et analyse de logiciels | 85% |
| `72212000-3` | Services de programmation d'applications | 85% |
| `72220000-3` | Conseils en systemes informatiques | 80% |
| `72250000-1` | Services de maintenance et support IT | 75% |
| `72260000-4` | Assistance informatique | 70% |
| `72230000-6` | Gestion centres informatiques | 65% |
| `72240000-9` | Services d'exploitation (infogerance) | 65% |

**Codes CPV a EXCLURE** (faux positifs) :
- `30000000` : Fournitures informatiques (materiel)
- `45000000` : Construction (travaux)
- `32200000` : Administration d'infrastructure
- `33000000` : Telecommunication

#### Source 2 : DECP (Marches attribues)

```
Endpoint :
https://data.economie.gouv.fr/explore/dataset/decp-v3-marches-valides/api/

Utilite : Identifier les concurrents qui gagnent regulierement sur les AO IT.
Champs cles : titulaire, siret_titulaire, montant_attribue, cpv_code
```

#### Source 3 : Profils acheteurs Reunion

| Collectivite | URL plateforme | SIRET |
|--------------|----------------|-------|
| Departement 974 | `http://marchesformalises.cg974.fr/` | 28974012800029 |
| CIVIS | `https://civis.e-marchespublics.com/` | - |
| CINOR | `https://marches.cinor.fr/` | - |
| CASUD | `https://casud.achatpublic.com` | - |
| TCO | `https://www.tco.re/pro/marches-publics/` | - |

#### Source 4 : APProch (projets futurs)

```
Endpoint :
https://data.economie.gouv.fr/explore/dataset/projets-dachats-publics/api/

Utilite : Detecter les projets IT en phase de programmation AVANT publication officielle.
Frequence de scan : 2x/semaine (lundi et jeudi)
```

### 4.4 Donnees d'entree (Input)

```typescript
interface MarchesScanConfig {
  // Filtres BOAMP
  boamp: {
    cpvCodes: string[]          // ['72212200', '72212216', '72000000', ...]
    montantMin: number          // 5000
    montantMax: number          // 300000
    regionsCode: string[]       // ['974', '976', '75', '69', '13', ...]
    excludeKeywords: string[]   // ['travaux', 'fournitures', 'batiment', 'nettoyage']
    maxAgeDays: number          // 30 (ne pas remonter au-dela de 30 jours)
  }

  // Filtres scoring
  scoring: {
    keywordsPositifs: Record<string, number>
    keywordsNegatifs: Record<string, number>
    sweetSpotMontant: { min: number, max: number }  // { min: 5000, max: 90000 }
    prioriteGeo: Record<string, number>
    seuilAlerter: number        // 60
    seuilRepondre: number       // 75
  }

  // Profils acheteurs Reunion
  profilsReunion: Array<{
    nom: string
    url: string
    scrapingMethod: 'playwright' | 'api' | 'rss'
  }>
}
```

**Frequence** : 2x/jour (06:00 et 14:00) pour BOAMP ; 2x/semaine pour APProch ; 1x/jour pour profils Reunion

### 4.5 Processus detaille

```
ETAPE 1 : QUERY BOAMP API
├── Construire la requete ODSQL
│   SELECT * FROM boamp
│   WHERE cpv_code IN ('72212200', '72212216', '72000000', '72200000', ...)
│   AND montant >= 5000 AND montant <= 300000
│   AND date_limite_remise >= NOW()
│   AND publication_date >= NOW() - INTERVAL '1 day'
│   ORDER BY publication_date DESC
│   LIMIT 100
│
├── Parser les resultats JSON
├── Extraire les champs normalises
└── Stocker les nouveaux avis (dedup par notice_number)

ETAPE 2 : QUERY DECP (hebdomadaire)
├── Chercher les marches attribues recemment (7 derniers jours)
├── Filtrer par CPV IT
├── Identifier les titulaires recurrents (concurrents Axiom)
└── Stocker pour analyse concurrentielle

ETAPE 3 : SCRAPE PROFILS ACHETEURS REUNION (daily)
├── Pour chaque profil acheteur (CIVIS, CINOR, CASUD, TCO, Dept 974)
│   ├── Ouvrir la page avec Playwright
│   ├── Rechercher les avis publies dans les 24h
│   ├── Extraire : titre, acheteur, date limite, montant, description
│   └── Verifier si deja present en DB (dedup par titre + acheteur)
└── Stocker les nouveaux avis

ETAPE 4 : QUERY APPROCH (2x/semaine)
├── Chercher les projets IT en preparation
├── Filtrer par code CPV + region
├── Extraire : organisme, nature du besoin, date estimee
└── Stocker comme leads "pre-appel d'offres"

ETAPE 5 : SCORING AUTOMATIQUE
├── Pour chaque avis non score :
│   ├── Calculer SCORE_CPV (0-100) * 0.30
│   ├── Calculer SCORE_MONTANT (0-100) * 0.25
│   ├── Calculer SCORE_GEOGRAPHIE (0-100) * 0.20
│   ├── Calculer SCORE_KEYWORDS (0-100) * 0.15
│   ├── Calculer SCORE_FAISABILITE (0-100) * 0.10
│   └── SCORE_FINAL = somme ponderee
├── Si SCORE >= 75 : marquer "a_repondre"
├── Si SCORE 60-74 : marquer "a_qualifier"
└── Si SCORE < 60 : marquer "archive"

ETAPE 6 : GENERER LES LEADS
├── Pour chaque avis score >= 60 :
│   ├── Creer un RawLead avec type "marche_public"
│   ├── Ajouter les metadata du marche
│   └── Envoyer au Master Veilleur
└── Fin
```

### 4.6 Code du scoring

```typescript
// agents/veilleur/marches/scoring.ts

interface AvisMarche {
  id: string
  titre: string
  description: string
  cpv_codes: string[]
  montant_estime: number | null
  date_limite: Date
  acheteur_region: string
  date_publication: Date
}

function scoreAvis(avis: AvisMarche): ScoredAvis {
  // 1. Score CPV (30%)
  const CPV_SCORE_MAP: Record<string, number> = {
    '72212200': 100, '72212216': 100,  // Web dev
    '72000000': 90,                     // IT generique
    '72200000': 85, '72210000': 85,     // IT consulting
    '72212000': 85,                     // Programmation
    '72220000': 80,                     // Maintenance IT
    '72250000': 75,                     // Support IT
    '72260000': 70,                     // Assistance IT
    '72230000': 65, '72240000': 65,     // Infogerance
  }

  let scoreCpv = 0
  for (const cpv of avis.cpv_codes) {
    const cpvScore = CPV_SCORE_MAP[cpv] || (cpv.startsWith('72') ? 70 : 0)
    scoreCpv = Math.max(scoreCpv, cpvScore)
  }

  // 2. Score Montant (25%)
  let scoreMontant = 70 // Defaut si montant inconnu
  if (avis.montant_estime !== null) {
    if (avis.montant_estime < 5000) scoreMontant = 20
    else if (avis.montant_estime <= 90000) scoreMontant = 100  // Sweet spot
    else if (avis.montant_estime <= 200000) scoreMontant = 80
    else if (avis.montant_estime <= 500000) scoreMontant = 50
    else scoreMontant = 10
  }

  // 3. Score Geographie (20%)
  const GEO_SCORES: Record<string, number> = {
    '974': 100, // La Reunion
    '976': 85,  // Mayotte
    '75': 80, '69': 80, '13': 80,  // Paris, Lyon, Marseille
  }
  const scoreGeo = GEO_SCORES[avis.acheteur_region] || 60 // Defaut France

  // 4. Score Keywords (15%)
  const KEYWORDS_POSITIFS: Record<string, number> = {
    'site web': 10, 'web': 8, 'portail': 10,
    'application': 8, 'mobile': 7, 'api': 5,
    'rgaa': 15, 'accessibilite': 15,
    'wordpress': 5, 'drupal': 5, 'react': 5,
    'developpement': 10, 'agence': 8,
    'maintenance': 8, 'support': 5,
    'hebergement': 5, 'cloud': 5,
  }

  const KEYWORDS_NEGATIFS: Record<string, number> = {
    'travaux': -20, 'btp': -20, 'construction': -20,
    'fournitures': -15, 'materiel': -15,
    'transport': -15, 'logistique': -15,
    'restauration': -15, 'nettoyage': -10,
    'gardiennage': -10,
  }

  const texte = `${avis.titre} ${avis.description}`.toLowerCase()
  let rawKeywordScore = 0
  for (const [kw, pts] of Object.entries(KEYWORDS_POSITIFS)) {
    if (texte.includes(kw)) rawKeywordScore += pts
  }
  for (const [kw, pts] of Object.entries(KEYWORDS_NEGATIFS)) {
    if (texte.includes(kw)) rawKeywordScore += pts
  }
  const scoreKeywords = Math.max(0, Math.min(100, 50 + rawKeywordScore))

  // 5. Score Faisabilite (10%)
  const daysToDeadline = Math.floor(
    (avis.date_limite.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  let scoreFaisabilite = 0
  if (daysToDeadline < 3) scoreFaisabilite = 0
  else if (daysToDeadline < 7) scoreFaisabilite = 30
  else if (daysToDeadline < 14) scoreFaisabilite = 70
  else if (daysToDeadline < 45) scoreFaisabilite = 100
  else scoreFaisabilite = 80

  // Bonus RGAA
  if (texte.includes('rgaa') || texte.includes('accessibilite')) {
    scoreFaisabilite += 20
  }
  scoreFaisabilite = Math.min(100, scoreFaisabilite)

  // Score final pondere
  const scoreFinal = Math.round(
    scoreCpv * 0.30 +
    scoreMontant * 0.25 +
    scoreGeo * 0.20 +
    scoreKeywords * 0.15 +
    scoreFaisabilite * 0.10
  )

  // Action
  let action: string
  if (scoreFinal >= 75) action = 'a_repondre'
  else if (scoreFinal >= 60) action = 'a_qualifier'
  else action = 'archive'

  return {
    ...avis,
    score_final: scoreFinal,
    score_detail: {
      cpv: scoreCpv,
      montant: scoreMontant,
      geo: scoreGeo,
      keywords: scoreKeywords,
      faisabilite: scoreFaisabilite,
    },
    action,
    raison: `CPV:${scoreCpv} Mont:${scoreMontant} Geo:${scoreGeo} KW:${scoreKeywords} Fais:${scoreFaisabilite}`,
  }
}
```

### 4.7 Donnees de sortie (Output)

```json
{
  "type": "marche_public",
  "source": "1b_marches",
  "date_detection": "2026-03-18T07:00:00Z",
  "signal_type": "marche_public",
  "tier": 1,
  "reference": "BOAMP-2026-123456",
  "titre": "Refonte du site internet de la commune de Saint-Denis",
  "acheteur": "Mairie de Saint-Denis",
  "acheteur_siret": "21974411000019",
  "type_marche": "mapa",
  "montant_estime": 35000,
  "date_limite": "2026-04-15T12:00:00Z",
  "url_source": "https://boamp-datadila.opendatasoft.com/explore/dataset/boamp/...",
  "plateforme": "boamp",
  "cpv_codes": ["72212200", "72212216"],
  "mots_cles_detectes": ["site web", "RGAA", "accessibilite", "collectivite"],
  "score_pertinence": 85,
  "score_detail": {
    "cpv": 100,
    "montant": 100,
    "geo": 100,
    "keywords": 75,
    "faisabilite": 70
  },
  "action": "a_repondre",
  "localisation": "La Reunion",
  "entreprise": {
    "nom": "Mairie de Saint-Denis",
    "siret": "21974411000019",
    "localisation": "Saint-Denis, La Reunion",
    "segment_estime": "collectivite"
  },
  "contact": null
}
```

### 4.8 Volumes et performance

| Metrique | Valeur estimee |
|----------|---------------|
| Avis BOAMP scannes par jour | 80-130 (IT) |
| Avis pertinents (score >= 60) par semaine | 2-10 |
| Avis haute pertinence (score >= 75) par semaine | 1-3 |
| Avis Reunion specifiques par semaine | 1-5 |
| Marches attribues (DECP) analyses par semaine | 50-100 |
| Temps par run BOAMP | 2-5 min |
| Temps par run profils Reunion | 5-15 min |

### 4.9 Couts detailles

| API/Service | Cout/mois | Notes |
|-------------|----------|-------|
| BOAMP API | 0 EUR | API ouverte gratuite |
| DECP API | 0 EUR | API ouverte gratuite |
| APProch | 0 EUR | Inscription gratuite |
| Playwright (self-hosted) | 0 EUR | Inclus infrastructure |
| **Total 1b** | **0 EUR** | |

### 4.10 Gestion des erreurs

```typescript
const errorHandlers = {
  'BOAMP_API_DOWN': {
    action: 'retry_in_1h',
    maxRetries: 4,
    fallback: 'use_rss_boamp', // https://www.boamp.fr/pages/entreprise-service-dalerte/
    alert: 'slack_warning',
  },
  'PROFIL_ACHETEUR_CHANGED': {
    action: 'log_and_skip',
    fallback: 'manual_check_required',
    alert: 'slack_warning_with_url',
  },
  'SCRAPER_BLOCKED': {
    action: 'rotate_user_agent',
    maxRetries: 3,
    fallback: 'skip_source',
    alert: 'slack_info',
  },
  'PARSING_ERROR': {
    action: 'save_raw_and_skip',
    fallback: 'manual_review_queue',
    alert: 'slack_info',
  },
}
```

### 4.11 Monitoring

| Metrique | Seuil alerte | Action |
|----------|-------------|--------|
| BOAMP API response time > 10s | WARN | Verifier API status |
| 0 avis retournes sur 24h | WARN | Verifier filtres CPV |
| Scraper Reunion echoue 3x | CRITICAL | Verifier structure HTML |
| Score moyen des avis < 40 | INFO | Affiner les filtres |

---

