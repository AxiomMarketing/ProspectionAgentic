# Base de Données

## Vue d'ensemble

PostgreSQL 16.13 comme base de données principale, Redis 7.4.3 pour le cache et les files BullMQ, Prisma 7.4 comme ORM. pgvector est installé pour les embeddings futurs.

---

## PostgreSQL 16 — DDL Complet

### Script d'initialisation

```sql
-- /infrastructure/postgres/init.sql
-- Exécuté automatiquement par Docker au premier démarrage

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";  -- pgvector pour les embeddings futurs

-- Schéma applicatif
CREATE SCHEMA IF NOT EXISTS prospection;
SET search_path TO prospection, public;

-- Rôles
CREATE ROLE app_user NOINHERIT;
GRANT CONNECT ON DATABASE prospection_prod TO app_user;
GRANT USAGE ON SCHEMA prospection TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA prospection TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA prospection TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA prospection
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA prospection
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Rôle lecture seule pour Metabase
CREATE ROLE metabase_reader NOINHERIT;
GRANT CONNECT ON DATABASE prospection_prod TO metabase_reader;
GRANT USAGE ON SCHEMA prospection TO metabase_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA prospection TO metabase_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA prospection
  GRANT SELECT ON TABLES TO metabase_reader;
```

### Types ENUM

```sql
-- Types énumérés
CREATE TYPE prospect_status AS ENUM (
  'raw', 'enriched', 'scored', 'contacted', 'replied',
  'meeting_booked', 'deal_in_progress', 'won', 'lost',
  'nurturing', 'blacklisted', 'unsubscribed'
);

CREATE TYPE channel_type AS ENUM (
  'email', 'linkedin', 'phone', 'sms', 'postal'
);

CREATE TYPE sequence_step_status AS ENUM (
  'pending', 'sent', 'delivered', 'opened', 'clicked',
  'replied', 'bounced', 'failed', 'skipped'
);

CREATE TYPE reply_sentiment AS ENUM (
  'positive', 'negative', 'neutral', 'out_of_office', 'unsubscribe_request'
);

CREATE TYPE tender_status AS ENUM (
  'open', 'closed', 'awarded', 'cancelled'
);

CREATE TYPE deal_stage AS ENUM (
  'discovery', 'proposal', 'negotiation', 'closed_won', 'closed_lost'
);

CREATE TYPE alert_severity AS ENUM (
  'info', 'warning', 'critical'
);

CREATE TYPE action_type AS ENUM (
  'connection_request', 'message', 'inmail', 'visit', 'endorse'
);
```

### Table: prospects

```sql
CREATE TABLE prospects (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Identité
  first_name        VARCHAR(100),
  last_name         VARCHAR(100),
  full_name         VARCHAR(255),
  email             VARCHAR(255),
  email_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  phone             VARCHAR(50),
  linkedin_url      VARCHAR(500),
  linkedin_id       VARCHAR(100),

  -- Entreprise
  company_name      VARCHAR(255),
  company_siren     CHAR(9),
  company_siret     CHAR(14),
  company_naf_code  VARCHAR(10),
  company_tpe_pme   BOOLEAN,
  company_size      VARCHAR(50),     -- '1-10', '11-50', '51-200', etc.
  company_revenue   BIGINT,          -- EUR, issu de Pappers
  company_city      VARCHAR(100),
  company_postal_code VARCHAR(10),
  company_country   CHAR(2) DEFAULT 'FR',
  company_website   VARCHAR(500),
  company_tech_stack JSONB,          -- Détecté par Wappalyzer

  -- Rôle
  job_title         VARCHAR(255),
  seniority_level   VARCHAR(50),     -- 'c_level', 'vp', 'director', 'manager', 'individual'
  is_decision_maker BOOLEAN,

  -- Statut pipeline
  status            prospect_status NOT NULL DEFAULT 'raw',

  -- Données brutes enrichies
  enrichment_data   JSONB,
  enrichment_source VARCHAR(100),    -- 'dropcontact', 'hunter', 'kaspr', 'manual'
  enriched_at       TIMESTAMPTZ,

  -- RGPD
  consent_given     BOOLEAN NOT NULL DEFAULT FALSE,
  consent_date      TIMESTAMPTZ,
  consent_source    VARCHAR(100),
  data_retention_until TIMESTAMPTZ,
  rgpd_erased_at    TIMESTAMPTZ,

  -- Vecteur d'embedding (pgvector, pour recherche sémantique future)
  embedding         vector(1536),

  CONSTRAINT email_or_linkedin CHECK (
    email IS NOT NULL OR linkedin_url IS NOT NULL
  )
);

CREATE INDEX idx_prospects_email ON prospects(email) WHERE email IS NOT NULL;
CREATE INDEX idx_prospects_company_siren ON prospects(company_siren) WHERE company_siren IS NOT NULL;
CREATE INDEX idx_prospects_status ON prospects(status);
CREATE INDEX idx_prospects_created_at ON prospects(created_at DESC);
CREATE INDEX idx_prospects_linkedin ON prospects(linkedin_id) WHERE linkedin_id IS NOT NULL;
CREATE INDEX idx_prospects_embedding ON prospects USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

### Table: raw_leads

```sql
CREATE TABLE raw_leads (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  source        VARCHAR(100) NOT NULL,  -- 'boamp', 'insee', 'linkedin', 'manual', 'typeform'
  source_id     VARCHAR(255),           -- ID dans la source
  raw_data      JSONB NOT NULL,
  processed     BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at  TIMESTAMPTZ,
  prospect_id   UUID REFERENCES prospects(id) ON DELETE SET NULL,
  error_message TEXT,
  retry_count   SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_raw_leads_source ON raw_leads(source, source_id);
CREATE INDEX idx_raw_leads_processed ON raw_leads(processed) WHERE NOT processed;
CREATE INDEX idx_raw_leads_created_at ON raw_leads(created_at DESC);
```

### Table: prospect_scores

```sql
CREATE TABLE prospect_scores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Score global
  total_score     NUMERIC(5,2) NOT NULL CHECK (total_score BETWEEN 0 AND 100),

  -- Sous-scores
  firmographic_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
  technographic_score   NUMERIC(5,2) NOT NULL DEFAULT 0,
  behavioral_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  engagement_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  intent_score          NUMERIC(5,2) NOT NULL DEFAULT 0,
  accessibility_score   NUMERIC(5,2) NOT NULL DEFAULT 0,

  -- Détail des calculs (pour audit)
  score_breakdown  JSONB NOT NULL DEFAULT '{}',

  -- Segment
  segment          VARCHAR(20) NOT NULL,  -- 'A' (>80), 'B' (60-80), 'C' (40-60), 'D' (<40)
  is_latest        BOOLEAN NOT NULL DEFAULT TRUE,

  -- Méta
  model_version    VARCHAR(50) NOT NULL DEFAULT '1.0',
  coefficients_id  UUID REFERENCES scoring_coefficients(id)
);

