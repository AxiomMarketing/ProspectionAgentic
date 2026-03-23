# Alerting — Système Multi-Agents

## Vue d'ensemble

Le système d'alerting a deux objectifs antagonistes qu'il faut équilibrer :
1. **Ne jamais manquer une alerte critique** — agent mort, budget épuisé, pipeline rompu
2. **Éviter la fatigue d'alerte** — trop de notifications = toutes ignorées

La stratégie repose sur trois canaux Slack distincts, des niveaux de sévérité clairs, une détection d'anomalies statistique, et une agrégation intelligente.

---

## Architecture Slack

### Canaux et leur usage

| Canal | Contenu | Audience | Volume attendu |
|---|---|---|---|
| `#agent-alerts` | Warnings et infos opérationnelles | Équipe tech | 10–30 msgs/jour |
| `#critical-alerts` | Erreurs bloquantes, budget, pipeline rompu | Tech + CTO | < 5 msgs/jour |
| `#pipeline-metrics` | Digest quotidien + KPIs hebdo | Toute l'équipe | 2 msgs/jour |

### Architecture du service Slack

```typescript
// src/alerting/slack-alert.service.ts
import { Injectable } from '@nestjs/common';
import { WebClient, Block, KnownBlock } from '@slack/web-api';
import { ConfigService } from '@nestjs/config';

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface AlertPayload {
  severity: AlertSeverity;
  title: string;
  description: string;
  agentName?: string;
  metric?: string;
  currentValue?: number;
  threshold?: number;
  traceId?: string;
  executionId?: string;
  actions?: AlertAction[];
  deduplicationKey?: string;
}

export interface AlertAction {
  text: string;
  actionId: string;
  url?: string;
  style?: 'primary' | 'danger';
}

@Injectable()
export class SlackAlertService {
  private readonly client: WebClient;
  private readonly channels: Record<AlertSeverity, string>;
  private readonly cooldowns = new Map<string, number>();
  private readonly COOLDOWN_MS: Record<AlertSeverity, number> = {
    CRITICAL: 5 * 60 * 1000,       // 5 minutes
    WARNING:  30 * 60 * 1000,      // 30 minutes
    INFO:     2 * 60 * 60 * 1000,  // 2 heures
  };

  constructor(private readonly config: ConfigService) {
    this.client = new WebClient(config.get('SLACK_BOT_TOKEN'));
    this.channels = {
      CRITICAL: config.get('SLACK_CHANNEL_CRITICAL', '#critical-alerts'),
      WARNING:  config.get('SLACK_CHANNEL_WARNINGS', '#agent-alerts'),
      INFO:     config.get('SLACK_CHANNEL_INFO', '#agent-alerts'),
    };
  }

  async send(alert: AlertPayload): Promise<void> {
    // Vérifier le cooldown de déduplication
    if (alert.deduplicationKey && this.isInCooldown(alert)) {
      return;
    }

    // Filtrer les alertes INFO hors heures de bureau (8h-20h lun-ven)
    if (alert.severity === 'INFO' && !this.isBusinessHours()) {
      return;
    }

    const channel = this.channels[alert.severity];
    const blocks = this.buildBlocks(alert);

    try {
      await this.client.chat.postMessage({
        channel,
        text: `${this.getSeverityEmoji(alert.severity)} ${alert.title}`,
        blocks,
        unfurl_links: false,
      });

      if (alert.deduplicationKey) {
        this.setCooldown(alert);
      }
    } catch (error) {
      // Fallback : log seulement si Slack est inaccessible
      console.error('[SlackAlertService] Failed to send alert:', error);
    }
  }

  private buildBlocks(alert: AlertPayload): (Block | KnownBlock)[] {
    const emoji = this.getSeverityEmoji(alert.severity);
    const color = this.getSeverityColor(alert.severity);

    const blocks: (Block | KnownBlock)[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${alert.title}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: alert.description },
        fields: [
          alert.agentName
            ? { type: 'mrkdwn', text: `*Agent:*\n${alert.agentName}` }
            : null,
          alert.metric
            ? {
                type: 'mrkdwn',
                text: `*Métrique:*\n${alert.metric}: \`${alert.currentValue}\` (seuil: \`${alert.threshold}\`)`,
              }
            : null,
          {
            type: 'mrkdwn',
            text: `*Sévérité:*\n${alert.severity}`,
          },
          {
            type: 'mrkdwn',
            text: `*Horodatage:*\n${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`,
          },
        ].filter(Boolean) as any[],
      },
    ];

    // Ajouter les boutons d'action si présents
    if (alert.actions?.length) {
      blocks.push({
        type: 'actions',
        elements: alert.actions.map(action => ({
          type: 'button',
          text: { type: 'plain_text', text: action.text, emoji: true },
          action_id: action.actionId,
          url: action.url,
          style: action.style,
        })),
      });
    }

    // Contexte de trace
    if (alert.traceId || alert.executionId) {
      blocks.push({
        type: 'context',
        elements: [
          alert.traceId
            ? { type: 'mrkdwn', text: `Trace: \`${alert.traceId}\`` }
            : null,
          alert.executionId
            ? { type: 'mrkdwn', text: `Execution: \`${alert.executionId}\`` }
            : null,
        ].filter(Boolean) as any[],
      });
    }

    return blocks;
  }

  private getSeverityEmoji(severity: AlertSeverity): string {
    return { CRITICAL: ':rotating_light:', WARNING: ':warning:', INFO: ':information_source:' }[severity];
  }

  private getSeverityColor(severity: AlertSeverity): string {
    return { CRITICAL: '#ef4444', WARNING: '#f59e0b', INFO: '#3b82f6' }[severity];
  }

  private isInCooldown(alert: AlertPayload): boolean {
    const key = alert.deduplicationKey!;
    const lastSent = this.cooldowns.get(key);
    if (!lastSent) return false;
    return Date.now() - lastSent < this.COOLDOWN_MS[alert.severity];
  }

  private setCooldown(alert: AlertPayload): void {
    this.cooldowns.set(alert.deduplicationKey!, Date.now());
  }

  private isBusinessHours(): boolean {
    const now = new Date();
    const parisTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const hour = parisTime.getHours();
    const day = parisTime.getDay();
    return day >= 1 && day <= 5 && hour >= 8 && hour < 20;
  }
}
```

---

## Niveaux de Sévérité

### CRITICAL — Intervention immédiate requise

Déclenche une notification sur `#critical-alerts` + SMS si non acquitté dans les 15 minutes.

