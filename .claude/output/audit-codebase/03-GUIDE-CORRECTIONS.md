# 03 — Guide de Corrections — Détail Technique

Chaque fix est documenté avec : le fichier exact, le code à modifier, le pourquoi, et le résultat attendu.

---

## Phase 1 — Sécurité Urgente

### Fix B7 — Rotation clé API Anthropic

**Fichier :** `.env:17`
**Action :**
1. Aller sur https://console.anthropic.com/settings/keys
2. Révoquer la clé `sk-ant-api03-c5LI6o...`
3. Générer une nouvelle clé
4. Mettre à jour `.env` avec la nouvelle clé
5. Vérifier : `git log --all -- .env` — si commité, considérer la clé compromise

**Pourquoi :** Une clé API exposée permet à n'importe qui de faire des appels Claude facturés sur votre compte.

---

### Fix C8 — JWT secret validation

**Fichier :** `src/core/config/jwt.config.ts`
**Modification :**
```typescript
// AVANT
secret: z.string().min(1),

// APRÈS
secret: z.string().min(32).refine(
  (val) => !val.includes('CHANGE_ME') && !val.startsWith('dev-'),
  { message: 'JWT_SECRET must be a random string, not a placeholder' }
),
```

**Pourquoi :** Empêche le déploiement en production avec le placeholder `.env.example` ou un secret de dev.

---

### Fix C9 — AuthModule lire config validé

**Fichiers :** `src/modules/auth/auth.module.ts:15` et `src/modules/auth/strategies/jwt.strategy.ts:24`
**Modification :**
```typescript
// AVANT
secret: configService.getOrThrow<string>('JWT_SECRET'),

// APRÈS
secret: configService.getOrThrow<string>('jwt.secret'),
```

**Pourquoi :** Le namespace `jwt` passe par la validation Zod. L'env brut `JWT_SECRET` la bypass.

---

### Fix C10 — Password policy

**Fichier :** `src/modules/auth/dtos/auth.dto.ts`
**Modification :**
```typescript
// AVANT
password: z.string().min(8),

// APRÈS
password: z.string().min(8).regex(
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]).{8,}$/,
  'Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial'
),
```

---

## Phase 2 — Pipeline BullMQ

### Fix B13 — SuiveurProcessor case message.generated

**Fichier :** `src/modules/agent-suiveur/infrastructure/jobs/suiveur.processor.ts`
**Modification :** Ajouter après le block `if (job.name === 'detect-responses')` :
```typescript
if (job.name === 'message.generated') {
  await this.suiveurService.executeSequenceStep({
    prospectId: job.data.prospectId,
    sequenceId: job.data.sequenceId,
  });
  return;
}
```

**Pourquoi :** Le `RedacteurService` dispatche `message.generated` quand un email est prêt. Sans ce case, l'email est généré mais jamais envoyé.

**Validation :** Dispatcher manuellement un job `message.generated` et vérifier qu'il est traité.

---

### Fix B14 — NurtureurProcessor case nurture-prospect

**Fichier :** `src/modules/agent-nurtureur/infrastructure/jobs/nurtureur.processor.ts`
**Modification :** Ajouter dans le switch :
```typescript
case 'nurture-prospect':
  await this.nurtureurService.startNurture(job.data);
  break;
```

**Pourquoi :** Le `ScoreurService` dispatche `nurture-prospect` pour les prospects WARM/COLD. Sans ce case, ces prospects ne sont jamais nurtured.

---

### Fix B12 — detectResponses query vide

**Fichier :** `src/modules/agent-suiveur/application/services/suiveur.service.ts:152-170`
**Problème :** La méthode appelle `findByProspectId('')` avec un string vide.
**Fix :** Remplacer par une query qui cherche les emails non lus récents :
```typescript
async detectResponses(): Promise<void> {
  // Chercher les emails envoyés récemment (dernières 24h)
  const recentSends = await this.messageSendRepository.findRecent(24);
  // Pour chaque envoi, checker s'il y a une réponse
  for (const send of recentSends) {
    // ... logic de détection
  }
}
```

**Pourquoi :** Avec un prospectId vide, aucune réponse n'est jamais matchée.

---

### Fix B15 — CSM onboarding payload

