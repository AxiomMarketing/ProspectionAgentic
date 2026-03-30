# Audit Complet — 10 Agents ProspectionAgentic

**Date** : 2026-03-29
**Scope** : 10 modules agents, ~146 fichiers source, ~50 fichiers test, 24 documents techniques
**Méthode** : 5 agents Opus en parallèle (2 agents chacun), comparaison doc technique vs implémentation
**Objectif** : Identifier chaque fonctionnalité documentée non implémentée, chaque implémentation non documentée, et chaque incohérence

---

## Table des Matières

1. [Vue d'Ensemble par Agent](#1-vue-densemble-par-agent)
2. [BLOCKING Issues (13)](#2-blocking-issues-13)
3. [CRITICAL Issues (35)](#3-critical-issues-35)
4. [MODERATE Issues (52)](#4-moderate-issues-52)
5. [INFO / Suggestions (28)](#5-info--suggestions-28)
6. [Agent 1 — Veilleur (Détail)](#6-agent-1--veilleur)
7. [Agent 2 — Enrichisseur (Détail)](#7-agent-2--enrichisseur)
8. [Agent 3 — Scoreur (Détail)](#8-agent-3--scoreur)
9. [Agent 4 — Rédacteur (Détail)](#9-agent-4--rédacteur)
10. [Agent 5 — Suiveur (Détail)](#10-agent-5--suiveur)
11. [Agent 6 — Nurtureur (Détail)](#11-agent-6--nurtureur)
12. [Agent 7 — Analyste (Détail)](#12-agent-7--analyste)
13. [Agent 8 — Dealmaker (Détail)](#13-agent-8--dealmaker)
14. [Agent 9 — Appels d'Offres (Détail)](#14-agent-9--appels-doffres)
15. [Agent 10 — CSM (Détail)](#15-agent-10--csm)
16. [Patterns Cross-Agents](#16-patterns-cross-agents)
17. [Couverture Tests](#17-couverture-tests)
18. [Code Non Documenté](#18-code-non-documenté)
19. [Verdict Final](#19-verdict-final)

---

## 1. Vue d'Ensemble par Agent

| Agent | Sous-agents spec | Implémentés | Complétude | Tests | BLOCKING | CRITICAL | MODERATE | INFO |
|-------|:----------------:|:-----------:|:----------:|:-----:|:--------:|:--------:|:--------:|:----:|
| **1 — Veilleur** | 4 + Master | 4 (Master partiel) | **70%** | 6 fichiers | 1 | 4 | 6 | 3 |
| **2 — Enrichisseur** | 3 + Master | 3 + Master | **85%** | 8 fichiers | 2 | 4 | 5 | 2 |
| **3 — Scoreur** | 1 (monolithique) | 1 | **70%** | 2 fichiers | 1 | 4 | 6 | 1 |
| **4 — Rédacteur** | 3 (4a/4b/4c) | 3 | **75%** | 3 fichiers | 2 | 3 | 8 | 3 |
| **5 — Suiveur** | 4 (5a-5d) | 3 (5b absent) | **80%** | 3 fichiers | 0 | 2 | 6 | 1 |
| **6 — Nurtureur** | 3 (6a/6b/6c) | 2 (6b absent) | **85%** | 6 fichiers | 0 | 3 | 4 | 1 |
| **7 — Analyste** | 4 (7a-7d) | 4 | **80%** | 5 fichiers | 1 | 2 | 4 | 2 |
| **8 — Dealmaker** | 3 (8a-8c) | 3 | **75%** | 6 fichiers | 2 | 5 | 5 | 0 |
| **9 — Appels d'Offres** | 7 (9a-9g) | 7 | **85%** | 10 fichiers | 1 | 3 | 6 | 2 |
| **10 — CSM** | 5 (10a-10e) | 0.2 (scaffold) | **10%** | 1 fichier | 3 | 6 | 4 | 0 |
| **TOTAL** | **37 + 3 Masters** | **30.2** | **~72%** | **50 fichiers** | **13** | **35** | **52** | **28** |

---

## 2. BLOCKING Issues (13)

Issues qui empêchent la mise en production ou représentent un risque critique immédiat.

### B01 — Agent 1 : Master consolidation batch jamais exécuté

- **Fichiers** : `src/modules/agent-veilleur/application/services/deduplication.service.ts`, `pre-scoring.service.ts`, `veilleur.service.ts`
- **Problème** : `DeduplicationService` et `PreScoringService` sont implémentés comme services standalone mais ne sont **jamais appelés** par aucun scheduler ni service. Chaque sous-agent (1a LinkedIn, 1b BOAMP, 1c Web, 1d JobBoards) dispatch ses leads directement vers l'Enrichisseur, bypassing complètement le pipeline Master.
- **Spec** : La doc spécifie 3 consolidation runs (08h, 15h, 21h) où le Master déduplique + fusionne les signaux multi-source + pré-score avant dispatch.
- **Impact** : La fusion multi-source (un prospect détecté par LinkedIn ET Job Board ET Web), le pré-scoring 5 axes, et la déduplication cross-canal ne tournent tout simplement pas. Le bonus multi-source (+10 si 2 sources, +15 si 3+) est du code mort.
- **Fix** : Ajouter des `@Cron` entries dans `agent-scheduler.service.ts` pour `08:00`, `15:00`, `21:00` qui appellent `DeduplicationService.consolidate()` puis `PreScoringService.scoreAll()`, et modifier le dispatch pour passer par le Master plutôt que directement vers l'Enrichisseur.

### B02 — Agent 2 : `segment` non passé à EmailFinderService

- **Fichier** : `src/modules/agent-enrichisseur/application/services/enrichisseur.service.ts:257-283`
- **Problème** : `enrichContact()` appelle `emailFinderService.findEmail(prospect, data)` mais ne passe jamais le `segment` (pme_metro, ecommerce, collectivite, etc.). Or le `DecideurSelectionService` utilise le segment pour déterminer quel décideur chercher (CMO pour ecommerce, DG pour PME, DSI pour collectivité).
- **Impact** : Le fallback Hunter domain search ne peut pas trouver le bon décideur car il ne sait pas quel département/rôle chercher. Pour les prospects sans contact pré-identifié, la découverte d'email est non-fonctionnelle.
- **Fix** : Passer `segment` comme 3ème paramètre à `findEmail()`, le récupérer depuis `data.segment ?? enrichmentData.segment ?? 'pme_metro'`.

### B03 — Agent 2 : mergeWithExisting() signal fusion absente

- **Fichier** : `src/modules/agent-enrichisseur/infrastructure/jobs/enrichisseur.processor.ts:56-73`
- **Problème** : Quand le processor trouve un prospect existant par SIREN ou domaine (lignes 60-72), il réutilise ce prospect mais ne fusionne PAS les nouveaux signaux du RawLead entrant. La doc spécifie une logique détaillée de fusion : incrémenter `nb_detections`, merger le tableau `signals`, mettre à jour `lastDetectedAt`, appliquer le bonus multi-source.
- **Impact** : L'intelligence multi-source est entièrement perdue. Si un prospect est détecté par LinkedIn puis par BOAMP, le deuxième signal est ignoré.
- **Fix** : Implémenter `mergeWithExisting(existingProspect, newRawLead)` qui fusionne `signals[]`, incrémente `nb_detections`, met à jour les dates.

### B04 — Agent 3 : Race condition sur `isLatest`

- **Fichier** : `src/modules/agent-scoreur/infrastructure/repositories/prisma-prospect-score.repository.ts:49-71`
- **Problème** : La transaction Prisma utilise l'isolation par défaut (pas `Serializable`). Pas de `CREATE UNIQUE INDEX ON prospect_scores (prospect_id) WHERE is_latest = true`. Deux scores concurrents pour le même prospect peuvent créer deux enregistrements `isLatest=true`.
- **Impact** : Le dashboard et les requêtes qui filtrent sur `isLatest=true` retournent des résultats incohérents ou dupliqués.
- **Fix** : (1) Ajouter dans une migration : `CREATE UNIQUE INDEX idx_prospect_score_latest ON "ProspectScore" ("prospectId") WHERE "isLatest" = true;` (2) Utiliser `$transaction({ isolationLevel: 'Serializable' })`.

### B05 — Agent 4 : LCEN footer absent sur les emails générés

- **Fichier** : `src/modules/agent-redacteur/application/services/redacteur.service.ts`
- **Problème** : Les emails générés par le Rédacteur ne contiennent aucun footer LCEN obligatoire. Pas de SIRET, pas d'adresse postale, pas de lien de désinscription.
- **Spec** : La doc sécurité `04c-REDACTEUR-SECURITE-BONNES-PRATIQUES.md` identifie ceci comme finding S2 CRITICAL.
- **Impact** : **Violation légale directe**. La LCEN (Loi pour la Confiance dans l'Économie Numérique) impose ces informations sur tout email commercial. Amende de 750 EUR par email non conforme.
- **Fix** : Ajouter un footer déterministe (comme celui du Suiveur `suiveur.service.ts:30-35`) à la fin de chaque email généré, AVANT persistance en DB.

### B06 — Agent 4 : stepNumber hardcodé à 1

- **Fichier** : `src/modules/agent-redacteur/infrastructure/repositories/prisma-generated-message.repository.ts:53`
- **Problème** : Le repository écrit toujours `stepNumber: 1` en dur. L'entité `GeneratedMessage` n'a même pas de champ `stepNumber`. La doc 04b spécifie 4 steps (premier contact, relance 1, relance 2, break-up) avec des limites de mots et angles différents.
- **Impact** : Les séquences multi-step sont impossibles. Seul le premier email est généré, aucune relance.
- **Fix** : (1) Ajouter `stepNumber` à l'entité `GeneratedMessage`, (2) Le passer en paramètre depuis le DTO/service, (3) L'écrire dynamiquement dans le repository.

### B07 — Agent 7 : Pas de Redis distributed cron lock

- **Fichiers** : `src/modules/agent-analyste/application/services/metrics-collector.service.ts`, `anomaly-detector.service.ts`, `report-generator.service.ts`, `recommender.service.ts`
- **Problème** : Les 4 sous-agents ont des `@Cron()` decorators mais aucun lock distribué. En déploiement multi-pod (Docker Swarm, K8s), chaque pod exécutera chaque cron indépendamment.
- **Impact** : Snapshots métriques dupliqués, double coût LLM (rapports Claude générés N fois), alertes Slack dupliquées, recommandations dupliquées. Corruption potentielle des données.
- **Fix** : Utiliser `@nestjs/schedule` avec un Redis lock (`bullmq` ou `redlock`) : acquérir un lock avant chaque cron, release après exécution.

### B08 — Agent 8 : Webhook Yousign sans idempotence

- **Fichier** : `src/modules/agent-dealmaker/application/services/yousign.service.ts:381-528`
- **Problème** : Les 4 handlers webhook (`signature_request.done`, `.expired`, `.canceled`, `signer.done`) ne vérifient pas si le webhook a déjà été traité. Pas de table `WebhookEvent` pour déduplication.
- **Spec** : La doc `08c-DEALMAKER-SECURITE-BONNES-PRATIQUES.md` identifie ceci comme S3/BP3.
- **Impact** : Un replay de webhook (fréquent chez Yousign) déclenche : double transition du deal vers GAGNE, double dispatch vers le CSM, double téléchargement du PDF signé. Corruption de données en production.
- **Fix** : (1) Créer une table `WebhookEvent(id, provider, eventId, processedAt)`, (2) Avant chaque traitement, vérifier `findFirst({ where: { eventId } })`, (3) Si existant, retourner 200 sans traitement.

### B09 — Agent 8 : Processor ne délègue pas les jobs

- **Fichier** : `src/modules/agent-dealmaker/infrastructure/jobs/dealmaker.processor.ts:57-63`
- **Problème** : Le processor gère correctement `advance-stage` (appel à `dealmakerService.advanceStage`). Mais pour `create-deal`, `generate-quote`, `follow-up`, `sign-contract`, `check-timeout`, `send-reminder`, il ne fait que logger un message (`this.logger.log(...)`) sans jamais appeler le service correspondant.
- **Impact** : **Le pipeline asynchrone complet est cassé**. Les relances programmées (J3/J7/J14) ne s'exécutent jamais. Les rappels de signature ne partent jamais. La génération de devis via queue ne fonctionne pas. La vérification de timeout ne tourne pas.
- **Fix** : Ajouter dans chaque `case` l'appel au service correspondant :
  - `create-deal` → `this.dealmakerService.createDeal(data)`
  - `generate-quote` → `this.quoteGeneratorService.generateQuote(data.dealId, data)`
  - `follow-up` → `this.dealFollowUpService.processFollowUp(data.dealId, data.step)`
  - `sign-contract` → `this.yousignService.createSignatureProcess(data.dealId)`
  - `check-timeout` → `this.dealFollowUpService.checkTimeoutDeals()`
  - `send-reminder` → `this.yousignService.sendReminder(data.signatureRequestId)`

### B10 — Agent 9 : Docker sandbox PyMuPDF absent

- **Fichier** : `src/modules/agent-appels-offres/application/services/dce-analyzer.service.ts:290-294`
- **Problème** : La méthode `downloadAndExtractDce()` retourne un string placeholder `"[DCE text extracted from...]"`. Aucun Docker service, aucun microservice sandboxé, aucune isolation réseau.
- **Spec** : CVE-2026-0006 (CVSS 9.8) documenté dans `10-AUDIT-SECURITE-CVE.md` et `09c-APPELS-OFFRES-SECURITE-BONNES-PRATIQUES.md`. PyMuPDF SANS PATCH nécessite un sandbox Docker obligatoire.
- **Impact** : (1) L'extraction PDF est non-fonctionnelle — l'analyse DCE opère sur un placeholder, pas sur le vrai document. (2) Si l'extraction est implémentée sans sandbox, risque d'exécution de code à distance via PDF malveillant.
- **Fix** : Créer un microservice Docker dédié `pdf-extractor` avec `pymupdf` dans un container isolé (pas d'accès réseau sortant, pas de volumes montés), exposant un endpoint HTTP interne `/extract` qui accepte un PDF et retourne le texte.

### B11 — Agent 10 : Aucune documentation technique

- **Répertoire** : `.claude/docs/10-AGENTS-TECHNIQUE/` — aucun fichier 10-AGENT-10-CSM.md
- **Problème** : L'index `00-INDEX.md` ne référence que les agents 1-9. Pas de doc principale, pas de détails d'implémentation, pas d'audit sécurité/bonnes pratiques.
- **Specs disponibles** : `.claude/source-ia/agent/AGENT-10-MASTER.md`, `AGENT-10a-ONBOARDING.md`, `AGENT-10b-UPSELL.md`, `AGENT-10c-SATISFACTION.md`, `AGENT-10d-AVIS.md`, `AGENT-10e-REFERRAL.md` (~2500+ lignes de spécifications).
- **Impact** : Impossible de valider la conformité, la sécurité, les edge cases. Les 5 sous-agents spécifiés n'ont pas de feuille de route technique.
- **Fix** : Suivre le même processus que les agents 1-9 : créer `10-AGENT-10-CSM.md` (architecture + bugs), `10b-CSM-DETAILS-IMPLEMENTATION.md` (sous-agents), `10c-CSM-SECURITE-BONNES-PRATIQUES.md` (CVE + BP + AP + edge cases).

### B12 — Agent 10 : Schema DealToCSM incompatible avec Agent 8

- **Fichiers** : `src/modules/agent-csm/application/dtos/onboard-customer.dto.ts`, `src/modules/agent-csm/infrastructure/jobs/csm.processor.ts:24`
- **Problème** : Le DTO `OnboardCustomerDto` accepte uniquement `{ companyName: string, mrrEur: number, plan: string }`. Or l'Agent 8 (`dealmaker.service.ts:117-131`) dispatch un objet riche `DealToCSM` contenant `prospect`, `entreprise`, `contrat` (avec détails du deal, montant, services, contacts).
- **Le processor** (ligne 24) vérifie `companyName && mrrEur > 0` et defere sinon.
- **Impact** : La majorité des deals réels envoyés par l'Agent 8 seront "deferred" car la structure ne correspond pas. L'onboarding ne se déclenchera jamais automatiquement.
- **Fix** : Aligner le DTO et le processor sur l'interface `DealToCSM` définie dans la spec `AGENT-10-MASTER.md`.

### B13 — Agent 10 : 10% implémenté — agent non fonctionnel

- **Fichiers** : Tout `src/modules/agent-csm/`
- **Problème** : Sur 5 sous-agents spécifiés (10a Onboarding, 10b Upsell, 10c Satisfaction, 10d Avis, 10e Referral), seul un scaffold basique existe :
  - `onboardCustomer()` : crée un customer et émet un event, mais pas de welcome email, pas de plan onboarding, pas de scheduling, pas de TTV monitoring, pas de risk detection.
  - `calculateHealthScore()` : formule 40/30/30 simplifiée (engagement = count events au lieu de 5 indicateurs composites).
  - `predictChurn()` : 2 signaux sur 7 spécifiés.
  - 10b Upsell : 0%
  - 10d Avis : 0%
  - 10e Referral : 0%
- **Impact** : L'agent CSM est non fonctionnel. Aucun client gagné ne reçoit d'onboarding, de suivi satisfaction, de détection de churn, de collecte d'avis ou de programme de parrainage.
- **Fix** : Suivre le processus complet : documentation → audit → implémentation APEX avec Agent Teams.

---

## 3. CRITICAL Issues (35)

Issues fortement recommandées pour la mise en production.

### Agent 1 — Veilleur

**C01** — Contact LinkedIn (personName/personRole) jamais peuplé
- **Fichiers** : `src/modules/agent-veilleur/infrastructure/adapters/linkedin/netrows.adapter.ts`, `signals-api.adapter.ts`
- **Problème** : L'interface `LinkedInSignal` a les champs `personName` et `personRole` mais aucun adapter ne les peuple. Netrows retourne des données entreprise (job changes, headcount) pas des données de contact individuel.
- **Impact** : En aval, l'Enrichisseur ne peut pas identifier le décideur à contacter. Le champ `contactName` reste vide.
- **Fix** : Soit enrichir les adapters LinkedIn pour extraire le nom/rôle du contact (si disponible dans l'API), soit documenter cette limitation et s'appuyer sur le `DecideurSelectionService` de l'Agent 2.

**C02** — Filtrage CPV codes BOAMP absent
- **Fichier** : `src/modules/agent-veilleur/infrastructure/adapters/boamp.adapter.ts`
- **Problème** : La doc spécifie un filtrage par codes CPV (72212200, 72212216, 72260000, etc.) pour ne retenir que les marchés pertinents pour Axiom. L'adapter utilise uniquement une recherche keyword sur le champ `objet`.
- **Impact** : Des marchés non pertinents (BTP, fournitures, restauration) polluent le pipeline et gaspillent des ressources d'enrichissement.
- **Fix** : Ajouter un paramètre `refine=cpv:72212200 OR cpv:72212216 OR ...` dans la requête Opendatasoft, ou filtrer les résultats en post-traitement par code CPV.

**C03** — BOAMP estimatedValue toujours `undefined`
- **Fichier** : `src/modules/agent-veilleur/infrastructure/adapters/boamp.adapter.ts:127`
- **Problème** : Le commentaire dit "Not directly available in top-level fields". `estimatedValue` est toujours `undefined`.
- **Impact** : L'axe MONTANT (25% du pré-scoring selon la doc) est perdu. Tous les marchés ont un score MONTANT de 0. Le `PublicTender.estimatedAmount` est toujours null.
- **Fix** : Parser le champ `donnees` ou `lots` de la réponse BOAMP pour extraire le montant estimé.

**C04** — DeduplicationService + PreScoringService sans tests
- **Fichiers** : `src/modules/agent-veilleur/application/services/deduplication.service.ts`, `pre-scoring.service.ts`
- **Problème** : La logique Levenshtein, le matching SIREN, les 5 axes de pré-scoring, et le bonus multi-source n'ont aucun test unitaire.
- **Impact** : Algorithmes critiques non vérifiés. Les seuils de Levenshtein (0.85) et les pondérations des axes pourraient être incorrects sans qu'on le sache.

### Agent 2 — Enrichisseur

**C05** — `EnrichisseurProcessor` sans tests
- **Fichier** : `src/modules/agent-enrichisseur/infrastructure/jobs/enrichisseur.processor.ts`
- **Problème** : Le point d'entrée du pipeline (extraction rawData, déduplication 3 niveaux, création prospect) n'a aucun test.
- **Impact** : L'extraction de `companyName/entrepriseNom/nomacheteur` depuis le rawData JSON dépend de conventions de nommage fragiles. Un changement dans le format des RawLeads cassera silencieusement le pipeline.

**C06** — `EmailFinderService` waterfall complet sans tests
- **Fichier** : `src/modules/agent-enrichisseur/application/services/email-finder.service.ts`
- **Problème** : Le waterfall Reacher → Hunter n'a aucun test unitaire. La logique catch-all detection, confidence scoring, et fallback n'est pas vérifiée.

**C07** — `CompanyEnricherService` orchestration sans tests
- **Fichier** : `src/modules/agent-enrichisseur/application/services/company-enricher.service.ts`
- **Problème** : L'orchestration de 4 adapters (INSEE + Pappers + INPI + BODACC) avec priorité de source et alertes financières n'a aucun test.

**C08** — Spamtrap/abuse/disposable email non filtré
- **Fichier** : `src/modules/agent-enrichisseur/application/services/email-finder.service.ts`
- **Problème** : Reacher retourne `is_disposable` et `is_role_account` mais ces champs sont ignorés. Un email `info@`, `contact@`, ou une adresse jetable peut être retenu.
- **Impact** : Risque de blacklistage du domaine d'envoi, taux de bounce élevé.
- **Fix** : Rejeter les emails où `is_disposable=true` ou `is_role_account=true` et passer au fallback Hunter.

### Agent 3 — Scoreur

**C09** — 17 champs `ScoringInput` définis mais jamais peuplés
- **Fichier** : `src/modules/agent-scoreur/application/services/scoreur.service.ts:77-97`
- **Problème** : L'interface `ScoringInput` dans `scoring-engine.ts` définit 17+ champs (nafCode, jobTitle, stackObsolete, rgaaViolationsCritical, rgaaCompliant, caAnnuel, croissanceCaPct, effectifEnBaisse, emailCatchAll, emailPersonnel, decideurIdentifie, completudePct, bodaccNegatif, ecommercePlatform, hasAppelOffre, isReferral, entrepriseFermee). La méthode `buildScoringInput()` dans `scoreur.service.ts` ne lit **aucun** de ces champs depuis le prospect ou enrichmentData.
- **Impact** : La vaste majorité du modèle de scoring est du code mort. Les soft malus (emailCatchAll -8, bodaccNegatif -15), les segment bonuses (ecommercePlatform +12), et les hard disqualifications (entrepriseFermee) ne fonctionnent jamais.
- **Fix** : Mapper chaque champ depuis `prospect.enrichmentData` dans `buildScoringInput()`.

**C10** — IDOR sur GET /scores — pas de vérification ownership
- **Fichier** : `src/modules/agent-scoreur/presentation/controllers/scoreur.controller.ts:30-31`
- **Problème** : L'endpoint `GET /agents/scoreur/prospects/:prospectId/scores` valide le format UUID mais ne vérifie PAS que l'utilisateur authentifié a le droit d'accéder à ce prospect.
- **Impact** : Tout utilisateur avec un JWT valide peut lire les scores de n'importe quel prospect.
- **Fix** : Pour un déploiement single-tenant (Axiom only), documenter cette limitation. Pour multi-tenant, ajouter un filtre `organizationId`.

**C11** — `segment` stocke la catégorie au lieu du segment business
- **Fichier** : `src/modules/agent-scoreur/application/services/scoreur.service.ts:114`
- **Problème** : `result.category` (ex: "HOT_A") est écrit dans la colonne `segment` du ProspectScore. Le ScoreResponseDto expose ce champ comme `segment`.
- **Impact** : Les consommateurs en aval qui cherchent le segment business (pme_metro, ecommerce, collectivite) reçoivent "HOT_A" à la place.
- **Fix** : Écrire `result.category` dans un champ `category` dédié, et le segment business dans `segment`.

**C12** — 2 soft malus manquants vs spec
- **Fichier** : `src/modules/agent-scoreur/application/services/scoring-engine.ts:356-391`
- **Problème** : La doc 03 spécifie 6 malus originaux. Le code implémente les 9 nouveaux malus de 03b mais perd 2 originaux : `!emailVerified` standalone (-5) et `all signals > 60 days` (-15).
- **Fix** : Réintégrer les 2 malus dans `calculateSoftMalus()`.

### Agent 4 — Rédacteur

**C13** — Few-shot examples définis mais jamais injectés dans l'appel LLM
- **Fichier** : `src/modules/agent-redacteur/application/services/prompt-templates.ts:121-325`
- **Problème** : 325 lignes de `FEW_SHOT_EXAMPLES` avec 10 exemples (2 par segment) sont définies mais **jamais importées** par `redacteur.service.ts`. L'appel `llmService.call()` ne prend que `systemPrompt` et `userPrompt`, pas de messages user/assistant.
- **Impact** : Le LLM opère sans exemples de référence, dégradant significativement la qualité et la cohérence des emails générés. Code mort de 325 lignes.
- **Fix** : (1) Importer `FEW_SHOT_EXAMPLES` dans le service, (2) Injecter les exemples du segment courant dans le prompt via un format `### Exemples de référence:\n{examples}`.

**C14** — Validation checks 4+5 (hallucination/personnalisation) ne tournent jamais
- **Fichier** : `src/modules/agent-redacteur/application/services/redacteur.service.ts:141`
- **Problème** : `this.messageValidator.validate(subject, body)` est appelé SANS les paramètres `inputData`, `prospectName`, `companyName`. Les checks 4 (hallucination — vérifie que les chiffres d'impact sont dans les données d'entrée) et 5 (personnalisation — vérifie que le nom/entreprise sont mentionnés) **ne s'exécutent jamais** car les données de référence sont undefined.
- **Impact** : Des emails avec des chiffres inventés et sans personnalisation passent la validation.
- **Fix** : Passer les paramètres manquants : `this.messageValidator.validate(subject, body, { enrichmentData, companyName, prospectName })`.

**C15** — IDOR — tout utilisateur authentifié génère pour n'importe quel prospect
- **Fichiers** : `src/modules/agent-redacteur/presentation/controllers/redacteur.controller.ts`, `redacteur.service.ts`
- **Problème** : Identique au Scoreur C10. Pas de vérification ownership.

### Agent 5 — Suiveur

**C16** — `suiveur.service.ts` sans aucun test unitaire
- **Fichier** : `src/modules/agent-suiveur/application/services/suiveur.service.ts`
- **Problème** : Le service principal (10+ méthodes : executeStep, detectResponses, processReply, scheduleNextStep, checkEligibility, checkEmailFrequency, appendLcenFooter) n'a **aucun test**.
- **Impact** : Le coeur du pipeline d'envoi email est non testé. Les gates RGPD, le rate limiting, le footer LCEN, la détection de réponses pourraient avoir des bugs silencieux.

**C17** — `providerMessageId` non stocké
- **Fichier** : `src/modules/agent-suiveur/application/services/suiveur.service.ts:120-122`
- **Problème** : `markAsSent()` est appelé mais l'ID du message retourné par Gmail/Mailgun n'est pas extrait ni persisté.
- **Impact** : Le matching des webhooks Mailgun (delivered, opened, bounced) par `providerMessageId` est impossible. Le tracking dépend uniquement du matching par sujet email, qui est fragile.

### Agent 6 — Nurtureur

**C18** — JwtAuthGuard absent sur le controller
- **Fichier** : `src/modules/agent-nurtureur/presentation/controllers/nurtureur.controller.ts`
- **Problème** : Aucun `@UseGuards(JwtAuthGuard)` sur le controller. Les endpoints `POST /start`, `POST /pause/:id`, `POST /reactivate/:id`, `GET /status/:id` sont accessibles publiquement.
- **Impact** : N'importe qui peut démarrer/pauser/réactiver des séquences de nurture et lire le statut.
- **Fix** : Ajouter `@UseGuards(JwtAuthGuard)` au niveau de la classe, avec `@Public()` uniquement sur le webhook Mailgun.

**C19** — RGPD gates de durée non différenciées par consentBasis
- **Fichier** : `src/modules/agent-nurtureur/application/services/nurtureur.service.ts`
- **Problème** : La doc spécifie des durées max différentes selon la base légale : 30j pour consentement, 90j pour intérêt légitime, 180j pour pré-contractuel. Le code ne vérifie que le sunset global à 180j.
- **Impact** : Des prospects COLD (consentement) qui devraient être sunset à 30j restent dans le nurture pendant 180j. Violation RGPD.
- **Fix** : Dans `checkSunset()`, ajouter : `if (consentBasis === 'consent' && daysInNurture > 30)` → sunset, `if (consentBasis === 'legitimate_interest' && daysInNurture > 90)` → sunset.

**C20** — Re-permission WARM 90 jours absente
- **Problème** : La doc spécifie qu'à J85 pour les prospects WARM (intérêt légitime), un email de re-permission doit être envoyé avec lien resubscribe/unsubscribe. Si pas de réponse à J90, sunset automatique.
- **Impact** : Non-conformité RGPD pour la base légale "intérêt légitime" qui nécessite un renouvellement périodique.

### Agent 7 — Analyste

**C21** — Slack alerts WARNING/CRITICAL sur le même webhook
- **Fichier** : `src/modules/agent-analyste/application/services/anomaly-detector.service.ts:224-260`
- **Problème** : Toutes les alertes (WARNING et CRITICAL) partent vers `SLACK_WEBHOOK_URL`. La doc spécifie : WARNING → `#pipeline-metrics`, CRITICAL → `#alerts-critical` + DM Jonathan.
- **Impact** : Jonathan n'est pas alerté en temps réel pour les problèmes critiques. Les alertes se noient dans le bruit.
- **Fix** : Ajouter `SLACK_CRITICAL_WEBHOOK_URL` et `SLACK_JONATHAN_USER_ID` dans les env vars. Router les CRITICAL vers les deux canaux.

**C22** — Pas de rate limiting sur les alertes Slack
- **Fichier** : `src/modules/agent-analyste/application/services/anomaly-detector.service.ts`
- **Problème** : La doc sécurité 07c S7 spécifie max 10 alertes/heure et cooldown 24h par métrique. Le code envoie une alerte par anomalie détectée sans limite.
- **Impact** : 15 anomalies simultanées = 15 messages Slack. Fatigue d'alertes, désensibilisation de Jonathan, risque de rate limit Slack API.
- **Fix** : Ajouter un Redis counter par heure avec TTL, et un cooldown set par métrique avec TTL 24h.

### Agent 8 — Dealmaker

**C23** — Pas de Redis distributed cron lock sur timeout 45j
- **Fichier** : `src/modules/agent-dealmaker/application/services/deal-followup.service.ts:398-425`
- **Problème** : `@Cron('0 6 * * *')` vérifie les deals inactifs >45j et les marque PERDU. Sans lock distribué, multi-pod = double `markLost`.
- **Impact** : Double dispatch vers le Nurtureur, double événement `deal.closed`.

**C24** — Pas de notifications Slack à Jonathan
- **Problème** : La doc 08 B12 spécifie des notifications Slack pour : deal gagné, devis envoyé, escalade objection, événements signature. Aucune notification n'est implémentée.
- **Impact** : Jonathan n'a aucune visibilité temps réel sur l'activité commerciale.

**C25** — Pas de formulaire Slack interactif pour notes RDV
- **Problème** : La doc 08 G6 spécifie un formulaire Slack Block Kit Modal pour que Jonathan saisisse les notes de rendez-vous de découverte. Il doit actuellement appeler l'API manuellement.
- **Impact** : Gap UX majeur. L'adoption du système par Jonathan dépend de l'ergonomie Slack.

**C26** — Pas d'optimistic locking sur les deals
- **Fichier** : `src/modules/agent-dealmaker/application/services/dealmaker.service.ts:86-134`
- **Problème** : Deux appels `advanceStage` concurrents sur le même deal (ex: via webhook + API) peuvent produire un état incohérent. Pas de champ `version` ni de `WHERE version = expected`.
- **Impact** : Un deal peut être avancé deux fois, ou un GAGNE peut être suivi d'un PERDU sans cohérence.
- **Fix** : Ajouter un champ `version` (Int, auto-increment) sur DealCrm, et dans la transaction, `WHERE id = :id AND version = :expected`.

**C27** — Tracking pixel endpoint sans `Content-Type: image/gif`
- **Fichier** : `src/modules/agent-dealmaker/presentation/controllers/dealmaker.controller.ts:107-113`
- **Problème** : Le handler retourne un `Buffer` (le GIF 1x1 transparent) mais ne set pas le header `Content-Type: image/gif`. NestJS envoie `application/octet-stream` par défaut.
- **Impact** : Les clients email (Gmail, Outlook) ne rendent pas le pixel car le MIME type est incorrect. Le tracking d'ouverture de devis est complètement cassé.
- **Fix** : Ajouter `@Header('Content-Type', 'image/gif')` sur le handler, ou `res.set('Content-Type', 'image/gif').send(buffer)`.

### Agent 9 — Appels d'Offres

**C28** — Transfer GAGNE → Agent 8/10 via BullMQ non implémenté
- **Fichier** : `src/modules/agent-appels-offres/application/services/moniteur.service.ts:178-199`
- **Problème** : Quand un appel d'offres est gagné, le code log l'intention de transférer mais ne dispatch JAMAIS un job vers `dealmaker-pipeline` ou `csm-onboarding`.
- **Impact** : Un marché gagné ne déclenche jamais la signature de contrat (Agent 8) ni l'onboarding client (Agent 10).
- **Fix** : Injecter les queues BullMQ et dispatcher : `this.dealmakerQueue.add('create-deal', { tenderId, ... })`.

**C29** — Système d'alertes deadline absent
- **Problème** : La doc spécifie un cron quotidien (8h) qui vérifie les deadlines de soumission et envoie des alertes Slack à J-5, J-3, J-1. Aucun scheduler n'existe.
- **Impact** : Une deadline manquée en marchés publics = disqualification automatique sans exception ni recours. Un seul oubli peut coûter un marché de plusieurs dizaines de milliers d'euros.
- **Fix** : Ajouter un `@Cron('0 8 * * *')` dans `MoniteurService` qui query les tenders avec `status IN ('ANALYZING', 'QUALIFIED', ...)` et `deadlineDate` dans les 5 prochains jours.

**C30** — Audit trail append-only absent
- **Problème** : Re-analyse d'un appel d'offres écrase l'enregistrement `aoAnalyse` existant. Pas de table `TenderAnalysisHistory`.
- **Spec** : La doc 09c BP15 spécifie un trail append-only avec userId, prompt hash, model version, HMAC. Requis pour la conformité au Code de la commande publique.
- **Fix** : Créer une table `AoAnalyseHistory` et y copier l'enregistrement existant avant chaque mise à jour.

### Agent 10 — CSM

**C31** — Onboarding 95% absent
- **Spec** : `AGENT-10a-ONBOARDING.md` (~500 lignes) spécifie : welcome email J1, pré-kickoff J3, email recap J7, premier milestone J14, check-in J30, détection at-risk (5 signaux), plan onboarding automatique, TTV monitoring.
- **Implémenté** : `csm.service.ts:23-37` crée un Customer record et émet un event. Rien d'autre.

**C32** — Upsell detection 100% absent
- **Spec** : `AGENT-10b-UPSELL.md` (~400 lignes) spécifie : matrice cross-sell, scoring upsell (0-100) sur 5 axes, 10 conditions bloquantes, 3 templates email, intégration avec Agent 8.
- **Implémenté** : Rien.

**C33** — Health score simplifié
- **Fichier** : `src/modules/agent-csm/application/services/csm.service.ts:39-83`
- **Problème** : Engagement = `agentEvent.count * 10` au lieu de 5 indicateurs composites (logins, feature adoption, data imports, API usage, support activity). Satisfaction = reply classification sentiment au lieu de NPS + CSAT + tickets + sentiment. Growth = `mrrEur / 10` au lieu de 4 indicateurs (MRR, adoption, traffic, upsell_score).
- **Impact** : Le score sera grossièrement imprécis. Un client actif mais mécontent aura un bon score engagement.

**C34** — NPS/CSAT automation 100% absent
- **Spec** : Spécifie CSAT sur phase completion, NPS à J30 post-livraison, NPS trimestriel, intégration Typeform, actions auto sur promoteur/passif/détracteur.

**C35** — Churn detection : 5 signaux sur 7 manquants
- **Fichier** : `src/modules/agent-csm/application/services/csm.service.ts:86-106`
- **Implémenté** : health_score < 40 et silence 60j.
- **Manquants** : usage decline 40%+, support spike x3, payment delay 15j+, NPS < 6, health drop > 20pts/30j.

**C36** — Pas de @Roles sur controller CSM
- **Fichier** : `src/modules/agent-csm/presentation/controllers/csm.controller.ts`
- **Problème** : Aucun `@Roles` decorator. Les health scores et prédictions de churn sont accessibles à tout utilisateur authentifié.

**C37** — Pas de communication inter-agents
- **Problème** : Aucun dispatch BullMQ vers Agent 1 (referrals), Agent 6 (churn → nurture), Agent 7 (metrics), Agent 8 (upsell → deal). L'agent CSM est isolé du pipeline.

---

## 4. MODERATE Issues (52)

### Agent 1 — Veilleur

| # | Issue | Fichier | Détail |
|---|-------|---------|--------|
| M01 | DECP API non implémenté | -- | Veille concurrentielle sur marchés attribués. Source de données importante pour comprendre qui gagne quoi |
| M02 | APProch API non implémenté | -- | Détection de projets d'achat futurs (avant publication AO). Avantage compétitif early-access |
| M03 | DOM-TOM profils acheteurs scraping absent | -- | 5 URLs spécifiques dans la doc. Marché LODEOM potentiellement lucratif |
| M04 | LinkedIn `post_keyword` signal absent | -- | Signal Tier 2 : posts LinkedIn avec mots-clés tech/budget. Détecte l'intention |
| M05 | axe-core execution toujours 0 | `web-scanner.adapter.ts` | Commentaire : "needs DOM, skip in server context". Toutes les données accessibilité viennent de Lighthouse uniquement |
| M06 | Vérification "already client" absente | `veilleur.service.ts` | Pas de check contre table `clients_actifs` avant dispatch. Gaspille des ressources d'enrichissement sur des clients existants |

### Agent 2 — Enrichisseur

| # | Issue | Fichier | Détail |
|---|-------|---------|--------|
| M07 | RGPD consent jamais écrit | `enrichisseur.service.ts` | Colonnes `consentGiven`/`consentDate` existent dans le schema Prisma mais ne sont jamais peuplées pendant l'enrichissement |
| M08 | Kaspr phone enrichment absent | -- | Pas de découverte de numéro de téléphone. Doc spec : Kaspr à 79 EUR/mois |
| M09 | Contacts secondaires non persistés | `enrichisseur.service.ts` | `DecideurSelectionService` retourne les contacts secondaires mais ils ne sont jamais stockés dans enrichmentData.contacts_secondaires |
| M10 | Worker concurrency/limiter non configuré | `enrichisseur.processor.ts` | BullMQ processor sans concurrency ni rate limiter. Risque de surcharge API |
| M11 | Annuaire-entreprises fallback absent | -- | Pas de fallback pour la recherche SIRET quand INSEE échoue |

### Agent 3 — Scoreur

| # | Issue | Fichier | Détail |
|---|-------|---------|--------|
| M12 | Daily recalculation cron absent | -- | Le decay des signaux rend les scores stales. Doc 03b section 8 spécifie un rescore quotidien |
| M13 | Feedback loop / ProspectOutcome absent | -- | Pas de modèle pour mesurer si un prospect HOT_A a effectivement converti. Impossible de calibrer le scoring |
| M14 | Localisation uses string matching not department code | `scoring-engine.ts:235-248` | La doc 03b spécifie code postal → département → région. Le code fait du string matching sur le nom de région |
| M15 | NAF prefix fallback absent | `scoring-engine.ts:88-98` | Seulement des codes NAF exacts. Pas de fallback sur les 2 premiers digits (ex: '62' → 8) |
| M16 | enrichmentData Zod schema validation absent | `scoreur.service.ts:193-196` | La doc 03c S5 spécifie un schéma Zod complet. Le code fait juste `typeof data === 'object'` |
| M17 | dataHash computed mais jamais comparé | `scoreur.service.ts:41` | L'idempotence check utilise uniquement `calculatedAt` window, pas le hash. Si les données changent dans les 60s, le rescore est skippé |

### Agent 4 — Rédacteur

| # | Issue | Fichier | Détail |
|---|-------|---------|--------|
| M18 | LinkedIn comment generation absent | -- | Doc 04b section 7 : 3ème type message LinkedIn (commentaire sur post, 280 chars). Non implémenté |
| M19 | Regex OBJET/CORPS fragile | `redacteur.service.ts:311-316` | Doc G7 recommande JSON output format. Le regex split sur OBJET:/CORPS: est fragile face aux variations LLM |
| M20 | Pas de concurrency control | `redacteur.service.ts` | Deux jobs simultanés pour le même prospect = messages dupliqués. Pas de Redis lock ni contrainte unique |
| M21 | Pas de rate limiting sur BullMQ processor | `redacteur.processor.ts:7` | Doc 04b section 10 : `limiter: { max: 50, duration: 60000 }`. Non configuré |
| M22 | Pas de cost tracking persistant | -- | `costEur` stocké par message mais pas d'agrégation budget quotidien/mensuel |
| M23 | Approval workflow endpoint absent | -- | `GeneratedMessage.approve()` existe sur l'entité mais pas de `POST /messages/:id/approve` |
| M24 | Multi-step sequence generation absent | -- | Doc 04b section 6 : 4 steps avec limites de mots et angles différents. Seul step 0 est généré |
| M25 | Impact numbers sans disclaimer | -- | Doc S6 : les estimations financières ("420 EUR/mois perdus") présentées comme des faits. DGCCRF exige "estimations indicatives" |

### Agent 5 — Suiveur

| # | Issue | Fichier | Détail |
|---|-------|---------|--------|
| M26 | LinkedIn execution (5b) non implémenté | -- | Pas d'adapter Waalaxy, pas de LinkedinAction records. Le routing `channel='linkedin'` est un stub |
| M27 | Domain rotation absent | -- | Doc spécifie 3 domaines à 50 emails/jour/domaine. Code utilise un seul domaine |
| M28 | Gmail Watch/PubSub absent | -- | Polling-based (délai jusqu'à 10 min). Doc spécifie push notifications |
| M29 | Timezone awareness absent | `sequence-orchestrator.service.ts:30-48` | Utilise le timezone serveur, pas celui du prospect. Emails potentiellement envoyés hors heures de bureau |
| M30 | text/plain pour cold emails absent | `suiveur.service.ts` | Doc spécifie text/plain pour la délivrabilité des emails à froid. Code envoie htmlBody |
| M31 | Seulement 3 des 6 X-Axiom tracking headers | `suiveur.service.ts:112-117` | Manquants : X-Axiom-Step, X-Axiom-Category, X-Axiom-Timestamp |

### Agent 6 — Nurtureur

| # | Issue | Fichier | Détail |
|---|-------|---------|--------|
| M32 | LinkedIn Passif (6b) non implémenté | -- | Pas d'adapter Waalaxy, pas de likes/comments automatiques, pas de blackout hours |
| M33 | Behavioral branching non câblé | `nurture-email.service.ts:160-183` | `determineBranch()` et `getDelayForBranch()` existent mais ne sont jamais appelés depuis `processNurtureStep`. Tous les prospects reçoivent la même cadence |
| M34 | Bi-weekly WARM rescore absent | -- | Doc spécifie rescore 2x/mois pour WARM. Seul le rescore mensuel existe |
| M35 | Active outreach conflict check absent | -- | Pas de vérification qu'un prospect n'a pas une séquence Agent 5 active avant de nurturer. Double envoi possible |

### Agent 7 — Analyste

| # | Issue | Fichier | Détail |
|---|-------|---------|--------|
| M36 | Attribution U-Shaped (40/40/20) non implémenté | -- | Pas de tracking touchpoints, pas de calcul d'attribution. Spec G7 |
| M37 | Forecasting (30/60/90 jours) non implémenté | -- | Pas de pipeline coverage ni velocity forecasting. Spec G9 |
| M38 | Data retention/purge cron RGPD absent | -- | Pas de cleanup pour metriques_daily (24 mois), alertes (12 mois), recommandations (12 mois). Spec S16 |
| M39 | Reclassifications count toujours 0 | `metrics-collector.service.ts:292` | Le compteur de reclassifications scoreur est hardcodé à 0 |

### Agent 8 — Dealmaker

| # | Issue | Fichier | Détail |
|---|-------|---------|--------|
| M40 | LinkedIn follow-up non implémenté | -- | Spec 08b : J+14 LinkedIn et J+21 LinkedIn case study. Seuls les follow-ups email existent |
| M41 | Reconquête finale J+30 absente | -- | Seulement J3/J7/J14. Le J+30 "dernière chance" de la spec n'existe pas |
| M42 | Devis PDF watermark "Confidentiel" absent | -- | PDFs forwadables sans attribution. Spec S14 |
| M43 | toPlainObject() expose données internes | `dealmaker.controller.ts:45,55,61,73` | stageHistory, wonReason, lostReason envoyés au client. Données business-sensitive |
| M44 | Pas de timeout Puppeteer sur contract PDF | `yousign.service.ts:239` | Le quote PDF a un timeout 30s, le contract PDF n'en a pas. Peut hang indéfiniment |

### Agent 9 — Appels d'Offres

| # | Issue | Fichier | Détail |
|---|-------|---------|--------|
| M45 | Copyleaks API pour AI detection en stub | `memoire-redacteur.service.ts:520-523` | Le scoring anti-detection local existe mais la validation externe Copyleaks est un commentaire. Un mémoire flaggé IA par un acheteur = rejet |
| M46 | Rate limiting sur POST endpoints absent | `appels-offres.controller.ts` | Pas de @Throttle. Un utilisateur peut brûler le budget Claude API |
| M47 | Circuit breaker pour Claude absent | Tous les 4 sous-agents LLM | Si Claude est down, chaque requête timeout lentement au lieu de fail-fast |
| M48 | `as any` casts sur Prisma models | Tous les sous-agents | Pas de type safety sur les requêtes Agent 9. Si la migration n'est pas appliquée, tout échoue silencieusement |
| M49 | Signature PAdES/eIDAS pour >40K EUR absent | -- | Doc 09b spécifie PAdES + eIDAS compliance pour marchés >40K. Pas d'intégration |
| M50 | File storage / convention nommage absent | `juriste.service.ts` | DC1/DC2 HTML calculent un file path mais n'écrivent jamais sur disque |

### Agent 10 — CSM

| # | Issue | Fichier | Détail |
|---|-------|---------|--------|
| M51 | Review collection (10d) 100% absent | -- | Pas de ciblage plateforme (Google, Trustpilot, Clutch), pas de séquences email, pas de gestion avis négatifs |
| M52 | Referral program (10e) 100% absent | -- | Pas d'identification ambassadeurs, pas de codes parrainage, pas de calcul commissions, pas d'intégration Agent 1 |
| M53 | ParseUUIDPipe absent sur :id | `csm.controller.ts:19` | Accepte des strings non-UUID |
| M54 | Runtime crash dans predictChurn | `csm.controller.ts:24` | `c.toPlainObject()` appelé sur des objets Prisma bruts qui n'ont pas cette méthode. TypeError à l'exécution |

---

## 5. INFO / Suggestions (28)

### Agent 1

| # | Issue | Détail |
|---|-------|--------|
| I01 | LinkedIn `engagement` signal absent | Signal Tier 3 (like/comment sur contenu tech). ROI faible |
| I02 | Playwright screenshots absent | Utile pour ventes mais pas pipeline-critical |
| I03 | Dedicated DB tables (offres_emploi, signaux_linkedin, deduplication_log, veilleur_batches) | Design choice — données stockées en JSON dans rawData. Réduit la queryabilité mais fonctionnel |

### Agent 2

| # | Issue | Détail |
|---|-------|--------|
| I04 | SLA enforcement absent | Pas de mécanisme pour tracker HOT ≤15min, WARM ≤2h, COLD ≤24h |
| I05 | Credits tracking absent | Pas de visibilité sur la consommation API (Reacher, Hunter, INSEE, Pappers) par enrichissement |

### Agent 3

| # | Issue | Détail |
|---|-------|--------|
| I06 | ScoringCoefficient entity morte | Entity existe sans repository ni service. Code mort |

### Agent 4

| # | Issue | Détail |
|---|-------|--------|
| I07 | langfuseTraceId jamais capturé | Pas de trace ID Langfuse stocké avec les messages générés pour audit LLM |
| I08 | personalizationData jamais écrit | Doc spécifie tracker quels champs prospect ont été utilisés pour personnalisation |
| I09 | LinkedIn JSON parse sans Zod | `redacteur.service.ts:325-337` parse manuellement au lieu d'un schéma Zod |

### Agent 5

| # | Issue | Détail |
|---|-------|--------|
| I10 | Dashboard Suiveur absent | Pas de metrics endpoint pour delivery/reply/bounce rates |

### Agent 6

| # | Issue | Détail |
|---|-------|--------|
| I11 | Dashboard Nurtureur absent | Pas de metrics pour engagement rates, distribution journey stage, re-score counts |

### Agent 7

| # | Issue | Détail |
|---|-------|--------|
| I12 | Metabase dashboards / SQL views absent | 7 dashboards et 18 SQL views spécifiés. Aucun créé |
| I13 | Infrastructure cost hardcodé 10% | `metrics-collector.service.ts:152,166` — estimé à `coutTotal * 0.1` au lieu de mesuré |

### Agent 9

| # | Issue | Détail |
|---|-------|--------|
| I14 | BOAMP/DECP polling stubs pour moniteur 9g | `checkForNewQuestionsReplies()` et `checkForDceModification()` retournent false |
| I15 | Knowledge base capitalization absent | RETEX reports stockés en JSON dans aoAnalyse. Pas de table dédiée pour l'apprentissage historique |

### Cross-Agents

| # | Issue | Détail |
|---|-------|--------|
| I16 | `AgentEventLoggerService` non documenté | Intégration logging comprehensive dans tous les agents mais non mentionnée dans les docs techniques |
| I17 | `EventEmitter2` events non documentés | `lead.detected`, `prospect.scored`, `deal.created`, `deal.stage_changed` — utiles mais pas dans les specs |
| I18 | Code CQRS legacy Agent 7 | `analyze-pipeline.handler.ts` et `get-pipeline-metrics.handler.ts` dupliquent la logique de `AnalysteService`. À supprimer ou unifier |
| I19 | `PipelineMetric` entity legacy Agent 7 | Entité générique clé-valeur remplacée par le snapshot 60 colonnes. `toDomain()` retourne des données factices |
| I20 | `prisma as any` pattern dans Agent 8 | `DealFollowUpService` (5 occurrences), `QuoteGeneratorService` (accessor `private get db(): any`). Fragile |
| I21 | Code non utilisé `ScoreResponseDto` Agent 3 | DTO existe mais le controller construit sa propre réponse |
| I22 | Enrichment cache Redis déjà fait | `EnrichmentCacheService` implémenté et intégré — doc le listait comme "Phase 5" mais c'est déjà fait |
| I23 | `PappersAdapter.searchByName()` non documenté | Recherche par nom d'entreprise implémentée mais pas dans le spec original |
| I24 | `EnrichisseurService.detectSegment()` non documenté | Détection de segment par NAF implémentée dans Agent 2 mais spécifiée comme responsabilité Agent 3 |
| I25 | `EnrichisseurService.mapToRegion()` non documenté | Mapping code postal → région implémenté dans Agent 2 |
| I26 | Rate limit handling Pappers non documenté | Cooldown 60s après HTTP 429. Ajout pragmatique |
| I27 | `InpiAdapter.parseFlexibleDate()` non documenté | Gère formats ISO et dates françaises |
| I28 | CQRS legacy endpoints Agent 9 | `/analyze-cqrs` et `/analysis-cqrs` préservés pour rétro-compatibilité |

---

## 6. Agent 1 — Veilleur

### Documentation
- `01-AGENT-1-VEILLEUR.md` — Architecture, 22 bugs documentés, pipeline 4 sous-agents + Master
- `01b-VEILLEUR-SOURCES-COMPLETES.md` — Sources détaillées (BOAMP, LinkedIn, Web, JobBoards)
- `03-FEATURES/01-agent-1-veilleur.md` — Specs fonctionnelles

### Fichiers implémentés (20 source + 6 test)
```
application/services/
  veilleur.service.ts (344 lines)
  deduplication.service.ts (standalone, never called)
  pre-scoring.service.ts (standalone, never called)
  linkedin-scan.service.ts (124 lines)
  web-scan.service.ts (97 lines)
  jobboard-scan.service.ts (140 lines)
infrastructure/adapters/
  boamp.adapter.ts (186 lines)
  linkedin/netrows.adapter.ts
  linkedin/signals-api.adapter.ts
  linkedin/rss-funding.adapter.ts
  jobboard-scanner.adapter.ts
  web-scanner.adapter.ts
infrastructure/jobs/
  veilleur.processor.ts
presentation/controllers/
  veilleur.controller.ts
```

### Sous-agents

| Sous-agent | Status | Détail |
|------------|--------|--------|
| **1a LinkedIn** | 90% | Netrows + SignalsAPI + RSS en parallèle. Manque : `post_keyword`, `engagement`, contact extraction (personName/personRole) |
| **1b Marchés Publics** | 70% | BOAMP via Opendatasoft OK. Manque : CPV filtering, estimatedValue, DECP, APProch, DOM-TOM |
| **1c Veille Web** | 80% | Lighthouse + Wappalyzer + SSL + robots.txt. Manque : axe-core réel, Pa11y, Playwright screenshots |
| **1d Job Boards** | 95% | 4 plateformes (LinkedIn Jobs, WTTJ, HelloWork, Indeed), 5 signal types |
| **Master** | 30% | DeduplicationService et PreScoringService existent mais ne sont jamais invoqués. Pas de consolidation batch |

### Code non documenté
- `AgentEventLoggerService` integration dans tous les services
- `validateExternalUrl` SSRF protection dans `boamp.adapter.ts:47`
- `EventEmitter2` domain events (`lead.detected`) dans `veilleur.service.ts:148-157`
- `WebScannerAdapter.isAvailable()` check Chrome
- Initial scan on startup (30s delay) dans `agent-scheduler.service.ts:76-80`

### Tests

| Fichier | Tests | Qualité |
|---------|:-----:|---------|
| `veilleur.service.spec.ts` | 269 lignes | Bon — detect, dedup, dispatch, events, priority routing |
| `boamp.adapter.spec.ts` | 138 lignes | Bon — mapping, relevance scoring, error handling |
| `jobboard-scan.service.spec.ts` | 416 lignes | Excellent — signals, dedup, dispatch, errors |
| `linkedin-scan.service.spec.ts` | 218 lignes | Bon — adapter merging, dedup, queue dispatch |
| `web-scan.service.spec.ts` | 214 lignes | Bon — batch, threshold, priority, error handling |
| `raw-lead.entity.spec.ts` | 155 lignes | Bon — create, reconstitute, markAsProcessed |
| **DeduplicationService** | **0** | **GAP** — Levenshtein, SIREN matching non testés |
| **PreScoringService** | **0** | **GAP** — 5 axes non testés |
| **Adapters LinkedIn (3)** | **0** | **GAP** |
| **VeilleurProcessor** | **0** | **GAP** |

---

## 7. Agent 2 — Enrichisseur

### Documentation
- `02-AGENT-2-ENRICHISSEUR.md` — Architecture, bugs B1-B7, pipeline 3 sous-agents + Master
- `02b-ENRICHISSEUR-DETAILS-IMPLEMENTATION.md` — Détails services, adapters, cache

### Fichiers implémentés (17 source + 8 test)
```
application/services/
  enrichisseur.service.ts (353 lines)
  email-finder.service.ts
  email-pattern.service.ts
  company-enricher.service.ts
  tech-enrichment.service.ts
  decideur-selection.service.ts
infrastructure/adapters/
  reacher.adapter.ts (circuit breaker, throttling)
  hunter.adapter.ts
  insee.adapter.ts
  pappers.adapter.ts
  inpi.adapter.ts (auth, circuit breaker)
  bodacc.adapter.ts (dedup, cache)
infrastructure/services/
  enrichment-cache.service.ts (Redis)
infrastructure/jobs/
  enrichisseur.processor.ts
```

### Sous-agents

| Sous-agent | Status | Détail |
|------------|--------|--------|
| **2a Contact** | 85% | Email waterfall (pattern → Reacher → Hunter), DecideurSelection 5 segments. Manque : segment passé au finder, spamtrap filter, contacts secondaires persistés |
| **2b Entreprise** | 95% | INSEE + Pappers + INPI + BODACC en parallèle, alertes financières, source priority. Cache Redis |
| **2c Technique** | 90% | Réutilise WebScannerAdapter d'Agent 1, anti-redundancy rule, detectProblemes(), cache 30j |
| **Master** | 90% | Parallel Promise.allSettled, timeout 3 min, conditional activation, RGPD gate, auto-exclusion, completude score, dispatch priority |

### Bugs fixes vérifiés (B1-B7 de la doc)
- B1 rawData multi-source extraction : DONE
- B2 enrichmentData flat fields : DONE
- B3 prospect column updates : DONE
- B5 catch-all isCatchAll check : DONE
- B6 auth guard on POST /enrich : DONE
- B7 exclusions (procedure collective + entreprise fermée) : DONE

### Tests

| Fichier | Tests | Qualité |
|---------|:-----:|---------|
| `enrichisseur.service.spec.ts` | Présent | OK |
| `email-pattern.service.spec.ts` | Présent | OK |
| `hunter.adapter.spec.ts` | Présent | OK |
| `decideur-selection.service.spec.ts` | Présent | OK |
| `tech-enrichment.service.spec.ts` | Présent | OK |
| `insee.adapter.spec.ts` | Présent | OK |
| `pappers.adapter.spec.ts` | Présent | OK |
| `enrichment-cache.service.spec.ts` | Présent | OK |
| **ReacherAdapter** | **0** | **GAP** — Circuit breaker, throttling, SMTP non testés |
| **InpiAdapter** | **0** | **GAP** — Auth flow, rate limiting non testés |
| **BodaccAdapter** | **0** | **GAP** — Notice mapping, procedure collective non testés |
| **EnrichisseurProcessor** | **0** | **GAP** — rawData extraction, dedup non testés |
| **EmailFinderService** | **0** | **GAP** — Waterfall complet non testé |
| **CompanyEnricherService** | **0** | **GAP** — Orchestration 4 adapters non testée |

---

## 8. Agent 3 — Scoreur

### Documentation
- `03-AGENT-3-SCOREUR.md` — Architecture, scoring 4 axes, catégorisation, routing
- `03b-SCOREUR-DETAILS-IMPLEMENTATION.md` — ScoringInput détaillé, malus, bonuses
- `03c-SCOREUR-SECURITE-BONNES-PRATIQUES.md` — CVE, edge cases

### Fichiers implémentés (11 source + 2 test)
```
application/services/
  scoring-engine.ts (509 lines) — moteur de scoring pur
  scoreur.service.ts (238 lines) — orchestration
application/dtos/
  calculate-score.dto.ts
  score-response.dto.ts
domain/entities/
  prospect-score.entity.ts
  scoring-coefficient.entity.ts (dead code)
infrastructure/repositories/
  prisma-prospect-score.repository.ts
infrastructure/jobs/
  scoreur.processor.ts
presentation/controllers/
  scoreur.controller.ts
```

### Couverture feature

| Feature | Status | Note |
|---------|--------|------|
| 4-axes scoring (ICP/Signals/Technique/Engagement) | DONE | |
| ICP Fit — 4 sous-scores | DONE | |
| Intent Signals decay exponentiel | DONE | 9 signal types, rank multiplier, signal plancher |
| Technique inversé (opportunité) | DONE | |
| Engagement | DONE | |
| 5 segment coefficients | DONE | |
| 9/11 soft malus | DONE | Manque emailVerified standalone, allSignals > 60j |
| 6 hard disqualifications | DONE | Manque clientExistant, paysSanctionné, secteurInterdit |
| 7 segment bonuses | DONE | |
| Catégorisation HOT_A/B/C/WARM/COLD | DONE | |
| Routing SLA/priority/delay | DONE | |
| Multi-channel dispatch | DONE | Email + LinkedIn pour HOT_A/B |
| Processor timeout 30s | DONE | |
| Idempotence 60s window | DONE | |
| ScoringInput 17+ champs peuplés | **NON** | Interface définie, champs jamais extraits |
| Daily recalculation cron | **NON** | |
| Feedback loop ProspectOutcome | **NON** | |
| Race condition protection | **NON** | Pas d'index unique WHERE isLatest |

---

## 9. Agent 4 — Rédacteur

### Documentation
- `04-AGENT-4-REDACTEUR.md`
- `04b-REDACTEUR-DETAILS-IMPLEMENTATION.md`
- `04c-REDACTEUR-SECURITE-BONNES-PRATIQUES.md`

### Fichiers implémentés (11 source + 3 test)
```
application/services/
  redacteur.service.ts (347 lines)
  impact-calculator.service.ts (148 lines)
  message-validator.service.ts (6-checks pipeline)
  prompt-templates.ts (325 lines few-shot, never imported)
infrastructure/jobs/
  redacteur.processor.ts
```

### Couverture feature

| Feature | Status | Note |
|---------|--------|------|
| Email generation via Claude | DONE | |
| LinkedIn connection note + post-connection | DONE | |
| Impact Calculator 4 formulas | DONE | Performance, Attribution, RGAA, Cart Abandon |
| System prompt (identity, rules, pricing) | DONE | |
| 5 segment contexts | DONE | |
| 10 few-shot examples | CODE MORT | Définis mais jamais injectés |
| 6-checks validation pipeline | PARTIEL | Checks 4+5 ne tournent jamais (params manquants) |
| 3 retries with temp decrease | DONE | 0.7 → 0.55 → 0.40 |
| Input/output sanitization | DONE | |
| RGPD/blacklist gate | DONE | |
| 72h email frequency limit | DONE | |
| LCEN footer | **ABSENT** | **BLOCKING** |
| Multi-step sequences | **ABSENT** | stepNumber hardcodé à 1 |
| LinkedIn comment generation | **ABSENT** | |
| Approval workflow | **ABSENT** | |

---

## 10. Agent 5 — Suiveur

### Documentation
- `05-AGENT-5-SUIVEUR.md`

### Fichiers implémentés (13 source + 3 test)
```
application/services/
  suiveur.service.ts (313 lines)
  response-classifier.service.ts (Claude Haiku)
  sequence-orchestrator.service.ts (5 sequences)
  action-handler.service.ts (8 categories)
  bounce-handler.service.ts (hard/soft/complaint)
  reply-event-listener.service.ts (7 @OnEvent)
```

### Bugs fixes vérifiés (de la doc)
- B1 detectResponses : FIXED
- B2 scheduleNextStep : FIXED
- B3 currentStep increment : FIXED
- B4 @OnEvent listeners : FIXED (ReplyEventListenerService)
- B5 LinkedIn ignored : NOT FIXED (no adapter)
- B8 fromEmail hardcoded : FIXED
- B12 category-based sequence selection : FIXED
- S1 JwtAuthGuard : FIXED sur endpoints protégés
- S2 blacklist check : FIXED
- S3 rate limiting : FIXED
- S5 LCEN footer : FIXED
- S7 isApproved gate : FIXED
- G1 bounce handling : FIXED (BounceHandlerService)
- G2 webhook Mailgun : FIXED (controller endpoint)

---

## 11. Agent 6 — Nurtureur

### Documentation
- `06-AGENT-6-NURTUREUR.md`
- `06b-NURTUREUR-DETAILS-IMPLEMENTATION.md`
- `06c-NURTUREUR-SECURITE-BONNES-PRATIQUES.md`

### Fichiers implémentés (13 source + 6 test)

### Sous-agents

| Sous-agent | Status | Détail |
|------------|--------|--------|
| **6a Email Nurture** | 90% | Claude personalization, content pool (17 items), journey stages, ratio 3:1, re-engagement workflow, re-permission. Manque : branching non câblé |
| **6b LinkedIn Passif** | 0% | Pas d'adapter Waalaxy |
| **6c Re-Scoreur** | 90% | Engagement tracking, weekly decay, monthly rescore, immediate triggers, HOT handoff. Manque : bi-weekly WARM |

### Bugs fixes vérifiés (de la doc)
- B1 Prospect.status : FIXED
- B2 infinite re-enrollment : FIXED
- B3 duplicate P2002 : FIXED
- B4 processNurtureStep stub : FIXED
- B5 triggerReScore dead code : FIXED
- B6 sub-agents absent : PARTIALLY (6a, 6c done; 6b missing)
- B7 updatedAt vs lastInteractionAt : FIXED
- B8 wrong email count : FIXED
- B9 Prisma missing fields : FIXED (~25 champs mappés)
- S2 RGPD check enrollment : FIXED
- S3 consent check : FIXED
- S4 rate limiting : FIXED
- S5 sunset blacklist : FIXED
- S6 events listeners : FIXED (8 handlers)

---

## 12. Agent 7 — Analyste

### Documentation
- `07-AGENT-7-ANALYSTE.md` — Architecture, 22 bugs, pipeline 4 sous-agents
- `07b-ANALYSTE-DETAILS-IMPLEMENTATION.md` — 15 sections détaillées
- `07c-ANALYSTE-SECURITE-BONNES-PRATIQUES.md` — 38 findings

### Fichiers implémentés (15 source + 5 test)

### Sous-agents

| Sous-agent | Status | Détail |
|------------|--------|--------|
| **7a Collecteur Métriques** | 90% | 7 collect functions, upsert snapshot, @Cron 21h30. Manque : infra cost hardcodé |
| **7b Générateur Rapports** | 85% | Daily digest, weekly (Claude), monthly (Claude). Manque : separate Slack channels |
| **7c Détecteur Anomalies** | 85% | z-score + thresholds, 8 métriques, weekend guard. Manque : CRITICAL DM Jonathan, rate limiting |
| **7d Recommandeur** | 90% | 5 analyses, A/B testing z-score, recommendation lifecycle. Complet |

### Code legacy à nettoyer
- `analyze-pipeline.handler.ts` — CQRS handler qui duplique AnalysteService.triggerDailyAnalysis()
- `get-pipeline-metrics.handler.ts` — CQRS handler qui duplique AnalysteService.getDashboardSummary()
- `pipeline-metric.entity.ts:1-47` — Entité générique remplacée par le snapshot 60 colonnes
- `i-pipeline-metric.repository.ts` — 6 méthodes dont plusieurs inutilisées
- `prisma-pipeline-metric.repository.ts` — `toDomain()` retourne des données factices

---

## 13. Agent 8 — Dealmaker

### Documentation
- `08-AGENT-8-DEALMAKER.md` — Architecture, 24 bugs, pipeline 3 sous-agents, 7 stages CRM
- `08b-DEALMAKER-DETAILS-IMPLEMENTATION.md` — 14 sections détaillées
- `08c-DEALMAKER-SECURITE-BONNES-PRATIQUES.md` — 36 findings

### Fichiers implémentés (15 source + 6 test)

### Sous-agents

| Sous-agent | Status | Détail |
|------------|--------|--------|
| **8a Quote Generator** | 90% | Claude scope analysis, Puppeteer PDF, tracking pixel, auto-advance. Manque : watermark "Confidentiel" |
| **8b Deal Follow-Up** | 85% | J3/J7/J14, engagement scoring (8 signals), objection classification, 45j timeout. Manque : J30, LinkedIn follow-ups, Slack notifications |
| **8c Yousign** | 90% | 9 endpoints API V3, HMAC webhook, contract PDF, reminders J2/J5/J7. Manque : idempotence webhook, signed PDF storage |

### Pricing Service (vérifié)
| Service | Basic | Pro | Premium |
|---------|------:|----:|--------:|
| site_vitrine | 1 500 | 5 000 | 9 500 |
| ecommerce_shopify | 5 000 | 10 000 | 15 000 |
| app_flutter | 15 000 | 35 000 | 60 000 |
| app_metier | 25 000 | 50 000 | 75 000 |
| rgaa | 8 000 | 20 000 | 40 000 |
| tracking_server_side | 990 | 1 490 | 2 490 |

Tous les prix correspondent exactement à la spec.

---

## 14. Agent 9 — Appels d'Offres

### Documentation
- `09-AGENT-9-APPELS-OFFRES.md` — Architecture, 28 bugs, pipeline séq+parallèle 7 sous-agents
- `09b-APPELS-OFFRES-DETAILS-IMPLEMENTATION.md` — 15 sections détaillées
- `09c-APPELS-OFFRES-SECURITE-BONNES-PRATIQUES.md` — 38 findings

### Fichiers implémentés (20 source + 10 test = 232 tests passing)

### Sous-agents

| Sous-agent | Status | Lignes | Détail |
|------------|--------|-------:|--------|
| **9a Analyseur DCE** | 85% | 398 | Claude structured outputs, sanitization, chunking, fausse chance. Manque : Docker sandbox |
| **9b Qualificateur** | 95% | 387 | 7 axes, EV, GO/POSSIBLE/NO_GO, Slack. Complet |
| **9c Juriste** | 90% | 315 | DC1/DC2 HTML, validity tracking, escapeHtml, UUID validation |
| **9d Chiffreur** | 90% | 313 | BPU/DQE/DPGF, TJM grille, LODEOM, strategy auto-detect, real margin calc |
| **9e Rédacteur Mémoire** | 85% | 576 | 5 chapitres, anti-IA detection, volet social verbatim, Mermaid, Jonathan sections. Manque : Copyleaks |
| **9f Contrôleur QA** | 95% | 725 | 29-point checklist, CONFORME/CORRECTIONS_REQUISES/BLOQUANT |
| **9g Moniteur** | 80% | 597 | 3 phases, 9 alert types, RETEX, R2181-3, 3 escalation levels. Manque : transfer BullMQ, deadline alerts |

### Tests Agent 9 (vérifiés)
- 10 fichiers test, 232 tests, 10/10 suites PASS
- 0 TypeScript errors
- Adversarial review + corrections appliquées (prompt injection, HTML injection, path traversal, QA extractors, margin calc, state machine)

---

## 15. Agent 10 — CSM

### Documentation : **ABSENTE**
Specs source disponibles dans `.claude/source-ia/agent/` :
- `AGENT-10-MASTER.md`
- `AGENT-10a-ONBOARDING.md` (~500 lignes)
- `AGENT-10b-UPSELL.md` (~400 lignes)
- `AGENT-10c-SATISFACTION.md` (~400 lignes)
- `AGENT-10d-AVIS.md` (~250 lignes)
- `AGENT-10e-REFERRAL.md` (~300 lignes)
Total : ~2500+ lignes de spécifications pour 5 sous-agents.

### État actuel

| Composant | Lignes | Contenu | % spec |
|-----------|-------:|---------|:------:|
| `csm.service.ts` | 149 | onboard + health score simplifié + churn basique | 10% |
| `csm.controller.ts` | 27 | 3 endpoints sans @Roles | 15% |
| `customer.entity.ts` | 102 | DDD entity basique | 50% |
| `health-score.entity.ts` | 77 | Entity avec supercede | 50% |
| `csm.processor.ts` | 37 | Processor basique | 10% |
| `csm.service.spec.ts` | 183 | 5 tests | 5% |

### Runtime crashes identifiés
1. `csm.controller.ts:20` — `result.toPlainObject()` appelé sur un objet qui est déjà plain → TypeError
2. `csm.controller.ts:24` — `c.toPlainObject()` appelé sur des objets Prisma bruts dans `predictChurn` results → TypeError

---

## 16. Patterns Cross-Agents

### Patterns récurrents à corriger

| Pattern | Agents | Impact | Recommandation |
|---------|--------|--------|----------------|
| **IDOR** (pas de vérification ownership) | 3, 4, 8, 10 | Tout utilisateur authentifié accède aux données de tout prospect/deal | Pour single-tenant : documenter. Pour multi-tenant : ajouter organizationId |
| **`(this.prisma as any)`** casts | 7, 8, 9 | Pas de type safety Prisma | Régénérer le client Prisma avec toutes les migrations, ou créer des repositories typés |
| **LinkedIn channel non implémenté** | 5, 6 | Canal LinkedIn non-fonctionnel | Implémenter l'adapter Waalaxy (priorité MODERATE) |
| **Redis distributed lock absent** | 7, 8 | Crons dupliqués en multi-pod | Utiliser `@nestjs/schedule` + Redlock |
| **Slack notifications Jonathan absentes** | 8 | Aucune visibilité temps réel | Implémenter module Slack partagé |
| **Services principaux sans tests** | 3, 4, 5 | Services critiques non vérifiés | Priorité haute pour `scoreur.service.ts`, `redacteur.service.ts`, `suiveur.service.ts` |
| **Few-shot / validation dead code** | 4 | Code écrit mais non câblé | Vérifier chaque import et chaque appel de méthode |

### Intégrations inter-agents vérifiées

| Source → Destination | Queue BullMQ | Status |
|---------------------|-------------|--------|
| Veilleur → Enrichisseur | `enrichisseur-pipeline` | FONCTIONNEL (direct, bypass Master) |
| Enrichisseur → Scoreur | `scoreur-pipeline` | FONCTIONNEL |
| Scoreur → Rédacteur | `redacteur-pipeline` | FONCTIONNEL |
| Rédacteur → Suiveur | `suiveur-pipeline` | FONCTIONNEL |
| Suiveur → Nurtureur | `nurturer-pipeline` | FONCTIONNEL (via events) |
| Veilleur → Appels d'Offres | `appels-offres-pipeline` | FONCTIONNEL |
| Dealmaker → CSM | `csm-onboarding` | **CASSÉ** (schema incompatible) |
| Appels d'Offres (GAGNE) → Dealmaker/CSM | -- | **NON IMPLÉMENTÉ** (log seulement) |
| CSM → Agent 1 (referrals) | -- | **NON IMPLÉMENTÉ** |
| CSM → Agent 6 (churn) | -- | **NON IMPLÉMENTÉ** |
| CSM → Agent 7 (metrics) | -- | **NON IMPLÉMENTÉ** |
| CSM → Agent 8 (upsell) | -- | **NON IMPLÉMENTÉ** |

---

## 17. Couverture Tests

### Résumé global

| Agent | Fichiers test | Tests count | Services sans tests | Sévérité gaps |
|-------|:------------:|:-----------:|:-------------------:|:-------------:|
| 1 — Veilleur | 6 | ~40 | DeduplicationService, PreScoringService, LinkedIn adapters (3), VeilleurProcessor | CRITICAL |
| 2 — Enrichisseur | 8 | ~30 | ReacherAdapter, InpiAdapter, BodaccAdapter, EnrichisseurProcessor, EmailFinderService, CompanyEnricherService | CRITICAL |
| 3 — Scoreur | 2 | 49 | `scoreur.service.ts` (service principal, 238 lignes) | CRITICAL |
| 4 — Rédacteur | 3 | 46 | `redacteur.service.ts` (service principal, 347 lignes) | CRITICAL |
| 5 — Suiveur | 3 | 19 | `suiveur.service.ts`, `action-handler.service.ts`, `reply-event-listener.service.ts` | CRITICAL |
| 6 — Nurtureur | 6 | 45 | `nurtureur.processor.ts`, `nurtureur.controller.ts` | MODERATE |
| 7 — Analyste | 5 | 30 | Collect functions individuelles, crons | MODERATE |
| 8 — Dealmaker | 6 | 45 | Processor job dispatch, webhook HMAC, PDF generation, tracking pixel | MODERATE |
| 9 — Appels d'Offres | 10 | 232 | Intégration pipeline, FlowProducer, Docker sandbox | LOW |
| 10 — CSM | 1 | 5 | `predictChurn()` (crash runtime), processor, controller | CRITICAL |
| **TOTAL** | **50** | **~541** | | |

### Services principaux sans tests (priorité haute)

1. `scoreur.service.ts` (238 lignes) — orchestration scoring, ScoringInput building, dispatch
2. `redacteur.service.ts` (347 lignes) — génération LLM, validation, dispatch
3. `suiveur.service.ts` (313 lignes) — envoi email, RGPD gate, LCEN, rate limit
4. `enrichisseur.processor.ts` — point d'entrée pipeline enrichissement
5. `email-finder.service.ts` — waterfall Reacher → Hunter
6. `company-enricher.service.ts` — orchestration 4 adapters

---

## 18. Code Non Documenté

### Implémentations utiles non dans les specs

| Code | Agent | Fichier | Valeur |
|------|-------|---------|--------|
| `AgentEventLoggerService` | Tous | Throughout | Logging structuré pour audit — bonne pratique |
| `EventEmitter2` domain events | 1, 3, 8 | Services | Communication asynchrone intra-module |
| `validateExternalUrl` SSRF protection | 1 | `boamp.adapter.ts` | Sécurité proactive |
| `EnrichmentCacheService` Redis | 2 | `enrichment-cache.service.ts` | Cache Redis (marqué Phase 5 dans la doc, déjà fait) |
| `PappersAdapter.searchByName()` | 2 | `pappers.adapter.ts` | Recherche nom entreprise (utile en fallback) |
| `detectSegment()` par NAF | 2 | `enrichisseur.service.ts` | Détection segment côté enrichissement |
| `mapToRegion()` par code postal | 2 | `enrichisseur.service.ts` | Géolocalisation régionale |
| `sanitizeForPrompt()` | 9 | `dce-analyzer.service.ts` | Protection injection prompts — exportée et réutilisée |
| `escapeHtml()` | 9 | `juriste.service.ts` | Protection XSS dans documents HTML générés |
| `getSafeId()` UUID validation | 9 | `juriste.service.ts` | Protection path traversal |

---

## 19. Verdict Final

### REQUEST CHANGES

**13 BLOCKING issues** empêchent la mise en production.

### Priorités de correction

**P0 — Bloquants immédiats** (à corriger avant tout test d'intégration) :
1. Agent 8 processor (B09) — pipeline async entièrement cassé
2. Agent 4 LCEN footer (B05) — violation légale
3. Agent 2 segment passthrough (B02) — email finder non fonctionnel
4. Agent 2 mergeWithExisting (B03) — intelligence multi-source perdue
5. Agent 1 Master consolidation (B01) — déduplication cross-source inactive

**P1 — Bloquants infrastructure** :
6. Agent 7 + 8 Redis cron locks (B07, C23) — prérequis multi-pod
7. Agent 8 webhook idempotence (B08) — corruption données
8. Agent 3 race condition isLatest (B04) — corruption index
9. Agent 4 stepNumber (B06) — multi-step impossible

**P2 — Bloquants fonctionnels** :
10. Agent 9 Docker sandbox (B10) — extraction PDF non fonctionnelle
11. Agent 10 documentation + implémentation (B11, B12, B13) — agent entier à faire

**P3 — Critical à traiter rapidement** :
- IDOR fixes (C10, C14, C15, C36) — sécurité
- ScoringInput population (C09) — scoring engine effectif
- Few-shot injection (C13) — qualité LLM
- Validation params (C14) — détection hallucinations
- Nurtureur auth guard (C18) — sécurité
- Slack notifications Dealmaker (C24) — UX Jonathan
- Deadline alerting Agent 9 (C29) — risque marchés publics

### Agents les plus matures
1. **Agent 9** (85%, 232 tests, adversarial review passé)
2. **Agent 2** (85%, 8 fichiers test)
3. **Agent 6** (85%, 6 fichiers test)

### Agents nécessitant le plus de travail
1. **Agent 10** (10%, quasi-inexistant)
2. **Agent 3** (70%, scoring engine mort)
3. **Agent 4** (75%, LCEN/few-shot/validation)
4. **Agent 8** (75%, processor cassé)

---

*Audit réalisé par 5 agents Opus en parallèle le 2026-03-29. Chaque agent a lu l'intégralité des documents techniques et de chaque fichier source pour son périmètre.*

---

## 20. Complément : Audit Enrichi

Un meta-audit de cet audit a été réalisé et a identifié **4 BLOCKING supplémentaires** et **8 CRITICAL supplémentaires** dans les modules partagés (auth, email, llm, dashboard, prospects) qui étaient hors du scope initial.

**Voir** : [`AUDIT-ENRICHI-META-REVIEW-2026-03-29.md`](./AUDIT-ENRICHI-META-REVIEW-2026-03-29.md)

Contenu du complément :
1. **29 gaps supplémentaires** (modules partagés, infrastructure, cross-agents)
2. **Registre CVE complet** pour chaque technologie du stack (Node.js, NestJS, Redis, PostgreSQL, Puppeteer, Prisma, Langfuse, Caddy, etc.)
3. **OWASP Top 10 2025** — applicabilité détaillée
4. **OWASP LLM Top 10 2025** — applicabilité détaillée
5. **Guide légal RGPD/LCEN/CNIL** avec sanctions de référence (KASPR 240K EUR, EU AI Act août 2026)
6. **Guide de Correction** — 7 sections de bonnes pratiques (BP01-BP07)
7. **Mauvaises Pratiques** — 6 sections d'anti-patterns (AP01-AP06)
8. **Edge Cases Critiques** — 10 scénarios détaillés (EC01-EC10)
9. **Roadmap de Correction** — 5 phases sur 6 semaines, ~184h, étape par étape

**Bilan total combiné** : 17 BLOCKING + 43 CRITICAL + 62 MODERATE + 31 INFO
