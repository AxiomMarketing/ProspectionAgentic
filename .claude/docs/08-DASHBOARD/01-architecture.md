# Axiom Dashboard — Architecture Frontend

**Version :** 1.0.0
**Dernière mise à jour :** 23 mars 2026
**Stack :** React 19 + Vite 6 + TypeScript 5.9 + Tailwind CSS v4 + shadcn/ui

---

## Table des matières

1. [Structure du projet](#1-structure-du-projet)
2. [Hiérarchie des composants](#2-hiérarchie-des-composants)
3. [Data flow](#3-data-flow)
4. [Configuration du routing](#4-configuration-du-routing)
5. [State management](#5-state-management)
6. [Authentification](#6-authentification)
7. [Error boundaries](#7-error-boundaries)
8. [Code splitting et lazy loading](#8-code-splitting-et-lazy-loading)
9. [Organisation des types TypeScript](#9-organisation-des-types-typescript)
10. [Bibliothèque de composants partagés](#10-bibliothèque-de-composants-partagés)
11. [Design system](#11-design-system)
12. [Performance](#12-performance)
13. [Stratégie de tests](#13-stratégie-de-tests)

---

## 1. Structure du projet

Chaque fichier dans `src/` a une responsabilité unique et bien définie.

```
src/
│
├── main.tsx                    — Point d'entrée: createRoot, StrictMode
├── app.tsx                     — Providers imbriqués + RouterProvider
│
├── routes/                     — Pages (1 fichier = 1 route = 1 vue)
│   ├── index.tsx               — V1 Centre de Contrôle
│   ├── timeline.tsx            — V2 Timeline Agents
│   ├── prospects/
│   │   ├── index.tsx           — V3 Liste prospects
│   │   └── $prospectId.tsx     — V3 Fiche prospect (param dynamique)
│   ├── tenders/
│   │   ├── index.tsx           — V4 Liste marchés publics
│   │   └── $tenderId.tsx       — V4 Fiche marché (param dynamique)
│   ├── deals.tsx               — V5 Pipeline Kanban
│   ├── graph.tsx               — V6 Graph agents React Flow
│   └── actions.tsx             — V7 Actions Rapides
│
├── components/
│   ├── agents/
│   │   ├── AgentCard.tsx       — Carte status avec badge SSE live
│   │   ├── AgentDetail.tsx     — Panel slide-over détail agent
│   │   └── AgentGraph.tsx      — React Flow v12 avec noeuds custom
│   │
│   ├── prospects/
│   │   ├── ProspectTable.tsx   — TanStack Table v8 (virtualisation >500 rows)
│   │   ├── ProspectDetail.tsx  — Layout à onglets (infos/score/timeline)
│   │   ├── ScoreBreakdown.tsx  — 4 barres + score total
│   │   ├── SignalList.tsx      — Liste avec indicateur de decay temporel
│   │   └── InteractionTimeline.tsx — Historique emails/LinkedIn
│   │
│   ├── tenders/
│   │   ├── TenderTable.tsx     — TanStack Table v8
│   │   ├── TenderDetail.tsx    — Layout à onglets
│   │   ├── TenderScoring.tsx   — 7 barres critères GO/NO-GO
│   │   ├── TenderProgress.tsx  — Checklist 9a→9g avec dates
│   │   └── TenderTimeline.tsx  — Retroplanning J-31 → J0
│   │
│   ├── deals/
│   │   ├── DealKanban.tsx      — @hello-pangea/dnd (7 colonnes)
│   │   ├── DealCard.tsx        — Carte avec indicateur chaleur
│   │   └── DealMetrics.tsx     — Bandeau KPI pipeline
│   │
│   ├── shared/                 — Composants réutilisables dans toutes les vues
│   │   ├── StatusBadge.tsx
│   │   ├── MetricCard.tsx
│   │   ├── EventCard.tsx
│   │   ├── ActionItem.tsx
│   │   ├── PriorityBadge.tsx
│   │   └── EmptyState.tsx
│   │
│   └── layout/
│       ├── AppLayout.tsx       — Shell: sidebar + header + main
│       ├── Sidebar.tsx         — Navigation latérale
│       ├── Header.tsx          — Barre supérieure
│       └── NotificationBell.tsx — Badge count actions urgentes
│
├── hooks/                      — Logique réutilisable (data fetching + SSE)
│   ├── useSSE.ts               — Hook générique EventSource
│   ├── useAgentStatus.ts
│   ├── useAgentEvents.ts       — SSE stream + buffer local
│   ├── useProspects.ts
│   ├── useProspect.ts
│   ├── useTenders.ts
│   ├── useTender.ts
│   ├── useDeals.ts
│   ├── useActionItems.ts
│   ├── useAgentGraph.ts
│   └── useMetrics.ts
│
├── lib/                        — Utilitaires non-React
│   ├── api.ts                  — Client fetch (auth, retry, base URL)
│   ├── sse.ts                  — SSEClient class (reconnexion exponentielle)
│   ├── query-client.ts         — Configuration TanStack Query
│   └── utils.ts                — cn(), formatDate(), formatCurrency()
│
└── types/                      — Interfaces TypeScript (source de vérité)
    ├── agent.ts
    ├── prospect.ts
    ├── tender.ts
    ├── deal.ts
    └── event.ts
```

---

## 2. Hiérarchie des composants

```
App
└── QueryClientProvider (TanStack Query)
    └── AuthProvider (Context)
        └── ThemeProvider (shadcn/ui)
            └── RouterProvider (React Router v7)
                └── AppLayout
                    ├── Sidebar
                    │   ├── NavItem (V1 Home)
                    │   ├── NavItem (V2 Timeline)
                    │   ├── NavItem (V3 Prospects)
                    │   ├── NavItem (V4 Tenders)
                    │   ├── NavItem (V5 Deals)
                    │   ├── NavItem (V6 Graph)
                    │   └── NavItem (V7 Actions)
                    ├── Header
                    │   └── NotificationBell
                    └── <Outlet /> (route active)
                        │
                        ├── V1: ControlCenter
                        │   ├── AgentCard × N (SSE live)
                        │   └── MetricCard × 8
                        │
                        ├── V2: TimelinePage
                        │   ├── TimelineFilters
                        │   └── EventCard × N (virtualisé)
                        │
                        ├── V3: ProspectsPage
                        │   └── ProspectTable (TanStack Table v8)
                        │       └── ProspectDetail (slide-over)
                        │           ├── ScoreBreakdown
                        │           ├── SignalList
                        │           └── InteractionTimeline
                        │
                        ├── V4: TendersPage
                        │   └── TenderTable (TanStack Table v8)
                        │       └── TenderDetail (slide-over)
                        │           ├── TenderScoring
                        │           ├── TenderProgress
                        │           └── TenderTimeline
                        │
                        ├── V5: DealsPage
                        │   ├── DealMetrics
                        │   └── DealKanban (@hello-pangea/dnd)
                        │       └── DealCard × N
                        │
                        ├── V6: GraphPage
                        │   └── AgentGraph (React Flow v12)
                        │       ├── AgentNode × N (custom)
                        │       └── AgentEdge × N (custom)
                        │
                        └── V7: ActionsPage
                            └── ActionItem × N (par priorité)
```

---

## 3. Data flow

### Vue d'ensemble

```
Backend NestJS
     │
     ├── REST API (HTTP)
     │      │
     │      ▼
     │   lib/api.ts (fetch wrapper)
     │      │
     │      ▼
     │   TanStack Query (useQuery / useMutation)
     │   ┌─ cache en mémoire
     │   ├─ staleTime configurable par endpoint
     │   ├─ retry automatique (3x)
     │   └─ invalidation sur mutation
     │          │
     │          ▼
     │       Composants React (via hooks custom)
     │
     └── SSE (EventSource)
            │
            ▼
         lib/sse.ts (SSEClient)
            │
            ▼
         hooks/useSSE.ts → useAgentEvents.ts
            │
            ├── Mise à jour directe buffer local (V2 Timeline)
            ├── queryClient.invalidateQueries() (invalide le cache REST)
            └── Context dispatch (notification bell)
```

### Flux détaillé pour V2 Timeline

```
1. Mount: useAgentEvents() ouvre une connexion SSE vers /api/events/stream
2. L'utilisateur scroll la timeline → useQuery /api/events?cursor=xxx
3. Un agent publie un événement → Redis pub/sub → NestJS SSE
4. SSEClient reçoit le message JSON
5. Hook useAgentEvents ajoute l'événement en tête du buffer local (useState)
6. Le composant EventCard re-render avec le nouvel événement (animé)
7. queryClient.setQueryData() est appelé pour mettre à jour aussi le cache paginé
```

### Flux détaillé pour mutation (ex: PATCH /api/deals/:id/stage)

```
1. Utilisateur drag une carte dans DealKanban
2. onDragEnd déclenche mutate({ dealId, newStage })
3. Optimistic update: queryClient.setQueryData(['deals'], patchLocal)
4. fetch PATCH /api/deals/:id/stage
5. On success: queryClient.invalidateQueries(['deals'])
6. On error: rollback via queryClient.setQueryData(['deals'], previousData)
```

---

## 4. Configuration du routing

### `src/app.tsx` — Router complet

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { PageLoader } from './components/shared/PageLoader';

// Lazy loading de toutes les routes (sauf V1 qui est la page d'accueil)
const ControlCenter  = lazy(() => import('./routes/index'));
const Timeline       = lazy(() => import('./routes/timeline'));
const ProspectsPage  = lazy(() => import('./routes/prospects/index'));
const ProspectDetail = lazy(() => import('./routes/prospects/$prospectId'));
const TendersPage    = lazy(() => import('./routes/tenders/index'));
const TenderDetail   = lazy(() => import('./routes/tenders/$tenderId'));
const DealsPage      = lazy(() => import('./routes/deals'));
const GraphPage      = lazy(() => import('./routes/graph'));
const ActionsPage    = lazy(() => import('./routes/actions'));

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    // ErrorBoundary au niveau du layout pour catcher les erreurs de routes enfants
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<PageLoader />}>
            <ControlCenter />
          </Suspense>
        ),
      },
      {
        path: 'timeline',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Timeline />
          </Suspense>
        ),
      },
      {
        path: 'prospects',
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<PageLoader />}>
                <ProspectsPage />
              </Suspense>
            ),
          },
          {
            path: ':prospectId',
            element: (
              <Suspense fallback={<PageLoader />}>
                <ProspectDetail />
              </Suspense>
            ),
          },
        ],
      },
      {
        path: 'tenders',
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<PageLoader />}>
                <TendersPage />
              </Suspense>
            ),
          },
          {
            path: ':tenderId',
            element: (
              <Suspense fallback={<PageLoader />}>
                <TenderDetail />
              </Suspense>
            ),
          },
        ],
      },
      {
        path: 'deals',
        element: (
          <Suspense fallback={<PageLoader />}>
            <DealsPage />
          </Suspense>
        ),
      },
      {
        path: 'graph',
        element: (
          <Suspense fallback={<PageLoader />}>
            <GraphPage />
          </Suspense>
        ),
      },
      {
        path: 'actions',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ActionsPage />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '*',
    element: <NotFound />,
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider defaultTheme="dark">
          <RouterProvider router={router} />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

---

## 5. State management

### Principes

| Type d'état | Solution | Exemples |
|-------------|----------|----------|
| Données serveur | TanStack Query v5 | Listes prospects, statuts agents, deals |
| Formulaires | React Hook Form | Filtres, overrides score, notes |
| UI locale (composant) | useState | Modal ouvert/fermé, onglet actif |
| UI partagée (app) | React Context | Auth user, thème, notification count |
| Temps réel | SSE + TanStack Query | Événements agents, actions urgentes |

### `src/lib/query-client.ts`

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Les données restent "fraîches" pendant 30s par défaut
      // Après 30s, un re-fetch en arrière-plan est déclenché au focus
      staleTime: 30_000,
      // Garder les données en cache 5 minutes après qu'un composant se démonte
      gcTime: 5 * 60_000,
      // Retry 3 fois avec backoff exponentiel
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      // Ne pas re-fetcher au focus en production pour réduire la charge
      refetchOnWindowFocus: import.meta.env.DEV,
    },
    mutations: {
      // Retry 1 fois pour les mutations réseau
      retry: 1,
    },
  },
});
```

### Configuration staleTime par endpoint

```typescript
// hooks/useAgentStatus.ts — refresh agressif via SSE, pas de polling
export function useAgentStatus() {
  return useQuery({
    queryKey: ['agents', 'status'],
    queryFn: () => api.get<AgentStatus[]>('/api/agents/status'),
    staleTime: 0, // Toujours stale — SSE invalide ce cache
    refetchInterval: false,
  });
}

