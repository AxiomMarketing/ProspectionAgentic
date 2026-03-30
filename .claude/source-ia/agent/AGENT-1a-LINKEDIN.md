# SOUS-AGENT 1a — VEILLEUR LINKEDIN
**Agent parent** : AGENT-1-MASTER.md
**Position dans le pipeline** : Agent 1a → Master Veilleur → Agent 2 (Enrichisseur)

## 3. SOUS-AGENT 1a -- VEILLEUR LINKEDIN

### 3.1 Mission precise

**Ce qu'il fait** :
- Detecte les signaux d'achat sur LinkedIn via APIs tierces (pas de scraping direct)
- Surveille les changements de poste, annonces de recrutement, levees de fonds, posts revealant un besoin digital
- Detecte les entreprises en croissance (headcount tracking)
- Extrait les contacts des decideurs identifies

**Ce qu'il ne fait PAS** :
- Il n'envoie AUCUN message LinkedIn (c'est le REDACTEUR)
- Il ne scrape PAS directement LinkedIn (trop risque -- APIs tierces utilisees)
- Il n'enrichit PAS les donnees entreprise au-dela de ce que fournissent les APIs (c'est l'ENRICHISSEUR)
- Il ne valide PAS les emails (c'est l'ENRICHISSEUR)

### 3.2 Architecture technique

**Stack et APIs** :

| Composant | Service | Cout mensuel | Justification |
|-----------|---------|-------------|---------------|
| **Donnees profils/entreprises** | Netrows API | 99 EUR/mois (40K credits) | Remplacant legal de Proxycurl, 48+ endpoints, donnees publiques |
| **Job postings + hiring velocity** | SignalsAPI | 99 USD/mois (starter) | Detection postes ouverts, croissance equipe |
| **Levees de fonds** | Crunchbase API (free tier) + RSS Maddyness | 0 EUR/mois | Funding announcements |
| **Posts monitoring** | RSS feeds LinkedIn pages + n8n | 0 EUR/mois (self-hosted) | Conversion RSS vers webhooks |
| **Email extraction** | Hunter.io | 49 EUR/mois (1500 lookups) | Partagee avec les autres sous-agents |
| **Infrastructure** | Redis + PostgreSQL (self-hosted) | 0 EUR (inclus infra) | Queue + cache + stockage |

**Total sous-agent 1a** : ~276 EUR/mois

**Architecture alternative (Option B - Budget)** :

| Composant | Service | Cout mensuel |
|-----------|---------|-------------|
| Donnees profils | People Data Labs | 98 USD/mois |
| Job postings | Apify LinkedIn Jobs Scraper | 49 USD/mois |
| Email | Skrapp.io Pro | 30 USD/mois |
| **Total Option B** | | ~177 USD/mois |

### 3.3 Donnees d'entree (Input)

```typescript
interface LinkedInScanConfig {
  // Segments a surveiller
  segments: Array<{
    name: string                    // 'pme_metro' | 'ecommerce_shopify' | etc.
    targetRoles: string[]           // ['CMO', 'CTO', 'DG', 'Founder']
    industries: string[]            // ['SaaS', 'E-commerce', 'Manufacturing']
    companySize: { min: number, max: number }  // { min: 50, max: 500 }
    geography: string[]             // ['France', 'Paris', 'Lyon']
  }>

  // Mots-cles pour monitoring de posts
  keywords: {
    besoin_web: string[]            // ['refonte site', 'nouveau site', 'cherche agence web']
    transformation: string[]        // ['transformation digitale', 'digitalisation']
    techno: string[]                // ['react', 'shopify', 'flutter', 'RGAA']
    growth: string[]                // ['levee de fonds', 'serie A', 'croissance']
    pain: string[]                  // ['site trop lent', 'probleme technique', 'accessibilite']
  }

  // Types de signaux a tracker
  signalTypes: Array<
    'job_change' |       // Changement de poste
    'hiring' |           // Annonces de recrutement
    'headcount_change' | // Croissance equipe
    'funding' |          // Levee de fonds
    'post_keyword' |     // Posts avec mots-cles
    'engagement'         // Engagement sur contenu tech
  >

  // Rate limits
  rateLimits: {
    netrowsCallsPerMinute: number   // 60
    maxProfilesPerRun: number       // 500
    delayBetweenCallsMs: number     // 1000
  }
}
```

