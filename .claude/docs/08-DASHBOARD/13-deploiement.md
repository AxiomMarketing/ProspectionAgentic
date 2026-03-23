# Déploiement du Dashboard Axiom

## Table des matières

1. [Environnement de développement](#1-environnement-de-développement)
2. [Docker multi-stage build](#2-docker-multi-stage-build)
3. [Configuration nginx](#3-configuration-nginx)
4. [Docker Compose — intégration stack principale](#4-docker-compose--intégration-stack-principale)
5. [Variables d'environnement](#5-variables-denvironnement)
6. [Caddy reverse proxy](#6-caddy-reverse-proxy)
7. [CI/CD GitHub Actions](#7-cicd-github-actions)
8. [Preview deployments](#8-preview-deployments)
9. [Optimisations de performance](#9-optimisations-de-performance)
10. [Monitoring du dashboard](#10-monitoring-du-dashboard)
11. [Headers de sécurité](#11-headers-de-sécurité)
12. [Responsivité mobile](#12-responsivité-mobile)

---

## 1. Environnement de développement

### Création du projet

```bash
# Créer le projet Vite avec React + TypeScript
npm create vite@latest axiom-dashboard -- --template react-ts
cd axiom-dashboard

# Installer les dépendances principales
npm install \
  @tanstack/react-query \
  @tanstack/react-query-devtools \
  @tanstack/react-virtual \
  @tanstack/react-router \
  react-hook-form \
  zod \
  @hookform/resolvers \
  date-fns \
  recharts \
  clsx \
  tailwind-merge

# Installer shadcn/ui
npm install \
  class-variance-authority \
  @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-tooltip \
  @radix-ui/react-select \
  @radix-ui/react-tabs \
  lucide-react

# Installer Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Outils de développement
npm install -D \
  @types/node \
  eslint \
  @eslint/js \
  typescript-eslint \
  eslint-plugin-react-hooks \
  prettier \
  prettier-plugin-tailwindcss \
  vitest \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  jsdom \
  msw
```

### Configuration Vite avec proxy de développement

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    proxy: {
      // Toutes les requêtes /api/* sont proxifiées vers le backend NestJS local
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },

      // Proxy spécial pour SSE — désactive la bufferisation
      '/api/realtime': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        // Désactive la compression pour les SSE
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Accept-Encoding', 'identity');
          });
        },
      },
    },
  },

  build: {
    target: 'es2020',
    sourcemap: true, // Activé pour faciliter le debugging en production

    rollupOptions: {
      output: {
        // Code splitting manuel pour optimiser le chargement initial
        manualChunks: {
          // Chunk séparé pour React et ses dépendances (rarement mises à jour)
          'vendor-react': ['react', 'react-dom', 'react/jsx-runtime'],

          // Chunk séparé pour TanStack (mise à jour indépendante)
          'vendor-tanstack': [
            '@tanstack/react-query',
            '@tanstack/react-router',
            '@tanstack/react-virtual',
          ],

          // Chunk séparé pour les graphiques (lourd, chargé à la demande)
          'vendor-charts': ['recharts'],

          // Radix UI dans son propre chunk
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
          ],
        },
      },
    },

    // Avertissement si un chunk dépasse 500 KB
    chunkSizeWarningLimit: 500,
  },

  // Configuration Vitest
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

### Structure de projet recommandée

```
axiom-dashboard/
├── public/
│   ├── favicon.ico
│   └── robots.txt
├── src/
│   ├── components/           # Composants UI réutilisables
│   │   ├── ui/               # shadcn/ui components
│   │   └── dashboard/        # Composants spécifiques au dashboard
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Utilitaires non-React
│   ├── pages/                # Pages / routes
│   ├── services/             # Fonctions d'appel API
│   ├── stores/               # État global (si nécessaire)
│   ├── types/                # Types TypeScript partagés
│   ├── test/                 # Setup et utilitaires de test
│   ├── main.tsx
│   └── App.tsx
├── .env.development          # Variables locales (non commité)
├── .env.example              # Template des variables (commité)
├── Dockerfile
├── nginx.conf
├── docker-compose.yml
└── vite.config.ts
```

---

## 2. Docker multi-stage build

```dockerfile
# Dockerfile

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 : Builder
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copie les fichiers de dépendances en premier pour tirer parti du cache Docker
# (ne reconstruire le layer npm que si package.json change)
COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile

# Copie le reste du code source
COPY . .

# Les variables d'environnement VITE_* sont injectées au build time
# (voir section 5 pour la stratégie runtime vs build time)
ARG VITE_API_URL
ARG VITE_APP_VERSION
ARG VITE_SENTRY_DSN

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 : Production (nginx)
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

# Supprime la configuration nginx par défaut
RUN rm /etc/nginx/conf.d/default.conf

# Copie notre configuration nginx personnalisée
COPY nginx.conf /etc/nginx/conf.d/dashboard.conf

# Copie les assets buildés depuis le stage builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Script d'entrypoint pour l'injection des variables d'environnement au runtime
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
```

### Script d'entrypoint pour variables runtime

```bash
#!/bin/sh
# docker-entrypoint.sh
# Permet d'injecter des variables d'environnement au démarrage du conteneur
# pour les valeurs qui ne sont pas connues au build time (ex: URL d'API dynamique)

# Génère un fichier env.js qui sera chargé par index.html avant le bundle principal
cat > /usr/share/nginx/html/env.js << EOF
window.__ENV__ = {
  API_URL: "${RUNTIME_API_URL:-}",
  FEATURE_FLAGS: "${RUNTIME_FEATURE_FLAGS:-}",
};
EOF

exec "$@"
```

### Ajout dans index.html

```html
<!-- index.html -->
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Axiom Dashboard</title>
    <!-- Variables d'environnement injectées au runtime -->
    <script src="/env.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/main.js"></script>
  </body>
</html>
```

---

## 3. Configuration nginx

```nginx
# nginx.conf

server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # ─────────────────────────────────────────────────────────────
    # Compression
    # ─────────────────────────────────────────────────────────────
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/xml
        image/svg+xml
        font/woff2;

    # Brotli (si module ngx_brotli installé — recommandé pour production)
    # brotli on;
    # brotli_comp_level 6;
    # brotli_types text/plain text/css application/javascript application/json;

    # ─────────────────────────────────────────────────────────────
    # Cache des assets statiques
    # ─────────────────────────────────────────────────────────────

    # Assets avec hash dans le nom (ex: main-BxYzAbCd.js) — cache permanent
    location ~* \.(js|css|woff2|woff|ttf|png|jpg|svg|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # env.js — ne pas mettre en cache (contient les variables runtime)
    location = /env.js {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # index.html — pas de cache (contient les références aux assets hashés)
    location = /index.html {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # ─────────────────────────────────────────────────────────────
    # Proxy API → backend NestJS
    # ─────────────────────────────────────────────────────────────
    location /api/ {
        proxy_pass http://backend:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts généreux pour les requêtes longues
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # ─────────────────────────────────────────────────────────────
    # Proxy SSE → backend NestJS (configuration spéciale)
    # ─────────────────────────────────────────────────────────────
    location /api/realtime/ {
        proxy_pass http://backend:3000/realtime/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CRITIQUE : désactive le buffering nginx pour que les événements SSE
        # soient transmis immédiatement au client sans attendre un buffer plein
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header X-Accel-Buffering no;

        # Timeout très long pour les connexions SSE persistantes
        proxy_read_timeout 3600s;  # 1 heure
        proxy_send_timeout 3600s;

        # Maintien de la connexion
        proxy_set_header Connection '';
        chunked_transfer_encoding on;
    }

    # ─────────────────────────────────────────────────────────────
    # SPA routing — toutes les routes inconnues → index.html
    # ─────────────────────────────────────────────────────────────
    location / {
        try_files $uri $uri/ /index.html;
    }

    # ─────────────────────────────────────────────────────────────
    # Headers de sécurité (voir section 11 pour le détail)
    # ─────────────────────────────────────────────────────────────
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # CSP — voir section 11 pour la valeur complète avec iframe Metabase
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' wss:; frame-src https://metabase.axiom-marketing.fr;" always;

    # HSTS (activé seulement si le SSL est géré ici, pas par Caddy en amont)
    # add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
```

---

## 4. Docker Compose — intégration stack principale

```yaml
# docker-compose.yml (racine du projet — tous les services)
version: '3.9'

services:

  # ─────────────────────────────────────────────────────────────
  # Backend NestJS
  # ─────────────────────────────────────────────────────────────
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/axiom
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      FRONTEND_URL: https://dashboard.axiom-marketing.fr
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - axiom-internal

  # ─────────────────────────────────────────────────────────────
  # Dashboard React (ce fichier)
  # ─────────────────────────────────────────────────────────────
  dashboard:
    build:
      context: ./axiom-dashboard
      dockerfile: Dockerfile
      args:
        # Variables injectées au build time (connues lors du build CI)
        VITE_API_URL: /api
        VITE_APP_VERSION: ${APP_VERSION:-dev}
        VITE_SENTRY_DSN: ${SENTRY_DSN:-}
    environment:
      # Variables injectées au runtime via docker-entrypoint.sh
      # Utile si l'URL de l'API change selon l'environnement de déploiement
      RUNTIME_API_URL: ${RUNTIME_API_URL:-}
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - axiom-internal
      - axiom-external
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:80/"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ─────────────────────────────────────────────────────────────
  # PostgreSQL
  # ─────────────────────────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: axiom
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    networks:
      - axiom-internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─────────────────────────────────────────────────────────────
  # Redis (queues BullMQ + sessions)
  # ─────────────────────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: unless-stopped
    networks:
      - axiom-internal
    healthcheck:
      test: ["CMD", "redis-cli", "--auth", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─────────────────────────────────────────────────────────────
  # Caddy (reverse proxy + SSL automatique)
  # ─────────────────────────────────────────────────────────────
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"  # HTTP/3 (QUIC)
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - dashboard
      - backend
    restart: unless-stopped
    networks:
      - axiom-external
      - axiom-internal

volumes:
  postgres_data:
  redis_data:
  caddy_data:
  caddy_config:

networks:
  axiom-internal:
    driver: bridge
    internal: true   # Pas d'accès Internet direct depuis les services internes
  axiom-external:
    driver: bridge
```

---

## 5. Variables d'environnement

### Stratégie build time vs runtime

| Variable | Stratégie | Raison |
|---|---|---|
| `VITE_API_URL` | Build time | Connue au moment du build CI |
| `VITE_APP_VERSION` | Build time | Injectée par le pipeline |
| `VITE_SENTRY_DSN` | Build time | Identique pour tous les déploiements |
| URL d'API dynamique | Runtime via `window.__ENV__` | Peut varier selon l'environnement |

### Fichier `.env.example` (commité dans le repo)

```bash
# .env.example — template à copier en .env.development

# URL de l'API backend (sans slash final)
# En dev local, utiliser le proxy Vite — laisser vide ou /api
VITE_API_URL=

# Version de l'application (injectée automatiquement par le pipeline CI)
VITE_APP_VERSION=dev

# DSN Sentry pour le tracking d'erreurs (laisser vide pour désactiver)
VITE_SENTRY_DSN=

# ── Variables runtime (pour docker-entrypoint.sh) ──
RUNTIME_API_URL=
RUNTIME_FEATURE_FLAGS=
```

### Accès aux variables dans le code

```typescript
// src/lib/config.ts
// Fusionne les variables build time (import.meta.env) et runtime (window.__ENV__)

interface AppConfig {
  apiUrl: string;
  appVersion: string;
  sentryDsn: string | undefined;
}

// Déclaration TypeScript pour window.__ENV__
declare global {
  interface Window {
    __ENV__?: {
      API_URL?: string;
      FEATURE_FLAGS?: string;
    };
  }
}

export const config: AppConfig = {
  // Runtime override > build time
  apiUrl: window.__ENV__?.API_URL || import.meta.env.VITE_API_URL || '/api',
  appVersion: import.meta.env.VITE_APP_VERSION || 'unknown',
  sentryDsn: import.meta.env.VITE_SENTRY_DSN || undefined,
};
```

---

## 6. Caddy reverse proxy

### Caddyfile

```caddyfile
# Caddyfile
# SSL automatique via Let's Encrypt (ACME)

dashboard.axiom-marketing.fr {
    # Proxy vers le conteneur dashboard nginx
    reverse_proxy dashboard:80 {
        # Headers transmis au backend
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }

    # Compression Zstandard + Gzip (Caddy gère ça nativement)
    encode zstd gzip

    # Headers de sécurité supplémentaires (en complément de ceux nginx)
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        # Retire le header "Server" pour ne pas exposer la version nginx
        -Server
    }

    # Logs structurés
    log {
        output file /var/log/caddy/dashboard.log {
            roll_size 100mb
            roll_keep 5
        }
        format json
    }
}

# Sous-domaine API exposé directement (optionnel — si l'API est sur un sous-domaine séparé)
api.axiom-marketing.fr {
    reverse_proxy backend:3000 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }

    encode zstd gzip

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        -Server
    }
}
```

### Vérification de la configuration Caddy

```bash
# Valider la syntaxe du Caddyfile avant déploiement
docker run --rm -v $(pwd)/Caddyfile:/etc/caddy/Caddyfile caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile

# Recharger la configuration à chaud sans redémarrage
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## 7. CI/CD GitHub Actions

### Workflow principal

```yaml
# .github/workflows/dashboard.yml
name: Dashboard CI/CD

on:
  push:
    branches: [main, develop]
    paths:
      - 'axiom-dashboard/**'
      - '.github/workflows/dashboard.yml'
  pull_request:
    branches: [main, develop]
    paths:
      - 'axiom-dashboard/**'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}/axiom-dashboard

jobs:
  # ─────────────────────────────────────────────────────────────
  # 1. Lint et vérifications statiques
  # ─────────────────────────────────────────────────────────────
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./axiom-dashboard

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: axiom-dashboard/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: TypeScript check
        run: npm run typecheck

      - name: ESLint
        run: npm run lint

      - name: Prettier check
        run: npm run format:check

  # ─────────────────────────────────────────────────────────────
  # 2. Tests unitaires et d'intégration
  # ─────────────────────────────────────────────────────────────
  test:
    name: Tests
    runs-on: ubuntu-latest
    needs: lint
    defaults:
      run:
        working-directory: ./axiom-dashboard

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: axiom-dashboard/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          directory: ./axiom-dashboard/coverage
          flags: dashboard

  # ─────────────────────────────────────────────────────────────
  # 3. Build et push de l'image Docker
  # ─────────────────────────────────────────────────────────────
  build:
    name: Docker Build & Push
    runs-on: ubuntu-latest
    needs: [lint, test]
    permissions:
      contents: read
      packages: write
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
      image-digest: ${{ steps.build.outputs.digest }}

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=sha,prefix=sha-
            type=semver,pattern={{version}}
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        id: build
        uses: docker/build-push-action@v5
        with:
          context: ./axiom-dashboard
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            VITE_API_URL=/api
            VITE_APP_VERSION=${{ github.sha }}
            VITE_SENTRY_DSN=${{ secrets.SENTRY_DSN }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ─────────────────────────────────────────────────────────────
  # 4. Déploiement en production (uniquement sur main)
  # ─────────────────────────────────────────────────────────────
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment:
      name: production
      url: https://dashboard.axiom-marketing.fr

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/axiom
            # Pull la nouvelle image
            docker compose pull dashboard
            # Redémarrage avec zero-downtime (si configuré avec plusieurs replicas)
            docker compose up -d --no-deps dashboard
            # Nettoyage des anciennes images
            docker image prune -f

      - name: Notify deployment
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Dashboard deployed to production: ${{ needs.build.outputs.image-tag }}'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
        if: always()
```

### Scripts package.json

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx --report-unused-disable-directives --max-warnings 0",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "format": "prettier --write src",
    "format:check": "prettier --check src",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## 8. Preview deployments

Les pull requests génèrent automatiquement un environnement de prévisualisation avec une URL unique.

```yaml
# .github/workflows/dashboard-preview.yml
name: Dashboard Preview

on:
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - 'axiom-dashboard/**'

jobs:
  deploy-preview:
    name: Deploy Preview
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build preview image
        uses: docker/build-push-action@v5
        with:
          context: ./axiom-dashboard
          push: true
          tags: ghcr.io/${{ github.repository }}/axiom-dashboard:pr-${{ github.event.pull_request.number }}
          build-args: |
            VITE_API_URL=/api
            VITE_APP_VERSION=pr-${{ github.event.pull_request.number }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Deploy preview via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          envs: PR_NUMBER
          script: |
            # Démarre un conteneur de preview sur un port unique
            PORT=$((9000 + $PR_NUMBER))
            docker pull ghcr.io/${{ github.repository }}/axiom-dashboard:pr-$PR_NUMBER
            docker rm -f dashboard-pr-$PR_NUMBER 2>/dev/null || true
            docker run -d \
              --name dashboard-pr-$PR_NUMBER \
              -p $PORT:80 \
              --label "traefik.enable=true" \
              --label "traefik.http.routers.pr-$PR_NUMBER.rule=Host(\`pr-$PR_NUMBER.preview.axiom-marketing.fr\`)" \
              ghcr.io/${{ github.repository }}/axiom-dashboard:pr-$PR_NUMBER
        env:
          PR_NUMBER: ${{ github.event.pull_request.number }}

      - name: Comment PR with preview URL
        uses: actions/github-script@v7
        with:
          script: |
            const prNumber = context.payload.pull_request.number;
            const previewUrl = `https://pr-${prNumber}.preview.axiom-marketing.fr`;
            github.rest.issues.createComment({
              issue_number: prNumber,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `Preview deployment ready: [${previewUrl}](${previewUrl})\n\nBuilt from commit ${context.sha.slice(0, 7)}`
            });

  # Nettoie les previews quand la PR est fermée
  cleanup-preview:
    name: Cleanup Preview
    runs-on: ubuntu-latest
    if: github.event.action == 'closed'

    steps:
      - name: Remove preview deployment
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          envs: PR_NUMBER
          script: |
            docker rm -f dashboard-pr-$PR_NUMBER 2>/dev/null || true
            docker rmi ghcr.io/${{ github.repository }}/axiom-dashboard:pr-$PR_NUMBER 2>/dev/null || true
        env:
          PR_NUMBER: ${{ github.event.pull_request.number }}
```

---

## 9. Optimisations de performance

### Analyse du bundle

```bash
# Générer un rapport visuel du bundle
npm install -D rollup-plugin-visualizer

# vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

plugins: [
  react(),
  visualizer({
    filename: 'dist/bundle-stats.html',
    open: true,
    gzipSize: true,
    brotliSize: true,
  }),
]
```

### Lazy loading des pages

```typescript
// src/App.tsx — chargement différé des pages non critiques
import { lazy, Suspense } from 'react';
import { Route, Routes } from '@tanstack/react-router';

// Chargées immédiatement (page principale)
import { DashboardPage } from './pages/DashboardPage';

// Chargées à la demande
const AgentDetailPage = lazy(() => import('./pages/AgentDetailPage'));
const DealDetailPage = lazy(() => import('./pages/DealDetailPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/agents/:id" element={<AgentDetailPage />} />
        <Route path="/deals/:id" element={<DealDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Routes>
    </Suspense>
  );
}
```

### Preload des routes prévisibles

```html
<!-- index.html — preconnect vers l'API -->
<link rel="preconnect" href="https://api.axiom-marketing.fr" />
<link rel="dns-prefetch" href="https://api.axiom-marketing.fr" />
```

### Configuration des cache headers nginx (résumé)

```
/index.html         → Cache-Control: no-store
/env.js             → Cache-Control: no-store
/assets/*.js        → Cache-Control: public, max-age=31536000, immutable
/assets/*.css       → Cache-Control: public, max-age=31536000, immutable
/assets/*.woff2     → Cache-Control: public, max-age=31536000, immutable
/favicon.ico        → Cache-Control: public, max-age=86400
```

---

## 10. Monitoring du dashboard

### Sentry pour le tracking d'erreurs

```typescript
// src/main.tsx
import * as Sentry from '@sentry/react';
import { config } from './lib/config';

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: import.meta.env.MODE,
    release: config.appVersion,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Masque les données sensibles dans les sessions replay
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],

    // Pourcentage de transactions tracées (performance)
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // Pourcentage de sessions enregistrées (replay)
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0, // Toujours enregistrer les sessions avec erreur
  });
}
```

### Web Vitals — mesures de performance

```typescript
// src/lib/webVitals.ts
import { onCLS, onFCP, onFID, onLCP, onTTFB } from 'web-vitals';

function sendToAnalytics(metric: { name: string; value: number }) {
  // Envoie vers votre backend de métriques ou un service tiers
  fetch('/api/metrics/web-vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metric),
    keepalive: true, // Envoie même si la page se ferme
  }).catch(() => {
    // Silently fail — ne pas impacter l'expérience utilisateur
  });
}

export function initWebVitals() {
  onCLS(sendToAnalytics);
  onFCP(sendToAnalytics);
  onFID(sendToAnalytics);
  onLCP(sendToAnalytics);
  onTTFB(sendToAnalytics);
}
```

```typescript
// src/main.tsx
import { initWebVitals } from './lib/webVitals';

// Après le rendu initial
initWebVitals();
```

### Healthcheck endpoint

Le dashboard nginx expose un endpoint de healthcheck utilisé par Docker et Kubernetes :

```nginx
# Dans nginx.conf
location /health {
    access_log off;
    add_header Content-Type text/plain;
    return 200 "ok\n";
}
```

---

## 11. Headers de sécurité

### Content Security Policy avec iframe Metabase

Le dashboard embarque des rapports Metabase dans des iframes. La CSP doit explicitement autoriser `frame-src` pour le domaine Metabase.

```nginx
# nginx.conf — CSP complète
add_header Content-Security-Policy "
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' data:;
  connect-src
    'self'
    https://api.axiom-marketing.fr
    wss://api.axiom-marketing.fr
    https://sentry.io
    https://o0.ingest.sentry.io;
  frame-src
    https://metabase.axiom-marketing.fr;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
" always;
```

Note : `'unsafe-inline'` pour les scripts est nécessaire à cause des bundles Vite qui injectent du code inline. Pour une CSP stricte, utiliser les nonces (plus complexe à mettre en place avec Vite).

### Tous les headers de sécurité

```nginx
# X-Frame-Options — empêche l'embedding dans des iframes externes
# (frame-ancestors dans CSP est plus moderne mais X-Frame-Options reste utile pour IE)
add_header X-Frame-Options "DENY" always;

# Empêche le MIME type sniffing
add_header X-Content-Type-Options "nosniff" always;

# Active le filtre XSS du navigateur (legacy, utile pour IE/Edge ancien)
add_header X-XSS-Protection "1; mode=block" always;

# Contrôle les infos Referer envoyées
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# Désactive les APIs sensibles non nécessaires
add_header Permissions-Policy "
  camera=(),
  microphone=(),
  geolocation=(),
  payment=(),
  usb=(),
  accelerometer=(),
  gyroscope=()
" always;

# HSTS — force HTTPS pour 1 an (uniquement si SSL terminé ici)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

---

## 12. Responsivité mobile

### Breakpoints Tailwind utilisés

```typescript
// tailwind.config.ts
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        // Breakpoints par défaut Tailwind conservés
        // sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px
      },
    },
  },
};
```

### Stratégie responsive pour le dashboard

Le dashboard est conçu "desktop-first" (usage principal sur grand écran) mais reste utilisable sur mobile pour la consultation.

```typescript
// src/components/DashboardLayout.tsx
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header toujours visible */}
      <DashboardHeader />

      <div className="flex">
        {/* Sidebar : masquée sur mobile, visible sur lg+ */}
        <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 lg:top-16 border-r">
          <Sidebar />
        </aside>

        {/* Navigation mobile en bas (bottom bar) */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t">
          <MobileBottomNav />
        </nav>

        {/* Contenu principal */}
        <main className="flex-1 lg:ml-64 p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

### Grille responsive des KPIs

```typescript
// src/components/MetricsGrid.tsx
export function MetricsGrid() {
  return (
    // 1 colonne sur mobile, 2 sur tablette, 4 sur desktop
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <MetricCard title="Pipeline" />
      <MetricCard title="Conversion" />
      <MetricCard title="Appels aujourd'hui" />
      <MetricCard title="Emails envoyés" />
    </div>
  );
}
```

### Tableau responsive → cards sur mobile

Les tableaux de données ne sont pas utilisables tels quels sur mobile. Transformer en liste de cards :

```typescript
// src/components/AgentsList.tsx
import { useMediaQuery } from '../hooks/useMediaQuery';

export function AgentsList({ agents }: { agents: Agent[] }) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (isMobile) {
    return (
      <div className="space-y-3">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    );
  }

  return <AgentsTable agents={agents} />;
}
```

```typescript
// src/hooks/useMediaQuery.ts
import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
```

### Viewport et touch

```html
<!-- index.html — viewport configuré pour le mobile -->
<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=5.0"
/>
```

Ne pas utiliser `user-scalable=no` — cela nuit à l'accessibilité et viole les guidelines WCAG 2.1 (critère 1.4.4).
