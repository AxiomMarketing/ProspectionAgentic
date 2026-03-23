# SOUS-AGENT 7b — GENERATEUR DE RAPPORTS
**Agent parent** : AGENT-7-MASTER.md

**Version :** 1.0
**Date :** 2026-03-18
**Auteur :** Systeme Axiom Marketing

---

## MISSION

Generer 3 types de rapports a frequence fixe : digest quotidien (22h), rapport hebdomadaire (lundi 9h), rapport mensuel strategique (1er du mois). Chaque rapport est genere en texte structure, resume par Claude API, et envoye via Slack + email.

---

## CODE TYPESCRIPT : GENERATEUR DE RAPPORTS

```typescript
// sous-agents/7b-generateur.ts
import Anthropic from '@anthropic-ai/sdk'
import { WebClient } from '@slack/web-api'
import { Pool } from 'pg'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const slack = new WebClient(process.env.SLACK_BOT_TOKEN)
const pool = new Pool({ /* config */ })

// === DIGEST QUOTIDIEN (22h) ===

export async function generateDailyDigest(date?: string): Promise<string> {
  const snapshotDate = date || new Date().toISOString().split('T')[0]

  // Charger les metriques du jour et de la veille
  const result = await pool.query(`
    SELECT *
    FROM metriques_daily
    WHERE date_snapshot IN ($1, $1::date - 1)
    ORDER BY date_snapshot DESC
  `, [snapshotDate])

  const today = result.rows[0]
  const yesterday = result.rows[1]

  if (!today) {
    console.error(`[7b] Pas de snapshot pour ${snapshotDate}`)
    return ''
  }

  // Calculer les deltas
  const delta = (field: string): string => {
    if (!yesterday) return 'N/A'
    const todayVal = parseFloat(today[field]) || 0
    const yestVal = parseFloat(yesterday[field]) || 0
    const diff = todayVal - yestVal
    const pct = yestVal > 0 ? Math.round((diff / yestVal) * 100) : 0
    if (diff > 0) return `+${diff} (+${pct}%)`
    if (diff < 0) return `${diff} (${pct}%)`
    return '='
  }

  // Determiner le statut global
  const replyRate = today.suiveur_reply_rate || 0
  const bounceRate = today.suiveur_bounce_rate || 0
  const healthStatus = replyRate >= 5 && bounceRate < 2 ? 'VERT' :
    replyRate >= 3 && bounceRate < 3 ? 'JAUNE' : 'ROUGE'

  const digestText = `
AXIOM MARKETING -- DIGEST QUOTIDIEN
${snapshotDate} | Statut: ${healthStatus}
${'='.repeat(50)}

PIPELINE AUJOURD'HUI :
  Leads detectes : ${today.veilleur_leads_bruts} (${delta('veilleur_leads_bruts')})
  Leads qualifies : ${today.veilleur_leads_qualifies} (${delta('veilleur_leads_qualifies')})
  Emails envoyes : ${today.suiveur_emails_envoyes} (${delta('suiveur_emails_envoyes')})
  Taux reponse : ${today.suiveur_reply_rate}% (${delta('suiveur_reply_rate')})
  Reponses positives : ${today.suiveur_reponses_positives} (${delta('suiveur_reponses_positives')})

SCORING :
  HOT: ${today.scoreur_nb_hot} | WARM: ${today.scoreur_nb_warm} | COLD: ${today.scoreur_nb_cold} | DISQ: ${today.scoreur_nb_disqualifie}
  Score moyen : ${today.scoreur_score_moyen}

NURTURE :
  Total en nurture : ${today.nurtureur_total_en_nurture}
  Reclassifies HOT : ${today.nurtureur_reclassifies_hot}

BUSINESS :
  Deals gagnes : ${today.pipeline_deals_gagnes}
  Revenu du jour : ${today.pipeline_revenu_jour} EUR
  Pipeline total : ${today.pipeline_valeur_totale} EUR