**Frequence d'execution** : 4 fois/jour (07h, 12h, 18h, 23h)

### 3.4 Processus detaille

```
ETAPE 1 : INGESTION DES SIGNAUX (parallele)
├── 1.1 Changements de poste
│   ├── Netrows API : company employee tracking
│   ├── Requete : GET /api/v1/companies/{id}/employees?changed_since=6h
│   ├── Filtrer : roles C-level + segments cibles
│   └── Output : liste de {person, old_role, new_role, company}
│
├── 1.2 Annonces de recrutement
│   ├── SignalsAPI : job postings par entreprise
│   ├── Filtrer : postes marketing/digital/dev/IT
│   ├── Seuil : >= 3 postes ouverts = signal fort
│   └── Output : liste de {company, jobs_count, job_titles}
│
├── 1.3 Croissance equipe (headcount)
│   ├── Netrows API : company data (employee_count)
│   ├── Comparer avec snapshot precedent (stocke en DB)
│   ├── Seuil : +10% en 90 jours = signal
│   └── Output : liste de {company, old_count, new_count, growth_rate}
│
├── 1.4 Levees de fonds
│   ├── Crunchbase API free : /organizations/search?funding_rounds.last_funding_at > 7d
│   ├── RSS Maddyness : parser maddymoney newsletter
│   ├── RSS BPI France : bigmedia.bpifrance.fr
│   └── Output : liste de {company, round_type, amount, date}
│
└── 1.5 Posts avec mots-cles
    ├── RSS feeds pages entreprises cibles
    ├── n8n : conversion RSS --> webhook --> traitement
    ├── Filtrage NLP : correspondance mots-cles
    └── Output : liste de {author, company, post_text, keywords_matched}

ETAPE 2 : CLASSIFICATION DES SIGNAUX
├── Tier 1 (ROI > 40%) : changement_poste, levee_fonds
│   → Score signal : 25-35 points
│   → Latence max : 24h
│
├── Tier 2 (ROI 15-40%) : recrutement_actif, croissance_equipe, post_besoin
│   → Score signal : 15-25 points
│   → Latence max : 48h
│
└── Tier 3 (ROI < 15%) : engagement_contenu, anniversaire_entreprise
    → Score signal : 5-15 points
    → Latence max : 72h

ETAPE 3 : EXTRACTION CONTACT
├── Si signal contient deja un contact (changement poste) → garder
├── Sinon → chercher le decideur via Netrows/PDL :
│   ├── Segment pme_metro → chercher CMO, DG, CTO
│   ├── Segment ecommerce → chercher Founder, Head of Growth
│   ├── Segment collectivite → chercher DGS, DSI
│   ├── Segment startup → chercher Founder, CTO
│   └── Segment agence_wl → chercher Fondateur
└── Extraire : prenom, nom, poste, linkedin_url

ETAPE 4 : FORMATAGE OUTPUT
└── Generer un objet RawLead (cf. schema section 2.5)
```

### 3.5 Code d'implementation

