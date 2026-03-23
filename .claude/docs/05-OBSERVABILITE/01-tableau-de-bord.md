# Tableau de Bord — Observabilité du Système Multi-Agents

## Vue d'ensemble

Le tableau de bord d'observabilité est le centre de contrôle opérationnel du système de prospection multi-agents. Il agrège en temps réel l'état de 10 agents maîtres et ~40 sous-agents, leurs métriques de performance, les coûts d'inférence LLM, les flux de messages inter-agents et l'avancement du pipeline commercial.

### Pourquoi monitorer ?

| Risque sans monitoring | Impact |
|---|---|
| Agent bloqué silencieusement | Zéro lead traité pendant des heures |
| Dérive du coût Claude API | Budget épuisé avant fin de mois |
| Boucle de retry infinie | Accumulation de jobs BullMQ, saturation Redis |
| Dégradation de la qualité des emails | Taux de réponse s'effondre, réputation domaine compromise |
| Perte de messages inter-agents | Pipeline rompu, leads perdus |

### Principe de conception

- **Une seule URL** pour tout : dashboard Metabase en iframe + Bull Board + flux Pino
- **Hiérarchie de contexte** : global → par agent → par exécution → par trace Langfuse
- **Actionnable** : chaque panneau a un bouton "Drill-down" vers les logs ou la trace Langfuse correspondante
- **Temps réel pour l'opérationnel**, historique pour l'analyse

---

## Architecture du tableau de bord

```
┌─────────────────────────────────────────────────────────────┐
│                    Dashboard Principal                       │
│  URL: http://metabase:3030/dashboard/1                      │
├──────────────────────┬──────────────────────────────────────┤
│  Panel 1             │  Panel 2                             │
│  Agent Health        │  Performance Metrics                 │
│  Overview            │  P50/P95/P99 + Throughput            │
├──────────────────────┼──────────────────────────────────────┤
│  Panel 3             │  Panel 4                             │
│  Cost Tracking       │  Agent Communication Graph           │
│  $/agent/day/model   │  Network + Message Volume            │
├──────────────────────┴──────────────────────────────────────┤
│  Panel 5 — Pipeline Funnel                                  │
│  Leads → Enriched → Scored → Contacted → Replied → Closed  │
├─────────────────────────────────────────────────────────────┤
│  Panel 6 — Error Analysis                                   │
│  Types · Frequency · Failed Steps · Retry Patterns         │
├────────────────────────────┬────────────────────────────────┤
│  Real-Time Activity Feed   │  Agent Conversation Log        │
│  (Server-Sent Events)      │  (BullMQ Messages)             │
└────────────────────────────┴────────────────────────────────┘
```

---

## Panel 1 — Agent Health Overview

### Objectif
Connaître en un coup d'oeil l'état de santé de chaque agent : est-il actif, en erreur, au repos ? Quand a-t-il tourné pour la dernière fois ? Son taux d'erreur sur les dernières 24h est-il acceptable ?

### Contenu du panneau

| Colonne | Description | Source |
|---|---|---|
| Agent Name | Nom de l'agent maître | `agents.name` |
| Status | RUNNING / IDLE / ERROR / STOPPED | `agent_heartbeats.status` |
| Last Execution | Timestamp de la dernière fin d'exécution | `agent_executions.ended_at` |
| Executions (24h) | Nombre de cycles complets en 24h | `agent_executions` |
| Error Rate (24h) | % d'exécutions ayant au moins une erreur | calculé |
| Avg Duration | Durée moyenne d'un cycle (ms) | `agent_executions` |
| Tokens (24h) | Total tokens consommés en 24h | `llm_calls.total_tokens` |
| Health Score | 0–100, agrégation de toutes les métriques | calculé |

### Metabase SQL Query — Panel 1

```sql
WITH executions_24h AS (
  SELECT
    ae.agent_id,
    COUNT(*) AS total_executions,
    COUNT(*) FILTER (WHERE ae.status = 'failed') AS failed_executions,
    AVG(EXTRACT(EPOCH FROM (ae.ended_at - ae.started_at)) * 1000) AS avg_duration_ms,
    MAX(ae.ended_at) AS last_execution
  FROM agent_executions ae
  WHERE ae.started_at >= NOW() - INTERVAL '24 hours'
  GROUP BY ae.agent_id
),
tokens_24h AS (
  SELECT
    lc.agent_id,
    SUM(lc.total_tokens) AS tokens_consumed,
    SUM(lc.cost_usd) AS cost_usd
  FROM llm_calls lc
  WHERE lc.called_at >= NOW() - INTERVAL '24 hours'
  GROUP BY lc.agent_id
),
latest_heartbeat AS (
  SELECT DISTINCT ON (agent_id)
    agent_id,
    status,
    recorded_at
  FROM agent_heartbeats
  ORDER BY agent_id, recorded_at DESC
)
SELECT
  a.id AS agent_id,
  a.name AS agent_name,
  a.type AS agent_type,
  COALESCE(lh.status, 'STOPPED') AS status,
  lh.recorded_at AS last_heartbeat,
  COALESCE(e.total_executions, 0) AS executions_24h,
  COALESCE(e.failed_executions, 0) AS failed_executions_24h,
  CASE
    WHEN COALESCE(e.total_executions, 0) = 0 THEN NULL
    ELSE ROUND(e.failed_executions::NUMERIC / e.total_executions * 100, 2)
  END AS error_rate_pct,
  ROUND(COALESCE(e.avg_duration_ms, 0))::INT AS avg_duration_ms,
  e.last_execution,
  COALESCE(t.tokens_consumed, 0) AS tokens_24h,
  ROUND(COALESCE(t.cost_usd, 0)::NUMERIC, 4) AS cost_usd_24h,
  CASE
    WHEN COALESCE(lh.status, 'STOPPED') = 'ERROR' THEN 0
    WHEN COALESCE(lh.status, 'STOPPED') = 'STOPPED' THEN 20
    WHEN COALESCE(e.total_executions, 0) = 0 THEN 40
    ELSE GREATEST(0, 100 - COALESCE(
      e.failed_executions::NUMERIC / NULLIF(e.total_executions,0) * 100,
    0))
  END AS health_score
FROM agents a
LEFT JOIN latest_heartbeat lh ON lh.agent_id = a.id
LEFT JOIN executions_24h e ON e.agent_id = a.id
LEFT JOIN tokens_24h t ON t.agent_id = a.id
ORDER BY health_score ASC, a.name ASC;
```

