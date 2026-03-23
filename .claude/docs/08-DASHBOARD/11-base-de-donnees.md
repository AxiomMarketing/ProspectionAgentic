# Base de données — Dashboard Axiom

## Vue d'ensemble

Le dashboard lit et écrit dans la même base PostgreSQL 16 que le backend NestJS. Les tables spécifiques au dashboard s'ajoutent aux tables métier existantes (`prospects`, `tenders`, `deals`, etc.). Toutes les tables utilisent **CUID2** comme clé primaire (via `gen_cuid2()` ou généré côté application).

Extension requise : `pg_cron` (pour le rafraîchissement des vues matérialisées)

---

## Tables

---

### agent_events

Table centrale du système — stocke TOUS les événements émis par les agents. C'est la colonne vertébrale de l'observabilité du système.

**Stratégie** : partitionnée par mois (RANGE sur `created_at`) pour la performance et la rétention.

```sql
-- Table mère partitionnée
CREATE TABLE agent_events (
  id            TEXT        NOT NULL,
  agent_id      TEXT        NOT NULL,
  agent_name    TEXT        NOT NULL,
  agent_type    TEXT        NOT NULL,
  event_type    TEXT        NOT NULL,
  severity      TEXT        NOT NULL DEFAULT 'info'
                            CHECK (severity IN ('debug', 'info', 'warning', 'error')),
  message       TEXT        NOT NULL,
  payload       JSONB,
  duration_ms   INTEGER,
  trace_id      TEXT,       -- distributed tracing
  span_id       TEXT,
  parent_span_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Partitions mensuelles (créées à l'avance ou dynamiquement)
CREATE TABLE agent_events_2025_10
  PARTITION OF agent_events
  FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

CREATE TABLE agent_events_2025_11
  PARTITION OF agent_events
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE agent_events_2025_12
  PARTITION OF agent_events
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- Partition par défaut pour les données hors range (sécurité)
CREATE TABLE agent_events_default
  PARTITION OF agent_events DEFAULT;

-- Clé primaire (doit inclure la clé de partition)
ALTER TABLE agent_events ADD CONSTRAINT agent_events_pkey
  PRIMARY KEY (id, created_at);

-- Index sur chaque partition (hérités automatiquement)
-- BRIN sur created_at : très efficace pour données chronologiques
CREATE INDEX agent_events_created_at_brin
  ON agent_events USING BRIN (created_at)
  WITH (pages_per_range = 32);

-- Index B-tree pour les filtres fréquents
CREATE INDEX agent_events_agent_id_created_at
  ON agent_events (agent_id, created_at DESC);

CREATE INDEX agent_events_event_type_created_at
  ON agent_events (event_type, created_at DESC);

CREATE INDEX agent_events_severity_created_at
  ON agent_events (severity, created_at DESC)
  WHERE severity IN ('warning', 'error');  -- index partiel

-- GIN sur payload pour les queries JSONB
CREATE INDEX agent_events_payload_gin
  ON agent_events USING GIN (payload jsonb_path_ops);

-- Index full-text sur message
CREATE INDEX agent_events_message_fts
  ON agent_events USING GIN (to_tsvector('french', message));

-- Commentaires
COMMENT ON TABLE agent_events IS
  'Event sourcing central — tous les événements émis par les agents IA';
COMMENT ON COLUMN agent_events.trace_id IS
  'ID de trace pour le distributed tracing (OpenTelemetry)';
COMMENT ON COLUMN agent_events.payload IS
  'Données spécifiques au type d''événement, schema libre';
```

---

### agent_heartbeats

Statut périodique de chaque agent, émis toutes les 30 secondes. Permet de détecter les agents morts.

```sql
CREATE TABLE agent_heartbeats (
  id              TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  agent_id        TEXT        NOT NULL,
  agent_name      TEXT        NOT NULL,
  agent_type      TEXT        NOT NULL,
  status          TEXT        NOT NULL
                              CHECK (status IN ('active', 'idle', 'error', 'stopped')),
  current_task    TEXT,
  memory_mb       INTEGER,
  cpu_percent     NUMERIC(5, 2),
  events_total    INTEGER     NOT NULL DEFAULT 0,
  errors_total    INTEGER     NOT NULL DEFAULT 0,
  uptime_seconds  INTEGER     NOT NULL DEFAULT 0,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Index pour la vue "dernier heartbeat par agent"
CREATE INDEX agent_heartbeats_agent_id_created_at
  ON agent_heartbeats (agent_id, created_at DESC);

-- BRIN pour les scans temporels
CREATE INDEX agent_heartbeats_created_at_brin
  ON agent_heartbeats USING BRIN (created_at)
  WITH (pages_per_range = 64);

-- Index partiel pour les agents en erreur
CREATE INDEX agent_heartbeats_errors
  ON agent_heartbeats (agent_id, created_at DESC)
  WHERE status = 'error';

COMMENT ON TABLE agent_heartbeats IS
  'Statut périodique des agents — émis toutes les 30 secondes par chaque agent';
COMMENT ON COLUMN agent_heartbeats.current_task IS
  'Description courte de la tâche en cours, null si idle';
```