| Condition | Seuil | Déduplication |
|---|---|---|
| Agent arrêté depuis > 30 min (hors maintenance) | heartbeat absent | 30 min |
| Budget mensuel dépassé (> 100%) | N/A | 24h |
| Pipeline rompu (0 leads traités en 2h) | 0 leads/2h | 1h |
| Taux d'erreur LLM > 10% sur 15 min | > 10% | 15 min |
| Queue BullMQ avec > 500 jobs en attente | > 500 jobs | 10 min |
| Connexion PostgreSQL perdue | N/A | 5 min |
| Connexion Redis perdue | N/A | 5 min |
| Dead letter queue > 50 jobs | > 50 jobs | 1h |
| Agent en boucle infinie détectée | > 100 cycles/min | 5 min |
| Taux de bounce email > 15% | > 15% | 2h |

### WARNING — Attention requise dans la journée

Déclenche une notification sur `#agent-alerts`, agrégée si plusieurs arrivent dans les 5 minutes.

| Condition | Seuil | Déduplication |
|---|---|---|
| Budget mensuel > 85% | > 85% | 4h |
| Latence LLM P95 > 10 secondes | > 10s | 30 min |
| Taux d'erreur agent > 5% sur 1h | > 5% | 1h |
| Score qualité email < 6/10 | < 6 | 2h |
| Taux de délivrabilité < 90% | < 90% | 2h |
| Taux de réponse < 3% (semaine glissante) | < 3% | 24h |
| Job BullMQ stalled > 3 fois | > 3 stalls | 30 min |
| Latence enrichissement > 60s | > 60s | 30 min |
| Aucun nouveau lead depuis 4h | 0 leads/4h | 2h |

### INFO — Information à surveiller

Posté sur `#agent-alerts` uniquement pendant les heures de bureau (8h-20h).

| Condition | Déduplication |
|---|---|
| Budget mensuel > 70% | 8h |
| Agent redémarré après erreur | 1h |
| Nouveau record de leads en une journée | 24h |
| Campagne outreach démarrée | N/A |
| Rapport hebdomadaire disponible | N/A |

---

## Templates Slack Block Kit

### Template CRITICAL — Agent mort

