# Agent 2 — ENRICHISSEUR — Détails d'implémentation complets

**Complément à :** `02-AGENT-2-ENRICHISSEUR.md`
**Comble les gaps identifiés par l'audit final du 26/03/2026**

---

## 1. ACTIVATION CONDITIONNELLE DES SOUS-AGENTS (M1)

Le champ `metadata.traitement_requis` détermine quels sous-agents activer pour chaque lead.

```typescript
function determineTraitement(lead: RawLead, prospect: Prospect): string[] {
  const traitements: string[] = [];

  // Contact toujours requis sauf si email déjà présent ET vérifié
  if (!prospect.email || !prospect.emailVerified) {
    traitements.push('enrichissement_contact');
  }

  // Entreprise toujours requis sauf si SIRET + CA déjà présents
  if (!prospect.companySiren) {
    traitements.push('enrichissement_entreprise');
  }

  // Technique requis sauf si Agent 1c l'a déjà fait
  if (lead.source !== 'web_audit' && prospect.companyWebsite) {
    const recentScan = await prisma.auditTechnique.findFirst({
      where: { url: prospect.companyWebsite, createdAt: { gte: thirtyDaysAgo() } },
    });
    if (!recentScan) traitements.push('scan_technique');
  }

  // Toujours au moins 1 traitement
  if (traitements.length === 0) {
    traitements.push('enrichissement_contact'); // vérifier au minimum
  }

  return traitements;
}
```

**Impact** : Réduit les appels API inutiles de ~30% (leads LinkedIn ont déjà un contact, leads web_audit ont déjà le scan technique).

---

## 2. HUNTER.IO — DÉTAILS API COMPLETS (I1)

### ⚠️ Déviation architecturale par rapport à la spec

La spec prévoit : Dropcontact (primaire) → Hunter Domain → Hunter Finder → Pattern SMTP → ZeroBounce.
Notre implémentation : **Pattern + Reacher SMTP (primaire) → Hunter Finder → Hunter Domain**

**Raison** : Reacher est self-hosted (0€) vs Dropcontact (39€/mois). On utilise les patterns SMTP en premier car ils sont gratuits, Hunter en fallback quand Reacher ne confirme pas.

### Endpoints Hunter.io

**Base URL** : `https://api.hunter.io/v2/`
**Auth** : Query param `api_key=KEY`
**Rate limit** : 15 req/s, 500 req/min

#### Domain Search (trouver des contacts par domaine)

```
GET /domain-search?domain=techcorp.fr&type=personal&seniority=executive&department=marketing&limit=10&api_key=KEY
```

Paramètres :
- `domain` (requis) : domaine exact
- `seniority` : `junior`, `senior`, `executive`
- `department` : `it`, `sales`, `marketing`, `finance`, `hr`, `operations`
- `limit` : 1-10 (défaut: 10)

Réponse :
```json
{
  "data": {
    "domain": "techcorp.fr",
    "emails": [{
      "value": "sophie.martin@techcorp.fr",
      "confidence": 92,
      "first_name": "Sophie",
      "last_name": "Martin",
      "position": "Chief Marketing Officer",
      "seniority": "executive",
      "department": "marketing",
      "linkedin_url": "https://linkedin.com/in/sophie-martin"
    }]
  }
}
```

**Consommation** : 1 crédit par email dans les résultats.

#### Email Finder (trouver l'email d'une personne)

```
GET /email-finder?domain=techcorp.fr&first_name=Sophie&last_name=Martin&api_key=KEY
```

Réponse :
```json
{
  "data": {
    "email": "sophie.martin@techcorp.fr",
    "score": 97,
    "position": "CMO",
    "linkedin_url": "https://linkedin.com/in/sophie-martin"
  }
}
```

**Consommation** : 1 crédit par recherche.

#### Email Verifier

```
GET /email-verifier?email=sophie.martin@techcorp.fr&api_key=KEY
```

Réponse : `{ "data": { "status": "valid", "score": 100, "smtp_check": true, "accept_all": false } }`

Statuts : `valid`, `invalid`, `accept_all` (catch-all), `webmail`, `disposable`, `unknown`

### Pricing : Starter 49 USD/mois = 500 crédits

### Tracking crédits

