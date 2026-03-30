# Agent 7 — ANALYSTE — Détails d'implémentation complets

**Complément à :** `07-AGENT-7-ANALYSTE.md`
**Comble les gaps identifiés par l'audit + specs détaillées des 4 sous-agents**

---

## 1. PRISMA SCHEMA — Refonte complète

### MetriquesDaily — Remplacer le modèle générique par ~60 colonnes

Le modèle actuel `MetriquesDaily` est un key-value store générique (`metricName`, `metricValue`, `dimensions`). La spec exige **~60 colonnes typées** pour le snapshot quotidien.

```prisma
model MetriquesDaily {
  id              String   @id @default(uuid())
  dateSnapshot    DateTime @unique @map("date_snapshot")

  // === Agent 1 : VEILLEUR ===
  veilleurLeadsBruts        Int     @default(0)
  veilleurLeadsLinkedin     Int     @default(0)
  veilleurLeadsMarches      Int     @default(0)
  veilleurLeadsWeb          Int     @default(0)
  veilleurLeadsJobboards    Int     @default(0)
  veilleurLeadsQualifies    Int     @default(0)
  veilleurPreScoreMoyen     Float   @default(0)
  veilleurTauxDeduplication Float   @default(0)
  veilleurCoutApiEur        Float   @default(0)

  // === Agent 2 : ENRICHISSEUR ===
  enrichisseurProspectsTraites    Int     @default(0)
  enrichisseurEmailsTrouves      Int     @default(0)
  enrichisseurEmailsNonTrouves   Int     @default(0)
  enrichisseurTauxEnrichissement Float   @default(0)
  enrichisseurTauxEmailValide    Float   @default(0)
  enrichisseurTempsMoyenMs       Int     @default(0)
  enrichisseurCoutApiEur         Float   @default(0)

  // === Agent 3 : SCOREUR ===
  scoreurProspectsScores     Int     @default(0)
  scoreurNbHot              Int     @default(0)
  scoreurNbWarm             Int     @default(0)
  scoreurNbCold             Int     @default(0)
  scoreurNbDisqualifie      Int     @default(0)
  scoreurScoreMoyen         Float   @default(0)
  scoreurPctHot             Float   @default(0)
  scoreurPctWarm            Float   @default(0)
  scoreurPctCold            Float   @default(0)
  scoreurPctDisqualifie     Float   @default(0)
  scoreurReclassifications  Int     @default(0)

  // === Agent 4 : REDACTEUR ===
  redacteurMessagesGeneres          Int     @default(0)
  redacteurCoutGenerationEur        Float   @default(0)
  redacteurTempsMoyenGenerationMs   Int     @default(0)
  redacteurTemplatesActifs          Int     @default(0)
  redacteurAbTestsEnCours           Int     @default(0)

  // === Agent 5 : SUIVEUR ===
  suiveurEmailsEnvoyes         Int     @default(0)
  suiveurLinkedinConnections   Int     @default(0)
  suiveurLinkedinMessages      Int     @default(0)
  suiveurEmailsBounced         Int     @default(0)
  suiveurBounceRate            Float   @default(0)
  suiveurReponsesTotal         Int     @default(0)
  suiveurReponsesPositives     Int     @default(0)
  suiveurReponsesNegatives     Int     @default(0)
  suiveurReponsesPasMaintenant Int     @default(0)
  suiveurReplyRate             Float   @default(0)
  suiveurPositiveReplyRate     Float   @default(0)
  suiveurSequencesActives      Int     @default(0)
  suiveurSequencesCompletees   Int     @default(0)
  suiveurSlaBreaches           Int     @default(0)
  suiveurOptOuts               Int     @default(0)
  suiveurCoutEur               Float   @default(0)

  // === Agent 6 : NURTUREUR ===
  nurtureurTotalEnNurture        Int     @default(0)
  nurtureurNouveauxEntres        Int     @default(0)
  nurtureurEmailsNurtureEnvoyes  Int     @default(0)
  nurtureurTauxOuverture         Float   @default(0)
  nurtureurTauxClic              Float   @default(0)
  nurtureurReclassifiesHot       Int     @default(0)
  nurtureurSunset                Int     @default(0)
  nurtureurOptOuts               Int     @default(0)
  nurtureurEngagementScoreMoyen  Float   @default(0)
  nurtureurCoutEur               Float   @default(0)

  // === Pipeline global ===
  pipelineLeadsGeneres          Int     @default(0)
  pipelineProspectsContactes    Int     @default(0)
  pipelineReponsesPositives     Int     @default(0)
  pipelineRdvBookes             Int     @default(0)
  pipelinePropositionsEnvoyees  Int     @default(0)
  pipelineDealsGagnes           Int     @default(0)
  pipelineDealsPerdus           Int     @default(0)
  pipelineRevenuJour            Float   @default(0)
  pipelineValeurTotale          Float   @default(0)
  pipelineVelocityJour          Float   @default(0)

  // === Coûts ===
  coutTotalJourEur       Float   @default(0)
  coutClaudeApiEur       Float   @default(0)
  coutApisExternesEur    Float   @default(0)
  coutInfrastructureEur  Float   @default(0)

  // Metadata
  snapshotVersion  String   @default("1.0")
  createdAt        DateTime @default(now())

  @@index([dateSnapshot])
  @@map("metriques_daily")
}
```

