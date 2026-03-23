# CI/CD — GitHub Actions

## Vue d'ensemble

Pipeline CI/CD complet avec GitHub Actions. Chaque push déclenche les étapes de sécurité, tests, build et déploiement. Le déploiement en production est déclenché uniquement sur la branche `main` avec possibilité de rollback en 1 commande.

```
Push/PR → Security Audit → Tests → Build → Deploy Staging → Deploy Production
                                              (PR only)       (main only)
```

---

## Workflows GitHub Actions

### 1. Security Audit (sur chaque push)

```yaml
# .github/workflows/security.yml
name: Security Audit

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 6 * * 1'  # Lundi 6h — audit hebdomadaire

permissions:
  contents: read
  security-events: write  # Pour SARIF upload

jobs:
  # ─── Détection de secrets ─────────────────────────────────────────────
  gitleaks:
    name: Gitleaks Secret Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Historique complet

      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}
        with:
          config-path: .gitleaks.toml

  # ─── npm audit ────────────────────────────────────────────────────────
  npm-audit:
    name: npm Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22.22.1'
          cache: 'npm'

      - run: npm ci

      - name: Run npm audit
        run: |
          npm audit --audit-level=high --json > audit-report.json || true
          # Échouer si des vulnérabilités critiques ou high
          CRITICAL=$(cat audit-report.json | jq '.metadata.vulnerabilities.critical // 0')
          HIGH=$(cat audit-report.json | jq '.metadata.vulnerabilities.high // 0')
          echo "Critical: $CRITICAL, High: $HIGH"
          if [ "$CRITICAL" -gt 0 ] || [ "$HIGH" -gt 0 ]; then
            echo "FAIL: Critical or high vulnerabilities found"
            cat audit-report.json | jq '.vulnerabilities | to_entries[] | select(.value.severity == "critical" or .value.severity == "high") | .key'
            exit 1
          fi

      - name: Upload audit report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: npm-audit-report
          path: audit-report.json
          retention-days: 30

  # ─── Analyse statique (CodeQL) ────────────────────────────────────────
  codeql:
    name: CodeQL Analysis
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: github/codeql-action/init@v3
        with:
          languages: javascript, typescript
          queries: security-extended

      - uses: github/codeql-action/autobuild@v3

      - uses: github/codeql-action/analyze@v3
        with:
          category: '/language:typescript'

  # ─── Scan image Docker (Trivy) ────────────────────────────────────────
  trivy:
    name: Trivy Image Scan
    runs-on: ubuntu-latest
    needs: [npm-audit]  # Seulement si npm audit passe
    steps:
      - uses: actions/checkout@v4

      - name: Build image
        run: docker build --target production -t prospection-app:scan .

      - name: Run Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: prospection-app:scan
          format: sarif
          output: trivy-results.sarif
          severity: CRITICAL,HIGH
          exit-code: '1'
          ignore-unfixed: true

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: trivy-results.sarif

  # ─── Génération SBOM ──────────────────────────────────────────────────
  sbom:
    name: Generate SBOM
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Generate SBOM with Syft
        uses: anchore/sbom-action@v0
        with:
          image: prospection-app:latest
          format: spdx-json
          output-file: sbom.spdx.json

      - name: Upload SBOM
        uses: actions/upload-artifact@v4
        with:
          name: sbom-${{ github.sha }}
          path: sbom.spdx.json
          retention-days: 90
```

### .gitleaks.toml

```toml
# .gitleaks.toml
title = "ProspectionAgentic Gitleaks Config"

[extend]
useDefault = true

[[rules]]
description = "Anthropic API Key"
id = "anthropic-api-key"
regex = '''sk-ant-api[0-9a-zA-Z-_]{95}'''
tags = ["anthropic", "api"]

[[rules]]
description = "Langfuse Secret Key"
id = "langfuse-secret-key"
regex = '''sk-lf-[0-9a-f-]{36}'''
tags = ["langfuse"]

[allowlist]
description = "Global allow list"
regexes = [
  '''VOTRE_CLE_ICI''',
  '''your-.*-key''',
  '''GENERER_AVEC''',
]
paths = [
  '''.env.example''',
  '''\.md$''',
  '''tests?/.*''',
]
```

---

### 2. Tests et Build

