# SOUS-AGENT 7c — DETECTEUR D'ANOMALIES
**Agent parent** : AGENT-7-MASTER.md

**Version :** 1.0
**Date :** 2026-03-18
**Auteur :** Systeme Axiom Marketing

---

## MISSION

Detecter en temps reel (ou quasi-temps-reel via cron toutes les heures) les anomalies dans les metriques du pipeline. Utilise des z-scores sur des moving averages de 7 jours, des seuils fixes, et des alertes Slack immediates.

---

## SEUILS DE DETECTION

| Metrique | Normal | WARNING (1.5 sigma) | CRITICAL (2.5 sigma) | Seuil fixe CRITICAL |
|---|---|---|---|---|
| Reply rate quotidien | 4-7% | < 3% ou > 9% | < 2% ou > 11% | < 1% |
| Bounce rate quotidien | 0.5-2% | > 3% | > 5% | > 5% |
| Leads detectes / jour | 30-80 | < 15 ou > 120 | < 5 ou > 200 | 0 (systeme down) |
| Emails envoyes / jour | 10-50 | < 5 ou > 80 | 0 ou > 100 | 0 (systeme down) |
| Opt-out rate / jour | 0-0.3% | > 0.5% | > 1% | > 2% |
| Score moyen | 40-55 | < 30 ou > 65 | < 20 ou > 75 | - |
| Distribution HOT | 8-15% | > 25% ou < 3% | > 40% ou < 1% | - |
| Taux enrichissement | 70-90% | < 60% | < 40% | < 20% |
| SLA breaches / jour | 0-1 | 2-3 | > 5 | > 10 |
| Nurture engagement moyen | 20-50 | < 10 | < 5 | - |

---

## CODE TYPESCRIPT : DETECTEUR D'ANOMALIES

