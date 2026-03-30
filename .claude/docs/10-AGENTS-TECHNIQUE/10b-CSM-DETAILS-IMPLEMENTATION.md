# Agent 10 — CSM — Détails d'implémentation complets

**Complément à :** `10-AGENT-10-CSM.md`

---

## 1. PRISMA SCHEMA — Tables spécifiques Agent 10

### Tables existantes à enrichir

```prisma
// ENRICHIR le modèle Customer existant
model Customer {
  id                String   @id @default(uuid())
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  companyName       String
  siren             String?  @unique
  legalForm         String?

  primaryContactId  String?
  primaryContact    Prospect? @relation(fields: [primaryContactId], references: [id])

  // === CHAMPS À AJOUTER ===
  typeProjet        String?  // 'site_vitrine' | 'ecommerce_shopify' | 'app_flutter' | 'app_metier' | 'rgaa' | 'tracking_server_side'
  tier              String?  // 'bronze' | 'silver' | 'gold'
  scopeDetaille     Json?    // string[] du scope contractuel
  conditionsPaiement String? // '50/50' | '30/40/30' | 'mensuel'
  notesVente        String?  // Notes du commercial (depuis DealToCSM)
  dealCycleDays     Int?     // Durée du cycle de vente
  engagementScoreFinal Float? // Score engagement au closing

  contractStartDate DateTime?
  contractEndDate   DateTime?
  mrrEur            Float    @default(0)
  plan              String?
  status            String   @default("active") // active | churned | suspended | onboarding
  churnedAt         DateTime?
  churnReason       String?
  externalCrmId     String?
  notes             String?

  // Relations existantes
  healthScores      CustomerHealthScore[]
  deals             DealCrm[]

  // === NOUVELLES RELATIONS ===
  onboardingSteps   OnboardingStep[]
  upsellOpportunities UpsellOpportunity[]
  reviewRequests    ReviewRequest[]
  referralProgram   ReferralProgram?
  npsSurveys        NpsSurvey[]

  @@index([status])
  @@index([typeProjet])
  @@map("customers")
}
```

### Nouvelles tables à créer

```prisma
// ══════════════════════════════════════════════
//          10a ONBOARDEUR
// ══════════════════════════════════════════════

model OnboardingStep {
  id          String   @id @default(uuid())
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id])

  stepId      String   // "welcome_email", "kickoff_scheduled", "kickoff_done", etc.
  name        String   // Nom lisible
  dayOffset   Int      // Jour prévu (J+0, J+2, J+5...)
  owner       String   // 'client' | 'axiom' | 'both'
  status      String   @default("pending") // pending | in_progress | completed | overdue | skipped
  dueDate     DateTime
  completedAt DateTime?
  notes       String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([customerId, status])
  @@index([dueDate])
  @@map("onboarding_steps")
}

model OnboardingRisk {
  id          String   @id @default(uuid())
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id])

  riskType    String   // 'no_asset_submission' | 'no_email_opens' | 'no_feedback' | 'missed_calls' | 'no_kickoff'
  severity    String   @default("medium") // low | medium | high | critical
  detectedAt  DateTime @default(now())
  resolvedAt  DateTime?
  daysSinceTrigger Int
  actionTaken String?

  @@index([customerId])
  @@index([severity])
  @@map("onboarding_risks")
}

// ══════════════════════════════════════════════
//          10b DÉTECTEUR UPSELL
// ══════════════════════════════════════════════

model UpsellOpportunity {
  id          String   @id @default(uuid())
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id])
  dealId      String?  // Deal existant du client

  productTarget   String   // 'site_vitrine' | 'ecommerce_shopify' | 'app_flutter' | 'app_metier' | 'rgaa' | 'tracking_server_side'
  estimatedValue  Float    // EUR HT
  upsellScore     Float    // 0-100
  priority        String   // 'high' | 'medium' | 'low' | 'not_ready'
  signalsDetected Json     // string[] des signaux
  blockerReasons  Json?    // string[] des raisons de blocage
  recommendedTiming String? // "Mois 3-4"
  templateId      String?  // ID template email
  status          String   @default("detected") // detected | proposed | accepted | declined | converted | expired
  proposedAt      DateTime?
  convertedAt     DateTime?
  convertedDealId String?  // ID du nouveau deal si converti
  notes           String?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([customerId, status])
  @@index([priority])
  @@map("upsell_opportunities")
}

// ══════════════════════════════════════════════
//          10c MESUREUR SATISFACTION
// ══════════════════════════════════════════════

model NpsSurvey {
  id          String   @id @default(uuid())
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id])

  type        String   // 'nps' | 'csat' | 'ces'
  trigger     String   // 'post_delivery' | 'quarterly' | 'on_phase_complete' | 'manual'
  score       Int?     // NPS: 0-10, CSAT: 1-5, CES: 1-7
  comment     String?  // Commentaire libre du client
  sentiment   String?  // 'promoter' | 'passive' | 'detractor' (NPS)
  channel     String   @default("email") // email | in_app
  tool        String   @default("typeform") // typeform | surveymonkey
  formId      String?  // ID du formulaire externe
  responseId  String?  // ID réponse externe
  sentAt      DateTime?
  respondedAt DateTime?
  status      String   @default("pending") // pending | sent | responded | expired

  createdAt   DateTime @default(now())

  @@index([customerId])
  @@index([type, status])
  @@map("nps_surveys")
}

model ChurnSignal {
  id          String   @id @default(uuid())
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id])

  signalType  String   // 'silence' | 'usage_drop' | 'support_spike' | 'late_payment' | 'nps_detractor' | 'health_drop' | 'repeated_complaints'
  severity    String   // 'low' | 'medium' | 'high' | 'critical'
  description String
  detectedAt  DateTime @default(now())
  acknowledgedAt DateTime?
  resolvedAt  DateTime?
  actionTaken String?
  churnProbability Float? // 0-100%

  @@index([customerId])
  @@index([severity, resolvedAt])
  @@map("churn_signals")
}

// ══════════════════════════════════════════════
//          10d COLLECTEUR AVIS
// ══════════════════════════════════════════════

model ReviewRequest {
  id          String   @id @default(uuid())
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id])
  dealId      String?

  npsScore    Int?     // Score NPS du client (>= 7 pour demander)
  platformTargets Json  // ReviewPlatform[] : ['google', 'trustpilot', 'clutch', 'sortlist', 'linkedin']
  sequenceStatus String @default("pending") // pending | email_1_sent | email_2_sent | email_3_sent | completed
  email1SentAt   DateTime?
  email2SentAt   DateTime?
  email3SentAt   DateTime?
  reviewReceived Boolean @default(false)
  reviewUrl      String?
  reviewScore    Float?  // Note reçue (1-5 étoiles)
  reviewPlatform String? // Plateforme où l'avis a été déposé
  reviewText     String? // Texte de l'avis

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([customerId])
  @@index([sequenceStatus])
  @@map("review_requests")
}

model NegativeReview {
  id          String   @id @default(uuid())
  customerId  String?
  platform    String   // google | trustpilot | clutch | sortlist | linkedin
  reviewUrl   String
  reviewScore Float    // Note (1-5)
  reviewText  String
  detectedAt  DateTime @default(now())
  respondedAt DateTime?
  responseText String?
  resolvedAt  DateTime?
  escalatedTo String?  // 'csm' | 'manager' | 'jonathan'
  status      String   @default("detected") // detected | responded | escalated | resolved

  @@index([platform])
  @@index([status])
  @@map("negative_reviews")
}

// ══════════════════════════════════════════════
//          10e GESTIONNAIRE REFERRAL
// ══════════════════════════════════════════════

model ReferralProgram {
  id          String   @id @default(uuid())
  customerId  String   @unique
  customer    Customer @relation(fields: [customerId], references: [id])
  dealId      String?

  status          String @default("invited") // invited | active | suspended | churned
  referralCode    String @unique             // "AXIOM-DUP-A3F2"
  commissionTier  String                     // 'tier_1' | 'tier_2' | 'tier_3'
  totalCommissionEarned Float @default(0)
  totalReferralsSubmitted Int @default(0)
  totalReferralsConverted Int @default(0)
  joinedAt        DateTime?
  lastReferralAt  DateTime?

  referralLeads   ReferralLead[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([status])
  @@index([referralCode])
  @@map("referral_programs")
}

model ReferralLead {
  id              String   @id @default(uuid())
  referralProgramId String
  referralProgram ReferralProgram @relation(fields: [referralProgramId], references: [id])
  referralCode    String

  // Lead info
  prenom          String
  nom             String
  email           String
  entreprise      String
  besoin          String
  telephone       String?

  // Tracking
  status          String @default("submitted") // submitted | contacted | qualified | won | lost
  submittedAt     DateTime @default(now())
  contactedAt     DateTime?
  qualifiedAt     DateTime?
  convertedAt     DateTime?
  lostReason      String?

  // Commission
  dealValue       Float?
  commissionRate  Float?   // % appliqué
  commissionAmount Float?
  commissionPaid  Boolean @default(false)
  commissionPaidAt DateTime?

  // Lien avec pipeline
  prospectId      String?  // UUID du prospect créé dans pipeline
  dealId          String?  // UUID du deal si converti

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([referralProgramId])
  @@index([status])
  @@index([referralCode])
  @@map("referral_leads")
}
```

