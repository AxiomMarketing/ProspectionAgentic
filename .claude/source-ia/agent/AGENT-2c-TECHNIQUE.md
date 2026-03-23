# SOUS-AGENT 2c — ENRICHISSEUR TECHNIQUE
**Agent parent** : AGENT-2-MASTER.md
**Mission** : Enrichir les donnees techniques du site web (stack, performance, accessibilite)

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