```typescript
// sous-agents/7c-detecteur.ts
import { Pool } from 'pg'
import { WebClient } from '@slack/web-api'

const pool = new Pool({ /* config */ })
const slack = new WebClient(process.env.SLACK_BOT_TOKEN)

interface Anomaly {
  metrique: string
  valeur_actuelle: number
  moyenne_7j: number
  ecart_type: number
  z_score: number
  seuil_type: 'WARNING' | 'CRITICAL'
  message: string
}

// Table des alertes
// CREATE TABLE IF NOT EXISTS alertes (
//   id SERIAL PRIMARY KEY,
//   date_detection TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
//   metrique VARCHAR(100) NOT NULL,
//   valeur_actuelle NUMERIC NOT NULL,
//   moyenne_7j NUMERIC NOT NULL,
//   z_score NUMERIC,
//   seuil_type VARCHAR(20) NOT NULL CHECK (seuil_type IN ('WARNING', 'CRITICAL')),
//   message TEXT NOT NULL,
//   acknowledged BOOLEAN DEFAULT false,
//   acknowledged_by VARCHAR(100),
//   acknowledged_at TIMESTAMP WITH TIME ZONE,
//   resolved BOOLEAN DEFAULT false,
//   resolved_at TIMESTAMP WITH TIME ZONE
// );
// CREATE INDEX idx_alertes_date ON alertes(date_detection DESC);
// CREATE INDEX idx_alertes_resolved ON alertes(resolved) WHERE resolved = false;

export async function detectAnomalies(date?: string): Promise<Anomaly[]> {
  const snapshotDate = date || new Date().toISOString().split('T')[0]
  const anomalies: Anomaly[] = []

  // Charger les 8 derniers jours (1 jour courant + 7 jours pour le calcul)
  const result = await pool.query(`
    SELECT *
    FROM metriques_daily
    WHERE date_snapshot >= ($1::date - 7) AND date_snapshot <= $1
    ORDER BY date_snapshot ASC
  `, [snapshotDate])

  if (result.rows.length < 2) {
    console.log('[7c] Pas assez de donnees pour la detection (< 2 jours)')
    return []
  }

  const today = result.rows[result.rows.length - 1]
  const history = result.rows.slice(0, -1) // Les 7 jours precedents

  // Liste des metriques a surveiller avec leurs seuils
  const metricsToMonitor = [
    {
      name: 'suiveur_reply_rate',
      label: 'Taux de reponse',
      warningLow: 3, criticalLow: 2,
      warningHigh: 9, criticalHigh: 11,
      fixedCriticalLow: 1,
    },
    {
      name: 'suiveur_bounce_rate',
      label: 'Taux de bounce',
      warningHigh: 3, criticalHigh: 5,
      fixedCriticalHigh: 5,
    },
    {
      name: 'veilleur_leads_bruts',
      label: 'Leads detectes',
      warningLow: 15, criticalLow: 5,
      warningHigh: 120, criticalHigh: 200,
      fixedCriticalLow: 0,
    },
    {
      name: 'suiveur_emails_envoyes',
      label: 'Emails envoyes',
      warningLow: 5, criticalLow: 0,
      warningHigh: 80, criticalHigh: 100,
      fixedCriticalLow: 0,
    },
    {
      name: 'enrichisseur_taux_enrichissement',
      label: 'Taux enrichissement',
      warningLow: 60, criticalLow: 40,
    },
    {
      name: 'suiveur_sla_breaches',
      label: 'SLA breaches',
      warningHigh: 3, criticalHigh: 5,
      fixedCriticalHigh: 10,
    },
    {
      name: 'scoreur_pct_hot',
      label: 'Distribution HOT',
      warningLow: 3, criticalLow: 1,
      warningHigh: 25, criticalHigh: 40,
    },
  ]

  for (const metric of metricsToMonitor) {
    const currentValue = parseFloat(today[metric.name]) || 0
    const historicalValues = history.map(h => parseFloat(h[metric.name]) || 0)
    const mean = historicalValues.reduce((a, b) => a + b, 0) / Math.max(historicalValues.length, 1)
    const stddev = Math.sqrt(
      historicalValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / Math.max(historicalValues.length, 1)
    )
    const zScore = stddev > 0 ? (currentValue - mean) / stddev : 0

    // Verifier seuils fixes d'abord (plus urgent)
    if (metric.fixedCriticalLow !== undefined && currentValue <= metric.fixedCriticalLow) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'CRITICAL',
        message: `${metric.label} = ${currentValue} (seuil critique fixe: ${metric.fixedCriticalLow}). SYSTEME POTENTIELLEMENT EN PANNE.`,
      })
      continue
    }

    if (metric.fixedCriticalHigh !== undefined && currentValue >= metric.fixedCriticalHigh) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'CRITICAL',
        message: `${metric.label} = ${currentValue} (seuil critique fixe: ${metric.fixedCriticalHigh}). ANOMALIE MAJEURE.`,
      })
      continue
    }

    // Verifier z-score (anomalies statistiques)
    if (Math.abs(zScore) > 2.5) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'CRITICAL',
        message: `${metric.label} = ${currentValue} (moyenne 7j: ${mean.toFixed(1)}, z-score: ${zScore.toFixed(1)}). Ecart > 2.5 sigma.`,
      })
    } else if (Math.abs(zScore) > 1.5) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'WARNING',
        message: `${metric.label} = ${currentValue} (moyenne 7j: ${mean.toFixed(1)}, z-score: ${zScore.toFixed(1)}). Ecart > 1.5 sigma.`,
      })
    }

    // Verifier seuils fixes WARNING/CRITICAL
    if (metric.criticalLow !== undefined && currentValue < metric.criticalLow) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'CRITICAL',
        message: `${metric.label} = ${currentValue} (seuil critique bas: ${metric.criticalLow}).`,
      })
    } else if (metric.warningLow !== undefined && currentValue < metric.warningLow) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'WARNING',
        message: `${metric.label} = ${currentValue} (seuil warning bas: ${metric.warningLow}).`,
      })
    }

    if (metric.criticalHigh !== undefined && currentValue > metric.criticalHigh) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'CRITICAL',
        message: `${metric.label} = ${currentValue} (seuil critique haut: ${metric.criticalHigh}).`,
      })
    } else if (metric.warningHigh !== undefined && currentValue > metric.warningHigh) {
      anomalies.push({
        metrique: metric.label,
        valeur_actuelle: currentValue,
        moyenne_7j: mean,
        ecart_type: stddev,
        z_score: zScore,
        seuil_type: 'WARNING',
        message: `${metric.label} = ${currentValue} (seuil warning haut: ${metric.warningHigh}).`,
      })
    }
  }

  // Persister les anomalies
  for (const anomaly of anomalies) {
    await pool.query(`
      INSERT INTO alertes (metrique, valeur_actuelle, moyenne_7j, z_score, seuil_type, message)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [anomaly.metrique, anomaly.valeur_actuelle, anomaly.moyenne_7j, anomaly.z_score, anomaly.seuil_type, anomaly.message])
  }

  // Envoyer les alertes Slack
  if (anomalies.length > 0) {
    await sendAnomalySlackAlert(anomalies, snapshotDate)
  }

  console.log(`[7c] Detection terminee: ${anomalies.length} anomalies (${anomalies.filter(a => a.seuil_type === 'CRITICAL').length} critiques)`)
  return anomalies
}