---

## 2. SUB-AGENT 10a — ONBOARDEUR

### Mission
Gère l'intégralité du processus d'onboarding post-signature : emails de bienvenue, organisation du kick-off, collecte des accès techniques, suivi du Time-to-Value, et détection des onboardings à risque.

### Architecture technique

```typescript
// onboarding.service.ts
@Injectable()
export class OnboardingService {
  constructor(
    private readonly customerRepository: ICustomerRepository,
    private readonly prisma: PrismaService,
    private readonly emailService: IEmailAdapter,
    private readonly eventEmitter: EventEmitter2,
    private readonly agentEventLogger: AgentEventLoggerService,
  ) {}

  // Déclenché par CsmProcessor quand deal gagné
  async startOnboarding(customer: Customer): Promise<void>;

  // Génère le plan d'onboarding selon le type de projet
  async generateOnboardingPlan(customerId: string): Promise<OnboardingPlan>;

  // Envoie l'email prévu pour le step courant
  async executeStep(customerId: string, stepId: string): Promise<void>;

  // Vérifie les onboardings à risque (cron quotidien)
  async checkAtRiskOnboardings(): Promise<OnboardingRisk[]>;

  // Calcule le TTV actuel vs cible
  async calculateTTV(customerId: string): Promise<TTVStatus>;
}
```

### Timeline onboarding par type de projet

| Type Projet | Durée Onboarding | Time-to-Value cible | Premier livrable |
|---|---|---|---|
| Site vitrine | 3-5 jours | < 12 jours | Design concepts |
| E-commerce Shopify | 5-7 jours | < 14 jours | Catalogue produits |
| App Flutter | 7-10 jours | < 21 jours | MVP prototype |
| App métier | 7-10 jours | < 21 jours | Data import + dashboard |
| RGAA collectivités | 5-7 jours | < 14 jours | Audit initial |
| Tracking server-side | 2-3 jours | < 5 jours | Premier tracking live |

### Steps d'onboarding (base commune + projet-spécifique)