CREATE INDEX idx_prospect_scores_prospect ON prospect_scores(prospect_id, is_latest);
CREATE INDEX idx_prospect_scores_total ON prospect_scores(total_score DESC) WHERE is_latest;
CREATE INDEX idx_prospect_scores_segment ON prospect_scores(segment) WHERE is_latest;

-- Trigger pour désactiver les anciens scores
CREATE OR REPLACE FUNCTION set_latest_score()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE prospect_scores
  SET is_latest = FALSE
  WHERE prospect_id = NEW.prospect_id
    AND id != NEW.id
    AND is_latest = TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_latest_score
  AFTER INSERT ON prospect_scores
  FOR EACH ROW EXECUTE FUNCTION set_latest_score();
```

### Table: scoring_coefficients

```sql
CREATE TABLE scoring_coefficients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  name          VARCHAR(100) NOT NULL UNIQUE,
  version       VARCHAR(20) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,
  coefficients  JSONB NOT NULL,
  description   TEXT,
  activated_at  TIMESTAMPTZ,
  activated_by  VARCHAR(255)
);

-- Coefficients par défaut
INSERT INTO scoring_coefficients (name, version, is_active, coefficients) VALUES (
  'default_v1',
  '1.0',
  TRUE,
  '{
    "firmographic": {
      "weight": 0.30,
      "factors": {
        "company_size_match": 0.30,
        "naf_code_match": 0.25,
        "revenue_range": 0.25,
        "growth_signal": 0.20
      }
    },
    "technographic": {
      "weight": 0.25,
      "factors": {
        "tech_stack_fit": 0.50,
        "digital_maturity": 0.30,
        "lighthouse_score": 0.20
      }
    },
    "behavioral": {
      "weight": 0.20,
      "factors": {
        "website_visits": 0.40,
        "content_downloads": 0.35,
        "linkedin_activity": 0.25
      }
    },
    "engagement": {
      "weight": 0.15,
      "factors": {
        "email_opens": 0.30,
        "email_clicks": 0.40,
        "reply_rate": 0.30
      }
    },
    "intent": {
      "weight": 0.10,
      "factors": {
        "tender_published": 0.60,
        "job_posting_signals": 0.40
      }
    }
  }'
);
```

### Table: message_templates

```sql
CREATE TABLE message_templates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  name          VARCHAR(255) NOT NULL UNIQUE,
  channel       channel_type NOT NULL,
  step_number   SMALLINT NOT NULL,
  subject       TEXT,                -- Email uniquement
  body          TEXT NOT NULL,
  variables     TEXT[] NOT NULL DEFAULT '{}',  -- Ex: ['first_name', 'company_name']

  -- A/B testing
  variant       CHAR(1) NOT NULL DEFAULT 'A',  -- 'A' ou 'B'
  ab_group_id   UUID,

  -- Métriques
  total_sent    INTEGER NOT NULL DEFAULT 0,
  total_opened  INTEGER NOT NULL DEFAULT 0,
  total_clicked INTEGER NOT NULL DEFAULT 0,
  total_replied INTEGER NOT NULL DEFAULT 0,

  -- Statut
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  archived_at   TIMESTAMPTZ,

  -- Versioning de prompt
  prompt_version VARCHAR(20) NOT NULL DEFAULT '1.0',
  language      CHAR(2) NOT NULL DEFAULT 'FR'
);