COUTS : ${today.cout_total_jour_eur} EUR
${'='.repeat(50)}
  `.trim()

  // Envoyer via Slack
  await slack.chat.postMessage({
    channel: '#pipeline-metrics',
    text: digestText,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `Digest ${snapshotDate} | ${healthStatus === 'VERT' ? 'Vert' : healthStatus === 'JAUNE' ? 'Jaune' : 'Rouge'}` }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Leads detectes*\n${today.veilleur_leads_bruts}` },
          { type: 'mrkdwn', text: `*Emails envoyes*\n${today.suiveur_emails_envoyes}` },
          { type: 'mrkdwn', text: `*Taux reponse*\n${today.suiveur_reply_rate}%` },
          { type: 'mrkdwn', text: `*Reponses positives*\n${today.suiveur_reponses_positives}` },
          { type: 'mrkdwn', text: `*Deals gagnes*\n${today.pipeline_deals_gagnes}` },
          { type: 'mrkdwn', text: `*Revenu*\n${today.pipeline_revenu_jour} EUR` },
        ]
      },
    ]
  })

  // Envoyer par email
  await sendEmail({
    to: 'jonathan@axiom-marketing.fr',
    subject: `[Axiom] Digest ${snapshotDate} | ${healthStatus}`,
    body: digestText,
  })

  return digestText
}

// === RAPPORT HEBDOMADAIRE (Lundi 9h) ===