```yaml
# .github/workflows/ci.yml
name: CI — Tests & Build

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main, develop]

jobs:
  # ─── Tests unitaires ──────────────────────────────────────────────────
  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22.22.1'
          cache: 'npm'

      - run: npm ci

      - name: Generate Prisma client
        run: npx prisma generate
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test

      - name: TypeScript check
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Unit tests with coverage
        run: npm run test:cov
        env:
          NODE_ENV: test

      - name: Check coverage thresholds
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | \
            jq '.total.lines.pct')
          echo "Line coverage: $COVERAGE%"
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "FAIL: Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          file: ./coverage/lcov.info
          token: ${{ secrets.CODECOV_TOKEN }}

  # ─── Tests d'intégration ──────────────────────────────────────────────
  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16.3-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: prospection_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7.4.3-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22.22.1'
          cache: 'npm'

      - run: npm ci

      - name: Setup test database
        run: |
          npx prisma migrate deploy
          npx prisma db seed
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/prospection_test

      - name: Run integration tests
        run: npm run test:integration
        env:
          NODE_ENV: test
          DATABASE_URL: postgresql://test:test@localhost:5432/prospection_test
          REDIS_URL: redis://localhost:6379
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY_TEST }}

  # ─── Build Docker ─────────────────────────────────────────────────────
  build:
    name: Build Docker Image
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]
    outputs:
      image-digest: ${{ steps.build.outputs.digest }}
      image-tag: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4

      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=sha,prefix=,format=short
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          target: production
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: true
          sbom: true
```

---

### 3. Déploiement

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  workflow_run:
    workflows: ['CI — Tests & Build']
    types: [completed]
    branches: [main, staging]

