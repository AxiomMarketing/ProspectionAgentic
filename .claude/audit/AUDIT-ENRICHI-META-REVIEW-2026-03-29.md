# Audit Enrichi — Meta-Review, CVE, Roadmap & Guide de Correction

**Date** : 2026-03-29
**Complément à** : `AUDIT-COMPLET-10-AGENTS-2026-03-29.md`
**Méthode** : 3 agents Opus en parallèle — (1) meta-audit de l'audit, (2) recherche CVE/OWASP, (3) edge cases/anti-patterns + recherche web

---

## Table des Matières

1. [Meta-Audit : Gaps manqués par l'audit initial](#1-meta-audit--gaps-manqués-par-laudit-initial)
2. [Registre CVE par Technologie](#2-registre-cve-par-technologie)
3. [OWASP Top 10 2025 — Applicabilité](#3-owasp-top-10-2025--applicabilité)
4. [OWASP LLM Top 10 2025 — Applicabilité](#4-owasp-llm-top-10-2025--applicabilité)
5. [Conformité RGPD/LCEN/CNIL — Guide Légal](#5-conformité-rgpdlcencnil--guide-légal)
6. [Guide de Correction — Bonnes Pratiques](#6-guide-de-correction--bonnes-pratiques)
7. [Guide de Correction — Mauvaises Pratiques à Éviter](#7-guide-de-correction--mauvaises-pratiques-à-éviter)
8. [Guide de Correction — Edge Cases Critiques](#8-guide-de-correction--edge-cases-critiques)
9. [Roadmap de Correction Étape par Étape](#9-roadmap-de-correction-étape-par-étape)

---

## 1. Meta-Audit : Gaps manqués par l'audit initial

L'audit initial couvrait les 10 modules agents mais avait un **angle mort majeur : les modules partagés** (auth, email, llm, dashboard, prospects, common, core). Le meta-audit a identifié 29 gaps supplémentaires.

### 1.1 BLOCKING supplémentaires (4)

#### MB01 — Auth : Register endpoint bypass l'authentification

- **Fichier** : `src/modules/auth/auth.service.ts:23-28`
- **Problème** : Si `dto.email` correspond à un utilisateur existant, `register()` appelle `this.generateTokens(existing)` et retourne des JWT valides **SANS vérifier le mot de passe**. C'est un **bypass d'authentification complet**.
- **Impact** : Un attaquant qui connaît un email enregistré peut obtenir des tokens valides en appelant `POST /auth/register` avec cet email et n'importe quel mot de passe.
- **CVSS estimé** : 9.8 (Critical)
- **Fix** : Retourner une erreur `ConflictException('User already exists')` quand l'email existe déjà, ou retourner une réponse générique "registration initiated" sans leaker l'existence de l'email.

#### MB02 — Auth : Refresh tokens stockés en mémoire

- **Fichier** : `src/modules/auth/auth.service.ts:16-17`
- **Problème** : `private readonly validRefreshTokens = new Set<string>()` avec un commentaire `// TODO: migrate to Redis`. Au restart ou scaling, tous les refresh tokens sont perdus. En multi-pod, un token émis par le pod A est invalide sur le pod B.
- **Impact** : (1) Tous les utilisateurs forcés de se reconnecter à chaque déploiement. (2) En multi-instance, authentification intermittente.
- **Fix** : Migrer vers Redis avec TTL correspondant à l'expiration du refresh token (7 jours).

#### MB03 — Suiveur : Webhook Mailgun sans vérification HMAC

- **Fichier** : `src/modules/agent-suiveur/presentation/controllers/suiveur.controller.ts:31-64`
- **Problème** : L'endpoint `POST /agents/suiveur/webhooks/mailgun` n'a **aucune vérification de signature**. Pas de HMAC, pas de token secret. N'importe qui peut forger des payloads pour marquer des emails comme delivered/opened/bounced, corrompre les données de tracking, ou déclencher des désinscriptions sur des prospects légitimes.
- **Note** : L'audit initial a flaggé le webhook Yousign (B08) mais a manqué ce webhook Mailgun.
- **Fix** : Implémenter la vérification HMAC Mailgun : `crypto.createHmac('sha256', MAILGUN_WEBHOOK_SIGNING_KEY).update(timestamp + token).digest('hex') === signature`.

#### MB04 — Nurtureur : Webhook Mailgun sans vérification HMAC

- **Fichier** : `src/modules/agent-nurtureur/presentation/controllers/nurtureur.controller.ts:51-58`
- **Problème** : Identique à MB03. L'endpoint `POST /agents/nurtureur/webhook/mailgun` est `@Public()` sans aucune vérification de signature.
- **Impact** : Un attaquant peut déclencher des événements `unsubscribed` pour retirer des prospects légitimes des séquences de nurture.
- **Fix** : Même vérification HMAC que MB03.

### 1.2 CRITICAL supplémentaires (8)

#### MC01 — Auth : Pas de protection CSRF pour auth cookie-based

- **Fichier** : `src/modules/auth/auth.controller.ts`
- **Problème** : L'app utilise des cookies httpOnly pour le transport JWT (`sameSite: 'lax'`). `sameSite: lax` bloque les POST cross-origin mais permet les GET. Pas de token CSRF, pas de Double Submit Cookie.
- **Impact** : Les endpoints GET qui retournent des données sensibles (liste prospects, scores, deals) sont vulnérables au CSRF.
- **Fix** : Migrer vers `sameSite: 'strict'` ou implémenter le pattern Double Submit Cookie.

#### MC02 — Dashboard : Pas de @Roles sur les endpoints

- **Fichier** : `src/modules/dashboard/dashboard.controller.ts`
- **Problème** : Le `POST agents/:name/trigger` permet à tout utilisateur authentifié de déclencher des scans d'agents (BOAMP, enrichissement, scoring), brûlant des crédits API et des ressources compute. Aucun `@Roles('admin', 'manager')`.
- **Fix** : Ajouter `@Roles('admin', 'manager')` sur les endpoints de trigger et `@Roles('admin', 'manager', 'viewer')` sur les endpoints de lecture.

#### MC03 — Veilleur Controller : Pas de @Roles

- **Fichier** : `src/modules/agent-veilleur/presentation/controllers/veilleur.controller.ts`
- **Problème** : `POST /agents/veilleur/detect` permet à tout utilisateur authentifié d'injecter des leads arbitraires dans le pipeline.
- **Fix** : Ajouter `@Roles('admin', 'manager')`.

#### MC04 — Prospects Controller : IDOR + pas de ParseUUIDPipe

- **Fichier** : `src/modules/prospects/presentation/controllers/prospect.controller.ts:53-65`
- **Problème** : `GET /prospects/:id` et `PUT /prospects/:id` n'ont pas de `ParseUUIDPipe` et pas de restriction de rôle. Tout utilisateur authentifié peut lire/modifier tout prospect, y compris `enrichmentData` (SIREN, email, données financières).
- **Impact** : Endpoint le plus sensible du système, grand ouvert.
- **Fix** : Ajouter `ParseUUIDPipe`, `@Roles('admin', 'manager')` sur PUT, `@Roles('admin', 'manager', 'viewer')` sur GET.

#### MC05 — Pas de `app.enableShutdownHooks()`

- **Fichier** : `src/main.ts`
- **Problème** : Sans cet appel, NestJS ne peut pas exécuter les hooks `OnModuleDestroy` lors d'un SIGTERM (Docker/K8s). Les workers BullMQ ne sont pas drainés, les connexions Prisma restent ouvertes, les traces Langfuse ne sont pas flushées.
- **Impact** : Jobs corrompus en production à chaque déploiement.
- **Fix** : Ajouter `app.enableShutdownHooks();` dans `main.ts`.

#### MC06 — LLM CostTracker : Compteurs en mémoire

- **Fichier** : `src/modules/llm/cost-tracker.service.ts:8-9`
- **Problème** : `dailySpend` et `monthlySpend` sont des champs de classe (in-memory). En multi-pod, chaque pod a son propre compteur, permettant N × le budget réel.
- **Fix** : Utiliser Redis `INCRBYFLOAT` pour des compteurs atomiques partagés.

#### MC07 — Health check ne vérifie pas Redis

- **Fichier** : `src/core/health/health.controller.ts`
- **Problème** : Seul PostgreSQL est vérifié. Si Redis tombe, toutes les queues BullMQ s'arrêtent silencieusement mais le health endpoint retourne "up".
- **Fix** : Ajouter un Redis health indicator via `@nestjs/terminus`.

#### MC08 — CustomerHealthScore : même race condition que ProspectScore

- **Fichier** : `prisma/schema.prisma:893-901`
- **Problème** : `CustomerHealthScore.isLatest` a le même problème que B04 (ProspectScore). Pas d'index unique partiel.
- **Fix** : `CREATE UNIQUE INDEX ON "CustomerHealthScore" ("customerId") WHERE "isLatest" = true;`

### 1.3 MODERATE supplémentaires (10)

| # | Fichier | Issue |
|---|---------|-------|
| MM01 | `dashboard.controller.ts:20-21,28-29` | `parseInt(limit)` sans borne max — DoS via `limit=999999999` |
| MM02 | `enrichisseur.controller.ts:22-25` | `GET /status/:prospectId` sans `ParseUUIDPipe` |
| MM03 | `llm.service.ts:27` | LlmService ne supporte que `systemPrompt + userPrompt` — pas de messages multi-turn pour few-shot |
| MM04 | `llm.types.ts:1-34` | LlmTask enum manque de granularité — tous les agents routés vers Opus ($15/$75 per 1M) |
| MM05 | `gmail.adapter.ts:153-158` | GmailAdapter envoie toujours text/plain, ignore htmlBody — tracking pixels et contenu formaté ne fonctionnent pas |
| MM06 | `agent-scheduler.service.ts:205-212` | Agent 7 (Analyste) cron dans le scheduler central est un no-op placeholder |
| MM07 | `shared/constants/queue-names.constant.ts` | Pas de `ANALYSTE_PIPELINE` — Agent 7 non-déclenchable depuis le dashboard |
| MM08 | `dashboard.service.ts:562-608` | `triggerAgent()` ne supporte que 5/10 agents — boutons silencieusement cassés pour redacteur, analyste, dealmaker, appels-offres, csm |
| MM09 | `docker-compose.dev.yml` vs `.env.example` | Mots de passe PostgreSQL/Redis différents — setup fail pour les nouveaux devs |
| MM10 | `suiveur.service.ts:31,67,84,310` | 6 accès directs à `process.env` au lieu de `ConfigService` — bypass validation config |

### 1.4 INFO supplémentaires (3)

| # | Issue |
|---|-------|
| MI01 | `WebhookEvent` model existe dans le schema Prisma mais n'est jamais utilisé dans le code — simplifie le fix de B08 |
| MI02 | `Prospect.email @unique` peut causer P2002 si le même email arrive de 2 sources via l'API REST (pas via le processor qui gère ce cas) |
| MI03 | `dashboard/stream` SSE endpoint n'envoie que des heartbeats, pas de vraies données |

---

## 2. Registre CVE par Technologie

### 2.1 Node.js 22.x (installé : 22.22.1)

| CVE | CVSS | Description | Patché dans | Statut |
|-----|------|-------------|-------------|--------|
| CVE-2025-55130 | 9.1 | Permission model bypass via symlinks relatifs | 22.22.0+ | PATCHÉ |
| CVE-2025-59466 | 7.5 | `async_hooks` stack overflow crash | 22.22.0+ | PATCHÉ |
| CVE-2025-59465 | 7.5 | HTTP/2 HEADERS crash via TLSSocket | 22.22.0+ | PATCHÉ |
| CVE-2025-55131 | 7.1 | `Buffer.alloc()` expose mémoire non-initialisée | 22.22.0+ | PATCHÉ |

**Statut** : Node.js 22.22.1 inclut tous les patchs. Aucune action requise.

### 2.2 NestJS 11.x (installé : 11.1.17)

| CVE | CVSS | Description | Risque |
|-----|------|-------------|--------|
| CVE-2025-54782 | 9.4-9.8 | RCE via `@nestjs/devtools-integration` CSRF + sandbox escape | MOYEN (dev only) |
| CVE-2025-69211 | Critical | Fastify URL encoding middleware bypass | BAS (projet utilise Express) |
| CVE-2026-33011 | 9.4 | Fastify HEAD request middleware bypass | BAS (Express) |
| CVE-2025-47944 | 7.5 | Multer DoS via multipart malformé | BAS (multer 2.1.1 patché) |

**Statut** : Le projet utilise Express (pas Fastify). Multer 2.1.1 est patché. Vérifier que `@nestjs/devtools-integration` n'est PAS dans les builds production.

### 2.3 Redis 7.4.x + BullMQ 5.71.0

| CVE | CVSS | Description | Risque |
|-----|------|-------------|--------|
| CVE-2025-49844 "RediShell" | **10.0** | Use-after-free dans Lua GC — RCE par utilisateur authentifié | **CRITIQUE** — BullMQ utilise Lua |
| CVE-2025-46817 | 7.0 | Integer overflow Lua → RCE | HAUT |
| CVE-2025-46818 | N/A | Lua metatable privilege escalation | HAUT |
| CVE-2025-21605 | N/A | Unbounded output buffer DoS sans auth | HAUT |

**Actions obligatoires** :
1. Redis DOIT être en version **7.4.3+**
2. Redis NE DOIT PAS écouter sur `0.0.0.0` — bind à `127.0.0.1` ou réseau Docker interne
3. Configurer `maxmemory-policy noeviction` (OBLIGATOIRE pour BullMQ)
4. Configurer `client-output-buffer-limit` (mitigation CVE-2025-21605)
5. BullMQ REQUIERT Lua — impossible de désactiver via ACL sans casser BullMQ

### 2.4 PostgreSQL 16.x (cible : 16.13)

| CVE | CVSS | Description | Patché dans |
|-----|------|-------------|-------------|
| CVE-2026-2005 | 8.8 | pgcrypto heap buffer overflow → RCE | 16.12+ |
| CVE-2026-2006 | 8.8 | Multibyte validation failure → RCE | 16.12+ |
| CVE-2026-2007 | 8.2 | pg_trgm heap buffer overflow | 16.13+ |
| CVE-2025-8715 | 8.8 | pg_dump newline injection → code execution | 16.10+ |
| CVE-2025-1094 | 8.1 | SQL injection via quoting API bypass | 16.7+ |

**Actions obligatoires** :
1. PostgreSQL DOIT être en version **16.13+**
2. Utiliser `scram-sha-256` (pas `md5`)
3. L'utilisateur applicatif NE DOIT PAS être SUPERUSER
4. Activer TLS 1.3 minimum

### 2.5 Puppeteer/Chrome

| CVE | CVSS | Description | Risque |
|-----|------|-------------|--------|
| CVE-2026-4451 | Critical | Chrome sandbox escape → RCE système | HAUT (PDF depuis HTML non-trusté) |
| CVE-2026-3910 | 8.8 | V8 inappropriate implementation → code execution | HAUT |
| CVE-2026-2649 | 8.8 | V8 integer overflow heap corruption | HAUT |
| CVE-2025-2783 | Critical | V8 type confusion sandbox escape — exploité in the wild | HAUT |

**Actions obligatoires** :
1. NE JAMAIS utiliser `--no-sandbox`
2. Exécuter Puppeteer dans un container Docker avec `cap_drop: ALL`
3. Timeouts stricts sur `page.setContent()` et `page.pdf()`
4. Chrome doit être en version **146+**

### 2.6 Prisma ORM

| Risque | Description | Relevance |
|--------|-------------|-----------|
| Operator Injection | `findFirst`, `findMany` acceptent des opérateurs Prisma (`contains`, `startsWith`, `gt`) — si un input utilisateur est passé directement | HAUT |
| `$queryRawUnsafe` SQL Injection | Fonction qui opt-out de la paramétérisation | HAUT (si utilisé) |

**Action** : Auditer toutes les utilisations de `$queryRawUnsafe`, `$executeRawUnsafe`, et `$executeRaw` pour s'assurer que les inputs sont paramétrisés.

### 2.7 @anthropic-ai/sdk + Claude API

| CVE | CVSS | Description | Risque |
|-----|------|-------------|--------|
| CVE-2026-21852 | 9.8 | `ANTHROPIC_BASE_URL` override exfiltrates API keys | MOYEN (Claude Code, pas SDK) |
| CVE-2025-59536 | 8.7 | RCE via Hooks/MCP server injection | MOYEN (Claude Code) |

**Risques architecturaux LLM** :
- **Prompt Injection directe** via données prospect (OWASP LLM01) — CRITIQUE
- **Prompt Injection indirecte** via contenu web scrapé (BOAMP, LinkedIn, web) — CRITIQUE
- **Excessive Agency** (LLM08) — agents ont accès écriture DB + envoi email — HAUT
- **Sensitive Info Disclosure** (LLM06) — PII prospect dans les prompts — HAUT

### 2.8 Caddy 2.11.x

| CVE | CVSS | Description | Risque |
|-----|------|-------------|--------|
| CVE-2026-27589 | High | CSRF sur `/load` admin endpoint — remplacement config | HAUT si admin API activée |
| CVE-2026-27587 | Medium-High | Path matcher normalization bypass pour routes auth | MOYEN |

**Action** : `admin off` dans le Caddyfile. Caddy 2.11.2 inclut tous les patchs.

### 2.9 Langfuse v3 (installé : 3.38.6)

| Risque | Description | Relevance |
|--------|-------------|-----------|
| Traces LLM non chiffrées | Prompts/réponses stockés en clair dans PostgreSQL | **HAUT** — contient PII prospects |
| OAuth Slack non-auth | Slack lié au projet sans authentification | MOYEN |
| LiteLLM API key leak (CVE-2025-0330) | Clés Langfuse dans messages d'erreur | BAS (pas de LiteLLM) |

**Action** : Activer le chiffrement des traces Langfuse.

### 2.10 PyMuPDF — Clarification CVE

L'audit initial référence "CVE-2026-0006 (CVSS 9.8)" pour PyMuPDF. **Ce CVE n'a pas été confirmé dans les bases publiques NVD/MITRE**. CVE-2026-0006 dans NVD réfère à une vulnérabilité Android Media Codecs.

CVE confirmé pour PyMuPDF :
- **CVE-2026-3029** : Path traversal + écriture arbitraire de fichier dans PyMuPDF 1.26.5, patché dans 1.26.7+

**La mitigation Docker sandbox reste correcte** indépendamment du numéro CVE exact, car MuPDF (bibliothèque C sous-jacente) a un historique de buffer overflows.

### 2.11 Supply Chain npm

| Attaque | Date | Impact |
|---------|------|--------|
| Debug/Chalk compromise | Sept 2025 | 2.6 milliards de téléchargements/semaine compromis |
| Shai-Hulud | Sept 2025 | Worm auto-répliquant via npm publish rights |
| Shai-Hulud 2.0 | Nov 2025 | 25,000+ repos, 350+ comptes, vol de credentials via pre-install |
| `pino-node` / `core-pino` malware | Nov 2025 | Typosquatting du package officiel Pino |
| SANDWORM_MODE | Fév 2026 | 19 packages typosquatting |

**Actions obligatoires** :
1. Toujours `npm ci --frozen-lockfile` en CI/CD (jamais `npm install`)
2. `npm audit --production` sur chaque PR
3. `ignore-scripts: true` dans `.npmrc` par défaut
4. Vérifier les noms de packages dans `package-lock.json` contre le typosquatting

---

## 3. OWASP Top 10 2025 — Applicabilité

| Rang | Catégorie | Applicabilité ProspectionAgentic | Priorité |
|------|-----------|----------------------------------|----------|
| A01 | **Broken Access Control** | IDOR multi-agents (C10, C14, C15, MC04), webhooks sans auth (MB03, MB04), dashboard trigger sans @Roles (MC02) | **CRITIQUE** |
| A02 | **Security Misconfiguration** | Redis config, PostgreSQL pg_hba.conf, CORS, Helmet headers, Docker compose passwords | **CRITIQUE** |
| A03 | **Software Supply Chain** | 70+ dépendances npm, risque typosquatting (Shai-Hulud), lockfile integrity | **HAUT** |
| A04 | **SSRF** | Veilleur scrape URLs externes, Enrichisseur appelle APIs externes, adapters HTTP | **HAUT** |
| A05 | **Injection** | Prisma operator injection, SQL raw queries, prompt injection Claude | **CRITIQUE** |
| A06 | **Cryptographic Failures** | JWT secret strength, bcrypt config, PostgreSQL TLS, Redis TLS, stockage API keys | **HAUT** |
| A07 | **Auth Failures** | Register bypass (MB01), JWT impl, refresh tokens in-memory (MB02) | **CRITIQUE** |
| A08 | **Integrity Failures** | npm supply chain, Docker image provenance, CI/CD pipeline | **HAUT** |
| A09 | **Logging & Monitoring** | Langfuse traces non chiffrées, Pino log redaction, audit trail | **MOYEN** |
| A10 | **Exceptional Conditions** | Error handling dans processors, LLM API failures, rate limiting responses | **MOYEN** |

---

## 4. OWASP LLM Top 10 2025 — Applicabilité

| Rang | Risque | Applicabilité | Priorité |
|------|--------|--------------|----------|
| LLM01 | **Prompt Injection** | Données prospect + contenu web scrapé → prompts Claude. Multi-agents amplifie le risque | **CRITIQUE** |
| LLM02 | **Sensitive Info Disclosure** | PII prospects (email, téléphone, SIREN) dans les prompts | **HAUT** |
| LLM04 | **Data & Model Poisoning** | Données LinkedIn/web scrapées contenant contenu adversarial | **HAUT** |
| LLM06 | **Excessive Agency** | Agents ont accès écriture DB, envoi email, publication queue | **HAUT** |
| LLM07 | **System Prompt Leakage** | System prompts contenant logique business extractible | **MOYEN** |
| LLM09 | **Misinformation** | Emails générés avec des claims fausses sur produits/services | **HAUT** |

---

## 5. Conformité RGPD/LCEN/CNIL — Guide Légal

### 5.1 Base légale pour la prospection B2B en France

| Exigence | Base légale | Statut ProspectionAgentic | Action |
|----------|-------------|---------------------------|--------|
| **Intérêt légitime** (Art. 6.1.f RGPD) | B2B vers adresses pro autorisé sans consentement préalable | Utilisé par le système | Documenter le test de balance des intérêts |
| **Email pro uniquement** (LCEN Art. L.34-5) | Seul `nom@entreprise.fr` qualifie. `prenom@gmail.com` nécessite opt-in | **NON VÉRIFIÉ** | Ajouter validation regex pro-email |
| **Lien de désinscription** (LCEN Art. L.34-5) | Chaque email DOIT inclure un lien gratuit, immédiat, one-click | Agent 5 (OK), Agent 4 (**MANQUANT** - B05), Agent 6 (OK) | Corriger Agent 4 (BLOCKING) |
| **Identification expéditeur** (LCEN) | Nom société, SIRET, adresse dans chaque email | Agent 5 (OK), Agent 4 (**MANQUANT**) | Corriger Agent 4 |
| **Origine des données** (RGPD Art. 14) | Premier contact doit divulguer la source des données | **NON IMPLÉMENTÉ** | Ajouter dans le template premier email |
| **Droit d'opposition** (RGPD Art. 21) | Offert dès le premier contact, gratuit et simple | Partiellement via lien désinscription | Compléter avec mention explicite |
| **Rétention** (Guidelines CNIL) | Purge après 3 ans d'inactivité | **NON IMPLÉMENTÉ** | Ajouter cron de purge |
| **Opt-out processing** (CNIL) | Traitement en **24-48h max** | **NON MESURÉ** | Implémenter SLA tracking |

### 5.2 Sanctions CNIL de référence (2024-2025)

| Entreprise | Amende | Motif | Leçon pour ProspectionAgentic |
|------------|--------|-------|-------------------------------|
| **KASPR** | 240 000 EUR | Scraping données LinkedIn pour prospection B2B sans transparence | **DIRECTEMENT APPLICABLE** — le projet scrape LinkedIn |
| **SOLOCAL** | 900 000 EUR | Prospection commerciale non-conforme | Opt-out et transparence obligatoires |
| **HUBSIDE STORE** | N/A | Données brokers sans vérification du consentement original | Ne pas se fier aux garanties contractuelles du broker |

**Amendes maximales** : 20 millions EUR ou 4% du CA mondial (RGPD), 75 000/375 000 EUR (LCEN).

### 5.3 EU AI Act (applicable août 2026)

- **Enforcement** : 2 août 2026 pour les obligations sur les systèmes à haut risque
- **Amendes** : Jusqu'à **35M EUR ou 7% du CA mondial**
- **Relevance** : Un système de scoring automatisé (Agent 3) et de prise de décision automatisée (GO/NO-GO Agent 9) pourrait être classé "haut risque"
- **Action** : Préparer un DPIA (Data Protection Impact Assessment) et documenter la logique de décision

### 5.4 Délivrabilité email (2025-2026)

Gmail et Microsoft appliquent depuis novembre 2025 :

| Exigence | Détail | Statut |
|----------|--------|--------|
| **SPF** | Enregistrement SPF sur le domaine d'envoi | À configurer |
| **DKIM** | Clé **2048 bits minimum** (1024 refusé) | À configurer |
| **DMARC** | Minimum `p=none`, migration vers `p=quarantine` en 2026 | À configurer |
| **TLS** | Toutes les connexions mail en TLS | À vérifier |
| **One-click unsubscribe** | RFC 8058, headers `List-Unsubscribe` et `List-Unsubscribe-Post` | **NON IMPLÉMENTÉ** |
| **Taux de plainte** | < 0.3%, idéalement < 0.1% | À monitorer |
| **Warm-up** | Nouveaux domaines : 50 emails/jour, +20%/jour | À implémenter |

---

## 6. Guide de Correction — Bonnes Pratiques

### BP01 — Authentification & Autorisation

```
✅ FAIRE :
- JWT : spécifier algorithms: ['HS256'] dans signOptions (jamais laisser le token contrôler l'algo)
- JWT secret : minimum 256 bits (32+ caractères aléatoires)
- JWT expiresIn court (15min access, 7j refresh)
- Refresh tokens en Redis avec TTL
- Rotation des refresh tokens à chaque utilisation
- @Roles sur CHAQUE controller, pas seulement les POST
- ParseUUIDPipe sur CHAQUE paramètre :id
- Retourner des erreurs génériques sur register/login (pas de user enumeration)
```

### BP02 — Validation des entrées

```
✅ FAIRE :
- ZodValidationPipe sur CHAQUE @Body()
- .strip() sur les schemas Zod (defense contre mass assignment)
- Whitelist les champs acceptés pour les filtres Prisma
- Limiter les paramètres de pagination (max 100)
- Valider les types de fichier avant upload
- Utiliser $queryRaw (tagged template) JAMAIS $queryRawUnsafe
```

### BP03 — Protection des webhooks

```
✅ FAIRE :
- Mailgun : vérifier HMAC-SHA256(timestamp + token) === signature
- Yousign : vérifier HMAC du payload
- Slack : vérifier X-Slack-Signature avec Signing Secret
- Idempotence : table WebhookEvent(provider, eventId, processedAt)
- Timeout : 5s max pour traiter un webhook, dispatch async si plus long
```

### BP04 — BullMQ en production

```
✅ FAIRE :
- Redis maxmemory-policy: noeviction (OBLIGATOIRE)
- lockDuration: 2x la durée max du job (120s pour jobs LLM)
- maxStalledCount: 2
- removeOnComplete: { count: 100, age: 3600 }
- removeOnFail: { count: 500, age: 86400 }
- Payloads minimaux (IDs seulement, pas de données complètes)
- Séparer les connexions Redis pour Queue (fail-fast) et Worker (patient reconnect)
- Redis lock distribué pour tous les @Cron (Redlock)
```

### BP05 — Appels LLM

```
✅ FAIRE :
- Sanitiser TOUTES les données avant inclusion dans un prompt (sanitizeForPrompt)
- Délimiteurs XML pour séparer instructions/données : <user_data>...</user_data>
- Valider le JSON de sortie avec un schema Zod strict
- Re-ask pattern : si output invalide, renvoyer l'erreur au LLM (max 2 retries)
- maxTokens avec 20% de marge au-dessus de la taille attendue
- Désactiver les retries SDK si BullMQ gère les retries (éviter 3 × 3 = 9 retries)
- Router les tâches vers le bon modèle (Haiku pour tri, Sonnet pour rédaction, Opus pour stratégie)
- Budget tracking en Redis (INCRBYFLOAT), pas en mémoire
```

### BP06 — RGPD / LCEN

```
✅ FAIRE :
- Footer LCEN déterministe sur CHAQUE email : SIRET + adresse + lien désinscription
- Headers RFC 8058 : List-Unsubscribe et List-Unsubscribe-Post
- Lien de désinscription signé HMAC (pas JWT avec expiration)
- Endpoint désinscription PUBLIC (pas d'auth requise)
- Traitement opt-out en < 24h
- Purge automatique après 3 ans d'inactivité
- Divulguer l'origine des données dans le premier email
- Vérifier que l'email est professionnel (pas @gmail, @yahoo, etc.)
- Chiffrer les traces Langfuse
```

### BP07 — Infrastructure & Shutdown

```
✅ FAIRE :
- app.enableShutdownHooks() dans main.ts
- OnModuleDestroy sur Langfuse interceptor (flushAsync/shutdownAsync)
- OnModuleDestroy sur PrismaService ($disconnect)
- Redis health check dans le health controller
- connection_limit dans DATABASE_URL (adapter au nombre de pods × concurrency)
- CORS restrictif (pas origin: '*')
- Helmet middleware
- Disable X-Powered-By header
```

---

## 7. Guide de Correction — Mauvaises Pratiques à Éviter

### AP01 — Authentification

```
❌ NE PAS FAIRE :
- Retourner des tokens valides pour un email existant sans vérifier le mot de passe
- Stocker des refresh tokens en mémoire (Set, Map, Array)
- Utiliser alg: "none" ou permettre au token de choisir l'algorithme
- JWT secret < 256 bits (ex: "secret", "my_jwt_key")
- JWT sans expiration (expiresIn manquant)
- sameSite: 'lax' sans protection CSRF supplémentaire pour les GET sensibles
```

### AP02 — Validation

```
❌ NE PAS FAIRE :
- @Body() body: any avec .parse() manuel (utiliser ZodValidationPipe)
- parseInt(query.limit) sans borne max (DoS via limit=999999999)
- @Param('id') sans ParseUUIDPipe (injection de strings arbitraires)
- Passer des inputs utilisateur directement dans les requêtes Prisma sans whitelist
- process.env.* directement dans les services (utiliser ConfigService)
- Hardcoder des valeurs qui devraient être en config (stepNumber: 1)
```

### AP03 — BullMQ & Redis

```
❌ NE PAS FAIRE :
- Redis avec maxmemory-policy autre que noeviction (perte silencieuse de jobs)
- Redis exposé sur 0.0.0.0 (RCE via CVE-2025-49844)
- Stacker retries SDK + retries BullMQ (3 × 3 = 9 retries)
- Payloads volumineux dans les jobs (stocker les données, passer les IDs)
- @Cron sans lock distribué en multi-pod (exécution dupliquée)
- Processor qui log sans appeler le service (code mort - B09)
```

### AP04 — LLM

```
❌ NE PAS FAIRE :
- Interpoler des données non-sanitisées dans les prompts (prompt injection)
- Faire confiance au format de sortie du LLM sans validation Zod
- Utiliser le même LlmTask pour des tâches de nature différente (analyse vs rédaction)
- Budget tracking en mémoire (contournable en multi-pod)
- Ignorer les headers Retry-After de l'API Anthropic
- Définir des few-shot examples sans jamais les injecter (code mort - C13)
- Appeler validate() sans passer les paramètres requis (checks morts - C14)
```

### AP05 — Webhooks

```
❌ NE PAS FAIRE :
- Endpoint @Public() sans vérification HMAC/signature
- Traiter un webhook sans vérifier l'idempotence (table WebhookEvent)
- Faire confiance au payload webhook sans validation Zod
- Traitement synchrone lourd dans le handler webhook (dispatch async)
```

### AP06 — RGPD / Emails

```
❌ NE PAS FAIRE :
- Envoyer des emails sans footer LCEN (750 EUR/email d'amende)
- Lien de désinscription avec JWT expirant (l'opt-out échoue)
- Endpoint de désinscription nécessitant une authentification
- Scraping LinkedIn sans transparence (240K EUR amende KASPR)
- Conserver des données prospect > 3 ans sans interaction
- Prospecter des emails personnels (@gmail) en B2B (hors cadre légal)
- Ignorer les opt-out pendant plus de 48h
```

---

## 8. Guide de Correction — Edge Cases Critiques

### EC01 — BullMQ Job Stalling

**Scénario** : Un job Agent 2 (enrichissement) fait un appel Claude API qui prend 45s. Le `stalledInterval` BullMQ par défaut est 30s. BullMQ marque le job comme "stalled", le remet en queue. Un deuxième worker le prend → enrichissement dupliqué, double comptage API.

**Mitigation** : `lockDuration: 120000` (2 min) sur les workers avec appels LLM. Utiliser `job.extendLock()` pendant les opérations longues.

### EC02 — Prisma Connection Pool Exhaustion

**Scénario** : 10 agents avec 5 workers BullMQ chacun = 50 workers concurrents. Chaque enrichissement fait 4-6 queries Prisma. Pool par défaut : `num_cpus * 2 + 1` ≈ 17 connexions. 50 workers × 4 queries = 200 requêtes simultanées → pool exhaustion, timeouts.

**Mitigation** : `DATABASE_URL=...?connection_limit=30` + PgBouncer en mode transaction pooling.

### EC03 — Double Retry LLM

**Scénario** : Le SDK Anthropic a auto-retry intégré (3 tentatives). BullMQ a 3 tentatives avec backoff. Un seul appel Claude qui échoue déclenche : SDK retry 1, SDK retry 2, SDK retry 3 (échec) → BullMQ retry 1 → SDK retry 1, 2, 3 → BullMQ retry 2 → SDK retry 1, 2, 3 = **9 appels API**.

**Mitigation** : Désactiver les retries SDK (`maxRetries: 0` dans l'options du client Anthropic) et gérer les retries exclusivement via BullMQ.

### EC04 — Enrichissement Partiel

**Scénario** : `enrichContact()` réussit (email trouvé) mais `enrichCompany()` timeout après 3 min. Le prospect est marqué "enriched" avec données partielles. L'idempotency guard (24h) empêche un ré-enrichissement. Le score de completude est bas → priorité basse → le prospect ne sera jamais correctement traité.

**Mitigation** : Tracker "partiallyEnriched" séparément de "enriched". Cooldown court (1h) pour les partiels, 24h pour les complets.

### EC05 — Lien de Désinscription Expiré

**Scénario** : Le lien de désinscription utilise un JWT avec expiration 7j. Le prospect ouvre l'email 10 jours plus tard et clique. Le JWT est expiré → l'opt-out échoue → non-conformité LCEN.

**Mitigation** : Utiliser un token HMAC-based (pas JWT) sans expiration. Le token encode l'email en HMAC-SHA256 avec un secret fixe.

### EC06 — Register puis Login Race Condition

**Scénario** : Deux requêtes simultanées `POST /register` avec le même email. La première crée l'utilisateur. La seconde le trouve existant et retourne des tokens sans vérifier le mot de passe (MB01).

**Mitigation** : Fixer MB01 d'abord. Puis ajouter un lock Redis sur l'email pendant l'opération register.

### EC07 — FlowProducer et Jobs Dupliqués (Agent 9)

**Scénario** : Le FlowProducer déclare QUALIFY (9b) comme child de JURISTE (9c), CHIFFREUR (9d), et MEMOIRE_REDACTEUR (9e) avec des jobIds différents (`-chiffreur`, `-memoire`). Résultat : 9b s'exécute 3 fois. Chaque exécution écrit dans la même row `aoAnalyse`, la dernière gagne.

**Mitigation** (déjà documentée dans l'audit initial) : Restructurer le flow pour que 9b soit exécuté une seule fois, avec un seul jobId.

### EC08 — Webhook Replay Storm

**Scénario** : Yousign ou Mailgun rencontre une erreur réseau et rejoue 50 webhooks en 10 secondes. Sans idempotence, chaque webhook déclenche un traitement complet.

**Mitigation** : Table `WebhookEvent` avec index unique sur `(provider, eventId)`. `INSERT ... ON CONFLICT DO NOTHING`. Retourner 200 immédiatement si déjà traité.

### EC09 — Scoring Input Dead Code

**Scénario** (Agent 3) : L'interface `ScoringInput` définit 17+ champs. Le code `buildScoringInput()` n'en peuple aucun depuis `enrichmentData`. Tous les soft malus, bonuses segment, et hard disqualifications qui dépendent de ces champs sont du code mort. Un prospect `entrepriseFermee: true` ne sera jamais disqualifié car le champ n'est jamais lu.

**Mitigation** : Mapper chaque champ ScoringInput depuis `prospect.enrichmentData` dans `buildScoringInput()`.

### EC10 — GmailAdapter Text/Plain Only

**Scénario** : L'Agent 8 (Dealmaker) envoie un devis avec un tracking pixel HTML. Le GmailAdapter strip tous les tags HTML et envoie en text/plain. Le tracking pixel disparaît, l'auto-advance du deal sur ouverture ne fonctionne jamais.

**Mitigation** : Implémenter `multipart/alternative` dans le GmailAdapter (text/plain + text/html).

---

## 9. Roadmap de Correction Étape par Étape

### Phase 0 — Sécurité Critique (Semaine 1)

**Objectif** : Corriger les vulnérabilités exploitables immédiatement.

| # | Tâche | Fichier(s) | Effort | Dépend de |
|---|-------|-----------|--------|-----------|
| 0.1 | **Fix auth register bypass** (MB01) | `auth.service.ts` | 30 min | — |
| 0.2 | **Migrer refresh tokens vers Redis** (MB02) | `auth.service.ts` | 2h | — |
| 0.3 | **Ajouter HMAC Mailgun sur webhook Suiveur** (MB03) | `suiveur.controller.ts` | 1h | — |
| 0.4 | **Ajouter HMAC Mailgun sur webhook Nurtureur** (MB04) | `nurtureur.controller.ts` | 1h | — |
| 0.5 | **Ajouter idempotence webhook Yousign** (B08) | `yousign.service.ts` + migration | 2h | MI01 (table existe déjà) |
| 0.6 | **app.enableShutdownHooks()** (MC05) | `main.ts` | 15 min | — |
| 0.7 | **Ajouter @Roles sur controllers manquants** (MC02-MC04, C18, C36) | 5 controllers | 1h | — |
| 0.8 | **Ajouter ParseUUIDPipe manquants** (MC04, MM02) | 3 controllers | 30 min | — |
| 0.9 | **Vérifier Redis ≥ 7.4.3 + bind 127.0.0.1** | docker-compose | 30 min | — |
| 0.10 | **Vérifier PostgreSQL = 16.13 + scram-sha-256** | docker-compose | 30 min | — |

**Total Phase 0** : ~10h

### Phase 1 — BLOCKING Business (Semaine 1-2)

**Objectif** : Débloquer les fonctionnalités cassées.

| # | Tâche | Fichier(s) | Effort | Dépend de |
|---|-------|-----------|--------|-----------|
| 1.1 | **Fix LCEN footer Agent 4** (B05) | `redacteur.service.ts` | 1h | — |
| 1.2 | **Fix stepNumber hardcodé** (B06) | `prisma-generated-message.repository.ts`, `generated-message.entity.ts` | 2h | — |
| 1.3 | **Fix Dealmaker processor dispatch** (B09) | `dealmaker.processor.ts` | 3h | — |
| 1.4 | **Fix segment passthrough Enrichisseur** (B02) | `enrichisseur.service.ts` | 1h | — |
| 1.5 | **Fix mergeWithExisting** (B03) | `enrichisseur.processor.ts` | 3h | — |
| 1.6 | **Câbler Master consolidation batch** (B01) | `agent-scheduler.service.ts`, `veilleur.service.ts` | 4h | — |
| 1.7 | **Fix race condition isLatest** (B04 + MC08) | Migration SQL + `prisma-prospect-score.repository.ts` | 2h | — |
| 1.8 | **Ajouter Redis distributed lock sur crons** (B07, C23) | 4+ services avec @Cron | 3h | — |
| 1.9 | **Peupler ScoringInput depuis enrichmentData** (C09) | `scoreur.service.ts` | 3h | — |
| 1.10 | **Injecter few-shot examples** (C13) | `redacteur.service.ts`, `prompt-templates.ts` | 2h | MM03 (LlmService multi-turn) |
| 1.11 | **Passer params validation** (C14) | `redacteur.service.ts` | 30 min | — |
| 1.12 | **Fix segment vs category** (C11) | `scoreur.service.ts` + migration | 1h | — |

**Total Phase 1** : ~26h

### Phase 2 — CRITICAL Sécurité & Compliance (Semaine 2-3)

| # | Tâche | Effort | Dépend de |
|---|-------|--------|-----------|
| 2.1 | **RGPD gates par consentBasis** (C19, C20) | 3h | — |
| 2.2 | **Tracking pixel Content-Type fix** (C27) | 15 min | — |
| 2.3 | **Transfer GAGNE → Agent 8/10 via BullMQ** (C28) | 2h | — |
| 2.4 | **Deadline alerting cron J-5/J-3/J-1** (C29) | 3h | — |
| 2.5 | **Audit trail append-only** (C30) | 3h | Migration |
| 2.6 | **Redis health check** (MC07) | 1h | — |
| 2.7 | **CostTracker Redis** (MC06) | 2h | — |
| 2.8 | **Slack channels WARNING vs CRITICAL** (C21, C22) | 2h | — |
| 2.9 | **Optimistic locking deals** (C26) | 2h | Migration |
| 2.10 | **Chiffrement traces Langfuse** | 1h | — |
| 2.11 | **SPF/DKIM/DMARC setup** | 2h | Accès DNS |
| 2.12 | **List-Unsubscribe headers RFC 8058** | 2h | — |

**Total Phase 2** : ~23h

### Phase 3 — Tests Manquants (Semaine 3-4)

| # | Tâche | Tests estimés | Effort |
|---|-------|:------------:|--------|
| 3.1 | Tests `scoreur.service.ts` | 15 | 4h |
| 3.2 | Tests `redacteur.service.ts` | 15 | 4h |
| 3.3 | Tests `suiveur.service.ts` | 15 | 4h |
| 3.4 | Tests `enrichisseur.processor.ts` | 10 | 3h |
| 3.5 | Tests `email-finder.service.ts` (waterfall) | 10 | 3h |
| 3.6 | Tests `company-enricher.service.ts` | 8 | 2h |
| 3.7 | Tests `deduplication.service.ts` + `pre-scoring.service.ts` | 12 | 3h |
| 3.8 | Tests adapters (Reacher, INPI, BODACC) | 15 | 4h |
| 3.9 | Tests `auth.service.ts` | 10 | 3h |

**Total Phase 3** : ~30h, ~110 tests supplémentaires

### Phase 4 — Agent 10 CSM (Semaine 4-5)

| # | Tâche | Effort |
|---|-------|--------|
| 4.1 | Rédiger documentation technique (10-AGENT-10-CSM.md + 10b + 10c) | 8h |
| 4.2 | Aligner schema DealToCSM avec Agent 8 (B12) | 2h |
| 4.3 | Implémenter 10a Onboarding (5 templates, risk detection, TTV) | 8h |
| 4.4 | Implémenter 10b Upsell (scoring, matrix, blockers) | 6h |
| 4.5 | Implémenter 10c Satisfaction (health score composite, NPS/CSAT) | 6h |
| 4.6 | Implémenter 10d Avis (5 plateformes, gestion négatifs) | 4h |
| 4.7 | Implémenter 10e Referral (ambassadeurs, codes, commissions) | 4h |
| 4.8 | Communication inter-agents (queues vers Agent 1/6/7/8) | 3h |
| 4.9 | Tests (objectif : 50+) | 8h |

**Total Phase 4** : ~49h

### Phase 5 — MODERATE & Optimisations (Semaine 5-6)

| # | Tâche | Effort |
|---|-------|--------|
| 5.1 | Docker sandbox PyMuPDF (B10) | 8h |
| 5.2 | GmailAdapter multipart/alternative (MM05) | 3h |
| 5.3 | Slack notifications Jonathan Agent 8 (C24, C25) | 4h |
| 5.4 | LlmService multi-turn support (MM03) | 3h |
| 5.5 | LlmTask enum granularity + model routing (MM04) | 2h |
| 5.6 | BOAMP CPV filtering (C02) + estimatedValue (C03) | 3h |
| 5.7 | Behavioral branching nurtureur (M33) | 2h |
| 5.8 | LinkedIn adapter Waalaxy (M26, M32) | 8h |
| 5.9 | Dashboard triggerAgent pour 10/10 agents (MM08) | 2h |
| 5.10 | Domain rotation envoi email (M27) | 3h |
| 5.11 | Warm-up strategy nouveaux domaines | 2h |
| 5.12 | DPIA (Data Protection Impact Assessment) | 4h |
| 5.13 | Purge RGPD 3 ans automatique | 2h |

**Total Phase 5** : ~46h

### Résumé Roadmap

| Phase | Semaine | Effort | Impact |
|-------|---------|--------|--------|
| **Phase 0** — Sécurité Critique | S1 | ~10h | Ferme les failles exploitables |
| **Phase 1** — BLOCKING Business | S1-2 | ~26h | Déboque les features cassées |
| **Phase 2** — CRITICAL Sécu & Compliance | S2-3 | ~23h | RGPD, tracking, alerting |
| **Phase 3** — Tests Manquants | S3-4 | ~30h | +110 tests, couverture services principaux |
| **Phase 4** — Agent 10 CSM | S4-5 | ~49h | Agent complet de 5 sous-agents |
| **Phase 5** — MODERATE & Optimisations | S5-6 | ~46h | Hardening, LinkedIn, délivrabilité |
| **TOTAL** | **6 semaines** | **~184h** | |

---

*Audit enrichi réalisé le 2026-03-29 par 3 agents Opus en parallèle : meta-audit de l'audit initial, recherche CVE/OWASP web, et recherche edge cases/anti-patterns/compliance.*