---

### agent_messages

Journal des communications inter-agents. Permet de tracer les workflows distribués.

```sql
CREATE TABLE agent_messages (
  id              TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  from_agent_id   TEXT        NOT NULL,
  from_agent_name TEXT        NOT NULL,
  to_agent_id     TEXT        NOT NULL,
  to_agent_name   TEXT        NOT NULL,
  message_type    TEXT        NOT NULL,  -- 'command', 'response', 'event', 'query'
  subject         TEXT        NOT NULL,
  payload         JSONB,
  correlation_id  TEXT,        -- lie request/response
  reply_to_id     TEXT         REFERENCES agent_messages(id),
  status          TEXT        NOT NULL DEFAULT 'sent'
                              CHECK (status IN ('sent', 'received', 'processed', 'failed')),
  latency_ms      INTEGER,     -- rempli quand status = 'processed'
  error_message   TEXT,        -- rempli si status = 'failed'
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at     TIMESTAMPTZ,
  processed_at    TIMESTAMPTZ,
  PRIMARY KEY (id)
);

-- Index pour la vue graphe (edges avec poids)
CREATE INDEX agent_messages_from_to_sent_at
  ON agent_messages (from_agent_id, to_agent_id, sent_at DESC);

CREATE INDEX agent_messages_correlation_id
  ON agent_messages (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX agent_messages_sent_at_brin
  ON agent_messages USING BRIN (sent_at)
  WITH (pages_per_range = 64);

-- Index partiel pour les messages en échec
CREATE INDEX agent_messages_failed
  ON agent_messages (sent_at DESC)
  WHERE status = 'failed';

COMMENT ON TABLE agent_messages IS
  'Communication inter-agents — log de tous les messages échangés';
COMMENT ON COLUMN agent_messages.correlation_id IS
  'Identifiant de corrélation pour lier une requête à sa réponse';
```

---

### action_items

Todo list de Jonathan — actions générées par les agents ou créées manuellement.

```sql
CREATE TABLE action_items (
  id              TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  type            TEXT        NOT NULL
                              CHECK (type IN (
                                'follow_up_email', 'call', 'demo', 'send_proposal',
                                'linkedin_connect', 'review_tender', 'update_deal', 'manual'
                              )),
  title           TEXT        NOT NULL,
  description     TEXT,
  priority        TEXT        NOT NULL DEFAULT 'medium'
                              CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'completed', 'cancelled', 'overdue')),
  due_date        DATE,
  prospect_id     TEXT        REFERENCES prospects(id) ON DELETE SET NULL,
  tender_id       TEXT        REFERENCES tenders(id) ON DELETE SET NULL,
  deal_id         TEXT        REFERENCES deals(id) ON DELETE SET NULL,
  agent_event_id  TEXT,       -- event agent qui a généré cette action
  generated_by    TEXT        NOT NULL DEFAULT 'system'
                              CHECK (generated_by IN ('system', 'jonathan')),
  completed_at    TIMESTAMPTZ,
  outcome_type    TEXT        CHECK (outcome_type IN ('success', 'partial', 'failed')),
  completion_note TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Index pour la liste des actions en attente (vue principale)
CREATE INDEX action_items_status_priority_due_date
  ON action_items (status, priority DESC, due_date ASC NULLS LAST)
  WHERE status = 'pending';

-- Index pour les actions par prospect
CREATE INDEX action_items_prospect_id_status
  ON action_items (prospect_id, status)
  WHERE prospect_id IS NOT NULL;

-- Index pour détecter les actions en retard
CREATE INDEX action_items_overdue
  ON action_items (due_date ASC)
  WHERE status = 'pending' AND due_date IS NOT NULL;

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER action_items_updated_at
  BEFORE UPDATE ON action_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: marquer automatiquement les actions expirées
CREATE OR REPLACE FUNCTION mark_overdue_actions()
RETURNS void AS $$
BEGIN
  UPDATE action_items
  SET status = 'overdue', updated_at = NOW()
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE action_items IS
  'Todo list de Jonathan — actions générées par les agents ou créées manuellement';
```

---

### prospect_timeline

Historique chronologique de toutes les interactions avec un prospect.