CREATE INDEX idx_message_templates_channel_step ON message_templates(channel, step_number) WHERE is_active;
```

### Table: generated_messages

```sql
CREATE TABLE generated_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  template_id     UUID REFERENCES message_templates(id) ON DELETE SET NULL,

  channel         channel_type NOT NULL,
  step_number     SMALLINT NOT NULL,
  subject         TEXT,
  body            TEXT NOT NULL,

  -- Génération LLM
  model_used      VARCHAR(100),     -- 'claude-haiku-3', 'claude-sonnet-4', etc.
  prompt_tokens   INTEGER,
  completion_tokens INTEGER,
  cost_eur        NUMERIC(10,6),
  generation_ms   INTEGER,

  -- Personnalisation
  personalization_data JSONB,       -- Variables utilisées

  -- Langfuse
  langfuse_trace_id VARCHAR(255),

  -- Statut
  is_approved     BOOLEAN,          -- NULL = en attente, TRUE = approuvé, FALSE = rejeté
  approved_by     VARCHAR(255),
  approved_at     TIMESTAMPTZ
);

CREATE INDEX idx_generated_messages_prospect ON generated_messages(prospect_id, created_at DESC);
CREATE INDEX idx_generated_messages_pending ON generated_messages(is_approved) WHERE is_approved IS NULL;
```

### Table: email_sends

```sql
CREATE TABLE email_sends (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  message_id      UUID NOT NULL REFERENCES generated_messages(id) ON DELETE CASCADE,
  sequence_id     UUID REFERENCES prospect_sequences(id) ON DELETE SET NULL,

  -- Envoi
  from_email      VARCHAR(255) NOT NULL,
  to_email        VARCHAR(255) NOT NULL,
  subject         TEXT NOT NULL,
  provider        VARCHAR(50) NOT NULL,  -- 'gmail', 'mailgun'
  provider_message_id VARCHAR(255),

  -- Statut
  status          sequence_step_status NOT NULL DEFAULT 'pending',
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  bounced_at      TIMESTAMPTZ,
  bounce_type     VARCHAR(50),           -- 'hard', 'soft'
  unsubscribed_at TIMESTAMPTZ,

  -- Tracking
  open_count      SMALLINT NOT NULL DEFAULT 0,
  click_count     SMALLINT NOT NULL DEFAULT 0,
  tracking_pixel_id VARCHAR(255),

  -- Erreurs
  error_message   TEXT,
  retry_count     SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_email_sends_prospect ON email_sends(prospect_id, created_at DESC);
CREATE INDEX idx_email_sends_status ON email_sends(status);
CREATE INDEX idx_email_sends_provider_message ON email_sends(provider_message_id) WHERE provider_message_id IS NOT NULL;
```

### Table: linkedin_actions

```sql
CREATE TABLE linkedin_actions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  sequence_id     UUID REFERENCES prospect_sequences(id) ON DELETE SET NULL,

  action_type     action_type NOT NULL,
  message_body    TEXT,

  -- Statut
  status          sequence_step_status NOT NULL DEFAULT 'pending',
  executed_at     TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,

  -- Provider (ex: Waalaxy)
  provider        VARCHAR(50) NOT NULL DEFAULT 'waalaxy',
  provider_action_id VARCHAR(255),

  -- Erreur
  error_message   TEXT,
  retry_count     SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_linkedin_actions_prospect ON linkedin_actions(prospect_id, created_at DESC);
CREATE INDEX idx_linkedin_actions_status ON linkedin_actions(status);
```

### Table: reply_classifications

```sql
CREATE TABLE reply_classifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  email_send_id   UUID REFERENCES email_sends(id) ON DELETE SET NULL,
  linkedin_action_id UUID REFERENCES linkedin_actions(id) ON DELETE SET NULL,

  -- Texte original
  raw_reply       TEXT NOT NULL,
  reply_received_at TIMESTAMPTZ NOT NULL,

  -- Classification LLM
  sentiment       reply_sentiment NOT NULL,
  intent          VARCHAR(100),           -- 'schedule_call', 'request_info', 'not_interested', etc.
  next_best_action VARCHAR(100),
  suggested_response TEXT,
  classification_confidence NUMERIC(4,3), -- 0.000 à 1.000

  -- LLM méta
  model_used      VARCHAR(100),
  cost_eur        NUMERIC(10,6),
  langfuse_trace_id VARCHAR(255),

  -- Action prise
  action_taken    VARCHAR(100),
  action_taken_at TIMESTAMPTZ,
  action_taken_by VARCHAR(255)            -- 'agent' ou email utilisateur
);

