# 01 — Audit Complet — Tous les Findings

**Date :** 24 mars 2026
**Verdict :** REQUEST CHANGES
**Total findings :** 45 (20 BLOCKING + 17 CRITICAL + 8 SUGGESTIONS)

---

## BLOCKING Issues (20) — Must Fix

### B1 — Route manquante : GET /api/agents/appels-offres (Liste tenders)

| Attribut | Détail |
|----------|--------|
| **Domaine** | API Contract |
| **Frontend** | `dashboard/src/hooks/useTenders.ts:8` |
| **Backend** | `src/modules/agent-appels-offres/presentation/controllers/appels-offres.controller.ts` |
| **Sévérité** | BLOCKING — 404 à chaque visite de la page Marchés Publics |

**Contexte :** Le hook `useTenders` appelle `GET /api/agents/appels-offres` pour lister tous les marchés publics. Le controller `AppelsOffresController` ne définit que `POST tenders/:id/analyze` et `GET tenders/:id/analysis`. Aucune route de liste n'existe.

**Impact :** La page V4 Marchés Publics est totalement inaccessible — erreur 404 à chaque chargement.

**Fix requis :** Ajouter `@Get()` ou `@Get('tenders')` dans `AppelsOffresController` qui retourne tous les `PublicTender` depuis la base.

---

### B2 — Route manquante : GET /api/agents/appels-offres/tenders/:id (Single tender)

| Attribut | Détail |
|----------|--------|
| **Domaine** | API Contract |
| **Frontend** | `dashboard/src/hooks/useTender.ts:8` |
| **Backend** | `src/modules/agent-appels-offres/presentation/controllers/appels-offres.controller.ts` |
| **Sévérité** | BLOCKING — 404 à chaque drill-down tender |

**Contexte :** Le hook `useTender` appelle `GET /api/agents/appels-offres/tenders/:id` pour afficher le détail d'un marché. Le backend n'a que `GET tenders/:id/analysis` (avec `/analysis` suffixe).

**Impact :** La page détail V4 est inaccessible.

**Fix requis :** Ajouter `@Get('tenders/:id')` dans `AppelsOffresController`.

---

### B3 — Route manquante : GET /api/agents/dealmaker/deals (Liste deals)

| Attribut | Détail |
|----------|--------|
| **Domaine** | API Contract |
| **Frontend** | `dashboard/src/hooks/useDeals.ts:10` |
| **Backend** | `src/modules/agent-dealmaker/presentation/controllers/dealmaker.controller.ts` |
| **Sévérité** | BLOCKING — 404, Kanban vide |

**Contexte :** Le hook `useDeals` appelle `GET /api/agents/dealmaker/deals` pour lister tous les deals. Le `DealmakerController` ne définit que `POST deals` (create), `POST quotes`, et `PUT deals/:id/stage`. Pas de GET list.

**Impact :** Le Kanban V5 Pipeline Deals est totalement inaccessible.

**Fix requis :** Ajouter `@Get('deals')` dans `DealmakerController`.

---

### B4 — Method + path mismatch : deal stage update

| Attribut | Détail |
|----------|--------|
| **Domaine** | API Contract |
| **Frontend** | `dashboard/src/hooks/useDeals.ts:14` — `api.patch('/api/agents/dealmaker/deals/${id}', { stage })` |
| **Backend** | `dealmaker.controller.ts:26` — `@Put('deals/:id/stage')` |
| **Sévérité** | BLOCKING — drag-drop Kanban = 404 |

**Contexte :** Le frontend envoie `PATCH /deals/:id` mais le backend attend `PUT /deals/:id/stage`. Double mismatch : method (PATCH vs PUT) et path (/deals/:id vs /deals/:id/stage).

**Impact :** Chaque drag-drop dans le Kanban échoue silencieusement.

**Fix requis :** Aligner — changer le frontend en `api.put('/api/agents/dealmaker/deals/${id}/stage', { stage })` OU changer le backend en `@Patch('deals/:id')`.

---