```typescript
// agents/veilleur/linkedin/scanner.ts
import { NetrowsClient } from '../clients/netrows'
import { SignalsAPIClient } from '../clients/signalsapi'
import { RSSParser } from '../utils/rss'

export class LinkedInScanner {
  private netrows: NetrowsClient
  private signalsApi: SignalsAPIClient
  private rss: RSSParser

  constructor(config: LinkedInScanConfig) {
    this.netrows = new NetrowsClient({
      apiKey: process.env.NETROWS_API_KEY!,
      rateLimitPerMinute: config.rateLimits.netrowsCallsPerMinute,
    })
    this.signalsApi = new SignalsAPIClient({
      apiKey: process.env.SIGNALSAPI_KEY!,
    })
    this.rss = new RSSParser()
  }

  async scan(): Promise<RawLead[]> {
    const results: RawLead[] = []

    // Paralleliser les 5 canaux
    const [jobChanges, hiring, headcount, funding, posts] = await Promise.allSettled([
      this.scanJobChanges(),
      this.scanHiring(),
      this.scanHeadcount(),
      this.scanFunding(),
      this.scanPosts(),
    ])

    // Collecter les resultats reussis
    for (const result of [jobChanges, hiring, headcount, funding, posts]) {
      if (result.status === 'fulfilled') {
        results.push(...result.value)
      } else {
        // Logger l'erreur mais continuer
        await this.logError('linkedin_scan', result.reason)
      }
    }

    return results
  }

  private async scanJobChanges(): Promise<RawLead[]> {
    const leads: RawLead[] = []

    // Pour chaque segment, chercher les changements de poste
    for (const segment of this.config.segments) {
      const companies = await this.netrows.searchCompanies({
        industry: segment.industries,
        employeeCount: segment.companySize,
        location: segment.geography,
        limit: 100,
      })

      for (const company of companies) {
        const employees = await this.netrows.getCompanyEmployees({
          companyId: company.id,
          changedSince: '6h',
          roles: segment.targetRoles,
        })

        for (const employee of employees) {
          if (this.isRelevantJobChange(employee)) {
            leads.push({
              source: '1a_linkedin',
              type: 'signal_linkedin',
              signal_type: 'changement_poste',
              detail: `${employee.firstName} ${employee.lastName} nomme(e) ${employee.currentTitle} chez ${company.name}`,
              tier: 1,
              score_signal: 30,
              date_signal: new Date().toISOString(),
              entreprise: {
                nom: company.name,
                linkedin_company_url: company.linkedinUrl,
                site_web: company.website,
                taille_estimee: this.categorizeSize(company.employeeCount),
                localisation: company.headquarters,
                segment_estime: segment.name,
              },
              contact: {
                prenom: employee.firstName,
                nom: employee.lastName,
                poste: employee.currentTitle,
                linkedin_url: employee.linkedinUrl,
              },
            })
          }
        }
      }
    }

    return leads
  }

  private async scanHiring(): Promise<RawLead[]> {
    const leads: RawLead[] = []

    const hiringSignals = await this.signalsApi.getHiringSignals({
      industries: this.config.segments.flatMap(s => s.industries),
      locations: ['France'],
      minOpenPositions: 3,
      positionKeywords: ['marketing', 'digital', 'web', 'developer', 'tech'],
    })

    for (const signal of hiringSignals) {
      leads.push({
        source: '1a_linkedin',
        type: 'signal_linkedin',
        signal_type: 'recrutement_actif',
        detail: `${signal.companyName} a ${signal.openPositions} postes ouverts dont ${signal.relevantPositions.join(', ')}`,
        tier: signal.openPositions >= 5 ? 1 : 2,
        score_signal: signal.openPositions >= 5 ? 25 : 15,
        date_signal: new Date().toISOString(),
        entreprise: {
          nom: signal.companyName,
          site_web: signal.website,
          taille_estimee: this.categorizeSize(signal.employeeCount),
          localisation: signal.location,
        },
        contact: null, // A trouver par l'Enrichisseur
      })
    }

    return leads
  }

  private async scanHeadcount(): Promise<RawLead[]> {
    // Comparer le headcount actuel avec le snapshot precedent (DB)
    const leads: RawLead[] = []

    const previousSnapshots = await db.query(
      `SELECT company_linkedin_url, employee_count, snapshot_date
       FROM headcount_snapshots
       WHERE snapshot_date > NOW() - INTERVAL '90 days'
       ORDER BY company_linkedin_url, snapshot_date DESC`
    )

    // Grouper par entreprise
    const grouped = groupBy(previousSnapshots, 'company_linkedin_url')

    for (const [url, snapshots] of Object.entries(grouped)) {
      if (snapshots.length < 2) continue

      const latest = snapshots[0].employee_count
      const oldest = snapshots[snapshots.length - 1].employee_count
      const growthRate = (latest - oldest) / oldest

      if (growthRate >= 0.10) { // +10% en 90 jours
        const company = await this.netrows.getCompanyByLinkedIn(url)
        leads.push({
          source: '1a_linkedin',
          type: 'signal_linkedin',
          signal_type: 'croissance_equipe',
          detail: `${company.name} : +${Math.round(growthRate * 100)}% d'effectif en 90 jours (${oldest} -> ${latest})`,
          tier: growthRate >= 0.20 ? 1 : 2,
          score_signal: growthRate >= 0.20 ? 25 : 15,
          date_signal: new Date().toISOString(),
          entreprise: {
            nom: company.name,
            linkedin_company_url: url,
            site_web: company.website,
            taille_estimee: this.categorizeSize(latest),
            localisation: company.headquarters,
          },
          contact: null,
        })
      }
    }

    return leads
  }

  private async scanFunding(): Promise<RawLead[]> {
    const leads: RawLead[] = []

    // Source 1 : RSS Maddyness MaddyMoney
    const maddyFeed = await this.rss.parse('https://www.maddyness.com/feed/?tag=levee-de-fonds')
    for (const item of maddyFeed.items.filter(i => this.isRecent(i.pubDate, 24))) {
      const extracted = this.extractFundingInfo(item.title, item.description)
      if (extracted) {
        leads.push({
          source: '1a_linkedin',
          type: 'signal_linkedin',
          signal_type: 'levee_fonds',
          detail: `${extracted.company} a leve ${extracted.amount} (${extracted.round})`,
          tier: 1,
          score_signal: 35,
          date_signal: new Date(item.pubDate).toISOString(),
          entreprise: {
            nom: extracted.company,
            localisation: extracted.location || 'France',
          },
          contact: null,
        })
      }
    }

    // Source 2 : RSS BPI France
    const bpiFeed = await this.rss.parse('https://bigmedia.bpifrance.fr/feed')
    // ... meme logique

    return leads
  }

  private async scanPosts(): Promise<RawLead[]> {
    // Via n8n : RSS feeds des pages entreprises --> webhook --> traitement
    const leads: RawLead[] = []

    // Recuperer les posts non-traites depuis la queue
    const unprocessedPosts = await db.query(
      `SELECT * FROM linkedin_posts_queue WHERE processed = false ORDER BY received_at ASC LIMIT 100`
    )

    for (const post of unprocessedPosts) {
      const matchedKeywords = this.matchKeywords(post.content, this.config.keywords)

      if (matchedKeywords.length > 0) {
        leads.push({
          source: '1a_linkedin',
          type: 'signal_linkedin',
          signal_type: 'post_besoin_tech',
          detail: `Post de ${post.author_name} (${post.company_name}) mentionne: ${matchedKeywords.join(', ')}`,
          tier: 2,
          score_signal: Math.min(25, matchedKeywords.length * 5 + 10),
          date_signal: new Date(post.published_at).toISOString(),
          entreprise: {
            nom: post.company_name,
            linkedin_company_url: post.company_linkedin_url,
          },
          contact: {
            prenom: post.author_first_name,
            nom: post.author_last_name,
            linkedin_url: post.author_linkedin_url,
          },
        })
      }

      // Marquer comme traite
      await db.query('UPDATE linkedin_posts_queue SET processed = true WHERE id = $1', [post.id])
    }

    return leads
  }
}
```

### 3.6 Donnees de sortie (Output)

```json
{
  "type": "signal_linkedin",
  "source": "1a_linkedin",
  "date_detection": "2026-03-18T09:15:00Z",
  "signal_type": "changement_poste",
  "tier": 1,
  "score_signal": 30,
  "detail": "Sophie Martin nommee CMO chez TechCorp il y a 3 semaines",
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
  "metadata": {
    "api_source": "netrows",
    "credits_consumed": 2,
    "confidence": 0.95
  }
}
```

### 3.7 Scoring / Filtrage

| Signal | Tier | Score | Seuil de declenchement |
|--------|------|-------|----------------------|
| Levee de fonds annoncee | 1 | 35 pts | Toute levee detectee |
| Changement de poste C-level | 1 | 30 pts | Roles CMO, CTO, DG, DSI |
| Recrutement actif (5+ postes) | 1 | 25 pts | >= 5 postes ouverts tech/marketing |
| Croissance equipe >= 20% | 1 | 25 pts | +20% headcount en 90 jours |
| Post avec mots-cles forts | 2 | 20 pts | Match >= 2 keywords |
| Recrutement actif (3-4 postes) | 2 | 15 pts | 3-4 postes ouverts |
| Croissance equipe 10-19% | 2 | 15 pts | +10-19% headcount |
| Engagement contenu tech | 3 | 10 pts | 3+ engagements tech en 30 jours |
| Anniversaire entreprise | 3 | 5 pts | 1, 5 ou 10 ans |

**Seuil de retention** : score_signal >= 10 (les signaux < 10 sont archives mais pas transmis)

### 3.8 Volumes et performance

| Metrique | Valeur estimee |
|----------|---------------|
| Profils entreprises scannes par run | 100-500 |
| Signaux detectes par run | 5-15 |
| Signaux detectes par jour (4 runs) | 20-60 |
| Signaux Tier 1 par jour | 3-8 |
| Signaux Tier 2 par jour | 8-20 |
| Signaux Tier 3 par jour | 10-30 |
| Temps par run | 15-30 min |
| Credits Netrows par run | 200-1000 |
| Credits Netrows par jour | 800-4000 |

### 3.9 Couts detailles

| API | Cout/mois | Credits inclus | Usage prevu/mois | Cout/lead |
|-----|----------|----------------|-----------------|-----------|
| Netrows | 99 EUR | 40,000 credits | 25,000-30,000 | ~0.004 EUR |
| SignalsAPI | 99 USD | Starter plan | Variable | ~0.01 USD |
| n8n (self-hosted) | 0 EUR | Illimité | ~5,000 ops | 0 EUR |
| Hunter.io | 49 EUR | 1,500 lookups | Partage 4 agents | ~0.03 EUR |
| **Total 1a** | **~276 EUR** | | | |

### 3.10 Gestion des erreurs

```typescript
const errorHandlers = {
  // Netrows API down
  'NETROWS_API_ERROR': {
    action: 'retry_with_backoff',
    maxRetries: 3,
    backoffMs: [5000, 15000, 60000],
    fallback: 'skip_job_changes_and_headcount', // Les autres canaux continuent
    alert: 'slack_warning',
  },

  // SignalsAPI down
  'SIGNALSAPI_ERROR': {
    action: 'retry_with_backoff',
    maxRetries: 3,
    fallback: 'use_cached_hiring_data', // Cache Redis TTL 24h
    alert: 'slack_warning',
  },

  // Rate limit atteint
  'RATE_LIMIT_429': {
    action: 'pause_and_resume',
    pauseMs: 60000, // Attendre 1 minute
    maxPauses: 5,
    fallback: 'reduce_batch_size',
    alert: 'slack_info',
  },

  // RSS feed inaccessible
  'RSS_FEED_ERROR': {
    action: 'skip_and_log',
    fallback: 'use_cached_feed', // Cache RSS TTL 6h
    alert: 'none',
  },

  // Timeout general
  'SCAN_TIMEOUT': {
    action: 'save_partial_results',
    fallback: 'dispatch_partial_batch',
    alert: 'slack_warning',
  },
}
```

### 3.11 Monitoring

| Metrique | Seuil alerte | Action |
|----------|-------------|--------|
| Leads/jour < 5 | WARN | Verifier APIs |
| Leads/jour < 2 | CRITICAL | Verifier credentials + quotas |
| Taux erreur > 20% | WARN | Analyser logs |
| Taux erreur > 50% | CRITICAL | Pause automatique + alerte |
| Temps de run > 60 min | WARN | Verifier rate limits |
| Credits Netrows restants < 5000 | WARN | Prevoir upgrade |

---

## 4. SOUS-AGENT 1b -- VEILLEUR MARCHES PUBLICS