```typescript
const BASE_ONBOARDING_STEPS: PlannedStep[] = [
  { stepId: 'welcome_email',      name: 'Email de bienvenue',       dayOffset: 0,  owner: 'axiom' },
  { stepId: 'shared_folder',      name: 'Dossier partagé créé',     dayOffset: 0,  owner: 'axiom' },
  { stepId: 'pm_assigned',        name: 'PM assigné',               dayOffset: 0,  owner: 'axiom' },
  { stepId: 'kickoff_scheduled',  name: 'Kick-off planifié',        dayOffset: 2,  owner: 'axiom' },
  { stepId: 'pre_kickoff_email',  name: 'Email pré-kick-off',       dayOffset: 3,  owner: 'axiom' },
  { stepId: 'kickoff_done',       name: 'Kick-off réalisé',         dayOffset: 5,  owner: 'both' },
  { stepId: 'kickoff_recap',      name: 'Recap kick-off envoyé',    dayOffset: 7,  owner: 'axiom' },
  { stepId: 'assets_collected',   name: 'Accès techniques collectés', dayOffset: 10, owner: 'client' },
  { stepId: 'first_deliverable',  name: 'Premier livrable envoyé',  dayOffset: 14, owner: 'axiom' },
  { stepId: 'monthly_checkin',    name: 'Check-in mensuel',         dayOffset: 30, owner: 'axiom' },
];

// Steps additionnels par type de projet
const PROJECT_SPECIFIC_STEPS: Record<string, PlannedStep[]> = {
  site_vitrine: [
    { stepId: 'brand_review',    name: 'Revue identité visuelle', dayOffset: 4,  owner: 'client' },
    { stepId: 'content_received', name: 'Contenus reçus',         dayOffset: 8,  owner: 'client' },
  ],
  ecommerce_shopify: [
    { stepId: 'product_catalog', name: 'Catalogue produits',       dayOffset: 7,  owner: 'client' },
    { stepId: 'payment_setup',   name: 'Paiement Stripe configuré', dayOffset: 10, owner: 'both' },
  ],
  app_flutter: [
    { stepId: 'ux_workshop',     name: 'Workshop UX',              dayOffset: 7,  owner: 'both' },
    { stepId: 'api_specs',       name: 'Spécifications API',       dayOffset: 10, owner: 'axiom' },
  ],
  app_metier: [
    { stepId: 'process_mapping', name: 'Mapping processus métier', dayOffset: 7,  owner: 'both' },
    { stepId: 'data_import',     name: 'Import données testé',     dayOffset: 14, owner: 'both' },
  ],
  rgaa: [
    { stepId: 'audit_scope',     name: 'Périmètre audit défini',   dayOffset: 3,  owner: 'both' },
    { stepId: 'initial_audit',   name: 'Audit initial lancé',      dayOffset: 10, owner: 'axiom' },
  ],
  tracking_server_side: [
    { stepId: 'gtm_access',      name: 'Accès GTM obtenu',         dayOffset: 1,  owner: 'client' },
    { stepId: 'tracking_plan',   name: 'Plan de tracking validé',  dayOffset: 3,  owner: 'both' },
  ],
};
```

### 5 email templates onboarding

| # | Timing | Sujet | Taux open attendu | Objectif |
|---|:------:|-------|:------------------:|----------|
| 1 | J+0 | "Bienvenue chez Axiom, {{prenom}} ! Votre projet {{type_projet}} démarre" | 40-60% | Welcome, équipe, prochaines étapes |
| 2 | J+3 | "Kick-off dans 2 jours ! 3 choses à préparer \| {{nom_projet}}" | 35-45% | Préparation kick-off (accès tech, branding, team) |
| 3 | J+7 | "Recap kick-off + prochaines étapes \| {{nom_projet}}" | 30-40% | Décisions, Phase 1, action items |
| 4 | J+14 | "Premier aperçu : votre {{type_projet}} prend forme !" | 50-65% | Premier livrable, demande feedback |
| 5 | J+30 | "Point mensuel : avancement de votre projet {{nom_projet}}" | 35-50% | Complété/en cours/à venir, timeline, bloqueurs |

### Détection risques onboarding

```typescript
interface OnboardingRiskSignal {
  type: 'no_asset_submission' | 'no_email_opens' | 'no_feedback' | 'missed_calls' | 'no_kickoff';
  detected_at: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  days_since_trigger: number;
}

// Seuils d'escalade
const RISK_THRESHOLDS = {
  no_asset_submission: { medium: 5, high: 10 },        // Jours sans soumission assets
  no_email_opens:      { medium: 10, high: 15 },       // Jours sans ouverture email
  no_feedback:         { medium: 10, high: 14 },       // Jours sans feedback livrable
  missed_calls:        { high: 2, critical: 3 },       // Appels manqués
  no_kickoff:          { high: 7, critical: 14 },      // Jours post-signature sans kick-off
};

// Actions automatiques
// AT-RISK (medium/high) → Flag CRM + Slack alert CSM + email empathique
// CRITICAL → Urgent Slack + DM Jonathan + tâche urgente : appeler < 24h
```

---

## 3. SUB-AGENT 10b — DÉTECTEUR UPSELL

### Mission
Identifie les opportunités de cross-sell et upsell parmi les clients existants d'Axiom, en analysant les signaux comportementaux, la santé du compte, et le timing optimal. **Règle cardinale : JAMAIS proposer d'upsell si le client est en difficulté.**

### Matrice cross-sell Axiom (13 chemins)

| Depuis (actuel) | Vers (upsell) | Probabilité | Montant | Timing | Effort |
|---|---|:---:|:---:|:---:|:---:|
| Site vitrine | E-commerce Shopify | 45% | +8 000 EUR | M3-4 | Moyen |
| Site vitrine | **Tracking server-side** | **65%** | +990+89/mois | **M1-2** | **Faible** |
| Site vitrine | App Flutter | 15% | +30 000 EUR | M6+ | Élevé |
| E-commerce Shopify | **Tracking server-side** | **80%** | +990+89/mois | **M1-2** | **Faible** |
| E-commerce Shopify | App Flutter | 30% | +20 000 EUR | M4-6 | Élevé |
| App Flutter | **Tracking server-side** | **70%** | +990+89/mois | **M2** | **Faible** |
| App Flutter | App métier | 25% | +15 000 EUR | M6+ | Élevé |
| App métier | **Tracking server-side** | **70%** | +990+89/mois | **M2** | **Faible** |
| App métier | App Flutter | 20% | +20 000 EUR | M6+ | Élevé |
| RGAA | Site vitrine refonte | 35% | +8 000 EUR | M2-3 | Moyen |
| RGAA | E-commerce Shopify | 20% | +10 000 EUR | M4-6 | Moyen |
| Tracking | Site vitrine | 25% | +7 500 EUR | M3-4 | Moyen |
| Tracking | E-commerce Shopify | 30% | +10 000 EUR | M3-4 | Moyen |