```sql
CREATE TABLE prospect_timeline (
  id              TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  prospect_id     TEXT        NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  entry_type      TEXT        NOT NULL
                              CHECK (entry_type IN (
                                'agent_event', 'email_sent', 'email_received',
                                'deal_created', 'deal_updated', 'note',
                                'tender_linked', 'score_changed', 'contact_added',
                                'enrichment', 'manual'
                              )),
  title           TEXT        NOT NULL,
  description     TEXT,
  metadata        JSONB,       -- données spécifiques au type
  author          TEXT        NOT NULL DEFAULT 'system'
                              CHECK (author IN ('system', 'jonathan')),
  source_id       TEXT,        -- ID de l'entité source (event, deal, etc.)
  source_type     TEXT,        -- type de l'entité source
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Index principal pour la timeline d'un prospect (ORDER BY occurred_at)
CREATE INDEX prospect_timeline_prospect_id_occurred_at
  ON prospect_timeline (prospect_id, occurred_at DESC);

-- Index BRIN pour les scans globaux temporels
CREATE INDEX prospect_timeline_occurred_at_brin
  ON prospect_timeline USING BRIN (occurred_at)
  WITH (pages_per_range = 32);

-- Index pour filtrer par type
CREATE INDEX prospect_timeline_prospect_id_entry_type
  ON prospect_timeline (prospect_id, entry_type, occurred_at DESC);

COMMENT ON TABLE prospect_timeline IS
  'Historique chronologique de toutes les interactions avec chaque prospect';
COMMENT ON COLUMN prospect_timeline.source_id IS
  'ID polymorphique de l''entité à l''origine de cet événement de timeline';
```

---

### dashboard_preferences

Préférences de l'utilisateur (Jonathan) : filtres sauvegardés, layout du dashboard, colonnes affichées.

```sql
CREATE TABLE dashboard_preferences (
  id              TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  user_id         TEXT        NOT NULL,  -- pour le multi-utilisateur futur
  preference_key  TEXT        NOT NULL,
  -- Exemples de clés:
  -- 'prospects_table_columns'
  -- 'prospects_table_filters'
  -- 'dashboard_layout'
  -- 'kanban_collapsed_stages'
  -- 'events_log_filters'
  -- 'graph_layout'
  value           JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (user_id, preference_key)
);

CREATE INDEX dashboard_preferences_user_id
  ON dashboard_preferences (user_id);

CREATE TRIGGER dashboard_preferences_updated_at
  BEFORE UPDATE ON dashboard_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE dashboard_preferences IS
  'Préférences UI de l''utilisateur — filtres, layout, colonnes affichées';
```

---

## Requêtes SQL clés

### Vue Dashboard — Métriques du jour

```sql
-- Métriques agents du jour
SELECT
  COUNT(*)                                           AS total_events,
  COUNT(*) FILTER (WHERE severity = 'error')         AS error_count,
  AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS avg_response_ms,
  COUNT(DISTINCT agent_id)                           AS unique_agents
FROM agent_events
WHERE created_at >= CURRENT_DATE AT TIME ZONE 'UTC'
  AND created_at < (CURRENT_DATE + INTERVAL '1 day') AT TIME ZONE 'UTC';

-- Dernier statut de chaque agent (latest heartbeat per agent)
SELECT DISTINCT ON (agent_id)
  agent_id,
  agent_name,
  agent_type,
  status,
  current_task,
  memory_mb,
  cpu_percent,
  uptime_seconds,
  created_at AS last_heartbeat
FROM agent_heartbeats
ORDER BY agent_id, created_at DESC;

-- Agents silencieux depuis plus de 2 minutes (probablement morts)
SELECT
  agent_id,
  agent_name,
  MAX(created_at) AS last_seen,
  EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) AS silence_seconds
FROM agent_heartbeats
GROUP BY agent_id, agent_name
HAVING MAX(created_at) < NOW() - INTERVAL '2 minutes';
```

### Vue Prospects — Liste filtrée et triée

