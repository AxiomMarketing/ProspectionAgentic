# Roadmap d'Implémentation en 5 Phases

**Approche :** Validation progressive — chaque phase est conditionnée aux résultats de la précédente.
**Durée totale estimée :** 6-9 mois pour le système complet.
**Principe directeur :** "Valider avant d'automatiser, simplifier avant de scaler."

---

## Phase 0 — Fondations (Semaines 1-4)

**Objectif :** Valider que le funnel de prospection convertit AVANT d'investir dans l'automatisation.

### Semaine 1 : Setup juridique et technique

| Action | Responsable | Livrable | Coût |
|--------|-------------|----------|------|
| Consulter avocat RGPD spécialisé B2B | Jonathan | Avis juridique écrit (base légale, LinkedIn, durée conservation) | 2-3K€ |
| Commander 3 domaines email dédiés | Dev | Domaines achetés + DNS configuré | ~30€ |
| Configurer SPF/DKIM/DMARC sur les 3 domaines | Dev | Vérification via mail-tester.com score >8/10 | 0€ |
| Lancer warm-up email (Instantly.ai ou MailReach) | Dev | Warm-up démarré, 30 jours minimum | ~37$/mois |

### Semaines 2-4 : Test manuel du funnel

| Action | Volume | Tracking |
|--------|--------|----------|
| Identifier 50 prospects cibles (10/segment) | 50 entreprises | Spreadsheet avec critères ICP |
| Scorer manuellement avec le modèle 4 axes | 50 scores | Formules du scoring dans le spreadsheet |
| Rédiger 10 emails personnalisés/jour | ~200 emails total | Sujet, corps, CTA, segment |
| Envoyer via Gmail personnel (PAS cold domain) | 200 envois | Ouvertures, réponses, RDV |
| Logger chaque interaction | ~30 jours | Métriques : open rate, reply rate, RDV rate |

### Critères Go/No-Go (fin semaine 4)

| Métrique | GO | PIVOT | STOP |
|----------|-----|-------|------|
| Taux d'ouverture | > 20% | 10-20% | < 10% |
| Taux de réponse | > 3% | 1-3% | < 1% |
| Rendez-vous obtenus | >= 2 | 1 | 0 |

**Si PIVOT :** Revoir le ciblage (mauvais segment ?) ou le message (pas assez personnalisé ?).
**Si STOP :** Le cold email n'est peut-être pas le bon canal. Explorer : réseau, inbound, partenariats.

### Setup infra (en parallèle)

| Composant | Action | Durée |
|-----------|--------|-------|
| VPS Hetzner CAX21 | Commander + configurer Ubuntu 24.04 | 2h |
| Docker + Docker Compose | Installer + configurer | 1h |
| PostgreSQL 16 | Déployer via Docker, créer DB initiale | 2h |
| Redis 7 | Déployer via Docker | 30min |
| n8n | Déployer via Docker, configurer accès HTTPS | 2h |
| Langfuse | Déployer via Docker (observabilité LLM) | 2h |
| Caddy | Reverse proxy avec auto-TLS | 1h |
| Metabase | Déployer via Docker, connecter à PostgreSQL | 2h |

**Coût Phase 0 :** ~2-3K€ (avocat) + ~100€ (infra + domaines + warm-up)

---

## Phase 1 — Pipeline de Données (Semaines 5-10)

**Objectif :** Automatiser la collecte, l'enrichissement et le scoring des leads.
**Prérequis :** Phase 0 GO validé.

### Semaine 5-6 : Agent 1 - Veilleur (simplifié)

| Sous-agent | Implémentation | Données |
|-----------|---------------|---------|
| 1b Marchés Publics | Cron n8n → API BOAMP → parse JSON → insert PostgreSQL | Marchés numériques (refonte web, SI, accessibilité) |
| 1c Veille Web | Worker TypeScript → Lighthouse CLI + Wappalyzer npm → scan batch nocturne | Performance, stack, accessibilité de 100 sites cibles |
| 1d Job Boards | Worker TypeScript → Crawlee → WTTJ, Indeed | Recrutement dev web actif |
| 1a LinkedIn | **REPORTÉ** — en attente de l'avis juridique RGPD | — |

**Livrables S5-6 :**
- Table `raw_leads` alimentée quotidiennement
- Déduplication par SIRET + nom_entreprise
- Dashboard Metabase avec volume de leads/jour

### Semaine 7-8 : Agent 2 - Enrichisseur