**Golden cross-sell** : Le tracking server-side est toujours le premier upsell à proposer (65-80% probabilité, revenu récurrent, friction minimale).

### Scoring opportunité upsell (0-100)

```typescript
interface UpsellSignals {
  // Product Health (0-30 pts)
  dashboard_active_weekly: boolean;        // 3+/semaine = +15
  zero_complaints_60days: boolean;         // = +8
  project_on_time_budget: boolean;         // = +7

  // Usage Growth (0-25 pts)
  traffic_growth_50pct: boolean;           // = +15
  feature_usage_80pct: boolean;            // = +10

  // Budget Signals (0-20 pts)
  budget_approved: boolean;                // = +20
  company_growth: boolean;                 // = +15
  feature_request_paid: boolean;           // = +10

  // Relationship Strength (0-15 pts)
  nps_promoter: boolean;                   // NPS > 8 = +10
  regular_communication: boolean;          // = +5

  // Timeline Fit (0-10 pts)
  days_since_launch: number;               // 30+ = +5
  pre_renewal_window: boolean;             // 6mo avant renouvellement = +10
  no_active_crisis: boolean;               // = +3
}

function calculateUpsellScore(signals: UpsellSignals): number {
  let score = 0;
  // Product Health (max 30)
  if (signals.dashboard_active_weekly) score += 15;
  if (signals.zero_complaints_60days) score += 8;
  if (signals.project_on_time_budget) score += 7;
  // Usage Growth (max 25)
  if (signals.traffic_growth_50pct) score += 15;
  if (signals.feature_usage_80pct) score += 10;
  // Budget Signals (max 20)
  if (signals.budget_approved) score += 20;
  else if (signals.company_growth) score += 15;
  else if (signals.feature_request_paid) score += 10;
  // Relationship (max 15)
  if (signals.nps_promoter) score += 10;
  if (signals.regular_communication) score += 5;
  // Timeline (max 10)
  if (signals.days_since_launch >= 30) score += 5;
  if (signals.pre_renewal_window) score += 10;
  if (signals.no_active_crisis) score += 3;
  return Math.min(100, score);
}

// Seuils :
// score >= 80 → HIGH priority
// score >= 60 → MEDIUM priority
// score >= 40 → LOW priority
// score < 40 → NOT_READY
```

### 10 Blockers absolus (JAMAIS proposer d'upsell si)

| # | Blocker | Alternative |
|---|---------|------------|
| 1 | Projet 2+ semaines en retard | Focus livraison |
| 2 | Plainte escaladée active | Rebuild trust + 30j cooling |
| 3 | Bugs core non résolus | Fix d'abord |
| 4 | Présence < 50% aux calls | Re-engager d'abord |
| 5 | NPS < 6 (détracteur) | Intervention rétention |
| 6 | Plaintes multiples non résolues | Prioriser résolution |
| 7 | Paiement en retard | Discussion plan paiement |
| 8 | Remboursement demandé | Rétention d'abord |
| 9 | Onboarding incomplet | Terminer onboarding |
| 10 | Contact clé parti | Identifier nouveau champion |

### Impact LTV par combinaison services

```
Client "vitrine seul" (3 ans)      :  22 500 EUR
Client vitrine + e-commerce         :  32 500 EUR (+44%)
Client vitrine + e-com + tracking   :  44 580 EUR (+98%)
Client vitrine + e-com + track + app: ~75 000 EUR (+233%)
```

---

## 4. SUB-AGENT 10c — MESUREUR SATISFACTION

### Mission
Calcule et maintient le Health Score composite de chaque client, automatise les surveys NPS/CSAT, détecte les signaux de churn, et déclenche les actions préventives.

### Health Score composite (0-100)

```
Health Score = (40% × Engagement) + (30% × Satisfaction) + (30% × Croissance)
```

### Indicateurs détaillés par composante

**A) ENGAGEMENT (40% du score)**

| Indicateur | Poids | Mesure | Source |
|---|:---:|---|---|
| Fréquence login | 30% | Logins mensuels dashboard projet | Analytics |
| Réactivité emails | 25% | Taux ouverture emails Axiom | Mailgun |
| Fréquence contact | 20% | Appels, emails, tickets/mois | CRM |
| Participation formations | 15% | Présence webinaires | CRM |
| Réactivité CTA | 10% | Réponse aux propositions | CRM |

**Barème login :** 0 logins = 0pts, 1-2 = 30pts, 3-5 = 60pts, 6+ = 100pts

**B) SATISFACTION (30% du score)**

| Indicateur | Poids | Mesure | Source |
|---|:---:|---|---|
| Dernier NPS | 50% | Score NPS normalisé 0-100 | Survey |
| CSAT moyen | 30% | Score CSAT post-interaction | Survey |
| Tickets critiques ouverts | 10% | Nombre bugs/plaintes non résolus | Support |
| Sentiment communications | 10% | Analyse sentiment emails | NLP |

**Normalisation NPS :** -100 à +100 → 0-100 : `(nps + 100) / 2`

**C) CROISSANCE (30% du score)**

| Indicateur | Poids | Mesure | Source |
|---|:---:|---|---|
| Changement MRR | 40% | Variation MRR normalisée | Finance |
| Feature adoption | 30% | % features utilisées | Analytics |
| Croissance trafic | 20% | Variation trafic normalisée | Analytics |
| Score upsell | 10% | Score détecteur upsell | 10b |

### Seuils et actions par couleur

