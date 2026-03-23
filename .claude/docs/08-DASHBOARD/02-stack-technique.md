# Stack Technique — Dashboard Axiom

## Vue d'ensemble

Le dashboard Axiom est une single-page application (SPA) construite avec React 19, bundlée avec Vite 6, et stylée avec Tailwind CSS v4. Elle communique avec le backend NestJS via REST et SSE (Server-Sent Events).

---

## Librairies et versions exactes

| Librairie | Version | Usage |
|---|---|---|
| react | 19.1.0 | UI framework |
| react-dom | 19.1.0 | DOM rendering |
| vite | 6.2.0 | Build tool / dev server |
| typescript | 5.9.0 | Type system |
| tailwindcss | 4.0.0 | Utility-first CSS |
| @shadcn/ui | latest (CLI) | Component library |
| @tanstack/react-table | 8.21.0 | Headless table |
| @tanstack/react-query | 5.67.0 | Server state management |
| reactflow | 12.4.0 | Agent graph visualization |
| recharts | 2.15.0 | Charts and metrics |
| @hello-pangea/dnd | 4.0.1 | Drag-and-drop (Kanban) |
| react-router-dom | 7.3.0 | Client-side routing |
| zod | 3.24.0 | Schema validation |
| date-fns | 4.1.0 | Date utilities |
| lucide-react | 0.475.0 | Icons |
| @radix-ui/react-* | latest | Accessible primitives (via shadcn) |
| clsx | 2.1.1 | Conditional classnames |
| tailwind-merge | 3.0.0 | Tailwind class merging |
| class-variance-authority | 0.7.1 | Component variants |
| sonner | 2.0.1 | Toast notifications |
| cmdk | 1.0.4 | Command palette |
| vaul | 1.1.2 | Drawer component |

---

## package.json

```json
{
  "name": "axiom-dashboard",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@hello-pangea/dnd": "4.0.1",
    "@radix-ui/react-accordion": "1.2.3",
    "@radix-ui/react-alert-dialog": "1.1.6",
    "@radix-ui/react-avatar": "1.1.3",
    "@radix-ui/react-badge": "1.1.0",
    "@radix-ui/react-dialog": "1.1.6",
    "@radix-ui/react-dropdown-menu": "2.1.6",
    "@radix-ui/react-label": "2.1.2",
    "@radix-ui/react-popover": "1.1.6",
    "@radix-ui/react-progress": "1.1.2",
    "@radix-ui/react-scroll-area": "1.2.3",
    "@radix-ui/react-select": "2.1.6",
    "@radix-ui/react-separator": "1.1.2",
    "@radix-ui/react-sheet": "1.1.0",
    "@radix-ui/react-slot": "1.1.2",
    "@radix-ui/react-switch": "1.1.3",
    "@radix-ui/react-tabs": "1.1.3",
    "@radix-ui/react-tooltip": "1.1.8",
    "@tanstack/react-query": "5.67.0",
    "@tanstack/react-query-devtools": "5.67.0",
    "@tanstack/react-table": "8.21.0",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "cmdk": "1.0.4",
    "date-fns": "4.1.0",
    "lucide-react": "0.475.0",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-router-dom": "7.3.0",
    "recharts": "2.15.0",
    "reactflow": "12.4.0",
    "sonner": "2.0.1",
    "tailwind-merge": "3.0.0",
    "vaul": "1.1.2",
    "zod": "3.24.0"
  },
  "devDependencies": {
    "@eslint/js": "9.21.0",
    "@types/node": "22.13.0",
    "@types/react": "19.1.0",
    "@types/react-dom": "19.1.0",
    "@vitejs/plugin-react": "4.3.4",
    "autoprefixer": "10.4.21",
    "eslint": "9.21.0",
    "eslint-plugin-react-hooks": "5.1.0",
    "eslint-plugin-react-refresh": "0.4.19",
    "globals": "15.15.0",
    "prettier": "3.5.2",
    "prettier-plugin-tailwindcss": "0.6.11",
    "tailwindcss": "4.0.0",
    "@tailwindcss/vite": "4.0.0",
    "typescript": "5.9.0",
    "typescript-eslint": "8.24.1",
    "vite": "6.2.0"
  }
}
```

---

## vite.config.ts