// hooks/useProspects.ts — données relativement stables
export function useProspects(filters: ProspectFilters) {
  return useQuery({
    queryKey: ['prospects', filters],
    queryFn: () => api.get<ProspectListResponse>('/api/prospects', { params: filters }),
    staleTime: 30_000,
    placeholderData: keepPreviousData, // Évite le flash pendant les changements de filtre
  });
}

// hooks/useTender.ts — données peu changeantes
export function useTender(tenderId: string) {
  return useQuery({
    queryKey: ['tenders', tenderId],
    queryFn: () => api.get<TenderDetail>(`/api/tenders/${tenderId}`),
    staleTime: 60_000,
    enabled: !!tenderId,
  });
}

// hooks/useMetrics.ts — métriques temps réel
export function useMetrics() {
  return useQuery({
    queryKey: ['metrics', 'today'],
    queryFn: () => api.get<DailyMetrics>('/api/metrics/today'),
    staleTime: 0,
    refetchInterval: false, // SSE gère le refresh
  });
}
```

### Context Auth

```typescript
// contexts/auth-context.tsx
interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  // Vérifier la session au mount (cookie httpOnly → /api/auth/me)
  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<AuthUser>('/api/auth/me'),
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (data) setUser(data);
  }, [data]);

  const logout = async () => {
    await api.post('/api/auth/logout');
    setUser(null);
    queryClient.clear();
    window.location.href = '/login';
  };

  if (isLoading) return <SplashScreen />;

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

