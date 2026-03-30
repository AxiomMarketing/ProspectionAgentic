# 06 — Audit Intégration IA/LLM — Agents Multi-Agents

**Date :** 25 mars 2026
**Scope :** 16 services analysés (10 agents + 6 services support)

---

## Résumé exécutif

| Statut | Count | Agents |
|--------|:-----:|--------|
| Claude intégré et fonctionnel | 4 | Enrichisseur, Scoreur, Analyste, Suiveur (via ResponseClassifier) |
| Claude injecté mais INUTILISÉ | 1 | **Rédacteur** (emails template, pas IA) |
| Implémenté sans IA (correct) | 4 | Veilleur, Nurtureur, Dealmaker, CSM |
| **STUB COMPLET** | 1 | **AppelsOffres** (classe vide) |

---

## Matrice complète

| Agent | Claude injecté ? | Claude appelé ? | Spec IA requise ? | Status |
|-------|:----------------:|:---------------:|:-----------------:|--------|
| 1. Veilleur | Non | Non | Non | ✅ Complet |
| 2. Enrichisseur | Oui | Oui (CLASSIFY_REPLY) | Oui | ✅ Complet |
| 3. Scoreur | Oui | Oui (SCORE_PROSPECT) | Oui | ✅ Complet |
| 4. Rédacteur | **Oui** | **NON** | **OUI** | ⛔ CRITIQUE |
| 5. Suiveur | Indirect | Oui (via ResponseClassifier) | Oui | ✅ Complet |
| 6. Nurtureur | Non | Non | Non | ✅ Complet |
| 7. Analyste | Oui | Oui (ANALYZE_OPPORTUNITY) | Oui | ✅ Complet |
| 8. Dealmaker | Non | Non | Partiel | ⚠️ Partiel |
| 9. AppelsOffres | Non | Non | **OUI** | ⛔ STUB VIDE |
| 10. CSM | Non | Non | Partiel | ⚠️ Partiel |

---

## PROBLÈMES CRITIQUES

### ⛔ P1 — Rédacteur : Claude injecté mais jamais appelé

**Fichier :** `src/modules/agent-redacteur/application/services/redacteur.service.ts`

**Ce que dit la spec :** L'Agent 4 Rédacteur doit utiliser Claude (Sonnet) pour :
- Générer des emails personnalisés basés sur le profil prospect
- Adapter le ton/style selon le segment (PME, startup, collectivité)
- Créer des objets d'email accrocheurs
- Générer des messages LinkedIn InMail
- A/B testing de templates

**Ce qui est implémenté :** Le service crée des `GeneratedMessage` avec du contenu template statique. `LlmService` est injecté dans le constructeur mais **aucune méthode n'appelle Claude**. Les emails envoyés sont des templates, pas de la génération IA.

**Impact :** Le cœur du système de prospection — la personnalisation des emails — ne fonctionne pas. Les emails envoyés sont génériques, pas personnalisés par IA.

**Fix requis :** Implémenter les appels Claude dans `generateMessage()` et `generateLinkedinMessage()` avec des prompts structurés (system prompt + contexte prospect + template de base).

---

### ⛔ P2 — AppelsOffres : Agent entièrement STUB

**Fichier :** `src/modules/agent-appels-offres/application/services/appels-offres.service.ts`

**Ce que dit la spec :** L'Agent 9 AppelsOffres doit :
- Analyser les DCE (Dossiers de Consultation des Entreprises)
- Scorer les appels d'offres (7 axes GO/NO-GO)
- Extraire les exigences du cahier des charges
- Générer le mémoire technique
- Planifier le retroplanning

**Ce qui est implémenté :** La classe est vide — seulement un Logger, ZÉRO méthode. Le controller a des routes (`POST tenders/:id/analyze`, `GET tenders/:id/analysis`) mais elles appellent un service vide.

**Impact :** La fonctionnalité Marchés Publics ne fonctionne pas du tout. La page V4 du dashboard affiche des données mais aucune analyse n'est réalisée.

**Fix requis :** Implémenter les méthodes de scoring, d'analyse DCE, et de génération de mémoire technique avec Claude Opus.

---

### ⚠️ P3 — CSM : calculateSatisfaction() hardcodé à 70