```typescript
// src/alerting/templates/agent-down.template.ts
export function agentDownTemplate(agentName: string, downSinceMin: number, lastError?: string) {
  return {
    severity: 'CRITICAL' as const,
    title: `Agent ${agentName} ne répond plus`,
    description: [
      `L'agent *${agentName}* n'a pas envoyé de heartbeat depuis *${downSinceMin} minutes*.`,
      lastError ? `\n*Dernière erreur:* \`${lastError}\`` : '',
      '\nLe pipeline de prospection est potentiellement interrompu.',
    ].join(''),
    agentName,
    deduplicationKey: `agent-down-${agentName}`,
    actions: [
      {
        text: ':mag: Voir les logs',
        actionId: 'view_logs',
        url: `https://grafana.internal/d/agents?var-agent=${agentName}&from=now-30m`,
      },
      {
        text: ':arrows_counterclockwise: Redémarrer',
        actionId: 'restart_agent',
        style: 'primary' as const,
        url: `https://app.internal/admin/agents/${agentName}/restart`,
      },
      {
        text: ':white_check_mark: Acquitter',
        actionId: 'acknowledge',
      },
    ],
  };
}
```

### Template CRITICAL — Budget dépassé

```typescript
export function budgetExceededTemplate(agentName: string, spentUsd: number, budgetUsd: number) {
  const pct = Math.round(spentUsd / budgetUsd * 100);
  return {
    severity: 'CRITICAL' as const,
    title: `Budget LLM dépassé — ${agentName} (${pct}%)`,
    description: [
      `L'agent *${agentName}* a consommé *$${spentUsd.toFixed(2)}* sur un budget de *$${budgetUsd.toFixed(2)}*.`,
      `\nDépassement: *$${(spentUsd - budgetUsd).toFixed(2)}* (${pct}% du budget).`,
      '\n:rotating_light: L\'agent a été mis en pause automatiquement.',
    ].join(''),
    agentName,
    metric: 'monthly_cost_usd',
    currentValue: spentUsd,
    threshold: budgetUsd,
    deduplicationKey: `budget-exceeded-${agentName}`,
    actions: [
      {
        text: ':chart_with_upwards_trend: Voir les coûts',
        actionId: 'view_costs',
        url: 'https://metabase.internal/dashboard/costs',
      },
      {
        text: ':heavy_dollar_sign: Augmenter le budget',
        actionId: 'increase_budget',
        url: 'https://app.internal/admin/budgets',
      },
    ],
  };
}
```

### Template WARNING — Latence élevée

```typescript
export function highLatencyTemplate(
  agentName: string,
  model: string,
  p95Ms: number,
  threshold: number,
) {
  return {
    severity: 'WARNING' as const,
    title: `Latence LLM élevée — ${agentName}`,
    description: [
      `La latence P95 de *${agentName}* avec le modèle \`${model}\` est de *${p95Ms}ms*`,
      ` (seuil: ${threshold}ms).`,
      '\nCela peut indiquer une dégradation du service Anthropic ou une surcharge du système.',
    ].join(''),
    agentName,
    metric: 'llm_p95_latency_ms',
    currentValue: p95Ms,
    threshold,
    deduplicationKey: `high-latency-${agentName}-${model}`,
    actions: [
      {
        text: ':eyes: Voir les traces Langfuse',
        actionId: 'view_traces',
        url: `https://langfuse.internal/traces?agent=${agentName}`,
      },
      {
        text: ':bar_chart: Dashboard perf',
        actionId: 'view_dashboard',
        url: 'https://grafana.internal/d/performance',
      },
    ],
  };
}
```

### Template — Pipeline rompu

```typescript
export function pipelineStoppedTemplate(lastLeadProcessed: Date, hoursSinceLastLead: number) {
  return {
    severity: 'CRITICAL' as const,
    title: 'Pipeline de prospection arrêté',
    description: [
      `Aucun lead n'a été traité depuis *${hoursSinceLastLead}h*.`,
      `\nDernier lead traité le: *${lastLeadProcessed.toLocaleString('fr-FR')}*.`,
      '\nVérifier: LeadScoutAgent, queues BullMQ, connexions DB/Redis.',
    ].join(''),
    deduplicationKey: 'pipeline-stopped',
    actions: [
      {
        text: ':mag: Voir les queues',
        actionId: 'view_queues',
        url: 'https://app.internal/admin/queues',
      },
      {
        text: ':rotating_light: Voir les erreurs',
        actionId: 'view_errors',
        url: 'https://metabase.internal/dashboard/errors',
      },
      {
        text: ':arrows_counterclockwise: Relancer le pipeline',
        actionId: 'restart_pipeline',
        style: 'primary' as const,
        url: 'https://app.internal/admin/pipeline/restart',
      },
    ],
  };
}
```

### Template — Email bounce élevé

```typescript
export function emailBounceTemplate(bounceRate: number, threshold: number, period: string) {
  return {
    severity: 'CRITICAL' as const,
    title: `Taux de bounce email critique — ${bounceRate.toFixed(1)}%`,
    description: [
      `Le taux de bounce est de *${bounceRate.toFixed(1)}%* sur ${period} (seuil: ${threshold}%).`,
      '\n:rotating_light: Un taux de bounce > 15% peut entraîner une suspension du domaine d\'envoi.',
      '\nAction immédiate requise : suspendre les envois et vérifier la liste.',
    ].join(''),
    metric: 'email_bounce_rate_pct',
    currentValue: bounceRate,
    threshold,
    deduplicationKey: 'email-bounce-critical',
    actions: [
      {
        text: ':pause_button: Suspendre les envois',
        actionId: 'pause_outreach',
        style: 'danger' as const,
        url: 'https://app.internal/admin/outreach/pause',
      },
      {
        text: ':broom: Nettoyer la liste',
        actionId: 'clean_list',
        url: 'https://app.internal/admin/leads/clean',
      },
    ],
  };
}
```

---

## Règles d'Alerte par Agent

### AlertRulesService

```typescript
// src/alerting/alert-rules.service.ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class AlertRulesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly slack: SlackAlertService,
    private readonly anomalyDetector: AnomalyDetectionService,
  ) {}

  // Vérifie l'état de santé des agents toutes les 2 minutes
  @Cron('*/2 * * * *')
  async checkAgentHealth(): Promise<void> {
    const agents = await this.db.query<{
      agent_id: string;
      agent_name: string;
      last_heartbeat: Date;
      status: string;
    }>(`
      SELECT DISTINCT ON (agent_id)
        agent_id, a.name AS agent_name, recorded_at AS last_heartbeat, status
      FROM agent_heartbeats ah
      JOIN agents a ON a.id = ah.agent_id
      ORDER BY agent_id, recorded_at DESC
    `);

    for (const agent of agents) {
      const minutesSinceHeartbeat = agent.last_heartbeat
        ? (Date.now() - agent.last_heartbeat.getTime()) / 60000
        : Infinity;

      if (minutesSinceHeartbeat > 30 && agent.status !== 'STOPPED') {
        await this.slack.send(agentDownTemplate(
          agent.agent_name,
          Math.round(minutesSinceHeartbeat),
        ));
      }
    }
  }

  // Vérifie les métriques de performance toutes les 5 minutes
  @Cron('*/5 * * * *')
  async checkPerformanceMetrics(): Promise<void> {
    const metrics = await this.db.query<{
      agent_name: string;
      model: string;
      p95_latency_ms: number;
      error_rate_pct: number;
    }>(`
      SELECT
        a.name AS agent_name,
        lc.model,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY lc.latency_ms) AS p95_latency_ms,
        ROUND(COUNT(*) FILTER (WHERE lc.status = 'error')::NUMERIC / COUNT(*) * 100, 2)
          AS error_rate_pct
      FROM llm_calls lc
      JOIN agents a ON a.id = lc.agent_id
      WHERE lc.called_at >= NOW() - INTERVAL '15 minutes'
      GROUP BY a.name, lc.model
      HAVING COUNT(*) >= 5
    `);

    for (const m of metrics) {
      if (m.p95_latency_ms > 10000) {
        await this.slack.send(highLatencyTemplate(m.agent_name, m.model, m.p95_latency_ms, 10000));
      }
      if (m.error_rate_pct > 10) {
        await this.slack.send({
          severity: 'CRITICAL',
          title: `Taux d'erreur LLM critique — ${m.agent_name}`,
          description: `Taux d'erreur LLM: *${m.error_rate_pct}%* sur 15 min (seuil: 10%).`,
          agentName: m.agent_name,
          metric: 'llm_error_rate_pct',
          currentValue: m.error_rate_pct,
          threshold: 10,
          deduplicationKey: `llm-error-rate-${m.agent_name}`,
        });
      }
    }
  }

  // Vérifie l'activité du pipeline toutes les 30 minutes
  @Cron('*/30 * * * *')
  async checkPipelineActivity(): Promise<void> {
    const result = await this.db.query<{ leads_last_2h: string; last_lead_at: Date }>(`
      SELECT
        COUNT(*) AS leads_last_2h,
        MAX(detected_at) AS last_lead_at
      FROM leads
      WHERE detected_at >= NOW() - INTERVAL '2 hours'
    `);

    if (parseInt(result[0].leads_last_2h) === 0) {
      const lastLead = result[0].last_lead_at;
      const hoursSince = lastLead
        ? (Date.now() - lastLead.getTime()) / 3600000
        : 99;
      await this.slack.send(pipelineStoppedTemplate(lastLead, Math.round(hoursSince)));
    }
  }

  // Vérifie les budgets toutes les heures
  @Cron('0 * * * *')
  async checkBudgets(): Promise<void> {
    const budgets = await this.db.query<{
      agent_name: string;
      spent_usd: number;
      budget_usd: number;
      pct: number;
    }>(`
      SELECT a.name AS agent_name,
             COALESCE(SUM(lc.cost_usd), 0) AS spent_usd,
             ab.monthly_budget_usd AS budget_usd,
             ROUND(COALESCE(SUM(lc.cost_usd), 0) / ab.monthly_budget_usd * 100, 1) AS pct
      FROM agents a
      JOIN agent_budgets ab ON ab.agent_id = a.id
      LEFT JOIN llm_calls lc
        ON lc.agent_id = a.id
        AND lc.called_at >= date_trunc('month', CURRENT_DATE)
      GROUP BY a.name, ab.monthly_budget_usd
    `);

    for (const b of budgets) {
      if (b.pct >= 100) {
        await this.slack.send(budgetExceededTemplate(b.agent_name, b.spent_usd, b.budget_usd));
      } else if (b.pct >= 85) {
        await this.slack.send({
          severity: 'WARNING',
          title: `Budget LLM à ${b.pct}% — ${b.agent_name}`,
          description: `*${b.agent_name}* a consommé $${b.spent_usd.toFixed(2)} sur $${b.budget_usd.toFixed(2)} (${b.pct}%).`,
          metric: 'budget_used_pct',
          currentValue: b.pct,
          threshold: 85,
          deduplicationKey: `budget-85-${b.agent_name}`,
        });
      } else if (b.pct >= 70) {
        await this.slack.send({
          severity: 'INFO',
          title: `Budget LLM à ${b.pct}% — ${b.agent_name}`,
          description: `*${b.agent_name}* a consommé ${b.pct}% de son budget mensuel.`,
          deduplicationKey: `budget-70-${b.agent_name}`,
        });
      }
    }
  }
}
```

---

## Détection d'Anomalies

### Méthode : Z-Score sur fenêtre glissante 7 jours

Une anomalie est détectée quand une métrique s'écarte de plus de 2 écarts-types de sa moyenne historique sur 7 jours.

```typescript
// src/alerting/anomaly-detection.service.ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