### Alertes — Nouveau modèle

```prisma
model Alerte {
  id              String    @id @default(uuid())
  dateDetection   DateTime  @default(now())
  metrique        String
  valeurActuelle  Float
  moyenne7j       Float
  zScore          Float?
  seuilType       String    // WARNING | CRITICAL
  message         String
  acknowledged    Boolean   @default(false)
  acknowledgedBy  String?
  acknowledgedAt  DateTime?
  resolved        Boolean   @default(false)
  resolvedAt      DateTime?
  createdAt       DateTime  @default(now())

  @@index([dateDetection])
  @@index([resolved])
  @@index([seuilType])
  @@map("alertes")
}
```

### Recommandation — Nouveau modèle

```prisma
model Recommandation {
  id                  String    @id @default(uuid())
  dateGeneration      DateTime  @default(now())
  agentCible          String    // agent_1_veilleur, agent_3_scoreur, etc.
  typeRecommandation  String    // ajuster_poids, desactiver_template, etc.
  priorite            String    // HAUTE | MOYENNE | BASSE
  titre               String
  description         String
  actionConcrete      String
  impactEstime        String?
  donneesSupport      Json?
  statut              String    @default("PENDING")  // PENDING | APPROVED | REJECTED | IMPLEMENTED | EXPIRED
  approvedBy          String?
  approvedAt          DateTime?
  implementedAt       DateTime?
  resultAfterImpl     Json?
  createdAt           DateTime  @default(now())

  @@index([agentCible])
  @@index([statut])
  @@index([priorite])
  @@index([dateGeneration])
  @@map("recommandations")
}
```

### AbTest — Nouveau modèle

```prisma
model AbTest {
  id                      String    @id @default(uuid())
  testName                String
  elementTeste            String    // subject_line, hook, cta, body_length, send_time
  templateControlId       String
  templateChallengerId    String
  segmentCible            String?
  categorieCible          String?
  statut                  String    @default("RUNNING")  // RUNNING | CONCLUDED | PAUSED | CANCELLED
  dateDebut               DateTime  @default(now())
  dateFin                 DateTime?
  tailleMinParVariante    Int       @default(250)
  envoisA                 Int       @default(0)
  envoisB                 Int       @default(0)
  repliesA                Int       @default(0)
  repliesB                Int       @default(0)
  positiveRepliesA        Int       @default(0)
  positiveRepliesB        Int       @default(0)
  replyRateA              Float     @default(0)
  replyRateB              Float     @default(0)
  zScore                  Float?
  pValue                  Float?
  gagnant                 String?   // A | B | TIE
  confianceResultat       Float?
  recommandation          String?
  createdAt               DateTime  @default(now())

  @@index([statut])
  @@index([dateDebut])
  @@map("ab_tests")
}
```

### Touchpoint — Nouveau modèle (attribution multi-touch)

