# Architecture — Flux de Données

## Table des matières

1. [Vue d'ensemble des queues](#vue-densemble-des-queues)
2. [Formats de messages par queue](#formats-de-messages-par-queue)
3. [Cycle de vie des données](#cycle-de-vie-des-données)
4. [Boucles de rétroaction (Feedback Loops)](#boucles-de-rétroaction-feedback-loops)
5. [Patterns d'idempotence](#patterns-didempotence)
6. [Dead Letter Queue](#dead-letter-queue)
7. [Rate Limiting par queue](#rate-limiting-par-queue)
8. [Monitoring de la santé des queues](#monitoring-de-la-santé-des-queues)

---

## Vue d'ensemble des queues

### Topologie complète

```
SOURCES EXTERNES
      │
      ▼
┌─────────────────┐
│ veilleur-       │   Cron → Agent 1
│ pipeline        │   Sortie → enrichisseur-pipeline
└─────────────────┘
      │
      ▼
┌─────────────────┐
│ enrichisseur-   │   Consumer → Agent 2
│ pipeline        │   Sortie → scoreur-pipeline
└─────────────────┘
      │
      ▼
┌─────────────────┐
│ scoreur-        │   Consumer → Agent 3
│ pipeline        │   Sorties → redacteur-pipeline (score>=60)
└─────────────────┘          → nurturer-pipeline (score<60)
      │
      ├─────────────────────────────────────────────────┐
      ▼                                                 ▼
┌─────────────────┐                          ┌──────────────────┐
│ redacteur-      │   Consumer → Agent 4     │ nurturer-        │
│ pipeline        │   Sortie → suiveur-      │ pipeline         │
└─────────────────┘           pipeline       │ Consumer→Agent 6 │
      │                                      └──────────────────┘
      ▼                                               │ (re-score)
┌─────────────────┐                                   │
│ suiveur-        │   Consumer → Agent 5              ▼
│ pipeline        │   Sortie → dealmaker-    ┌─────────────────┐
└─────────────────┘           pipeline       │ scoreur-        │
      │                                      │ pipeline        │
      ▼                                      │ (feedback loop) │
┌─────────────────┐                          └─────────────────┘
│ dealmaker-      │   Consumer → Agent 8
│ pipeline        │   Sortie → csm-onboarding
└─────────────────┘
      │
      ▼
┌─────────────────┐
│ csm-onboarding  │   Consumer → Agent 10
│                 │   Sorties → dealmaker-pipeline (upsell)
└─────────────────┘           → veilleur-pipeline (referral)

┌─────────────────┐
│ dead-letter-    │   DLQ globale — jobs épuisés
│ queue           │   Revue manuelle via Bull Board
└─────────────────┘
```

### Registre des queues

| Queue | Producteur | Consommateur | Concurrence | Priorité | Délai max |
|-------|-----------|-------------|------------|---------|-----------|
| `veilleur-pipeline` | Agent 1, Agent 10 | Agent 2 | 10 | Non | 48h |
| `enrichisseur-pipeline` | Agent 1 | Agent 2 | 5 | Non | 24h |
| `scoreur-pipeline` | Agent 2, Agent 6 | Agent 3 | 10 | Oui (1-10) | 12h |
| `redacteur-pipeline` | Agent 3 | Agent 4 | 3 | Oui (1-10) | 6h |
| `suiveur-pipeline` | Agent 4 | Agent 5 | 5 | Non | 24h |
| `nurturer-pipeline` | Agent 3, Agent 5 | Agent 6 | 3 | Non | 72h |
| `dealmaker-pipeline` | Agent 5, Agent 10 | Agent 8 | 2 | Oui (1-5) | 24h |
| `csm-onboarding` | Agent 8 | Agent 10 | 5 | Non | 48h |
| `dead-letter-queue` | Tous agents | Humain | 1 | Non | Illimité |

---

## Formats de messages par queue

### `veilleur-pipeline`

Produit par l'Agent 1 lors de la détection de leads, ou par l'Agent 10 lors d'un referral.

```typescript
// Schéma JSON — veilleur-pipeline
interface VeilleurJobPayload {
  // Identification
  jobId: string;               // Format: "veilleur:{source}:{sha256[:16]}"
  schemaVersion: '1.0';

  // Source
  source: 'linkedin' | 'marches' | 'web' | 'jobs' | 'referral';
  subAgent: '1a' | '1b' | '1c' | '1d' | '10e';
  sourceId: string;            // ID unique dans la source
  sourceUrl: string;           // URL de la fiche source

  // Contenu brut
  rawContent: string;          // HTML ou texte extrait
  rawTitle: string | null;

  // Métadonnées
  detectedAt: string;          // ISO 8601
  highPriority: boolean;       // true si referral
  referrerId: string | null;   // clientId si source = 'referral'

  // Contexte optionnel
  metadata: {
    linkedinProfileId?: string;
    companyLinkedinId?: string;
    jobPostingId?: string;
    aoReference?: string;       // Référence BOAMP ou TED
    [key: string]: string | undefined;
  };
}

// Exemple concret
{
  "jobId": "veilleur:linkedin:a3f8d291bc7e1245",
  "schemaVersion": "1.0",
  "source": "linkedin",
  "subAgent": "1a",
  "sourceId": "urn:li:person:ACoAAxxxxx",
  "sourceUrl": "https://www.linkedin.com/in/jean-dupont/",
  "rawContent": "<html>...</html>",
  "rawTitle": "Jean Dupont — DSI chez Acme Corp",
  "detectedAt": "2026-03-23T08:32:00.000Z",
  "highPriority": false,
  "referrerId": null,
  "metadata": {
    "linkedinProfileId": "ACoAAxxxxx",
    "companyLinkedinId": "urn:li:company:12345"
  }
}
```

### `enrichisseur-pipeline`

Produit par l'Agent 1 après normalisation du `VeilleurJobPayload`.

```typescript
interface EnrichisseurJobPayload {
  // Identité
  jobId: string;               // Format: "enrichisseur:{leadId}"
  schemaVersion: '2.0';
  leadId: string;              // UUID PostgreSQL — lead déjà créé en DB

  // Données normalisées de l'Agent 1
  source: LeadSource;
  detectedAt: string;

  // Contact (partiel — à compléter par Agent 2)
  firstName: string | null;
  lastName: string | null;
  linkedinUrl: string | null;
  jobTitle: string | null;

  // Entreprise (partielle)
  companyName: string | null;
  companyWebsite: string | null;
  companyLinkedinUrl: string | null;

  // Hints pour l'enrichissement
  enrichmentHints: {
    hasLinkedinProfile: boolean;
    hasCompanyWebsite: boolean;
    detectedTech: string[];      // Technos détectées lors du scraping
    triggerEvent: string | null; // 'job_posting' | 'news_mention' | 'ao_published'
    triggerDescription: string | null;
  };

  // Priorité
  highPriority: boolean;
}

// Exemple concret
{
  "jobId": "enrichisseur:550e8400-e29b-41d4-a716-446655440000",
  "schemaVersion": "2.0",
  "leadId": "550e8400-e29b-41d4-a716-446655440000",
  "source": "linkedin",
  "detectedAt": "2026-03-23T08:32:00.000Z",
  "firstName": "Jean",
  "lastName": "Dupont",
  "linkedinUrl": "https://www.linkedin.com/in/jean-dupont/",
  "jobTitle": "DSI",
  "companyName": "Acme Corp",
  "companyWebsite": "https://www.acme.fr",
  "companyLinkedinUrl": "https://www.linkedin.com/company/acme-corp/",
  "enrichmentHints": {
    "hasLinkedinProfile": true,
    "hasCompanyWebsite": true,
    "detectedTech": ["Salesforce"],
    "triggerEvent": "job_posting",
    "triggerDescription": "Acme Corp recrute un Chef de Projet Digital"
  },
  "highPriority": false
}
```

### `scoreur-pipeline`

Produit par l'Agent 2 après enrichissement complet.

```typescript
interface ScoreurJobPayload {
  jobId: string;              // Format: "scoreur:{leadId}"
  schemaVersion: '3.0';
  leadId: string;

  // Contact enrichi
  contact: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    linkedinUrl: string;
    jobTitle: string;
    jobLevel: 'c_suite' | 'vp' | 'director' | 'manager' | 'individual' | 'unknown';
    department: string | null;
    jobChangedAt: string | null;   // ISO 8601 si changement de poste récent
  };

  // Entreprise enrichie
  company: {
    name: string;
    siren: string | null;
    website: string;
    industry: string;
    subIndustry: string | null;
    size: '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1000+';
    revenue: '<1M' | '1M-5M' | '5M-20M' | '20M-100M' | '100M+' | null;
    country: string;
    city: string | null;
    foundedYear: number | null;
  };

  // Stack technique
  tech: {
    stack: string[];
    cms: string | null;
    crm: string | null;
    hasTargetTech: boolean;
    techCompatibilityScore: number;  // 0-100
  };

  // Signaux d'intent
  signals: {
    triggerEvent: string | null;
    triggerDate: string | null;
    recentFunding: boolean;
    recentExpansion: boolean;
    isHiring: boolean;
    hiringForRole: string | null;
    hasRecentAO: boolean;
  };

  // Métadonnées enrichissement
  enrichmentSources: string[];
  enrichmentScore: number;         // qualité des données 0-100
  enrichedAt: string;

  // Re-scoring context (si feedback de l'Agent 6)
  reScoreContext?: {
    previousScore: number;
    nurtureDays: number;
    nurturingInteractions: number;
    reEntryReason: 'nurture_rescore' | 'manual_trigger';
  };
}
```

### `redacteur-pipeline`

Produit par l'Agent 3 pour les leads avec score >= 60.

```typescript
interface RedacteurJobPayload {
  jobId: string;              // Format: "redacteur:{leadId}:{attempt}"
  schemaVersion: '4.0';
  leadId: string;

  // Score et breakdown
  score: number;              // 0-100
  scoreBreakdown: {
    icpScore: number;         // 0-40
    intentScore: number;      // 0-30
    timingScore: number;      // 0-30
  };

  // Profil complet pour personnalisation
  contact: ScoreurJobPayload['contact'];
  company: ScoreurJobPayload['company'];
  tech: ScoreurJobPayload['tech'];
  signals: ScoreurJobPayload['signals'];

  // Instructions de personnalisation
  personalizationInstructions: {
    primaryAngle: string;           // Angle principal à utiliser
    specificTrigger: string;        // Le signal déclencheur à mentionner
    relevantCaseStudy: string | null;
    channelsToUse: Array<'email' | 'linkedin'>;
    urgencyLevel: 'high' | 'medium' | 'low';
  };

  // BullMQ priority (calqué sur le score)
  priority: number;           // 6-10 (score/10)
}
```

### `suiveur-pipeline`

Produit par l'Agent 4 après rédaction des messages.

```typescript
interface SuiveurJobPayload {
  jobId: string;              // Format: "suiveur:{leadId}:{timestamp}"
  schemaVersion: '5.0';
  leadId: string;

  // Messages rédigés
  emailMessage: {
    subject: string;
    body: string;             // Texte brut + HTML généré par Lemlist
    personalizationScore: number;
    lemlistTemplateId: string | null;
  } | null;

  linkedinMessage: {
    body: string;             // <= 300 caractères
    personalizationScore: number;
  } | null;

  impactStatement: {
    useCase: string;
    estimatedRoi: string;
    relevantCaseStudy: string | null;
  };

  // Contact pour envoi
  contact: {
    email: string | null;
    linkedinUrl: string;
    firstName: string;
    lastName: string;
    companyName: string;
  };

  // Séquence
  sequenceConfig: {
    initialDelay: number;     // ms avant premier envoi (0 = immédiat)
    followUpDays: number[];   // [3, 7, 14] = relances à J+3, J+7, J+14
    maxFollowUps: number;     // 3
    stopOnReply: boolean;     // true
  };

  // Contexte
  draftedAt: string;
  lemlistCampaignId: string | null;
}
```

### `nurturer-pipeline`

Produit par l'Agent 3 (score < 60) ou l'Agent 5 (séquence complète sans réponse).

```typescript
interface NurturerJobPayload {
  jobId: string;              // Format: "nurturer:{leadId}"
  schemaVersion: '1.0';
  leadId: string;

  // Raison d'entrée en nurture
  entryReason: 'low_score' | 'sequence_complete' | 'manual';
  entryScore: number;         // Score au moment de l'entrée

  // Profil condensé pour nurture
  contact: {
    email: string | null;
    linkedinUrl: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    companyName: string;
  };

  company: {
    name: string;
    industry: string;
    size: string;
  };

  // Historique des interactions
  previousInteractions: {
    emailsSent: number;
    linkedinMessagesSent: number;
    emailsOpened: number;
    lastContactAt: string | null;
  };

  // Configuration nurture
  nurturingConfig: {
    emailSequenceId: string;  // ID séquence Lemlist nurture
    linkedinFrequency: 'low' | 'medium';  // fréquence actions passives
    reScoreAfterDays: number;  // 30 | 60 | 90
  };
}
```

### `dealmaker-pipeline`

Produit par l'Agent 5 (réponse positive) ou l'Agent 10 (upsell).

```typescript
interface DealmakerJobPayload {
  jobId: string;              // Format: "dealmaker:{type}:{leadId|clientId}:{timestamp}"
  schemaVersion: '2.0';

  // Type de deal
  dealType: 'new_deal' | 'upsell' | 'renewal';
  leadId: string | null;      // null si upsell sur client existant
  clientId: string | null;    // null si new_deal

  // Contexte commercial
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    jobTitle: string;
    companyName: string;
    linkedinUrl: string;
  };

  // Déclencheur
  triggerEvent: {
    type: 'positive_reply' | 'verbal_agreement' | 'upsell_signal' | 'renewal_due';
    description: string;
    occurredAt: string;
    rawMessage: string | null;  // Texte de la réponse positive si applicable
  };

  // Contexte upsell (si dealType = 'upsell')
  upsellContext?: {
    currentMrr: number;
    currentProducts: string[];
    upsellOpportunity: string;
    confidence: number;        // 0-1
    triggerReason: string;
  };

  // Priorité (high = deal signable rapidement)
  priority: 1 | 2 | 3 | 4 | 5;  // 5 = plus haute priorité
}
```

### `csm-onboarding`

Produit par l'Agent 8 après signature d'un deal.

```typescript
interface CsmOnboardingJobPayload {
  jobId: string;              // Format: "csm:{dealId}"
  schemaVersion: '1.0';

  // Deal signé
  dealId: string;
  dealValue: number;          // Montant annuel en EUR
  dealType: 'new' | 'upsell' | 'renewal';
  signedAt: string;

  // Client
  client: {
    id: string;               // clientId PostgreSQL
    companyName: string;
    primaryContact: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string | null;
      linkedinUrl: string;
    };
    billingEmail: string;
    contractStartDate: string;
    contractEndDate: string;
  };

  // Produits souscrits
  products: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;

  // Historique de la relation
  leadHistory: {
    leadId: string;
    detectedAt: string;
    firstContactAt: string;
    positiveReplyAt: string;
    totalInteractions: number;
    channelUsed: 'email' | 'linkedin' | 'both';
  };
}
```

---

## Cycle de vie des données

### États du Lead en base de données

```
                           ┌─────────┐
                           │detected │ ← Agent 1 crée le lead en DB
                           └────┬────┘
                                │
                           ┌────▼────┐
                           │enriching│ ← Agent 2 prend en charge
                           └────┬────┘
                                │
                           ┌────▼────┐
                           │ scoring │ ← Agent 3 calcule le score
                           └────┬────┘
                                │
               score < 60       │      score >= 60
          ┌─────────────────────┤─────────────────────┐
          ▼                                            ▼
    ┌──────────┐                               ┌───────────┐
    │nurturing │ ← Agent 6                     │ drafting  │ ← Agent 4
    └──────┬───┘                               └─────┬─────┘
           │ re-score >= 60                          │
           │                                    ┌────▼────┐
           └──────────────────────────────────► │tracking │ ← Agent 5
                                                └────┬────┘
                                                     │
                                   réponse positive  │  pas de réponse
                              ┌──────────────────────┤
                              ▼                      ▼
                        ┌──────────┐          ┌──────────┐
                        │ dealing  │          │nurturing │
                        └────┬─────┘          │(retour)  │
                             │                └──────────┘
                        ┌────▼────┐
                        │   won   │ ← Deal signé
                        └────┬────┘
                             │
                        ┌────▼────┐
                        │customer │ ← Agent 10 prend en charge
                        └─────────┘
```

### Rétention des données

| Table PostgreSQL | Rétention | Archivage |
|-----------------|-----------|-----------|
| `leads` | Illimité | Non (référentiel) |
| `lead_events` | 2 ans | Cold storage |
| `messages` | 2 ans | Cold storage |
| `jobs_history` (Redis BullMQ) | 7 jours (completed) | Non |
| `jobs_failed` (Redis BullMQ) | 30 jours | PostgreSQL DLQ |
| `llm_traces` (Langfuse) | 90 jours | Exporté Metabase |

### Schéma PostgreSQL principal

```sql
-- Table centrale
CREATE TABLE leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     VARCHAR(255) NOT NULL,
  source        VARCHAR(50) NOT NULL,
  status        VARCHAR(50) NOT NULL DEFAULT 'detected',
  score         INTEGER,
  score_breakdown JSONB,
  raw_data      JSONB NOT NULL DEFAULT '{}',
  enriched_data JSONB NOT NULL DEFAULT '{}',
  deal_id       UUID REFERENCES deals(id),
  client_id     UUID REFERENCES clients(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT leads_source_unique UNIQUE (source, source_id)
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_leads_status     ON leads(status);
CREATE INDEX idx_leads_score      ON leads(score);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_source     ON leads(source, source_id);

-- Table des événements du pipeline
CREATE TABLE lead_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES leads(id),
  event_type VARCHAR(100) NOT NULL,
  agent      VARCHAR(50) NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lead_events_lead_id ON lead_events(lead_id);
CREATE INDEX idx_lead_events_type    ON lead_events(event_type);
```

---

## Boucles de rétroaction (Feedback Loops)

Le système contient trois boucles de rétroaction qui permettent une amélioration continue sans intervention humaine.

### Boucle 1 — Agent 6 → Agent 3 (Re-Score après Nurture)

```
Agent 6 (Nurtureur)
    │
    │ Toutes les 30/60/90 jours selon config
    │
    ├── Récupère tous les leads en status 'nurturing'
    ├── Vérifie les nouveaux signaux (nouveaux jobs postés, actualité, AO)
    └── Publie dans scoreur-pipeline avec reScoreContext
              │
              ▼
        Agent 3 (Scoreur)
              │
              ├── score < 60 → reste en nurturing (update nurturingConfig.reScoreAfterDays)
              └── score >= 60 → publie dans redacteur-pipeline
                                  lead quitte le nurturing
```

**Payload de feedback (scoreur-pipeline avec contexte re-score)**

```typescript
// Champ supplémentaire ajouté par Agent 6
reScoreContext: {
  previousScore: 45,
  nurtureDays: 62,
  nurturingInteractions: 8,  // emails ouverts + actions LinkedIn
  reEntryReason: 'nurture_rescore',
  newSignals: ['job_posting_detected', 'company_revenue_increase'],
}
```

**Garde-fou contre les boucles infinies**

```typescript
// Maximum 5 re-scores par lead avant escalade humaine
if (lead.reScoreCount >= 5) {
  lead.status = 'manual_review';
  await this.alertService.send('lead_rescore_limit', { leadId: lead.id });
  return;  // Ne pas re-publier dans scoreur-pipeline
}
```

### Boucle 2 — Agent 10 → Agent 8 (Signaux Upsell)

```
Agent 10 (CSM) — sous-agent 10b
    │
    │ Mensuel : analyse les clients actifs
    │
    ├── Détecte signaux : croissance équipe, nouveau budget, usage élevé
    └── Émet événement 'csm.upsell_signal'
              │
              ▼
        Agent 8 (Dealmaker)
              │
              └── Crée nouveau deal de type 'upsell' dans dealmaker-pipeline
```

**Types de signaux upsell détectés**

```typescript
type UpsellSignal =
  | 'team_growth'         // L'entreprise recrute, l'équipe grandit
  | 'high_usage'          // Utilisation proche du plafond du forfait
  | 'new_department'      // Nouveau département potentiellement concerné
  | 'contract_renewal'    // Renouvellement dans 90 jours
  | 'budget_cycle'        // Nouveau cycle budgétaire détecté (jan/juil)
  | 'referral_success';   // Client a parrainé avec succès → négociation favorable
```

### Boucle 3 — Agent 10 → Agent 1 (Leads Referral)

```
Agent 10 (CSM) — sous-agent 10e
    │
    │ Déclenché par NPS >= 8
    │
    ├── Envoie programme de parrainage au client
    ├── Reçoit noms/contacts recommandés (webhook ou email)
    └── Publie dans veilleur-pipeline avec source='referral' et highPriority=true
              │
              ▼
        Agent 1 (Veilleur)
              │
              └── Traité comme un lead normal mais avec
                  +15 points de score bonus (trust referral)
```

**Boost de score pour les leads referral**

```typescript
// Dans Agent 3 (Scoreur), detection du referral boost
if (lead.source === 'referral' && lead.referrerId) {
  const referrerNps = await this.clientRepository.getNps(lead.referrerId);
  const referralBonus = referrerNps >= 9 ? 20 : referrerNps >= 8 ? 15 : 10;

  icpScore = Math.min(40, icpScore + referralBonus);

  scoreBreakdown.referralBonus = referralBonus;
  scoreBreakdown.referrerId = lead.referrerId;
}
```

---

## Patterns d'idempotence

### Principe

Tout job BullMQ utilise un `jobId` déterministe. Si le même lead est détecté deux fois (même source + même sourceId), le second job est ignoré silencieusement par BullMQ car un job avec cet ID existe déjà (en pending, active ou completed).

### Génération des jobId

```typescript
import { createHash } from 'crypto';

function generateJobId(queue: string, ...parts: string[]): string {
  const key = parts.join(':');
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 16);
  return `${queue}:${hash}`;
}

// Exemples
const veilleurJobId = generateJobId('veilleur', 'linkedin', 'ACoAAxxxxx');
// → "veilleur:a3f8d291bc7e1245"

const enrichisseurJobId = generateJobId('enrichisseur', leadId);
// → "enrichisseur:b7c2e851af3d4901"

const redacteurJobId = generateJobId('redacteur', leadId, attempt.toString());
// → "redacteur:c9d4f763be5e2012"
// NOTE : 'attempt' permet de re-rédiger si le premier brouillon était insuffisant
```

### Contrainte d'unicité en base de données

En complément de l'idempotence BullMQ, PostgreSQL garantit l'unicité au niveau des données :

```sql
-- Empêche l'insertion de doublons même en cas de race condition
CONSTRAINT leads_source_unique UNIQUE (source, source_id)

-- Upsert idempotent dans l'Agent 1
INSERT INTO leads (source_id, source, status, raw_data, created_at)
VALUES ($1, $2, 'detected', $3, NOW())
ON CONFLICT (source, source_id)
DO UPDATE SET
  raw_data = EXCLUDED.raw_data,
  updated_at = NOW()
RETURNING id;
```

### Idempotence des messages envoyés

Pour éviter d'envoyer deux fois le même message à un prospect :

```typescript
// Vérification avant envoi dans Agent 5
const alreadySent = await this.messageRepository.exists({
  leadId: job.data.leadId,
  channel: 'email',
  messageHash: hash(job.data.emailMessage.body),
});

if (alreadySent) {
  this.logger.warn(`Message déjà envoyé pour lead ${job.data.leadId}, skip`);
  return;
}
```

---

## Dead Letter Queue

### Structure de la DLQ

La DLQ est une queue BullMQ dédiée (`dead-letter-queue`) qui reçoit tous les jobs ayant épuisé leurs tentatives de retry.

```typescript
// Configuration de la DLQ
@InjectQueue('dead-letter-queue')
private dlqQueue: Queue;

// Gestionnaire d'échec global — à déclarer dans chaque Worker
worker.on('failed', async (job: Job | undefined, err: Error) => {
  if (!job) return;

  const maxAttempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < maxAttempts) return;  // Encore des tentatives restantes

  await this.dlqQueue.add('dead-letter', {
    // Traçabilité
    originalJobId: job.id,
    originalQueue: job.queueName,
    originalJobName: job.name,

    // Données
    payload: job.data,

    // Contexte d'échec
    failedAt: new Date().toISOString(),
    totalAttempts: job.attemptsMade,
    lastError: {
      message: err.message,
      name: err.name,
      stack: err.stack?.slice(0, 2000),  // Tronquer pour Redis
    },

    // Impact
    leadId: job.data.leadId ?? null,
    estimatedImpact: this.assessImpact(job.queueName),
  }, {
    removeOnComplete: false,  // Garder en DLQ indéfiniment
    removeOnFail: false,
  });

  // Alerte immédiate
  await this.alertService.send('dlq_new_entry', {
    queue: job.queueName,
    jobId: job.id,
    error: err.message,
    leadId: job.data.leadId,
  });
});
```

### Classification de l'impact

```typescript
function assessImpact(queueName: string): 'critical' | 'high' | 'medium' | 'low' {
  const impactMap: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
    'dealmaker-pipeline': 'critical',    // Deal perdu = revenu perdu
    'csm-onboarding': 'critical',        // Client mal onboardé
    'suiveur-pipeline': 'high',          // Message non envoyé
    'redacteur-pipeline': 'high',        // Lead bloqué
    'scoreur-pipeline': 'medium',        // Lead en attente
    'enrichisseur-pipeline': 'medium',   // Données incomplètes
    'nurturer-pipeline': 'low',          // Pas d'urgence
    'veilleur-pipeline': 'low',          // Lead manqué
  };
  return impactMap[queueName] ?? 'low';
}
```

### Procédure de traitement de la DLQ

```
1. Alerte Slack/email envoyée automatiquement
2. Responsable technique consulte Bull Board
3. Analyse de l'erreur dans Langfuse (si erreur Claude) ou logs NestJS
4. Trois options :
   a. RETRY : corriger les données et re-publier manuellement
   b. SKIP  : marquer le lead avec status 'dlq_skip' et documenter
   c. FIX   : corriger le code, déployer, puis retry
5. Post-mortem si impact 'critical' ou 'high'
```

### API de gestion manuelle de la DLQ

```typescript
// Endpoint interne (authentification IP whitelist)
@Post('/internal/dlq/retry/:jobId')
async retryDlqJob(@Param('jobId') jobId: string) {
  const dlqJob = await this.dlqQueue.getJob(jobId);
  const { originalQueue, payload } = dlqJob.data;

  await this.queueManager
    .getQueue(originalQueue)
    .add('retry-from-dlq', payload, {
      jobId: `retry:${jobId}:${Date.now()}`,
    });

  await dlqJob.remove();
  return { status: 'queued', originalQueue };
}
```

---

## Rate Limiting par queue

### Configuration BullMQ par queue

BullMQ permet de limiter le débit de traitement via l'option `limiter` sur le Worker. Ces limites protègent les APIs tierces et respectent les contraintes légales (LinkedIn).

```typescript
// enrichisseur-pipeline — protège Apollo.io (600 req/h)
const enrichisseurWorker = new Worker(
  'enrichisseur-pipeline',
  processor,
  {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: 10,                    // 10 jobs max
      duration: 60 * 1000,        // par minute
    },
  }
);

// redacteur-pipeline — protège Claude API (50 req/min)
const redacteurWorker = new Worker(
  'redacteur-pipeline',
  processor,
  {
    connection: redisConnection,
    concurrency: 3,
    limiter: {
      max: 8,                     // 8 rédactions max
      duration: 60 * 1000,        // par minute
    },
  }
);

// suiveur-pipeline — compliance LinkedIn (20 messages/jour)
const suiveurWorker = new Worker(
  'suiveur-pipeline',
  processor,
  {
    connection: redisConnection,
    concurrency: 2,
    limiter: {
      max: 20,                    // 20 messages LinkedIn max
      duration: 24 * 60 * 60 * 1000,  // par 24 heures
    },
  }
);

// nurturer-pipeline — pas de rush
const nurtureurWorker = new Worker(
  'nurturer-pipeline',
  processor,
  {
    connection: redisConnection,
    concurrency: 2,
    limiter: {
      max: 5,
      duration: 60 * 1000,
    },
  }
);
```

### Tableau récapitulatif des limites

| Queue | Concurrence | Max jobs | Période | Justification |
|-------|------------|----------|---------|---------------|
| `veilleur-pipeline` | 10 | 30 | /heure | Scraping prudent |
| `enrichisseur-pipeline` | 5 | 10 | /minute | Apollo 600 req/h |
| `scoreur-pipeline` | 10 | 60 | /minute | CPU seulement |
| `redacteur-pipeline` | 3 | 8 | /minute | Claude 50 req/min |
| `suiveur-pipeline` | 2 | 20 | /24h | Compliance LinkedIn |
| `nurturer-pipeline` | 2 | 5 | /minute | Pas urgent |
| `dealmaker-pipeline` | 2 | 10 | /heure | Haute valeur, prudence |
| `csm-onboarding` | 5 | 20 | /heure | Pas de contrainte API |

### Rate limiting applicatif (Redis)

En complément des limites BullMQ, un rate limiter Redis est utilisé pour les appels directs vers les APIs tierces :

```typescript
import { RateLimiterRedis } from 'rate-limiter-flexible';

// Limiter Apollo.io : 600 requêtes par heure
const apolloLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl:apollo',
  points: 600,
  duration: 3600,
});

// Usage dans l'Agent 2a
async function callApolloApi(params: ApolloParams) {
  try {
    await apolloLimiter.consume('global');  // 1 point par appel
    return await apollo.searchPeople(params);
  } catch (rateLimitError) {
    // Attendre 30s avant retry (géré par BullMQ backoff)
    throw new RateLimitException('Apollo rate limit reached');
  }
}
```

---

## Monitoring de la santé des queues

### Bull Board

Bull Board est le dashboard de monitoring des queues BullMQ, accessible en interne sur le port 3003.

**Configuration**

```typescript
// bull-board.module.ts
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';

@Module({
  imports: [
    BullBoardModule.forRoot({
      route: '/bull-board',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature({
      name: 'enrichisseur-pipeline',
    }),
    BullBoardModule.forFeature({
      name: 'scoreur-pipeline',
    }),
    // ... toutes les queues
  ],
})
export class BullBoardSetupModule {}
```

**Sécurisation de l'accès**

```nginx
# nginx.conf — accès Bull Board restreint par IP
location /bull-board {
  allow 82.65.xxx.xxx;    # IP bureau
  allow 185.xxx.xxx.xxx;  # IP VPN
  deny all;

  proxy_pass http://localhost:3003;
  proxy_set_header Host $host;
}
```

### Métriques collectées par l'Agent 7a

```typescript
interface QueueHealthMetrics {
  queueName: string;
  timestamp: Date;

  // Volume
  waitingCount: number;       // Jobs en attente
  activeCount: number;        // Jobs en cours
  completedCount: number;     // Complétés (dernières 24h)
  failedCount: number;        // Échoués (dernières 24h)
  delayedCount: number;       // Jobs différés
  pausedCount: number;        // Jobs en pause

  // Performance
  avgProcessingTime: number;  // ms
  p95ProcessingTime: number;  // ms
  throughputPerHour: number;  // jobs/heure sur la dernière heure

  // Santé
  errorRate: number;          // failedCount / (completedCount + failedCount)
  isHealthy: boolean;         // errorRate < 0.1 && waitingCount < 50
  dlqCount: number;           // Jobs dans la DLQ
}
```

### Seuils d'alerte

```typescript
const QUEUE_ALERT_THRESHOLDS: Record<string, AlertThresholds> = {
  'enrichisseur-pipeline': {
    maxWaiting: 50,
    maxErrorRate: 0.15,
    maxAvgProcessingTime: 15000,  // 15s
  },
  'redacteur-pipeline': {
    maxWaiting: 30,
    maxErrorRate: 0.10,
    maxAvgProcessingTime: 45000,  // 45s
  },
  'dealmaker-pipeline': {
    maxWaiting: 10,
    maxErrorRate: 0.05,           // Seuil très bas — haute valeur
    maxAvgProcessingTime: 60000,  // 60s
  },
  // Default pour les autres queues
  default: {
    maxWaiting: 100,
    maxErrorRate: 0.20,
    maxAvgProcessingTime: 30000,
  },
};

// Vérification horaire dans Agent 7c
async function checkQueueHealth(metrics: QueueHealthMetrics[]): Promise<void> {
  for (const metric of metrics) {
    const thresholds =
      QUEUE_ALERT_THRESHOLDS[metric.queueName] ??
      QUEUE_ALERT_THRESHOLDS.default;

    if (metric.waitingCount > thresholds.maxWaiting) {
      await alertService.send('queue_backlog', {
        queue: metric.queueName,
        waiting: metric.waitingCount,
        threshold: thresholds.maxWaiting,
      });
    }

    if (metric.errorRate > thresholds.maxErrorRate) {
      await alertService.send('queue_high_error_rate', {
        queue: metric.queueName,
        errorRate: metric.errorRate,
        threshold: thresholds.maxErrorRate,
      });
    }
  }
}
```

### Dashboard Metabase — KPIs pipeline

Les métriques collectées par l'Agent 7a sont exposées dans Metabase via des vues PostgreSQL dédiées :

```sql
-- Vue pour le dashboard "Santé du Pipeline"
CREATE VIEW v_pipeline_health AS
SELECT
  DATE_TRUNC('hour', occurred_at) AS hour,
  agent,
  event_type,
  COUNT(*) AS event_count,
  AVG((payload->>'processingTime')::numeric) AS avg_processing_ms,
  SUM(CASE WHEN event_type = 'job_failed' THEN 1 ELSE 0 END) AS failures,
  SUM(CASE WHEN event_type = 'job_completed' THEN 1 ELSE 0 END) AS successes
FROM lead_events
WHERE occurred_at > NOW() - INTERVAL '7 days'
GROUP BY 1, 2, 3;

-- Vue pour le dashboard "Conversion"
CREATE VIEW v_conversion_funnel AS
SELECT
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) FILTER (WHERE status != 'detected') AS leads_entered_pipeline,
  COUNT(*) FILTER (WHERE score IS NOT NULL) AS leads_scored,
  COUNT(*) FILTER (WHERE score >= 60) AS leads_qualified,
  COUNT(*) FILTER (WHERE status IN ('tracking', 'dealing', 'won', 'customer')) AS leads_contacted,
  COUNT(*) FILTER (WHERE status IN ('dealing', 'won', 'customer')) AS leads_in_deal,
  COUNT(*) FILTER (WHERE status IN ('won', 'customer')) AS deals_won
FROM leads
GROUP BY 1
ORDER BY 1 DESC;
```

### Alertes et notifications

```typescript
// alertService — centralisé pour tous les agents
@Injectable()
export class AlertService {
  async send(type: AlertType, context: Record<string, unknown>): Promise<void> {
    const alert = {
      type,
      severity: this.getSeverity(type),
      context,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    };

    // Toujours logger
    this.logger.warn(`ALERT [${type}]`, context);

    // Slack pour les alertes medium+
    if (alert.severity !== 'low') {
      await this.slackClient.sendMessage({
        channel: '#alerts-pipeline',
        text: this.formatSlackMessage(alert),
      });
    }

    // PagerDuty pour les alertes critiques uniquement
    if (alert.severity === 'critical') {
      await this.pagerduty.createIncident(alert);
    }

    // Toujours persister en DB pour l'Agent 7
    await this.alertRepository.save(alert);
  }

  private getSeverity(type: AlertType): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<AlertType, 'low' | 'medium' | 'high' | 'critical'> = {
      'dlq_new_entry': 'high',
      'queue_backlog': 'medium',
      'queue_high_error_rate': 'high',
      'claude_latency_spike': 'medium',
      'apollo_circuit_open': 'medium',
      'linkedin_rate_limit': 'medium',
      'database_slow_query': 'high',
      'redis_memory_high': 'critical',
      'lead_rescore_limit': 'low',
    };
    return severityMap[type] ?? 'low';
  }
}
```