**Fichier :** `src/modules/agent-dealmaker/application/services/dealmaker.service.ts:60-70`
**Modification :**
```typescript
// AVANT
await this.csmOnboardingQueue.add('onboard-customer', {
  dealId: deal.id,
  prospectId: deal.prospectId,
});

// APRÈS
const prospect = await this.prisma.prospect.findUnique({
  where: { id: deal.prospectId },
});
await this.csmOnboardingQueue.add('onboard-customer', {
  dealId: deal.id,
  prospectId: deal.prospectId,
  companyName: prospect?.companyName ?? 'Unknown',
  mrrEur: deal.value ?? 0,
});
```

**Pourquoi :** Le `CsmProcessor` requiert `companyName` et `mrrEur > 0` pour traiter l'onboarding.

---

### Fix C13 — Dead Letter Queue

**Fichiers :**
1. `src/app.module.ts` — ajouter dans BullModule.forRootAsync defaultJobOptions :
```typescript
defaultJobOptions: {
  // ... existant ...
  removeOnFail: false, // Ne plus supprimer les jobs échoués
},
```

2. Créer `src/core/scheduler/dead-letter.processor.ts` :
```typescript
@Processor(QUEUE_NAMES.DEAD_LETTER_QUEUE)
export class DeadLetterProcessor extends WorkerHost {
  async process(job: Job): Promise<void> {
    this.logger.error({
      msg: 'Job failed permanently',
      originalQueue: job.data.originalQueue,
      jobName: job.name,
      failedReason: job.failedReason,
    });
    // TODO: Alerter via Slack
  }
}
```

---

## Phase 3 — Routes Backend Manquantes

### Fix B1 — GET /agents/appels-offres (liste tenders)

**Fichier :** `src/modules/agent-appels-offres/presentation/controllers/appels-offres.controller.ts`
**Ajouter :**
```typescript
@Get()
async listTenders() {
  return this.prisma.publicTender.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
```

---

### Fix B2 — GET /agents/appels-offres/tenders/:id

**Fichier :** Même controller
**Ajouter :**
```typescript
@Get('tenders/:id')
async getTender(@Param('id') id: string) {
  const tender = await this.prisma.publicTender.findUnique({ where: { id } });
  if (!tender) throw new NotFoundException('Tender not found');
  return tender;
}
```

---

### Fix B3 — GET /agents/dealmaker/deals

**Fichier :** `src/modules/agent-dealmaker/presentation/controllers/dealmaker.controller.ts`
**Ajouter :**
```typescript
@Get('deals')
async listDeals() {
  return this.prisma.dealCrm.findMany({
    orderBy: { updatedAt: 'desc' },
  });
}
```

---

### Fix B4 — Aligner method+path deal stage

**Option recommandée :** Modifier le frontend pour matcher le backend existant.
**Fichier :** `dashboard/src/hooks/useDeals.ts:14`
```typescript
// AVANT
mutationFn: ({ id, stage }: { id: string; stage: DealStage }) =>
  api.patch<Deal>(`/api/agents/dealmaker/deals/${id}`, { stage }),

// APRÈS
mutationFn: ({ id, stage }: { id: string; stage: DealStage }) =>
  api.put<Deal>(`/api/agents/dealmaker/deals/${id}/stage`, { stage }),
```

Note : ajouter `put<T>` dans `api.ts` si manquant (probablement déjà présent — `api.patch` → `api.put`).

---

### Fix B5 — GET /api/dashboard/action-items

**Fichier :** `src/modules/dashboard/dashboard.controller.ts`
**Ajouter :**
```typescript
@Get('action-items')
async getActionItems() {
  return this.dashboardService.getPendingActionItems();
}
```

**Fichier :** `src/modules/dashboard/dashboard.service.ts`
**Ajouter :**
```typescript
async getPendingActionItems() {
  // Agréger les actions en attente de décision humaine
  // - Réponses prospects non traitées
  // - Décisions GO/NO-GO tenders en attente
  // - Devis à valider
  const replies = await this.prisma.replyClassification.findMany({
    where: { /* non traité */ },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  // Mapper vers ActionItem[] format
  return replies.map(r => ({
    id: r.id,
    priority: r.sentiment === 'POSITIVE' ? 'URGENT' : 'NORMAL',
    title: `Réponse prospect`,
    description: r.category ?? '',
    entityType: 'prospect',
    entityId: r.prospectId,
    entityName: '', // Enrichir depuis prospect
    slaDeadline: null,
    createdAt: r.createdAt.toISOString(),
    status: 'PENDING',
  }));
}
```

