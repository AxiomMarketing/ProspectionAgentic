# 11 — Roadmap d'Intégration — Semaine par Semaine

## Planning

Ce planning s'intègre dans la **Phase 1 de la roadmap principale** (Pipeline de Données, Semaines 5-10).

```
Semaine A (2 jours)     Semaine B (3 jours)     Semaine C (1 jour)
╔════════════════════╗  ╔════════════════════╗  ╔════════════════════╗
║  FONDATIONS        ║  ║  ADAPTERS          ║  ║  INTÉGRATION       ║
║                    ║  ║                    ║  ║                    ║
║  Docker Reacher    ║  ║  BODACC adapter    ║  ║  Tests E2E         ║
║  Pattern Generator ║  ║  INPI adapter      ║  ║  .env finalisé     ║
║  Reacher Adapter   ║  ║  Email Finder Svc  ║  ║  Documentation     ║
║  Ports/Interfaces  ║  ║  Company Enricher  ║  ║  Smoke test réel   ║
╚════════════════════╝  ╚════════════════════╝  ╚════════════════════╝
```

---

## Semaine A — Fondations (Jour 1-2)

### Jour 1 — Reacher + Pattern Generator (6h)

| # | Tâche | Temps | Livrable |
|---|-------|:-----:|----------|
| A1 | Ajouter Reacher au `docker-compose.dev.yml` | 30min | Container up, healthcheck OK |
| A2 | Créer le port `IEmailVerifierAdapter` | 30min | Interface + types |
| A3 | Implémenter `email-pattern-generator.ts` | 2h | 15 patterns + normalisation accents + tri par taille |
| A4 | Tests unitaires Pattern Generator | 1h | ~15 tests (patterns, accents, tri) |
| A5 | Implémenter `reacher.adapter.ts` | 1.5h | HTTP client + mapping + throttling |
| A6 | Tests unitaires Reacher Adapter | 30min | ~8 tests (mapping, confiance, timeout) |

### Jour 2 — Ports & interfaces données entreprise (4h)

| # | Tâche | Temps | Livrable |
|---|-------|:-----:|----------|
| A7 | Créer le port `ILegalNoticesAdapter` | 30min | Interface BODACC |
| A8 | Créer le port `ICompanyRegistryAdapter` | 30min | Interface INPI |
| A9 | Créer le port `ICompanySearchAdapter` | 30min | Interface Annuaire Entreprises (backup) |
| A10 | Mettre à jour `agent-enrichisseur.module.ts` | 1h | DI de tous les nouveaux adapters |
| A11 | Variables d'environnement + config Zod | 1h | Config validée pour Reacher, INPI |
| A12 | Test d'intégration Reacher (live) | 30min | Vérifier 1 email connu |

**Checkpoint A :** Pattern Generator + Reacher fonctionnels, interfaces définies.

---

## Semaine B — Adapters & Orchestrateurs (Jour 3-5)

### Jour 3 — BODACC + INPI (6h)

| # | Tâche | Temps | Livrable |
|---|-------|:-----:|----------|
| B1 | Implémenter `bodacc.adapter.ts` | 2h | Lookup par SIREN, parsing annonces |
| B2 | Tests unitaires BODACC | 1h | ~10 tests (parsing, types annonces, erreurs) |
| B3 | Implémenter `inpi.adapter.ts` | 2.5h | Auth, dirigeants, financials |
| B4 | Tests unitaires INPI | 30min | ~8 tests (parsing dirigeants, financials, auth) |

### Jour 4 — Orchestrateurs (5h)

| # | Tâche | Temps | Livrable |
|---|-------|:-----:|----------|
| B5 | Implémenter `email-finder.service.ts` | 2h | Waterfall complet avec early termination |
| B6 | Tests unitaires Email Finder | 1h | ~12 tests (waterfall, catch-all, cache, timeout) |
| B7 | Implémenter `company-enricher.service.ts` | 1.5h | Agrégation parallèle + fallback |
| B8 | Tests unitaires Company Enricher | 30min | ~8 tests (agrégation, fallback, graceful degradation) |

### Jour 5 — Intégration dans l'Agent Enrichisseur (4h)

| # | Tâche | Temps | Livrable |
|---|-------|:-----:|----------|
| B9 | Modifier `enrichisseur.service.ts` pour utiliser les nouveaux services | 2h | Remplacement de l'ancien waterfall |
| B10 | Implémenter `annuaire-entreprises.adapter.ts` (backup) | 1h | Fallback INSEE |
| B11 | Mettre à jour le module DI complet | 1h | Tous les providers wired |

**Checkpoint B :** Tous les adapters codés et testés, orchestrateurs fonctionnels.

---

## Semaine C — Intégration & Finalisation (Jour 6)

| # | Tâche | Temps | Livrable |
|---|-------|:-----:|----------|
| C1 | Tests d'intégration live (INSEE + BODACC + INPI) | 1h | Lookup d'un SIREN réel |
| C2 | Test d'intégration Email Finder live | 1h | Trouver l'email d'une personne connue |
| C3 | Mettre à jour `.env.example` | 30min | Toutes les nouvelles variables |
| C4 | Mettre à jour la doc (CLAUDE.md, README) | 30min | Architecture à jour |
| C5 | Smoke test pipeline complet | 1h | 1 prospect enrichi de A à Z |
| C6 | Review code + nettoyage | 1h | PR prête |

**Checkpoint C :** Pipeline enrichissement complet et fonctionnel.

---

## Dépendances & Prérequis

### Avant de commencer

| Prérequis | Action | Temps |
|-----------|--------|:-----:|
| Compte INSEE API | S'inscrire sur [api.insee.fr](https://api.insee.fr/) et générer un token | 10min |
| Compte INPI | S'inscrire sur [data.inpi.fr](https://data.inpi.fr/) | 10min |
| Docker running | `docker compose -f docker-compose.dev.yml up -d` (déjà fait) | — |

### Aucun prérequis pour

- BODACC : pas d'auth nécessaire
- Annuaire Entreprises : pas d'auth nécessaire
- Reacher : container Docker, pas de compte

---

## Métriques de succès

| Métrique | Cible | Comment mesurer |
|----------|:-----:|-----------------|
| Email found rate | ≥ 70% | Sur 20 prospects test, combien d'emails trouvés |
| Email accuracy | ≥ 90% | Sur les emails trouvés, combien sont valides (vérifier manuellement) |
| Company enrichment rate | ≥ 85% | Sur 20 entreprises test, combien enrichies avec ≥3 champs |
| Temps de réponse email | < 60s | Temps total pour trouver un email (15 patterns × 3s max) |
| Temps de réponse entreprise | < 5s | Temps total pour enrichir (3 APIs en parallèle) |
| Tests passing | 100% | `npm test` vert |
