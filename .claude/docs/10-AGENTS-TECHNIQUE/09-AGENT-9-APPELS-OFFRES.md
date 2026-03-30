# Agent 9 — APPELS D'OFFRES — Documentation Technique d'Implémentation

**Source de vérité :** `.claude/source-ia/agent/AGENT-9-MASTER.md` + `AGENT-9a-DCE.md` + `AGENT-9b-QUALIFICATEUR.md` + `AGENT-9c-JURISTE.md` + `AGENT-9d-CHIFFREUR.md` + `AGENT-9e-REDACTEUR-MEMOIRE.md` + `AGENT-9f-CONTROLEUR-QA.md` + `AGENT-9g-MONITEUR.md`

---

## Architecture

```
AGENT 9 — APPELS D'OFFRES MASTER (le plus complexe du système : 7 sous-agents)
├── 9a Analyseur DCE (PyMuPDF extraction + Claude analysis des documents marchés)
├── 9b Qualificateur + Décideur GO/NO-GO (scoring 7 axes + notification Jonathan)
├── 9c Juriste (dossier administratif : DC1/DC2/DUME, attestations, validités)
├── 9d Chiffreur (offre financière : BPU/DQE/DPGF, marge LODEOM)
├── 9e Rédacteur Mémoire (mémoire technique 5 chapitres, Claude API, anti-detection IA)
├── 9f Contrôleur QA (checklist 29 points, conformité, signatures)
└── 9g Moniteur Post-Dépôt (surveillance Q/R, résultats, RETEX, courrier R2181-3)

Pipeline : séquentiel (9a→9b) puis parallèle (9c+9d+9e) puis séquentiel (9f→dépôt→9g)
```

### Position dans le pipeline global

```
Agent 1b (Veilleur Marchés)
    │ [Lead marché_public, score >= 60]
    ▼
═══════════════════════════════════════
║  AGENT 9 (APPELS D'OFFRES)         ║
║  Queue: appels-offres-pipeline      ║
║  7 sous-agents séquentiels +        ║
║  parallèles (9c/9d/9e)             ║
═══════════════════════════════════════
    │
    ├── SI GAGNÉ → Agent 8 (Dealmaker) → Agent 10 (CSM)
    ├── SI PERDU → RETEX + capitalisation (base de connaissances)
    └── TOUJOURS → Agent 7 (Analyste) métriques performance AO
```

### Différence clé avec les autres agents

