# Temps Réel — Architecture SSE et Synchronisation Live

## Table des matières

1. [Architecture SSE](#1-architecture-sse)
2. [Implémentation NestJS Backend](#2-implémentation-nestjs-backend)
3. [Client SSE Frontend](#3-client-sse-frontend)
4. [Intégration TanStack Query](#4-intégration-tanstack-query)
5. [Performances et Optimisation](#5-performances-et-optimisation)
6. [Notifications](#6-notifications)
7. [Indicateur de connexion](#7-indicateur-de-connexion)
8. [Stratégie de fallback polling](#8-stratégie-de-fallback-polling)

---

## 1. Architecture SSE

### Pourquoi SSE plutôt que WebSocket

| Critère | SSE | WebSocket |
|---|---|---|
| Direction | Unidirectionnel (serveur → client) | Bidirectionnel |
| Protocole | HTTP/HTTPS standard | Upgrade vers ws:// |
| Reconnexion automatique | Oui, natif | Non, à implémenter manuellement |
| HTTP/2 multiplexing | Oui, compatible | Non (connexion séparée) |
| Proxies/firewalls | Transparent | Parfois bloqué |
| Implémentation backend | Simple (stream HTTP) | Nécessite un serveur WS dédié |
| Support navigateurs | Universel | Universel |

Pour le Dashboard Axiom, les données ne circulent que dans un sens : le backend pousse des événements vers le frontend. Le client n'envoie pas de données via le canal temps réel — il utilise les mutations REST/GraphQL habituelles pour les actions utilisateur. SSE est donc le choix naturel : plus simple, auto-reconnexion native, et pleinement compatible avec HTTP/2 (ce qui permet de multiplexer plusieurs streams sur une seule connexion TCP).

### Types d'événements streamés

```typescript
// Contrat partagé frontend/backend
export type SSEEventType =
  | 'agent_status_change'   // Un agent passe de IDLE à RUNNING, etc.
  | 'new_event'             // Nouvel événement enregistré dans la timeline
  | 'action_created'        // Une action (call, email, LinkedIn) vient d'être créée
  | 'metric_update'         // Mise à jour d'un KPI (taux conversion, pipeline, etc.)
  | 'deal_stage_change'     // Un deal avance (ou recule) dans le pipeline
  | 'heartbeat';            // Keep-alive toutes les 15s pour détecter les connexions mortes

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  payload: T;
  timestamp: string; // ISO 8601
}
```

### Format de message SSE

Le protocole SSE utilise un format texte simple sur le flux HTTP :

```
data: {"type":"agent_status_change","payload":{"agentId":"agent-001","status":"RUNNING","previousStatus":"IDLE"},"timestamp":"2026-03-23T10:15:00.000Z"}

data: {"type":"new_event","payload":{"eventId":"evt-123","agentId":"agent-001","type":"CALL_COMPLETED","dealId":"deal-456"},"timestamp":"2026-03-23T10:15:05.000Z"}

```

Les lignes vides séparent les événements. Un champ `id:` optionnel permet au client de reprendre depuis le dernier événement reçu après reconnexion (via le header `Last-Event-ID`).

### Stream unique multiplexé vs. streams multiples

**Recommandation : un seul stream multiplexé.**

Un stream par type d'événement signifierait 5 connexions SSE simultanées. Sur HTTP/1.1, les navigateurs limitent à 6 connexions par domaine — ce qui ne laisserait qu'une connexion pour les requêtes API normales. Sur HTTP/2, la limite disparaît, mais la complexité de gestion côté client reste. Un stream unique avec un champ `type` dans chaque événement est plus simple et suffisant.

---

## 2. Implémentation NestJS Backend

### Installation des dépendances

```bash
# rxjs est déjà inclus dans NestJS
# Aucune dépendance supplémentaire nécessaire pour SSE natif
```

### EventEmitter service partagé

```typescript
// src/realtime/realtime-events.service.ts
import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter, share } from 'rxjs/operators';
import { SSEEvent, SSEEventType } from './sse-event.types';

@Injectable()
export class RealtimeEventsService {
  private eventSubject = new Subject<SSEEvent>();

  // Stream partagé entre tous les abonnés SSE
  private events$ = this.eventSubject.pipe(share());

  emit<T>(type: SSEEventType, payload: T): void {
    this.eventSubject.next({
      type,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  getStream(): Observable<SSEEvent> {
    return this.events$;
  }

  getStreamForTypes(types: SSEEventType[]): Observable<SSEEvent> {
    return this.events$.pipe(
      filter((event) => types.includes(event.type)),
    );
  }
}
```

### Contrôleur SSE

```typescript
// src/realtime/realtime.controller.ts
import {
  Controller,
  Get,
  Req,
  Res,
  Sse,
  UseGuards,
  MessageEvent,
} from '@nestjs/common';
import { Observable, interval, merge } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { Request, Response } from 'express';
import { fromEvent } from 'rxjs';
import { RealtimeEventsService } from './realtime-events.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('realtime')
@UseGuards(JwtAuthGuard)
export class RealtimeController {
  constructor(private readonly realtimeEventsService: RealtimeEventsService) {}

  @Sse('events')
  streamEvents(
    @Req() req: Request,
    @Res() res: Response,
  ): Observable<MessageEvent> {
    // Récupère le dernier event ID reçu par le client (pour replay après reconnexion)
    const lastEventId = req.headers['last-event-id'] as string | undefined;

    // Heartbeat toutes les 15 secondes pour maintenir la connexion ouverte
    // et permettre la détection côté client d'une déconnexion silencieuse
    const heartbeat$ = interval(15_000).pipe(
      map(() => ({
        type: 'heartbeat' as const,
        payload: { serverTime: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      })),
    );

    // Événements métier fusionnés avec les heartbeats
    const events$ = merge(
      this.realtimeEventsService.getStream(),
      heartbeat$,
    );

    // Signal d'arrêt sur déconnexion du client
    const disconnect$ = fromEvent(req, 'close');

    return events$.pipe(
      takeUntil(disconnect$),
      map((event, index) => ({
        // L'id incrémental permet au client de reprendre depuis un point précis
        id: String(Date.now()),
        type: event.type,
        data: JSON.stringify(event),
        // retry conseillé en ms pour le client (optionnel)
        retry: 3000,
      })),
    );
  }
}
```

### Module Realtime

```typescript
// src/realtime/realtime.module.ts
import { Module } from '@nestjs/common';
import { RealtimeController } from './realtime.controller';
import { RealtimeEventsService } from './realtime-events.service';

@Module({
  controllers: [RealtimeController],
  providers: [RealtimeEventsService],
  exports: [RealtimeEventsService], // Exporté pour injection dans d'autres modules
})
export class RealtimeModule {}
```

### Émission d'événements depuis d'autres services

```typescript
// src/agents/agents.service.ts (exemple)
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';

@Injectable()
export class AgentsService {
  constructor(
    // ... autres injections
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async updateAgentStatus(agentId: string, newStatus: AgentStatus): Promise<void> {
    const previousStatus = await this.getAgentStatus(agentId);
    await this.agentRepository.update(agentId, { status: newStatus });

    // Émet un événement SSE vers tous les clients connectés
    this.realtimeEvents.emit('agent_status_change', {
      agentId,
      status: newStatus,
      previousStatus,
    });
  }

  async createAction(dto: CreateActionDto): Promise<Action> {
    const action = await this.actionRepository.save(dto);

    this.realtimeEvents.emit('action_created', {
      actionId: action.id,
      agentId: action.agentId,
      dealId: action.dealId,
      type: action.type,
      urgency: action.urgency,
    });

    return action;
  }
}
```

### Configuration CORS pour SSE

```typescript
// main.ts — ajouter les headers nécessaires pour SSE
app.enableCors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  exposedHeaders: ['Content-Type', 'Cache-Control', 'X-Accel-Buffering'],
});
```

### Header nginx critique pour SSE

```nginx
# Désactive le buffering nginx — sinon les événements SSE sont mis en tampon
# et n'arrivent pas en temps réel au client
proxy_set_header X-Accel-Buffering no;
proxy_buffering off;
proxy_cache off;
```

---

## 3. Client SSE Frontend

### Hook `useSSE` — connexion bas niveau

```typescript
// src/hooks/useSSE.ts
import { useEffect, useRef, useCallback } from 'react';

type SSEStatus = 'CONNECTING' | 'OPEN' | 'CLOSED' | 'RECONNECTING';

interface UseSSEOptions {
  url: string;
  onEvent: (event: MessageEvent) => void;
  onStatusChange?: (status: SSEStatus) => void;
  enabled?: boolean;
  /** Délai initial avant reconnexion en ms (défaut: 1000) */
  initialRetryDelay?: number;
  /** Délai maximum entre tentatives en ms (défaut: 30000) */
  maxRetryDelay?: number;
}

export function useSSE({
  url,
  onEvent,
  onStatusChange,
  enabled = true,
  initialRetryDelay = 1_000,
  maxRetryDelay = 30_000,
}: UseSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryDelayRef = useRef(initialRetryDelay);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!isMountedRef.current || !enabled) return;

    onStatusChange?.('CONNECTING');

    // Le navigateur envoie automatiquement Last-Event-ID si l'EventSource a déjà
    // reçu des événements — permet la reprise après reconnexion
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      if (!isMountedRef.current) return;
      retryDelayRef.current = initialRetryDelay; // Reset backoff on successful connection
      onStatusChange?.('OPEN');
    };

    es.onmessage = (event) => {
      if (!isMountedRef.current) return;
      onEvent(event);
    };

    // Écoute aussi les événements nommés (type: 'agent_status_change', etc.)
    const eventTypes: string[] = [
      'agent_status_change',
      'new_event',
      'action_created',
      'metric_update',
      'deal_stage_change',
      'heartbeat',
    ];

    eventTypes.forEach((type) => {
      es.addEventListener(type, (event) => {
        if (!isMountedRef.current) return;
        onEvent(event as MessageEvent);
      });
    });

    es.onerror = () => {
      if (!isMountedRef.current) return;

      es.close();
      eventSourceRef.current = null;
      onStatusChange?.('RECONNECTING');

      // Exponential backoff avec jitter pour éviter les reconnexions simultanées
      const jitter = Math.random() * 500;
      const delay = Math.min(retryDelayRef.current + jitter, maxRetryDelay);
      retryDelayRef.current = Math.min(retryDelayRef.current * 2, maxRetryDelay);

      retryTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) connect();
      }, delay);
    };
  }, [url, enabled, onEvent, onStatusChange, initialRetryDelay, maxRetryDelay]);

  useEffect(() => {
    isMountedRef.current = true;

    if (enabled) connect();

    return () => {
      isMountedRef.current = false;

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      onStatusChange?.('CLOSED');
    };
  }, [connect, enabled]);
}
```

### Hook `useAgentEvents` — intégration avec TanStack Query

```typescript
// src/hooks/useAgentEvents.ts
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSSE } from './useSSE';
import { useNotifications } from './useNotifications';
import type { SSEEvent, SSEEventType, SSEStatus } from '../types/sse.types';

const SSE_URL = `${import.meta.env.VITE_API_URL}/realtime/events`;

export function useAgentEvents() {
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<SSEStatus>('CONNECTING');
  const { notifyUrgentAction } = useNotifications();

  const handleEvent = useCallback(
    (messageEvent: MessageEvent) => {
      let parsed: SSEEvent;

      try {
        parsed = JSON.parse(messageEvent.data) as SSEEvent;
      } catch {
        // Ignore les messages malformés (heartbeat sans data, etc.)
        return;
      }

      switch (parsed.type) {
        case 'agent_status_change': {
          // Invalide les requêtes agents pour forcer un refetch
          queryClient.invalidateQueries({ queryKey: ['agents'] });
          queryClient.invalidateQueries({
            queryKey: ['agent', parsed.payload.agentId],
          });
          break;
        }

        case 'new_event': {
          // Ajoute l'événement directement dans le cache sans refetch
          queryClient.setQueryData<EventsPage>(
            ['events', 'timeline'],
            (old) => {
              if (!old) return old;
              return {
                ...old,
                pages: [
                  {
                    ...old.pages[0],
                    items: [parsed.payload, ...old.pages[0].items].slice(0, 50),
                  },
                  ...old.pages.slice(1),
                ],
              };
            },
          );
          break;
        }

        case 'action_created': {
          queryClient.invalidateQueries({ queryKey: ['actions', 'pending'] });

          // Notification sonore si l'action est urgente
          if (parsed.payload.urgency === 'HIGH') {
            notifyUrgentAction(parsed.payload);
          }
          break;
        }

        case 'metric_update': {
          // Mise à jour optimiste directe dans le cache
          queryClient.setQueryData(
            ['metrics', parsed.payload.metricId],
            parsed.payload,
          );
          break;
        }

        case 'deal_stage_change': {
          queryClient.invalidateQueries({ queryKey: ['deals'] });
          queryClient.invalidateQueries({
            queryKey: ['deal', parsed.payload.dealId],
          });
          break;
        }

        case 'heartbeat': {
          // Le heartbeat confirme que la connexion est vivante — pas d'action côté cache
          break;
        }
      }
    },
    [queryClient, notifyUrgentAction],
  );

  useSSE({
    url: SSE_URL,
    onEvent: handleEvent,
    onStatusChange: setConnectionStatus,
    enabled: true,
  });

  return { connectionStatus };
}
```

### Gestion des états de connexion

```typescript
// src/types/sse.types.ts
export type SSEStatus = 'CONNECTING' | 'OPEN' | 'CLOSED' | 'RECONNECTING';

// Correspondance état → affichage UI
export const SSE_STATUS_LABELS: Record<SSEStatus, string> = {
  CONNECTING: 'Connexion en cours...',
  OPEN: 'Connecté',
  CLOSED: 'Déconnecté',
  RECONNECTING: 'Reconnexion...',
};

export const SSE_STATUS_COLORS: Record<SSEStatus, string> = {
  CONNECTING: 'yellow',
  OPEN: 'green',
  CLOSED: 'red',
  RECONNECTING: 'orange',
};
```

---

## 4. Intégration TanStack Query

### Pattern de mise à jour optimiste

Quand un événement SSE arrive, il est préférable de mettre à jour le cache directement plutôt que de déclencher un refetch réseau, surtout pour les métriques numériques.

```typescript
// Mise à jour directe du cache (zero network request)
queryClient.setQueryData<MetricValue>(
  ['metrics', 'pipeline-value'],
  (old) => ({
    ...old,
    value: event.payload.newValue,
    updatedAt: event.payload.timestamp,
  }),
);
```

### Pattern d'invalidation ciblée

Pour les données complexes (listes paginées, relations imbriquées), invalider la query est plus sûr que tenter une mise à jour partielle.

```typescript
// Invalide seulement les queries affectées par l'événement
queryClient.invalidateQueries({
  queryKey: ['agents'],
  // refetchType: 'active' — refetch uniquement les queries actuellement montées
  // Ne pas refetch les queries en background ou inactives
  refetchType: 'active',
});
```

### Configuration recommandée de QueryClient pour le temps réel

```typescript
// src/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Les données ne deviennent jamais "stale" immédiatement —
      // on laisse SSE déclencher les invalidations
      staleTime: 60_000, // 1 minute

      // Garde les données précédentes en mémoire 5 minutes après démontage
      gcTime: 5 * 60_000,

      // Pas de refetch automatique en background — SSE s'en charge
      refetchOnWindowFocus: false,
      refetchInterval: false,

      // Retry 3 fois en cas d'erreur réseau
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    },
  },
});
```

### Stale-While-Revalidate pour données historiques

Les données historiques (timeline passée, métriques archivées) ne reçoivent pas de mises à jour SSE. Utiliser une stratégie SWR classique :

```typescript
function useHistoricalMetrics(dateRange: DateRange) {
  return useQuery({
    queryKey: ['metrics', 'historical', dateRange],
    queryFn: () => fetchHistoricalMetrics(dateRange),
    staleTime: 5 * 60_000,       // Considéré frais pendant 5 min
    gcTime: 30 * 60_000,         // Garde en cache 30 min
    placeholderData: keepPreviousData, // Affiche les données précédentes pendant le chargement
  });
}
```

---

## 5. Performances et Optimisation

### Limite de connexions SSE par navigateur

- **HTTP/1.1** : 6 connexions par domaine. Un seul stream SSE consomme une de ces 6 connexions.
- **HTTP/2** : Pas de limite pratique (multiplexing). Avec nginx + HTTP/2, le problème disparaît.

Action : activer HTTP/2 sur nginx (voir `13-deploiement.md`).

### Event batching — agrégation sur fenêtre de 1 seconde

Quand plusieurs événements arrivent en rafale (ex: 20 agents qui changent de statut simultanément), invalider 20 fois la même query en 50ms est inutile. Regrouper les invalidations :

```typescript
// src/hooks/useAgentEvents.ts — version avec batching
import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useAgentEventsBatched() {
  const queryClient = useQueryClient();

  // Buffer des invalidations à appliquer
  const pendingInvalidations = useRef(new Set<string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleInvalidation = useCallback(
    (queryKey: string) => {
      pendingInvalidations.current.add(queryKey);

      // Regroupe toutes les invalidations dans une fenêtre de 100ms
      if (!flushTimer.current) {
        flushTimer.current = setTimeout(() => {
          const keys = Array.from(pendingInvalidations.current);
          pendingInvalidations.current.clear();
          flushTimer.current = null;

          // Toutes les invalidations en une seule passe React
          keys.forEach((key) => {
            queryClient.invalidateQueries({ queryKey: key.split('.') });
          });
        }, 100);
      }
    },
    [queryClient],
  );

  return { scheduleInvalidation };
}
```

### Virtual scrolling pour la timeline

La timeline peut contenir des centaines d'événements. Rendre tous les DOM nodes est prohibitif. Utiliser TanStack Virtual :

```typescript
// src/components/EventTimeline.tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

interface EventTimelineProps {
  events: TimelineEvent[];
  onLoadMore: () => void;
}

export function EventTimeline({ events, onLoadMore }: EventTimelineProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // Hauteur estimée d'une ligne en pixels
    overscan: 10,           // Rend 10 items supplémentaires hors viewport
  });

  return (
    <div
      ref={parentRef}
      style={{ height: '600px', overflow: 'auto' }}
    >
      {/* Conteneur total — donne la bonne hauteur à la scrollbar */}
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const event = events[virtualItem.index];
          return (
            <div
              key={event.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <EventTimelineItem event={event} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### Gestion mémoire — plafonner à 1000 événements

```typescript
// src/hooks/useEventTimeline.ts
import { useInfiniteQuery } from '@tanstack/react-query';

const MAX_EVENTS_IN_MEMORY = 1_000;

export function useEventTimeline() {
  return useInfiniteQuery({
    queryKey: ['events', 'timeline'],
    queryFn: ({ pageParam = 0 }) => fetchEvents({ offset: pageParam, limit: 50 }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextOffset : undefined,

    // Limite le nombre total de pages gardées en mémoire
    maxPages: Math.ceil(MAX_EVENTS_IN_MEMORY / 50), // 20 pages × 50 items = 1000

    initialPageParam: 0,
  });
}
```

### Éviter le re-render inutile des composants enfants

```typescript
// Mémoïse les callbacks passés aux items de la liste
const handleEventClick = useCallback((eventId: string) => {
  navigate(`/events/${eventId}`);
}, [navigate]);

// Mémoïse les items individuels pour éviter le re-render sur SSE
const EventTimelineItem = memo(function EventTimelineItem({ event }: { event: TimelineEvent }) {
  return (/* ... */);
});
```

---

## 6. Notifications

### Notifications sonores pour actions URGENTES (Web Audio API)

```typescript
// src/lib/audioNotifications.ts

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  // Resume le contexte si suspendu (politique autoplay des navigateurs)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

/**
 * Joue un bip d'alerte pour les actions urgentes.
 * Synthèse sonore sans fichier audio externe.
 */
export function playUrgentActionSound(): void {
  try {
    const ctx = getAudioContext();

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);         // La4 — début
    oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);  // Montée
    oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.2);   // Retour

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.4);
  } catch (error) {
    // Silently fail — les notifications sonores ne doivent jamais casser l'UI
    console.warn('Audio notification failed:', error);
  }
}
```

### Notifications navigateur (background tab)

```typescript
// src/lib/browserNotifications.ts

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;

  if (Notification.permission === 'granted') return true;

  if (Notification.permission === 'denied') return false;

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

export function sendBrowserNotification(
  title: string,
  options: { body: string; icon?: string; tag?: string },
): void {
  if (Notification.permission !== 'granted') return;

  // Si l'onglet est visible, pas besoin de notification système
  if (document.visibilityState === 'visible') return;

  const notification = new Notification(title, {
    body: options.body,
    icon: options.icon ?? '/favicon.ico',
    tag: options.tag, // Les notifications avec le même tag se remplacent (pas d'empilement)
  });

  // Auto-fermeture après 5 secondes
  setTimeout(() => notification.close(), 5_000);

  // Clic sur la notification → focus l'onglet
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
```

### Hook useNotifications

```typescript
// src/hooks/useNotifications.ts
import { useEffect, useCallback } from 'react';
import { playUrgentActionSound } from '../lib/audioNotifications';
import {
  requestNotificationPermission,
  sendBrowserNotification,
} from '../lib/browserNotifications';

export function useNotifications() {
  useEffect(() => {
    // Demande la permission au montage du composant racine
    requestNotificationPermission();
  }, []);

  const notifyUrgentAction = useCallback(
    (action: { type: string; dealId: string; urgency: string }) => {
      playUrgentActionSound();

      sendBrowserNotification('Action urgente requise', {
        body: `Action ${action.type} sur le deal ${action.dealId}`,
        tag: `urgent-action-${action.dealId}`,
      });
    },
    [],
  );

  return { notifyUrgentAction };
}
```

---

## 7. Indicateur de connexion

```typescript
// src/components/ConnectionIndicator.tsx
import type { SSEStatus } from '../types/sse.types';
import { SSE_STATUS_LABELS } from '../types/sse.types';

interface ConnectionIndicatorProps {
  status: SSEStatus;
}

export function ConnectionIndicator({ status }: ConnectionIndicatorProps) {
  const colorMap: Record<SSEStatus, string> = {
    CONNECTING: 'bg-yellow-400 animate-pulse',
    OPEN: 'bg-green-500',
    CLOSED: 'bg-red-500',
    RECONNECTING: 'bg-orange-400 animate-pulse',
  };

  return (
    <div className="flex items-center gap-2" title={SSE_STATUS_LABELS[status]}>
      <span
        className={`h-2 w-2 rounded-full ${colorMap[status]}`}
        aria-hidden="true"
      />
      <span className="text-xs text-muted-foreground hidden sm:inline">
        {SSE_STATUS_LABELS[status]}
      </span>
    </div>
  );
}
```

Intégration dans la navigation :

```typescript
// src/components/DashboardHeader.tsx
import { useAgentEvents } from '../hooks/useAgentEvents';
import { ConnectionIndicator } from './ConnectionIndicator';

export function DashboardHeader() {
  const { connectionStatus } = useAgentEvents();

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b">
      <h1 className="text-lg font-semibold">Axiom Dashboard</h1>
      <div className="flex items-center gap-4">
        {/* ... autres éléments du header */}
        <ConnectionIndicator status={connectionStatus} />
      </div>
    </header>
  );
}
```

---

## 8. Stratégie de fallback polling

Si la connexion SSE échoue de manière répétée (réseau instable, proxy incompatible), basculer automatiquement vers un polling HTTP toutes les 30 secondes.

```typescript
// src/hooks/useRealtimeWithFallback.ts
import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSSE } from './useSSE';

const SSE_FAILURE_THRESHOLD = 5; // Nombre d'échecs avant de basculer en polling
const POLLING_INTERVAL_MS = 30_000;

type RealtimeMode = 'SSE' | 'POLLING';

export function useRealtimeWithFallback() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<RealtimeMode>('SSE');
  const failureCountRef = useRef(0);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Quand SSE passe en RECONNECTING, incrémente le compteur d'échecs
  const handleStatusChange = (status: string) => {
    if (status === 'RECONNECTING') {
      failureCountRef.current += 1;

      if (failureCountRef.current >= SSE_FAILURE_THRESHOLD) {
        console.warn(
          `[Realtime] SSE failed ${SSE_FAILURE_THRESHOLD} times, switching to polling`,
        );
        setMode('POLLING');
      }
    } else if (status === 'OPEN') {
      failureCountRef.current = 0;
    }
  };

  // Mode SSE (par défaut)
  useSSE({
    url: `${import.meta.env.VITE_API_URL}/realtime/events`,
    onEvent: () => { /* géré par useAgentEvents */ },
    onStatusChange: handleStatusChange,
    enabled: mode === 'SSE',
  });

  // Mode fallback polling
  useEffect(() => {
    if (mode !== 'POLLING') return;

    const poll = async () => {
      // Invalide toutes les queries actives pour forcer un refetch
      await queryClient.invalidateQueries({ refetchType: 'active' });
    };

    poll(); // Immédiatement au basculement
    pollingTimerRef.current = setInterval(poll, POLLING_INTERVAL_MS);

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, [mode, queryClient]);

  // Tentative de retour au SSE après 2 minutes en mode polling
  useEffect(() => {
    if (mode !== 'POLLING') return;

    const retrySSETimer = setTimeout(() => {
      failureCountRef.current = 0;
      setMode('SSE');
    }, 2 * 60_000);

    return () => clearTimeout(retrySSETimer);
  }, [mode]);

  return { realtimeMode: mode };
}
```

### Indicateur de mode dans le header

```typescript
// Affiche le mode temps réel actif dans le ConnectionIndicator
export function ConnectionIndicator({
  status,
  mode,
}: {
  status: SSEStatus;
  mode: RealtimeMode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${colorMap[status]}`} />
      <span className="text-xs text-muted-foreground hidden sm:inline">
        {mode === 'POLLING' ? 'Polling (30s)' : SSE_STATUS_LABELS[status]}
      </span>
    </div>
  );
}
```