```prisma
model Touchpoint {
  id                String    @id @default(uuid())
  prospectId        String
  channel           String    // email_cold, email_followup, email_nurture, linkedin_connection, etc.
  touchpointType    String    // detection, premier_email, relance_1, reply_received, deal_closed, etc.
  agentSource       String    // agent_1, agent_2, ..., agent_6
  templateId        String?
  abVariant         String?   // A | B
  signalType        String?
  segment           String?
  scoringCategorie  String?
  createdAt         DateTime  @default(now())

  prospect          Prospect  @relation(fields: [prospectId], references: [id])

  @@index([prospectId, createdAt])
  @@index([channel])
  @@index([agentSource])
  @@map("touchpoints")
}
```

---

## 2. SUB-AGENT 7a — COLLECTEUR DE MÉTRIQUES

### Architecture

```typescript
@Injectable()
export class MetricsCollectorService {
  // 6 fonctions de collecte parallèles + pipeline global + coûts
  async collectDailySnapshot(date?: string): Promise<void> {
    const snapshotDate = date || new Date().toISOString().split('T')[0];

    const [veilleur, enrichisseur, scoreur, redacteur, suiveur, nurtureur, pipeline] = await Promise.all([
      this.collectVeilleurMetrics(snapshotDate),
      this.collectEnrichisseurMetrics(snapshotDate),
      this.collectScoreurMetrics(snapshotDate),
      this.collectRedacteurMetrics(snapshotDate),
      this.collectSuiveurMetrics(snapshotDate),
      this.collectNurtureurMetrics(snapshotDate),
      this.collectPipelineMetrics(snapshotDate),
    ]);

    // Calculer les coûts agrégés
    const couts = this.calculateCosts(veilleur, enrichisseur, suiveur, nurtureur);

    // Upsert dans metriques_daily
    await this.prisma.metriquesDaily.upsert({
      where: { dateSnapshot: new Date(snapshotDate) },
      update: { ...veilleur, ...enrichisseur, ...scoreur, ...redacteur, ...suiveur, ...nurtureur, ...pipeline, ...couts },
      create: { dateSnapshot: new Date(snapshotDate), ...veilleur, ...enrichisseur, ...scoreur, ...redacteur, ...suiveur, ...nurtureur, ...pipeline, ...couts },
    });
  }
}
```

### Requêtes Prisma par agent (adaptées du spec SQL → Prisma)

Chaque fonction `collectXxxMetrics()` utilise Prisma au lieu de raw SQL pour la type-safety. Exemple pour Veilleur :

```typescript
private async collectVeilleurMetrics(date: string): Promise<Partial<VeilleurMetrics>> {
  const dayStart = new Date(date);
  const dayEnd = new Date(date + 'T23:59:59Z');

  const leads = await this.prisma.rawLead.groupBy({
    by: ['sourcePrimaire'],
    _count: { _all: true },
    where: { createdAt: { gte: dayStart, lte: dayEnd } },
  });

  // ... agrégation par source
  return {
    veilleurLeadsBruts: totalLeads,
    veilleurLeadsLinkedin: leads.find(l => l.sourcePrimaire === '1a_linkedin')?._count._all || 0,
    // ... etc
  };
}
```

---

## 3. SUB-AGENT 7b — GÉNÉRATEUR DE RAPPORTS

### 3 types de rapports

| Type | Fréquence | Claude model | Max tokens | Canaux |
|------|-----------|:----------:|:---------:|--------|
| Digest quotidien | 22h | Non (template fixe) | — | Slack + Email |
| Hebdomadaire | Lundi 9h | Sonnet | 2000 | Slack + Email |
| Mensuel stratégique | 1er du mois | Sonnet | 4000 | Slack + Email |

### Health status (digest quotidien)

```typescript
function getHealthStatus(replyRate: number, bounceRate: number): 'VERT' | 'JAUNE' | 'ROUGE' {
  if (replyRate >= 5 && bounceRate < 2) return 'VERT';
  if (replyRate >= 3 && bounceRate < 3) return 'JAUNE';
  return 'ROUGE';
}
```

### Claude prompts

