# Agent 3 — SCOREUR — Sécurité, Bonnes Pratiques, Edge Cases

**Complément à :** `03-AGENT-3-SCOREUR.md` + `03b-SCOREUR-DETAILS-IMPLEMENTATION.md`
**Date audit :** 27 mars 2026

---

## 1. AUDIT SÉCURITÉ / CVE

### 12 findings identifiés

| # | Sévérité | Vulnérabilité | Fichier | OWASP |
|---|:--------:|---------------|---------|:-----:|
| **S1** | CRITICAL | **IDOR** — tout utilisateur authentifié peut lire les scores de n'importe quel prospect | `scoreur.controller.ts:18-21` | A01 |
| **S2** | CRITICAL | **Race condition** `isLatest` — 2 scores simultanés créent 2 `isLatest=true` | `prisma-prospect-score.repository.ts:49-71` | A04 |
| **S3** | HIGH | UUID non validé sur `:prospectId` URL param → erreurs Prisma verbose | `scoreur.controller.ts:19` | A03 |
| **S4** | HIGH | Score breakdown complet exposé en API → reverse engineering du modèle | `scoreur.service.ts:87` | A04 |
| **S5** | HIGH | `enrichmentData` JSON non validé → type assertions `as string/number/boolean` | `scoreur.service.ts:42-67` | A03/A08 |
| **S6** | HIGH | **NaN propagation** — dates invalides dans signals → score = NaN | `scoring-engine.ts:175-181` | A04 |
| **S7** | MEDIUM | Pas de politique de rétention des scores (RGPD Art. 5) | `schema.prisma:164-186` | RGPD |
| **S8** | MEDIUM | Décisions automatisées sans garanties RGPD Article 22 | `scoreur.service.ts:92-131` | RGPD |
| **S9** | MEDIUM | Signals non dédupliqués → inflation score par injection | `scoring-engine.ts:159-188` | A04 |
| **S10** | MEDIUM | Pas d'idempotence → scoring double = outreach double | `scoreur.controller.ts:13-16` | A04 |
| **S11** | LOW | Processor BullMQ sans error handling ni timeout | `scoreur.processor.ts:15-22` | A04 |
| **S12** | LOW | Segment coefficient lookup non validé contre les clés connues | `scoring-engine.ts:83` | A03 |

### Fixes recommandés

**S1 — IDOR (CRITICAL)**
```typescript
// Ajouter vérification de propriété
@Get('scores/:prospectId')
async getScores(
  @Param('prospectId', new ParseUUIDPipe()) prospectId: string,
) {
  // En multi-tenant : vérifier que l'utilisateur possède ce prospect
  return this.scoreurService.getScoresByProspectId(prospectId);
}
```

**S2 — Race condition (CRITICAL)**
```sql
-- Option A : Index unique partiel PostgreSQL
CREATE UNIQUE INDEX prospect_scores_one_latest
  ON prospect_scores (prospect_id) WHERE is_latest = true;
```
```typescript
// Option B : Transaction sérialisable
await this.prisma.$transaction(async (tx) => {
  await tx.prospectScore.updateMany({ where: { prospectId, isLatest: true }, data: { isLatest: false } });
  return tx.prospectScore.create({ data: { ... } });
}, { isolationLevel: 'Serializable' });
```

**S5 — enrichmentData non validé (HIGH)**
```typescript
// Ajouter schema Zod avant scoring
const EnrichmentDataSchema = z.object({
  industry: z.string().optional(),
  lighthouseScore: z.number().min(0).max(100).optional(),
  isBankrupt: z.boolean().optional(),
  isCompetitor: z.boolean().optional(),
  signals: z.array(z.object({ type: z.string(), date: z.string(), source: z.string() })).optional(),
}).passthrough();
const parsed = EnrichmentDataSchema.safeParse(enrichmentData);
```

**S6 — NaN propagation (HIGH)**
```typescript
// Valider les dates de signaux et rejeter les dates futures
.filter((s) => {
  const d = new Date(s.date as string);
  return !isNaN(d.getTime()) && d.getTime() <= Date.now();
})
// + Dans calculateSignals :
const daysElapsed = Math.max(0, (Date.now() - signal.date.getTime()) / 86400000);
if (!Number.isFinite(daysElapsed)) continue;
```

**S9 — Déduplication signaux**
```typescript
// Dédupliquer par (type, date, source) avant scoring
const seen = new Set<string>();
const uniqueSignals = signals.filter(s => {
  const key = `${s.type}:${s.date.toISOString()}:${s.source}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