interface MetricWindow {
  mean: number;
  stddev: number;
  current: number;
  zScore: number;
}

const MONITORED_METRICS = [
  { name: 'reply_rate_pct', label: 'Taux de réponse', threshold: 2.5 },
  { name: 'bounce_rate_pct', label: 'Taux de bounce', threshold: 2.0 },
  { name: 'leads_detected_daily', label: 'Leads détectés/jour', threshold: 2.5 },
  { name: 'enrichment_rate_pct', label: 'Taux enrichissement', threshold: 2.0 },
  { name: 'open_rate_pct', label: 'Taux d\'ouverture', threshold: 2.0 },
  { name: 'llm_daily_cost_usd', label: 'Coût LLM quotidien', threshold: 2.5 },
  { name: 'llm_p95_latency_ms', label: 'Latence LLM P95', threshold: 2.5 },
  { name: 'queue_depth_max', label: 'Profondeur queue max', threshold: 3.0 },
  { name: 'error_rate_pct', label: 'Taux d\'erreur global', threshold: 2.0 },
  { name: 'email_quality_score', label: 'Score qualité email', threshold: 2.0 },
] as const;

@Injectable()
export class AnomalyDetectionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly slack: SlackAlertService,
  ) {}

  @Cron('0 */4 * * *')  // Toutes les 4 heures
  async detectAnomalies(): Promise<void> {
    for (const metric of MONITORED_METRICS) {
      const window = await this.computeMetricWindow(metric.name);
      if (!window) continue;

      if (Math.abs(window.zScore) >= metric.threshold) {
        const direction = window.zScore > 0 ? 'hausse' : 'baisse';
        const emoji = window.zScore > 0 ? ':arrow_upper_right:' : ':arrow_lower_right:';

        await this.slack.send({
          severity: Math.abs(window.zScore) >= 3.0 ? 'CRITICAL' : 'WARNING',
          title: `Anomalie détectée — ${metric.label}`,
          description: [
            `${emoji} Anomalie statistique sur *${metric.label}* (Z-score: *${window.zScore.toFixed(2)}*).`,
            `\n• Valeur actuelle: *${window.current.toFixed(2)}*`,
            `\n• Moyenne 7j: *${window.mean.toFixed(2)}* ± ${window.stddev.toFixed(2)}`,
            `\n• Direction: *${direction} anormale*`,
          ].join(''),
          metric: metric.name,
          currentValue: window.current,
          threshold: metric.threshold,
          deduplicationKey: `anomaly-${metric.name}`,
          actions: [
            {
              text: ':bar_chart: Analyser',
              actionId: 'view_anomaly',
              url: `https://metabase.internal/dashboard/anomalies?metric=${metric.name}`,
            },
          ],
        });
      }
    }
  }

  private async computeMetricWindow(metricName: string): Promise<MetricWindow | null> {
    const result = await this.db.query<{
      current_value: number;
      hist_mean: number;
      hist_stddev: number;
    }>(`
      WITH historical AS (
        SELECT metric_value
        FROM daily_metrics_snapshots
        WHERE metric_name = $1
          AND snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
          AND snapshot_date < CURRENT_DATE
      ),
      current_val AS (
        SELECT metric_value
        FROM daily_metrics_snapshots
        WHERE metric_name = $1
          AND snapshot_date = CURRENT_DATE
        LIMIT 1
      )
      SELECT
        (SELECT metric_value FROM current_val) AS current_value,
        AVG(metric_value) AS hist_mean,
        STDDEV(metric_value) AS hist_stddev
      FROM historical
    `, [metricName]);

    if (!result[0] || result[0].current_value === null) return null;
    const { current_value, hist_mean, hist_stddev } = result[0];
    if (!hist_stddev || hist_stddev === 0) return null;

    return {
      mean: hist_mean,
      stddev: hist_stddev,
      current: current_value,
      zScore: (current_value - hist_mean) / hist_stddev,
    };
  }
}
```

### Schéma — snapshots métriques quotidiennes

```sql
CREATE TABLE daily_metrics_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  metric_name   VARCHAR(100) NOT NULL,
  metric_value  NUMERIC(12, 4) NOT NULL,
  agent_name    VARCHAR(100),  -- NULL = métrique globale
  computed_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(snapshot_date, metric_name, agent_name)
);
CREATE INDEX idx_snapshots_name_date ON daily_metrics_snapshots(metric_name, snapshot_date DESC);

