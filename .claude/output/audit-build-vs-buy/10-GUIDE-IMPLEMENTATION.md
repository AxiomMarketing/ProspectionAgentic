# 10 — Guide d'Implémentation — Adapters DIY

## Vue d'ensemble des composants à développer

```
src/modules/agent-enrichisseur/
├── infrastructure/
│   ├── adapters/
│   │   ├── insee.adapter.ts                ← EXISTANT
│   │   ├── reacher.adapter.ts              ← À CRÉER
│   │   ├── bodacc.adapter.ts               ← À CRÉER
│   │   ├── inpi.adapter.ts                 ← À CRÉER
│   │   └── annuaire-entreprises.adapter.ts ← À CRÉER (backup)
│   └── services/
│       ├── email-finder.service.ts         ← À CRÉER (orchestrateur)
│       └── company-enricher.service.ts     ← À CRÉER (orchestrateur)
├── domain/
│   └── services/
│       └── email-pattern-generator.ts      ← À CRÉER
```

---

## 1. Email Pattern Generator

**Fichier :** `src/modules/agent-enrichisseur/domain/services/email-pattern-generator.ts`
**Temps estimé :** 2h
**Dépendances :** Aucune

### Spécification

Entrée : `firstName`, `lastName`, `domain`
Sortie : Liste ordonnée de permutations email (les plus probables en premier)

### Patterns à implémenter (par ordre de probabilité)

```typescript
// 15 patterns couvrant 95%+ des conventions d'entreprise
const PATTERNS = [
  '{first}.{last}',       // jean.dupont@         (le plus courant global)
  '{first}',              // jean@                (PME < 50 salariés)
  '{f}{last}',            // jdupont@             (très courant)
  '{first}{last}',        // jeandupont@          (startups)
  '{f}.{last}',           // j.dupont@            (courant)
  '{last}.{first}',       // dupont.jean@         (finance/juridique)
  '{first}-{last}',       // jean-dupont@         (variante)
  '{first}_{last}',       // jean_dupont@         (rare mais existant)
  '{last}',               // dupont@              (très petites structures)
  '{first}.{l}',          // jean.d@              (rare)
  '{f}{l}',               // jd@                  (très petites structures)
  '{last}{first}',        // dupontjean@          (rare)
  '{first}.{last}1',      // jean.dupont1@        (doublon dans l'entreprise)
  '{f}.{l}',              // j.d@                 (très rare)
  '{last}{f}',            // dupontj@             (rare)
];
```

### Gestion des accents et caractères spéciaux

```typescript
// Normalisation obligatoire pour les noms français
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Supprimer les accents
    .replace(/[^a-z]/g, '');           // Garder uniquement a-z
}
// "Jérémie" → "jeremie"
// "François-Xavier" → "francoisxavier"
// "Éloïse" → "eloise"
```

### Optimisation par taille d'entreprise

```typescript
// Réordonner les patterns selon la taille de l'entreprise
function prioritizePatterns(employeeCount: number): string[] {
  if (employeeCount < 50) {
    // PME : prenom@ domine à 70%
    return ['{first}', '{first}.{last}', '{f}{last}', ...];
  }
  if (employeeCount > 1000) {
    // Grand groupe : prenom.nom@ domine à 48%
    return ['{first}.{last}', '{f}.{last}', '{f}{last}', ...];
  }
  // Moyen : garder l'ordre par défaut
  return PATTERNS;
}
```

---

## 2. Reacher Adapter

**Fichier :** `src/modules/agent-enrichisseur/infrastructure/adapters/reacher.adapter.ts`
**Temps estimé :** 4h
**Dépendances :** Docker container Reacher, HttpModule

### Interface (port)

```typescript
// src/common/ports/i-email-verifier.adapter.ts
export interface EmailVerificationResult {
  email: string;
  isReachable: 'safe' | 'risky' | 'invalid' | 'unknown';
  isDeliverable: boolean;
  isCatchAll: boolean;
  isDisposable: boolean;
  isRoleAccount: boolean;
  mxRecords: string[];
  smtpCanConnect: boolean;
  confidence: number;        // 0-100, calculé à partir des résultats
}

export abstract class IEmailVerifierAdapter {
  abstract verify(email: string): Promise<EmailVerificationResult>;
  abstract verifyBatch(emails: string[]): Promise<EmailVerificationResult[]>;
  abstract isAvailable(): Promise<boolean>;
}
```