CREATE INDEX idx_reply_classifications_prospect ON reply_classifications(prospect_id, created_at DESC);
CREATE INDEX idx_reply_classifications_sentiment ON reply_classifications(sentiment);
```

### Table: prospect_sequences

```sql
CREATE TABLE prospect_sequences (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,

  -- Séquence
  name            VARCHAR(255) NOT NULL,
  channel         channel_type NOT NULL,
  total_steps     SMALLINT NOT NULL,
  current_step    SMALLINT NOT NULL DEFAULT 0,

  -- Timing
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  paused_at       TIMESTAMPTZ,
  next_step_at    TIMESTAMPTZ,

  -- Statut
  status          VARCHAR(50) NOT NULL DEFAULT 'active',  -- 'active', 'paused', 'completed', 'stopped'
  stopped_reason  VARCHAR(100),  -- 'replied', 'unsubscribed', 'bounced', 'won', 'manual'

  -- Métriques
  opens_count     SMALLINT NOT NULL DEFAULT 0,
  clicks_count    SMALLINT NOT NULL DEFAULT 0,
  replies_count   SMALLINT NOT NULL DEFAULT 0,

  UNIQUE(prospect_id, name, status)
);

CREATE INDEX idx_prospect_sequences_prospect ON prospect_sequences(prospect_id, status);
CREATE INDEX idx_prospect_sequences_next_step ON prospect_sequences(next_step_at)
  WHERE status = 'active' AND next_step_at IS NOT NULL;
```

### Table: bounce_events

```sql
CREATE TABLE bounce_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  email           VARCHAR(255) NOT NULL,
  prospect_id     UUID REFERENCES prospects(id) ON DELETE SET NULL,
  email_send_id   UUID REFERENCES email_sends(id) ON DELETE SET NULL,

  bounce_type     VARCHAR(50) NOT NULL,   -- 'hard', 'soft', 'spam_complaint'
  bounce_code     VARCHAR(20),            -- Code SMTP
  bounce_message  TEXT,
  provider        VARCHAR(50) NOT NULL,   -- 'mailgun', 'gmail'
  provider_event_id VARCHAR(255)
);

CREATE INDEX idx_bounce_events_email ON bounce_events(email, created_at DESC);
CREATE INDEX idx_bounce_events_hard ON bounce_events(email)
  WHERE bounce_type = 'hard';
```

### Table: nurture_prospects

```sql
CREATE TABLE nurture_prospects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE UNIQUE,

  -- Raison du nurturing
  entry_reason    VARCHAR(100) NOT NULL,  -- 'no_budget_now', 'not_the_right_time', 'competitor_contract'
  entry_date      DATE NOT NULL,
  reactivation_date DATE,

  -- Statut
  status          VARCHAR(50) NOT NULL DEFAULT 'active',  -- 'active', 'reactivated', 'exited'
  reactivated_at  TIMESTAMPTZ,
  exit_reason     VARCHAR(100),

  -- Données de contexte
  notes           TEXT,
  tags            TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_nurture_prospects_reactivation ON nurture_prospects(reactivation_date)
  WHERE status = 'active';
```

### Table: nurture_interactions

```sql
CREATE TABLE nurture_interactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  nurture_id      UUID NOT NULL REFERENCES nurture_prospects(id) ON DELETE CASCADE,
  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,

  interaction_type VARCHAR(100) NOT NULL,  -- 'newsletter', 'event_invite', 'content_share', 'check_in'
  channel         channel_type NOT NULL,
  content_title   VARCHAR(255),
  content_url     VARCHAR(500),

  -- Résultat
  opened          BOOLEAN,
  clicked         BOOLEAN,
  replied         BOOLEAN,
  reply_sentiment reply_sentiment
);
```

### Table: deals_crm

```sql
CREATE TABLE deals_crm (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,

  -- Deal
  title           VARCHAR(255) NOT NULL,
  stage           deal_stage NOT NULL DEFAULT 'discovery',
  amount_eur      NUMERIC(12,2),
  probability     NUMERIC(4,1) CHECK (probability BETWEEN 0 AND 100),
  expected_close_date DATE,
  closed_at       TIMESTAMPTZ,
  won_reason      TEXT,
  lost_reason     TEXT,

  -- Assignation
  owner_email     VARCHAR(255),

  -- Liens
  quote_id        UUID REFERENCES quotes(id) ON DELETE SET NULL,
  tender_id       UUID REFERENCES public_tenders(id) ON DELETE SET NULL,

  -- Historique
  stage_history   JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_deals_crm_stage ON deals_crm(stage);
CREATE INDEX idx_deals_crm_prospect ON deals_crm(prospect_id);
CREATE INDEX idx_deals_crm_close_date ON deals_crm(expected_close_date)
  WHERE stage NOT IN ('closed_won', 'closed_lost');
```

### Table: quotes

```sql
CREATE TABLE quotes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  deal_id         UUID REFERENCES deals_crm(id) ON DELETE SET NULL,
  prospect_id     UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,

  -- Devis
  quote_number    VARCHAR(50) NOT NULL UNIQUE,
  title           VARCHAR(255) NOT NULL,
  amount_ht_eur   NUMERIC(12,2) NOT NULL,
  tva_rate        NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  amount_ttc_eur  NUMERIC(12,2) GENERATED ALWAYS AS (
    amount_ht_eur * (1 + tva_rate / 100)
  ) STORED,

  -- Contenu
  line_items      JSONB NOT NULL DEFAULT '[]',
  validity_days   SMALLINT NOT NULL DEFAULT 30,
  expires_at      DATE,
  notes           TEXT,

  -- Signature (Yousign)
  status          VARCHAR(50) NOT NULL DEFAULT 'draft',  -- 'draft', 'sent', 'signed', 'expired', 'refused'
  yousign_procedure_id VARCHAR(255),
  signed_at       TIMESTAMPTZ,
  signed_document_url VARCHAR(500),

  -- PDF
  pdf_url         VARCHAR(500),
  pdf_generated_at TIMESTAMPTZ
);

