# 05 — Guide de Corrections Enrichi — Bonnes Pratiques, Anti-Patterns & Edge Cases

Ce document enrichit le guide de corrections (03-GUIDE-CORRECTIONS.md) avec les bonnes pratiques OWASP 2026, les anti-patterns à éviter, et les edge cases pour chaque fix.

---

## SECTION 1 — Authentification & Tokens (B7-B11, B16-B17, B19-B20)

### Bonnes pratiques (OWASP 2026 + RFC 9700)

1. **Tokens en HttpOnly cookies** (pas localStorage)
   - `Set-Cookie: __Host-access_token=xxx; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=900`
   - Préfixe `__Host-` empêche les sous-domaines de l'overrider
   - `SameSite=Lax` — bloque CSRF sauf navigation top-level (liens)
   - `Secure` — HTTPS only (pas en dev localhost, ajouter flag conditionnel)

2. **Refresh Token Rotation** (RFC 9700 — janvier 2025)
   - Chaque refresh émet un NOUVEAU refresh token et invalide l'ancien
   - Stocker les JTI dans Redis avec TTL = durée du refresh token (7j)
   - Si un JTI est réutilisé → **token compromise detected** → invalider toute la famille
   - Pub/Sub Redis pour propager la révocation à toutes les instances

3. **Timing-safe user lookup**
   - Problème : `if (!user) throw` retourne en ~0.6ms, `bcrypt.compare` prend ~166ms
   - Fix : toujours exécuter bcrypt même si le user n'existe pas
   ```typescript
   const user = await this.prisma.user.findUnique({ where: { email } });
   const hash = user?.passwordHash ?? '$2b$12$dummyhashfortimingggggggggggggggggggggggggggg';
   const isValid = await bcrypt.compare(password, hash);
   if (!user || !isValid) throw new UnauthorizedException('Invalid credentials');
   ```

4. **Réponse générique registration** (B11)
   - JAMAIS révéler si l'email existe
   - Pattern : retourner toujours 201 avec "Vérifiez votre email"
   - En background : si l'email existe, ne rien faire (ou envoyer un email "quelqu'un a essayé de créer un compte avec votre email")

### Anti-patterns à NE PAS faire

| Anti-pattern | Pourquoi | Ce qu'on fait à la place |
|---|---|---|
| ❌ `localStorage.setItem('token', jwt)` | XSS = vol de session | HttpOnly cookie |
| ❌ `if (!user) throw; bcrypt.compare(...)` | Timing attack = enumération | Toujours exécuter bcrypt |
| ❌ `throw ConflictException('Email exists')` | Enumération d'utilisateurs | Réponse générique |
| ❌ Refresh token stateless (JWT seul) | Impossible à révoquer | JTI en Redis |
| ❌ `SameSite=None` | Désactive protection CSRF | `SameSite=Lax` minimum |
| ❌ Token en query param permanent | Loggé dans les access logs serveur | Query param seulement pour SSE EventSource |

### Edge cases

| Scénario | Comportement attendu |
|----------|---------------------|
| Token expiré pendant une action longue (ex: drag-drop Kanban) | Intercepteur 401 → refresh auto → retry la requête → UX transparente |
| Refresh token expiré (>7j sans activité) | Redirect vers /login avec message "Session expirée" |
| Refresh token réutilisé (famille compromise) | Invalider TOUS les tokens de l'utilisateur → force re-login |
| Changement de mot de passe | Invalider tous les refresh tokens de l'utilisateur |
| Deux onglets ouverts simultanément | Les deux doivent partager le même state auth (React Context) |
| Utilisateur désactivé (`isActive=false`) pendant une session | Le prochain refresh doit échouer → redirect login |
| CORS avec cookies en dev (localhost:5173 → localhost:3000) | Backend : `credentials: true`, `origin: 'http://localhost:5173'`. Frontend : `fetch(..., { credentials: 'include' })` |

### Implémentation NestJS cookies (détail pour fix B8)

