# SOUS-AGENT 2b — ENRICHISSEUR ENTREPRISE
**Agent parent** : AGENT-2-MASTER.md
**Mission** : Enrichir les donnees entreprise (SIRET, CA, effectif, dirigeants)

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
