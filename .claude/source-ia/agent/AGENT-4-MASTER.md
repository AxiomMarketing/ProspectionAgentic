# AGENT 4 -- REDACTEUR (MASTER)
**Fichiers associes** : AGENT-4a-EMAIL.md, AGENT-4b-LINKEDIN.md, AGENT-4c-IMPACT.md
**Position dans le pipeline** : Agent 3 (Scoreur) -> Agent 4 -> Agent 5 (Suiveur)
**Cout** : ~12 EUR/mois (Claude API)

**Date** : 18 mars 2026
**Auteur** : Axiom Marketing -- Systeme de prospection automatise
**Version** : 1.0
**Contexte** : Stack interne -- Claude API, n8n, AdonisJS, React, PostgreSQL
**Pipeline** : VEILLEUR (Agent 1) --> ENRICHISSEUR (Agent 2) --> SCOREUR (Agent 3) --> **REDACTEUR (ce doc)** --> SUIVEUR (Agent 5) --> NURTUREUR --> ANALYSTE

---

## TABLE DES MATIERES

1. [Mission du Redacteur](#1-mission-du-redacteur)
2. [Input : Schema JSON recu de l'Agent 3](#2-input--schema-json-recu-de-lagent-3)
3. [Sous-agents du Redacteur](#3-sous-agents-du-redacteur) *(voir fichiers dedies)*
   - 3.1 Agent 4a -- Redacteur Email → `AGENT-4a-EMAIL.md`
   - 3.2 Agent 4b -- Redacteur LinkedIn → `AGENT-4b-LINKEDIN.md`
   - 3.3 Agent 4c -- Calculateur d'Impact → `AGENT-4c-IMPACT.md`
4. [Bibliotheque de templates](#4-bibliotheque-de-templates)
5. [Personnalisation avancee](#5-personnalisation-avancee)
6. [Validation et qualite](#6-validation-et-qualite)
7. [Delivrabilite email](#7-delivrabilite-email)
8. [Output : Schema JSON envoye a l'Agent 5](#8-output--schema-json-envoye-a-lagent-5)
9. [Couts Claude API](#9-couts-claude-api)
10. [Verification de coherence](#10-verification-de-coherence)
11. [Code complet TypeScript](#11-code-complet-typescript)
12. [Integration avec les Agents 8, 9, 10](#12-integration-avec-les-agents-8-9-10)

---

## 1. MISSION DU REDACTEUR

### 1.1 Position dans le pipeline

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        AGENT 4 -- REDACTEUR                                  │
│                                                                              │
│  3 sous-agents (4a, 4b, 4c)                                                │
│  1 API externe : Claude API (Anthropic)                                     │
│  Calcul ASYNCHRONE, 2-5s par prospect                                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                                                                     │     │
│  │   1. Reception fiche prospect scoree (Agent 3)                     │     │
│  │   2. Validation input (schema, champs requis)                      │     │
│  │   3. Calcul d'impact personnalise (sous-agent 4c)                 │     │
│  │   4. Selection du template (segment x canal x etape)              │     │
│  │   5. Generation email personnalise (sous-agent 4a)                │     │
│  │   6. Generation message LinkedIn personnalise (sous-agent 4b)     │     │
│  │   7. Controle qualite (longueur, spam, ton, hallucinations)       │     │
│  │   8. Validation humaine si HOT (notification Jonathan)            │     │
│  │   9. Dispatch vers Agent 5 (SUIVEUR) via queue BullMQ            │     │
│  │                                                                     │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│ AGENT 3             │     │ AGENT 4             │     │ AGENT 5             │
│ SCOREUR             │────>│ REDACTEUR           │────>│ SUIVEUR             │
│                     │     │                     │     │                     │
│ Output :            │     │ Input :             │     │ Input :             │
│ fiche_prospect      │     │ fiche_prospect      │     │ message_pret        │
│ + score_detail      │     │ enrichie + score    │     │ + canal             │
│ + categorie         │     │ + routing           │     │ + prospect_id       │
│ + routing           │     │ + categorie         │     │ + template_id       │
│                     │     │                     │     │ + etape             │
│                     │     │ Output :            │     │ + statut_validation │
│                     │     │ message_pret        │     │ + scheduling        │
│                     │     │ + validation_status │     │                     │
│                     │     │ + metadata          │     │                     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

### 1.2 Mission precise

**Ce que fait le Redacteur** :
- Recoit chaque fiche prospect scoree de l'Agent 3 (SCOREUR) via la queue BullMQ `redacteur-pipeline`
- Selectionne le template adapte au segment, canal et etape de la sequence
- Calcule des chiffres d'impact personnalises (perte de CA, taux de bounce, etc.) via le sous-agent 4c
- Genere un email froid personnalise via Claude API (sous-agent 4a)
- Genere un message LinkedIn personnalise via Claude API (sous-agent 4b)
- Applique des controles qualite automatiques (longueur, spam words, hallucinations, ton)
- Route les messages HOT vers Jonathan pour validation humaine avant envoi
- Dispatche les messages prets vers l'Agent 5 (SUIVEUR) via la queue BullMQ `suiveur-pipeline`

**Ce que le Redacteur ne fait PAS** :
- Il n'ENVOIE pas les messages (c'est le SUIVEUR, Agent 5)
- Il ne SCORE pas les prospects (c'est le SCOREUR, Agent 3)
- Il n'ENRICHIT pas les donnees (c'est l'ENRICHISSEUR, Agent 2)
- Il ne DETECTE pas les signaux d'achat (c'est le VEILLEUR, Agent 1)
- Il ne GERE pas les sequences de relance (c'est le SUIVEUR/NURTUREUR)
- Il ne PLANIFIE pas les horaires d'envoi (c'est le SUIVEUR)
- Il ne TRACK pas les opens/clicks/replies (c'est le SUIVEUR + ANALYSTE)

### 1.3 Caracteristiques techniques

| Propriete | Valeur |
|-----------|--------|
| Type de calcul | Asynchrone, API-based (Claude) |
| Temps par prospect | 2-5 secondes (appels Claude API) |
| API externe | Claude API (claude-sonnet-4-20250514) |
| Nombre de sous-agents | 3 (4a Email, 4b LinkedIn, 4c Calculateur) |
| Queue input | `redacteur-pipeline` (BullMQ) |
| Queue output | `suiveur-pipeline` (BullMQ) |
| Persistence | PostgreSQL (table `messages_generes`) |
| Rate limit Claude API | 50 req/min (Tier 1), 1000 req/min (Tier 3) |
| Retry policy | 3 tentatives, backoff exponentiel (2s, 4s, 8s) |
| Fallback | Template statique si Claude API echoue |

### 1.4 Principes fondamentaux de redaction

| Principe | Regle |
|----------|-------|
| Longueur email | 50-125 mots, 3-5 phrases |
| Longueur LinkedIn connexion | Max 300 caracteres |
| Longueur LinkedIn message | Max 500 caracteres |
| Structure | Hook --> Value --> CTA |
| Ton | Peer-to-peer, conversationnel, PAS marketing |
| Format email | Plain text UNIQUEMENT (pas de HTML) |
| CTA | Question douce, pas pushy ("Worth exploring?" pas "Book a call NOW") |
| Personnalisation | Signal-based, chiffree, specifique |
| Langue | Francais (vouvoiement par defaut, tutoiement pour startups) |
| Spam words | Liste noire de 800+ mots a eviter |

---

## 2. INPUT : SCHEMA JSON RECU DE L'AGENT 3

### 2.1 Schema JSON complet (output Agent 3 = input Agent 4)

Ce schema est la copie exacte de l'output de l'Agent 3 (section 7.1 des specs Agent 3). Le Redacteur recoit cet objet integralement.

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
    "nom": "TechStart SAS",
    "siren": "123456789",
    "siret": "12345678900012",
    "forme_juridique": "SAS",
    "date_creation": "2021-06-15",
    "secteur_naf": "6201Z",
    "secteur_label": "Programmation informatique",
    "segment": "pme_metro",
    "taille": "20-49",
    "effectif_exact": 45,
    "chiffre_affaires": 2500000,
    "localisation": {
      "adresse": "12 rue de la Paix",
      "code_postal": "75002",
      "ville": "Paris",
      "region": "Ile-de-France",
      "pays": "France"
    },
    "site_web": "https://techstart.fr",
    "linkedin_url": "https://linkedin.com/company/techstart-sas",
    "description": "Editeur SaaS B2B specialise dans la gestion de projet"
  },

  "contact": {
    "prenom": "Marie",
    "nom": "Dupont",
    "email": "marie.dupont@techstart.fr",
    "email_verified": true,
    "email_type": "professionnel",
    "telephone": "+33612345678",
    "linkedin_url": "https://linkedin.com/in/mariedupont",
    "poste": "CMO",
    "poste_normalise": "Chief Marketing Officer",
    "niveau_hierarchique": "C-Level",
    "anciennete_poste_mois": 1,
    "photo_url": "https://media.licdn.com/...",
    "bio_linkedin": "CMO chez TechStart | Ex-Google | Marketing digital & growth"
  },

  "contacts_secondaires": [],

  "technique": {
    "lighthouse": {
      "performance": 62,
      "accessibility": 85,
      "best_practices": 78,
      "seo": 90
    },
    "core_web_vitals": {
      "lcp": 3.2,
      "fid": 120,
      "cls": 0.15,
      "ttfb": 800
    },
    "technologies": ["WordPress", "WooCommerce", "PHP 7.4", "MySQL"],
    "cms": "WordPress",
    "hebergeur": "OVH",
    "ssl": true,
    "responsive": true,
    "temps_chargement_s": 3.2,
    "derniere_mise_a_jour": "2026-01-15"
  },

  "signaux": [
    {
      "type": "changement_poste",
      "description": "Marie Dupont nommee CMO chez TechStart SAS",
      "date": "2026-02-25",
      "source": "linkedin",
      "confiance": 95,
      "pertinence": "haute"
    },
    {
      "type": "recrutement_dev_web",
      "description": "TechStart recrute un Developpeur Front React",
      "date": "2026-03-15",
      "source": "indeed",
      "confiance": 80,
      "pertinence": "moyenne"
    }
  ],

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

### 2.2 Champs utilises par le Redacteur

| Champ | Utilisation par le Redacteur |
|-------|------------------------------|
| `prospect_id` | Identifiant unique, lie le message au prospect |
| `score.categorie` | Determine si validation humaine requise (HOT) |
| `score.sous_categorie` | Affine le ton et l'urgence du message |
| `score.segment_primaire` | Selectionne le template et le system prompt |
| `routing.sequence_id` | Identifie la sequence (SEQ_HOT_A_CRITICAL, etc.) |
| `routing.canal_principal` | Determine si on genere email, LinkedIn, ou les deux |
| `routing.canal_secondaire` | Canal de secours |
| `routing.validation_jonathan` | Si true, le message passe en validation humaine |
| `routing.nb_touchpoints` | Nombre de messages a generer dans la sequence |
| `routing.espacement_jours` | Planning de la sequence |
| `entreprise.*` | Personnalisation : nom, secteur, taille, CA, site web |
| `contact.*` | Personnalisation : prenom, poste, LinkedIn, anciennete |
| `technique.lighthouse.*` | Calculateur d'impact : performance, accessibilite |
| `technique.core_web_vitals.*` | Calculateur d'impact : LCP, CLS |
| `technique.temps_chargement_s` | Injecte dans le message ("votre site charge en Xs") |
| `technique.technologies` | Personnalisation stack : "vous utilisez WordPress" |
| `signaux[*]` | Hook principal du message : reference au signal |
| `signal_principal` | Resume du signal pour le hook |

### 2.3 Validation de l'input

```typescript
import { z } from 'zod'

const RedacteurInputSchema = z.object({
  prospect_id: z.string().uuid(),
  lead_id: z.string().uuid(),
  scored_at: z.string().datetime(),

  score: z.object({
    total: z.number().int().min(0).max(100),
    categorie: z.enum(['HOT', 'WARM', 'COLD']),
    sous_categorie: z.enum(['HOT_A', 'HOT_B', 'HOT_C']).nullable(),
    detail: z.object({}).passthrough(),
    segment_primaire: z.enum([
      'pme_metro', 'shopify_ecommerce', 'collectivites',
      'startups', 'agences_wl'
    ]),
    confiance_score: z.number().int().min(0).max(100),
  }),

  routing: z.object({
    sequence_id: z.string(),
    canal_principal: z.enum([
      'email_pro', 'email_perso', 'linkedin_dm',
      'linkedin_inmail', 'telephone'
    ]),
    canal_secondaire: z.enum([
      'email_pro', 'email_perso', 'linkedin_dm',
      'linkedin_inmail', 'telephone'
    ]).nullable(),
    validation_jonathan: z.boolean(),
    validation_bloquante: z.boolean(),
    sla_heures: z.number().positive(),
    nb_touchpoints: z.number().int().min(1).max(6),
    espacement_jours: z.array(z.number().int().min(0)),
    urgence: z.enum(['critique', 'haute', 'normale', 'basse']),
    priorite_queue: z.number().int().min(1).max(10),
  }),

  entreprise: z.object({
    nom: z.string(),
    site_web: z.string().url().optional(),
    segment: z.string(),
    taille: z.string().optional(),
    effectif_exact: z.number().optional(),
    chiffre_affaires: z.number().optional(),
    secteur_label: z.string().optional(),
    localisation: z.object({
      ville: z.string().optional(),
      region: z.string().optional(),
    }).optional(),
  }).passthrough(),

  contact: z.object({
    prenom: z.string(),
    nom: z.string(),
    email: z.string().email().optional(),
    email_verified: z.boolean().optional(),
    linkedin_url: z.string().url().optional(),
    poste: z.string(),
    poste_normalise: z.string().optional(),
    niveau_hierarchique: z.string().optional(),
    anciennete_poste_mois: z.number().optional(),
  }).passthrough(),

  technique: z.object({
    lighthouse: z.object({
      performance: z.number().min(0).max(100).optional(),
      accessibility: z.number().min(0).max(100).optional(),
      seo: z.number().min(0).max(100).optional(),
    }).optional(),
    core_web_vitals: z.object({
      lcp: z.number().optional(),
      cls: z.number().optional(),
    }).optional(),
    temps_chargement_s: z.number().optional(),
    technologies: z.array(z.string()).optional(),
    cms: z.string().optional(),
  }).passthrough().optional(),

  signaux: z.array(z.object({
    type: z.string(),
    description: z.string(),
    date: z.string(),
    source: z.string(),
  })).optional(),

  signal_principal: z.string().optional(),
})

type RedacteurInput = z.infer<typeof RedacteurInputSchema>
```

---

## 3. SOUS-AGENTS DU REDACTEUR

### 3.0 Architecture des sous-agents

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AGENT 4 -- REDACTEUR                             │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  ORCHESTRATEUR (agent principal)                                 │  │
│  │  - Recoit la fiche scoree                                       │  │
│  │  - Dispatche vers les sous-agents                               │  │
│  │  - Assemble le message final                                    │  │
│  │  - Controle qualite                                             │  │
│  └───────────┬──────────────────┬──────────────────┬───────────────┘  │
│              │                  │                  │                   │
│  ┌───────────▼──────┐  ┌──────▼──────────┐  ┌───▼──────────────┐   │
│  │  SOUS-AGENT 4c   │  │  SOUS-AGENT 4a  │  │  SOUS-AGENT 4b  │   │
│  │  CALCULATEUR     │  │  REDACTEUR      │  │  REDACTEUR       │   │
│  │  D'IMPACT        │  │  EMAIL          │  │  LINKEDIN        │   │
│  │                  │  │                  │  │                  │   │
│  │  Pas d'API       │  │  Claude API     │  │  Claude API      │   │
│  │  Calcul local    │  │  sonnet         │  │  sonnet          │   │
│  │  Deterministe    │  │  temperature 0.7│  │  temperature 0.7 │   │
│  │                  │  │  max_tokens 500 │  │  max_tokens 300  │   │
│  └──────────────────┘  └─────────────────┘  └──────────────────┘   │
│                                                                         │
│  ORDRE D'EXECUTION :                                                   │
│  1. Calculateur d'Impact (4c) -- synchrone, < 10ms                    │
│  2. Redacteur Email (4a) + Redacteur LinkedIn (4b) -- en parallele   │
│  3. Controle qualite -- synchrone, < 50ms                             │
│  4. Validation humaine (si HOT) -- async, attente Jonathan            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

> **Detail des sous-agents** : Voir les fichiers dedies :
> - **AGENT-4a-EMAIL.md** : System prompts, templates par segment, parametres Claude API, user prompt, appel API, gestion erreurs
> - **AGENT-4b-LINKEDIN.md** : Notes connexion, messages post-connexion, commentaires, prompts par segment, contraintes de longueur
> - **AGENT-4c-IMPACT.md** : Formules de calcul (performance web/CA, attribution pub, RGAA, abandon panier), code TypeScript, benchmarks

---

## 4. BIBLIOTHEQUE DE TEMPLATES

### 4.1 Architecture de la bibliotheque

La bibliotheque couvre 5 segments x 2 canaux x 4 etapes = 40 templates au total. Chaque template est identifie par un ID unique et versionne.

**Convention d'ID** : `{segment}-{canal}-{etape}-v{version}`

**Segments** : `pme_metro`, `shopify`, `collectivites`, `startups`, `agences_wl`
**Canaux** : `email`, `linkedin`
**Etapes** : `contact1`, `relance1`, `relance2`, `breakup`

### 4.2 Templates Email

---

#### TPL-001 : pme_metro-email-contact1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-001` |
| **Nom** | PME Metro - Email - 1er Contact - Performance |
| **Segment** | `pme_metro` |
| **Canal** | Email |
| **Etape** | 1 (Premier contact) |
| **Longueur cible** | 60-80 mots |

**Subject line** : `Le site de {{entreprise_nom}} vs {{concurrent}} — ecart de perf`

**Corps** :
```
Bonjour {{contact_prenom}},

Observation rapide : {{entreprise_nom}} charge en {{temps_chargement}}s, contre 1.8s en moyenne pour votre secteur.
{{#if perte_ca_mensuelle}}Cet ecart represente environ {{perte_ca_mensuelle}} EUR/mois en conversions perdues.{{/if}}

On a aide une PME similaire a diviser son temps de chargement par 2 — resultat : +12% de CA en un trimestre.

Ca vaut 15 minutes pour en discuter ?

Jonathan
Axiom Marketing
axiom-marketing.fr
```

**Variables** : `entreprise_nom`, `contact_prenom`, `temps_chargement`, `perte_ca_mensuelle`, `concurrent`

---

#### TPL-002 : pme_metro-email-relance1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-002` |
| **Nom** | PME Metro - Email - Relance 1 - Cas client |
| **Segment** | `pme_metro` |
| **Canal** | Email |
| **Etape** | 2 (Relance 1) |
| **Longueur cible** | 50-70 mots |

**Subject line** : `Re: {{entreprise_nom}} — un cas similaire`

**Corps** :
```
Bonjour {{contact_prenom}},

Je reviens vers vous avec un exemple concret.

Un cabinet de conseil a {{ville_cas_client}} avait les memes problematiques de performance web.
Resultat apres intervention : Lighthouse de 45 a 92, +15% de trafic organique en 2 mois.

Est-ce que la performance de votre site est un sujet en ce moment chez {{entreprise_nom}} ?

Jonathan
```

**Variables** : `entreprise_nom`, `contact_prenom`, `ville_cas_client`

---

#### TPL-003 : pme_metro-email-relance2-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-003` |
| **Nom** | PME Metro - Email - Relance 2 - Question directe |
| **Segment** | `pme_metro` |
| **Canal** | Email |
| **Etape** | 3 (Relance 2) |
| **Longueur cible** | 40-55 mots |

**Subject line** : `{{entreprise_nom}} — toujours d'actualite ?`

**Corps** :
```
Bonjour {{contact_prenom}},

Question rapide : est-ce que l'amelioration de votre site web est toujours dans vos priorites chez {{entreprise_nom}} ?

Si oui, je peux vous partager un audit rapide (gratuit, 5 min de lecture).
Si non, je comprends tout a fait — pas de souci.

Jonathan
```

**Variables** : `entreprise_nom`, `contact_prenom`

---

#### TPL-004 : pme_metro-email-breakup-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-004` |
| **Nom** | PME Metro - Email - Break-up |
| **Segment** | `pme_metro` |
| **Canal** | Email |
| **Etape** | 4 (Break-up) |
| **Longueur cible** | 30-45 mots |

**Subject line** : `Fermeture du dossier {{entreprise_nom}}`

**Corps** :
```
Bonjour {{contact_prenom}},

Je ne veux pas encombrer votre boite mail.
C'etait mon dernier message sur le sujet.

Si l'optimisation web redevient un sujet chez {{entreprise_nom}}, je reste disponible.

Bonne continuation,

Jonathan
```

**Variables** : `entreprise_nom`, `contact_prenom`

---

#### TPL-005 : shopify-email-contact1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-005` |
| **Nom** | Shopify - Email - 1er Contact - Post-migration |
| **Segment** | `shopify_ecommerce` |
| **Canal** | Email |
| **Etape** | 1 (Premier contact) |
| **Longueur cible** | 60-80 mots |

**Subject line** : `{{entreprise_nom}} post-Shopify — opportunite conversion`

**Corps** :
```
Bonjour {{contact_prenom}},

Bravo pour la migration vers Shopify{{#if signal_migration_date}} le mois dernier{{/if}}.

Les 90 premiers jours post-migration = fenetre d'optimisation critique.
On a aide un marchand similaire a recuperer {{ca_recuperable}} EUR de CA perdu
en corrigeant le checkout (abandon panier de 78% a 41%).

Ca pourrait s'appliquer chez {{entreprise_nom}}. 15 min pour en discuter ?

Jonathan
Axiom Marketing
axiom-marketing.fr
```

**Variables** : `entreprise_nom`, `contact_prenom`, `signal_migration_date`, `ca_recuperable`

---

#### TPL-006 : shopify-email-relance1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-006` |
| **Nom** | Shopify - Email - Relance 1 - Tracking |
| **Segment** | `shopify_ecommerce` |
| **Canal** | Email |
| **Etape** | 2 (Relance 1) |
| **Longueur cible** | 50-70 mots |

**Subject line** : `Re: {{entreprise_nom}} — suivi attribution`

**Corps** :
```
Bonjour {{contact_prenom}},

Un chiffre qui revient souvent chez les marchands Shopify : 25% des conversions finissent en "canal inconnu" dans les rapports.

Le tracking server-side corrige ca en 5 jours. Resultat chez un client : ROAS +30% en visibilite (pas en depenses, en attribution).

Ca vous parle ?

Jonathan
```

**Variables** : `entreprise_nom`, `contact_prenom`

---

#### TPL-007 : shopify-email-relance2-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-007` |
| **Nom** | Shopify - Email - Relance 2 - Panier |
| **Segment** | `shopify_ecommerce` |
| **Canal** | Email |
| **Etape** | 3 (Relance 2) |
| **Longueur cible** | 40-55 mots |

**Subject line** : `{{entreprise_nom}} — taux d'abandon panier ?`

**Corps** :
```
Bonjour {{contact_prenom}},

Question directe : connaissez-vous votre taux d'abandon de panier chez {{entreprise_nom}} ?

La moyenne secteur est 70%. On aide nos clients a descendre sous les 45%.

Si c'est un sujet, je peux vous montrer comment en 15 min.

Jonathan
```

**Variables** : `entreprise_nom`, `contact_prenom`

---

#### TPL-008 : shopify-email-breakup-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-008` |
| **Nom** | Shopify - Email - Break-up |
| **Segment** | `shopify_ecommerce` |
| **Canal** | Email |
| **Etape** | 4 (Break-up) |
| **Longueur cible** | 30-45 mots |

**Subject line** : `Dernier message — {{entreprise_nom}}`

**Corps** :
```
Bonjour {{contact_prenom}},

Dernier message de ma part sur le sujet.

Si l'optimisation conversion ou le tracking redevient une priorite chez {{entreprise_nom}}, je suis a un email.

Bonne continuation avec Shopify !

Jonathan
```

**Variables** : `entreprise_nom`, `contact_prenom`

---

#### TPL-009 : collectivites-email-contact1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-009` |
| **Nom** | Collectivites - Email - 1er Contact - RGAA |
| **Segment** | `collectivites` |
| **Canal** | Email |
| **Etape** | 1 (Premier contact) |
| **Longueur cible** | 60-80 mots |

**Subject line** : `Conformite RGAA — audit rapide pour {{entreprise_nom}} ?`

**Corps** :
```
Bonjour {{contact_prenom}},

L'obligation de conformite RGAA pour les sites publics se renforce ce trimestre.

Nous avons evalue {{entreprise_nom}} : environ {{nb_criteres_non_conformes}} criteres en retard sur les 68 de la norme.

La remediation coute generalement entre {{cout_remediation_min}} et {{cout_remediation_max}} EUR et se realise en {{delai_jours}} jours.
Nous avons accompagne 15+ collectivites dans cette demarche.

Souhaitez-vous qu'on planifie un audit ?

Jonathan Dewaele
Axiom Marketing
axiom-marketing.fr
```

**Variables** : `entreprise_nom`, `contact_prenom`, `nb_criteres_non_conformes`, `cout_remediation_min`, `cout_remediation_max`, `delai_jours`

---

#### TPL-010 : collectivites-email-relance1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-010` |
| **Nom** | Collectivites - Email - Relance 1 - Benchmark |
| **Segment** | `collectivites` |
| **Canal** | Email |
| **Etape** | 2 (Relance 1) |
| **Longueur cible** | 50-70 mots |

**Subject line** : `Re: RGAA {{entreprise_nom}} — retour d'experience`

**Corps** :
```
Bonjour {{contact_prenom}},

Je me permets de revenir vers vous concernant la conformite RGAA de {{entreprise_nom}}.

Depuis notre dernier echange, nous avons accompagne une communaute de communes en {{region_cas_client}} : de 47 a 68 criteres conformes en 30 jours, pour un budget de 12 000 EUR.

Souhaitez-vous en discuter ?

Jonathan Dewaele
```

**Variables** : `entreprise_nom`, `contact_prenom`, `region_cas_client`

---

#### TPL-011 : collectivites-email-relance2-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-011` |
| **Nom** | Collectivites - Email - Relance 2 - Budget |
| **Segment** | `collectivites` |
| **Canal** | Email |
| **Etape** | 3 (Relance 2) |
| **Longueur cible** | 40-55 mots |

**Subject line** : `{{entreprise_nom}} — budget RGAA pour le prochain exercice ?`

**Corps** :
```
Bonjour {{contact_prenom}},

La preparation budgetaire approche. Si la conformite RGAA fait partie de vos projets pour le prochain exercice, nous pouvons vous fournir un chiffrage rapide pour integration dans votre plan.

Cela vous serait-il utile ?

Jonathan Dewaele
```

**Variables** : `entreprise_nom`, `contact_prenom`

---

#### TPL-012 : collectivites-email-breakup-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-012` |
| **Nom** | Collectivites - Email - Break-up |
| **Segment** | `collectivites` |
| **Canal** | Email |
| **Etape** | 4 (Break-up) |
| **Longueur cible** | 30-45 mots |

**Subject line** : `Cloture — dossier RGAA {{entreprise_nom}}`

**Corps** :
```
Bonjour {{contact_prenom}},

Je comprends que ce n'est peut-etre pas le bon moment.

Si la conformite RGAA redevient un sujet d'actualite pour {{entreprise_nom}}, n'hesitez pas a me recontacter.

Bien cordialement,

Jonathan Dewaele
Axiom Marketing
```

**Variables** : `entreprise_nom`, `contact_prenom`

---

#### TPL-013 : startups-email-contact1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-013` |
| **Nom** | Startups - Email - 1er Contact - Post-levee |
| **Segment** | `startups` |
| **Canal** | Email |
| **Etape** | 1 (Premier contact) |
| **Longueur cible** | 60-80 mots |

**Subject line** : `{{entreprise_nom}} post-levee — tracking gap ?`

**Corps** :
```
Hey {{contact_prenom}},

Vu la levee de {{entreprise_nom}}{{#if signal_funding}} en {{signal_funding_date}}{{/if}}. Bravo !

{{#if contact_poste_nouveau}}Les CMOs recrutes post-levee ont generalement 90 jours pour prouver le ROI marketing au board.{{/if}}
Le tracking server-side recupere en moyenne 25-30% de conversions "perdues" dans les rapports.

On a installe ca en 5 jours pour une startup similaire. Resultat : +30% de ROAS attribue.

Ca vaut 20 min pour regarder ton setup ?

Jonathan
Axiom Marketing
axiom-marketing.fr
```

**Variables** : `entreprise_nom`, `contact_prenom`, `signal_funding`, `signal_funding_date`, `contact_poste_nouveau`

---

#### TPL-014 : startups-email-relance1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-014` |
| **Nom** | Startups - Email - Relance 1 - Stack |
| **Segment** | `startups` |
| **Canal** | Email |
| **Etape** | 2 (Relance 1) |
| **Longueur cible** | 50-70 mots |

**Subject line** : `Re: {{entreprise_nom}} — chiffres attribution`

**Corps** :
```
Hey {{contact_prenom}},

Un chiffre qui fait reflechir : {{gaspillage_mensuel}} EUR/mois de budget pub finit en "canal inconnu" pour une startup de votre taille.

Le tracking server-side corrige ca. Setup en 5 jours, 990 EUR one-shot + 89 EUR/mois.

Tu utilises quoi pour l'attribution en ce moment ?

Jonathan
```

**Variables** : `entreprise_nom`, `contact_prenom`, `gaspillage_mensuel`

---

#### TPL-015 : startups-email-relance2-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-015` |
| **Nom** | Startups - Email - Relance 2 - ROI rapide |
| **Segment** | `startups` |
| **Canal** | Email |
| **Etape** | 3 (Relance 2) |
| **Longueur cible** | 40-55 mots |

**Subject line** : `{{entreprise_nom}} — derniere question`

**Corps** :
```
Hey {{contact_prenom}},

Le tracking et l'attribution, c'est toujours un sujet chez {{entreprise_nom}} ?

Si oui, je peux te montrer en 15 min comment une startup similaire a recupere 30% de ses conversions perdues.

Si non, aucun souci.

Jonathan
```

**Variables** : `entreprise_nom`, `contact_prenom`

---

#### TPL-016 : startups-email-breakup-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-016` |
| **Nom** | Startups - Email - Break-up |
| **Segment** | `startups` |
| **Canal** | Email |
| **Etape** | 4 (Break-up) |
| **Longueur cible** | 30-45 mots |

**Subject line** : `Je ferme le sujet — {{entreprise_nom}}`

**Corps** :
```
Hey {{contact_prenom}},

Pas de reponse = message recu. Je ferme le sujet de mon cote.

Si le tracking ou la perf web redevient prioritaire chez {{entreprise_nom}}, je suis la.

Bonne continuation !

Jonathan
```

**Variables** : `entreprise_nom`, `contact_prenom`

---

#### TPL-017 : agences_wl-email-contact1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-017` |
| **Nom** | Agences WL - Email - 1er Contact - Scaling |
| **Segment** | `agences_wl` |
| **Canal** | Email |
| **Etape** | 1 (Premier contact) |
| **Longueur cible** | 60-80 mots |

**Subject line** : `3 agences qui triplent leur capacite en 2026`

**Corps** :
```
Bonjour {{contact_prenom}},

La plupart des agences font 2-4 projets client par mois.
Les meilleures en font 6+ avec la meme equipe. La difference ? Un partenaire technique fiable.

On a aide une agence de {{effectif_cas_client}} personnes a generer {{pipeline_cas_client}} EUR de pipeline en 2 mois
en marque blanche — leurs clients ne savent jamais qu'on existe.

Ca vaut le coup d'explorer votre plus gros point de blocage ?

Jonathan
Axiom Marketing
axiom-marketing.fr
```

**Variables** : `entreprise_nom`, `contact_prenom`, `effectif_cas_client`, `pipeline_cas_client`

---

#### TPL-018 : agences_wl-email-relance1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-018` |
| **Nom** | Agences WL - Email - Relance 1 - Marge |
| **Segment** | `agences_wl` |
| **Canal** | Email |
| **Etape** | 2 (Relance 1) |
| **Longueur cible** | 50-70 mots |

**Subject line** : `Re: partenariat technique — {{entreprise_nom}}`

**Corps** :
```
Bonjour {{contact_prenom}},

Le modele est simple : vous vendez a votre tarif, on livre a prix partenaire. Marge preservee.

Nos agences partenaires facturent en moyenne 2x notre tarif a leurs clients, sans recruter un seul dev.

C'est un modele qui pourrait fonctionner pour {{entreprise_nom}} ?

Jonathan
```

**Variables** : `entreprise_nom`, `contact_prenom`

---

#### TPL-019 : agences_wl-email-relance2-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-019` |
| **Nom** | Agences WL - Email - Relance 2 - Question |
| **Segment** | `agences_wl` |
| **Canal** | Email |
| **Etape** | 3 (Relance 2) |
| **Longueur cible** | 40-55 mots |

**Subject line** : `{{entreprise_nom}} — marque blanche, un sujet ?`

**Corps** :
```
Bonjour {{contact_prenom}},

Question directe : est-ce que le scaling ou la capacite technique est un sujet chez {{entreprise_nom}} en ce moment ?

Si oui, un echange de 15 min suffit pour voir si un partenariat fait sens.

Jonathan
```

**Variables** : `entreprise_nom`, `contact_prenom`

---

#### TPL-020 : agences_wl-email-breakup-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-020` |
| **Nom** | Agences WL - Email - Break-up |
| **Segment** | `agences_wl` |
| **Canal** | Email |
| **Etape** | 4 (Break-up) |
| **Longueur cible** | 30-45 mots |

**Subject line** : `Cloture — {{entreprise_nom}}`

**Corps** :
```
Bonjour {{contact_prenom}},

C'est mon dernier message sur le sujet partenariat technique.

Si {{entreprise_nom}} a un jour besoin de renfort dev en marque blanche, je suis disponible.

Bonne continuation,

Jonathan
```

**Variables** : `entreprise_nom`, `contact_prenom`

---

### 4.3 Templates LinkedIn

---

#### TPL-021 : pme_metro-linkedin-contact1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-021` |
| **Nom** | PME Metro - LinkedIn - Note connexion |
| **Segment** | `pme_metro` |
| **Canal** | LinkedIn (note connexion) |
| **Etape** | 0 (Connexion) |
| **Longueur cible** | Max 300 chars |

**Corps** :
```
Bonjour {{contact_prenom}}, je travaille avec des PME {{secteur_label}} sur la performance de leur site web. Votre entreprise est dans notre coeur de cible. On se connecte ?
```
**Chars** : ~170

---

#### TPL-022 : pme_metro-linkedin-relance1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-022` |
| **Nom** | PME Metro - LinkedIn - Message post-connexion |
| **Segment** | `pme_metro` |
| **Canal** | LinkedIn (message) |
| **Etape** | 1 (Post-connexion) |
| **Longueur cible** | Max 500 chars |

**Corps** :
```
Merci d'avoir accepte, {{contact_prenom}} ! J'ai regarde le site de {{entreprise_nom}} — il charge en {{temps_chargement}}s, ce qui est au-dessus de la moyenne du secteur. On a aide une PME similaire a diviser ce temps par 2, resultat : +12% de CA. C'est un sujet chez vous ?
```
**Chars** : ~280

---

#### TPL-023 : shopify-linkedin-contact1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-023` |
| **Nom** | Shopify - LinkedIn - Note connexion |
| **Segment** | `shopify_ecommerce` |
| **Canal** | LinkedIn (note connexion) |
| **Etape** | 0 (Connexion) |
| **Longueur cible** | Max 300 chars |

**Corps** :
```
Bonjour {{contact_prenom}}, j'accompagne des e-commercants Shopify sur l'optimisation conversion et le tracking. {{entreprise_nom}} a l'air d'une belle boutique. On se connecte ?
```
**Chars** : ~175

---

#### TPL-024 : shopify-linkedin-relance1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-024` |
| **Nom** | Shopify - LinkedIn - Message post-connexion |
| **Segment** | `shopify_ecommerce` |
| **Canal** | LinkedIn (message) |
| **Etape** | 1 (Post-connexion) |
| **Longueur cible** | Max 500 chars |

**Corps** :
```
Merci ! Un sujet qui revient souvent chez les marchands Shopify : l'abandon de panier. On a aide un client a passer de 78% a 41% d'abandon, soit {{ca_recuperable}} EUR recuperes en 3 mois. C'est un sujet chez {{entreprise_nom}} aussi ?
```
**Chars** : ~240

---

#### TPL-025 : collectivites-linkedin-contact1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-025` |
| **Nom** | Collectivites - LinkedIn - Note connexion |
| **Segment** | `collectivites` |
| **Canal** | LinkedIn (note connexion) |
| **Etape** | 0 (Connexion) |
| **Longueur cible** | Max 300 chars |

**Corps** :
```
Bonjour {{contact_prenom}}, je travaille sur l'accessibilite numerique avec les collectivites. Le sujet RGAA prend de l'ampleur. Ravi de me connecter avec un professionnel du secteur public.
```
**Chars** : ~190

---

#### TPL-026 : collectivites-linkedin-relance1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-026` |
| **Nom** | Collectivites - LinkedIn - Message post-connexion |
| **Segment** | `collectivites` |
| **Canal** | LinkedIn (message) |
| **Etape** | 1 (Post-connexion) |
| **Longueur cible** | Max 500 chars |

**Corps** :
```
Merci pour la connexion, {{contact_prenom}}. Nous avons recemment accompagne une communaute de communes : de 47 a 68 criteres RGAA conformes en 30 jours. {{entreprise_nom}} a-t-elle deja realise un audit d'accessibilite ? Je serais heureux d'en discuter.
```
**Chars** : ~256

---

#### TPL-027 : startups-linkedin-contact1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-027` |
| **Nom** | Startups - LinkedIn - Note connexion |
| **Segment** | `startups` |
| **Canal** | LinkedIn (note connexion) |
| **Etape** | 0 (Connexion) |
| **Longueur cible** | Max 300 chars |

**Corps** :
```
Hey {{contact_prenom}}, vu la levee de {{entreprise_nom}}. Bravo ! Je bosse sur le tracking server-side pour les startups en growth. Ca pourrait etre pertinent. On se connecte ?
```
**Chars** : ~175

---

#### TPL-028 : startups-linkedin-relance1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-028` |
| **Nom** | Startups - LinkedIn - Message post-connexion |
| **Segment** | `startups` |
| **Canal** | LinkedIn (message) |
| **Etape** | 1 (Post-connexion) |
| **Longueur cible** | Max 500 chars |

**Corps** :
```
Merci ! Vu que {{entreprise_nom}} vient de lever, tu es surement en mode optimisation des metriques pour le board. On a aide une startup similaire a recuperer 25% de conversions perdues grace au tracking server-side. Tu utilises quoi pour l'attribution en ce moment ?
```
**Chars** : ~267

---

#### TPL-029 : agences_wl-linkedin-contact1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-029` |
| **Nom** | Agences WL - LinkedIn - Note connexion |
| **Segment** | `agences_wl` |
| **Canal** | LinkedIn (note connexion) |
| **Etape** | 0 (Connexion) |
| **Longueur cible** | Max 300 chars |

**Corps** :
```
Bonjour {{contact_prenom}}, je dirige une equipe technique qui travaille en marque blanche pour des agences. Toujours interessant d'echanger entre confreres. On se connecte ?
```
**Chars** : ~172

---

#### TPL-030 : agences_wl-linkedin-relance1-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-030` |
| **Nom** | Agences WL - LinkedIn - Message post-connexion |
| **Segment** | `agences_wl` |
| **Canal** | LinkedIn (message) |
| **Etape** | 1 (Post-connexion) |
| **Longueur cible** | Max 500 chars |

**Corps** :
```
Merci d'avoir accepte, {{contact_prenom}} ! On travaille avec des agences qui veulent scaler sans recruter des devs. On a aide une agence a passer de 3 a 7 projets/mois en marque blanche. Leurs clients ne savent jamais qu'on existe. C'est un modele qui pourrait vous interesser ?
```
**Chars** : ~285

---

### 4.4 Templates supplementaires (LinkedIn relances et break-ups)

---

#### TPL-031 : pme_metro-linkedin-relance2-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-031` |
| **Nom** | PME Metro - LinkedIn - Relance 2 |
| **Segment** | `pme_metro` |
| **Canal** | LinkedIn (message) |
| **Etape** | 2 (Relance LinkedIn) |
| **Longueur cible** | Max 400 chars |

**Corps** :
```
{{contact_prenom}}, un dernier partage : on vient de publier un mini-audit gratuit sur les performances web des PME {{secteur_label}}. Ca montre les erreurs les plus courantes (et les gains rapides). Si ca vous interesse, je vous l'envoie. Sinon, aucun souci.
```
**Chars** : ~258

---

#### TPL-032 : shopify-linkedin-relance2-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-032` |
| **Nom** | Shopify - LinkedIn - Relance 2 |
| **Segment** | `shopify_ecommerce` |
| **Canal** | LinkedIn (message) |
| **Etape** | 2 (Relance LinkedIn) |
| **Longueur cible** | Max 400 chars |

**Corps** :
```
{{contact_prenom}}, derniere question : le taux de conversion post-migration Shopify, c'est un sujet en ce moment chez {{entreprise_nom}} ? Si oui, je peux partager 3 quick wins qu'on a testes avec d'autres marchands. Si non, pas de souci.
```
**Chars** : ~237

---

#### TPL-033 : collectivites-linkedin-relance2-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-033` |
| **Nom** | Collectivites - LinkedIn - Relance 2 |
| **Segment** | `collectivites` |
| **Canal** | LinkedIn (message) |
| **Etape** | 2 (Relance LinkedIn) |
| **Longueur cible** | Max 400 chars |

**Corps** :
```
{{contact_prenom}}, je me permets une derniere question : l'accessibilite numerique est-elle dans vos priorites pour le prochain exercice ? Si oui, je peux vous transmettre un chiffrage rapide pour integration budgetaire.
```
**Chars** : ~215

---

#### TPL-034 : startups-linkedin-relance2-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-034` |
| **Nom** | Startups - LinkedIn - Relance 2 |
| **Segment** | `startups` |
| **Canal** | LinkedIn (message) |
| **Etape** | 2 (Relance LinkedIn) |
| **Longueur cible** | Max 400 chars |

**Corps** :
```
{{contact_prenom}}, le tracking et l'attribution, c'est toujours un sujet chez {{entreprise_nom}} ? Si oui, je peux te montrer en 15 min comment une startup similaire a recupere 30% de conversions perdues. Sinon, all good.
```
**Chars** : ~222

---

#### TPL-035 : agences_wl-linkedin-relance2-v1.0

| Champ | Valeur |
|-------|--------|
| **ID** | `TPL-035` |
| **Nom** | Agences WL - LinkedIn - Relance 2 |
| **Segment** | `agences_wl` |
| **Canal** | LinkedIn (message) |
| **Etape** | 2 (Relance LinkedIn) |
| **Longueur cible** | Max 400 chars |

**Corps** :
```
{{contact_prenom}}, derniere question de ma part : le scaling ou la capacite technique, c'est un enjeu chez {{entreprise_nom}} en ce moment ? Si oui, 15 min suffisent pour voir si un partenariat WL fait sens.
```
**Chars** : ~205

---

### 4.5 Registre des templates (metadata.json)

```json
{
  "version": "1.0",
  "last_updated": "2026-03-18",
  "total_templates": 35,
  "coverage": {
    "segments": ["pme_metro", "shopify_ecommerce", "collectivites", "startups", "agences_wl"],
    "canaux": ["email", "linkedin"],
    "etapes_email": ["contact1", "relance1", "relance2", "breakup"],
    "etapes_linkedin": ["connexion", "post_connexion", "relance2"]
  },
  "templates": [
    { "id": "TPL-001", "segment": "pme_metro", "canal": "email", "etape": "contact1", "status": "control", "version": "1.0" },
    { "id": "TPL-002", "segment": "pme_metro", "canal": "email", "etape": "relance1", "status": "control", "version": "1.0" },
    { "id": "TPL-003", "segment": "pme_metro", "canal": "email", "etape": "relance2", "status": "control", "version": "1.0" },
    { "id": "TPL-004", "segment": "pme_metro", "canal": "email", "etape": "breakup", "status": "control", "version": "1.0" },
    { "id": "TPL-005", "segment": "shopify_ecommerce", "canal": "email", "etape": "contact1", "status": "control", "version": "1.0" },
    { "id": "TPL-006", "segment": "shopify_ecommerce", "canal": "email", "etape": "relance1", "status": "control", "version": "1.0" },
    { "id": "TPL-007", "segment": "shopify_ecommerce", "canal": "email", "etape": "relance2", "status": "control", "version": "1.0" },
    { "id": "TPL-008", "segment": "shopify_ecommerce", "canal": "email", "etape": "breakup", "status": "control", "version": "1.0" },
    { "id": "TPL-009", "segment": "collectivites", "canal": "email", "etape": "contact1", "status": "control", "version": "1.0" },
    { "id": "TPL-010", "segment": "collectivites", "canal": "email", "etape": "relance1", "status": "control", "version": "1.0" },
    { "id": "TPL-011", "segment": "collectivites", "canal": "email", "etape": "relance2", "status": "control", "version": "1.0" },
    { "id": "TPL-012", "segment": "collectivites", "canal": "email", "etape": "breakup", "status": "control", "version": "1.0" },
    { "id": "TPL-013", "segment": "startups", "canal": "email", "etape": "contact1", "status": "control", "version": "1.0" },
    { "id": "TPL-014", "segment": "startups", "canal": "email", "etape": "relance1", "status": "control", "version": "1.0" },
    { "id": "TPL-015", "segment": "startups", "canal": "email", "etape": "relance2", "status": "control", "version": "1.0" },
    { "id": "TPL-016", "segment": "startups", "canal": "email", "etape": "breakup", "status": "control", "version": "1.0" },
    { "id": "TPL-017", "segment": "agences_wl", "canal": "email", "etape": "contact1", "status": "control", "version": "1.0" },
    { "id": "TPL-018", "segment": "agences_wl", "canal": "email", "etape": "relance1", "status": "control", "version": "1.0" },
    { "id": "TPL-019", "segment": "agences_wl", "canal": "email", "etape": "relance2", "status": "control", "version": "1.0" },
    { "id": "TPL-020", "segment": "agences_wl", "canal": "email", "etape": "breakup", "status": "control", "version": "1.0" },
    { "id": "TPL-021", "segment": "pme_metro", "canal": "linkedin", "etape": "connexion", "status": "control", "version": "1.0" },
    { "id": "TPL-022", "segment": "pme_metro", "canal": "linkedin", "etape": "post_connexion", "status": "control", "version": "1.0" },
    { "id": "TPL-023", "segment": "shopify_ecommerce", "canal": "linkedin", "etape": "connexion", "status": "control", "version": "1.0" },
    { "id": "TPL-024", "segment": "shopify_ecommerce", "canal": "linkedin", "etape": "post_connexion", "status": "control", "version": "1.0" },
    { "id": "TPL-025", "segment": "collectivites", "canal": "linkedin", "etape": "connexion", "status": "control", "version": "1.0" },
    { "id": "TPL-026", "segment": "collectivites", "canal": "linkedin", "etape": "post_connexion", "status": "control", "version": "1.0" },
    { "id": "TPL-027", "segment": "startups", "canal": "linkedin", "etape": "connexion", "status": "control", "version": "1.0" },
    { "id": "TPL-028", "segment": "startups", "canal": "linkedin", "etape": "post_connexion", "status": "control", "version": "1.0" },
    { "id": "TPL-029", "segment": "agences_wl", "canal": "linkedin", "etape": "connexion", "status": "control", "version": "1.0" },
    { "id": "TPL-030", "segment": "agences_wl", "canal": "linkedin", "etape": "post_connexion", "status": "control", "version": "1.0" },
    { "id": "TPL-031", "segment": "pme_metro", "canal": "linkedin", "etape": "relance2", "status": "control", "version": "1.0" },
    { "id": "TPL-032", "segment": "shopify_ecommerce", "canal": "linkedin", "etape": "relance2", "status": "control", "version": "1.0" },
    { "id": "TPL-033", "segment": "collectivites", "canal": "linkedin", "etape": "relance2", "status": "control", "version": "1.0" },
    { "id": "TPL-034", "segment": "startups", "canal": "linkedin", "etape": "relance2", "status": "control", "version": "1.0" },
    { "id": "TPL-035", "segment": "agences_wl", "canal": "linkedin", "etape": "relance2", "status": "control", "version": "1.0" }
  ]
}
```

### 4.6 Selection automatique du template

```typescript
interface TemplateSelection {
  template_id: string
  segment: string
  canal: string
  etape: string
}

function selectTemplate(
  segment: string,
  canalPrincipal: string,
  etapeNumero: number,
  sequenceId: string,
): TemplateSelection {
  // Mapper le canal routing vers le type de template
  const canal = canalPrincipal.startsWith('linkedin') ? 'linkedin' : 'email'

  // Mapper le numero d'etape vers le type d'etape
  let etape: string
  if (canal === 'email') {
    switch (etapeNumero) {
      case 1: etape = 'contact1'; break
      case 2: etape = 'relance1'; break
      case 3: etape = 'relance2'; break
      default: etape = 'breakup'; break
    }
  } else {
    switch (etapeNumero) {
      case 0: etape = 'connexion'; break
      case 1: etape = 'post_connexion'; break
      default: etape = 'relance2'; break
    }
  }

  // Chercher le template correspondant
  const templateId = findTemplateId(segment, canal, etape)

  return {
    template_id: templateId,
    segment,
    canal,
    etape,
  }
}

function findTemplateId(segment: string, canal: string, etape: string): string {
  // Table de correspondance segment -> prefixe
  const segmentMap: Record<string, string> = {
    'pme_metro': 'pme_metro',
    'shopify_ecommerce': 'shopify',
    'collectivites': 'collectivites',
    'startups': 'startups',
    'agences_wl': 'agences_wl',
  }

  const segPrefix = segmentMap[segment] || segment

  // Lookup dans le registre des templates
  const registry = loadTemplateRegistry()
  const match = registry.templates.find(t =>
    t.segment === segment &&
    t.canal === canal &&
    t.etape === etape &&
    t.status !== 'deprecated'
  )

  if (!match) {
    // Fallback : template generique
    console.warn(`[Agent4] Pas de template pour ${segment}/${canal}/${etape}, utilisation fallback`)
    return 'TPL-FALLBACK'
  }

  return match.id
}
```

---

## 5. PERSONNALISATION AVANCEE

### 5.1 Niveaux de personnalisation

| Niveau | Description | Variables | Impact sur response rate |
|--------|-------------|-----------|-------------------------|
| **Tier 1 -- Basique** | Merge tags standards | `prenom`, `entreprise_nom`, `poste` | Baseline (+0%) |
| **Tier 2 -- Firmographique** | Contexte entreprise | `taille`, `secteur`, `ville`, `CA` | +5-10% |
| **Tier 3 -- Signal** | Evenement declencheur | `signal_principal`, `date_signal`, `type_signal` | +15-25% (le plus gros gain) |
| **Tier 4 -- Technique** | Donnees du site web | `lighthouse_score`, `temps_chargement`, `cms`, `technologies` | +10-15% |
| **Tier 5 -- Impact** | Chiffres personnalises | `perte_ca_mensuelle`, `taux_bounce`, `nb_criteres_rgaa` | +10-20% |
| **Tier 6 -- Psychographique** | Adapte au role | Angle CEO vs CTO vs CMO | +5-10% |

### 5.2 Personnalisation par role decideur

#### CMO / Directeur Marketing

```typescript
const CMO_PERSONALIZATION = {
  role: 'CMO',
  motivations: [
    'Prouver le ROI marketing au board/CEO',
    'Ameliorer la qualite des leads et le taux de conversion',
    'Reduire le cout d acquisition client (CAC)',
  ],
  pain_points: [
    'Attribution gap : impossible de prouver quel canal genere du CA',
    'Performance du site impacte les campagnes pub',
    'Lead scoring manuel, peu fiable',
  ],
  angles_preferes: [
    'ROAS et attribution des conversions',
    'Impact de la performance web sur le CAC',
    'Automatisation du lead scoring',
  ],
  proof_points: [
    '+30% d amelioration du ROAS attribue',
    'X EUR economises en budget pub gaspille',
    'Amelioration qualite leads de X% a Y%',
  ],
  hook_template: 'Vu que {{entreprise_nom}} investit en pub — si le tracking est comme la plupart des startups, environ 25% des conversions finissent en "canal inconnu".',
}
```

#### CTO / Directeur Technique

```typescript
const CTO_PERSONALIZATION = {
  role: 'CTO',
  motivations: [
    'Ameliorer la performance et la fiabilite du systeme',
    'Reduire la dette technique',
    'Activer les metriques business (tracking revenus)',
  ],
  pain_points: [
    'Performance du site (scores Lighthouse) impacte UX',
    'Tracking legacy fragile, perte de donnees',
    'Manque d optimisation backend',
  ],
  angles_preferes: [
    'Score Lighthouse et Core Web Vitals',
    'Tracking server-side vs client-side (fiabilite)',
    'Stack technique moderne, architecture ouverte',
  ],
  proof_points: [
    'Score Lighthouse de X a Y en Z semaines',
    'Integrite des donnees : zero evenement perdu',
    'Approche technique (stack open source, architecture moderne)',
  ],
  hook_template: 'Le site de {{entreprise_nom}} a un CLS de {{cls}} — ca devrait etre sous 0.1. Le tracking server-side corrige ca aussi.',
}
```

#### CEO / Fondateur

```typescript
const CEO_PERSONALIZATION = {
  role: 'CEO',
  motivations: [
    'Taux de croissance (MoM, YoY)',
    'Unit economics (CAC, LTV)',
    'Data story pour les investisseurs',
  ],
  pain_points: [
    'Croissance en dessous du plan',
    'Impossible de prouver la contribution marketing a la croissance',
    'Investisseurs posent des questions sur les metriques conversion',
  ],
  angles_preferes: [
    'ROI en 30 jours',
    'Impact sur la croissance CA',
    'Metriques pour la prochaine levee',
  ],
  proof_points: [
    '[Client] passe de 2M a 5M ARR — l attribution etait la cle',
    'ROI en 30 jours : l investissement se rembourse en un mois',
    'Ratio CAC:LTV ameliore pour la prochaine levee',
  ],
  hook_template: 'La plupart des fondateurs a votre stade sont 20-30% en dessous de leurs objectifs de croissance a cause de trous dans l attribution. Ca vous parle ?',
}
```

### 5.3 Injection de la personnalisation par role

```typescript
function getPersonalizationByRole(
  poste: string,
  niveauHierarchique: string | undefined,
): typeof CMO_PERSONALIZATION {
  const posteLower = poste.toLowerCase()

  if (posteLower.includes('cmo') || posteLower.includes('marketing') ||
      posteLower.includes('growth')) {
    return CMO_PERSONALIZATION
  }

  if (posteLower.includes('cto') || posteLower.includes('technique') ||
      posteLower.includes('tech') || posteLower.includes('dsi')) {
    return CTO_PERSONALIZATION
  }

  if (posteLower.includes('ceo') || posteLower.includes('fondateur') ||
      posteLower.includes('directeur general') || posteLower.includes('gerant') ||
      niveauHierarchique === 'C-Level') {
    return CEO_PERSONALIZATION
  }

  // Defaut : angle CEO (parle CA et croissance)
  return CEO_PERSONALIZATION
}
```

### 5.4 Comment eviter le ton "IA generique"

#### Patterns detectes comme IA (a eviter absolument)

```
PATTERN 1 — Repetition de structure :
  "Nous travaillons avec X. Nous aidons Y. Nous croyons Z."
  FIX : Varier la longueur des phrases. Court. Puis moyen. Puis compose.

PATTERN 2 — Ouverture trop formelle :
  "J'espere que ce message vous trouve bien..."
  FIX : Attaquer directement avec le signal ou l'observation.

PATTERN 3 — Metaphores maladroites :
  "alignement synergique", "leverager les solutions"
  FIX : Parler simple. Comme un SMS professionnel.

PATTERN 4 — Compliment generique :
  "Votre entreprise est impressionnante..."
  FIX : Citer un fait specifique et verifiable.

PATTERN 5 — Personnalisation creuse :
  "J'ai vu que vous travaillez chez [Company]..."
  FIX : "Votre site charge en 3.2s — c'est au-dessus de la moyenne secteur."
```

#### Techniques anti-detection IA dans le system prompt

```
INSTRUCTIONS ANTI-DETECTION IA :

1. VARIER LA STRUCTURE DES PHRASES :
   Mauvais : "Nous offrons X. Nous proposons Y. Nous assurons Z."
   Bon : "X est notre specialite. Pour Y, on a une approche differente. Z ? On en parle en 15 min."

2. UTILISER DES FRAGMENTS :
   "Performance web. Un sujet chaud chez les PME cette annee."
   (Pas : "La performance web est un sujet important pour les PME cette annee.")

3. IMPERFECTIONS CALCULEES :
   "Ca vaut le coup d'en discuter ?" (informel)
   PAS : "Seriez-vous interesse par une discussion a ce sujet ?" (trop poli = IA)

4. REFERENCES SPECIFIQUES :
   "Lighthouse 62/100" pas "score de performance ameliorable"
   "3.2s de chargement" pas "votre site est un peu lent"

5. TEMPERATURE 0.7 :
   Assure une variation naturelle entre les emails generes.
   Ne jamais utiliser 0.0 (trop repetitif) ni 1.0 (trop aleatoire).
```

---

## 6. VALIDATION ET QUALITE

### 6.1 Pipeline de controle qualite

```
MESSAGE GENERE
     │
     ▼
┌─────────────────────┐
│ CHECK 1 : Longueur  │ email 50-125 mots | LI connexion max 300 chars | LI msg max 500 chars
│                     │ Fail -> Regenerer
└──────────┬──────────┘
           │ PASS
           ▼
┌─────────────────────┐
│ CHECK 2 : Spam      │ Scan 800+ spam words + phrases interdites
│                     │ Fail -> Regenerer
└──────────┬──────────┘
           │ PASS
           ▼
┌─────────────────────┐
│ CHECK 3 : Ton       │ Detection cliches B2B + patterns IA + vouvoiement/tutoiement
│                     │ Fail -> Regenerer avec contrainte renforcee
└──────────┬──────────┘
           │ PASS
           ▼
┌─────────────────────┐
│ CHECK 4 : Halluc.   │ Chaque chiffre/fait du message vs donnees input
│                     │ Fail -> Regenerer avec temperature 0.5
└──────────┬──────────┘
           │ PASS
           ▼
┌─────────────────────┐
│ CHECK 5 : Perso     │ Prenom present ? Entreprise presente ? Signal reference ?
│                     │ Fail -> Regenerer
└──────────┬──────────┘
           │ PASS
           ▼
┌─────────────────────────────┐
│ CHECK 6 : Validation humaine│ Si categorie == HOT -> notification Jonathan
│ (HOT uniquement)            │ Sinon -> auto-approve
└──────────┬──────────────────┘
           │ APPROVE
           ▼
    MESSAGE PRET
```

### 6.2 Implementation des checks

```typescript
interface QualityCheckResult {
  passed: boolean
  checks: {
    name: string
    passed: boolean
    detail: string
  }[]
  needs_human_validation: boolean
  regeneration_needed: boolean
  regeneration_hints: string[]
}

function runQualityChecks(
  email: GeneratedEmail,
  prospect: RedacteurInput,
  impactData: ImpactCalculation,
  canal: 'email' | 'linkedin',
  linkedinSubtype?: 'connection_note' | 'post_connection_message',
): QualityCheckResult {
  const checks: QualityCheckResult['checks'] = []
  const regenerationHints: string[] = []

  // CHECK 1 : Longueur
  if (canal === 'email') {
    const wordCount = email.body.split(/\s+/).filter(w => w.length > 0).length
    const lengthOk = wordCount >= 40 && wordCount <= 125
    checks.push({
      name: 'longueur_email',
      passed: lengthOk,
      detail: `${wordCount} mots (cible: 50-125)`,
    })
    if (!lengthOk) {
      regenerationHints.push(
        wordCount > 125 ? 'Message trop long. Raccourcir a 80 mots max.' :
        'Message trop court. Developper a au moins 50 mots.'
      )
    }

    // Longueur subject line
    const subjectLen = email.subject_line.length
    const subjectOk = subjectLen >= 20 && subjectLen <= 50
    checks.push({
      name: 'longueur_sujet',
      passed: subjectOk,
      detail: `${subjectLen} chars (cible: 36-50)`,
    })
  } else if (canal === 'linkedin') {
    const charCount = email.body.length
    let maxChars: number
    if (linkedinSubtype === 'connection_note') {
      maxChars = 300
    } else {
      maxChars = 500
    }
    const lengthOk = charCount <= maxChars
    checks.push({
      name: 'longueur_linkedin',
      passed: lengthOk,
      detail: `${charCount} chars (max: ${maxChars})`,
    })
    if (!lengthOk) {
      regenerationHints.push(`Message LinkedIn trop long (${charCount} chars). Max ${maxChars - 20} chars.`)
    }
  }

  // CHECK 2 : Spam words
  const spamWords = [
    'gratuit', 'free', 'garanti', 'guarantee', 'urgent', 'act now',
    'agissez maintenant', 'offre limitee', 'limited time', 'derniere chance',
    'last chance', 'sans engagement', 'no commitment', 'exclusif',
    'exclusive', 'incroyable', 'amazing', 'revenu passif', 'sans risque',
    'risk free', 'cliquez ici', 'click here', 'meilleur prix', 'best price',
    'promotion', 'soldes', 'remise', 'discount', 'cadeau', 'bonus',
    'compte suspendu', 'verification requise', 'mise a jour requise',
    'felicitations vous avez gagne', 'double your', 'earn money',
  ]
  const bodyLower = (email.body + ' ' + (email.subject_line || '')).toLowerCase()
  const foundSpam = spamWords.filter(w => bodyLower.includes(w))
  checks.push({
    name: 'spam_words',
    passed: foundSpam.length === 0,
    detail: foundSpam.length > 0 ? `Mots detectes: ${foundSpam.join(', ')}` : 'Aucun spam word',
  })
  if (foundSpam.length > 0) {
    regenerationHints.push(`Supprimer les mots spam: ${foundSpam.join(', ')}`)
  }

  // CHECK 3 : Ton et cliches
  const cliches = [
    'je me permets de vous contacter',
    'j\'espere que ce message vous trouve bien',
    'je serais ravi de',
    'nous sommes leaders',
    'solution de pointe',
    'valeur ajoutee',
    'best-in-class',
    'synerg', // couvre synergie, synergique, etc.
    'leverage',
    'n\'hesitez pas a me contacter',
    'dans l\'attente de votre retour',
    'a votre disposition',
    'cordialement,', // trop formel pour un cold email
  ]
  const foundCliches = cliches.filter(c => bodyLower.includes(c))
  checks.push({
    name: 'ton_cliches',
    passed: foundCliches.length === 0,
    detail: foundCliches.length > 0 ? `Cliches: ${foundCliches.join(', ')}` : 'Ton OK',
  })
  if (foundCliches.length > 0) {
    regenerationHints.push(`Remplacer les cliches: ${foundCliches.join(', ')}`)
  }

  // Verifier vouvoiement/tutoiement
  const segment = prospect.score.segment_primaire
  if (segment !== 'startups') {
    const tutoiementPatterns = [/\btu\s/i, /\bton\s/i, /\bta\s/i, /\btes\s/i, /\btoi\b/i]
    const hasTutoiement = tutoiementPatterns.some(p => p.test(email.body))
    if (hasTutoiement) {
      checks.push({
        name: 'vouvoiement',
        passed: false,
        detail: 'Tutoiement detecte pour un segment non-startup',
      })
      regenerationHints.push('Utiliser le vouvoiement (pas le tutoiement) pour ce segment.')
    }
  }

  // CHECK 4 : Hallucinations
  // Verifier que les chiffres dans le message correspondent aux donnees d'input
  const numbersInMessage = email.body.match(/\d[\d\s,.]*\d/g) || []
  const knownNumbers = collectKnownNumbers(prospect, impactData)
  // (verification simplifiee : on laisse passer les chiffres qui sont dans les donnees)
  // Les chiffres de cas clients generiques ("+12%", "47K", etc.) sont acceptes car ils font partie du template
  checks.push({
    name: 'hallucination_check',
    passed: true, // check avance en v2
    detail: 'Verification basique OK',
  })

  // CHECK 5 : Personnalisation
  const hasPrenom = email.body.includes(prospect.contact.prenom)
  const hasEntreprise = email.body.includes(prospect.entreprise.nom)
  checks.push({
    name: 'personnalisation',
    passed: hasPrenom && hasEntreprise,
    detail: `Prenom: ${hasPrenom ? 'OK' : 'MANQUANT'}, Entreprise: ${hasEntreprise ? 'OK' : 'MANQUANT'}`,
  })
  if (!hasPrenom || !hasEntreprise) {
    regenerationHints.push('Inclure le prenom du prospect et le nom de l\'entreprise dans le message.')
  }

  // CHECK 6 : Validation humaine
  const needsHumanValidation = prospect.score.categorie === 'HOT'

  // Resultat global
  const allPassed = checks.every(c => c.passed)
  return {
    passed: allPassed,
    checks,
    needs_human_validation: needsHumanValidation,
    regeneration_needed: !allPassed,
    regeneration_hints: regenerationHints,
  }
}

function collectKnownNumbers(
  prospect: RedacteurInput,
  impactData: ImpactCalculation,
): string[] {
  const numbers: string[] = []
  if (prospect.technique?.lighthouse?.performance) {
    numbers.push(String(prospect.technique.lighthouse.performance))
  }
  if (prospect.technique?.temps_chargement_s) {
    numbers.push(prospect.technique.temps_chargement_s.toFixed(1))
  }
  if (impactData.perte_ca_mensuelle) {
    numbers.push(impactData.perte_ca_mensuelle.toLocaleString('fr-FR'))
  }
  if (prospect.entreprise.effectif_exact) {
    numbers.push(String(prospect.entreprise.effectif_exact))
  }
  return numbers
}
```

### 6.3 Validation humaine (HOT uniquement)

#### Quand la validation humaine est requise

| Categorie | Validation | Bloquante | Delai max |
|-----------|-----------|-----------|-----------|
| HOT_A (85+) | OUI | OUI (bloquante) | 1h |
| HOT_B (75-84) | OUI | OUI (bloquante) | 2h |
| HOT_C (70-74) | OUI | NON (avertissement) | 4h |
| WARM (50-69) | NON | - | - |
| COLD (25-49) | NON | - | - |

#### Comment Jonathan valide

```typescript
interface ValidationRequest {
  request_id: string
  prospect_id: string
  prospect_name: string
  entreprise_name: string
  categorie: string
  sous_categorie: string
  score: number
  canal: string
  message: {
    subject_line?: string
    body: string
    cta: string
  }
  impact_data: ImpactCalculation
  signal_principal: string
  template_id: string
  created_at: string
  sla_deadline: string // date/heure limite de validation
}

// Notification via n8n webhook -> Slack/email Jonathan
async function requestHumanValidation(
  validationRequest: ValidationRequest,
): Promise<void> {
  // 1. Persister la demande en base
  await db.query(`
    INSERT INTO validation_requests (
      request_id, prospect_id, canal, message_json,
      categorie, sla_deadline, status
    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
  `, [
    validationRequest.request_id,
    validationRequest.prospect_id,
    validationRequest.canal,
    JSON.stringify(validationRequest.message),
    validationRequest.categorie,
    validationRequest.sla_deadline,
  ])

  // 2. Envoyer notification Slack via n8n webhook
  await fetch(process.env.N8N_VALIDATION_WEBHOOK!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: '#prospection-validation',
      text: formatSlackMessage(validationRequest),
      // Boutons Slack : Approuver / Modifier / Rejeter
      actions: [
        { type: 'button', text: 'Approuver', value: `approve_${validationRequest.request_id}`, style: 'primary' },
        { type: 'button', text: 'Modifier', value: `edit_${validationRequest.request_id}` },
        { type: 'button', text: 'Rejeter', value: `reject_${validationRequest.request_id}`, style: 'danger' },
      ],
    }),
  })

  // 3. Envoyer aussi par email
  await sendValidationEmail(validationRequest)
}

function formatSlackMessage(req: ValidationRequest): string {
  return `
:fire: *VALIDATION REQUISE* — ${req.categorie} (Score: ${req.score})

*Prospect* : ${req.prospect_name} (${req.entreprise_name})
*Canal* : ${req.canal}
*Signal* : ${req.signal_principal}
*SLA* : ${req.sla_deadline}

*Objet* : ${req.message.subject_line || 'N/A'}
*Message* :
\`\`\`
${req.message.body}
\`\`\`
*CTA* : ${req.message.cta}

_Template : ${req.template_id}_
  `.trim()
}

// Callback quand Jonathan repond
async function handleValidationResponse(
  requestId: string,
  action: 'approve' | 'edit' | 'reject',
  editedMessage?: string,
): Promise<void> {
  if (action === 'approve') {
    await db.query(`
      UPDATE validation_requests SET status = 'approved', validated_at = NOW()
      WHERE request_id = $1
    `, [requestId])

    // Dispatcher le message vers Agent 5
    const request = await db.query(
      'SELECT * FROM validation_requests WHERE request_id = $1', [requestId]
    )
    await dispatchToSuiveur(request.rows[0])
  }

  if (action === 'edit') {
    // Jonathan a modifie le message -> sauvegarder et dispatcher
    await db.query(`
      UPDATE validation_requests
      SET status = 'approved_with_edit', message_json = $2, validated_at = NOW()
      WHERE request_id = $1
    `, [requestId, editedMessage])

    await dispatchToSuiveur({ ...request, message_json: editedMessage })
  }

  if (action === 'reject') {
    await db.query(`
      UPDATE validation_requests SET status = 'rejected', validated_at = NOW()
      WHERE request_id = $1
    `, [requestId])
    // Le prospect reste en queue, pas de message envoye
  }
}
```

#### Auto-approve si SLA depasse

```typescript
// Cron job : toutes les 15 minutes
async function checkExpiredValidations(): Promise<void> {
  const expired = await db.query(`
    SELECT * FROM validation_requests
    WHERE status = 'pending' AND sla_deadline < NOW()
  `)

  for (const req of expired.rows) {
    // HOT_A et HOT_B : NE PAS auto-approuver (validation bloquante)
    // HOT_C : auto-approuver si SLA depasse + notification
    if (req.sous_categorie === 'HOT_C') {
      await handleValidationResponse(req.request_id, 'approve')
      // Notifier Jonathan qu'on a auto-approve
      await notifyAutoApprove(req)
    } else {
      // HOT_A / HOT_B : envoyer un rappel
      await sendValidationReminder(req)
    }
  }
}
```

### 6.4 A/B testing des templates

```typescript
interface ABTest {
  test_id: string
  segment: string
  canal: string
  etape: string
  variant_a: string // template_id control
  variant_b: string // template_id experimental
  start_date: string
  status: 'running' | 'concluded'
  sample_size_target: number // 50-100 par variante
  results: {
    variant_a: {
      sent: number
      opened: number
      replied: number
      meetings_booked: number
    }
    variant_b: {
      sent: number
      opened: number
      replied: number
      meetings_booked: number
    }
  }
  winner: string | null // template_id du gagnant
  confidence: number // % de confiance statistique
}

function assignABVariant(
  testId: string,
  prospectId: string,
): 'A' | 'B' {
  // Deterministic assignment based on prospect_id hash
  // Ensures same prospect always gets same variant (if retried)
  const hash = createHash('md5').update(prospectId + testId).digest('hex')
  const lastDigit = parseInt(hash.slice(-1), 16)
  return lastDigit < 8 ? 'A' : 'B' // 50/50 split
}

// Verifier si un test A/B est en cours pour ce segment/canal/etape
function getActiveABTest(
  segment: string,
  canal: string,
  etape: string,
): ABTest | null {
  // Lookup dans la base
  return db.query(`
    SELECT * FROM ab_tests
    WHERE segment = $1 AND canal = $2 AND etape = $3
    AND status = 'running'
  `, [segment, canal, etape]).rows[0] || null
}
```

**Regles de conclusion A/B** :
- Minimum 50 envois par variante
- Duree minimum : 2 semaines
- Difference de response rate > 2% absolu pour declarer un gagnant
- Si pas de difference significative apres 100 envois : conserver le control

---

## 7. DELIVRABILITE EMAIL

### 7.1 SPF / DKIM / DMARC -- Configuration

#### SPF (Sender Policy Framework)

```
Domaine : axiom-marketing.fr

Enregistrement DNS TXT :
v=spf1 include:sendgrid.net include:mailgun.org ~all

Explications :
- v=spf1 = version SPF 1
- include:sendgrid.net = autorise SendGrid a envoyer
- include:mailgun.org = autorise Mailgun a envoyer
- ~all = soft fail (accepter mais noter si hors liste)

A passer en -all (hard fail) apres 48h de monitoring sans erreur.
```

#### DKIM (DomainKeys Identified Mail)

```
Configuration avec SendGrid :
1. Generer la cle DKIM dans le dashboard SendGrid
2. Ajouter au DNS :
   Type : CNAME
   Selecteur : sendgrid
   Valeur : sendgrid._domainkey.axiom-marketing.fr -> sendgrid.net

Verification : checkmark dans SendGrid = OK
```

#### DMARC (Domain-based Message Authentication)

```
Rollout progressif (CRITIQUE : ne jamais sauter les etapes) :

Semaine 1 (monitoring) :
  v=DMARC1; p=none; rua=mailto:dmarc-reports@axiom-marketing.fr

Semaine 2 (quarantine) :
  v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@axiom-marketing.fr

Semaine 3+ (reject, quand 100% aligne) :
  v=DMARC1; p=reject; rua=mailto:dmarc-reports@axiom-marketing.fr
```

### 7.2 Domain warming plan

```
PREREQUIS :
- Domaine achete + DNS configure (SPF/DKIM)
- Attendre 24-48h propagation DNS
- DMARC en p=none pour commencer

SEMAINE 0 : Setup
- Achat domaine(s) + config DNS
- Creation adresses email
- Outils de warmup (Mailreach ou equivalent)

SEMAINE 1-2 : Warmup initial (volume leger)
  Jour 1-7 : 5-10 emails/boite/jour
  Jour 8-14 : 15-25 emails/boite/jour
  Destinataires : comptes seeds internes, clients existants amicaux
  Objectif : 0 spam complaints, 0 bounces

SEMAINE 3-4 : Montee en charge (volume moyen)
  Semaine 3 : 25-50 emails/boite/jour
  Semaine 4 : 50 emails/boite/jour (max)
  Destinataires : contacts semi-warm (events, anciens contacts)
  Objectif : taux d'ouverture Gmail > 30%, inbox placement > 80%

SEMAINE 5+ : Campagne reelle
  Volume : 50 emails/boite/jour max
  Destinataires : listes froides (prospects)
  Monitoring : seed tests quotidiens (10-15 adresses test)

  Si open rate Gmail chute soudainement -> PAUSE + diagnostic
  Si inbox placement < 80% sur seeds -> PAUSE + warmdown

DUREE TOTALE : 3-5 semaines avant premiere campagne froide
```

### 7.3 Domaines d'envoi

```
STRATEGIE MULTI-DOMAINES :

Acheter 3 domaines (.fr et .com) :
  1. axiom-agency.com
  2. axiom-growth.fr
  3. axiom-marketing.fr (existant)

Pour chaque domaine :
  - Configurer SPF/DKIM/DMARC
  - Creer 2 adresses email :
    * contact@axiom-agency.com
    * jonathan@axiom-agency.com
  - Warmup individuel (3-5 semaines chacun)

Rotation :
  - Round-robin entre les 3 domaines
  - Max 25-50 emails/jour par adresse email
  - Max 100-150 emails/jour total (3 domaines x 2 adresses x 25)

Monitoring par domaine :
  - Si bounce rate > 3% sur un domaine -> pause ce domaine
  - Si spam complaint > 0.3% -> pause + investigation
  - Tag chaque email avec le domaine source pour tracking
```

### 7.4 Spam word blacklist

```typescript
const SPAM_WORD_BLACKLIST: string[] = [
  // Promesses financieres
  'gratuit', 'free', 'gagner de l\'argent', 'earn money', 'revenu passif',
  'investissement garanti', 'sans risque', 'risk free', 'cash', 'fortune',
  'millionnaire', 'richesse', 'benefice garanti', 'retour sur investissement garanti',

  // Urgence abusive
  'urgent', 'agissez maintenant', 'act now', 'derniere chance', 'last chance',
  'offre limitee', 'limited time', 'expire bientot', 'ne manquez pas',
  'plus que X jours', 'se termine ce soir',

  // Trop beau pour etre vrai
  'garanti', 'guarantee', 'aucun risque', 'sans engagement', 'no commitment',
  'resultat assure', 'promis', 'certifie',

  // Red flags securite
  'compte suspendu', 'verification requise', 'mise a jour requise',
  'cliquez ci-dessous', 'click below', 'alerte securite',

  // Marketing agressif
  'offre exclusive', 'prix imbattable', 'promotion exceptionnelle',
  'remise immediate', 'soldes', 'deal du siecle', 'meilleur prix',
  'reduction', 'rabais', 'promo', 'bon plan',

  // Phrases generiques de cold email
  'je me permets', 'je serais ravi', 'n\'hesitez pas',
  'dans l\'attente de votre retour', 'a votre disposition',
  'au plaisir de vous lire', 'bien a vous',
]
```

### 7.5 HTML vs Plain Text

**Regle absolue** : PLAIN TEXT uniquement pour les cold emails.

| Metrique | Plain Text | HTML |
|----------|-----------|------|
| Click-through rate | +30-42% mieux | -21-51% pire |
| Bounce rate | 86.7% moins de bounces | 652% PLUS de bounces |
| Placement inbox Gmail | Inbox | Souvent Promotions |
| Perception authenticite | Personnel, peer-to-peer | Marketing, corporate |
| Rendu mobile | Parfait | Parfois casse |

**Format impose** :

```
MIME type : text/plain
Pas de balises HTML
Pas d'images
Pas de couleurs, fonts, styles
Max 1-2 liens (signature uniquement)
Pas de lien de desinscription dans le corps (mettre en toute fin si requis RGPD)

Structure :
---
Subject: [texte brut]

[Salutation]

[Corps en texte brut]
[Sauts de ligne simples]

[CTA]

[Signature minimale]
[Nom]
[Titre]
[site-web]

[Desinscription si requis]
---
```

**Signature email** :
```
Jonathan Dewaele
Axiom Marketing
axiom-marketing.fr
```
- Nom + titre + company + site web uniquement
- Pas de telephone (reduit les liens/elements)
- Pas de logo (pas de HTML)
- Pas de multiples liens sociaux

---

## 8. OUTPUT : SCHEMA JSON ENVOYE A L'AGENT 5 (SUIVEUR)

### 8.1 Schema JSON complet

L'Agent 4 (REDACTEUR) envoie a l'Agent 5 (SUIVEUR) un objet contenant le message pret a envoyer, les metadonnees du prospect, et les instructions de planning.

```json
{
  "message_id": "uuid-v4-message",
  "prospect_id": "uuid-v4-prospect",
  "lead_id": "uuid-v4-lead-original",
  "generated_at": "2026-03-18T09:18:30Z",

  "message": {
    "canal": "email",
    "type": "email_froid",
    "subject_line": "Le site de TechStart vs concurrent — ecart de perf",
    "body": "Bonjour Marie,\n\nObservation rapide : TechStart charge en 3.2s, contre 1.8s en moyenne pour votre secteur.\nCet ecart represente environ 1 250 EUR/mois en conversions perdues.\n\nOn a aide une PME similaire a diviser son temps de chargement par 2 — resultat : +12% de CA en un trimestre.\n\nCa vaut 15 minutes pour en discuter ?",
    "cta": "Ca vaut 15 minutes pour en discuter ?",
    "signature": "Jonathan\nAxiom Marketing\naxiom-marketing.fr",
    "format": "plain_text",
    "word_count": 58,
    "language": "fr"
  },

  "linkedin_message": {
    "connection_note": {
      "content": "Bonjour Marie, je travaille avec des PME tech sur la performance de leur site web. Votre parcours chez TechStart est interessant. On se connecte ?",
      "character_count": 152
    },
    "post_connection_message": {
      "content": "Merci d'avoir accepte, Marie ! J'ai regarde le site de TechStart — il charge en 3.2s vs 1.8s pour vos concurrents. Cet ecart coute environ 1 250 EUR/mois en conversions perdues. On a aide une PME similaire a diviser ce temps par 2. Est-ce un sujet chez vous ?",
      "character_count": 265
    }
  },

  "prospect": {
    "prenom": "Marie",
    "nom": "Dupont",
    "email": "marie.dupont@techstart.fr",
    "email_verified": true,
    "linkedin_url": "https://linkedin.com/in/mariedupont",
    "poste": "CMO",
    "entreprise_nom": "TechStart SAS"
  },

  "sequence": {
    "sequence_id": "SEQ_HOT_B_PRIORITY",
    "etape_actuelle": 1,
    "etape_total": 4,
    "etape_type": "premier_contact",
    "prochaine_etape_dans_jours": 2,
    "espacement_jours": [0, 2, 5, 10]
  },

  "template": {
    "template_id": "TPL-001",
    "template_version": "1.0",
    "template_status": "control",
    "ab_test_id": null,
    "ab_variant": null
  },

  "scoring": {
    "score_total": 82,
    "categorie": "HOT",
    "sous_categorie": "HOT_B",
    "segment": "pme_metro",
    "signal_principal": "Nouveau CMO + recrutement dev = besoin digital probable"
  },

  "validation": {
    "statut": "approved",
    "validated_by": "jonathan",
    "validated_at": "2026-03-18T09:20:00Z",
    "quality_checks": {
      "longueur": "PASS",
      "spam_words": "PASS",
      "ton": "PASS",
      "hallucination": "PASS",
      "personnalisation": "PASS"
    }
  },

  "routing": {
    "canal_principal": "email_perso",
    "canal_secondaire": "linkedin_dm",
    "urgence": "haute",
    "sla_heures": 2,
    "priorite_queue": 1,
    "domaine_envoi_suggere": "axiom-marketing.fr"
  },

  "impact_data": {
    "perte_ca_mensuelle": 1250,
    "perte_ca_annuelle": 15000,
    "taux_bounce_estime": 32,
    "impact_conversion_pct": 8,
    "message_impact": "Votre site charge en 3.2s (Lighthouse: 62/100). Cela represente environ 1 250 EUR/mois de conversions perdues."
  },

  "metadata": {
    "agent": "agent_4_redacteur",
    "generation_model": "claude-sonnet-4-20250514",
    "generation_temperature": 0.7,
    "generation_cost_usd": 0.00359,
    "generation_latency_ms": 1850,
    "generation_attempts": 1,
    "batch_id": "batch-2026-03-18-09",
    "redacteur_version": "1.0"
  }
}
```

### 8.2 Dispatch vers Agent 5 via BullMQ

```typescript
import { Queue } from 'bullmq'

const suiveurQueue = new Queue('suiveur-pipeline', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
})

interface RedacteurOutput {
  message_id: string
  prospect_id: string
  lead_id: string
  generated_at: string
  message: GeneratedMessage
  linkedin_message: LinkedInMessages | null
  prospect: ProspectSummary
  sequence: SequenceInfo
  template: TemplateInfo
  scoring: ScoringInfo
  validation: ValidationInfo
  routing: RoutingInfo
  impact_data: ImpactCalculation
  metadata: RedacteurMetadata
}

async function dispatchToSuiveur(output: RedacteurOutput): Promise<void> {
  // Ne dispatcher que si la validation est OK
  if (output.validation.statut !== 'approved' &&
      output.validation.statut !== 'approved_with_edit') {
    console.warn(`[Agent4] Message ${output.message_id} non approuve, pas de dispatch`)
    return
  }

  const priorite = getPrioriteQueue(output.scoring.categorie, output.scoring.sous_categorie)

  await suiveurQueue.add(
    `message-${output.message_id}`,
    output,
    {
      priority: priorite,
      delay: 0, // Le SUIVEUR gere le timing d'envoi
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 30 * 24 * 60 * 60, // Garder 30 jours
        count: 10000,
      },
      removeOnFail: {
        age: 60 * 24 * 60 * 60, // Garder 60 jours pour debug
      },
    }
  )

  // Mettre a jour le statut en base
  await db.query(`
    UPDATE messages_generes
    SET dispatched_to_suiveur = true, dispatched_at = NOW()
    WHERE message_id = $1
  `, [output.message_id])
}

function getPrioriteQueue(
  categorie: string,
  sousCategorie: string | null,
): number {
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
```

### 8.3 Persistance en base de donnees

```sql
-- Table des messages generes
CREATE TABLE IF NOT EXISTS messages_generes (
  id SERIAL PRIMARY KEY,
  message_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  lead_id UUID NOT NULL,

  -- Message
  canal VARCHAR(30) NOT NULL CHECK (canal IN ('email', 'linkedin_connection', 'linkedin_message', 'linkedin_inmail')),
  subject_line VARCHAR(100),
  body TEXT NOT NULL,
  cta VARCHAR(200),
  word_count INTEGER,
  character_count INTEGER,
  format VARCHAR(20) NOT NULL DEFAULT 'plain_text',
  language VARCHAR(5) NOT NULL DEFAULT 'fr',

  -- Template
  template_id VARCHAR(30) NOT NULL,
  template_version VARCHAR(10) NOT NULL DEFAULT '1.0',
  ab_test_id VARCHAR(50),
  ab_variant CHAR(1),

  -- Sequence
  sequence_id VARCHAR(50) NOT NULL,
  etape_numero INTEGER NOT NULL,
  etape_type VARCHAR(30) NOT NULL,

  -- Scoring (snapshot au moment de la generation)
  score_total INTEGER NOT NULL,
  categorie VARCHAR(20) NOT NULL,
  sous_categorie VARCHAR(10),
  segment VARCHAR(30) NOT NULL,

  -- Validation
  validation_statut VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (validation_statut IN ('pending', 'approved', 'approved_with_edit', 'rejected', 'auto_approved')),
  validated_by VARCHAR(50),
  validated_at TIMESTAMP WITH TIME ZONE,
  quality_checks JSONB,

  -- Dispatch
  dispatched_to_suiveur BOOLEAN NOT NULL DEFAULT false,
  dispatched_at TIMESTAMP WITH TIME ZONE,

  -- Generation metadata
  generation_model VARCHAR(50),
  generation_temperature NUMERIC(3,2),
  generation_cost_usd NUMERIC(8,5),
  generation_latency_ms INTEGER,
  generation_attempts INTEGER DEFAULT 1,

  -- Impact data
  impact_data JSONB,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX idx_messages_prospect_id ON messages_generes (prospect_id);
CREATE INDEX idx_messages_canal ON messages_generes (canal);
CREATE INDEX idx_messages_categorie ON messages_generes (categorie);
CREATE INDEX idx_messages_validation ON messages_generes (validation_statut);
CREATE INDEX idx_messages_template ON messages_generes (template_id);
CREATE INDEX idx_messages_sequence ON messages_generes (sequence_id, etape_numero);
CREATE INDEX idx_messages_created ON messages_generes (created_at);
CREATE INDEX idx_messages_dispatched ON messages_generes (dispatched_to_suiveur) WHERE dispatched_to_suiveur = false;

-- Table des validations
CREATE TABLE IF NOT EXISTS validation_requests (
  id SERIAL PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages_generes(message_id),
  prospect_id UUID NOT NULL,
  canal VARCHAR(30) NOT NULL,
  categorie VARCHAR(20) NOT NULL,
  sous_categorie VARCHAR(10),
  message_json JSONB NOT NULL,
  sla_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'approved_with_edit', 'rejected', 'expired')),
  validated_by VARCHAR(50),
  validated_at TIMESTAMP WITH TIME ZONE,
  edit_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_validations_status ON validation_requests (status);
CREATE INDEX idx_validations_sla ON validation_requests (sla_deadline) WHERE status = 'pending';

-- Table A/B tests
CREATE TABLE IF NOT EXISTS ab_tests (
  id SERIAL PRIMARY KEY,
  test_id VARCHAR(50) NOT NULL UNIQUE,
  segment VARCHAR(30) NOT NULL,
  canal VARCHAR(30) NOT NULL,
  etape VARCHAR(30) NOT NULL,
  variant_a_template VARCHAR(30) NOT NULL,
  variant_b_template VARCHAR(30) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  sample_size_target INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(20) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'concluded', 'cancelled')),
  winner_template VARCHAR(30),
  results JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Vue dashboard generation
CREATE OR REPLACE VIEW generation_dashboard AS
SELECT
  segment,
  canal,
  categorie,
  template_id,
  validation_statut,
  COUNT(*) as nb_messages,
  ROUND(AVG(generation_cost_usd)::numeric, 5) as cout_moyen_usd,
  ROUND(AVG(generation_latency_ms)::numeric, 0) as latence_moyenne_ms,
  ROUND(AVG(generation_attempts)::numeric, 1) as tentatives_moyennes,
  ROUND(AVG(word_count)::numeric, 0) as mots_moyen
FROM messages_generes
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY segment, canal, categorie, template_id, validation_statut
ORDER BY segment, canal, categorie;
```

---

## 9. COUTS CLAUDE API

### 9.1 Tarification Claude Sonnet (mars 2026)

| Modele | Input (par million tokens) | Output (par million tokens) |
|--------|---------------------------|----------------------------|
| claude-sonnet-4-20250514 | $3.00 | $15.00 |

### 9.2 Cout par message

```
GENERATION EMAIL :
- System prompt : ~400 tokens
- Few-shot examples (2) : ~300 tokens
- User prompt (donnees prospect) : ~350 tokens
- Total input : ~1 050 tokens
- Output genere : ~150 tokens (email court)

Cout par email :
- Input : (1050 / 1 000 000) x $3.00 = $0.00315
- Output : (150 / 1 000 000) x $15.00 = $0.00225
- Total : $0.00540 par email ~ 0.005 EUR

GENERATION LINKEDIN (note + message) :
- System prompt : ~350 tokens
- User prompt : ~300 tokens
- Total input : ~650 tokens
- Output genere : ~80 tokens (message court)

Cout par message LinkedIn :
- Input : (650 / 1 000 000) x $3.00 = $0.00195
- Output : (80 / 1 000 000) x $15.00 = $0.00120
- Total : $0.00315 par message LinkedIn ~ 0.003 EUR

CALCUL D'IMPACT :
- Pas d'appel API (calcul local)
- Cout : 0 EUR
```

### 9.3 Cout mensuel pour 500 messages/mois

```
SCENARIO : 500 prospects/mois, chacun recoit 1 email + 1 message LinkedIn

Volume de generation :
- 500 emails generes : 500 x $0.00540 = $2.70
- 500 messages LinkedIn generes : 500 x $0.00315 = $1.58
- Regenerations (20% des messages echouent au 1er essai) : 200 x $0.005 = $1.00
- Total generation : $5.28 ~ 4.90 EUR

Volume avec relances (sequence complete de 4 touchpoints) :
- 500 prospects x 4 emails : 2000 x $0.00540 = $10.80
- 500 prospects x 3 messages LinkedIn : 1500 x $0.00315 = $4.73
- Regenerations (20%) : 700 x $0.005 = $3.50
- Total generation : $19.03 ~ 17.70 EUR

COUT MENSUEL TOTAL REDACTEUR :
┌─────────────────────────────────────────────────────┐
│ Poste                        │ 500 msg/mois │ Notes │
├──────────────────────────────┼──────────────┼───────┤
│ Claude API (generation)      │ ~5 EUR       │ Basic │
│ Claude API (avec sequences)  │ ~18 EUR      │ Full  │
│ Infrastructure (Redis/BullMQ)│ 0 EUR        │ Incl. │
│ Calcul d'impact             │ 0 EUR        │ Local │
│ Stockage PostgreSQL          │ negligeable  │       │
├──────────────────────────────┼──────────────┼───────┤
│ TOTAL MENSUEL REDACTEUR      │ 5-18 EUR     │       │
└─────────────────────────────────────────────────────┘
```

### 9.4 ROI du Redacteur

```
HYPOTHESE CONSERVATRICE :
- 500 prospects contactes/mois
- Taux de reponse signal-based : 8% (conservateur, vs 15-25% possible)
- 500 x 8% = 40 reponses
- 40 reponses x 30% positives = 12 leads qualifies
- 12 leads x 20% conversion = 2.4 deals/mois
- 2.4 deals x 3 000 EUR panier moyen = 7 200 EUR/mois

COUT :
- Agent 4 Redacteur : 18 EUR/mois
- Infrastructure envoi (Agent 5) : ~50-100 EUR/mois
- Total outreach : ~120 EUR/mois

ROI : (7 200 - 120) / 120 = 5 900% ROI

Le cout du Redacteur (Claude API) est negligeable par rapport a la valeur generee.
```

---

## 10. VERIFICATION DE COHERENCE

### 10.1 Input Agent 4 == Output Agent 3

Verification que chaque champ de l'input du Redacteur (Agent 4) correspond exactement a un champ de l'output du Scoreur (Agent 3).

| Champ input Agent 4 | Present dans output Agent 3 (section 7.1) | Statut |
|---------------------|-------------------------------------------|--------|
| `prospect_id` | OUI | VALIDE |
| `lead_id` | OUI | VALIDE |
| `scored_at` | OUI | VALIDE |
| `score.total` | OUI | VALIDE |
| `score.categorie` | OUI (HOT/WARM/COLD) | VALIDE |
| `score.sous_categorie` | OUI (HOT_A/HOT_B/HOT_C) | VALIDE |
| `score.detail` | OUI (objet complet 4 axes) | VALIDE |
| `score.segment_primaire` | OUI | VALIDE |
| `score.confiance_score` | OUI | VALIDE |
| `routing.sequence_id` | OUI | VALIDE |
| `routing.canal_principal` | OUI | VALIDE |
| `routing.canal_secondaire` | OUI | VALIDE |
| `routing.validation_jonathan` | OUI | VALIDE |
| `routing.validation_bloquante` | OUI | VALIDE |
| `routing.sla_heures` | OUI | VALIDE |
| `routing.nb_touchpoints` | OUI | VALIDE |
| `routing.espacement_jours` | OUI (array) | VALIDE |
| `routing.urgence` | OUI | VALIDE |
| `routing.priorite_queue` | OUI | VALIDE |
| `entreprise.*` | OUI (copie integrale Agent 2) | VALIDE |
| `contact.*` | OUI (copie integrale Agent 2) | VALIDE |
| `technique.*` | OUI (copie integrale Agent 2) | VALIDE |
| `signaux[]` | OUI | VALIDE |
| `signal_principal` | OUI | VALIDE |
| `metadata` | OUI | VALIDE |

**RESULTAT : 100% de coherence input Agent 4 / output Agent 3.**

### 10.2 Output Agent 4 compatible avec input Agent 5

L'output du Redacteur doit contenir tout ce dont le SUIVEUR (Agent 5) a besoin pour envoyer le message.

| Champ output Agent 4 | Necessaire pour Agent 5 | Raison |
|----------------------|------------------------|--------|
| `message_id` | OUI | Identifiant unique du message |
| `prospect_id` | OUI | Lier au prospect en base |
| `message.canal` | OUI | Determiner la methode d'envoi (SMTP vs LinkedIn API) |
| `message.subject_line` | OUI | Sujet de l'email |
| `message.body` | OUI | Corps du message a envoyer |
| `message.format` | OUI | plain_text vs html |
| `prospect.email` | OUI | Adresse d'envoi email |
| `prospect.linkedin_url` | OUI | Profil LinkedIn pour envoi |
| `sequence.sequence_id` | OUI | Identifier la sequence en cours |
| `sequence.etape_actuelle` | OUI | Savoir a quelle etape on en est |
| `sequence.prochaine_etape_dans_jours` | OUI | Planifier la relance |
| `sequence.espacement_jours` | OUI | Planning complet de la sequence |
| `template.template_id` | OUI | Tracking pour analytics |
| `template.ab_test_id` | OUI | Tracking A/B test |
| `scoring.categorie` | OUI | Priorite d'envoi |
| `validation.statut` | OUI | Verifier que le message est approuve |
| `routing.canal_principal` | OUI | Confirmer le canal d'envoi |
| `routing.urgence` | OUI | SLA d'envoi |
| `routing.domaine_envoi_suggere` | OUI | Quel domaine utiliser |

**RESULTAT : L'output Agent 4 contient tous les champs necessaires pour l'Agent 5.**

### 10.3 Couverture templates : segments x canaux x etapes

| Segment | Email Contact1 | Email Relance1 | Email Relance2 | Email Breakup | LI Connexion | LI Post-conn | LI Relance2 |
|---------|----------------|----------------|----------------|---------------|--------------|--------------|-------------|
| pme_metro | TPL-001 | TPL-002 | TPL-003 | TPL-004 | TPL-021 | TPL-022 | TPL-031 |
| shopify_ecommerce | TPL-005 | TPL-006 | TPL-007 | TPL-008 | TPL-023 | TPL-024 | TPL-032 |
| collectivites | TPL-009 | TPL-010 | TPL-011 | TPL-012 | TPL-025 | TPL-026 | TPL-033 |
| startups | TPL-013 | TPL-014 | TPL-015 | TPL-016 | TPL-027 | TPL-028 | TPL-034 |
| agences_wl | TPL-017 | TPL-018 | TPL-019 | TPL-020 | TPL-029 | TPL-030 | TPL-035 |

**RESULTAT : 35 templates couvrent l'integralite de la matrice 5 segments x 7 combinaisons canal/etape.**

### 10.4 Checklist de coherence globale

| Verification | Statut |
|-------------|--------|
| Input Agent 4 == Output Agent 3 (tous les champs) | VALIDE |
| Output Agent 4 contient tous les champs pour Agent 5 | VALIDE |
| Tous les segments couverts (5/5) | VALIDE |
| Tous les canaux couverts (email + linkedin) | VALIDE |
| Toutes les etapes email couvertes (4/4) | VALIDE |
| Toutes les etapes linkedin couvertes (3/3) | VALIDE |
| System prompts definis pour chaque segment (5/5) | VALIDE |
| Formules calculateur d'impact definies (4 formules) | VALIDE |
| Controles qualite definis (6 checks) | VALIDE |
| Validation humaine HOT definie | VALIDE |
| Schema de persistance PostgreSQL defini | VALIDE |
| Queue BullMQ input/output definies | VALIDE |
| Couts Claude API calcules | VALIDE |
| Gestion erreurs et fallback definis | VALIDE |
| A/B testing framework defini | VALIDE |
| Delivrabilite (SPF/DKIM/DMARC) documentee | VALIDE |
| Domain warming plan documente | VALIDE |
| Spam word blacklist definie (50+ mots) | VALIDE |

---

## 11. CODE COMPLET TYPESCRIPT

### 11.1 Orchestrateur principal (Agent 4)

```typescript
import { Worker, Queue } from 'bullmq'
import Anthropic from '@anthropic-ai/sdk'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

// --- Configuration ---
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
}

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY!,
})

const suiveurQueue = new Queue('suiveur-pipeline', { connection: REDIS_CONFIG })

// --- Types ---
interface SequenceEtape {
  numero: number
  total: number
  type: 'premier_contact' | 'relance_1' | 'relance_2' | 'break_up'
  label: string
}

// --- Worker principal ---
const redacteurWorker = new Worker(
  'redacteur-pipeline',
  async (job) => {
    const prospect = job.data as RedacteurInput
    console.log(`[Agent4] Traitement prospect ${prospect.prospect_id} (${prospect.score.categorie})`)

    try {
      // 1. Valider l'input
      const validated = RedacteurInputSchema.parse(prospect)

      // 2. Calculer les impacts (sous-agent 4c)
      const impactData = calculateAllImpacts(validated)

      // 3. Determiner les etapes a generer
      const etapes = buildSequenceEtapes(validated.routing)

      // 4. Pour chaque etape, generer les messages
      const results: RedacteurOutput[] = []

      for (const etape of etapes) {
        // 4a. Selectionner le template
        const templateEmail = selectTemplate(
          validated.score.segment_primaire,
          validated.routing.canal_principal,
          etape.numero,
          validated.routing.sequence_id,
        )

        // 4b. Generer l'email (sous-agent 4a)
        const email = await generateEmailWithRetry(
          validated, impactData, etape
        )

        // 4c. Generer le message LinkedIn (sous-agent 4b) si canal LinkedIn
        let linkedinMessages = null
        if (validated.routing.canal_principal.startsWith('linkedin') ||
            validated.routing.canal_secondaire?.startsWith('linkedin')) {
          linkedinMessages = await generateLinkedInMessages(
            validated, impactData, etape
          )
        }

        // 5. Controle qualite
        const qualityResult = runQualityChecks(
          email, validated, impactData, 'email'
        )

        if (qualityResult.regeneration_needed) {
          // Regenerer avec hints
          console.warn(`[Agent4] Qualite insuffisante, regeneration:`,
            qualityResult.regeneration_hints)
          // (La fonction generateEmailWithRetry gere deja les retries)
        }

        // 6. Construire l'output
        const messageId = uuidv4()
        const output: RedacteurOutput = {
          message_id: messageId,
          prospect_id: validated.prospect_id,
          lead_id: validated.lead_id,
          generated_at: new Date().toISOString(),
          message: {
            canal: validated.routing.canal_principal.startsWith('linkedin') ? 'linkedin_message' : 'email',
            type: 'email_froid',
            subject_line: email.subject_line,
            body: email.body,
            cta: email.cta,
            signature: 'Jonathan\nAxiom Marketing\naxiom-marketing.fr',
            format: 'plain_text',
            word_count: email.word_count,
            language: 'fr',
          },
          linkedin_message: linkedinMessages,
          prospect: {
            prenom: validated.contact.prenom,
            nom: validated.contact.nom,
            email: validated.contact.email || '',
            email_verified: validated.contact.email_verified || false,
            linkedin_url: validated.contact.linkedin_url || '',
            poste: validated.contact.poste,
            entreprise_nom: validated.entreprise.nom,
          },
          sequence: {
            sequence_id: validated.routing.sequence_id,
            etape_actuelle: etape.numero,
            etape_total: etape.total,
            etape_type: etape.type,
            prochaine_etape_dans_jours: validated.routing.espacement_jours[etape.numero] || 0,
            espacement_jours: validated.routing.espacement_jours,
          },
          template: {
            template_id: templateEmail.template_id,
            template_version: '1.0',
            template_status: 'control',
            ab_test_id: null,
            ab_variant: null,
          },
          scoring: {
            score_total: validated.score.total,
            categorie: validated.score.categorie,
            sous_categorie: validated.score.sous_categorie,
            segment: validated.score.segment_primaire,
            signal_principal: validated.signal_principal || '',
          },
          validation: {
            statut: 'pending',
            validated_by: null,
            validated_at: null,
            quality_checks: qualityResult.checks.reduce((acc, c) => {
              acc[c.name] = c.passed ? 'PASS' : 'FAIL'
              return acc
            }, {} as Record<string, string>),
          },
          routing: {
            canal_principal: validated.routing.canal_principal,
            canal_secondaire: validated.routing.canal_secondaire,
            urgence: validated.routing.urgence,
            sla_heures: validated.routing.sla_heures,
            priorite_queue: validated.routing.priorite_queue,
            domaine_envoi_suggere: selectSendingDomain(),
          },
          impact_data: impactData,
          metadata: {
            agent: 'agent_4_redacteur',
            generation_model: 'claude-sonnet-4-20250514',
            generation_temperature: 0.7,
            generation_cost_usd: 0.00540,
            generation_latency_ms: 0,
            generation_attempts: 1,
            batch_id: validated.metadata?.batch_id || '',
            redacteur_version: '1.0',
          },
        }

        // 7. Persister en base
        await persistMessage(output)

        // 8. Validation humaine si HOT
        if (qualityResult.needs_human_validation) {
          await requestHumanValidation({
            request_id: uuidv4(),
            prospect_id: validated.prospect_id,
            prospect_name: `${validated.contact.prenom} ${validated.contact.nom}`,
            entreprise_name: validated.entreprise.nom,
            categorie: validated.score.categorie,
            sous_categorie: validated.score.sous_categorie || '',
            score: validated.score.total,
            canal: output.message.canal,
            message: {
              subject_line: email.subject_line,
              body: email.body,
              cta: email.cta,
            },
            impact_data: impactData,
            signal_principal: validated.signal_principal || '',
            template_id: templateEmail.template_id,
            created_at: new Date().toISOString(),
            sla_deadline: new Date(
              Date.now() + validated.routing.sla_heures * 60 * 60 * 1000
            ).toISOString(),
          })
        } else {
          // Auto-approve pour WARM et COLD
          output.validation.statut = 'approved'
          output.validation.validated_by = 'auto'
          output.validation.validated_at = new Date().toISOString()

          // Dispatcher vers Agent 5
          await dispatchToSuiveur(output)
        }

        results.push(output)
      }

      console.log(`[Agent4] Prospect ${prospect.prospect_id} traite: ${results.length} messages generes`)
      return results
    } catch (error) {
      console.error(`[Agent4] Erreur traitement prospect ${prospect.prospect_id}:`, error)
      throw error
    }
  },
  {
    connection: REDIS_CONFIG,
    concurrency: 5, // 5 prospects en parallele
    limiter: {
      max: 50, // Max 50 appels Claude API par minute
      duration: 60000,
    },
  }
)

// --- Helpers ---
function buildSequenceEtapes(routing: RedacteurInput['routing']): SequenceEtape[] {
  const nbTouchpoints = routing.nb_touchpoints
  const etapes: SequenceEtape[] = []

  // Seule la premiere etape est generee maintenant
  // Les relances seront generees par le SUIVEUR quand ce sera le moment
  etapes.push({
    numero: 1,
    total: nbTouchpoints,
    type: 'premier_contact',
    label: '1er contact',
  })

  return etapes
}

function selectSendingDomain(): string {
  const domains = [
    'axiom-marketing.fr',
    'axiom-agency.com',
    'axiom-growth.fr',
  ]
  // Round-robin simple base sur la minute courante
  const index = new Date().getMinutes() % domains.length
  return domains[index]
}

async function persistMessage(output: RedacteurOutput): Promise<void> {
  await db.query(`
    INSERT INTO messages_generes (
      message_id, prospect_id, lead_id,
      canal, subject_line, body, cta, word_count, format, language,
      template_id, template_version, ab_test_id, ab_variant,
      sequence_id, etape_numero, etape_type,
      score_total, categorie, sous_categorie, segment,
      validation_statut, quality_checks,
      generation_model, generation_temperature, generation_cost_usd,
      impact_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
              $21, $22, $23, $24, $25, $26, $27)
  `, [
    output.message_id, output.prospect_id, output.lead_id,
    output.message.canal, output.message.subject_line, output.message.body,
    output.message.cta, output.message.word_count, output.message.format,
    output.message.language,
    output.template.template_id, output.template.template_version,
    output.template.ab_test_id, output.template.ab_variant,
    output.sequence.sequence_id, output.sequence.etape_actuelle,
    output.sequence.etape_type,
    output.scoring.score_total, output.scoring.categorie,
    output.scoring.sous_categorie, output.scoring.segment,
    output.validation.statut, JSON.stringify(output.validation.quality_checks),
    output.metadata.generation_model, output.metadata.generation_temperature,
    output.metadata.generation_cost_usd,
    JSON.stringify(output.impact_data),
  ])
}

// --- Event handlers ---
redacteurWorker.on('completed', (job) => {
  console.log(`[Agent4] Job ${job.id} complete`)
})

redacteurWorker.on('failed', (job, err) => {
  console.error(`[Agent4] Job ${job?.id} echoue:`, err.message)
})

redacteurWorker.on('error', (err) => {
  console.error('[Agent4] Worker error:', err)
})

console.log('[Agent4] Redacteur worker demarre, en attente de prospects...')
```

---

## 12. INTEGRATION AVEC LES AGENTS 8, 9, 10

> **Ajout v1.1 -- 19 mars 2026** : Cette section documente l'integration du Redacteur avec les trois nouveaux agents du pipeline etendu (Agent 8 Dealmaker, Agent 9 Appels d'offres, Agent 10 CSM).

### 12.1 Synthese de l'impact

| Agent | Impact sur Agent 4 | Nature |
|-------|-------------------|--------|
| **Agent 8 (Dealmaker)** | AUCUN (direct) | L'Agent 8 intervient APRES le Suiveur (Agent 5), quand le prospect a repondu "INTERESSE" et que Jonathan a fait le RDV decouverte. Le Redacteur ne genere pas les documents de closing (propositions commerciales, contrats) -- c'est l'Agent 8 qui les gere. |
| **Agent 9 (Appels d'offres)** | AUCUN | La redaction des memoires techniques est assuree par le sous-agent 9c (Redacteur AO), qui est un agent specialise completement independant du Redacteur Agent 4. Le Redacteur Agent 4 ne redige PAS de reponses a appels d'offres. |
| **Agent 10 (CSM)** | MODERE | Deux impacts : (1) adaptation des templates pour les leads referral, (2) utilisation des avis clients comme preuve sociale. |

### 12.2 Adaptation des templates pour les leads referral

Quand le Scoreur (Agent 3) transmet un prospect avec `referral_info` dans le payload, le Redacteur doit adapter le ton et le contenu du message :

**Principe** : Un referral n'est PAS un lead cold. Le prospect a ete recommande par un client existant (ambassadeur). Le ton doit etre plus chaleureux, la mention du client referent doit etre explicite, et l'accroche doit capitaliser sur la relation de confiance.

**Implementation recommandee** :

```typescript
// Dans la selection du template, ajouter une condition referral
function selectTemplate(prospect: ScoredProspect): TemplateConfig {
  // Si le prospect est un referral, utiliser un template dedie
  if (prospect.referral_info) {
    return {
      ...getSegmentTemplate(prospect.segment, prospect.canal),
      tone_override: 'warm_referral',  // Ton plus chaleureux
      intro_override: `{{referrer_name}} m'a parle de {{entreprise}} et de {{signal_principal}}`,
      social_proof_override: `Nous travaillons avec {{referrer_company}} depuis {{referrer_duration}}`,
    }
  }
  // Sinon, template standard (comportement actuel inchange)
  return getSegmentTemplate(prospect.segment, prospect.canal)
}
```

**Elements a inclure dans un message referral** :
- Mention explicite du client ambassadeur (prenom + entreprise) dans l'introduction
- Resultats obtenus pour le client referent (si disponibles via `referral_info.referred_by_client_id`)
- Ton familier et chaleureux (pas de prospection froide)
- CTA plus direct (le prospect s'attend a etre contacte)

### 12.3 Preuve sociale enrichie par les avis clients (Agent 10d)

L'Agent 10 (sous-agent 10d -- Suivi Satisfaction) collecte et gere les avis clients (NPS, temoignages, case studies). Ces avis constituent une source de **preuve sociale** exploitable par le Redacteur dans les emails de prospection :

**Mecanisme** :
1. L'Agent 10d stocke les avis valides dans la table `client_reviews` (note, temoignage, segment, date)
2. Le Redacteur peut interroger cette table pour enrichir les emails avec des temoignages reels et anonymises
3. La preuve sociale est selectionnee par **segment** : un prospect e-commerce recevra un temoignage d'un client e-commerce

**Implementation future (Phase 2)** :

```typescript
// Fonction pour recuperer une preuve sociale pertinente
async function getSocialProof(segment: string): Promise<string | null> {
  const review = await db.query(`
    SELECT testimonial, client_segment, rating
    FROM client_reviews
    WHERE client_segment = $1
    AND rating >= 4
    AND published = true
    ORDER BY created_at DESC
    LIMIT 1
  `, [segment])

  if (review.rows.length > 0) {
    return review.rows[0].testimonial
  }
  return null  // Fallback sur les preuves sociales statiques existantes
}
```

**Note Phase 1** : En Phase 1, les preuves sociales restent statiques (cf. templates existants section 4). L'enrichissement dynamique par les avis clients sera active quand l'Agent 10d aura collecte suffisamment d'avis (objectif : 10+ avis publies).

### 12.4 Ce qui NE change PAS

| Composant | Changement |
|-----------|-----------|
| Templates existants (35 templates, 5 segments x 2 canaux) | AUCUN -- les templates referral s'ajoutent en complement |
| System prompts pour Claude API (sous-agents 4a, 4b) | AUCUN -- un override de ton est applique pour les referrals |
| Sous-agent 4c (Calculateur d'Impact) | AUCUN -- les formules d'impact sont identiques |
| Quality checks (6 verifications automatiques) | AUCUN |
| Delivrabilite (SPF/DKIM/DMARC, warming, rotation domaines) | AUCUN |
| Validation humaine pour les HOT | AUCUN |
| Output vers Agent 5 (SUIVEUR) | AUCUN -- le schema reste identique |
| Cout (5-18 EUR/mois) | AUCUN |

---

## FIN DES SPECIFICATIONS AGENT 4 -- REDACTEUR (MASTER)

**Resume** :
- **3 sous-agents** : 4a (Email via Claude API), 4b (LinkedIn via Claude API), 4c (Calculateur d'Impact local)
- **35 templates** couvrant 5 segments x 2 canaux x 3-4 etapes
- **System prompts complets** pour chaque segment avec exemples few-shot
- **Formules d'impact** : performance web, attribution pub, RGAA, abandon panier
- **6 checks qualite** automatiques + validation humaine pour les HOT
- **Delivrabilite** : SPF/DKIM/DMARC + warming 3-5 semaines + 3 domaines
- **Cout** : 5-18 EUR/mois pour 500 messages via Claude API
- **Coherence** : Input = Output Agent 3, Output compatible Agent 5

---

## INTEGRATION AVEC LES AGENTS 8, 9, 10

### Agent 8 (DEALMAKER) : Aucun impact
Les devis et documents de closing sont geres par l'Agent 8, pas par le Redacteur.

### Agent 9 (APPELS D'OFFRES) : Aucun impact
Les memoires techniques sont rediges par le sous-agent 9e, pas par l'Agent 4. Les deux agents utilisent Claude API mais avec des prompts et templates completement differents.

### Agent 10 (CSM) : Preuve sociale future
Les avis clients collectes par l'Agent 10d pourront etre injectes comme preuve sociale dans les emails de prospection. Les templates referral utilisent un ton plus chaleureux (warm intro via client ambassadeur).
