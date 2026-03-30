# 02 — Roadmap de Correction — Planning par Phases

**Principe :** Fixer du plus critique au moins critique, en groupant par domaine pour paralléliser.

---

## Phase 1 — URGENCES SÉCURITÉ (Immédiat — 30min)

**Objectif :** Éliminer les risques de sécurité immédiats.

| # | Fix | Temps | Impact |
|---|-----|:-----:|--------|
| B7 | Rotation clé API Anthropic | 5min | Stoppe le risque d'utilisation frauduleuse |
| C8 | JWT secret validation min(32) + reject placeholders | 10min | Empêche déploiement avec secret faible |
| C9 | AuthModule → lire `jwt.secret` au lieu de `JWT_SECRET` brut | 5min | Active la validation Zod |
| C10 | Password policy : ajouter regex complexité | 10min | Bloque les mots de passe faibles |

**Prérequis :** Aucun
**Parallélisable :** Oui, tous indépendants

---

## Phase 2 — PIPELINE BULLMQ (1-2h)

**Objectif :** Rétablir le pipeline agent de bout en bout.

| # | Fix | Temps | Impact |
|---|-----|:-----:|--------|
| B13 | Ajouter case `message.generated` dans SuiveurProcessor | 15min | Messages enfin envoyés |
| B14 | Ajouter case `nurture-prospect` dans NurtureurProcessor | 15min | Nurture pipeline rétabli |
| B12 | Corriger detectResponses() — query avec vrai prospectId | 30min | Détection réponses fonctionnelle |
| B15 | Inclure companyName/mrrEur dans job CSM onboarding | 15min | Onboarding clients automatique |
| C13 | Enregistrer + consumer Dead Letter Queue | 30min | Jobs échoués tracés |

**Prérequis :** Aucun
**Parallélisable :** Oui, chaque fix est un fichier différent
**Validation :** Lancer le pipeline complet avec un prospect test et vérifier que chaque étape s'enchaîne

---

## Phase 3 — ROUTES BACKEND MANQUANTES (1-2h)

**Objectif :** Le dashboard peut charger toutes ses pages.

| # | Fix | Temps | Impact |
|---|-----|:-----:|--------|
| B1 | Ajouter GET /agents/appels-offres (liste tenders) | 20min | V4 accessible |
| B2 | Ajouter GET /agents/appels-offres/tenders/:id | 15min | V4 détail accessible |
| B3 | Ajouter GET /agents/dealmaker/deals (liste deals) | 20min | V5 Kanban accessible |
| B4 | Aligner method+path deal stage update | 10min | Drag-drop Kanban fonctionne |
| B5 | Créer GET /api/dashboard/action-items | 30min | V7 Actions Rapides fonctionnel |
| B6 | Créer GET /api/dashboard/agents/graph | 30min | V6 Graph fonctionnel |

**Prérequis :** Aucun
**Parallélisable :** Oui (6 fichiers différents)
**Validation :** Chaque page du dashboard charge sans 404

---

## Phase 4 — AUTH + FRONTEND ARCHITECTURE (2-3h)

**Objectif :** Authentification robuste et frontend stable.

| # | Fix | Temps | Impact |
|---|-----|:-----:|--------|
| B19 | Convertir useAuth en React Context | 45min | Auth partagée entre composants |
| B16 | Logout propre via useAuth().logout() | 10min | Session nettoyée correctement |
| B17 | Intercepteur 401 + token refresh dans api.ts | 30min | Expiration JWT transparente |
| B18 | Fix SSE memory leak (clearTimeout dans disconnect) | 10min | Plus de connexions fantômes |
| B20 | SSE avec token query param ou fetch-based | 30min | SSE authentifié |
| B9 | Rate limit sur /auth/refresh | 5min | Token grinding bloqué |
| B10 | Refresh tokens en Redis + rotation | 45min | Tokens révocables |
| B11 | Réponse générique sur register | 10min | Pas d'enumération d'utilisateurs |

**Prérequis :** Phase 3 (les routes doivent exister pour que le refresh fonctionne)
**Parallélisable :** Backend (B9, B10, B11) en parallèle avec Frontend (B19, B16, B17, B18, B20)

