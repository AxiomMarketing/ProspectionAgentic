# Agent 3 — SCOREUR — Détails d'implémentation complets

**Complément à :** `03-AGENT-3-SCOREUR.md`
**Comble les 67 gaps identifiés par l'audit final du 27/03/2026**

---

## 1. AXE 3 — INVERSION SÉMANTIQUE (Gap critique #1)

### Philosophie spec vs code

La spec traite les problèmes techniques comme des **opportunités commerciales** (site lent = client potentiel pour Axiom).
Le code traite la bonne tech comme un **signal positif** (framework moderne = bon prospect).

**Pour une agence digitale comme Axiom, la spec a raison** : un site avec Lighthouse 30/100 est un meilleur prospect qu'un site avec 95/100.

### Fix : Scoring Axe 3 inversé (comme la spec)

```typescript
// AVANT (code actuel — récompense la bonne tech)
hasModernFramework: +8
hasMobileOptimization: +6
hasSecurityCerts: +3
lighthouseScore >= 80: +3

// APRÈS (spec — récompense les opportunités)
private calculateTechnique(input: ScoringInput): number {
  let score = 0;

  // Lighthouse inversé : site lent = plus d'opportunité
  if (input.lighthouseScore != null) {
    if (input.lighthouseScore < 30) score += 8;       // Critique → refonte nécessaire
    else if (input.lighthouseScore < 50) score += 7;   // Faible → optimisation
    else if (input.lighthouseScore < 70) score += 5;   // Moyen → améliorations
    else if (input.lighthouseScore < 90) score += 2;   // Bon → peu d'opportunité
    // >= 90 → 0 pts (pas besoin de nous)
  }

  // Stack obsolète = opportunité
  if (input.stackObsolete) score += 6;                  // WordPress < 6, jQuery seul, PHP < 8
  if (!input.hasModernFramework && !input.stackObsolete) score += 3; // Pas de framework

  // RGAA non conforme (surtout collectivités)
  if (input.rgaaViolationsCritical && input.rgaaViolationsCritical > 0) score += 4;
  if (input.segment === 'collectivite' && !input.rgaaCompliant) score += 2; // Bonus collectivité

  return Math.min(20, score);
}
```

### Nouveaux champs ScoringInput requis

```typescript
// Ajouter à ScoringInput
stackObsolete?: boolean;           // WordPress < 6, jQuery sans framework, PHP < 8
rgaaViolationsCritical?: number;   // Nombre violations RGAA critiques
rgaaCompliant?: boolean;           // true si 0 violations critiques + score a11y >= 80
```

Mappés depuis `enrichmentData.technique` :
- `stackObsolete` = `technique.stack.cms === 'WordPress' && parseInt(technique.stack.cms_version) < 6`
- `rgaaViolationsCritical` = `technique.accessibilite.violations_critical`
- `rgaaCompliant` = `technique.accessibilite.violations_critical === 0 && technique.accessibilite.score >= 80`

---

## 2. SOFT MALUS MANQUANTS (11 règles de la spec)

```typescript
private calculateSoftMalus(input: ScoringInput): number {
  let malus = 0;

  // --- Existants (déjà implémentés) ---
  if (!input.emailVerified) malus -= 5;
  if (!input.emailVerified && !input.phoneAvailable && !input.hasLinkedinProfile) malus -= 10;
  if (!input.hasModernFramework && !input.lighthouseScore) malus -= 8;
  if (input.signals.length > 0 && input.signals.every(s => daysSince(s.date) > 60)) malus -= 15;

  // --- NOUVEAUX (de la spec) ---
  // CA trop faible
  if (input.caAnnuel != null && input.caAnnuel < 50_000) malus -= 15;
  // CA en forte baisse (> 20%)
  if (input.croissanceCaPct != null && input.croissanceCaPct < -20) malus -= 10;
  // CA en baisse légère (> 10%)
  else if (input.croissanceCaPct != null && input.croissanceCaPct < -10) malus -= 5;
  // Effectif en baisse
  if (input.effectifEnBaisse) malus -= 5;
  // Email non trouvé (pas disqualifiant, mais malus)
  if (!input.email) malus -= 10;
  // Email catch-all ou non vérifié
  if (input.emailCatchAll) malus -= 5;
  // Email personnel (gmail, yahoo, etc.)
  if (input.emailPersonnel) malus -= 8;
  // Pas de décideur identifié
  if (!input.decideurIdentifie) malus -= 10;
  // Aucun signal détecté
  if (input.signals.length === 0) malus -= 5;
  // Enrichissement incomplet (complétude < 40%)
  if (input.completudePct != null && input.completudePct < 40) malus -= 5;
  // BODACC négatif (hors procédure collective qui est hard disqualif)
  if (input.bodaccNegatif) malus -= 5;

  return malus; // Pas de cap — peut aller très négatif
}
```