```sql
-- Liste des prospects actifs, triés par score effectif DESC
SELECT
  p.id,
  p.name,
  p.domain,
  p.sector,
  p.size,
  p.score,
  p.score_override,
  COALESCE(p.score_override, p.score) AS effective_score,
  p.status,
  p.revenue,
  p.employee_count,
  p.city,
  p.country,
  p.last_contacted_at,
  p.created_at,
  p.updated_at,
  COUNT(DISTINCT c.id)  AS contact_count,
  COUNT(DISTINCT t.id)  AS tender_count,
  COUNT(DISTINCT d.id)  AS deal_count,
  COUNT(DISTINCT ae.id) AS event_count
FROM prospects p
LEFT JOIN contacts c ON c.prospect_id = p.id
LEFT JOIN tenders t ON t.prospect_id = p.id
LEFT JOIN deals d ON d.prospect_id = p.id AND d.stage NOT IN ('closed_won', 'closed_lost')
LEFT JOIN prospect_timeline ae ON ae.prospect_id = p.id
  AND ae.entry_type = 'agent_event'
  AND ae.occurred_at >= NOW() - INTERVAL '30 days'
WHERE p.status = 'active'
  AND COALESCE(p.score_override, p.score) >= 70  -- filtre exemple
GROUP BY p.id
ORDER BY effective_score DESC, p.updated_at DESC
LIMIT 20 OFFSET 0;

-- Full-text search sur les prospects
SELECT p.*, ts_rank(
  to_tsvector('french', p.name || ' ' || COALESCE(p.domain, '') || ' ' || COALESCE(p.description, '')),
  plainto_tsquery('french', 'acme corp')
) AS rank
FROM prospects p
WHERE to_tsvector('french', p.name || ' ' || COALESCE(p.domain, '') || ' ' || COALESCE(p.description, ''))
  @@ plainto_tsquery('french', 'acme corp')
ORDER BY rank DESC
LIMIT 20;
```

### Vue Agents — Events récents avec pagination curseur

```sql
-- Récupérer les 50 derniers events après un curseur donné
-- (cursor = ID + created_at du dernier event recu)
SELECT
  ae.id,
  ae.agent_id,
  ae.agent_name,
  ae.event_type,
  ae.severity,
  ae.message,
  ae.payload,
  ae.duration_ms,
  ae.created_at
FROM agent_events ae
WHERE ae.agent_id = 'agent-crawler-01'
  AND (ae.created_at, ae.id) < (
    SELECT created_at, id FROM agent_events WHERE id = $cursor_id
  )
ORDER BY ae.created_at DESC, ae.id DESC
LIMIT 50;

-- Statistiques d'erreur par agent sur les 24 dernières heures
SELECT
  agent_id,
  agent_name,
  COUNT(*) AS total_events,
  COUNT(*) FILTER (WHERE severity = 'error') AS error_count,
  ROUND(
    COUNT(*) FILTER (WHERE severity = 'error')::NUMERIC / NULLIF(COUNT(*), 0) * 100,
    2
  ) AS error_rate_pct,
  AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS avg_duration_ms,
  MAX(created_at) AS last_event_at
FROM agent_events
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY agent_id, agent_name
ORDER BY error_count DESC;
```

### Vue Deals — Pipeline Kanban

```sql
-- Tous les deals actifs groupés par stage, avec valeur totale
SELECT
  d.stage,
  COUNT(*) AS deal_count,
  SUM(d.value) AS total_value,
  SUM(d.value * d.probability / 100.0) AS weighted_value,
  JSON_AGG(
    JSON_BUILD_OBJECT(
      'id', d.id,
      'title', d.title,
      'value', d.value,
      'probability', d.probability,
      'prospectName', p.name,
      'expectedCloseDate', d.expected_close_date,
      'updatedAt', d.updated_at
    ) ORDER BY d.updated_at DESC
  ) AS deals
FROM deals d
JOIN prospects p ON p.id = d.prospect_id
WHERE d.stage NOT IN ('closed_won', 'closed_lost')
GROUP BY d.stage
ORDER BY
  CASE d.stage
    WHEN 'discovery'     THEN 1
    WHEN 'qualification' THEN 2
    WHEN 'proposal'      THEN 3
    WHEN 'negotiation'   THEN 4
    ELSE 5
  END;
```

### Vue Actions — Todo list avec urgence

```sql
-- Actions en attente, triées par urgence
SELECT
  a.id,
  a.type,
  a.title,
  a.description,
  a.priority,
  a.status,
  a.due_date,
  a.generated_by,
  p.name AS prospect_name,
  p.id AS prospect_id,
  CASE
    WHEN a.due_date < CURRENT_DATE THEN 'overdue'
    WHEN a.due_date = CURRENT_DATE THEN 'due_today'
    WHEN a.due_date = CURRENT_DATE + 1 THEN 'due_tomorrow'
    ELSE 'upcoming'
  END AS urgency,
  a.created_at
FROM action_items a
LEFT JOIN prospects p ON p.id = a.prospect_id
WHERE a.status = 'pending'
ORDER BY
  CASE a.priority
    WHEN 'urgent' THEN 1
    WHEN 'high'   THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low'    THEN 4
  END,
  a.due_date ASC NULLS LAST,
  a.created_at DESC;
```