### Schéma des tables requises

```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL,  -- 'master' | 'sub'
  parent_agent_id UUID REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE agent_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('RUNNING','IDLE','ERROR','STOPPED')),
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_heartbeats_agent_time ON agent_heartbeats(agent_id, recorded_at DESC);

CREATE TABLE agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  correlation_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('running','completed','failed','cancelled')),
  trigger_type VARCHAR(50),  -- 'cron' | 'manual' | 'event' | 'sub_agent_call'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  result_summary JSONB DEFAULT '{}',
  error_message TEXT
);
CREATE INDEX idx_executions_agent_time ON agent_executions(agent_id, started_at DESC);
CREATE INDEX idx_executions_correlation ON agent_executions(correlation_id);
```

---

## Panel 2 — Performance Metrics

### Objectif
Mesurer la vitesse et le débit du système : latences P50/P95/P99 des appels LLM et des jobs BullMQ, throughput de traitement des leads, consommation de tokens par opération.

### Métriques clés

| Métrique | Seuil WARNING | Seuil CRITICAL | Unité |
|---|---|---|---|
| LLM P50 latency | > 2 000 | > 5 000 | ms |
| LLM P95 latency | > 8 000 | > 15 000 | ms |
| LLM P99 latency | > 20 000 | > 30 000 | ms |
| Job queue wait time P95 | > 30 000 | > 120 000 | ms |
| Leads processed/hour | < 50 | < 10 | count |
| Tokens per lead | > 5 000 | > 10 000 | tokens |
| API error rate | > 2% | > 5% | % |

### Metabase SQL Query — Latences LLM

```sql
SELECT
  date_trunc('hour', lc.called_at) AS hour,
  lc.agent_id,
  a.name AS agent_name,
  lc.model AS model,
  COUNT(*) AS call_count,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY lc.latency_ms) AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY lc.latency_ms) AS p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY lc.latency_ms) AS p99_ms,
  AVG(lc.latency_ms) AS avg_ms,
  MAX(lc.latency_ms) AS max_ms,
  SUM(lc.prompt_tokens) AS total_prompt_tokens,
  SUM(lc.completion_tokens) AS total_completion_tokens,
  SUM(lc.total_tokens) AS total_tokens,
  ROUND(SUM(lc.cost_usd)::NUMERIC, 6) AS total_cost_usd
FROM llm_calls lc
JOIN agents a ON a.id = lc.agent_id
WHERE lc.called_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour, lc.agent_id, a.name, lc.model
ORDER BY hour DESC, total_cost_usd DESC;
```

### Metabase SQL Query — Throughput BullMQ

```sql
SELECT
  date_trunc('hour', jl.processed_at) AS hour,
  jl.queue_name,
  COUNT(*) FILTER (WHERE jl.status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE jl.status = 'failed') AS failed,
  COUNT(*) FILTER (WHERE jl.status = 'stalled') AS stalled,
  PERCENTILE_CONT(0.50) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (jl.processed_at - jl.queued_at)) * 1000
  ) AS wait_p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (jl.processed_at - jl.queued_at)) * 1000
  ) AS wait_p95_ms,
  PERCENTILE_CONT(0.50) WITHIN GROUP (
    ORDER BY jl.processing_duration_ms
  ) AS process_p50_ms
FROM job_logs jl
WHERE jl.processed_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour, jl.queue_name
ORDER BY hour DESC;
```

### Schéma — llm_calls

```sql
CREATE TABLE llm_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  execution_id UUID REFERENCES agent_executions(id),
  langfuse_trace_id VARCHAR(200),
  model VARCHAR(100) NOT NULL,  -- 'claude-haiku-3-5' | 'claude-sonnet-4-5' | etc.
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,
  latency_ms INT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success','error','timeout')),
  error_code VARCHAR(100),
  called_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_llm_calls_agent_time ON llm_calls(agent_id, called_at DESC);
CREATE INDEX idx_llm_calls_model ON llm_calls(model, called_at DESC);
```

---

## Panel 3 — Cost Tracking

### Objectif
Suivre les dépenses en temps réel, alerter avant dépassement de budget, identifier les agents les plus coûteux et optimiser l'allocation des modèles (Haiku vs Sonnet vs Opus).

### Structure du budget

```
Budget mensuel total : 500 USD
├── LeadScoutAgent    : 80 USD   (scraping + classification)
├── EnrichmentAgent   : 120 USD  (enrichissement données)
├── ScoringAgent      : 40 USD   (scoring leads)
├── CopywriterAgent   : 100 USD  (génération emails)
├── OutreachAgent     : 60 USD   (orchestration envoi)
├── FollowUpAgent     : 50 USD   (relances)
├── AnalyticsAgent    : 30 USD   (rapports)
└── Autres agents     : 20 USD   (monitoring, coordination)
```

### Metabase SQL Query — Coûts par agent par jour