### B5 — useActionItems appelle /metrics mais attend ActionItem[]

| Attribut | Détail |
|----------|--------|
| **Domaine** | API Contract |
| **Frontend** | `dashboard/src/hooks/useActionItems.ts:8` |
| **Backend** | `dashboard.controller.ts:9-11` — retourne `{ leadsDetected, emailsSent, ... }` |
| **Sévérité** | BLOCKING — page Actions Rapides crash ou vide |

**Contexte :** `useActionItems` appelle `GET /api/dashboard/metrics` qui retourne des métriques pipeline (objet avec `leadsDetected`, `emailsSent`, etc.), mais le hook attend `ActionItem[]` (tableau d'objets avec `id`, `priority`, `title`, `slaDeadline`). Les types sont totalement incompatibles.

**Impact :** La page V7 Actions Rapides est non fonctionnelle — données incompréhensibles ou crash.

**Fix requis :** Créer un endpoint dédié `GET /api/dashboard/action-items` qui query les actions en attente depuis la base. Mettre à jour le hook pour appeler ce nouvel endpoint.

---

### B6 — useAgentGraph attend {nodes, edges} mais reçoit Agent[]

| Attribut | Détail |
|----------|--------|
| **Domaine** | API Contract |
| **Frontend** | `dashboard/src/hooks/useAgentGraph.ts:13` |
| **Backend** | `dashboard.controller.ts:13-15` — retourne `Agent[]` |
| **Sévérité** | BLOCKING — Graph V6 ne s'affiche pas correctement |

**Contexte :** `useAgentGraph` appelle `GET /api/dashboard/agents` et attend `{ nodes: AgentNode[], edges: AgentEdge[] }` (avec coordonnées, messagesIn/Out, source/target). Le backend retourne un tableau plat `Agent[]`. Structures totalement différentes.

**Impact :** Le graph React Flow V6 ne peut pas afficher les nodes/edges correctement.

**Fix requis :** Créer un endpoint dédié `GET /api/dashboard/agents/graph` qui retourne les données au format {nodes, edges}. Le graph page a déjà un fallback avec des nodes par défaut, donc le fix côté frontend est minimal.

---

### B7 — Clé API Anthropic réelle dans .env

| Attribut | Détail |
|----------|--------|
| **Domaine** | Security |
| **Fichier** | `.env:17` — `ANTHROPIC_API_KEY=sk-ant-api03-...` |
| **Sévérité** | BLOCKING — CVSS 9.0+ credential exposure |

**Contexte :** Le fichier `.env` contient une clé API Anthropic réelle (`sk-ant-api03-c5LI6o...`). Bien que `.env` soit dans `.gitignore`, le fichier existe sur disque avec la vraie clé. Si le repo est partagé/cloné ou si `.env` a jamais été commité, la clé est compromise.

**Impact :** Utilisation frauduleuse de la clé API → facturation non autorisée, accès aux modèles Claude.

**Fix requis :**
1. **Rotation immédiate** de la clé sur console.anthropic.com
2. Vérifier que `.env` n'a jamais été commité : `git log --all -- .env`
3. En production, utiliser un secrets manager (Vault, Doppler)

---

### B8 — JWT tokens stockés en localStorage — XSS

| Attribut | Détail |
|----------|--------|
| **Domaine** | Security |
| **Fichier** | `dashboard/src/hooks/useAuth.ts:30-31` |
| **Sévérité** | BLOCKING — vol de session via n'importe quelle XSS |

**Contexte :** `accessToken` et `refreshToken` sont stockés dans `localStorage`. N'importe quelle vulnérabilité XSS (même via une dépendance tierce) peut voler les deux tokens avec `localStorage.getItem()`.

**Impact :** Un attaquant avec XSS obtient un accès complet pendant 7 jours (durée du refresh token).

**Fix requis :** Retourner les tokens comme cookies `HttpOnly; Secure; SameSite=Lax` depuis le backend. Le dashboard `api.ts` utilise `credentials: 'include'` au lieu des headers `Authorization`.

---

### B9 — Refresh token endpoint non rate-limité

| Attribut | Détail |
|----------|--------|
| **Domaine** | Security |
| **Fichier** | `src/modules/auth/auth.controller.ts:33-37` |
| **Sévérité** | BLOCKING — token grinding illimité |

**Contexte :** `/auth/refresh` n'a pas de `@Throttle` contrairement à `/auth/login` (5/min) et `/auth/register` (3/min). Un attaquant avec un refresh token peut générer des access tokens illimités.

**Fix requis :** Ajouter `@Throttle({ default: { limit: 10, ttl: 60000 } })` sur la méthode `refresh()`.

---

### B10 — Refresh tokens non révocables

| Attribut | Détail |
|----------|--------|
| **Domaine** | Security |
| **Fichier** | `src/modules/auth/auth.service.ts:62-73` |
| **Sévérité** | BLOCKING — impossible d'invalider un token volé |

**Contexte :** `validateRefreshToken` vérifie uniquement la signature JWT. Pas de stockage serveur des refresh tokens (pas de table DB, pas de Redis). Impossible de révoquer un token compromis. Le logout côté frontend ne fait que vider localStorage — le token reste valide 7 jours.

**Impact :** Un token volé = accès permanent pendant 7 jours sans possibilité de révocation.

**Fix requis :** Stocker les JTI des refresh tokens dans Redis/DB. À chaque refresh, invalider l'ancien JTI et émettre un nouveau (rotation). Sur logout, supprimer le JTI côté serveur. Sur changement de mot de passe, invalider tous les JTI.

---

### B11 — Enumération d'utilisateurs via register

| Attribut | Détail |
|----------|--------|
| **Domaine** | Security |
| **Fichier** | `src/modules/auth/auth.service.ts:20-21` |
| **Sévérité** | BLOCKING — information disclosure |

**Contexte :** `register()` retourne `ConflictException('Email already registered')`, ce qui permet à un attaquant de savoir exactement quels emails ont un compte. Avec le rate limit de 3/min, un attaquant peut vérifier ~4 320 emails/jour.

**Fix requis :** Retourner une réponse générique quel que soit le résultat : "Si cet email n'est pas déjà enregistré, un email de vérification a été envoyé."

---

### B12 — detectResponses() query avec prospectId vide

| Attribut | Détail |
|----------|--------|
| **Domaine** | Backend Architecture |
| **Fichier** | `src/modules/agent-suiveur/application/services/suiveur.service.ts:163` |
| **Sévérité** | BLOCKING — détection de réponses cassée |

**Contexte :** `detectResponses()` appelle `findByProspectId('')` — query avec un prospectId vide, ce qui ne matche jamais les emails envoyés à des vrais prospects. La détection de réponses est complètement non fonctionnelle.

**Impact :** Les réponses des prospects ne sont jamais détectées → jamais classifiées → jamais traitées. Le suiveur est aveugle.

**Fix requis :** Passer le vrai prospectId depuis un lookup `reply.from`, ou utiliser `findByMessageId(reply.messageId)` au lieu de la query avec string vide.

---

### B13 — SuiveurProcessor drop `message.generated`

| Attribut | Détail |
|----------|--------|
| **Domaine** | Backend Architecture |
| **Fichier** | `src/modules/agent-suiveur/infrastructure/jobs/suiveur.processor.ts` |
| **Sévérité** | BLOCKING — messages jamais envoyés |

**Contexte :** Le `RedacteurService` dispatche des jobs nommés `message.generated` vers la queue suiveur. Mais `SuiveurProcessor` ne gère que `execute-step`, `process-reply`, et `detect-responses`. Le job `message.generated` est silencieusement ignoré (log "Unknown job name").

**Impact :** TOUS les emails générés par le Rédacteur ne sont jamais envoyés. Le pipeline email est mort après la génération.

**Fix requis :** Ajouter un `case 'message.generated':` dans le switch du `SuiveurProcessor` qui déclenche l'envoi de l'email.

---

### B14 — NurtureurProcessor drop `nurture-prospect`

| Attribut | Détail |
|----------|--------|
| **Domaine** | Backend Architecture |
| **Fichier** | `src/modules/agent-nurtureur/infrastructure/jobs/nurtureur.processor.ts:19` |
| **Sévérité** | BLOCKING — pipeline nurture mort |

**Contexte :** Le `ScoreurService` dispatche des jobs nommés `nurture-prospect` vers la queue nurturer pour les prospects WARM/COLD. Mais `NurtureurProcessor` gère `start-nurture`, `process-nurture-step`, `re-engagement-check`, `sunset-check`. Pas de case pour `nurture-prospect`.

**Impact :** TOUS les prospects scorés WARM/COLD sont silencieusement perdus. Le nurturing ne démarre jamais depuis le scoring.

**Fix requis :** Ajouter `case 'nurture-prospect':` qui appelle `nurtureurService.startNurture(job.data)`.

---

### B15 — CSM onboarding jamais déclenché

| Attribut | Détail |
|----------|--------|
| **Domaine** | Backend Architecture |
| **Fichier** | `src/modules/agent-dealmaker/application/services/dealmaker.service.ts:65-70` |
| **Sévérité** | BLOCKING — onboarding clients cassé |

**Contexte :** Quand un deal passe en WON, `advanceStage` dispatche un job `onboard-customer` avec seulement `dealId` et `prospectId`. Mais `CsmProcessor` requiert `companyName` et `mrrEur > 0`. Sans ces champs, le job est silencieusement différé ("insufficient job data").

**Impact :** Aucun client n'est jamais onboardé automatiquement après signature.

**Fix requis :** Charger les données du deal (companyName, amountEur) dans `advanceStage` et les inclure dans le job payload.

---

### B16 — Logout ne reset pas le token API

| Attribut | Détail |
|----------|--------|
| **Domaine** | Frontend Quality |
| **Fichier** | `dashboard/src/components/layout/AppLayout.tsx:21-23` |
| **Sévérité** | BLOCKING — session zombie après logout |

**Contexte :** `handleLogout` fait `localStorage.removeItem('auth_token')` et navigue vers `/login`, mais ne fait PAS `api.setToken(null)` ni `useAuth().logout()`. Le token en mémoire dans `ApiClient` persiste. Les requêtes background continuent avec l'ancien token.

**Fix requis :** Appeler `useAuth().logout()` qui clear proprement localStorage + API token + refresh token.

---

### B17 — Pas de gestion 401 / token refresh dans api.ts

| Attribut | Détail |
|----------|--------|
| **Domaine** | Frontend Quality |
| **Fichier** | `dashboard/src/lib/api.ts:22-27` |
| **Sévérité** | BLOCKING — expiration JWT = UX cassée |

**Contexte :** Quand le JWT expire (15min), chaque appel API échoue silencieusement avec un 401 transformé en `ApiError`. Pas d'intercepteur pour tenter un refresh automatique, pas de redirect vers `/login`. L'utilisateur voit des erreurs partout.

**Fix requis :** Dans la méthode `request`, intercepter les 401 : tenter `POST /api/auth/refresh` avec le refresh token stocké. En cas d'échec, clear tokens et redirect `/login`.

---

### B18 — SSE reconnect timer jamais annulé — memory leak

| Attribut | Détail |
|----------|--------|
| **Domaine** | Frontend Quality |
| **Fichier** | `dashboard/src/lib/sse.ts:28-31` |
| **Sévérité** | BLOCKING — fuite mémoire progressive |

**Contexte :** Quand `disconnect()` est appelé, `retryCount` est reset mais le `setTimeout(() => this.connect(), delay)` d'une erreur précédente n'est jamais annulé. Le timer se déclenche et ouvre une connexion fantôme. Au fil du temps, ça s'accumule.

**Fix requis :** Stocker l'ID du timeout (`this.retryTimer = setTimeout(...)`) et appeler `clearTimeout(this.retryTimer)` dans `disconnect()`.

---

### B19 — useAuth utilise useState local — state non partagé

| Attribut | Détail |
|----------|--------|
| **Domaine** | Frontend Quality |
| **Fichier** | `dashboard/src/hooks/useAuth.ts` |
| **Sévérité** | BLOCKING — transitions login/logout cassées entre composants |

**Contexte :** `useAuth` est un hook classique avec `useState`, pas un React Context. Chaque composant qui appelle `useAuth()` obtient sa propre copie indépendante du state `token`. Quand `login()` est appelé dans `LoginPage`, le `ProtectedRoute` n'est PAS mis à jour — il a son propre `useState(null)`.

**Impact :** Le login fonctionne au refresh (localStorage) mais les transitions temps réel entre composants sont cassées.

**Fix requis :** Convertir `useAuth` en React Context avec un Provider wrappant l'app, pour que tous les consommateurs partagent le même state d'authentification.

---

### B20 — EventSource ne supporte pas Authorization header

| Attribut | Détail |
|----------|--------|
| **Domaine** | Frontend Quality + Security |
| **Fichier** | `dashboard/src/lib/sse.ts:20` |
| **Sévérité** | BLOCKING — SSE = 401 permanent |

**Contexte :** Le `SSEClient` utilise l'API native `EventSource` du navigateur qui ne supporte PAS les headers custom. L'endpoint SSE `/api/dashboard/stream` requiert JWT (guard global), mais `EventSource` ne peut pas envoyer de header `Authorization: Bearer`.

**Fix requis :** Options :
1. Token en query param : `new EventSource('/api/dashboard/stream?token=xxx')` + validation côté backend
2. Utiliser `fetch` avec `ReadableStream` au lieu de `EventSource`
3. Utiliser `@microsoft/fetch-event-source` qui supporte les headers custom

---

## CRITICAL Issues (17)

### C1 — useMetrics attend DailyMetrics[] mais reçoit un objet

| Attribut | Détail |
|----------|--------|
| **Domaine** | API Contract |
| **Frontend** | `dashboard/src/hooks/useMetrics.ts:8` — attend `DailyMetrics[]` |
| **Backend** | `dashboard.service.ts:23-49` — retourne `{ leadsDetected, leadsEnriched, ... }` (objet unique, pas un tableau) |

**Contexte :** Le hook attend un tableau de métriques quotidiennes (pour des graphiques time-series), mais le backend retourne un objet plat sans champ `date` et pas sous forme de tableau.

**Fix requis :** Soit modifier le backend pour query la table `MetriquesDaily` et retourner un tableau, soit ajouter un endpoint séparé `/api/dashboard/metrics/daily`.

---

### C2 — Pagination response : pageSize vs limit, totalPages manquant

| Attribut | Détail |
|----------|--------|
| **Domaine** | API Contract |
| **Frontend** | `dashboard/src/types/prospect.ts:65-71` — attend `{ data, total, page, limit, totalPages }` |
| **Backend** | `i-prospect.repository.ts:12-17` — retourne `{ data, total, page, pageSize }` |

**Contexte :** Le frontend lit `limit` et `totalPages` qui sont `undefined` dans la réponse backend (le backend utilise `pageSize` et ne calcule pas `totalPages`). La pagination UI ne fonctionne pas correctement.

**Fix requis :** Aligner la réponse backend : ajouter `totalPages: Math.ceil(total / pageSize)` et renommer `pageSize` en `limit` (ou mapper dans le frontend).

---

### C3 — Query params prospects ignorés

| Attribut | Détail |
|----------|--------|
| **Domaine** | API Contract |
| **Frontend** | `dashboard/src/hooks/useProspects.ts:6-17` — envoie `search, status, segment, minScore, maxScore, sortBy, sortOrder` |
| **Backend** | `prospect.controller.ts:23` — lit seulement `page` et `pageSize` |

**Contexte :** Le frontend envoie 7 query params de filtrage que le backend ignore complètement. Les filtres du dashboard ne font rien.

**Fix requis :** Mettre à jour `ProspectController.findAll` pour accepter tous les params et les passer au repository.

---

### C4 — Prospect entity shape mismatch

| Attribut | Détail |
|----------|--------|
| **Domaine** | API Contract |
| **Frontend** | `dashboard/src/types/prospect.ts:31-51` — attend `score: ProspectScore`, `signals: Signal[]`, `interactions: Interaction[]` |
| **Backend** | `prisma-prospect.repository.ts:17-42` — retourne des champs plats sans nested objects |

**Contexte :** Le frontend attend des objets imbriqués (score avec les 4 axes, tableau de signaux, tableau d'interactions). Le backend retourne l'entité Prisma plate sans inclure les relations.

**Fix requis :** Ajouter des `include` Prisma (`include: { scores: true, emailSends: true }`) et mapper vers la structure attendue par le frontend.

---

### C5 — DealStage enum values totalement différents

| Attribut | Détail |
|----------|--------|
| **Domaine** | API Contract |
| **Frontend** | `deal.ts:1` — `'PROSPECTING' | 'ENGAGED' | 'QUALIFIED' | 'PROPOSED' | 'WON' | 'LOST'` |
| **Backend entity** | `deal.entity.ts:1-8` — `'DISCOVERY' | 'QUALIFICATION' | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSED_WON' | 'CLOSED_LOST'` |
| **Prisma** | `schema.prisma` — `discovery | proposal | negotiation | closed_won | closed_lost` |

**Contexte :** Trois sets de valeurs différentes pour le même concept. Aucun ne matche. Les transitions de stage depuis le frontend seront systématiquement rejetées.

**Fix requis :** Choisir un set canonique et l'utiliser partout (Prisma schema, domain entity, frontend type).

---

### C6 — SSE ne peut pas envoyer le JWT

| Attribut | Détail |
|----------|--------|
| **Domaine** | API Contract + Security |
| **Fichier** | `dashboard/src/lib/sse.ts:20` |

**Contexte :** Doublon avec B20. L'API `EventSource` du navigateur ne supporte pas les headers custom. Voir B20 pour le fix détaillé.

---

### C7 — validateExternalUrl() jamais appelée — SSRF dead code

| Attribut | Détail |
|----------|--------|
| **Domaine** | Security |
| **Fichier** | `src/common/utils/url-validator.ts:12` |

**Contexte :** La fonction `validateExternalUrl()` avec sa whitelist de domaines est définie mais AUCUN des 4 adapters HTTP (BODACC, BOAMP, INPI, INSEE) ne l'appelle. Seul `ReacherAdapter` appelle `validateEmailDomain()`. Si une URL de base est configurée via variable d'environnement (ex: `enrichment.inpiApiUrl`) et qu'elle est compromise/mal configurée, les requêtes peuvent être redirigées vers des services internes (SSRF).

**Fix requis :** Appeler `validateExternalUrl()` dans chaque adapter avant chaque requête HTTP. Ajouter les domaines manquants à la whitelist.

---

### C8 — JWT secret validation min(1) — pas d'entropie minimum

| Attribut | Détail |
|----------|--------|
| **Domaine** | Security |
| **Fichier** | `src/core/config/jwt.config.ts:5` |

**Contexte :** Le schéma Zod vérifie seulement `z.string().min(1)`. Le placeholder `.env.example` `CHANGE_ME_TO_A_RANDOM_STRING...` passerait la validation et serait utilisé en production.

**Fix requis :** `z.string().min(32)` + check runtime en production qui rejette les valeurs contenant `CHANGE_ME` ou `dev-`.

---

### C9 — AuthModule bypass le config validé Zod

| Attribut | Détail |
|----------|--------|
| **Domaine** | Security |
| **Fichier** | `src/modules/auth/auth.module.ts:15` et `src/modules/auth/strategies/jwt.strategy.ts:24` |

**Contexte :** Les deux utilisent `configService.getOrThrow<string>('JWT_SECRET')` qui lit la variable d'environnement brute, au lieu de `configService.getOrThrow<string>('jwt.secret')` qui lirait la valeur validée par Zod. Le config Zod-validé n'est jamais consommé.

**Fix requis :** Changer en `configService.getOrThrow<string>('jwt.secret')`.

---

### C10 — Password policy faible

| Attribut | Détail |
|----------|--------|
| **Domaine** | Security |
| **Fichier** | `src/modules/auth/dtos/auth.dto.ts:5` |

**Contexte :** La validation ne requiert que `z.string().min(8)`. Pas de complexité requise. Mots de passe comme `aaaaaaaa` ou `password` acceptés.

**Fix requis :** Ajouter regex de complexité ou utiliser `zxcvbn` pour scoring de force.

---

### C11 — PII (emails) loggés en clair

| Attribut | Détail |
|----------|--------|
| **Domaine** | Security |
| **Fichier** | `src/modules/auth/auth.service.ts:36`, `src/modules/email/adapters/gmail.adapter.ts:54,67` |

**Contexte :** L'auth service logge `email: user.email` à l'inscription. Le Gmail adapter logge `to: request.to` (tableau d'emails). La redaction Pino ne couvre pas ces paths (elle couvre `body.email`, pas les champs top-level).

**Fix requis :** Ajouter `email`, `*.email`, `to`, `*.to` aux paths de redaction Pino, ou masquer manuellement dans les logs.

---

### C12 — N+1 queries dans NurtureurService

| Attribut | Détail |
|----------|--------|
| **Domaine** | Backend Architecture |
| **Fichier** | `src/modules/agent-nurtureur/application/services/nurtureur.service.ts:87-92` |

**Contexte :** Pour chaque prospect inactif, une requête DB séparée fetch la séquence nurture. Avec des milliers de prospects, c'est O(N) requêtes.

**Fix requis :** Batch-load toutes les séquences en une seule requête, puis filtrer en mémoire.

---

### C13 — Dead Letter Queue déclarée mais jamais enregistrée

| Attribut | Détail |
|----------|--------|
| **Domaine** | Backend Architecture |
| **Fichier** | `src/shared/constants/queue-names.constant.ts:10` |

**Contexte :** `DEAD_LETTER_QUEUE` est déclarée mais aucun module ne l'enregistre, aucun processor ne l'écoute, aucune job option ne la configure. Les jobs échoués sont simplement supprimés.

**Fix requis :** Enregistrer la DLQ dans AppModule, créer un processor qui logge/alerte les jobs échoués.

---

### C14 — Pas de transaction save+dispatch dans VeilleurService

| Attribut | Détail |
|----------|--------|
| **Domaine** | Backend Architecture |
| **Fichier** | `src/modules/agent-veilleur/application/services/veilleur.service.ts:54-78` |

**Contexte :** Chaque lead est sauvegardé individuellement puis dispatché dans la queue. Si le process crash en milieu de boucle, certains leads seront sauvegardés mais pas dispatchés (ou l'inverse).

**Fix requis :** Wrapper dans un `prisma.$transaction`, ou utiliser le pattern save-then-dispatch.

---

### C15 — Prisma connection pool non configuré

| Attribut | Détail |
|----------|--------|
| **Domaine** | Backend Architecture |
| **Fichier** | `src/core/database/prisma.service.ts:8-23` |

**Contexte :** Aucune configuration de pool de connexions. Prisma utilise le défaut (`num_cpus * 2 + 1`). Avec 8 workers BullMQ concurrents + requêtes HTTP, les connexions peuvent être épuisées.

**Fix requis :** Ajouter `?connection_limit=20&pool_timeout=10` à DATABASE_URL, ou configurer PgBouncer en production.

---

### C16 — Deal stage mutation sans optimistic update ni rollback

| Attribut | Détail |
|----------|--------|
| **Domaine** | Frontend Quality |
| **Fichier** | `dashboard/src/hooks/useDeals.ts:13-18` |

**Contexte :** Quand l'utilisateur drag-drop un deal, la mutation fire mais l'UI ne se met à jour qu'au `onSuccess` + `invalidateQueries`. Si l'API est lente, la carte revient à sa position originale puis saute. Pas de `onError` handler.

**Fix requis :** Ajouter `onMutate` (optimistic update + snapshot), `onError` (rollback), `onSettled` (invalidate).

---

### C17 — "Forcer NO-GO" sans confirmation

| Attribut | Détail |
|----------|--------|
| **Domaine** | Frontend Quality |
| **Fichier** | `dashboard/src/routes/tenders/tender-detail.tsx:186-190` |

**Contexte :** Cliquer "Forcer NO-GO" fire immédiatement la mutation sans confirmation. C'est une décision métier critique irréversible. Un clic accidentel peut tuer une opportunité.

**Fix requis :** Wrapper dans un Dialog de confirmation : "Êtes-vous sûr de vouloir forcer NO-GO ?"

---

## SUGGESTIONS (8)

### S1 — NotificationBell toujours 0

| Attribut | Détail |
|----------|--------|
| **Domaine** | Frontend |
| **Fichier** | `Header.tsx:12`, `AppLayout.tsx:29` |

**Contexte :** `AppLayout` rend `<Header>` sans passer `actionCount`, donc la cloche affiche toujours 0.

**Fix :** Fetch le count des actions dans AppLayout et passer en prop.

---

### S2 — AgentCard onClick = console.log

| Attribut | Détail |
|----------|--------|
| **Domaine** | Frontend |
| **Fichier** | `AgentCard.tsx:37` |

**Contexte :** Le clic logge dans la console — placeholder dev. La carte paraît cliquable (cursor-pointer, hover:shadow) mais ne fait rien.

**Fix :** Implémenter navigation ou retirer le style cliquable.

---

### S3 — JSON.stringify dans timeline search coûteux

| Attribut | Détail |
|----------|--------|
| **Domaine** | Frontend |
| **Fichier** | `timeline.tsx:103` |

**Contexte :** Stringifier chaque payload sur chaque frappe crée une charge GC significative.

**Fix :** Debounce le search (300ms) ou pré-compute les strings.

---

### S4 — DeadlineCountdown affiche J négatif

| Attribut | Détail |
|----------|--------|
| **Domaine** | Frontend |
| **Fichier** | `tenders/index.tsx:44-47` |

**Contexte :** Les deadlines passées affichent "J--5" (double moins).

**Fix :** Si `days <= 0`, afficher "Expiré" en rouge.

---

### S5 — VeilleurService save séquentiel

| Attribut | Détail |
|----------|--------|
| **Domaine** | Backend |
| **Fichier** | `veilleur.service.ts:54-78` |

**Contexte :** Chaque lead est sauvé avec un `await` individuel dans une boucle. 50 leads = 100 opérations séquentielles.

**Fix :** Utiliser `prisma.rawLead.createMany()` + `Queue.addBulk()`.

---

### S6 — Index manquant sur ReplyClassification.prospectId

| Attribut | Détail |
|----------|--------|
| **Domaine** | Backend |
| **Fichier** | `prisma/schema.prisma:342-376` |

**Contexte :** `ReplyClassification` et `NurtureInteraction` manquent d'index sur les FK fréquemment requêtées.

**Fix :** Ajouter `@@index([prospectId])` aux modèles concernés.

---

### S7 — Pas de lockout après échecs de login

| Attribut | Détail |
|----------|--------|
| **Domaine** | Security |
| **Fichier** | `auth.service.ts:41-49` |

**Contexte :** Le rate limit par IP existe (5/min) mais un attaquant distribué (botnet) peut brute-force indéfiniment.

**Fix :** Ajouter `failedLoginAttempts` et `lockedUntil` sur le modèle User. Lock après N échecs.

---

### S8 — Prévoir CSRF si migration vers cookies

| Attribut | Détail |
|----------|--------|
| **Domaine** | Security |

**Contexte :** Si la correction B8 (migration vers HttpOnly cookies) est appliquée, CSRF devient un risque réel.

**Fix :** Implémenter un CSRF token (double-submit cookie) lors de la migration. `SameSite=Lax` comme défense de base.