**Fichier :** `src/modules/agent-csm/application/services/csm.service.ts`

**Ce qui est implémenté :** `calculateSatisfaction()` retourne toujours `70` en dur. Le health score utilise cette valeur (poids 30%), ce qui fausse tous les scores clients.

**Fix requis :** Intégrer les données de satisfaction réelles (NPS, feedback, tickets support) ou au minimum calculer depuis les interactions client.

---

### ⚠️ P4 — Dealmaker : Pricing déterministe, pas d'analyse IA

**Fichier :** `src/modules/agent-dealmaker/application/services/dealmaker.service.ts`

**Ce qui est implémenté :** Le pricing est un lookup table statique (6 services × 3 tiers). Pas d'analyse IA du contexte client pour adapter les prix.

**Impact :** Les devis sont standardisés — pas de pricing dynamique basé sur le profil prospect.

---

## CE QUI FONCTIONNE BIEN

### Enrichisseur + ResponseClassifier
- Claude classifie les réponses prospects (positive_interest, negative_interest, question, objection, out_of_office, spam)
- Catégorisation avec score de confiance

### Scoreur
- Claude score les prospects sur les 4 axes (ICP, Signaux, Tech, Engagement)
- Routing automatique HOT → Rédacteur, WARM → Nurtureur

### Analyste
- Claude analyse les opportunités avec recommandation + confiance + raisonnement
- Pattern CQRS (CommandBus + QueryBus)

### Services déterministes (pas besoin de Claude)
- **Veilleur** : détection BOAMP, pre-scoring, dedup — ✅
- **Nurtureur** : séquences, re-engagement, sunset — ✅
- **SequenceOrchestrator** : 5 séquences configurées, business hours — ✅
- **ActionHandler** : routing des réponses par catégorie — ✅
- **EmailPattern** : 15 patterns, optimisation par taille d'entreprise — ✅

---

## ROADMAP IA — Ce qu'il faut implémenter

### Priorité 1 — Rédacteur (CRITIQUE pour la prospection)

```
Tâches :
1. Prompt system pour génération d'emails B2B personnalisés
2. Contexte prospect injecté dans le prompt (entreprise, score, signaux, segment)
3. Templates par segment (PME, startup, collectivité, e-commerce, agence)
4. Routing modèle : Haiku pour brouillons rapides, Sonnet pour final
5. A/B testing : générer 2 variantes, tracker les performances
6. Génération d'objets d'email accrocheurs
7. Génération de messages LinkedIn InMail
```

### Priorité 2 — AppelsOffres (complet à implémenter)

```
Tâches :
1. Service d'analyse de DCE (upload PDF → extraction texte → analyse Claude)
2. Scoring GO/NO-GO 7 axes (Claude Opus pour analyse fine)
3. Extraction d'exigences du cahier des charges
4. Génération du mémoire technique (Claude Opus)
5. Retroplanning automatique (J-31 → J0)
6. Workflow des 7 étapes (9a → 9g)
```

### Priorité 3 — Améliorations

```
- CSM : remplacer le hardcode satisfaction=70 par calcul réel
- Dealmaker : pricing adaptatif basé sur l'analyse IA du contexte
- Veilleur : scoring IA des opportunités (au lieu du pre-score déterministe)
```

---

## Architecture LLM existante

### Adapter Claude (`claude.adapter.ts`)
- SDK `@anthropic-ai/sdk` v0.80.0
- Routing modèle via `MODEL_ROUTING` (Haiku/Sonnet/Opus par type de tâche)
- Budget tracking (daily + monthly limits)
- Fallback mock quand `ANTHROPIC_API_KEY` est vide

### Cost Tracker (`cost-tracker.service.ts`)
- Limites configurables : `LLM_DAILY_BUDGET_EUR=25`, `LLM_MONTHLY_BUDGET_EUR=500`
- Tracking par input/output tokens
- Rejet des requêtes quand budget dépassé

### LLM Service (`llm.service.ts` / `llm.module.ts`)
- Abstraction au-dessus de l'adapter
- Types de tâches : CLASSIFY_REPLY, SCORE_PROSPECT, ANALYZE_OPPORTUNITY, GENERATE_EMAIL, etc.
- Chaque type de tâche est routé vers le bon modèle Claude