-- Job de calcul quotidien (à 23:45)
-- Les métriques sont calculées et insérées par un cron job
```

---

## Procédures d'Escalade

### Flux d'escalade

```
Alerte CRITICAL détectée
        │
        ▼
Slack #critical-alerts
        │
        │ Non acquittée dans 15 minutes
        ▼
SMS au responsable technique
(via Twilio / AWS SNS)
        │
        │ Toujours non acquittée dans 30 min
        ▼
Appel téléphonique automatique
(message vocal synthesisé)
        │
        │ Toujours non résolu dans 1h
        ▼
Slack DM au CTO + backup
+ Création ticket PagerDuty
```

### Service d'escalade

```typescript
// src/alerting/escalation.service.ts
import { Injectable } from '@nestjs/common';
import Twilio from 'twilio';

@Injectable()
export class EscalationService {
  private readonly twilioClient: Twilio.Twilio;
  private readonly activeEscalations = new Map<string, EscalationState>();

  constructor(private readonly config: ConfigService) {
    this.twilioClient = Twilio(
      config.get('TWILIO_ACCOUNT_SID'),
      config.get('TWILIO_AUTH_TOKEN'),
    );
  }

  async startEscalation(alertKey: string, alertTitle: string): Promise<void> {
    if (this.activeEscalations.has(alertKey)) return;

    const state: EscalationState = {
      alertKey,
      alertTitle,
      startedAt: Date.now(),
      acknowledged: false,
      escalationLevel: 0,
    };
    this.activeEscalations.set(alertKey, state);

    // Planifier les escalades
    setTimeout(() => this.escalateToSms(alertKey), 15 * 60 * 1000);
    setTimeout(() => this.escalateToCall(alertKey), 30 * 60 * 1000);
    setTimeout(() => this.escalateToCto(alertKey), 60 * 60 * 1000);
  }