**Fichier frontend :** `dashboard/src/hooks/useActionItems.ts:8`
```typescript
// AVANT
queryFn: () => api.get<ActionItem[]>('/api/dashboard/metrics'),

// APRÈS
queryFn: () => api.get<ActionItem[]>('/api/dashboard/action-items'),
```

---

### Fix B6 — GET /api/dashboard/agents/graph

**Fichier :** `src/modules/dashboard/dashboard.controller.ts`
**Ajouter :**
```typescript
@Get('agents/graph')
async getAgentGraph() {
  return this.dashboardService.getAgentGraph();
}
```

**Fichier :** `src/modules/dashboard/dashboard.service.ts`
**Ajouter :**
```typescript
async getAgentGraph() {
  const agents = await this.getAgentStatuses();
  const nodes = agents.map((agent, i) => ({
    id: agent.name,
    name: agent.name,
    status: agent.status,
    position: AGENT_POSITIONS[agent.name] ?? { x: i * 150, y: 0 },
    metrics: { messagesIn: 0, messagesOut: 0, avgLatencyMs: 0 },
  }));
  const edges = [
    { source: 'veilleur', target: 'enrichisseur', messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
    { source: 'enrichisseur', target: 'scoreur', messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
    { source: 'scoreur', target: 'redacteur', messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
    { source: 'scoreur', target: 'nurtureur', messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
    { source: 'redacteur', target: 'suiveur', messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
    { source: 'dealmaker', target: 'csm', messageCount: 0, dataVolumeKb: 0, lastMessages: [] },
  ];
  return { nodes, edges };
}

const AGENT_POSITIONS: Record<string, { x: number; y: number }> = {
  'veilleur': { x: 250, y: 0 },
  'enrichisseur': { x: 250, y: 100 },
  'scoreur': { x: 250, y: 200 },
  'redacteur': { x: 100, y: 300 },
  'suiveur': { x: 100, y: 400 },
  'nurtureur': { x: 400, y: 300 },
  'analyste': { x: 500, y: 200 },
  'dealmaker': { x: 100, y: 500 },
  'appels-offres': { x: 500, y: 0 },
  'csm': { x: 100, y: 600 },
};
```

**Fichier frontend :** `dashboard/src/hooks/useAgentGraph.ts`
```typescript
// AVANT
queryFn: () => api.get<{ nodes: AgentNode[]; edges: AgentEdge[] }>('/api/dashboard/agents'),

// APRÈS
queryFn: () => api.get<{ nodes: AgentNode[]; edges: AgentEdge[] }>('/api/dashboard/agents/graph'),
```

---

## Phase 4 — Auth + Frontend Architecture

### Fix B19 — useAuth → React Context