CREATE INDEX idx_quotes_deal ON quotes(deal_id);
CREATE INDEX idx_quotes_status ON quotes(status);
```

### Table: public_tenders

```sql
CREATE TABLE public_tenders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Source
  source          VARCHAR(50) NOT NULL DEFAULT 'boamp',  -- 'boamp', 'ted', 'manual'
  source_id       VARCHAR(255) NOT NULL,
  source_url      VARCHAR(500),

  -- Données appel d'offres
  title           TEXT NOT NULL,
  description     TEXT,
  buyer_name      VARCHAR(255),
  buyer_siren     CHAR(9),
  publication_date DATE NOT NULL,
  deadline_date   DATE,
  estimated_amount NUMERIC(15,2),
  cpv_codes       TEXT[],                -- Codes CPV
  nuts_code       VARCHAR(10),           -- Région NUTS
  procedure_type  VARCHAR(100),          -- 'open', 'restricted', 'negotiated'

  -- Analyse DCE (Claude Opus)
  dce_url         VARCHAR(500),
  dce_analyzed    BOOLEAN NOT NULL DEFAULT FALSE,
  dce_analyzed_at TIMESTAMPTZ,
  dce_summary     TEXT,
  dce_fit_score   NUMERIC(5,2),          -- 0-100: adéquation avec notre offre
  dce_requirements JSONB,
  dce_analysis_cost_eur NUMERIC(10,6),
  langfuse_trace_id VARCHAR(255),

  -- Statut
  status          tender_status NOT NULL DEFAULT 'open',

  UNIQUE(source, source_id)
);

CREATE INDEX idx_public_tenders_status ON public_tenders(status);
CREATE INDEX idx_public_tenders_deadline ON public_tenders(deadline_date)
  WHERE status = 'open';
CREATE INDEX idx_public_tenders_fit ON public_tenders(dce_fit_score DESC)
  WHERE dce_analyzed = TRUE;
```

### Table: customers

```sql
CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Identité
  company_name    VARCHAR(255) NOT NULL,
  siren           CHAR(9),
  legal_form      VARCHAR(100),

  -- Contact principal
  primary_contact_id UUID REFERENCES prospects(id) ON DELETE SET NULL,

  -- Contrat
  contract_start_date DATE,
  contract_end_date   DATE,
  mrr_eur         NUMERIC(10,2),
  arr_eur         NUMERIC(12,2) GENERATED ALWAYS AS (mrr_eur * 12) STORED,
  plan            VARCHAR(100),

  -- Statut
  status          VARCHAR(50) NOT NULL DEFAULT 'active',  -- 'active', 'at_risk', 'churned'
  churned_at      TIMESTAMPTZ,
  churn_reason    TEXT,

  -- CRM externe
  external_crm_id VARCHAR(255),
  notes           TEXT
);

CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_siren ON customers(siren) WHERE siren IS NOT NULL;
```

### Table: customer_health_scores

```sql
CREATE TABLE customer_health_scores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Score global (0-100)
  health_score    NUMERIC(5,2) NOT NULL,
  health_label    VARCHAR(20) NOT NULL,   -- 'healthy', 'at_risk', 'critical'

  -- Sous-scores
  usage_score     NUMERIC(5,2),
  support_score   NUMERIC(5,2),
  financial_score NUMERIC(5,2),
  engagement_score NUMERIC(5,2),
  nps_score       NUMERIC(5,2),

  -- Signaux
  signals         JSONB NOT NULL DEFAULT '[]',
  is_latest       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_customer_health_customer ON customer_health_scores(customer_id, is_latest);
CREATE INDEX idx_customer_health_label ON customer_health_scores(health_label) WHERE is_latest;
```

### Table: metriques_daily

```sql
CREATE TABLE metriques_daily (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date            DATE NOT NULL,
  metric_name     VARCHAR(100) NOT NULL,
  metric_value    NUMERIC(15,4) NOT NULL,
  dimensions      JSONB NOT NULL DEFAULT '{}',   -- Ex: {channel: 'email', segment: 'A'}
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(date, metric_name, dimensions)
);