```typescript
// auth.service.ts — generateTokens retourne les tokens
// auth.controller.ts — set les cookies sur la response

@Post('login')
@HttpCode(HttpStatus.OK)
async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
  const tokens = await this.authService.login(dto);

  // Access token cookie
  res.cookie('access_token', tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: '/',
  });

  // Refresh token cookie — path restreint
  res.cookie('refresh_token', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
    path: '/api/auth/refresh', // Seulement envoyé sur le refresh endpoint
  });

  return { tokenType: 'cookie', expiresIn: '15m' };
}
```

**JwtStrategy — lire depuis le cookie au lieu du header :**
```typescript
// jwt.strategy.ts
super({
  jwtFromRequest: ExtractJwt.fromExtractors([
    (req: Request) => req?.cookies?.['access_token'] ?? null,
    ExtractJwt.fromAuthHeaderAsBearerToken(), // Fallback pour API keys
  ]),
  secretOrKey: configService.getOrThrow<string>('jwt.secret'),
});
```

**Dependencies à installer côté backend :**
```bash
npm install cookie-parser @types/cookie-parser
```

**main.ts :**
```typescript
import * as cookieParser from 'cookie-parser';
app.use(cookieParser());
```

---

## SECTION 2 — Pipeline BullMQ (B12-B15, C13)

### Bonnes pratiques

1. **Convention de nommage des jobs**
   - Utiliser des constantes, PAS des strings littérales
   - Créer un fichier `src/shared/constants/job-names.constant.ts`
   ```typescript
   export const JOB_NAMES = {
     ENRICH_LEAD: 'enrich-lead',
     SCORE_PROSPECT: 'score-prospect',
     GENERATE_MESSAGE: 'generate-message',
     SEND_MESSAGE: 'send-message', // ← remplacer 'message.generated'
     NURTURE_PROSPECT: 'nurture-prospect',
     PROCESS_REPLY: 'process-reply',
     DETECT_RESPONSES: 'detect-responses',
     EXECUTE_STEP: 'execute-step',
     RE_ENGAGEMENT_CHECK: 're-engagement-check',
     SUNSET_CHECK: 'sunset-check',
     ONBOARD_CUSTOMER: 'onboard-customer',
   } as const;
   ```
   - Tous les dispatchers ET processors référencent ces constantes

2. **Processor exhaustif avec default throw**
   ```typescript
   async process(job: Job): Promise<void> {
     switch (job.name) {
       case JOB_NAMES.SEND_MESSAGE: ...
       case JOB_NAMES.PROCESS_REPLY: ...
       default:
         throw new Error(`Unknown job name: ${job.name}`);
         // Ceci envoie le job en failed → DLQ
     }
   }
   ```

3. **Dead Letter Queue**
   - TOUJOURS enregistrer une DLQ
   - Le DLQ processor logge + alerte (Slack, email)
   - Ajouter un dashboard Bull Board pour visualiser les queues

### Anti-patterns

| Anti-pattern | Pourquoi | Fix |
|---|---|---|
| ❌ `queue.add('message.generated', ...)` (string littérale) | Typo = job silencieusement perdu | Constante `JOB_NAMES.SEND_MESSAGE` |
| ❌ `default: this.logger.warn(...)` dans le processor | Job ignoré, aucune trace | `default: throw new Error(...)` → job en failed → DLQ |
| ❌ Ignorer le `job.name` dans le processor | Tous les jobs traités identiquement | Switch exhaustif sur job.name |
| ❌ Save individuel dans une boucle | Pas atomique, lent | `prisma.$transaction` + `queue.addBulk` |

### Edge cases

| Scénario | Comportement attendu |
|----------|---------------------|
| Processor crash pendant un job | BullMQ retry automatique (3 fois, backoff exponentiel) |
| Redis restart | BullMQ reconnecte automatiquement, jobs persistés reprennent |
| Job avec données invalides (ex: prospectId null) | Validation Zod dans le processor, throw → DLQ |
| Queue saturée (>10K jobs) | BullMQ gère nativement, mais monitorer via Bull Board |
| Doublon de job (même prospect dispatché 2x) | Ajouter `jobId: prospectId` pour déduplication native BullMQ |

---

## SECTION 3 — Routes Backend Manquantes (B1-B6)

### Bonnes pratiques