async function sendAnomalySlackAlert(anomalies: Anomaly[], date: string): Promise<void> {
  const criticals = anomalies.filter(a => a.seuil_type === 'CRITICAL')
  const warnings = anomalies.filter(a => a.seuil_type === 'WARNING')

  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: criticals.length > 0
          ? `ALERTE CRITIQUE -- ${date}`
          : `Attention -- ${date}`,
      }
    },
  ]

  if (criticals.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*ANOMALIES CRITIQUES (${criticals.length}) :*\n` +
          criticals.map(a =>
            `> *${a.metrique}* : ${a.valeur_actuelle} (moy. 7j: ${a.moyenne_7j.toFixed(1)}, z: ${a.z_score.toFixed(1)})\n> ${a.message}`
          ).join('\n\n'),
      }
    })
  }

  if (warnings.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Warnings (${warnings.length}) :*\n` +
          warnings.map(a =>
            `> ${a.metrique} : ${a.valeur_actuelle} (moy. 7j: ${a.moyenne_7j.toFixed(1)})`
          ).join('\n'),
      }
    })
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Voir le dashboard' },
        url: `${process.env.METABASE_URL}/dashboard/1`,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Acknowledger' },
        action_id: 'acknowledge_alert',
        value: date,
        style: 'primary',
      },
    ]
  })

  await slack.chat.postMessage({
    channel: criticals.length > 0 ? '#alerts-critical' : '#pipeline-metrics',
    text: `${criticals.length > 0 ? 'ALERTE CRITIQUE' : 'Warning'} pipeline ${date}`,
    blocks,
  })

  // Si CRITICAL, aussi DM a Jonathan
  if (criticals.length > 0) {
    await slack.chat.postMessage({
      channel: process.env.JONATHAN_SLACK_ID || '@jonathan',
      text: `ALERTE CRITIQUE pipeline ${date} :\n${criticals.map(a => `- ${a.message}`).join('\n')}`,
    })
  }
}
```

---

## TABLE SQL : alertes

```sql
CREATE TABLE IF NOT EXISTS alertes (
  id SERIAL PRIMARY KEY,
  date_detection TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metrique VARCHAR(100) NOT NULL,
  valeur_actuelle NUMERIC NOT NULL,
  moyenne_7j NUMERIC NOT NULL,
  z_score NUMERIC,
  seuil_type VARCHAR(20) NOT NULL CHECK (seuil_type IN ('WARNING', 'CRITICAL')),
  message TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by VARCHAR(100),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_alertes_date ON alertes(date_detection DESC);
CREATE INDEX idx_alertes_resolved ON alertes(resolved) WHERE resolved = false;
CREATE INDEX idx_alertes_seuil ON alertes(seuil_type);
```

---

## MATRICE DES ALERTES

| Anomalie | Seuil WARNING | Seuil CRITICAL | Canal | Delai |
|---|---|---|---|---|
| Reply rate chute | < 3% (vs moy 7j -1.5 sigma) | < 2% (vs moy 7j -2.5 sigma) | #pipeline-metrics | Quotidien |
| Bounce rate explose | > 3% | > 5% | #alerts-critical + DM Jonathan | Immediat |
| 0 leads detectes | - | 0 leads en 24h | #alerts-critical + DM Jonathan | Immediat |
| 0 emails envoyes | - | 0 emails en 24h | #alerts-critical + DM Jonathan | Immediat |
| Opt-out spike | > 0.5% | > 1% | #pipeline-metrics | Quotidien |
| SLA breach accumulation | > 3 breaches/jour | > 5 breaches/jour | #pipeline-metrics | Quotidien |
| Scoring trop genereux (HOT > 25%) | > 25% | > 40% | #pipeline-metrics | Quotidien |
| Scoring trop strict (HOT < 3%) | < 3% | < 1% | #pipeline-metrics | Quotidien |
| API budget depasse 80% | > 80% du budget mensuel | > 100% | #alerts-critical | Quotidien |
| Enrichissement en panne | Taux < 60% | Taux < 40% | #alerts-critical + DM Jonathan | Immediat |

---

## FORMAT SLACK DES ALERTES

```
---------- ALERTE CRITICAL ----------
Date : 2026-03-18 21:50

ANOMALIE : Bounce rate explose
Valeur actuelle : 5.8%
Moyenne 7 jours : 1.2%
Z-score : 3.4

CAUSE PROBABLE :
  Domaine axiom-marketing.fr reputation degradee
  Ou changement politique ISP (Gmail/Outlook)

ACTIONS IMMEDIATES RECOMMANDEES :
  1. SUSPENDRE les envois sur axiom-marketing.fr
  2. ACTIVER le domaine backup (contact-axiom.fr)
  3. VERIFIER la reputation sur mail-tester.com
  4. AUDITER les derniers envois (spam words ?)

[Voir Dashboard]  [Acknowledger]
-----------------------------------------
```