jobs:
  # ─── Déploiement Staging ──────────────────────────────────────────────
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    environment: staging
    if: >
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.head_branch == 'staging'
    steps:
      - uses: actions/checkout@v4

      - name: Get image tag
        id: tag
        run: echo "tag=sha-$(echo ${{ github.sha }} | head -c7)" >> $GITHUB_OUTPUT

      - name: Deploy to staging
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: deploy
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            set -euo pipefail
            cd /opt/prospection-agentic

            # Pull la nouvelle image
            export IMAGE_TAG=${{ steps.tag.outputs.tag }}
            docker pull ghcr.io/${{ github.repository }}:${IMAGE_TAG}

            # Appliquer les migrations
            docker run --rm \
              --env-file .env \
              --network prospection-agentic_prospection-net \
              ghcr.io/${{ github.repository }}:${IMAGE_TAG} \
              npx prisma migrate deploy

            # Redémarrer le service app
            IMAGE_TAG=${IMAGE_TAG} docker compose up -d app

            # Health check post-déploiement
            sleep 15
            curl -sf https://staging.votre-domaine.com/api/health || exit 1
            echo "Staging deployment successful: $IMAGE_TAG"

      - name: Notify Slack
        if: always()
        uses: slackapi/slack-github-action@v1.27.0
        with:
          payload: |
            {
              "text": "${{ job.status == 'success' && ':white_check_mark:' || ':x:' }} Staging deployed: ${{ steps.tag.outputs.tag }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}

  # ─── Déploiement Production ───────────────────────────────────────────
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://votre-domaine.com
    if: >
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.head_branch == 'main'
    concurrency:
      group: production-deploy
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4

      - name: Get image tag
        id: tag
        run: echo "tag=sha-$(echo ${{ github.sha }} | head -c7)" >> $GITHUB_OUTPUT

      - name: Create deployment
        id: deployment
        uses: chrnorm/deployment-action@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          environment: production
          description: "Deploy ${{ steps.tag.outputs.tag }}"

      - name: Deploy to production
        id: deploy
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.PROD_HOST }}
          username: deploy
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            set -euo pipefail
            cd /opt/prospection-agentic

            IMAGE_TAG=${{ steps.tag.outputs.tag }}
            CURRENT_TAG=$(docker compose images app --format json | jq -r '.[0].Tag // "unknown"')
            echo "Current: $CURRENT_TAG → New: $IMAGE_TAG"

            # Sauvegarder le tag courant pour rollback
            echo "$CURRENT_TAG" > /tmp/prev_image_tag

            # Pull la nouvelle image
            docker pull ghcr.io/${{ github.repository }}:${IMAGE_TAG}

            # Backup rapide pre-migration
            docker compose exec -T postgres pg_dump \
              -U prospection prospection_prod \
              | gzip > /backups/pre_deploy_$(date +%Y%m%d_%H%M%S).sql.gz

            # Migrations (avec timeout 5 min)
            timeout 300 docker run --rm \
              --env-file .env \
              --network prospection-agentic_prospection-net \
              ghcr.io/${{ github.repository }}:${IMAGE_TAG} \
              npx prisma migrate deploy

            # Blue-green: démarrer la nouvelle version
            export APP_IMAGE=ghcr.io/${{ github.repository }}:${IMAGE_TAG}
            docker compose up -d --no-deps app

            # Health check progressif
            for i in $(seq 1 12); do
              sleep 5
              STATUS=$(curl -sf https://votre-domaine.com/api/health \
                       -w "%{http_code}" -o /dev/null 2>/dev/null || echo "0")
              echo "Attempt $i/12: HTTP $STATUS"
              if [ "$STATUS" = "200" ]; then
                echo "SUCCESS: Health check passed"
                echo "$IMAGE_TAG" > /opt/prospection-agentic/.last-deployed-tag
                exit 0
              fi
            done

            # Rollback automatique si health check échoue
            echo "FAIL: Health check failed, rolling back to $CURRENT_TAG"
            export APP_IMAGE=ghcr.io/${{ github.repository }}:${CURRENT_TAG}
            docker compose up -d --no-deps app
            exit 1

      - name: Update deployment status (success)
        if: steps.deploy.outcome == 'success'
        uses: chrnorm/deployment-status@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          deployment-id: ${{ steps.deployment.outputs.deployment_id }}
          state: success
          environment-url: https://votre-domaine.com

      - name: Update deployment status (failure)
        if: steps.deploy.outcome == 'failure'
        uses: chrnorm/deployment-status@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          deployment-id: ${{ steps.deployment.outputs.deployment_id }}
          state: failure

      - name: Notify Slack
        if: always()
        uses: slackapi/slack-github-action@v1.27.0
        with:
          payload: |
            {
              "text": "${{ job.status == 'success' && ':rocket: Production deployed' || ':fire: Production deployment FAILED' }}: ${{ steps.tag.outputs.tag }} by ${{ github.actor }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## Gestion des Secrets GitHub Actions

### Secrets requis

```bash
# Settings → Secrets and variables → Actions

# Production
PROD_HOST          # IP ou hostname du VPS production
PROD_SSH_KEY       # Clé SSH privée pour l'utilisateur deploy
DATABASE_URL_PROD  # PostgreSQL URL production

# Staging
STAGING_HOST
STAGING_SSH_KEY

# Partagés
ANTHROPIC_API_KEY_TEST  # Clé API pour les tests d'intégration (limité)
SLACK_WEBHOOK_URL        # Notifications Slack
CODECOV_TOKEN            # Coverage reporting
GITLEAKS_LICENSE         # Si version payante Gitleaks
```

### Configurer les secrets via CLI

```bash
# Installer GitHub CLI
brew install gh
gh auth login

# Configurer les secrets
gh secret set PROD_HOST --body "IP_DU_VPS"
gh secret set PROD_SSH_KEY < ~/.ssh/deploy_key
gh secret set SLACK_WEBHOOK_URL --body "https://hooks.slack.com/..."

# Vérifier
gh secret list
```

---

## Migration de Base de Données en CI

### Stratégie de migration sûre

```typescript
// scripts/migrate-safe.ts
// Exécuté pendant le déploiement, AVANT le restart de l'app

import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

async function safeMigrate() {
  const prisma = new PrismaClient();

  try {
    // 1. Vérifier le statut actuel
    const status = execSync('npx prisma migrate status', {
      encoding: 'utf-8',
    });
    console.log('Migration status:', status);

    // 2. Détecter les migrations qui nécessitent un down-time
    const hasDangerousMigration = checkForDangerousOps(status);
    if (hasDangerousMigration) {
      console.warn('WARNING: Migration contains potentially dangerous operations');
      console.warn('Review before proceeding: DROP, ALTER COLUMN without DEFAULT');
    }

    // 3. Appliquer les migrations
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });

    // 4. Vérifier l'intégrité
    await prisma.$queryRaw`SELECT COUNT(*) FROM information_schema.tables
                           WHERE table_schema = 'prospection'`;

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration FAILED:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

function checkForDangerousOps(migrationContent: string): boolean {
  const dangerousPatterns = [
    /DROP\s+COLUMN/i,
    /DROP\s+TABLE/i,
    /ALTER\s+COLUMN.*NOT\s+NULL/i,
    /DROP\s+INDEX/i,
  ];
  return dangerousPatterns.some((p) => p.test(migrationContent));
}

safeMigrate();
```

---

## Rollback Manuel

```bash
#!/bin/bash
# infrastructure/scripts/rollback.sh
# Usage: ./rollback.sh [image-tag]

set -euo pipefail

cd /opt/prospection-agentic

ROLLBACK_TAG="${1:-}"

if [ -z "$ROLLBACK_TAG" ]; then
  if [ -f /tmp/prev_image_tag ]; then
    ROLLBACK_TAG=$(cat /tmp/prev_image_tag)
    echo "Rolling back to previous tag: $ROLLBACK_TAG"
  else
    echo "ERROR: No previous tag found. Provide tag explicitly: $0 <tag>"
    exit 1
  fi
fi

CURRENT_TAG=$(cat .last-deployed-tag 2>/dev/null || echo "unknown")
echo "Current: $CURRENT_TAG → Rollback to: $ROLLBACK_TAG"

# Confirmer
read -p "Proceed with rollback? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Rollback cancelled"
  exit 0
fi

# Rollback Prisma si nécessaire
# ATTENTION: Prisma ne supporte pas le rollback automatique
# Un rollback de migration doit être traité manuellement avec une migration forward
echo "NOTE: Database migrations are NOT automatically rolled back."
echo "If the new version had schema changes, create a forward migration."

# Redémarrer avec l'ancienne image
export APP_IMAGE=ghcr.io/votre-org/prospection-agentic:${ROLLBACK_TAG}
docker compose up -d --no-deps app

# Health check
sleep 15
if curl -sf https://votre-domaine.com/api/health; then
  echo "Rollback successful: now running $ROLLBACK_TAG"
  echo "$ROLLBACK_TAG" > .last-deployed-tag
else
  echo "CRITICAL: Rollback health check failed!"
  exit 1
fi
```

---

## Environnements

### Variables par environnement

```yaml
# .github/environments.yml (logique, pas de fichier réel)
# Configurer dans GitHub: Settings → Environments

environments:
  staging:
    url: https://staging.votre-domaine.com
    protection_rules:
      required_reviewers: 0
    secrets:
      - STAGING_HOST
      - STAGING_SSH_KEY
    variables:
      NODE_ENV: staging
      LOG_LEVEL: debug

  production:
    url: https://votre-domaine.com
    protection_rules:
      required_reviewers: 1  # Approbation manuelle requise
      wait_timer: 0
    deployment_branch_policy:
      protected_branches: true  # main uniquement
    secrets:
      - PROD_HOST
      - PROD_SSH_KEY
    variables:
      NODE_ENV: production
      LOG_LEVEL: info
```

### Script de validation pré-déploiement

```bash
#!/bin/bash
# infrastructure/scripts/pre-deploy-checks.sh
# Exécuté sur le serveur avant le déploiement

set -euo pipefail

echo "=== Pre-deployment checks ==="

# 1. Espace disque suffisant (>20% libre)
DISK_FREE=$(df /opt/prospection-agentic | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_FREE" -gt 80 ]; then
  echo "FAIL: Disk usage at ${DISK_FREE}%"
  exit 1
fi
echo "OK: Disk usage at ${DISK_FREE}%"

# 2. Mémoire suffisante (>1GB libre)
MEM_FREE=$(free -m | awk '/^Mem:/{print $7}')
if [ "$MEM_FREE" -lt 1024 ]; then
  echo "FAIL: Only ${MEM_FREE}MB free memory"
  exit 1
fi
echo "OK: ${MEM_FREE}MB free memory"

# 3. PostgreSQL accessible
docker compose exec -T postgres pg_isready -U prospection
echo "OK: PostgreSQL ready"

# 4. Redis accessible
docker compose exec -T redis redis-cli ping | grep -q PONG
echo "OK: Redis ready"

# 5. Aucun job BullMQ actif critique (attendre si nécessaire)
ACTIVE_JOBS=$(docker compose exec -T redis redis-cli \
  --no-auth-warning -a "$REDIS_PASSWORD" \
  eval "return #redis.call('keys', 'bull:*:active')" 0)
if [ "$ACTIVE_JOBS" -gt 0 ]; then
  echo "WARNING: $ACTIVE_JOBS active jobs, waiting 30s..."
  sleep 30
fi

echo "=== All pre-deployment checks passed ==="
```
