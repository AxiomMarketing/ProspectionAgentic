# SOUS-AGENT 7d — RECOMMANDEUR
**Agent parent** : AGENT-7-MASTER.md

**Version :** 1.0
**Date :** 2026-03-18
**Auteur :** Systeme Axiom Marketing

---

## MISSION

Analyser les donnees collectees par 7a, les anomalies detectees par 7c, et generer des recommandations concretes et actionnables pour chaque agent du pipeline. Utilise Claude API pour analyser les patterns et proposer des actions.

---

## TABLE SQL : recommandations

```sql
CREATE TABLE IF NOT EXISTS recommandations (
  id SERIAL PRIMARY KEY,
  date_generation TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  agent_cible VARCHAR(30) NOT NULL,
    -- 'agent_1_veilleur', 'agent_3_scoreur', 'agent_4_redacteur',
    -- 'agent_5_suiveur', 'agent_6_nurtureur', 'global'
  type_recommandation VARCHAR(50) NOT NULL,
    -- 'ajuster_poids', 'desactiver_template', 'ajouter_mot_cle',
    -- 'ajuster_sequence', 'ajuster_frequence', 'ajuster_source',
    -- 'ajuster_sunset', 'recalibrer_scoring'
  priorite VARCHAR(10) NOT NULL CHECK (priorite IN ('HAUTE', 'MOYENNE', 'BASSE')),
  titre VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  action_concrete TEXT NOT NULL,       -- L'action exacte a effectuer
  impact_estime TEXT,                  -- Ex: "+2% reply rate", "-500 EUR/mois"
  donnees_support JSONB,               -- Donnees qui justifient la recommandation
  statut VARCHAR(20) DEFAULT 'PENDING'
    CHECK (statut IN ('PENDING', 'APPROVED', 'REJECTED', 'IMPLEMENTED', 'EXPIRED')),
  approved_by VARCHAR(100),
  approved_at TIMESTAMP WITH TIME ZONE,
  implemented_at TIMESTAMP WITH TIME ZONE,
  result_after_implementation JSONB,   -- Metriques apres implementation
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_recommandations_agent ON recommandations(agent_cible);
CREATE INDEX idx_recommandations_statut ON recommandations(statut);
CREATE INDEX idx_recommandations_priorite ON recommandations(priorite);
CREATE INDEX idx_recommandations_date ON recommandations(date_generation DESC);
```

---

## CODE TYPESCRIPT : RECOMMANDEUR