---

## 6. Authentification

### Stratégie

Le backend NestJS émet un **JWT stocké dans un cookie `httpOnly` + `Secure` + `SameSite=Strict`**. Ce choix délibéré protège contre les attaques XSS (le JavaScript du dashboard ne peut pas lire le cookie).

```
Login flow:
1. POST /api/auth/login { username, password }
2. NestJS vérifie les credentials
3. NestJS set-cookie: token=<JWT>; HttpOnly; Secure; SameSite=Strict; Path=/api; MaxAge=28800
4. Le browser stocke le cookie automatiquement
5. Toutes les requêtes API suivantes incluent le cookie automatiquement

Logout flow:
1. POST /api/auth/logout
2. NestJS set-cookie: token=; MaxAge=0 (efface le cookie)
3. queryClient.clear() (efface le cache local)
4. Redirection vers /login
```

### `src/lib/api.ts` — Client fetch avec credentials

```typescript
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, ...init } = options;

  // Construire l'URL avec les query params
  const url = new URL(path, API_BASE);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
  }

  const response = await fetch(url.toString(), {
    ...init,
    // CRITIQUE: inclure le cookie httpOnly dans toutes les requêtes
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  // Rediriger vers /login si la session a expiré
  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Session expirée');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, error.message);
  }

  // 204 No Content (DELETE, certains PATCH)
  if (response.status === 204) return undefined as T;

  return response.json();
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
```

---

## 7. Error boundaries

### Stratégie en couches

```
App
├── GlobalErrorBoundary          — Catchs les erreurs catastrophiques (runtime)
│   └── RouterProvider
│       └── AppLayout
│           ├── RouteErrorBoundary — Catchs les erreurs de chargement de route
│           │   └── <route>
│           │       └── QueryErrorBoundary — Catchs les erreurs de requêtes API
│           │           └── ProspectTable (ou autre)
│           └── NotificationBell (ne crash jamais l'app entière)
```

### `RouteErrorBoundary` (utilisée dans le router)

```tsx
// components/error/RouteErrorBoundary.tsx
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';

export function RouteErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <h1 className="text-2xl font-bold text-destructive">
          {error.status === 404 ? 'Page introuvable' : `Erreur ${error.status}`}
        </h1>
        <p className="text-muted-foreground">{error.statusText}</p>
        <Link to="/" className="btn btn-primary">Retour au tableau de bord</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <h1 className="text-2xl font-bold text-destructive">Erreur inattendue</h1>
      <p className="text-muted-foreground font-mono text-sm">
        {error instanceof Error ? error.message : 'Erreur inconnue'}
      </p>
      <button onClick={() => window.location.reload()} className="btn btn-secondary">
        Recharger la page
      </button>
    </div>
  );
}
```

### `QueryErrorBoundary` — Erreurs API localisées

```tsx
// components/error/QueryErrorBoundary.tsx
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function QueryErrorBoundary({ children, fallback }: Props) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          fallbackRender={({ error, resetErrorBoundary }) => (
            fallback ?? (
              <div className="p-4 border border-destructive/50 rounded-lg bg-destructive/10">
                <p className="text-sm text-destructive">
                  Erreur de chargement: {error.message}
                </p>
                <button
                  onClick={resetErrorBoundary}
                  className="mt-2 text-xs underline text-muted-foreground"
                >
                  Réessayer
                </button>
              </div>
            )
          )}
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
```

---

## 8. Code splitting et lazy loading

### Principe

Chaque route est un chunk séparé. La page d'accueil (V1) est incluse dans le bundle principal pour un Time-to-Interactive rapide. Les autres routes sont chargées à la demande.

