# Agent 3 — SCOREUR (Master)

## Vue d'Ensemble

L'Agent 3 (SCOREUR) est le cerveau évaluateur du pipeline Axiom Marketing. Il reçoit chaque fiche prospect enrichie de l'Agent 2 (ENRICHISSEUR) et applique un modèle de scoring déterministe à 4 axes (ICP Fit, Signaux d'intention, Données techniques, Engagement) pour calculer un score total sur 100 points. Il catégorise le prospect en HOT (75-100), WARM (50-74), COLD (25-49) ou DISQUALIFIÉ (0-24), détermine le routing vers l'Agent 4 (canal, séquence, validation humaine, SLA), et dispatche la fiche scorée via BullMQ. Aucun sous-agent, aucune API externe : le calcul est synchrone, local, < 50 ms par prospect.

## Sous-Agents

Aucun — le Scoreur est un agent monolithique. Pas de sous-agents, pas d'API externes.

| Propriété | Valeur |
|-----------|--------|
| Type de calcul | Déterministe, rules-based |
| Temps de traitement | < 50 ms par prospect |
| Mode | Synchrone |
| Coût marginal | 0 EUR |
| Queue d'entrée | BullMQ `scoreur-pipeline` |
| Queue de sortie | BullMQ `redacteur-pipeline` |

## Input / Output

### Input (depuis Agent 2 — ENRICHISSEUR)

Reçu via queue BullMQ `scoreur-pipeline` — fiche prospect enrichie complète (cf. section Output Agent 2).

Champs critiques exploités :
- `entreprise.effectif.exact` / `effectif.tranche` + `finances.ca_dernier` → Axe 1 Taille
- `entreprise.code_naf` / `secteur` → Axe 1 Secteur
- `entreprise.adresse.pays` / `departement` → Axe 1 Localisation
- `contact.decideur_score` / `contact.poste` → Axe 1 Décideur
- `signaux[]` avec `type` + `date_signal` → Axe 2 Signaux (+ decay temporel)
- `technique.performance.score` → Axe 3 Performance Lighthouse
- `technique.stack.cms` + `stack.cms_version` → Axe 3 Stack obsolète
- `technique.accessibilite.rgaa_compliant` + `violations_critical` → Axe 3 Accessibilité
- `contact.email_status` + `contact.telephone` + `nb_detections` → Axe 4 Engagement
- `entreprise.alertes.*` → Scoring négatif / disqualification

### Output (vers Agent 4 — RÉDACTEUR)

Transmis via queue BullMQ `redacteur-pipeline` — fiche enrichie + scoring complet + routing :

```json
{
  "prospect_id": "uuid-v4",
  "scored_at": "2026-03-18T09:16:00Z",
  "score": {
    "total": 82,
    "categorie": "HOT",
    "sous_categorie": "HOT_B",
    "detail": {
      "axe1_icp_fit": { "total": 28, "max": 35, "taille": 10, "secteur": 10, "localisation": 8, "decideur": 7 },
      "axe2_signaux": {
        "total": 24.5, "max": 30,
        "signal_principal": { "type": "changement_poste", "score_base": 28, "jours_ecoules": 21, "demi_vie": 60, "score_apres_decay": 22.1 },
        "signaux_secondaires": [ { "type": "recrutement_dev_web", "score_final": 10.5 } ]
      },
      "axe3_technique": { "total": 16, "max": 20, "performance": 7, "stack_obsolete": 4, "accessibilite": 5 },
      "axe4_engagement": { "total": 5, "max": 15, "email_verifie": 2, "telephone_trouve": 1, "multi_source": 2 },
      "scoring_negatif": { "total": 0, "disqualified": false, "malus": [] }
    },
    "confiance_score": 85
  },
  "routing": {
    "sequence_id": "SEQ_HOT_B_PRIORITY",
    "canal_principal": "linkedin_dm",
    "canal_secondaire": "email_perso",
    "validation_jonathan": true,
    "validation_bloquante": true,
    "sla_heures": 2,
    "nb_touchpoints": 4,
    "espacement_jours": [0, 2, 5, 10],
    "urgence": "haute",
    "priorite_queue": 1
  }
}
```

## Workflow

**Étape 1 — Validation input** : Vérification schema (prospect_id, entreprise.nom, signaux)

**Étape 2 — Vérification disqualification** : Consultation blocklists Redis (RGPD, concurrents, clients actifs)

**Étape 3 — Calcul Axe 1 : ICP Fit (35 pts max)**

*Taille entreprise (10 pts max) :*
| Critère | Points | Condition |
|---------|--------|-----------|
| PME cible idéale | 10 | 50-250 salariés ET CA 2M-25M EUR |
| PME grande | 8 | 250-500 salariés ET CA 25M-100M EUR |
| Petite PME | 7 | 20-50 salariés ET CA 500k-2M EUR |
| Startup cible | 6 | 5-20 salariés ET CA 100k-500k EUR |
| Micro-entreprise | 4 | 1-5 salariés |
| ETI / Grande entreprise | 5 | > 500 salariés |
| Effectif inconnu | 3 | Aucune donnée |
| CA < 50k EUR | 0 | Disqualification douce |

*Secteur d'activité (10 pts max) — par code NAF :*
| Score | Codes NAF |
|-------|-----------|
| 10 pts | E-commerce : 4791A/B, 4711B/C, 4719A/B — SaaS/Tech : 6201Z, 6202A/B, 6203Z, 6209Z, 6311Z/Z |
| 8 pts | Services B2B : 7021Z/7022Z/7311Z/7312Z/7320Z/7010Z — Collectivités : 8411Z-8430B |
| 6 pts | Industrie (préfixes NAF 10-33), Santé (86xx) |
| 5 pts | Éducation (85xx), BTP (41-43xx) |
| 4 pts | Finance/Assurance (64-66xx) — Autres secteurs |
| 3 pts | Secteur non identifié |
| -100 | Secteur interdit (HARD DISQUALIFICATION) |

*Localisation (8 pts max) :*
| Score | Condition |
|-------|-----------|
| 8 pts | France métropolitaine (pays=France, dept 01-95) |
| 7 pts | DOM-TOM (dept 971/972/973/974/976/975/977/978) |
| 6 pts | Belgique, Suisse, Luxembourg |
| 4 pts | UE autre |
| 3 pts | Anglophone hors UE (USA, UK, Canada, Australie) |
| 2 pts | Reste du monde |
| 3 pts | Localisation inconnue |
| -100 | Pays sanctionné (Russie, Iran, etc.) — HARD DISQUALIFICATION |

*Profil décideur (7 pts max) — basé sur `decideur_score` Agent 2a :*
| Score | Condition |
|-------|-----------|
| 7 pts | decideur_score >= 9 OU regex C-Level (CEO/CTO/CMO/DG/PDG) |
| 6 pts | decideur_score >= 7 OU regex VP/Directeur |
| 5 pts | decideur_score >= 5 OU Head of / Responsable |
| 3 pts | decideur_score >= 3 OU Manager |
| 1 pt | decideur_score >= 1 |
| 0 pt | Pas de contact identifié |
| -3 pts | Stagiaire / Junior / Alternant (malus) |

**Étape 4 — Calcul Axe 2 : Signaux d'intention (30 pts max)**

*Scores de base et demi-vies par type de signal :*
| Type de signal | Score base | Tier | Demi-vie (jours) |
|----------------|-----------|------|-----------------|
| `levee_fonds` | 30 | 1 | 45 |
| `changement_poste` | 28 | 1 | 60 |
| `marche_public` | 25 | 1 | 30 |
| `recrutement_actif` | 22 | 2 | 45 |
| `recrutement_dev_web` | 22 | 2 | 45 |
| `post_besoin_tech` | 20 | 2 | 30 |
| `croissance_equipe` | 18 | 2 | 60 |
| `creation_etablissement` | 12 | 3 | 60 |
| `site_lent` | 15 | 3 | 90 |
| `accessibilite_faible` | 15 | 3 | 90 |
| `tech_obsolete` | 15 | 3 | 120 |
| `engagement_contenu` | 10 | 3 | 30 |
| `cession_parts` | 10 | 3 | 45 |
| `modification_statuts` | 8 | 3 | 60 |

*Formule half-life decay :*
```
score_signal(t) = score_base × (1/2)^(t / demi_vie)
```
Où `t` = jours écoulés depuis `date_signal`.

Exemples concrets :
```
levee_fonds (score_base=30, demi_vie=45j) :
  t=0j   → 30 × 1.000 = 30.0 pts
  t=15j  → 30 × 0.794 = 23.8 pts
  t=45j  → 30 × 0.500 = 15.0 pts
  t=90j  → 30 × 0.250 = 7.5 pts

changement_poste (score_base=28, demi_vie=60j) :
  t=0j   → 28 × 1.000 = 28.0 pts
  t=21j  → 28 × 0.789 = 22.1 pts
  t=60j  → 28 × 0.500 = 14.0 pts
  t=120j → 28 × 0.250 = 7.0 pts
```

*Agrégation multi-signaux (coefficients de rang) :*
| Rang | Coefficient |
|------|------------|
| Signal 1 (principal) | 100% (1.0) |
| Signal 2 | 50% (0.5) |
| Signal 3 | 25% (0.25) |
| Signal 4+ | 10% (0.10) |

Règles : seuil plancher < 1 pt → signal ignoré ; bonus multi-source si `nb_detections >= 3` → +3 pts ; plafond Axe 2 = 30 pts.

**Étape 5 — Calcul Axe 3 : Données techniques (20 pts max)**

*Performance Lighthouse (8 pts max) :*
| Score Lighthouse | Points |
|-----------------|--------|
| 0-29 | 8 (opportunité majeure) |
| 30-49 | 7 (fort potentiel) |
| 50-69 | 5 (potentiel moyen) |
| 70-89 | 2 (peu d'argument perf) |
| 90-100 | 0 |
| null | 0 |

*Stack obsolète (6 pts max) :*
| Critère | Points | Condition |
|---------|--------|-----------|
| CMS obsolète | 3 | WordPress < 6.0, Joomla (toutes versions), Drupal < 10, PrestaShop < 8.0 |
| Pas de framework JS moderne | 2 | Aucun React/Next/Vue/Nuxt/Angular/Svelte/Remix/Astro/Gatsby |
| Serveur obsolète | 1 | Apache sans CDN |

*Non-conformité RGAA (6 pts max + bonus collectivités) :*
| Critère | Points |
|---------|--------|
| `rgaa_compliant=false` ET `violations_critical >= 5` | 6 pts |
| `rgaa_compliant=false` ET `violations_critical >= 1` | 4 pts |
| Score accessibilité < 50 | 5 pts |
| Score accessibilité 50-69 | 3 pts |
| Score accessibilité 70-84 | 1 pt |
| Score accessibilité >= 85 | 0 pt |
| Bonus segment `collectivite` + `rgaa_compliant=false` | +2 pts supplémentaires |

**Étape 6 — Calcul Axe 4 : Engagement (15 pts max)**

*En Phase 1 (signaux disponibles dès le lancement) :*
| Critère | Points | Condition |
|---------|--------|-----------|
| Email vérifié | 2 | `email_status === 'verified'` |
| Téléphone trouvé | 1 | `contact.telephone !== null` |
| Engagement LinkedIn | 3 | Signal `engagement_contenu` source `1a_linkedin` |
| Multi-source detection | 2 | `nb_detections >= 2` |
| Completude fiche >= 80% | 2 | `enrichissement.qualite.completude_pct >= 80` |
| Completude fiche 60-79% | 1 | |

*En Phase 2+ (à activer) :* visite site Axiom (5 pts), email ouvert/cliqué (4-5 pts), réponse email (4 pts), téléchargement ressource (4 pts), demande de contact (10 pts)

**Étape 7 — Scoring négatif**

*Disqualifications HARD (score forcé à 0, catégorie DISQUALIFIÉ) :*
| Critère | Déclencheur |
|---------|-------------|
| Procédure collective | `alertes.procedure_collective === true` |
| Entreprise fermée | `alertes.entreprise_fermee === true` |
| Opt-out RGPD | Email dans table `rgpd_oppositions` |
| Concurrent détecté | Domaine dans `COMPETITOR_BLOCKLIST` |
| Client existant | SIRET/domaine dans `clients_actifs` |
| Pays sanctionné | `scoreLocalisation() === -100` |
| Secteur interdit | `scoreSecteur() === -100` |

*Malus SOFT :*
| Critère | Malus |
|---------|-------|
| CA < 50k EUR | -15 pts |
| CA en baisse forte (> 20%) | -10 pts |
| CA en baisse légère (> 10%) | -5 pts |
| Effectif en baisse | -5 pts |
| Email non trouvé | -10 pts |
| Email non vérifié (catch_all) | -5 pts |
| Email personnel (@gmail/@yahoo/etc.) | -8 pts |
| Pas de décideur identifié | -10 pts |
| Aucun signal d'intention | -5 pts |
| Enrichissement incomplet (< 40%) | -5 pts |
| Signaux BODACC négatifs | -5 pts |

**Étape 8 — Score final** : `clamp(0, 100, Axe1 + Axe2 + Axe3 + Axe4 + Négatif)`

**Étape 9 — Catégorisation et routing**

| Catégorie | Score | Canal principal | Validation | SLA |
|-----------|-------|-----------------|-----------|-----|
| HOT_A | 90-100 | LinkedIn DM | Jonathan (bloquante) | 1h |
| HOT_B | 75-89 | LinkedIn DM ou email | Jonathan (bloquante) | 2h |
| HOT_C | 75-89 (startup) | Email direct | Jonathan (non-bloquante) | 4h |
| WARM | 50-74 | Email | Auto-approuvé | 24h |
| COLD | 25-49 | Email (séquence longue) | Auto-approuvé | 48h |
| DISQUALIFIÉ | 0-24 | Aucun | Archivage | N/A |

**Étape 10 — Dispatch** via BullMQ `redacteur-pipeline` avec priorité selon catégorie

## APIs & Coûts

Aucune API externe. Coût : 0 EUR/mois. Calcul CPU uniquement.

| Composant | Description | Coût |
|-----------|-------------|------|
| PostgreSQL | Lecture `prospects`, `scores`, écriture `scores` et `score_history` | Inclus infra partagée |
| Redis | Cache blocklists, scores récents | Inclus infra partagée |
| BullMQ | Queues `scoreur-pipeline` et `redacteur-pipeline` | Inclus Redis |

## Base de Données

### Tables Principales

```sql
-- Table scores (résultat du scoreur)
CREATE TABLE scores (
  id                      SERIAL PRIMARY KEY,
  prospect_id             UUID NOT NULL REFERENCES prospects(prospect_id),
  score_total             INTEGER NOT NULL CHECK (score_total >= 0 AND score_total <= 100),
  categorie               VARCHAR(15) NOT NULL, -- 'HOT'|'WARM'|'COLD'|'DISQUALIFIE'
  sous_categorie          VARCHAR(10), -- 'HOT_A'|'HOT_B'|'HOT_C'
  segment_primaire        VARCHAR(30),
  axe1_icp_fit            INTEGER,
  axe2_signaux            DECIMAL,
  axe3_technique          INTEGER,
  axe4_engagement         INTEGER,
  malus_total             INTEGER DEFAULT 0,
  disqualified            BOOLEAN DEFAULT false,
  disqualification_reason VARCHAR(100),
  confiance_score         INTEGER, -- 0-100
  routing                 JSONB, -- sequence_id, canal, sla, etc.
  score_detail            JSONB, -- détail complet de chaque sous-critère
  scored_at               TIMESTAMP DEFAULT NOW()
);

-- Historique des scores (pour suivi de l'évolution)
CREATE TABLE score_history (
  id                  SERIAL PRIMARY KEY,
  prospect_id         UUID REFERENCES prospects(prospect_id),
  ancien_score        INTEGER,
  nouveau_score       INTEGER,
  ancienne_categorie  VARCHAR(15),
  nouvelle_categorie  VARCHAR(15),
  raison              VARCHAR(100), -- 'rescore_initial'|'rescore_signal'|'rescore_engagement'
  scored_at           TIMESTAMP DEFAULT NOW()
);

-- Outcomes prospects (pour calibration du modèle)
CREATE TABLE prospect_outcomes (
  id                      SERIAL PRIMARY KEY,
  prospect_id             UUID REFERENCES prospects(prospect_id),
  outcome                 VARCHAR(30), -- 'converti'|'interesse'|'pas_de_reponse'|'refuse'
  score_at_contact        INTEGER,
  categorie_at_contact    VARCHAR(15),
  montant_deal            DECIMAL,
  canal_conversion        VARCHAR(30),
  cycle_vente_jours       INTEGER,
  date_outcome            TIMESTAMP DEFAULT NOW()
);

-- Vue distribution des scores
CREATE VIEW score_distribution AS
SELECT
  categorie,
  COUNT(*) as total,
  AVG(score_total) as score_moyen,
  MIN(score_total) as score_min,
  MAX(score_total) as score_max
FROM scores
WHERE scored_at >= NOW() - INTERVAL '30 days'
GROUP BY categorie;
```

## Scheduling

| Cron | Action | Description |
|------|--------|-------------|
| Événementiel (BullMQ) | `scoreProspect(fiche)` | Déclenché par chaque job dans `scoreur-pipeline` |
| Concurrency | Synchrone, < 50ms | Pas de concurrence nécessaire — calcul CPU pur |
| Hebdomadaire (via Agent 7) | `calibrateWeights()` | Recommandation de recalibration des poids (validation Jonathan requise) |

## Error Handling

| Erreur | Action | Fallback |
|--------|--------|----------|
| `entreprise.nom` absent | Rejeter le job, log `ERREUR_INPUT_INCOMPLET` | BullMQ retry 3x |
| Blocklist Redis indisponible | Utiliser cache en mémoire (5 min TTL) | Logger l'indisponibilité |
| Disqualification HARD détectée | Score = 0, catégorie = DISQUALIFIÉ, archiver | Aucun dispatch vers Agent 4 |
| Score calculé > 100 | `clamp(0, 100, score)` | Log warning si score > 100 avant clamp |
| Signal avec `date_signal` dans le futur | Ignorer le signal, log anomalie | Continuer sans ce signal |
| Type de signal inconnu | Score de base = 5, demi-vie = 60j | Log warning |
| Axe 4 : pas de données engagement | Score engagement = 0 | Pas de blocage |
| Routing impossible (segment inconnu) | Utiliser routing par défaut (WARM email 48h) | Log warning |

## KPIs & Métriques

| KPI | Cible Phase 1 | Fréquence |
|-----|---------------|-----------|
| Distribution HOT | ~10% des prospects scorés | Quotidien |
| Précision HOT (taux conversion HOT → opportunité) | >= 30% | Mensuel |
| Recall (% des convertis qui étaient HOT) | >= 60% | Mensuel |
| Faux positifs HOT (HOT sans réponse) | < 40% | Mensuel |
| Score moyen des deals convertis | >= 65 | Mensuel |
| Temps de traitement moyen | < 50 ms | Quotidien |

## Edge Cases

- **Multi-segment** : Un prospect peut correspondre à plusieurs segments (ex: startup qui fait du e-commerce). Le scoreur utilise le segment primaire du Veilleur mais applique les coefficients du segment le plus favorable
- **Signal très ancien** : Après 6 mois (180j), la plupart des signaux ont un score après decay < 1 pt et sont ignorés. Le prospect reste en base mais son Axe 2 = 0
- **Fiche avec 0 signaux** : Axe 2 = 0, malus -5 pts (Axe 1 + Axe 3 + Axe 4 peuvent compenserp our atteindre COLD)
- **Bonus collectivité RGAA** : Le plafond Axe 3 reste 20 pts mais la composante accessibilité peut atteindre 8 pts (6 + 2 bonus) au lieu de 6
- **Recalibration ML (Phase 2)** : Le modèle déterministe sera remplacé progressivement par un modèle ML entraîné sur `prospect_outcomes` — jusqu'à 500 outcomes labelisés requis avant transition

## Budget

0 EUR/mois (calcul local uniquement)

## Référence Spec

`.claude/source-ia/agent/AGENT-3-MASTER.md`
Modèle de scoring complet : `AGENT-3-MODELE-SCORING.md`
Feedback et calibration : `AGENT-3-FEEDBACK-CALIBRATION.md`
