# Architecture Détaillée des 10 Agents + 40 Sous-Agents

**Ce document est le référentiel complet** de chaque agent, ses sous-agents, leurs I/O, APIs, tables DB, patterns de communication, et edge cases. Il est basé sur l'analyse exhaustive des specs Axiom et enrichi des découvertes du brainstorm.

---

## Vue d'Ensemble — Inventaire Complet

### Agents et Sous-Agents

| Agent MASTER | Sous-Agents | Total | Budget/mois |
|-------------|-------------|-------|-------------|
| 1 - VEILLEUR | 1a LinkedIn, 1b Marchés, 1c Web, 1d Jobs | 4 | 430€ |
| 2 - ENRICHISSEUR | 2a Contact, 2b Entreprise, 2c Technique | 3 | 278€ |
| 3 - SCOREUR | (monolithique) + Feedback Calibration | 1+1 | 0€ |
| 4 - REDACTEUR | 4a Email, 4b LinkedIn, 4c Impact | 3 | 12€ |
| 5 - SUIVEUR | 5a Email, 5b LinkedIn, 5c Réponses, 5d Séquences | 4 | 150€ |
| 6 - NURTUREUR | 6a Email Nurture, 6b LinkedIn Passif, 6c Re-Scoreur | 3 | 37€ |
| 7 - ANALYSTE | 7a Collecteur, 7b Rapports, 7c Anomalies, 7d Recommandeur | 4 | 50€ |
| 8 - DEALMAKER | 8a Devis, 8b Relances, 8c Signature | 3 | 60€ |
| 9 - APPELS D'OFFRES | 9a DCE, 9b Qualificateur, 9c Juriste, 9d Chiffreur, 9e Rédacteur, 9f QA, 9g Moniteur | 7 | 30€ |
| 10 - CSM | 10a Onboarding, 10b Upsell, 10c Satisfaction, 10d Avis, 10e Referral | 5 | 125-255€ |
| **TOTAL** | | **~40** | **957-1267€** |

### Communication Inter-Agents (Queues BullMQ)

| Queue | Source → Destination | Format | Priorité |
|-------|---------------------|--------|----------|
| `enrichisseur-pipeline` | Agent 1 → Agent 2 | NormalizedLead JSON | Normal |
| `scoreur-pipeline` | Agent 2 → Agent 3, Agent 6c → Agent 3 | EnrichedProspect JSON | Normal/High |
| `redacteur-pipeline` | Agent 3 → Agent 4 | ScoredProspect JSON | HOT=1, WARM=5, COLD=10 |
| `suiveur-pipeline` | Agent 4 → Agent 5 | MessageReadyForDelivery JSON | Par catégorie |
| `nurturer-pipeline` | Agent 5 → Agent 6, Agent 8 → Agent 6 | NurturerHandoff JSON | Normal |
| `dealmaker-pipeline` | Agent 5 → Agent 8, Agent 10b → Agent 8 | DealQualification JSON | High |
| `csm-onboarding` | Agent 8 → Agent 10 | DealToCSM JSON | High |
| `veilleur-pipeline` | Agent 10e → Agent 1 | ReferralLead JSON | High (+40% score) |

### Tables Database Principales (PostgreSQL)

**Core :**
- `prospects` — table centrale, 80+ champs enrichis
- `raw_leads` — leads bruts avant dédup
- `prospect_scores` — historique des scores
- `scoring_coefficients` — paramètres du modèle par segment

**Messages & Envois :**
- `message_templates` — bibliothèque de templates
- `generated_messages` — messages générés par Claude
- `email_sends` — historique des envois email
- `linkedin_actions` — historique des actions LinkedIn

**Réponses & Séquences :**
- `reply_classifications` — réponses classifiées
- `prospect_sequences` — état de chaque séquence par prospect
- `bounce_events` — bounces email

**Nurturing :**
- `nurture_prospects` — prospects en nurturing
- `nurture_interactions` — log d'interactions nurture
- `nurture_emails` — emails nurture envoyés

**Deals :**
- `deals_crm` — pipeline CRM (7 étapes)
- `quotes` — devis générés
- `deal_interactions` — log d'activité deals

**Appels d'Offres :**
- `public_tenders` — suivi marchés publics
- `tender_dce_analysis` — analyses DCE
- `tender_scoring` — scores GO/NO-GO

**CSM :**
- `customers` — données clients
- `customer_health_scores` — snapshots Health Score
- `onboarding_progress` — suivi onboarding
- `referral_tracking` — programme ambassadeur

**Analytics :**
- `metriques_daily` — 60+ métriques/jour
- `alertes` — anomalies détectées
- `recommandations` — recommandations Agent 7

