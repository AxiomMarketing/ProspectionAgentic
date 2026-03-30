# Documentation Technique des Agents — Index

**Date :** 26 mars 2026
**Objectif :** Documentation d'implémentation technique pour chaque agent, basée sur les specs complètes de `.claude/source-ia/agent/`.

## Points clés

### Routing des données

| Source | Destination | Pourquoi |
|--------|-------------|----------|
| LinkedIn signaux (1a) | → Prospects | Entreprises B2B à prospecter |
| Job Boards (1d) | → Prospects | Signal d'achat (recrute dev = besoin externalisable) |
| Veille Web (1c) | → Prospects | Sites mal optimisés = opportunité |
| Marchés Publics (1b) | → **Marchés Publics** (PAS Prospects) | Appels d'offres, process différent |

### Architecture Master → Sous-agents

Chaque agent numéroté (1-10) est un **Master orchestrateur** qui coordonne des **sous-agents spécialisés** :

```
Agent 1 VEILLEUR (Master)
├── 1a LinkedIn (sous-agent)
├── 1b Marchés Publics (sous-agent)
├── 1c Veille Web (sous-agent)
└── 1d Job Boards (sous-agent)

Agent 2 ENRICHISSEUR (Master)
├── 2a Contact (sous-agent)
├── 2b Entreprise (sous-agent)
└── 2c Technique (sous-agent)

Agent 3 SCOREUR (Master)
├── Modèle de scoring
└── Feedback/Calibration

etc.
```

## Fichiers