```sql
WITH daily_costs AS (
  SELECT
    DATE(lc.called_at) AS day,
    lc.agent_id,
    a.name AS agent_name,
    lc.model,
    COUNT(*) AS call_count,
    SUM(lc.total_tokens) AS total_tokens,
    SUM(lc.cost_usd) AS cost_usd
  FROM llm_calls lc
  JOIN agents a ON a.id = lc.agent_id
  WHERE lc.called_at >= NOW() - INTERVAL '30 days'
    AND lc.status = 'success'
  GROUP BY day, lc.agent_id, a.name, lc.model
),
budget_limits AS (
  SELECT agent_id, monthly_budget_usd
  FROM agent_budgets
),
monthly_totals AS (
  SELECT
    agent_id,
    agent_name,
    SUM(cost_usd) AS month_to_date_usd,
    SUM(cost_usd) / NULLIF(COUNT(DISTINCT day), 0) AS avg_daily_usd
  FROM daily_costs
  WHERE day >= date_trunc('month', CURRENT_DATE)
  GROUP BY agent_id, agent_name
)
SELECT
  mt.agent_name,
  ROUND(mt.month_to_date_usd::NUMERIC, 4) AS month_to_date_usd,
  ROUND(mt.avg_daily_usd::NUMERIC, 4) AS avg_daily_usd,
  ROUND((mt.avg_daily_usd * (
    EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'))
  ))::NUMERIC, 4) AS projected_month_usd,
  bl.monthly_budget_usd,
  ROUND((mt.month_to_date_usd / NULLIF(bl.monthly_budget_usd, 0) * 100)::NUMERIC, 1)
    AS budget_used_pct
FROM monthly_totals mt
LEFT JOIN budget_limits bl ON bl.agent_id = mt.agent_id
ORDER BY month_to_date_usd DESC;
```

### Metabase SQL Query — Répartition par modèle

```sql
SELECT
  lc.model,
  COUNT(*) AS total_calls,
  SUM(lc.prompt_tokens) AS prompt_tokens,
  SUM(lc.completion_tokens) AS completion_tokens,
  ROUND(SUM(lc.cost_usd)::NUMERIC, 4) AS total_cost_usd,
  ROUND((SUM(lc.cost_usd) / NULLIF(
    (SELECT SUM(cost_usd) FROM llm_calls
     WHERE called_at >= date_trunc('month', CURRENT_DATE)), 0
  ) * 100)::NUMERIC, 2) AS pct_of_total_cost,
  ROUND((SUM(lc.cost_usd) / NULLIF(COUNT(*), 0))::NUMERIC, 6) AS avg_cost_per_call
FROM llm_calls lc
WHERE lc.called_at >= date_trunc('month', CURRENT_DATE)
GROUP BY lc.model
ORDER BY total_cost_usd DESC;
```

### Alerte Budget — Logique NestJS

```typescript
// src/monitoring/budget-alert.service.ts
@Injectable()
export class BudgetAlertService {
  private readonly ALERT_THRESHOLDS = [0.70, 0.85, 0.95, 1.0];
  private readonly alreadyAlerted = new Set<string>();

  async checkBudgets(): Promise<void> {
    const budgets = await this.db.query<AgentBudgetStatus>(`
      SELECT
        a.id, a.name,
        ab.monthly_budget_usd,
        COALESCE(SUM(lc.cost_usd), 0) AS spent_usd
      FROM agents a
      JOIN agent_budgets ab ON ab.agent_id = a.id
      LEFT JOIN llm_calls lc
        ON lc.agent_id = a.id
        AND lc.called_at >= date_trunc('month', CURRENT_DATE)
      GROUP BY a.id, a.name, ab.monthly_budget_usd
    `);

    for (const agent of budgets) {
      const ratio = agent.spent_usd / agent.monthly_budget_usd;
      const threshold = this.ALERT_THRESHOLDS.find(t => ratio >= t);

      if (threshold) {
        const key = `${agent.id}-${threshold}`;
        if (!this.alreadyAlerted.has(key)) {
          await this.slackAlert.sendBudgetAlert(agent, ratio, threshold);
          this.alreadyAlerted.add(key);
        }
      }
    }
  }
}
```

---

## Panel 4 — Agent Communication Graph

### Objectif
Visualiser le réseau de communications inter-agents : qui envoie des messages à qui, avec quelle fréquence, quelle latence, et quel volume. Identifier les goulots d'étranglement et les agents surclargés.

### Visualisation

Le graphe de communication est rendu avec D3.js dans un composant React custom, car Metabase ne supporte pas nativement les graphes de réseau.

```
                    ┌─────────────────┐
                    │  OrchestratorAgent │
                    │  (hub central)   │
                    └──┬──┬──┬──┬──┬──┘
                       │  │  │  │  │
              ┌────────┘  │  │  └────────┐
              │           │  │           │
         LeadScout   Enrichment  Scoring  Copywriter
              │           │  │           │
              └───────────┘  └───────────┘
                         │
                    FollowUpAgent
```

### Metabase SQL Query — Volume de messages par paire

```sql
SELECT
  a_src.name AS source_agent,
  a_dst.name AS destination_agent,
  COUNT(*) AS message_count,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY am.processing_latency_ms) AS p50_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY am.processing_latency_ms) AS p95_latency_ms,
  COUNT(*) FILTER (WHERE am.status = 'failed') AS failed_count,
  ROUND(AVG(pg_column_size(am.payload::text::bytea)) / 1024.0, 2) AS avg_payload_kb,
  MAX(am.sent_at) AS last_message_at
FROM agent_messages am
JOIN agents a_src ON a_src.id = am.source_agent_id
JOIN agents a_dst ON a_dst.id = am.destination_agent_id
WHERE am.sent_at >= NOW() - INTERVAL '24 hours'
GROUP BY a_src.name, a_dst.name
ORDER BY message_count DESC;
```

### Composant React — Network Graph