export async function generateWeeklyReport(): Promise<string> {
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  // Charger les 7 derniers jours + 7 jours precedents (pour comparaison)
  const result = await pool.query(`
    SELECT *
    FROM metriques_daily
    WHERE date_snapshot >= ($1::date - 7) AND date_snapshot <= $2
    ORDER BY date_snapshot ASC
  `, [startDate, endDate])

  const thisWeek = result.rows.filter(r => r.date_snapshot >= startDate)
  const lastWeek = result.rows.filter(r => r.date_snapshot < startDate)

  // Aggreger par semaine
  const sumField = (rows: any[], field: string): number =>
    rows.reduce((acc, r) => acc + (parseFloat(r[field]) || 0), 0)

  const avgField = (rows: any[], field: string): number => {
    const vals = rows.map(r => parseFloat(r[field]) || 0)
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }

  // Generer les donnees structurees
  const weekData = {
    leads: sumField(thisWeek, 'veilleur_leads_bruts'),
    leads_prev: sumField(lastWeek, 'veilleur_leads_bruts'),
    qualifies: sumField(thisWeek, 'veilleur_leads_qualifies'),
    emails: sumField(thisWeek, 'suiveur_emails_envoyes'),
    reply_rate: avgField(thisWeek, 'suiveur_reply_rate'),
    reply_rate_prev: avgField(lastWeek, 'suiveur_reply_rate'),
    positive_replies: sumField(thisWeek, 'suiveur_reponses_positives'),
    deals: sumField(thisWeek, 'pipeline_deals_gagnes'),
    revenue: sumField(thisWeek, 'pipeline_revenu_jour'),
    pipeline: thisWeek.length > 0 ? thisWeek[thisWeek.length - 1].pipeline_valeur_totale : 0,
    hot: sumField(thisWeek, 'scoreur_nb_hot'),
    warm: sumField(thisWeek, 'scoreur_nb_warm'),
    cold: sumField(thisWeek, 'scoreur_nb_cold'),
    nurture_total: thisWeek.length > 0 ? thisWeek[thisWeek.length - 1].nurtureur_total_en_nurture : 0,
    reclassifies: sumField(thisWeek, 'nurtureur_reclassifies_hot'),
    costs: sumField(thisWeek, 'cout_total_jour_eur'),
    bounces: sumField(thisWeek, 'suiveur_emails_bounced'),
    bounce_rate: avgField(thisWeek, 'suiveur_bounce_rate'),
    optouts: sumField(thisWeek, 'suiveur_opt_outs') + sumField(thisWeek, 'nurtureur_opt_outs'),
  }

  // Appeler Claude API pour generer le resume avec recommandations
  const claudeResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `Tu es l'Agent 7 ANALYSTE du systeme de prospection Axiom Marketing.
Tu generes un rapport hebdomadaire pour Jonathan, le fondateur.
Ton ton est direct, factuel, actionnable. Pas de formalites excessives.
Tu identifies les 2-3 points cles et fais des recommandations concretes.
Tu compares systematiquement a la semaine precedente et aux objectifs.
Objectifs Phase 1 : reply rate >= 5%, bounce rate < 2%, 2-4 deals/semaine, 10K-20K EUR/semaine.`,
    messages: [{
      role: 'user',
      content: `Voici les donnees de la semaine ${startDate} -> ${endDate} :
${JSON.stringify(weekData, null, 2)}

Genere un rapport hebdomadaire structure avec :
1. Resume executif (3 lignes max)
2. Funnel de la semaine (leads -> qualifies -> contactes -> reponses -> deals)
3. Performance templates (si des donnees A/B sont disponibles)
4. Performance par segment
5. Top 3 recommandations (une par agent si possible)
6. Prevision semaine prochaine`
    }]
  })

  const claudeSummary = claudeResponse.content[0].type === 'text'
    ? claudeResponse.content[0].text
    : ''

  // Construire le rapport complet
  const reportText = `
${'='.repeat(60)}
AXIOM MARKETING -- RAPPORT HEBDOMADAIRE
Semaine du ${startDate} au ${endDate}
Agent 7 ANALYSTE
${'='.repeat(60)}

METRIQUES CLES
${'─'.repeat(60)}
Metrique                   Semaine   Sem. prec.  Objectif   Statut
${'─'.repeat(60)}
Leads detectes             ${weekData.leads.toString().padEnd(10)} ${weekData.leads_prev.toString().padEnd(12)} 80-120     ${weekData.leads >= 80 ? 'OK' : 'BAS'}
Leads qualifies            ${weekData.qualifies.toString().padEnd(10)} -            20-40      ${weekData.qualifies >= 20 ? 'OK' : 'BAS'}
Emails envoyes             ${weekData.emails.toString().padEnd(10)} -            50-100     ${weekData.emails >= 50 ? 'OK' : 'BAS'}
Taux reponse               ${weekData.reply_rate.toFixed(1)}%      ${weekData.reply_rate_prev.toFixed(1)}%        >= 5%      ${weekData.reply_rate >= 5 ? 'OK' : 'BAS'}
Reponses positives         ${weekData.positive_replies.toString().padEnd(10)} -            5-15       ${weekData.positive_replies >= 5 ? 'OK' : 'BAS'}
Deals gagnes               ${weekData.deals.toString().padEnd(10)} -            2-4        ${weekData.deals >= 2 ? 'OK' : 'BAS'}
Revenu                     ${weekData.revenue.toFixed(0)} EUR   -            10-20K     ${weekData.revenue >= 10000 ? 'OK' : 'BAS'}
Pipeline total             ${weekData.pipeline} EUR
Bounce rate                ${weekData.bounce_rate.toFixed(1)}%      -            < 2%       ${weekData.bounce_rate < 2 ? 'OK' : 'HAUT'}
Opt-outs                   ${weekData.optouts.toString().padEnd(10)} -            < 3        ${weekData.optouts < 3 ? 'OK' : 'HAUT'}
Couts totaux               ${weekData.costs.toFixed(0)} EUR    -            -          -

DISTRIBUTION SCORING
${'─'.repeat(60)}
HOT: ${weekData.hot} | WARM: ${weekData.warm} | COLD: ${weekData.cold}

NURTURE
${'─'.repeat(60)}
Total en nurture : ${weekData.nurture_total}
Reclassifies HOT cette semaine : ${weekData.reclassifies}

ANALYSE ET RECOMMANDATIONS (Claude API)
${'─'.repeat(60)}
${claudeSummary}

${'='.repeat(60)}
Genere automatiquement par Agent 7 ANALYSTE v1.0
  `.trim()

  // Envoyer Slack + Email
  await slack.chat.postMessage({
    channel: '#pipeline-metrics',
    text: reportText,
  })

  await sendEmail({
    to: 'jonathan@axiom-marketing.fr',
    subject: `[Axiom] Rapport Hebdo ${startDate} -> ${endDate}`,
    body: reportText,
  })

  return reportText
}

