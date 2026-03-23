# Roadmap de Développement — Axiom Prospection Agentique

**Version :** 1.0.0
**Dernière mise à jour :** 23 mars 2026
**Durée totale estimée :** 6-9 mois (5 phases)
**Principe directeur :** Valider avant d'automatiser, simplifier avant de scaler.

---

## Vue d'Ensemble des Phases

```
Mois 1            Mois 2-3           Mois 3-4           Mois 4-6          Mois 6-9
╔══════════════╗  ╔════════════════╗  ╔════════════════╗  ╔═══════════════╗  ╔═══════════════╗
║  PHASE 0     ║  ║  PHASE 1       ║  ║  PHASE 2       ║  ║  PHASE 3      ║  ║  PHASE 4      ║
║  FONDATIONS  ║→ ║  DATA PIPELINE ║→ ║  EMAIL         ║→ ║  LINKEDIN +   ║→ ║  CLOSING +    ║
║              ║  ║                ║  ║  OUTREACH      ║  ║  NURTURING    ║  ║  MARCHÉS      ║
║  Validation  ║  ║  Agents 1-3    ║  ║  Agents 4-5    ║  ║  Agents 6-7   ║  ║  Agents 8-10  ║
║  manuelle    ║  ║  (données)     ║  ║  (emails)      ║  ║  (+LinkedIn)  ║  ║  (deals+AO)   ║
╚══════╤═══════╝  ╚═══════╤════════╝  ╚═══════╤════════╝  ╚══════╤════════╝  ╚═══════════════╝
       │                  │                    │                   │
    GO/NO-GO           Leads>10/j         Open>20%            COLD→HOT>5%
    Reply>3%           Enrichi>60%        Reply>3%
```

---

## PHASE 0 — FONDATIONS (Semaines 1-4)

**Objectif :** Valider que le funnel de prospection convertit AVANT d'investir dans l'automatisation.
**Coût :** ~2-3K EUR (avocat) + ~100 EUR/mois (infra)
**Bloquant pour :** Toutes les phases suivantes

### Semaine 1 — Setup Juridique & Domaines

#### 0.1 Consultation RGPD
| Tâche | Livrable | Doc de référence |
|-------|----------|------------------|
| Prendre RDV avec avocat RGPD spécialisé B2B | Avis juridique écrit | [04-SECURITE/03-rgpd-conformite.md](./04-SECURITE/03-rgpd-conformite.md) |
| Points à couvrir : base légale (intérêt légitime), LinkedIn, durée conservation, scraping | Document avec recommandations concrètes | [brainstorming/08-RISQUES-MITIGATIONS.md](../brainstorming/08-RISQUES-MITIGATIONS.md) R-001 |
| Budget : 2-3K EUR | Facture | — |