---

## Phase 5 — DATA CONTRACT ALIGNMENT (1-2h)

**Objectif :** Les données affichées dans le dashboard sont correctes.

| # | Fix | Temps | Impact |
|---|-----|:-----:|--------|
| C1 | Backend metrics → retourner DailyMetrics[] depuis MetriquesDaily | 30min | Graphiques fonctionnels |
| C2 | Pagination response : aligner pageSize/limit + ajouter totalPages | 15min | Pagination fonctionne |
| C3 | Accepter tous les query params dans ProspectController | 20min | Filtres prospects fonctionnels |
| C4 | Ajouter Prisma includes pour score/signals/interactions | 30min | Fiche prospect complète |
| C5 | Aligner DealStage enum (un set unique) | 20min | Kanban transitions OK |

**Prérequis :** Phase 3 (routes existent)
**Parallélisable :** Oui

---

## Phase 6 — SÉCURITÉ AVANCÉE (1-2h)

**Objectif :** Hardening sécurité complet.

| # | Fix | Temps | Impact |
|---|-----|:-----:|--------|
| B8 | Migrer JWT vers HttpOnly cookies | 1h | Protection XSS |
| C7 | Appeler validateExternalUrl() dans tous les adapters | 30min | SSRF protection active |
| C11 | Ajouter paths PII à la redaction Pino | 15min | Conformité RGPD logs |
| S7 | Account lockout après N échecs | 30min | Protection brute-force distribuée |
| S8 | CSRF token si cookies implémentés | 20min | Protection CSRF |

**Prérequis :** Phase 4 (auth architecture en place)
**Parallélisable :** Backend (C7, C11, S7) en parallèle avec Frontend (B8, S8)

---

## Phase 7 — PERFORMANCE + UX (1h)

**Objectif :** Polish et optimisations.

| # | Fix | Temps | Impact |
|---|-----|:-----:|--------|
| C12 | Batch-load dans NurtureurService (N+1 fix) | 20min | Performance nurture |
| C14 | Transaction dans VeilleurService save loop | 15min | Fiabilité détection |
| C15 | Connection pool Prisma | 5min | Stabilité sous charge |
| C16 | Optimistic update Kanban | 20min | UX fluide |
| C17 | Confirmation dialog "Forcer NO-GO" | 10min | Protection erreur humaine |
| S1 | NotificationBell avec vrai count | 10min | Feature complète |
| S2 | AgentCard → navigation ou retirer cursor-pointer | 5min | UX cohérente |
| S3 | Debounce timeline search | 10min | Performance |
| S4 | DeadlineCountdown J négatif → "Expiré" | 5min | Affichage correct |
| S5 | createMany + addBulk dans VeilleurService | 15min | Performance batch |
| S6 | Index Prisma manquants | 5min | Performance DB |

**Prérequis :** Phases 1-6 terminées
**Parallélisable :** Oui

---

## Timeline résumé

```
Phase 1 — Sécurité urgente     ███░░░░░░░░░░░░░░░░░ 30min
Phase 2 — Pipeline BullMQ      ██████░░░░░░░░░░░░░░ 1-2h
Phase 3 — Routes manquantes    ██████░░░░░░░░░░░░░░ 1-2h
Phase 4 — Auth + Frontend      █████████░░░░░░░░░░░ 2-3h
Phase 5 — Data contract        ██████░░░░░░░░░░░░░░ 1-2h
Phase 6 — Sécurité avancée     ██████░░░░░░░░░░░░░░ 1-2h
Phase 7 — Performance + UX     ██████░░░░░░░░░░░░░░ 1h
                                ────────────────────
                                Total estimé : 8-14h
```

**Avec agents parallèles (APEX -m) :** 4-6h réelles

---

## Ordre d'exécution recommandé

```
1. Phase 1 (Sécurité urgente) — en premier, toujours
2. Phase 2 + Phase 3 en parallèle — backend pipeline + routes
3. Phase 4 — auth architecture
4. Phase 5 — data alignment
5. Phase 6 — hardening
6. Phase 7 — polish
```

Après chaque phase : `npm run build && npm test` pour valider.