```typescript
// src/dashboard/components/AgentCommunicationGraph.tsx
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface AgentNode {
  id: string;
  name: string;
  type: 'master' | 'sub';
  status: 'RUNNING' | 'IDLE' | 'ERROR' | 'STOPPED';
  messageCount: number;
}

interface AgentLink {
  source: string;
  target: string;
  weight: number;
  p95LatencyMs: number;
  failedCount: number;
}

interface Props {
  nodes: AgentNode[];
  links: AgentLink[];
  width?: number;
  height?: number;
}

export const AgentCommunicationGraph: React.FC<Props> = ({
  nodes,
  links,
  width = 800,
  height = 600,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !nodes.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(links as any)
        .id((d: any) => d.id)
        .distance(d => 100 + (d as any).p95LatencyMs / 100)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(40));

    // Gradient for link color based on latency
    const defs = svg.append('defs');
    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn)
      .domain([5000, 0]);  // 0ms = green, 5000ms = red

    // Links
    const link = svg.append('g').selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => colorScale(d.p95LatencyMs))
      .attr('stroke-width', d => Math.log1p(d.weight) * 2)
      .attr('stroke-opacity', 0.8)
      .attr('marker-end', 'url(#arrow)');

    // Arrow marker
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#999');

    // Node colors
    const statusColors: Record<string, string> = {
      RUNNING: '#22c55e',
      IDLE: '#94a3b8',
      ERROR: '#ef4444',
      STOPPED: '#6b7280',
    };

    // Nodes
    const node = svg.append('g').selectAll('g')
      .data(nodes)
      .join('g')
      .call(d3.drag<any, any>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
      );

    node.append('circle')
      .attr('r', d => d.type === 'master' ? 24 : 16)
      .attr('fill', d => statusColors[d.status] ?? '#6b7280')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '10px')
      .attr('fill', '#fff')
      .attr('font-weight', 'bold')
      .text(d => d.name.replace('Agent', '').slice(0, 8));

    // Message count badge
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => (d.type === 'master' ? 36 : 28) + 'px')
      .attr('font-size', '9px')
      .attr('fill', '#64748b')
      .text(d => `${d.messageCount} msgs`);

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [nodes, links, width, height]);

  return (
    <div style={{ background: '#0f172a', borderRadius: 8, padding: 16 }}>
      <h3 style={{ color: '#e2e8f0', marginBottom: 8 }}>
        Agent Communication Graph
      </h3>
      <svg ref={svgRef} width={width} height={height} />
    </div>
  );
};
```

---

## Panel 5 — Pipeline Funnel

### Objectif
Visualiser le taux de conversion à chaque étape du pipeline commercial, identifier les étapes qui perdent le plus de leads, mesurer le cycle de vente.

### Étapes du pipeline

```
Leads Détectés
    │  taux: 100%  (base)
    ▼
Leads Enrichis
    │  taux cible: > 85%
    │  perte : données manquantes, SIRET invalide
    ▼
Leads Scorés
    │  taux cible: > 99%  (toujours scoré si enrichi)
    ▼
Qualifiés (score ≥ seuil)
    │  taux cible: variable selon ICP
    ▼
Contactés (email envoyé)
    │  taux cible: > 90% des qualifiés
    │  perte : blacklist, domaine invalide
    ▼
Email Délivré
    │  taux cible: > 95%  (taux de délivrabilité)
    ▼
Email Ouvert
    │  taux cible: > 30%
    ▼
Répondu
    │  taux cible: > 8%
    ▼
Réunion Planifiée
    │  taux cible: > 3%
    ▼
Deal Créé (CRM)
    │  taux cible: > 1.5%
```

### Metabase SQL Query — Pipeline Funnel

```sql
WITH funnel AS (
  SELECT
    COUNT(*) FILTER (WHERE TRUE) AS leads_detected,
    COUNT(*) FILTER (WHERE l.enriched_at IS NOT NULL) AS leads_enriched,
    COUNT(*) FILTER (WHERE l.score IS NOT NULL) AS leads_scored,
    COUNT(*) FILTER (WHERE l.score >= 70) AS leads_qualified,
    COUNT(*) FILTER (WHERE l.first_contact_at IS NOT NULL) AS leads_contacted,
    COUNT(*) FILTER (WHERE l.email_delivered = TRUE) AS emails_delivered,
    COUNT(*) FILTER (WHERE l.email_opened_at IS NOT NULL) AS emails_opened,
    COUNT(*) FILTER (WHERE l.replied_at IS NOT NULL) AS leads_replied,
    COUNT(*) FILTER (WHERE l.meeting_booked_at IS NOT NULL) AS meetings_booked,
    COUNT(*) FILTER (WHERE l.deal_created_at IS NOT NULL) AS deals_created
  FROM leads l
  WHERE l.detected_at >= NOW() - INTERVAL '30 days'
)
SELECT
  'Détectés' AS stage,
  1 AS stage_order,
  leads_detected AS count,
  100.0 AS conversion_rate_pct,
  0 AS lost
FROM funnel
UNION ALL
SELECT 'Enrichis', 2, leads_enriched,
  ROUND(leads_enriched::NUMERIC / NULLIF(leads_detected,0) * 100, 1),
  leads_detected - leads_enriched
FROM funnel
UNION ALL
SELECT 'Scorés', 3, leads_scored,
  ROUND(leads_scored::NUMERIC / NULLIF(leads_enriched,0) * 100, 1),
  leads_enriched - leads_scored
FROM funnel
UNION ALL
SELECT 'Qualifiés (≥70)', 4, leads_qualified,
  ROUND(leads_qualified::NUMERIC / NULLIF(leads_scored,0) * 100, 1),
  leads_scored - leads_qualified
FROM funnel
UNION ALL
SELECT 'Contactés', 5, leads_contacted,
  ROUND(leads_contacted::NUMERIC / NULLIF(leads_qualified,0) * 100, 1),
  leads_qualified - leads_contacted
FROM funnel
UNION ALL
SELECT 'Email Délivré', 6, emails_delivered,
  ROUND(emails_delivered::NUMERIC / NULLIF(leads_contacted,0) * 100, 1),
  leads_contacted - emails_delivered
FROM funnel
UNION ALL
SELECT 'Email Ouvert', 7, emails_opened,
  ROUND(emails_opened::NUMERIC / NULLIF(emails_delivered,0) * 100, 1),
  emails_delivered - emails_opened
FROM funnel
UNION ALL
SELECT 'Répondu', 8, leads_replied,
  ROUND(leads_replied::NUMERIC / NULLIF(emails_delivered,0) * 100, 1),
  emails_delivered - leads_replied
FROM funnel
UNION ALL
SELECT 'Réunion', 9, meetings_booked,
  ROUND(meetings_booked::NUMERIC / NULLIF(leads_replied,0) * 100, 1),
  leads_replied - meetings_booked
FROM funnel
UNION ALL
SELECT 'Deal Créé', 10, deals_created,
  ROUND(deals_created::NUMERIC / NULLIF(meetings_booked,0) * 100, 1),
  meetings_booked - deals_created
FROM funnel
ORDER BY stage_order;
```

