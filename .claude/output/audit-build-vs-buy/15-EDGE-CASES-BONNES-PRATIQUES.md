# 15 — Edge Cases, Bonnes Pratiques & Anti-Patterns

## 1. Email Pattern Generator — Edge Cases

### Noms composés français

| Nom | Normalisation attendue | Piège |
|-----|----------------------|-------|
| Jean-François | `jeanfrancois` | Ne PAS garder le tiret dans l'email |
| Marie-Éloïse | `marieeoise` → **FAUX** → doit être `marieeloise` | L'accent sur le ï produit un artefact |
| De La Fontaine | `delafontaine` ou `lafontaine` ? | Les particules sont ambiguës |
| Nguyễn Văn | `nguyenvan` | Caractères vietnamiens fréquents en France |
| O'Brien | `obrien` | L'apostrophe doit être supprimée |
| Müller | `muller` | Tréma allemand |

**Bonne pratique :**
```typescript
// Normalisation exhaustive
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // accents
    .replace(/['ʼ'']/g, '')           // apostrophes (multiples variantes Unicode)
    .replace(/[\s-]/g, '')             // espaces et tirets → fusionner
    .replace(/[^a-z]/g, '');           // tout le reste
}
```

**Anti-pattern :** Ne PAS traiter les particules "de", "le", "la", "du", "van", "von" séparément — trop de cas ambigus. Fusionner et laisser les 15 patterns couvrir les combinaisons.

### Domaines spéciaux

| Cas | Exemple | Comportement attendu |
|-----|---------|---------------------|
| Domaine catch-all Google Workspace | `@company.fr` (hébergé sur Google) | Le SMTP check retourne souvent `unknown` au lieu de `safe/invalid` |
| Domaine Microsoft 365 | `@company.fr` (hébergé sur O365) | Microsoft bloque agressivement les SMTP checks → beaucoup de `unknown` |
| Domaine OVH mutualisé | `@company.fr` | Catch-all fréquent sur les hébergements mutualisés |
| Sous-domaine | `jean@mail.company.fr` | Le MX est souvent sur le domaine parent, pas le sous-domaine |
| Domaine expiré | `@defunct-company.fr` | MX lookup échoue → pas de vérification possible |

**Bonne pratique :** Traiter `unknown` comme `risky` (confidence 30%), pas comme `invalid`.

**Anti-pattern :** Ne PAS retenter en boucle quand le serveur ne répond pas — risque de blacklisting.

---

## 2. Reacher / SMTP Verification — Edge Cases

### Faux positifs et faux négatifs