CREATE INDEX idx_metriques_daily_date ON metriques_daily(date DESC, metric_name);
```

### Table: alertes

```sql
CREATE TABLE alertes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,

  severity        alert_severity NOT NULL,
  title           VARCHAR(255) NOT NULL,
  description     TEXT NOT NULL,
  category        VARCHAR(100) NOT NULL,    -- 'deliverability', 'budget', 'performance', 'system'
  metric_name     VARCHAR(100),
  metric_value    NUMERIC(15,4),
  threshold_value NUMERIC(15,4),

  -- Notification
  notified_slack  BOOLEAN NOT NULL DEFAULT FALSE,
  notified_email  BOOLEAN NOT NULL DEFAULT FALSE,
  notified_at     TIMESTAMPTZ,

  -- Résolution
  is_resolved     BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by     VARCHAR(255),
  resolution_note TEXT
);

CREATE INDEX idx_alertes_unresolved ON alertes(severity, created_at DESC)
  WHERE NOT is_resolved;
```

### Table: recommandations

```sql
CREATE TABLE recommandations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Recommandation
  type            VARCHAR(100) NOT NULL,     -- 'reactivate_prospect', 'adjust_template', 'review_segment'
  title           VARCHAR(255) NOT NULL,
  description     TEXT NOT NULL,
  priority        SMALLINT NOT NULL DEFAULT 2,  -- 1=high, 2=medium, 3=low
  action_url      VARCHAR(500),

  -- Cibles
  target_type     VARCHAR(50),              -- 'prospect', 'template', 'segment'
  target_ids      UUID[],

  -- IA
  generated_by    VARCHAR(100) NOT NULL,    -- 'optimizer_agent', 'health_agent'
  confidence      NUMERIC(4,3),
  model_used      VARCHAR(100),

  -- Statut
  status          VARCHAR(50) NOT NULL DEFAULT 'pending',  -- 'pending', 'applied', 'dismissed'
  applied_at      TIMESTAMPTZ,
  applied_by      VARCHAR(255),
  dismissed_at    TIMESTAMPTZ
);

CREATE INDEX idx_recommandations_pending ON recommandations(priority, created_at DESC)
  WHERE status = 'pending';
```

### Table: rgpd_blacklist

```sql
CREATE TABLE rgpd_blacklist (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  email           VARCHAR(255),
  linkedin_url    VARCHAR(500),
  company_siren   CHAR(9),
  phone           VARCHAR(50),

  reason          VARCHAR(100) NOT NULL,    -- 'unsubscribe', 'erasure_request', 'spam_complaint', 'manual'
  source          VARCHAR(100),             -- 'email_bounce', 'form', 'manual', 'waalaxy'
  notes           TEXT,

  -- Archivage RGPD (conservation 3 ans)
  expires_at      DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '3 years'),

  CONSTRAINT at_least_one_identifier CHECK (
    email IS NOT NULL OR linkedin_url IS NOT NULL
    OR company_siren IS NOT NULL OR phone IS NOT NULL
  )
);

CREATE INDEX idx_rgpd_blacklist_email ON rgpd_blacklist(email) WHERE email IS NOT NULL;
CREATE INDEX idx_rgpd_blacklist_linkedin ON rgpd_blacklist(linkedin_url) WHERE linkedin_url IS NOT NULL;
```

### Table: agent_events

```sql
CREATE TABLE agent_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Agent source
  agent_name      VARCHAR(100) NOT NULL,
  event_type      VARCHAR(100) NOT NULL,    -- 'job_started', 'job_completed', 'job_failed', 'decision'

  -- Contexte
  job_id          VARCHAR(255),             -- BullMQ job ID
  prospect_id     UUID REFERENCES prospects(id) ON DELETE SET NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  result          JSONB,
  error_message   TEXT,

  -- Performance
  duration_ms     INTEGER,

  -- Langfuse
  langfuse_trace_id VARCHAR(255)
);

CREATE INDEX idx_agent_events_agent ON agent_events(agent_name, created_at DESC);
CREATE INDEX idx_agent_events_prospect ON agent_events(prospect_id, created_at DESC)
  WHERE prospect_id IS NOT NULL;
CREATE INDEX idx_agent_events_failed ON agent_events(created_at DESC)
  WHERE event_type = 'job_failed';

-- Partitionnement par mois pour les grandes tables (optionnel, à activer si >10M rows)
-- ALTER TABLE agent_events PARTITION BY RANGE (created_at);
```

### Triggers de mise à jour updated_at

```sql
-- Fonction générique
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Application sur toutes les tables avec updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'updated_at'
      AND table_schema = 'prospection'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
      t
    );
  END LOOP;
END;
$$;
```

---

## Prisma Schema

### schema.prisma (extrait)

```prisma
// prisma/schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions", "fullTextSearch"]
  output          = "../node_modules/.prisma/client"
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [uuidOssp(map: "uuid-ossp"), pgvector(map: "vector")]
}

enum ProspectStatus {
  raw
  enriched
  scored
  contacted
  replied
  meeting_booked
  deal_in_progress
  won
  lost
  nurturing
  blacklisted
  unsubscribed

  @@map("prospect_status")
}

enum ChannelType {
  email
  linkedin
  phone
  sms
  postal

  @@map("channel_type")
}

