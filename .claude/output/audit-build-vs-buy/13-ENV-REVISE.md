# 13 — .env Révisé — Variables d'Environnement Complètes

## Nouveau `.env.example` proposé

Ce fichier remplace l'ancien `.env.example` avec toutes les variables nécessaires, en distinguant les services DIY des services SaaS optionnels.

```env
# ============================================
# ProspectionAgentic — Environment Variables
# ============================================
# Copy this file to .env and fill in your values:
#   cp .env.example .env
#
# [REQUIRED] = Application won't start without it
# [RECOMMENDED] = Needed for full functionality
# [OPTIONAL] = Has graceful fallback or is for later phases

# ━━━━━━━━━━━━ Application ━━━━━━━━━━━━
NODE_ENV=development                          # development | production | test
APP_PORT=3000                                 # [REQUIRED] Server port
ALLOWED_ORIGINS=http://localhost:3000          # Comma-separated CORS origins
LOG_LEVEL=debug                               # fatal | error | warn | info | debug | trace

# ━━━━━━━━━━━━ Database (PostgreSQL) ━━━━━━━━━━━━
DATABASE_URL=postgresql://prospection:changeme@localhost:5433/prospection_dev  # [REQUIRED]

# ━━━━━━━━━━━━ Redis ━━━━━━━━━━━━
REDIS_URL=redis://:changeme@localhost:6381    # [REQUIRED]
REDIS_HOST=localhost
REDIS_PORT=6381
REDIS_PASSWORD=changeme

# ━━━━━━━━━━━━ JWT Authentication ━━━━━━━━━━━━
JWT_SECRET=CHANGE_ME_TO_A_RANDOM_STRING_OF_AT_LEAST_64_CHARACTERS  # [REQUIRED]
# Generate: openssl rand -hex 32
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# ━━━━━━━━━━━━ Internal API Keys ━━━━━━━━━━━━
INTERNAL_API_KEYS=dev-api-key-1,dev-api-key-2 # Service-to-service auth

# ══════════════════════════════════════════════
#   LLM & OBSERVABILITÉ
# ══════════════════════════════════════════════

# ━━━━━━━━━━━━ Claude API (Anthropic) ━━━━━━━━━━━━
ANTHROPIC_API_KEY=                            # [RECOMMENDED] Falls back to mock in dev
# Get your key at: https://console.anthropic.com/settings/keys
LLM_MONTHLY_BUDGET_EUR=500                    # Monthly spending limit
LLM_DAILY_BUDGET_EUR=25                       # Daily spending limit

# ━━━━━━━━━━━━ Langfuse (LLM Observability) ━━━━━━━━━━━━
LANGFUSE_PUBLIC_KEY=                          # [OPTIONAL] Self-hosted Langfuse
LANGFUSE_SECRET_KEY=                          # [OPTIONAL] From Langfuse dashboard
LANGFUSE_HOST=                                # [OPTIONAL] e.g., https://langfuse.yourdomain.com
# Langfuse is a self-hosted LLM observability tool. It traces every Claude API
# call: tokens used, cost, latency, quality scores. Deploy via docker-compose.yml.
# Dashboard: track prompt performance, compare models, detect regressions.
# Docs: https://langfuse.com/docs

# ══════════════════════════════════════════════
#   EMAIL FINDING (DIY — remplace Dropcontact + Hunter + ZeroBounce)
# ══════════════════════════════════════════════

# ━━━━━━━━━━━━ Reacher (Self-Hosted Email Verifier) ━━━━━━━━━━━━
REACHER_URL=http://localhost:8080             # [RECOMMENDED] Reacher container URL
REACHER_MAX_CONCURRENT=5                      # Max parallel SMTP verifications
REACHER_TIMEOUT_MS=30000                      # Timeout per verification (ms)
REACHER_MAX_REQUESTS_PER_DAY=500              # Daily limit to protect IP reputation
# Reacher is an open-source (Rust) email verification tool deployed as a Docker
# container. It replaces Dropcontact (39€/m), Hunter.io (49€/m), and ZeroBounce (15€/m).
# It performs: SMTP verification, MX check, catch-all detection, disposable email detection.
# GitHub: https://github.com/reacherhq/check-if-email-exists
# IMPORTANT: Run on a SEPARATE IP from your email sending server.

# ━━━━━━━━━━━━ Dropcontact (FALLBACK — Phase 2+) ━━━━━━━━━━━━
# DROPCONTACT_API_KEY=                        # [OPTIONAL] Only if Reacher insufficient
# Activate if: email found rate < 70% or IP blacklisted
# Pricing: 39€/month for 2,500 credits
# Docs: https://developer.dropcontact.com/

# ━━━━━━━━━━━━ ZeroBounce (FALLBACK — Phase 2+) ━━━━━━━━━━━━
# ZEROBOUNCE_API_KEY=                         # [OPTIONAL] Only for spam trap detection at scale
# Activate if: sending >500 emails/month and need spam trap protection
# Pricing: ~$16/month for 2,000 verifications
# Docs: https://www.zerobounce.net/docs/

# ══════════════════════════════════════════════
#   DONNÉES ENTREPRISE (DIY — remplace Pappers)
# ══════════════════════════════════════════════

# ━━━━━━━━━━━━ INSEE SIRENE (Identité Entreprise) ━━━━━━━━━━━━
SIRENE_API_TOKEN=                             # [RECOMMENDED] Free — register at api.insee.fr
# Provides: SIREN, SIRET, address, NAF code, employee count (range), creation date
# Free registration: https://api.insee.fr/catalogue/
# Rate limit: 30 requests/minute
# Already implemented: src/modules/agent-enrichisseur/infrastructure/adapters/insee.adapter.ts

# ━━━━━━━━━━━━ INPI / RNE (Dirigeants & Comptes) ━━━━━━━━━━━━
INPI_API_URL=https://data.inpi.fr/api         # [RECOMMENDED]
INPI_USERNAME=                                 # [RECOMMENDED] Free — register at data.inpi.fr
INPI_PASSWORD=                                 # [RECOMMENDED]
# Provides: directors, beneficial owners, annual accounts (revenue, net income)
# Free registration: https://data.inpi.fr/
# Note: API can be slow (1-5s) and has occasional downtime

# ━━━━━━━━━━━━ BODACC (Annonces Légales) ━━━━━━━━━━━━
# No API key needed — open data, free access
# Provides: legal notices, collective procedures, creations, transfers
# API: https://bodacc-datadila.opendatasoft.com/api/v2/
# Used to: detect companies in financial trouble (disqualify) or recent changes (opportunity)

# ━━━━━━━━━━━━ Pappers (FALLBACK — Phase 2+) ━━━━━━━━━━━━
# PAPPERS_API_KEY=                            # [OPTIONAL] Only if public APIs insufficient
# Activate if: need full-text search or INPI data coverage < 50%
# Pricing: ~60€/month for 3,000 requests
# Docs: https://www.pappers.fr/api/documentation

# ══════════════════════════════════════════════
#   EMAIL SENDING
# ══════════════════════════════════════════════

# ━━━━━━━━━━━━ Gmail API (Personal/Low Volume) ━━━━━━━━━━━━
GMAIL_CLIENT_ID=                              # [OPTIONAL] Google Cloud OAuth2
GMAIL_CLIENT_SECRET=                          # [OPTIONAL]
GMAIL_REFRESH_TOKEN=                          # [OPTIONAL]
GMAIL_USER=                                   # [OPTIONAL] Gmail address for sending
# Setup: https://developers.google.com/gmail/api/quickstart/nodejs
# Use for: Phase 0 manual testing (< 50 emails/day)

# ━━━━━━━━━━━━ Mailgun (Cold Email — Phase 2+) ━━━━━━━━━━━━
# MAILGUN_API_KEY=                            # [OPTIONAL] For mass cold email
# MAILGUN_DOMAIN=                             # [OPTIONAL] e.g., mg.insights-axiom.fr
# MAILGUN_WEBHOOK_SIGNING_KEY=                # [OPTIONAL] For webhook HMAC verification
# Activate in Phase 2 for: open/click tracking, bounce handling, volume sending
# Pricing: $0.80/1000 emails (Flex plan)
# IMPORTANT: Use dedicated cold email domains, NEVER your main domain

# ══════════════════════════════════════════════
#   LINKEDIN AUTOMATION
# ══════════════════════════════════════════════

# ━━━━━━━━━━━━ Waalaxy (LinkedIn Automation — Phase 3) ━━━━━━━━━━━━
# WAALAXY_API_KEY=                            # [OPTIONAL] Phase 3 — LinkedIn outreach
# WAALAXY_WEBHOOK_SECRET=                     # [OPTIONAL] For webhook verification
# Waalaxy handles LinkedIn compliance (100 msg/week limit, anti-ban).
# Sends webhooks to n8n when LinkedIn replies are received.
# Pricing: ~80€/month (Business plan)
# Note: Waalaxy does NOT provide phone/email data — only automation.

# ══════════════════════════════════════════════
#   MARCHÉS PUBLICS
# ══════════════════════════════════════════════

# ━━━━━━━━━━━━ BOAMP (Marchés Publics) ━━━━━━━━━━━━
# No API key needed — free public REST API
# API: https://www.boamp.fr/api/avis/search
# Already implemented: src/modules/agent-veilleur/infrastructure/adapters/boamp.adapter.ts
# Provides: tender notices, deadlines, estimated values, CPV codes

# ══════════════════════════════════════════════
#   NOTIFICATIONS & MONITORING
# ══════════════════════════════════════════════

# ━━━━━━━━━━━━ Slack ━━━━━━━━━━━━
SLACK_WEBHOOK_URL=                            # [OPTIONAL] Incoming webhook for notifications
# Used for: daily digest, alerts (prospect HOT, agent errors, pipeline metrics)
# Setup: https://api.slack.com/messaging/webhooks

# ══════════════════════════════════════════════
#   SIGNATURE ÉLECTRONIQUE (Phase 4)
# ══════════════════════════════════════════════

# ━━━━━━━━━━━━ Yousign (Devis & Contrats — Phase 4) ━━━━━━━━━━━━
# YOUSIGN_API_KEY=                            # [OPTIONAL] Phase 4 — Agent 8 Dealmaker
# YOUSIGN_SANDBOX=true                        # Use sandbox for testing
# Used for: electronic signature of quotes/proposals
# Pricing: from 9€/month
# Docs: https://developers.yousign.com/

# ══════════════════════════════════════════════
#   INFRASTRUCTURE
# ══════════════════════════════════════════════

# ━━━━━━━━━━━━ Domain & Security ━━━━━━━━━━━━
DOMAIN=localhost                              # Production domain for Caddy
ADMIN_IP=127.0.0.1                            # [REQUIRED in prod] Admin panel IP whitelist

# ━━━━━━━━━━━━ Docker Dev Ports ━━━━━━━━━━━━
# PostgreSQL: 5433 (avoids conflict with host pg on 5432)
# Redis: 6381 (avoids conflict with host redis on 6379/6380)
# Reacher: 8080
```

## Résumé des changements vs l'ancien `.env.example`

| Section | Ancien | Nouveau |
|---------|--------|---------|
| Reacher | Absent | Ajouté (3 variables) |
| INPI | Absent | Ajouté (3 variables) |
| BODACC | Absent | Documenté (pas de clé nécessaire) |
| Langfuse | Présent sans explication | Documenté avec description |
| Dropcontact | Absent | Ajouté en commentaire (fallback) |
| ZeroBounce | Absent | Ajouté en commentaire (fallback) |
| Hunter.io | Absent | Supprimé (non recommandé) |
| Kaspr | Absent | Supprimé (risque RGPD) |
| Mailgun | Absent | Ajouté en commentaire (Phase 2) |
| Waalaxy | Absent | Ajouté en commentaire (Phase 3) |
| Yousign | Absent | Ajouté en commentaire (Phase 4) |
| BOAMP | Absent | Documenté (pas de clé nécessaire) |
| Organisation | Plat | Organisé par domaine fonctionnel |
| Commentaires | Minimaux | Chaque variable expliquée avec contexte |