| Scénario | Ce qui se passe | Impact |
|----------|----------------|--------|
| **Greylisting** | Le serveur refuse la première tentative (450) puis accepte la seconde | Faux négatif si on ne retry pas |
| **Catch-all activé puis désactivé** | L'email est marqué "risky" à J+0, mais valide à J+7 | Score de confiance incohérent |
| **Serveur temporairement down** | SMTP timeout → `unknown` | Pas un refus, juste un timeout |
| **Rate limiting du serveur** | 421 "Too many connections" | L'IP est temporairement bloquée |
| **Serveur qui ment** | Certains serveurs retournent `250 OK` pour tout (même si le mailbox n'existe pas) | Faux positif = bounce garanti à l'envoi |

**Bonnes pratiques :**
1. **Retry avec délai** pour les codes 4xx (temporaires) — max 2 retries, délai 30s
2. **Ne PAS retry les codes 5xx** (permanents) — l'email n'existe pas
3. **Cache les résultats** 7 jours pour les `safe/invalid`, 24h pour les `unknown/risky`
4. **Ne jamais vérifier plus de 5 emails/seconde** sur un même domaine MX
5. **Séparer les IPs** — l'IP de vérification SMTP ≠ l'IP d'envoi d'emails

**Anti-patterns :**
- ❌ Vérifier les 15 patterns en parallèle sur le même serveur mail
- ❌ Retry immédiatement après un timeout (backoff exponentiel obligatoire)
- ❌ Ignorer le greylisting (retry 1 fois après 30s pour les 450)
- ❌ Logger les détails complets du SMTP handshake (fuite de données)

### Protection IP

| Mesure | Implémentation |
|--------|---------------|
| **Throttle par domaine MX** | Max 3 vérifications/minute sur le même serveur mail |
| **Throttle global** | Max 5 vérifications/seconde toutes destinations confondues |
| **Circuit breaker** | Si 3 timeouts consécutifs sur un domaine → skip ce domaine 1h |
| **Monitoring blacklist** | Vérifier l'IP de Reacher sur Spamhaus/Barracuda chaque semaine |
| **IP dédiée** | Reacher dans un container Docker avec son propre réseau |

---

## 3. APIs Publiques — Edge Cases

### INSEE SIRENE

| Edge Case | Description | Mitigation |
|-----------|-------------|------------|
| **SIREN fermé** | L'entreprise est radiée mais le SIREN existe encore | Vérifier `etatAdministratifUniteLegale === 'C'` (cessée) |
| **Non-diffusible** | Certaines entreprises ont le statut non-diffusible (auto-entrepreneurs) | API retourne une erreur 403 → flag `non_diffusible: true` |
| **SIREN multiple** | Certains groupes ont plusieurs SIREN pour des entités différentes | Chercher par SIRET (établissement) plutôt que SIREN (entreprise) |
| **Changement NAF 2025→2027** | L'INSEE migre vers la nouvelle nomenclature NAF Rév. 3 | Mapper les anciens codes vers les nouveaux quand la migration arrive |
| **Rate limit atteint** | 30 req/min — header `429 Too Many Requests` | Retry après `Retry-After` header + queue BullMQ avec rate limiter |
| **API instable** (signalé fin fév 2026) | Opendatasoft a arrêté les mises à jour | Utiliser l'API INSEE directe, PAS l'API Opendatasoft pour SIRENE |

**Bonne pratique :** Toujours utiliser `api.insee.fr` directement, pas les wrappers tiers qui peuvent avoir des interruptions.

### BODACC

| Edge Case | Description | Mitigation |
|-----------|-------------|------------|
| **Annonce en double** | Le même événement publié dans deux éditions | Déduplication par `numéro d'annonce` + `registre` |
| **SIREN mal formaté dans le registre** | Espaces, tirets dans le numéro RCS | Normaliser : `"443 061 841 RCS Paris"` → extraire `443061841` |
| **Annonce de procédure collective** | L'entreprise est en difficulté | **Disqualifier immédiatement** le prospect (score = 0) |
| **Annonce ancienne** | Des annonces de 2010 apparaissent dans les résultats | Filtrer par date : ne garder que les annonces < 2 ans |

**Bonne pratique :** Utiliser l'API `bodacc.fr` directe (pas Opendatasoft).

**Anti-pattern :** ❌ Ne pas vérifier BODACC avant d'envoyer un email à un prospect → risque d'envoyer un email de prospection à une entreprise en liquidation judiciaire.

### INPI / RNE

| Edge Case | Description | Mitigation |
|-----------|-------------|------------|
| **Comptes confidentiels** | PME ayant activé la confidentialité des comptes | `financials: null` + flag `confidential: true` |
| **Données manquantes (micro-entreprises)** | Pas d'obligation de dépôt | Enrichissement partiel, score adaptatif |
| **API lente** (1-5s par requête) | L'INPI n'est pas optimisée pour les requêtes en masse | Timeout 10s + cache Redis 7 jours |
| **Maintenance fréquente** | Downtimes planifiés sans préavis clair | Circuit breaker + graceful degradation |
| **Format de date variable** | `"1975-03"` vs `"1975-03-15"` vs `"15/03/1975"` | Parser flexible : `dayjs(date, ['YYYY-MM-DD', 'YYYY-MM', 'DD/MM/YYYY'])` |
| **Dirigeant homonyme** | Deux "Jean Dupont" dans la même entreprise | Utiliser la fonction en plus du nom pour identifier |
| **Documentation API v4.0** | Changement depuis juin 2025 | Pin les endpoints utilisés, tester régulièrement |

---

## 4. Sécurité — Bonnes pratiques transversales

### SSRF Prevention (CRITIQUE pour tous les adapters HTTP)

```typescript
// OBLIGATOIRE dans chaque adapter qui fait des requêtes HTTP
const ALLOWED_DOMAINS = new Set([
  'api.insee.fr',
  'bodacc-datadila.opendatasoft.com',
  'www.bodacc.fr',
  'data.inpi.fr',
  'recherche-entreprises.api.gouv.fr',
  'www.boamp.fr',
  // Reacher est en interne, pas besoin de whitelist
]);

function validateExternalUrl(url: string): void {
  const parsed = new URL(url);

  // Bloquer les IPs privées (SSRF)
  if (/^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|::1|localhost)/i
      .test(parsed.hostname)) {
    throw new Error(`SSRF blocked: private IP ${parsed.hostname}`);
  }

  // Whitelist de domaines
  if (!ALLOWED_DOMAINS.has(parsed.hostname)) {
    throw new Error(`Domain not in allowlist: ${parsed.hostname}`);
  }
}
```

**Anti-pattern :** ❌ Ne JAMAIS passer un input utilisateur directement dans une URL axios sans validation.

### Input Validation (emails)

```typescript
// Validation STRICTE avant d'envoyer à Reacher
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function validateEmailInput(email: string): void {
  if (!EMAIL_REGEX.test(email)) {
    throw new Error('Invalid email format');
  }

  const domain = email.split('@')[1];

  // Bloquer les domaines internes
  if (['localhost', '127.0.0.1', 'internal', 'local'].some(d => domain.includes(d))) {
    throw new Error(`SSRF blocked: internal domain ${domain}`);
  }

  // Bloquer les IPs comme domaine
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) {
    throw new Error('IP addresses not allowed as email domain');
  }
}
```

### Rate Limiting des adapters

```typescript
// Chaque adapter doit avoir son propre rate limiter
// basé sur les limites documentées de l'API cible

// INSEE: 30 req/min
const inseeRateLimiter = new RateLimiter({ maxRequests: 25, perMilliseconds: 60_000 });

// BODACC: pas de limite documentée → être conservateur
const bodaccRateLimiter = new RateLimiter({ maxRequests: 10, perMilliseconds: 60_000 });

// INPI: pas de limite documentée → être très conservateur
const inpiRateLimiter = new RateLimiter({ maxRequests: 5, perMilliseconds: 60_000 });

// Reacher: configurable
const reacherRateLimiter = new RateLimiter({ maxRequests: 5, perMilliseconds: 1_000 });
```

### Logging sécurisé (PII Redaction)

```typescript
// OBLIGATOIRE : ne jamais logger d'emails complets ou de noms
// La config Pino a déjà 12 paths de redaction

// AJOUTER ces paths pour les nouveaux adapters :
const ADDITIONAL_REDACTION_PATHS = [
  'email',           // Email du prospect
  'firstName',       // Prénom
  'lastName',        // Nom
  'phone',           // Téléphone
  'directors[*].firstName',
  'directors[*].lastName',
  'directors[*].birthDate',
  'beneficialOwners[*].firstName',
  'beneficialOwners[*].lastName',
];
```

**Anti-pattern :** ❌ Logger `{ msg: 'Email found', email: 'jean.dupont@company.fr' }` → RGPD violation.
**Bonne pratique :** ✅ Logger `{ msg: 'Email found', domain: 'company.fr', confidence: 99 }`.

### Cache Redis — Stratégie

| Donnée | TTL | Justification |
|--------|:---:|---------------|
| Résultat email `safe` | 7 jours | Les emails ne changent pas souvent |
| Résultat email `invalid` | 7 jours | Idem |
| Résultat email `unknown/risky` | 24h | Pourrait changer (serveur temporairement down) |
| Données INSEE | 24h | Les données évoluent rarement |
| Données BODACC | 7 jours | Les annonces légales sont permanentes |
| Données INPI | 7 jours | Les comptes annuels changent 1x/an |
| Résultat complet enrichissement | 24h | Agrégation de toutes les sources |

**Anti-pattern :** ❌ Cache sans TTL (données périmées éternellement).
**Anti-pattern :** ❌ Cache sans invalidation (si un prospect change d'entreprise, l'ancien résultat persiste).

---

## 5. Résilience — Patterns obligatoires

### Circuit Breaker

```typescript
// Chaque adapter externe DOIT implémenter un circuit breaker
//
// CLOSED (normal) → Si 5 erreurs consécutives → OPEN
// OPEN (bypass) → Après 60s → HALF-OPEN
// HALF-OPEN (test) → Si 1 succès → CLOSED, Si 1 erreur → OPEN

interface CircuitBreakerConfig {
  failureThreshold: number;   // 5
  resetTimeout: number;       // 60_000 ms
  halfOpenRequests: number;   // 1
}
```

### Graceful Degradation

```
Enrichissement complet (toutes les APIs répondent):
├── INSEE ✅ → identité, adresse, NAF, effectif
├── INPI ✅ → dirigeants, comptes
├── BODACC ✅ → annonces légales
└── Score: complet (4 axes)

Enrichissement partiel (INPI down):
├── INSEE ✅ → identité, adresse, NAF, effectif
├── INPI ❌ → flag "inpi_unavailable"
├── BODACC ✅ → annonces légales
└── Score: adapté (3 axes, repondération)

Enrichissement minimal (INSEE + INPI down):
├── INSEE ❌ → fallback Annuaire Entreprises
├── INPI ❌ → flag "inpi_unavailable"
├── BODACC ✅ → annonces légales
└── Score: dégradé (2 axes, flag "partial_enrichment")
```

**Anti-pattern :** ❌ Bloquer tout le pipeline si une seule API est down.
**Bonne pratique :** ✅ Toujours retourner un résultat partiel avec des flags explicites sur ce qui manque.

---

## 6. Tests — Matrice de couverture

### Tests unitaires obligatoires

| Composant | Tests critiques |
|-----------|----------------|
| Pattern Generator | Accents, noms composés, caractères spéciaux, tri par taille entreprise |
| Reacher Adapter | Mapping réponse, calcul confiance, timeout, retry, circuit breaker |
| BODACC Adapter | Parsing annonces, détection procédures, déduplication, SIREN normalization |
| INPI Adapter | Parsing dirigeants, comptes confidentiels, date formats, auth renewal |
| Email Finder | Waterfall complet, early termination, catch-all, cache hit/miss |
| Company Enricher | Agrégation, fallback, graceful degradation, cache |
| URL Validation | SSRF blocked, whitelist, private IPs |
| Email Validation | Format invalide, domaines internes, IPs comme domaine |

### Tests d'intégration obligatoires

| Test | Condition préalable | Vérifie |
|------|-------------------|---------|
| Reacher verify real email | Container Reacher up | SMTP check fonctionne |
| INSEE lookup real SIREN | Token INSEE valide | Données retournées correctement |
| BODACC search real SIREN | API accessible | Annonces parsées correctement |
| Full enrichment pipeline | Tout up | Prospect enrichi de A à Z |
| Fallback quand INPI down | Mock INPI → 500 | Enrichissement partiel OK |
| Cache invalidation | Redis up | TTL respecté, refresh OK |

### Tests de sécurité obligatoires

| Test | Vérifie |
|------|---------|
| SSRF via email domain | `test@127.0.0.1` est bloqué |
| SSRF via adapter URL | URL absolue ne bypass pas le baseURL |
| PII dans les logs | Aucun email/nom/téléphone dans les logs |
| Rate limiting respecté | Les adapters ne dépassent pas les limites |
| Auth Redis | Connexion sans password = rejetée |
