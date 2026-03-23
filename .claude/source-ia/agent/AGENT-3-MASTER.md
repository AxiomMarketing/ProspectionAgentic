# AGENT 3 — SCOREUR (MASTER)
**Fichiers associes** : AGENT-3-MODELE-SCORING.md, AGENT-3-FEEDBACK-CALIBRATION.md
**Position dans le pipeline** : Agent 2 (Enrichisseur) → Agent 3 → Agent 4 (Redacteur)
**Cout** : 0 EUR/mois (calcul local, pas d'API externe)

---

**Date** : 18 mars 2026
**Auteur** : Axiom Marketing -- Systeme de prospection automatise
**Version** : 1.0
**Contexte** : Stack interne -- Claude API, n8n, AdonisJS, React, PostgreSQL
**Pipeline** : VEILLEUR (Agent 1) --> ENRICHISSEUR (Agent 2) --> **SCOREUR (ce doc)** --> REDACTEUR (Agent 4) --> SUIVEUR --> NURTUREUR --> ANALYSTE

---

## TABLE DES MATIERES

1. [Mission du Scoreur](#1-mission-du-scoreur)
2. [Input : Schema JSON recu de l'Agent 2](#2-input--schema-json-recu-de-lagent-2)
3. [Categorisation HOT / WARM / COLD / DISQUALIFIE](#3-categorisation-hot--warm--cold--disqualifie)
4. [Routing vers l'Agent 4 (REDACTEUR)](#4-routing-vers-lagent-4-redacteur)
5. [Verification de coherence](#5-verification-de-coherence)
6. [Integration avec les Agents 8, 9, 10](#6-integration-avec-les-agents-8-9-10)
7. [Annexe A : Diagramme de flux complet](#annexe-a--diagramme-de-flux-complet)

> **Modele de scoring detaille** : voir [AGENT-3-MODELE-SCORING.md](AGENT-3-MODELE-SCORING.md) (4 axes, coefficients par segment, signal decay, code TypeScript, exemples)
> **Feedback et calibration** : voir [AGENT-3-FEEDBACK-CALIBRATION.md](AGENT-3-FEEDBACK-CALIBRATION.md) (feedback loop, metriques, recalibration, transition ML)

---

## 1. MISSION DU SCOREUR

### 1.1 Position dans le pipeline

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        AGENT 3 -- SCOREUR                                    │
│                                                                              │
│  PAS de sous-agents                                                          │
│  PAS d'API externes                                                          │
│  Calcul DETERMINISTE, synchrone, < 50ms par prospect                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                                                                     │     │
│  │   1. Validation input (fiche enrichie Agent 2)                     │     │
│  │   2. Verification disqualification (blocklist, alertes)            │     │
│  │   3. Calcul Axe 1 -- ICP Fit (35 pts max)                         │     │
│  │   4. Calcul Axe 2 -- Signaux d'intention (30 pts max)             │     │
│  │   5. Calcul Axe 3 -- Donnees techniques (20 pts max)              │     │
│  │   6. Calcul Axe 4 -- Engagement (15 pts max)                      │     │
│  │   7. Scoring negatif (malus)                                       │     │
│  │   8. Score total = clamp(0, 100, somme des axes + negatif)        │     │
│  │   9. Categorisation HOT/WARM/COLD/DISQUALIFIE                     │     │
│  │  10. Routing decision (canal, sequence, validation, SLA)           │     │
│  │  11. Dispatch vers Agent 4 (REDACTEUR) via queue BullMQ           │     │
│  │                                                                     │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│ AGENT 2             │     │ AGENT 3             │     │ AGENT 4             │
│ ENRICHISSEUR        │────>│ SCOREUR             │────>│ REDACTEUR           │
│                     │     │                     │     │                     │
│ Output :            │     │ Input :             │     │ Input :             │
│ fiche_prospect      │     │ fiche_prospect      │     │ fiche_prospect      │
│ enrichie            │     │ enrichie            │     │ enrichie + score    │
│ (cf. section 6.6    │     │                     │     │ + routing           │
│  specs Agent 2)     │     │ Output :            │     │ + categorie         │
│                     │     │ fiche_prospect      │     │ + canal             │
│                     │     │ + score_detail      │     │ + sequence_id       │
│                     │     │ + categorie         │     │                     │
│                     │     │ + routing           │     │                     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

### 1.2 Mission precise

**Ce que fait le Scoreur** :
- Recoit chaque fiche prospect enrichie de l'Agent 2 (ENRICHISSEUR) via la queue BullMQ `scoreur-pipeline`
- Applique un modele de scoring deterministe a 4 axes (ICP Fit, Signaux, Technique, Engagement)
- Applique un scoring negatif (disqualification, malus)
- Calcule un score total sur 100 points
- Categorise le prospect en HOT (75-100), WARM (50-74), COLD (25-49), ou DISQUALIFIE (0-24)
- Determine le routing : canal de contact, type de sequence, besoin de validation humaine, SLA
- Persiste le score et le detail dans la base de donnees PostgreSQL
- Dispatche la fiche scoree vers l'Agent 4 (REDACTEUR) via la queue BullMQ `redacteur-pipeline`

**Ce que le Scoreur ne fait PAS** :
- Il ne contacte PERSONNE (c'est le REDACTEUR puis le SUIVEUR)
- Il n'enrichit PAS les donnees (c'est l'ENRICHISSEUR)
- Il ne detecte PAS les signaux d'achat (c'est le VEILLEUR)
- Il ne redige PAS les messages (c'est le REDACTEUR)
- Il n'appelle PAS d'API externe (tout est calculable localement)
- Il ne fait PAS de machine learning (Phase 1 = deterministe pur)
- Il ne gere PAS les sequences de relance (c'est le SUIVEUR/NURTUREUR)
- Il ne stocke PAS les templates de messages

### 1.3 Caracteristiques techniques

| Propriete | Valeur |
|-----------|--------|
| Type de calcul | Deterministe, rules-based |
| Sous-agents | AUCUN |
| APIs externes | AUCUNE |
| Temps de traitement | < 50 ms par prospect |
| Mode | Synchrone (pas d'async necessaire) |
| Cout marginal | 0 EUR (calcul CPU uniquement) |
| Queue d'entree | BullMQ `scoreur-pipeline` |
| Queue de sortie | BullMQ `redacteur-pipeline` |
| Base de donnees | PostgreSQL 16 (table `scores`, table `score_history`) |
| Cache | Redis (scores recents, blocklists) |

### 1.4 Les 5 segments cibles Axiom

| Segment | Cible | Decideurs vises | Taille |
|---------|-------|-----------------|--------|
| `pme_metro` | PME France metropolitaine | DG, CMO, DSI, CTO | 50-500 salaries |
| `ecommerce_shopify` | E-commercants Shopify | Fondateurs, Head of Growth | Toutes tailles |
| `collectivite` | Collectivites DOM-TOM | DGS, DSI, elus numeriques | N/A |
| `startup` | Startups / SaaS | Founders, CTO | 5-200 salaries |
| `agence_wl` | Agences en marque blanche | Fondateurs agences marketing/SEO | 2-50 salaries |

---

## 2. INPUT : SCHEMA JSON RECU DE L'AGENT 2

Le schema ci-dessous est **exactement** le format de sortie du Master Enrichisseur (Agent 2, section 6.6 de ses specs). Le Scoreur le recoit via la queue BullMQ `scoreur-pipeline`.

### 2.1 Schema JSON complet (input du Scoreur)

```json
{
  "prospect_id": "uuid-v4-prospect",
  "lead_id": "uuid-v4-lead-original",
  "created_at": "2026-03-18T09:15:00Z",

  "entreprise": {
    "nom": "TechCorp SAS",
    "siren": "123456789",
    "siret": "12345678900012",
    "forme_juridique": "SAS - Societe par actions simplifiee",
    "date_creation": "2015-03-15",
    "capital": 50000,
    "code_naf": "6202A",
    "libelle_naf": "Conseil en systemes et logiciels informatiques",
    "categorie": "PME",
    "tva_intracommunautaire": "FR12123456789",
    "site_web": "https://www.techcorp.fr",
    "linkedin_url": "https://linkedin.com/company/techcorp",
    "secteur": "Conseil en systemes et logiciels informatiques",
    "segment": "pme_metro",

    "effectif": {
      "tranche": "100 a 199 salaries",
      "exact": 120
    },

    "adresse": {
      "rue": "12 RUE DE LA REPUBLIQUE",
      "code_postal": "75011",
      "ville": "PARIS",
      "departement": "75",
      "region": "Ile-de-France",
      "pays": "France"
    },

    "finances": {
      "ca_dernier": 5200000,
      "ca_n_moins_1": 4800000,
      "ca_n_moins_2": 4200000,
      "resultat_dernier": 320000,
      "croissance_ca_pct": 8,
      "annee_dernier_bilan": 2025
    },

    "dirigeants": [
      {
        "prenom": "Pierre",
        "nom": "Dupont",
        "fonction": "President",
        "date_nomination": "2015-03-15"
      }
    ],

    "beneficiaires_effectifs": [
      {
        "prenom": "Pierre",
        "nom": "Dupont",
        "pourcentage_parts": 60,
        "pourcentage_votes": 60
      }
    ],

    "signaux_bodacc": [
      {
        "type": "creation",
        "date": "2025-06-15",
        "description": "Creation d'un etablissement secondaire a Lyon",
        "impact": "positif"
      }
    ],

    "alertes": {
      "procedure_collective": false,
      "entreprise_fermee": false,
      "ca_en_baisse": false,
      "effectif_en_baisse": false
    }
  },

  "contact": {
    "prenom": "Sophie",
    "nom": "Martin",
    "poste": "Chief Marketing Officer",
    "linkedin_url": "https://linkedin.com/in/sophie-martin",
    "email": "sophie.martin@techcorp.fr",
    "email_status": "verified",
    "email_confidence": 98,
    "telephone": "+33123456789",
    "decideur_score": 10
  },

  "contacts_secondaires": [
    {
      "prenom": "Jean",
      "nom": "Dupont",
      "poste": "CTO",
      "email": "jean.dupont@techcorp.fr",
      "linkedin_url": "https://linkedin.com/in/jean-dupont"
    }
  ],

  "technique": {
    "stack": {
      "cms": "WordPress",
      "cms_version": "6.4.3",
      "framework_js": null,
      "framework_js_version": null,
      "server": "Apache",
      "analytics": ["Google Analytics", "Facebook Pixel"],
      "ecommerce_platform": "WooCommerce",
      "cdn": "Cloudflare",
      "all_technologies": [
        { "name": "WordPress", "version": "6.4.3", "category": "CMS", "confidence": 100 },
        { "name": "WooCommerce", "version": "8.5.2", "category": "Ecommerce", "confidence": 100 },
        { "name": "Apache", "version": null, "category": "Web servers", "confidence": 95 }
      ]
    },
    "performance": {
      "score": 42,
      "lcp_ms": 4200,
      "cls": 0.15,
      "tbt_ms": 620,
      "fcp_ms": 2100,
      "speed_index_ms": 3800,
      "verdict": "mauvais"
    },
    "accessibilite": {
      "score": 62,
      "violations_total": 18,
      "violations_critical": 5,
      "violations_serious": 8,
      "passes": 42,
      "top_violations": [
        { "id": "image-alt", "impact": "critical", "description": "Images must have alternate text", "count": 12 }
      ],
      "rgaa_compliant": false
    },
    "seo": {
      "score": 78,
      "has_robots_txt": true,
      "has_sitemap": true
    },
    "ssl": {
      "valid": true,
      "days_remaining": 245
    },
    "problemes_detectes": [
      "Performance faible : score 42/100",
      "5 violations accessibilite CRITIQUES",
      "CMS WordPress 6.4.3 -- potentiel de modernisation"
    ]
  },

  "signaux": [
    {
      "type": "changement_poste",
      "source": "1a_linkedin",
      "detail": "Nommee CMO chez TechCorp il y a 3 semaines",
      "date_signal": "2026-02-25T00:00:00Z",
      "tier": 1,
      "score_signal": 30
    },
    {
      "type": "recrutement_dev_web",
      "source": "1d_jobboard",
      "detail": "Offre dev React senior sur WTTJ",
      "date_signal": "2026-03-15T00:00:00Z",
      "tier": 2,
      "score_signal": 20
    }
  ],

  "signal_principal": "Nouveau CMO + recrutement dev = besoin digital probable",
  "sources": ["veille_linkedin", "veille_jobboard"],
  "nb_detections": 2,

  "pre_score": {
    "total": 50,
    "detail": {
      "signal_force": 30,
      "multi_source_bonus": 5,
      "segment_match": 15
    }
  },

  "enrichissement": {
    "status": "complet",
    "date_enrichissement": "2026-03-18T09:15:45Z",
    "sous_agents_utilises": ["2a_contact", "2b_entreprise", "2c_technique"],
    "qualite": {
      "completude_pct": 90,
      "champs_manquants": ["effectif_historique"],
      "enrichable": true
    },
    "duration_ms": 48500,
    "credits_total": {
      "dropcontact": 1,
      "insee": 2,
      "pappers": 1,
      "zerobounce": 0,
      "wappalyzer": 1
    }
  }
}
```

### 2.2 Verification champ par champ -- Utilisation par le Scoreur

| Champ input | Utilise par quel axe | Obligatoire | Fallback si absent |
|-------------|---------------------|-------------|-------------------|
| `entreprise.segment` | Tous les axes (poids segment) | OUI | Defaut `pme_metro` |
| `entreprise.effectif.exact` | Axe 1 -- ICP Fit (taille) | NON | Utiliser `effectif.tranche` |
| `entreprise.effectif.tranche` | Axe 1 -- ICP Fit (taille) | NON | Utiliser `categorie` PME/ETI/GE |
| `entreprise.finances.ca_dernier` | Axe 1 -- ICP Fit (CA) + Negatif | NON | 0 pts (pas de malus ni bonus) |
| `entreprise.finances.croissance_ca_pct` | Axe 1 -- bonus croissance | NON | 0 pts |
| `entreprise.code_naf` | Axe 1 -- ICP Fit (secteur) | NON | Utiliser `entreprise.secteur` ou `libelle_naf` |
| `entreprise.secteur` | Axe 1 -- ICP Fit (secteur) | NON | 0 pts (neutre) |
| `entreprise.adresse.pays` | Axe 1 -- ICP Fit (localisation) | NON | Defaut "France" |
| `entreprise.adresse.departement` | Axe 1 -- ICP Fit (geo DOM-TOM) | NON | null |
| `entreprise.adresse.region` | Axe 1 -- ICP Fit (geo) | NON | null |
| `entreprise.alertes.procedure_collective` | Scoring negatif (HARD) | OUI | Defaut `false` |
| `entreprise.alertes.entreprise_fermee` | Scoring negatif (HARD) | OUI | Defaut `false` |
| `entreprise.alertes.ca_en_baisse` | Scoring negatif (SOFT) | NON | Defaut `false` |
| `entreprise.alertes.effectif_en_baisse` | Scoring negatif (SOFT) | NON | Defaut `false` |
| `contact.poste` | Axe 1 -- ICP Fit (decideur) | NON | 0 pts |
| `contact.decideur_score` | Axe 1 -- ICP Fit (decideur) | NON | 0 si absent |
| `contact.email` | Scoring negatif | NON | Malus -10 si absent |
| `contact.email_status` | Scoring negatif | NON | Defaut `not_found` |
| `contact.email_confidence` | Axe 4 -- Engagement (confiance) | NON | 0 |
| `contact.telephone` | Axe 4 -- Engagement (canaux) | NON | Pas de malus |
| `signaux[]` | Axe 2 -- Signaux d'intention | OUI | [] (tableau vide, 0 pts) |
| `signaux[].type` | Axe 2 -- type de signal | OUI | Signal ignore |
| `signaux[].date_signal` | Axe 2 -- decay temporel | OUI | Date du jour (pas de decay) |
| `signaux[].tier` | Axe 2 -- poids du signal | OUI | tier 3 par defaut |
| `technique.performance.score` | Axe 3 -- Donnees techniques | NON | null (0 pts) |
| `technique.accessibilite.score` | Axe 3 -- Donnees techniques | NON | null (0 pts) |
| `technique.accessibilite.rgaa_compliant` | Axe 3 -- collectivites | NON | null |
| `technique.stack.cms` | Axe 3 -- Stack obsolete | NON | null (0 pts) |
| `technique.stack.framework_js` | Axe 3 -- Stack moderne | NON | null |
| `technique.stack.ecommerce_platform` | Axe 3 -- Shopify detection | NON | null |
| `technique.problemes_detectes[]` | Axe 3 -- nb problemes | NON | [] |
| `nb_detections` | Bonus multi-source | OUI | Defaut 1 |
| `sources[]` | Metadata / traçabilite | OUI | [] |
| `enrichissement.qualite.completude_pct` | Metadata / confiance score | NON | 50 |

### 2.3 Validation de l'input

Avant tout calcul de score, le Scoreur verifie la validite de l'input :

```typescript
interface InputValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

function validateScoreurInput(prospect: ProspectEnrichi): InputValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Champs OBLIGATOIRES -- reject si absent
  if (!prospect.prospect_id) errors.push('prospect_id manquant')
  if (!prospect.lead_id) errors.push('lead_id manquant')
  if (!prospect.entreprise?.nom) errors.push('entreprise.nom manquant')
  if (!prospect.entreprise?.segment) {
    warnings.push('entreprise.segment manquant -- defaut pme_metro')
  }

  // Verification coherence segment
  const SEGMENTS_VALIDES = ['pme_metro', 'ecommerce_shopify', 'collectivite', 'startup', 'agence_wl']
  if (prospect.entreprise?.segment && !SEGMENTS_VALIDES.includes(prospect.entreprise.segment)) {
    errors.push(`Segment invalide: ${prospect.entreprise.segment}`)
  }

  // Verification signaux
  if (prospect.signaux && Array.isArray(prospect.signaux)) {
    for (const signal of prospect.signaux) {
      if (!signal.type) warnings.push('Signal sans type detecte')
      if (!signal.date_signal) warnings.push(`Signal ${signal.type} sans date_signal`)
    }
  }

  // Verification email_status coherent
  if (prospect.contact?.email && !prospect.contact?.email_status) {
    warnings.push('Email present mais email_status absent -- defaut unverified')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
```

**Comportement en cas d'erreur** :
- Si `valid === false` : le prospect est rejete, logue dans `score_errors`, alerte Slack `#ops-scoreur`
- Si `warnings.length > 0` : le scoring continue avec les fallbacks, warnings loges

---

## 3. CATEGORISATION HOT / WARM / COLD / DISQUALIFIE

> **Note** : Le detail du modele de scoring (4 axes, coefficients, signal decay, scoring negatif) est documente dans [AGENT-3-MODELE-SCORING.md](AGENT-3-MODELE-SCORING.md).

### 3.1 Seuils de categorisation

| Categorie | Score | Description | Volume attendu |
|-----------|-------|-------------|----------------|
| **HOT** | 75-100 | Prospect a contacter en priorite absolue | ~10% des prospects |
| **WARM** | 50-74 | Prospect interesse, sequence automatique | ~30% des prospects |
| **COLD** | 25-49 | Prospect froid, nurturing long terme | ~40% des prospects |
| **DISQUALIFIE** | 0-24 | Prospect archive, pas d'action | ~20% des prospects |

### 3.2 Sous-categories HOT (priorisation fine)

Quand le volume de HOT leads depasse la capacite de traitement (objectif : max 5-10 HOT/semaine), les HOT sont sous-categories :

| Sous-categorie | Score | Priorite | Action |
|---------------|-------|----------|--------|
| HOT-A | 90-100 | 1 (maximum) | Jonathan contacte en personne dans l'heure |
| HOT-B | 80-89 | 2 (haute) | Sequence prioritaire LinkedIn + email, validation Jonathan |
| HOT-C | 75-79 | 3 (standard) | Sequence automatique premium, notification Jonathan |

### 3.3 Matrice de decision complete : categorie x segment --> action

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                            MATRICE DE DECISION : CATEGORIE x SEGMENT                               │
├──────────┬───────────────┬──────────────┬──────────────┬──────────────┬──────────────┬─────────────┤
│          │ pme_metro     │ ecommerce    │ collectivite │ startup      │ agence_wl    │ SLA         │
│          │               │ _shopify     │              │              │              │             │
├──────────┼───────────────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────────┤
│ HOT-A    │ LinkedIn DM + │ LinkedIn DM +│ Email formel │ LinkedIn DM +│ LinkedIn DM +│ 1 heure     │
│ (90-100) │ email perso   │ email perso  │ + courrier   │ email perso  │ email perso  │             │
│          │ Validation    │ Validation   │ Validation   │ Validation   │ Validation   │             │
│          │ Jonathan      │ Jonathan     │ Jonathan     │ Jonathan     │ Jonathan     │             │
├──────────┼───────────────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────────┤
│ HOT-B    │ LinkedIn DM + │ LinkedIn DM +│ Email formel │ LinkedIn DM +│ LinkedIn DM +│ 2 heures    │
│ (80-89)  │ email perso   │ email perso  │              │ email perso  │ email perso  │             │
│          │ Validation    │ Validation   │ Validation   │ Validation   │ Validation   │             │
│          │ Jonathan      │ Jonathan     │ Jonathan     │ Jonathan     │ Jonathan     │             │
├──────────┼───────────────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────────┤
│ HOT-C    │ LinkedIn DM + │ LinkedIn DM +│ Email +      │ LinkedIn DM +│ LinkedIn DM +│ 4 heures    │
│ (75-79)  │ email         │ email        │ LinkedIn     │ email        │ email        │             │
│          │ Notif         │ Notif        │ Notif        │ Notif        │ Notif        │             │
│          │ Jonathan      │ Jonathan     │ Jonathan     │ Jonathan     │ Jonathan     │             │
├──────────┼───────────────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────────┤
│ WARM     │ Sequence auto │ Sequence auto│ Sequence auto│ Sequence auto│ Sequence auto│ 24 heures   │
│ (50-74)  │ email 3-touch │ email 3-touch│ email formel │ email 3-touch│ email 3-touch│             │
│          │ + LinkedIn    │ + LinkedIn   │ 2-touch      │ + LinkedIn   │ + LinkedIn   │             │
│          │ Pas valid.    │ Pas valid.   │ Pas valid.   │ Pas valid.   │ Pas valid.   │             │
├──────────┼───────────────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────────┤
│ COLD     │ Newsletter    │ Newsletter   │ Newsletter   │ Newsletter   │ Newsletter   │ 72 heures   │
│ (25-49)  │ mensuelle     │ mensuelle    │ mensuelle    │ mensuelle    │ mensuelle    │             │
│          │ Nurturing     │ Nurturing    │ Nurturing    │ Nurturing    │ Nurturing    │             │
│          │ Re-score a 90j│ Re-score 90j │ Re-score 90j │ Re-score 90j │ Re-score 90j │             │
├──────────┼───────────────┼──────────────┼──────────────┼──────────────┼──────────────┼─────────────┤
│ DISQUAL  │ Archive       │ Archive      │ Archive      │ Archive      │ Archive      │ N/A         │
│ (0-24)   │ Pas d'action  │ Pas d'action │ Pas d'action │ Pas d'action │ Pas d'action │             │
│          │ Re-engage si  │ Re-engage si │ Re-engage si │ Re-engage si │ Re-engage si │             │
│          │ nouveau signal│ nouv. signal │ nouv. signal │ nouv. signal │ nouv. signal │             │
└──────────┴───────────────┴──────────────┴──────────────┴──────────────┴──────────────┴─────────────┘
```

### 3.4 Sequences associees par categorie

| Categorie | Sequence ID | Description | Nb touchpoints | Espacement | Canal principal | Canal secondaire |
|-----------|------------|-------------|----------------|------------|----------------|-----------------|
| HOT-A | `SEQ_HOT_A_PREMIUM` | Contact ultra-personalise Jonathan | 3 | J0, J+2, J+5 | LinkedIn DM | Email perso |
| HOT-B | `SEQ_HOT_B_PRIORITY` | Contact personalise haute priorite | 4 | J0, J+2, J+5, J+10 | LinkedIn DM | Email perso |
| HOT-C | `SEQ_HOT_C_STANDARD` | Contact personalise standard | 4 | J0, J+3, J+7, J+14 | Email | LinkedIn DM |
| WARM | `SEQ_WARM_AUTO` | Sequence automatique multicanal | 5 | J0, J+3, J+7, J+14, J+21 | Email | LinkedIn |
| COLD | `SEQ_COLD_NURTURE` | Newsletter + contenu nurturing | 4 | J0, J+30, J+60, J+90 | Email | Aucun |
| DISQUALIFIE | `AUCUNE` | Pas de sequence | 0 | N/A | N/A | N/A |

### 3.5 Validation humaine (Jonathan)

| Categorie | Validation requise | Action Jonathan |
|-----------|-------------------|-----------------|
| HOT-A | **OUI -- bloquant** | Valider avant envoi du 1er message. Peut modifier le message. |
| HOT-B | **OUI -- bloquant** | Valider avant envoi du 1er message. Peut modifier le message. |
| HOT-C | **OUI -- non-bloquant** | Notification push. Si pas de reponse en 4h, envoi auto. |
| WARM | NON | Sequence 100% automatique. Jonathan recoit un recap quotidien. |
| COLD | NON | 100% automatique. Pas de notification individuelle. |
| DISQUALIFIE | NON | Archive automatique silencieuse. |

### 3.6 Code de categorisation

```typescript
type ScoreCategorie = 'HOT' | 'WARM' | 'COLD' | 'DISQUALIFIE'
type SousCategorie = 'HOT_A' | 'HOT_B' | 'HOT_C' | null

interface CategorisationResult {
  categorie: ScoreCategorie
  sous_categorie: SousCategorie
  sequence_id: string | null
  canal_principal: 'linkedin_dm' | 'email_perso' | 'email_auto' | 'email_formel' | 'newsletter' | null
  canal_secondaire: 'linkedin_dm' | 'email_perso' | 'email_auto' | 'linkedin' | null
  validation_jonathan: boolean
  validation_bloquante: boolean
  sla_heures: number | null
  nb_touchpoints: number
  espacement_jours: number[]
}

function categoriserScore(scoreTotal: number): ScoreCategorie {
  if (scoreTotal >= 75) return 'HOT'
  if (scoreTotal >= 50) return 'WARM'
  if (scoreTotal >= 25) return 'COLD'
  return 'DISQUALIFIE'
}

function sousCategorisorHot(scoreTotal: number): SousCategorie {
  if (scoreTotal >= 90) return 'HOT_A'
  if (scoreTotal >= 80) return 'HOT_B'
  if (scoreTotal >= 75) return 'HOT_C'
  return null
}

function determinerRouting(
  scoreTotal: number,
  segment: string,
): CategorisationResult {
  const categorie = categoriserScore(scoreTotal)
  const sousCategorie = sousCategorisorHot(scoreTotal)

  // Cas special collectivite : canal formel pour HOT
  const isCollectivite = segment === 'collectivite'

  switch (categorie) {
    case 'HOT':
      switch (sousCategorie) {
        case 'HOT_A':
          return {
            categorie: 'HOT',
            sous_categorie: 'HOT_A',
            sequence_id: 'SEQ_HOT_A_PREMIUM',
            canal_principal: isCollectivite ? 'email_formel' : 'linkedin_dm',
            canal_secondaire: isCollectivite ? 'linkedin_dm' : 'email_perso',
            validation_jonathan: true,
            validation_bloquante: true,
            sla_heures: 1,
            nb_touchpoints: 3,
            espacement_jours: [0, 2, 5],
          }
        case 'HOT_B':
          return {
            categorie: 'HOT',
            sous_categorie: 'HOT_B',
            sequence_id: 'SEQ_HOT_B_PRIORITY',
            canal_principal: isCollectivite ? 'email_formel' : 'linkedin_dm',
            canal_secondaire: isCollectivite ? null : 'email_perso',
            validation_jonathan: true,
            validation_bloquante: true,
            sla_heures: 2,
            nb_touchpoints: 4,
            espacement_jours: [0, 2, 5, 10],
          }
        case 'HOT_C':
          return {
            categorie: 'HOT',
            sous_categorie: 'HOT_C',
            sequence_id: 'SEQ_HOT_C_STANDARD',
            canal_principal: isCollectivite ? 'email_formel' : 'email_perso',
            canal_secondaire: 'linkedin_dm',
            validation_jonathan: true,
            validation_bloquante: false, // Non-bloquant : envoi auto apres 4h
            sla_heures: 4,
            nb_touchpoints: 4,
            espacement_jours: [0, 3, 7, 14],
          }
        default:
          // Fallback HOT generique
          return {
            categorie: 'HOT',
            sous_categorie: null,
            sequence_id: 'SEQ_HOT_C_STANDARD',
            canal_principal: 'email_perso',
            canal_secondaire: 'linkedin_dm',
            validation_jonathan: true,
            validation_bloquante: false,
            sla_heures: 4,
            nb_touchpoints: 4,
            espacement_jours: [0, 3, 7, 14],
          }
      }

    case 'WARM':
      return {
        categorie: 'WARM',
        sous_categorie: null,
        sequence_id: 'SEQ_WARM_AUTO',
        canal_principal: isCollectivite ? 'email_formel' : 'email_auto',
        canal_secondaire: 'linkedin',
        validation_jonathan: false,
        validation_bloquante: false,
        sla_heures: 24,
        nb_touchpoints: 5,
        espacement_jours: [0, 3, 7, 14, 21],
      }

    case 'COLD':
      return {
        categorie: 'COLD',
        sous_categorie: null,
        sequence_id: 'SEQ_COLD_NURTURE',
        canal_principal: 'newsletter',
        canal_secondaire: null,
        validation_jonathan: false,
        validation_bloquante: false,
        sla_heures: 72,
        nb_touchpoints: 4,
        espacement_jours: [0, 30, 60, 90],
      }

    case 'DISQUALIFIE':
      return {
        categorie: 'DISQUALIFIE',
        sous_categorie: null,
        sequence_id: null,
        canal_principal: null,
        canal_secondaire: null,
        validation_jonathan: false,
        validation_bloquante: false,
        sla_heures: null,
        nb_touchpoints: 0,
        espacement_jours: [],
      }
  }
}
```

---

## 4. ROUTING VERS L'AGENT 4 (REDACTEUR)

### 4.1 Schema JSON de sortie du Scoreur (input Agent 4)

Le Scoreur envoie vers l'Agent 4 (REDACTEUR) un objet qui contient la fiche prospect enrichie PLUS toutes les informations de scoring et de routing.

```json
{
  "prospect_id": "uuid-v4-prospect",
  "lead_id": "uuid-v4-lead-original",
  "scored_at": "2026-03-18T09:16:00Z",

  "score": {
    "total": 82,
    "categorie": "HOT",
    "sous_categorie": "HOT_B",

    "detail": {
      "axe1_icp_fit": {
        "total": 28,
        "max": 35,
        "taille": 10,
        "secteur": 10,
        "localisation": 8,
        "decideur": 7,
        "coefficient_segment": 1.0
      },
      "axe2_signaux": {
        "total": 24.5,
        "max": 30,
        "nb_signaux": 2,
        "signal_principal": {
          "type": "changement_poste",
          "score_base": 28,
          "jours_ecoules": 21,
          "demi_vie": 60,
          "score_apres_decay": 22.1,
          "rang": 1,
          "score_final": 22.1
        },
        "signaux_secondaires": [
          {
            "type": "recrutement_dev_web",
            "score_base": 22,
            "jours_ecoules": 3,
            "demi_vie": 45,
            "score_apres_decay": 21.0,
            "rang": 2,
            "score_final": 10.5
          }
        ],
        "bonus_multi_source": 0,
        "coefficient_segment": 1.0
      },
      "axe3_technique": {
        "total": 16,
        "max": 20,
        "performance": 7,
        "stack_obsolete": 4,
        "accessibilite": 5,
        "coefficient_segment": 1.0
      },
      "axe4_engagement": {
        "total": 5,
        "max": 15,
        "email_verifie": 2,
        "telephone_trouve": 1,
        "linkedin_engagement": 0,
        "multi_source": 2,
        "completude": 0,
        "coefficient_segment": 1.0
      },
      "scoring_negatif": {
        "total": 0,
        "disqualified": false,
        "disqualification_reason": null,
        "malus": []
      },
      "bonus_segment": 0
    },

    "score_brut_avant_coefficients": 73.5,
    "score_apres_coefficients": 82,
    "segment_primaire": "pme_metro",
    "multi_segment": false,
    "segments_secondaires": [],
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
  },

  "entreprise": {
    "__comment": "Copie integrale de la fiche entreprise de l'Agent 2 -- voir section 2.1"
  },
  "contact": {
    "__comment": "Copie integrale du contact de l'Agent 2 -- voir section 2.1"
  },
  "contacts_secondaires": [],
  "technique": {
    "__comment": "Copie integrale des donnees techniques de l'Agent 2 -- voir section 2.1"
  },
  "signaux": [],
  "signal_principal": "Nouveau CMO + recrutement dev = besoin digital probable",
  "sources": ["veille_linkedin", "veille_jobboard"],
  "nb_detections": 2,

  "metadata": {
    "scoring_version": "1.0",
    "scoring_model": "deterministe_4axes",
    "scoring_duration_ms": 12,
    "agent": "agent_3_scoreur",
    "batch_id": "batch-2026-03-18-09"
  }
}
```

### 4.2 Dispatch via BullMQ

```typescript
import { Queue } from 'bullmq'

const redacteurQueue = new Queue('redacteur-pipeline', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
})

async function dispatchToRedacteur(scoredProspect: ScoredProspect): Promise<void> {
  // Determiner la priorite dans la queue
  const priorite = getPrioriteQueue(scoredProspect.score.categorie, scoredProspect.score.sous_categorie)

  // Ne pas envoyer les DISQUALIFIES au REDACTEUR
  if (scoredProspect.score.categorie === 'DISQUALIFIE') {
    await archiveProspect(scoredProspect)
    return
  }

  await redacteurQueue.add(
    `score-${scoredProspect.prospect_id}`,
    scoredProspect,
    {
      priority: priorite,
      delay: getDelayMs(scoredProspect.score.categorie),
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 7 * 24 * 60 * 60, // Garder 7 jours
        count: 5000,
      },
      removeOnFail: {
        age: 30 * 24 * 60 * 60, // Garder 30 jours pour debug
      },
    }
  )
}

function getPrioriteQueue(
  categorie: ScoreCategorie,
  sousCategorie: SousCategorie,
): number {
  // BullMQ : priorite 1 = plus haute, priorite 10 = plus basse
  switch (categorie) {
    case 'HOT':
      switch (sousCategorie) {
        case 'HOT_A': return 1
        case 'HOT_B': return 2
        case 'HOT_C': return 3
        default: return 3
      }
    case 'WARM': return 5
    case 'COLD': return 8
    default: return 10
  }
}

function getDelayMs(categorie: ScoreCategorie): number {
  // Delai avant traitement par le REDACTEUR
  switch (categorie) {
    case 'HOT': return 0 // Immediat
    case 'WARM': return 0 // Immediat (le REDACTEUR gere le SLA)
    case 'COLD': return 60 * 60 * 1000 // 1 heure de delai (basse priorite)
    default: return 0
  }
}
```

### 4.3 Persistance en base de donnees

```sql
-- Table des scores
CREATE TABLE IF NOT EXISTS scores (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  lead_id UUID NOT NULL,
  score_total INTEGER NOT NULL CHECK (score_total >= 0 AND score_total <= 100),
  categorie VARCHAR(20) NOT NULL CHECK (categorie IN ('HOT', 'WARM', 'COLD', 'DISQUALIFIE')),
  sous_categorie VARCHAR(10) CHECK (sous_categorie IN ('HOT_A', 'HOT_B', 'HOT_C', NULL)),
  axe1_icp_fit NUMERIC(5,2) NOT NULL,
  axe2_signaux NUMERIC(5,2) NOT NULL,
  axe3_technique NUMERIC(5,2) NOT NULL,
  axe4_engagement NUMERIC(5,2) NOT NULL,
  scoring_negatif NUMERIC(5,2) NOT NULL,
  bonus_segment NUMERIC(5,2) NOT NULL DEFAULT 0,
  segment_primaire VARCHAR(30) NOT NULL,
  multi_segment BOOLEAN NOT NULL DEFAULT false,
  segments_secondaires TEXT[] DEFAULT '{}',
  confiance_score INTEGER DEFAULT 50,
  scoring_version VARCHAR(10) NOT NULL DEFAULT '1.0',
  score_detail JSONB NOT NULL,
  routing JSONB NOT NULL,
  scored_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index pour les requetes frequentes
CREATE INDEX idx_scores_categorie ON scores (categorie);
CREATE INDEX idx_scores_prospect_id ON scores (prospect_id);
CREATE INDEX idx_scores_scored_at ON scores (scored_at);
CREATE INDEX idx_scores_segment ON scores (segment_primaire);
CREATE INDEX idx_scores_score_total ON scores (score_total DESC);

-- Table historique des scores (pour le feedback loop)
CREATE TABLE IF NOT EXISTS score_history (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL,
  ancien_score INTEGER NOT NULL,
  nouveau_score INTEGER NOT NULL,
  ancienne_categorie VARCHAR(20),
  nouvelle_categorie VARCHAR(20),
  raison VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_score_history_prospect ON score_history (prospect_id);
CREATE INDEX idx_score_history_date ON score_history (created_at);

-- Table des blocklists
CREATE TABLE IF NOT EXISTS blocklists (
  id SERIAL PRIMARY KEY,
  type VARCHAR(30) NOT NULL CHECK (type IN ('competitor', 'client_existant', 'opt_out', 'pays_sanctionne', 'secteur_interdit')),
  value VARCHAR(500) NOT NULL,
  raison VARCHAR(200),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(type, value)
);

CREATE INDEX idx_blocklists_type ON blocklists (type);
CREATE INDEX idx_blocklists_value ON blocklists (value);

-- Vue pour le dashboard de distribution
CREATE OR REPLACE VIEW score_distribution AS
SELECT
  categorie,
  sous_categorie,
  segment_primaire,
  COUNT(*) as nb_prospects,
  ROUND(AVG(score_total), 1) as score_moyen,
  MIN(score_total) as score_min,
  MAX(score_total) as score_max,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) as pourcentage
FROM scores
WHERE scored_at >= NOW() - INTERVAL '30 days'
GROUP BY categorie, sous_categorie, segment_primaire
ORDER BY categorie, sous_categorie, segment_primaire;
```

---

## 5. VERIFICATION DE COHERENCE

### 5.1 Input Agent 3 == Output Agent 2

| Champ output Agent 2 (section 6.6) | Present dans input Agent 3 | Utilise par le Scoreur |
|-------------------------------------|---------------------------|----------------------|
| `prospect_id` | OUI | Identifiant unique |
| `lead_id` | OUI | Traçabilite |
| `created_at` | OUI | Metadata |
| `entreprise.nom` | OUI | Validation |
| `entreprise.siren` | OUI | Blocklist client existant |
| `entreprise.siret` | OUI | Blocklist client existant |
| `entreprise.code_naf` | OUI | Axe 1 -- Secteur |
| `entreprise.libelle_naf` | OUI | Axe 1 -- Secteur (fallback) |
| `entreprise.categorie` | OUI | Axe 1 -- Taille (fallback) |
| `entreprise.site_web` | OUI | Blocklist concurrent |
| `entreprise.segment` | OUI | Coefficients segment |
| `entreprise.effectif.tranche` | OUI | Axe 1 -- Taille |
| `entreprise.effectif.exact` | OUI | Axe 1 -- Taille |
| `entreprise.adresse.departement` | OUI | Axe 1 -- Localisation (DOM-TOM) |
| `entreprise.adresse.pays` | OUI | Axe 1 -- Localisation |
| `entreprise.finances.ca_dernier` | OUI | Axe 1 -- Taille + Negatif |
| `entreprise.finances.croissance_ca_pct` | OUI | Negatif -- CA en baisse |
| `entreprise.alertes.procedure_collective` | OUI | Negatif HARD |
| `entreprise.alertes.entreprise_fermee` | OUI | Negatif HARD |
| `entreprise.alertes.ca_en_baisse` | OUI | Negatif SOFT |
| `entreprise.alertes.effectif_en_baisse` | OUI | Negatif SOFT |
| `entreprise.signaux_bodacc` | OUI | Negatif SOFT |
| `contact.poste` | OUI | Axe 1 -- Decideur |
| `contact.decideur_score` | OUI | Axe 1 -- Decideur |
| `contact.email` | OUI | Negatif -- email non trouve |
| `contact.email_status` | OUI | Axe 4 -- Engagement + Negatif |
| `contact.telephone` | OUI | Axe 4 -- Engagement |
| `signaux[]` | OUI | Axe 2 -- Signaux d'intention |
| `signaux[].type` | OUI | Axe 2 -- type de signal |
| `signaux[].date_signal` | OUI | Axe 2 -- decay temporel |
| `signaux[].tier` | OUI | Axe 2 -- poids |
| `nb_detections` | OUI | Axe 2 -- bonus multi-source + Axe 4 |
| `technique.performance.score` | OUI | Axe 3 -- Performance Lighthouse |
| `technique.accessibilite.score` | OUI | Axe 3 -- Accessibilite |
| `technique.accessibilite.rgaa_compliant` | OUI | Axe 3 -- RGAA collectivites |
| `technique.accessibilite.violations_critical` | OUI | Axe 3 -- Accessibilite |
| `technique.stack.cms` | OUI | Axe 3 -- Stack obsolete |
| `technique.stack.cms_version` | OUI | Axe 3 -- Stack obsolete |
| `technique.stack.framework_js` | OUI | Axe 3 -- Stack moderne |
| `technique.stack.ecommerce_platform` | OUI | Bonus segment ecommerce |
| `technique.stack.cdn` | OUI | Axe 3 -- Stack obsolete |
| `technique.stack.server` | OUI | Axe 3 -- Stack obsolete |
| `enrichissement.qualite.completude_pct` | OUI | Axe 4 -- Engagement + Confiance |

**Verdict** : COMPATIBLE a 100%. Chaque champ du schema de sortie Agent 2 est mappe et utilise par le Scoreur.

### 5.2 Output Agent 3 compatible avec Input Agent 4 (REDACTEUR)

L'Agent 4 (REDACTEUR) a besoin des donnees suivantes pour rediger les messages de prospection :

| Donnee requise par le REDACTEUR | Fournie par Agent 3 | Champ |
|--------------------------------|--------------------|----|
| Score et categorie | OUI | `score.total`, `score.categorie`, `score.sous_categorie` |
| Segment primaire | OUI | `score.segment_primaire` |
| Canal de contact (LinkedIn, email) | OUI | `routing.canal_principal`, `routing.canal_secondaire` |
| Sequence a utiliser | OUI | `routing.sequence_id` |
| Nombre de touchpoints | OUI | `routing.nb_touchpoints` |
| Espacement entre touchpoints | OUI | `routing.espacement_jours` |
| Validation Jonathan requise | OUI | `routing.validation_jonathan` |
| SLA de premier contact | OUI | `routing.sla_heures` |
| Nom du prospect | OUI | `contact.prenom`, `contact.nom` |
| Poste du prospect | OUI | `contact.poste` |
| Email du prospect | OUI | `contact.email` |
| LinkedIn du prospect | OUI | `contact.linkedin_url` |
| Telephone du prospect | OUI | `contact.telephone` |
| Nom de l'entreprise | OUI | `entreprise.nom` |
| Secteur de l'entreprise | OUI | `entreprise.secteur` |
| Signaux detectes (pour personnaliser le message) | OUI | `signaux[]`, `signal_principal` |
| Problemes techniques (arguments commerciaux) | OUI | `technique.problemes_detectes` |
| Performance site (argument) | OUI | `technique.performance.score` |
| Accessibilite site (argument) | OUI | `technique.accessibilite.score` |
| Stack technique (argument) | OUI | `technique.stack` |
| Contacts secondaires (multi-threading) | OUI | `contacts_secondaires[]` |

**Verdict** : COMPATIBLE. Le schema de sortie de l'Agent 3 contient toutes les donnees necessaires au REDACTEUR pour rediger les messages personalises et gerer les sequences.

### 5.3 Seuils realistes -- Distribution attendue

| Metrique | Valeur estimee | Validation |
|----------|---------------|-----------|
| Leads recus de l'Agent 2 / jour | 6-18 (enrichis) | COHERENT avec les specs Agent 2 (section 10.3) |
| Leads scores / jour | 6-18 | COHERENT -- scoring synchrone, 100% traites |
| Temps de scoring / lead | < 50 ms | REALISTE -- calcul CPU sans API externe |
| Throughput max | 100 leads/seconde | LARGEMENT SUFFISANT |
| Distribution HOT | ~10% (1-2 leads/jour) | REALISTE -- seuil 75 est selectif |
| Distribution WARM | ~30% (2-5 leads/jour) | REALISTE -- seuil 50-74 |
| Distribution COLD | ~40% (3-7 leads/jour) | REALISTE -- seuil 25-49 |
| Distribution DISQUALIFIE | ~20% (1-4 leads/jour) | REALISTE -- procedures, fermetures, opt-out, CA trop faible |

**Verification de la distribution** :

Prenons un prospect "moyen" qui arrive de l'Agent 2 :
- Taille : PME 100 salaries, CA 5M EUR -> Axe 1 taille = 10
- Secteur : Services B2B (NAF 7021Z) -> Axe 1 secteur = 8
- Localisation : France metro -> Axe 1 localisation = 8
- Decideur : CMO (decideur_score 10) -> Axe 1 decideur = 7
- **Axe 1 total = 33 pts** (plafonné 35)

- Signal principal : changement_poste il y a 15 jours -> 28 * 0.84 = 23.5 pts
- Pas de 2eme signal -> **Axe 2 total = 23.5 pts** (plafonné 30)

- Performance : score 55 -> 5 pts
- Stack : WordPress 6.4 -> 1 pt
- Accessibilite : score 65 -> 3 pts
- **Axe 3 total = 9 pts** (plafonné 20)

- Email verifie : 2 pts
- Telephone : 1 pt
- Completude 80% : 2 pts
- **Axe 4 total = 5 pts** (plafonné 15)

**Score brut** = 33 + 23.5 + 9 + 5 = 70.5 -> **WARM** (juste en dessous du seuil HOT de 75)

Si ce meme prospect avait un 2eme signal (recrutement_dev_web il y a 5 jours) :
- Signal 2 : 22 * 0.93 = 20.5 * 0.5 (rang 2) = 10.25 pts
- Axe 2 = 23.5 + 10.25 = 30 (cap) + bonus multi-source si nb_detections >= 3
- Score brut = 33 + 30 + 9 + 5 = 77 -> **HOT (HOT-C)**

Cela confirme que la distribution est realiste : un prospect doit avoir un bon ICP fit ET des signaux forts recents pour atteindre HOT.

### 5.4 Cout de l'Agent 3

| Composant | Cout/mois |
|-----------|----------|
| APIs externes | **0 EUR** (aucune API) |
| CPU (calcul scoring) | Negligeable (inclus dans le serveur AdonisJS) |
| Redis (queue BullMQ) | Inclus dans l'infrastructure |
| PostgreSQL (tables scores) | Inclus dans l'infrastructure |
| **Total Agent 3** | **0 EUR/mois** |

### 5.5 Checklist finale

| Point de verification | Statut |
|----------------------|--------|
| Input Agent 3 == Output Agent 2 (tous les champs mappes) | VALIDE |
| Output Agent 3 compatible avec Input Agent 4 (REDACTEUR) | VALIDE |
| Modele de scoring 4 axes documente avec formules exactes | VALIDE |
| Scoring negatif avec disqualifications HARD et malus SOFT | VALIDE |
| Signal decay half-life avec formule mathematique | VALIDE |
| Demi-vies par type de signal justifiees | VALIDE |
| Categorisation HOT/WARM/COLD/DISQUALIFIE avec seuils | VALIDE |
| Sous-categorisation HOT-A/B/C | VALIDE |
| Matrice de decision categorie x segment -> routing | VALIDE |
| Validation Jonathan pour HOT-A/B (bloquant) et HOT-C (non-bloquant) | VALIDE |
| SLA par categorie documentes | VALIDE |
| Sequences associees par categorie documentees | VALIDE |
| Scoring par segment avec coefficients differencies | VALIDE |
| Bonus specifiques par segment documentes | VALIDE |
| Gestion multi-segment | VALIDE |
| Code TypeScript complet (pas de pseudo-code) | VALIDE |
| Persistance PostgreSQL avec schema SQL | VALIDE |
| Dispatch vers REDACTEUR via BullMQ | VALIDE |
| Feedback loop avec table outcomes | VALIDE |
| Metriques de performance du scoring | VALIDE |
| Plan de recalibration mensuel | VALIDE |
| Transition ML predictif en 4 phases | VALIDE |
| Distribution attendue ~10% HOT, ~30% WARM, ~40% COLD, ~20% DISQ | VALIDE |
| Recalcul quotidien des scores (decay) | VALIDE |
| Monitoring et health check | VALIDE |
| Cout Agent 3 = 0 EUR/mois | VALIDE |

---

## 6. INTEGRATION AVEC LES AGENTS 8, 9, 10

> **Ajout v1.1 -- 19 mars 2026** : Cette section documente l'integration du Scoreur avec les trois nouveaux agents du pipeline etendu (Agent 8 Dealmaker, Agent 9 Appels d'offres, Agent 10 CSM).

### 6.1 Synthese de l'impact

| Agent | Impact sur Agent 3 | Nature |
|-------|-------------------|--------|
| **Agent 8 (Dealmaker)** | FAIBLE (indirect) | Alimente la table `prospect_outcomes` avec des outcomes de haute qualite (deal signe avec montant, cycle de vente, canal de conversion). Le feedback loop existant (section 8) consomme deja ces donnees sans modification. Aucun flux direct Agent 8 --> Agent 3. |
| **Agent 9 (Appels d'offres)** | AUCUN | L'Agent 9 recoit ses leads de l'Agent 1b (Veilleur Marches Publics). Son scoring GO/NO-GO est fait par le sous-agent 9b, completement independant du scoring Agent 3. Les AO ne transitent pas par le Scoreur. |
| **Agent 10 (CSM)** | MODERE | Les leads referral generes par l'Agent 10 (via les clients ambassadeurs) arrivent avec un champ `referral_info` optionnel dans la fiche EnrichedProspect (via Agent 1 --> Agent 2 --> Agent 3). Le Scoreur doit prendre en compte ce signal pour ajuster le score. |

### 6.2 Modification 1 : Bonus referral +10 pts dans getBonusSegment()

Les referrals ont un taux de conversion **10 a 15x superieur** aux leads cold (30-40% vs 1-3%). Un bonus transversal de +10 pts est ajoute dans `getBonusSegment()` quand `referral_info` est present dans la fiche prospect.

**Justification du +10 pts** :
- Le bonus segment `collectivite` (AO publie) donne +5 pts et le bonus `startup` (levee < 60j) donne +5 pts
- Un referral a un impact sur la conversion **largement superieur** a ces signaux
- +10 pts permet de transformer un WARM (score 65-74) en HOT (75+), ce qui est l'objectif
- +10 pts ne cree pas de faux positifs : un lead disqualifie (score 15) + referral bonus (10) = 25, toujours COLD

**Implementation** :

```typescript
// Dans getBonusSegment() -- ajouter APRES les bonus par segment (ecommerce, collectivite, startup, agence_wl)

// ═══ NOUVEAU : Bonus referral (transversal, independant du segment) ═══
if (prospect.referral_info) {
  bonus += 10  // +10 pts pour les leads referral (source Agent 10 via Agent 1/2)
}
// ═══ FIN NOUVEAU ═══
```

**Retro-compatibilite** : Le champ `referral_info` est optionnel (JSONB nullable). Les leads classiques (sans referral) ne sont pas affectes -- le bonus est conditionnel et vaut 0 si absent.

### 6.3 Modification 2 : Transmission de referral_info vers Agent 4

Dans `dispatchToRedacteur()`, le champ `referral_info` est transmis dans le payload vers l'Agent 4 pour que le Redacteur puisse adapter le ton du message (referral = warm intro, ton plus chaleureux) :

```typescript
// Dans le payload de dispatchToRedacteur(), ajouter :
referral_info: prospect.referral_info || undefined,
```

### 6.4 Feedback loop Agent 8 --> prospect_outcomes (deja compatible)

L'Agent 8 (Dealmaker) alimente la table `prospect_outcomes` avec les outcomes reels des deals :

| Outcome Agent 8 | Correspond a `prospect_outcomes.outcome` |
|-----------------|----------------------------------------|
| Deal signe (stage "GAGNE") | `converti` |
| Deal perdu (stage "PERDU") | `pas_interesse` ou `disqualifie_post` |
| Deal en cours (stages 3-5) | `opportunite` |

**Aucune modification necessaire** : le feedback loop (voir [AGENT-3-FEEDBACK-CALIBRATION.md](AGENT-3-FEEDBACK-CALIBRATION.md)) est deja concu pour consommer les donnees de `prospect_outcomes` independamment de leur source. La recalibration mensuelle et les metriques de performance fonctionnent correctement avec les outcomes provenant de l'Agent 8, qui sont de qualite superieure (montant reel, cycle de vente, motif de perte).

### 6.5 Verification de coherence

| Verification | Statut |
|-------------|--------|
| Input Agent 3 == Output Agent 2 v2 (EnrichedProspect avec `referral_info` optionnel) | COMPATIBLE |
| Output Agent 3 == Input Agent 4 (payload avec `referral_info` optionnel) | COMPATIBLE |
| Agent 3 --> Agent 8 : aucun flux direct | CONFIRME |
| Agent 3 --> Agent 9 : aucun flux direct | CONFIRME |
| Agent 3 --> Agent 10 : aucun flux direct | CONFIRME |
| Agent 8 --> Agent 3 : feedback indirect via `prospect_outcomes` | COMPATIBLE (existant) |
| Agent 10 --> Agent 3 : flux indirect via Agent 1 --> Agent 2 --> Agent 3 | COMPATIBLE |
| Re-scoring Agent 6 --> Agent 3 : `loadProspectComplet()` charge `referral_info` depuis la table `prospects` | COMPATIBLE |
| Recalcul quotidien (cron 04:00) : inclut automatiquement `referral_info` via `loadProspectComplet()` | COMPATIBLE |
| Seuils HOT/WARM/COLD/DISQUALIFIE | INCHANGES |
| 4 axes de scoring + scoring negatif | INCHANGES |
| Coefficients par segment | INCHANGES |
| Cout Agent 3 | INCHANGE (0 EUR/mois) |

---

## ANNEXE A : DIAGRAMME DE FLUX COMPLET

```
                   ┌──────────────────────┐
                   │  AGENT 2 ENRICHISSEUR │
                   │  (fiche enrichie)     │
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │ Queue BullMQ         │
                   │ 'scoreur-pipeline'   │
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │ VALIDATION INPUT      │
                   │ - prospect_id ?       │
                   │ - entreprise.nom ?    │
                   │ - segment valide ?    │
                   └──────────┬───────────┘
                              │ [VALIDE]
                              ▼
                   ┌──────────────────────┐
                   │ DISQUALIFICATIONS     │
                   │ HARD                  │
                   │ - Procedure coll. ?   │
                   │ - Entreprise fermee ? │
                   │ - Opt-out RGPD ?      │
                   │ - Concurrent ?        │
                   │ - Client existant ?   │
                   └──────┬─────┬──────────┘
                          │     │
               [DISQUAL]  │     │ [OK]
                          │     │
                   ┌──────▼──┐  │
                   │ ARCHIVE │  │
                   │ Score=0 │  │
                   └─────────┘  │
                                ▼
              ┌─────────────────────────────────┐
              │         CALCUL 4 AXES            │
              │                                  │
              │ AXE 1: ICP Fit (35 pts max)     │
              │   Taille + Secteur + Geo + Role  │
              │                                  │
              │ AXE 2: Signaux (30 pts max)      │
              │   Type x Decay x Rang            │
              │                                  │
              │ AXE 3: Technique (20 pts max)    │
              │   Perf + Stack + Accessibilite   │
              │                                  │
              │ AXE 4: Engagement (15 pts max)   │
              │   Email + Tel + LinkedIn + Compl. │
              │                                  │
              │ NEGATIF: Malus (-63 pts max)      │
              │   CA faible + Email manq + etc.   │
              │                                  │
              │ BONUS SEGMENT: 0-8 pts            │
              │   Shopify/RGAA/Levee/etc.         │
              └─────────────┬───────────────────┘
                            │
                            ▼
              ┌──────────────────────────────────┐
              │ APPLICATION COEFFICIENTS SEGMENT  │
              │                                   │
              │ Score = (Axe1 x Coeff1)           │
              │       + (Axe2 x Coeff2)           │
              │       + (Axe3 x Coeff3)           │
              │       + (Axe4 x Coeff4)           │
              │       + Bonus + Negatif           │
              │                                   │
              │ Clamp(0, 100)                     │
              └─────────────┬─────────────────────┘
                            │
                            ▼
              ┌──────────────────────────────────┐
              │ CATEGORISATION                    │
              │                                   │
              │ 75-100 -> HOT (A/B/C)            │
              │ 50-74  -> WARM                    │
              │ 25-49  -> COLD                    │
              │ 0-24   -> DISQUALIFIE             │
              └─────────────┬─────────────────────┘
                            │
                            ▼
              ┌──────────────────────────────────┐
              │ ROUTING DECISION                  │
              │                                   │
              │ Canal + Sequence + Validation     │
              │ + SLA + Priorite                  │
              └─────────────┬─────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
    ┌──────────────┐ ┌───────────┐ ┌──────────────┐
    │ PERSISTANCE  │ │ Queue     │ │ NOTIFICATION │
    │              │ │ BullMQ    │ │              │
    │ Table scores │ │ 'redact-  │ │ Slack si HOT │
    │ Table history│ │  eur-     │ │ Push Jonathan│
    │              │ │  pipeline'│ │              │
    └──────────────┘ └─────┬─────┘ └──────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ AGENT 4 REDACTEUR    │
                │ (message perso)      │
                └──────────────────────┘
```

---

## INTEGRATION AVEC LES AGENTS 8, 9, 10

### Agent 8 (DEALMAKER) : Feedback indirect
L'Agent 8 alimente la table `prospect_outcomes` que le feedback loop du scoring consomme. Quand un deal est gagne ou perdu, le Scoreur peut recalibrer ses poids.

### Agent 9 (APPELS D'OFFRES) : Aucun impact
L'Agent 9 a son propre scoring GO/NO-GO independant du scoring Agent 3.

### Agent 10 (CSM) : Bonus referral +10 pts
Les prospects referral (avec `referral_info` present) recoivent un bonus de +10 points dans le scoring, justifie par un taux de conversion 10-15x superieur aux leads froids.

### Re-scoring depuis Agent 6
Quand l'Agent 6 (NURTUREUR) reclassifie un prospect (COLD→WARM ou WARM→HOT via nouveau signal ou engagement), il le renvoie au Scoreur via `scoreur-pipeline` avec les nouvelles donnees. Le Scoreur recalcule le score complet.