**Hebdomadaire :**
```
System: Tu es l'Agent 7 ANALYSTE du système de prospection Axiom Marketing.
Tu génères un rapport hebdomadaire pour Jonathan, le fondateur.
Ton ton est direct, factuel, actionnable. Pas de formalités excessives.
Tu identifies les 2-3 points clés et fais des recommandations concrètes.
Objectifs Phase 1 : reply rate >= 5%, bounce rate < 2%, 2-4 deals/semaine, 10K-20K EUR/semaine.
```

**Mensuel :**
```
System: Tu es l'Agent 7 ANALYSTE. Tu génères un rapport mensuel stratégique pour Jonathan.
Ce rapport est STRATÉGIQUE : ROI, tendances, calibration scoring, forecasting.
Tu es direct, précis, et tu donnes des actions concrètes.
Objectifs Phase 1 Axiom : 5-10 deals/mois, 50K-100K EUR/mois, reply rate 5%+, CAC < 500 EUR.
```

---

## 4. SUB-AGENT 7c — DÉTECTEUR D'ANOMALIES

### Seuils de détection (10 métriques)

| Métrique | Normal | WARNING (1.5σ) | CRITICAL (2.5σ) | Seuil fixe CRITICAL |
|----------|--------|:--------------:|:---------------:|:-------------------:|
| Reply rate | 4-7% | < 3% ou > 9% | < 2% ou > 11% | < 1% |
| Bounce rate | 0.5-2% | > 3% | > 5% | > 5% |
| Leads/jour | 30-80 | < 15 ou > 120 | < 5 ou > 200 | 0 (system down) |
| Emails/jour | 10-50 | < 5 ou > 80 | 0 ou > 100 | 0 (system down) |
| Opt-out rate | 0-0.3% | > 0.5% | > 1% | > 2% |
| Score moyen | 40-55 | < 30 ou > 65 | < 20 ou > 75 | — |
| Distribution HOT | 8-15% | > 25% ou < 3% | > 40% ou < 1% | — |
| Taux enrichissement | 70-90% | < 60% | < 40% | < 20% |
| SLA breaches | 0-1 | 2-3 | > 5 | > 10 |
| Nurture engagement | 20-50 | < 10 | < 5 | — |

### Z-score calculation

```typescript
function calculateZScore(currentValue: number, historicalValues: number[]): number {
  if (historicalValues.length < 3) return 0; // Pas assez de données
  const mean = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
  const stddev = Math.sqrt(
    historicalValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / historicalValues.length
  );
  return stddev > 0 ? (currentValue - mean) / stddev : 0;
}
```

### Alertes Slack

- WARNING → `#pipeline-metrics`
- CRITICAL → `#alerts-critical` + DM Jonathan
- Format : métrique, valeur actuelle, moyenne 7j, z-score, cause probable, actions recommandées

---

## 5. SUB-AGENT 7d — RECOMMANDEUR

### 5 analyses automatiques

| Analyse | Agent cible | Déclencheur | Auto/Manuel |
|---------|------------|-------------|:-----------:|
| Templates reply rate < 3% (N >= 50) | Agent 4 | Continu | Auto |
| Précision HOT < 30% | Agent 3 | Mensuel | Manuel (Jonathan) |
| Source sans conversion 30j | Agent 1 | Mensuel | Manuel (Jonathan) |
| Séquences trop longues (0 réponses après step 3) | Agent 5 | Mensuel | Manuel (Jonathan) |
| Sunset > 60% dans un segment nurture | Agent 6 | Mensuel | Manuel (Jonathan) |

### A/B Testing — Significativité statistique

```typescript
// Pooled proportion z-test (two-tailed)
function calculateABTestSignificance(envoisA: number, repliesA: number, envoisB: number, repliesB: number): {
  zScore: number; pValue: number; significant: boolean; gagnant: 'A' | 'B' | 'TIE';
} {
  const rateA = envoisA > 0 ? repliesA / envoisA : 0;
  const rateB = envoisB > 0 ? repliesB / envoisB : 0;
  const pPooled = (repliesA + repliesB) / (envoisA + envoisB);
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / envoisA + 1 / envoisB));
  const z = se > 0 ? (rateB - rateA) / se : 0;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  return {
    zScore: z,
    pValue,
    significant: pValue < 0.05,
    gagnant: pValue >= 0.05 ? 'TIE' : (rateB > rateA ? 'B' : 'A'),
  };
}
```