### Vue Graphe Agents — Edges avec poids

```sql
-- Topologie du graphe pour les dernières 24h
SELECT
  from_agent_id,
  from_agent_name,
  to_agent_id,
  to_agent_name,
  message_type,
  COUNT(*) AS message_count,
  AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS avg_latency_ms,
  MAX(sent_at) AS last_message_at,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
FROM agent_messages
WHERE sent_at >= NOW() - INTERVAL '24 hours'
GROUP BY from_agent_id, from_agent_name, to_agent_id, to_agent_name, message_type
ORDER BY message_count DESC;
```

---

## Vues matérialisées

### mv_daily_metrics

Agrégats quotidiens pour les graphiques historiques (Recharts).

```sql
CREATE MATERIALIZED VIEW mv_daily_metrics AS
SELECT
  DATE_TRUNC('day', ae.created_at) AS metric_date,

  -- Agent metrics
  COUNT(ae.id)                                          AS total_events,
  COUNT(ae.id) FILTER (WHERE ae.severity = 'error')    AS error_events,
  COUNT(DISTINCT ae.agent_id)                          AS active_agents,
  AVG(ae.duration_ms) FILTER (WHERE ae.duration_ms IS NOT NULL) AS avg_duration_ms,

  -- Prospect metrics (snapshot du jour)
  (SELECT COUNT(*) FROM prospects WHERE status = 'active'
   AND DATE_TRUNC('day', created_at) <= DATE_TRUNC('day', ae.created_at))
   AS total_active_prospects,
  (SELECT COUNT(*) FROM prospects
   WHERE DATE_TRUNC('day', created_at) = DATE_TRUNC('day', ae.created_at))
   AS new_prospects,

  -- Deal metrics
  (SELECT SUM(value) FROM deals
   WHERE stage NOT IN ('closed_won', 'closed_lost'))   AS pipeline_value,
  (SELECT COUNT(*) FROM deals
   WHERE stage = 'closed_won'
   AND DATE_TRUNC('day', updated_at) = DATE_TRUNC('day', ae.created_at)) AS deals_won,

  -- Tender metrics
  (SELECT COUNT(*) FROM tenders
   WHERE DATE_TRUNC('day', created_at) = DATE_TRUNC('day', ae.created_at)) AS tenders_detected

FROM agent_events ae
GROUP BY DATE_TRUNC('day', ae.created_at)
ORDER BY metric_date DESC
WITH DATA;

-- Index sur la date
CREATE UNIQUE INDEX mv_daily_metrics_date
  ON mv_daily_metrics (metric_date DESC);

COMMENT ON MATERIALIZED VIEW mv_daily_metrics IS
  'Métriques agrégées par jour — rafraîchie toutes les heures via pg_cron';
```

### mv_agent_graph

Snapshot de la topologie agent pour React Flow (précomputé).

```sql
CREATE MATERIALIZED VIEW mv_agent_graph AS
WITH latest_heartbeats AS (
  SELECT DISTINCT ON (agent_id)
    agent_id,
    agent_name,
    agent_type,
    status,
    current_task,
    uptime_seconds,
    created_at AS last_heartbeat
  FROM agent_heartbeats
  ORDER BY agent_id, created_at DESC
),
message_stats AS (
  SELECT
    from_agent_id,
    to_agent_id,
    message_type,
    COUNT(*) AS message_count,
    AVG(latency_ms) AS avg_latency_ms,
    MAX(sent_at) AS last_message_at,
    COUNT(*) FILTER (WHERE sent_at >= NOW() - INTERVAL '1 minute') AS recent_messages
  FROM agent_messages
  WHERE sent_at >= NOW() - INTERVAL '24 hours'
  GROUP BY from_agent_id, to_agent_id, message_type
),
event_stats AS (
  SELECT
    agent_id,
    COUNT(*) AS events_last_hour,
    COUNT(*) FILTER (WHERE severity = 'error') AS errors_last_hour
  FROM agent_events
  WHERE created_at >= NOW() - INTERVAL '1 hour'
  GROUP BY agent_id
)
SELECT
  lh.agent_id,
  lh.agent_name,
  lh.agent_type,
  lh.status,
  lh.current_task,
  lh.last_heartbeat,
  COALESCE(es.events_last_hour, 0) AS events_last_hour,
  CASE
    WHEN COALESCE(es.events_last_hour, 0) = 0 THEN 0
    ELSE ROUND(COALESCE(es.errors_last_hour, 0)::NUMERIC / es.events_last_hour, 4)
  END AS error_rate,
  ms.to_agent_id AS edge_target,
  ms.message_type AS edge_type,
  ms.message_count,
  ms.avg_latency_ms,
  ms.last_message_at,
  ms.recent_messages > 0 AS edge_animated
FROM latest_heartbeats lh
LEFT JOIN event_stats es ON es.agent_id = lh.agent_id
LEFT JOIN message_stats ms ON ms.from_agent_id = lh.agent_id
WITH DATA;

CREATE INDEX mv_agent_graph_agent_id ON mv_agent_graph (agent_id);
CREATE INDEX mv_agent_graph_status ON mv_agent_graph (status);

COMMENT ON MATERIALIZED VIEW mv_agent_graph IS
  'Topologie du graphe agent — rafraîchie toutes les 30 secondes via pg_cron';
```