```

**S7+S8 — RGPD**
- Ajouter `onDelete: Cascade` sur la relation ProspectScore → Prospect
- Implémenter un cron de purge : garder uniquement `isLatest=true` + 90 derniers jours
- Documenter la base légale du profilage automatisé (intérêt légitime B2B)
- Ajouter endpoint `/api/prospect/:id/scoring-explanation` pour transparence

---

## 2. BONNES PRATIQUES

### À FAIRE

| # | Pratique | Pourquoi | Implémentation |
|---|---------|----------|----------------|
| BP1 | **Normaliser scores 0-100** + garder breakdown brut | Comparabilité + auditabilité | Déjà fait (clamp 0-100) |
| BP2 | **Décroissance exponentielle** avec half-life par signal | Signaux récents = plus importants | Déjà implémenté dans scoring-engine.ts |
| BP3 | **Seuil plancher** : ignorer signaux < 1 pt après decay | Éviter le bruit de signaux infinitésimaux | `if (decayed < 1.0) continue;` |
| BP4 | **Versioner le modèle** avec migration automatique | Audit trail + rollback | MODEL_VERSION existe mais hardcodé, passer en DB |
| BP5 | **Explainability** : stocker `explanation` textuelle | Sales team comprend le score | Ajouter champ `explanation: string` sur ProspectScore |
| BP6 | **Cache invalidation** quand enrichmentData change | Scores toujours à jour | EventEmitter `prospect.enriched` → rescore |
| BP7 | **Batch rescoring nocturne** pour signal decay | Catégories restent cohérentes | Cron 04:00 pour rescorer prospects avec signaux > 12h |
| BP8 | **A/B testing** avant changement de modèle | Valider que les changements améliorent la conversion | Hash prospectId → control/variant (10% traffic) |
| BP9 | **Données manquantes = neutre** (pas 0) | Ne pas pénaliser l'absence de données | `if (!input.companySize) return 0;` (pas default 5) |

### À NE PAS FAIRE (Anti-patterns)

| # | Anti-pattern | Risque | Détection |
|---|-------------|--------|-----------|
| AP1 | **Score inflation** — ajouter des points sans en retirer | Tous les prospects deviennent HOT | Monitorer avg score MoM : alerte si +5% |
| AP2 | **Overfitting early data** — coefficients calés sur 100 premiers prospects | Modèle non représentatif | Valider distribution segment vs marché attendu |
| AP3 | **Black box scoring** — pas d'explication | Sales team ne fait pas confiance | Toujours stocker breakdown + explanation |
| AP4 | **Magic numbers hardcodés** — seuils dans le code | Changement = redéploiement | Passer tous les seuils en ConfigService ou DB |
| AP5 | **Ignorer la distribution drift** — pas de monitoring | Modèle silencieusement cassé | Drift detection cron toutes les 6h |
| AP6 | **Scorer sur données stales** — enrichment de 6 mois | Score ne reflète plus la réalité | Rescoring nocturne + invalidation sur enrichment update |
| AP7 | **Confondre bon prospect et prêt à acheter** — ICP élevé mais 0 signaux | Outreach sur des prospects pas prêts | Si 0 signaux, cap à WARM maximum |
| AP8 | **Scores absolus** au lieu de relatifs | "HOT" ne veut rien dire si tout le monde est HOT | Ajouter percentile ranking en plus du score |
| AP9 | **Null → 0 au lieu de "inconnu"** — pénaliser les données manquantes | Prospects sous-évalués | Séparer "absent" de "négatif" |

---

## 3. EDGE CASES

### 13 cas limites avec comportement attendu

| # | Scénario | Comportement attendu | Code hint |
|---|---------|---------------------|-----------|
| **E1** | Enrichissement partiel (complétude 40%) | Scorer quand même, flag `isPartial=true`, confidence réduite | `if (completeness < 20) skip; if (< 70) flag partial` |
| **E2** | 0 signaux mais ICP fit élevé (30/35) | WARM max (pas HOT sans signaux d'intent) | `if (signals.length === 0) cap = WARM_THRESHOLD` |
| **E3** | Double scoring rapide (même prospect en < 60s) | Idempotence : retourner le score existant si même `dataHash` | `crypto.createHash('sha256').update(JSON.stringify(relevantFields))` |
| **E4** | Email absent vs email invalide | Absent = malus doux (-10 pas de canal), invalide = disqualification | Séparer `emailStatus: 'absent' | 'bounced' | 'verified'` |
| **E5** | Pas de données INSEE (companySize vide) | Neutre (0 pts), pas default 5 | `if (!input.companySize) return 0;` |
| **E6** | Entreprise change de statut après scoring | Rescore avant dispatch, Rédacteur re-vérifie avant envoi | `checkHardDisqualifications()` avant chaque dispatch |
| **E7** | Multi-contacts même entreprise | Aligner les scores contacts sur le score entreprise max | `companyScore = max(contactScores)` |
| **E8** | Transition catégorie HOT → WARM | Retirer de la queue Rédacteur si en attente, basculer en Nurtureur | `handleCategoryTransition(old, new)` |
| **E9** | Email bounce pendant la séquence | Rescore → DISQUALIFIÉ, annuler emails restants | EventListener `email.bounced` → rescore + cancel jobs |
| **E10** | Signal à 59 jours (juste sous le seuil 60j malus) | Pas de malus (60j = seuil strict), mais signal très décayé | Score ≈ 2-3 pts (quasi-zéro après decay) |
| **E11** | Entreprise très jeune (< 30j, aucune donnée) | Scorer sur ce qui est disponible, confidence faible, rescore quand données arrivent | `confidence: 0.3` si complétude < 30% |
| **E12** | Email catch-all (info@, contact@) | Malus -3 engagement, ne pas marquer comme "verified" | `if (isCatchAllEmail) score -= 3` |
| **E13** | Referral bonus (+10) pousse WARM(72) → HOT_B(82) | Légitime — les referrals convertissent 3x mieux | `if (isReferral) bonus += 10` |

---

## 4. MONITORING & ALERTING

### Métriques de production

| Métrique | Fréquence | Seuil alerte | Action |
|----------|:---------:|:------------:|--------|
| Volume scoring/heure | 5 min | 0 pendant 30 min | CRITICAL → page on-call |
| Queue depth redacteur | 5 min | > 5000 | CRITICAL → scale workers |
| % erreurs scoring | 5 min | > 1% | HIGH → investiguer |
| Score moyen (drift) | Quotidien | ±5% MoM | HIGH → vérifier modèle |
| % HOT (inflation) | Quotidien | > 15% du total | HIGH → ajuster seuils |
| Conversion rate HOT_A | Hebdomadaire | < 15% | HIGH → recalibrer |
| Précision HOT | Mensuel | < 30% | CRITICAL → recalibration urgente |
| Scores stales (> 30j) | Quotidien | > 20% | MEDIUM → lancer batch rescore |
| Complétude enrichissement | Quotidien | < 50% moyenne | MEDIUM → vérifier Agent 2 |

### Dashboard design recommandé

```
┌─────────────────────────────────────────────────────────────┐
│ SCOREUR — Vue Opérationnelle                                │
├──────────┬──────────┬──────────┬──────────┬────────────────┤
│ Scorés   │ HOT %    │ WARM %   │ Score    │ Alertes        │
│ 247/24h  │ 11.2%    │ 38.5%    │ moy: 52  │ 0 critiques    │
├──────────┴──────────┴──────────┴──────────┴────────────────┤
│ Distribution des scores (histogramme)                       │
│ ████░░░░░░░░████████████████░░░░░░░░████████░░░░░░░░       │
│ 0-25 DISQ  25-50 COLD   50-75 WARM   75-100 HOT           │
├─────────────────────────────────────────────────────────────┤
│ Contribution par axe (radar chart)                          │
│   ICP Fit: 24/35  │  Signals: 8/30  │  Tech: 12/20        │
│   Engagement: 8/15 │  Malus: -5      │  Bonus: +3          │
├─────────────────────────────────────────────────────────────┤
│ Top 10 prospects HOT_A (table)                              │
│ Score │ Entreprise │ Segment │ Signaux │ Email              │
│ 94    │ TechCorp   │ startup │ 4       │ verified           │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. PRIORITÉ DE REMÉDIATION

### P0 — Avant production (bloquant)

1. **S1** : IDOR → ParseUUIDPipe + ownership check
2. **S2** : Race condition → unique index partiel `WHERE is_latest = true`
3. **S6** : NaN → validation dates + rejection dates futures
4. **S5** : enrichmentData → Zod schema validation
5. **S3** : UUID validation → ParseUUIDPipe
6. **S10** : Idempotence → dataHash check

### P1 — Avant scale (important)

7. **S4** : Information disclosure → Response DTO limité
8. **S9** : Signal dedup → Set de clés (type, date, source)
9. **S11** : Processor error handling + timeout 30s
10. **S12** : Segment whitelist validation

### P2 — Compliance (RGPD)

11. **S7** : Rétention → purge scores > 90j, onDelete: Cascade
12. **S8** : Article 22 → documenter base légale + endpoint explication