```typescript
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@components': path.resolve(__dirname, './src/components'),
        '@hooks': path.resolve(__dirname, './src/hooks'),
        '@lib': path.resolve(__dirname, './src/lib'),
        '@pages': path.resolve(__dirname, './src/pages'),
        '@types': path.resolve(__dirname, './src/types'),
        '@stores': path.resolve(__dirname, './src/stores'),
        '@services': path.resolve(__dirname, './src/services'),
      },
    },

    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // Proxy REST API calls to NestJS backend
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
        // Proxy SSE stream to NestJS backend
        '/events': {
          target: env.VITE_SSE_URL || 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
      },
    },

    preview: {
      port: 4173,
    },

    build: {
      target: 'es2022',
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          // Code splitting by route/feature
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-query': ['@tanstack/react-query', '@tanstack/react-table'],
            'vendor-charts': ['recharts', 'reactflow'],
            'vendor-dnd': ['@hello-pangea/dnd'],
            'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          },
        },
      },
      // Target: ~300kb per chunk (with gzip)
      chunkSizeWarningLimit: 600,
    },

    // Optimize deps in dev mode
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        '@tanstack/react-query',
        '@tanstack/react-table',
        'recharts',
        'date-fns',
        'zod',
      ],
    },
  }
})
```

---

## tailwind.config.ts (Tailwind v4)

Tailwind CSS v4 utilise un fichier CSS principal à la place d'un fichier de configuration JS. La configuration se fait via `@theme` dans le CSS.

### src/app.css

```css
@import "tailwindcss";

@theme {
  /* Colors */
  --color-axiom-900: #0a0f1e;
  --color-axiom-800: #111827;
  --color-axiom-700: #1f2937;
  --color-axiom-600: #374151;
  --color-axiom-accent: #6366f1;
  --color-axiom-accent-hover: #818cf8;

  /* Agent status colors */
  --color-agent-active: #22c55e;
  --color-agent-idle: #eab308;
  --color-agent-error: #ef4444;
  --color-agent-stopped: #6b7280;

  /* Typography */
  --font-family-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  --font-family-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;

  /* Border radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.4);
  --shadow-elevated: 0 4px 6px -1px rgb(0 0 0 / 0.5), 0 2px 4px -2px rgb(0 0 0 / 0.5);

  /* Transitions */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 250ms cubic-bezier(0.4, 0, 0.2, 1);

  /* Z-indexes */
  --z-sidebar: 40;
  --z-header: 50;
  --z-modal: 100;
  --z-toast: 200;
}

/* Dark mode base (always dark) */
:root {
  color-scheme: dark;
  background-color: var(--color-axiom-900);
  color: #f9fafb;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--color-axiom-800);
}

::-webkit-scrollbar-thumb {
  background: var(--color-axiom-600);
  border-radius: var(--radius-full);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-axiom-accent);
}
```

### Note sur la migration Tailwind v4

Tailwind v4 n'utilise plus `tailwind.config.ts`. Les plugins et variantes personnalisées se définissent via `@plugin` et `@custom-variant` dans le CSS. Pour shadcn/ui, utiliser la commande :

```bash
npx shadcn@latest init
# Choisir : Style → New York, Base color → Zinc, CSS variables → yes
```

---

## tsconfig.json

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

### tsconfig.app.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    /* Strict type checking */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,

    /* Path aliases (must match vite.config.ts) */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"],
      "@hooks/*": ["./src/hooks/*"],
      "@lib/*": ["./src/lib/*"],
      "@pages/*": ["./src/pages/*"],
      "@types/*": ["./src/types/*"],
      "@stores/*": ["./src/stores/*"],
      "@services/*": ["./src/services/*"]
    }
  },
  "include": ["src"]
}
```

### tsconfig.node.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["vite.config.ts", "tailwind.config.ts"]
}
```

---

## ESLint + Prettier

### eslint.config.ts

```typescript
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
)
```

### .prettierrc

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### .prettierignore

```
dist/
node_modules/
*.lock
```

---

## Variables d'environnement

### .env.example

```dotenv
# Backend API base URL (NestJS)
# En dev: proxied via Vite → voir vite.config.ts
# En prod: URL absolue du backend
VITE_API_URL=http://localhost:3000

# SSE stream URL (peut differ si derriere un reverse proxy different)
VITE_SSE_URL=http://localhost:3000

# Metabase embed URL pour les graphiques avances
VITE_METABASE_URL=http://localhost:3001

# Feature flags (optionnel)
VITE_ENABLE_GRAPH_VIEW=true
VITE_ENABLE_SSE=true
VITE_ENABLE_DEVTOOLS=false

# Polling interval fallback si SSE indisponible (ms)
VITE_POLLING_INTERVAL=5000
```

### .env.development