### mv_pipeline_funnel

Funnel du pipeline commercial pour le graphique Recharts.

```sql
CREATE MATERIALIZED VIEW mv_pipeline_funnel AS
SELECT
  stage,
  COUNT(*) AS deal_count,
  SUM(value) AS total_value,
  SUM(value * probability / 100.0) AS weighted_value,
  AVG(probability) AS avg_probability,
  AVG(
    EXTRACT(EPOCH FROM (NOW() - stage_changed_at)) / 86400
  ) AS avg_days_in_stage,
  COUNT(*) FILTER (
    WHERE stage_changed_at < NOW() - INTERVAL '30 days'
  ) AS stale_deals
FROM deals
WHERE stage NOT IN ('closed_won', 'closed_lost')
GROUP BY stage
WITH DATA;

CREATE UNIQUE INDEX mv_pipeline_funnel_stage ON mv_pipeline_funnel (stage);

COMMENT ON MATERIALIZED VIEW mv_pipeline_funnel IS
  'Funnel du pipeline — rafraîchie toutes les 5 minutes via pg_cron';
```

---

## Stratégie de rafraîchissement des vues matérialisées

### Configuration pg_cron

```sql
-- Activer pg_cron (dans postgresql.conf)
-- shared_preload_libraries = 'pg_cron'
-- cron.database_name = 'axiom_db'

-- mv_daily_metrics : toutes les heures (données historiques)
SELECT cron.schedule(
  'refresh-daily-metrics',
  '0 * * * *',  -- chaque heure pile
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_metrics$$
);

-- mv_agent_graph : toutes les 30 secondes (topologie temps réel)
SELECT cron.schedule(
  'refresh-agent-graph',
  '*/1 * * * *',  -- pg_cron minimum = 1 minute; compenser avec un job NestJS pour les 30s
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_agent_graph$$
);

-- mv_pipeline_funnel : toutes les 5 minutes
SELECT cron.schedule(
  'refresh-pipeline-funnel',
  '*/5 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_pipeline_funnel$$
);

-- Marquer les actions en retard : une fois par jour à minuit
SELECT cron.schedule(
  'mark-overdue-actions',
  '0 0 * * *',
  $$SELECT mark_overdue_actions()$$
);

-- Créer les partitions du mois prochain : le 1er de chaque mois
SELECT cron.schedule(
  'create-next-partition',
  '0 0 1 * *',
  $$
  DO $$
  DECLARE
    next_month DATE := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
    partition_name TEXT := 'agent_events_' || TO_CHAR(next_month, 'YYYY_MM');
    from_date TEXT := TO_CHAR(next_month, 'YYYY-MM-DD');
    to_date TEXT := TO_CHAR(next_month + INTERVAL '1 month', 'YYYY-MM-DD');
  BEGIN
    EXECUTE FORMAT(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF agent_events FOR VALUES FROM (%L) TO (%L)',
      partition_name, from_date, to_date
    );
  END;
  $$
  $$
);
```

### Rafraîchissement NestJS pour mv_agent_graph (30s)

pg_cron ne supporte pas les intervalles inférieurs à 1 minute. Le backend NestJS prend en charge le rafraîchissement toutes les 30 secondes :

```typescript
// src/graph/graph-refresh.service.ts
@Injectable()
export class GraphRefreshService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.startRefreshLoop()
  }

  private startRefreshLoop() {
    setInterval(async () => {
      try {
        await this.prisma.$executeRaw`
          REFRESH MATERIALIZED VIEW CONCURRENTLY mv_agent_graph
        `
      } catch (err) {
        // Log mais ne pas crasher
        logger.warn('Failed to refresh mv_agent_graph', err)
      }
    }, 30_000)
  }
}
```

---

## Rétention et archivage

### Politique de rétention