**Pourquoi en premier :** Le précédent KASPR (240K EUR d'amende CNIL) rend cette étape non-négociable. Voir [04-SECURITE/03-rgpd-conformite.md §KASPR](./04-SECURITE/03-rgpd-conformite.md).

#### 0.2 Domaines Email Dédiés
| Tâche | Livrable | Doc de référence |
|-------|----------|------------------|
| Acheter 3 domaines (ex: insights-axiom.fr, axiom-digital.com, axiom-partners.fr) | 3 domaines enregistrés | [07-GUIDES/03-anti-patterns.md](./07-GUIDES/03-anti-patterns.md) AP-09 |
| Configurer SPF/DKIM/DMARC sur chaque domaine | Score mail-tester.com > 8/10 | [07-GUIDES/02-bonnes-pratiques.md](./07-GUIDES/02-bonnes-pratiques.md) §Email |
| Lancer warm-up (Instantly.ai $37/mois ou MailReach) | Warm-up actif (30 jours min) | [03-FEATURES/05-agent-5-suiveur.md](./03-FEATURES/05-agent-5-suiveur.md) §Domaines |

**ATTENTION :** Le warm-up prend 30 jours. Le lancer en semaine 1 est CRITIQUE pour que Phase 2 ne soit pas retardée.

**JAMAIS utiliser le domaine principal** (axiom-marketing.fr) pour le cold outreach. Voir [07-GUIDES/03-anti-patterns.md](./07-GUIDES/03-anti-patterns.md) AP-09.

---

### Semaines 2-4 — Test Manuel du Funnel

#### 0.3 Identification des Prospects Cibles
| Tâche | Volume | Méthode |
|-------|--------|---------|
| Sélectionner 50 entreprises cibles | 10 par segment × 5 segments | Recherche manuelle (LinkedIn, Google, BOAMP) |
| Segments : PME Métro, E-commerce Shopify, Collectivités, Startups, Agences Web | 10 chacun | [03-FEATURES/03-agent-3-scoreur.md](./03-FEATURES/03-agent-3-scoreur.md) §Segments |
| Créer un spreadsheet avec colonnes ICP | Fichier Excel/Sheets | Modèle 4 axes du scoring |

#### 0.4 Scoring Manuel
| Tâche | Livrable | Doc de référence |
|-------|----------|------------------|
| Appliquer le modèle 4 axes à la main | 50 scores calculés | [03-FEATURES/03-agent-3-scoreur.md](./03-FEATURES/03-agent-3-scoreur.md) §Modèle |
| Axe 1 ICP (35pts) + Axe 2 Signaux (30pts) + Axe 3 Tech (20pts) + Axe 4 Engagement (15pts) | Breakdown par prospect | Formules exactes dans la spec |
| Catégoriser : HOT / WARM / COLD / DISQUAL | Colonne catégorie | Seuils : HOT≥75, WARM 50-74, COLD 25-49 |

#### 0.5 Rédaction et Envoi d'Emails
| Tâche | Volume | Tracking |
|-------|--------|----------|
| Rédiger 10 emails personnalisés par jour | ~200 emails sur 30 jours | Sujet, corps, CTA, segment |
| Envoyer via Gmail personnel (PAS le domaine cold) | 200 envois | Google Sheets tracking |
| Tracker : ouvertures (Mailtrack), réponses, RDV | Métriques quotidiennes | Open rate, reply rate, meeting rate |

#### 0.6 Go/No-Go (Fin Semaine 4)

| Métrique | 🟢 GO | 🟡 PIVOT | 🔴 STOP |
|----------|-------|---------|---------|
| Taux d'ouverture | > 20% | 10-20% | < 10% |
| Taux de réponse | > 3% | 1-3% | < 1% |
| Rendez-vous obtenus | >= 2 | 1 | 0 |

**Si PIVOT :** Revoir le ciblage (mauvais segment ?) ou le message (pas assez personnalisé ?). Retester 2 semaines.
**Si STOP :** Le cold email n'est peut-être pas le bon canal. Explorer : réseau, inbound, partenariats.

---

### Semaines 1-4 (en parallèle) — Setup Infrastructure

#### 0.7 Provisioning VPS

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Commander VPS Hetzner CAX21 | 4 ARM, 8GB RAM, ~15 EUR/mois | [02-STACK-TECHNIQUE/01-infrastructure.md](./02-STACK-TECHNIQUE/01-infrastructure.md) §Hosting |
| Installer Ubuntu 24.04 LTS | OS de base | — |
| Hardening SSH | Clé SSH only, port custom, root disabled | [06-OPERATIONS/01-deploiement.md](./06-OPERATIONS/01-deploiement.md) §VPS |
| Firewall UFW | Deny all, allow 22/80/443 | [04-SECURITE/02-hardening-guide.md](./04-SECURITE/02-hardening-guide.md) §Infra |
| fail2ban | Protection brute-force SSH | [06-OPERATIONS/01-deploiement.md](./06-OPERATIONS/01-deploiement.md) |
| unattended-upgrades | Mises à jour sécurité auto | — |

#### 0.8 Docker & Services

| Tâche | Commande / Détail | Doc de référence |
|-------|-------------------|------------------|
| Installer Docker + Compose | `curl -fsSL https://get.docker.com | sh` | [06-OPERATIONS/01-deploiement.md](./06-OPERATIONS/01-deploiement.md) |
| Déployer PostgreSQL 16 | Docker Compose, extensions pgcrypto + uuid-ossp + pg_trgm | [02-STACK-TECHNIQUE/02-base-de-donnees.md](./02-STACK-TECHNIQUE/02-base-de-donnees.md) |
| Déployer Redis 7.4 | Docker Compose, `maxmemory-policy noeviction` | [02-STACK-TECHNIQUE/02-base-de-donnees.md](./02-STACK-TECHNIQUE/02-base-de-donnees.md) §Redis |
| Déployer n8n | Docker Compose + HTTPS via Caddy | [02-STACK-TECHNIQUE/04-outils-externes.md](./02-STACK-TECHNIQUE/04-outils-externes.md) §n8n |
| Déployer Langfuse | Docker Compose (observabilité LLM) | [05-OBSERVABILITE/04-langfuse-integration.md](./05-OBSERVABILITE/04-langfuse-integration.md) |
| Déployer Caddy | Reverse proxy, auto-TLS, headers sécurité | [04-SECURITE/02-hardening-guide.md](./04-SECURITE/02-hardening-guide.md) §Caddy |
| Déployer Metabase | Docker Compose, connecter à PostgreSQL | [02-STACK-TECHNIQUE/04-outils-externes.md](./02-STACK-TECHNIQUE/04-outils-externes.md) §Metabase |
| Vérifier versions sécurité | Toutes les CVEs respectées | [04-SECURITE/01-registre-cve.md](./04-SECURITE/01-registre-cve.md) |

#### 0.9 Projet NestJS Initial

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Initialiser le projet NestJS 11 | `nest new axiom-agents` | [02-STACK-TECHNIQUE/01-infrastructure.md](./02-STACK-TECHNIQUE/01-infrastructure.md) |
| Structure hexagonale (core/common/shared/modules) | Créer les dossiers selon la convention | [02-STACK-TECHNIQUE/05-architecture-nestjs.md](./02-STACK-TECHNIQUE/05-architecture-nestjs.md) §10 |
| Configurer Prisma 7.4 | `prisma init`, schéma initial | [02-STACK-TECHNIQUE/02-base-de-donnees.md](./02-STACK-TECHNIQUE/02-base-de-donnees.md) §Prisma |
| Configurer BullMQ 5.71 | Connexion Redis, queues de base | [01-ARCHITECTURE/03-flux-donnees.md](./01-ARCHITECTURE/03-flux-donnees.md) |
| Configurer Pino 10.3 | Logging structuré + redaction PII | [05-OBSERVABILITE/02-journalisation.md](./05-OBSERVABILITE/02-journalisation.md) |
| Guards de sécurité | JwtAuthGuard, ApiKeyGuard, RolesGuard | [02-STACK-TECHNIQUE/05-architecture-nestjs.md](./02-STACK-TECHNIQUE/05-architecture-nestjs.md) §5 |
| Exception Filters | DomainExceptionFilter + GlobalExceptionFilter | [02-STACK-TECHNIQUE/05-architecture-nestjs.md](./02-STACK-TECHNIQUE/05-architecture-nestjs.md) §4 |
| Middleware sécurité | Helmet, CORS, rate limiting, body parser | [02-STACK-TECHNIQUE/05-architecture-nestjs.md](./02-STACK-TECHNIQUE/05-architecture-nestjs.md) §8 |
| Interceptors | LoggingInterceptor, TransformInterceptor, TimeoutInterceptor | [02-STACK-TECHNIQUE/05-architecture-nestjs.md](./02-STACK-TECHNIQUE/05-architecture-nestjs.md) §6 |
| ZodValidationPipe | Validation globale des inputs | [02-STACK-TECHNIQUE/05-architecture-nestjs.md](./02-STACK-TECHNIQUE/05-architecture-nestjs.md) §7 |
| Adapter contracts | ILlmAdapter, IEmailAdapter, IMarketDataAdapter | [02-STACK-TECHNIQUE/05-architecture-nestjs.md](./02-STACK-TECHNIQUE/05-architecture-nestjs.md) §2 |
| Health check endpoint | `/health` retourne status de tous les services | [06-OPERATIONS/01-deploiement.md](./06-OPERATIONS/01-deploiement.md) |
| CI/CD GitHub Actions | Lint, test, npm audit, trivy, SBOM | [06-OPERATIONS/02-ci-cd.md](./06-OPERATIONS/02-ci-cd.md) |

#### 0.10 Schéma Base de Données Initial

| Tâche | Tables | Doc de référence |
|-------|--------|------------------|
| Créer les tables core | prospects, raw_leads, prospect_scores, scoring_coefficients | [02-STACK-TECHNIQUE/02-base-de-donnees.md](./02-STACK-TECHNIQUE/02-base-de-donnees.md) §DDL |
| Créer les tables messages | message_templates, generated_messages, email_sends | [02-STACK-TECHNIQUE/02-base-de-donnees.md](./02-STACK-TECHNIQUE/02-base-de-donnees.md) |
| Créer les tables agent events | agent_events, agent_heartbeats, agent_messages | [08-DASHBOARD/11-base-de-donnees.md](./08-DASHBOARD/11-base-de-donnees.md) |
| Créer les tables RGPD | rgpd_blacklist, rgpd_deletion_queue | [04-SECURITE/03-rgpd-conformite.md](./04-SECURITE/03-rgpd-conformite.md) §Effacement |
| Prisma migrate | Première migration | [02-STACK-TECHNIQUE/02-base-de-donnees.md](./02-STACK-TECHNIQUE/02-base-de-donnees.md) §Migration |
| Row Level Security | Activer RLS sur tables sensibles | [04-SECURITE/02-hardening-guide.md](./04-SECURITE/02-hardening-guide.md) §A01 |
| Rôles PostgreSQL par agent | Un rôle par agent avec GRANT ciblé | [04-SECURITE/02-hardening-guide.md](./04-SECURITE/02-hardening-guide.md) §PostgreSQL |

---

### Checklist Phase 0 Complète

> **Mise à jour : 23 mars 2026** — Phases 0.8-0.10 (code & config) réalisées via APEX.
> Voir `.claude/output/apex/02-nestjs-hexagonal-project-setup/` pour les logs complets.

```
JURIDIQUE
 [ ] Avocat RGPD consulté
 [ ] Avis juridique écrit reçu
 [ ] Base légale documentée (intérêt légitime B2B)

EMAIL
 [ ] 3 domaines achetés
 [ ] SPF/DKIM/DMARC configurés (mail-tester > 8/10)
 [ ] Warm-up lancé (Instantly.ai ou MailReach)

TEST MANUEL
 [ ] 50 prospects identifiés (10/segment)
 [ ] 50 scores calculés manuellement
 [ ] 200 emails personnalisés envoyés
 [ ] Métriques trackées (open/reply/meeting)
 [ ] Décision Go/No-Go documentée

INFRASTRUCTURE (0.7 — provisioning VPS non réalisé, à faire manuellement)
 [ ] VPS Hetzner CAX21 provisionné
 [ ] Ubuntu 24.04 + Docker installés
 [ ] SSH hardened (clé only, port custom, root disabled)
 [ ] UFW + fail2ban actifs
 [ ] PostgreSQL 16.13+ running
 [ ] Redis 7.4.3+ running (noeviction)
 [ ] n8n accessible via HTTPS
 [ ] Langfuse running
 [ ] Caddy reverse proxy + TLS
 [ ] Metabase connecté à PostgreSQL

DOCKER & SERVICES (0.8 — fichiers de configuration créés ✅)
 [x] docker-compose.yml — 8 services (app, postgres, redis, n8n, langfuse, metabase, caddy)
 [x] Dockerfile — multi-stage (builder + production), non-root user, healthcheck
 [x] Caddyfile — reverse proxy, auto-TLS, headers sécurité, IP allowlists admin
 [x] PostgreSQL init.sql — création DBs (n8n, langfuse, metabase) + extensions + rôles
 [x] postgresql.conf — tuning 8GB RAM, logging, autovacuum

PROJET NESTJS (0.9 — ✅ réalisé le 23/03/2026, 159 fichiers TypeScript, 0 erreurs tsc)
 [x] Projet initialisé (NestJS 11 + TypeScript 5.7 strict)
 [x] Structure hexagonale en place (core/common/shared/modules)
 [x] Prisma 6.19 configuré (schéma 23 modèles, prisma generate OK)
 [x] BullMQ configuré (9 queues dans les modules agents via forRootAsync)
 [x] Pino logging avec redaction PII (12 paths sensibles)
 [x] Guards (JWT, ApiKey timing-safe, Roles) implémentés + APP_GUARD global
 [x] Exception Filters (DomainExceptionFilter + GlobalExceptionFilter) implémentés
 [x] Middleware sécurité (Helmet, CORS, rate limit ThrottlerModule 3 tiers)
 [x] Interceptors (Logging, Transform, Timeout, Cache, Langfuse)
 [x] ZodValidationPipe global
 [x] Adapter contracts définis (ILlmAdapter, IEmailAdapter, IMarketDataAdapter) + stubs
 [x] Health check /api/health endpoint (@Public)
 [x] 10 modules agents hexagonaux (CQRS agents 7 & 9)
 [x] Modules support : Auth (JWT/Passport), Prospects (CRM), Dashboard (SSE)
 [x] Config Zod-validée (app, database, redis, llm, jwt)
 [ ] CI/CD GitHub Actions (lint, test, audit, trivy)

SCHÉMA BASE DE DONNÉES (0.10 — schéma créé ✅, migration à exécuter)
 [x] Prisma schema — 23 modèles + 8 enums + relations + indexes + @@map
 [x] Seed — ScoringCoefficient defaults
 [ ] Prisma migrate (nécessite PostgreSQL running)
 [ ] Row Level Security activé sur tables PII
 [ ] Rôles PostgreSQL par agent avec GRANT ciblé
```

---

## PHASE 1 — PIPELINE DE DONNÉES (Semaines 5-10)

**Objectif :** Automatiser la collecte, l'enrichissement et le scoring des leads.
**Prérequis :** Phase 0 GO validé + infrastructure live.
**Coût :** ~50 EUR/mois (infra only — données gratuites)

> **Note (23/03/2026) :** Les squelettes hexagonaux des 10 modules agents ont été créés en Phase 0.9
> (entities, repositories ports, services, controllers, modules, DTOs Zod).
> La Phase 1 consiste à implémenter la **logique métier réelle** dans ces squelettes
> et les **adapters concrets** (BOAMP, INSEE, Gmail, Claude API).

### Semaines 5-6 — Agent 1 : Veilleur

#### 1.1 Module agent-veilleur (structure)

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Créer le module `modules/agent-veilleur/` | domain + application + infrastructure + presentation | [02-STACK-TECHNIQUE/05-architecture-nestjs.md](./02-STACK-TECHNIQUE/05-architecture-nestjs.md) §1 |
| Entité `RawLead` | Champs : entreprise, siret, site_web, localisation, signaux, segment, pre_score | [03-FEATURES/01-agent-1-veilleur.md](./03-FEATURES/01-agent-1-veilleur.md) §Output |
| Repository `IRawLeadRepository` | Abstract class + PrismaRawLeadRepository | [02-STACK-TECHNIQUE/05-architecture-nestjs.md](./02-STACK-TECHNIQUE/05-architecture-nestjs.md) §3 |
| Queue BullMQ `enrichisseur-pipeline` | Producer dans le veilleur | [01-ARCHITECTURE/03-flux-donnees.md](./01-ARCHITECTURE/03-flux-donnees.md) |

#### 1.2 Sous-agent 1b — Marchés Publics (BOAMP)

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Adapter `IMarketDataAdapter` → `BoampAdapter` | Appel API BOAMP, parse JSON | [02-STACK-TECHNIQUE/05-architecture-nestjs.md](./02-STACK-TECHNIQUE/05-architecture-nestjs.md) §2 |
| Cron n8n : 2x/jour (06h, 14h) | Workflow n8n → API NestJS | [03-FEATURES/01-agent-1-veilleur.md](./03-FEATURES/01-agent-1-veilleur.md) §Scheduling |
| Filtrage par mots-clés (refonte web, SI, accessibilité, RGAA) | Scoring de pertinence | [03-FEATURES/01-agent-1-veilleur.md](./03-FEATURES/01-agent-1-veilleur.md) §1b |
| Tests unitaires du parser BOAMP | Jest, mock des réponses API | [06-OPERATIONS/04-tests.md](./06-OPERATIONS/04-tests.md) |

#### 1.3 Sous-agent 1c — Veille Web

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Worker TypeScript : Lighthouse CLI + Wappalyzer npm + axe-core | Scan nocturne 02h UTC | [03-FEATURES/01-agent-1-veilleur.md](./03-FEATURES/01-agent-1-veilleur.md) §1c |
| Batch scan 100-500 sites | 5 workers parallèles, timeout 60s/site | [03-FEATURES/01-agent-1-veilleur.md](./03-FEATURES/01-agent-1-veilleur.md) §Edge Cases |
| Stocker résultats dans `raw_leads` | Performance, stack, accessibilité | [02-STACK-TECHNIQUE/02-base-de-donnees.md](./02-STACK-TECHNIQUE/02-base-de-donnees.md) |

#### 1.4 Sous-agent 1d — Job Boards

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Worker TypeScript : Crawlee → WTTJ, Indeed | Scraping structuré | [03-FEATURES/01-agent-1-veilleur.md](./03-FEATURES/01-agent-1-veilleur.md) §1d |
| Détection signaux recrutement dev web | Parsing titres de postes | — |
| Cron quotidien 06h UTC | Parallèle avec 1b | [03-FEATURES/01-agent-1-veilleur.md](./03-FEATURES/01-agent-1-veilleur.md) §Scheduling |

#### 1.5 Agent 1 MASTER — Déduplication & Normalisation

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Déduplication par SIRET + nom_entreprise + site_web | `SELECT FOR UPDATE` + merge des signaux | [01-ARCHITECTURE/03-flux-donnees.md](./01-ARCHITECTURE/03-flux-donnees.md) §Idempotency |
| Normalisation des données | Format JSON NormalizedLead | [03-FEATURES/01-agent-1-veilleur.md](./03-FEATURES/01-agent-1-veilleur.md) §Output |
| Pré-scoring (score rapide 0-100) | Formule simplifiée | — |
| Dispatch vers queue `enrichisseur-pipeline` | BullMQ producer | [01-ARCHITECTURE/03-flux-donnees.md](./01-ARCHITECTURE/03-flux-donnees.md) |
| Event sourcing : `LEAD_DETECTED` | Logger dans `agent_events` | [05-OBSERVABILITE/02-journalisation.md](./05-OBSERVABILITE/02-journalisation.md) §Events |
| Dashboard Metabase : leads/jour | SQL query + visualisation | [08-DASHBOARD/03-feature-v1-centre-controle.md](./08-DASHBOARD/03-feature-v1-centre-controle.md) |

**Note :** Agent 1a (LinkedIn) est **REPORTÉ** — en attente de l'avis juridique RGPD.

---

### Semaines 7-8 — Agent 2 : Enrichisseur

#### 1.6 Module agent-enrichisseur

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Créer le module `modules/agent-enrichisseur/` | Structure hexagonale complète | [02-STACK-TECHNIQUE/05-architecture-nestjs.md](./02-STACK-TECHNIQUE/05-architecture-nestjs.md) §1 |
| Consumer BullMQ `enrichisseur-pipeline` | Worker qui traite les leads | [01-ARCHITECTURE/03-flux-donnees.md](./01-ARCHITECTURE/03-flux-donnees.md) |
| Producer BullMQ `scoreur-pipeline` | Envoie les prospects enrichis | — |

#### 1.7 Sous-agent 2b — Enrichissement Entreprise

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Adapter `ICompanyDataAdapter` → `InseeAdapter` | API INSEE Sirene (gratuit) | [03-FEATURES/02-agent-2-enrichisseur.md](./03-FEATURES/02-agent-2-enrichisseur.md) §2b |
| Intégration annuaire-entreprises.data.gouv.fr | Données légales complémentaires | — |
| Intégration BODACC | Procédures collectives, cessions | — |
| Cache Redis 30 jours | Éviter les appels redondants | — |

#### 1.8 Sous-agent 2a — Enrichissement Contact (simplifié Phase 1)

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Pattern matching email (10 patterns France) | prenom.nom (48%), prenom (35%), etc. | [03-FEATURES/02-agent-2-enrichisseur.md](./03-FEATURES/02-agent-2-enrichisseur.md) §Waterfall |
| Vérification SMTP gratuite (RCPT TO) | Validation sans API payante | — |
| Mapping décideur par segment | CMO pour PME, Founder pour Startups, etc. | [03-FEATURES/02-agent-2-enrichisseur.md](./03-FEATURES/02-agent-2-enrichisseur.md) §Mapping |
| Score de qualité contact | high/medium/low basé sur la confiance | — |

**Note Phase 1 :** APIs payantes (Dropcontact 39€, Hunter 49$) ajoutées en Phase 2 si volume justifie.

#### 1.9 Sous-agent 2c — Enrichissement Technique

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Coordination avec Agent 1c | Skip si source=veille_web OU scan <30 jours | [03-FEATURES/02-agent-2-enrichisseur.md](./03-FEATURES/02-agent-2-enrichisseur.md) §Non-redondance |
| Wappalyzer npm (stack technique) | Gratuit, même moteur que l'API payante | — |
| Score de complétude | % de champs remplis par prospect | — |

---

### Semaines 9-10 — Agent 3 : Scoreur

#### 1.10 Module agent-scoreur

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Moteur de scoring TypeScript pur | Modèle 4 axes déterministe | [03-FEATURES/03-agent-3-scoreur.md](./03-FEATURES/03-agent-3-scoreur.md) |
| Axe 1 — ICP Fit (35pts) | Taille, secteur, localisation, profil décideur | [03-FEATURES/03-agent-3-scoreur.md](./03-FEATURES/03-agent-3-scoreur.md) §Axe1 |
| Axe 2 — Signaux (30pts) | 14 types de signaux + formule decay half-life | [03-FEATURES/03-agent-3-scoreur.md](./03-FEATURES/03-agent-3-scoreur.md) §Axe2 |
| Axe 3 — Technique (20pts) | Lighthouse, stack obsolète, RGAA | [03-FEATURES/03-agent-3-scoreur.md](./03-FEATURES/03-agent-3-scoreur.md) §Axe3 |
| Axe 4 — Engagement (15pts) | Email vérifié, téléphone, multi-source | [03-FEATURES/03-agent-3-scoreur.md](./03-FEATURES/03-agent-3-scoreur.md) §Axe4 |
| Scoring négatif | Hard disq (-100) + soft malus | [03-FEATURES/03-agent-3-scoreur.md](./03-FEATURES/03-agent-3-scoreur.md) §Négatif |
| Coefficients par segment | Multiplicateurs PME/E-com/Collectivité/Startup/Agence | [03-FEATURES/03-agent-3-scoreur.md](./03-FEATURES/03-agent-3-scoreur.md) §Coefficients |
| Catégorisation | HOT-A/B/C, WARM, COLD, DISQUALIFIÉ | [03-FEATURES/03-agent-3-scoreur.md](./03-FEATURES/03-agent-3-scoreur.md) §Catégorisation |
| Cron recalcul quotidien 04:00 UTC | La décroissance change les scores chaque jour | — |
| **Tests unitaires : 100% coverage** | Tous les edge cases du scoring | [06-OPERATIONS/04-tests.md](./06-OPERATIONS/04-tests.md) §Scoring |
| Dashboard Metabase : distribution scores | Visualisation HOT/WARM/COLD/DISQ | [08-DASHBOARD/03-feature-v1-centre-controle.md](./08-DASHBOARD/03-feature-v1-centre-controle.md) |

### Checklist Phase 1

```
AGENT 1 — VEILLEUR
 [ ] Module NestJS créé (structure hexagonale)
 [ ] 1b BOAMP : cron actif, leads détectés quotidiennement
 [ ] 1c Web : scan nocturne fonctionnel (100+ sites)
 [ ] 1d Jobs : scraping WTTJ/Indeed fonctionnel
 [ ] Déduplication SIRET+nom fonctionnelle
 [ ] Queue enrichisseur-pipeline : leads envoyés
 [ ] Dashboard Metabase : volume leads/jour visible
 [ ] Event sourcing : LEAD_DETECTED loggé dans agent_events

AGENT 2 — ENRICHISSEUR
 [ ] Module NestJS créé
 [ ] 2b : INSEE Sirene + data.gouv + BODACC intégrés
 [ ] 2a : Pattern matching email + SMTP vérification
 [ ] 2c : Coordination avec 1c (skip si <30j)
 [ ] Table prospects enrichie quotidiennement
 [ ] Score de complétude calculé
 [ ] Event sourcing : LEAD_ENRICHED loggé

AGENT 3 — SCOREUR
 [ ] Modèle 4 axes implémenté (ICP + Signaux + Tech + Engagement)
 [ ] Decay formula fonctionnelle (half-life)
 [ ] Scoring négatif (hard disq + soft malus)
 [ ] Coefficients par segment appliqués
 [ ] Catégorisation HOT/WARM/COLD/DISQUAL
 [ ] Cron recalcul 04:00 UTC
 [ ] Tests unitaires : 100% coverage scoring
 [ ] Table prospect_scores avec historique
 [ ] Event sourcing : LEAD_SCORED loggé
 [ ] Dashboard : distribution par catégorie

INFRASTRUCTURE
 [ ] Pipeline complet Agent 1 → 2 → 3 fonctionnel (bout en bout)
 [ ] Langfuse : traces des opérations visibles
 [ ] Backup PostgreSQL quotidien configuré
 [ ] Monitoring : Slack alertes si < 10 leads/jour
```

**Gate Phase 1 → Phase 2 :**
- Leads/jour >= 10
- Taux d'enrichissement >= 60%
- Scoring 100% coverage tests

---

## PHASE 2 — OUTREACH EMAIL (Semaines 11-16)

**Objectif :** Automatiser la génération et l'envoi d'emails personnalisés.
**Prérequis :** Phase 1 complète + warm-up email terminé (30 jours).
**Coût :** ~150-200 EUR/mois

### Semaines 11-12 — Agent 4 : Rédacteur

#### 2.1 Intégration Claude API

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Implémenter `ClaudeAdapter implements ILlmAdapter` | Claude Sonnet 4.6 pour génération | [02-STACK-TECHNIQUE/05-architecture-nestjs.md](./02-STACK-TECHNIQUE/05-architecture-nestjs.md) §2 |
| Model routing | Haiku pour classification, Sonnet pour rédaction | [02-STACK-TECHNIQUE/03-llm-integration.md](./02-STACK-TECHNIQUE/03-llm-integration.md) §Routing |
| Prompt caching | System prompts cachés (-90% coût) | [02-STACK-TECHNIQUE/03-llm-integration.md](./02-STACK-TECHNIQUE/03-llm-integration.md) §Caching |
| Sanitization PII | Emails/phones/SIRET masqués avant envoi | [02-STACK-TECHNIQUE/03-llm-integration.md](./02-STACK-TECHNIQUE/03-llm-integration.md) §PII |
| Fallback templates | 5 templates statiques par segment | [03-FEATURES/04-agent-4-redacteur.md](./03-FEATURES/04-agent-4-redacteur.md) §Fallback |
| Intégration Langfuse | Tracer chaque appel Claude | [05-OBSERVABILITE/04-langfuse-integration.md](./05-OBSERVABILITE/04-langfuse-integration.md) |
| Budget cap + alertes | Alerte Slack à 80% du budget mensuel | [02-STACK-TECHNIQUE/03-llm-integration.md](./02-STACK-TECHNIQUE/03-llm-integration.md) §Budget |

#### 2.2 Sous-agents 4a, 4c

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| 4a Email Writer | Génération sujet (36-50 chars) + corps (40-125 mots) | [03-FEATURES/04-agent-4-redacteur.md](./03-FEATURES/04-agent-4-redacteur.md) §4a |
| 4c Impact Calculator | Formules performance, RGAA, attribution, abandon panier | [03-FEATURES/04-agent-4-redacteur.md](./03-FEATURES/04-agent-4-redacteur.md) §4c |
| Validation qualité | Longueur sujet, mots spam, hallucination | [03-FEATURES/04-agent-4-redacteur.md](./03-FEATURES/04-agent-4-redacteur.md) §Validation |
| Retry temp descendante | 0.7 → 0.55 → 0.4, max 3 tentatives | — |
| A/B testing | 2 variantes par segment | — |

### Semaines 13-14 — Agent 5 : Suiveur

#### 2.3 Envoi Email

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Implémenter `GmailAdapter implements IEmailAdapter` | Gmail API OAuth | [02-STACK-TECHNIQUE/05-architecture-nestjs.md](./02-STACK-TECHNIQUE/05-architecture-nestjs.md) §2 |
| Mailgun fallback | Si Gmail échoue | [03-FEATURES/05-agent-5-suiveur.md](./03-FEATURES/05-agent-5-suiveur.md) §5a |
| Throttling par domaine | 50/jour, 10/heure, 6 min entre envois | [03-FEATURES/05-agent-5-suiveur.md](./03-FEATURES/05-agent-5-suiveur.md) §Domaines |
| Monitoring bounce/spam | < 3% bounce, < 0.3% spam | [07-GUIDES/02-bonnes-pratiques.md](./07-GUIDES/02-bonnes-pratiques.md) §Email |
| Idempotency keys | Pas de doublon sur retry | [01-ARCHITECTURE/03-flux-donnees.md](./01-ARCHITECTURE/03-flux-donnees.md) §Idempotency |

#### 2.4 Classification des Réponses

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Gmail Watch (Pub/Sub) | Détection réponses < 1s | [03-FEATURES/05-agent-5-suiveur.md](./03-FEATURES/05-agent-5-suiveur.md) §5c |
| Classification Claude Haiku | 8 catégories (INTERESSE → SPAM) | [03-FEATURES/05-agent-5-suiveur.md](./03-FEATURES/05-agent-5-suiveur.md) §Classification |
| Notification Slack HOT | < 5 min SLA pour INTERESSE | [05-OBSERVABILITE/03-alerting.md](./05-OBSERVABILITE/03-alerting.md) §Slack |
| Actions automatiques par catégorie | Stop/Pause/Resume séquence | [03-FEATURES/05-agent-5-suiveur.md](./03-FEATURES/05-agent-5-suiveur.md) §Actions |

#### 2.5 Séquences

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Séquences à gaps croissants | HOT [0,2,5,10], WARM [0,3,7,14,21], COLD [0,3,7,14,21,30,45] | [03-FEATURES/05-agent-5-suiveur.md](./03-FEATURES/05-agent-5-suiveur.md) §Séquences |
| Heures optimales | Mardi-Jeudi 8-10h, timezone prospect | — |
| Exclusion jours fériés | Liste complète + La Réunion | [03-FEATURES/05-agent-5-suiveur.md](./03-FEATURES/05-agent-5-suiveur.md) §Fériés |
| Périodes creuses -50% volume | 22/12-3/1, 15/7-31/8 | — |

### Semaines 15-16 — Intégration & Tuning

| Tâche | Détail | Doc de référence |
|-------|--------|------------------|
| Test end-to-end | Agent 1 → 2 → 3 → 4 → 5 complet | [06-OPERATIONS/04-tests.md](./06-OPERATIONS/04-tests.md) §E2E |
| Premier envoi réel | 10 emails/jour pendant 1 semaine | — |
| Monitoring délivrabilité | mail-tester.com, bounce rate, spam rate | [07-GUIDES/02-bonnes-pratiques.md](./07-GUIDES/02-bonnes-pratiques.md) §Email |
| Ajustement scoring | Comparer scores vs réponses réelles | — |
| Revue Langfuse | Vérifier qualité des générations Claude | [05-OBSERVABILITE/04-langfuse-integration.md](./05-OBSERVABILITE/04-langfuse-integration.md) |
| Backup vérifié | Test de restauration PostgreSQL | [06-OPERATIONS/03-backup-dr.md](./06-OPERATIONS/03-backup-dr.md) §Restore |

### Checklist Phase 2

```
AGENT 4 — RÉDACTEUR
 [ ] ClaudeAdapter implémenté (contrat ILlmAdapter)
 [ ] Model routing fonctionnel (Haiku/Sonnet)
 [ ] Prompt caching activé
 [ ] PII sanitization avant chaque appel
 [ ] 5 fallback templates par segment
 [ ] Langfuse tracing actif
 [ ] Budget cap + alerte Slack à 80%
 [ ] 4a Email Writer : génération OK (sujet + corps)
 [ ] 4c Impact Calculator : formules implémentées
 [ ] Validation qualité (longueur, spam, hallucination)
 [ ] A/B testing configuré (2 variantes/segment)

AGENT 5 — SUIVEUR
 [ ] GmailAdapter implémenté (contrat IEmailAdapter)
 [ ] Mailgun fallback configuré
 [ ] Throttling par domaine actif (50/j, 10/h)
 [ ] Monitoring bounce (<3%) et spam (<0.3%)
 [ ] Gmail Watch (Pub/Sub) détecte les réponses
 [ ] Classification Haiku : 8 catégories implémentées
 [ ] Notification Slack HOT : SLA <5 min
 [ ] Séquences à gaps croissants fonctionnelles
 [ ] Jours fériés exclus + périodes creuses
 [ ] Idempotency keys : pas de doublon

INTÉGRATION
 [ ] Pipeline Agent 1→2→3→4→5 bout en bout testé
 [ ] 10 emails/jour envoyés avec succès
 [ ] mail-tester.com > 8/10
 [ ] Bounce rate < 5%
 [ ] Langfuse : qualité des générations vérifiée
 [ ] Backup PostgreSQL testé (restauration OK)
```

**Gate Phase 2 → Phase 3 :**
- Taux d'ouverture >= 20%
- Taux de réponse >= 3%

---

## PHASE 3 — LINKEDIN + NURTURING (Semaines 17-24)

**Objectif :** Ajouter le canal LinkedIn et le nurturing long terme.
**Prérequis :** Phase 2 validée + avis juridique RGPD favorable pour LinkedIn.
**Coût :** ~300-400 EUR/mois

### Semaines 17-19 — Agent 1a LinkedIn (conditionnel)

**Décision RGPD :**
- ✅ **SI avis favorable** → implémenter LinkedIn via API conforme
- ❌ **SI avis défavorable** → LinkedIn reste MANUEL (Jonathan envoie, système prépare)

| Tâche (si GO LinkedIn) | Doc de référence |
|-------------------------|------------------|
| Agent 1a : veille signaux LinkedIn publics | [03-FEATURES/01-agent-1-veilleur.md](./03-FEATURES/01-agent-1-veilleur.md) §1a |
| Agent 4b : Claude génère les messages LinkedIn | [03-FEATURES/04-agent-4-redacteur.md](./03-FEATURES/04-agent-4-redacteur.md) §4b |
| Agent 5b : envoi via API conforme | [03-FEATURES/05-agent-5-suiveur.md](./03-FEATURES/05-agent-5-suiveur.md) §5b |

### Semaines 20-22 — Agent 6 : Nurtureur

| Tâche | Doc de référence |
|-------|------------------|
| 6a Email Nurture : séquences comportementales | [03-FEATURES/06-agent-6-nurtureur.md](./03-FEATURES/06-agent-6-nurtureur.md) §6a |
| 6c Re-Scoreur : scan mensuel + triggers immédiats | [03-FEATURES/06-agent-6-nurtureur.md](./03-FEATURES/06-agent-6-nurtureur.md) §6c |
| Handoff Agent 5 → Agent 6 via `nurturer-pipeline` | [01-ARCHITECTURE/03-flux-donnees.md](./01-ARCHITECTURE/03-flux-donnees.md) |
| Reclassification → Agent 3 via `scoreur-pipeline` | [01-ARCHITECTURE/03-flux-donnees.md](./01-ARCHITECTURE/03-flux-donnees.md) §Feedback |
| Politique de sunset (max 12 mois nurturing) | [03-FEATURES/06-agent-6-nurtureur.md](./03-FEATURES/06-agent-6-nurtureur.md) §Sunset |

### Semaines 23-24 — Agent 7 : Analyste (simplifié)

| Tâche | Doc de référence |
|-------|------------------|
| 7a Collecteur : cron SQL quotidien → `metriques_daily` | [03-FEATURES/07-agent-7-analyste.md](./03-FEATURES/07-agent-7-analyste.md) §7a |
| 7b Rapports : digest Slack quotidien 22h | [03-FEATURES/07-agent-7-analyste.md](./03-FEATURES/07-agent-7-analyste.md) §7b |
| 7c Anomalies : Z-score sur 5 métriques clés | [03-FEATURES/07-agent-7-analyste.md](./03-FEATURES/07-agent-7-analyste.md) §7c |
| Dashboards Metabase : funnel, performance, coûts | [08-DASHBOARD/03-feature-v1-centre-controle.md](./08-DASHBOARD/03-feature-v1-centre-controle.md) |

### Semaines 23-24 (en parallèle) — Dashboard V1

| Tâche | Doc de référence |
|-------|------------------|
| Projet React (Vite + Tailwind + shadcn/ui) | [08-DASHBOARD/02-stack-technique.md](./08-DASHBOARD/02-stack-technique.md) |
| V7 Actions Rapides (le plus utile) | [08-DASHBOARD/09-feature-v7-actions-rapides.md](./08-DASHBOARD/09-feature-v7-actions-rapides.md) |
| V2 Timeline Agents | [08-DASHBOARD/04-feature-v2-timeline.md](./08-DASHBOARD/04-feature-v2-timeline.md) |
| V3 Prospects (CRM basique) | [08-DASHBOARD/05-feature-v3-prospects.md](./08-DASHBOARD/05-feature-v3-prospects.md) |
| V1 Centre de Contrôle | [08-DASHBOARD/03-feature-v1-centre-controle.md](./08-DASHBOARD/03-feature-v1-centre-controle.md) |
| SSE temps réel | [08-DASHBOARD/12-temps-reel.md](./08-DASHBOARD/12-temps-reel.md) |
| API backend (17 endpoints) | [08-DASHBOARD/10-api-backend.md](./08-DASHBOARD/10-api-backend.md) |

**Gate Phase 3 → Phase 4 :**
- Reclassification COLD → HOT >= 5%/mois
- Dashboard V1 opérationnel

---

## PHASE 4 — CLOSING + MARCHÉS PUBLICS (Mois 6-9)

**Objectif :** Automatiser le closing des deals et la réponse aux appels d'offres.
**Prérequis :** Phase 3 complète + au moins 5 deals en cours.
**Coût :** ~600-900 EUR/mois

### Mois 6-7 — Agent 8 : Dealmaker

| Tâche | Doc de référence |
|-------|------------------|
| 8a Devis : Puppeteer PDF + Claude scope | [03-FEATURES/08-agent-8-dealmaker.md](./03-FEATURES/08-agent-8-dealmaker.md) §8a |
| 8b Relances : séquences J3/J7/J14 | [03-FEATURES/08-agent-8-dealmaker.md](./03-FEATURES/08-agent-8-dealmaker.md) §8b |
| 8c Signature : Yousign API V3 | [03-FEATURES/08-agent-8-dealmaker.md](./03-FEATURES/08-agent-8-dealmaker.md) §8c |
| Pipeline CRM 7 étapes (PostgreSQL) | [03-FEATURES/08-agent-8-dealmaker.md](./03-FEATURES/08-agent-8-dealmaker.md) §Pipeline |
| Dashboard V5 Pipeline Kanban | [08-DASHBOARD/07-feature-v5-pipeline-deals.md](./08-DASHBOARD/07-feature-v5-pipeline-deals.md) |

**ATTENTION PyMuPDF :** CVE-2026-0006 (CVSS 9.8) sans patch. Parsing PDF en container isolé obligatoire. Voir [04-SECURITE/01-registre-cve.md](./04-SECURITE/01-registre-cve.md) §PyMuPDF.

### Mois 7-9 — Agent 9 : Appels d'Offres

| Tâche | Doc de référence |
|-------|------------------|
| 9a Analyseur DCE : PyMuPDF (sandbox) + Claude Vision | [03-FEATURES/09-agent-9-appels-offres.md](./03-FEATURES/09-agent-9-appels-offres.md) §9a |
| 9b Qualificateur : scoring GO/NO-GO 7 critères | [03-FEATURES/09-agent-9-appels-offres.md](./03-FEATURES/09-agent-9-appels-offres.md) §9b |
| 9c-9e Parallèle : Juriste + Chiffreur + Rédacteur | [03-FEATURES/09-agent-9-appels-offres.md](./03-FEATURES/09-agent-9-appels-offres.md) §Workflow |
| 9f QA + 9g Moniteur | [03-FEATURES/09-agent-9-appels-offres.md](./03-FEATURES/09-agent-9-appels-offres.md) §9f-9g |
| Dashboard V4 Marchés Publics | [08-DASHBOARD/06-feature-v4-marches-publics.md](./08-DASHBOARD/06-feature-v4-marches-publics.md) |

### Mois 8-9 — Agent 10 : CSM (minimal)

| Tâche | Doc de référence |
|-------|------------------|
| 10a Onboarding : séquence welcome J1-J30 | [03-FEATURES/10-agent-10-csm.md](./03-FEATURES/10-agent-10-csm.md) §10a |
| 10c Satisfaction : Health Score basique | [03-FEATURES/10-agent-10-csm.md](./03-FEATURES/10-agent-10-csm.md) §10c |
| 10b, 10d, 10e : REPORTÉS (spreadsheet suffit) | — |

### Mois 8-9 (en parallèle) — Dashboard V2

| Tâche | Doc de référence |
|-------|------------------|
| V4 Marchés Publics | [08-DASHBOARD/06-feature-v4-marches-publics.md](./08-DASHBOARD/06-feature-v4-marches-publics.md) |
| V5 Pipeline Deals Kanban | [08-DASHBOARD/07-feature-v5-pipeline-deals.md](./08-DASHBOARD/07-feature-v5-pipeline-deals.md) |
| V6 Graph Agents (React Flow) | [08-DASHBOARD/08-feature-v6-graph-agents.md](./08-DASHBOARD/08-feature-v6-graph-agents.md) |

**Gate Phase 4 (fin du projet) :**
- Win rate >= 25%
- Cycle time deals <= 45 jours
- Dashboard complet avec 7 vues opérationnelles

---

## SÉCURITÉ — Checklist Transversale (Toutes Phases)

Cette checklist doit être vérifiée AVANT chaque mise en production.

```
INFRASTRUCTURE
 [ ] Toutes les versions à jour (voir 00-INDEX.md §Versions)
 [ ] Docker runc >= 1.2.8 (CVE-2025-31133)
 [ ] Caddy 2.11.2+ (CVE-2026-27586)
 [ ] n8n >= 1.123.17 (CVE-2026-21858)
 [ ] Disk encryption activé
 → Doc : 04-SECURITE/01-registre-cve.md

DONNÉES
 [ ] pgcrypto pour colonnes PII (emails, téléphones)
 [ ] TLS 1.3 partout (PostgreSQL, Redis, APIs)
 [ ] RLS activé et FORCE sur tables partagées
 [ ] Procédure rgpd_delete_prospect() testée
 [ ] Blacklist anti-recontact vérifié avant chaque envoi
 [ ] Durées de conservation configurées (cron purge)
 → Doc : 04-SECURITE/03-rgpd-conformite.md

SECRETS
 [ ] Aucun secret dans le code source (Gitleaks en CI)
 [ ] Rotation planifiée (API keys 90j, JWT 180j, DB 90j)
 [ ] .env.example à jour
 [ ] Docker secrets pour production
 → Doc : 04-SECURITE/04-gestion-secrets.md

LLM
 [ ] PII sanitization avant Claude
 [ ] Prompt injection screening (Haiku pré-filtre)
 [ ] Fallback templates si Claude down
 [ ] Budget cap avec alerte à 80%
 [ ] Model routing actif (Haiku/Sonnet/Opus)
 → Doc : 02-STACK-TECHNIQUE/03-llm-integration.md

SUPPLY CHAIN
 [ ] npm audit à chaque PR (moderate+ = fail)
 [ ] npm ci --frozen-lockfile en CI
 [ ] SBOM généré à chaque build
 [ ] Images Docker scannées (trivy)
 [ ] Pas de tag :latest en production
 → Doc : 06-OPERATIONS/02-ci-cd.md
```

→ Checklist complète (54 items) : [04-SECURITE/02-hardening-guide.md](./04-SECURITE/02-hardening-guide.md) §Checklist

---

## Résumé des Coûts par Phase

| Phase | Durée | Infra/mois | APIs/mois | Juridique | Total estimé |
|-------|-------|-----------|-----------|-----------|-------------|
| 0 | 4 sem | 100€ | 0€ | 2-3K€ | **2.1-3.1K€** |
| 1 | 6 sem | 50€ | 0€ | — | **300€** |
| 2 | 6 sem | 50€ | 100-150€ | — | **900-1.2K€** |
| 3 | 8 sem | 50€ | 250-350€ | — | **2.4-3.2K€** |
| 4 | 12 sem | 100€ | 500-800€ | — | **7.2-10.8K€** |
| **TOTAL** | **6-9 mois** | | | | **~13-18K€** |

(Hors salaires/freelance. Ajouter 15-40K€/an si développeur dédié.)

---

## Index des Références Documentaires

Chaque tâche de cette roadmap pointe vers la documentation détaillée :

| Catégorie | Fichiers | Quand consulter |
|-----------|---------|-----------------|
| Architecture système | [01-ARCHITECTURE/*](./01-ARCHITECTURE/) (3 fichiers) | Avant chaque nouveau module |
| Stack & patterns NestJS | [02-STACK-TECHNIQUE/*](./02-STACK-TECHNIQUE/) (5 fichiers) | Setup initial + chaque agent |
| Specs par agent | [03-FEATURES/*](./03-FEATURES/) (10 fichiers) | Développement de chaque agent |
| Sécurité & RGPD | [04-SECURITE/*](./04-SECURITE/) (4 fichiers) | Avant chaque mise en prod |
| Observabilité | [05-OBSERVABILITE/*](./05-OBSERVABILITE/) (4 fichiers) | Phase 1+ |
| Opérations | [06-OPERATIONS/*](./06-OPERATIONS/) (4 fichiers) | Déploiement + CI/CD |
| Guides dev | [07-GUIDES/*](./07-GUIDES/) (3 fichiers) | Onboarding + quotidien |
| Dashboard | [08-DASHBOARD/*](./08-DASHBOARD/) (14 fichiers) | Phase 3+ |
| Brainstorming | [../brainstorming/*](../brainstorming/) (13 fichiers) | Décisions stratégiques |
| Specs originales | [../source-ia/agent/*](../source-ia/agent/) (40+ fichiers) | Source de vérité détaillée |