1. **Chaque controller doit exposer les 4 opérations CRUD si nécessaire**
   - `GET /` — liste (avec pagination, filtres)
   - `GET /:id` — détail
   - `POST /` — création
   - `PUT /:id` ou `PATCH /:id` — mise à jour

2. **Pagination standardisée**
   ```typescript
   interface PaginatedResponse<T> {
     data: T[];
     total: number;
     page: number;
     limit: number;
     totalPages: number;
   }
   ```

3. **Validation des paramètres**
   - UUID params : `@Param('id', ParseUUIDPipe) id: string`
   - Query params : Zod schema ou class-validator

### Anti-patterns

| Anti-pattern | Fix |
|---|---|
| ❌ PATCH et PUT utilisés de manière interchangeable | PATCH = mise à jour partielle, PUT = remplacement complet |
| ❌ Route qui retourne toute la table sans pagination | Toujours paginer (default limit=20, max=100) |
| ❌ Endpoints inconsistants (/tenders/:id/analysis vs /tenders/:id) | Convention uniforme : le détail est toujours /:id |

---

## SECTION 4 — Frontend Architecture (B16-B20, C16-C17)

### Bonnes pratiques

1. **Auth = React Context, pas un hook avec useState**
   - Un seul Provider en haut de l'arbre
   - Tous les composants lisent le même state
   - Le token change → tous les composants sont notifiés

2. **Optimistic Updates (TanStack Query)**
   ```typescript
   const mutation = useMutation({
     mutationFn: updateDealStage,
     onMutate: async (newData) => {
       await queryClient.cancelQueries({ queryKey: ['deals'] });
       const previous = queryClient.getQueryData(['deals']);
       queryClient.setQueryData(['deals'], (old) => /* update optimiste */);
       return { previous }; // snapshot pour rollback
     },
     onError: (err, newData, context) => {
       queryClient.setQueryData(['deals'], context.previous); // rollback
     },
     onSettled: () => {
       queryClient.invalidateQueries({ queryKey: ['deals'] }); // sync
     },
   });
   ```

3. **SSE avec token**
   - Option la plus simple : token en query param
   - Backend : extraire le token du query param, vérifier manuellement
   - Le token en query param est OK pour SSE car :
     - C'est une connexion persistante (pas dans les access logs à chaque requête)
     - Le token a une durée de vie courte (15min)
     - La connexion est sur HTTPS (pas de sniffing)

4. **Confirmation pour actions destructives**
   - Toute action irréversible (NO-GO, suppression, archivage) doit avoir un dialog
   - Pattern shadcn : `AlertDialog` avec titre, description, boutons Annuler/Confirmer

### Anti-patterns

| Anti-pattern | Fix |
|---|---|
| ❌ `useAuth()` dans chaque composant (state local) | `AuthProvider` en Context |
| ❌ Pas de 401 handling | Intercepteur dans api.ts |
| ❌ `EventSource` pour SSE authentifié | Token en query param ou fetch-based |
| ❌ `setTimeout` sans cleanup | `clearTimeout` dans `disconnect()` ou `useEffect` return |
| ❌ `onClick={() => deleteThing()}` sans confirmation | `AlertDialog` avant |

### Edge cases

