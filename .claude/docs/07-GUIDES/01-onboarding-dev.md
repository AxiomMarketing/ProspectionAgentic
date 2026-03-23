# Onboarding Développeur — Axiom

> **Public** : Nouveaux développeurs rejoignant le projet Axiom
> **Durée estimée** : 2–4 heures pour l'installation, 1 journée pour être opérationnel
> **Dernière révision** : 2026-03-23

---

## Bienvenue dans Axiom

Axiom est un système multi-agent IA pour la prospection commerciale B2B. Il orchestre des agents intelligents qui identifient des prospects, les enrichissent, les scorent, et automatisent les séquences de contact — le tout en conformité avec le RGPD.

Ce guide vous amène de zéro à votre premier commit en production.

---

## Sommaire

1. [Prérequis](#prerequis)
2. [Installation locale étape par étape](#installation)
3. [Structure du projet](#structure)
4. [Glossaire](#glossaire)
5. [Premier travail : implémenter une règle de scoring](#premier-travail)
6. [Débogage](#debugging)
7. [Conventions d'équipe](#conventions)
8. [Liens utiles](#liens)

---

## 1. Prérequis {#prerequis}

### Versions requises

```bash
# Vérifier les versions installées
node --version     # Doit être >= 22.22.1
npm --version      # Doit être >= 10.x
docker --version   # Doit être >= 28.x
docker compose version  # Doit être >= 2.x (V2, pas V1)
git --version      # Doit être >= 2.40
```

### Installation de Node.js 22

```bash
# Via nvm (recommandé — permet de gérer plusieurs versions)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc  # ou ~/.zshrc

nvm install 22.22.1
nvm use 22.22.1
nvm alias default 22.22.1  # Version par défaut

# Vérifier
node --version  # v22.22.1
```

### Installation de Docker Desktop

```bash
# macOS : https://www.docker.com/products/docker-desktop/
# Linux (Ubuntu) :
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Vérifier
docker run hello-world
```

### Outils recommandés

```bash
# Éditeur : VS Code avec les extensions suivantes
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension prisma.prisma
code --install-extension ms-azuretools.vscode-docker
code --install-extension bradlc.vscode-tailwindcss  # Si frontend

# Client PostgreSQL (optionnel mais pratique)
# - TablePlus (macOS/Windows, payant mais essai gratuit)
# - DBeaver (cross-platform, open source)
# - pgAdmin (open source)

# Client Redis
# - RedisInsight (officiel, gratuit) : https://redis.com/redis-enterprise/redis-insight/
```

---

## 2. Installation locale étape par étape {#installation}

### Étape 1 : Cloner le dépôt

```bash
git clone git@github.com:org/axiom.git
cd axiom

# Vérifier que vous êtes sur la bonne branche
git branch  # main ou develop selon la politique d'équipe
```

### Étape 2 : Configurer les variables d'environnement

```bash
# Copier le template .env
cp .env.example .env

# Ouvrir .env et remplir les valeurs de développement
# Les valeurs de production sont gérées via Docker Secrets — ne JAMAIS les mettre ici
nano .env  # ou code .env, vim .env

# Champs à remplir obligatoirement pour le dev local :
# DB_PASSWORD=axiom_dev_password_local
# REDIS_PASSWORD=redis_dev_local
# JWT_SECRET=une_chaine_longue_de_64_chars_minimum_pour_le_dev_local
# ANTHROPIC_API_KEY=sk-ant-... (demander à votre lead)
# ENCRYPTION_KEY=32_octets_exactement_en_base64
# EMAIL_HMAC_KEY=32_octets_exactement_en_base64
```

### Étape 3 : Démarrer les services d'infrastructure

```bash
# Démarrer PostgreSQL, Redis, n8n (en développement)
docker compose -f docker-compose.dev.yml up -d postgres redis

# Vérifier que les services sont démarrés
docker compose -f docker-compose.dev.yml ps

# Logs des services
docker compose -f docker-compose.dev.yml logs -f postgres
```

### Étape 4 : Installer les dépendances Node.js

```bash
# Dans le répertoire racine
npm install

# Si monorepo (plusieurs packages)
npm install --workspaces
```

### Étape 5 : Initialiser la base de données

```bash
# Générer le client Prisma
npm run db:generate

# Appliquer les migrations
npm run db:migrate:dev
# Ou en réinitialisant complètement (dev uniquement) :
npm run db:reset

# Vérifier que les migrations ont été appliquées
npm run db:status
```

### Étape 6 : Alimenter la base de données avec des données de test

```bash
# Seed de données de développement (leads fictifs, utilisateurs de test)
npm run db:seed

# Données incluses dans le seed :
# - 1 tenant "Demo Company"
# - 2 utilisateurs : admin@demo.com / dev@demo.com (mot de passe : "password")
# - 500 leads fictifs avec profils variés
# - 3 séquences email d'exemple
# - Données de scoring historiques
```

### Étape 7 : Démarrer l'application

```bash
# Mode développement avec hot-reload
npm run start:dev

# Ou avec le debugger VS Code actif
npm run start:debug

# Dans un autre terminal : démarrer les workers BullMQ
npm run worker:dev

# Vérifier que tout fonctionne
curl http://localhost:3000/health
# Réponse attendue : {"status":"ok","database":"connected","redis":"connected"}
```

### Étape 8 : Vérifier l'installation

```bash
# Tests de santé
npm run test:health

# Test d'accès API
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"password"}'
# Doit retourner un access_token

# Accéder à l'interface n8n (si démarrée)
# http://localhost:5678 (user: admin@axiom.local / voir .env)

# Accéder à Bull Board (monitoring des queues)
# http://localhost:3000/admin/queues (nécessite JWT admin)
```

---

## 3. Structure du projet {#structure}

```
axiom/
├── .claude/                    # Documentation du projet (vous êtes ici)
│   └── docs/
│       ├── 00-INDEX.md
│       ├── 01-ARCHITECTURE/
│       ├── 04-SECURITE/
│       └── 07-GUIDES/
│
├── apps/
│   ├── api/                    # API NestJS principale
│   │   ├── src/
│   │   │   ├── agents/         # Modules des agents IA
│   │   │   │   ├── scoring/    # Agent de scoring ICP
│   │   │   │   ├── enrichment/ # Agent d'enrichissement
│   │   │   │   ├── email/      # Agent de génération d'emails
│   │   │   │   └── research/   # Agent de recherche d'entreprises
│   │   │   ├── auth/           # Authentification JWT
│   │   │   ├── leads/          # CRUD leads
│   │   │   ├── contacts/       # CRUD contacts
│   │   │   ├── companies/      # CRUD entreprises
│   │   │   ├── sequences/      # Séquences email
│   │   │   ├── queues/         # Configuration BullMQ
│   │   │   ├── common/         # Decorators, guards, interceptors partagés
│   │   │   └── main.ts         # Point d'entrée
│   │   ├── test/               # Tests e2e
│   │   └── Dockerfile
│   │
│   ├── worker/                 # Workers BullMQ (traitement async)
│   │   ├── src/
│   │   │   ├── processors/     # Processeurs par type de job
│   │   │   └── main.ts
│   │   └── Dockerfile
│   │
│   └── web/                    # Frontend Next.js (si applicable)
│
├── packages/
│   ├── database/               # Schéma Prisma + migrations
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── src/
│   │       ├── client.ts       # Export du client Prisma configuré
│   │       └── seed.ts         # Seed de données de test
│   │
│   ├── shared/                 # Types et utilitaires partagés
│   │   └── src/
│   │       ├── types/          # Types TypeScript partagés
│   │       ├── schemas/        # Schémas Zod partagés
│   │       └── constants/      # Constantes métier
│   │
│   └── security/               # Utilitaires de sécurité
│       └── src/
│           ├── prompt-sanitizer.ts
│           ├── pii-sanitizer.ts
│           └── blacklist.service.ts
│
├── infrastructure/
│   ├── docker-compose.yml          # Production
│   ├── docker-compose.dev.yml      # Développement
│   ├── docker-compose.test.yml     # Tests
│   ├── Caddyfile                   # Configuration Caddy
│   └── scripts/
│       ├── generate-secrets.sh
│       ├── rotate-api-key.sh
│       └── backup-db.sh
│
├── .env.example                # Template des variables d'env
├── .gitleaks.toml              # Configuration Gitleaks
├── package.json                # Root package.json (workspace)
└── tsconfig.base.json          # Config TypeScript de base
```

### Fichiers importants à connaître

```bash
# Configuration Prisma
packages/database/prisma/schema.prisma

# Configuration BullMQ (définition des queues)
apps/api/src/queues/queue.config.ts

# Définition des agents
apps/api/src/agents/*/agent.service.ts

# Module principal NestJS
apps/api/src/app.module.ts

# Configuration de l'application
apps/api/src/config/

# Tests
apps/api/test/           # Tests e2e
apps/api/src/**/*.spec.ts # Tests unitaires
```

---

## 4. Glossaire {#glossaire}

### Termes métier

| Terme | Définition |
|-------|-----------|
| **Lead** | Une entreprise ou un contact identifié comme prospect potentiel. Un lead a un cycle de vie : RAW → COLD / WARM → CONVERTED |
| **Contact** | La personne physique au sein d'une entreprise cible (DG, CTO, etc.) |
| **ICP** | Ideal Customer Profile — le profil type du client idéal défini par l'entreprise cliente |
| **Signal** | Un événement observable qui indique qu'une entreprise est dans un moment d'achat (ex: levée de fonds, recrutement d'un CTO, expansion géographique) |
| **Segment** | Regroupement de leads selon des critères communs (secteur, taille, technologie) |
| **Séquence** | Série d'actions automatisées dans le temps (ex: email J0, relance J+3, LinkedIn J+7) |
| **Score ICP** | Nombre de 0 à 100 indiquant à quel point un lead correspond au profil cible. 0 = hors cible, 100 = correspondance parfaite |
| **Enrichissement** | Processus d'ajout de données à un lead depuis des sources externes (LinkedIn, Clearbit, etc.) |
| **Blacklist** | Liste des emails/contacts qui ne doivent JAMAIS être recontactés (désinscriptions, demandes RGPD) |

### Termes techniques

| Terme | Définition |
|-------|-----------|
| **Agent** | Un service spécialisé qui utilise Claude pour accomplir une tâche spécifique (scoring, enrichissement, rédaction d'email). Chaque agent est un `@Injectable()` NestJS qui encapsule la logique de l'appel LLM |
| **Sub-agent** | Un agent invoqué par un autre agent (pattern d'orchestration). Ex: l'agent de recherche peut invoquer un sub-agent de parsing PDF |
| **Pipeline** | Séquence d'agents exécutés en ordre pour traiter un lead (recherche → enrichissement → scoring → génération email) |
| **Queue** | File d'attente BullMQ pour le traitement asynchrone. Chaque type de job a sa propre queue (scoring-queue, email-queue, enrichment-queue) |
| **Job** | Unité de travail dans une queue BullMQ. Un job contient les données nécessaires à son traitement et des métadonnées (attempts, priority, delay) |
| **Worker** | Processus qui consomme les jobs d'une queue et les exécute |
| **Tenant** | Instance isolée du système pour un client (multi-tenant). Chaque tenant a ses propres leads, séquences, et paramètres |
| **RLS** | Row Level Security — mécanisme PostgreSQL qui filtre automatiquement les données par tenant au niveau de la base de données |
| **DLQ** | Dead Letter Queue — queue de destination des jobs qui ont échoué après tous leurs retries |
| **Circuit Breaker** | Mécanisme qui coupe automatiquement les appels à un service externe défaillant pour éviter la propagation des erreurs |

### Termes des agents IA

| Terme | Définition |
|-------|-----------|
| **Prompt** | Instructions envoyées à Claude pour guider son comportement |
| **System prompt** | Instructions de contexte persistantes (le "rôle" de l'agent) |
| **Tool / Function calling** | Mécanisme permettant à Claude d'appeler des fonctions définies dans notre code |
| **Langfuse** | Plateforme d'observabilité des LLMs — trace chaque appel Claude avec les inputs, outputs, tokens, coûts |
| **Prompt caching** | Optimisation Anthropic qui met en cache les longs prompts système pour réduire les coûts |
| **Prompt injection** | Attaque où un contenu malveillant dans les données d'entrée tente de modifier le comportement de Claude |
| **Token** | Unité de texte traitée par Claude (~0.75 mot). Facturation à la fois pour les tokens d'entrée et de sortie |

---

## 5. Premier travail : implémenter une règle de scoring {#premier-travail}

Objectif : ajouter une règle de scoring qui donne un bonus de 10 points aux entreprises qui ont levé des fonds dans les 6 derniers mois.

### Étape 1 : Comprendre la structure du scoring agent

```bash
# Lire les fichiers du scoring agent
cat apps/api/src/agents/scoring/scoring.agent.service.ts
cat apps/api/src/agents/scoring/scoring.rules.ts
cat packages/shared/src/types/scoring.types.ts
```

### Étape 2 : Créer une branche de feature

```bash
# Convention de nommage : type/description-courte
git checkout -b feat/scoring-funding-signal
```

### Étape 3 : Implémenter la règle

```typescript
// apps/api/src/agents/scoring/scoring.rules.ts
// Ajouter dans le tableau SCORING_RULES existant :

import { ScoringRule, LeadWithSignals } from '@axiom/shared';

export const FUNDING_SIGNAL_RULE: ScoringRule = {
  id: 'funding_recent',
  name: 'Levée de fonds récente (< 6 mois)',
  description: 'Bonus si l\'entreprise a levé des fonds dans les 6 derniers mois',
  weight: 10,

  evaluate: (lead: LeadWithSignals): number => {
    const fundingSignal = lead.signals?.find(
      s => s.type === 'funding' && s.detectedAt > new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    );

    if (!fundingSignal) return 0;

    // Bonus gradué selon le montant de la levée
    if (fundingSignal.amount >= 10_000_000) return 10;  // Série A+ : bonus max
    if (fundingSignal.amount >= 1_000_000) return 7;    // Seed : bonus partiel
    return 5;                                            // Montant inconnu : bonus minimal
  },
};

// Dans le registre des règles
export const ALL_SCORING_RULES: ScoringRule[] = [
  // ... règles existantes ...
  FUNDING_SIGNAL_RULE,
];
```

### Étape 4 : Écrire le test unitaire

```typescript
// apps/api/src/agents/scoring/scoring.rules.spec.ts
describe('FUNDING_SIGNAL_RULE', () => {
  it('should return 0 when no funding signal', () => {
    const lead = createMockLead({ signals: [] });
    expect(FUNDING_SIGNAL_RULE.evaluate(lead)).toBe(0);
  });

  it('should return 10 for recent large funding', () => {
    const lead = createMockLead({
      signals: [{
        type: 'funding',
        amount: 15_000_000,
        detectedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 jours
      }],
    });
    expect(FUNDING_SIGNAL_RULE.evaluate(lead)).toBe(10);
  });

  it('should return 0 for funding older than 6 months', () => {
    const lead = createMockLead({
      signals: [{
        type: 'funding',
        amount: 15_000_000,
        detectedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // 200 jours
      }],
    });
    expect(FUNDING_SIGNAL_RULE.evaluate(lead)).toBe(0);
  });
});
```

### Étape 5 : Exécuter les tests

```bash
# Tests unitaires uniquement
npm run test -- --testPathPattern=scoring.rules

# Tous les tests du scoring module
npm run test -- --testPathPattern=agents/scoring
```

### Étape 6 : Commit et PR

```bash
git add apps/api/src/agents/scoring/scoring.rules.ts
git add apps/api/src/agents/scoring/scoring.rules.spec.ts

git commit -m "feat(scoring): add funding signal rule with 6-month window

- Add FUNDING_SIGNAL_RULE to scoring rules registry
- Graduated bonus: 10pts (Série A+), 7pts (Seed), 5pts (unknown amount)
- Add unit tests covering no signal, recent signal, and expired signal cases"

# Pousser et créer une PR
git push origin feat/scoring-funding-signal
# Ouvrir une PR sur GitHub — voir section Conventions
```

---

## 6. Débogage {#debugging}

### Tracer les appels Claude avec Langfuse

```bash
# Accéder à l'interface Langfuse
# Développement local : http://localhost:3001 (si self-hosted)
# Cloud : https://cloud.langfuse.com

# Ou via l'API Langfuse
curl -H "Authorization: Bearer $LANGFUSE_SECRET_KEY" \
  "https://cloud.langfuse.com/api/public/traces?limit=10"
```

```typescript
// Pour tracer manuellement un appel
import { Langfuse } from 'langfuse';

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
});

// Dans un agent
async analyzeCompany(companyId: string): Promise<Analysis> {
  const trace = langfuse.trace({
    name: 'company-analysis',
    input: { companyId },
    metadata: { agentVersion: '1.2.0' },
  });

  const span = trace.span({ name: 'claude-call' });

  const result = await this.anthropic.messages.create({
    model: 'claude-opus-4-5',
    messages: [{ role: 'user', content: prompt }],
  });

  span.end({
    output: result,
    usage: {
      input: result.usage.input_tokens,
      output: result.usage.output_tokens,
    },
  });

  trace.update({ output: parsedResult });
  await langfuse.flushAsync();

  return parsedResult;
}
```

### Monitorer les queues BullMQ avec Bull Board

```bash
# Accéder à Bull Board (nécessite un JWT admin)
# 1. Obtenir un token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"password"}' \
  | jq -r '.accessToken')

# 2. Ouvrir dans le navigateur
open "http://localhost:3000/admin/queues"
# Coller le token dans l'interface

# Ou via CLI
npx bullmq-cli --redis-host localhost --redis-port 6379 --redis-password $REDIS_PASSWORD \
  queues list
```

```typescript
// Dans le code : inspecter un job spécifique
const job = await this.scoringQueue.getJob(jobId);
console.log('Job state:', await job.getState());
console.log('Job data:', job.data);
console.log('Job opts:', job.opts);
console.log('Failed reason:', job.failedReason);
console.log('Stack trace:', job.stacktrace);
```

### Logs PostgreSQL

```bash
# Voir les logs PostgreSQL en temps réel
docker compose -f docker-compose.dev.yml logs -f postgres

# Requêtes lentes (> 1 seconde)
docker compose exec postgres psql -U postgres -d axiom_dev -c \
  "SELECT query, mean_exec_time, calls FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# Connexions actives
docker compose exec postgres psql -U postgres -d axiom_dev -c \
  "SELECT pid, usename, application_name, state, query FROM pg_stat_activity WHERE state = 'active';"

# Logs des requêtes (si log_statement = 'all' en dev)
docker compose exec postgres tail -f /var/log/postgresql/postgresql.log
```

### Debugger Node.js avec VS Code

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug API",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "restart": true,
      "localRoot": "${workspaceFolder}/apps/api",
      "remoteRoot": "/app"
    },
    {
      "name": "Debug Worker",
      "type": "node",
      "request": "attach",
      "port": 9230,
      "restart": true
    }
  ]
}
```

```bash
# Démarrer en mode debug
npm run start:debug  # Expose le port 9229

# Dans VS Code : F5 → "Debug API"
# Mettre un breakpoint dans le code → inspecter les variables
```

### Erreurs fréquentes et solutions

```bash
# Erreur : "Cannot connect to database"
# Solution : Vérifier que PostgreSQL est démarré
docker compose -f docker-compose.dev.yml ps postgres
docker compose -f docker-compose.dev.yml up -d postgres

# Erreur : "Redis connection refused"
# Solution :
docker compose -f docker-compose.dev.yml up -d redis

# Erreur : "Prisma client not generated"
# Solution :
npm run db:generate

# Erreur : "Migration failed"
# Solution : Réinitialiser la DB de dev (DANGER : perd les données de dev)
npm run db:reset

# Erreur : "Module not found"
# Solution :
npm install  # ou npm install --workspaces pour les monorepos

# Erreur : "Port 3000 already in use"
# Solution :
lsof -i :3000 | grep LISTEN
kill -9 <PID>

# Erreur JWT "invalid signature"
# Cause probable : JWT_SECRET différent entre api et worker
# Solution : Vérifier que les deux lisent le même .env
```

---

## 7. Conventions d'équipe {#conventions}

### Git — branches

```
main        → Production. Protection : review obligatoire, CI doit passer
develop     → Intégration. Base pour les features
feat/xxx    → Feature branch (depuis develop)
fix/xxx     → Bug fix (depuis develop ou main pour les hotfixes)
chore/xxx   → Tâches techniques, refactoring, mise à jour de dépendances
docs/xxx    → Documentation uniquement

Exemples :
feat/scoring-linkedin-signals
fix/blacklist-cache-invalidation
chore/update-nestjs-11.1.2
docs/add-agent-architecture-diagram
```

### Commits — Conventional Commits

```
Format : <type>(<scope>): <description>

Types :
  feat     → Nouvelle fonctionnalité
  fix      → Correction de bug
  chore    → Tâche technique (deps, config, scripts)
  docs     → Documentation uniquement
  test     → Ajout ou modification de tests
  refactor → Refactoring sans changement fonctionnel
  perf     → Amélioration de performances
  security → Correction de vulnérabilité

Scopes : scoring, enrichment, email, leads, auth, worker, queue, db, api

Exemples :
feat(scoring): add funding signal rule with 6-month window
fix(blacklist): invalidate Redis cache on contact erasure
security(deps): update nestjs to 11.1.2 (CVE-2025-54782)
chore(db): add index on leads.status for performance

RÈGLES :
- Description en anglais, minuscules, présent, pas de point final
- Corps du commit : pourquoi ce changement ? (pas le quoi)
- JAMAIS de secrets dans les messages de commit
- Référencer les tickets : "closes #123" en bas du corps
```

### Pull Requests

```
Checklist PR :
[ ] Tests unitaires ajoutés pour la logique métier
[ ] npm run test passe localement
[ ] npm run typecheck passe (zéro erreur TypeScript)
[ ] npm run lint passe
[ ] La description de la PR explique POURQUOI ce changement
[ ] Si nouveau endpoint : documentation OpenAPI à jour (@ApiProperty, @ApiOperation)
[ ] Si nouveau champ PII : checklist RGPD complétée (voir docs RGPD)
[ ] Si modification de sécurité : review demandée au RSSI

Taille des PRs :
- Idéalement < 400 lignes changées
- Si > 400 lignes : découper en PRs plus petites (feature flags si nécessaire)

Nommage : "[SCOPE] Description courte (#ticket)"
Exemple : "[Scoring] Add funding signal rule (#142)"
```

### Code review

```
Attentes du reviewer :
- Reviewer assigné : 1 reviewer minimum, 2 pour les changements critiques (sécurité, paiement)
- Délai de review : 24h ouvrées
- Approbation : 1 reviewer (2 pour les changements critiques)
- Le dernier reviewer à approuver peut merger (pas l'auteur)

Commentaires constructifs :
- "nit:" → Nitpick optionnel (le commentaire n'est pas bloquant)
- "question:" → Demande de clarification
- "blocking:" → Doit être résolu avant le merge
- Toujours suggérer une alternative quand on bloque quelque chose
```

---

## 8. Liens utiles {#liens}

### Documentation interne

```
.claude/docs/00-INDEX.md                    → Index de toute la documentation
.claude/docs/01-ARCHITECTURE/               → Architecture du système
.claude/docs/04-SECURITE/01-registre-cve.md → CVEs actives
.claude/docs/04-SECURITE/03-rgpd-conformite.md → Compliance RGPD
.claude/docs/07-GUIDES/02-bonnes-pratiques.md  → Patterns de code
.claude/docs/07-GUIDES/03-anti-patterns.md     → Ce qu'il ne faut JAMAIS faire
```

### Outils de développement local

| Outil | URL (dev local) | Credentials |
|-------|----------------|-------------|
| API NestJS | http://localhost:3000 | JWT (voir seed) |
| API Swagger | http://localhost:3000/api-docs | Pas de credentials |
| Bull Board | http://localhost:3000/admin/queues | JWT admin |
| n8n | http://localhost:5678 | admin@axiom.local / voir .env |
| Langfuse (si local) | http://localhost:3001 | voir .env |
| pgAdmin / TablePlus | localhost:5432 | axiom_app / voir .env |
| RedisInsight | localhost:6379 | voir .env |

### Liens externes importants

```
Documentation technique :
- NestJS : https://docs.nestjs.com/
- Prisma : https://www.prisma.io/docs/
- BullMQ : https://docs.bullmq.io/
- Anthropic (Claude API) : https://docs.anthropic.com/
- Zod : https://zod.dev/

Conformité :
- CNIL (RGPD) : https://www.cnil.fr/fr/rgpd-par-ou-commencer
- NVD (CVEs) : https://nvd.nist.gov/
- OWASP Top 10 : https://owasp.org/www-project-top-ten/

Sécurité :
- Langfuse Dashboard : https://cloud.langfuse.com (ou self-hosted)
- Sentry : https://sentry.io
- GitHub Security : https://github.com/org/axiom/security
```

### Contacts de l'équipe

```
Lead Technique        → Pour les questions d'architecture et les décisions techniques
DevOps / Infra Lead   → Pour les questions de déploiement et de production
RSSI                  → Pour les questions de sécurité et RGPD
DPO (Référent RGPD)   → Pour les questions de conformité
```

---

*Si quelque chose dans ce guide est incorrect ou manquant, ouvrez une PR sur la documentation. Garder cette documentation à jour est la responsabilité de toute l'équipe.*