  acknowledge(alertKey: string, acknowledgedBy: string): void {
    const state = this.activeEscalations.get(alertKey);
    if (state) {
      state.acknowledged = true;
      state.acknowledgedBy = acknowledgedBy;
      this.activeEscalations.delete(alertKey);
    }
  }

  private async escalateToSms(alertKey: string): Promise<void> {
    const state = this.activeEscalations.get(alertKey);
    if (!state || state.acknowledged) return;

    await this.twilioClient.messages.create({
      body: `[CRITICAL] ProspectionAgentic: ${state.alertTitle}. Connectez-vous sur Slack #critical-alerts.`,
      from: this.config.get('TWILIO_FROM_NUMBER'),
      to: this.config.get('ON_CALL_PHONE'),
    });
  }

  private async escalateToCall(alertKey: string): Promise<void> {
    const state = this.activeEscalations.get(alertKey);
    if (!state || state.acknowledged) return;

    await this.twilioClient.calls.create({
      twiml: `<Response><Say language="fr-FR">
        Alerte critique ProspectionAgentic non résolue depuis 30 minutes.
        Problème : ${state.alertTitle}.
        Connectez-vous immédiatement sur Slack.
      </Say></Response>`,
      from: this.config.get('TWILIO_FROM_NUMBER'),
      to: this.config.get('ON_CALL_PHONE'),
    });
  }

  private async escalateToCto(alertKey: string): Promise<void> {
    const state = this.activeEscalations.get(alertKey);
    if (!state || state.acknowledged) return;

    await this.slack.send({
      severity: 'CRITICAL',
      title: `ESCALADE — ${state.alertTitle}`,
      description: `Alerte non résolue depuis 1h. Escalade au CTO.`,
      deduplicationKey: `escalation-cto-${alertKey}`,
    });
  }
}

interface EscalationState {
  alertKey: string;
  alertTitle: string;
  startedAt: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  escalationLevel: number;
}
```

---

## Prévention de la Fatigue d'Alerte

### Stratégies implémentées

**1. Agrégation temporelle** — Si 5+ alertes WARNING arrivent dans les 5 minutes, elles sont groupées en un seul message.

```typescript
// src/alerting/alert-aggregator.service.ts
@Injectable()
export class AlertAggregatorService {
  private pending = new Map<string, AlertPayload[]>();
  private flushTimers = new Map<string, NodeJS.Timeout>();
  private readonly AGGREGATION_WINDOW_MS = 5 * 60 * 1000;
  private readonly MIN_FOR_AGGREGATION = 3;

  async queue(alert: AlertPayload): Promise<void> {
    if (alert.severity === 'CRITICAL') {
      // Les alertes critiques ne sont jamais agrégées
      await this.slack.send(alert);
      return;
    }

    const bucketKey = `${alert.severity}-${alert.agentName ?? 'global'}`;
    const bucket = this.pending.get(bucketKey) ?? [];
    bucket.push(alert);
    this.pending.set(bucketKey, bucket);

    // Réinitialiser le timer de flush
    const existing = this.flushTimers.get(bucketKey);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(
      () => this.flush(bucketKey),
      this.AGGREGATION_WINDOW_MS,
    );
    this.flushTimers.set(bucketKey, timer);

    // Flush immédiat si beaucoup d'alertes
    if (bucket.length >= 10) {
      clearTimeout(timer);
      await this.flush(bucketKey);
    }
  }

  private async flush(bucketKey: string): Promise<void> {
    const alerts = this.pending.get(bucketKey) ?? [];
    this.pending.delete(bucketKey);
    this.flushTimers.delete(bucketKey);

    if (alerts.length === 0) return;

    if (alerts.length < this.MIN_FOR_AGGREGATION) {
      for (const a of alerts) await this.slack.send(a);
      return;
    }

    // Message agrégé
    const summary = alerts.map(a => `• ${a.title}`).join('\n');
    await this.slack.send({
      severity: alerts[0].severity,
      title: `${alerts.length} alertes ${alerts[0].severity} — ${alerts[0].agentName ?? 'Système'}`,
      description: `*Alertes groupées sur la dernière fenêtre de 5 minutes:*\n${summary}`,
      deduplicationKey: `aggregated-${bucketKey}`,
    });
  }
}
```

**2. Cooldowns par clé de déduplication** — Empêche la répétition de la même alerte.

**3. Filtre heures de bureau** — Les alertes INFO ne sont envoyées qu'entre 8h et 20h, lundi-vendredi.

**4. Suppression des flapping** — Une alerte qui s'active et se désactive rapidement (< 5 min) est supprimée.

```typescript
// Anti-flapping : n'alerter que si la condition persiste 2 cycles consécutifs
private readonly flapBuffer = new Map<string, number>();