**Règle Axiom Phase 1 :** Minimum 250 envois par variante. Test minimum 4 semaines.

### Lifecycle des recommandations

```
PENDING → [Slack notification + boutons Approuver/Rejeter]
  ├── APPROVED → agent applique → IMPLEMENTED → mesure impact 2 semaines
  ├── REJECTED → archivé
  └── (30j sans action) → EXPIRED
```

---

## 6. ATTRIBUTION U-SHAPED (Phase 1)

```
40% premier contact (détection + premier email)
40% dernier contact (message qui déclenche le deal)
20% réparti sur les contacts intermédiaires
```

### Calcul Prisma

```typescript
async calculateAttribution(prospectId: string, dealAmount: number): Promise<void> {
  const touchpoints = await this.prisma.touchpoint.findMany({
    where: { prospectId },
    orderBy: { createdAt: 'asc' },
  });

  const total = touchpoints.length;
  for (let i = 0; i < total; i++) {
    let creditPct: number;
    if (total === 1) creditPct = 100;
    else if (total === 2) creditPct = 50;
    else if (i === 0) creditPct = 40;
    else if (i === total - 1) creditPct = 40;
    else creditPct = 20 / (total - 2);

    // Sauvegarder attribution_result
  }
}
```

---

## 7. FORECASTING

### 3 méthodes

| Méthode | Input | Formule | Confiance |
|---------|-------|---------|:---------:|
| Lead-driven | Leads en pipeline + conversion rate | `leads * conversion_rate * deal_moyen` | Moyenne |
| Weighted pipeline | Deals par stage + probabilité | `SUM(deal_value * stage_probability)` | Haute |
| Moving average | Revenue 3 derniers mois | `AVG(3m) * (1 + growth_rate)` | Basse (early stage) |

### Pipeline coverage ratio

```
Coverage = pipeline_value_weighted / monthly_target
  >= 4x : EXCELLENT
  >= 3x : BON
  >= 2x : ACCEPTABLE
  < 2x  : INSUFFISANT
```

---

## 8. INTEGRATION AGENTS 8, 9, 10 (spec MASTER §11)

L'Agent 7 doit aussi collecter les métriques des 3 agents restants. Ces métriques seront ajoutées dans MetriquesDaily lorsque ces agents seront implémentés.

### Colonnes MetriquesDaily à ajouter (Phase 2+)

```prisma
  // === Agent 8 : DEALMAKER === (à ajouter quand Agent 8 implémenté)
  // dealmakerDealsOuverts       Int     @default(0)
  // dealmakerDealsGagnes        Int     @default(0)
  // dealmakerDealsPerdus        Int     @default(0)
  // dealmakerWinRate            Float   @default(0)
  // dealmakerDealMoyen          Float   @default(0)
  // dealmakerCycleVenteMoyen    Int     @default(0)  // jours
  // dealmakerPropositionsEnvoyees Int   @default(0)
  // dealmakerTauxAcceptation    Float   @default(0)
  // dealmakerPipelineValue      Float   @default(0)

  // === Agent 9 : APPELS D'OFFRES === (à ajouter quand Agent 9 implémenté)
  // aoDetectes                  Int     @default(0)
  // aoGoDecisions               Int     @default(0)
  // aoSoumis                    Int     @default(0)
  // aoGagnes                    Int     @default(0)
  // aoTauxSucces                Float   @default(0)
  // aoValeurMarchesGagnes       Float   @default(0)
  // aoDelaiMoyenPreparation     Int     @default(0)  // jours

  // === Agent 10 : CSM === (à ajouter quand Agent 10 implémenté)
  // csmClientsActifs            Int     @default(0)
  // csmMrrTotal                 Float   @default(0)
  // csmNpsMoyen                 Float   @default(0)
  // csmChurnRate                Float   @default(0)
  // csmReferralsGeneres         Int     @default(0)
  // csmReferralsConverts        Int     @default(0)
  // csmUpsellPipeline           Float   @default(0)
```