**Compliance :**
- `rgpd_blacklist` — anti-recontact
- `rgpd_deletion_queue` — suppressions planifiées

---

## Détail par Agent — APIs Requises

### Inventaire Complet des APIs Externes

| API | Agent(s) | Coût/mois | Rôle |
|-----|----------|-----------|------|
| **BOAMP** | 1b | Gratuit | Annonces marchés publics |
| **INSEE Sirene** | 2b | Gratuit | Données entreprises (SIRET, effectifs) |
| **data.gouv.fr** | 2b, 9g | Gratuit | BODACC, DECP, annuaire entreprises |
| **Lighthouse CLI** | 1c, 2c | Gratuit | Performance web |
| **Wappalyzer npm** | 1c, 2c | Gratuit | Détection stack technique |
| **axe-core** | 1c, 2c | Gratuit | Audit accessibilité |
| **Netrows** | 1a | 99€ | Signaux LinkedIn |
| **SignalsAPI** | 1a | 99$ | Signaux LinkedIn (complément) |
| **Make.com** | 1a | 29€ | Orchestration LinkedIn workflows |
| **Hunter.io** | 1a, 2a | 49$ | Email finder + domain search |
| **Dropcontact** | 2a | 39€ | Enrichissement email RGPD-compliant |
| **ZeroBounce** | 2a | 16$ | Validation email |
| **Kaspr** | 2a | 79€ | Téléphones LinkedIn |
| **Pappers** | 2b | 25€ | Données légales entreprises |
| **Societe.com** | 2b | 40€ | Données financières (HOT only) |
| **Apify** | 1d | 49$ | Scraping job boards |
| **HasData** | 1d | 50$ | Indeed scraping |
| **WhoisFreaks** | 1d | 29$ | Données domaines |
| **Claude API** | 4a,4b,5c,6a,6b,7b,7d,8a,9a-9e | Variable | Génération, classification, analyse |
| **Gmail API** | 5a,6a,8b | Gratuit | Envoi email (OAuth) |
| **Mailgun** | 5a | ~30€ | Email backup + analytics |
| **Waalaxy** | 5b,6b | ~50€ | Automatisation LinkedIn |
| **Slack API** | Tous | Gratuit | Notifications |
| **Yousign V3** | 8c | 75€+ | Signature électronique |
| **BuiltWith** | 6c | 15€ | Re-scoring tech |
| **Google Custom Search** | 6c | 5€ | Monitoring news |
| **Typeform** | 10c | ~30€ | Enquêtes NPS/CSAT |

**Total APIs externes : 25+ intégrations**

---

## Edge Cases Globaux du Système

### Race Conditions
- **Même prospect soumis 2x à l'Agent 2** : La déduplication utilise un verrou PostgreSQL `SELECT FOR UPDATE` sur le SIRET. Le second job attend que le premier finisse
- **Réponse reçue pendant qu'un email est en cours d'envoi** : Le classificateur (5c) vérifie le statut de la séquence avant d'agir. Si la séquence est déjà stoppée, la réponse est loguée mais pas re-traitée
- **Re-scoring (6c) pendant qu'un score (Agent 3) est en cours** : File d'attente FIFO — le re-scoring attend la fin du scoring initial

### Pannes et Fallbacks
| Composant en panne | Impact | Fallback |
|--------------------|--------|----------|
| Claude API | Pas de génération, pas de classification | Templates statiques + file manuelle |
| Redis | Queues BullMQ mortes | Les jobs sont perdus → restart nécessaire |
| PostgreSQL | Tout le système bloqué | Backup automated + failover |
| Gmail API | Pas d'envoi email | Mailgun prend le relais |
| Waalaxy | Pas d'actions LinkedIn | Pause LinkedIn, email-only |
| BOAMP API | Pas de marchés publics | Données rattrapées au prochain pass |

### Limites de Volume
| Agent | Limite | Raison |
|-------|--------|--------|
| 1a LinkedIn | 4 pass/jour, ~200 signaux/pass | Rate limits APIs |
| 2a Contact | 500 enrichissements/mois | Budget crédits Dropcontact/Hunter |
| 5a Email | 150 emails/jour (3 domaines × 50) | Warmup deliverabilité |
| 5b LinkedIn | 25 connexions + 80 messages/jour | Limites LinkedIn |
| 6b LinkedIn Passif | 40 likes + 15 commentaires/jour | Limites Waalaxy |

---

*Ce document est le référentiel architectural. Pour la stack technique recommandée, voir `06-STACK-TECHNIQUE.md`.*