| Table | Rétention active | Archivage | Suppression |
|---|---|---|---|
| agent_events | 3 mois | Partitions S3 (Parquet) | Après 6 mois |
| agent_heartbeats | 7 jours | Non | Automatique |
| agent_messages | 3 mois | Non (volume faible) | Automatique |
| action_items | Permanente (complétées archivées) | Non | Manuel uniquement |
| prospect_timeline | Permanente | Non | Avec le prospect |
| dashboard_preferences | Permanente | Non | Manuel |

### Procédure d'archivage et suppression

```sql
-- Archiver les ancienne partitions agent_events vers le cold storage
-- (à exécuter via script mensuel avant suppression)

-- 1. Exporter vers S3 via COPY (ou pg_dump de la partition)
-- COPY agent_events_2025_07 TO PROGRAM 'aws s3 cp - s3://axiom-archive/agent_events_2025_07.csv' CSV HEADER;

-- 2. Vérifier l'export
-- SELECT COUNT(*) FROM agent_events WHERE created_at >= '2025-07-01' AND created_at < '2025-08-01';

-- 3. Detacher et supprimer la partition
ALTER TABLE agent_events DETACH PARTITION agent_events_2025_07;
DROP TABLE agent_events_2025_07;

-- Nettoyage agent_heartbeats (garder 7 jours)
DELETE FROM agent_heartbeats
WHERE created_at < NOW() - INTERVAL '7 days';

-- Nettoyage agent_messages (garder 3 mois)
DELETE FROM agent_messages
WHERE sent_at < NOW() - INTERVAL '3 months';

-- Archiver les action_items complétées depuis plus de 6 mois
-- (les conserver en base pour l'historique, mais les marquer 'archived')
UPDATE action_items
SET status = 'archived'
WHERE status = 'completed'
  AND completed_at < NOW() - INTERVAL '6 months';
```

### Job pg_cron de nettoyage automatique

```sql
-- Nettoyage quotidien agent_heartbeats
SELECT cron.schedule(
  'cleanup-heartbeats',
  '30 2 * * *',  -- 2h30 chaque nuit
  $$DELETE FROM agent_heartbeats WHERE created_at < NOW() - INTERVAL '7 days'$$
);

-- Nettoyage mensuel agent_messages
SELECT cron.schedule(
  'cleanup-messages',
  '0 3 1 * *',   -- 3h le 1er de chaque mois
  $$DELETE FROM agent_messages WHERE sent_at < NOW() - INTERVAL '3 months'$$
);
```

---

## Optimisation des performances

### Index et stratégies

```sql
-- VACUUM et ANALYZE réguliers sur les tables volumineuses
-- (pg_autovacuum est activé, mais forcer sur les grosses tables)
ALTER TABLE agent_events SET (
  autovacuum_vacuum_scale_factor = 0.01,   -- vacuum à 1% de changement (vs 20% défaut)
  autovacuum_analyze_scale_factor = 0.005, -- analyze à 0.5%
  autovacuum_vacuum_cost_delay = 2         -- ms — ralentir le vacuum pour moins impacter les queries
);

-- Index composite pour la query la plus fréquente du dashboard
-- (events des dernières 24h, par agent, par sévérité)
CREATE INDEX agent_events_dashboard_query
  ON agent_events (created_at DESC, agent_id, severity)
  WHERE created_at >= NOW() - INTERVAL '24 hours';
-- Note: cet index est partiel, doit être recréé périodiquement
-- car la condition NOW() - INTERVAL '24 hours' ne fait pas d'index partiel statique
-- Solution: utiliser un index normal + filtre dans la query

-- Statistiques étendues pour les colonnes corrélées
CREATE STATISTICS agent_events_corr (dependencies)
  ON agent_id, severity, event_type
  FROM agent_events;

-- Paramètres PostgreSQL recommandés pour ce workload
-- (dans postgresql.conf)
-- shared_buffers = 256MB          -- 25% de RAM si 1GB
-- effective_cache_size = 768MB    -- 75% de RAM
-- maintenance_work_mem = 64MB     -- pour CREATE INDEX, VACUUM
-- work_mem = 16MB                 -- par connexion
-- random_page_cost = 1.1          -- SSD (vs 4.0 défaut pour HDD)
-- effective_io_concurrency = 200  -- SSD
-- max_wal_size = 1GB
-- checkpoint_completion_target = 0.9
```

### Connection pooling (PgBouncer)

```ini
; pgbouncer.ini
[databases]
axiom_db = host=localhost port=5432 dbname=axiom_db

[pgbouncer]
listen_port = 6432
pool_mode = transaction        ; mode transaction pour NestJS
max_client_conn = 200
default_pool_size = 20
reserve_pool_size = 5
reserve_pool_timeout = 5
server_idle_timeout = 600
log_connections = 0
log_disconnections = 0
```