| Sous-agent | Implémentation | Sources |
|-----------|---------------|---------|
| 2b Entreprise | Worker TypeScript → INSEE Sirene API + annuaire-entreprises.data.gouv + BODACC | SIRET, effectifs, CA, statut juridique |
| 2a Contact (simplifié) | Pattern matching email + vérification SMTP (gratuit) | Email décideur par pattern + validation |
| 2c Technique | Coordination avec 1c (skip si scan <30 jours) | Stack, performance, accessibilité |

**Note sur 2a :** En Phase 1, utiliser uniquement le pattern matching gratuit (48% de succès en France pour prenom.nom). Les APIs payantes (Dropcontact, Hunter) sont ajoutées en Phase 2 si le volume justifie l'investissement.

**Livrables S7-8 :**
- Table `prospects` enrichie avec données entreprise + contact
- Score de complétude par prospect
- Métriques d'enrichissement (% de champs remplis)

### Semaine 9-10 : Agent 3 - Scoreur

| Composant | Implémentation |
|-----------|---------------|
| Moteur de scoring | TypeScript pur — modèle 4 axes exactement comme les specs |
| Coefficients par segment | Configuration JSON versionné |
| Décroissance temporelle | Formule half-life sur les signaux |
| Scoring négatif | Hard disqualification + soft malus |
| Catégorisation | HOT/WARM/COLD/DISQUALIFIÉ |
| Cron recalcul | 04:00 UTC quotidien |
| Tests unitaires | Jest — 100% coverage sur le scoring |

**Livrables S9-10 :**
- Scoring fonctionnel avec 4 axes + négatif + coefficients par segment
- Table `prospect_scores` avec historique
- 100% de coverage de tests sur le moteur de scoring
- Dashboard Metabase avec distribution des scores par catégorie

**Coût Phase 1 :** ~50 EUR/mois (infrastructure uniquement — données gratuites)

---

## Phase 2 — Outreach Email (Semaines 11-16)

**Objectif :** Automatiser la génération et l'envoi d'emails personnalisés.
**Prérequis :** Phase 1 complète + domaines email warm-up terminé (30 jours).

### Semaine 11-12 : Agent 4 - Rédacteur (email only)

| Composant | Implémentation |
|-----------|---------------|
| 4a Email Writer | Worker TypeScript + Claude Sonnet 4.6 API |
| 4c Impact Calculator | Formules déterministes (performance, RGAA, attribution) |
| Templates fallback | 5 templates statiques par segment (si Claude échoue) |
| Validation | Longueur sujet, mots spam, hallucination check |
| A/B testing | 2 variantes par segment, tracking des résultats |

### Semaine 13-14 : Agent 5 - Suiveur (email only)

| Composant | Implémentation |
|-----------|---------------|
| 5a Email Sender | Gmail API (OAuth) + Mailgun (fallback) |
| 5c Response Classifier | Gmail Watch (Pub/Sub) + Claude Haiku classification |
| 5d Sequence Manager | BullMQ jobs avec gaps croissants + timezone |
| Domain monitoring | Bounce rate, spam rate par domaine |
| Notifications | Slack webhook pour HOT leads (<5 min SLA) |

### Semaine 15-16 : Intégration et tuning

| Action | Détail |
|--------|--------|
| Intégration end-to-end | Agent 1 → 2 → 3 → 4 → 5 en flux complet |
| Premier envoi réel | 10 emails/jour pendant 1 semaine (montée progressive) |
| Monitoring délivrabilité | mail-tester.com, bounce rate, spam rate |
| Ajustement scoring | Comparer les scores avec les réponses réelles |
| Langfuse review | Vérifier la qualité des générations Claude |

**Coût Phase 2 :** ~150-200 EUR/mois (Claude API + Mailgun + warm-up)

---

## Phase 3 — LinkedIn + Nurturing (Semaines 17-24)

**Objectif :** Ajouter le canal LinkedIn et le nurturing long terme.
**Prérequis :** Phase 2 validée + avis juridique RGPD favorable pour LinkedIn.

### Semaine 17-19 : Agent 1a LinkedIn (si RGPD OK)