```typescript
// sous-agents/7d-recommandeur.ts
import Anthropic from '@anthropic-ai/sdk'
import { Pool } from 'pg'
import { WebClient } from '@slack/web-api'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const pool = new Pool({ /* config */ })
const slack = new WebClient(process.env.SLACK_BOT_TOKEN)

interface Recommendation {
  agent_cible: string
  type_recommandation: string
  priorite: 'HAUTE' | 'MOYENNE' | 'BASSE'
  titre: string
  description: string
  action_concrete: string
  impact_estime: string
  donnees_support: Record<string, any>
}

export async function generateRecommendations(): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = []

  // 1. Analyser les templates (pour Agent 4 REDACTEUR)
  const templatePerf = await pool.query(`
    SELECT
      es.template_id,
      COUNT(*) as envois,
      COUNT(*) FILTER (WHERE rc.category IN ('INTERESSE', 'INTERESSE_SOFT')) as positives,
      ROUND(
        COUNT(*) FILTER (WHERE rc.category IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) * 100, 2
      ) as reply_rate
    FROM email_sends es
    LEFT JOIN reply_classifications rc ON rc.prospect_id = es.prospect_id
    WHERE es.sent_at >= NOW() - INTERVAL '14 days'
    GROUP BY es.template_id
    HAVING COUNT(*) >= 20
    ORDER BY reply_rate ASC
  `)

  for (const template of templatePerf.rows) {
    if (parseFloat(template.reply_rate) < 3.0 && parseInt(template.envois) >= 50) {
      recommendations.push({
        agent_cible: 'agent_4_redacteur',
        type_recommandation: 'desactiver_template',
        priorite: 'HAUTE',
        titre: `Desactiver template ${template.template_id} (reply rate < 3%)`,
        description: `Le template ${template.template_id} a un taux de reponse de ${template.reply_rate}% sur ${template.envois} envois (14 derniers jours). C'est en dessous du seuil minimum de 3%.`,
        action_concrete: `Mettre template_status = 'paused' pour template_id = '${template.template_id}'. Creer une nouvelle variante pour A/B test.`,
        impact_estime: '+1-2% reply rate global si remplace par un template performant',
        donnees_support: {
          template_id: template.template_id,
          envois: template.envois,
          reply_rate: template.reply_rate,
          positives: template.positives,
        },
      })
    }
  }

  // 2. Analyser la precision du scoring (pour Agent 3 SCOREUR)
  const scoringAnalysis = await pool.query(`
    SELECT
      po.categorie_at_contact,
      po.outcome,
      COUNT(*) as count,
      AVG(po.score_at_contact) as avg_score
    FROM prospect_outcomes po
    WHERE po.date_outcome >= NOW() - INTERVAL '30 days'
    GROUP BY po.categorie_at_contact, po.outcome
    ORDER BY po.categorie_at_contact, po.outcome
  `)

  const hotTotal = scoringAnalysis.rows.filter(r => r.categorie_at_contact === 'HOT')
  const hotConvertis = hotTotal.filter(r => r.outcome === 'converti' || r.outcome === 'opportunite')
  const hotSansReponse = hotTotal.filter(r => r.outcome === 'pas_de_reponse')

  const hotTotalCount = hotTotal.reduce((a, r) => a + parseInt(r.count), 0)
  const hotConvertiCount = hotConvertis.reduce((a, r) => a + parseInt(r.count), 0)
  const hotSansReponseCount = hotSansReponse.reduce((a, r) => a + parseInt(r.count), 0)

  if (hotTotalCount > 10 && hotConvertiCount / hotTotalCount < 0.30) {
    recommendations.push({
      agent_cible: 'agent_3_scoreur',
      type_recommandation: 'recalibrer_scoring',
      priorite: 'HAUTE',
      titre: `Precision HOT insuffisante (${((hotConvertiCount / hotTotalCount) * 100).toFixed(0)}% < 30%)`,
      description: `Sur ${hotTotalCount} prospects HOT contactes, seulement ${hotConvertiCount} ont converti ou sont en opportunite. Le scoring est trop genereux.`,
      action_concrete: `Augmenter le seuil HOT de 75 a 80. Augmenter le poids de l'axe Signaux (30→35 pts). Reduire le poids de l'axe Engagement (15→10 pts).`,
      impact_estime: 'Precision HOT de 30% -> 40%, moins de faux positifs',
      donnees_support: {
        hot_total: hotTotalCount,
        hot_convertis: hotConvertiCount,
        hot_sans_reponse: hotSansReponseCount,
        precision_actuelle: ((hotConvertiCount / hotTotalCount) * 100).toFixed(1),
      },
    })
  }

  // 3. Analyser les sources (pour Agent 1 VEILLEUR)
  const sourcePerf = await pool.query(`
    SELECT
      lb.source_primaire,
      COUNT(*) as leads_total,
      COUNT(DISTINCT CASE WHEN po.outcome = 'converti' THEN po.prospect_id END) as convertis,
      COALESCE(SUM(po.montant_deal) FILTER (WHERE po.outcome = 'converti'), 0) as revenu
    FROM leads_bruts lb
    LEFT JOIN prospects p ON p.lead_id = lb.lead_id
    LEFT JOIN prospect_outcomes po ON po.prospect_id = p.prospect_id
    WHERE lb.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY lb.source_primaire
    ORDER BY revenu DESC
  `)

  for (const source of sourcePerf.rows) {
    const leadsTotal = parseInt(source.leads_total) || 0
    const convertis = parseInt(source.convertis) || 0

    if (leadsTotal > 50 && convertis === 0) {
      recommendations.push({
        agent_cible: 'agent_1_veilleur',
        type_recommandation: 'ajuster_source',
        priorite: 'MOYENNE',
        titre: `Source ${source.source_primaire} sans conversion (${leadsTotal} leads, 0 deals)`,
        description: `La source ${source.source_primaire} genere ${leadsTotal} leads/mois mais 0 conversion. Verifier la qualite des leads ou ajuster les criteres de detection.`,
        action_concrete: `Revoir les mots-cles et criteres de detection pour ${source.source_primaire}. Si apres 30 jours supplementaires toujours 0 conversion, reduire la priorite de cette source.`,
        impact_estime: 'Focaliser les ressources sur les sources qui convertissent',
        donnees_support: {
          source: source.source_primaire,
          leads_30j: leadsTotal,
          convertis: convertis,
          revenu: source.revenu,
        },
      })
    }
  }

  // 4. Analyser les sequences (pour Agent 5 SUIVEUR)
  const sequencePerf = await pool.query(`
    SELECT
      ps.current_step,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE rc.category IN ('INTERESSE', 'INTERESSE_SOFT')) as reponses_positives
    FROM prospect_sequences ps
    LEFT JOIN reply_classifications rc ON rc.prospect_id = ps.prospect_id
    WHERE ps.updated_at >= NOW() - INTERVAL '30 days'
    GROUP BY ps.current_step
    ORDER BY ps.current_step
  `)

  // Detecter si les reponses sont concentrees sur les premieres etapes
  const step1Replies = sequencePerf.rows.find(r => r.current_step === 1)
  const laterReplies = sequencePerf.rows.filter(r => r.current_step > 3)
  const laterReplyTotal = laterReplies.reduce((a, r) => a + parseInt(r.reponses_positives || 0), 0)

  if (step1Replies && laterReplyTotal === 0 && sequencePerf.rows.length > 3) {
    recommendations.push({
      agent_cible: 'agent_5_suiveur',
      type_recommandation: 'ajuster_sequence',
      priorite: 'MOYENNE',
      titre: 'Sequences trop longues -- aucune reponse apres etape 3',
      description: `Toutes les reponses positives viennent des etapes 1-3. Les etapes 4+ ne generent rien. Raccourcir les sequences economisera des envois et reduira la fatigue.`,
      action_concrete: `Reduire les sequences WARM de 6 a 4 etapes. Garder les sequences HOT a 5 etapes. Tester sur 30 jours.`,
      impact_estime: 'Reduction opt-outs, meme conversion avec moins d\'emails',
      donnees_support: { sequence_stats: sequencePerf.rows },
    })
  }

  // 5. Analyser le nurturing (pour Agent 6 NURTUREUR)
  const nurturePerf = await pool.query(`
    SELECT
      segment,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE nurture_status = 'RECLASSIFIED_HOT') as reclassifies,
      COUNT(*) FILTER (WHERE nurture_status = 'SUNSET') as sunsets,
      AVG(engagement_score_current) as engagement_moyen
    FROM nurture_prospects
    WHERE created_at >= NOW() - INTERVAL '90 days'
    GROUP BY segment
    ORDER BY reclassifies DESC
  `)

  for (const segment of nurturePerf.rows) {
    const total = parseInt(segment.total) || 0
    const sunsets = parseInt(segment.sunsets) || 0
    if (total > 20 && sunsets / total > 0.6) {
      recommendations.push({
        agent_cible: 'agent_6_nurtureur',
        type_recommandation: 'ajuster_sunset',
        priorite: 'BASSE',
        titre: `Taux de sunset trop eleve pour ${segment.segment} (${((sunsets / total) * 100).toFixed(0)}%)`,
        description: `Plus de 60% des prospects nurture du segment ${segment.segment} finissent en sunset. Le contenu ou la frequence ne convient pas.`,
        action_concrete: `Tester une frequence reduite (1 email toutes les 2 semaines au lieu de 1/semaine) et un contenu plus adapte au segment ${segment.segment}.`,
        impact_estime: 'Reduction sunset de 60% a 40%, plus de reclassifications HOT',
        donnees_support: {
          segment: segment.segment,
          total: total,
          sunsets: sunsets,
          reclassifies: segment.reclassifies,
          engagement_moyen: segment.engagement_moyen,
        },
      })
    }
  }

  // 6. Generer un resume Claude API des recommandations
  if (recommendations.length > 0) {
    const claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `Tu es l'Agent 7 ANALYSTE d'Axiom Marketing. Tu presentes les recommandations a Jonathan de maniere concise et priorisee. Ton format : 1 ligne par recommandation, classee par priorite.`,
      messages: [{
        role: 'user',
        content: `Resume ces ${recommendations.length} recommandations pour Jonathan :\n${JSON.stringify(recommendations.map(r => ({
          agent: r.agent_cible,
          priorite: r.priorite,
          titre: r.titre,
          action: r.action_concrete,
          impact: r.impact_estime,
        })), null, 2)}`
      }]
    })

    const summary = claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : ''

    // Envoyer sur Slack
    await slack.chat.postMessage({
      channel: '#pipeline-metrics',
      text: `RECOMMANDATIONS HEBDOMADAIRES (${recommendations.length}) :\n\n${summary}`,
    })
  }

  // Persister les recommandations
  for (const rec of recommendations) {
    await pool.query(`
      INSERT INTO recommandations (agent_cible, type_recommandation, priorite, titre, description, action_concrete, impact_estime, donnees_support)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [rec.agent_cible, rec.type_recommandation, rec.priorite, rec.titre, rec.description, rec.action_concrete, rec.impact_estime, JSON.stringify(rec.donnees_support)])
  }

  console.log(`[7d] ${recommendations.length} recommandations generees (${recommendations.filter(r => r.priorite === 'HAUTE').length} haute priorite)`)
  return recommendations
}
```

---

## A/B TESTING : CALCUL DE SIGNIFICATIVITE

```typescript
// sous-agents/7d-ab-testing.ts

interface ABTestResult {
  test_id: string
  envois_a: number
  envois_b: number
  replies_a: number
  replies_b: number
  reply_rate_a: number
  reply_rate_b: number
  z_score: number
  p_value: number
  significant: boolean
  gagnant: 'A' | 'B' | 'TIE'
  confiance: number
  recommandation: string
}

export function calculateABTestSignificance(
  envois_a: number,
  replies_a: number,
  envois_b: number,
  replies_b: number,
  min_sample: number = 250
): ABTestResult {

  const rate_a = envois_a > 0 ? replies_a / envois_a : 0
  const rate_b = envois_b > 0 ? replies_b / envois_b : 0

  // Taille d'echantillon suffisante ?
  if (envois_a < min_sample || envois_b < min_sample) {
    return {
      test_id: '',
      envois_a, envois_b, replies_a, replies_b,
      reply_rate_a: rate_a * 100,
      reply_rate_b: rate_b * 100,
      z_score: 0,
      p_value: 1,
      significant: false,
      gagnant: 'TIE',
      confiance: 0,
      recommandation: `Echantillon insuffisant. Besoin de ${min_sample - Math.min(envois_a, envois_b)} envois supplementaires par variante.`,
    }
  }

  // Pooled proportion
  const p_pooled = (replies_a + replies_b) / (envois_a + envois_b)

  // Z-score
  const se = Math.sqrt(p_pooled * (1 - p_pooled) * (1 / envois_a + 1 / envois_b))
  const z = se > 0 ? (rate_b - rate_a) / se : 0

  // P-value (two-tailed) - approximation normale
  const p_value = 2 * (1 - normalCDF(Math.abs(z)))

  const significant = p_value < 0.05
  const gagnant: 'A' | 'B' | 'TIE' = !significant ? 'TIE' : (rate_b > rate_a ? 'B' : 'A')
  const confiance = (1 - p_value) * 100

  let recommandation: string
  if (!significant) {
    recommandation = `Pas de difference significative (p=${p_value.toFixed(3)}). Continuer le test ou conclure egalite.`
  } else if (gagnant === 'B') {
    recommandation = `Variante B gagnante (+${((rate_b - rate_a) * 100).toFixed(1)}pp, p=${p_value.toFixed(3)}). Recommandation : adopter B comme nouveau control, desactiver A.`
  } else {
    recommandation = `Control A reste meilleur (+${((rate_a - rate_b) * 100).toFixed(1)}pp, p=${p_value.toFixed(3)}). Recommandation : desactiver la variante B, garder A.`
  }

  return {
    test_id: '',
    envois_a, envois_b, replies_a, replies_b,
    reply_rate_a: rate_a * 100,
    reply_rate_b: rate_b * 100,
    z_score: z,
    p_value,
    significant,
    gagnant,
    confiance,
    recommandation,
  }
}

// Approximation CDF normale
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989422804014327
  const p = d * Math.exp(-x * x / 2) * t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}

// Evaluation automatique des tests en cours (cron quotidien)
export async function evaluateRunningABTests(): Promise<void> {
  const tests = await pool.query(`
    SELECT * FROM ab_tests WHERE statut = 'RUNNING'
  `)

  for (const test of tests.rows) {
    // Charger les metriques fraiches
    const metricsA = await pool.query(`
      SELECT
        COUNT(*) as envois,
        COUNT(*) FILTER (WHERE rc.category IS NOT NULL) as replies,
        COUNT(*) FILTER (WHERE rc.category IN ('INTERESSE', 'INTERESSE_SOFT')) as positive_replies
      FROM email_sends es
      LEFT JOIN reply_classifications rc ON rc.prospect_id = es.prospect_id
      WHERE es.template_id = $1
        AND es.ab_variant = 'A'
        AND es.sent_at >= $2
    `, [test.template_control_id, test.date_debut])

    const metricsB = await pool.query(`
      SELECT
        COUNT(*) as envois,
        COUNT(*) FILTER (WHERE rc.category IS NOT NULL) as replies,
        COUNT(*) FILTER (WHERE rc.category IN ('INTERESSE', 'INTERESSE_SOFT')) as positive_replies
      FROM email_sends es
      LEFT JOIN reply_classifications rc ON rc.prospect_id = es.prospect_id
      WHERE es.template_id = $1
        AND es.ab_variant = 'B'
        AND es.sent_at >= $2
    `, [test.template_challenger_id, test.date_debut])

    const a = metricsA.rows[0]
    const b = metricsB.rows[0]

    const result = calculateABTestSignificance(
      parseInt(a.envois), parseInt(a.positive_replies),
      parseInt(b.envois), parseInt(b.positive_replies),
      test.taille_min_par_variante
    )

    // Mettre a jour le test
    await pool.query(`
      UPDATE ab_tests SET
        envois_a = $1, envois_b = $2,
        replies_a = $3, replies_b = $4,
        positive_replies_a = $5, positive_replies_b = $6,
        reply_rate_a = $7, reply_rate_b = $8,
        z_score = $9, p_value = $10,
        gagnant = $11, confiance_resultat = $12,
        recommandation = $13
      WHERE test_id = $14
    `, [
      parseInt(a.envois), parseInt(b.envois),
      parseInt(a.replies), parseInt(b.replies),
      parseInt(a.positive_replies), parseInt(b.positive_replies),
      result.reply_rate_a, result.reply_rate_b,
      result.z_score, result.p_value,
      result.gagnant, result.confiance,
      result.recommandation, test.test_id
    ])

    // Si le test est concluant, le cloturer et notifier
    if (result.significant) {
      await pool.query(`
        UPDATE ab_tests SET statut = 'CONCLUDED', date_fin = NOW()
        WHERE test_id = $1
      `, [test.test_id])

      await slack.chat.postMessage({
        channel: '#pipeline-metrics',
        text: `A/B Test "${test.test_name}" CONCLU :\n` +
          `Gagnant : ${result.gagnant}\n` +
          `A: ${result.reply_rate_a.toFixed(1)}% (${parseInt(a.envois)} envois)\n` +
          `B: ${result.reply_rate_b.toFixed(1)}% (${parseInt(b.envois)} envois)\n` +
          `Confiance : ${result.confiance.toFixed(1)}%\n` +
          `${result.recommandation}`,
      })
    }
  }
}
```

---

## FEEDBACK LOOP VERS CHAQUE AGENT

### Agent 7 --> Agent 1 (VEILLEUR) : Ajuster sources et mots-cles

| Declencheur | Analyse | Recommandation | Frequence | Validation |
|---|---|---|---|---|
| Source sans conversion depuis 30 jours | Requete conversion par source | Reduire priorite de la source ou ajuster les mots-cles de detection | Mensuel | Jonathan approuve |
| Segment surrepresente sans ROI | Ratio leads/deals par segment | Reequilibrer les sources vers les segments qui convertissent | Mensuel | Jonathan approuve |
| Signaux qui ne menent pas a des deals | Correlation signal_type vs outcome | Ajuster les poids de pre-scoring, retirer les signaux non predictifs | Mensuel | Automatique si data > 200 leads |
| Budget API depasse | Couts vs budget alloue | Optimiser les frequences de scan, privilegier les sources gratuites | Hebdomadaire | Automatique |

**Format de recommandation** :

```
DE : Agent 7 ANALYSTE
A : Agent 1 VEILLEUR
DATE : 2026-04-01
PRIORITE : HAUTE

CONSTAT : La source '1d_jobboards' genere 25% des leads mais 0%
des deals sur les 60 derniers jours. Le signal 'recrutement_dev_web'
a un taux de conversion de 0.8% vs 4.2% pour 'changement_poste'.

ACTION RECOMMANDEE :
1. Reduire la frequence de scan job boards de 1x/jour a 2x/semaine
2. Augmenter le poids du signal 'changement_poste' de 25 a 30 pts
3. Reduire le poids du signal 'recrutement_dev_web' de 22 a 15 pts
4. Ajouter le mot-cle 'refonte site' aux recherches web (1c)

IMPACT ESTIME : +15% de leads qualifies a volume egal

STATUT : EN ATTENTE VALIDATION JONATHAN
```

### Agent 7 --> Agent 3 (SCOREUR) : Ajuster poids du scoring

| Declencheur | Analyse | Recommandation | Frequence | Validation |
|---|---|---|---|---|
| Precision HOT < 30% | Matrice confusion scoring vs outcomes | Augmenter seuil HOT, ajuster poids des axes | Mensuel | Jonathan approuve |
| Faux negatifs > 10% | Deals qui etaient COLD/DISQ | Baisser le seuil ou augmenter le poids des signaux manques | Mensuel | Jonathan approuve |
| Distribution desequilibree (HOT > 20%) | Distribution des categories | Resserrer les criteres de qualification | Hebdomadaire | Automatique |
| Score moyen des deals diverge | Correlation score vs montant_deal | Ajuster les bonus de segment | Trimestriel | Jonathan approuve |

### Agent 7 --> Agent 4 (REDACTEUR) : Templates

| Declencheur | Analyse | Recommandation | Frequence | Validation |
|---|---|---|---|---|
| Template reply rate < 3% (N >= 50) | Performance par template | Desactiver le template, creer une variante | Continu | Automatique |
| A/B test concluant | Significativite statistique | Adopter le gagnant, desactiver le perdant | Continu | Automatique |
| Hook fatigue (baisse progressive) | Trend reply rate sur 4 semaines | Iterer un nouveau hook, lancer A/B test | Mensuel | Jonathan approuve |
| Segment-specific underperformance | Reply rate par segment x template | Creer un template specifique au segment | Mensuel | Jonathan approuve |

### Agent 7 --> Agent 5 (SUIVEUR) : Sequences et timing

| Declencheur | Analyse | Recommandation | Frequence | Validation |
|---|---|---|---|---|
| Opt-out rate > 0.5% | Taux opt-out par segment et par etape | Raccourcir les sequences pour les segments concernes | Hebdomadaire | Automatique |
| Bounce rate > 3% sur un domaine | Performance par domaine d'envoi | Suspendre le domaine, activer un backup | Continu (alerte) | Automatique |
| Reponses concentrees etape 1-2 | Distribution reponses par etape | Optimiser les etapes suivantes ou reduire la sequence | Mensuel | Jonathan approuve |
| Horaire optimal detecte | Correlation envoi_hour vs reply | Ajuster les horaires d'envoi (ex: 9h plutot que 14h) | Mensuel | Automatique |
| LinkedIn acceptance trop basse | Taux acceptation < 20% | Ajuster la note de connexion, cibler mieux | Mensuel | Jonathan approuve |

### Agent 7 --> Agent 6 (NURTUREUR) : Frequence et contenu

| Declencheur | Analyse | Recommandation | Frequence | Validation |
|---|---|---|---|---|
| Sunset > 60% dans un segment | Taux sunset par segment | Ajuster frequence, adapter contenu | Mensuel | Jonathan approuve |
| Contenu X pas ouvert (< 10% ouverture) | Performance par content_piece_id | Retirer le contenu, le remplacer | Mensuel | Automatique |
| Engagement moyen en baisse | Trend engagement_score_moyen | Introduire du contenu frais, varier les formats | Mensuel | Jonathan approuve |
| Re-engagement rate < 10% | Taux de reactivation des inactifs | Ajuster les workflows de re-engagement, tester de nouvelles accroches | Trimestriel | Jonathan approuve |

---

## PROCESSUS DE VALIDATION HUMAINE

```
1. Agent 7 genere la recommandation
2. Recommandation stockee en BDD (statut = 'PENDING')
3. Notification Slack a Jonathan avec boutons [Approuver] [Rejeter] [Reporter]
4. Jonathan clique [Approuver]
5. Statut passe a 'APPROVED'
6. L'agent concerne est notifie via Slack + flag en BDD
7. L'agent applique la modification
8. Statut passe a 'IMPLEMENTED'
9. Agent 7 mesure l'impact apres 2 semaines (result_after_implementation)
```

**Exceptions (validation automatique)** :
- Templates avec reply rate < 3% sur N >= 50 : desactivation automatique
- Bounce rate domaine > 5% : suspension automatique du domaine
- Budget API depasse : reduction frequence automatique