Agent 9 est **unique** dans le pipeline :
- **7 sous-agents** (le maximum du système, vs 3-4 pour les autres)
- **Pipeline séquentiel + parallèle** : 9a→9b→(9c//9d//9e)→9f→dépôt→9g
- **Documents juridiques** : génération de PDF conformes au Code des Marchés Publics
- **Intervention humaine** dans la boucle : Jonathan valide GO/NO-GO, relecture mémoire, validation prix
- **CVE critique PyMuPDF** : CVE-2026-0006 (CVSS 9.8) → sandbox Docker obligatoire
- **CQRS pattern** : utilise CommandBus/QueryBus (comme Agent 7)
- **Post-dépôt** : suivi long terme (J+30) avec surveillance légale
- **Anti-detection IA** : ratio 60/40 IA/humain dans les mémoires techniques

---

## Communication inter-agents

### INPUT : depuis Agent 1b (Veilleur Marchés)

```typescript
interface TenderLeadInput {
  boamp_reference: string;       // "BOAMP-26-12345"
  source_url: string;            // URL plateforme de dépôt
  acheteur: string;              // "Communauté d'Agglomération CINOR"
  objet: string;                 // "Refonte du portail internet"
  type_procedure: string;        // "MAPA"
  montant_estime: number;        // 60000
  date_publication: string;      // ISO 8601
  date_deadline: string;         // ISO 8601
  dce_urls: string[];            // ["RC.pdf", "CCTP.pdf", "CCAP.pdf"]
  score_lead: number;            // 75 (>= 60 pour qualification)
  mots_cles: string[];           // ["refonte", "portail", "React", "accessibilité"]
}
```

### OUTPUT : 3 destinations

| Destination | Quand | Payload |
|------------|-------|---------|
| Agent 8 Dealmaker | Marché GAGNÉ | Dossier complet, conditions marché, contacts acheteur |
| Agent 10 CSM | Marché GAGNÉ | Profil client, historique, SLA contractuels |
| Agent 7 Analyste | Toujours | Métriques : taux soumission, taux succès, coût/AO, ROI |

### Flux de données inter-sous-agents

```
9a Analyseur → 9b Qualificateur : DCEAnalysis complet
9a Analyseur → 9c Juriste : conditions_participation, pièces_exigées, analyse_ccap
9a Analyseur → 9d Chiffreur : exigences_techniques, critères_évaluation, stratégie_prix
9a Analyseur → 9e Rédacteur : exigences_individuelles, mots_clés_miroir, template_mémoire
9d Chiffreur → 9e Rédacteur : offre_financière (influence section "moyens")
9c Juriste → 9f Contrôleur : dossier_administratif (DC1/DC2/DUME)
9d Chiffreur → 9f Contrôleur : offre_financière (BPU/DQE/DPGF)
9e Rédacteur → 9f Contrôleur : mémoire_technique (PDF final)
9f Contrôleur → Jonathan : rapport_contrôle (GO / CORRECTIONS REQUISES)
```

---

## Workflow complet (J-31 à J+30)

### Rétroplanification standard (>= 31 jours)

| Jour | Action | Responsable | Sous-Agent |
|:----:|--------|:-----------:|:----------:|
| J-31 | GO confirmé → lancement analyse DCE | IA | 9a |
| J-28 | Analyse DCE complète → brief stratégie | IA | 9a, 9b |
| J-25 | Questions à poser à l'acheteur | Jonathan | 9a |
| J-20 | Stratégie technique validée → lancement rédaction | Jonathan | 9b |
| J-15 | Premier jet mémoire technique | IA | 9e |
| J-12 | Chiffrage première estimation | IA + Jonathan | 9d |
| J-10 | Chiffrage finalisé | Jonathan | 9d |
| J-7 | Relecture + contrôle conformité | Jonathan | 9f |
| J-5 | Dossier administratif finalisé | IA | 9c |
| J-3 | Dossier finalisé, signature électronique | IA + Jonathan | 9f |
| J-1 | Dépôt sur la plateforme | IA | — |
| J-0 | DEADLINE | Équipe | — |
| J+10 | Relance si pas de nouvelle | IA | 9g |
| J+30 | RETEX si rejet | IA + Jonathan | 9g |

---

## Code existant — État actuel

| Composant | Status | Lignes |
|-----------|:------:|:------:|
| Module (CQRS) | Fonctionnel | 23 |
| AppelsOffresService (2 méthodes) | Basique — analyse GO/NO-GO uniquement | 207 |
| AppelsOffresController (4 endpoints) | Sans @Roles, Prisma direct | 40 |
| AnalyzeTenderCommand + Handler | Fonctionnel | ~50 |
| GetTenderAnalysisQuery + Handler | Fonctionnel | ~30 |
| Tender entity | Basique | ~60 |
| Proposal entity | Squelette | ~40 |
| ITenderRepository + Prisma | Fonctionnel | ~80 |
| **Sub-agent 9a Analyseur DCE** | **Non implémenté** (le service fait un mini-scoring) | 0 |
| **Sub-agent 9b Qualificateur** | **Partiellement** (scoring 7 axes dans le service) | 0 |
| **Sub-agent 9c Juriste** | **Non implémenté** | 0 |
| **Sub-agent 9d Chiffreur** | **Non implémenté** | 0 |
| **Sub-agent 9e Rédacteur** | **Non implémenté** | 0 |
| **Sub-agent 9f Contrôleur QA** | **Non implémenté** | 0 |
| **Sub-agent 9g Moniteur** | **Non implémenté** | 0 |

**Total : 11 fichiers, ~530 lignes. 7 sous-agents à implémenter.**

---

## AUDIT — 26 bugs identifiés

### Bugs CRITICAL (5)

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B1** | **PyMuPDF CVE-2026-0006 (CVSS 9.8)** — extraction PDF sans sandbox Docker | spec AGENT-9a | RCE si un DCE malveillant est uploadé |
| **B2** | 7 sous-agents entièrement absents — seul le scoring GO/NO-GO basique existe | — | 95% des fonctionnalités manquantes |
| **B3** | Pas de pipeline séquentiel/parallèle — les sous-agents ne communiquent pas entre eux | — | Workflow impossible |
| **B4** | `dceAnalysisResult` stocké comme `as any` dans Prisma JSON — perte de type-safety | `appels-offres.service.ts:157` | Corruption données possible |
| **B5** | Controller bypass le service (injection directe Prisma + CommandBus) | `appels-offres.controller.ts:12-13` | Architecture incohérente |
| **B6** | **TenderStatus enum MISMATCH** — domain (NEW/ANALYZING/SUBMITTED/WON/LOST/IGNORED) vs Prisma (open/closed/awarded/cancelled). Les `as any` casts masquent la corruption | `tender.entity.ts` vs `schema.prisma` | Données corrompues silencieusement |
| **B7** | **Logique d'analyse dupliquée** — service et CQRS handler ont 2 prompts différents, 2 scorings différents | `appels-offres.service.ts` vs `analyze-tender.handler.ts` | Résultats incohérents |

### Bugs HIGH (8)

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **B6** | Pas de Prisma models dédiés Agent 9 : ao_analyses, ao_exigences, ao_questions manquants | `schema.prisma` | Sous-agents 9a-9g impossibles |
| **B7** | Pas de structure dossiers fichiers (spec §6) — pas de stockage DCE/mémoires/contrats | — | Fichiers non organisés |
| **B8** | Pas de templates mémoire (spec §7) — pas de MEMOIRE-TECHNIQUE-TEMPLATE.md intégré | — | Mémoire technique non conforme |
| **B9** | Pas d'intégration BOAMP/DECP pour le moniteur post-dépôt | — | Résultats non détectés |
| **B10** | Pas de gestion des deadlines — pas d'alertes J-5, J-3, J-1 | — | Dépôt raté |
| **B11** | Pas de transfert vers Agent 8 quand marché gagné | — | Exécution du marché non déclenchée |
| **B12** | Pas de système RETEX (retour d'expérience) post-rejet | — | Pas de capitalisation, mêmes erreurs répétées |
| **B13** | Pas de ratio 60/40 IA/humain dans la génération de contenu | — | Mémoire détecté comme IA → rejet |

### Bugs sécurité (6)

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| **S1** | Pas de @Roles sur controller — accès public aux appels d'offres | `appels-offres.controller.ts` | Tout user auth voit les AO |
| **S2** | Pas de validation input sur `forceReanalyze` — injection possible | `appels-offres.controller.ts:28` | Body non validé |
| **S3** | Claude reçoit les DCE complets (documents marchés publics confidentiels) | spec 9a | Data exfiltration potentielle |
| **S4** | PDF générés (mémoire, contrats) sans signature numérique | spec 9c/9f | Document non authentifiable |
| **S5** | Pas de validation HMAC sur les fichiers DCE téléchargés | spec 9a | Fichier corrompu/malveillant traité |
| **S6** | listTenders() retourne TOUS les AO sans pagination ni filtre | `appels-offres.controller.ts:16-17` | Data exposure |

### Gaps spec vs code (7)

| # | Manquant | Spec |
|---|---------|------|
| G1 | **9a Analyseur DCE** : PyMuPDF extraction, Claude structured outputs, chunking > 100 pages | AGENT-9a |
| G2 | **9b Qualificateur** : scoring amélioré, notification Slack Jonathan, GO/NO-GO review | AGENT-9b |
| G3 | **9c Juriste** : DC1/DC2/DUME pré-remplis, attestations, validités | AGENT-9c |
| G4 | **9d Chiffreur** : BPU/DQE/DPGF, stratégie prix, marge LODEOM | AGENT-9d |
| G5 | **9e Rédacteur** : mémoire 5 chapitres, Claude, anti-detection IA, schémas Mermaid | AGENT-9e |
| G6 | **9f Contrôleur QA** : checklist 29 points, rapport contrôle, validation Jonathan | AGENT-9f |
| G7 | **9g Moniteur** : surveillance Q/R, résultats BOAMP, courrier R2181-3, RETEX, DECP | AGENT-9g |

---

## Variables d'environnement

```env
# ══════════════════════════════════════════════
#          AGENT 9 — APPELS D'OFFRES
# ══════════════════════════════════════════════
APPELS_OFFRES_ENABLED=true

# ──────────── PyMuPDF / PDF extraction ────────────
# PyMuPDF : npm package, pas de clé API
# ATTENTION : CVE-2026-0006 (CVSS 9.8) → exécuter UNIQUEMENT dans Docker sandbox
PYMUPDF_DOCKER_IMAGE=pymupdf-sandbox:latest     # Image Docker dédiée
PYMUPDF_TIMEOUT_MS=120000                        # Timeout extraction PDF (2 min)
DCE_MAX_PAGES=500                                # Max pages par DCE
DCE_STORAGE_PATH=/data/marches-publics           # Stockage des DCE

# ──────────── BOAMP / DECP (APIs publiques gratuites) ────────────
# BOAMP_API_URL déjà défini dans Agent 1b
# DECP_API_URL déjà défini dans Agent 1b

# ──────────── Signatures et dépôt ────────────
# Pas de clé API pour les plateformes de dépôt (dépôt manuel par Jonathan)
# Signature électronique : via Yousign (Agent 8) ou certificat RGS**

# ──────────── Crons ────────────
APPELS_OFFRES_DEADLINE_CHECK_CRON=0 8 * * *     # Check deadlines quotidien 8h
APPELS_OFFRES_MONITEUR_CRON=0 6,14 * * *        # Surveillance résultats 2x/jour

# Utilise ANTHROPIC_API_KEY (socle) pour Claude (analyse DCE, mémoire, scoring)
# Utilise SLACK_WEBHOOK_URL (socle) pour notifications Jonathan
```

---

## Roadmap d'Implémentation

### Phase 0 — Prisma + Entities + Pipeline orchestration (1 jour)
- [ ] Prisma migration : ao_analyses, ao_exigences, ao_questions, ao_dossier_admin, ao_offre_financiere, ao_memoire_technique, ao_controle_qa
- [ ] Tender entity enrichi (statuts : DETECTED → ANALYZING → QUALIFIED → GO → IN_PROGRESS → SUBMITTED → WON/LOST)
- [ ] Pipeline orchestrator : séquentiel (9a→9b) + parallèle (9c//9d//9e) + séquentiel (9f)
- [ ] @Roles + ParseUUIDPipe + Zod validation sur controller

### Phase 1 — 9a Analyseur DCE + 9b Qualificateur (2 jours)
- [ ] DCE extraction service (PyMuPDF in Docker sandbox)
- [ ] Claude structured outputs pour analyse DCE
- [ ] Chunking pour DCE > 100 pages
- [ ] Scoring GO/NO-GO 7 axes (existant à enrichir)
- [ ] Notification Slack Jonathan + système de review GO/NO-GO

### Phase 2 — 9c Juriste + 9d Chiffreur (1.5 jours, parallélisables)
- [ ] Dossier administratif : DC1/DC2/DUME pré-remplis Axiom
- [ ] Attestations tracking (validités, renouvellements)
- [ ] Offre financière : BPU/DQE/DPGF templates
- [ ] Stratégie prix + marge LODEOM

### Phase 3 — 9e Rédacteur Mémoire (2 jours)
- [ ] Mémoire technique 5 chapitres (template Jonathan)
- [ ] Claude API génération par section
- [ ] Anti-detection IA (ratio 60/40, checklist 7 points)
- [ ] Schémas Mermaid (Gantt, architecture, organisation)
- [ ] Sélection auto des références pertinentes (FICHES-REFERENCES-AXIOM.md)
- [ ] Sections conditionnelles (FLAGS RSE, RGAA, volet social)

### Phase 4 — 9f Contrôleur QA + 9g Moniteur (1.5 jours)
- [ ] Checklist 29 points de conformité
- [ ] Rapport contrôle → validation Jonathan
- [ ] Moniteur post-dépôt : surveillance Q/R, résultats BOAMP/DECP
- [ ] Courrier post-rejet art. R2181-3
- [ ] RETEX structuré + capitalisation base de connaissances

### Phase 5 — Integration + Tests (1 jour)
- [ ] Transfert GAGNÉ → Agent 8/10
- [ ] Métriques → Agent 7
- [ ] Tests unitaires pour chaque sous-agent
- [ ] Gestion deadlines (alertes J-5, J-3, J-1)

### Dépendances

```
Phase 0 (foundation) — BLOQUANTE
  ↓
Phase 1 (9a + 9b) — BLOQUANTE (analyse + décision GO)
  ↓
Phase 2 (9c + 9d) + Phase 3 (9e) — PARALLÉLISABLES
  ↓
Phase 4 (9f + 9g) — dépend de 2+3
Phase 5 (integration + tests) — dépend de tout
```

---

## Coûts Agent 9

| Poste | Coût par AO | Détail |
|-------|:----------:|--------|
| 9a Analyseur DCE | ~1 EUR | Claude API |
| 9b Qualificateur | ~0.05 EUR | Claude API + 0-15 min Jonathan |
| 9c Juriste | ~20 EUR | Génération PDF + 15 min Jonathan |
| 9d Chiffreur | ~200-400 EUR | IA + 2-4h Jonathan (validation prix) |
| 9e Rédacteur | ~400-800 EUR | IA + 4-8h Jonathan (relecture) |
| 9f Contrôleur QA | ~80 EUR | IA + 1h Jonathan |
| 9g Moniteur | ~0-40 EUR | Scraping + 30 min si rejet |
| **TOTAL par AO** | **~700-1340 EUR** | **Objectif ROI > 5x** |
| **Coût mensuel estimé** | **~31 EUR** | **Infrastructure + Claude API base** |

---

## Audit final — Vérifications de cohérence

### 14 gaps comblés dans le 09b

| Gap | Ce qui manquait | Section ajoutée |
|-----|----------------|:---------------:|
| G1 | Expected Value formula pour GO/NO-GO | §8ter (9b EV) |
| G2 | TJM par séniorité (Senior/Mid/Junior) | §8ter (9d TJM) |
| G3 | Margin severity levels (BLOQUANTE → BASSE) | §8ter (9d marges) |
| G4 | Détection marché "fausse chance" (4 flags suspicion) | §8ter (9a fausse chance) |
| G5 | 9 types d'alertes moniteur post-dépôt | §8bis (9g alertes) |
| G6 | 20 message types (vs 11 avant) | §9 enrichi |
| G7 | 3 niveaux d'escalade formalisés | §8bis (escalade) |
| G8 | PAdES + eIDAS pour signatures > 40K EUR | §8ter (9f signatures) |
| G9 | Base de connaissances évolutive (6 données RETEX) | §8ter (9g capitalisation) |
| G10 | Convention nommage fichiers `NN_TYPE_UNIVILE_[ref].pdf` | Référencé §8ter |
| G11 | Sections non-automatisables flaggées pour Jonathan | §8ter (9e sections) |
| G12 | Success rate par type marché dans 09b | §8ter (9b success rate) |
| G13 | Copyleaks API pour validation anti-detection | §8ter (9e Copyleaks) |
| G14 | Formulation volet social validée juridiquement | §8ter (9e volet social) |

### Brainstorm enrichi (3 ajouts)

| # | Feature additionnelle | Priorité |
|---|----------------------|:--------:|
| F9 | **Alerte certificat RGS***** — tracker la validité du certificat de signature de Jonathan | P1 |
| F10 | **Calibration scoring automatique** — les RETEX ajustent les poids des 7 axes du 9b après 20+ AO | P1 |
| F11 | **Détection offre anormalement basse** — seuil automatique basé sur l'historique DECP | P2 |