### Nouveaux champs ScoringInput requis

```typescript
// Ajouter à ScoringInput
caAnnuel?: number;              // enrichmentData.company.financials[0]?.ca
croissanceCaPct?: number;       // (CA_N - CA_N-1) / CA_N-1 * 100
effectifEnBaisse?: boolean;     // enrichmentData.company.alertes.effectif_en_baisse
email?: string;                 // prospect.email (pour check null)
emailCatchAll?: boolean;        // enrichmentData.contact.source === 'pattern_guess_catchall'
emailPersonnel?: boolean;       // email domain in ['gmail.com','yahoo.fr','hotmail.com','outlook.com']
decideurIdentifie?: boolean;    // !!prospect.jobTitle && decideur_score >= 6
completudePct?: number;         // enrichmentData.enrichissement.qualite.completude_pct
bodaccNegatif?: boolean;        // enrichmentData.company.legalNotices with type 'procedure_collective' or 'radiation'
nafCode?: string;               // pour le scoring NAF
```

---

## 3. HARD DISQUALIFICATIONS MANQUANTES (4 checks)

```typescript
private checkHardDisqualifications(input: ScoringInput): number {
  // Existants
  if (input.isCompetitor) return -100;
  if (input.isOptedOut) return -100;
  if (input.isRgpdBlocked) return -100;
  if (input.isBankrupt) return -100;

  // NOUVEAUX
  // B5 fix : emailInvalid = email bounce/invalid, PAS "email absent"
  if (input.emailBounced) return -100;  // Renamed from emailInvalid

  // Entreprise fermée (état administratif F)
  if (input.entrepriseFermee) return -100;

  // Client existant (ne pas reprospecter)
  if (input.clientExistant) return -100;

  // Pays sanctionné
  if (input.paysSanctionne) return -100;

  // Secteur interdit
  if (input.secteurInterdit) return -100;

  return 0;
}
```

---

## 4. SEGMENT BONUSES (7 de la spec)

```typescript
private calculateSegmentBonus(input: ScoringInput): number {
  let bonus = 0;

  if (input.segment === 'ecommerce') {
    if (input.ecommercePlatform === 'Shopify') bonus += 5;
    if (input.ecommercePlatform === 'WooCommerce') bonus += 3;
  }

  if (input.segment === 'collectivite') {
    if (input.hasAppelOffre) bonus += 5;          // AO en cours via Agent 1b
    if (!input.rgaaCompliant) bonus += 3;          // Non conforme RGAA = opportunité
  }

  if (input.segment === 'startup') {
    // Levée < 60 jours
    const fundingSignal = input.signals.find(s => s.type === 'funding_round');
    if (fundingSignal && daysSince(fundingSignal.date) < 60) bonus += 5;
    // Croissance > 30%
    if (input.croissanceCaPct != null && input.croissanceCaPct > 30) bonus += 3;
  }

  // Transversal : referral de l'Agent 10 (CSM)
  if (input.isReferral) bonus += 10;

  return bonus;
}
```

---

## 5. SIGNAL TYPES MANQUANTS + HALF-LIVES CORRIGÉES

### Types de la spec absents du code