| Scénario | Comportement attendu |
|----------|---------------------|
| Drag-drop Kanban + API échoue | Carte revient à la position d'origine (rollback) |
| 2 utilisateurs modifient le même deal | Le dernier gagne (pas d'optimistic locking pour v1) |
| SSE connexion perdue (wifi drop) | Reconnexion avec backoff exponentiel, pas de connexion fantôme |
| Utilisateur navigue pendant un mutation en cours | Mutation continue en background, le cache est invalidé au retour |
| Page refresh après login | Token lu depuis localStorage (ou cookie) — session persistante |

---

## SECTION 5 — Data Contract Alignment (C1-C5)

### Bonnes pratiques

1. **Un seul set de types partagé** (ou au minimum documenté)
   - Idéalement : package `@axiom/shared-types` ou fichier de types exporté
   - En attendant : documenter les correspondances dans un fichier `API-CONTRACTS.md`

2. **Enum alignment**
   - Source de vérité = Prisma schema
   - Backend domain entity = utilise les mêmes valeurs
   - Frontend types = mapping explicite si renommage

3. **Pagination response**
   - Toujours inclure `totalPages` (calculé côté serveur)
   - Le frontend ne doit pas avoir à calculer `totalPages`

### Edge cases

| Scénario | Comportement attendu |
|----------|---------------------|
| Prospect sans score (pas encore scoré) | Frontend affiche "Non scoré" au lieu de crash |
| Prospect sans interactions (aucun email envoyé) | Array vide `[]`, pas `null` |
| Tender sans steps (pas encore analysé) | Array vide, message "Analyse en attente" |
| Deal avec value=0 (gratuit) | Afficher "0 €" pas undefined |

---

## SECTION 6 — SSRF & Sécurité HTTP (C7)

### Bonnes pratiques

1. **Validation au démarrage** (dans le constructeur de chaque adapter)
   ```typescript
   constructor() {
     validateExternalUrl(this.baseUrl); // Crash au boot si URL invalide
   }
   ```

2. **Whitelist stricte** — seules les URLs attendues sont autorisées
3. **Pas d'input utilisateur dans les URLs** — les base URLs viennent de la config, pas des requêtes
4. **DNS rebinding protection** — résoudre l'IP une seule fois et la réutiliser

### Anti-patterns

| Anti-pattern | Fix |
|---|---|
| ❌ Définir `validateExternalUrl()` sans l'appeler | L'appeler dans chaque adapter |
| ❌ `httpService.get(userInput)` | Jamais d'input utilisateur dans l'URL |
| ❌ Whitelist dans le code seulement (pas testée) | Test unitaire qui vérifie le blocage des IPs privées |

---

## SECTION 7 — Logging & RGPD (C11)

### Bonnes pratiques

1. **Redaction par défaut** — tout ce qui est PII doit être redacté
2. **Paths à couvrir :**
   ```typescript
   redact: {
     paths: [
       'email', '*.email', 'req.body.email',
       'to', '*.to',
       'firstName', '*.firstName',
       'lastName', '*.lastName',
       'phone', '*.phone',
       'password', '*.password', 'req.body.password',
       'passwordHash', '*.passwordHash',
       'linkedinUrl', '*.linkedinUrl',
       'directors[*].firstName', 'directors[*].lastName',
       'directors[*].birthDate',
       'beneficialOwners[*].firstName', 'beneficialOwners[*].lastName',
     ],
     censor: '[REDACTED]',
   }
   ```

3. **Ne JAMAIS logger :**
   - Tokens (JWT, API keys, refresh tokens)
   - Mots de passe (même hashés)
   - Adresses email complètes
   - Numéros de téléphone
   - Données de naissance
   - Adresses IP (sauf pour rate limiting)

### Anti-pattern

| Anti-pattern | Fix |
|---|---|
| ❌ `this.logger.log({ email: user.email })` | `this.logger.log({ userId: user.id })` |
| ❌ `this.logger.log({ to: request.to })` | `this.logger.log({ recipientCount: request.to.length })` |

---

## Checklist de validation post-fix

Après chaque phase de correction, vérifier :

- [ ] `npm run build` (backend) — 0 erreurs
- [ ] `npx tsc --noEmit` (backend) — 0 erreurs
- [ ] `npm test` (backend) — tous les tests passent
- [ ] `cd dashboard && npm run build` — 0 erreurs
- [ ] Test manuel : login → dashboard → chaque page charge
- [ ] Test manuel : logout → redirect login → re-login
- [ ] `npm audit` — aucune CVE critique
- [ ] Aucun secret dans les logs (vérifier les logs de démarrage)
- [ ] Aucun email/nom dans les logs (vérifier avec un prospect test)

## Sources

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [RFC 9700 — OAuth 2.0 Security Best Current Practice (Jan 2025)](https://workos.com/blog/oauth-best-practices)
- [NestJS Security — CSRF](https://docs.nestjs.com/security/csrf)
- [NestJS Cookies](https://docs.nestjs.com/techniques/cookies)
- [TanStack Query — Optimistic Updates](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- [Refresh Token Rotation — Auth0](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
- [React Router CVE-2026-22029](https://github.com/advisories/GHSA-3cgp-3xvw-98x8)