```dotenv
VITE_API_URL=http://localhost:3000
VITE_SSE_URL=http://localhost:3000
VITE_METABASE_URL=http://localhost:3001
VITE_ENABLE_DEVTOOLS=true
```

### .env.production

```dotenv
VITE_API_URL=https://api.axiom.internal
VITE_SSE_URL=https://api.axiom.internal
VITE_METABASE_URL=https://metabase.axiom.internal
VITE_ENABLE_DEVTOOLS=false
```

### src/lib/env.ts — Validation des env vars avec Zod

```typescript
import { z } from 'zod'

const envSchema = z.object({
  VITE_API_URL: z.string().url(),
  VITE_SSE_URL: z.string().url(),
  VITE_METABASE_URL: z.string().url().optional(),
  VITE_ENABLE_GRAPH_VIEW: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  VITE_ENABLE_SSE: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  VITE_POLLING_INTERVAL: z
    .string()
    .transform(Number)
    .default('5000'),
})

export const env = envSchema.parse(import.meta.env)
```

---

## Docker — Production

### Dockerfile

```dockerfile
# --- Stage 1: Build ---
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile

# Copy source and build
COPY . .
ARG VITE_API_URL=http://localhost:3000
ARG VITE_SSE_URL=http://localhost:3000
ARG VITE_METABASE_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SSE_URL=$VITE_SSE_URL
ENV VITE_METABASE_URL=$VITE_METABASE_URL

RUN npm run build

# --- Stage 2: Serve ---
FROM nginx:1.27-alpine AS production

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Non-root user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

### nginx.conf

```nginx
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
  worker_connections 1024;
  use epoll;
  multi_accept on;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  # Logging
  log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                  '$status $body_bytes_sent "$http_referer" '
                  '"$http_user_agent"';
  access_log /var/log/nginx/access.log main;

  # Performance
  sendfile on;
  tcp_nopush on;
  tcp_nodelay on;
  keepalive_timeout 65;
  gzip on;
  gzip_types text/plain text/css application/javascript application/json
             application/x-javascript text/xml application/xml
             application/xml+rss text/javascript image/svg+xml;
  gzip_min_length 1000;
  gzip_vary on;

  server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.axiom.internal;" always;

    # Cache static assets (hashed filenames)
    location ~* \.(js|css|woff2?|ttf|eot|otf)$ {
      expires 1y;
      add_header Cache-Control "public, immutable";
      access_log off;
    }

    # Cache images
    location ~* \.(png|jpg|jpeg|gif|ico|svg|webp)$ {
      expires 30d;
      add_header Cache-Control "public";
      access_log off;
    }

    # No cache for index.html (entry point)
    location = /index.html {
      expires -1;
      add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # SPA routing: all routes → index.html
    location / {
      try_files $uri $uri/ /index.html;
    }

    # Health check endpoint
    location /health {
      access_log off;
      return 200 "ok\n";
      add_header Content-Type text/plain;
    }

    # Proxy API calls to NestJS backend (if same nginx instance)
    # Uncomment if dashboard and API share the same nginx
    # location /api {
    #   proxy_pass http://backend:3000;
    #   proxy_http_version 1.1;
    #   proxy_set_header Host $host;
    #   proxy_set_header X-Real-IP $remote_addr;
    #   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    # }

    # Gzip pre-compressed assets
    location ~* \.(js|css)$ {
      gzip_static on;
      expires 1y;
      add_header Cache-Control "public, immutable";
    }
  }
}
```

### docker-compose.dashboard.yml (pour le développement local)

```yaml
version: "3.9"

services:
  dashboard:
    build:
      context: ./dashboard
      dockerfile: Dockerfile
      args:
        VITE_API_URL: http://localhost:3000
        VITE_SSE_URL: http://localhost:3000
        VITE_METABASE_URL: http://localhost:3001
    ports:
      - "8080:8080"
    depends_on:
      - backend
    restart: unless-stopped

  dashboard-dev:
    image: node:22-alpine
    working_dir: /app
    volumes:
      - ./dashboard:/app
      - /app/node_modules
    command: npm run dev -- --host 0.0.0.0
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://backend:3000
      VITE_SSE_URL: http://backend:3000
    depends_on:
      - backend
```

---

## Commandes build et déploiement

### Développement

```bash
# Installation des dépendances
npm ci

# Démarrer le serveur de développement (http://localhost:5173)
npm run dev

# Typecheck en mode watch
npx tsc --noEmit --watch

# Linter
npm run lint