// === RAPPORT MENSUEL (1er du mois) ===

export async function generateMonthlyReport(): Promise<string> {
  const now = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const startDate = lastMonth.toISOString().split('T')[0]
  const endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]

  // Charger toutes les metriques du mois
  const result = await pool.query(`
    SELECT * FROM metriques_daily
    WHERE date_snapshot >= $1 AND date_snapshot <= $2
    ORDER BY date_snapshot ASC
  `, [startDate, endDate])

  const rows = result.rows

  // Charger les outcomes pour l'analyse de precision du scoring
  const outcomes = await pool.query(`
    SELECT
      po.score_at_contact,
      po.categorie_at_contact,
      po.segment,
      po.outcome,
      po.montant_deal,
      po.cycle_vente_jours,
      po.canal_conversion
    FROM prospect_outcomes po
    WHERE po.date_outcome >= $1 AND po.date_outcome <= $2
  `, [startDate, endDate])

  // Charger les donnees A/B test
  const abTests = await pool.query(`
    SELECT
      template_id,
      ab_variant,
      COUNT(*) as envois,
      COUNT(*) FILTER (WHERE reply_received = true) as reponses,
      ROUND(COUNT(*) FILTER (WHERE reply_received = true)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as reply_rate
    FROM email_sends es
    WHERE DATE(sent_at) >= $1 AND DATE(sent_at) <= $2
      AND ab_variant IS NOT NULL
    GROUP BY template_id, ab_variant
    ORDER BY template_id, ab_variant
  `, [startDate, endDate])

  // Calculer la precision du scoring
  const scoringPrecision = calculateScoringPrecision(outcomes.rows)

  // Appeler Claude API pour le rapport strategique complet
  const monthData = {
    period: `${startDate} -> ${endDate}`,
    days: rows.length,
    totals: {
      leads: rows.reduce((a, r) => a + (parseInt(r.veilleur_leads_bruts) || 0), 0),
      qualifies: rows.reduce((a, r) => a + (parseInt(r.veilleur_leads_qualifies) || 0), 0),
      emails: rows.reduce((a, r) => a + (parseInt(r.suiveur_emails_envoyes) || 0), 0),
      replies: rows.reduce((a, r) => a + (parseInt(r.suiveur_reponses_total) || 0), 0),
      positive_replies: rows.reduce((a, r) => a + (parseInt(r.suiveur_reponses_positives) || 0), 0),
      deals: rows.reduce((a, r) => a + (parseInt(r.pipeline_deals_gagnes) || 0), 0),
      revenue: rows.reduce((a, r) => a + (parseFloat(r.pipeline_revenu_jour) || 0), 0),
      costs: rows.reduce((a, r) => a + (parseFloat(r.cout_total_jour_eur) || 0), 0),
    },
    averages: {
      reply_rate: rows.reduce((a, r) => a + (parseFloat(r.suiveur_reply_rate) || 0), 0) / Math.max(rows.length, 1),
      bounce_rate: rows.reduce((a, r) => a + (parseFloat(r.suiveur_bounce_rate) || 0), 0) / Math.max(rows.length, 1),
      score_moyen: rows.reduce((a, r) => a + (parseFloat(r.scoreur_score_moyen) || 0), 0) / Math.max(rows.length, 1),
    },
    scoring_precision: scoringPrecision,
    ab_tests: abTests.rows,
    outcomes_summary: summarizeOutcomes(outcomes.rows),
  }

  const claudeResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: `Tu es l'Agent 7 ANALYSTE. Tu generes un rapport mensuel strategique pour Jonathan.
Ce rapport est STRATEGIQUE : ROI, tendances, calibration scoring, forecasting.
Tu es direct, precis, et tu donnes des actions concretes.
Le rapport fait ~3 pages. Chaque section doit etre actionnable.
Objectifs Phase 1 Axiom : 5-10 deals/mois, 50K-100K EUR/mois, reply rate 5%+, CAC < 500 EUR.`,
    messages: [{
      role: 'user',
      content: `Donnees du mois :
${JSON.stringify(monthData, null, 2)}

Genere un rapport mensuel strategique avec :
1. Resume executif (5 lignes)
2. ROI du mois (revenu vs couts, CAC, LTV:CAC estime)
3. Analyse du funnel complet (leads -> deals, taux chaque etape)
4. Precision du scoring (faux positifs, faux negatifs, recommandations poids)
5. Performance templates et A/B tests (gagnants, perdants, recommandations)
6. Performance par segment (quel segment convertit le mieux)
7. Attribution (quel canal contribue le plus au revenu)
8. Forecasting 30/60/90 jours
9. Top 5 recommandations prioritaires (une par agent concerne)
10. Risques et points d'attention`
    }]
  })

  const claudeStrategic = claudeResponse.content[0].type === 'text'
    ? claudeResponse.content[0].text
    : ''

  const monthlyReport = `
${'='.repeat(60)}
AXIOM MARKETING -- RAPPORT MENSUEL STRATEGIQUE
${startDate} -> ${endDate}
Agent 7 ANALYSTE v1.0
${'='.repeat(60)}

${claudeStrategic}

${'='.repeat(60)}
ANNEXE : DONNEES BRUTES DU MOIS
${'─'.repeat(60)}
Total leads detectes : ${monthData.totals.leads}
Total emails envoyes : ${monthData.totals.emails}
Total reponses : ${monthData.totals.replies}
Taux reponse moyen : ${monthData.averages.reply_rate.toFixed(1)}%
Total deals : ${monthData.totals.deals}
Revenu total : ${monthData.totals.revenue.toFixed(0)} EUR
Couts totaux : ${monthData.totals.costs.toFixed(0)} EUR
ROI brut : ${monthData.totals.costs > 0 ? ((monthData.totals.revenue / monthData.totals.costs) * 100).toFixed(0) : 'N/A'}%

PRECISION SCORING :
  Precision HOT : ${scoringPrecision.precision_hot.toFixed(1)}%
  Recall : ${scoringPrecision.recall.toFixed(1)}%
  Faux positifs HOT : ${scoringPrecision.faux_positifs_hot.toFixed(1)}%
  Score moyen des deals : ${scoringPrecision.score_moyen_deals.toFixed(0)}
${'='.repeat(60)}
  `.trim()

  await slack.chat.postMessage({
    channel: '#pipeline-metrics',
    text: monthlyReport,
  })

  await sendEmail({
    to: 'jonathan@axiom-marketing.fr',
    subject: `[Axiom] Rapport Mensuel ${startDate}`,
    body: monthlyReport,
  })

  return monthlyReport
}