### Fonctions de collecte à ajouter (Phase 2+)

```typescript
// À implémenter quand les agents 8-10 seront en production
async collectDealmakerMetrics(date: string): Promise<Partial<DealmakerMetrics>> { /* ... */ }
async collectAppelsOffresMetrics(date: string): Promise<Partial<AOMetrics>> { /* ... */ }
async collectCsmMetrics(date: string): Promise<Partial<CsmMetrics>> { /* ... */ }
```

---

## 9. SQL VIEWS EXPLOITÉES PAR L'ANALYSTE (spec MASTER §2.3)

L'Agent 7 peut exploiter des vues SQL créées par les autres agents pour simplifier ses requêtes :

```sql
-- Agent 1 (VEILLEUR)
v_veilleur_daily_summary          -- Résumé quotidien des leads
v_marches_actifs                  -- Marchés publics en cours

-- Agent 3 (SCOREUR)
score_distribution                -- Distribution des scores sur 30 jours

-- Agent 5 (SUIVEUR)
v_metrics_envoi_daily             -- Métriques envoi par jour/canal/domaine
v_metrics_reponses                -- Métriques réponses par catégorie
v_conversion_par_segment          -- Taux conversion par segment
v_sla_compliance                  -- Respect des SLAs

-- Agent 6 (NURTUREUR)
v_nurture_dashboard_monthly       -- Synthèse nurture mensuelle
v_nurture_content_performance     -- Performance par contenu
v_nurture_funnel                  -- Entonnoir nurture
v_nurture_engagement_weekly       -- Engagement par semaine
v_nurture_metrics_daily           -- Métriques nurture quotidiennes

-- Agent 7 (ANALYSTE) — créées par l'analyste
v_attribution_par_canal           -- Revenue attribué par canal
v_attribution_par_template        -- Revenue attribué par template
v_attribution_par_agent           -- Revenue attribué par agent
v_customer_journey                -- Parcours client complet
```

**Note :** Ces vues peuvent être créées comme migrations Prisma raw SQL ou comme fonctions dans le collecteur. En Phase 1, le collecteur peut faire les requêtes directement sans vues.

---

## 10. 34 KPIs AVEC BENCHMARKS (spec MASTER §4)

### Tableau complet des KPIs à tracker

| # | KPI | Agent | Benchmark | Objectif Phase 1 |
|---|-----|-------|:---------:|:-----------------:|
| 1 | Leads bruts/jour | Veilleur | N/A | 30-80 |
| 2 | Leads qualifiés/jour | Veilleur | N/A | 8-20 |
| 3 | Taux déduplication | Veilleur | 10-25% | 10-25% |
| 4 | Coût par lead brut | Veilleur | N/A | 0.18-0.48 EUR |
| 5 | Taux enrichissement email | Enrichisseur | 60-80% | >= 70% |
| 6 | Taux email valide | Enrichisseur | 80-90% | >= 85% |
| 7 | Temps moyen enrichissement | Enrichisseur | < 10s | < 10s |
| 8 | Distribution HOT | Scoreur | 5-15% | ~10% |
| 9 | Précision HOT | Scoreur | 25-35% | >= 30% |
| 10 | Recall | Scoreur | 50-70% | >= 60% |
| 11 | Faux positifs HOT | Scoreur | 30-50% | < 40% |
| 12 | Score moyen deals | Scoreur | 60-80 | >= 65 |
| 13 | Coût par message | Rédacteur | $0.01-0.03 | < $0.02 |
| 14 | Templates actifs | Rédacteur | 3-10 | 5-8 |
| 15 | A/B tests en cours | Rédacteur | 1-3 | 1-2 |
| 16 | Reply rate | Suiveur | 3.43% moy | >= 5% |
| 17 | Reply rate positive | Suiveur | 1-3% | >= 2% |
| 18 | Bounce rate | Suiveur | < 2% | < 2% |
| 19 | Opt-out rate | Suiveur | 0.1-0.3% | < 0.5% |
| 20 | SLA compliance | Suiveur | > 90% | > 90% |
| 21 | LinkedIn acceptance rate | Suiveur | 20-40% | >= 25% |
| 22 | Taux ouverture nurture | Nurtureur | 20-30% | >= 25% |
| 23 | Taux clic nurture | Nurtureur | 3-5% | >= 4% |
| 24 | Taux reclassification HOT | Nurtureur | 3-8% | >= 5% |
| 25 | Délai maturation moyen | Nurtureur | 60-120j | < 90j |
| 26 | Taux sunset | Nurtureur | 40-60% | < 60% |
| 27 | Conversion end-to-end | Pipeline | 2-5% | >= 2% |
| 28 | CAC | Pipeline | 800-2000 EUR | < 500 EUR |
| 29 | Pipeline velocity | Pipeline | Variable | >= 500 EUR/j |
| 30 | Pipeline coverage | Pipeline | 3-4x | >= 3x |
| 31 | Win rate | Pipeline | 8.8% (agences) | >= 15% |
| 32 | Cycle de vente moyen | Pipeline | 30-90j | < 45j |
| 33 | Deal moyen | Pipeline | 5K-15K EUR | >= 8K EUR |
| 34 | ROI mensuel | Pipeline | Variable | >= 10x |