### Metabase SQL Query — Tendance hebdomadaire du funnel

```sql
SELECT
  date_trunc('week', l.detected_at) AS week,
  COUNT(*) AS leads_detected,
  COUNT(*) FILTER (WHERE l.enriched_at IS NOT NULL) AS enriched,
  COUNT(*) FILTER (WHERE l.first_contact_at IS NOT NULL) AS contacted,
  COUNT(*) FILTER (WHERE l.replied_at IS NOT NULL) AS replied,
  COUNT(*) FILTER (WHERE l.deal_created_at IS NOT NULL) AS deals,
  ROUND(COUNT(*) FILTER (WHERE l.replied_at IS NOT NULL)::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE l.first_contact_at IS NOT NULL), 0) * 100, 2
  ) AS reply_rate_pct
FROM leads l
WHERE l.detected_at >= NOW() - INTERVAL '90 days'
GROUP BY week
ORDER BY week DESC;
```

---

## Panel 6 — Error Analysis

### Objectif
Identifier les types d'erreurs les plus fréquents, les étapes qui échouent, les patterns de retry, et les agents les plus instables.

### Catégories d'erreurs

| Catégorie | Code | Description | Action typique |
|---|---|---|---|
| LLM_RATE_LIMIT | E001 | Rate limit Claude API | Backoff exponentiel |
| LLM_CONTEXT_OVERFLOW | E002 | Prompt trop long | Réduction du contexte |
| LLM_INVALID_RESPONSE | E003 | JSON invalide en sortie | Retry avec correction |
| TOOL_EXECUTION_FAILED | E004 | Outil agent échoué | Retry ou fallback |
| ENRICHMENT_NOT_FOUND | E005 | Aucune donnée trouvée | Skip lead |
| EMAIL_BOUNCE | E006 | Email rebondi | Marquer invalide |
| DB_TIMEOUT | E007 | Timeout PostgreSQL | Retry 3x |
| REDIS_CONNECTION | E008 | Connexion Redis perdue | Circuit breaker |
| QUEUE_STALLED | E009 | Job BullMQ bloqué | Kill + retry |
| ORCHESTRATION_LOOP | E010 | Boucle infinie agents | Kill + alert |

### Metabase SQL Query — Analyse des erreurs

```sql
SELECT
  ae.error_code,
  ae.error_category,
  a.name AS agent_name,
  COUNT(*) AS occurrence_count,
  COUNT(DISTINCT ae.execution_id) AS affected_executions,
  MIN(ae.occurred_at) AS first_seen,
  MAX(ae.occurred_at) AS last_seen,
  MAX(ae.occurred_at) AS last_occurred,
  ROUND(AVG(ae.retry_count)::NUMERIC, 1) AS avg_retries_before_failure,
  COUNT(*) FILTER (WHERE ae.resolved = TRUE) AS auto_resolved_count,
  ROUND(
    COUNT(*) FILTER (WHERE ae.resolved = TRUE)::NUMERIC / COUNT(*) * 100, 1
  ) AS auto_resolve_rate_pct,
  MODE() WITHIN GROUP (ORDER BY ae.failed_step) AS most_common_failed_step
FROM agent_errors ae
JOIN agents a ON a.id = ae.agent_id
WHERE ae.occurred_at >= NOW() - INTERVAL '7 days'
GROUP BY ae.error_code, ae.error_category, a.name
ORDER BY occurrence_count DESC
LIMIT 50;
```

### Metabase SQL Query — Retry Patterns

```sql
WITH retry_analysis AS (
  SELECT
    ae.error_code,
    ae.retry_count,
    CASE
      WHEN ae.retry_count = 0 THEN 'no_retry'
      WHEN ae.retry_count BETWEEN 1 AND 2 THEN '1-2_retries'
      WHEN ae.retry_count BETWEEN 3 AND 5 THEN '3-5_retries'
      ELSE '6+_retries'
    END AS retry_bucket,
    ae.resolved,
    ae.final_status
  FROM agent_errors ae
  WHERE ae.occurred_at >= NOW() - INTERVAL '30 days'
)
SELECT
  error_code,
  retry_bucket,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE resolved = TRUE) AS resolved_count,
  ROUND(COUNT(*) FILTER (WHERE resolved = TRUE)::NUMERIC / COUNT(*) * 100, 1)
    AS resolution_rate_pct
FROM retry_analysis
GROUP BY error_code, retry_bucket
ORDER BY error_code, retry_bucket;
```

### Schéma — agent_errors

```sql
CREATE TABLE agent_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  execution_id UUID REFERENCES agent_executions(id),
  error_code VARCHAR(20) NOT NULL,
  error_category VARCHAR(50) NOT NULL,
  error_message TEXT,
  failed_step VARCHAR(100),
  stack_trace TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  final_status VARCHAR(20) CHECK (final_status IN ('resolved','abandoned','escalated')),
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX idx_errors_agent_time ON agent_errors(agent_id, occurred_at DESC);
CREATE INDEX idx_errors_code ON agent_errors(error_code, occurred_at DESC);
```

---

## Real-Time Activity Feed

### Architecture

Le flux temps réel utilise Server-Sent Events (SSE) depuis NestJS, consommé par le dashboard React. Chaque action d'agent est broadcastée instantanément.