### Implémentation

Points clés :
- Connexion HTTP au container Reacher local (`http://reacher:8080`)
- Throttling : max 5 requêtes parallèles (configurable via env)
- Timeout : 30s par vérification (certains serveurs sont lents)
- Retry avec backoff exponentiel
- Mapping du résultat Reacher vers le format interne
- Calcul du score de confiance :
  - `safe` + non catch-all → 99%
  - `safe` + catch-all → 60%
  - `risky` → 40%
  - `invalid` → 0%
  - `unknown` → 20%

### Variables d'environnement

```env
REACHER_URL=http://localhost:8080
REACHER_MAX_CONCURRENT=5
REACHER_TIMEOUT_MS=30000
```

---

## 3. Email Finder Service (Orchestrateur)

**Fichier :** `src/modules/agent-enrichisseur/infrastructure/services/email-finder.service.ts`
**Temps estimé :** 3h
**Dépendances :** Pattern Generator + Reacher Adapter

### Algorithme waterfall

```
Entrée: firstName, lastName, domain, employeeCount?
│
├─► 1. Générer les patterns (15 permutations ordonnées)
│
├─► 2. Pour chaque pattern (en séquentiel) :
│      ├─► Vérifier via Reacher
│      ├─► Si "safe" + non catch-all → STOP, retourner (confidence: 99%)
│      └─► Si "invalid" → pattern suivant
│
├─► 3. Si catch-all détecté :
│      └─► Retourner le pattern #1 avec confidence: 60%
│
├─► 4. Si aucun résultat :
│      └─► Retourner null avec confidence: 0%
│
Sortie: { email, confidence, source, verificationDetails }
```

### Optimisations

- **Early termination** — Dès qu'un email est `safe`, on arrête
- **Batch MX check** — Vérifier le domaine une seule fois avant de tester les patterns
- **Cache Redis** — Stocker les résultats de vérification (TTL 7 jours)
- **Catch-all pre-check** — Si le domaine est catch-all, tester d'abord un email aléatoire. Si `safe`, tous les patterns seront `safe` → retourner directement le pattern #1

---

## 4. BODACC Adapter

**Fichier :** `src/modules/agent-enrichisseur/infrastructure/adapters/bodacc.adapter.ts`
**Temps estimé :** 3h
**Dépendances :** HttpModule

### Interface (port)

```typescript
// src/common/ports/i-legal-notices.adapter.ts
export interface LegalNotice {
  type: 'creation' | 'modification' | 'procedure_collective' | 'cession' | 'radiation';
  publicationDate: Date;
  tribunal: string;
  content: string;
  registre: string;     // Numéro RCS
}

export abstract class ILegalNoticesAdapter {
  abstract getNoticesBySiren(siren: string): Promise<LegalNotice[]>;
  abstract getRecentCreations(since: Date, departement?: string): Promise<LegalNotice[]>;
  abstract hasCollectiveProcedure(siren: string): Promise<boolean>;
  abstract isAvailable(): Promise<boolean>;
}
```

### API BODACC utilisée

```
Base URL: https://bodacc-datadila.opendatasoft.com/api/v2/
Endpoint: /catalog/datasets/annonces-commerciales/records
Paramètres: where=registre like "{siren}"
Format: JSON
Auth: Aucune
```

### Intérêt pour le scoring

- **Procédure collective en cours** → Score = 0, prospect disqualifié
- **Création récente (< 6 mois)** → Signal positif pour certains segments
- **Changement de dirigeant** → Signal de changement = opportunité de contact
- **Cession** → Nouveau propriétaire = opportunité de contact

---

## 5. INPI/RNE Adapter

**Fichier :** `src/modules/agent-enrichisseur/infrastructure/adapters/inpi.adapter.ts`
**Temps estimé :** 4h
**Dépendances :** HttpModule, compte INPI (gratuit)

### Interface (port)