**Fichier :** `dashboard/src/hooks/useAuth.ts`
**Réécriture complète :**
```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    const stored = localStorage.getItem('auth_token');
    if (stored) api.setToken(stored);
    return stored;
  });

  const login = async (email: string, password: string) => {
    const response = await api.post<{ accessToken: string; refreshToken: string }>(
      '/api/auth/login', { email, password }
    );
    localStorage.setItem('auth_token', response.accessToken);
    localStorage.setItem('refresh_token', response.refreshToken);
    api.setToken(response.accessToken);
    setToken(response.accessToken);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    api.setToken(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

**Fichier :** `dashboard/src/app.tsx` — wrapper AuthProvider autour de tout :
```tsx
export function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        ...
      </QueryClientProvider>
    </AuthProvider>
  );
}
```

---

### Fix B17 — Intercepteur 401 dans api.ts

**Fichier :** `dashboard/src/lib/api.ts`
**Ajouter dans la méthode `request` :**
```typescript
if (!response.ok) {
  if (response.status === 401) {
    // Tenter refresh
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        const refreshResponse = await fetch(`${BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          const newToken = data.data?.accessToken ?? data.accessToken;
          localStorage.setItem('auth_token', newToken);
          this.token = newToken;
          // Retry la requête originale
          headers['Authorization'] = `Bearer ${newToken}`;
          const retryResponse = await fetch(`${BASE_URL}${path}`, { ...options, headers });
          if (retryResponse.ok) {
            const json = await retryResponse.json();
            return json.data ?? json;
          }
        }
      } catch { /* refresh failed */ }
    }
    // Refresh échoué → clear + redirect
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    this.token = null;
    window.location.href = '/login';
  }
  // ... rest of error handling
}
```

---

### Fix B18 — SSE memory leak

**Fichier :** `dashboard/src/lib/sse.ts`
```typescript
export class SSEClient {
  private source: EventSource | null = null;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null; // AJOUTÉ
  // ...

  connect(): void {
    this.source = new EventSource(this.url);
    // ...
    this.source.onerror = (error) => {
      this.source?.close();
      this.onError?.(error);
      if (this.retryCount < this.maxRetries) {
        const delay = this.baseDelay * Math.pow(2, this.retryCount);
        this.retryCount++;
        this.retryTimer = setTimeout(() => this.connect(), delay); // MODIFIÉ
      }
    };
  }

  disconnect(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer); // AJOUTÉ
    this.retryTimer = null; // AJOUTÉ
    this.source?.close();
    this.source = null;
    this.retryCount = 0;
  }
}
```

---

### Fix B20 — SSE avec token query param

**Option la plus simple :**
**Fichier :** `dashboard/src/lib/sse.ts`
```typescript
connect(): void {
  const token = localStorage.getItem('auth_token');
  const url = token ? `${this.url}?token=${encodeURIComponent(token)}` : this.url;
  this.source = new EventSource(url);
  // ...
}
```

**Fichier backend :** `src/modules/dashboard/dashboard.controller.ts`
```typescript
import { Public } from '@common/decorators/public.decorator';

@Public() // SSE exempt du JWT guard standard
@Sse('stream')
stream(@Query('token') token?: string): Observable<MessageEvent> {
  // Validation manuelle du token si fourni
  if (token) {
    // this.jwtService.verify(token) — vérifier la signature
  }
  return interval(10000).pipe(
    map(() => ({ data: { type: 'heartbeat', timestamp: new Date().toISOString() } }) as MessageEvent),
  );
}
```

---

## Phase 5 — Data Contract Alignment

### Fix C1 — Metrics → DailyMetrics[]

**Fichier :** `src/modules/dashboard/dashboard.service.ts`
```typescript
async getDailyMetrics(): Promise<DailyMetrics[]> {
  const metrics = await this.prisma.metriquesDaily.findMany({
    orderBy: { date: 'desc' },
    take: 30,
  });
  return metrics.map(m => ({
    date: m.date.toISOString().split('T')[0],
    leadsDetected: m.prospectCount ?? 0,
    // ... mapper les champs
  }));
}
```

### Fix C5 — DealStage enum alignment

**Choix :** Utiliser les valeurs Prisma comme source de vérité.
- **Prisma :** Garder tel quel (discovery, proposal, negotiation, closed_won, closed_lost)
- **Backend entity :** Aligner sur Prisma
- **Frontend :** Aligner sur Prisma (renommer les colonnes du Kanban)

---

## Phase 6 — Sécurité Avancée

### Fix C7 — Appeler validateExternalUrl dans les adapters

**Pattern à appliquer dans chaque adapter (INSEE, BODACC, INPI, BOAMP) :**
```typescript
import { validateExternalUrl } from '@common/utils/url-validator';

// Dans le constructeur ou avant chaque requête
constructor(...) {
  validateExternalUrl(this.baseUrl); // Validation au démarrage
}
```

### Fix C11 — PII redaction

**Fichier :** `src/core/logger/pino.config.ts`
```typescript
redact: {
  paths: [
    // Existants...
    'email', '*.email', 'to', '*.to',
    'firstName', '*.firstName',
    'lastName', '*.lastName',
    'phone', '*.phone',
  ],
  censor: '[REDACTED]',
}
```

---

## Phase 7 — Performance + UX

### Fix S4 — DeadlineCountdown J négatif

**Fichier :** `dashboard/src/routes/tenders/index.tsx:44-47`
```typescript
if (days <= 0) return <span className="text-red-600 font-medium">Expiré</span>;
```

### Fix S6 — Index Prisma manquants

**Fichier :** `prisma/schema.prisma`
```prisma
model ReplyClassification {
  // ... champs existants
  @@index([prospectId])
}

model NurtureInteraction {
  // ... champs existants
  @@index([nurtureId])
  @@index([prospectId])
}
```

Puis : `npx prisma migrate dev --name add-missing-indexes`