```typescript
// src/monitoring/realtime/agent-activity.gateway.ts
import { Controller, Get, Res, Sse } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

export interface AgentActivityEvent {
  agentId: string;
  agentName: string;
  action: string;
  details: Record<string, unknown>;
  severity: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  correlationId: string;
}

@Controller('monitoring')
export class AgentActivityController {
  private readonly eventSubject = new Subject<AgentActivityEvent>();

  @Sse('activity-stream')
  streamActivity(): Observable<MessageEvent> {
    return this.eventSubject.pipe(
      map(event => ({
        data: JSON.stringify(event),
        type: 'agent_activity',
        id: event.correlationId,
      } as MessageEvent))
    );
  }

  broadcast(event: AgentActivityEvent): void {
    this.eventSubject.next(event);
  }
}
```

### Format des événements du feed

```typescript
// Exemples d'événements affichés dans le feed
const activityExamples: AgentActivityEvent[] = [
  {
    agentName: 'LeadScoutAgent',
    action: 'SCRAPING_STARTED',
    details: { source: 'pappers.fr', target: 'SaaS B2B Paris 11-50 salariés' },
    severity: 'info',
    timestamp: '2024-01-15T14:32:01Z',
  },
  {
    agentName: 'EnrichmentAgent',
    action: 'LEAD_ENRICHED',
    details: { company: '[COMPANY_NAME]', fieldsAdded: 12, score: null },
    severity: 'success',
    timestamp: '2024-01-15T14:32:45Z',
  },
  {
    agentName: 'ScoringAgent',
    action: 'SCORE_CALCULATED',
    details: { score: 87, tier: 'A', model: 'claude-haiku-3-5' },
    severity: 'success',
    timestamp: '2024-01-15T14:33:02Z',
  },
  {
    agentName: 'CopywriterAgent',
    action: 'EMAIL_GENERATED',
    details: { variant: 'pain_point_v2', tokens: 847, latencyMs: 1240 },
    severity: 'info',
    timestamp: '2024-01-15T14:33:18Z',
  },
  {
    agentName: 'OutreachAgent',
    action: 'EMAIL_SEND_FAILED',
    details: { reason: 'rate_limit', retryIn: 300, attempt: 2 },
    severity: 'warning',
    timestamp: '2024-01-15T14:33:55Z',
  },
];
```

### Composant React — Activity Feed

```typescript
// src/dashboard/components/ActivityFeed.tsx
import React, { useEffect, useState } from 'react';

const SEVERITY_COLORS = {
  info: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
};

const SEVERITY_ICONS = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✗',
};

export const ActivityFeed: React.FC = () => {
  const [events, setEvents] = useState<AgentActivityEvent[]>([]);

  useEffect(() => {
    const es = new EventSource('/monitoring/activity-stream');

    es.addEventListener('agent_activity', (e) => {
      const event: AgentActivityEvent = JSON.parse(e.data);
      setEvents(prev => [event, ...prev].slice(0, 100));
    });

    return () => es.close();
  }, []);

  return (
    <div style={{
      background: '#0f172a', borderRadius: 8,
      height: 400, overflow: 'hidden', display: 'flex', flexDirection: 'column'
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
          Live Activity Feed
        </span>
        <span style={{
          marginLeft: 8, fontSize: 11,
          background: '#22c55e', color: '#fff',
          padding: '2px 8px', borderRadius: 10
        }}>
          LIVE
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {events.map((event, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start',
            padding: '6px 8px', marginBottom: 2,
            borderRadius: 4, background: i === 0 ? '#1e293b' : 'transparent',
            borderLeft: `3px solid ${SEVERITY_COLORS[event.severity]}`,
          }}>
            <span style={{
              color: SEVERITY_COLORS[event.severity],
              marginRight: 8, fontWeight: 700, fontSize: 14
            }}>
              {SEVERITY_ICONS[event.severity]}
            </span>
            <div style={{ flex: 1 }}>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>
                {new Date(event.timestamp).toLocaleTimeString('fr-FR')}
              </span>
              <span style={{ color: '#60a5fa', fontSize: 12, marginLeft: 8 }}>
                [{event.agentName}]
              </span>
              <span style={{ color: '#e2e8f0', fontSize: 12, marginLeft: 8 }}>
                {event.action}
              </span>
              <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                {JSON.stringify(event.details)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## Agent Conversation Log

### Objectif
Voir en temps réel et en historique les messages envoyés entre agents via BullMQ : qui a demandé quoi à qui, avec quel payload, et quel a été le résultat.

### Metabase SQL Query — Messages inter-agents récents

```sql
SELECT
  am.sent_at,
  a_src.name AS from_agent,
  a_dst.name AS to_agent,
  am.message_type,
  am.queue_name,
  am.job_id,
  am.status,
  am.processing_latency_ms,
  am.payload_hash,
  am.retry_count,
  am.error_message
FROM agent_messages am
JOIN agents a_src ON a_src.id = am.source_agent_id
JOIN agents a_dst ON a_dst.id = am.destination_agent_id
WHERE am.sent_at >= NOW() - INTERVAL '1 hour'
ORDER BY am.sent_at DESC
LIMIT 200;
```

### Schéma — agent_messages

```sql
CREATE TABLE agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_agent_id UUID NOT NULL REFERENCES agents(id),
  destination_agent_id UUID NOT NULL REFERENCES agents(id),
  correlation_id UUID NOT NULL,
  queue_name VARCHAR(100) NOT NULL,
  job_id VARCHAR(200),
  message_type VARCHAR(100) NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,  -- SHA-256 du payload, pas le payload lui-même
  payload_size_bytes INT,
  status VARCHAR(20) NOT NULL CHECK (status IN ('sent','received','processed','failed')),
  retry_count INT NOT NULL DEFAULT 0,
  processing_latency_ms INT,
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ
);
CREATE INDEX idx_messages_correlation ON agent_messages(correlation_id);
CREATE INDEX idx_messages_time ON agent_messages(sent_at DESC);
CREATE INDEX idx_messages_src_dst ON agent_messages(source_agent_id, destination_agent_id, sent_at DESC);
```

---

## Historical Timeline

### Objectif
Reconstruire la chronologie complète de ce qu'ont fait les agents : quand ont-ils tourné, combien de leads ont-ils trouvé, quels résultats ont-ils produit ?

### Metabase SQL Query — Timeline des exécutions

```sql
SELECT
  ae.started_at,
  ae.ended_at,
  EXTRACT(EPOCH FROM (ae.ended_at - ae.started_at))::INT AS duration_seconds,
  a.name AS agent_name,
  a.type AS agent_type,
  ae.status,
  ae.trigger_type,
  ae.result_summary->>'leads_found' AS leads_found,
  ae.result_summary->>'leads_enriched' AS leads_enriched,
  ae.result_summary->>'emails_sent' AS emails_sent,
  ae.result_summary->>'errors_count' AS errors_count,
  (SELECT COUNT(*) FROM llm_calls lc
   WHERE lc.execution_id = ae.id) AS llm_calls_made,
  (SELECT ROUND(SUM(cost_usd)::NUMERIC, 4) FROM llm_calls lc
   WHERE lc.execution_id = ae.id) AS execution_cost_usd