```typescript
// hunter.adapter.ts — tracker les crédits restants
async getCreditsRemaining(): Promise<number> {
  const res = await fetch(`https://api.hunter.io/v2/account?api_key=${this.apiKey}`);
  const data = await res.json();
  return data.data.calls.available;
}
```

---

## 3. DECIDEUR_SCORE — Algorithme de calcul (M3)

```typescript
const DECIDEUR_MAPPINGS: Record<string, { titles: RegExp[]; departments: string[] }> = {
  pme_metro: {
    titles: [/\b(cmo|chief marketing|directeur marketing)\b/i, /\b(dg|directeur g[eé]n[eé]ral|ceo)\b/i, /\b(cto|dsi|directeur (technique|informatique))\b/i],
    departments: ['marketing', 'executive', 'it'],
  },
  ecommerce: {
    titles: [/\b(fondateur|founder|co-?founder)\b/i, /\b(head of growth|growth)\b/i, /\b(cmo|marketing)\b/i],
    departments: ['executive', 'marketing'],
  },
  collectivite: {
    titles: [/\b(dgs|directeur g[eé]n[eé]ral des services)\b/i, /\b(dsi|directeur.*informatique)\b/i, /\b([eé]lu.*num[eé]rique)\b/i],
    departments: ['executive', 'it'],
  },
  startup: {
    titles: [/\b(founder|ceo|co-?founder)\b/i, /\b(cto|vp engineering)\b/i, /\b(head of growth|growth)\b/i],
    departments: ['executive', 'it'],
  },
  agence_wl: {
    titles: [/\b(fondateur|founder)\b/i, /\b(ceo|directeur)\b/i, /\b(account manager|commercial)\b/i],
    departments: ['executive', 'sales'],
  },
};

function calculateDecideurScore(contactTitle: string, segment: string): number {
  const mapping = DECIDEUR_MAPPINGS[segment] ?? DECIDEUR_MAPPINGS.pme_metro;
  for (let i = 0; i < mapping.titles.length; i++) {
    if (mapping.titles[i].test(contactTitle)) {
      return 10 - (i * 2); // 1er match = 10, 2ème = 8, 3ème = 6
    }
  }
  return 2; // Pas de match mais contact quand même
}
```

---

## 4. CONTACTS SECONDAIRES (M4)

Quand Hunter Domain Search retourne plusieurs contacts, stocker les non-primaires comme `contacts_secondaires` :

```typescript
interface ContactSecondaire {
  prenom: string;
  nom: string;
  poste: string;
  email: string;
  email_confidence: number;
  linkedin_url?: string;
  decideur_score: number;
}

// Dans enrichContact(), après Hunter Domain Search :
const allContacts = hunterResults.emails
  .map(e => ({
    prenom: e.first_name,
    nom: e.last_name,
    poste: e.position,
    email: e.value,
    email_confidence: e.confidence,
    linkedin_url: e.linkedin_url,
    decideur_score: calculateDecideurScore(e.position, segment),
  }))
  .sort((a, b) => b.decideur_score - a.decideur_score);

const primary = allContacts[0]; // Meilleur decideur
const secondary = allContacts.slice(1, 4); // Top 3 suivants

// Stocké dans enrichmentData.contacts_secondaires
```

---

## 5. INSEE TRANCHES EFFECTIFS — Table de mapping (M5)

```typescript
const INSEE_TRANCHES: Record<string, string> = {
  '00': '0 salarié',
  '01': '1-2 salariés',
  '02': '3-5 salariés',
  '03': '6-9 salariés',
  '11': '10-19 salariés',
  '12': '20-49 salariés',
  '21': '50-99 salariés',
  '22': '100-199 salariés',
  '31': '200-249 salariés',
  '32': '250-499 salariés',
  '41': '500-999 salariés',
  '42': '1000-1999 salariés',
  '51': '2000-4999 salariés',
  '52': '5000-9999 salariés',
  '53': '10000+ salariés',
};

function mapTrancheEffectif(code: string): string {
  return INSEE_TRANCHES[code] ?? `Code ${code}`;
}
```

---

## 6. PRIORITÉ DES SOURCES — Résolution de conflits (M6)

Quand plusieurs sources retournent des données différentes pour le même champ :

```
Priorité : Pappers > INSEE > INPI > SocieteInfo > BODACC