### Explain Analyze — Query critique (agents dashboard)

```sql
-- Analyser la query principale du dashboard
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  agent_id,
  agent_name,
  COUNT(*) FILTER (WHERE severity = 'error') AS errors,
  COUNT(*) AS total,
  MAX(created_at) AS last_event
FROM agent_events
WHERE created_at >= NOW() - INTERVAL '1 hour'
GROUP BY agent_id, agent_name;

-- Résultat attendu avec partitionnement + BRIN :
-- Bitmap Heap Scan sur la partition du mois en cours uniquement
-- BRIN Index Scan sur created_at (très sélectif)
-- HashAggregate (rapide avec peu d'agents distincts)
-- Temps cible : < 50ms
```

---

## Schema complet — DDL final

```sql
-- Extensions requises
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- pour full-text search
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Fonction utilitaire (si pas de pgcrypto/cuid2)
CREATE OR REPLACE FUNCTION generate_cuid2()
RETURNS TEXT AS $$
  SELECT encode(gen_random_bytes(16), 'base64')
    -- Simplification; en production utiliser une lib CUID2 côté app
$$ LANGUAGE SQL;

-- Ordre de création (dépendances)
-- 1. agent_events (table partitionnée)
-- 2. agent_heartbeats
-- 3. agent_messages
-- 4. action_items (après prospects, tenders, deals)
-- 5. prospect_timeline (après prospects)
-- 6. dashboard_preferences
-- 7. Vues matérialisées (après toutes les tables)
-- 8. Jobs pg_cron (en dernier)
```

---

## Migration Prisma

```prisma
// schema.prisma — tables spécifiques dashboard

model AgentEvent {
  id           String   @id @default(cuid())
  agentId      String
  agentName    String
  agentType    String
  eventType    String
  severity     String   @default("info")
  message      String
  payload      Json?
  durationMs   Int?
  traceId      String?
  spanId       String?
  parentSpanId String?
  createdAt    DateTime @default(now())

  @@index([agentId, createdAt(sort: Desc)])
  @@index([eventType, createdAt(sort: Desc)])
  @@map("agent_events")
}

model AgentHeartbeat {
  id            String   @id @default(cuid())
  agentId       String
  agentName     String
  agentType     String
  status        String
  currentTask   String?
  memoryMb      Int?
  cpuPercent    Decimal? @db.Decimal(5, 2)
  eventsTotal   Int      @default(0)
  errorsTotal   Int      @default(0)
  uptimeSeconds Int      @default(0)
  metadata      Json?
  createdAt     DateTime @default(now())

  @@index([agentId, createdAt(sort: Desc)])
  @@map("agent_heartbeats")
}

model AgentMessage {
  id            String    @id @default(cuid())
  fromAgentId   String
  fromAgentName String
  toAgentId     String
  toAgentName   String
  messageType   String
  subject       String
  payload       Json?
  correlationId String?
  replyToId     String?
  replyTo       AgentMessage?  @relation("replies", fields: [replyToId], references: [id])
  replies       AgentMessage[] @relation("replies")
  status        String    @default("sent")
  latencyMs     Int?
  errorMessage  String?
  sentAt        DateTime  @default(now())
  receivedAt    DateTime?
  processedAt   DateTime?

  @@index([fromAgentId, toAgentId, sentAt(sort: Desc)])
  @@map("agent_messages")
}

model ActionItem {
  id             String    @id @default(cuid())
  type           String
  title          String
  description    String?
  priority       String    @default("medium")
  status         String    @default("pending")
  dueDate        DateTime? @db.Date
  prospectId     String?
  tenderId       String?
  dealId         String?
  agentEventId   String?
  generatedBy    String    @default("system")
  completedAt    DateTime?
  outcomeType    String?
  completionNote String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  prospect Prospect? @relation(fields: [prospectId], references: [id])

  @@index([status, priority, dueDate])
  @@map("action_items")
}

model ProspectTimeline {
  id          String   @id @default(cuid())
  prospectId  String
  entryType   String
  title       String
  description String?
  metadata    Json?
  author      String   @default("system")
  sourceId    String?
  sourceType  String?
  occurredAt  DateTime @default(now())
  createdAt   DateTime @default(now())

  prospect Prospect @relation(fields: [prospectId], references: [id], onDelete: Cascade)

  @@index([prospectId, occurredAt(sort: Desc)])
  @@map("prospect_timeline")
}

model DashboardPreference {
  id            String   @id @default(cuid())
  userId        String
  preferenceKey String
  value         Json
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([userId, preferenceKey])
  @@index([userId])
  @@map("dashboard_preferences")
}
```