```typescript
// src/common/ports/i-company-registry.adapter.ts
export interface CompanyDirector {
  firstName: string;
  lastName: string;
  role: string;           // "Président", "Directeur Général", etc.
  birthDate?: string;     // Format YYYY-MM
  nationality?: string;
}

export interface CompanyFinancials {
  year: number;
  revenue?: number;       // CA en EUR
  netIncome?: number;     // Résultat net en EUR
  totalAssets?: number;   // Total bilan
  employeeCount?: number; // Effectif exact (si disponible)
}

export interface CompanyRegistryData {
  siren: string;
  directors: CompanyDirector[];
  beneficialOwners: CompanyDirector[];
  financials: CompanyFinancials[];  // Dernières années disponibles
  legalForm: string;
  capital?: number;
  registrationDate: Date;
}

export abstract class ICompanyRegistryAdapter {
  abstract getBySiren(siren: string): Promise<CompanyRegistryData | null>;
  abstract getDirectors(siren: string): Promise<CompanyDirector[]>;
  abstract getFinancials(siren: string): Promise<CompanyFinancials[]>;
  abstract isAvailable(): Promise<boolean>;
}
```

### Variables d'environnement

```env
INPI_API_URL=https://data.inpi.fr/api
INPI_USERNAME=your-email@domain.com
INPI_PASSWORD=your-password
```

---

## 6. Company Enricher Service (Orchestrateur données entreprise)

**Fichier :** `src/modules/agent-enrichisseur/infrastructure/services/company-enricher.service.ts`
**Temps estimé :** 3h
**Dépendances :** INSEE + BODACC + INPI Adapters

### Algorithme d'agrégation

```
Entrée: siren ou nom_entreprise
│
├─► 1. INSEE SIRENE (toujours)
│      → Identité, adresse, NAF, effectif (tranche)
│
├─► 2. INPI/RNE (en parallèle)
│      → Dirigeants, bénéficiaires, comptes annuels
│
├─► 3. BODACC (en parallèle)
│      → Annonces légales, procédures collectives
│
├─► 4. Annuaire Entreprises (fallback si INSEE down)
│      → Données agrégées de base
│
├─► 5. Fusion des résultats
│      → Prioriser : INSEE > INPI > BODACC > Annuaire
│      → Cache Redis (TTL 24h)
│
Sortie: CompanyProfile complet
```

### Gestion des erreurs

- Si INSEE down → utiliser Annuaire Entreprises en fallback
- Si INPI down → enrichissement partiel (données INSEE seules, flag `inpi_unavailable`)
- Si BODACC down → enrichissement partiel (pas d'annonces légales)
- Jamais de blocage total — graceful degradation

---

## 7. Docker — Ajout de Reacher

### docker-compose.dev.yml (ajout)

```yaml
reacher:
  image: reacherhq/backend:latest
  container_name: prospection-reacher-dev
  restart: unless-stopped
  ports:
    - "8080:8080"
  environment:
    - RCH__WORKER__THROTTLE__MAX_REQUESTS_PER_SECOND=5
    - RCH__WORKER__THROTTLE__MAX_REQUESTS_PER_DAY=500
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8080/"]
    interval: 30s
    timeout: 5s
    retries: 3
  networks:
    - prospection-dev-net
```

---

## 8. Tests

### Tests unitaires (par adapter)

| Adapter | Tests | Approche |
|---------|-------|----------|
| Email Pattern Generator | Patterns générés, normalisation accents, ordre par taille entreprise | Unit test pur |
| Reacher Adapter | Mapping réponse, calcul confiance, gestion timeout | Mock HTTP |
| BODACC Adapter | Parsing réponse, détection procédure collective | Mock HTTP |
| INPI Adapter | Parsing dirigeants, parsing financials | Mock HTTP |
| Email Finder Service | Waterfall complet, early termination, cache | Mock adapters |
| Company Enricher Service | Agrégation, fallback, graceful degradation | Mock adapters |

### Tests d'intégration

| Test | Quoi | Condition |
|------|------|-----------|
| Reacher live | Vérifier un email connu | Container Reacher up |
| INSEE live | Lookup SIREN connu | Token INSEE valide |
| BODACC live | Recherche annonces SIREN connu | API accessible |
| Full pipeline | Enrichir un prospect réel | Tous les services up |