| Signal type (spec) | Base | Half-life | Équivalent code | Action |
|---------------------|:----:|:---------:|-----------------|--------|
| `levee_fonds` | 30 | 45j | `funding_round` (22, 180j) | **Renommer + corriger** |
| `marche_public` | 25 | 30j | Absent | **Ajouter** |
| `croissance_equipe` | 18 | 60j | Absent | **Ajouter** |
| `post_besoin_tech` | 20 | 30j | Absent | **Ajouter** |
| `accessibilite_faible` | 15 | 90j | Absent | **Ajouter** |
| `tech_obsolete` | 15 | 60j | Absent | **Ajouter** |
| `creation_etablissement` | 12 | 120j | Absent | **Ajouter** |
| `cession_parts` | 10 | 90j | Absent | **Ajouter** |
| `modification_statuts` | 8 | 60j | Absent | **Ajouter** |

### Correction half-lives (code → spec)

| Signal | Code actuel | Spec | Action |
|--------|:-----------:|:----:|--------|
| `changement_poste` | 90j | 60j | Réduire |
| `funding_round` → `levee_fonds` | 180j | 45j | Réduire fortement |
| `job_posting` | 60j | 45j | Réduire |

### Seuil plancher (spec)

Ajouter : si `decayed < 1.0`, ignorer le signal (ne pas compter les signaux infinitésimaux).

### Rank multiplier (6 entrées spec vs 4 code)

```typescript
const RANK_MULTIPLIERS = [1.0, 0.5, 0.25, 0.10, 0.10, 0.10]; // Spec: 6 entrées
```

---

## 6. COEFFICIENTS SEGMENT — Alignement spec

### Valeurs spec vs code (divergences non justifiées)

| Segment | Code ICP/Sig/Tech/Eng | Spec ICP/Sig/Tech/Eng | Décision |
|---------|:---------------------:|:---------------------:|----------|
| `pme_metro` | 1.0/1.2/0.8/0.9 | 1.0/1.0/1.0/1.0 | **Adopter spec** (baseline neutre) |
| `ecommerce` | 0.9/1.0/1.3/1.1 | 0.85/1.0/1.15/1.1 | **Adopter spec** |
| `collectivite` | 1.1/0.9/0.9/1.0 | 1.2/0.9/1.1/0.7 | **Adopter spec** (tech plus important) |
| `startup` | 0.8/1.4/1.1/1.2 | 0.8/1.2/0.9/1.2 | **Adopter spec** |
| `agence_wl` | 1.0/1.1/1.2/1.0 | 0.9/1.0/1.1/1.1 | **Adopter spec** |

**Note** : Le segment `ecommerce` de la spec s'appelle `ecommerce_shopify`. Adopter le nom spec et mapper l'alias.

---

## 7. ICP FIT — Sous-axes spec (10+10+8+7=35)

### Redistribution des points (spec)

| Sous-axe | Spec max | Code actuel max | Fix |
|----------|:--------:|:---------------:|-----|
| Taille entreprise | 10 | 15 | Réduire à 10, ajouter CA-based scoring |
| Secteur/NAF | 10 | 10 | OK mais remplacer keyword par NAF mapping |
| Localisation | 8 | 10 | Réduire à 8, utiliser code département |
| Décideur profil | 7 | 0 | **Ajouter** (G1) |

### NAF code mapping (Top codes digitaux)

```typescript
const NAF_SCORING: Record<string, number> = {
  '6201Z': 10, // Programmation informatique
  '6202A': 10, // Conseil systèmes informatiques
  '6202B': 10, // Tierce maintenance informatique
  '6203Z': 9,  // Gestion installations informatiques
  '6311Z': 9,  // Traitement hébergement données
  '5811Z': 9,  // Édition de logiciels
  '5829C': 8,  // Édition logiciels applicatifs
  '7311Z': 8,  // Agences de publicité
  '7312Z': 7,  // Régie publicitaire médias
  '7021Z': 7,  // Conseil relations publiques
  '4791A': 7,  // Commerce de détail par correspondance (e-commerce)
  // Préfixes (fallback)
  '62':   8,   // Programmation, conseil, autres activités informatiques
  '63':   7,   // Services d'information
  '58':   6,   // Édition
  '73':   6,   // Publicité et études de marché
};

function scoreNAF(nafCode: string): number {
  return NAF_SCORING[nafCode] ?? NAF_SCORING[nafCode?.slice(0, 2)] ?? 3;
}
```