| Score | Couleur | Status | Actions | SLA |
|:-----:|:-------:|--------|---------|:---:|
| 80-100 | Vert | Excellent | Tag promoter, trigger referral, trigger review, évaluer upsell | 30j |
| 60-79 | Jaune | Bon | Check-in mensuel, appels proactifs bi-mensuels, contenu valeur | 14j |
| 50-59 | Orange | At-risk | Alert CSM, email, appel CSM < 48h, offrir webinar | 48h |
| 30-49 | Orange foncé | Danger | Alert manager, plan remédiation, réunion account review, crédits service | 24h |
| < 30 | Rouge | Critique | Alert exécutif, escalade Jonathan, intervention fondateur, décision fight/accept | Immédiat |

### 7 signaux churn avec timing

| Signal | Délai churn | Sévérité | Action automatique |
|---|:---:|:---:|---|
| Silence radio (60+ jours) | 60-120j | Critique | Email J+60, SMS/appel J+75, email fondateur J+90, décision J+120 |
| Usage drop > 40% | 45-60j | Haut | Alert CSM immédiat, appel proactif J+1, offrir formation J+7 |
| Spike support (×3 normal) | 30-45j | Haut | QA review immédiat, appel exécutif J+1, root cause J+3 |
| Paiement retard (15+ jours) | 30j | Moyen | Email courtois J+15, appel J+25, plan paiement J+35 |
| NPS détracteur (< 6) | 30-90j | Moyen | Appel CSM J+1, plan action J+7, re-survey J+30 |
| Plaintes répétées | 15-30j | Moyen | Escalade + fix immédiat |
| Health Score drop > 20 pts/30j | 60-90j | Haut | Alert immédiat, revue contexte J+1, appel < 24h |

### Modèle probabilité churn

```typescript
function calculateChurnProbability(healthScore: number, signals: ChurnSignal[]): number {
  // Probabilité de base = inverse du health score
  let probability = Math.max(0, 100 - healthScore);

  // Aggravants
  for (const signal of signals) {
    switch (signal.signalType) {
      case 'silence':         probability += 20; break;
      case 'usage_drop':      probability += 15; break;
      case 'support_spike':   probability += 10; break;
      case 'nps_detractor':   probability += 15; break;
      case 'health_drop':     probability += 10; break;
      case 'late_payment':    probability += 10; break;
    }
  }

  return Math.min(100, probability);
}
// Précision attendue : 75-85% avec 8-12 métriques, 60-90 jours avant churn
```

### NPS/CSAT automation schedule

```typescript
const SURVEY_SCHEDULE = [
  { type: 'csat', timing: 'on_phase_complete',     channel: 'email', tool: 'typeform' },
  { type: 'ces',  timing: 'on_project_delivery',   channel: 'email', tool: 'typeform' },
  { type: 'nps',  timing: '30_days_post_delivery',  channel: 'email', tool: 'typeform' },
  { type: 'nps',  timing: 'quarterly',              channel: 'email', tool: 'typeform' },
];

// Traitement réponse NPS
// Promoter (9-10) → tag "referral_candidate", review request J+7, évaluer upsell
// Passive (7-8) → tag "nps_passif", email "comment améliorer", monitorer
// Detractor (< 6) → tag "nps_detracteur", Slack immédiat, tâche urgente (appel < 24h)
```

---

## 5. SUB-AGENT 10d — COLLECTEUR D'AVIS

### Mission
Automatise la demande d'avis clients sur 5 plateformes stratégiques, au timing optimal post-livraison, et gère les avis négatifs en < 24h.

### Plateformes cibles et taux de réponse

| Plateforme | Priorité | Raison | Taux réponse attendu |
|---|:---:|---|:---:|
| Google My Business | 1 | SEO local, confiance immédiate | 5-10% |
| Trustpilot | 2 | Autorité mondiale, B2B crédible | 3-5% (50% avec rappels) |
| Clutch.co | 3 | Spécialiste agences web/B2B | 8-15% |
| Sortlist | 4 | Niche agences parfait | 5-10% |
| LinkedIn | 5 | Autorité + networking | 2-5% |

**Taux global avec séquence automatisée :** 15-25% (objectif Axiom : 30%+)

### Logique de collecte

```typescript
// Conditions de déclenchement
function shouldRequestReview(customer: Customer, npsScore: number): ReviewPlatform[] {
  if (npsScore < 7) return []; // Jamais si NPS < 7

  if (npsScore >= 9) {
    // Promoteur → toutes les plateformes
    return ['google', 'trustpilot', 'clutch', 'sortlist', 'linkedin'];
  }

  // Passif (7-8) → les 2 plus impactantes
  return ['google', 'trustpilot'];
}
```

### Timing optimal

- **Demande d'avis :** J+5 à J+10 post-livraison (client a testé, mémoire fraîche)
- **Jour idéal d'envoi :** Mardi ou Mercredi, 9h-11h heure client
- **Séquence :** 3 emails (J+5, J+10, J+15) + SMS optionnel (J+12)

### Gestion avis négatifs (< 24h)

| Étape | Délai | Action |
|---|:---:|---|
| Détection | Immédiat | Monitoring automatique plateformes |
| Réponse publique | < 24h | Template professionnel + action concrète |
| Escalade interne | < 24h | Slack #csm-urgent + notification manager |
| Résolution | < 7 jours | Appeler le client, proposer solution |
| Suivi | J+14 | Demander mise à jour de l'avis si résolution |

**Impact avis négatifs non traités :** −59% prospects qualifiés (3 avis négatifs non traités)

### 3 email templates review

| # | Timing | Type | Sujet |
|---|:------:|------|-------|
| 1 | J+5 | Soft | "{{prenom}}, votre nouveau site est en ligne !" |
| 2 | J+10 | Direct | "Une minute pour nous aider ?" |
| 3 | J+15 | Rappel final | "Dernière tentative — votre avis nous aiderait énormément" |

---

## 6. SUB-AGENT 10e — GESTIONNAIRE REFERRAL

### Mission
Opère le programme ambassadeur d'Axiom : identification des promoteurs, invitation au programme, tracking des referrals, gestion des commissions, et intégration avec l'Agent 1 (VEILLEUR) pour les leads referral.