# Formatter
npm run format
```

### Production

```bash
# Build de production
npm run build

# Prévisualisation du build (http://localhost:4173)
npm run preview

# Build Docker
docker build \
  --build-arg VITE_API_URL=https://api.axiom.internal \
  --build-arg VITE_SSE_URL=https://api.axiom.internal \
  --build-arg VITE_METABASE_URL=https://metabase.axiom.internal \
  -t axiom-dashboard:latest \
  -f Dockerfile .

# Déploiement Docker
docker run -d \
  --name axiom-dashboard \
  -p 8080:8080 \
  --restart unless-stopped \
  axiom-dashboard:latest
```

### CI/CD (GitHub Actions exemple)

```yaml
name: Dashboard CI

on:
  push:
    branches: [main]
    paths: ['dashboard/**']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: dashboard/package-lock.json

      - run: npm ci
        working-directory: dashboard

      - run: npm run typecheck
        working-directory: dashboard

      - run: npm run lint
        working-directory: dashboard

      - run: npm run build
        working-directory: dashboard
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
          VITE_SSE_URL: ${{ secrets.VITE_SSE_URL }}
          VITE_METABASE_URL: ${{ secrets.VITE_METABASE_URL }}

      - name: Build Docker image
        run: |
          docker build \
            --build-arg VITE_API_URL=${{ secrets.VITE_API_URL }} \
            -t axiom-dashboard:${{ github.sha }} \
            dashboard/
```

---

## Compatibilité navigateurs

### Cibles de build (Vite)

```typescript
// vite.config.ts — build.target
target: 'es2022'
```

### Navigateurs supportés

| Navigateur | Version minimale | Notes |
|---|---|---|
| Chrome / Edge | 105+ | Support complet ES2022 + SSE |
| Firefox | 104+ | Support complet |
| Safari | 16+ | SSE supporté |
| Arc | Toutes | Basé sur Chromium |

### Pas de support nécessaire

- Internet Explorer: non supporté
- Safari < 16: non supporté (pas de ReadableStream SSE)
- Mobile browsers: non prioritaire (dashboard interne desktop)

### browserslist (pour outils tiers)

```
[production]
chrome >= 105
edge >= 105
firefox >= 104
safari >= 16

[development]
last 1 chrome version
last 1 firefox version
last 1 safari version
```

---

## Structure du projet

```
dashboard/
├── public/
│   ├── favicon.svg
│   └── robots.txt
├── src/
│   ├── app.tsx                 # Root component + providers
│   ├── app.css                 # Tailwind v4 theme
│   ├── main.tsx                # Entry point
│   ├── router.tsx              # React Router v7 config
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── agents/             # Agent-specific components
│   │   ├── charts/             # Recharts wrappers
│   │   ├── kanban/             # @hello-pangea/dnd kanban
│   │   ├── graph/              # React Flow agent graph
│   │   ├── layout/             # Sidebar, Header, Shell
│   │   └── shared/             # Generic reusable components
│   ├── hooks/
│   │   ├── use-sse.ts          # SSE subscription hook
│   │   ├── use-agents.ts       # Agent query hooks
│   │   ├── use-prospects.ts    # Prospect query hooks
│   │   └── use-metrics.ts      # Metrics query hooks
│   ├── lib/
│   │   ├── api-client.ts       # Fetch wrapper + error handling
│   │   ├── query-client.ts     # TanStack Query config
│   │   ├── env.ts              # Validated env vars
│   │   └── utils.ts            # cn() and other utilities
│   ├── pages/
│   │   ├── dashboard/          # /dashboard — overview
│   │   ├── agents/             # /agents — agent monitor
│   │   ├── prospects/          # /prospects — prospect table
│   │   ├── tenders/            # /tenders — AO tracker
│   │   ├── deals/              # /deals — kanban pipeline
│   │   ├── actions/            # /actions — todo list
│   │   └── graph/              # /graph — agent topology
│   ├── services/
│   │   ├── agents.service.ts   # API calls for agents
│   │   ├── prospects.service.ts
│   │   ├── tenders.service.ts
│   │   ├── deals.service.ts
│   │   └── metrics.service.ts
│   └── types/
│       ├── agent.ts
│       ├── prospect.ts
│       ├── tender.ts
│       ├── deal.ts
│       ├── event.ts
│       └── api.ts              # Shared API types (pagination, etc.)
├── .env.example
├── .env.development
├── .eslintrc.config.ts
├── .prettierrc
├── Dockerfile
├── nginx.conf
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts
```