### Localisation — Département → Région + DOM-TOM

```typescript
const DEPT_TO_REGION: Record<string, string> = {
  '75': 'ile-de-france', '92': 'ile-de-france', '93': 'ile-de-france', '94': 'ile-de-france',
  '91': 'ile-de-france', '77': 'ile-de-france', '78': 'ile-de-france', '95': 'ile-de-france',
  '13': 'provence', '83': 'provence', '84': 'provence', '06': 'provence', '04': 'provence', '05': 'provence',
  '69': 'auvergne', '63': 'auvergne', '43': 'auvergne', '42': 'auvergne', '03': 'auvergne', '15': 'auvergne',
  '31': 'occitanie', '34': 'occitanie', '30': 'occitanie', '11': 'occitanie', '66': 'occitanie',
  '33': 'nouvelle-aquitaine', '64': 'nouvelle-aquitaine', '40': 'nouvelle-aquitaine',
  '974': 'reunion', '976': 'mayotte', '971': 'guadeloupe', '972': 'martinique', '973': 'guyane',
};

const REGION_SCORES: Record<string, number> = {
  'reunion': 8,          // Axiom home base → max proximity
  'ile-de-france': 8,
  'provence': 7,
  'auvergne': 6,
  'occitanie': 6,
  'nouvelle-aquitaine': 5,
  'mayotte': 7,          // DOM-TOM proximity
  'guadeloupe': 5,
  'martinique': 5,
  'guyane': 4,
};

function scoreRegion(codePostal?: string): number {
  if (!codePostal) return 4;
  const dept = codePostal.length >= 2 ? codePostal.slice(0, codePostal.startsWith('97') ? 3 : 2) : '';
  const region = DEPT_TO_REGION[dept];
  return REGION_SCORES[region ?? ''] ?? 4;
}
```

---

## 8. FEEDBACK / CALIBRATION (comble CAT 8 — 10 items manquants)

### KPIs de scoring (spec)

| KPI | Phase 1 cible | Phase 2 cible | Calcul |
|-----|:------------:|:-------------:|--------|
| `precision_hot` | > 30% | > 45% | Prospects HOT qui convertissent / Total HOT |
| `recall_hot` | > 60% | > 70% | Conversions dans HOT / Toutes conversions |
| `f1_score` | > 0.40 | > 0.55 | 2 × (precision × recall) / (precision + recall) |
| `pct_hot` | 8-12% | 8-12% | HOT / Total prospects scorés |
| `taux_reponse_hot` | > 15% | > 25% | Réponses / Emails envoyés HOT |
| `taux_reponse_warm` | > 5% | > 10% | Réponses / Emails envoyés WARM |
| `deal_score_moyen` | > 70 | > 75 | Score moyen des prospects convertis |
| `score_moyen_global` | 40-55 | 45-55 | Moyenne tous prospects |

### Algorithme de recalibration

```typescript
async analyserCalibration(metrics: ScoringMetrics): Promise<CalibrationAction[]> {
  const actions: CalibrationAction[] = [];

  // Trop de HOT (> 15%)
  if (metrics.pctHot > 0.15) {
    actions.push({ type: 'INCREASE_HOT_THRESHOLD', delta: +3, reason: 'Trop de prospects HOT' });
  }

  // Pas assez de HOT (< 5%)
  if (metrics.pctHot < 0.05) {
    actions.push({ type: 'DECREASE_HOT_THRESHOLD', delta: -3, reason: 'Pas assez de HOT' });
  }

  // WARM convertit trop bien (> 30%) → seuil HOT trop haut
  if (metrics.conversionRateWarm > 0.30) {
    actions.push({ type: 'DECREASE_HOT_THRESHOLD', delta: -5, reason: 'WARM convertit trop bien, seuil HOT trop restrictif' });
  }

  // Deals ont scores bas (< 60 en moyenne)
  if (metrics.dealScoreMoyen < 60) {
    actions.push({ type: 'REVIEW_AXES_WEIGHTS', reason: 'Les deals viennent de prospects mal scorés' });
  }

  // Trop de DISQUALIFIÉ (> 30%)
  if (metrics.pctDisqualified > 0.30) {
    actions.push({ type: 'REVIEW_HARD_DISQUALIFICATIONS', reason: 'Trop de prospects disqualifiés' });
  }

  return actions;
}
```

