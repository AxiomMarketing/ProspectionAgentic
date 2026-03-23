# Architecture — Orchestration des Agents

## Table des matières

1. [Vue d'ensemble de l'orchestration](#vue-densemble-de-lorchestration)
2. [Agent 1 — Veilleur](#agent-1--veilleur)
3. [Agent 2 — Enrichisseur](#agent-2--enrichisseur)
4. [Agent 3 — Scoreur](#agent-3--scoreur)
5. [Agent 4 — Rédacteur](#agent-4--rédacteur)
6. [Agent 5 — Suiveur](#agent-5--suiveur)
7. [Agent 6 — Nurtureur](#agent-6--nurtureur)
8. [Agent 7 — Analyste](#agent-7--analyste)
9. [Agent 8 — Dealmaker](#agent-8--dealmaker)
10. [Agent 9 — Appels d'Offres](#agent-9--appels-doffres)
11. [Agent 10 — CSM](#agent-10--csm)
12. [Patterns de communication inter-agents](#patterns-de-communication-inter-agents)
13. [Pattern Maître → Sous-agent](#pattern-maître--sous-agent)
14. [Gestion des erreurs](#gestion-des-erreurs)

---

## Vue d'ensemble de l'orchestration

### Principe de coordination

Chaque agent maître est un module NestJS indépendant. Il orchestre ses propres sous-agents via un dispatcher interne, et communique avec les autres agents maîtres exclusivement via des queues BullMQ. Les sous-agents ne sont jamais exposés directement à l'extérieur du module.

```
┌─────────────────────────────────────────────────────┐
│                  MODULE AGENT N                      │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │             AgentNService (Maître)            │   │
│  │  - Consomme queue entrante                   │   │
│  │  - Dispatche vers sous-agents                │   │
│  │  - Agrège les résultats                      │   │
│  │  - Publie dans queue sortante                │   │
│  └──────────────────────────────────────────────┘   │
│          │            │            │                 │
│    ┌─────▼──┐   ┌─────▼──┐  ┌─────▼──┐             │
│    │Sub Na  │   │Sub Nb  │  │Sub Nc  │             │
│    │Service │   │Service │  │Service │             │
│    └────────┘   └────────┘  └────────┘             │
│                                                      │
│  Queue IN ──► Module ──► Queue OUT                  │
└─────────────────────────────────────────────────────┘
```

### Modèle de données partagé

Tous les agents opèrent sur une entité centrale `Lead` persistée en PostgreSQL. Chaque agent enrichit cette entité avec ses résultats :

```typescript
interface Lead {
  id: string;                      // UUID
  sourceId: string;                // ID unique source
  status: LeadStatus;              // pipeline stage actuel
  score: number | null;            // rempli par Agent 3
  rawData: Record<string, any>;    // données brutes Agent 1
  enrichedData: EnrichedData;      // données Agent 2
  messages: Message[];             // données Agent 4
  tracking: TrackingData;          // données Agent 5
  dealId: string | null;           // lien Agent 8
  csmId: string | null;            // lien Agent 10
  createdAt: Date;
  updatedAt: Date;
}

type LeadStatus =
  | 'detected'
  | 'enriching'
  | 'scoring'
  | 'nurturing'
  | 'drafting'
  | 'tracking'
  | 'dealing'
  | 'won'
  | 'lost'
  | 'customer';
```

---

## Agent 1 — Veilleur

### Rôle

Surveiller en continu les sources de leads B2B pour détecter de nouveaux prospects. C'est le point d'entrée du pipeline. Il ne fait aucun jugement de valeur sur les leads — son seul objectif est la détection et la normalisation.

### Sous-agents

| ID | Nom | Source | Méthode | Fréquence |
|----|-----|--------|---------|-----------|
| 1a | LinkedIn Veilleur | LinkedIn Sales Navigator | API officielle + scraping | Toutes les 2h |
| 1b | Marchés Veilleur | BOAMP, TED, AWS Marchés | API REST + scraping | Toutes les 4h |
| 1c | Web Veilleur | Google Alerts, mentions, news | RSS + scraping | Toutes les 3h |
| 1d | Jobs Veilleur | LinkedIn Jobs, Indeed, Welcome to the Jungle | API + scraping | Toutes les 6h |

### Scheduling

```typescript
// Cron expressions dans VeilleurScheduler
@Cron('0 */2 * * *')   // Sous-agent 1a : toutes les 2h
async runLinkedInScan() {}

@Cron('0 */4 * * *')   // Sous-agent 1b : toutes les 4h
async runMarchesScan() {}

@Cron('0 */3 * * *')   // Sous-agent 1c : toutes les 3h
async runWebScan() {}

@Cron('0 */6 * * *')   // Sous-agent 1d : toutes les 6h
async runJobsScan() {}
```

### Budget Claude API

L'Agent 1 n'utilise pas Claude API directement. Il peut utiliser un LLM léger (gpt-3.5-turbo ou claude-haiku) pour la normalisation de données non structurées scrappées.

- Budget : ~500 tokens/lead pour la normalisation
- Coût estimé : < $0.001/lead

### APIs clés

| Service | Usage | Rate limit |
|---------|-------|-----------|
| LinkedIn Sales Navigator | Recherche, profils | 100 req/h |
| BOAMP API | Appels d'offres publics | Illimité |
| TED (UE) | Marchés européens | Illimité |
| Google News API | Signaux d'actualité | 100 req/jour (free tier) |
| Puppeteer/Playwright | Scraping fallback | Géré manuellement |

### Sortie

Chaque lead détecté produit un `RawLead` publié dans la queue `enrichisseur-pipeline` :

```typescript
interface RawLead {
  sourceId: string;        // ID unique dans la source
  source: LeadSource;      // 'linkedin' | 'marches' | 'web' | 'jobs'
  url: string;             // URL de la source
  rawContent: string;      // Contenu brut extrait
  detectedAt: Date;
  subAgent: '1a' | '1b' | '1c' | '1d';
  metadata: Record<string, string>;
}
```

### Déduplification

```typescript
// JobId déterministe — empêche le double traitement
const jobId = `veilleur:${lead.source}:${createHash('sha256')
  .update(lead.sourceId)
  .digest('hex')
  .slice(0, 16)}`;
```

---

## Agent 2 — Enrichisseur

### Rôle

Transformer un `RawLead` en profil complet en interrogeant plusieurs APIs d'enrichissement. L'Agent 2 est le consommateur de `enrichisseur-pipeline` et le producteur de `scoreur-pipeline`.

### Sous-agents

| ID | Nom | Sources | Données produites |
|----|-----|---------|------------------|
| 2a | Contact Enrichisseur | Apollo.io, Clearbit Person, LinkedIn | Email pro, téléphone, poste, historique |
| 2b | Entreprise Enrichisseur | Clearbit Company, Société.com, Pappers | CA, effectif, statut juridique, dirigeants |
| 2c | Technique Enrichisseur | BuiltWith, Wappalyzer, Shodan | Stack tech, CMS, CRM, outils marketing |

### Scheduling

L'Agent 2 est déclenché uniquement par la queue — pas de cron. Il traite les jobs en concurrence contrôlée (max 5 simultanés) pour respecter les rate limits des APIs.

```typescript
@Processor('enrichisseur-pipeline', {
  concurrency: 5,
})
export class EnrichisseurProcessor extends WorkerHost {}
```

### Budget Claude API

Claude est utilisé pour :
- Extraire et structurer des données depuis du HTML mal formé
- Normaliser les titres de poste (ex: "VP Sales EMEA" → `{ role: 'vp_sales', region: 'emea' }`)

Budget : ~1 000 tokens/lead — Coût estimé : ~$0.003/lead

### APIs clés

| Service | Usage | Rate limit | Fallback |
|---------|-------|-----------|---------|
| Apollo.io | Email, poste, numéro | 600 req/h | Clearbit |
| Clearbit | Entreprise, contact | 100 req/h | Pappers |
| Pappers.fr | Données légales FR | 100 req/j (free) | Société.com |
| BuiltWith | Stack technique | 50 req/j (free) | Wappalyzer |
| Hunter.io | Vérification email | 100 req/mois | - |

### Stratégie de fallback

```
Apollo disponible ? → Utiliser Apollo pour contact
└── Non → Clearbit Person → Hunter.io → données LinkedIn brutes uniquement

Clearbit disponible ? → Utiliser Clearbit pour entreprise
└── Non → Pappers API → Société.com scraping → données brutes LinkedIn
```

### Sortie

```typescript
interface EnrichedLead {
  // Contact
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string;
  jobTitle: string;
  jobLevel: 'c_suite' | 'vp' | 'director' | 'manager' | 'individual';
  department: string;

  // Entreprise
  companyName: string;
  companySiren: string | null;
  companySize: CompanySize;        // '1-10' | '11-50' | '51-200' | ...
  companyRevenue: RevenueRange | null;
  companyIndustry: string;
  companyLinkedinUrl: string;
  companyWebsite: string;

  // Technique
  techStack: string[];             // ['Salesforce', 'HubSpot', 'AWS', ...]
  hasTargetTech: boolean;          // technos cibles détectées
  cms: string | null;
  crm: string | null;

  // Enrichment metadata
  enrichmentSources: string[];
  enrichmentScore: number;         // qualité des données 0-100
  enrichedAt: Date;
}
```

---

## Agent 3 — Scoreur

### Rôle

Attribuer un score de 0 à 100 à chaque lead enrichi selon trois dimensions : adéquation ICP, signaux d'intention d'achat et timing contextuel. C'est le seul agent sans sous-agents — sa logique est monolithique et déterministe.

### Architecture (monolithique)

```typescript
@Injectable()
export class ScoreurService {
  async score(lead: EnrichedLead): Promise<ScoredLead> {
    const icpScore    = this.computeIcpScore(lead);      // 0-40 pts
    const intentScore = this.computeIntentScore(lead);   // 0-30 pts
    const timingScore = this.computeTimingScore(lead);   // 0-30 pts

    const total = icpScore + intentScore + timingScore;

    return {
      ...lead,
      score: total,
      scoreBreakdown: { icpScore, intentScore, timingScore },
      scoredAt: new Date(),
      recommendation: total >= 60 ? 'contact_now' : 'nurture',
    };
  }
}
```

### Grille de scoring ICP (0-40 pts)

| Critère | Poids | Logique |
|---------|-------|---------|
| Secteur cible | 15 pts | Score sectoriel 0-15 selon matrice ICP |
| Taille entreprise | 10 pts | 51-200 = 10, 201-500 = 8, <50 = 5 |
| Technologie cible détectée | 10 pts | Stack compatible = 10, neutre = 5, incompatible = 0 |
| Zone géographique | 5 pts | France = 5, EMEA = 3, Autre = 1 |

### Grille de scoring Intent (0-30 pts)

| Critère | Poids | Source |
|---------|-------|--------|
| Recrutement poste tech/digital | 10 pts | Agent 1d (Jobs) |
| Appel d'offres récent | 10 pts | Agent 1b (Marchés) |
| Mention dans actualité | 5 pts | Agent 1c (Web) |
| Croissance récente (levée, expansion) | 5 pts | Clearbit |

### Grille de scoring Timing (0-30 pts)

| Critère | Poids | Source |
|---------|-------|--------|
| Signal détecté < 7 jours | 15 pts | `detectedAt` |
| Signal détecté < 30 jours | 10 pts | `detectedAt` |
| Signal détecté < 90 jours | 5 pts | `detectedAt` |
| Changement de poste < 6 mois | 10 pts | LinkedIn |
| Budget Q4 (oct-déc) | 5 pts | Calendrier |

### Scheduling

Déclenché uniquement par la queue `scoreur-pipeline`. Aucun cron. Concurrence max : 10 (calcul CPU uniquement, sans appels externes).

### Budget Claude API

Claude est utilisé pour :
- Analyser des signaux textuels ambigus (ex: interpréter une offre d'emploi)
- Justifier le score en langage naturel pour l'export

Budget : ~2 000 tokens/lead — Coût estimé : ~$0.006/lead

### Routage post-score

```typescript
if (score >= 60) {
  await this.redacteurQueue.add('draft', scoredLead, {
    priority: Math.floor(score / 10), // priorité 6-10
  });
} else {
  await this.nurtureurQueue.add('nurture', scoredLead, {
    delay: 0,
  });
}
```

---

## Agent 4 — Rédacteur

### Rôle

Générer des messages de prospection hautement personnalisés pour chaque lead qualifié (score >= 60), sur les canaux email et LinkedIn, en s'appuyant sur toutes les données enrichies disponibles.

### Sous-agents

| ID | Nom | Canal | Modèle Claude | Output |
|----|-----|-------|---------------|--------|
| 4a | Email Rédacteur | Email (Lemlist) | claude-3-5-sonnet | Email texte 150-200 mots, objet + corps |
| 4b | LinkedIn Rédacteur | LinkedIn Sales Nav | claude-3-5-sonnet | Message InMail 300 caractères max |
| 4c | Impact Rédacteur | Transverse | claude-3-5-sonnet | Cas d'usage + ROI estimé |

### Scheduling

Queue `redacteur-pipeline`, concurrence max 3 (contrainte rate limit Claude). Timeout par job : 60 secondes.

### Budget Claude API

C'est l'agent le plus consommateur en tokens :

| Sous-agent | Tokens input | Tokens output | Coût/lead |
|-----------|-------------|--------------|-----------|
| 4a Email | 3 000 | 500 | ~$0.010 |
| 4b LinkedIn | 2 000 | 200 | ~$0.006 |
| 4c Impact | 2 500 | 800 | ~$0.008 |
| **Total** | **7 500** | **1 500** | **~$0.024** |

### Prompt engineering

Les prompts suivent une structure stricte pour garantir la cohérence :

```
[CONTEXTE COMMERCIAL]
Tu rédiges pour une agence [DESCRIPTION AGENCE].

[PROFIL LEAD]
- Prénom/Nom : {firstName} {lastName}
- Poste : {jobTitle} chez {companyName}
- Secteur : {industry}
- Stack tech : {techStack}
- Signal détecté : {triggerEvent}

[CONTRAINTES]
- Longueur : 150-200 mots maximum
- Ton : professionnel mais direct, pas de jargon
- Personnalisation : mentionner {specificDetail} dès la première phrase
- CTA : une seule question ouverte en fin de message
- Interdits : "solution", "synergie", "valeur ajoutée"

[FORMAT DE SORTIE]
JSON strict : { subject: string, body: string, personalizationScore: number }
```

### APIs clés

| Service | Usage |
|---------|-------|
| Claude API (Anthropic) | Génération des messages |
| Lemlist API | Templates et variables de fusion |

### Sortie

```typescript
interface DraftedLead {
  emailMessage: {
    subject: string;
    body: string;
    personalizationScore: number;  // 0-100
  };
  linkedinMessage: {
    body: string;
    personalizationScore: number;
  };
  impactStatement: {
    useCase: string;
    estimatedRoi: string;
    relevantCaseStudy: string | null;
  };
  draftedAt: Date;
}
```

---

## Agent 5 — Suiveur

### Rôle

Envoyer les messages rédigés par l'Agent 4, surveiller les réponses, analyser l'engagement et gérer les séquences de relance. Il est le pont entre la génération de contenu et l'activité commerciale réelle.

### Sous-agents

| ID | Nom | Rôle | Déclencheur |
|----|-----|------|-------------|
| 5a | Email Suiveur | Envoie emails via Lemlist, gère les bounces | Job queue |
| 5b | LinkedIn Suiveur | Envoie messages InMail via Sales Navigator | Job queue |
| 5c | Réponses Suiveur | Analyse les réponses entrantes (webhook) | Webhook n8n |
| 5d | Séquences Suiveur | Gère J+3, J+7, J+14 si pas de réponse | Cron quotidien |

### Scheduling

```typescript
// 5a et 5b : déclenchés par queue
@Processor('suiveur-pipeline')

// 5c : déclenché par webhook Lemlist via n8n
@Post('/webhook/lemlist')
async handleEmailReply(payload: LemlistWebhookPayload) {}

// 5d : cron quotidien à 9h pour les relances
@Cron('0 9 * * 1-5')  // lun-ven à 9h
async processSequences() {}
```

### Compliance LinkedIn

Le sous-agent 5b respecte les limites LinkedIn pour éviter la restriction du compte :

```typescript
const LINKEDIN_LIMITS = {
  messagesPerDay: 20,
  connectionsPerDay: 15,
  inMailsPerMonth: 150,
};

// Rate limiter BullMQ
await linkedinQueue.add('send', payload, {
  limiter: {
    max: 20,
    duration: 24 * 60 * 60 * 1000,  // 24h
  },
});
```

### Analyse des réponses (5c)

Le sous-agent 5c classifie automatiquement chaque réponse :

```typescript
type ResponseCategory =
  | 'positive_interest'    // → dealmaker-pipeline
  | 'request_info'         // → rédiger réponse informative
  | 'not_now'              // → nurture dans 3 mois
  | 'wrong_person'         // → enrichir avec bon contact
  | 'unsubscribe'          // → blacklister définitivement
  | 'out_of_office'        // → relancer à la date de retour
  | 'negative'             // → marquer lost, arrêter séquence
  | 'unknown';             // → revue manuelle
```

### Séquences de relance (5d)

```
J+0  : Message initial (Agent 4)
J+3  : Relance légère si pas de réponse (valeur ajoutée)
J+7  : Relance avec angle différent (cas client)
J+14 : Relance finale avec sortie propre
J+14 : Si pas de réponse → nurturer-pipeline avec tag 'séquence_complète'
```

### Budget Claude API

Claude est utilisé par 5c pour la classification des réponses ambiguës.

Budget : ~500 tokens/réponse — Coût estimé : ~$0.0015/réponse

---

## Agent 6 — Nurtureur

### Rôle

Entretenir la relation avec les leads de score < 60 ou ayant complété une séquence de prospection sans réponse positive. L'objectif est de maintenir la présence de marque jusqu'à ce que le lead soit prêt à être recontacté.

### Sous-agents

| ID | Nom | Rôle | Fréquence |
|----|-----|------|-----------|
| 6a | Email Nurture | Séquences email éducatives longue durée | 1 email/2 semaines |
| 6b | LinkedIn Passif | Likes, commentaires, suivis de profil | 2-3 actions/semaine |
| 6c | Re-Scoreur | Recalcule le score régulièrement | Hebdomadaire |

### Scheduling

```typescript
// 6a : séquences email (déclenchement par queue, rythme géré par Lemlist)
@Processor('nurturer-pipeline')

// 6b : actions LinkedIn passives, 3x/semaine
@Cron('0 10 * * 1,3,5')
async runLinkedInPassive() {}

// 6c : re-scoring hebdomadaire
@Cron('0 8 * * 1')  // lundi matin
async reScoreNurtureLeads() {}
```

### Feedback loop avec l'Agent 3

Le sous-agent 6c est le seul composant du système qui renvoie des jobs vers un agent amont. Quand le re-score dépasse 60, le lead réintègre le pipeline principal :

```typescript
// 6c : re-score puis routage conditionnel
const newScore = await this.scoreurService.reScore(lead);

if (newScore >= 60) {
  // Quitter le nurture → rejoindre le pipeline principal
  await this.redacteurQueue.add('draft', {
    ...lead,
    score: newScore,
    reEntryReason: 'nurture_rescore',
    previousNurtureDays: daysDiff(lead.nurturingStartedAt, new Date()),
  });

  // Arrêter les séquences nurture en cours
  await this.lemlist.pauseSequence(lead.lemlistSequenceId);
}
```

### Budget Claude API

Claude est utilisé pour la rédaction des emails de nurture (6a).

Budget : ~3 000 tokens/email — Coût estimé : ~$0.009/email (~$0.018/lead/mois)

### APIs clés

| Service | Usage |
|---------|-------|
| Lemlist | Séquences nurture email |
| LinkedIn Sales Navigator | Actions passives |
| Claude API | Rédaction contenu nurture |

---

## Agent 7 — Analyste

### Rôle

Collecter les métriques du pipeline, produire des rapports périodiques, détecter les anomalies et formuler des recommandations pour améliorer les performances du système. L'Agent 7 est en lecture seule sur la base de données.

### Sous-agents

| ID | Nom | Rôle | Fréquence |
|----|-----|------|-----------|
| 7a | Collecteur | Agrège métriques temps réel depuis PostgreSQL | Continu (5 min) |
| 7b | Rapports | Génère rapports hebdo/mensuel | Cron |
| 7c | Anomalies | Détecte déviation des KPIs | Toutes les heures |
| 7d | Recommandeur | Propose ajustements scoring/prompts | Hebdomadaire |

### Scheduling

```typescript
@Cron('*/5 * * * *')         // 7a : toutes les 5 minutes
async collectMetrics() {}

@Cron('0 7 * * 1')           // 7b : rapport hebdo lundi 7h
async generateWeeklyReport() {}

@Cron('0 1 1 * *')           // 7b : rapport mensuel 1er du mois 1h
async generateMonthlyReport() {}

@Cron('0 * * * *')           // 7c : anomalies toutes les heures
async detectAnomalies() {}

@Cron('0 8 * * 2')           // 7d : recommandations mardi 8h
async generateRecommendations() {}
```

### KPIs collectés

```typescript
interface PipelineMetrics {
  // Volume
  leadsDetectedToday: number;
  leadsEnrichedToday: number;
  leadsScoredToday: number;
  leadsSentToday: number;

  // Qualité
  averageScore: number;
  averageEnrichmentQuality: number;
  averagePersonalizationScore: number;

  // Conversion
  openRate: number;             // emails ouverts / envoyés
  replyRate: number;            // réponses / envoyés
  positiveReplyRate: number;    // réponses positives / réponses
  meetingRate: number;          // RDV obtenus / positives

  // Santé du système
  queueDepths: Record<string, number>;
  failedJobsLast24h: number;
  apiErrorRates: Record<string, number>;
  avgProcessingTimeByAgent: Record<string, number>;
}
```

### Détection d'anomalies (7c)

```typescript
const ANOMALY_THRESHOLDS = {
  replyRateDrop: 0.3,        // baisse de 30% du taux de réponse
  enrichmentFailRate: 0.2,   // 20% d'échecs enrichissement
  queueDepthSpike: 100,      // > 100 jobs en attente
  claudeLatencySpike: 30000, // > 30s de latence Claude
  dailyLeadsDrop: 0.5,       // 50% moins de leads que la moyenne
};
```

### Budget Claude API

Claude est utilisé pour la rédaction des rapports et recommandations (7b, 7d).

Budget : ~5 000 tokens/rapport — Coût estimé : ~$0.015/rapport

---

## Agent 8 — Dealmaker

### Rôle

Gérer la phase commerciale une fois qu'un prospect a exprimé un intérêt positif. Il produit les devis, gère les relances commerciales et prépare les dossiers de signature.

### Sous-agents

| ID | Nom | Rôle | Déclencheur |
|----|-----|------|-------------|
| 8a | Devis | Génère devis personnalisés (PDF + JSON) | Événement : réponse positive |
| 8b | Relances | Gère les relances commerciales post-devis | Cron + événements |
| 8c | Signature | Prépare et envoie dossiers de signature | Événement : accord verbal |

### Scheduling

```typescript
// 8a : déclenché par événement 'positive_reply' de l'Agent 5c
@OnEvent('lead.positive_reply')
async handlePositiveReply(event: PositiveReplyEvent) {}

// 8b : relances quotidiennes
@Cron('0 14 * * 1-5')  // 14h du lundi au vendredi
async processFollowUps() {}

// 8c : déclenché par événement
@OnEvent('deal.verbal_agreement')
async handleVerbalAgreement(event: DealEvent) {}
```

### Feedback loop avec l'Agent 10

L'Agent 8 reçoit des signaux d'upsell de l'Agent 10 (CSM). Ces signaux déclenchent la création d'un nouveau deal pour un client existant :

```typescript
@OnEvent('csm.upsell_signal')
async handleUpsellSignal(event: UpsellSignalEvent) {
  // Créer un nouveau deal de type 'upsell'
  await this.dealmakerQueue.add('new_deal', {
    type: 'upsell',
    clientId: event.clientId,
    currentMrr: event.currentMrr,
    upsellOpportunity: event.opportunity,
    triggerReason: event.reason,
  });
}
```

### Budget Claude API

Claude est utilisé pour la rédaction des devis (8a) et des emails commerciaux (8b).

Budget : ~10 000 tokens/deal — Coût estimé : ~$0.030/deal

### APIs clés

| Service | Usage |
|---------|-------|
| Claude API | Rédaction devis et emails commerciaux |
| DocuSign / YouSign | Signature électronique (8c) |
| Stripe | Facturation (optionnel) |

---

## Agent 9 — Appels d'Offres

### Rôle

Gérer la réponse aux marchés publics (appels d'offres) de façon quasi-autonome. C'est l'agent le plus complexe du système, avec le plus de sous-agents et le plus grand consommateur de tokens Claude (analyse de DCE complets).

### Sous-agents

| ID | Nom | Rôle |
|----|-----|------|
| 9a | DCE Analyseur | Télécharge et analyse le Dossier de Consultation des Entreprises |
| 9b | Qualificateur | Évalue la pertinence de l'AO (Go/No-Go) |
| 9c | Juriste | Analyse les clauses contractuelles et les risques juridiques |
| 9d | Chiffreur | Estime le coût de réalisation et calcule le prix de vente |
| 9e | Rédacteur Mémoire | Rédige le mémoire technique de réponse |
| 9f | QA | Vérifie la complétude et la conformité de la réponse |
| 9g | Moniteur | Surveille les nouvelles publications d'AO |

### Pipeline interne Agent 9

```
9g détecte AO → 9a télécharge DCE → 9b qualifie (Go/No-Go)
                                              │
                               No-Go ─────────┘  Stop
                               Go ──────────────────────────────┐
                                                                 │
                               9c analyse juridique             │
                               9d chiffre le projet             │
                               (en parallèle)                   │
                                     │                          │
                               9e rédige mémoire                │
                                     │                          │
                               9f QA et corrections             │
                                     │                          │
                               Dépôt dossier complet ◄──────────┘
```

### Scheduling

```typescript
// 9g : surveillance des nouvelles publications
@Cron('0 6 * * 1-5')   // lundi-vendredi à 6h
async monitorNewAOs() {}

// Délai de traitement : 5 jours avant la date limite
// Si délai < 5 jours : alerter un humain
```

### Budget Claude API

L'Agent 9 est le plus coûteux en tokens. Un DCE peut faire 200+ pages.

| Sous-agent | Tokens estimés | Coût estimé |
|-----------|----------------|------------|
| 9a DCE Analyseur | 100 000 | ~$0.30 |
| 9b Qualificateur | 5 000 | ~$0.015 |
| 9c Juriste | 20 000 | ~$0.060 |
| 9d Chiffreur | 10 000 | ~$0.030 |
| 9e Rédacteur Mémoire | 30 000 | ~$0.090 |
| 9f QA | 10 000 | ~$0.030 |
| **Total par AO** | **~175 000** | **~$0.525** |

### APIs clés

| Service | Usage |
|---------|-------|
| BOAMP API | Publications AO français |
| TED (UE) | Publications AO européens |
| AWS Marchés | Portail achats |
| Claude API (claude-3-5-sonnet, 200K context) | Analyse DCE, rédaction mémoire |
| DocuSign | Signature dossier |

---

## Agent 10 — CSM

### Rôle

Assurer le succès client après la signature, maximiser la rétention, identifier les opportunités d'upsell et transformer les clients satisfaits en ambassadeurs générateurs de nouveaux leads.

### Sous-agents

| ID | Nom | Rôle | Fréquence |
|----|-----|------|-----------|
| 10a | Onboarding | Coordonne l'intégration du nouveau client | J+0 à J+30 |
| 10b | Upsell | Détecte les signaux d'expansion | Mensuel |
| 10c | Satisfaction | Mesure le NPS et la satisfaction | Trimestriel |
| 10d | Avis | Collecte avis Google/Trustpilot | Post-satisfaction positive |
| 10e | Referral | Programme de parrainage | Post-NPS >= 8 |

### Scheduling

```typescript
// 10a : séquence d'onboarding déclenchée par csm-onboarding queue
@Processor('csm-onboarding')

// 10b : analyse upsell mensuelle
@Cron('0 9 1 * *')
async analyzeUpsellOpportunities() {}

// 10c : NPS trimestriel (1er du trimestre)
@Cron('0 10 1 1,4,7,10 *')
async sendNpsSurvey() {}

// 10d : collecte avis 7 jours après NPS >= 8
// Déclenché par événement nps.score_received

// 10e : programme referral déclenché par événement nps.score_received (>= 8)
@OnEvent('nps.score_received')
async handleNpsScore(event: NpsEvent) {
  if (event.score >= 8) {
    await this.avisAgent.requestReview(event.clientId);
    await this.referralAgent.activateProgram(event.clientId);
  }
}
```

### Feedback loops

L'Agent 10 est la source de deux boucles de rétroaction importantes :

```typescript
// Feedback 1 : Signal upsell → Agent 8
await this.eventEmitter.emit('csm.upsell_signal', {
  clientId: client.id,
  currentMrr: client.mrr,
  opportunity: 'additional_licenses',
  reason: 'team_growth_detected',
  confidence: 0.85,
});

// Feedback 2 : Leads referral → Agent 1
await this.veilleurQueue.add('referral_lead', {
  source: 'referral',
  referrerId: client.id,
  referredCompany: referral.companyName,
  referredContact: referral.contactName,
  subAgent: '1a',  // Traité comme un lead LinkedIn
  highPriority: true,  // Score boosté de +15 pts
});
```

### Budget Claude API

Claude est utilisé pour la rédaction des emails d'onboarding (10a) et des rapports NPS (10c).

Budget : ~5 000 tokens/client/mois — Coût estimé : ~$0.015/client/mois

---

## Patterns de communication inter-agents

### Pattern 1 — Pipeline séquentiel (principal)

```
Agent A ──publish──► Queue ──consume──► Agent B
```

Utilisé pour : Veilleur → Enrichisseur → Scoreur → Rédacteur → Suiveur

```typescript
// Producteur
await this.nextQueue.add('process', payload, {
  jobId: generateJobId(payload),
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
});

// Consommateur
@Process('process')
async handle(job: Job<Payload>): Promise<void> {
  const result = await this.processLead(job.data);
  await this.publishNext(result);
}
```

### Pattern 2 — Événements NestJS (intra-processus)

```
Agent A ──emit──► EventEmitter ──listen──► Agent B
```

Utilisé pour : réponses positives, signaux upsell, NPS

```typescript
// Émetteur
this.eventEmitter.emit('lead.positive_reply', {
  leadId: lead.id,
  responseText: reply.text,
  channel: 'email',
});

// Écouteur
@OnEvent('lead.positive_reply')
async handlePositiveReply(event: PositiveReplyEvent) {}
```

### Pattern 3 — Webhooks entrants (via n8n)

```
Service externe ──webhook──► n8n ──HTTP POST──► NestJS API ──► Queue
```

Utilisé pour : réponses Lemlist, engagement LinkedIn, signatures

```typescript
// Controller NestJS qui reçoit de n8n
@Post('/internal/webhook/lemlist-reply')
@UseGuards(InternalApiKeyGuard)
async handleLemlistReply(@Body() payload: LemlistWebhookDto) {
  await this.suiveurQueue.add('process-reply', payload);
}
```

### Pattern 4 — Feedback loops (remontée amont)

```
Agent N ──publish──► Queue amont ──consume──► Agent M (M < N)
```

Utilisé pour : 6c → 3 (re-score), 10e → 1 (referral leads), 10b → 8 (upsell)

La contrainte est que le feedback ne crée jamais de cycle infini — il y a toujours une condition de sortie.

---

## Pattern Maître → Sous-agent

### Structure du module

```typescript
@Module({
  imports: [
    BullModule.registerQueue({ name: 'enrichisseur-pipeline' }),
    BullModule.registerQueue({ name: 'scoreur-pipeline' }),
  ],
  providers: [
    EnrichisseurMaitreService,     // Orchestrateur
    ContactEnrichisseurService,    // Sous-agent 2a
    EntrepriseEnrichisseurService, // Sous-agent 2b
    TechniqueEnrichisseurService,  // Sous-agent 2c
    EnrichisseurProcessor,         // Consumer BullMQ
  ],
})
export class EnrichisseurModule {}
```

### Orchestration interne

```typescript
@Injectable()
export class EnrichisseurMaitreService {
  constructor(
    private readonly contact: ContactEnrichisseurService,
    private readonly entreprise: EntrepriseEnrichisseurService,
    private readonly technique: TechniqueEnrichisseurService,
  ) {}

  async enrich(rawLead: RawLead): Promise<EnrichedLead> {
    // Exécution en parallèle des sous-agents
    const [contactData, companyData, techData] = await Promise.allSettled([
      this.contact.enrich(rawLead),
      this.entreprise.enrich(rawLead),
      this.technique.enrich(rawLead),
    ]);

    // Agrégation avec gestion des échecs partiels
    return this.aggregate(rawLead, contactData, companyData, techData);
  }

  private aggregate(
    raw: RawLead,
    contact: PromiseSettledResult<ContactData>,
    company: PromiseSettledResult<CompanyData>,
    tech: PromiseSettledResult<TechData>,
  ): EnrichedLead {
    return {
      ...raw,
      // Graceful degradation : utiliser null si sous-agent échoue
      contact: contact.status === 'fulfilled' ? contact.value : null,
      company: company.status === 'fulfilled' ? company.value : null,
      tech: tech.status === 'fulfilled' ? tech.value : null,
      enrichmentSources: this.extractSources(contact, company, tech),
      enrichmentScore: this.computeEnrichmentScore(contact, company, tech),
    };
  }
}
```

---

## Gestion des erreurs

### Circuit Breaker

Chaque appel vers une API externe est protégé par un circuit breaker (pattern via `@nestjs/circuitbreaker` ou `opossum`).

```typescript
const apolloBreaker = new CircuitBreaker(apolloApiCall, {
  timeout: 10000,         // 10s de timeout
  errorThresholdPercentage: 50,  // 50% d'erreurs → open
  resetTimeout: 60000,    // Réessayer après 60s
});

apolloBreaker.on('open', () => {
  this.logger.warn('Circuit Apollo ouvert — fallback activé');
  this.alertService.send('apollo_circuit_open');
});
```

### Retry avec backoff exponentiel

```typescript
// Configuration BullMQ par queue
const RETRY_CONFIG = {
  'enrichisseur-pipeline': {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },  // 2s, 4s, 8s, 16s, 32s
  },
  'redacteur-pipeline': {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },  // 5s, 10s, 20s
  },
  'suiveur-pipeline': {
    attempts: 3,
    backoff: { type: 'fixed', delay: 30000 },        // 30s fixe (rate limits)
  },
};
```

### Dead Letter Queue (DLQ)

Tous les jobs ayant épuisé leurs tentatives sont déplacés vers une DLQ dédiée pour revue manuelle :

```typescript
// Écouter les événements d'échec final
worker.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await this.dlqQueue.add('dead-letter', {
      originalQueue: job.queueName,
      originalPayload: job.data,
      failedAt: new Date(),
      error: err.message,
      stackTrace: err.stack,
      attempts: job.attemptsMade,
    });

    // Alerter l'équipe
    await this.alertService.send(`dlq_${job.queueName}`, {
      jobId: job.id,
      error: err.message,
    });
  }
});
```

### Hiérarchie des erreurs

```
Erreur transitoire (réseau, timeout)
    → Retry avec backoff → Succès
                        → Épuisement → DLQ → Alerte + revue manuelle

Erreur permanente (données invalides, 400 API)
    → Pas de retry → DLQ immédiat → Alerte + revue manuelle

Erreur de dégradation (API tierce down)
    → Circuit breaker open → Fallback (données partielles)
    → Continuer le pipeline avec données réduites

Erreur critique (PostgreSQL down, Redis down)
    → Alerte PagerDuty immédiate → Arrêt contrôlé du service
```

### Observabilité des erreurs

Toutes les erreurs sont tracées dans Langfuse avec :
- L'agent et le sous-agent concerné
- Le job ID et le payload (sans données PII)
- Le type d'erreur et la stack trace
- Le nombre de tentatives effectuées
- L'impact sur le pipeline (lead bloqué, dégradé ou perdu)