### Structure commission (modèle hybride)

| Tier (ACV referral) | Commission initiale | Bonus rétention | Total possible |
|---|:---:|:---:|:---:|
| < 15 000 EUR | 20% | +5%/mois × 12 mois si retenu | ~30% ACV |
| 15 000 – 40 000 EUR | 15% | +5%/mois × 12 mois si retenu | ~25% ACV |
| > 40 000 EUR | 10% | +5%/mois × 12 mois si retenu | ~20% ACV |

**Exemple concret :**
```
Referrer recommande e-commerce à 12 000 EUR :
- Commission initiale : 20% × 12 000 = 2 400 EUR
- Si client retenu 12 mois + tracking (89 EUR/mois) :
  Bonus : 5% × 89 × 12 = 53,40 EUR
- Total referrer : 2 453,40 EUR

ROI Axiom :
- CAC normal : ~4 500 EUR (30% du contrat)
- CAC via referral : 2 453 EUR
- Économie : 2 047 EUR + conversion 10× plus rapide
```

### Identification ambassadeurs

```typescript
// Critères d'éligibilité
function isEligibleForAmbassador(customer: Customer, npsScore: number, healthScore: number): boolean {
  return (
    npsScore >= 9 &&                           // Promoteur
    healthScore >= 80 &&                       // Client sain
    daysSince(customer.contractStartDate) >= 60 && // Client depuis 60+ jours
    !customer.referralProgram                  // Pas déjà dans le programme
  );
}
```

### Génération code referral

```typescript
function generateReferralCode(customerName: string): string {
  const prefix = 'AXIOM';
  const nameAbbr = customerName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .substring(0, 3);
  const random = crypto.randomBytes(4).toString('hex').toUpperCase().substring(0, 4);
  return `${prefix}-${nameAbbr}-${random}`; // ex: "AXIOM-DUP-A3F2"
}
```

### Workflow referral entrant

```
1. Valider le code referral
2. Créer ReferralLead (status: submitted)
3. Envoyer vers Agent 1 (Veilleur) via veilleur-referral-leads
   → Priority boost +40 points
   → Source = 'referral'
4. Notifier ambassadeur : "Merci, referral reçu"
5. Slack notification #csm-referrals
```

### Calcul commission post-conversion

```typescript
async function calculateCommission(referralLead: ReferralLead, dealValue: number): Promise<void> {
  const program = await findProgramByCode(referralLead.referralCode);
  const rate = getCommissionRate(program.commissionTier);

  referralLead.dealValue = dealValue;
  referralLead.commissionRate = rate;
  referralLead.commissionAmount = dealValue * rate;
  referralLead.status = 'won';
  referralLead.convertedAt = new Date();

  program.totalCommissionEarned += referralLead.commissionAmount;
  program.totalReferralsConverted += 1;

  // Notifications
  await sendEmail(program.customer.email, 'referral_converted', {
    amount: referralLead.commissionAmount,
    clientName: referralLead.entreprise,
  });
  await slackNotify('#csm-wins', `🎉 Referral converti ! ${referralLead.entreprise} — ${dealValue} EUR`);
}

function getCommissionRate(tier: string): number {
  switch (tier) {
    case 'tier_1': return 0.20; // < 15K EUR
    case 'tier_2': return 0.15; // 15-40K EUR
    case 'tier_3': return 0.10; // > 40K EUR
    default: return 0.15;
  }
}
```

### 3 email templates referral

| # | Timing | Type | Sujet |
|---|:------:|------|-------|
| 1 | Invitation | VIP | "{{prenom}}, rejoignez le programme VIP Axiom" |
| 2 | J+7 | Social proof | "Un de vos pairs a déjà gagné {{montant}} EUR..." |
| 3 | J+14 | Reminder | "Vous connaissez quelqu'un qui a besoin d'un site web ?" |

---

## 7. TYPES DE MESSAGES INTER-SOUS-AGENTS

| # | Message | De | Vers | Quand |
|---|---------|:---:|:---:|-------|
| 1 | `onboarding.started` | 10a | 10c | Client onboardé, baseline health J+30 |
| 2 | `onboarding.completed` | 10a | 10b, 10c | Onboarding terminé, activer upsell + health |
| 3 | `onboarding.at_risk` | 10a | CSM (Slack) | Risque détecté pendant onboarding |
| 4 | `onboarding.critical` | 10a | Jonathan (Slack DM) | Risque critique (3+ missed calls, 14j no kickoff) |
| 5 | `health.calculated` | 10c | 10b, 10d, 10e | Health Score mis à jour |
| 6 | `health.green_promoter` | 10c | 10d, 10e | Health >= 80 + NPS >= 9 → reviews + referral |
| 7 | `health.churn_detected` | 10c | Agent 6 (queue) | Health < 30, churn confirmé |
| 8 | `health.at_risk` | 10c | CSM (Slack) | Health orange/orange foncé |
| 9 | `nps.received` | 10c | 10d, 10e | NPS reçu → décider reviews + referral |
| 10 | `nps.detractor` | 10c | Jonathan (Slack DM) | NPS < 6 → intervention urgente |
| 11 | `upsell.detected` | 10b | Agent 8 (queue) | Score >= 60, pas de blocker |
| 12 | `upsell.proposed` | 10b | CRM | Email upsell envoyé |
| 13 | `upsell.converted` | 10b | Agent 7 (queue) | Upsell accepté → métriques |
| 14 | `review.requested` | 10d | Client (email) | Séquence avis lancée |
| 15 | `review.received` | 10d | Agent 7 (queue) | Avis reçu → métriques |
| 16 | `review.negative` | 10d | CSM (Slack urgent) | Avis négatif détecté |
| 17 | `referral.invited` | 10e | Client (email) | Invitation programme ambassadeur |
| 18 | `referral.submitted` | 10e | Agent 1 (queue) | Lead referral soumis |
| 19 | `referral.converted` | 10e | Agent 7 (queue) | Referral converti en deal |
| 20 | `referral.commission_paid` | 10e | Ambassadeur (email) | Commission versée |
| 21 | `metrics.daily_snapshot` | 10c | Agent 7 (queue) | Cron 8h quotidien |
| 22 | `churn.client_lost` | 10c | Agent 6 (queue) | Client officiellement churné |