FROM agent_executions ae
JOIN agents a ON a.id = ae.agent_id
WHERE ae.started_at >= NOW() - INTERVAL '7 days'
ORDER BY ae.started_at DESC;
```

---

## KPIs par Agent — Cibles

| Agent | KPI Principal | Cible | Seuil WARNING | Seuil CRITICAL |
|---|---|---|---|---|
| LeadScoutAgent | Leads détectés / cycle | ≥ 50 | < 30 | < 10 |
| EnrichmentAgent | Taux enrichissement | ≥ 85% | < 70% | < 50% |
| ScoringAgent | Latence scoring P95 | < 500ms | > 1s | > 5s |
| CopywriterAgent | Qualité email (LLM judge) | ≥ 8/10 | < 7 | < 5 |
| OutreachAgent | Taux délivrabilité | ≥ 95% | < 90% | < 80% |
| FollowUpAgent | Taux réponse relances | ≥ 5% | < 3% | < 1% |
| AnalyticsAgent | Latence rapport | < 60s | > 120s | > 300s |
| OrchestratorAgent | Tâches orchestrées/h | ≥ 100 | < 50 | < 20 |

---

## Bull Board — Monitoring BullMQ

### Configuration

```typescript
// src/queue/bull-board.setup.ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';

export function setupBullBoard(app: NestExpressApplication, queues: Queue[]) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: queues.map(q => new BullMQAdapter(q)),
    serverAdapter,
    options: {
      uiConfig: {
        boardTitle: 'ProspectionAgentic Queue Monitor',
        boardLogo: { path: '/logo.png' },
        miscLinks: [
          { text: 'Dashboard Metabase', url: 'http://metabase:3030' },
          { text: 'Langfuse Traces', url: 'http://langfuse:3000' },
        ],
      },
    },
  });

  app.use('/admin/queues', serverAdapter.getRouter());
}
```

### Queues à monitorer

```typescript
// src/queue/queues.config.ts
export const QUEUE_NAMES = {
  LEAD_DISCOVERY: 'lead-discovery',
  LEAD_ENRICHMENT: 'lead-enrichment',
  LEAD_SCORING: 'lead-scoring',
  EMAIL_GENERATION: 'email-generation',
  EMAIL_OUTREACH: 'email-outreach',
  FOLLOW_UP: 'follow-up',
  ANALYTICS: 'analytics',
  AGENT_ORCHESTRATION: 'agent-orchestration',
  DEAD_LETTER: 'dead-letter-queue',
} as const;

// Configuration des queues BullMQ
export const defaultQueueConfig = {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 7 * 86400, count: 5000 },
  },
  settings: {
    stalledInterval: 30000,
    maxStalledCount: 2,
  },
};
```

---

## Grafana + Prometheus — Infrastructure Metrics

### Métriques Node.js exposées

```typescript
// src/monitoring/prometheus.setup.ts
import { Registry, collectDefaultMetrics, Gauge, Counter, Histogram } from 'prom-client';

export function setupPrometheus(): Registry {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'prospection_' });

  // Métriques custom
  new Gauge({
    name: 'prospection_agent_health_score',
    help: 'Health score (0-100) per agent',
    labelNames: ['agent_name', 'agent_type'],
    registers: [registry],
  });

  new Counter({
    name: 'prospection_llm_calls_total',
    help: 'Total LLM API calls',
    labelNames: ['agent_name', 'model', 'status'],
    registers: [registry],
  });

  new Histogram({
    name: 'prospection_llm_latency_ms',
    help: 'LLM call latency in milliseconds',
    labelNames: ['agent_name', 'model'],
    buckets: [100, 250, 500, 1000, 2000, 5000, 10000, 30000],
    registers: [registry],
  });

  new Counter({
    name: 'prospection_leads_processed_total',
    help: 'Total leads processed per stage',
    labelNames: ['stage', 'status'],
    registers: [registry],
  });

  new Gauge({
    name: 'prospection_bullmq_queue_depth',
    help: 'Number of waiting jobs per queue',
    labelNames: ['queue_name'],
    registers: [registry],
  });

  new Gauge({
    name: 'prospection_monthly_cost_usd',
    help: 'Month-to-date LLM cost in USD',
    labelNames: ['agent_name', 'model'],
    registers: [registry],
  });

  return registry;
}
```

### Configuration Prometheus (prometheus.yml)

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prospection-nestjs'
    static_configs:
      - targets: ['app:3000']
    metrics_path: '/metrics'

  - job_name: 'postgresql'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'bullmq'
    static_configs:
      - targets: ['app:3000']
    metrics_path: '/metrics/queues'
```

### Dashboard Grafana recommandé