Règles spécifiques :
- Nom légal : Pappers → INSEE → INPI
- SIRET : INSEE (source officielle) → Pappers → INPI
- CA/finances : Pappers (seule source) → INPI (si bilans déposés)
- Dirigeants : Pappers → INPI → SocieteInfo
- Effectif exact : Pappers → INSEE (tranches seulement)
- Adresse : INSEE (officielle) → Pappers
- Procédures collectives : BODACC (source officielle) → Pappers
```

---

## 7. SOUS-AGENT 2c — DÉTAILS COMPLETS (M7, M8, M9, M10)

### 7.1 Wappalyzer (détection stack)

**Option npm** (recommandée pour éviter les coûts API) :
```bash
npm install wappalyzer-core
```

L'Agent 1c utilise déjà `wappalyzer-core` — **réutiliser le même** `WebScannerAdapter`.

**Si API payante** (30€/mois, 1000 lookups) :
```
GET https://api.wappalyzer.com/v2/lookup/?urls=https://www.techcorp.fr
Headers: x-api-key: YOUR_KEY
```

### 7.2 Lighthouse — Seuils Core Web Vitals

| Métrique | Bon | À améliorer | Mauvais |
|----------|:---:|:----------:|:-------:|
| LCP (Largest Contentful Paint) | ≤ 2.5s | 2.5-4s | > 4s |
| CLS (Cumulative Layout Shift) | ≤ 0.1 | 0.1-0.25 | > 0.25 |
| TBT (Total Blocking Time) | ≤ 300ms | 300-600ms | > 600ms |
| FCP (First Contentful Paint) | ≤ 1.8s | 1.8-3s | > 3s |
| Speed Index | ≤ 3.4s | 3.4-5.8s | > 5.8s |

```typescript
function computeVerdict(score: number): 'bon' | 'moyen' | 'mauvais' {
  if (score >= 90) return 'bon';
  if (score >= 50) return 'moyen';
  return 'mauvais';
}
```

### 7.3 axe-core — Format de sortie

```typescript
import { AxeResults } from 'axe-core';

interface AccessibiliteResult {
  score: number;              // 0-100 (calculé depuis Lighthouse a11y)
  violations_total: number;
  violations_critical: number;
  violations_serious: number;
  violations_moderate: number;
  passes: number;
  top_violations: Array<{
    id: string;               // 'image-alt', 'color-contrast', etc.
    impact: 'critical' | 'serious' | 'moderate' | 'minor';
    description: string;
    count: number;
  }>;
  rgaa_compliant: boolean;    // true si violations_critical === 0 && score >= 80
}
```

### 7.4 detectProblemes() — Règles d'exploitation commerciale

```typescript
function detectProblemes(perf: any, a11y: any, stack: any, ssl: any): string[] {
  const problemes: string[] = [];

  // Performance
  if (perf.score !== null && perf.score < 30) {
    problemes.push('PERFORMANCE CRITIQUE : score < 30/100 — site très lent, refonte nécessaire');
  } else if (perf.score !== null && perf.score < 50) {
    problemes.push('Performance faible : score < 50/100 — optimisation nécessaire');
  }
  if (perf.lcp_ms && perf.lcp_ms > 4000) {
    problemes.push(`LCP trop lent : ${perf.lcp_ms}ms (seuil Google : 2500ms)`);
  }
  if (perf.cls && perf.cls > 0.25) {
    problemes.push(`CLS mauvais : ${perf.cls} (seuil : 0.1)`);
  }

  // Accessibilité
  if (a11y.violations_critical > 0) {
    problemes.push(`${a11y.violations_critical} violations accessibilité CRITIQUES (RGAA non conforme)`);
  }
  if (a11y.score !== null && a11y.score < 50) {
    problemes.push('Accessibilité insuffisante : score < 50/100');
  }

  // Stack obsolète
  if (stack.cms === 'WordPress' && stack.cms_version) {
    const major = parseInt(stack.cms_version.split('.')[0]);
    if (major < 6) problemes.push(`WordPress obsolète (v${stack.cms_version}) — mise à jour critique`);
  }
  if (stack.framework_js === 'jQuery' && !stack.cms) {
    problemes.push('jQuery sans framework moderne — refonte front recommandée');
  }

  // SSL
  if (!ssl.valid) {
    problemes.push('ALERTE : Certificat SSL invalide ou absent');
  } else if (ssl.days_remaining !== null && ssl.days_remaining < 30) {
    problemes.push(`Certificat SSL expire dans ${ssl.days_remaining} jours`);
  }

  // SEO basique
  if (!ssl.valid) problemes.push('Pas de HTTPS — pénalité Google SEO');

  return problemes;
}
```

### 7.5 TechEnrichmentResult — Interface complète

```typescript
interface TechEnrichmentResult {
  status: 'success' | 'partial' | 'failed';