### Scoring precision — Fonction manquante (spec 7b)

```typescript
interface ScoringPrecision {
  precisionHot: number;     // % HOT qui convertissent
  recall: number;           // % deals qui étaient HOT
  fauxPositifsHot: number;  // % HOT sans réponse
  fauxNegatifs: number;     // % deals qui étaient COLD/DISQ
  scoreMoyenDeals: number;  // Score moyen des prospects convertis
}

function calculateScoringPrecision(outcomes: ProspectOutcome[]): ScoringPrecision {
  const hotOutcomes = outcomes.filter(o => o.categorieAtContact === 'HOT');
  const convertis = outcomes.filter(o => o.outcome === 'converti');
  const hotConvertis = hotOutcomes.filter(o => ['converti', 'opportunite'].includes(o.outcome));
  const hotSansReponse = hotOutcomes.filter(o => o.outcome === 'pas_de_reponse');
  const fauxNegatifs = convertis.filter(o => ['COLD', 'DISQUALIFIE'].includes(o.categorieAtContact));

  return {
    precisionHot: hotOutcomes.length > 0 ? (hotConvertis.length / hotOutcomes.length) * 100 : 0,
    recall: convertis.length > 0 ? (convertis.filter(o => o.categorieAtContact === 'HOT').length / convertis.length) * 100 : 0,
    fauxPositifsHot: hotOutcomes.length > 0 ? (hotSansReponse.length / hotOutcomes.length) * 100 : 0,
    fauxNegatifs: convertis.length > 0 ? (fauxNegatifs.length / convertis.length) * 100 : 0,
    scoreMoyenDeals: convertis.length > 0 ? convertis.reduce((a, c) => a + c.scoreAtContact, 0) / convertis.length : 0,
  };
}
```

---

## 11. VOLUMES ET DIMENSIONNEMENT (spec MASTER §10.3)

### Output Agent 7 — Phase 1

| Output | Fréquence | Volume |
|--------|-----------|--------|
| metriques_daily rows | 1/jour | 1 row (60+ colonnes) |
| Alertes | 0-2/semaine | ~8-10/mois |
| Recommandations | 3-5/semaine | ~15-20/mois |
| Digest quotidien | 1/jour | ~30/mois |
| Rapport hebdomadaire | 1/semaine | 4/mois |
| Rapport mensuel | 1/mois | 1/mois |
| Claude API calls | ~50/mois | ~0.23 EUR base + marge |

### Coût Agent 7

| Poste | Coût mensuel |
|-------|:----------:|
| Claude API (rapports + recommandations) | ~30 EUR |
| Slack API | 0 EUR |
| Gmail API (rapports email) | 0 EUR |
| Metabase (self-hosted) | ~10 EUR |
| Infrastructure (cron workers, Redis) | ~10 EUR |
| **TOTAL Agent 7** | **~50 EUR/mois** |