| Composant | Implémentation |
|-----------|---------------|
| Veilleur LinkedIn | API conforme RGPD uniquement (PAS de scraping de profils restreints) |
| 4b LinkedIn Writer | Claude Sonnet pour messages LinkedIn |
| 5b LinkedIn Sender | API conforme (à définir selon l'avis juridique) |

**Si l'avis juridique interdit toute automatisation LinkedIn :**
- LinkedIn reste un canal MANUEL (Jonathan envoie les connexions/messages lui-même)
- Le système prépare les messages et Jonathan valide/envoie manuellement
- L'Agent 1a est limité à la veille de signaux publics (posts, articles)

### Semaine 20-22 : Agent 6 - Nurtureur

| Composant | Implémentation |
|-----------|---------------|
| 6a Email Nurture | Séquences comportementales via n8n + Claude |
| 6c Re-Scoreur | Scan mensuel signaux business + engagement |
| Handoff Agent 5 → Agent 6 | Queue BullMQ `nurturer-pipeline` |
| Reclassification → Agent 3 | Queue BullMQ `scoreur-pipeline` |

### Semaine 23-24 : Agent 7 - Analyste (simplifié)

| Composant | Implémentation |
|-----------|---------------|
| 7a Collecteur | Cron SQL quotidien → table `metriques_daily` |
| 7b Rapports | Digest Slack quotidien (sans Claude — données brutes) |
| 7c Anomalies | Z-score sur 5 métriques clés (reply rate, bounce, leads, etc.) |
| Metabase | Dashboards : funnel, performance par segment, coûts |

**Coût Phase 3 :** ~300-400 EUR/mois

---

## Phase 4 — Closing + Appels d'Offres (Mois 6-9)

**Objectif :** Automatiser le closing des deals et la réponse aux appels d'offres.
**Prérequis :** Phase 3 complète + au moins 5 deals en cours.

### Mois 6-7 : Agent 8 - Dealmaker

| Composant | Implémentation |
|-----------|---------------|
| 8a Devis | Puppeteer PDF + Claude pour personnalisation scope |
| 8b Relances | Séquences post-devis J3/J7/J14 |
| 8c Signature | Yousign API V3 |
| Pipeline CRM | 7 étapes dans PostgreSQL (pas de CRM externe au départ) |
| Notifications | Slack pour chaque transition d'étape |

### Mois 7-9 : Agent 9 - Appels d'Offres (projet en soi)

| Composant | Implémentation |
|-----------|---------------|
| 9a Analyseur DCE | PyMuPDF + Claude Vision pour parsing PDF |
| 9b Qualificateur | Score GO/NO-GO sur 7 critères |
| 9c-9e Parallèle | Juriste + Chiffreur + Rédacteur en parallèle |
| 9f QA | Contrôle qualité final |
| 9g Moniteur | Suivi post-dépôt via DECP |

### Agent 10 - CSM (minimal)

| Composant | Implémentation |
|-----------|---------------|
| 10a Onboarding | Séquence email welcome via n8n |
| 10c Satisfaction | Health Score basique (engagement email + feedback) |
| 10b, 10d, 10e | **REPORTÉS** — un spreadsheet suffit pour les 50 premiers clients |

**Coût Phase 4 :** ~600-900 EUR/mois (Yousign, Claude Vision, infra additionnelle)

---

## Timeline Visuelle

```
Mois 1          Mois 2          Mois 3          Mois 4          Mois 5-6        Mois 7-9
|──── Phase 0 ────|──── Phase 1 ─────────────|──── Phase 2 ─────────────|
|  Test manuel    |  Veilleur + Enrichisseur |  Rédacteur + Suiveur     |
|  Juridique RGPD |  + Scoreur               |  (email only)            |
|  Warm-up email  |  (données gratuites)     |                          |
|  Setup infra    |                          |                          |
                                              |──── Phase 3 ─────────────|──── Phase 4 ──────|
                                              |  LinkedIn (si RGPD OK)   |  Dealmaker         |
                                              |  Nurtureur               |  Appels d'offres   |
                                              |  Analyste basique        |  CSM minimal       |
```

---

## Métriques de Succès par Phase

| Phase | Métrique | Cible | Quand évaluer |
|-------|---------|-------|---------------|
| 0 | Taux de réponse test manuel | > 3% | Fin semaine 4 |
| 1 | Leads générés/jour | > 10 | Fin semaine 10 |
| 1 | Taux d'enrichissement | > 60% | Fin semaine 10 |
| 2 | Taux d'ouverture email | > 20% | Fin semaine 16 |
| 2 | Taux de réponse email | > 3% | Fin semaine 16 |
| 3 | Reclassification COLD→HOT | > 5%/mois | Fin semaine 24 |
| 4 | Win rate deals | > 25% | Mois 9 |
| 4 | Cycle time deals | < 45 jours | Mois 9 |

---

*Pour le détail des risques et mitigations, voir `08-RISQUES-MITIGATIONS.md`.*