  stack: {
    cms: string | null;
    cms_version: string | null;
    framework_js: string | null;
    framework_js_version: string | null;
    server: string | null;
    analytics: string[];           // ['Google Analytics', 'Facebook Pixel']
    ecommerce_platform: string | null; // 'WooCommerce', 'Shopify', etc.
    cdn: string | null;            // 'Cloudflare', 'AWS CloudFront', etc.
    all_technologies: Array<{
      name: string;
      version: string | null;
      category: string;
      confidence: number;
    }>;
  };

  performance: {
    score: number | null;          // 0-100
    lcp_ms: number | null;
    cls: number | null;
    tbt_ms: number | null;
    fcp_ms: number | null;
    speed_index_ms: number | null;
    verdict: 'bon' | 'moyen' | 'mauvais' | null;
  };

  accessibilite: AccessibiliteResult;

  seo: {
    score: number | null;
    has_robots_txt: boolean;
    has_sitemap: boolean;
  };

  ssl: {
    valid: boolean;
    days_remaining: number | null;
  };

  page_weight_mb: number | null;
  problemes_detectes: string[];

  metadata: {
    url_scanned: string;
    duration_ms: number;
    errors: string[];
    cached: boolean;
  };
}
```

---

## 8. ERROR HANDLERS — Tous les sous-agents (M11)

### 2a Contact — Error handlers

```typescript
const ERROR_HANDLERS_2A = {
  REACHER_TIMEOUT: {
    action: 'skip_to_hunter',
    fallback: 'pattern_guess_confidence_30',
    alert: 'none',
  },
  REACHER_CIRCUIT_OPEN: {
    action: 'skip_to_hunter',
    fallback: 'pattern_guess_confidence_30',
    alert: 'slack_warning',
  },
  HUNTER_429_RATE_LIMIT: {
    action: 'wait_60s_retry_once',
    fallback: 'pattern_guess_confidence_30',
    alert: 'slack_info',
  },
  HUNTER_402_CREDITS_EXHAUSTED: {
    action: 'skip_hunter_for_month',
    fallback: 'pattern_guess_confidence_30',
    alert: 'slack_critical',
  },
  ALL_WATERFALL_FAILED: {
    action: 'flag_manual_enrichment',
    fallback: 'email_status_not_found',
    alert: 'none', // Fréquent pour les PME sans présence web
  },
};
```

### 2b Entreprise — Error handlers

```typescript
const ERROR_HANDLERS_2B = {
  INSEE_503_UNAVAILABLE: {
    action: 'retry_in_5_minutes',
    maxRetries: 3,
    fallback: 'try_annuaire_entreprises',
    alert: 'slack_warning',
  },
  INSEE_404_NOT_FOUND: {
    action: 'try_search_by_name',
    fallback: 'siret_status_not_found',
    alert: 'none', // Normal pour les entreprises étrangères
  },
  PAPPERS_429_RATE_LIMIT: {
    action: 'wait_60s_retry_once',
    fallback: 'skip_financial_data',
    alert: 'slack_info',
  },
  PAPPERS_CREDITS_EXHAUSTED: {
    action: 'skip_pappers_for_day',
    fallback: 'use_inpi_only',
    alert: 'slack_critical',
  },
  INPI_CIRCUIT_OPEN: {
    action: 'skip_inpi',
    fallback: 'use_pappers_directors_only',
    alert: 'slack_warning',
  },
  BODACC_TIMEOUT: {
    action: 'retry_once',
    fallback: 'skip_legal_notices',
    alert: 'none',
  },
  ENTERPRISE_FERMEE: {
    action: 'auto_exclude',
    fallback: 'reject_lead',
    alert: 'none',
  },
  PROCEDURE_COLLECTIVE: {
    action: 'auto_exclude',
    fallback: 'reject_lead',
    alert: 'slack_info',
  },
};
```

### 2c Technique — Error handlers

```typescript
const ERROR_HANDLERS_2C = {
  WAPPALYZER_ERROR: {
    action: 'retry_once',
    fallback: 'use_http_headers_detection', // Détecter via headers Server, X-Powered-By
    alert: 'none',
  },
  LIGHTHOUSE_TIMEOUT: {
    action: 'retry_with_reduced_config',
    config: { onlyCategories: ['performance'] },
    timeoutMs: 120000,
    fallback: 'skip_performance',
    alert: 'slack_info',
  },
  PLAYWRIGHT_CRASH: {
    action: 'restart_browser_and_retry',
    maxRetries: 2,
    fallback: 'skip_tech_scan',
    alert: 'slack_warning',
  },
  SITE_UNREACHABLE: {
    action: 'flag_site_down',
    addSignal: 'site_down', // Signal négatif pour le Scoreur
    alert: 'none',
  },
  SSL_ERROR: {
    action: 'continue_without_ssl',
    addSignal: 'ssl_invalide', // Signal commercial exploitable
    alert: 'none',
  },
};
```

---

## 9. CONTACT CACHE REDIS (M2)

```typescript
// Clé : contact:{domain}:{normalizedFullName}
// TTL : 7 jours
// Valeur : EmailFinderResult serialisé

