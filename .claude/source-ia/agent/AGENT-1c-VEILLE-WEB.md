# SOUS-AGENT 1c — VEILLEUR WEB (Sites & Tech)
**Agent parent** : AGENT-1-MASTER.md
**Position dans le pipeline** : Agent 1c → Master Veilleur → Agent 2 (Enrichisseur)

## 5. SOUS-AGENT 1c -- VEILLEUR WEB (Sites & Tech)

### 5.1 Mission precise

**Ce qu'il fait** :
- Prend une liste d'entreprises cibles (injectee manuellement ou depuis scraping sectoriel)
- Scanne leur site web avec Lighthouse (performance, accessibilite, SEO, best practices)
- Detecte la stack technique (CMS, framework, serveur, plugins) via Wappalyzer
- Identifie les sites lents, non accessibles, en technologie obsolete
- Detecte les problemes SSL, HTTPS, sitemap, robots.txt
- Genere un lead avec le signal technique associe

**Ce qu'il ne fait PAS** :
- Il ne construit PAS la liste de sites a scanner (c'est un input)
- Il ne contacte PAS les entreprises
- Il ne fait PAS d'audit approfondi (juste un scan rapide)

### 5.2 Architecture technique

**Stack** :

| Composant | Outil | Cout mensuel | Usage |
|-----------|-------|-------------|-------|
| **Scan performance** | Lighthouse CLI (npm) | 0 EUR | Score perf, a11y, SEO |
| **Fallback perf** | PageSpeed Insights API | 0 EUR | 25,000 req/jour gratuites |
| **Detection stack** | Wappalyzer (npm) | 0 EUR | CMS, framework, plugins |
| **Scan accessibilite** | axe-core + Pa11y | 0 EUR | Violations WCAG/RGAA |
| **Browser headless** | Playwright | 0 EUR | Rendering + screenshots |
| **Queue** | BullMQ + Redis | 0 EUR (inclus) | Gestion batch |
| **SSL check** | Node.js tls module | 0 EUR | Certificat expiration |

**Total sous-agent 1c** : 0 EUR/mois (tout open source)

### 5.3 Donnees d'entree (Input)

```typescript
interface WebScanConfig {
  // Liste de sites a scanner
  sites: Array<{
    url: string
    entreprise: string
    siret?: string
    segment?: string
    source: string // 'annuaire_reunion' | 'sirene_api' | 'google_search' | 'manual'
  }>

  // Seuils de detection
  seuils: {
    performance_critique: number     // < 30
    performance_faible: number       // < 50
    accessibilite_non_conforme: number // < 50
    accessibilite_faible: number     // < 70
    lcp_lent: number                 // > 4000 (ms)
    cls_mauvais: number              // > 0.25
    page_weight_lourd: number        // > 5 (MB)
    ssl_expiration_jours: number     // < 30
  }

  // Configuration scan
  scan: {
    concurrency: number              // 5 (workers paralleles)
    timeoutPerSite: number           // 120000 (ms)
    maxSitesPerNight: number         // 500
    retries: number                  // 3
    cacheTTLSeconds: number          // 172800 (48h)
  }
}
```

**Constitution de la liste de sites** :
- Source 1 : API SIRENE (data.gouv.fr) - filtrer par code APE + departement
- Source 2 : Annuaires sectoriels (notaires, avocats, immobilier, etc.)
- Source 3 : Google Search scraping via Apify
- Source 4 : CCI Reunion + registres locaux
- Source 5 : Injection manuelle (prospects identifies par d'autres sous-agents)

**Frequence** : 1x/jour (nuit, 02:00-06:00), 100-500 sites par run

### 5.4 Processus detaille

```
ETAPE 1 : CHARGER LA LISTE DES SITES
├── Lire la liste depuis la table `sites_a_scanner` en DB
├── Exclure les sites scannes dans les derniers `cacheTTLSeconds`
├── Prioriser : sites jamais scannes > sites avec ancien scan > sites en cache
└── Limiter a `maxSitesPerNight`

ETAPE 2 : ENQUEUE DANS BULLMQ
├── Creer un job BullMQ par site
├── Concurrency : 5 workers en parallele
├── Timeout : 120s par site
└── Retries : 3 avec backoff exponentiel

ETAPE 3 : POUR CHAQUE SITE (worker)
├── 3.1 Lighthouse Audit
│   ├── Lancer chrome-launcher (headless)
│   ├── Executer lighthouse(url, options)
│   ├── Extraire : performance, accessibility, bestPractices, seo
│   ├── Extraire : LCP, FCP, TBT, CLS, INP
│   └── Stocker le rapport complet en JSONB
│
├── 3.2 Wappalyzer Detection
│   ├── Charger le npm wappalyzer
│   ├── Analyser l'URL
│   ├── Extraire : CMS, framework, serveur, analytics, CDN
│   ├── Detecter la version (WordPress, Shopify, etc.)
│   └── Classifier : moderne | acceptable | obsolete
│
├── 3.3 axe-core Accessibilite
│   ├── Ouvrir la page avec Playwright
│   ├── Injecter axe-core
│   ├── Executer analyse WCAG 2.1 AA
│   ├── Compter : violations critical, serious, moderate, minor
│   └── Calculer score accessibilite (0-100)
│
├── 3.4 Verifications complementaires
│   ├── SSL : verifier certificat, date expiration
│   ├── HTTPS : redirection HTTP → HTTPS ?
│   ├── robots.txt : existe ?
│   ├── sitemap.xml : existe ?
│   ├── Page weight : poids total (HTML + CSS + JS + images)
│   └── Screenshot : capture PNG pour reference
│
└── 3.5 Scoring prospect
    ├── Calculer le score technique (cf. section 5.6)
    ├── Si score >= seuil : generer un RawLead
    └── Stocker le resultat en DB

ETAPE 4 : CLASSIFICATION ET OUTPUT
├── URGENT (score >= 70) : site critique, refonte necessaire
├── HIGH (score 50-69) : problemes serieux, optimisation requise
├── MEDIUM (score 30-49) : ameliorations possibles
└── LOW (score < 30) : pas de probleme majeur, archiver
```

### 5.5 Code d'implementation

```typescript
// agents/veilleur/web/scanner.ts
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'
import Wappalyzer from 'wappalyzer'
import { chromium } from 'playwright'
import { injectAxe } from 'axe-playwright'
import * as tls from 'tls'

export class WebScanner {
  async scanSite(url: string): Promise<WebScanResult> {
    const results: Partial<WebScanResult> = { url }

    // 1. Lighthouse
    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] })
    try {
      const lhResult = await lighthouse(url, {
        logLevel: 'error',
        output: 'json',
        port: chrome.port,
      })
      const report = JSON.parse(lhResult!.report as string)

      results.lighthouse = {
        performance: Math.round(report.categories.performance.score * 100),
        accessibility: Math.round(report.categories.accessibility.score * 100),
        bestPractices: Math.round(report.categories['best-practices'].score * 100),
        seo: Math.round(report.categories.seo.score * 100),
        metrics: {
          fcp: report.audits['first-contentful-paint'].numericValue,
          lcp: report.audits['largest-contentful-paint'].numericValue,
          tbt: report.audits['total-blocking-time'].numericValue,
          cls: report.audits['cumulative-layout-shift'].numericValue,
        },
      }
    } finally {
      await chrome.kill()
    }

    // 2. Wappalyzer
    const wappalyzer = new Wappalyzer()
    try {
      const techResult = await wappalyzer.detect({ url, wait: 5000 })
      results.stack = {
        cms: techResult.technologies.find(t => t.categories?.some(c => c.name === 'CMS'))?.name || null,
        cmsVersion: techResult.technologies.find(t => t.categories?.some(c => c.name === 'CMS'))?.version || null,
        framework: techResult.technologies.find(t => t.categories?.some(c => c.name === 'JavaScript frameworks'))?.name || null,
        server: techResult.technologies.find(t => t.categories?.some(c => c.name === 'Web servers'))?.name || null,
        analytics: techResult.technologies.filter(t => t.categories?.some(c => c.name === 'Analytics')).map(t => t.name),
        allTechnologies: techResult.technologies.map(t => ({
          name: t.name,
          version: t.version,
          category: t.categories?.[0]?.name,
        })),
      }
    } catch (e) {
      results.stack = null
    }

    // 3. axe-core accessibilite
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
      await injectAxe(page)
      const axeResults = await page.evaluate(() => {
        return new Promise((resolve) => {
          (window as any).axe.run({ standard: 'wcag2aa' }, (err: any, results: any) => {
            resolve(results)
          })
        })
      })
      results.accessibilite = {
        violations: (axeResults as any).violations?.length || 0,
        violationsCritical: (axeResults as any).violations?.filter((v: any) => v.impact === 'critical').length || 0,
        violationsSerious: (axeResults as any).violations?.filter((v: any) => v.impact === 'serious').length || 0,
        passes: (axeResults as any).passes?.length || 0,
      }

      // Screenshot
      await page.screenshot({ path: `/tmp/screenshots/${encodeURIComponent(url)}.png`, fullPage: false })
    } finally {
      await browser.close()
    }

    // 4. SSL check
    results.ssl = await this.checkSSL(url)

    // 5. SEO checks
    results.seo = await this.checkSEO(url)

    // 6. Page weight
    results.pageWeight = await this.measurePageWeight(url)

    return results as WebScanResult
  }

  private async checkSSL(url: string): Promise<SSLResult> {
    try {
      const hostname = new URL(url).hostname
      return new Promise((resolve) => {
        const socket = tls.connect(443, hostname, {}, () => {
          const cert = socket.getPeerCertificate()
          const expiryDate = new Date(cert.valid_to)
          const daysRemaining = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          socket.end()
          resolve({
            valid: daysRemaining > 0,
            daysRemaining,
            expiryDate: expiryDate.toISOString(),
            warning: daysRemaining < 30 ? 'EXPIRING_SOON' : null,
          })
        })
        socket.on('error', () => resolve({ valid: false, daysRemaining: 0, expiryDate: '', warning: 'SSL_ERROR' }))
      })
    } catch {
      return { valid: false, daysRemaining: 0, expiryDate: '', warning: 'NO_SSL' }
    }
  }

  private async checkSEO(url: string): Promise<SEOResult> {
    const baseUrl = new URL(url).origin
    const [robots, sitemap] = await Promise.allSettled([
      fetch(`${baseUrl}/robots.txt`),
      fetch(`${baseUrl}/sitemap.xml`),
    ])

    return {
      hasRobotsTxt: robots.status === 'fulfilled' && robots.value.status === 200,
      hasSitemap: sitemap.status === 'fulfilled' && sitemap.value.status === 200,
    }
  }

  private async measurePageWeight(url: string): Promise<number> {
    const browser = await chromium.launch()
    let totalBytes = 0
    try {
      const page = await browser.newPage()
      page.on('response', (response) => {
        const headers = response.headers()
        const contentLength = parseInt(headers['content-length'] || '0', 10)
        totalBytes += contentLength
      })
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    } finally {
      await browser.close()
    }
    return totalBytes / (1024 * 1024) // Convertir en MB
  }
}
```

### 5.6 Scoring technique

```typescript
function calculateProspectScore(result: WebScanResult): ProspectClassification {
  let score = 0
  const reasons: string[] = []

  // 1. Performance Lighthouse (poids 40%)
  if (result.lighthouse.performance < 30) {
    score += 40
    reasons.push(`Performance critique (${result.lighthouse.performance}/100)`)
  } else if (result.lighthouse.performance < 50) {
    score += 30
    reasons.push(`Performance faible (${result.lighthouse.performance}/100)`)
  } else if (result.lighthouse.performance < 75) {
    score += 15
    reasons.push(`Performance a ameliorer (${result.lighthouse.performance}/100)`)
  }

  // 2. Accessibilite (poids 25%)
  if (result.lighthouse.accessibility < 50) {
    score += 25
    reasons.push(`Accessibilite non conforme (${result.lighthouse.accessibility}/100) - risque legal RGAA`)
  } else if (result.lighthouse.accessibility < 70) {
    score += 15
    reasons.push(`Accessibilite faible (${result.lighthouse.accessibility}/100)`)
  }

  // 3. Stack technique (poids 20%)
  if (result.stack) {
    // WordPress obsolete
    if (result.stack.cms === 'WordPress' && result.stack.cmsVersion) {
      const majorVersion = parseInt(result.stack.cmsVersion.split('.')[0])
      if (majorVersion < 6) {
        score += 15
        reasons.push(`WordPress obsolete (v${result.stack.cmsVersion})`)
      }
    }
    // jQuery sans framework moderne
    if (result.stack.framework === 'jQuery' && !result.stack.allTechnologies.some(t =>
      ['React', 'Vue.js', 'Angular', 'Next.js', 'Nuxt.js'].includes(t.name)
    )) {
      score += 10
      reasons.push('Stack obsolete (jQuery seul, pas de framework moderne)')
    }
    // Pas de CMS ni framework = fait maison
    if (!result.stack.cms && !result.stack.framework) {
      score += 5
      reasons.push('Site potentiellement fait maison (pas de CMS/framework detecte)')
    }
  }

  // 4. Page weight (poids 10%)
  if (result.pageWeight > 5) {
    score += 10
    reasons.push(`Site tres lourd (${result.pageWeight.toFixed(1)} MB)`)
  } else if (result.pageWeight > 3) {
    score += 5
    reasons.push(`Site lourd (${result.pageWeight.toFixed(1)} MB)`)
  }

  // 5. SSL et SEO (poids 5%)
  if (result.ssl.warning === 'NO_SSL') {
    score += 5
    reasons.push('Pas de HTTPS')
  } else if (result.ssl.warning === 'EXPIRING_SOON') {
    score += 3
    reasons.push(`Certificat SSL expire dans ${result.ssl.daysRemaining} jours`)
  }
  if (!result.seo.hasSitemap) {
    score += 2
    reasons.push('Pas de sitemap.xml')
  }

  // Classification
  const tier = score >= 70 ? 'URGENT' : score >= 50 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW'

  return {
    score: Math.min(100, score),
    tier,
    reasons,
    recommendation: tier === 'URGENT'
      ? 'Refonte complete necessaire - contacter en priorite'
      : tier === 'HIGH'
      ? 'Optimisation serieuse requise - proposer audit gratuit'
      : tier === 'MEDIUM'
      ? 'Ameliorations possibles - approche consultative'
      : 'Pas de besoin evident',
  }
}
```

### 5.7 Donnees de sortie (Output)

```json
{
  "type": "signal_web",
  "source": "1c_web",
  "date_detection": "2026-03-18T03:30:00Z",
  "signal_type": "site_lent",
  "tier": 1,
  "score_signal": 40,
  "site_web": "https://www.entreprise-exemple.fr",
  "entreprise": {
    "nom": "Entreprise Exemple",
    "siret": "12345678900012",
    "site_web": "https://www.entreprise-exemple.fr",
    "segment_estime": "pme_metro",
    "localisation": "Lyon, France"
  },
  "contact": null,
  "audit": {
    "lighthouse": {
      "performance": 28,
      "accessibility": 45,
      "bestPractices": 67,
      "seo": 71,
      "metrics": {
        "fcp": 3200,
        "lcp": 6800,
        "tbt": 450,
        "cls": 0.32
      }
    },
    "stack": {
      "cms": "WordPress",
      "cmsVersion": "5.3",
      "framework": "jQuery",
      "server": "Apache",
      "analytics": ["Google Analytics"],
      "plugins_count": 23
    },
    "accessibilite": {
      "violations": 18,
      "violationsCritical": 5,
      "violationsSerious": 8,
      "passes": 42
    },
    "ssl": {
      "valid": true,
      "daysRemaining": 45,
      "warning": null
    },
    "seo": {
      "hasRobotsTxt": true,
      "hasSitemap": false
    },
    "pageWeight": 4.2
  },
  "problemes_detectes": [
    "Performance critique (28/100)",
    "Accessibilite non conforme (45/100) - risque legal RGAA",
    "WordPress obsolete (v5.3)",
    "Stack obsolete (jQuery seul)",
    "Site lourd (4.2 MB)",
    "Pas de sitemap.xml"
  ],
  "classification": {
    "score": 82,
    "tier": "URGENT",
    "recommendation": "Refonte complete necessaire - contacter en priorite"
  }
}
```

### 5.8 Volumes et performance

| Metrique | Valeur |
|----------|--------|
| Sites scannes par nuit | 100-500 |
| Temps par site (Lighthouse + Wappalyzer + axe) | 45-90 secondes |
| Avec 5 workers paralleles | 100 sites en ~30 min, 500 en ~2.5h |
| Sites "URGENT" detectes par nuit | 5-15 |
| Sites "HIGH" detectes par nuit | 10-30 |
| Stockage screenshots | ~70KB/site = 35 MB/nuit pour 500 sites |
| Cache Redis (resultats) | ~2KB/site = 1 MB pour 500 sites |

### 5.9 Couts

| Service | Cout/mois |
|---------|----------|
| Lighthouse CLI | 0 EUR |
| Wappalyzer npm | 0 EUR |
| axe-core | 0 EUR |
| Playwright | 0 EUR |
| PageSpeed Insights API (fallback) | 0 EUR |
| VPS 4-core pour workers (inclus infra globale) | 0 EUR |
| **Total 1c** | **0 EUR** |

### 5.10 Gestion des erreurs

```typescript
const errorHandlers = {
  'SITE_TIMEOUT': {
    action: 'mark_as_unreachable',
    data: { status: 'unreachable', error: 'TIMEOUT_120S' },
    retry: false,
    alert: 'none', // Normal pour certains sites
  },
  'DNS_FAILED': {
    action: 'mark_as_invalid',
    data: { status: 'invalid_domain' },
    retry: false,
    alert: 'none',
  },
  'WAF_BLOCKED': {
    action: 'retry_with_different_user_agent',
    maxRetries: 2,
    fallback: 'use_pagespeed_api_only',
    alert: 'slack_info',
  },
  'LIGHTHOUSE_CRASH': {
    action: 'retry_with_reduced_config',
    config: { onlyPerformance: true },
    maxRetries: 2,
    alert: 'slack_warning',
  },
  'OUT_OF_MEMORY': {
    action: 'restart_worker',
    reduceConcurrency: true,
    alert: 'slack_critical',
  },
}
```

### 5.11 Monitoring

| Metrique | Seuil alerte |
|----------|-------------|
| Taux d'echec scan > 30% | WARN |
| Taux d'echec scan > 50% | CRITICAL |
| Temps total run > 4h | WARN |
| 0 leads URGENT detectes en 7 jours | INFO (revoir seuils) |
| RAM usage worker > 2GB | WARN |
| Disk usage screenshots > 1GB | INFO (purger anciens) |

---