```json
{
  "dashboard": {
    "title": "ProspectionAgentic — Infrastructure",
    "panels": [
      {
        "title": "Node.js Memory Usage",
        "type": "graph",
        "targets": [{
          "expr": "prospection_nodejs_heap_used_bytes / 1024 / 1024",
          "legendFormat": "Heap Used (MB)"
        }]
      },
      {
        "title": "LLM Latency P99",
        "type": "graph",
        "targets": [{
          "expr": "histogram_quantile(0.99, rate(prospection_llm_latency_ms_bucket[5m]))",
          "legendFormat": "{{agent_name}} P99"
        }]
      },
      {
        "title": "BullMQ Queue Depth",
        "type": "graph",
        "targets": [{
          "expr": "prospection_bullmq_queue_depth",
          "legendFormat": "{{queue_name}}"
        }]
      },
      {
        "title": "Monthly Cost USD",
        "type": "stat",
        "targets": [{
          "expr": "sum(prospection_monthly_cost_usd)",
          "legendFormat": "Total Cost"
        }]
      }
    ]
  }
}
```

---

## Agent Lifecycle Visualization

### États et transitions

```
                    ┌─────────────────┐
                    │   INITIALIZED   │ ← Agent créé, config chargée
                    └────────┬────────┘
                             │ trigger (cron / event / manual)
                    ┌────────▼────────┐
                    │    STARTING     │ ← Connexions établies, context chargé
                    └────────┬────────┘
                             │
              ┌──────────────▼───────────────┐
              │          PROCESSING          │
              │  ┌─────┐ ┌──────┐ ┌──────┐  │
              │  │Tool │ │ LLM  │ │Queue │  │
              │  │Call │ │ Call │ │ Msg  │  │
              │  └──┬──┘ └──┬───┘ └──┬───┘  │
              └─────┼───────┼────────┼──────┘
                    │       │        │
              ┌─────▼───────▼────────▼──────┐
              │         COMPLETING          │
              │  Résultats sauvegardés      │
              │  Métriques émises           │
              └──────────────┬──────────────┘
                             │
               ┌─────────────┼─────────────┐
               │             │             │
        ┌──────▼──┐    ┌─────▼──┐   ┌─────▼───┐
        │COMPLETED│    │ FAILED │   │CANCELLED│
        │ (succes)│    │(erreur)│   │(arrêté) │
        └─────────┘    └────────┘   └─────────┘
                            │
                    ┌───────▼────────┐
                    │    RETRYING    │ ← Si retry_count < max
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │   DEAD_LETTER  │ ← Après N échecs
                    └────────────────┘
```

### NestJS — Lifecycle events

```typescript
// src/agents/lifecycle/agent-lifecycle.service.ts
@Injectable()
export class AgentLifecycleService {
  constructor(
    private readonly db: DatabaseService,
    private readonly activityGateway: AgentActivityController,
    private readonly metrics: PrometheusService,
  ) {}

  async transitionTo(
    agentId: string,
    executionId: string,
    newStatus: AgentLifecycleStatus,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO agent_lifecycle_events
         (agent_id, execution_id, status, metadata)
       VALUES ($1, $2, $3, $4)`,
      [agentId, executionId, newStatus, metadata ?? {}],
    );

    // Heartbeat update
    await this.db.query(
      `INSERT INTO agent_heartbeats (agent_id, status, metadata)
       VALUES ($1, $2, $3)`,
      [agentId, this.mapLifecycleToHeartbeat(newStatus), metadata ?? {}],
    );

    // Broadcast to dashboard
    const agent = await this.db.findAgent(agentId);
    this.activityGateway.broadcast({
      agentId,
      agentName: agent.name,
      action: `LIFECYCLE_${newStatus}`,
      details: metadata ?? {},
      severity: newStatus === 'FAILED' ? 'error' : 'info',
      timestamp: new Date().toISOString(),
      correlationId: executionId,
    });

    // Prometheus metric
    this.metrics.gauge('agent_health_score', newStatus === 'COMPLETED' ? 100 : 0, {
      agent_name: agent.name,
      agent_type: agent.type,
    });
  }

  private mapLifecycleToHeartbeat(status: AgentLifecycleStatus): string {
    const mapping: Record<AgentLifecycleStatus, string> = {
      INITIALIZED: 'IDLE',
      STARTING: 'RUNNING',
      PROCESSING: 'RUNNING',
      COMPLETING: 'RUNNING',
      COMPLETED: 'IDLE',
      FAILED: 'ERROR',
      CANCELLED: 'STOPPED',
      RETRYING: 'RUNNING',
      DEAD_LETTER: 'ERROR',
    };
    return mapping[status];
  }
}
```

---

## Mise en place complète — docker-compose.monitoring.yml

```yaml
version: '3.9'

services:
  metabase:
    image: metabase/metabase:v0.50.0
    container_name: prospection-metabase
    ports:
      - "3030:3000"
    environment:
      MB_DB_TYPE: postgres
      MB_DB_DBNAME: metabase
      MB_DB_PORT: 5432
      MB_DB_USER: metabase
      MB_DB_PASS: ${METABASE_DB_PASSWORD}
      MB_DB_HOST: postgres
      MB_SITE_URL: http://localhost:3030
      MB_EMAIL_SMTP_HOST: ${SMTP_HOST}
    depends_on:
      - postgres
    volumes:
      - metabase-data:/metabase-data
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:v2.50.0
    container_name: prospection-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'
    restart: unless-stopped

  grafana:
    image: grafana/grafana:10.3.0
    container_name: prospection-grafana
    ports:
      - "3031:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
      GF_INSTALL_PLUGINS: grafana-clock-panel,grafana-simple-json-datasource
    volumes:
      - grafana-data:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./monitoring/grafana/datasources:/etc/grafana/provisioning/datasources:ro
    depends_on:
      - prometheus
    restart: unless-stopped

  redis-exporter:
    image: oliver006/redis_exporter:v1.58.0
    container_name: prospection-redis-exporter
    ports:
      - "9121:9121"
    environment:
      REDIS_ADDR: redis:6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
    restart: unless-stopped

  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:v0.15.0
    container_name: prospection-postgres-exporter
    ports:
      - "9187:9187"
    environment:
      DATA_SOURCE_NAME: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?sslmode=disable
    restart: unless-stopped

volumes:
  metabase-data:
  prometheus-data:
  grafana-data:
```