### Schedule de recalibration

| Fréquence | Action | Condition |
|-----------|--------|-----------|
| Hebdomadaire | Calcul KPIs, alertes si hors seuils | Toujours |
| Mensuel | Recalibration Bayésienne (±10% par axe) | Si ≥ 100 outcomes |
| Trimestriel | Revue complète coefficients segment | Si ≥ 300 outcomes |
| Semestriel | Évaluation transition ML | Si ≥ 500 outcomes |

### Transition ML (4 phases)

| Phase | Seuil | Modèle | Action |
|-------|:-----:|--------|--------|
| 1 | 0-200 outcomes | Déterministe (scoring-engine.ts) | Calibration manuelle |
| 2 | 200-300 outcomes | Bayésien | Auto-calibration mensuelle |
| 3 | 300-500 outcomes | Pilot ML (Random Forest, 50% A/B) | Comparer precision +5pts |
| 4 | 500+ outcomes | Hybride 70% déterministe / 30% ML | Production |

### Cron recalculation quotidienne (spec section 3.4)

```typescript
@Cron('0 4 * * *', { name: 'scoreur-daily-recalc' })
async dailyRecalculation(): Promise<void> {
  // Recalculer les scores des prospects avec signaux < 30j (signal decay)
  const recentProspects = await this.prisma.prospect.findMany({
    where: { status: { in: ['scored', 'contacted'] }, enrichedAt: { gte: thirtyDaysAgo() } },
  });

  for (const prospect of recentProspects) {
    const newResult = await this.calculateScore({ prospectId: prospect.id });
    // Si catégorie change → notification
    if (newResult.category !== prospect.currentCategory) {
      await this.notifyCategoryChange(prospect, newResult);
    }
  }
}
```

---

## 9. SEQUENCE IDS — Alignement spec

| Catégorie | Code actuel | Spec | Fix |
|-----------|-------------|------|-----|
| HOT_A | `seq_hot_a_vip` | `SEQ_HOT_A_PREMIUM` | Renommer |
| HOT_B | `seq_hot_b_standard` | `SEQ_HOT_B_PRIORITY` | Renommer |
| HOT_C | `seq_hot_c_nurture` | `SEQ_HOT_C_STANDARD` | Renommer |
| WARM | `seq_warm_nurture` | `SEQ_WARM_AUTO` | Renommer |
| COLD | `seq_cold_newsletter` | `SEQ_COLD_NURTURE` | Renommer |

---

## 10. ENV VARIABLES — Intégration code

Les variables sont dans `.env.example` mais aucune n'est lue par le code. Fix :

```typescript
// scoring-engine.ts — lire depuis ConfigService
constructor(private readonly configService: ConfigService) {
  this.HOT_THRESHOLD = this.configService.get<number>('SCOREUR_HOT_THRESHOLD', 75);
  this.WARM_THRESHOLD = this.configService.get<number>('SCOREUR_WARM_THRESHOLD', 50);
  this.COLD_THRESHOLD = this.configService.get<number>('SCOREUR_COLD_THRESHOLD', 25);
  this.MODEL_VERSION = this.configService.get<string>('SCOREUR_MODEL_VERSION', '2.0.0');
}
```

---

## 11. ROADMAP MISE À JOUR (couvre les 67 gaps)