---

## 8. DONNÉES AXIOM (profil entreprise pour CSM)

```typescript
// Données Axiom utilisées par le CSM pour la personnalisation
const AXIOM_PROFILE = {
  name: 'Axiom Marketing',
  founder: 'Jonathan Dewaele',
  founderEmail: 'jonathan@axiom-marketing.fr',
  location: 'La Réunion (974)',
  timezone: 'Indian/Reunion', // UTC+4

  services: [
    { id: 'site_vitrine',         name: 'Site vitrine',              price_range: '5000-12000' },
    { id: 'ecommerce_shopify',    name: 'E-commerce Shopify',        price_range: '8000-25000' },
    { id: 'app_flutter',          name: 'Application Flutter',       price_range: '15000-50000' },
    { id: 'app_metier',           name: 'Application métier',        price_range: '10000-40000' },
    { id: 'rgaa',                 name: 'Audit RGAA collectivités',  price_range: '3000-8000' },
    { id: 'tracking_server_side', name: 'Tracking server-side',      price_range: '990+89/mois' },
  ],

  retention_targets: {
    churn_rate_annual: 0.20,      // < 20%
    clv_cac_ratio: 3.0,           // >= 3:1
    nps_target: 50,               // > 50 (promoteurs - détracteurs)
    avg_health_score: 75,         // Moyenne fleet > 75
  },
};
```

---

## 8bis. DONNÉES COMPLÉMENTAIRES MANQUANTES (audit 29 mars 2026)

### 9 signaux comportementaux de détection upsell

| # | Signal | Définition | Timing détection | Probabilité upsell |
|---|--------|-----------|:---:|:---:|
| 1 | Usage au-delà du scope | Client utilise plus de pages/produits que prévu | M2-3 | 60% |
| 2 | Demande de feature | "Peut-on ajouter X ?" = besoin croissant | M2-4 | 55% |
| 3 | Croissance trafic/ventes | Client rapporte +50% trafic ou ventes | M2-3 | 70% |
| 4 | Expansion équipe | "On recrute 3 personnes dans [département]" | M3-6 | 65% |
| 5 | Outil complémentaire | Client utilise outils externes pour combler un manque | M2-4 | 75% |
| 6 | Demande intégration | "Peut-on connecter ça à [outil] ?" | M1-3 | 80% |
| 7 | Approbation budget | Client approuve budget supplémentaire | Anytime | 70% |
| 8 | Levée de fonds | Client annonce financement / Série A | M3-6 | 65% |
| 9 | Croissance publique | LinkedIn, communiqués presse, recrutement visible | M3-6 | 60% |

### Pitch clés par chemin cross-sell (colonne manquante)

| Depuis → Vers | Pitch clé |
|---|---|
| Vitrine → E-commerce | "Votre trafic mérite d'être monétisé" |
| Vitrine → Tracking | "Comprenez pourquoi vos visiteurs convertissent (ou pas)" |
| E-commerce → Tracking | "Votre attribution marketing est probablement fausse de 30%" |
| E-commerce → App | "Vos clients achètent de plus en plus sur mobile" |
| App Flutter → Tracking | "Trackez chaque interaction in-app pour optimiser la conversion" |
| RGAA → Vitrine refonte | "L'audit a révélé des opportunités de modernisation" |
| Tracking → E-commerce | "Vos données montrent que vos visiteurs sont prêts à acheter" |

### LTV impact — combinaison 4 services

```
Client "vitrine seul" (3 ans)                     :  22 500 EUR
Client vitrine + e-commerce                        :  32 500 EUR (+44%)
Client vitrine + e-com + tracking                  :  44 580 EUR (+98%)
Client vitrine + e-com + tracking + app Flutter     : ~75 000 EUR (+233%)
```

**Insight :** Chaque service additionnel augmente la rétention ET le revenue. À 3+ services, la rétention passe de 75% à 95%.

### Targets de recovery par signal de churn

| Signal | Objectif de recovery | Délai |
|--------|---------------------|:-----:|
| Silence radio | 30-40% de win-back réussi | 60 jours |
| Usage drop > 40% | Retour à l'usage normal | 30 jours |
| Spike support | Résoudre + retour taux normal | 14 jours |
| Retard paiement | Paiement reçu ou plan en place | 30 jours |
| NPS détracteur | Remonter à passif (7+) | 30 jours |
| Health Score drop | 50% des clients jaune retournent en vert | 30 jours |

### Kick-off meeting — Détails logistiques

**Participants optimaux :**
- **Côté client :** Décideur budget, utilisateur principal, contact technique (min 2, max 4)
- **Côté Axiom :** Project manager, lead dev, designer, account manager (min 3)

**Documents à préparer AVANT kick-off :**
| Document | Format | Contenu |
|----------|--------|---------|
| Project Charter | 2 pages PDF | Scope, objectifs, critères de succès, timeline |
| Creative Brief | 3 pages PDF | Identité visuelle, références, ton/voix |
| Spec technique | Notion/Confluence | Architecture, APIs, intégrations, contraintes |
| Timeline visuelle | Gantt (Asana/Monday) | Phases, jalons, deadlines |
| Checklist accès | Google Form | Items à collecter du client |

**Accès techniques à collecter :**
1. Hébergement actuel / FTP credentials
2. Registrar domaine (DNS)
3. CMS / e-commerce actuel
4. Google Analytics / Search Console
5. Email service provider
6. Comptes réseaux sociaux
7. APIs existantes (si intégration)
8. Payment processor (Stripe pour e-commerce)

### Modèle ProjectMilestone (AJOUT P0 — manquant dans la spec)