### Configuration Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks séparés pour un meilleur cache navigateur
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-table': ['@tanstack/react-table'],
          'vendor-flow':  ['reactflow'],
          'vendor-dnd':   ['@hello-pangea/dnd'],
          'vendor-charts': ['recharts'],
          'vendor-ui':    ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
    // Chunck warning à 400KB (React Flow + Recharts sont lourds)
    chunkSizeWarningLimit: 400,
  },
});
```

### Bundles estimés (gzip)

| Chunk | Taille estimée | Routes concernées |
|-------|---------------|-------------------|
| vendor-react | ~45KB | toutes |
| vendor-query | ~15KB | toutes |
| vendor-table | ~40KB | V3, V4 |
| vendor-flow | ~120KB | V6 uniquement |
| vendor-dnd | ~25KB | V5 uniquement |
| vendor-charts | ~60KB | V1 |
| route-index | ~8KB | V1 |
| route-timeline | ~12KB | V2 |
| route-prospects | ~20KB | V3 |
| route-tenders | ~18KB | V4 |
| route-deals | ~15KB | V5 |
| route-graph | ~10KB | V6 |
| route-actions | ~8KB | V7 |

React Flow (120KB gzip) n'est chargé que si l'utilisateur navigue vers V6.

---

## 9. Organisation des types TypeScript

### `src/types/agent.ts`

```typescript
export type AgentName =
  | 'VEILLEUR'
  | 'ENRICHISSEUR'
  | 'SCOREUR'
  | 'REDACTEUR'
  | 'SUIVEUR'
  | 'NURTUREUR'
  | 'ANALYSTE'
  | 'DEALMAKER'
  | 'APPELS_OFFRES'
  | 'CSM';

export type AgentStatusCode = 'active' | 'idle' | 'waiting' | 'error';

export interface AgentStatus {
  name: AgentName;
  status: AgentStatusCode;
  currentAction: string | null;
  lastExecutionAt: string; // ISO 8601
  lastExecutionSummary: string | null;
  metrics: {
    leadsToday?: number;
    emailsToday?: number;
    costEurToday?: number;
  };
}

export interface AgentGraphNode {
  id: AgentName;
  label: string;
  status: AgentStatusCode;
  metric: string; // ex: "23 leads/h"
  position: { x: number; y: number };
}

export interface AgentGraphEdge {
  id: string;
  source: AgentName;
  target: AgentName;
  messageCount24h: number;
  volumeBytes: number;
  avgLatencyMs: number;
  lastMessages: AgentEventRecord[];
}

export interface AgentGraph {
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  lastUpdatedAt: string;
}
```

### `src/types/prospect.ts`

```typescript
export type ProspectCategory = 'HOT' | 'WARM' | 'COLD' | 'DISQUALIFIED';
export type ProspectSegment = 'agence_web' | 'saas_b2b' | 'esn' | 'ecommerce' | 'startup' | 'autre';

export interface ProspectScore {
  icp: number;          // /25
  signals: number;      // /30
  tech: number;         // /25
  engagement: number;   // /20
  negative: number;     // valeur négative (pénalités)
  total: number;        // /100
}

export interface Signal {
  type: string;         // ex: "RECRUTEMENT_REACT"
  label: string;        // ex: "Recrutement développeur React"
  detectedAt: string;   // ISO 8601
  decayFactor: number;  // 0.0 à 1.0 (1.0 = signal frais)
  weight: number;       // poids dans le calcul
}

export interface ProspectContact {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  linkedinUrl: string | null;
}

export interface ProspectCompany {
  name: string;
  siret: string | null;
  revenue: number | null;         // en euros
  employees: number | null;
  sector: string;
  nafCode: string | null;
  city: string;
  websiteUrl: string;
  lighthouseScore: number | null; // /100
  rgaaScore: number | null;       // /100
  techStack: string[];
}

export interface Prospect {
  id: string;
  category: ProspectCategory;
  segment: ProspectSegment;
  contact: ProspectContact;
  company: ProspectCompany;
  score: ProspectScore;
  signals: Signal[];
  estimatedRevenueLoss: number | null; // en euros/an
  detectedAt: string;
  lastActivityAt: string;
}

export interface ProspectListItem {
  id: string;
  category: ProspectCategory;
  segment: ProspectSegment;
  companyName: string;
  contactName: string;
  score: number;
  mainSignal: string;
  detectedAt: string;
}

