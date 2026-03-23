# AGENT 10 -- CSM (Customer Success Manager) : SPECIFICATIONS TECHNIQUES COMPLETES

**Version :** 1.0
**Date :** 2026-03-19
**Auteur :** Systeme Axiom Marketing
**Contexte :** Pipeline de prospection automatise B2B -- Phase post-vente et retention client
**Public :** Jonathan Dewaele, Marty Wong, equipe tech Univile
**Statut :** DERNIER AGENT -- Boucle le systeme complet de 10 agents

---

## TABLE DES MATIERES

1. [Mission](#1-mission)
2. [Input : Schema JSON recu de l'Agent 8 (DealToCSM)](#2-input--schema-json-recu-de-lagent-8-dealtocsm)
3. [Sous-Agents](#3-sous-agents)
   - [10a. Onboardeur](#3a-sous-agent-10a--onboardeur)
   - [10b. Detecteur Upsell](#3b-sous-agent-10b--detecteur-upsell)
   - [10c. Mesureur Satisfaction](#3c-sous-agent-10c--mesureur-satisfaction)
   - [10d. Collecteur Avis](#3d-sous-agent-10d--collecteur-avis)
   - [10e. Gestionnaire Referral](#3e-sous-agent-10e--gestionnaire-referral)
4. [Health Score](#4-health-score)
5. [Matrice Cross-Sell Axiom](#5-matrice-cross-sell-axiom)
6. [Sequences Email](#6-sequences-email)
7. [Prevention Churn](#7-prevention-churn)
8. [Output : Schemas JSON](#8-output--schemas-json)
9. [Couts](#9-couts)
10. [Verification de coherence & Schema global 10 agents](#10-verification-de-coherence--schema-global-10-agents)

---

## 1. MISSION

### 1.1 Definition

L'Agent 10 (CSM) est le **gardien de la relation client post-vente** du pipeline Axiom Marketing. Il prend le relais **immediatement apres** la signature du contrat (webhook Yousign confirme par l'Agent 8 DEALMAKER) et gere l'integralite du cycle de vie client : onboarding, satisfaction, upsell, retention, collecte d'avis et referral.

**Entree :** Deal signe recu de l'Agent 8 (DealToCSM) via queue BullMQ `csm-onboarding`.
**Sortie :** Referrals vers Agent 1 (VEILLEUR), metriques vers Agent 7 (ANALYSTE), churn vers Agent 6 (NURTUREUR), upsell vers Agent 8 (DEALMAKER).

**Objectif strategique :** Maximiser la Customer Lifetime Value (CLV) de chaque client Axiom en assurant satisfaction, expansion et advocacy.

### 1.2 Responsabilites exactes

| Responsabilite | Agent 10 fait | Autres agents font |
|---|---|---|
| **Onboarding** | Sequence welcome J1-J30, kick-off, collecte acces, TTV tracking | Agent 8 a gere le closing et transmet le deal signe |
| **Satisfaction** | Health Score composite, NPS/CSAT automatise, detection churn | Agent 7 analyse les metriques globales |
| **Upsell/Cross-sell** | Detection signaux, scoring opportunite, proposition | Agent 8 reprend pour le closing upsell |
| **Collecte avis** | Sequences demande avis, 5 plateformes, gestion negatifs | Agent 4 exploite les avis pour le contenu |
| **Referral** | Programme ambassadeur, tracking, commissions | Agent 1 recoit les leads referral pour enrichissement |
| **Prevention churn** | Detection signaux, actions preventives, playbooks | Agent 6 gere le win-back des clients churnes |

### 1.3 Ce que l'Agent 10 NE fait PAS

- Ne fait PAS la prospection initiale (responsabilite Agents 1-5)
- Ne fait PAS le closing des deals (responsabilite Agent 8 DEALMAKER)
- Ne fait PAS le nurturing des prospects froids (responsabilite Agent 6 NURTUREUR)
- Ne fait PAS l'analyse globale du pipeline (responsabilite Agent 7 ANALYSTE)
- Ne fait PAS les appels d'offres (responsabilite Agent 9)
- Ne fait PAS la redaction de contenu marketing (responsabilite Agent 4 REDACTEUR)

### 1.4 Position dans le pipeline

```
PIPELINE AXIOM MARKETING -- 10 AGENTS

Agent 1 (VEILLEUR)     ─→ Agent 2 (ENRICHISSEUR) ─→ Agent 3 (SCOREUR)
                                                          │
                                                          v
Agent 6 (NURTUREUR) ←── Agent 5 (SUIVEUR)  ←──── Agent 4 (REDACTEUR)
       │                      │
       │                      v
       │                Jonathan (RDV Decouverte)
       │                      │
       │                      v
       │               Agent 8 (DEALMAKER) ──→ Agent 9 (APPELS D'OFFRES)
       │                      │
       │          ┌───────────┼───────────┐
       │          v           v           v
       │   Agent 10 (CSM)  Agent 7    Agent 6
       │   [Deal signe]   [Metriques] [Deal perdu]
       │          │
       │          ├── Referrals ──→ Agent 1 (boucle)
       │          ├── Metriques ──→ Agent 7
       │          ├── Churn     ──→ Agent 6
       │          └── Upsell    ──→ Agent 8 (boucle)
       │
       └── Win-back reussi ──→ Agent 10 (boucle)
```

### 1.5 Chiffres cles justifiant l'Agent 10

| Metrique | Valeur | Source |
|---|---|---|
| Cout acquisition vs retention | 5x plus cher d'acquerir | Benchmark B2B 2026 |
| Impact retention +5% | +25 a 95% de profit | Harvard Business Review |
| Churn onboarding | 67% des churns en onboarding | SaaS Benchmark |
| Upsell vs new business | 3-5x moins cher | B2B Services 2026 |
| Conversion referral vs cold | 30-40% vs 1-3% | B2B Benchmark 2026 |
| LTV avec upsell | +25 a 98% | Modele Axiom |
| Retention multi-services | 95% (3+ services) vs 75% (1 service) | Agences web 2026 |

---

## 2. INPUT : SCHEMA JSON RECU DE L'AGENT 8 (DealToCSM)

### 2.1 Source et declencheur

L'Agent 10 recoit ses donnees via la queue BullMQ `csm-onboarding` quand le webhook Yousign de l'Agent 8 confirme la signature du contrat.

### 2.2 Schema JSON exact

```typescript
interface DealToCSM {
  deal_id: string
  prospect_id: string

  prospect: {
    prenom: string
    nom: string
    email: string
    telephone?: string
    linkedin_url?: string
    poste: string
  }

  entreprise: {
    nom: string
    siret: string
    site_web: string
    secteur: string
    taille: number
  }

  contrat: {
    montant_ht: number
    tier: 'bronze' | 'silver' | 'gold'
    type_projet: 'site_vitrine' | 'ecommerce_shopify' | 'app_flutter' | 'app_metier' | 'rgaa' | 'tracking_server_side'
    scope_detaille: string[]          // Liste des livrables convenus
    date_signature: string            // ISO 8601
    date_demarrage_prevue: string     // ISO 8601
    duree_estimee_semaines: number
    conditions_paiement: '50/50' | '30/40/30' | 'mensuel'
    contrat_pdf_url: string           // URL du contrat signe
  }

  notes_vente: string                 // Contexte commercial (objections levees, attentes speciales)

  metadata: {
    agent: 'agent_8_dealmaker'
    created_at: string
    deal_cycle_days: number           // Nombre de jours du cycle de vente
    nb_relances: number
    engagement_score_final: number
    version: string
  }
}
```

### 2.3 Validation de l'input

```typescript
import { z } from 'zod'

const DealToCSMSchema = z.object({
  deal_id: z.string().uuid(),
  prospect_id: z.string().uuid(),

  prospect: z.object({
    prenom: z.string().min(1),
    nom: z.string().min(1),
    email: z.string().email(),
    telephone: z.string().optional(),
    linkedin_url: z.string().url().optional(),
    poste: z.string().min(1),
  }),

  entreprise: z.object({
    nom: z.string().min(1),
    siret: z.string().regex(/^\d{14}$/),
    site_web: z.string().url(),
    secteur: z.string().min(1),
    taille: z.number().int().positive(),
  }),

  contrat: z.object({
    montant_ht: z.number().positive(),
    tier: z.enum(['bronze', 'silver', 'gold']),
    type_projet: z.enum([
      'site_vitrine', 'ecommerce_shopify', 'app_flutter',
      'app_metier', 'rgaa', 'tracking_server_side'
    ]),
    scope_detaille: z.array(z.string()).min(1),
    date_signature: z.string().datetime(),
    date_demarrage_prevue: z.string().datetime(),
    duree_estimee_semaines: z.number().int().positive(),
    conditions_paiement: z.enum(['50/50', '30/40/30', 'mensuel']),
    contrat_pdf_url: z.string().url(),
  }),

  notes_vente: z.string(),

  metadata: z.object({
    agent: z.literal('agent_8_dealmaker'),
    created_at: z.string().datetime(),
    deal_cycle_days: z.number().int().nonnegative(),
    nb_relances: z.number().int().nonnegative(),
    engagement_score_final: z.number().min(0).max(100),
    version: z.string(),
  }),
})

// Validation a la reception
export function validateDealInput(data: unknown): DealToCSM {
  const result = DealToCSMSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`Input Agent 8 invalide: ${result.error.message}`)
  }
  return result.data
}
```

### 2.4 Verification de coherence avec l'output Agent 8

| Champ output Agent 8 (DealToCSM) | Requis par Agent 10 | Statut |
|---|---|---|
| `deal_id` | Identifiant unique du deal | VALIDE |
| `prospect_id` | Lien vers le prospect en BDD | VALIDE |
| `prospect.prenom/nom/email` | Pour les communications onboarding | VALIDE |
| `prospect.telephone` | Pour appels kick-off et interventions | VALIDE |
| `prospect.poste` | Pour adapter le ton des communications | VALIDE |
| `entreprise.nom/siret` | Pour la facturation et le suivi | VALIDE |
| `entreprise.site_web` | Pour monitoring post-livraison | VALIDE |
| `entreprise.secteur` | Pour personnaliser les templates | VALIDE |
| `contrat.montant_ht` | Pour le calcul de valeur client | VALIDE |
| `contrat.tier` | Pour adapter le niveau de service | VALIDE |
| `contrat.type_projet` | Pour router vers le bon workflow onboarding | VALIDE |
| `contrat.scope_detaille` | Pour creer le backlog du projet | VALIDE |
| `contrat.date_demarrage_prevue` | Pour planifier le kickoff | VALIDE |
| `contrat.duree_estimee_semaines` | Pour fixer les jalons | VALIDE |
| `contrat.conditions_paiement` | Pour la gestion des factures | VALIDE |
| `contrat.contrat_pdf_url` | Archive du contrat signe | VALIDE |
| `notes_vente` | Contexte pour l'equipe projet | VALIDE |
| `metadata.deal_cycle_days` | Pour analyse performance pipeline | VALIDE |
| `metadata.engagement_score_final` | Pour calibrer l'approche onboarding | VALIDE |

**Resultat : 100% des champs requis sont presents dans l'output Agent 8.**

---

## 3. SOUS-AGENTS

### 3a. SOUS-AGENT 10a -- ONBOARDEUR

#### 3a.1 Mission

L'Onboardeur gere l'integralite du processus d'onboarding post-signature : emails de bienvenue, organisation du kick-off meeting, collecte des acces techniques, suivi du Time-to-Value, et detection des onboardings a risque.

**Objectif :** Amener chaque client au premier moment de valeur (Time-to-Value) dans les delais cibles.

#### 3a.2 Timeline onboarding par type de projet

| Type Projet | Duree Onboarding | Time-to-Value cible | Premier livrable |
|---|---|---|---|
| Site vitrine | 3-5 jours | < 12 jours | Design concepts |
| E-commerce Shopify | 5-7 jours | < 14 jours | Catalogue produits |
| App Flutter | 7-10 jours | < 21 jours | MVP prototype |
| App metier | 7-10 jours | < 21 jours | Data import + dashboard |
| RGAA collectivites | 5-7 jours | < 14 jours | Audit initial |
| Tracking server-side | 2-3 jours | < 5 jours | Premier tracking live |

#### 3a.3 Kick-off meeting

**Participants optimaux :**
- **Cote client :** Decideur budget, utilisateur principal, contact technique (min 2, max 4)
- **Cote Axiom :** Project manager, lead dev, designer, account manager (min 3)

**Agenda propose (90-120 minutes) :**

| Segment | Duree | Owner | Contenu |
|---|---|---|---|
| Introductions | 10 min | PM | Noms, roles, responsabilites, canaux de contact |
| Vue d'ensemble projet | 15 min | PM | Scope, livrables, criteres de succes |
| Process & Timeline | 10 min | PM | Phases dev, checkpoints, nombre de revisions |
| Setup technique | 15 min | Dev Lead | Acces serveurs, CMS, analytics, git, hosting |
| Design & Contenu | 20 min | Designer | Style guide, references, deadlines contenu |
| Risques & Hypotheses | 10 min | PM | Scope creep, retards, dependances |
| Plan de communication | 10 min | PM | Standup hebdo, rapports, escalade |
| Q&A & Decisions | 10 min | Tous | Discussion ouverte, documentation |

**Documents a preparer AVANT kick-off :**

| Document | Format | Contenu |
|---|---|---|
| Project Charter | Google Doc (2 pages) | Objectifs business, success metrics, scope |
| Creative Brief | Google Doc (3 pages) | Audience cible, tone de marque, concurrents |
| Spec technique | Notion/Confluence | Plateforme, integrations, SEO, securite |
| Timeline visuelle | Gantt (Asana/Monday) | Phases, jalons, deadlines, revisions |
| Checklist acces | Google Form | Serveurs, domaines, CMS, analytics, APIs |

**Acces techniques a collecter :**
- Hebergement actuel / credentials FTP
- Registrar domaine
- CMS / e-commerce existant
- Google Analytics / Search Console
- Email service provider (Mailchimp, Brevo)
- Comptes reseaux sociaux
- APIs (si integration necessaire)
- Processeur paiement (Stripe pour e-commerce)

#### 3a.4 Detection onboarding at-risk

```typescript
import { db, slack, emailService, crmService } from './services'

// ============================================================
// INTERFACES ONBOARDING
// ============================================================

interface OnboardingStatus {
  deal_id: string
  prospect_id: string
  type_projet: string
  date_signature: string
  date_kickoff_prevu: string
  date_kickoff_reel?: string
  steps_completed: OnboardingStep[]
  steps_pending: OnboardingStep[]
  health: 'on_track' | 'at_risk' | 'critical'
  ttv_target_days: number
  ttv_actual_days?: number
  risk_signals: RiskSignal[]
}

interface OnboardingStep {
  step_id: string
  name: string
  due_date: string
  completed_date?: string
  status: 'pending' | 'in_progress' | 'completed' | 'overdue'
}

interface RiskSignal {
  type: 'no_asset_submission' | 'no_email_opens' | 'no_feedback' | 'missed_calls' | 'no_kickoff'
  detected_at: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  days_since_trigger: number
}

// ============================================================
// TTV TARGETS PAR TYPE DE PROJET
// ============================================================

const TTV_TARGETS: Record<string, number> = {
  site_vitrine: 12,
  ecommerce_shopify: 14,
  app_flutter: 21,
  app_metier: 21,
  rgaa: 14,
  tracking_server_side: 5,
}

// ============================================================
// DETECTION AT-RISK ONBOARDING
// ============================================================

async function checkOnboardingHealth(dealId: string): Promise<OnboardingStatus> {
  const deal = await db.getDeal(dealId)
  const onboarding = await db.getOnboarding(dealId)
  const emailMetrics = await emailService.getMetrics(deal.prospect.email)
  const signatureDate = new Date(deal.contrat.date_signature)
  const now = new Date()
  const daysSinceSignature = Math.floor(
    (now.getTime() - signatureDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  const riskSignals: RiskSignal[] = []

  // Signal 1 : Pas de soumission d'assets 5 jours apres kick-off
  if (onboarding.kickoff_done && !onboarding.assets_submitted) {
    const daysSinceKickoff = Math.floor(
      (now.getTime() - new Date(onboarding.kickoff_date!).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysSinceKickoff > 5) {
      riskSignals.push({
        type: 'no_asset_submission',
        detected_at: now.toISOString(),
        severity: daysSinceKickoff > 10 ? 'high' : 'medium',
        days_since_trigger: daysSinceKickoff,
      })
    }
  }

  // Signal 2 : Pas d'ouverture email depuis 10 jours
  if (emailMetrics.last_open_date) {
    const daysSinceLastOpen = Math.floor(
      (now.getTime() - new Date(emailMetrics.last_open_date).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysSinceLastOpen > 10) {
      riskSignals.push({
        type: 'no_email_opens',
        detected_at: now.toISOString(),
        severity: daysSinceLastOpen > 15 ? 'high' : 'medium',
        days_since_trigger: daysSinceLastOpen,
      })
    }
  }

  // Signal 3 : Pas de feedback sur un livrable en 10 jours
  const pendingDeliverables = onboarding.deliverables?.filter(
    (d: any) => d.status === 'awaiting_feedback'
  )
  for (const deliverable of pendingDeliverables || []) {
    const daysSinceDelivery = Math.floor(
      (now.getTime() - new Date(deliverable.delivered_at).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysSinceDelivery > 10) {
      riskSignals.push({
        type: 'no_feedback',
        detected_at: now.toISOString(),
        severity: daysSinceDelivery > 14 ? 'high' : 'medium',
        days_since_trigger: daysSinceDelivery,
      })
    }
  }

  // Signal 4 : 2+ appels manques
  const missedCalls = onboarding.calls?.filter((c: any) => c.status === 'no_show').length || 0
  if (missedCalls >= 2) {
    riskSignals.push({
      type: 'missed_calls',
      detected_at: now.toISOString(),
      severity: missedCalls >= 3 ? 'critical' : 'high',
      days_since_trigger: daysSinceSignature,
    })
  }

  // Signal 5 : Pas de kick-off programme a J+7
  if (!onboarding.kickoff_scheduled && daysSinceSignature > 7) {
    riskSignals.push({
      type: 'no_kickoff',
      detected_at: now.toISOString(),
      severity: daysSinceSignature > 14 ? 'critical' : 'high',
      days_since_trigger: daysSinceSignature,
    })
  }

  // Determiner le health global
  const hasCritical = riskSignals.some(s => s.severity === 'critical')
  const hasHigh = riskSignals.some(s => s.severity === 'high')
  const health = hasCritical ? 'critical' : hasHigh ? 'at_risk' : 'on_track'

  // Actions automatiques selon le health
  if (health === 'at_risk') {
    await handleAtRiskOnboarding(deal, riskSignals)
  } else if (health === 'critical') {
    await handleCriticalOnboarding(deal, riskSignals)
  }

  return {
    deal_id: dealId,
    prospect_id: deal.prospect_id,
    type_projet: deal.contrat.type_projet,
    date_signature: deal.contrat.date_signature,
    date_kickoff_prevu: deal.contrat.date_demarrage_prevue,
    date_kickoff_reel: onboarding.kickoff_date,
    steps_completed: onboarding.steps.filter((s: any) => s.status === 'completed'),
    steps_pending: onboarding.steps.filter((s: any) => s.status !== 'completed'),
    health,
    ttv_target_days: TTV_TARGETS[deal.contrat.type_projet] || 14,
    ttv_actual_days: onboarding.ttv_reached_date
      ? Math.floor(
          (new Date(onboarding.ttv_reached_date).getTime() - signatureDate.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : undefined,
    risk_signals: riskSignals,
  }
}

async function handleAtRiskOnboarding(deal: any, signals: RiskSignal[]) {
  // 1. Flag CRM
  await crmService.updateDeal(deal.deal_id, {
    onboarding_status: 'at_risk',
    risk_signals: signals.map(s => s.type),
  })

  // 2. Alerte Slack PM
  await slack.send('#csm-alerts', {
    text: `Onboarding AT-RISK : ${deal.entreprise.nom} (${deal.contrat.type_projet})`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Onboarding a risque*\n` +
            `Client: ${deal.prospect.prenom} ${deal.prospect.nom} (${deal.entreprise.nom})\n` +
            `Projet: ${deal.contrat.type_projet} - ${deal.contrat.montant_ht} EUR\n` +
            `Signaux: ${signals.map(s => s.type).join(', ')}\n` +
            `Action: Appeler dans les 48h`,
        },
      },
    ],
  })

  // 3. Email empathique au client
  await emailService.send({
    to: deal.prospect.email,
    subject: `${deal.prospect.prenom}, tout va bien avec votre projet ?`,
    template: 'onboarding_checkin',
    data: {
      prenom: deal.prospect.prenom,
      type_projet: deal.contrat.type_projet,
      pm_name: deal.pm_assigned || 'Jonathan',
      pm_calendar: 'https://calendly.com/axiom-pm/15min',
    },
  })
}

async function handleCriticalOnboarding(deal: any, signals: RiskSignal[]) {
  // 1. Alerte urgente Slack
  await slack.send('#csm-urgent', {
    text: `URGENT - Onboarding CRITIQUE : ${deal.entreprise.nom}`,
  })

  // 2. Escalade a Jonathan
  await slack.dm('jonathan', {
    text: `Onboarding critique pour ${deal.entreprise.nom} (${deal.contrat.montant_ht} EUR). ` +
      `Signaux: ${signals.map(s => s.type).join(', ')}. Intervention requise.`,
  })

  // 3. Planifier appel PM/Client dans les 24h
  await crmService.createTask({
    type: 'call',
    priority: 'urgent',
    assignee: deal.pm_assigned || 'jonathan',
    description: `Appeler ${deal.prospect.prenom} ${deal.prospect.nom} - onboarding critique`,
    due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })
}
```

#### 3a.5 Workflow principal onboarding

```typescript
import { Queue, Worker, Job } from 'bullmq'
import { validateDealInput } from './validation'

const onboardingQueue = new Queue('csm-onboarding', { connection: redisConnection })

// ============================================================
// WORKER PRINCIPAL : RECEPTION DEAL SIGNE
// ============================================================

const onboardingWorker = new Worker('csm-onboarding', async (job: Job<DealToCSM>) => {
  const deal = validateDealInput(job.data)

  console.log(`[CSM] Nouveau deal recu: ${deal.deal_id} - ${deal.entreprise.nom}`)

  // 1. Creer le dossier client
  const clientFolder = await createClientFolder(deal)

  // 2. Envoyer email de bienvenue (J1)
  await sendWelcomeEmail(deal)

  // 3. Planifier la sequence onboarding
  const onboardingPlan = generateOnboardingPlan(deal)
  await db.saveOnboardingPlan(deal.deal_id, onboardingPlan)

  // 4. Creer le projet dans l'outil de gestion (Asana/Monday)
  await createProjectInPM(deal)

  // 5. Planifier les emails automatiques
  await scheduleOnboardingEmails(deal, onboardingPlan)

  // 6. Notifier l'equipe interne
  await notifyTeam(deal)

  // 7. Demarrer le monitoring TTV
  await startTTVMonitoring(deal)

  return { status: 'onboarding_started', deal_id: deal.deal_id }
}, { connection: redisConnection, concurrency: 5 })

// ============================================================
// GENERATION DU PLAN D'ONBOARDING
// ============================================================

interface OnboardingPlan {
  deal_id: string
  type_projet: string
  steps: PlannedStep[]
  emails: ScheduledEmail[]
  kickoff: KickoffDetails
  ttv_target: Date
}

interface PlannedStep {
  step_id: string
  name: string
  day_offset: number  // Jours apres signature
  owner: 'client' | 'axiom' | 'both'
  description: string
}

interface ScheduledEmail {
  template: string
  day_offset: number
  subject: string
}

interface KickoffDetails {
  target_date: Date
  duration_minutes: number
  agenda: string[]
  documents_required: string[]
}

function generateOnboardingPlan(deal: DealToCSM): OnboardingPlan {
  const signatureDate = new Date(deal.contrat.date_signature)
  const ttvDays = TTV_TARGETS[deal.contrat.type_projet] || 14

  // Steps communs a tous les projets
  const baseSteps: PlannedStep[] = [
    { step_id: 'welcome', name: 'Email de bienvenue envoye', day_offset: 0, owner: 'axiom', description: 'Email automatique avec liens et contacts' },
    { step_id: 'folder', name: 'Dossier partage cree', day_offset: 0, owner: 'axiom', description: 'Google Drive + Notion avec templates' },
    { step_id: 'pm_assigned', name: 'PM assigne et presente', day_offset: 0, owner: 'axiom', description: 'Notification equipe interne' },
    { step_id: 'kickoff_scheduled', name: 'Kick-off planifie', day_offset: 2, owner: 'both', description: 'Calendly ou email direct' },
    { step_id: 'pre_kickoff_email', name: 'Email pre-kickoff envoye', day_offset: 3, owner: 'axiom', description: 'Checklist preparation + acces' },
    { step_id: 'kickoff_done', name: 'Kick-off realise', day_offset: 5, owner: 'both', description: 'Reunion 90-120 min' },
    { step_id: 'recap_sent', name: 'Recap kick-off envoye', day_offset: 7, owner: 'axiom', description: 'Decisions, next steps, contacts' },
    { step_id: 'assets_collected', name: 'Assets collectes', day_offset: 10, owner: 'client', description: 'Contenu, images, acces techniques' },
    { step_id: 'first_deliverable', name: 'Premier livrable envoye', day_offset: 14, owner: 'axiom', description: 'Design concepts / architecture' },
    { step_id: 'monthly_checkin', name: 'Check-in mensuel', day_offset: 30, owner: 'both', description: 'Rapport de progression' },
  ]

  // Steps specifiques par type de projet
  const projectSpecificSteps: Record<string, PlannedStep[]> = {
    site_vitrine: [
      { step_id: 'brand_review', name: 'Revue branding', day_offset: 4, owner: 'client', description: 'Guide de style, couleurs, fonts' },
      { step_id: 'content_received', name: 'Contenu texte recu', day_offset: 8, owner: 'client', description: 'Textes pages, images haute qualite' },
    ],
    ecommerce_shopify: [
      { step_id: 'product_catalog', name: 'Catalogue produits fourni', day_offset: 7, owner: 'client', description: 'CSV produits, photos, descriptions' },
      { step_id: 'payment_setup', name: 'Stripe/PayPal configure', day_offset: 10, owner: 'both', description: 'Connexion processeur paiement' },
    ],
    app_flutter: [
      { step_id: 'ux_workshop', name: 'Workshop UX realise', day_offset: 7, owner: 'both', description: 'Parcours utilisateur, wireframes' },
      { step_id: 'api_specs', name: 'Specs API definies', day_offset: 10, owner: 'axiom', description: 'Endpoints, data models, auth' },
    ],
    app_metier: [
      { step_id: 'process_mapping', name: 'Mapping processus metier', day_offset: 7, owner: 'both', description: 'Workflow existant, besoins specifiques' },
      { step_id: 'data_import', name: 'Import donnees teste', day_offset: 14, owner: 'both', description: 'Migration donnees existantes' },
    ],
    rgaa: [
      { step_id: 'audit_scope', name: 'Perimetre audit defini', day_offset: 3, owner: 'both', description: 'Pages cibles, referentiel RGAA' },
      { step_id: 'initial_audit', name: 'Audit initial realise', day_offset: 10, owner: 'axiom', description: 'Rapport conformite initial' },
    ],
    tracking_server_side: [
      { step_id: 'gtm_access', name: 'Acces GTM/GA fournis', day_offset: 1, owner: 'client', description: 'Google Tag Manager + Analytics' },
      { step_id: 'tracking_plan', name: 'Plan de tracking valide', day_offset: 3, owner: 'both', description: 'Events, conversions, custom dimensions' },
    ],
  }

  const steps = [
    ...baseSteps,
    ...(projectSpecificSteps[deal.contrat.type_projet] || []),
  ].sort((a, b) => a.day_offset - b.day_offset)

  const emails: ScheduledEmail[] = [
    { template: 'welcome_j1', day_offset: 0, subject: `Bienvenue chez Axiom, ${deal.prospect.prenom} !` },
    { template: 'pre_kickoff_j3', day_offset: 3, subject: `Kick-off demain ! 3 choses a preparer` },
    { template: 'recap_kickoff_j7', day_offset: 7, subject: `Recap kick-off + prochaines etapes` },
    { template: 'first_milestone_j14', day_offset: 14, subject: `Premier apercu : votre ${deal.contrat.type_projet} prend forme` },
    { template: 'monthly_checkin_j30', day_offset: 30, subject: `Point mensuel : avancement de votre projet` },
  ]

  const kickoff: KickoffDetails = {
    target_date: new Date(signatureDate.getTime() + 5 * 24 * 60 * 60 * 1000),
    duration_minutes: deal.contrat.type_projet === 'tracking_server_side' ? 60 : 90,
    agenda: [
      'Introductions et roles (10 min)',
      'Vue d\'ensemble projet et scope (15 min)',
      'Timeline et jalons (10 min)',
      'Setup technique et acces (15 min)',
      'Design et contenu (20 min)',
      'Risques et hypotheses (10 min)',
      'Plan de communication (10 min)',
      'Questions et decisions (10 min)',
    ],
    documents_required: [
      'Project Charter',
      'Creative Brief',
      'Spec technique',
      'Timeline visuelle (Gantt)',
      'Checklist acces (Google Form)',
    ],
  }

  return {
    deal_id: deal.deal_id,
    type_projet: deal.contrat.type_projet,
    steps,
    emails,
    kickoff,
    ttv_target: new Date(signatureDate.getTime() + ttvDays * 24 * 60 * 60 * 1000),
  }
}
```

---

### 3b. SOUS-AGENT 10b -- DETECTEUR UPSELL

#### 3b.1 Mission

Le Detecteur Upsell identifie les opportunites de cross-sell et upsell parmi les clients existants d'Axiom, en analysant les signaux comportementaux, la sante du compte, et le timing optimal. Il score chaque opportunite et genere des propositions personnalisees.

**Regle cardinale :** Ne JAMAIS proposer d'upsell si le client est en difficulte, insatisfait, ou n'a pas atteint le Time-to-Value.

#### 3b.2 Matrice cross-sell par service Axiom

| Depuis (service actuel) | Vers (upsell) | Probabilite | Montant moyen | Timing optimal | Effort closing |
|---|---|---|---|---|---|
| Site vitrine | E-commerce Shopify | 45% | +8 000 EUR | Mois 3-4 | Moyen |
| Site vitrine | Tracking server-side | 65% | +990 EUR + 89 EUR/mois | Mois 1-2 | Faible |
| Site vitrine | App Flutter | 15% | +30 000 EUR | Mois 6+ | Eleve |
| E-commerce Shopify | Tracking server-side | 80% | +990 EUR + 89 EUR/mois | Mois 1-2 | Faible |
| E-commerce Shopify | App Flutter | 30% | +20 000 EUR | Mois 4-6 | Eleve |
| App Flutter | Tracking server-side | 70% | +990 EUR + 89 EUR/mois | Mois 2 | Faible |
| App Flutter | App metier | 25% | +15 000 EUR | Mois 6+ | Eleve |
| App metier | Tracking server-side | 70% | +990 EUR + 89 EUR/mois | Mois 2 | Faible |
| App metier | App Flutter (complement) | 20% | +20 000 EUR | Mois 6+ | Eleve |
| RGAA | Site vitrine (refonte) | 35% | +8 000 EUR | Mois 2-3 | Moyen |
| RGAA | E-commerce Shopify | 20% | +10 000 EUR | Mois 4-6 | Moyen |
| Tracking server-side | Site vitrine | 25% | +7 500 EUR | Mois 3-4 | Moyen |
| Tracking server-side | E-commerce Shopify | 30% | +10 000 EUR | Mois 3-4 | Moyen |

**Insight strategique :** Le tracking server-side est le "golden cross-sell" -- plus haute probabilite (65-80%), revenu recurrent, et friction minimale.

#### 3b.3 Signaux comportementaux de detection

| Signal | Definition | Timing detection | Probabilite upsell |
|---|---|---|---|
| Usage au-dela du scope | Client utilise plus de pages/produits que prevu | Mois 2-3 | 60% |
| Demande de feature | "Peut-on ajouter X ?" = besoin croissant | Mois 2-4 | 55% |
| Croissance trafic/ventes | Client rapporte +50% trafic ou ventes | Mois 2-3 | 70% |
| Expansion equipe | "On recrute 3 personnes dans [departement]" | Mois 3-6 | 65% |
| Outil complementaire | Client utilise outils externes pour combler un manque | Mois 2-4 | 75% |
| Demande integration | "Peut-on connecter ca a [outil] ?" | Mois 1-3 | 80% |
| Approbation budget | Client approuve budget supplementaire | Anytime | 70% |
| Levee de fonds | Client annonce financement / Serie A | Mois 3-6 | 65% |
| Croissance publique | Client promeut son produit sur LinkedIn/PR | Mois 3-6 | 60% |

#### 3b.4 Scoring opportunite upsell (0-100)

```typescript
// ============================================================
// SCORING UPSELL
// ============================================================

interface UpsellSignals {
  // Product Health (0-30 pts)
  dashboard_active_weekly: boolean       // Client actif 3+/semaine : +15 pts
  zero_complaints_60days: boolean        // Zero plainte 60 jours : +8 pts
  project_on_time_budget: boolean        // Projet dans les temps/budget : +7 pts

  // Usage Growth (0-25 pts)
  traffic_growth_50pct: boolean          // Trafic/usage +50% depuis lancement : +15 pts
  feature_usage_80pct: boolean           // Utilise 80%+ des features : +10 pts

  // Budget Signals (0-20 pts)
  budget_approved: boolean               // Budget supplementaire approuve : +20 pts
  company_growth: boolean                // Entreprise en croissance (financement, CA) : +15 pts
  feature_request_paid: boolean          // Demande feature payante : +10 pts

  // Relationship Strength (0-15 pts)
  nps_promoter: boolean                  // NPS > 8 : +10 pts
  regular_communication: boolean         // Communication hebdo/bi-hebdo : +5 pts

  // Timeline Fit (0-10 pts)
  days_since_launch: number              // 30+ jours post-lancement : +5 pts
  pre_renewal_window: boolean            // 6 mois avant renouvellement : +10 pts
  no_active_crisis: boolean              // Pas de crise en cours : +3 pts
}

interface UpsellOpportunity {
  client_id: string
  deal_id: string
  score: number
  priority: 'high' | 'medium' | 'low' | 'not_ready'
  recommended_product: string
  recommended_timing: string
  estimated_revenue: number
  template_id: string
  signals_detected: string[]
  blocker_reasons: string[]
}

function calculateUpsellScore(signals: UpsellSignals): number {
  let score = 0

  // 1. Product Health (0-30 pts)
  if (signals.dashboard_active_weekly) score += 15
  if (signals.zero_complaints_60days) score += 8
  if (signals.project_on_time_budget) score += 7

  // 2. Usage Growth (0-25 pts)
  if (signals.traffic_growth_50pct) score += 15
  if (signals.feature_usage_80pct) score += 10

  // 3. Budget Signals (0-20 pts)
  if (signals.budget_approved) score += 20
  else if (signals.company_growth) score += 15
  else if (signals.feature_request_paid) score += 10

  // 4. Relationship Strength (0-15 pts)
  if (signals.nps_promoter) score += 10
  if (signals.regular_communication) score += 5

  // 5. Timeline Fit (0-10 pts)
  if (signals.pre_renewal_window) score += 10
  else if (signals.days_since_launch >= 30) score += 5
  if (signals.no_active_crisis) score += 3

  // Plafonner a 100
  return Math.min(score, 100)
}

function evaluateUpsellOpportunity(
  clientId: string,
  dealId: string,
  signals: UpsellSignals,
  currentService: string,
  healthScore: number,
  npsScore: number
): UpsellOpportunity {
  const score = calculateUpsellScore(signals)

  // Verifier les blockers
  const blockerReasons: string[] = []
  if (healthScore < 50) blockerReasons.push('Health score trop bas')
  if (npsScore < 6) blockerReasons.push('NPS detracteur')
  if (signals.days_since_launch < 30) blockerReasons.push('Trop tot post-lancement')
  if (!signals.no_active_crisis) blockerReasons.push('Crise en cours')

  // Determiner la priorite
  let priority: UpsellOpportunity['priority']
  if (blockerReasons.length > 0) {
    priority = 'not_ready'
  } else if (score >= 80) {
    priority = 'high'
  } else if (score >= 60) {
    priority = 'medium'
  } else if (score >= 40) {
    priority = 'low'
  } else {
    priority = 'not_ready'
  }

  // Recommander le produit optimal
  const recommendation = getRecommendedUpsell(currentService, signals)

  // Signaux detectes
  const detectedSignals: string[] = []
  if (signals.dashboard_active_weekly) detectedSignals.push('usage_actif')
  if (signals.traffic_growth_50pct) detectedSignals.push('croissance_trafic')
  if (signals.budget_approved) detectedSignals.push('budget_approuve')
  if (signals.feature_request_paid) detectedSignals.push('demande_feature')
  if (signals.company_growth) detectedSignals.push('croissance_entreprise')
  if (signals.nps_promoter) detectedSignals.push('nps_promoteur')

  return {
    client_id: clientId,
    deal_id: dealId,
    score,
    priority,
    recommended_product: recommendation.product,
    recommended_timing: recommendation.timing,
    estimated_revenue: recommendation.revenue,
    template_id: recommendation.templateId,
    signals_detected: detectedSignals,
    blocker_reasons: blockerReasons,
  }
}

function getRecommendedUpsell(
  currentService: string,
  signals: UpsellSignals
): { product: string; timing: string; revenue: number; templateId: string } {
  // Tracking server-side est TOUJOURS la premiere recommandation (golden cross-sell)
  const hasTracking = false // A verifier en BDD

  if (!hasTracking) {
    return {
      product: 'tracking_server_side',
      timing: 'Mois 1-2 post-lancement',
      revenue: 990 + 89 * 12, // 2 058 EUR annuel
      templateId: 'upsell_tracking',
    }
  }

  // Sinon, matrice par service actuel
  const upsellMatrix: Record<string, { product: string; timing: string; revenue: number; templateId: string }> = {
    site_vitrine: { product: 'ecommerce_shopify', timing: 'Mois 3-4', revenue: 8000, templateId: 'upsell_ecommerce' },
    ecommerce_shopify: { product: 'app_flutter', timing: 'Mois 4-6', revenue: 20000, templateId: 'upsell_app' },
    app_flutter: { product: 'app_metier', timing: 'Mois 6+', revenue: 15000, templateId: 'upsell_app_metier' },
    app_metier: { product: 'app_flutter', timing: 'Mois 6+', revenue: 20000, templateId: 'upsell_app_complement' },
    rgaa: { product: 'site_vitrine', timing: 'Mois 2-3', revenue: 8000, templateId: 'upsell_refonte' },
    tracking_server_side: { product: 'ecommerce_shopify', timing: 'Mois 3-4', revenue: 10000, templateId: 'upsell_ecommerce' },
  }

  return upsellMatrix[currentService] || {
    product: 'tracking_server_side',
    timing: 'Mois 2',
    revenue: 2058,
    templateId: 'upsell_tracking',
  }
}
```

#### 3b.5 Quand NE PAS proposer d'upsell

**Blockers absolus -- NE JAMAIS proposer si :**

| Condition | Raison | Action alternative |
|---|---|---|
| Projet en retard 2+ semaines | Client frustre, mauvais timing | Focus livraison |
| Client a escalade un probleme | Confiance cassee | Resolution + 30 jours cooling |
| Bugs non resolus sur core | Valeur actuelle pas demontree | Fix d'abord |
| Presence aux calls < 50% | Engagement insuffisant | Re-engager d'abord |
| NPS < 6 (Detracteur) | Client insatisfait | Intervention retention |
| Plaintes multiples non resolues | Confiance a reconstruire | Resolution prioritaire |
| Retard paiement | Stress financier | Discussion payment plan |
| Client demande remboursement | Deal en danger | Retention d'abord |
| Onboarding incomplet | TTV pas atteint | Completer onboarding |
| Contact cle quitte l'entreprise | Relation a reconstruire | Identifier nouveau champion |

---

### 3c. SOUS-AGENT 10c -- MESUREUR SATISFACTION

#### 3c.1 Mission

Le Mesureur Satisfaction calcule et maintient le Health Score composite de chaque client, automatise les surveys NPS/CSAT, detecte les signaux de churn, et declenche les actions preventives.

#### 3c.2 Health Score composite

**Formule :**

```
Health Score = (40% x Engagement) + (30% x Satisfaction) + (30% x Croissance)
```

**Score final : 0-100**

#### 3c.3 Indicateurs par composante

**A) ENGAGEMENT (40% du score)**

| Indicateur | Poids | Mesure | Source |
|---|---|---|---|
| Frequence login | 30% | Logins mensuels sur dashboard projet | Analytics |
| Reactivite emails | 25% | Taux ouverture emails Axiom | CRM/Mailchimp |
| Frequence contact | 20% | Appels, emails, tickets/mois | CRM |
| Participation formations | 15% | Presence webinaires, formations | CRM |
| Reactivite aux CTA | 10% | Reponse aux propositions, audits | CRM |

**B) SATISFACTION (30% du score)**

| Indicateur | Poids | Mesure | Source |
|---|---|---|---|
| Dernier NPS | 50% | Score NPS (normalise 0-100) | Survey |
| CSAT moyen | 30% | Score CSAT post-interaction | Survey |
| Tickets critiques ouverts | 10% | Nombre bugs/plaintes non resolus | Support |
| Sentiment communications | 10% | Analyse sentiment emails/appels | NLP |

**C) CROISSANCE (30% du score)**

| Indicateur | Poids | Mesure | Source |
|---|---|---|---|
| Revenue retention | 40% | MRR client vs mois precedent | Facturation |
| Adoption features | 30% | % features utilisees vs disponibles | Analytics |
| Croissance trafic | 20% | Evolution trafic site/app client | Analytics |
| Potentiel upsell | 10% | Score upsell (sous-agent 10b) | Interne |

#### 3c.4 Seuils d'action

| Score | Couleur | Statut | Action |
|---|---|---|---|
| **80-100** | Vert | Excellent | Candidat referral + promoteur + upsell |
| **60-79** | Jaune | Bon | Monitoring regulier, attention proactive |
| **50-59** | Orange | At-risk | Intervention preventive (appel, webinaire) |
| **30-49** | Orange fonce | Danger | Intervention serieuse (account review, plan remediation) |
| **< 30** | Rouge | Critique | Intervention executive + plan retention ou churn inevitable |

#### 3c.5 Code TypeScript Health Score

```typescript
// ============================================================
// HEALTH SCORE ENGINE
// ============================================================

interface HealthScoreComponents {
  engagement: EngagementMetrics
  satisfaction: SatisfactionMetrics
  growth: GrowthMetrics
}

interface EngagementMetrics {
  login_frequency_monthly: number         // Nombre de logins/mois
  email_open_rate: number                 // 0-100%
  contact_frequency_monthly: number       // Nombre contacts/mois
  training_participation_rate: number     // 0-100%
  cta_response_rate: number              // 0-100%
}

interface SatisfactionMetrics {
  last_nps_score: number                  // -100 a 100 (normalise 0-100)
  csat_average: number                    // 0-100%
  open_critical_tickets: number           // Nombre
  communication_sentiment: number         // 0-100 (positif)
}

interface GrowthMetrics {
  mrr_change_pct: number                  // -100 a +inf %
  feature_adoption_pct: number            // 0-100%
  traffic_growth_pct: number             // -100 a +inf %
  upsell_score: number                    // 0-100
}

interface HealthScoreResult {
  client_id: string
  deal_id: string
  total_score: number
  engagement_score: number
  satisfaction_score: number
  growth_score: number
  color: 'vert' | 'jaune' | 'orange' | 'rouge'
  status: 'excellent' | 'bon' | 'at_risk' | 'danger' | 'critique'
  churn_risk: boolean
  churn_probability: number               // 0-100%
  recommended_actions: string[]
  calculated_at: string
}

function calculateHealthScore(
  clientId: string,
  dealId: string,
  components: HealthScoreComponents
): HealthScoreResult {
  // ---- ENGAGEMENT (40%) ----
  const engagementRaw = calculateEngagement(components.engagement)
  const engagementScore = Math.min(engagementRaw, 100) * 0.4

  // ---- SATISFACTION (30%) ----
  const satisfactionRaw = calculateSatisfaction(components.satisfaction)
  const satisfactionScore = Math.min(satisfactionRaw, 100) * 0.3

  // ---- CROISSANCE (30%) ----
  const growthRaw = calculateGrowth(components.growth)
  const growthScore = Math.min(growthRaw, 100) * 0.3

  const totalScore = Math.round(engagementScore + satisfactionScore + growthScore)

  // Determiner couleur et statut
  const { color, status } = getHealthLevel(totalScore)

  // Detection churn
  const churnRisk = totalScore < 50
  const churnProbability = calculateChurnProbability(totalScore, components)

  // Actions recommandees
  const actions = getRecommendedActions(totalScore, color, components)

  return {
    client_id: clientId,
    deal_id: dealId,
    total_score: totalScore,
    engagement_score: Math.round(engagementRaw),
    satisfaction_score: Math.round(satisfactionRaw),
    growth_score: Math.round(growthRaw),
    color,
    status,
    churn_risk: churnRisk,
    churn_probability: churnProbability,
    recommended_actions: actions,
    calculated_at: new Date().toISOString(),
  }
}

function calculateEngagement(m: EngagementMetrics): number {
  // Login frequency: 0 = 0pts, 1-2 = 30pts, 3-5 = 60pts, 6+ = 100pts
  let loginScore = 0
  if (m.login_frequency_monthly >= 6) loginScore = 100
  else if (m.login_frequency_monthly >= 3) loginScore = 60
  else if (m.login_frequency_monthly >= 1) loginScore = 30

  return (
    loginScore * 0.30 +
    m.email_open_rate * 0.25 +
    Math.min(m.contact_frequency_monthly * 20, 100) * 0.20 +
    m.training_participation_rate * 0.15 +
    m.cta_response_rate * 0.10
  )
}

function calculateSatisfaction(m: SatisfactionMetrics): number {
  // Normaliser NPS (-100 a 100) vers 0-100
  const npsNormalized = ((m.last_nps_score + 100) / 200) * 100

  // Penalite tickets critiques: -10 pts par ticket
  const ticketPenalty = Math.max(0, 100 - m.open_critical_tickets * 10)

  return (
    npsNormalized * 0.50 +
    m.csat_average * 0.30 +
    ticketPenalty * 0.10 +
    m.communication_sentiment * 0.10
  )
}

function calculateGrowth(m: GrowthMetrics): number {
  // Normaliser MRR change: -50% = 0, 0% = 50, +50% = 100
  const mrrScore = Math.max(0, Math.min(100, (m.mrr_change_pct + 50) * 1))

  // Normaliser traffic growth: meme logique
  const trafficScore = Math.max(0, Math.min(100, (m.traffic_growth_pct + 50) * 1))

  return (
    mrrScore * 0.40 +
    m.feature_adoption_pct * 0.30 +
    trafficScore * 0.20 +
    m.upsell_score * 0.10
  )
}

function getHealthLevel(score: number): {
  color: 'vert' | 'jaune' | 'orange' | 'rouge'
  status: 'excellent' | 'bon' | 'at_risk' | 'danger' | 'critique'
} {
  if (score >= 80) return { color: 'vert', status: 'excellent' }
  if (score >= 60) return { color: 'jaune', status: 'bon' }
  if (score >= 50) return { color: 'orange', status: 'at_risk' }
  if (score >= 30) return { color: 'orange', status: 'danger' }
  return { color: 'rouge', status: 'critique' }
}

function calculateChurnProbability(
  totalScore: number,
  components: HealthScoreComponents
): number {
  // Modele simplifie : inverse du health score + signaux aggravants
  let baseProbability = Math.max(0, 100 - totalScore)

  // Aggravants
  if (components.satisfaction.last_nps_score < 0) baseProbability += 15
  if (components.engagement.login_frequency_monthly === 0) baseProbability += 20
  if (components.satisfaction.open_critical_tickets > 2) baseProbability += 10
  if (components.growth.mrr_change_pct < -20) baseProbability += 10

  return Math.min(baseProbability, 100)
}

function getRecommendedActions(
  score: number,
  color: string,
  components: HealthScoreComponents
): string[] {
  const actions: string[] = []

  if (color === 'vert') {
    actions.push('Candidat programme referral')
    actions.push('Evaluer opportunite upsell')
    actions.push('Demander avis Google/Trustpilot')
  }

  if (color === 'jaune') {
    actions.push('Planifier check-in proactif')
    actions.push('Envoyer contenu de valeur (case study, best practice)')
    if (components.engagement.login_frequency_monthly < 3)
      actions.push('Email re-engagement : rappeler les features non utilisees')
  }

  if (color === 'orange') {
    actions.push('URGENT : Planifier appel CSM dans les 48h')
    actions.push('Proposer webinaire/formation gratuite')
    if (components.satisfaction.open_critical_tickets > 0)
      actions.push('Resoudre tickets critiques en priorite')
    actions.push('Offrir credits service ou discount renewal')
  }

  if (color === 'rouge') {
    actions.push('CRITIQUE : Intervention executive immediate')
    actions.push('Escalade a Jonathan')
    actions.push('Plan remediation formalise dans les 24h')
    actions.push('Envisager offre exceptionnelle (discount, services gratuits)')
    actions.push('Decision : fight ou accept churn')
  }

  return actions
}

// ============================================================
// NPS/CSAT AUTOMATISE
// ============================================================

interface SurveyConfig {
  type: 'nps' | 'csat' | 'ces'
  timing: string                  // Expression cron ou event trigger
  channel: 'email' | 'in_app'
  tool: 'typeform' | 'surveymonkey'
}

const SURVEY_SCHEDULE: SurveyConfig[] = [
  // CSAT apres chaque phase (spec, design, dev, UAT)
  { type: 'csat', timing: 'on_phase_complete', channel: 'email', tool: 'typeform' },
  // CES a la fin du projet
  { type: 'ces', timing: 'on_project_delivery', channel: 'email', tool: 'typeform' },
  // NPS 30 jours post-livraison
  { type: 'nps', timing: '30_days_post_delivery', channel: 'email', tool: 'typeform' },
  // NPS trimestriel
  { type: 'nps', timing: 'quarterly', channel: 'email', tool: 'typeform' },
]

async function handleNPSResponse(
  clientId: string,
  score: number,
  comment: string
): Promise<void> {
  const category = score >= 9 ? 'promoteur' : score >= 7 ? 'passif' : 'detracteur'

  // Sauvegarder en BDD
  await db.saveSurveyResponse({
    client_id: clientId,
    type: 'nps',
    score,
    comment,
    category,
    responded_at: new Date().toISOString(),
  })

  // Actions automatiques selon le score
  switch (category) {
    case 'promoteur':
      // Tag referral candidate
      await crmService.addTag(clientId, 'referral_candidate')
      // Programmer demande d'avis (sous-agent 10d)
      await reviewQueue.add(`review-request-${clientId}`, {
        client_id: clientId,
        nps_score: score,
        delay: 7 * 24 * 60 * 60 * 1000, // 7 jours apres
      })
      // Evaluer upsell (sous-agent 10b)
      await upsellQueue.add(`upsell-eval-${clientId}`, {
        client_id: clientId,
        trigger: 'nps_promoter',
      })
      break

    case 'passif':
      // Tag at-risk monitoring
      await crmService.addTag(clientId, 'nps_passif')
      // Email follow-up : "Que pouvons-nous ameliorer ?"
      await emailService.send({
        to: (await db.getClient(clientId)).email,
        subject: 'Comment pouvons-nous passer de bien a excellent ?',
        template: 'nps_passif_followup',
        data: { comment },
      })
      break

    case 'detracteur':
      // Alert immediate
      await crmService.addTag(clientId, 'nps_detracteur')
      await slack.send('#csm-urgent', {
        text: `ALERTE NPS : Detracteur (score ${score}) - Client ${clientId}\nCommentaire: ${comment}`,
      })
      // Intervention dans les 24h
      await crmService.createTask({
        type: 'call',
        priority: 'urgent',
        assignee: 'csm_manager',
        description: `Appel detracteur NPS ${score} - ${comment}`,
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      break
  }
}
```

#### 3c.6 Detection churn automatique

**7 signaux de churn avec delai estime :**

| Signal | Delai avant churn | Severite | Trigger automatique |
|---|---|---|---|
| Silence radio (60+ jours) | 60-120 jours | Critique | Email + SMS + appel executive |
| Baisse usage 40%+ | 45-60 jours | Haute | Alert CSM + appel |
| Spike support (x3) | 30-45 jours | Haute | QA review + fix |
| Retard paiement 15+ jours | 30 jours | Moyenne | Rappel automatique |
| NPS < 6 | 30-90 jours | Moyenne | Intervention 24h |
| Plaintes repetees | 15-30 jours | Moyenne | Escalade + fix |
| Health Score chute > 20 pts/30j | 60-90 jours | Haute | Alert + intervention 48h |

---

### 3d. SOUS-AGENT 10d -- COLLECTEUR AVIS

#### 3d.1 Mission

Le Collecteur Avis automatise la demande d'avis clients sur 5 plateformes strategiques, au timing optimal post-livraison, et gere les avis negatifs.

#### 3d.2 Timing optimal

- **Demande d'avis :** J+5 a J+10 post-livraison (client a teste, memoire fraiche)
- **Jour ideal d'envoi :** Mardi ou Mercredi, 9h-11h heure client
- **Sequence :** 3 emails (J+5, J+10, J+15) + SMS optionnel (J+12)

#### 3d.3 Plateformes cibles et taux de reponse

| Plateforme | Priorite | Raison | Taux reponse attendu |
|---|---|---|---|
| Google My Business | 1 | SEO local, confiance immediate | 5-10% |
| Trustpilot | 2 | Autorite mondiale, B2B credible | 3-5% (50% avec rappels) |
| Clutch.co | 3 | Specialiste agences web/B2B | 8-15% |
| Sortlist | 4 | Niche agences parfait | 5-10% |
| LinkedIn | 5 | Autorite + networking | 2-5% |

**Taux moyen global avec sequence automatisee :** 15-25%
**Objectif Axiom :** 30%+ (grace au timing NPS promoteur)

#### 3d.4 Gestion avis negatifs

| Etape | Delai | Action |
|---|---|---|
| Detection | Immediate | Monitoring automatique plateformes |
| Reponse publique | < 24h | Template professionnel + action concrete |
| Escalade interne | < 24h | Notification CSM + manager |
| Resolution | < 7 jours | Appeler le client, proposer solution |
| Suivi | J+14 | Demander mise a jour de l'avis si resolution |

**Impact avis negatifs non traites :** -59% prospects qualifies (3 avis negatifs non traites)

#### 3d.5 Code TypeScript

```typescript
// ============================================================
// COLLECTEUR AVIS
// ============================================================

interface ReviewRequest {
  client_id: string
  deal_id: string
  nps_score: number
  platform_targets: ReviewPlatform[]
  sequence_status: 'pending' | 'email_1_sent' | 'email_2_sent' | 'email_3_sent' | 'completed'
  review_received: boolean
  review_url?: string
  review_score?: number
}

type ReviewPlatform = 'google' | 'trustpilot' | 'clutch' | 'sortlist' | 'linkedin'

const REVIEW_LINKS: Record<ReviewPlatform, string> = {
  google: 'https://g.page/axiom-marketing/review',
  trustpilot: 'https://trustpilot.com/review/axiom-marketing.fr',
  clutch: 'https://clutch.co/profile/axiom-marketing',
  sortlist: 'https://sortlist.com/agency/axiom-marketing',
  linkedin: 'https://linkedin.com/company/axiom-marketing',
}

async function initiateReviewCollection(
  clientId: string,
  dealId: string,
  npsScore: number
): Promise<void> {
  // Ne demander que si NPS >= 7 (passif ou promoteur)
  if (npsScore < 7) {
    console.log(`[Avis] NPS ${npsScore} trop bas pour demande d'avis - client ${clientId}`)
    return
  }

  const client = await db.getClient(clientId)
  const deal = await db.getDeal(dealId)

  // Determiner les plateformes prioritaires
  const platforms: ReviewPlatform[] = npsScore >= 9
    ? ['google', 'trustpilot', 'clutch', 'sortlist', 'linkedin']  // Promoteur : toutes
    : ['google', 'trustpilot']                                      // Passif : les 2 principales

  // Sauvegarder la demande
  const reviewRequest: ReviewRequest = {
    client_id: clientId,
    deal_id: dealId,
    nps_score: npsScore,
    platform_targets: platforms,
    sequence_status: 'pending',
    review_received: false,
  }
  await db.saveReviewRequest(reviewRequest)

  // Programmer la sequence email
  // Email 1 : J+5 post-livraison
  await reviewEmailQueue.add(`review-email-1-${clientId}`, {
    client_id: clientId,
    email_number: 1,
    template: 'review_request_soft',
    platforms,
  }, { delay: 5 * 24 * 60 * 60 * 1000 })

  // Email 2 : J+10
  await reviewEmailQueue.add(`review-email-2-${clientId}`, {
    client_id: clientId,
    email_number: 2,
    template: 'review_request_direct',
    platforms,
  }, { delay: 10 * 24 * 60 * 60 * 1000 })

  // Email 3 : J+15 (dernier rappel)
  await reviewEmailQueue.add(`review-email-3-${clientId}`, {
    client_id: clientId,
    email_number: 3,
    template: 'review_request_final',
    platforms,
  }, { delay: 15 * 24 * 60 * 60 * 1000 })
}

async function handleNegativeReview(
  platform: ReviewPlatform,
  clientId: string,
  reviewText: string,
  reviewScore: number
): Promise<void> {
  // 1. Alert immediate
  await slack.send('#csm-urgent', {
    text: `AVIS NEGATIF sur ${platform} (score: ${reviewScore}/5)\n` +
      `Client: ${clientId}\nTexte: "${reviewText.substring(0, 200)}"`,
  })

  // 2. Creer tache intervention
  await crmService.createTask({
    type: 'call',
    priority: 'urgent',
    assignee: 'csm_manager',
    description: `Avis negatif ${platform} - Appeler client ${clientId} dans les 24h`,
    due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })

  // 3. Preparer reponse publique (draft)
  const client = await db.getClient(clientId)
  const responseDraft = generateNegativeReviewResponse(client, reviewText, platform)
  await db.saveReviewResponseDraft(clientId, platform, responseDraft)

  // 4. Notifier Jonathan pour validation avant publication
  await slack.dm('jonathan', {
    text: `Avis negatif sur ${platform} de ${client.nom}.\n` +
      `Draft de reponse pret a valider dans le CRM.`,
  })
}

function generateNegativeReviewResponse(
  client: any,
  reviewText: string,
  platform: string
): string {
  return `Merci pour votre retour honnete, ${client.prenom}. ` +
    `Nous avons pris votre feedback au serieux et nous souhaitons ` +
    `resoudre cette situation. Contactez-moi directement a ` +
    `jonathan@axiom-marketing.fr pour en discuter. ` +
    `Nous tenons a ce que chaque client soit satisfait. ` +
    `-- Jonathan, Fondateur Axiom Marketing`
}
```

---

### 3e. SOUS-AGENT 10e -- GESTIONNAIRE REFERRAL

#### 3e.1 Mission

Le Gestionnaire Referral opere le programme ambassadeur d'Axiom : identification des promoteurs, invitation au programme, tracking des referrals, gestion des commissions, et integration avec l'Agent 1 (VEILLEUR) pour les leads referral.

#### 3e.2 Programme ambassadeur -- Structure commission

**Modele hybride recommande :**

| Tier (ACV referral) | Commission initiale | Bonus retention | Total possible |
|---|---|---|---|
| ACV < 15 000 EUR | 20% du contrat initial | +5% mensuel x 12 mois si client retenu | Jusqu'a ~30% ACV |
| ACV 15 000 - 40 000 EUR | 15% du contrat initial | +5% mensuel x 12 mois si client retenu | Jusqu'a ~25% ACV |
| ACV > 40 000 EUR | 10% du contrat initial | +5% mensuel x 12 mois si client retenu | Jusqu'a ~20% ACV |

**Exemple concret :**
```
Referrer recommande un client pour un e-commerce a 12 000 EUR :
- Commission initiale : 20% x 12 000 EUR = 2 400 EUR
- Si client retenu 12 mois et prend du tracking (89 EUR/mois) :
  Bonus : 5% x 89 EUR x 12 = 53,40 EUR
- Total referrer : 2 453,40 EUR

ROI pour Axiom :
- CAC normal nouveau client : ~4 500 EUR (30% du contrat)
- CAC via referral : 2 453 EUR
- Economie : 2 047 EUR + conversion 10x plus rapide
```

#### 3e.3 Taux conversion referral vs cold

| Source | Taux conversion | Cout relatif | Cycle de vente |
|---|---|---|---|
| **Referral** | 30-40% | Tres bas | 15 jours |
| Cold email | 1-3% | Bas | 30+ jours |
| Cold call | 1-15% | Bas | 10-30 jours |
| Inbound (Google) | 15-25% | Moyen | 10 jours |
| Paid Ads | 2-5% | Eleve | 5 jours |

**Insight :** Referral = 10x meilleur taux de conversion que cold, a un cout 2x moindre.

#### 3e.4 Code TypeScript

```typescript
// ============================================================
// GESTIONNAIRE REFERRAL
// ============================================================

interface ReferralProgram {
  ambassador_id: string
  client_id: string
  deal_id: string
  status: 'invited' | 'active' | 'referred' | 'converted' | 'paid'
  referral_code: string
  commission_tier: 'tier_1' | 'tier_2' | 'tier_3'
  referrals: ReferralLead[]
  total_commission_earned: number
  joined_at: string
}

interface ReferralLead {
  referral_id: string
  referred_by: string              // ambassador client_id
  referral_code: string
  lead: {
    prenom: string
    nom: string
    email: string
    entreprise: string
    besoin: string
  }
  status: 'submitted' | 'contacted' | 'qualified' | 'won' | 'lost'
  submitted_at: string
  converted_at?: string
  deal_value?: number
  commission_amount?: number
  commission_paid?: boolean
}

// ============================================================
// IDENTIFICATION AMBASSADEURS
// ============================================================

async function identifyAmbassadorCandidates(): Promise<string[]> {
  // Criteres : NPS >= 9, Health Score >= 80, client depuis 60+ jours
  const clients = await db.getClientsWhere({
    last_nps_score: { $gte: 9 },
    health_score: { $gte: 80 },
    client_since_days: { $gte: 60 },
    referral_program_status: { $ne: 'active' },
  })

  return clients.map((c: any) => c.client_id)
}

// ============================================================
// INVITATION AU PROGRAMME
// ============================================================

async function inviteToReferralProgram(clientId: string): Promise<void> {
  const client = await db.getClient(clientId)
  const deal = await db.getLatestDeal(clientId)

  // Generer code referral unique
  const referralCode = `AXIOM-${client.nom.toUpperCase().slice(0, 4)}-${
    Math.random().toString(36).substring(2, 6).toUpperCase()
  }`

  // Determiner le tier de commission
  const commissionTier = deal.contrat.montant_ht >= 40000
    ? 'tier_3'
    : deal.contrat.montant_ht >= 15000
    ? 'tier_2'
    : 'tier_1'

  // Sauvegarder le programme
  const program: ReferralProgram = {
    ambassador_id: `amb_${clientId}`,
    client_id: clientId,
    deal_id: deal.deal_id,
    status: 'invited',
    referral_code: referralCode,
    commission_tier: commissionTier,
    referrals: [],
    total_commission_earned: 0,
    joined_at: new Date().toISOString(),
  }
  await db.saveReferralProgram(program)

  // Envoyer email invitation
  await emailService.send({
    to: client.email,
    subject: `${client.prenom}, rejoignez le programme VIP Axiom`,
    template: 'referral_invitation',
    data: {
      prenom: client.prenom,
      referral_code: referralCode,
      referral_link: `https://axiom-marketing.fr/referral/${referralCode}`,
      commission_pct: commissionTier === 'tier_1' ? '20%' : commissionTier === 'tier_2' ? '15%' : '10%',
    },
  })

  // Programmer sequence de relance
  await referralSequenceQueue.add(`referral-seq-${clientId}`, {
    client_id: clientId,
    referral_code: referralCode,
  }, { delay: 7 * 24 * 60 * 60 * 1000 }) // Rappel J+7
}

// ============================================================
// TRAITEMENT REFERRAL RECU
// ============================================================

async function processIncomingReferral(
  referralCode: string,
  leadData: ReferralLead['lead']
): Promise<void> {
  // 1. Trouver l'ambassadeur
  const program = await db.getReferralProgramByCode(referralCode)
  if (!program) {
    throw new Error(`Code referral invalide: ${referralCode}`)
  }

  // 2. Creer le lead referral
  const referralId = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  const referral: ReferralLead = {
    referral_id: referralId,
    referred_by: program.client_id,
    referral_code: referralCode,
    lead: leadData,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  }

  // 3. Sauvegarder le referral
  await db.addReferralToProgram(program.ambassador_id, referral)

  // 4. INTEGRATION AGENT 1 (VEILLEUR) -- Envoyer le lead referral
  const referralToVeilleur: ReferralToAgent1 = {
    type: 'referral_lead',
    referral_id: referralId,
    referred_by: {
      client_id: program.client_id,
      referral_code: referralCode,
    },
    lead: {
      prenom: leadData.prenom,
      nom: leadData.nom,
      email: leadData.email,
      entreprise: leadData.entreprise,
      besoin: leadData.besoin,
      source: 'referral',
    },
    priority_boost: 40,              // +40% lead score pour les referrals
    metadata: {
      agent: 'agent_10_csm',
      created_at: new Date().toISOString(),
      version: '1.0',
    },
  }

  // Envoyer a la queue du Veilleur
  await veilleurQueue.add(`referral-lead-${referralId}`, referralToVeilleur, {
    priority: 1, // Priorite maximale
  })

  // 5. Notifier l'ambassadeur
  const ambassador = await db.getClient(program.client_id)
  await emailService.send({
    to: ambassador.email,
    subject: `Merci ! Votre referral a ete recu`,
    template: 'referral_received_confirmation',
    data: {
      prenom: ambassador.prenom,
      lead_name: `${leadData.prenom} ${leadData.nom}`,
      lead_company: leadData.entreprise,
    },
  })

  // 6. Slack notification
  await slack.send('#csm-referrals', {
    text: `Nouveau referral recu !\n` +
      `Ambassadeur: ${ambassador.prenom} ${ambassador.nom}\n` +
      `Lead: ${leadData.prenom} ${leadData.nom} (${leadData.entreprise})\n` +
      `Besoin: ${leadData.besoin}`,
  })
}

// ============================================================
// GESTION COMMISSION POST-CONVERSION
// ============================================================

async function processReferralConversion(
  referralId: string,
  dealValue: number
): Promise<void> {
  const referral = await db.getReferral(referralId)
  const program = await db.getReferralProgramByCode(referral.referral_code)

  // Calculer la commission
  const commissionRates: Record<string, number> = {
    tier_1: 0.20,
    tier_2: 0.15,
    tier_3: 0.10,
  }
  const rate = commissionRates[program.commission_tier]
  const commissionAmount = dealValue * rate

  // Mettre a jour le referral
  await db.updateReferral(referralId, {
    status: 'won',
    converted_at: new Date().toISOString(),
    deal_value: dealValue,
    commission_amount: commissionAmount,
    commission_paid: false,
  })

  // Mettre a jour le programme
  await db.updateReferralProgram(program.ambassador_id, {
    total_commission_earned: program.total_commission_earned + commissionAmount,
  })

  // Notifier l'ambassadeur
  const ambassador = await db.getClient(program.client_id)
  await emailService.send({
    to: ambassador.email,
    subject: `Bravo ! Votre referral s'est converti - ${commissionAmount.toFixed(0)} EUR de commission`,
    template: 'referral_conversion_notification',
    data: {
      prenom: ambassador.prenom,
      lead_name: `${referral.lead.prenom} ${referral.lead.nom}`,
      deal_value: dealValue,
      commission_amount: commissionAmount,
      commission_rate: `${rate * 100}%`,
      total_earned: program.total_commission_earned + commissionAmount,
    },
  })

  // Slack celebration
  await slack.send('#csm-wins', {
    text: `Referral converti ! ${ambassador.prenom} ${ambassador.nom} gagne ` +
      `${commissionAmount.toFixed(0)} EUR de commission. Deal: ${dealValue} EUR.`,
  })
}
```

---

## 4. HEALTH SCORE -- DETAIL COMPLET

### 4.1 Formule detaillee

```
HEALTH SCORE (0-100) =
  ENGAGEMENT (40%) x [
    Login frequency (30%)
    + Email open rate (25%)
    + Contact frequency (20%)
    + Training participation (15%)
    + CTA response rate (10%)
  ]
  + SATISFACTION (30%) x [
    Last NPS normalized (50%)
    + CSAT average (30%)
    + Critical tickets penalty (10%)
    + Communication sentiment (10%)
  ]
  + CROISSANCE (30%) x [
    MRR change normalized (40%)
    + Feature adoption % (30%)
    + Traffic growth normalized (20%)
    + Upsell score (10%)
  ]
```

### 4.2 Seuils et actions detailles

| Score | Couleur | Actions automatiques | Actions manuelles | SLA |
|---|---|---|---|---|
| 80-100 (Vert) | Vert | Tag "promoteur", trigger referral, trigger avis | Planifier upsell conversation | 30 jours |
| 60-79 (Jaune) | Jaune | Email check-in, content nurture | Appel proactif bi-mensuel | 14 jours |
| 50-59 (Orange) | Orange | Alert CSM, email "checking in" | Appel CSM 48h, webinaire offert | 48h |
| 30-49 (Orange fonce) | Orange | Alert manager, remediation plan auto | Account review meeting, credits service | 24h |
| < 30 (Rouge) | Rouge | Alert executive, escalade Jonathan | Intervention fondateur, decision fight/accept | Immediat |

### 4.3 Detection churn -- Precision du modele

**Combinaison 8-12 metriques = 75-85% de precision en prediction churn 60-90 jours avant.**

| Facteur | Poids dans prediction | Signal |
|---|---|---|
| Health Score chute > 20 pts/30j | 25% | Deterioration rapide |
| Usage drops > 40% | 20% | Desengagement |
| NPS < 6 | 15% | Insatisfaction declaree |
| Support tickets x3 | 15% | Problemes non resolus |
| Silence radio > 60j | 10% | Abandon |
| Retard paiement | 10% | Difficulte financiere |
| Sentiment negatif | 5% | Frustration detectee |

### 4.4 Calcul quotidien automatise

```typescript
// CRON : Tous les jours a 8h00
// Calcule le Health Score de chaque client actif

async function dailyHealthScoreCalculation(): Promise<void> {
  const activeClients = await db.getActiveClients()

  for (const client of activeClients) {
    const components = await gatherHealthComponents(client.client_id)
    const result = calculateHealthScore(
      client.client_id,
      client.current_deal_id,
      components
    )

    // Sauvegarder le score
    await db.saveHealthScore(client.client_id, result)

    // Verifier si le score a chute
    const previousScore = await db.getPreviousHealthScore(client.client_id)
    if (previousScore && previousScore.total_score - result.total_score > 20) {
      // Chute de 20+ points = alerte
      await triggerHealthScoreDropAlert(client, previousScore.total_score, result.total_score)
    }

    // Actions selon le niveau
    if (result.color === 'orange' || result.color === 'rouge') {
      // Envoyer au sous-agent churn prevention
      await churnPreventionQueue.add(`churn-check-${client.client_id}`, {
        client_id: client.client_id,
        health_score: result,
      })
    }

    if (result.color === 'vert' && result.total_score >= 80) {
      // Candidat referral/avis
      await referralCandidateQueue.add(`referral-check-${client.client_id}`, {
        client_id: client.client_id,
        health_score: result.total_score,
      })
    }
  }

  // Envoyer metriques a l'Agent 7 (ANALYSTE)
  await sendHealthMetricsToAnalyste(activeClients)
}
```

---

## 5. MATRICE CROSS-SELL AXIOM -- TABLEAU COMPLET

### 5.1 Matrice detaillee avec templates

| # | Depuis | Vers | Prob. | Montant | Timing | Template | Pitch cle |
|---|---|---|---|---|---|---|---|
| 1 | Site vitrine | E-commerce Shopify | 45% | +8 000 EUR | M3-4 | `upsell_ecommerce` | "Votre trafic merite d'etre monetise" |
| 2 | Site vitrine | Tracking server-side | 65% | +990 + 89/mois | M1-2 | `upsell_tracking` | "Comprenez pourquoi vos visiteurs convertissent" |
| 3 | Site vitrine | App Flutter | 15% | +30 000 EUR | M6+ | `upsell_app` | "Vos clients sont sur mobile" |
| 4 | E-commerce | Tracking server-side | 80% | +990 + 89/mois | M1-2 | `upsell_tracking` | "Mesurez chaque conversion avec precision" |
| 5 | E-commerce | App Flutter | 30% | +20 000 EUR | M4-6 | `upsell_app` | "40% des achats sont sur mobile" |
| 6 | App Flutter | Tracking server-side | 70% | +990 + 89/mois | M2 | `upsell_tracking` | "Mesurez l'engagement utilisateur" |
| 7 | App Flutter | App metier | 25% | +15 000 EUR | M6+ | `upsell_app_metier` | "Vos processus internes meritent une app" |
| 8 | App metier | Tracking server-side | 70% | +990 + 89/mois | M2 | `upsell_tracking` | "Suivez l'adoption par vos equipes" |
| 9 | App metier | App Flutter (mobile) | 20% | +20 000 EUR | M6+ | `upsell_app_complement` | "Version mobile pour vos equipes terrain" |
| 10 | RGAA | Site vitrine (refonte) | 35% | +8 000 EUR | M2-3 | `upsell_refonte` | "Profitez de l'audit pour moderniser" |
| 11 | RGAA | E-commerce | 20% | +10 000 EUR | M4-6 | `upsell_ecommerce` | "Site accessible = meilleur taux conversion" |
| 12 | Tracking | Site vitrine | 25% | +7 500 EUR | M3-4 | `upsell_site` | "Les data montrent qu'il faut refondre" |
| 13 | Tracking | E-commerce | 30% | +10 000 EUR | M3-4 | `upsell_ecommerce` | "Vos donnees confirment le potentiel e-commerce" |

### 5.2 Impact LTV par parcours upsell

| Parcours client | LTV sans upsell | LTV avec upsell | Augmentation |
|---|---|---|---|
| Vitrine seul (3 ans) | 22 500 EUR | -- | -- |
| Vitrine + E-commerce (an 2) | -- | 32 500 EUR | +44% |
| Vitrine + E-com + Tracking | -- | 44 636 EUR | +98% |
| E-commerce seul (3 ans) | 25 000 EUR | -- | -- |
| E-commerce + Tracking | -- | 27 068 EUR | +8% |
| App Flutter seul | 45 000 EUR | -- | -- |
| App Flutter + Tracking | -- | 47 058 EUR | +4% |

### 5.3 Retention par nombre de services

| Nombre services | Retention 1 an | Retention 3 ans |
|---|---|---|
| 1 service (initial) | 75% | 45% |
| 2 services (1 upsell) | 88% | 70% |
| 3+ services (multi) | 95% | 88% |

**Chaque service supplementaire augmente la retention de 10-15 points.**

---

## 6. SEQUENCES EMAIL -- TEMPLATES COMPLETS

### 6.1 Onboarding -- 5 templates

#### Template 1 : JOUR 1 -- Email de bienvenue

**Timing :** Immediatement apres signature (meme jour)
**Taux ouverture attendu :** 40-60%
**Taux clic :** 15-25%

```
Objet : Bienvenue chez Axiom, {{prenom}} ! Votre projet {{type_projet}} demarre

Bonjour {{prenom}},

Merci d'avoir choisi Axiom pour votre projet {{type_projet_label}} !
Nous sommes ravis de demarrer cette collaboration avec {{entreprise_nom}}.

VOICI CE QUI SE PASSE MAINTENANT :

1. Kick-off Meeting --> {{date_kickoff_proposee}}
   Rencontrez notre equipe. Definissons ensemble les criteres de succes.

2. Collecte d'assets --> A soumettre avant le {{date_assets_due}}
   Envoyez votre contenu, images et branding via ce formulaire :
   {{lien_formulaire_assets}}

3. Premier livrable --> {{date_premier_livrable}}
   Nous vous presenterons les premiers designs/architecture.

VOTRE EQUIPE AXIOM :
- {{pm_nom}} -- Chef de projet (vos check-ins hebdomadaires)
- {{dev_nom}} -- Developpeur principal
- {{designer_nom}} -- Responsable UX/Design

LIENS UTILES :
- Tableau de bord projet : {{lien_asana}}
- Formulaire de soumission : {{lien_formulaire_assets}}
- Dossier partage : {{lien_google_drive}}
- Contact urgence : {{telephone_pm}}

Des questions ? Repondez directement a cet email.

A tres vite !

{{signature_axiom}}

---
Axiom Marketing | axiom-marketing.fr
```

#### Template 2 : JOUR 3 -- Pre-kick-off

**Timing :** 2 jours avant le kick-off
**Taux ouverture attendu :** 35-45%
**Taux action completion :** 20-30%

```
Objet : Kick-off dans 2 jours ! 3 choses a preparer | {{nom_projet}}

Bonjour {{prenom}},

Notre kick-off meeting est prevu {{date_kickoff}} a {{heure_kickoff}}.
Voici ce qu'il faudrait avoir pret :

AVANT NOTRE REUNION :

1. Acces techniques (soumettez via ce formulaire) :
   - Hebergement actuel
   - Acces registrar domaine
   - Identifiants CMS existants
   {{lien_formulaire_acces}}

2. Contenu et branding :
   - Charte graphique / references visuelles
   - Textes et descriptions produits
   - Sites concurrents que vous appreciez
   {{lien_checklist_contenu}}

3. Equipe confirmee :
   - Qui participe cote {{entreprise_nom}} ? (min. 2 personnes)
   - Qui est le decideur pour les validations rapides ?

CE QUE NOUS COUVRIRONS :
- Timeline et jalons du projet
- Direction design et coherence de marque
- Architecture technique
- Plan de communication
- Vos criteres de succes

LIEN DE CONNEXION : {{lien_visio}}
DUREE : 90 minutes
FUSEAU HORAIRE : {{timezone_client}}

Des questions de derniere minute ? Ecrivez a {{email_pm}}.

A {{jour_kickoff}} !

{{signature_axiom}}
```

#### Template 3 : JOUR 7 -- Recap kick-off

**Timing :** 1-2 jours apres le kick-off
**Taux ouverture attendu :** 30-40%
**Taux completion assets :** 80%+ si deadline claire

```
Objet : Recap kick-off + prochaines etapes | {{nom_projet}}

Bonjour {{prenom}},

Merci pour ce kick-off productif ! Voici le recap et vos prochaines etapes :

DECISIONS PRISES :
1. Date de lancement cible : {{date_lancement}}
2. Stack technique : {{stack_technique}}
3. Direction design : {{resume_design}}
4. Nombre de rounds de revision : {{nb_revisions}} par phase

CE QUE NOUS DEMARRONS :
Phase 1 (Semaines 1-2) : {{description_phase_1}}
Livrable : {{livrable_phase_1}} le {{date_livrable_phase_1}}

VOS ACTIONS (a completer avant le {{date_due_actions}}) :
- [ ] Soumettre le contenu restant (images, textes)
- [ ] Confirmer les couleurs et typographies de marque
- [ ] Fournir les acces API (si applicable)
- [ ] Planifier le prochain point hebdomadaire : {{lien_calendly}}

CONTACTS DE VOTRE EQUIPE :
- {{pm_nom}} : Points hebdo et questions --> {{email_pm}}
- {{dev_nom}} : Questions techniques --> {{email_dev}}
- {{designer_nom}} : Feedback creatif --> {{email_designer}}

TABLEAU DE BORD : {{lien_asana}} (progression en temps reel)
PROCHAIN JALON : {{date_prochain_jalon}} -- {{description_jalon}}

Un souci ? Ne tardez pas a nous en parler.
Mieux vaut detecter les problemes tot !

Hate de vous montrer les premiers resultats,

{{signature_axiom}}
```

#### Template 4 : JOUR 14 -- Premier milestone

**Timing :** A la livraison du premier livrable majeur
**Taux ouverture attendu :** 50-65%
**Taux review + feedback :** 70%+

```
Objet : Premier apercu : votre {{type_projet}} prend forme !

Bonjour {{prenom}},

Votre {{type_projet_label}} avance bien ! Voici le premier apercu :

LIVRABLE : {{lien_figma_ou_staging}}
{{resume_design_2_lignes}}

PROCHAINES ETAPES :
1. Prenez le temps de revoir (5-7 jours, c'est normal)
2. Partagez votre feedback via :
   - Commentaires Figma (notre preference -- collaboration en temps reel)
   - Reponse a cet email
   - Ou planifiez un appel feedback : {{lien_calendly_designer}}

3. Nous iterons selon votre retour ({{nb_revisions}} rounds inclus)

OU EN SOMMES-NOUS :
[x] Kick-off realise
[>] Phase feedback design (cette semaine / la suivante)
[ ] Developpement demarre le {{date_dev}}
[ ] Premiere version fonctionnelle le {{date_draft}}
[ ] Lancement cible le {{date_lancement}}

Des questions sur le design ?
{{designer_nom}} est disponible pour vous guider.

Impatients d'avoir votre retour !

{{signature_axiom}}
```

#### Template 5 : JOUR 30 -- Check-in mensuel

**Timing :** Tous les 30 jours pendant le projet
**Taux ouverture attendu :** 35-50%

```
Objet : Point mensuel : avancement de votre projet {{nom_projet}}

Bonjour {{prenom}},

Voici votre rapport mensuel pour {{nom_projet}} :

COMPLETE CE MOIS :
- {{livrable_1}}
- {{livrable_2}}
- {{livrable_3}}

EN COURS :
- {{phase_actuelle}} -- {{pct_completion}}% complete
  Livraison prevue : {{date_livraison_phase}}

A VENIR :
- {{prochaine_phase}} -- demarre le {{date_debut_prochaine}}
- {{jalon_suivant}} -- le {{date_jalon}}

STATUT TIMELINE :
{{status_emoji}} {{status_text}} pour le {{date_lancement}}

POINTS D'ATTENTION :
{{blockers_ou_none}}

PROCHAIN CHECK-IN : {{date_prochain_checkin}}

Des preoccupations ? Planifions un appel : {{lien_calendly}}
Des questions ? Repondez a cet email.

Bonne continuation !

{{signature_axiom}}
```

---

### 6.2 Upsell -- 3 templates

#### Template Upsell 1 : E-commerce (M3-4 post-vitrine)

**Timing :** 90 jours post-lancement site vitrine
**Taux ouverture attendu :** 30-40%
**Taux booking meeting :** 15-20%

```
Objet : Votre trafic web croit -- et si on captait ces ventes ?

Bonjour {{prenom}},

Observation rapide : votre {{site_nom}} genere un trafic solide
(~{{visites_mensuelles}} visites/mois d'apres vos analytics).

Quelques-uns de vos concurrents dans {{secteur}} ont ajoute
un e-commerce a leur site et voient {{pct_revenue_ecom}}%
de leur CA venir des ventes en ligne.

Est-ce qu'un e-commerce aurait du sens pour {{entreprise_nom}} ?

CE QUE CA IMPLIQUERAIT :
- Integration Shopify a votre site existant
- Catalogue produits avec images et descriptions
- Paiement en ligne (Stripe/PayPal)
- Gestion des stocks
- ~5 000-10 000 EUR d'investissement, ~8-10 semaines

IMPACT POTENTIEL :
- Capter 15-25% de vos visiteurs comme clients
- Revenu additionnel estime : {{estimation_revenu_annuel}} EUR/an

Pas de pression -- juste pour savoir si c'est dans vos plans.

Un appel de 15 minutes pour en discuter ?
{{lien_calendly}}

{{signature_axiom}}
```

#### Template Upsell 2 : Tracking server-side (M1-2 post-lancement)

**Timing :** 30-45 jours post-lancement (any project)
**Taux ouverture attendu :** 40-50%
**Taux booking meeting :** 20-25%

```
Objet : Une question : est-ce que vous trackez {{conversion_principale}} ?

Bonjour {{prenom}},

Maintenant que {{nom_projet}} est en ligne, un point important :

Votre analytics actuel (Google Analytics) vous dit D'OU viennent
vos visiteurs. Le tracking server-side vous dit POURQUOI ils convertissent.

C'est utile si vous suivez :
- Les soumissions de formulaires (contacts, inscriptions)
- Les conversions e-commerce (si applicable)
- Les actions utilisateur specifiques (telechargements, videos, clics)
- Les donnees respectueuses de la vie privee (conformite RGPD)

CE QU'ON A CONSTATE :
Les clients qui implementent le tracking server-side voient
en general 20-30% de meilleure attribution marketing et
detectent les erreurs analytics 2x plus vite.

NOTRE OFFRE :
- 990 EUR de mise en place (one-shot)
- 89 EUR/mois de maintenance
- ~5 jours d'implementation
- Integration complete avec vos outils existants

Ca vous interesse ? Un rapide tour d'horizon ?
{{lien_calendly}}

Ou dites-moi simplement ce que vous trackez aujourd'hui --
je vous dirai si ca vaut le coup.

{{signature_axiom}}
```

#### Template Upsell 3 : Renewal + expansion (M10, pre-renewal)

**Timing :** 90 jours avant renouvellement annuel
**Taux ouverture attendu :** 50-60%
**Taux booking meeting :** 40%+

```
Objet : Votre renouvellement approche -- et une idee pour l'an 2

Bonjour {{prenom}},

Votre contrat pour {{nom_projet}} se renouvelle le {{date_renouvellement}}.
Avant de confirmer, j'aimerais faire le point sur trois choses :

1. BILAN DE L'ANNEE
   {{nom_projet}} tourne depuis {{nb_mois}} mois maintenant.
   J'aimerais savoir : qu'est-ce qui fonctionne bien ? Des defis ?

   Repondez avec votre plus grande victoire cette annee.

2. ET APRES ?
   D'apres votre usage et votre croissance, je vois {{opportunite}}.

   Concretement :
   {{donnees_specifiques}}

   Ca sugere que {{upsell_produit}} pourrait vous aider :
   - Resoudrait {{probleme_specifique}}
   - ROI estime : {{roi_estime}}

3. PARLONS-EN
   J'aimerais discuter de la strategie annee 2 :

   Option A : Etendre {{nom_projet}} + ajouter {{produit_upsell}}
   Option B : Renouveler l'actuel + optimiser
   Option C : Autre chose que vous avez en tete

   Planifions un appel de 30 min : {{lien_calendly}}

Investissement actuel : {{montant_annuel}} EUR/an
Potentiel avec expansion : {{montant_expansion}} EUR/an

Aucune pression -- juste pour m'assurer que vous etes positionne
pour un maximum de succes en annee 2.

{{signature_axiom}}
```

---

### 6.3 Avis -- 3 templates

#### Template Avis 1 : Demande douce (J+5)

```
Objet : {{prenom}}, votre nouveau site est en ligne !

Bonjour {{prenom}},

Nous avons le plaisir de vous confirmer que votre nouveau
{{type_projet_label}} est maintenant en ligne et accessible
a {{url_projet}}.

L'equipe Axiom tient a vous remercier pour cette collaboration.
Nous esperons que le resultat depasse vos attentes !

Si vous avez besoin de support, nous sommes la.
Sinon, profitez de votre nouvel outil digital !

A bientot,

{{signature_axiom}}
```

#### Template Avis 2 : Demande directe (J+10)

```
Objet : Une minute pour nous aider ?

Bonjour {{prenom}},

Vous avez eu quelques jours pour explorer votre nouveau
{{type_projet_label}}. Nous aimerions vraiment connaitre votre avis !

Si vous etes satisfait du projet, nous serions reconnaissants
si vous pouviez laisser un avis rapide sur :

--> Google : {{lien_google_review}}
--> Trustpilot : {{lien_trustpilot_review}}

Ca nous aide enormement et inspire confiance aupres
d'autres entreprises comme la votre.

Merci beaucoup !

{{signature_axiom}}
```

#### Template Avis 3 : Dernier rappel (J+15)

```
Objet : Derniere tentative -- votre avis nous aiderait enormement

Bonjour {{prenom}},

Je n'ai pas eu votre avis... pas grave si vous etes deborde !

Mais serieusement, 30 secondes sur ce lien nous aideraient
enormement a aider d'autres entreprises a nous faire confiance :

{{lien_google_review}}

Merci d'avoir travaille avec nous,

{{signature_axiom}}
```

---

### 6.4 Referral -- 3 templates

#### Template Referral 1 : Invitation programme VIP

```
Objet : {{prenom}}, rejoignez le programme VIP Axiom

Bonjour {{prenom}},

Votre retour recent (NPS: {{nps_score}}/10) nous montre que
vous appreciez travailler avec Axiom. Ca represente beaucoup pour nous !

Nous avons cree un Programme VIP Referral pour les clients
comme vous qui souhaitent aider d'autres entreprises a beneficier
d'un developpement web de qualite.

COMMENT CA FONCTIONNE :

--> Recommandez quelqu'un et gagnez {{commission_pct}}% de commission
    (ou credits service equivalents)
--> Votre contact beneficie d'un accompagnement prioritaire
--> Tout le monde y gagne

VOTRE LIEN UNIQUE : {{lien_referral}}
VOTRE CODE : {{code_referral}}

Pret a demarrer ? Cliquez ici : {{lien_referral}}

{{signature_axiom}}
```

#### Template Referral 2 : Social proof (J+7)

```
Objet : Un de vos pairs a deja gagne {{montant_exemple}} EUR...

Bonjour {{prenom}},

Mise a jour rapide : {{nb_referrers_actifs}} de vos pairs dans
le programme ont deja recommande des clients et gagne des commissions.

L'un d'eux a genere {{montant_exemple}} EUR en un trimestre,
simplement en partageant son experience Axiom.

Voici le temoignage de {{nom_referrer_exemple}} :
"{{temoignage}}"

Toujours interesse ? {{lien_referral}}

{{signature_axiom}}
```

#### Template Referral 3 : Rappel benefices (J+14)

```
Objet : Vous connaissez quelqu'un qui a besoin d'un site web ?

Bonjour {{prenom}},

Chaque recommandation n'est pas un travail. Si vous connaissez
quelqu'un qui a besoin d'un site web, d'une app ou d'un e-commerce,
passez-nous le contact. On s'occupe du reste.

EN RETOUR :
- {{commission_pct}}% de commission sur le contrat signe
- Credits service pour votre prochain projet
- Badge VIP sur notre page temoignages

Deja recommande quelqu'un cette annee ?
{{lien_referral}}

{{signature_axiom}}
```

---

## 7. PREVENTION CHURN

### 7.1 Signaux et actions automatiques

#### Signal 1 : Silence radio (60+ jours sans contact)

```
Condition : Aucun login/contact depuis 60 jours
Urgence : CRITIQUE (churn imminent)

Sequence automatique :
  J+60 : Email "On pense a vous" avec case study de succes similaire
  J+75 : SMS ou appel du CSM
  J+90 : Email du fondateur (Jonathan) "Let's reconnect"
  J+120 : Decision finale : offre speciale ou accepter le churn

Objectif : 30-40% de win-back dans les 60 jours
```

#### Signal 2 : Usage drops > 40%

```
Condition : Usage ce mois < 60% de la moyenne historique
Urgence : HAUTE

Sequence automatique :
  Immediat : Alert CSM + manager (Slack)
  J+1 : Appel proactif "On a remarque moins d'activite, tout va bien ?"
  J+7 : Offrir webinaire formation / session guidee
  J+14 : Check-in appel

Objectif : Retour a l'usage normal dans 30 jours
```

#### Signal 3 : Spike support (tickets x3)

```
Condition : Tickets support x3 le taux normal (ex: 5+ en 7 jours vs 1-2)
Urgence : HAUTE

Sequence automatique :
  Immediat : QA review + escalade
  J+1 : Appel executive (pas support) "On a vu des soucis"
  J+3 : Root cause analysis partagee + roadmap de fix
  J+7 : Appel verification "Probleme resolu ?"

Objectif : Resoudre spike + retour taux normal dans 14 jours
```

#### Signal 4 : Retard paiement (15+ jours)

```
Condition : Facture impayee > 15 jours
Urgence : MOYENNE

Sequence automatique :
  J+15 : Rappel email amical automatique
  J+25 : Appel telephonique (professionnel, pas agressif)
  J+35 : Discussion plan de paiement
  J+45 : Notice formelle

Objectif : Paiement recu ou plan en place dans 30 jours
```

#### Signal 5 : NPS detracteur (< 6)

```
Condition : Score NPS recu < 6
Urgence : MOYENNE-HAUTE

Sequence automatique :
  Immediat : Alert CSM + manager
  J+1 : Appel CSM "Merci pour votre honnetete, parlons-en"
  J+7 : Plan d'action partage avec le client
  J+30 : Re-survey pour verifier amelioration

Objectif : Remonter a passif (7+) dans 30 jours
```

#### Signal 6 : Health Score chute > 20 pts/30j

```
Condition : Health Score a baisse de 20+ points en 30 jours
Urgence : HAUTE

Sequence automatique :
  Immediat : Alert CSM + directeur
  J+1 : Revue contexte client (interactions, usage, tickets, sentiment)
  J+1 : Appel 30 min CSM dans les 24h
  J+7 : Si probleme identifie : fix + deadline
  J+7 : Si malentendu : re-baseline health score

Objectif : 50% des clients "jaune" retournent en "vert" dans 30 jours
```

### 7.2 Playbook par niveau de sante

```
NIVEAU VERT (80-100) -- Croissance
  Actions : Upsell, referral, avis, celebration succes
  Frequence contact : Mensuel (proactif)
  Objectif : Maximiser LTV

NIVEAU JAUNE (60-79) -- Monitoring
  Actions : Check-in proactif, contenu valeur, re-engagement
  Frequence contact : Bi-mensuel (proactif)
  Objectif : Remonter en vert

NIVEAU ORANGE (50-59) -- Intervention
  Actions : Appel CSM 48h, webinaire offert, credits service
  Frequence contact : Hebdomadaire (reactif)
  Objectif : Stabiliser et remonter

NIVEAU ORANGE FONCE (30-49) -- Remediation
  Actions : Account review meeting, plan remediation, offre speciale
  Frequence contact : 2x/semaine (reactif intensif)
  Objectif : Eviter le rouge

NIVEAU ROUGE (< 30) -- Crise
  Actions : Intervention executive, appel Jonathan, decision fight/accept
  Frequence contact : Quotidien (crise)
  Objectif : Sauver le client ou exit propre
```

### 7.3 Benchmarks retention agences web

| Modele commercial | Churn annuel | Churn 6 mois | Duree vie client |
|---|---|---|---|
| Retainer (maintenance mensuelle) | 18% | 8% | 56 mois |
| Hybride (projet + maintenance) | 28% | ~14% | 36 mois |
| Performance-based | 33% | ~15% | 30 mois |
| Projet uniquement | 42% | 28% | 24 mois |

| Taille agence | Churn annuel | CA |
|---|---|---|
| 1-10 employes | 32% | < 1M EUR |
| 11-25 employes | 24% | 1-5M EUR |
| 26-50 employes | 19% | 5-10M EUR |
| 51+ employes | 15% | 10M+ EUR |

**Cible Axiom :** Churn < 20% annuel (modele hybride projet + tracking recurrent).
**CLV:CAC cible :** Minimum 3:1, idealement 4:1+.

### 7.4 Impact financier retention

```
Client moyen Axiom : ~10 000 EUR/an
CAC moyen : ~3 000 EUR (30% du contrat)
CLV (3 ans) : 30 000 EUR

Si churn passe de 30% a 18% (retainer) :
  - 12 clients supplementaires retenus sur 100
  - Valeur sauvee : 12 x 30 000 EUR = 360 000 EUR
  - Cout intervention preventive : ~300 EUR/client x 12 = 3 600 EUR
  - ROI : 100:1

Impact retention +5% :
  - +25 a 95% de profit supplementaire
  - Source : Harvard Business Review
```

---

## 8. OUTPUT : SCHEMAS JSON

### 8.1 Output vers Agent 1 (VEILLEUR) -- Leads referral

Envoye via la queue BullMQ `veilleur-referral-leads` quand un ambassadeur soumet un referral.

```typescript
interface ReferralToAgent1 {
  type: 'referral_lead'
  referral_id: string

  referred_by: {
    client_id: string
    referral_code: string
  }

  lead: {
    prenom: string
    nom: string
    email: string
    entreprise: string
    besoin: string
    source: 'referral'
  }

  priority_boost: number               // +40 points au lead score

  metadata: {
    agent: 'agent_10_csm'
    created_at: string                  // ISO 8601
    version: string
  }
}
```

### 8.2 Output vers Agent 7 (ANALYSTE) -- Metriques CSM

Envoye via la queue BullMQ `analyste-csm-metrics` quotidiennement et sur evenement.

```typescript
// Snapshot quotidien (envoye chaque jour a 8h30)
interface CSMMetricsSnapshot {
  type: 'csm_daily_snapshot'
  date: string                          // ISO 8601

  // Health Score distribution
  health_distribution: {
    vert: number                        // Nombre clients score 80-100
    jaune: number                       // 60-79
    orange: number                      // 50-59
    orange_fonce: number                // 30-49
    rouge: number                       // < 30
  }

  // Moyennes
  avg_health_score: number
  avg_nps: number
  avg_csat: number

  // Churn
  churn_risk_count: number              // Clients avec churn_risk = true
  churned_this_month: number
  churn_rate_monthly: number            // %
  churn_rate_annualized: number         // %

  // Retention
  retention_rate_monthly: number        // %
  net_revenue_retention: number         // % (NRR)
  avg_customer_lifetime_months: number

  // Upsell
  upsell_opportunities_active: number
  upsell_revenue_pipeline: number       // EUR
  upsell_conversion_rate: number        // %
  cross_sell_rate: number               // %

  // Avis
  avg_review_score: number              // /5
  total_reviews_collected: number
  review_response_rate: number          // %

  // Referral
  active_ambassadors: number
  referrals_submitted_month: number
  referrals_converted_month: number
  referral_conversion_rate: number      // %
  total_commission_paid_month: number   // EUR

  // Onboarding
  active_onboardings: number
  avg_ttv_days: number
  onboarding_completion_rate: number    // %
  at_risk_onboardings: number

  metadata: {
    agent: 'agent_10_csm'
    generated_at: string
    total_active_clients: number
    version: string
  }
}

// Event ponctuel
interface CSMEvent {
  type: 'churn_detected' | 'upsell_opportunity' | 'referral_converted'
    | 'review_collected' | 'health_score_drop' | 'onboarding_at_risk'
    | 'nps_detracteur'
  client_id: string
  deal_id: string
  date: string

  // Donnees specifiques a l'event
  details: Record<string, any>

  metadata: {
    agent: 'agent_10_csm'
    created_at: string
    version: string
  }
}
```

### 8.3 Output vers Agent 6 (NURTUREUR) -- Client churne

Envoye via la queue BullMQ `nurturer-churned-client` quand un client est confirme churne (Health Score rouge prolonge + confirmation).

```typescript
interface ChurnedClientToAgent6 {
  type: 'churned_client'
  client_id: string
  deal_id: string

  // Informations client
  client: {
    prenom: string
    nom: string
    email: string
    telephone?: string
    entreprise_nom: string
    secteur: string
    poste: string
  }

  // Historique du churn
  churn_reason: 'insatisfaction' | 'budget' | 'concurrent' | 'silence' | 'interne' | 'autre'
  churn_detail: string                  // Description detaillee
  last_health_score: number
  last_nps_score: number
  last_contact_date: string             // ISO 8601

  // Historique engagement
  total_revenue: number                 // Revenue total genere
  services_utilises: string[]           // Types de projets realises
  duree_relation_mois: number
  nb_projets_realises: number

  // Recommandation win-back
  win_back_strategy: string             // Strategie suggeree
  recontact_date: string                // ISO 8601, date suggeree
  offre_speciale_suggeree?: string      // Discount ou service gratuit

  metadata: {
    agent: 'agent_10_csm'
    created_at: string
    version: string
  }
}
```

### 8.4 Output vers Agent 8 (DEALMAKER) -- Opportunite upsell

Envoye via la queue BullMQ `dealmaker-upsell` quand une opportunite upsell est qualifiee (score >= 60 et aucun blocker).

```typescript
interface UpsellToAgent8 {
  type: 'upsell_opportunity'
  client_id: string
  existing_deal_id: string

  // Client existant
  client: {
    prenom: string
    nom: string
    email: string
    telephone?: string
    entreprise_nom: string
    siret: string
    secteur: string
    site_web: string
  }

  // Opportunite
  upsell: {
    product_target: 'site_vitrine' | 'ecommerce_shopify' | 'app_flutter'
      | 'app_metier' | 'rgaa' | 'tracking_server_side'
    estimated_value: number             // EUR
    upsell_score: number                // 0-100
    priority: 'high' | 'medium'
    signals_detected: string[]          // Ex: ['croissance_trafic', 'demande_feature']
    recommended_timing: string          // Ex: "Mois 3-4"
    template_id: string                 // ID du template email upsell
  }

  // Contexte relation
  current_services: string[]            // Services actuels du client
  health_score: number
  last_nps_score: number
  customer_since: string                // ISO 8601
  total_revenue_to_date: number

  // Notes utiles pour le closing
  notes: string                         // Contexte, objections potentielles, points d'entree

  metadata: {
    agent: 'agent_10_csm'
    created_at: string
    version: string
  }
}
```

---

## 9. COUTS

### 9.1 Outils SaaS

| Outil | Usage | Cout mensuel | Cout annuel |
|---|---|---|---|
| **Typeform** | Surveys NPS/CSAT/CES | 50 EUR/mois (Pro) | 600 EUR |
| **SurveyMonkey** | Alternative surveys | 32 EUR/mois (Pro) | 384 EUR |
| **CRM (HubSpot ou Pipedrive)** | Gestion clients, health score, workflows | 0-50 EUR/mois | 0-600 EUR |
| **Asana/Monday** | Gestion projets onboarding | 25-50 EUR/mois | 300-600 EUR |
| **Slack** | Notifications internes | Inclus (workspace existant) | 0 EUR |
| **Google Workspace** | Drive, Forms, Sheets | Inclus (workspace existant) | 0 EUR |

### 9.2 Infrastructure

| Composant | Cout mensuel | Cout annuel |
|---|---|---|
| **Redis (BullMQ queues)** | 15-30 EUR/mois | 180-360 EUR |
| **Base de donnees** | Inclus (partage avec autres agents) | 0 EUR |
| **Serveur workers** | 25-50 EUR/mois (partage) | 300-600 EUR |
| **Monitoring (Sentry, logs)** | 10-25 EUR/mois | 120-300 EUR |

### 9.3 Cout total Agent 10

| Categorie | Minimum | Maximum |
|---|---|---|
| Outils SaaS | 75 EUR/mois | 150 EUR/mois |
| Infrastructure | 50 EUR/mois | 105 EUR/mois |
| **Total mensuel** | **125 EUR/mois** | **255 EUR/mois** |
| **Total annuel** | **1 500 EUR/an** | **3 060 EUR/an** |

### 9.4 ROI estime

```
Cout annuel Agent 10 : ~2 000 EUR
Revenu sauve par retention (+5%) : ~36 000 EUR (sur 100 clients a 10K avg)
Revenu upsell (20% clients, 3 000 EUR avg) : ~60 000 EUR
Revenu referral (5 referrals/an, 10 000 EUR avg) : ~50 000 EUR

ROI total : (146 000 - 2 000) / 2 000 = 7 200%
```

---

## 10. VERIFICATION DE COHERENCE & SCHEMA GLOBAL 10 AGENTS

### 10.1 Input Agent 10 == Output Agent 8

```
VERIFICATION :

Output Agent 8 (DealToCSM) :
  - deal_id                    --> Recu et utilise par Agent 10   OK
  - prospect_id                --> Recu et utilise par Agent 10   OK
  - prospect.prenom/nom/email  --> Utilise pour emails            OK
  - prospect.telephone         --> Utilise pour appels             OK
  - prospect.linkedin_url      --> Utilise pour referral           OK
  - prospect.poste             --> Personnalisation communications OK
  - entreprise.nom/siret       --> Facturation et suivi            OK
  - entreprise.site_web        --> Monitoring post-livraison       OK
  - entreprise.secteur         --> Personnalisation templates      OK
  - entreprise.taille          --> Segmentation                    OK
  - contrat.montant_ht         --> Calcul valeur client            OK
  - contrat.tier               --> Niveau de service adapte        OK
  - contrat.type_projet        --> Routing workflow onboarding     OK
  - contrat.scope_detaille     --> Backlog projet                  OK
  - contrat.date_signature     --> Calcul TTV                      OK
  - contrat.date_demarrage     --> Planning kickoff                OK
  - contrat.duree_estimee      --> Jalons                          OK
  - contrat.conditions_paiement --> Facturation                    OK
  - contrat.contrat_pdf_url    --> Archive                         OK
  - notes_vente                --> Contexte equipe projet          OK
  - metadata.*                 --> Analyse performance pipeline    OK

RESULTAT : 100% COMPATIBLE -- Tous les champs sont recus et utilises.
```

### 10.2 Outputs Agent 10 compatibles avec destinataires

#### Output vers Agent 1 (VEILLEUR) -- Referrals

| Champ output Agent 10 (ReferralToAgent1) | Requis par Agent 1 | Statut |
|---|---|---|
| `lead.prenom/nom/email` | Pour identifier et enrichir le prospect | VALIDE |
| `lead.entreprise` | Pour recherche firmographique | VALIDE |
| `lead.besoin` | Pour qualifier le besoin | VALIDE |
| `lead.source = 'referral'` | Pour tagger la source dans le pipeline | VALIDE |
| `priority_boost` (+40) | Pour prioriser dans le scoring | VALIDE |
| `referred_by.client_id` | Pour tracer l'ambassadeur | VALIDE |

#### Output vers Agent 7 (ANALYSTE) -- Metriques

| Champ output Agent 10 (CSMMetricsSnapshot) | Requis par Agent 7 | Statut |
|---|---|---|
| `health_distribution` | Pour dashboard sante clients | VALIDE |
| `churn_rate_*` | Pour analyse retention | VALIDE |
| `net_revenue_retention` | Pour KPI financier | VALIDE |
| `upsell_*` | Pour pipeline expansion | VALIDE |
| `referral_*` | Pour tracking programme referral | VALIDE |
| `onboarding_*` | Pour suivi TTV et onboarding | VALIDE |

#### Output vers Agent 6 (NURTUREUR) -- Churn

| Champ output Agent 10 (ChurnedClientToAgent6) | Requis par Agent 6 | Statut |
|---|---|---|
| `client.*` | Pour communications win-back | VALIDE |
| `churn_reason/detail` | Pour adapter strategie nurture | VALIDE |
| `last_health_score/nps` | Pour comprendre le contexte | VALIDE |
| `win_back_strategy` | Pour guider le contenu win-back | VALIDE |
| `recontact_date` | Pour planifier la reprise | VALIDE |
| `services_utilises` | Pour personnaliser l'offre | VALIDE |

#### Output vers Agent 8 (DEALMAKER) -- Upsell

| Champ output Agent 10 (UpsellToAgent8) | Requis par Agent 8 | Statut |
|---|---|---|
| `client.*` | Pour generer devis upsell | VALIDE |
| `upsell.product_target` | Pour router vers le bon tiering | VALIDE |
| `upsell.estimated_value` | Pour le devis | VALIDE |
| `upsell.signals_detected` | Pour personnaliser l'approche | VALIDE |
| `current_services` | Pour eviter doublons | VALIDE |
| `health_score/nps` | Pour valider la readiness | VALIDE |

### 10.3 Resume de coherence Agent 10

```
COHERENCE GLOBALE AGENT 10 : 100% VALIDE

Input Agent 10 :
  - DealToCSM (Agent 8 via BullMQ)        --> OK, 100% champs compatibles

Output Agent 10 :
  - Vers Agent 1 (VEILLEUR) : Referrals   --> OK, tous champs presents
  - Vers Agent 7 (ANALYSTE) : Metriques   --> OK, tous champs presents
  - Vers Agent 6 (NURTUREUR) : Churn      --> OK, tous champs presents
  - Vers Agent 8 (DEALMAKER) : Upsell     --> OK, tous champs presents
```

---

### 10.4 SCHEMA GLOBAL 10 AGENTS -- FLUX COMPLET

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    AXIOM MARKETING -- SYSTEME 10 AGENTS                     ║
║                    Pipeline de Prospection B2B Automatise                    ║
╚═══════════════════════════════════════════════════════════════════════════════╝

  ┌─────────────────────────────────────────────────────────────────────┐
  │                    PHASE 1 : DECOUVERTE & QUALIFICATION             │
  └─────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
  │  AGENT 1          │     │  AGENT 2          │     │  AGENT 3          │
  │  VEILLEUR         │────>│  ENRICHISSEUR     │────>│  SCOREUR          │
  │                   │     │                   │     │                   │
  │  - Scraping web   │     │  - Firmographics  │     │  - ICP scoring    │
  │  - Apollo/Hunter  │     │  - Technographics │     │  - Lead scoring   │
  │  - LinkedIn       │     │  - Intent data    │     │  - Segmentation   │
  │  - Referrals (10) │     │  - Email valid.   │     │  - Priorisation   │
  └──────────────────┘     └──────────────────┘     └──────────────────┘
         ^                                                    │
         │                                                    v
         │                                          ┌──────────────────┐
         │                                          │  AGENT 4          │
         │                                          │  REDACTEUR        │
         │                                          │                   │
         │                                          │  - Emails perso   │
         │                                          │  - LinkedIn msgs  │
         │                                          │  - Follow-ups     │
         │                                          │  - A/B testing    │
         │                                          └──────────────────┘
         │                                                    │
         │                                                    v
  ┌──────┴───────────────────────────────────────────────────────────────┐
  │                    PHASE 2 : ENGAGEMENT & SUIVI                      │
  └──────────────────────────────────────────────────────────────────────┘
         │
         │                                          ┌──────────────────┐
         │                                          │  AGENT 5          │
         │                                          │  SUIVEUR          │
         │                                          │                   │
         │                                          │  - Reply classif. │
         │                                          │  - Multi-touch    │
         │                                          │  - Calendly book  │
         │                                          │  - Intent detect  │
         │                                          └──────────────────┘
         │                                                    │
         │                              ┌─────────────────────┼──────────┐
         │                              │                     │          │
         │                              v                     v          v
         │                    ┌──────────────┐    ┌────────────────┐ ┌───────┐
         │                    │  INTERESSE    │    │  PAS INTERESSE │ │ AUTRE │
         │                    │  (RDV)        │    │  (Nurture)     │ │       │
         │                    └──────┬───────┘    └───────┬────────┘ └───────┘
         │                           │                    │
         │                           v                    v
  ┌──────┴───────────────────────────────────────────────────────────────┐
  │                    PHASE 3 : NURTURING & CLOSING                     │
  └──────────────────────────────────────────────────────────────────────┘
         │
         │                    ┌──────────────────┐
         │                    │  JONATHAN         │
         │                    │  (RDV Decouverte) │
         │                    │                   │
         │                    │  - Appel humain   │
         │                    │  - Qualification  │
         │                    │  - Notes saisies  │
         │                    └──────────────────┘
         │                              │
         │                              v
         │                    ┌──────────────────┐     ┌──────────────────┐
         │                    │  AGENT 8          │     │  AGENT 9          │
         │                    │  DEALMAKER         │     │  APPELS D'OFFRES  │
         │                    │                   │     │                   │
         │                    │  - Devis auto     │     │  - BOAMP/JOUE     │
         │                    │  - Relance intel. │     │  - Analyse DCE    │
         │                    │  - Yousign e-sign │     │  - Generation RC  │
         │                    │  - Objections     │     │  - Scoring AO     │
         │                    └──────────────────┘     └──────────────────┘
         │                        │         │
         │              ┌─────────┼─────────┼───────┐
         │              │         │         │       │
         │              v         v         v       v
         │         ┌────────┐ ┌──────┐ ┌────────┐
         │         │ SIGNE  │ │PERDU │ │METRICS │
         │         └───┬────┘ └──┬───┘ └───┬────┘
         │             │         │         │
  ┌──────┴──────────── │ ────────│─────────│────────────────────────────┐
  │                    │ PHASE 4 │: POST-  │VENTE & RETENTION           │
  └────────────────────│─────────│─────────│────────────────────────────┘
                       │         │         │
                       v         │         v
              ┌──────────────────┐│    ┌──────────────────┐
              │  AGENT 10         ││    │  AGENT 7          │
              │  CSM              ││    │  ANALYSTE         │
              │                   ││    │                   │
              │  10a Onboardeur   ││    │  - Pipeline KPIs  │
              │  10b Upsell       ││    │  - Conversion     │
              │  10c Satisfaction ││    │  - Predictions     │
              │  10d Avis         ││    │  - Rapports        │
              │  10e Referral     ││    │  - Recommandations │
              └──────────────────┘│    └──────────────────┘
                  │  │  │  │      │              ^
                  │  │  │  │      v              │
                  │  │  │  │  ┌──────────────────┐│
                  │  │  │  │  │  AGENT 6          ││
                  │  │  │  │  │  NURTUREUR        ││
                  │  │  │  │  │                   ││
                  │  │  │  │  │  - Win-back       ││
                  │  │  │  │  │  - Re-nurture     ││
                  │  │  │  │  │  - Long terme     ││
                  │  │  │  │  └──────────────────┘│
                  │  │  │  │                       │
                  │  │  │  └── Metriques CSM ──────┘
                  │  │  └───── Churn ──────> Agent 6
                  │  └──────── Upsell ─────> Agent 8 (boucle)
                  └─────────── Referrals ──> Agent 1 (boucle)


  ╔═════════════════════════════════════════════════════════════════╗
  ║  BOUCLES DE RETOUR (FEEDBACK LOOPS) :                         ║
  ║                                                                ║
  ║  1. Agent 10 (Referral) ──> Agent 1 (nouveau lead warm)       ║
  ║     Conversion 30-40% vs 1-3% cold                            ║
  ║                                                                ║
  ║  2. Agent 10 (Upsell) ──> Agent 8 (closing upsell)            ║
  ║     3-5x moins cher que new business                          ║
  ║                                                                ║
  ║  3. Agent 10 (Churn) ──> Agent 6 (win-back)                   ║
  ║     5-15% recovery rate, 30% du CAC                           ║
  ║                                                                ║
  ║  4. Agent 6 (Win-back reussi) ──> Agent 10 (re-onboarding)    ║
  ║     Client recupere = nouveau cycle CSM                       ║
  ║                                                                ║
  ║  5. Agent 10 (Metriques) ──> Agent 7 (analyse globale)        ║
  ║     Dashboard complet pipeline + retention                     ║
  ╚═════════════════════════════════════════════════════════════════╝
```

### 10.5 Flux de donnees inter-agents -- Resume

| De | Vers | Donnee | Queue BullMQ | Priorite |
|---|---|---|---|---|
| Agent 1 | Agent 2 | Prospect brut | `enrichisseur-prospects` | Normal |
| Agent 2 | Agent 3 | Prospect enrichi | `scoreur-prospects` | Normal |
| Agent 3 | Agent 4 | Prospect score | `redacteur-sequences` | Normal |
| Agent 4 | Agent 5 | Sequence envoyee | `suiveur-tracking` | Normal |
| Agent 5 | Agent 8 | Prospect INTERESSE | `dealmaker-pipeline` | Haute |
| Agent 5 | Agent 6 | Prospect PAS INTERESSE | `nurturer-prospects` | Normal |
| Agent 8 | **Agent 10** | **Deal signe (DealToCSM)** | **`csm-onboarding`** | **Haute** |
| Agent 8 | Agent 7 | Metriques deal | `analyste-metrics` | Normal |
| Agent 8 | Agent 6 | Deal perdu | `nurturer-lost-deal` | Normal |
| **Agent 10** | **Agent 1** | **Lead referral** | **`veilleur-referral-leads`** | **Haute** |
| **Agent 10** | **Agent 7** | **Metriques CSM** | **`analyste-csm-metrics`** | **Normal** |
| **Agent 10** | **Agent 6** | **Client churne** | **`nurturer-churned-client`** | **Haute** |
| **Agent 10** | **Agent 8** | **Opportunite upsell** | **`dealmaker-upsell`** | **Normal** |
| Agent 6 | Agent 10 | Win-back reussi | `csm-onboarding` | Haute |
| Agent 7 | Tous | Rapports/alertes | Slack + dashboard | Variable |
| Agent 9 | Agent 8 | AO qualifie | `dealmaker-pipeline` | Haute |

### 10.6 Coherence globale systeme 10 agents

```
╔══════════════════════════════════════════════════════════╗
║           COHERENCE GLOBALE : 100% VALIDE               ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  Agent 1  (VEILLEUR)        Input: Web/APIs/Referrals    ║
║                              Output: --> Agent 2    OK   ║
║                                                          ║
║  Agent 2  (ENRICHISSEUR)    Input: Agent 1          OK   ║
║                              Output: --> Agent 3    OK   ║
║                                                          ║
║  Agent 3  (SCOREUR)         Input: Agent 2          OK   ║
║                              Output: --> Agent 4    OK   ║
║                                                          ║
║  Agent 4  (REDACTEUR)       Input: Agent 3          OK   ║
║                              Output: --> Agent 5    OK   ║
║                                                          ║
║  Agent 5  (SUIVEUR)         Input: Agent 4          OK   ║
║                              Output: --> Agent 8    OK   ║
║                              Output: --> Agent 6    OK   ║
║                                                          ║
║  Agent 6  (NURTUREUR)       Input: Agent 5/8/10     OK   ║
║                              Output: --> Agent 10   OK   ║
║                                                          ║
║  Agent 7  (ANALYSTE)        Input: Agent 8/10       OK   ║
║                              Output: Dashboard      OK   ║
║                                                          ║
║  Agent 8  (DEALMAKER)       Input: Agent 5/10       OK   ║
║                              Output: --> Agent 10   OK   ║
║                              Output: --> Agent 7    OK   ║
║                              Output: --> Agent 6    OK   ║
║                                                          ║
║  Agent 9  (APPELS D'OFFRES) Input: BOAMP/JOUE       OK   ║
║                              Output: --> Agent 8    OK   ║
║                                                          ║
║  Agent 10 (CSM)             Input: Agent 8          OK   ║
║                              Output: --> Agent 1    OK   ║
║                              Output: --> Agent 7    OK   ║
║                              Output: --> Agent 6    OK   ║
║                              Output: --> Agent 8    OK   ║
║                                                          ║
║  BOUCLES FERMEES :                                       ║
║  Agent 10 --> Agent 1 (referrals)              OK        ║
║  Agent 10 --> Agent 8 (upsell)                 OK        ║
║  Agent 10 --> Agent 6 (churn)                  OK        ║
║  Agent 6  --> Agent 10 (win-back)              OK        ║
║                                                          ║
║  SYSTEME COMPLET : TOUTES CONNEXIONS VALIDEES            ║
╚══════════════════════════════════════════════════════════╝
```

---

## ANNEXE : METRIQUES CLES DE SUCCES AGENT 10

| KPI | Cible | Frequence mesure |
|---|---|---|
| Health Score moyen | > 75 | Quotidien |
| NPS moyen | > 50 | Trimestriel |
| CSAT moyen | > 80% | Post-interaction |
| Churn rate annuel | < 20% | Mensuel |
| NRR (Net Revenue Retention) | > 108% | Mensuel |
| TTV moyen (tous projets) | < 14 jours | Par projet |
| Taux completion onboarding | > 70% | Par projet |
| Taux conversion upsell | > 20% | Trimestriel |
| Taux conversion referral | > 30% | Mensuel |
| Nombre avis Google/Trustpilot | > 5/mois | Mensuel |
| Score moyen avis | > 4.5/5 | Mensuel |
| Ambassadeurs actifs | > 20% des clients | Trimestriel |
| ROI programme referral | > 500% | Annuel |
| Cout retention vs acquisition | < 20% du CAC | Annuel |

---

**FIN DU DOCUMENT -- AGENT 10 CSM -- DERNIER AGENT DU SYSTEME AXIOM MARKETING**

*Ce document boucle le systeme complet de 10 agents. Toutes les connexions inter-agents sont validees. Le pipeline est un circuit ferme avec 4 boucles de retour (referral, upsell, churn, win-back) qui maximisent la Customer Lifetime Value.*