async findEmailCached(firstName: string, lastName: string, domain: string): Promise<EmailFinderResult | null> {
  const key = `contact:${domain}:${normalize(firstName)}${normalize(lastName)}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const result = await this.findEmail(firstName, lastName, domain);
  if (result.email) {
    await redis.set(key, JSON.stringify(result), 'EX', 7 * 24 * 3600); // 7 jours
  }
  return result;
}
```

---

## 10. mergeWithExisting() — Logique de fusion (I4)

```typescript
function mergeWithExisting(newData: EnrichedProspect, existing: Prospect): Prospect {
  // 1. Fusionner les signaux (ajouter les nouveaux, pas de doublons)
  const existingSignals = (existing.enrichmentData as any)?.signals ?? [];
  const newSignals = newData.signals ?? [];
  const existingKeys = new Set(existingSignals.map((s: any) => `${s.type}:${s.source}:${s.date_signal}`));
  const mergedSignals = [
    ...existingSignals,
    ...newSignals.filter((s: any) => !existingKeys.has(`${s.type}:${s.source}:${s.date_signal}`)),
  ];

  // 2. Compléter les champs manquants (ne jamais écraser une valeur existante)
  const merged = {
    email: existing.email ?? newData.contact?.email,
    emailVerified: existing.emailVerified || (newData.contact?.email_confidence >= 75),
    companySiren: existing.companySiren ?? newData.entreprise?.siren,
    companySize: existing.companySize ?? newData.entreprise?.effectif?.tranche,
    phone: existing.phone ?? newData.contact?.telephone,
    companyWebsite: existing.companyWebsite ?? newData.entreprise?.site_web,
  };

  // 3. Fusionner enrichmentData (deep merge, existant prioritaire)
  const mergedEnrichmentData = {
    ...newData.enrichmentData,
    ...(existing.enrichmentData as Record<string, unknown>),
    signals: mergedSignals,
  };

  // 4. Incrémenter détections
  // nb_detections non tracké en colonne, mais dans enrichmentData.sources
  const mergedSources = [...new Set([
    ...((existing.enrichmentData as any)?.sources ?? []),
    ...(newData.sources ?? []),
  ])];

  return { ...existing, ...merged, enrichmentData: { ...mergedEnrichmentData, sources: mergedSources } };
}
```

---

## 11. OUTPUT enrichissement METADATA (I5)

```typescript
// Ajouté à enrichmentData après enrichissement
enrichmentData.enrichissement = {
  status: 'complet' | 'partiel' | 'echoue',
  date_enrichissement: new Date().toISOString(),
  sous_agents_utilises: ['2a_contact', '2b_entreprise', '2c_technique'].filter(Boolean),
  qualite: {
    completude_pct: number,     // 0-100
    champs_manquants: string[], // ['email', 'telephone', ...]
    enrichable: boolean,        // true si nom + au moins 1 canal de contact
  },
  duration_ms: number,
  credits_total: {
    reacher: number,    // Nombre d'appels SMTP
    hunter: number,     // Crédits Hunter consommés
    insee: number,      // Appels INSEE
    pappers: number,    // Crédits Pappers consommés
    inpi: number,       // Appels INPI
    bodacc: number,     // Appels BODACC
  },
};
```

---

## 12. DÉPENDANCES ENTRE PHASES (I6)

```
Phase 0 (Bug fixes)
  ↓ bloque tout
Phase 1 (Hunter.io) ──────────────────┐
Phase 2 (Pappers) ────────────────────┤ parallélisables
Phase 3 (2c Technique) ───────────────┘
  ↓ toutes les 3 doivent être terminées
Phase 4 (Master orchestration) ← dépend de 1+2+3
  ↓
Phase 5 (Cache Redis) ← dépend de 4
Phase 6 (RGPD) ← indépendant (parallélisable avec 5)
  ↓
Phase 7 (Dashboard) ← dépend de 4
Phase 8 (Tests) ← dépend de tout le reste
```