// === FONCTIONS UTILITAIRES ===

function calculateScoringPrecision(outcomes: any[]): {
  precision_hot: number
  recall: number
  faux_positifs_hot: number
  faux_negatifs: number
  score_moyen_deals: number
} {
  const hotOutcomes = outcomes.filter(o => o.categorie_at_contact === 'HOT')
  const convertis = outcomes.filter(o => o.outcome === 'converti')
  const hotConvertis = hotOutcomes.filter(o => o.outcome === 'converti' || o.outcome === 'opportunite')
  const hotSansReponse = hotOutcomes.filter(o => o.outcome === 'pas_de_reponse')
  const fauxNegatifs = convertis.filter(o => o.categorie_at_contact === 'COLD' || o.categorie_at_contact === 'DISQUALIFIE')

  return {
    precision_hot: hotOutcomes.length > 0
      ? (hotConvertis.length / hotOutcomes.length) * 100
      : 0,
    recall: convertis.length > 0
      ? (convertis.filter(o => o.categorie_at_contact === 'HOT').length / convertis.length) * 100
      : 0,
    faux_positifs_hot: hotOutcomes.length > 0
      ? (hotSansReponse.length / hotOutcomes.length) * 100
      : 0,
    faux_negatifs: convertis.length > 0
      ? (fauxNegatifs.length / convertis.length) * 100
      : 0,
    score_moyen_deals: convertis.length > 0
      ? convertis.reduce((a, c) => a + c.score_at_contact, 0) / convertis.length
      : 0,
  }
}