enum SequenceStepStatus {
  pending
  sent
  delivered
  opened
  clicked
  replied
  bounced
  failed
  skipped

  @@map("sequence_step_status")
}

model Prospect {
  id                  String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt           DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  firstName           String?   @map("first_name") @db.VarChar(100)
  lastName            String?   @map("last_name") @db.VarChar(100)
  fullName            String?   @map("full_name") @db.VarChar(255)
  email               String?   @db.VarChar(255)
  emailVerified       Boolean   @default(false) @map("email_verified")
  phone               String?   @db.VarChar(50)
  linkedinUrl         String?   @map("linkedin_url") @db.VarChar(500)
  linkedinId          String?   @map("linkedin_id") @db.VarChar(100)

  companyName         String?   @map("company_name") @db.VarChar(255)
  companySiren        String?   @map("company_siren") @db.Char(9)
  companySize         String?   @map("company_size") @db.VarChar(50)
  companyRevenue      BigInt?   @map("company_revenue")
  companyWebsite      String?   @map("company_website") @db.VarChar(500)
  companyTechStack    Json?     @map("company_tech_stack")

  jobTitle            String?   @map("job_title") @db.VarChar(255)
  seniorityLevel      String?   @map("seniority_level") @db.VarChar(50)
  isDecisionMaker     Boolean?  @map("is_decision_maker")

  status              ProspectStatus @default(raw)
  enrichmentData      Json?     @map("enrichment_data")
  enrichedAt          DateTime? @map("enriched_at") @db.Timestamptz

  consentGiven        Boolean   @default(false) @map("consent_given")
  consentDate         DateTime? @map("consent_date") @db.Timestamptz
  rgpdErasedAt        DateTime? @map("rgpd_erased_at") @db.Timestamptz

  // Relations
  scores              ProspectScore[]
  generatedMessages   GeneratedMessage[]
  emailSends          EmailSend[]
  linkedinActions     LinkedinAction[]
  sequences           ProspectSequence[]
  replyClassifications ReplyClassification[]
  agentEvents         AgentEvent[]

  @@index([email])
  @@index([companySiren])
  @@index([status])
  @@map("prospects")
}

model ProspectScore {
  id              String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  prospectId      String    @map("prospect_id") @db.Uuid
  calculatedAt    DateTime  @default(now()) @map("calculated_at") @db.Timestamptz

  totalScore            Decimal @map("total_score") @db.Decimal(5, 2)
  firmographicScore     Decimal @default(0) @map("firmographic_score") @db.Decimal(5, 2)
  technographicScore    Decimal @default(0) @map("technographic_score") @db.Decimal(5, 2)
  behavioralScore       Decimal @default(0) @map("behavioral_score") @db.Decimal(5, 2)
  engagementScore       Decimal @default(0) @map("engagement_score") @db.Decimal(5, 2)
  intentScore           Decimal @default(0) @map("intent_score") @db.Decimal(5, 2)
  accessibilityScore    Decimal @default(0) @map("accessibility_score") @db.Decimal(5, 2)
  scoreBreakdown        Json    @default("{}") @map("score_breakdown")
  segment               String  @db.VarChar(20)
  isLatest              Boolean @default(true) @map("is_latest")
  modelVersion          String  @default("1.0") @map("model_version") @db.VarChar(50)

  prospect        Prospect  @relation(fields: [prospectId], references: [id], onDelete: Cascade)

  @@index([prospectId, isLatest])
  @@map("prospect_scores")
}

model AgentEvent {
  id              String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz

  agentName       String    @map("agent_name") @db.VarChar(100)
  eventType       String    @map("event_type") @db.VarChar(100)
  jobId           String?   @map("job_id") @db.VarChar(255)
  prospectId      String?   @map("prospect_id") @db.Uuid
  payload         Json      @default("{}")
  result          Json?
  errorMessage    String?   @map("error_message")
  durationMs      Int?      @map("duration_ms")
  langfuseTraceId String?   @map("langfuse_trace_id") @db.VarChar(255)

  prospect        Prospect? @relation(fields: [prospectId], references: [id], onDelete: SetNull)

  @@index([agentName, createdAt(sort: Desc)])
  @@index([prospectId, createdAt(sort: Desc)])
  @@map("agent_events")
}
```

---

## Stratégie de Migration

### Workflow Prisma

```bash
# Développement local : créer une migration
npx prisma migrate dev --name add_prospect_embedding

# Production : appliquer les migrations existantes
npx prisma migrate deploy

# Vérifier le statut
npx prisma migrate status

# En cas de schema drift (divergence)
npx prisma migrate resolve --rolled-back <migration_name>
```

### Migration script de déploiement

```typescript
// scripts/run-migrations.ts
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

async function runMigrations() {
  console.log('Running database migrations...');

  try {
    // Appliquer les migrations
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: process.env,
    });

    // Vérifier la connexion
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();

    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
```

### Règles de migration sûre

```markdown
1. JAMAIS de DROP COLUMN/TABLE en production sans migration en 2 étapes
   - Étape 1: Déployer le code qui n'utilise plus la colonne
   - Étape 2: Migration DROP COLUMN