### Phase 0 — Bug fixes critiques (1.5 jours)
- [ ] B1 : Propager signals Agent 1 → Agent 2 → enrichmentData.signals (field name: `date` pas `date_signal`)
- [ ] B2 : Propager segment estimé vers enrichmentData.segment
- [ ] B3 : Mapper city → région via table département (section 7)
- [ ] B4 : Normaliser companySize (INSEE français → ranges code)
- [ ] B5 : Fix emailInvalid → emailBounced (ne pas disqualifier les sans-email)
- [ ] B6 : Fix accessibilityScore (séparer de engagementScore)
- [ ] B7 : Mettre à jour Prospect.status = 'scored'
- [ ] B8 : Corriger SLA (HOT_B=2h, HOT_C=4h)
- [ ] B10 : Auth guard sur scoreur controller
- [ ] Fix : `segment` dans ProspectScore stocke la catégorie, pas le segment
- [ ] Fix : Lire env vars (thresholds, model version)

### Phase 1 — Scoring model aligné spec (2 jours)
- [ ] **Axe 3 inversé** : Lighthouse inversé, stack obsolète, RGAA (section 1)
- [ ] **11 soft malus** de la spec (section 2)
- [ ] **4 hard disqualifications** manquantes (section 3)
- [ ] **7 segment bonuses** (section 4)
- [ ] **9 signal types** manquants + half-lives corrigées (section 5)
- [ ] **Coefficients segment** alignés sur spec (section 6)
- [ ] **ICP Fit redistribué** : 10+10+8+7 avec NAF + décideur + localisation département (section 7)
- [ ] Rank multiplier 6 entrées + seuil plancher
- [ ] Sequence IDs renommés (section 9)

### Phase 2 — Propagation données + contrats aval (1 jour)
- [ ] Agent 2 → enrichmentData.signals : propager rawLead.rawData.signals
- [ ] Agent 2 → enrichmentData.segment : propager du Veilleur
- [ ] Agent 2 → enrichmentData.caAnnuel, croissanceCaPct, effectifEnBaisse
- [ ] Fix RedacteurProcessor : accepter category, routing, breakdown
- [ ] Fix NurtureurProcessor/DTO : accepter category, routing
- [ ] Multi-channel HOT_A/B : dispatch email + linkedin

### Phase 3 — Dashboard Scoreur (0.5 jour)
- [ ] Distribution HOT/WARM/COLD/DISQUALIFIÉ (histogramme)
- [ ] Score moyen par axe (radar chart ou barres)
- [ ] Top 10 prospects récemment scorés
- [ ] KPIs : precision_hot, pct_hot, deal_score_moyen

### Phase 4 — Feedback & Calibration (1.5 jours)
- [ ] Modèle Prisma `ProspectOutcome` (converti, opportunité, pas_de_réponse, etc.)
- [ ] `ScoringCoefficientRepository` pour coefficients DB-driven
- [ ] KPIs mensuels (8 métriques de la spec)
- [ ] Algorithme recalibration automatique (5 règles)
- [ ] Cron recalculation quotidienne 04:00 (signal decay)
- [ ] Score history tracking (changements de catégorie)
- [ ] Rapport calibration mensuel

### Phase 5 — Tests (0.5 jour)
- [ ] Tests Axe 3 inversé (Lighthouse faible = score élevé)
- [ ] Tests 11 soft malus
- [ ] Tests NAF scoring
- [ ] Tests localisation département → région
- [ ] Tests décideur scoring
- [ ] Tests signal types spec (9 nouveaux)
- [ ] Tests segment bonuses (7 règles)
- [ ] Tests contrats aval (Rédacteur/Nurtureur reçoivent category/routing)

### Dépendances entre phases

```
Phase 0 (bug fixes) — BLOQUANTE
  ↓
Phase 1 (scoring model) + Phase 2 (propagation) — parallélisables
  ↓
Phase 3 (dashboard) — dépend de 1
Phase 4 (feedback) — dépend de 1+2
  ↓
Phase 5 (tests) — dépend de tout
```