function summarizeOutcomes(outcomes: any[]): Record<string, number> {
  const summary: Record<string, number> = {}
  outcomes.forEach(o => {
    summary[o.outcome] = (summary[o.outcome] || 0) + 1
  })
  return summary
}

async function sendEmail(params: { to: string, subject: string, body: string }): Promise<void> {
  // Implementation via Gmail API (identique Agent 5)
  const { google } = await import('googleapis')
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
  })
  const gmail = google.gmail({ version: 'v1', auth })

  const raw = Buffer.from(
    `To: ${params.to}\r\n` +
    `Subject: ${params.subject}\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
    params.body
  ).toString('base64url')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })
}
```

---

## TEMPLATES EXACTS DES RAPPORTS

### Digest quotidien (envoye a 22h)

Template exact que Jonathan recevra :

```
AXIOM MARKETING -- DIGEST QUOTIDIEN
2026-03-18 | Statut pipeline : VERT
==================================================

PIPELINE AUJOURD'HUI :
  Leads detectes : 42 (+8 vs hier)
  Leads qualifies : 12 (+3)
  Emails envoyes : 18 (=)
  Taux reponse : 5.6% (+0.4pp)
  Reponses positives : 1

SCORING :
  HOT: 2 | WARM: 5 | COLD: 3 | DISQ: 2

NURTURE :
  Total en nurture : 187
  Reclassifies HOT : 0

BUSINESS :
  Deals gagnes : 0
  Revenu du jour : 0 EUR
  Pipeline total : 125,400 EUR

COUTS : 14.30 EUR
==================================================
Agent 7 ANALYSTE v1.0
```

### Rapport hebdomadaire (envoye lundi 9h -- 1 page)

Template exact :

```
==============================================================
AXIOM MARKETING -- RAPPORT HEBDOMADAIRE
Semaine du 2026-03-11 au 2026-03-17
Agent 7 ANALYSTE
==============================================================

RESUME EXECUTIF
--------------------------------------------------------------
Pipeline sain (VERT). Reply rate a 5.2% (objectif atteint).
2 deals gagnes cette semaine pour 18,500 EUR. Template B
surperforme Template A -- A/B test en cours de conclusion.
Point d'attention : bounce rate en hausse sur domaine
axiom-marketing.fr (1.8%).

METRIQUES CLES
--------------------------------------------------------------
Metrique                   Semaine  Sem. prec.  Objectif  Statut
--------------------------------------------------------------
Leads detectes             287      265         200+      OK
Leads qualifies            72       64          50+       OK
Emails envoyes             95       88          70+       OK
Taux reponse               5.2%     4.8%        >= 5%     OK
Reponses positives         5        4           5+        OK
Deals gagnes               2        1           2-4       OK
Revenu                     18,500   8,000       10-20K    OK
Pipeline total             125,400  118,200     100K+     OK
Bounce rate                1.4%     0.9%        < 2%      ATTENTION
Opt-outs                   1        0           < 3       OK
Couts totaux               98 EUR   92 EUR      -         -

SCORING SEMAINE
--------------------------------------------------------------
HOT: 12 (9%) | WARM: 38 (28%) | COLD: 54 (40%) | DISQ: 31 (23%)
Score moyen : 44.2 (+1.3 vs sem. prec.)

NURTURE
--------------------------------------------------------------
Total en nurture : 187 (+8)
Reclassifies HOT : 1
Engagement moyen : 28.4

TOP 3 RECOMMANDATIONS
--------------------------------------------------------------
1. [REDACTEUR] Template A en baisse (-0.8pp). A/B test B
   montre +1.2pp. Recommandation : conclure et adopter B.
2. [SUIVEUR] Bounce rate axiom-marketing.fr en hausse.
   Verifier reputation domaine. Activer rotation si > 2%.
3. [VEILLEUR] Source job boards 0 conversion sur 14 jours.
   Ajuster mots-cles ou reduire frequence.

==============================================================
```

### Rapport mensuel strategique (1er du mois -- 3 pages)

Template exact (resume par Claude API a partir des donnees) :

```
==============================================================
AXIOM MARKETING -- RAPPORT MENSUEL STRATEGIQUE
Mars 2026
Agent 7 ANALYSTE v1.0
==============================================================

PAGE 1 : EXECUTIVE SUMMARY & ROI
--------------------------------------------------------------

RESUME
Le mois de mars a ete un mois de lancement et de calibration
du systeme. 7 deals gagnes pour un total de 52,300 EUR.
Le CAC est de 132 EUR (objectif < 500 EUR -- EXCELLENT).
Le ROI mensuel est de 56x (revenu / couts pipeline).

ROI DU MOIS
--------------------------------------------------------------
Revenu total             : 52,300 EUR (7 deals)
Couts pipeline total     : 935 EUR
  - Agent 1 (Veilleur)   : 430 EUR
  - Agent 2 (Enrichisseur): 180 EUR
  - Agent 3 (Scoreur)     : 0 EUR
  - Agent 4 (Redacteur)   : 25 EUR
  - Agent 5 (Suiveur)     : 150 EUR
  - Agent 6 (Nurtureur)   : 37 EUR
  - Agent 7 (Analyste)    : 113 EUR
ROI                      : 56x
CAC                      : 132 EUR/deal
LTV:CAC estime           : 38:1 (LTV = 5,000 EUR, 12 mois)
Deal moyen               : 7,471 EUR

FUNNEL COMPLET DU MOIS
--------------------------------------------------------------
Etape                    Volume    Conversion    Drop-off
--------------------------------------------------------------
Leads bruts detectes     1,245     -             -
Leads qualifies          312       25.1%         74.9%
Prospects enrichis       298       95.5%         4.5%
Prospects scores         298       100%          0%
  dont HOT               30        10.1%         -
  dont WARM              89        29.9%         -
  dont COLD              119       39.9%         -
  dont DISQUALIFIE       60        20.1%         -
Prospects contactes      119       39.9%         60.1%
Emails envoyes           380       -             -
Reponses recues          19        5.0%          -
Reponses positives       8         2.1%          -
RDV/Propositions         7         -             -
Deals gagnes             7         1.8%          -

Conversion E2E : 7 / 1,245 = 0.56%
(Objectif Phase 1 : >= 2% -- A AMELIORER)

PAGE 2 : SEGMENTS, TEMPLATES, ATTRIBUTION
--------------------------------------------------------------

PERFORMANCE PAR SEGMENT
--------------------------------------------------------------
Segment          Leads  Contact  Reply%  Deals  Revenue   CAC
--------------------------------------------------------------
pme_metro        480    45       5.3%    3      22,500    130
ecommerce_shopify 310   32       4.8%    2      14,800    118
collectivite     125    12       6.2%    1      10,000    180
startup          180    20       4.0%    1      5,000     145
agence_wl        150    10       7.5%    0      0         -

Meilleur segment : agence_wl (meilleur reply rate) mais
0 deal -- echantillon trop petit. A surveiller.

PERFORMANCE TEMPLATES
--------------------------------------------------------------
Template        Envois  Reply%   Deals   Revenue attr.  Statut
--------------------------------------------------------------
TMPL_HOT_01     98      6.1%     3       18,200         OK
TMPL_WARM_01    145     4.1%     2       12,400         OK
TMPL_COLD_01    85      3.5%     1       8,200          WARNING
TMPL_HOT_02     52      7.7%     1       13,500         GAGNANT A/B

Recommandation : Adopter TMPL_HOT_02, desactiver TMPL_COLD_01
si reply rate reste < 3% sur 2 semaines supplementaires.

ATTRIBUTION (U-Shaped)
--------------------------------------------------------------
Canal                   Credit%  Revenue attr.  Deals
--------------------------------------------------------------
email_cold              42%      21,966 EUR     5
linkedin_connection     22%      11,506 EUR     4
email_followup          18%      9,414 EUR      3
email_nurture           12%      6,276 EUR      2
linkedin_message        6%       3,138 EUR      1

PAGE 3 : FORECASTING, CALIBRATION, RISQUES
--------------------------------------------------------------

FORECASTING
--------------------------------------------------------------
                    Conservative  Moderate  Optimiste
30 jours (Avr)     45,000 EUR   55,000    68,000 EUR
60 jours (Mai)     95,000 EUR   125,000   160,000 EUR
90 jours (Juin)    150,000 EUR  210,000   270,000 EUR

Pipeline coverage : 3.1x (BON)
Velocity : 1,743 EUR/jour
Confiance : MOYENNE

CALIBRATION SCORING
--------------------------------------------------------------
Precision HOT  : 33% (objectif >= 30% -- OK)
Recall         : 57% (objectif >= 60% -- PROCHE)
Faux positifs  : 37% (objectif < 40% -- OK)
Faux negatifs  : 14% (objectif < 10% -- A AMELIORER)
Score moyen deals : 68 (objectif >= 65 -- OK)

Recommandation : Augmenter le poids de l'Axe 2 (Signaux)
de 30 a 33 pts pour reduire les faux negatifs.
Les signals 'changement_poste' et 'levee_fonds' sont les
plus predictifs (correlation 0.72 avec conversion).

TOP 5 PRIORITES AVRIL
--------------------------------------------------------------
1. [SCOREUR] Ajuster poids Axe 2 (30 -> 33 pts) pour reduire
   faux negatifs de 14% a < 10%
2. [REDACTEUR] Adopter TMPL_HOT_02 comme nouveau control.
   Creer nouveau challenger pour le segment agence_wl
3. [VEILLEUR] Ajouter mots-cles 'refonte', 'migration' aux
   recherches 1c (web). Reduire job boards a 2x/semaine
4. [SUIVEUR] Verifier reputation domaine axiom-marketing.fr.
   Preparer domaine backup si bounce > 2%
5. [NURTUREUR] Creer contenu specifique segment collectivite
   (guide RGAA, timeline conformite)

RISQUES ET POINTS D'ATTENTION
--------------------------------------------------------------
- Conversion E2E a 0.56% (objectif 2%) -- early stage, normal
  mais a surveiller semaine par semaine
- Domaine axiom-marketing.fr : bounce rate en hausse (1.4%)
- Segment startup : 1 deal seulement, deal moyen bas (5K EUR)
  Evaluer si le segment vaut l'effort
- Faux negatifs a 14% : des deals potentiels sont rates par
  le scoring. La calibration est prioritaire

==============================================================
Genere automatiquement par Agent 7 ANALYSTE v1.0
Donnees extraites le 2026-04-01 a 08:00
Prochain rapport : 2026-05-01
==============================================================
```
