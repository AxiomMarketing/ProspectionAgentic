# Agent 6 — NURTUREUR (Master)

## Vue d'Ensemble

L'Agent 6 (NURTUREUR) est le gardien de la relation long terme du pipeline Axiom Marketing. Il prend en charge les prospects qui n'ont pas converti après la séquence initiale de l'Agent 5 (SUIVEUR) et maintient un lien actif avec eux via du contenu de valeur (articles, guides, cas d'usage), de l'engagement LinkedIn passif (likes, commentaires), et un re-scoring périodique. Là où l'Agent 5 agit sur des jours (séquences courtes et directes), le Nurtureur opère sur des semaines et des mois. Il ne force pas la vente : il éduque, apporte de la valeur, et quand un prospect manifeste un nouveau signal d'intérêt, il le reclassifie et le réinjecte dans le pipeline actif via l'Agent 3. Coût : ~37 EUR/mois.

## Sous-Agents

| ID | Nom | Rôle | Fréquence | API Principale |
|----|-----|------|-----------|----------------|
| 6a | Email Nurture | Envoie des emails de contenu (blog, guides, cas d'usage, insights sectoriels) à fréquence réduite (1-2/semaine max) selon un parcours Awareness → Consideration → Decision | Cron + BullMQ | Gmail API + Claude API (personnalisation) |
| 6b | LinkedIn Passif | Effectue des likes et commentaires sur les posts des prospects pour maintenir la visibilité sans être intrusif | Cron (1-2x/semaine) | Waalaxy API |
| 6c | Re-Scoreur | Recalcule périodiquement le score de chaque prospect en nurture en réinterrogeant les signaux business ; reclassifie en HOT/WARM si le seuil est atteint | Cron mensuel (ou bi-mensuel si WARM) | Aucune API externe (calcul local + BDD) |

## Input / Output

### Input (depuis Agent 5 — SUIVEUR)

Reçu via queue BullMQ `nurturer-pipeline` :

```typescript
interface NurturerInput {
  prospect_id: string          // UUID v4
  lead_id: string
  handoff_reason: 'SEQUENCE_COMPLETED_NO_REPLY' | 'PAS_MAINTENANT' | 'INTERESTED_SOFT_NO_FOLLOWUP'
  sequence_summary: {
    sequence_id: string; steps_completed: number; total_steps: number;
    emails_sent: number; linkedin_actions: number; duration_days: number;
    replies: Array<{ category: string; date: string }>
  }
  nurturing_recommendations: {
    resume_date: string | null        // Date suggérée pour reprendre contact
    suggested_content_type: string   // 'case_study'|'blog'|'event'|'newsletter'
    last_signal: string
    engagement_score: number         // 0-100
  }
  prospect: {
    prenom: string; nom: string; email: string; entreprise_nom: string;
    poste: string;
    segment: 'PME_METRO' | 'ECOMMERCE_SHOPIFY' | 'COLLECTIVITES' | 'STARTUPS' | 'AGENCES_WL'
    scoring_categorie: 'HOT' | 'WARM' | 'COLD'
  }
  metadata: { agent: 'agent_5_suiveur'; handoff_at: string; suiveur_version: string }
}
```

Peut également recevoir des leads depuis l'Agent 8 (DEALMAKER) via queue `nurturer-lost-deal` lorsqu'un deal est perdu.

### Output (vers Agent 3 — SCOREUR, quand reclassification)

Transmis via queue BullMQ `scoreur-pipeline` quand `engagement_score >= 60` :

```json
{
  "prospect_id": "uuid-v4",
  "trigger": "nurture_rescore",
  "new_signals": ["engagement_contenu", "pricing_page_visit"],
  "engagement_score_nurture": 72,
  "recommended_action": "re_engage_hot_sequence",
  "reclassification_from": "COLD",
  "reclassification_to": "WARM",
  "metadata": { "agent": "agent_6_nurtureur" }
}
```

Output vers Agent 7 (métriques) : snapshot mensuel via table `v_nurture_dashboard_monthly`.

## Workflow

**Étape 1 — Routage initial selon `handoff_reason`**

| Raison | Type de séquence | Délai initial | Fréquence re-score |
|--------|-----------------|---------------|-------------------|
| `INTERESTED_SOFT_NO_FOLLOWUP` | `WARM_NURTURE` | 7 jours | Toutes les 2 semaines |
| `PAS_MAINTENANT` | `PAS_MAINTENANT_NURTURE` | 42 jours (ou date fournie par Agent 5) | Chaque mois |
| `SEQUENCE_COMPLETED_NO_REPLY` | `COLD_NURTURE` | 21 jours | Chaque mois |

**Étape 2 — Attribution du contenu selon le parcours et le segment**

Le parcours est linéaire : `awareness → consideration → decision`

Exemples de contenus par segment :
- **PME_METRO** : "Combien votre site lent vous coûte par mois ?", "Guide audit express site (5 min)", "Case study : +40% de leads après refonte"
- **ECOMMERCE_SHOPIFY** : "Votre taux de conversion Shopify vs benchmark 2026", "Les 5 apps Shopify qui changent tout"
- **STARTUPS** : "Flutter en 2026 : ce qui a changé", "Comparatif tech stack SaaS 2026"
- **COLLECTIVITES** : "RGAA 2026 : les nouvelles obligations", "Guide accessibilité numérique DOM-TOM"
- **AGENCES_WL** : "Les agences qui sous-traitent gagnent la course", "Modèle WL : marge nette +35%"

**Étape 3 — Engagement LinkedIn passif (6b)**
- 1-2 likes/semaine sur les posts récents du prospect
- Commentaire court et pertinent (1-2 fois par mois max) si le post s'y prête
- Jamais de message direct (c'est le rôle de l'Agent 5)
- Via Waalaxy API, simulation de comportement humain

**Étape 4 — Re-scoring périodique (6c)**
Interroge les nouvelles détections de signaux pour le prospect :
- Nouveaux signaux LinkedIn depuis le dernier scoring (Agent 1a)
- Changement de poste ou d'entreprise
- Visite du site Axiom (tracking Plausible)
- Réponse à un email nurture (engagement)
- Téléchargement d'une ressource

Si nouveau score >= 60 (HOT) ou évolution +15 pts (WARM) → reclassification + dispatch vers Agent 3 avec `trigger: 'nurture_rescore'`

**Étape 5 — Re-engagement des leads inactifs**
Si prospect inactif depuis 90+ jours :
1. Email re-engagement #1 : contenu de valeur inattendu ("Je partage exceptionnellement...")
2. Email re-engagement #2 : angle différent, plus direct
3. Email re-permission : "Tu veux toujours rester en contact ?"
4. Si pas de réponse → Sunset policy

**Étape 6 — Sunset policy**
- Inactif depuis 180 jours ET emails re-engagement ignorés → `nurture_status: 'SUNSET'`
- Conformité RGPD : `data_retention_until = NOW() + 3 years` (intérêt légitime)
- Opt-out automatique des envois futurs
- Données conservées en base (pas de suppression immédiate) pour analyse

## APIs & Coûts

| API | Coût/mois | Crédits | Rate Limit |
|-----|-----------|---------|------------|
| Gmail API (emails nurture) | 0 EUR | Inclus Google Workspace | 1B unités/jour |
| Waalaxy (likes/commentaires LinkedIn passif) | ~25 EUR | Inclus dans plan Agent 5 (partagé) | 50 actions/jour |
| Claude API (personnalisation emails nurture) | ~7 EUR | ~700 emails/mois | 50 req/min |
| Plausible Analytics (suivi visites site Axiom) | ~5 EUR | Inclus plan | N/A |

**Total Agent 6 : ~37 EUR/mois**

## Base de Données

### Tables Principales

```sql
-- Table prospects en nurturing
CREATE TABLE nurture_prospects (
  id                  SERIAL PRIMARY KEY,
  prospect_id         UUID NOT NULL REFERENCES prospects(prospect_id) UNIQUE,
  lead_id             UUID NOT NULL,
  handoff_reason      VARCHAR(50) NOT NULL,
  handoff_at          TIMESTAMP WITH TIME ZONE NOT NULL,
  source_sequence_id  VARCHAR(50) NOT NULL,
  nurture_status      VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (nurture_status IN ('PENDING','ACTIVE','PAUSED','RE_ENGAGED','RECLASSIFIED_HOT','OPTED_OUT','SUNSET','ARCHIVED')),
  current_sequence_type VARCHAR(50) NOT NULL,
  current_step        INTEGER NOT NULL DEFAULT 0,
  total_steps         INTEGER NOT NULL,
  engagement_score_initial INTEGER NOT NULL,
  engagement_score_current INTEGER NOT NULL DEFAULT 0,
  segment             VARCHAR(30) NOT NULL,
  scoring_categorie   VARCHAR(10) NOT NULL,
  parcours_etape      VARCHAR(30) NOT NULL DEFAULT 'awareness'
    CHECK (parcours_etape IN ('awareness','consideration','decision')),
  emails_nurture_sent INTEGER NOT NULL DEFAULT 0,
  emails_opened       INTEGER NOT NULL DEFAULT 0,
  emails_clicked      INTEGER NOT NULL DEFAULT 0,
  linkedin_interactions INTEGER NOT NULL DEFAULT 0,
  replies_received    INTEGER NOT NULL DEFAULT 0,
  pricing_page_visits INTEGER NOT NULL DEFAULT 0,
  next_email_scheduled_at TIMESTAMP WITH TIME ZONE,
  next_rescore_at     TIMESTAMP WITH TIME ZONE,
  last_interaction_at TIMESTAMP WITH TIME ZONE,
  inactive_since      TIMESTAMP WITH TIME ZONE,
  consent_status      VARCHAR(20) NOT NULL DEFAULT 'LEGITIMATE_INTEREST',
  opt_out_at          TIMESTAMP WITH TIME ZONE,
  data_retention_until TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Table interactions nurture
CREATE TABLE nurture_interactions (
  id                  SERIAL PRIMARY KEY,
  prospect_id         UUID NOT NULL REFERENCES prospects(prospect_id),
  interaction_type    VARCHAR(50) NOT NULL
    CHECK (interaction_type IN (
      'EMAIL_SENT','EMAIL_OPENED','EMAIL_CLICKED','EMAIL_REPLIED',
      'CONTENT_DOWNLOADED','LINKEDIN_LIKE','LINKEDIN_COMMENT',
      'SITE_VISIT','PRICING_PAGE_VISIT','RESCORE','RECLASSIFIED',
      'OPT_OUT','SUNSET','RE_ENGAGEMENT_SENT','RE_PERMISSION_SENT'
    )),
  canal               VARCHAR(20) NOT NULL,
  details             JSONB,
  score_delta         INTEGER NOT NULL DEFAULT 0,
  score_after         INTEGER NOT NULL,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Table emails nurture envoyés
CREATE TABLE nurture_emails (
  id                  SERIAL PRIMARY KEY,
  prospect_id         UUID NOT NULL REFERENCES prospects(prospect_id),
  email_id            UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  sequence_type       VARCHAR(50) NOT NULL,
  step_number         INTEGER NOT NULL,
  parcours_etape      VARCHAR(30) NOT NULL,
  subject_line        VARCHAR(200) NOT NULL,
  content_piece_id    VARCHAR(50),
  status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','SENT','OPENED','CLICKED','REPLIED','BOUNCED','FAILED')),
  opened_at           TIMESTAMP WITH TIME ZONE,
  clicked_at          TIMESTAMP WITH TIME ZONE,
  sent_at             TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Vues analytiques
CREATE VIEW v_nurture_dashboard_monthly AS
SELECT segment, scoring_categorie, nurture_status,
  COUNT(*) as total_prospects,
  AVG(engagement_score_current) as avg_engagement,
  COUNT(*) FILTER (WHERE nurture_status='RECLASSIFIED_HOT') as reclassified_hot
FROM nurture_prospects GROUP BY 1,2,3;
```

## Scheduling

| Cron | Action | Description |
|------|--------|-------------|
| Événementiel (BullMQ) | `addToNurture(input)` | Déclenché par handoff Agent 5 |
| `0 9 * * 2,4` | `sendNurtureEmails()` | Envoi emails nurture mardi + jeudi (fréquence 1-2/semaine) |
| `0 10 * * 1,3` | `linkedinPassiveEngagement()` | Likes/commentaires lundi + mercredi |
| `0 3 1 * *` | `rescoreAllNurtureProspects()` | Re-scoring mensuel de tous les prospects COLD |
| `0 3 */14 * *` | `rescoreWarmProspects()` | Re-scoring bi-mensuel des prospects WARM |
| `0 1 * * *` | `checkSunsetCandidates()` | Identifier inactifs > 90 jours → déclencher re-engagement |

## Error Handling

| Erreur | Action | Fallback |
|--------|--------|----------|
| Gmail API bounce sur email nurture | Marquer email `BOUNCED`, mettre prospect en `PAUSED` | Alerter si domaine entier bouncing |
| Waalaxy rate limit | Différer les interactions LinkedIn de 24h | Les emails continuent normalement |
| `handoff_reason: 'PAS_MAINTENANT'` sans `resume_date` | Calculer délai par défaut : 42 jours | Log avertissement |
| Prospect déjà en nurture (doublon) | Merge : incrémenter step, fusionner signaux | Log `duplicate_nurture_prospect` |
| Re-score déclenche reclassification mais prospect opt-out | Annuler le re-dispatch | Conserver opt-out |
| Claude API indisponible pour personnalisation | Envoyer template sans personnalisation | Log `claude_unavailable_fallback` |
| `data_retention_until` dépassé | Suppression automatique RGPD | Log événement RGPD |

## KPIs & Métriques

| KPI | Cible Phase 1 | Fréquence |
|-----|---------------|-----------|
| Taux d'ouverture emails nurture | >= 25% | Hebdomadaire |
| Taux de clic emails nurture | >= 4% | Hebdomadaire |
| Taux de reclassification HOT (COLD → HOT) | >= 5% | Mensuel |
| Délai moyen de maturation (jusqu'à reclassification) | < 90 jours | Mensuel |
| Taux sunset (inactifs archivés) | < 60% | Mensuel |
| Taux d'opt-out nurture | < 1% | Hebdomadaire |

## Edge Cases

- **Prospect reclassifié HOT puis repassé en COLD** : Stocker l'historique dans `score_history` ; le re-nurturing repart de `consideration` (pas de `awareness`)
- **Prospect rejoint une nouvelle entreprise** : Le signal `changement_poste` détecté par l'Agent 1a déclenche automatiquement un re-score ; si le nouveau poste est encore plus décideur, la reclassification peut être accélérée
- **Deal perdu entrant de l'Agent 8** : Traité comme `SEQUENCE_COMPLETED_NO_REPLY` mais avec une stratégie de contenu plus douce (aucune mention du devis refusé pendant 90 jours)
- **Prospect blacklisté concurrent** : Ignoré par le Nurtureur si ajouté à la blocklist après son entrée en nurture
- **Segment `collectivite`** : Les emails nurture évitent le tutoiement et utilisent un ton institutionnel ; le contenu porte sur les obligations RGAA et les subventions numériques
- **Sunset vs RGPD** : La politique sunset (180j inactivité) est distincte du droit à l'oubli RGPD ; un prospect peut demander sa suppression à tout moment, indépendamment de son statut sunset

## Budget

| Poste | Coût/mois |
|-------|-----------|
| Gmail API (emails nurture) | 0 EUR |
| Waalaxy partagé (engagement passif) | ~25 EUR |
| Claude API (personnalisation) | ~7 EUR |
| Plausible Analytics | ~5 EUR |
| **Total** | **~37 EUR/mois** |

## Référence Spec

`.claude/source-ia/agent/AGENT-6-MASTER.md`
Sous-agents détaillés : `AGENT-6a-EMAIL-NURTURE.md`, `AGENT-6b-LINKEDIN-PASSIF.md`, `AGENT-6c-RE-SCOREUR.md`