2. Toujours utiliser des DEFAULT pour les nouvelles colonnes NOT NULL
3. Tester les migrations sur une copie de la BDD prod avant production
4. Les migrations sont jouées dans l'ordre lexicographique (timestamp prefix)
5. Jamais modifier une migration déjà appliquée en production
```

---

## Redis 7.4.3

### Configuration complète

```conf
# /infrastructure/redis/redis.conf

# ─── Réseau ──────────────────────────────────────────────────────────────
bind 0.0.0.0
port 6379
tcp-backlog 511
timeout 300
tcp-keepalive 60
protected-mode yes

# ─── Authentification ────────────────────────────────────────────────────
requirepass REDIS_PASSWORD_PLACEHOLDER

# ─── Mémoire ─────────────────────────────────────────────────────────────
maxmemory 1gb
maxmemory-policy noeviction
# noeviction : retourne une erreur si la mémoire est pleine
# Préféré pour BullMQ car on ne veut pas perdre de jobs
maxmemory-samples 5

# ─── Persistance RDB ─────────────────────────────────────────────────────
save 3600 1      # Snapshot après 3600s si 1 key changée
save 300 100     # Snapshot après 300s si 100 keys changées
save 60 10000    # Snapshot après 60s si 10000 keys changées
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /data

# ─── Persistance AOF ─────────────────────────────────────────────────────
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec   # Compromis performance/durabilité
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
aof-rewrite-incremental-fsync yes

# ─── Logging ─────────────────────────────────────────────────────────────
loglevel notice
logfile ""     # stdout, capturé par Docker

# ─── Performance ─────────────────────────────────────────────────────────
hz 10
dynamic-hz yes
aof-use-rdb-preamble yes
lazyfree-lazy-eviction no
lazyfree-lazy-expire no
lazyfree-lazy-server-del no

# ─── ACLs ─────────────────────────────────────────────────────────────────
# Désactiver l'accès default, créer des rôles spécifiques
aclfile /etc/redis/acl.conf
```

### ACL Redis

```conf
# /infrastructure/redis/acl.conf

# Utilisateur admin (pour backups, monitoring)
user admin on >ADMIN_PASSWORD_PLACEHOLDER ~* &* +@all

# Utilisateur app (NestJS + BullMQ)
user app on >APP_PASSWORD_PLACEHOLDER \
  ~bull:* \
  ~cache:* \
  ~session:* \
  &* \
  +@read +@write +@string +@hash +@list +@set +@sortedset \
  +@pubsub +@scripting \
  +del +expire +ttl +pttl +persist \
  -@admin -@dangerous

# Désactiver le user default
user default off
```

### Redis Service NestJS

```typescript
// src/shared/redis/redis.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit() {
    this.client = createClient({
      socket: {
        host: this.configService.get<string>('redis.host'),
        port: this.configService.get<number>('redis.port'),
        tls: this.configService.get<boolean>('redis.tls'),
        reconnectStrategy: (retries) => Math.min(retries * 100, 5000),
      },
      password: this.configService.get<string>('redis.password'),
      username: this.configService.get<string>('redis.username', 'app'),
    }) as RedisClientType;

    this.client.on('error', (err) =>
      this.logger.error({ err }, 'Redis client error'),
    );
    this.client.on('reconnecting', () =>
      this.logger.warn('Redis reconnecting...'),
    );

    await this.client.connect();
    this.logger.info('Redis connected');
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  getClient(): RedisClientType {
    return this.client;
  }

  // Cache helpers
  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.setEx(key, ttlSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  // Distributed lock (pour éviter les doublons)
  async acquireLock(
    resource: string,
    ttlMs: number,
  ): Promise<string | null> {
    const token = randomUUID();
    const key = `lock:${resource}`;
    const result = await this.client.set(key, token, {
      NX: true,
      PX: ttlMs,
    });
    return result === 'OK' ? token : null;
  }

  async releaseLock(resource: string, token: string): Promise<boolean> {
    const key = `lock:${resource}`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.client.eval(script, {
      keys: [key],
      arguments: [token],
    });
    return result === 1;
  }
}

function randomUUID(): string {
  return require('crypto').randomUUID();
}
```

---

## pgvector — Usage futur

```sql
-- Installation (déjà dans init.sql)
CREATE EXTENSION IF NOT EXISTS vector;

-- Exemple de recherche de prospects similaires (futur)
-- Trouver les 10 prospects les plus similaires à un prospect donné
SELECT
  p.id,
  p.full_name,
  p.company_name,
  1 - (p.embedding <=> query.embedding) AS similarity
FROM prospects p,
  (SELECT embedding FROM prospects WHERE id = $1) AS query
WHERE p.id != $1
  AND p.embedding IS NOT NULL
ORDER BY p.embedding <=> query.embedding
LIMIT 10;

-- Mise à jour de l'embedding (après génération par l'API d'embedding)
UPDATE prospects
SET embedding = $1::vector
WHERE id = $2;
```