---

## 12. BRAINSTORM — FONCTIONNALITÉS ADDITIONNELLES

### Phase 2 — Améliorations envisagées

| # | Feature | Description | Priorité |
|---|---------|-------------|:--------:|
| F1 | **Real-time anomaly events** | EventEmitter listeners pour bounce spike, opt-out spike → alerte immédiate sans attendre le cron | P1 |
| F2 | **Agent health monitoring** | Vérifier le heartbeat de chaque agent (dernier AgentEvent < 12h) → alerte si agent down | P1 |
| F3 | **Trend prediction** | Régression linéaire sur 30j pour prédire quand un KPI va breach un seuil | P2 |
| F4 | **Funnel bottleneck detection** | Identifier automatiquement l'étape avec le plus grand drop-off | P1 |
| F5 | **Segment-specific reporting** | Ventiler TOUS les KPIs par segment (pme_metro, ecommerce, etc.) | P2 |
| F6 | **Auto-execution recommendations** | Pour les recommandations low-risk (template < 3% sur N >= 50), appliquer sans attendre validation | P2 |
| F7 | **Email deliverability monitoring** | Tracker la réputation domaine, sender score, blacklists | P1 |
| F8 | **LLM cost optimization** | Tracker le coût Claude par agent et recommander des model downgrades | P2 |
| F9 | **Data quality scoring** | Mesurer la complétude et précision des données d'enrichissement | P2 |
| F10 | **Comparative benchmarks** | Comparer les métriques Axiom vs moyennes industrie agences web | P3 |

---

## 13. ENV VARS COMPLÈTES

```env
# Ajouts pour Agent 7 :
SLACK_BOT_TOKEN=                              # Bot token Slack (pas webhook)
SLACK_CHANNEL_METRICS=#pipeline-metrics       # Canal métriques
SLACK_CHANNEL_ALERTS=#alerts-critical         # Canal alertes critiques
SLACK_JONATHAN_ID=                            # User ID Slack Jonathan pour DM

METABASE_URL=http://localhost:3001            # URL Metabase dashboard
ANALYSTE_MONTHLY_TARGET_EUR=50000             # Objectif revenue mensuel
```

---

## 14. ROADMAP MISE À JOUR

### Phase 0 — Schema + Migration (1 jour)
- [ ] Refactorer MetriquesDaily (60 colonnes)
- [ ] Ajouter Alerte, Recommandation, AbTest, Touchpoint
- [ ] Migration Prisma
- [ ] Adapter PipelineMetric entity et repository

### Phase 1 — 7a Collecteur (1.5 jours)
- [ ] MetricsCollectorService avec 7 fonctions de collecte
- [ ] Upsert quotidien dans metriques_daily
- [ ] Cron 21:30

### Phase 2 — 7c Anomalies + 7b Rapports (2 jours, parallélisables)
- [ ] AnomalyDetectorService (z-score + seuils)
- [ ] Slack alerts (WARNING + CRITICAL)
- [ ] ReportGeneratorService (digest, hebdo, mensuel)
- [ ] Claude API pour résumés
- [ ] Slack + Email envoi

### Phase 3 — 7d Recommandeur (1.5 jours)
- [ ] RecommenderService (5 analyses)
- [ ] A/B Testing significativité
- [ ] Lifecycle recommandations
- [ ] Claude API résumé

### Phase 4 — Attribution + Forecasting + Tests (1.5 jours)
- [ ] Attribution U-Shaped
- [ ] Touchpoints tracking
- [ ] Forecasting 30/60/90j
- [ ] Tests unitaires + intégration

### Dépendances

```
Phase 0 (schema) — BLOQUANTE
  ↓
Phase 1 (7a collecteur) — BLOQUANTE
  ↓
Phase 2a (7c anomalies) + Phase 2b (7b rapports) — parallélisables
  ↓
Phase 3 (7d recommandeur) — dépend de 1+2
  ↓
Phase 4 (attribution + tests) — dépend de 0 (schema seulement)
```