async checkWithAntiFlap(key: string, condition: boolean, alertFn: () => Promise<void>): Promise<void> {
  const count = this.flapBuffer.get(key) ?? 0;
  if (condition) {
    this.flapBuffer.set(key, count + 1);
    if (count + 1 >= 2) {
      await alertFn();
    }
  } else {
    this.flapBuffer.delete(key);
  }
}
```

---

## Digest Quotidien — 22h00

### Format du message

Le digest est envoyé automatiquement à 22h00 tous les jours sur `#pipeline-metrics`.

```typescript
// src/alerting/daily-digest.service.ts
@Injectable()
export class DailyDigestService {
  @Cron('0 22 * * *')
  async sendDailyDigest(): Promise<void> {
    const stats = await this.computeDailyStats();

    const blocks: KnownBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `:bar_chart: Rapport quotidien — ${new Date().toLocaleDateString('fr-FR')}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Leads détectés:*\n${stats.leadsDetected}` },
          { type: 'mrkdwn', text: `*Leads enrichis:*\n${stats.leadsEnriched} (${stats.enrichmentRate}%)` },
          { type: 'mrkdwn', text: `*Emails envoyés:*\n${stats.emailsSent}` },
          { type: 'mrkdwn', text: `*Taux de réponse:*\n${stats.replyRate}%` },
          { type: 'mrkdwn', text: `*Coût LLM total:*\n$${stats.totalCostUsd}` },
          { type: 'mrkdwn', text: `*Erreurs:*\n${stats.totalErrors} (${stats.criticalErrors} critiques)` },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Agents actifs aujourd\'hui:*' },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: stats.agentSummaries.map(a =>
            `${a.status === 'ok' ? ':white_check_mark:' : ':x:'} *${a.name}* — ${a.executions} exécutions · $${a.cost}`
          ).join('\n'),
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: stats.alerts.length > 0
            ? `*Alertes du jour:* ${stats.alerts.length}\n${stats.alerts.slice(0, 5).map(a => `• ${a}`).join('\n')}`
            : '*Aucune alerte critique aujourd\'hui* :tada:',
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: ':bar_chart: Dashboard complet', emoji: true },
            url: 'https://metabase.internal/dashboard/1',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: ':money_with_wings: Coûts détaillés', emoji: true },
            url: 'https://metabase.internal/dashboard/costs',
          },
        ],
      },
    ];

    await this.slack.client.chat.postMessage({
      channel: '#pipeline-metrics',
      text: `Rapport quotidien du ${new Date().toLocaleDateString('fr-FR')}`,
      blocks,
    });
  }

  private async computeDailyStats(): Promise<DailyStats> {
    const today = new Date().toISOString().split('T')[0];
    const [leads, emails, costs, errors, agents] = await Promise.all([
      this.db.query(`
        SELECT
          COUNT(*) AS detected,
          COUNT(*) FILTER (WHERE enriched_at IS NOT NULL) AS enriched,
          ROUND(COUNT(*) FILTER (WHERE enriched_at IS NOT NULL)::NUMERIC / COUNT(*) * 100, 1) AS enrichment_rate
        FROM leads WHERE DATE(detected_at) = $1
      `, [today]),
      this.db.query(`
        SELECT
          COUNT(*) AS sent,
          COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS replied,
          ROUND(COUNT(*) FILTER (WHERE replied_at IS NOT NULL)::NUMERIC /
            NULLIF(COUNT(*) FILTER (WHERE first_contact_at IS NOT NULL), 0) * 100, 1) AS reply_rate
        FROM leads WHERE DATE(first_contact_at) = $1
      `, [today]),
      this.db.query(`
        SELECT ROUND(SUM(cost_usd)::NUMERIC, 2) AS total FROM llm_calls
        WHERE DATE(called_at) = $1
      `, [today]),
      this.db.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE error_code LIKE 'E00%') AS critical
        FROM agent_errors WHERE DATE(occurred_at) = $1
      `, [today]),
      this.db.query(`
        SELECT a.name, COUNT(ae.id) AS executions,
               ROUND(SUM(lc.cost_usd)::NUMERIC, 2) AS cost,
               MAX(CASE WHEN ae.status = 'failed' THEN 0 ELSE 1 END) AS ok
        FROM agents a
        LEFT JOIN agent_executions ae ON ae.agent_id = a.id AND DATE(ae.started_at) = $1
        LEFT JOIN llm_calls lc ON lc.execution_id = ae.id
        GROUP BY a.name
      `, [today]),
    ]);

    return {
      leadsDetected: leads[0].detected,
      leadsEnriched: leads[0].enriched,
      enrichmentRate: leads[0].enrichment_rate ?? 0,
      emailsSent: emails[0].sent,
      replyRate: emails[0].reply_rate ?? 0,
      totalCostUsd: costs[0].total ?? '0.00',
      totalErrors: errors[0].total,
      criticalErrors: errors[0].critical,
      agentSummaries: agents.map(a => ({
        name: a.name,
        executions: a.executions ?? 0,
        cost: a.cost ?? '0.00',
        status: a.ok ? 'ok' : 'error',
      })),
      alerts: [],  // Chargé séparément depuis le log d'alertes
    };
  }
}
```

---

## Rapport Hebdomadaire — Lundi 9h00

### Format du rapport

```typescript
// src/alerting/weekly-report.service.ts
@Injectable()
export class WeeklyReportService {
  @Cron('0 9 * * 1')  // Lundi à 9h00
  async sendWeeklyReport(): Promise<void> {
    const stats = await this.computeWeeklyStats();
    const trends = await this.computeTrends(stats);

    const blocks: KnownBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `:chart_with_upwards_trend: Rapport Hebdomadaire — Semaine ${stats.weekNumber}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Période:* ${stats.periodStart} → ${stats.periodEnd}`,
        },
      },
      { type: 'divider' },
      // KPIs principaux
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*:dart: KPIs de la semaine*' },
        fields: [
          { type: 'mrkdwn', text: `*Leads traités:*\n${stats.totalLeads} ${trends.leads}` },
          { type: 'mrkdwn', text: `*Emails envoyés:*\n${stats.emailsSent} ${trends.emails}` },
          { type: 'mrkdwn', text: `*Taux de réponse:*\n${stats.replyRate}% ${trends.replyRate}` },
          { type: 'mrkdwn', text: `*Réunions bookées:*\n${stats.meetingsBooked} ${trends.meetings}` },
          { type: 'mrkdwn', text: `*Coût LLM total:*\n$${stats.totalCost} ${trends.cost}` },
          { type: 'mrkdwn', text: `*Disponibilité agents:*\n${stats.uptime}%` },
        ],
      },
      { type: 'divider' },
      // Top leads
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*:trophy: Performances agents*\n${
            stats.agentPerformance.map(a =>
              `*${a.name}:* ${a.executions} exéc · ${a.successRate}% succès · $${a.cost}`
            ).join('\n')
          }`,
        },
      },
      { type: 'divider' },
      // Anomalies détectées
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: stats.anomaliesDetected > 0
            ? `*:warning: Anomalies détectées cette semaine:* ${stats.anomaliesDetected}\n${
                stats.anomalyDetails.slice(0, 3).map(a => `• ${a}`).join('\n')
              }`
            : '*:white_check_mark: Aucune anomalie statistique détectée cette semaine*',
        },
      },
      { type: 'divider' },
      // Recommandations
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*:bulb: Recommandations automatiques:*\n${
            stats.recommendations.map(r => `• ${r}`).join('\n')
          }`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: ':bar_chart: Dashboard complet', emoji: true },
            url: 'https://metabase.internal/dashboard/weekly',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: ':page_facing_up: Rapport PDF', emoji: true },
            url: `https://app.internal/reports/weekly/${stats.weekNumber}`,
          },
        ],
      },
    ];

    await this.slack.client.chat.postMessage({
      channel: '#pipeline-metrics',
      text: `Rapport hebdomadaire — Semaine ${stats.weekNumber}`,
      blocks,
    });
  }

  // Calcul des tendances (flèches haut/bas)
  private computeTrends(current: WeeklyStats): Record<string, string> {
    return {
      leads: current.leadsVsPrevWeek > 5 ? ':arrow_upper_right:' : current.leadsVsPrevWeek < -5 ? ':arrow_lower_right:' : ':arrow_right:',
      emails: current.emailsVsPrevWeek > 5 ? ':arrow_upper_right:' : ':arrow_right:',
      replyRate: current.replyRateVsPrevWeek > 0.5 ? ':arrow_upper_right: +' + current.replyRateVsPrevWeek.toFixed(1) + 'pts' : ':arrow_right:',
      meetings: current.meetingsVsPrevWeek > 0 ? ':arrow_upper_right:' : ':arrow_right:',
      cost: current.costVsPrevWeek > 10 ? ':arrow_upper_right: +' + current.costVsPrevWeek.toFixed(0) + '%' : ':white_check_mark:',
    };
  }
}
```

---

## Variables d'environnement requises

```dotenv
# Slack
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL_CRITICAL=#critical-alerts
SLACK_CHANNEL_WARNINGS=#agent-alerts
SLACK_CHANNEL_INFO=#agent-alerts
SLACK_CHANNEL_METRICS=#pipeline-metrics

# Escalade SMS/Appel (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM_NUMBER=+33XXXXXXXXX
ON_CALL_PHONE=+33XXXXXXXXX

# Configuration alerting
ALERT_BUDGET_WARNING_PCT=70
ALERT_BUDGET_CRITICAL_PCT=85
ALERT_AGENT_DOWN_MINUTES=30
ALERT_LLM_P95_WARNING_MS=10000
ALERT_LLM_ERROR_RATE_CRITICAL_PCT=10
ALERT_PIPELINE_STOPPED_HOURS=2
ALERT_BOUNCE_RATE_CRITICAL_PCT=15
```