| # | Document | Agent | Status |
|---|----------|-------|--------|
| ENV | [Variables d'environnement](./ENV-VARIABLES.md) | Tous (par agent) | Agent 1 fait |
| 01 | [Agent 1 — Veilleur](./01-AGENT-1-VEILLEUR.md) | Master + 4 sous-agents | ✅ Fait |
| 01b | [Veilleur — Sources complètes](./01b-VEILLEUR-SOURCES-COMPLETES.md) | Inventaire sources | ✅ Fait |
| 02 | [Agent 2 — Enrichisseur](./02-AGENT-2-ENRICHISSEUR.md) | Master + 3 sous-agents | ✅ Fait |
| 02b | [Enrichisseur — Détails implémentation](./02b-ENRICHISSEUR-DETAILS-IMPLEMENTATION.md) | APIs, error handlers, algorithmes | ✅ Fait |
| 03 | [Agent 3 — Scoreur](./03-AGENT-3-SCOREUR.md) | Scoring 4 axes + routing + audit | ✅ Fait |
| 03b | [Scoreur — Détails implémentation](./03b-SCOREUR-DETAILS-IMPLEMENTATION.md) | Malus, NAF, feedback, calibration | ✅ Fait |
| 03c | [Scoreur — Sécurité & Bonnes Pratiques](./03c-SCOREUR-SECURITE-BONNES-PRATIQUES.md) | CVE, OWASP, edge cases, monitoring | ✅ Fait |
| 04 | [Agent 4 — Rédacteur](./04-AGENT-4-REDACTEUR.md) | Master + 3 sous-agents + audit 20 bugs | ✅ Fait |
| 04b | [Rédacteur — Détails implémentation](./04b-REDACTEUR-DETAILS-IMPLEMENTATION.md) | Prompts, impact 4 formules, validation 6 checks, LinkedIn, sécurité LLM | ✅ Fait |
| 04c | [Rédacteur — Sécurité & Bonnes Pratiques](./04c-REDACTEUR-SECURITE-BONNES-PRATIQUES.md) | 18 CVE, LCEN, edge cases, monitoring LLM | ✅ Fait |
| 05 | [Agent 5 — Suiveur](./05-AGENT-5-SUIVEUR.md) | Master + 4 sous-agents + audit 23 bugs | ✅ Fait |
| 06 | [Agent 6 — Nurtureur](./06-AGENT-6-NURTUREUR.md) | Master + 3 sous-agents + audit 20 bugs | ✅ Fait |
| 06b | [Nurtureur — Détails implémentation](./06b-NURTUREUR-DETAILS-IMPLEMENTATION.md) | Email behavioral, re-scoring, RGPD, edge cases | ✅ Fait |
| 06c | [Nurtureur — Sécurité & Bonnes Pratiques](./06c-NURTUREUR-SECURITE-BONNES-PRATIQUES.md) | 19 CVE, RGPD/LCEN, edge cases, monitoring nurture | ✅ Fait |
| 07 | [Agent 7 — Analyste](./07-AGENT-7-ANALYSTE.md) | Master + 4 sous-agents + audit 22 bugs | ✅ Fait |
| 07b | [Analyste — Détails implémentation](./07b-ANALYSTE-DETAILS-IMPLEMENTATION.md) | Prisma schema, collecteur, rapports, anomalies, recommandeur, A/B, attribution | ✅ Fait |
| 07c | [Analyste — Sécurité & Bonnes Pratiques](./07c-ANALYSTE-SECURITE-BONNES-PRATIQUES.md) | 25 CVE, 12 BP, 12 anti-patterns, 15 edge cases, RGPD analytics, LLM sécurité, meta-monitoring | ✅ Fait |
| 08 | [Agent 8 — Dealmaker](./08-AGENT-8-DEALMAKER.md) | Master + 3 sous-agents + audit 24 bugs | ✅ Fait |
| 08b | [Dealmaker — Détails implémentation](./08b-DEALMAKER-DETAILS-IMPLEMENTATION.md) | Prisma schema, devis Puppeteer, relances, Yousign API V3, output schemas | ✅ Fait |
| 08c | [Dealmaker — Sécurité & Bonnes Pratiques](./08c-DEALMAKER-SECURITE-BONNES-PRATIQUES.md) | 36 CVE, 16 BP, 15 AP, 20 edge cases, webhook HMAC, Puppeteer sandbox, RGPD contrats 10 ans | ✅ Fait |
| 09 | [Agent 9 — Appels d'Offres](./09-AGENT-9-APPELS-OFFRES.md) | Master + 7 sous-agents + audit 28 bugs (enum mismatch, logique dupliquée) | ✅ Fait |
| 09b | [Appels d'Offres — Détails implémentation](./09b-APPELS-OFFRES-DETAILS-IMPLEMENTATION.md) | 7 tables Prisma, 7 sous-agents détaillés, pipeline séq+parallèle, RETEX, 8 features | ✅ Fait |
| 09c | [Appels d'Offres — Sécurité & Bonnes Pratiques](./09c-APPELS-OFFRES-SECURITE-BONNES-PRATIQUES.md) | 38 CVE (PyMuPDF 9.8, audit trail légal, IDOR), 18 BP, 17 AP, 20 edge cases, conformité juridique CCP | ✅ Fait |
| 10 | [Agent 10 — CSM](./10-AGENT-10-CSM.md) | Master + 5 sous-agents + audit 28 bugs (Health Score faux, N+1, no inter-agent) | ✅ Fait |
| 10b | [CSM — Détails implémentation](./10b-CSM-DETAILS-IMPLEMENTATION.md) | 8 tables Prisma, 5 sous-agents détaillés, 22 messages inter-agents, matrice cross-sell 13 chemins | ✅ Fait |
| 10c | [CSM — Sécurité & Bonnes Pratiques](./10c-CSM-SECURITE-BONNES-PRATIQUES.md) | 32 CVE (N+1 OOM, engagement broken, no error handling), 16 BP, 17 AP, 20 edge cases, RGPD CSM, LLM sécurité | ✅ Fait |

## Source de vérité

Les specs détaillées sont dans `.claude/source-ia/agent/` (47 fichiers, ~1 MB).
Chaque doc technique ici est un **résumé d'implémentation** orienté code, pas une copie de la spec.