Le CSM doit tracker les jalons projets pour calculer le TTV et timer correctement NPS/reviews/upsell.

```prisma
model ProjectMilestone {
  id          String   @id @default(uuid())
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id])
  dealId      String?

  phase       String   // 'design' | 'development' | 'qa' | 'launch' | 'post_launch'
  name        String   // "Maquettes validées", "Catalogue importé", etc.
  dueDate     DateTime
  completedAt DateTime?
  deliverableUrl String? // Lien vers Figma, staging, etc.
  status      String   @default("pending") // pending | in_progress | completed | overdue

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([customerId, status])
  @@map("project_milestones")
}
```

### Modèle RenewalOpportunity (AJOUT P0 — manquant dans la spec)

```prisma
model RenewalOpportunity {
  id            String   @id @default(uuid())
  customerId    String
  customer      Customer @relation(fields: [customerId], references: [id])
  dealId        String?

  contractEndDate DateTime
  renewalValue    Float    // Montant renouvellement estimé
  status          String   @default("upcoming") // upcoming | contacted | renewed | lost | expired
  contactedAt     DateTime?
  renewedAt       DateTime?
  renewedDealId   String?  // Nouveau deal si renouvelé
  notes           String?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([customerId])
  @@index([contractEndDate])
  @@index([status])
  @@map("renewal_opportunities")
}
```

### Back-relations manquantes sur Customer (omis dans spec)

```prisma
// À AJOUTER dans le modèle Customer :
  onboardingRisks   OnboardingRisk[]
  churnSignals      ChurnSignal[]
  projectMilestones ProjectMilestone[]
  renewalOpportunities RenewalOpportunity[]
```

### Table `csm_metrics_daily` pour Agent 7 (architecture SQL-only)

Agent 7 lit les données SQL, pas de queue BullMQ en entrée. Le CSMMetricsSnapshot doit être persisté :

```prisma
model CsmMetricsDaily {
  id            String   @id @default(uuid())
  date          DateTime @unique
  snapshot      Json     // CSMMetricsSnapshot complet
  totalClients  Int
  avgHealthScore Float
  churnRate     Float
  nrr           Float    // Net Revenue Retention
  createdAt     DateTime @default(now())

  @@index([date])
  @@map("csm_metrics_daily")
}
```

---

## 9. BRAINSTORM — FONCTIONNALITÉS ADDITIONNELLES

| # | Feature | Priorité | Effort | Impact |
|---|---------|:--------:|:------:|:------:|
| F1 | **Health Score prédictif** — ML model sur historique pour prédire churn 90j avant | P1 | 3j | Élevé |
| F2 | **Dashboard ambassadeur** — interface client pour suivre referrals et commissions | P1 | 2j | Moyen |
| F3 | **NPS text mining** — analyse sémantique commentaires NPS pour thèmes récurrents | P2 | 1j | Moyen |
| F4 | **Upsell timing optimizer** — A/B test du timing par type de cross-sell | P2 | 2j | Moyen |
| F5 | **Review monitoring automatisé** — scraping quotidien des 5 plateformes | P2 | 1j | Moyen |
| F6 | **Referral gamification** — badges, leaderboard, récompenses non-monétaires | P3 | 2j | Faible |
| F7 | **Customer Success playbooks** — templates d'intervention par type de risque | P1 | 1j | Élevé |
| F8 | **Integration CRM bidirectionnelle** — sync HubSpot/Pipedrive ↔ Customer | P2 | 2j | Moyen |

---

## 10. ROADMAP DÉTAILLÉE

### Phase 0 — Foundation (1 jour)

```
[ ] Prisma migration (8 nouvelles tables + enrichissement Customer)
[ ] Customer entity enrichi + nouveaux champs
[ ] 4 nouvelles queue constants (QUEUE_NAMES + JOB_NAMES)
[ ] CsmProcessor enrichi (error handling, retry, full payload parsing)
[ ] Fix predictChurn() → requête Prisma optimisée (pas N+1)
[ ] Nouveaux endpoints controller (CRUD customers, health history)
```

### Phase 1 — Onboarding + Satisfaction (2 jours)

```
[ ] OnboardingService (séquence J1-J30, TTV tracking)
[ ] 5 email templates onboarding
[ ] Risk detection (5 types de signaux, escalade automatique)
[ ] SatisfactionService (Health Score composite 3 composantes)
[ ] NPS/CSAT automation (Typeform API integration)
[ ] Cron quotidien Health Score (8h)
[ ] 7 signaux churn avec actions automatiques
[ ] Tests unitaires onboarding + satisfaction
```

### Phase 2+3 — Upsell + Avis + Referral (2.5 jours, parallélisables)

```
[ ] UpsellService (matrice 13 chemins, scoring, 10 blockers)
[ ] 3 email templates upsell
[ ] ReviewService (séquence 3 emails, 5 plateformes)
[ ] Gestion avis négatifs (< 24h, Slack alert)
[ ] ReferralService (programme ambassadeur, 3 tiers commission)
[ ] Génération code referral sécurisé
[ ] 3 email templates referral
[ ] Tests unitaires upsell + reviews + referral
```

### Phase 4 — Integration inter-agents (1 jour)

```
[ ] Queue → Agent 1 (veilleur-referral-leads, +40 priority)
[ ] Queue → Agent 6 (nurturer-churned-client, win-back)
[ ] Queue → Agent 7 (analyste-csm-metrics, daily snapshot)
[ ] Queue → Agent 8 (dealmaker-upsell, opportunités)
[ ] Slack notifications (#csm-wins, #csm-urgent, #csm-referrals)
[ ] Gestion win-back réussi (Agent 6 → Agent 10)
```

### Phase 5 — Tests + Monitoring (1 jour)

```
[ ] Tests unitaires complets (5 services)
[ ] Tests intégration inter-agents (mocks BullMQ)
[ ] Tests controller enrichi
[ ] Dashboard Grafana (health distribution, churn, NRR, upsell)
[ ] Alerting (Slack pour churn critique, reviews négatifs)
```
