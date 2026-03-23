# SOUS-AGENT 10a — ONBOARDEUR
**Agent parent** : AGENT-10-MASTER.md

**Version :** 1.0
**Date :** 2026-03-19

---

## 1. MISSION

L'Onboardeur gere l'integralite du processus d'onboarding post-signature : emails de bienvenue, organisation du kick-off meeting, collecte des acces techniques, suivi du Time-to-Value, et detection des onboardings a risque.

**Objectif :** Amener chaque client au premier moment de valeur (Time-to-Value) dans les delais cibles.

---

## 2. TIMELINE ONBOARDING PAR TYPE DE PROJET

| Type Projet | Duree Onboarding | Time-to-Value cible | Premier livrable |
|---|---|---|---|
| Site vitrine | 3-5 jours | < 12 jours | Design concepts |
| E-commerce Shopify | 5-7 jours | < 14 jours | Catalogue produits |
| App Flutter | 7-10 jours | < 21 jours | MVP prototype |
| App metier | 7-10 jours | < 21 jours | Data import + dashboard |
| RGAA collectivites | 5-7 jours | < 14 jours | Audit initial |
| Tracking server-side | 2-3 jours | < 5 jours | Premier tracking live |

---

## 3. KICK-OFF MEETING

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

---

## 4. DETECTION ONBOARDING AT-RISK

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

---

## 5. WORKFLOW PRINCIPAL ONBOARDING

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

## 6. SEQUENCES EMAIL ONBOARDING -- 5 TEMPLATES

### Template 1 : JOUR 1 -- Email de bienvenue

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

### Template 2 : JOUR 3 -- Pre-kick-off

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

### Template 3 : JOUR 7 -- Recap kick-off

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

### Template 4 : JOUR 14 -- Premier milestone

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

### Template 5 : JOUR 30 -- Check-in mensuel

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