export interface ProspectListResponse {
  data: ProspectListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProspectFilters {
  category?: ProspectCategory;
  segment?: ProspectSegment;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'score' | 'detectedAt' | 'lastActivityAt';
  sortDir?: 'asc' | 'desc';
}

export interface ProspectInteraction {
  id: string;
  type: 'EMAIL_SENT' | 'EMAIL_OPENED' | 'EMAIL_REPLIED' | 'LINKEDIN_CONNECT' | 'LINKEDIN_MESSAGE' | 'NURTURE_SENT';
  summary: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}
```

### `src/types/tender.ts`

```typescript
export type TenderDecision = 'GO' | 'POSSIBLE' | 'NO_GO' | 'PENDING';
export type TenderStatus = 'DETECTED' | 'ANALYZED' | 'IN_PROGRESS' | 'SUBMITTED' | 'AWARDED' | 'LOST';

export type TenderProgressStep =
  | '9a_dce_analysis'
  | '9b_requirements_extraction'
  | '9c_technical_memo'
  | '9d_client_references'
  | '9e_pricing_schedule'
  | '9f_review_validation'
  | '9g_platform_submission';

export type StepStatus = 'pending' | 'in_progress' | 'completed';

export interface TenderProgressEntry {
  step: TenderProgressStep;
  label: string;
  status: StepStatus;
  completedAt: string | null;
  targetDate: string;
}

export interface TenderScoreBreakdown {
  relevance: number;        // /20
  skills: number;           // /20
  budgetViable: number;     // /20
  competition: number;      // /20
  timeRealistic: number;    // /20
  total: number;            // /100
  expectedValue: number;    // montant * probabilité de gain
}

export interface Tender {
  id: string;
  boampRef: string;
  buyer: string;
  subject: string;
  procedureType: string;
  estimatedAmount: number;
  submissionDeadline: string; // ISO 8601
  publicationDate: string;
  decision: TenderDecision;
  status: TenderStatus;
  score: TenderScoreBreakdown;
  progress: TenderProgressEntry[];
  daysUntilDeadline: number;
}

export interface TenderListItem {
  id: string;
  boampRef: string;
  subject: string;
  buyer: string;
  decision: TenderDecision;
  score: number;
  daysUntilDeadline: number;
  estimatedAmount: number;
  status: TenderStatus;
}
```

### `src/types/deal.ts`

```typescript
export type DealStage =
  | 'QUALIFIED'
  | 'QUOTE_SENT'
  | 'IN_CONSIDERATION'
  | 'NEGOTIATION'
  | 'READY_TO_SIGN'
  | 'SIGNED'
  | 'LOST';

export type DealHeat = 'hot' | 'warm' | 'cold';

export interface Deal {
  id: string;
  companyName: string;
  contactName: string;
  stage: DealStage;
  amount: number; // en euros
  heat: DealHeat;
  daysSinceLastAction: number;
  nextAction: string | null;
  nextActionDate: string | null;
  createdAt: string;
  prospectId: string | null;
}

export interface DealMetrics {
  totalPipelineValue: number;  // en euros
  velocity: number;            // €/jour
  winRate30d: number;          // 0.0 à 1.0
  avgCycleDays: number;
}
```

### `src/types/event.ts`

```typescript
export type AgentEventType =
  | 'LEAD_DETECTED'
  | 'LEAD_ENRICHED'
  | 'LEAD_SCORED'
  | 'EMAIL_GENERATED'
  | 'EMAIL_SENT'
  | 'LINKEDIN_ACTION'
  | 'REPLY_DETECTED'
  | 'REPLY_INTERESSE'
  | 'NURTURE_ACTION'
  | 'RESCORE'
  | 'RECLASSIFIED'
  | 'TENDER_DETECTED'
  | 'TENDER_SCORED'
  | 'TENDER_STEP'
  | 'DEAL_CREATED'
  | 'DEAL_STAGE_CHANGE'
  | 'DEAL_SIGNED'
  | 'DEAL_LOST'
  | 'AGENT_ERROR'
  | 'AGENT_STARTED'
  | 'AGENT_COMPLETED'
  | 'COST_ALERT';

export type EventSeverity = 'info' | 'warning' | 'error' | 'success';

export interface AgentEventRecord {
  id: string;
  eventType: AgentEventType;
  agentSource: string;
  agentDestination: string | null;
  prospectId: string | null;
  tenderId: string | null;
  dealId: string | null;
  summary: string;
  payload: Record<string, unknown> | null;
  durationMs: number | null;
  costEur: number | null;
  severity: EventSeverity;
  createdAt: string; // ISO 8601
}

export type ActionItemType =
  | 'REPLY_INTERESSE'
  | 'REPLY_INTERESSE_SOFT'
  | 'TENDER_GO_DECISION'
  | 'QUOTE_REVIEW'
  | 'DEAL_STALLED'
  | 'PROSPECT_RECLASSIFIED'
  | 'AGENT_ERROR'
  | 'DAILY_DIGEST';

export type ActionPriority = 'urgent' | 'important' | 'normal' | 'info';
export type ActionStatus = 'pending' | 'done' | 'expired';

export interface ActionItem {
  id: number;
  type: ActionItemType;
  priority: ActionPriority;
  title: string;
  description: string | null;
  entityType: 'prospect' | 'tender' | 'deal' | 'agent' | null;
  entityId: string | null;
  slaDeadline: string | null; // ISO 8601
  slaRemainingMs: number | null; // calculé côté client
  status: ActionStatus;
  createdAt: string;
}

export interface DailyMetrics {
  leadsDetected: number;
  leadsEnriched: number;
  leadsHot: number;
  emailsSent: number;
  repliesReceived: number;
  llmCostEur: number;
  tendersDetected: number;
  dealsActive: number;
  date: string; // ISO 8601 date
}
```

---

## 10. Bibliothèque de composants partagés

### `StatusBadge.tsx`

```tsx
// components/shared/StatusBadge.tsx
import { cn } from '@/lib/utils';
import type { AgentStatusCode, ProspectCategory } from '@/types';

type StatusValue = AgentStatusCode | ProspectCategory | 'GO' | 'POSSIBLE' | 'NO_GO' | 'PENDING';

const STATUS_CONFIG: Record<StatusValue, { label: string; className: string }> = {
  // Agent statuses
  active:   { label: 'Actif',      className: 'bg-green-500/15 text-green-400 border-green-500/30' },
  idle:     { label: 'Idle',       className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  waiting:  { label: 'En attente', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  error:    { label: 'Erreur',     className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  // Prospect categories
  HOT:          { label: 'HOT',          className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  WARM:         { label: 'WARM',         className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  COLD:         { label: 'COLD',         className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  DISQUALIFIED: { label: 'DISQUALIFIÉ',  className: 'bg-zinc-500/15 text-zinc-500 border-zinc-500/30' },
  // Tender decisions
  GO:      { label: 'GO',       className: 'bg-green-500/15 text-green-400 border-green-500/30' },
  POSSIBLE:{ label: 'POSSIBLE', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  NO_GO:   { label: 'NO-GO',    className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  PENDING: { label: 'EN ATTENTE', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

interface Props {
  status: StatusValue;
  size?: 'sm' | 'md';
  showDot?: boolean;
}

export function StatusBadge({ status, size = 'md', showDot = false }: Props) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs',
        config.className,
      )}
    >
      {showDot && (
        <span className={cn('h-1.5 w-1.5 rounded-full bg-current')} />
      )}
      {config.label}
    </span>
  );
}
```

### `MetricCard.tsx`

```tsx
// components/shared/MetricCard.tsx
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface Props {
  label: string;
  value: string | number;
  delta?: number;        // variation en % par rapport à hier
  icon?: LucideIcon;
  iconColor?: string;
  loading?: boolean;
}

export function MetricCard({ label, value, delta, icon: Icon, iconColor, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-4 animate-pulse">
        <div className="h-3 w-20 bg-muted rounded mb-3" />
        <div className="h-7 w-16 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 hover:bg-card/80 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        {Icon && <Icon className={cn('h-4 w-4', iconColor ?? 'text-muted-foreground')} />}
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {delta !== undefined && (
        <p className={cn('text-xs mt-1', delta >= 0 ? 'text-green-400' : 'text-red-400')}>
          {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs hier
        </p>
      )}
    </div>
  );
}
```

### `EventCard.tsx`

```tsx
// components/shared/EventCard.tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { cn, formatDate, formatCost } from '@/lib/utils';
import type { AgentEventRecord, AgentEventType } from '@/types/event';

const EVENT_ICONS: Record<AgentEventType, string> = {
  LEAD_DETECTED:    '🔍',
  LEAD_ENRICHED:    '📊',
  LEAD_SCORED:      '🎯',
  EMAIL_GENERATED:  '✉️',
  EMAIL_SENT:       '📨',
  LINKEDIN_ACTION:  '💼',
  REPLY_DETECTED:   '🔔',
  REPLY_INTERESSE:  '🔴',
  NURTURE_ACTION:   '🌱',
  RESCORE:          '🔄',
  RECLASSIFIED:     '⬆️',
  TENDER_DETECTED:  '🏛️',
  TENDER_SCORED:    '📋',
  TENDER_STEP:      '✅',
  DEAL_CREATED:     '💰',
  DEAL_STAGE_CHANGE:'➡️',
  DEAL_SIGNED:      '🎉',
  DEAL_LOST:        '❌',
  AGENT_ERROR:      '⚠️',
  AGENT_STARTED:    '▶️',
  AGENT_COMPLETED:  '⏹️',
  COST_ALERT:       '💸',
};

interface Props {
  event: AgentEventRecord;
  onProspectClick?: (id: string) => void;
}

export function EventCard({ event, onProspectClick }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className={cn(
        'border-b border-border/50 px-4 py-3 hover:bg-muted/30 transition-colors',
        event.severity === 'error' && 'bg-red-500/5 border-l-2 border-l-red-500',
        event.severity === 'warning' && 'bg-yellow-500/5 border-l-2 border-l-yellow-500',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5 select-none" aria-hidden>
          {EVENT_ICONS[event.eventType]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <time className="text-xs text-muted-foreground tabular-nums shrink-0">
              {formatDate(event.createdAt, 'HH:mm:ss')}
            </time>
            <span className="text-xs font-medium text-foreground">
              {event.agentSource}
              {event.agentDestination && (
                <span className="text-muted-foreground"> → {event.agentDestination}</span>
              )}
            </span>
            {event.costEur != null && event.costEur > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">
                {formatCost(event.costEur)}
              </span>
            )}
          </div>
          <p className="text-sm mt-0.5 text-foreground/90">{event.summary}</p>
          {event.prospectId && onProspectClick && (
            <button
              onClick={() => onProspectClick(event.prospectId!)}
              className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
            >
              Voir le prospect <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
        {event.payload && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={expanded ? 'Masquer les détails' : 'Voir les détails'}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
      </div>
      {expanded && event.payload && (
        <pre className="mt-3 ml-8 p-3 bg-muted rounded text-xs overflow-x-auto text-muted-foreground">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      )}
    </article>
  );
}
```

### `ActionItem.tsx`

```tsx
// components/shared/ActionItem.tsx
import { useEffect, useState } from 'react';
import { cn, formatSlaRemaining } from '@/lib/utils';
import type { ActionItem as ActionItemType } from '@/types/event';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const PRIORITY_CONFIG = {
  urgent:    { className: 'border-l-red-500 bg-red-500/5',    badge: 'bg-red-500/15 text-red-400',    label: '🔴 URGENT' },
  important: { className: 'border-l-yellow-500 bg-yellow-500/5', badge: 'bg-yellow-500/15 text-yellow-400', label: '🟡 IMPORTANT' },
  normal:    { className: 'border-l-blue-500 bg-blue-500/5',  badge: 'bg-blue-500/15 text-blue-400',  label: '🔵 NORMAL' },
  info:      { className: 'border-l-slate-500 bg-transparent',badge: 'bg-slate-500/15 text-slate-400', label: '⚪ INFO' },
};

interface Props {
  action: ActionItemType;
}

export function ActionItem({ action }: Props) {
  const queryClient = useQueryClient();
  const config = PRIORITY_CONFIG[action.priority];
  const [remainingMs, setRemainingMs] = useState(action.slaRemainingMs);

  // Countdown SLA en temps réel
  useEffect(() => {
    if (!remainingMs || remainingMs <= 0) return;
    const interval = setInterval(() => {
      setRemainingMs((prev) => (prev != null ? prev - 1000 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const completeMutation = useMutation({
    mutationFn: () => api.patch(`/api/actions/${action.id}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actions'] });
    },
  });

  return (
    <div
      className={cn(
        'border border-border border-l-4 rounded-lg p-4',
        config.className,
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={cn('text-xs font-bold px-2 py-0.5 rounded', config.badge)}>
          {config.label}
        </span>
        {remainingMs != null && remainingMs > 0 && (
          <span className={cn(
            'text-xs tabular-nums',
            remainingMs < 5 * 60 * 1000 ? 'text-red-400 font-bold' : 'text-muted-foreground',
          )}>
            SLA: {formatSlaRemaining(remainingMs)}
          </span>
        )}
      </div>
      <p className="text-sm font-medium mb-1">{action.title}</p>
      {action.description && (
        <p className="text-xs text-muted-foreground mb-3">{action.description}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {action.entityType && action.entityId && (
          <a
            href={`/${action.entityType}s/${action.entityId}`}
            className="text-xs text-primary hover:underline"
          >
            Voir {action.entityType} →
          </a>
        )}
        <button
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending}
          className="ml-auto text-xs px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors disabled:opacity-50"
        >
          {completeMutation.isPending ? '...' : '✅ Marquer traité'}
        </button>
      </div>
    </div>
  );
}
```

---

## 11. Design system

### Thème (Tailwind CSS v4 + shadcn/ui)

Le dashboard utilise un thème **sombre** (dark mode par défaut) basé sur les tokens CSS de shadcn/ui.

```css
/* src/index.css — tokens CSS custom */
@import "tailwindcss";
@import "@shadcn/ui/styles.css";

:root {
  --background: 224 71% 4%;
  --foreground: 213 31% 91%;
  --card: 224 71% 6%;
  --card-foreground: 213 31% 91%;
  --border: 216 34% 17%;
  --muted: 223 47% 11%;
  --muted-foreground: 215.4 16.3% 56.9%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 63% 31%;
  --destructive-foreground: 210 40% 98%;

  /* Couleurs spécifiques Axiom */
  --axiom-agent-active: 142 71% 45%;    /* vert */
  --axiom-agent-idle: 217 91% 60%;      /* bleu */
  --axiom-agent-waiting: 48 96% 53%;    /* jaune */
  --axiom-agent-error: 0 84% 60%;       /* rouge */
  --axiom-hot: 0 84% 60%;
  --axiom-warm: 25 95% 53%;
  --axiom-cold: 217 19% 45%;
}
```

### Conventions de composants

```typescript
// Règle #1: Toujours utiliser cn() pour les classes conditionnelles
import { cn } from '@/lib/utils';
// cn() est un wrapper clsx + tailwind-merge

// Règle #2: Variantes via cva() (class-variance-authority)
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:     'border border-input hover:bg-accent',
        ghost:       'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm:      'h-7 px-3 text-xs',
        lg:      'h-11 px-8',
        icon:    'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

// Règle #3: Composants shadcn/ui en premier (pas de réinvention)
// Dialog, Sheet, Popover, Tooltip, Badge, Button, Input, Select...
// viennent de shadcn/ui. Créer un composant custom seulement pour la logique métier.
```

### Typographie

```
Texte principal:    font-sans (Inter)
Code/JSON payload:  font-mono (JetBrains Mono)
Timestamps:         tabular-nums (chiffres à largeur fixe, pas de saut visuel)
```

---

## 12. Performance

### Virtualisation des grandes listes

Pour V2 (Timeline) et V3 (Prospects avec 10 000+ lignes), on utilise la virtualisation de TanStack Virtual pour ne rendre que les éléments visibles.

```typescript
// hooks/useVirtualTimeline.ts
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

export function useVirtualTimeline(events: AgentEventRecord[]) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // hauteur estimée d'une EventCard
    overscan: 10,           // rendre 10 éléments en dehors du viewport
  });

  return { parentRef, virtualizer };
}
```

### Gestion de la connexion SSE

```typescript
// lib/sse.ts
export class SSEClient {
  private eventSource: EventSource | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30_000;
  private listeners = new Map<string, Set<(data: unknown) => void>>();

  connect(url: string) {
    if (this.eventSource) return;

    this.eventSource = new EventSource(url, { withCredentials: true });

    this.eventSource.onopen = () => {
      this.reconnectDelay = 1000; // Reset le backoff
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Dispatcher vers les listeners par eventType
        const handlers = this.listeners.get(data.eventType);
        handlers?.forEach((handler) => handler(data));
        // Et les listeners "all"
        this.listeners.get('*')?.forEach((handler) => handler(data));
      } catch {
        // Ignorer les messages malformés
      }
    };

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      this.eventSource = null;
      // Reconnexion exponentielle avec jitter
      const jitter = Math.random() * 1000;
      setTimeout(() => this.connect(url), this.reconnectDelay + jitter);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    };
  }

  on(eventType: string, handler: (data: unknown) => void) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);
    return () => this.listeners.get(eventType)?.delete(handler);
  }

  disconnect() {
    this.eventSource?.close();
    this.eventSource = null;
    this.listeners.clear();
  }
}

// Singleton partagé dans toute l'app
export const sseClient = new SSEClient();
```

```typescript
// hooks/useSSE.ts
import { useEffect, useCallback } from 'react';
import { sseClient } from '@/lib/sse';

const SSE_URL = import.meta.env.VITE_SSE_URL ?? 'http://localhost:3000/api/events/stream';

/**
 * Hook générique pour s'abonner à un type d'événement SSE.
 * La connexion est ouverte une seule fois (singleton) et partagée.
 */
export function useSSE<T>(
  eventType: string,
  handler: (data: T) => void,
  enabled = true,
) {
  const stableHandler = useCallback(handler, []);

  useEffect(() => {
    if (!enabled) return;
    // Ouvrir la connexion si pas encore ouverte
    sseClient.connect(SSE_URL);
    // S'abonner au type d'événement
    const unsubscribe = sseClient.on(eventType, stableHandler as (data: unknown) => void);
    return unsubscribe;
  }, [eventType, stableHandler, enabled]);
}
```

```typescript
// hooks/useAgentEvents.ts — Exemple d'utilisation du SSE hook
import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSSE } from './useSSE';
import type { AgentEventRecord } from '@/types/event';

const MAX_LOCAL_EVENTS = 200; // Garder les 200 derniers en mémoire

export function useAgentEvents() {
  const queryClient = useQueryClient();
  const [liveEvents, setLiveEvents] = useState<AgentEventRecord[]>([]);

  // Écouter tous les événements (* = wildcard)
  useSSE<AgentEventRecord>('*', useCallback((event) => {
    // Ajouter en tête avec limite
    setLiveEvents((prev) => [event, ...prev].slice(0, MAX_LOCAL_EVENTS));

    // Invalider les queries concernées selon le type d'événement
    if (['LEAD_SCORED', 'RECLASSIFIED'].includes(event.eventType)) {
      queryClient.invalidateQueries({ queryKey: ['prospects'] });
    }
    if (['TENDER_SCORED', 'TENDER_STEP'].includes(event.eventType)) {
      queryClient.invalidateQueries({ queryKey: ['tenders'] });
    }
    if (['DEAL_CREATED', 'DEAL_STAGE_CHANGE'].includes(event.eventType)) {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    }
    if (event.eventType === 'REPLY_INTERESSE') {
      queryClient.invalidateQueries({ queryKey: ['actions'] });
    }
    // Toujours invalider le status agents
    queryClient.invalidateQueries({ queryKey: ['agents', 'status'] });
    queryClient.invalidateQueries({ queryKey: ['metrics', 'today'] });
  }, [queryClient]));

  return { liveEvents };
}
```

### Debounce sur les filtres de recherche

```typescript
// hooks/useProspects.ts — Debounce 300ms sur la recherche full-text
import { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProspectFilters, ProspectListResponse } from '@/types/prospect';

export function useProspects(filters: ProspectFilters) {
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timeout);
  }, [filters.search]);

  return useQuery({
    queryKey: ['prospects', { ...filters, search: debouncedSearch }],
    queryFn: () =>
      api.get<ProspectListResponse>('/api/prospects', {
        params: { ...filters, search: debouncedSearch },
      }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
```

---

## 13. Stratégie de tests

### Stack de tests

| Outil | Usage |
|-------|-------|
| Vitest | Runner de tests (compatible Vite) |
| @testing-library/react | Tests de composants |
| @testing-library/user-event | Simulation d'interactions utilisateur |
| MSW (Mock Service Worker) | Mock des requêtes API dans les tests |
| vi.fn() | Mock des fonctions (SSE, mutations) |

### Configuration `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['src/types/**', 'src/lib/utils.ts'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

### `src/test/setup.ts`

```typescript
import '@testing-library/jest-dom';
import { server } from './msw-server';

// Démarrer MSW avant tous les tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Exemple de test — `StatusBadge`

```typescript
// components/shared/__tests__/StatusBadge.test.tsx
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge';

describe('StatusBadge', () => {
  it('renders the correct label for HOT status', () => {
    render(<StatusBadge status="HOT" />);
    expect(screen.getByText('HOT')).toBeInTheDocument();
  });

  it('renders a dot when showDot is true', () => {
    const { container } = render(<StatusBadge status="active" showDot />);
    // Le dot est un span avec bg-current
    expect(container.querySelector('.rounded-full.bg-current')).toBeInTheDocument();
  });

  it('applies error color classes for error status', () => {
    const { container } = render(<StatusBadge status="error" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('text-red-400');
  });
});
```

### Exemple de test — `ActionItem` avec mutation

```typescript
// components/shared/__tests__/ActionItem.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw-server';
import { ActionItem } from '../ActionItem';
import type { ActionItem as ActionItemType } from '@/types/event';

const mockAction: ActionItemType = {
  id: 1,
  type: 'REPLY_INTERESSE',
  priority: 'urgent',
  title: 'Jean Martin a répondu positivement',
  description: 'Très intéressé, souhaite un appel',
  entityType: 'prospect',
  entityId: 'prospect-123',
  slaDeadline: new Date(Date.now() + 5 * 60_000).toISOString(),
  slaRemainingMs: 5 * 60_000,
  status: 'pending',
  createdAt: new Date().toISOString(),
};

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ActionItem', () => {
  it('displays the action title and priority', () => {
    renderWithQuery(<ActionItem action={mockAction} />);
    expect(screen.getByText('Jean Martin a répondu positivement')).toBeInTheDocument();
    expect(screen.getByText(/URGENT/)).toBeInTheDocument();
  });

  it('shows SLA countdown', () => {
    renderWithQuery(<ActionItem action={mockAction} />);
    expect(screen.getByText(/SLA:/)).toBeInTheDocument();
  });

  it('calls complete API and removes action on click', async () => {
    server.use(
      http.patch('/api/actions/1/complete', () => HttpResponse.json({ success: true })),
    );

    renderWithQuery(<ActionItem action={mockAction} />);
    await userEvent.click(screen.getByRole('button', { name: /Marquer traité/ }));

    await waitFor(() => {
      expect(screen.getByText('...')).not.toBeInTheDocument();
    });
  });
});
```

### Exemple de test — `useProspects` hook

```typescript
// hooks/__tests__/useProspects.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw-server';
import { useProspects } from '../useProspects';

const mockResponse = {
  data: [{ id: '1', companyName: 'TechCorp', score: 85, category: 'HOT' }],
  total: 1,
  page: 1,
  pageSize: 25,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useProspects', () => {
  it('fetches and returns prospect list', async () => {
    server.use(
      http.get('/api/prospects', () => HttpResponse.json(mockResponse)),
    );

    const { result } = renderHook(() => useProspects({}), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].companyName).toBe('TechCorp');
  });

  it('handles API errors gracefully', async () => {
    server.use(
      http.get('/api/prospects', () => HttpResponse.json({ message: 'Server Error' }, { status: 500 })),
    );

    const { result } = renderHook(() => useProspects({}), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

### Couverture cible

| Zone | Cible | Priorité |
|------|-------|----------|
| `types/` | Non testé | — (types statiques) |
| `lib/api.ts` | 80% | Haute |
| `lib/sse.ts` | 70% | Haute |
| `hooks/` | 75% | Haute |
| `components/shared/` | 90% | Haute |
| `components/agents/` | 60% | Moyenne |
| `components/prospects/` | 60% | Moyenne |
| `components/tenders/` | 50% | Basse |
| `components/deals/` | 50% | Basse |
| `routes/` | 40% | Basse (E2E à prévoir) |

Les tests E2E (Playwright) couvriront les parcours critiques : V7 traitement d'une action urgente, V3 recherche prospect, V5 drag-and-drop Kanban.
