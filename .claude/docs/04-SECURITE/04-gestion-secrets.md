# Gestion des Secrets — Axiom

> **Statut** : Document opérationnel — respecter impérativement
> **Dernière révision** : 2026-03-23
> **Public** : Tous les développeurs et DevOps
> **Classification** : CONFIDENTIEL

---

## Règle d'or

> **Un secret ne doit JAMAIS apparaître dans le code source, les logs, les variables d'environnement Docker en clair, ou les messages de commit.**

Violation de cette règle = **incident de sécurité** déclenché immédiatement, rotation de tous les secrets concernés.

---

## Sommaire

1. [Stockage des secrets](#stockage)
2. [Calendrier de rotation](#rotation)
3. [Zero-trust par agent](#zero-trust)
4. [Template .env.example](#env-example)
5. [CI/CD — GitHub Secrets](#cicd)
6. [Détection de fuites — Gitleaks](#gitleaks)
7. [Masquage dans les logs — Pino](#pino-redact)
8. [Procédure de réponse à une fuite](#fuite)

---

## 1. Stockage des secrets {#stockage}

### Hiérarchie des méthodes (du plus sûr au moins sûr)

```
NIVEAU 1 — Vault (HashiCorp) ou AWS Secrets Manager
  → Pour les environnements haute sécurité / entreprise
  → Rotation automatique, audit trail, accès finement contrôlé

NIVEAU 2 — Docker Secrets
  → Pour nos déploiements Docker Compose / Swarm
  → Stockés sur disque chiffré, montés en /run/secrets/
  → JAMAIS dans les variables d'environnement Docker en clair

NIVEAU 3 — Variables d'environnement (fichier .env)
  → Uniquement pour le développement local
  → Le fichier .env est dans .gitignore — JAMAIS commité
  → En production : utiliser Docker Secrets ou un vault

NIVEAU 4 — Jamais acceptable
  → Hardcodé dans le code source
  → Dans docker-compose.yml en clair
  → Dans les logs
  → Dans les messages de commit ou descriptions de PR
```

### Configuration Docker Secrets

```yaml
# docker-compose.prod.yml
version: '3.9'

secrets:
  postgres_password:
    file: ./secrets/postgres_password.txt
  redis_password:
    file: ./secrets/redis_password.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt
  anthropic_api_key:
    file: ./secrets/anthropic_api_key.txt
  encryption_key:
    file: ./secrets/encryption_key.txt
  email_hmac_key:
    file: ./secrets/email_hmac_key.txt

services:
  nestjs-api:
    secrets:
      - postgres_password
      - redis_password
      - jwt_secret
      - anthropic_api_key
      - encryption_key
      - email_hmac_key
    environment:
      # Variables non-sensibles uniquement
      - NODE_ENV=production
      - PORT=3000
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=axiom_prod
      # PAS de DB_PASSWORD ici — utiliser le secret Docker
    # Les secrets sont disponibles dans /run/secrets/nom_secret

  postgres:
    secrets:
      - postgres_password
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
      # JAMAIS : POSTGRES_PASSWORD=mon_mot_de_passe_en_clair
```

```typescript
// Lecture des secrets Docker depuis Node.js
import { readFileSync } from 'fs';

function readDockerSecret(secretName: string): string {
  const secretPath = `/run/secrets/${secretName}`;
  const envFallback = process.env[secretName.toUpperCase()];

  // En production : lire depuis le fichier secret
  if (process.env.NODE_ENV === 'production') {
    try {
      return readFileSync(secretPath, 'utf-8').trim();
    } catch (e) {
      throw new Error(`Failed to read Docker secret '${secretName}': ${e}`);
    }
  }

  // En développement : fallback sur les variables d'environnement
  if (envFallback) return envFallback;

  throw new Error(
    `Secret '${secretName}' not found. ` +
    `In production: mount Docker secret at ${secretPath}. ` +
    `In development: set ${secretName.toUpperCase()} in .env`
  );
}

// config/secrets.config.ts
export const secrets = {
  postgresPassword: readDockerSecret('postgres_password'),
  redisPassword: readDockerSecret('redis_password'),
  jwtSecret: readDockerSecret('jwt_secret'),
  anthropicApiKey: readDockerSecret('anthropic_api_key'),
  encryptionKey: readDockerSecret('encryption_key'),
  emailHmacKey: readDockerSecret('email_hmac_key'),
} as const;

// Construction de l'URL de base de données avec le secret
export const databaseUrl = (
  `postgresql://axiom_app:${secrets.postgresPassword}` +
  `@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}` +
  `?sslmode=verify-full`
);
```

### Génération de secrets forts

```bash
#!/bin/bash
# scripts/generate-secrets.sh
# À exécuter UNE FOIS lors de l'installation initiale

set -e

SECRETS_DIR="./secrets"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

# Fonction de génération sécurisée
generate_secret() {
  local name="$1"
  local length="${2:-32}"  # 32 octets = 256 bits par défaut
  local file="$SECRETS_DIR/$name.txt"

  if [ -f "$file" ]; then
    echo "SKIP: $file already exists"
    return
  fi

  openssl rand -base64 "$length" | tr -d '\n' > "$file"
  chmod 600 "$file"
  echo "CREATED: $file"
}

generate_secret "postgres_password" 32
generate_secret "redis_password" 32
generate_secret "jwt_secret" 64        # JWT : plus long
generate_secret "jwt_refresh_secret" 64
generate_secret "encryption_key" 32    # AES-256 : exactement 32 octets
generate_secret "email_hmac_key" 32
generate_secret "n8n_encryption_key" 32
generate_secret "analytics_salt" 32
generate_secret "unsubscribe_jwt_secret" 32
generate_secret "webhook_secret" 32

echo ""
echo "Secrets generated in $SECRETS_DIR/"
echo "IMPORTANT: Add ./secrets/ to .gitignore if not already there"
echo "IMPORTANT: Back up these secrets securely (password manager or Vault)"
```

```bash
# .gitignore — OBLIGATOIRE
secrets/
.env
.env.local
.env.production
.env.*.local
*.key
*.pem
*.p12
*.pfx
```

---

## 2. Calendrier de rotation {#rotation}

### Tableau des rotations

| Secret | Fréquence | Méthode | Responsable | Dernier changement |
|--------|-----------|---------|-------------|-------------------|
| Clés API Anthropic | 90 jours | Portail Anthropic → Docker Secret | DevOps Lead | À compléter |
| JWT secret (access) | 180 jours | `generate-secrets.sh` | DevOps Lead | À compléter |
| JWT secret (refresh) | 180 jours | `generate-secrets.sh` | DevOps Lead | À compléter |
| Mot de passe PostgreSQL | 90 jours | `ALTER ROLE` + Docker Secret | DevOps Lead | À compléter |
| Mot de passe Redis | 90 jours | `CONFIG SET requirepass` + Docker Secret | DevOps Lead | À compléter |
| Clé de chiffrement DB | 12 mois | Procédure de re-chiffrement | RSSI + DevOps | À compléter |
| N8N_ENCRYPTION_KEY | 12 mois | Re-chiffrement credentials n8n | DevOps Lead | À compléter |
| Clé HMAC email | 12 mois | Re-calcul des hashes de blacklist | RSSI + DevOps | À compléter |
| Secrets GitHub Actions | 90 jours | GitHub UI | DevOps Lead | À compléter |
| Certificats TLS | Automatique | Let's Encrypt auto-renouvellement | Caddy | Automatique |

### Procédure de rotation des clés API (90 jours)

```bash
#!/bin/bash
# scripts/rotate-api-key.sh SERVICE_NAME
# Exemple : ./scripts/rotate-api-key.sh anthropic

SERVICE="$1"
SECRETS_DIR="./secrets"
BACKUP_DIR="./secrets/backup/$(date +%Y%m%d)"
NEW_SECRET_FILE="$SECRETS_DIR/${SERVICE}_api_key.txt"
BACKUP_FILE="$BACKUP_DIR/${SERVICE}_api_key.old.txt"

if [ -z "$SERVICE" ]; then
  echo "Usage: $0 <service_name>"
  exit 1
fi

# 1. Sauvegarder l'ancien secret (chiffré)
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cp "$NEW_SECRET_FILE" "$BACKUP_FILE"
gpg --symmetric --cipher-algo AES256 --compress-algo 0 \
    --output "${BACKUP_FILE}.gpg" "$BACKUP_FILE"
rm "$BACKUP_FILE"  # Supprimer le backup en clair
echo "Backup created: ${BACKUP_FILE}.gpg"

# 2. Instructions manuelles (la nouvelle clé doit être créée sur le portail du service)
echo ""
echo "MANUAL STEP REQUIRED:"
echo "1. Create a new API key for '$SERVICE' on the service portal"
echo "2. Copy the new key"
read -s -p "3. Paste the new API key here: " NEW_KEY
echo ""

# 3. Écrire la nouvelle clé
echo -n "$NEW_KEY" > "$NEW_SECRET_FILE"
chmod 600 "$NEW_SECRET_FILE"
echo "New key written to $NEW_SECRET_FILE"

# 4. Redémarrer les services qui utilisent cette clé
echo "Restarting services that use the $SERVICE API key..."
docker compose restart nestjs-api

# 5. Vérification
sleep 5
if docker compose exec nestjs-api node -e "
  const key = require('fs').readFileSync('/run/secrets/${SERVICE}_api_key', 'utf-8').trim();
  console.log('Key length:', key.length);
  process.exit(key.length > 20 ? 0 : 1);
" 2>/dev/null; then
  echo "SUCCESS: Service restarted with new API key"
else
  echo "FAILURE: Service did not start correctly — reverting"
  # Restaurer l'ancienne clé
  gpg --decrypt "${BACKUP_FILE}.gpg" > "$NEW_SECRET_FILE" 2>/dev/null
  docker compose restart nestjs-api
  exit 1
fi

# 6. Révoquer l'ANCIENNE clé sur le portail (action manuelle)
echo ""
echo "IMPORTANT: Don't forget to revoke the OLD API key on the $SERVICE portal!"
echo "The old key is backed up at: ${BACKUP_FILE}.gpg (encrypted)"
```

### Procédure de rotation du mot de passe PostgreSQL

```bash
#!/bin/bash
# scripts/rotate-postgres-password.sh

set -e

# Générer un nouveau mot de passe
NEW_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')

# Mettre à jour dans PostgreSQL
docker compose exec postgres psql -U postgres -c \
  "ALTER ROLE axiom_app PASSWORD '$NEW_PASSWORD';"

# Mettre à jour le secret Docker
echo -n "$NEW_PASSWORD" > ./secrets/postgres_password.txt
chmod 600 ./secrets/postgres_password.txt

# Redémarrer les services qui utilisent cette DB
docker compose restart nestjs-api

# Vérifier la connexion
sleep 5
docker compose exec nestjs-api node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  prisma.\$queryRaw\`SELECT 1\`.then(() => {
    console.log('DB connection OK with new password');
    process.exit(0);
  }).catch(e => {
    console.error('DB connection FAILED:', e.message);
    process.exit(1);
  });
"
```

---

## 3. Zero-trust par agent {#zero-trust}

Chaque agent IA et service ne doit avoir accès qu'aux secrets strictement nécessaires à son fonctionnement.

### Matrice des accès aux secrets

| Secret | API | Agent Scoring | Agent Email | Agent Enrichment | n8n | Worker |
|--------|-----|--------------|-------------|-----------------|-----|--------|
| postgres_password | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| redis_password | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| jwt_secret | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| anthropic_api_key | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |
| encryption_key | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ |
| smtp_password | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ |
| linkedin_cookie | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| n8n_encryption_key | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| metabase_secret | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

```yaml
# docker-compose.prod.yml — zero-trust par service
services:
  nestjs-api:
    secrets:
      - postgres_password
      - redis_password
      - jwt_secret
      - jwt_refresh_secret
      - encryption_key
      - email_hmac_key
    # INTERDIT : anthropic_api_key, smtp_password, linkedin_cookie

  agent-scoring:
    secrets:
      - postgres_password
      - redis_password
      - anthropic_api_key
      - encryption_key
    # INTERDIT : jwt_secret, smtp_password, n8n_encryption_key

  agent-email:
    secrets:
      - postgres_password
      - redis_password
      - anthropic_api_key
      - smtp_password
      - sendgrid_api_key
    # INTERDIT : jwt_secret, encryption_key, linkedin_cookie

  agent-enrichment:
    secrets:
      - postgres_password
      - redis_password
      - anthropic_api_key
      - encryption_key
      - linkedin_cookie      # Uniquement pour l'enrichissement
      - hunter_api_key
      - clearbit_api_key
    # INTERDIT : jwt_secret, smtp_password, n8n_encryption_key

  n8n:
    secrets:
      - postgres_password    # Pour la DB n8n
      - redis_password
      - n8n_encryption_key
    # INTERDIT : jwt_secret, anthropic_api_key (accédé via webhook NestJS)
```

```typescript
// Vérification au démarrage que le service a uniquement ses secrets requis
// bootstrap/secrets-check.ts
const REQUIRED_SECRETS: Record<string, string[]> = {
  'nestjs-api': ['postgres_password', 'redis_password', 'jwt_secret', 'encryption_key'],
  'agent-scoring': ['postgres_password', 'redis_password', 'anthropic_api_key'],
  'agent-email': ['postgres_password', 'redis_password', 'smtp_password'],
};

export async function checkRequiredSecrets(): Promise<void> {
  const serviceName = process.env.SERVICE_NAME ?? 'nestjs-api';
  const required = REQUIRED_SECRETS[serviceName] ?? [];

  for (const secretName of required) {
    const secretPath = `/run/secrets/${secretName}`;
    try {
      const content = readFileSync(secretPath, 'utf-8').trim();
      if (!content || content.length < 16) {
        throw new Error(`Secret '${secretName}' is too short (< 16 chars)`);
      }
    } catch (e) {
      throw new Error(
        `STARTUP FAILED: Required secret '${secretName}' not found. ` +
        `Mount Docker secret at ${secretPath}.`
      );
    }
  }

  console.log(`All ${required.length} required secrets loaded for ${serviceName}`);
}
```

---

## 4. Template .env.example {#env-example}

```bash
# .env.example — copier vers .env pour le développement local
# JAMAIS commiter le fichier .env réel

# ============================================================
# APPLICATION
# ============================================================
NODE_ENV=development
PORT=3000
SERVICE_NAME=nestjs-api

# ============================================================
# BASE DE DONNÉES (PostgreSQL)
# ============================================================
DB_HOST=localhost
DB_PORT=5432
DB_NAME=axiom_dev
DB_USER=axiom_app
DB_PASSWORD=CHANGE_ME_DEVELOPMENT_ONLY_NOT_FOR_PRODUCTION
# En production : utiliser Docker Secret postgres_password
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=disable

# ============================================================
# CACHE & QUEUES (Redis)
# ============================================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=CHANGE_ME_DEVELOPMENT_ONLY

# ============================================================
# AUTHENTIFICATION JWT
# ============================================================
# Générer avec : openssl rand -base64 64
JWT_SECRET=CHANGE_ME_MUST_BE_AT_LEAST_64_CHARS_LONG_MINIMUM_FOR_HS256
JWT_REFRESH_SECRET=CHANGE_ME_MUST_BE_DIFFERENT_FROM_JWT_SECRET
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# ============================================================
# CHIFFREMENT
# ============================================================
# Générer avec : openssl rand -base64 32
ENCRYPTION_KEY=CHANGE_ME_MUST_BE_EXACTLY_32_BYTES_FOR_AES256
EMAIL_HMAC_KEY=CHANGE_ME_USED_TO_HASH_EMAILS_FOR_BLACKLIST
ANALYTICS_SALT=CHANGE_ME_USED_FOR_PSEUDONYMIZATION
ERASURE_SALT=CHANGE_ME_USED_WHEN_ERASING_CONTACTS
UNSUBSCRIBE_JWT_SECRET=CHANGE_ME_FOR_UNSUBSCRIBE_TOKENS

# ============================================================
# APIs EXTERNES
# ============================================================
# Claude / Anthropic
ANTHROPIC_API_KEY=sk-ant-CHANGE_ME
ANTHROPIC_DEFAULT_MODEL=claude-opus-4-5
ANTHROPIC_FALLBACK_MODEL=claude-haiku-4-5

# Email (Brevo / SendGrid)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=CHANGE_ME
SMTP_PASSWORD=CHANGE_ME
SMTP_FROM_NAME=Axiom Prospection
SMTP_FROM_EMAIL=noreply@axiom.example.com

# Enrichissement
HUNTER_API_KEY=CHANGE_ME
CLEARBIT_API_KEY=CHANGE_ME
KASPR_API_KEY=CHANGE_ME_IF_USED  # Attention : risque RGPD (voir doc)

# ============================================================
# N8N
# ============================================================
N8N_ENCRYPTION_KEY=CHANGE_ME_MUST_BE_32_CHARS_FOR_N8N
N8N_JWT_SECRET=CHANGE_ME_FOR_N8N_AUTH
N8N_DB_PASSWORD=CHANGE_ME
N8N_WEBHOOK_SECRET=CHANGE_ME_USED_TO_VERIFY_WEBHOOK_SIGNATURES

# ============================================================
# OBSERVABILITÉ
# ============================================================
# Langfuse (tracing LLM)
LANGFUSE_PUBLIC_KEY=pk-lf-CHANGE_ME
LANGFUSE_SECRET_KEY=sk-lf-CHANGE_ME
LANGFUSE_HOST=https://cloud.langfuse.com  # Ou self-hosted

# Sentry (error tracking)
SENTRY_DSN=https://CHANGE_ME@o0.ingest.sentry.io/0

# ============================================================
# FRONTENDS / CORS
# ============================================================
CORS_ALLOWED_ORIGINS=http://localhost:3001,http://localhost:3002
APP_URL=http://localhost:3001

# ============================================================
# WEBHOOK (signatures)
# ============================================================
WEBHOOK_SECRET=CHANGE_ME_FOR_INCOMING_WEBHOOK_VERIFICATION

# ============================================================
# FEATURE FLAGS (non-sensibles)
# ============================================================
FEATURE_AI_SCORING=true
FEATURE_EMAIL_TRACKING=false  # Désactivé par défaut (RGPD opt-in)
FEATURE_LINKEDIN_SCRAPING=false

# ============================================================
# LIMITES ET TIMEOUTS
# ============================================================
MAX_LEADS_PER_IMPORT=5000
CLAUDE_MAX_TOKENS_PER_MINUTE=100000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## 5. CI/CD — GitHub Secrets {#cicd}

### Configuration des secrets dans GitHub

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production  # Environnement GitHub avec protection rules
    steps:
      - uses: actions/checkout@v4

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/org/axiom-api:${{ github.sha }}
          # JAMAIS passer des secrets comme build args
          # Les secrets sont injectés au runtime via Docker Secrets

      - name: Deploy to server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /app/axiom
            docker compose pull
            docker compose up -d --no-deps --no-recreate
            # Les secrets Docker sont déjà sur le serveur — pas dans la pipeline
```

### Secrets à configurer dans GitHub (Settings → Secrets → Actions)

```
Repository Secrets (disponibles dans tous les workflows) :
  DEPLOY_HOST          → IP ou DNS du serveur de production
  DEPLOY_USER          → Utilisateur SSH de déploiement
  DEPLOY_SSH_KEY       → Clé privée SSH (Ed25519 recommandé)
  REGISTRY_TOKEN       → Token pour GitHub Container Registry

Environment Secrets "production" (uniquement pour les déploiements sur main) :
  SENTRY_AUTH_TOKEN    → Pour les releases Sentry
  ANTHROPIC_API_KEY    → Pour les tests d'intégration (si nécessaire)

JAMAIS dans GitHub Secrets :
  - Clés de chiffrement de la DB (trop sensible — uniquement sur le serveur)
  - Clés JWT (uniquement sur le serveur)
  - Mots de passe de base de données (uniquement sur le serveur)
```

### Vérification : s'assurer que les secrets ne sont pas dans les logs CI

```yaml
# .github/workflows/security.yml
jobs:
  check-secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Historique complet pour Gitleaks

      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}  # Optionnel pour version pro

      - name: Check for hardcoded IPs
        run: |
          if grep -rE '([0-9]{1,3}\.){3}[0-9]{1,3}' --include='*.ts' --include='*.js' \
             --exclude-dir=node_modules . | grep -v '127.0.0.1\|0.0.0.0\|localhost'; then
            echo "WARNING: Hardcoded IP addresses found in source code"
            exit 1
          fi
```

---

## 6. Détection de fuites — Gitleaks {#gitleaks}

### Configuration Gitleaks

```toml
# .gitleaks.toml — configuration personnalisée pour Axiom
title = "Axiom Gitleaks Configuration"

[extend]
useDefault = true  # Inclure les règles Gitleaks par défaut

# Règles personnalisées pour les APIs utilisées par Axiom
[[rules]]
id = "anthropic-api-key"
description = "Anthropic Claude API Key"
regex = '''sk-ant-[a-zA-Z0-9\-_]{90,}'''
tags = ["anthropic", "api-key"]

[[rules]]
id = "brevo-api-key"
description = "Brevo (Sendinblue) API Key"
regex = '''xkeysib-[a-zA-Z0-9]{64}'''
tags = ["brevo", "email", "api-key"]

[[rules]]
id = "hunter-api-key"
description = "Hunter.io API Key"
regex = '''[a-f0-9]{40}'''  # Hunter keys are 40-char hex
tags = ["hunter", "api-key"]
# Note: cette regex peut générer des faux positifs sur les git SHAs
# Affiner selon le contexte

[[rules]]
id = "postgres-connection-string"
description = "PostgreSQL connection string with password"
regex = '''postgresql://[^:]+:[^@]{8,}@'''
tags = ["database", "credentials"]

[[rules]]
id = "jwt-secret"
description = "Potential JWT secret (long base64 string in config)"
regex = '''(jwt|JWT)[_-]?(secret|SECRET|key|KEY)\s*[=:]\s*["']?[A-Za-z0-9+/]{32,}'''
tags = ["jwt", "secret"]

# Chemins à ignorer
[allowlist]
paths = [
  ".gitleaks.toml",
  "docs/",
  ".claude/",
  "*.example",
  ".env.example",
  "test/fixtures/",
]

# Commits à ignorer (ex: commit de migration)
commits = []
```

```bash
#!/bin/bash
# scripts/security-scan.sh — à exécuter avant chaque commit ou en pre-push hook

echo "=== Running security scans ==="

# 1. Gitleaks — détection de secrets
echo "1. Scanning for secrets with Gitleaks..."
docker run --rm -v "$(pwd):/repo" \
  zricethezav/gitleaks:latest detect \
  --source=/repo \
  --config=/repo/.gitleaks.toml \
  --verbose \
  --redact \
  || { echo "FAIL: Secrets detected by Gitleaks"; exit 1; }

echo "   OK: No secrets detected"

# 2. npm audit
echo "2. Running npm audit..."
npm audit --audit-level=high || { echo "FAIL: High severity vulnerabilities found"; exit 1; }
echo "   OK: No high severity vulnerabilities"

# 3. Trivy
echo "3. Running Trivy filesystem scan..."
docker run --rm -v "$(pwd):/workspace" \
  aquasec/trivy:latest fs \
  --severity HIGH,CRITICAL \
  --exit-code 1 \
  /workspace \
  || { echo "FAIL: High/Critical CVEs found"; exit 1; }

echo "   OK: No critical CVEs in dependencies"

echo ""
echo "=== All security scans passed ==="
```

```bash
# Installation du hook pre-commit
# .git/hooks/pre-commit
#!/bin/bash
./scripts/security-scan.sh
```

---

## 7. Masquage dans les logs — Pino {#pino-redact}

```typescript
// config/logger.config.ts
import pino from 'pino';

// Chemins à masquer dans TOUS les logs
const REDACTED_PATHS = [
  // Credentials
  'password',
  'passwordHash',
  'passwordConfirmation',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'api_key',
  'secret',
  'secretKey',
  'private_key',
  'privateKey',

  // PII directes
  'email',
  'phone',
  'phoneNumber',
  'firstName',
  'lastName',
  'fullName',
  'ssn',
  'creditCard',

  // Headers HTTP sensibles
  'headers.authorization',
  'headers.cookie',
  'headers["x-api-key"]',

  // Corps de requêtes sensibles
  'body.password',
  'body.email',
  'body.phone',
  'body.token',
  'body.creditCard',

  // Résultats de requêtes DB
  'data.email',
  'data.phone',
  'data.password',
  'result.email',
  'result.accessToken',

  // Variables d'environnement (si loggées accidentellement)
  'env.JWT_SECRET',
  'env.ANTHROPIC_API_KEY',
  'env.DATABASE_URL',
];

export const logger = pino({
  name: process.env.SERVICE_NAME ?? 'axiom',
  level: process.env.LOG_LEVEL ?? 'info',

  redact: {
    paths: REDACTED_PATHS,
    censor: '[REDACTED]',
    remove: false,  // Laisser la clé mais remplacer la valeur
  },

  serializers: {
    // Sérialiser les erreurs de façon sécurisée
    err: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      // JAMAIS : req.headers.authorization, req.body
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },

  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
    },
  } : undefined,
});

// Interceptor NestJS qui utilise le logger sécurisé
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          logger.info({
            type: 'http.request',
            method: req.method,
            path: req.path,  // Pas req.url pour éviter de logger les query params sensibles
            statusCode: context.switchToHttp().getResponse().statusCode,
            duration: Date.now() - start,
            userId: req.user?.id,  // ID uniquement, pas les données personnelles
            tenantId: req.user?.tenantId,
            // JAMAIS : req.body, req.headers.authorization
          });
        },
        error: (error) => {
          logger.error({
            type: 'http.error',
            method: req.method,
            path: req.path,
            error: error.message,  // Message uniquement, pas le stack complet en prod
            statusCode: error.status ?? 500,
            duration: Date.now() - start,
          });
        },
      }),
    );
  }
}
```

---

## 8. Procédure de réponse à une fuite {#fuite}

### Détection d'une fuite

```
SIGNAUX D'ALERTE :
- Gitleaks détecte un secret dans un commit → Pre-push hook bloqué
- Alerte GitHub Secret Scanning (automatique pour les repos publics)
- Utilisation anormale d'une clé API (alertes Anthropic, SendGrid, etc.)
- Collaboration externe qui voit un secret dans un diff de PR
- Audit de sécurité qui découvre un secret dans les logs
```

### Procédure de réponse immédiate (les premières 30 minutes sont critiques)

```bash
#!/bin/bash
# PROCÉDURE D'URGENCE — FUITE DE SECRET
# Exécuter IMMÉDIATEMENT dès confirmation de la fuite

LEAKED_SECRET_TYPE="$1"  # Ex: anthropic_api_key, jwt_secret, postgres_password
DISCOVERED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "=== INCIDENT DE SÉCURITÉ : FUITE DE SECRET ==="
echo "Type de secret : $LEAKED_SECRET_TYPE"
echo "Heure de découverte : $DISCOVERED_AT"
echo ""

echo "ÉTAPE 1 : RÉVOQUER LE SECRET (immédiatement)"
case "$LEAKED_SECRET_TYPE" in
  "anthropic_api_key")
    echo "→ Aller sur https://console.anthropic.com → API Keys → Révoquer la clé"
    echo "→ Créer une nouvelle clé immédiatement"
    ;;
  "sendgrid_api_key"|"brevo_api_key")
    echo "→ Accéder au tableau de bord email → Révoquer la clé API"
    ;;
  "jwt_secret")
    echo "→ ATTENTION : Toutes les sessions actives seront invalidées"
    echo "→ Générer un nouveau secret : openssl rand -base64 64"
    echo "→ Redémarrer tous les services qui utilisent JWT"
    ;;
  "postgres_password")
    echo "→ Exécuter : docker compose exec postgres psql -U postgres -c \"ALTER ROLE axiom_app PASSWORD 'NOUVEAU_MOT_DE_PASSE';\""
    ;;
esac

echo ""
echo "ÉTAPE 2 : NETTOYER L'HISTORIQUE GIT (si le secret est dans un commit)"
echo "⚠️  CETTE OPÉRATION RÉÉCRIT L'HISTORIQUE — COORDONNER AVEC L'ÉQUIPE"
echo ""
echo "# Option A : Si le secret est dans le dernier commit uniquement"
echo "git commit --amend (remplacer par la valeur masquée)"
echo ""
echo "# Option B : Si le secret est dans un commit antérieur"
echo "git filter-repo --replace-text <(echo '$LEAKED_SECRET_TYPE==>REDACTED') --force"
echo "git push --force-with-lease origin main  # AVEC accord de l'équipe"
echo ""
echo "# Option C : Utiliser BFG Repo-Cleaner"
echo "java -jar bfg.jar --replace-text passwords.txt"
echo ""
echo "ÉTAPE 3 : VÉRIFIER LES ACCÈS DEPUIS LA FUITE"
echo "→ Consulter les logs d'accès Anthropic pour des appels suspects"
echo "→ Vérifier les logs PostgreSQL pour des connexions non autorisées"
echo "→ Auditer les logs Redis pour des accès inhabituels"
echo ""
echo "ÉTAPE 4 : DOCUMENTER L'INCIDENT"
echo "→ Créer un rapport d'incident : incidents/$(date +%Y%m%d)-$LEAKED_SECRET_TYPE-leak.md"
echo "→ Timeline, impact, mesures prises, actions préventives"
echo ""
echo "ÉTAPE 5 : NOTIFICATION RGPD (si des données personnelles ont pu être exposées)"
echo "→ Évaluer si la fuite a permis un accès à des données personnelles"
echo "→ Si oui : procédure de notification CNIL sous 72h (voir doc RGPD)"
```

### Post-mortem : analyse de la cause racine

```markdown
# Template Post-mortem — Fuite de Secret

**Date** : [DATE]
**Gravité** : [Critique / Haute / Moyenne]
**Secret exposé** : [Type de secret, PAS la valeur]

## Timeline

| Heure | Événement |
|-------|-----------|
| H+0   | Découverte de la fuite par [qui] |
| H+5   | Révocation du secret sur [service] |
| H+15  | Nouveau secret déployé |
| H+30  | Vérification : plus de trace d'accès malveillant |

## Cause racine

[Décrire comment le secret s'est retrouvé exposé]
- Commit accidentel ?
- .env commité ?
- Log qui affichait une variable d'env ?
- Secret dans un message d'erreur ?

## Impact

- [ ] Des données personnelles ont-elles pu être accédées ? [Oui / Non / Incertain]
- [ ] Des accès malveillants ont-ils été détectés ? [Oui / Non]
- [ ] Des services ont-ils été compromis ? [Oui / Non]

## Mesures correctives

1. [Mesure immédiate prise]
2. [Mesure préventive pour éviter la récidive]

## Amélioration du processus

[Comment améliorer les processus pour éviter ce type d'incident]
```

---

*La gestion des secrets est l'une des mesures de sécurité les plus critiques. Toute question sur ce document doit être adressée au RSSI. Toute violation de ces règles est un incident de sécurité.*
