# AGENT 8 -- DEALMAKER : SPECIFICATIONS TECHNIQUES COMPLETES

**Version :** 1.0
**Date :** 2026-03-19
**Auteur :** Systeme Axiom Marketing
**Contexte :** Pipeline de prospection automatise B2B -- Phase de closing post-RDV
**Public :** Jonathan Dewaele, Marty Wong, equipe tech Univile

---

## TABLE DES MATIERES

1. [Mission](#1-mission)
2. [Input : Schema JSON recu (post-RDV decouverte)](#2-input--schema-json-recu-post-rdv-decouverte)
3. [Sous-Agents](#3-sous-agents)
   - [8a. Generateur de Devis](#3a-sous-agent-8a--generateur-de-devis)
   - [8b. Relanceur de Deals](#3b-sous-agent-8b--relanceur-de-deals)
   - [8c. Gestionnaire de Signature](#3c-sous-agent-8c--gestionnaire-de-signature)
4. [Pipeline CRM -- 7 etapes](#4-pipeline-crm--7-etapes)
5. [Tiering complet par service](#5-tiering-complet-par-service)
6. [Gestion des objections](#6-gestion-des-objections)
7. [Metriques](#7-metriques)
8. [Output : schemas JSON](#8-output--schemas-json)
9. [Couts](#9-couts)
10. [Verification de coherence](#10-verification-de-coherence)

---

## 1. MISSION

### 1.1 Definition

L'Agent 8 (DEALMAKER) est le **moteur de closing** du pipeline Axiom Marketing. Il prend le relais **apres** qu'un prospect a repondu positivement (classification "INTERESSE" par l'Agent 5) et qu'un RDV decouverte a ete effectue par Jonathan. Il automatise l'integralite du processus de closing, du devis personnalise a la signature electronique, en passant par la relance intelligente et la gestion des objections.

**Entree :** Prospect qualifie "INTERESSE" + notes de RDV decouverte de Jonathan.
**Sortie :** Deal signe transmis a l'Agent 10 (CSM) pour onboarding.

### 1.2 Responsabilites exactes

| Responsabilite | Agent 8 fait | Autres agents font |
|---|---|---|
| **Generation de devis** | Cree devis personnalise avec tiering Bronze/Silver/Gold | Jonathan fournit les notes de RDV |
| **Relance post-devis** | Sequences J3/J7/J14 + breakup, detection signaux achat | Agent 5 a gere la prospection initiale |
| **Gestion objections** | Templates de reponse automatises, negociation assistee | Jonathan valide les concessions |
| **Signature electronique** | Yousign API V3 (contrat, e-signature, webhooks) | -- |
| **Pipeline CRM** | 7 etapes avec transitions automatiques et probabilites | Agent 7 analyse les metriques |
| **Scoring engagement** | Score d'engagement post-devis (signaux d'achat) | Agent 3 a fait le scoring initial |
| **Notifications** | Alertes Jonathan sur Slack (signaux forts, signatures) | -- |
| **Transfert post-deal** | Vers Agent 10 (signe), Agent 6 (perdu), Agent 7 (metriques) | -- |

### 1.3 Ce que le Dealmaker ne fait PAS

- Ne fait PAS la prospection initiale (responsabilite Agents 1-5)
- Ne fait PAS le RDV decouverte (responsabilite de Jonathan en personne)
- Ne fait PAS l'onboarding client post-signature (responsabilite Agent 10 CSM)
- Ne fait PAS le nurturing long terme des deals perdus (responsabilite Agent 6 NURTUREUR)
- Ne fait PAS l'analyse des metriques pipeline (responsabilite Agent 7 ANALYSTE)
- Ne gere PAS les appels d'offres publics (responsabilite Agent 9 APPELS D'OFFRES)
- Ne redige PAS les messages de prospection (responsabilite Agent 4 REDACTEUR)

### 1.4 Position dans le pipeline

```
Agent 1 (VEILLEUR) --> Agent 2 (ENRICHISSEUR) --> Agent 3 (SCOREUR)
                                                       |
                                                       v
                                              Agent 4 (REDACTEUR)
                                                       |
                                                       v
                                              Agent 5 (SUIVEUR)
                                                       |
                                          [Prospect repond "INTERESSE"]
                                                       |
                                          [Jonathan fait le RDV decouverte]
                                                       |
                                                       v
                                           ============================
                                           |  AGENT 8 (DEALMAKER)     |
                                           |  8a. Genere le devis     |
                                           |  8b. Relance le prospect |
                                           |  8c. Gere la signature   |
                                           ============================
                                                       |
                                              +--------+--------+---------+
                                              |                 |         |
                                              v                 v         v
                                    Agent 10 (CSM)    Agent 7 (ANALYSTE)  Agent 6 (NURTUREUR)
                                    [Deal signe]      [Metriques]         [Deal perdu]
```

---

## 2. INPUT : SCHEMA JSON RECU (POST-RDV DECOUVERTE)

### 2.1 Contexte du flux

Le flux d'entree vers l'Agent 8 n'est pas un transfert automatique direct depuis l'Agent 5. Le processus est le suivant :

1. L'Agent 5 detecte une reponse "INTERESSE" et notifie Jonathan en < 5 min
2. Jonathan effectue le RDV decouverte avec le prospect (15-60 min)
3. Jonathan saisit ses notes de RDV dans le CRM (ou via formulaire Slack interactif)
4. Le systeme cree un `DealmakerInput` combinant les donnees prospect existantes et les notes de Jonathan
5. Le job est envoye dans la queue BullMQ `dealmaker-pipeline`

### 2.2 Schema JSON complet

```typescript
interface DealmakerInput {
  // === Identifiants ===
  deal_id: string              // UUID v4 unique du deal (genere a la creation)
  prospect_id: string          // UUID v4 du prospect (venant du pipeline Agents 1-5)
  lead_id: string              // UUID v4 du lead original (venant de l'Agent 1)
  created_at: string           // ISO 8601 timestamp de creation du deal

  // === Donnees prospect ===
  prospect: {
    prenom: string
    nom: string
    email: string
    telephone: string | null
    linkedin_url: string | null
    poste: string              // ex: "CMO", "CTO", "Fondateur", "DG"
  }

  // === Donnees entreprise ===
  entreprise: {
    nom: string
    siret: string
    site_web: string
    secteur: string            // ex: "retail", "saas", "industrie", "collectivite"
    taille: number             // nombre de salaries
    ca_estime: number          // chiffre d'affaires estime en EUR
    adresse: string | null
    ville: string | null
    code_postal: string | null
  }

  // === Notes du RDV decouverte (saisies par Jonathan) ===
  rdv_decouverte: {
    date: string               // ISO 8601
    duree_minutes: number      // Duree effective du RDV
    notes_jonathan: string     // Notes libres de Jonathan apres le RDV
    besoins_identifies: string[]  // ex: ["refonte_site", "e-commerce", "tracking"]
    budget_mentionne: number | null  // Budget evoque par le prospect en EUR
    budget_fourchette: {       // Fourchette si pas de montant exact
      min: number | null
      max: number | null
    } | null
    timeline_souhaitee: string | null  // ex: "Q2 2026", "ASAP", "septembre"
    decision_makers: string[]  // Qui decide dans l'entreprise
    processus_decision: string | null  // ex: "1 personne", "comite", "direction + board"
    objections_detectees: string[]  // ex: ["prix_eleve", "timing", "concurrence"]
    concurrent_mentionne: string | null  // ex: "L'agence XYZ leur a fait une offre"
    points_sensibles: string | null  // Ce qui compte le plus pour le prospect
    urgence_percue: 'haute' | 'moyenne' | 'basse'
    probabilite_jonathan: number  // 0-100 : estimation personnelle de Jonathan
  }

  // === Score et categorie (venant de l'Agent 3) ===
  scoring: {
    score_total: number        // 0-100 (du Scoreur Agent 3)
    categorie: 'HOT_A' | 'HOT_B' | 'HOT_C' | 'WARM'
    segment: string            // 'pme_metro' | 'ecommerce_shopify' | 'collectivite' | 'startup_tech' | 'agence_wl'
    signal_principal: string   // Le signal business qui a declenche le lead
  }

  // === Historique des interactions (venant de l'Agent 5) ===
  historique: {
    nb_emails_envoyes: number
    nb_emails_ouverts: number
    nb_clics: number
    nb_reponses: number
    canal_principal: 'email' | 'linkedin'
    date_premier_contact: string  // ISO 8601
    date_reponse_interesse: string  // ISO 8601
    reply_classification: {
      category: 'INTERESSE' | 'INTERESSE_SOFT'
      confidence: number
      phrase_cle: string       // La phrase exacte du prospect montrant l'interet
    }
    sequence_id: string        // ID de la sequence de prospection
    dernier_message_envoye: string  // Corps du dernier message envoye
  }

  // === Metadata ===
  metadata: {
    agent: 'agent_8_dealmaker'
    source: 'pipeline_prospection' | 'referral' | 'inbound' | 'appel_entrant'
    version: string
    created_by: 'system' | 'jonathan'
  }
}
```

### 2.3 Reception via BullMQ Worker

```typescript
import { Worker, Job } from 'bullmq'
import { DealmakerInput } from './types/dealmaker'

const dealmakerWorker = new Worker(
  'dealmaker-pipeline',
  async (job: Job<DealmakerInput>) => {
    const input = job.data

    // 1. Valider l'input
    const validation = validateDealmakerInput(input)
    if (!validation.valid) {
      console.error(`[Agent8] Input invalide: ${validation.errors.join(', ')}`)
      throw new Error(`INVALID_INPUT: ${validation.errors.join(', ')}`)
    }

    // 2. Verifier que le prospect n'est pas deja en cours de deal
    const existingDeal = await db.deals.findActive(input.prospect_id)
    if (existingDeal) {
      console.warn(`[Agent8] Deal actif existant ${existingDeal.deal_id} pour prospect ${input.prospect_id}`)
      return { status: 'EXISTING_DEAL', deal_id: existingDeal.deal_id }
    }

    // 3. Creer le deal en base
    const deal = await db.deals.create({
      deal_id: input.deal_id,
      prospect_id: input.prospect_id,
      stage: 'QUALIFICATION',
      montant_estime: estimateDealValue(input),
      created_at: new Date(),
      source: input.metadata.source,
    })

    // 4. Router vers le sous-agent 8a pour generation de devis
    return await SubAgent8a_GenerateurDevis.process(input, deal)
  },
  {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    concurrency: 3,
    limiter: {
      max: 5,
      duration: 60000 // 5 jobs max par minute
    }
  }
)

function validateDealmakerInput(input: DealmakerInput): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Champs obligatoires
  if (!input.deal_id) errors.push('deal_id manquant')
  if (!input.prospect_id) errors.push('prospect_id manquant')
  if (!input.prospect?.email) errors.push('prospect.email manquant')
  if (!input.prospect?.prenom) errors.push('prospect.prenom manquant')
  if (!input.prospect?.nom) errors.push('prospect.nom manquant')
  if (!input.entreprise?.nom) errors.push('entreprise.nom manquant')
  if (!input.entreprise?.siret) errors.push('entreprise.siret manquant (requis pour devis/contrat)')

  // RDV decouverte
  if (!input.rdv_decouverte?.date) errors.push('rdv_decouverte.date manquant')
  if (!input.rdv_decouverte?.notes_jonathan) errors.push('rdv_decouverte.notes_jonathan manquant')
  if (!input.rdv_decouverte?.besoins_identifies?.length) {
    errors.push('rdv_decouverte.besoins_identifies vide (au moins 1 besoin)')
  }

  // Scoring
  if (!input.scoring?.categorie) errors.push('scoring.categorie manquant')
  if (!input.scoring?.segment) errors.push('scoring.segment manquant')

  // Historique
  if (!input.historique?.reply_classification?.category) {
    errors.push('historique.reply_classification.category manquant')
  }
  if (!['INTERESSE', 'INTERESSE_SOFT'].includes(input.historique?.reply_classification?.category)) {
    errors.push(`Classification invalide: ${input.historique?.reply_classification?.category} (attendu: INTERESSE ou INTERESSE_SOFT)`)
  }

  return { valid: errors.length === 0, errors }
}

function estimateDealValue(input: DealmakerInput): number {
  // Estimation basee sur les besoins et le budget mentionne
  if (input.rdv_decouverte.budget_mentionne) {
    return input.rdv_decouverte.budget_mentionne
  }

  // Estimation par defaut basee sur les besoins
  const ESTIMATES: Record<string, number> = {
    'refonte_site': 5000,
    'site_vitrine': 5000,
    'e-commerce': 10000,
    'ecommerce_shopify': 10000,
    'app_flutter': 35000,
    'app_mobile': 35000,
    'app_metier': 50000,
    'rgaa': 20000,
    'accessibilite': 20000,
    'tracking': 990,
    'tracking_server_side': 990,
  }

  return input.rdv_decouverte.besoins_identifies.reduce((sum, besoin) => {
    const key = besoin.toLowerCase().replace(/\s+/g, '_')
    return sum + (ESTIMATES[key] || 5000)
  }, 0)
}
```

### 2.4 Formulaire de saisie Jonathan (Slack interactif)

Apres le RDV decouverte, Jonathan remplit un formulaire Slack interactif qui cree automatiquement le `DealmakerInput` :

```typescript
// Bloc interactif Slack pour la saisie des notes de RDV
const rdvFormBlocks = {
  type: 'modal',
  title: { type: 'plain_text', text: 'Notes RDV Decouverte' },
  blocks: [
    {
      type: 'input',
      block_id: 'notes',
      label: { type: 'plain_text', text: 'Notes du RDV (libre)' },
      element: {
        type: 'plain_text_input',
        action_id: 'notes_jonathan',
        multiline: true,
        placeholder: { type: 'plain_text', text: 'Resume du RDV, besoins, contexte...' }
      }
    },
    {
      type: 'input',
      block_id: 'besoins',
      label: { type: 'plain_text', text: 'Besoins identifies' },
      element: {
        type: 'checkboxes',
        action_id: 'besoins_identifies',
        options: [
          { text: { type: 'plain_text', text: 'Site vitrine' }, value: 'site_vitrine' },
          { text: { type: 'plain_text', text: 'E-commerce Shopify' }, value: 'ecommerce_shopify' },
          { text: { type: 'plain_text', text: 'App Flutter' }, value: 'app_flutter' },
          { text: { type: 'plain_text', text: 'App metier' }, value: 'app_metier' },
          { text: { type: 'plain_text', text: 'RGAA / Accessibilite' }, value: 'rgaa' },
          { text: { type: 'plain_text', text: 'Tracking server-side' }, value: 'tracking_server_side' },
        ]
      }
    },
    {
      type: 'input',
      block_id: 'budget',
      label: { type: 'plain_text', text: 'Budget mentionne (EUR)' },
      optional: true,
      element: {
        type: 'number_input',
        action_id: 'budget_mentionne',
        is_decimal_allowed: false,
        min_value: '0'
      }
    },
    {
      type: 'input',
      block_id: 'timeline',
      label: { type: 'plain_text', text: 'Timeline souhaitee' },
      optional: true,
      element: {
        type: 'plain_text_input',
        action_id: 'timeline_souhaitee',
        placeholder: { type: 'plain_text', text: 'Q2 2026, ASAP, septembre...' }
      }
    },
    {
      type: 'input',
      block_id: 'objections',
      label: { type: 'plain_text', text: 'Objections detectees' },
      optional: true,
      element: {
        type: 'checkboxes',
        action_id: 'objections_detectees',
        options: [
          { text: { type: 'plain_text', text: 'Prix eleve' }, value: 'prix_eleve' },
          { text: { type: 'plain_text', text: 'Timing / pas le bon moment' }, value: 'timing' },
          { text: { type: 'plain_text', text: 'Concurrence en lice' }, value: 'concurrence' },
          { text: { type: 'plain_text', text: 'Budget non alloue' }, value: 'budget' },
          { text: { type: 'plain_text', text: 'Indecision / paralysie' }, value: 'indecision' },
        ]
      }
    },
    {
      type: 'input',
      block_id: 'probabilite',
      label: { type: 'plain_text', text: 'Probabilite de closing (0-100)' },
      element: {
        type: 'number_input',
        action_id: 'probabilite_jonathan',
        is_decimal_allowed: false,
        min_value: '0',
        max_value: '100'
      }
    },
    {
      type: 'input',
      block_id: 'urgence',
      label: { type: 'plain_text', text: 'Urgence percue' },
      element: {
        type: 'static_select',
        action_id: 'urgence_percue',
        options: [
          { text: { type: 'plain_text', text: 'Haute (ASAP)' }, value: 'haute' },
          { text: { type: 'plain_text', text: 'Moyenne (1-3 mois)' }, value: 'moyenne' },
          { text: { type: 'plain_text', text: 'Basse (exploratoire)' }, value: 'basse' },
        ]
      }
    }
  ]
}
```

---

## 3. SOUS-AGENTS

---

### 3a. SOUS-AGENT 8a -- GENERATEUR DE DEVIS

#### 3a.1 Mission

Creer automatiquement un devis personnalise en moins de 30 secondes apres que Jonathan a valide ses notes de RDV. Le devis presente 3 tiers (Bronze/Silver/Gold) avec le tier recommande mis en evidence, et inclut le scope personnalise genere par Claude API a partir des notes de Jonathan.

#### 3a.2 Architecture technique

```
DealmakerInput (post-RDV)
    |
    v
+---------------------------------------------------+
| SOUS-AGENT 8a : GENERATEUR DE DEVIS               |
| 1. Analyser notes RDV via Claude API (2-3s)       |
| 2. Selectionner template + tier recommande         |
| 3. Generer scope personnalise (Claude API)         |
| 4. Assembler HTML + variables (Handlebars)         |
| 5. Generer PDF (Puppeteer, 5-8s)                   |
| 6. Envoyer + tracker via email                     |
| 7. Logger en BDD + notifier Jonathan (Slack)       |
+---------------------------------------------------+
    |
    v
Devis PDF envoye --> Deal passe en stage "DEVIS_CREE"
```

#### 3a.3 Solution technique : Puppeteer PDF maison

**Choix justifie pour Axiom :**

| Critere | PandaDoc API | Puppeteer (maison) |
|---------|-------------|-------------------|
| **Cout** | 240-440 EUR/mois (40 EUR + 4 EUR/doc) | 0 EUR (self-hosted) |
| **Controle** | Template PandaDoc limites | HTML/CSS illimite |
| **Vitesse** | 2-3s via API | 5-8s local |
| **Tracking** | Natif (ouvertures, vues) | Custom (pixel tracking) |
| **Dependance** | SaaS externe | Aucune |
| **CSS moderne** | Limite | Grid, Flexbox, CSS Paged Media |

**Recommandation :** Puppeteer pour la generation PDF (cout zero, controle total), avec tracking custom via pixel invisible + webhook maison.

**Alternative PandaDoc :** Si le volume depasse 100 devis/mois ou si le tracking natif devient critique, migrer vers PandaDoc API ($40/mois + $4/doc).

#### 3a.4 Code TypeScript complet

```typescript
import puppeteer, { Browser } from 'puppeteer'
import Handlebars from 'handlebars'
import Anthropic from '@anthropic-ai/sdk'
import { v4 as uuidv4 } from 'uuid'
import { DealmakerInput } from './types/dealmaker'
import { db, slack, emailService, trackingService } from './services'

// ============================================================
// INTERFACES
// ============================================================

interface DevisGenere {
  devis_id: string
  deal_id: string
  prospect_id: string
  pdf_buffer: Buffer
  pdf_url: string
  tier_recommande: 'bronze' | 'silver' | 'gold'
  montant_bronze: number
  montant_silver: number
  montant_gold: number
  scope_personnalise: string
  validite_jours: number
  tracking_id: string
  created_at: string
}

interface ScopeAnalysis {
  type_projet: string
  description_scope: string
  livrables: string[]
  features_bronze: string[]
  features_silver: string[]
  features_gold: string[]
  timeline_estimee: {
    bronze_semaines: number
    silver_semaines: number
    gold_semaines: number
  }
  add_ons_suggeres: string[]
  notes_specifiques: string
}

interface TierConfig {
  nom: string
  prix_min: number
  prix_max: number
  prix_affiche: number
  features: string[]
  timeline_semaines: number
  label: string
  is_recommended: boolean
}

// ============================================================
// TEMPLATES PAR SERVICE
// ============================================================

const SERVICE_TEMPLATES: Record<string, {
  template_id: string
  display_name: string
  bronze: TierConfig
  silver: TierConfig
  gold: TierConfig
}> = {
  // --- SITE VITRINE ---
  site_vitrine: {
    template_id: 'TPL_SITE_VITRINE_V3',
    display_name: 'Site Vitrine',
    bronze: {
      nom: 'Essentiel',
      prix_min: 1500,
      prix_max: 3000,
      prix_affiche: 1500,
      features: [
        'Template WordPress/Webflow premium',
        '5-8 pages (Accueil, A propos, Services, Contact, Mentions legales)',
        'Design responsive mobile',
        'Formulaire de contact basique',
        'Hebergement + SSL 1 an inclus',
        'Mise en ligne et formation 1h',
      ],
      timeline_semaines: 3,
      label: 'Essentiel',
      is_recommended: false,
    },
    silver: {
      nom: 'Professionnel',
      prix_min: 5000,
      prix_max: 8000,
      prix_affiche: 5000,
      features: [
        'Design 100% sur-mesure Figma (maquettes validees)',
        '10-15 pages avec contenu optimise',
        'Micro-interactions et animations soignees',
        'SEO on-page complet + configuration GA4',
        'Formulaires avances + integration CRM (HubSpot/Pipedrive)',
        'Hebergement premium + SSL 1 an',
        '2 cycles de revision inclus',
        'Formation client 2h (back-office + analytics)',
      ],
      timeline_semaines: 5,
      label: 'Le plus choisi',
      is_recommended: true,
    },
    gold: {
      nom: 'Premium',
      prix_min: 10000,
      prix_max: 15000,
      prix_affiche: 9500,
      features: [
        'Tout le pack Professionnel +',
        'Interactions avancees (parallax, 3D, scroll animations)',
        'Blog integre avec CMS editorial complet',
        'Optimisation performance Lighthouse 95+',
        'Strategie SEO avancee + maillage interne',
        'Integration chatbot IA (FAQ automatisee)',
        '6 mois de support prioritaire inclus',
        'Formation client 4h (SEO + CMS + analytics)',
        'Maintenance technique 1 an incluse',
      ],
      timeline_semaines: 8,
      label: 'Premium',
      is_recommended: false,
    },
  },

  // --- E-COMMERCE SHOPIFY ---
  ecommerce_shopify: {
    template_id: 'TPL_ECOMMERCE_SHOPIFY_V2',
    display_name: 'Boutique E-commerce Shopify',
    bronze: {
      nom: 'Starter',
      prix_min: 5000,
      prix_max: 8000,
      prix_affiche: 5000,
      features: [
        'Theme Shopify premium personnalise',
        'Jusqu\'a 50 produits configures',
        'Paiement standard (Stripe, PayPal, CB)',
        'Livraison standard (Colissimo, Mondial Relay)',
        'Email marketing integration (Klaviyo basique)',
        'Plan Shopify Basic 1 an inclus',
        'Formation client 2h',
      ],
      timeline_semaines: 4,
      label: 'Starter',
      is_recommended: false,
    },
    silver: {
      nom: 'Growth',
      prix_min: 8000,
      prix_max: 12000,
      prix_affiche: 10000,
      features: [
        'Design semi-custom Figma + Shopify',
        'Jusqu\'a 500 produits avec variantes (tailles, couleurs)',
        'Apps Shopify strategiques (reviews, upsell, cross-sell)',
        'Configuration taxes + livraison multi-zones',
        'Klaviyo avance (flows automatises, segmentation)',
        'GA4 + tracking e-commerce avance',
        'Training client complet 4h',
        '3 cycles de revision inclus',
      ],
      timeline_semaines: 6,
      label: 'Le plus choisi',
      is_recommended: true,
    },
    gold: {
      nom: 'Scale',
      prix_min: 12000,
      prix_max: 15000,
      prix_affiche: 15000,
      features: [
        'Developpement Shopify custom (Liquid + API)',
        'Configurateur produit avance / visualisation 3D',
        'Synchronisation inventaire multi-canaux',
        'Abonnements et produits recurrents',
        'Analytics avance + tableaux de bord personnalises',
        'Optimisation performance (Core Web Vitals)',
        '6 mois support prioritaire inclus',
        'Migration donnees depuis ancienne plateforme',
      ],
      timeline_semaines: 10,
      label: 'Scale',
      is_recommended: false,
    },
  },

  // --- APP FLUTTER ---
  app_flutter: {
    template_id: 'TPL_APP_FLUTTER_V1',
    display_name: 'Application Mobile Flutter',
    bronze: {
      nom: 'MVP',
      prix_min: 15000,
      prix_max: 25000,
      prix_affiche: 15000,
      features: [
        'Application iOS + Android (Flutter cross-platform)',
        '6-8 ecrans critiques (parcours utilisateur principal)',
        'Design UI basique (Material Design / Cupertino)',
        'Integration API REST existante',
        'Authentification simple (email/password)',
        'Publication App Store + Google Play',
        'Support 1 mois post-lancement',
      ],
      timeline_semaines: 8,
      label: 'MVP',
      is_recommended: false,
    },
    silver: {
      nom: 'Complete',
      prix_min: 25000,
      prix_max: 50000,
      prix_affiche: 35000,
      features: [
        'Application complete iOS + Android',
        '15-25 ecrans avec navigation avancee',
        'Design UI/UX professionnel Figma (maquettes + prototype)',
        'Backend API sur-mesure (Node.js + PostgreSQL)',
        'Authentification avancee (OAuth, biometrie)',
        'Notifications push (Firebase)',
        'Mode hors-ligne avec synchronisation',
        'Tests unitaires + integration',
        'Support 2 mois post-lancement',
      ],
      timeline_semaines: 14,
      label: 'Le plus choisi',
      is_recommended: true,
    },
    gold: {
      nom: 'Enterprise',
      prix_min: 50000,
      prix_max: 80000,
      prix_affiche: 60000,
      features: [
        'Tout le pack Complete +',
        'Integrations tierces complexes (ERP, CRM, paiement)',
        'Analytics avancees + crash reporting (Sentry)',
        'CI/CD automatise (builds, tests, deploiements)',
        'Dashboard admin web (React)',
        'Architecture micro-services scalable',
        'Documentation technique complete',
        'Formation equipe technique client 8h',
        'Support prioritaire 6 mois',
      ],
      timeline_semaines: 22,
      label: 'Enterprise',
      is_recommended: false,
    },
  },

  // --- APP METIER ---
  app_metier: {
    template_id: 'TPL_APP_METIER_V1',
    display_name: 'Application Metier Sur-Mesure',
    bronze: {
      nom: 'Module Unique',
      prix_min: 25000,
      prix_max: 40000,
      prix_affiche: 25000,
      features: [
        'Application web sur-mesure (React + Node.js)',
        '1 module metier principal (ex: gestion stocks, planning, CRM)',
        'Interface utilisateur adaptee au workflow metier',
        'Base de donnees PostgreSQL dediee',
        'Gestion des utilisateurs et droits d\'acces',
        'Export donnees (CSV, PDF)',
        'Deploiement cloud (AWS/OVH)',
        'Support 2 mois',
      ],
      timeline_semaines: 10,
      label: 'Module Unique',
      is_recommended: false,
    },
    silver: {
      nom: 'Multi-Modules',
      prix_min: 40000,
      prix_max: 60000,
      prix_affiche: 50000,
      features: [
        'Application web + mobile (React + Flutter)',
        '3-5 modules metier interconnectes',
        'Design UX personnalise (parcours utilisateur optimise)',
        'API RESTful documentee (Swagger/OpenAPI)',
        'Integrations tierces (comptabilite, email, fichiers)',
        'Tableau de bord analytique temps reel',
        'Gestion multi-sites / multi-utilisateurs',
        'Tests automatises (unitaires + E2E)',
        'Support 4 mois',
      ],
      timeline_semaines: 18,
      label: 'Le plus choisi',
      is_recommended: true,
    },
    gold: {
      nom: 'Sur-Mesure Complet',
      prix_min: 60000,
      prix_max: 80000,
      prix_affiche: 75000,
      features: [
        'Tout le pack Multi-Modules +',
        'Architecture micro-services (scalabilite illimitee)',
        'Integrations ERP/SAP/Salesforce',
        'IA integree (predictions, automatisations intelligentes)',
        'Application mobile native (Flutter) dediee',
        'SSO (Single Sign-On) + LDAP',
        'Audit securite + conformite RGPD',
        'Documentation technique + fonctionnelle complete',
        'Formation equipe client 16h',
        'Support prioritaire 6 mois + SLA garanti',
      ],
      timeline_semaines: 26,
      label: 'Sur-Mesure Complet',
      is_recommended: false,
    },
  },

  // --- RGAA COLLECTIVITES ---
  rgaa: {
    template_id: 'TPL_RGAA_COLLECTIVITE_V1',
    display_name: 'Mise en Conformite RGAA (Accessibilite)',
    bronze: {
      nom: 'Audit + Corrections Essentielles',
      prix_min: 8000,
      prix_max: 15000,
      prix_affiche: 8000,
      features: [
        'Audit RGAA 4.1 complet (106 criteres, 50 pages)',
        'Rapport detaille avec prioritisation des non-conformites',
        'Corrections des non-conformites critiques (niveau A)',
        'Declaration d\'accessibilite conforme',
        'Formation equipe 2h (bonnes pratiques)',
        'Score RGAA cible : 50% --> 75%',
      ],
      timeline_semaines: 4,
      label: 'Audit + Essentiels',
      is_recommended: false,
    },
    silver: {
      nom: 'Refonte Partielle',
      prix_min: 15000,
      prix_max: 30000,
      prix_affiche: 20000,
      features: [
        'Audit RGAA 4.1 complet + tests utilisateurs handicapes',
        'Corrections niveaux A + AA (conformite legale)',
        'Refonte des composants critiques (navigation, formulaires, tableaux)',
        'Schema pluriannuel de mise en accessibilite',
        'Declaration d\'accessibilite + mention legale',
        'Formation equipe 4h (editeurs + developpeurs)',
        'Score RGAA cible : 50% --> 90%',
        'Support 3 mois post-livraison',
      ],
      timeline_semaines: 8,
      label: 'Le plus choisi',
      is_recommended: true,
    },
    gold: {
      nom: 'Refonte Complete',
      prix_min: 30000,
      prix_max: 50000,
      prix_affiche: 40000,
      features: [
        'Tout le pack Refonte Partielle +',
        'Refonte design complete orientee accessibilite (WCAG 2.2 AAA)',
        'Refonte technique (HTML semantique, ARIA, performances)',
        'Tests automatises d\'accessibilite en CI/CD',
        'Tests avec panel utilisateurs en situation de handicap',
        'Accompagnement schema pluriannuel 24 mois',
        'Formation complete equipe 8h (devs + editeurs + chefs projet)',
        'Audit de suivi a 6 mois et 12 mois',
        'Score RGAA cible : 100% conformite AA',
      ],
      timeline_semaines: 16,
      label: 'Conformite Totale',
      is_recommended: false,
    },
  },

  // --- TRACKING SERVER-SIDE ---
  tracking_server_side: {
    template_id: 'TPL_TRACKING_SS_V2',
    display_name: 'Tracking Server-Side (GTM SS)',
    bronze: {
      nom: 'Standard',
      prix_min: 990,
      prix_max: 990,
      prix_affiche: 990,
      features: [
        'Installation GTM Server-Side (Google Cloud Run)',
        'Configuration GA4 server-side',
        'Migration des tags existants (jusqu\'a 10 tags)',
        'Domaine personnalise (first-party cookies)',
        'Documentation technique',
        'Maintenance mensuelle : 89 EUR/mois',
      ],
      timeline_semaines: 1,
      label: 'Standard',
      is_recommended: false,
    },
    silver: {
      nom: 'Avance',
      prix_min: 1490,
      prix_max: 1490,
      prix_affiche: 1490,
      features: [
        'Tout le pack Standard +',
        'Configuration Meta Conversion API (CAPI)',
        'Configuration Google Ads Enhanced Conversions',
        'Migration jusqu\'a 25 tags',
        'Consent Mode V2 avance',
        'Dashboard monitoring temps reel',
        'Maintenance mensuelle : 129 EUR/mois',
      ],
      timeline_semaines: 2,
      label: 'Le plus choisi',
      is_recommended: true,
    },
    gold: {
      nom: 'Enterprise',
      prix_min: 2490,
      prix_max: 2490,
      prix_affiche: 2490,
      features: [
        'Tout le pack Avance +',
        'Configuration TikTok Events API',
        'Configuration LinkedIn Conversion API',
        'Data enrichment server-side',
        'A/B testing server-side',
        'Infrastructure haute disponibilite (multi-region)',
        'Formation equipe analytics 4h',
        'Audit performance + optimisation trimestriel',
        'Maintenance mensuelle : 189 EUR/mois',
      ],
      timeline_semaines: 3,
      label: 'Enterprise',
      is_recommended: false,
    },
  },
}

// ============================================================
// ANALYSE DU SCOPE VIA CLAUDE API
// ============================================================

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

async function analyzeScope(input: DealmakerInput): Promise<ScopeAnalysis> {
  const besoins = input.rdv_decouverte.besoins_identifies.join(', ')
  const template = SERVICE_TEMPLATES[input.rdv_decouverte.besoins_identifies[0]] || SERVICE_TEMPLATES['site_vitrine']

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Tu es expert en devis pour agences de developpement web. Analyse ces notes de RDV decouverte et genere un scope personnalise pour un devis.

PROSPECT :
- Entreprise : ${input.entreprise.nom} (${input.entreprise.secteur}, ${input.entreprise.taille} salaries)
- Contact : ${input.prospect.prenom} ${input.prospect.nom} (${input.prospect.poste})
- Budget mentionne : ${input.rdv_decouverte.budget_mentionne ? input.rdv_decouverte.budget_mentionne + ' EUR' : 'Non precise'}
- Timeline : ${input.rdv_decouverte.timeline_souhaitee || 'Non precisee'}

NOTES DE RDV (Jonathan) :
${input.rdv_decouverte.notes_jonathan}

BESOINS IDENTIFIES :
${besoins}

OBJECTIONS DETECTEES :
${input.rdv_decouverte.objections_detectees?.join(', ') || 'Aucune'}

SERVICES AXIOM DISPONIBLES :
- Site vitrine : 1 500-15 000 EUR
- E-commerce Shopify : 5 000-15 000 EUR
- App Flutter : 15 000-80 000 EUR
- App metier : 25 000-80 000 EUR
- RGAA collectivites : 8 000-50 000 EUR
- Tracking server-side : 990 EUR + 89 EUR/mois

INSTRUCTIONS :
Genere un JSON strict avec :
1. Le type de projet principal
2. Une description du scope personnalisee (2-3 phrases reformulant le besoin du prospect)
3. Les livrables concrets pour chaque tier (Bronze/Silver/Gold)
4. Les features specifiques adaptees au secteur du prospect
5. Les timelines estimees par tier
6. Les add-ons pertinents
7. Les notes specifiques au contexte du prospect

Reponds UNIQUEMENT en JSON valide, pas de markdown.

FORMAT :
{
  "type_projet": "site_vitrine | ecommerce_shopify | app_flutter | app_metier | rgaa | tracking_server_side",
  "description_scope": "Description personnalisee...",
  "livrables": ["livrable 1", "livrable 2"],
  "features_bronze": ["feature specifique 1", "feature specifique 2"],
  "features_silver": ["feature specifique 1", "feature specifique 2"],
  "features_gold": ["feature specifique 1", "feature specifique 2"],
  "timeline_estimee": {
    "bronze_semaines": 4,
    "silver_semaines": 6,
    "gold_semaines": 10
  },
  "add_ons_suggeres": ["Maintenance mensuelle", "Formation", "SEO"],
  "notes_specifiques": "Points specifiques au prospect..."
}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return JSON.parse(text) as ScopeAnalysis
}

// ============================================================
// DETERMINATION DU TIER RECOMMANDE
// ============================================================

function calculateRecommendedTier(input: DealmakerInput, scope: ScopeAnalysis): 'bronze' | 'silver' | 'gold' {
  const template = SERVICE_TEMPLATES[scope.type_projet]
  if (!template) return 'silver' // Defaut : tier milieu

  const budget = input.rdv_decouverte.budget_mentionne
  const taille = input.entreprise.taille
  const ca = input.entreprise.ca_estime
  const score = input.scoring.score_total
  const urgence = input.rdv_decouverte.urgence_percue

  // --- Logique de recommandation ---

  // Si budget mentionne, aligner le tier
  if (budget) {
    if (budget <= template.bronze.prix_affiche * 1.2) return 'bronze'
    if (budget <= template.silver.prix_affiche * 1.2) return 'silver'
    return 'gold'
  }

  // Sans budget mentionne : scoring multi-criteres
  let tierScore = 0

  // Taille entreprise (0-30 points)
  if (taille > 200) tierScore += 30
  else if (taille > 50) tierScore += 20
  else if (taille > 10) tierScore += 10

  // CA estime (0-30 points)
  if (ca > 10000000) tierScore += 30
  else if (ca > 2000000) tierScore += 20
  else if (ca > 500000) tierScore += 10

  // Score prospect (0-20 points)
  if (score >= 80) tierScore += 20
  else if (score >= 60) tierScore += 10

  // Urgence (0-20 points)
  if (urgence === 'haute') tierScore += 20
  else if (urgence === 'moyenne') tierScore += 10

  // Decision
  if (tierScore >= 60) return 'gold'
  if (tierScore >= 30) return 'silver'
  return 'bronze'

  // NOTE : Le DECOY EFFECT fait que 60-70% des prospects choisissent Silver
  // meme quand Gold est recommande. Silver est toujours le tier par defaut.
}

// ============================================================
// GENERATION DU PDF VIA PUPPETEER
// ============================================================

// Template HTML Handlebars pour le devis
const DEVIS_HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 25mm 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', 'Helvetica Neue', sans-serif; color: #1a1a2e; line-height: 1.6; }

    /* COUVERTURE */
    .cover { page-break-after: always; display: flex; flex-direction: column; justify-content: center; min-height: 100vh; padding: 60px; }
    .cover .logo { width: 180px; margin-bottom: 40px; }
    .cover h1 { font-size: 32px; color: #0f0f23; margin-bottom: 12px; }
    .cover .subtitle { font-size: 18px; color: #6c6c8a; }
    .cover .meta { margin-top: 40px; font-size: 14px; color: #9090a7; }

    /* SECTIONS */
    .section { margin-bottom: 32px; }
    .section h2 { font-size: 22px; color: #0f0f23; border-bottom: 2px solid #e8e8f0; padding-bottom: 8px; margin-bottom: 16px; }
    .section p { font-size: 14px; margin-bottom: 12px; }

    /* TIERING */
    .tiers { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin: 24px 0; }
    .tier-card { border: 2px solid #e8e8f0; border-radius: 12px; padding: 24px; position: relative; }
    .tier-card.recommended { border-color: #4f46e5; background: #f8f7ff; }
    .tier-card.recommended::before {
      content: '{{recommended_label}}';
      position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
      background: #4f46e5; color: white; padding: 4px 16px; border-radius: 20px;
      font-size: 12px; font-weight: 600;
    }
    .tier-card h3 { font-size: 18px; margin-bottom: 8px; }
    .tier-card .price { font-size: 28px; font-weight: 700; color: #4f46e5; margin-bottom: 16px; }
    .tier-card .price span { font-size: 14px; font-weight: 400; color: #6c6c8a; }
    .tier-card ul { list-style: none; padding: 0; }
    .tier-card ul li { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f0f0f5; }
    .tier-card ul li::before { content: '\\2713'; color: #22c55e; margin-right: 8px; font-weight: bold; }

    /* TIMELINE */
    .timeline-bar { display: flex; align-items: center; gap: 8px; margin: 16px 0; }
    .timeline-step { flex: 1; text-align: center; padding: 12px; background: #f4f4f8; border-radius: 8px; }
    .timeline-step.active { background: #4f46e5; color: white; }

    /* ADD-ONS */
    .addon-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .addon-item { padding: 16px; border: 1px solid #e8e8f0; border-radius: 8px; }
    .addon-item .addon-price { color: #4f46e5; font-weight: 600; }

    /* CONDITIONS */
    .conditions { background: #f8f8fc; padding: 24px; border-radius: 12px; margin: 24px 0; }
    .conditions h3 { margin-bottom: 12px; }
    .conditions table { width: 100%; border-collapse: collapse; }
    .conditions table td { padding: 8px 12px; border-bottom: 1px solid #e8e8f0; font-size: 13px; }
    .conditions table td:last-child { text-align: right; font-weight: 600; }

    /* FOOTER */
    .footer { margin-top: 48px; padding-top: 24px; border-top: 2px solid #e8e8f0; font-size: 12px; color: #9090a7; text-align: center; }
    .footer .validite { font-size: 14px; color: #ef4444; font-weight: 600; }
  </style>
</head>
<body>

  <!-- PAGE 1 : COUVERTURE -->
  <div class="cover">
    <img src="data:image/svg+xml;base64,..." class="logo" alt="Axiom Marketing">
    <h1>Proposition commerciale</h1>
    <div class="subtitle">{{type_projet_display}} pour {{entreprise_nom}}</div>
    <div class="meta">
      <p>Prepare pour : {{prospect_prenom}} {{prospect_nom}} ({{prospect_poste}})</p>
      <p>Date : {{date_devis}}</p>
      <p>Reference : {{devis_reference}}</p>
      <p>Validite : {{validite_jours}} jours</p>
    </div>
  </div>

  <!-- PAGE 2 : CONTEXTE + SCOPE -->
  <div class="section">
    <h2>1. Votre besoin</h2>
    <p>{{scope_personnalise}}</p>
  </div>

  <div class="section">
    <h2>2. Livrables</h2>
    <ul>
      {{#each livrables}}
      <li>{{this}}</li>
      {{/each}}
    </ul>
  </div>

  <!-- TIERING -->
  <div class="section">
    <h2>3. Nos offres</h2>
    <div class="tiers">
      <div class="tier-card {{#if bronze_recommended}}recommended{{/if}}">
        <h3>{{bronze_nom}}</h3>
        <div class="price">{{bronze_prix}} EUR <span>HT</span></div>
        <ul>
          {{#each bronze_features}}
          <li>{{this}}</li>
          {{/each}}
        </ul>
        <p style="margin-top:12px;font-size:12px;color:#6c6c8a;">Livraison : {{bronze_timeline}} semaines</p>
      </div>
      <div class="tier-card {{#if silver_recommended}}recommended{{/if}}">
        <h3>{{silver_nom}}</h3>
        <div class="price">{{silver_prix}} EUR <span>HT</span></div>
        <ul>
          {{#each silver_features}}
          <li>{{this}}</li>
          {{/each}}
        </ul>
        <p style="margin-top:12px;font-size:12px;color:#6c6c8a;">Livraison : {{silver_timeline}} semaines</p>
      </div>
      <div class="tier-card {{#if gold_recommended}}recommended{{/if}}">
        <h3>{{gold_nom}}</h3>
        <div class="price">{{gold_prix}} EUR <span>HT</span></div>
        <ul>
          {{#each gold_features}}
          <li>{{this}}</li>
          {{/each}}
        </ul>
        <p style="margin-top:12px;font-size:12px;color:#6c6c8a;">Livraison : {{gold_timeline}} semaines</p>
      </div>
    </div>
  </div>

  <!-- ADD-ONS -->
  <div class="section">
    <h2>4. Options complementaires</h2>
    <div class="addon-grid">
      {{#each add_ons}}
      <div class="addon-item">
        <strong>{{this.nom}}</strong>
        <p style="font-size:13px;color:#6c6c8a;">{{this.description}}</p>
        <div class="addon-price">{{this.prix}}</div>
      </div>
      {{/each}}
    </div>
  </div>

  <!-- CONDITIONS DE PAIEMENT -->
  <div class="section">
    <h2>5. Conditions de paiement</h2>
    <div class="conditions">
      <table>
        <tr><td>Acompte a la signature</td><td>{{paiement_acompte_pct}}% ({{paiement_acompte_montant}} EUR HT)</td></tr>
        {{#if paiement_intermediaire}}
        <tr><td>Etape intermediaire (validation maquettes)</td><td>{{paiement_intermediaire_pct}}% ({{paiement_intermediaire_montant}} EUR HT)</td></tr>
        {{/if}}
        <tr><td>Solde a la livraison</td><td>{{paiement_solde_pct}}% ({{paiement_solde_montant}} EUR HT)</td></tr>
      </table>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <p class="validite">Ce devis est valable {{validite_jours}} jours (jusqu'au {{date_expiration}}).</p>
    <p>Axiom Marketing -- UNIVILE SAS | SIRET : XXXXXXXXX | TVA : FRXXXXXXXXX</p>
    <p>jonathan@axiom-marketing.fr | +33 6 XX XX XX XX | axiom-marketing.fr</p>
  </div>

</body>
</html>
`

// Helpers Handlebars
Handlebars.registerHelper('formatNumber', (num: number) => {
  return new Intl.NumberFormat('fr-FR').format(num)
})

// ============================================================
// CLASSE PRINCIPALE : GENERATEUR DE DEVIS
// ============================================================

class SubAgent8a_GenerateurDevis {
  private browser: Browser | null = null

  async process(input: DealmakerInput, deal: any): Promise<DevisGenere> {
    const startTime = Date.now()

    try {
      // 1. Analyser le scope via Claude API (2-3 sec)
      const scope = await analyzeScope(input)

      // 2. Determiner le tier recommande
      const tierRecommande = calculateRecommendedTier(input, scope)

      // 3. Recuperer le template de service
      const serviceTemplate = SERVICE_TEMPLATES[scope.type_projet] || SERVICE_TEMPLATES['site_vitrine']

      // 4. Calculer les conditions de paiement
      const paiement = this.calculatePaymentTerms(serviceTemplate[tierRecommande].prix_affiche)

      // 5. Preparer les add-ons
      const addOns = this.generateAddOns(scope)

      // 6. Compiler le template HTML avec les variables
      const compiledTemplate = Handlebars.compile(DEVIS_HTML_TEMPLATE)
      const devisId = `DEV-${new Date().getFullYear()}-${uuidv4().slice(0, 8).toUpperCase()}`
      const dateDevis = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
      const dateExpiration = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

      const html = compiledTemplate({
        // Couverture
        type_projet_display: serviceTemplate.display_name,
        entreprise_nom: input.entreprise.nom,
        prospect_prenom: input.prospect.prenom,
        prospect_nom: input.prospect.nom,
        prospect_poste: input.prospect.poste,
        date_devis: dateDevis,
        devis_reference: devisId,
        validite_jours: 30,
        date_expiration: dateExpiration,

        // Scope
        scope_personnalise: scope.description_scope,
        livrables: scope.livrables,

        // Tiers
        bronze_nom: serviceTemplate.bronze.nom,
        bronze_prix: new Intl.NumberFormat('fr-FR').format(serviceTemplate.bronze.prix_affiche),
        bronze_features: [...serviceTemplate.bronze.features, ...scope.features_bronze],
        bronze_timeline: serviceTemplate.bronze.timeline_semaines,
        bronze_recommended: tierRecommande === 'bronze',

        silver_nom: serviceTemplate.silver.nom,
        silver_prix: new Intl.NumberFormat('fr-FR').format(serviceTemplate.silver.prix_affiche),
        silver_features: [...serviceTemplate.silver.features, ...scope.features_silver],
        silver_timeline: serviceTemplate.silver.timeline_semaines,
        silver_recommended: tierRecommande === 'silver',

        gold_nom: serviceTemplate.gold.nom,
        gold_prix: new Intl.NumberFormat('fr-FR').format(serviceTemplate.gold.prix_affiche),
        gold_features: [...serviceTemplate.gold.features, ...scope.features_gold],
        gold_timeline: serviceTemplate.gold.timeline_semaines,
        gold_recommended: tierRecommande === 'gold',

        recommended_label: serviceTemplate[tierRecommande].label,

        // Add-ons
        add_ons: addOns,

        // Paiement
        ...paiement,
      })

      // 7. Generer le PDF via Puppeteer (5-8 sec)
      const pdfBuffer = await this.generatePDF(html)

      // 8. Sauvegarder le PDF et obtenir l'URL
      const trackingId = uuidv4()
      const pdfUrl = await this.savePDF(pdfBuffer, devisId, trackingId)

      // 9. Envoyer le devis par email
      await this.sendDevisEmail(input, devisId, pdfUrl, pdfBuffer, trackingId, scope)

      // 10. Mettre a jour le deal en BDD
      const devisResult: DevisGenere = {
        devis_id: devisId,
        deal_id: input.deal_id,
        prospect_id: input.prospect_id,
        pdf_buffer: pdfBuffer,
        pdf_url: pdfUrl,
        tier_recommande: tierRecommande,
        montant_bronze: serviceTemplate.bronze.prix_affiche,
        montant_silver: serviceTemplate.silver.prix_affiche,
        montant_gold: serviceTemplate.gold.prix_affiche,
        scope_personnalise: scope.description_scope,
        validite_jours: 30,
        tracking_id: trackingId,
        created_at: new Date().toISOString(),
      }

      await db.deals.update({
        deal_id: input.deal_id,
        stage: 'DEVIS_CREE',
        devis_id: devisId,
        devis_url: pdfUrl,
        montant_estime: serviceTemplate[tierRecommande].prix_affiche,
        tier_recommande: tierRecommande,
        devis_envoye_at: new Date(),
        tracking_id: trackingId,
      })

      // 11. Notifier Jonathan sur Slack
      const generationTimeMs = Date.now() - startTime
      await this.notifyJonathan(input, devisResult, scope, generationTimeMs)

      // 12. Planifier la premiere relance (J+3)
      await this.scheduleFirstFollowUp(input, devisResult)

      return devisResult

    } catch (error: any) {
      console.error(`[Agent8a] Erreur generation devis pour deal ${input.deal_id}:`, error)
      await slack.send('#deals-errors', {
        text: `Erreur generation devis : ${input.entreprise.nom} - ${error.message}`
      })
      throw error
    }
  }

  private calculatePaymentTerms(montant: number): Record<string, any> {
    // Projets < 10 000 EUR : 50/50
    if (montant < 10000) {
      return {
        paiement_acompte_pct: 50,
        paiement_acompte_montant: new Intl.NumberFormat('fr-FR').format(Math.round(montant * 0.5)),
        paiement_intermediaire: false,
        paiement_solde_pct: 50,
        paiement_solde_montant: new Intl.NumberFormat('fr-FR').format(Math.round(montant * 0.5)),
      }
    }

    // Projets >= 10 000 EUR : 30/40/30
    return {
      paiement_acompte_pct: 30,
      paiement_acompte_montant: new Intl.NumberFormat('fr-FR').format(Math.round(montant * 0.3)),
      paiement_intermediaire: true,
      paiement_intermediaire_pct: 40,
      paiement_intermediaire_montant: new Intl.NumberFormat('fr-FR').format(Math.round(montant * 0.4)),
      paiement_solde_pct: 30,
      paiement_solde_montant: new Intl.NumberFormat('fr-FR').format(Math.round(montant * 0.3)),
    }
  }

  private generateAddOns(scope: ScopeAnalysis): Array<{ nom: string; description: string; prix: string }> {
    const addOns: Array<{ nom: string; description: string; prix: string }> = []

    // Maintenance mensuelle
    addOns.push({
      nom: 'Maintenance mensuelle',
      description: 'Mises a jour, sauvegardes, monitoring, corrections bugs',
      prix: 'A partir de 89 EUR/mois',
    })

    // Formation
    addOns.push({
      nom: 'Formation supplementaire',
      description: 'Sessions de formation equipe (back-office, analytics, SEO)',
      prix: '150 EUR/heure',
    })

    // Support prioritaire
    if (scope.type_projet !== 'tracking_server_side') {
      addOns.push({
        nom: 'Support prioritaire',
        description: 'Temps de reponse garanti < 4h, canal Slack dedie',
        prix: '299 EUR/mois',
      })
    }

    // Add-ons specifiques au projet
    for (const addon of scope.add_ons_suggeres) {
      if (addon.toLowerCase().includes('seo')) {
        addOns.push({
          nom: 'Accompagnement SEO',
          description: 'Audit SEO mensuel, reporting, recommandations',
          prix: '490 EUR/mois',
        })
      }
      if (addon.toLowerCase().includes('migration')) {
        addOns.push({
          nom: 'Migration de donnees',
          description: 'Migration des contenus/produits depuis l\'ancien site',
          prix: 'Sur devis (selon volume)',
        })
      }
    }

    return addOns
  }

  private async generatePDF(html: string): Promise<Buffer> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
    }

    const page = await this.browser.newPage()
    try {
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '25mm', right: '20mm', bottom: '25mm', left: '20mm' },
        displayHeaderFooter: false,
      })
      return Buffer.from(pdfBuffer)
    } finally {
      await page.close()
    }
  }

  private async savePDF(buffer: Buffer, devisId: string, trackingId: string): Promise<string> {
    // Sauvegarder sur S3/Minio ou filesystem local
    const filename = `devis/${devisId}.pdf`
    const url = await storageService.upload(filename, buffer, 'application/pdf')

    // Creer un lien de tracking (proxy qui log les ouvertures)
    const trackingUrl = `${process.env.AXIOM_API_URL}/devis/view/${trackingId}`
    await db.devis_tracking.create({
      tracking_id: trackingId,
      devis_id: devisId,
      pdf_url: url,
      created_at: new Date(),
      opens: 0,
      last_opened_at: null,
    })

    return trackingUrl
  }

  private async sendDevisEmail(
    input: DealmakerInput,
    devisId: string,
    pdfUrl: string,
    pdfBuffer: Buffer,
    trackingId: string,
    scope: ScopeAnalysis
  ): Promise<void> {
    const tierRecommande = calculateRecommendedTier(input, scope)
    const template = SERVICE_TEMPLATES[scope.type_projet]

    const subject = `Proposition Axiom - ${template.display_name} pour ${input.entreprise.nom}`
    const body = `Bonjour ${input.prospect.prenom},

Suite a notre echange du ${new Date(input.rdv_decouverte.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}, je vous transmets notre proposition pour votre projet de ${template.display_name.toLowerCase()}.

${scope.description_scope}

Vous trouverez dans le document ci-joint trois formules adaptees a vos besoins. Je recommande la formule "${template[tierRecommande].nom}" qui correspond le mieux a ce que nous avons evoque ensemble.

Le devis est accessible ici : ${pdfUrl}

Je reste disponible pour echanger sur le contenu de la proposition ou l'adapter si necessaire.

A tres bientot,

Jonathan Dewaele
Axiom Marketing
jonathan@axiom-marketing.fr
+33 6 XX XX XX XX`

    await emailService.send({
      from: 'Jonathan Dewaele <jonathan@axiom-marketing.fr>',
      to: `${input.prospect.prenom} ${input.prospect.nom} <${input.prospect.email}>`,
      subject,
      text: body,
      attachments: [{
        filename: `Devis_Axiom_${input.entreprise.nom.replace(/\s+/g, '_')}_${devisId}.pdf`,
        content: pdfBuffer,
      }],
      headers: {
        'X-Axiom-Devis-ID': devisId,
        'X-Axiom-Deal-ID': input.deal_id,
        'X-Axiom-Tracking-ID': trackingId,
      }
    })
  }

  private async notifyJonathan(
    input: DealmakerInput,
    devis: DevisGenere,
    scope: ScopeAnalysis,
    generationTimeMs: number
  ): Promise<void> {
    await slack.send('#deals', {
      text: `Devis genere et envoye`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `Devis envoye : ${input.entreprise.nom}` }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Prospect :* ${input.prospect.prenom} ${input.prospect.nom}` },
            { type: 'mrkdwn', text: `*Poste :* ${input.prospect.poste}` },
            { type: 'mrkdwn', text: `*Type :* ${scope.type_projet}` },
            { type: 'mrkdwn', text: `*Tier recommande :* ${devis.tier_recommande.toUpperCase()}` },
            { type: 'mrkdwn', text: `*Montant :* ${new Intl.NumberFormat('fr-FR').format(SERVICE_TEMPLATES[scope.type_projet][devis.tier_recommande].prix_affiche)} EUR HT` },
            { type: 'mrkdwn', text: `*Genere en :* ${(generationTimeMs / 1000).toFixed(1)}s` },
          ]
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Voir le devis' },
              url: devis.pdf_url,
              action_id: 'view_devis',
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Modifier le devis' },
              action_id: 'edit_devis',
              value: devis.devis_id,
            }
          ]
        }
      ]
    })
  }

  private async scheduleFirstFollowUp(input: DealmakerInput, devis: DevisGenere): Promise<void> {
    // Planifier la premiere relance a J+3
    await dealmakerQueue.add(
      `followup-${input.deal_id}`,
      {
        type: 'FOLLOW_UP',
        deal_id: input.deal_id,
        prospect_id: input.prospect_id,
        devis_id: devis.devis_id,
        step: 1,
        tracking_id: devis.tracking_id,
      },
      {
        delay: 3 * 24 * 60 * 60 * 1000, // 3 jours
        priority: 3,
      }
    )
  }
}
```

#### 3a.5 Tracking d'ouverture du devis

```typescript
// Endpoint de tracking des ouvertures de devis
// Route : GET /devis/view/:trackingId
async function handleDevisView(trackingId: string, req: Request, res: Response): Promise<void> {
  const tracking = await db.devis_tracking.findByTrackingId(trackingId)
  if (!tracking) {
    res.status(404).send('Devis non trouve')
    return
  }

  // Logger l'ouverture
  const openData = {
    tracking_id: trackingId,
    opened_at: new Date(),
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    referer: req.headers['referer'] || null,
  }

  await db.devis_opens.create(openData)

  // Incrementer le compteur
  const newCount = tracking.opens + 1
  await db.devis_tracking.update({
    tracking_id: trackingId,
    opens: newCount,
    last_opened_at: new Date(),
  })

  // Signaux d'achat basee sur les ouvertures
  if (newCount === 1) {
    // Premiere ouverture : signal faible (+1 point)
    await updateEngagementScore(tracking.devis_id, 'devis_ouvert', 1)
  } else if (newCount >= 3) {
    // 3+ ouvertures : signal fort (+20 points) -- probable partage interne
    await updateEngagementScore(tracking.devis_id, 'devis_multi_ouvert', 20)

    // Alerter Jonathan
    const deal = await db.deals.findByDevisId(tracking.devis_id)
    await slack.send('#deals', {
      text: `Signal d'achat fort : le devis pour ${deal.entreprise_nom} a ete ouvert ${newCount} fois. Probable partage interne.`,
    })
  }

  // Rediriger vers le PDF reel
  res.redirect(tracking.pdf_url)
}
```

#### 3a.6 Psychologie du tiering (Decoy Effect)

**Principe applique :**

Le Decoy Effect (effet de leurre) consiste a presenter une option "decoy" (leurre) qui rend l'option cible plus attractive par comparaison.

**Application Axiom :**

| Role | Tier | Objectif |
|------|------|----------|
| **Decoy d'entree** | Bronze | Attirer l'attention, montrer qu'un prix bas existe, mais les features limitees poussent vers Silver |
| **Cible** | Silver | Sweet spot valeur/prix. Badge "Le plus choisi". 60-70% des conversions attendues |
| **Ancrage haut** | Gold | Justifie le prix du Silver par contraste. Donne une perception de "bonne affaire" sur Silver |

**Donnees attendues :**
- Bronze : 10-15% des conversions
- Silver : 60-70% des conversions (cible)
- Gold : 15-25% des conversions

**Tactiques visuelles dans le PDF :**
- Silver toujours au centre (center-stage effect)
- Badge "Le plus choisi" en couleur (#4F46E5)
- Carte Silver sureleve (border plus epaisse, fond colore)
- Prix Gold affiche en premier (ancrage psychologique)

---

### 3b. SOUS-AGENT 8b -- RELANCEUR DE DEALS

#### 3b.1 Mission

Relancer les prospects apres envoi du devis selon une sequence optimisee, detecter les signaux d'achat (ouvertures, visites pricing, forward a collegue), gerer les objections par email, et identifier les prospects fantomes pour breakup ou transfert vers nurturing.

#### 3b.2 Architecture technique

```
Devis envoye (stage DEVIS_CREE)
    |
    v
+---------------------------------------------------+
| SOUS-AGENT 8b : RELANCEUR DE DEALS                |
| 1. Sequence de relance J3/J7/J14 + breakup        |
| 2. Detection signaux d'achat (score engagement)    |
| 3. Templates de relance par objection              |
| 4. Gestion prospects fantomes                      |
| 5. Escalade Jonathan si signal fort                 |
+---------------------------------------------------+
    |
    +---> [Prospect repond] --> Sous-agent 8c (Signature)
    +---> [Prospect fantome] --> Agent 6 (NURTUREUR)
    +---> [Signal fort] --> Notification Jonathan
```

#### 3b.3 Sequence de relance post-devis

| Jour | Action | Canal | Template | Taux reponse attendu |
|------|--------|-------|---------|---------------------|
| J0 | Envoi devis | Email | Email d'accompagnement du devis | -- |
| J3 | Verification reception | Email | `followup_reception` | 31% |
| J7 | Traitement objection / angle valeur | Email | `followup_valeur` | 27% |
| J14 | Breakup email | Email | `followup_breakup` | 33% |
| J14 | Changement canal (si aucune reponse email) | LinkedIn | `linkedin_devis_followup` | 12% |
| J21 | LinkedIn case study | LinkedIn | `linkedin_case_study` | 10% |
| J30 | Dernier contact reconquete | Email | `reconquete_final` | 8% |
| J45 | Passage en PERDU | Systeme | -- | -- |

**Regles critiques :**
- Espacer les relances de minimum 3 jours (J+1 = -11% taux reponse)
- Maximum 4 emails avant de basculer vers LinkedIn
- Si engagement score >= 25, escalader immediatement a Jonathan pour appel
- Si aucune reponse apres le breakup email : attendre 7 jours puis LinkedIn
- Si aucune reponse J+45 : statut "PERDU", transfert Agent 6

#### 3b.4 Code TypeScript complet

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { db, slack, emailService, linkedinService, dealmakerQueue } from './services'

// ============================================================
// INTERFACES
// ============================================================

interface FollowUpJob {
  type: 'FOLLOW_UP'
  deal_id: string
  prospect_id: string
  devis_id: string
  step: number            // 1=J3, 2=J7, 3=J14(breakup), 4=J14(LinkedIn), 5=J21, 6=J30
  tracking_id: string
}

interface EngagementScore {
  deal_id: string
  score: number
  signals: Array<{
    type: string
    points: number
    detected_at: string
  }>
  last_updated: string
}

interface BuySignal {
  type: 'devis_ouvert' | 'devis_multi_ouvert' | 'page_pricing' | 'reponse_question' |
        'linkedin_engagement' | 'forward_interne' | 'demande_info' | 'meeting_accepte'
  score_impact: number
  action: 'log_only' | 'alert_jonathan' | 'alert_jonathan_urgent' |
          'send_case_study' | 'fast_reply_required' | 'schedule_call'
}

// ============================================================
// SIGNAUX D'ACHAT + SCORING
// ============================================================

const BUY_SIGNALS: BuySignal[] = [
  { type: 'devis_ouvert',        score_impact: 1,  action: 'log_only' },
  { type: 'devis_multi_ouvert',  score_impact: 20, action: 'alert_jonathan' },       // 3+ ouvertures
  { type: 'page_pricing',        score_impact: 20, action: 'send_case_study' },
  { type: 'reponse_question',    score_impact: 25, action: 'fast_reply_required' },
  { type: 'linkedin_engagement', score_impact: 10, action: 'log_only' },
  { type: 'forward_interne',     score_impact: 15, action: 'alert_jonathan_urgent' }, // Prospect forwarde le devis
  { type: 'demande_info',        score_impact: 20, action: 'schedule_call' },
  { type: 'meeting_accepte',     score_impact: 50, action: 'alert_jonathan_urgent' },
]

// Seuils de decision
const SCORE_THRESHOLDS = {
  RELANCE_AGRESSIVE: 25,   // Score >= 25 : relancer immediatement + escalade Jonathan
  NURTURE: 10,              // Score 10-24 : envoyer du contenu education
  BREAKUP: 9,               // Score 0-9 : envoyer breakup email
  READY_TO_SIGN: 75,        // Score >= 75 : notification prioritaire "Ready to Sign"
}

async function updateEngagementScore(
  dealId: string,
  signalType: string,
  points: number
): Promise<EngagementScore> {
  const existing = await db.engagement_scores.findByDealId(dealId)

  const newSignal = {
    type: signalType,
    points,
    detected_at: new Date().toISOString(),
  }

  if (existing) {
    existing.score += points
    existing.signals.push(newSignal)
    existing.last_updated = new Date().toISOString()
    await db.engagement_scores.update(existing)

    // Verifier les seuils
    if (existing.score >= SCORE_THRESHOLDS.READY_TO_SIGN) {
      await notifyReadyToSign(dealId, existing)
    } else if (existing.score >= SCORE_THRESHOLDS.RELANCE_AGRESSIVE) {
      await triggerAggressiveFollowUp(dealId, existing)
    }

    return existing
  }

  const newScore: EngagementScore = {
    deal_id: dealId,
    score: points,
    signals: [newSignal],
    last_updated: new Date().toISOString(),
  }
  await db.engagement_scores.create(newScore)
  return newScore
}

async function notifyReadyToSign(dealId: string, score: EngagementScore): Promise<void> {
  const deal = await db.deals.findById(dealId)
  await slack.send('#deals', {
    text: `:fire: READY TO SIGN : ${deal.entreprise_nom} (score engagement: ${score.score}). Appeler MAINTENANT.`,
  })
}

async function triggerAggressiveFollowUp(dealId: string, score: EngagementScore): Promise<void> {
  const deal = await db.deals.findById(dealId)
  await slack.send('#deals', {
    text: `Signal d'achat fort pour ${deal.entreprise_nom} (score: ${score.score}). Envisager appel Jonathan.`,
  })
}

// ============================================================
// TEMPLATES DE RELANCE
// ============================================================

const FOLLOW_UP_TEMPLATES: Record<string, {
  subject: string
  body: string
  canal: 'email' | 'linkedin'
}> = {

  // --- J3 : VERIFICATION RECEPTION ---
  followup_reception: {
    subject: 'Re: Proposition Axiom - {{type_projet}} pour {{entreprise_nom}}',
    canal: 'email',
    body: `Bonjour {{prenom}},

Je voulais m'assurer que vous avez bien recu notre proposition envoyee {{jour_envoi}}.

Si vous avez des questions sur le contenu ou souhaitez qu'on ajuste certains elements, n'hesitez pas.

Je suis disponible pour un appel rapide de 15 min si ca peut etre utile.

A bientot,
Jonathan`
  },

  // --- J7 : ANGLE VALEUR ---
  followup_valeur: {
    subject: 'Un point cle sur votre projet {{type_projet}}',
    canal: 'email',
    body: `Bonjour {{prenom}},

En repensant a notre echange, un element me semble important a souligner : {{point_valeur_specifique}}.

Pour info, nous avons recemment accompagne {{entreprise_similaire}} sur un projet comparable, avec des resultats concrets en {{delai_resultats}}.

Si le budget est une consideration, sachez que nous proposons un echelonnement de paiement ({{echeancier}}) qui rend le projet plus accessible.

Dites-moi ce qui vous conviendrait pour avancer.

Jonathan`
  },

  // --- J14 : BREAKUP EMAIL ---
  followup_breakup: {
    subject: 'Juste une clarification, {{prenom}}',
    canal: 'email',
    body: `Bonjour {{prenom}},

Ca fait deux semaines et je n'ai pas eu de retour. C'est probablement un signe que :

- Le timing n'est pas le bon
- La proposition ne correspond pas exactement
- Vous avez d'autres priorites en ce moment

Je ne vais pas continuer a vous relancer inutilement.

Deux options simples :

A) On reprend contact en {{mois_relance}} quand ca sera plus pertinent
B) Je retire votre dossier de mes suivis

Pas de jugement. Juste de la clarte de part et d'autre.

Jonathan`
  },

  // --- J14 : LINKEDIN (CHANGEMENT CANAL) ---
  linkedin_devis_followup: {
    subject: '',
    canal: 'linkedin',
    body: `Bonjour {{prenom}}, je vous avais transmis une proposition pour votre projet {{type_projet}} il y a quelques jours. Je me permets de vous relancer ici au cas ou l'email serait passe inapercu. Dites-moi si vous avez des questions ou si on ajuste quelque chose.`
  },

  // --- J21 : LINKEDIN CASE STUDY ---
  linkedin_case_study: {
    subject: '',
    canal: 'linkedin',
    body: `Bonjour {{prenom}}, je pensais a vous en voyant les resultats de notre dernier projet {{type_projet}} pour {{entreprise_similaire}}. {{resultats_concrets}}. Si ca vous parle pour {{entreprise_nom}}, on peut en discuter rapidement.`
  },

  // --- J30 : RECONQUETE FINALE ---
  reconquete_final: {
    subject: 'Dernier point - {{entreprise_nom}} x Axiom',
    canal: 'email',
    body: `Bonjour {{prenom}},

Je reviens une derniere fois vers vous concernant votre projet {{type_projet}}.

Depuis notre dernier echange, nous avons lance 3 projets similaires et affine notre approche. Si le sujet reste pertinent pour {{entreprise_nom}}, je vous propose un nouveau point de 15 min pour actualiser notre proposition.

Voici mon lien Calendly pour choisir un creneau : {{calendly_url}}

Si le sujet n'est plus d'actualite, je comprends parfaitement.

Bonne continuation,
Jonathan`
  },
}

// ============================================================
// TEMPLATES DE REPONSE AUX OBJECTIONS
// ============================================================

const OBJECTION_TEMPLATES: Record<string, {
  subject: string
  body: string
}> = {

  // --- OBJECTION : PRIX TROP ELEVE ---
  prix_eleve: {
    subject: 'Re: {{subject_original}} - Flexibilite tarifaire',
    body: `Bonjour {{prenom}},

Je comprends que l'investissement puisse paraitre important. Quelques elements pour eclairer votre reflexion :

1. **Formule adaptee** : Nous avons aussi une formule "{{tier_inferieur}}" a {{prix_tier_inferieur}} EUR HT, qui couvre vos besoins essentiels.

2. **Echelonnement** : Nous proposons un paiement en {{nb_echeances}} fois ({{detail_echeances}}), ce qui revient a {{montant_mensuel}} EUR/mois.

3. **ROI mesurable** : Sur la base de projets similaires, le retour sur investissement se situe entre {{roi_mois_min}} et {{roi_mois_max}} mois.

Voulez-vous qu'on ajuste la proposition sur la formule {{tier_inferieur}} avec echelonnement ?

Jonathan`
  },

  // --- OBJECTION : PAS LE BON MOMENT ---
  timing: {
    subject: 'Re: {{subject_original}} - On planifie ?',
    body: `Bonjour {{prenom}},

Je comprends, le timing est important.

Deux questions rapides pour qu'on se retrouve au bon moment :

- Votre budget pour ce type de projet est-il prevu sur quel trimestre ?
- Y a-t-il un evenement / deadline qui rendrait le projet plus urgent (lancement produit, refonte obligatoire, etc.) ?

Si {{mois_suggestion}} est plus confortable, je vous propose de bloquer un creneau des maintenant : {{calendly_url}}

En attendant, "pas maintenant" ne signifie pas "jamais" -- et chaque mois sans {{benefice_principal}} represente un manque a gagner.

A bientot,
Jonathan`
  },

  // --- OBJECTION : CONCURRENCE EN LICE ---
  concurrence: {
    subject: 'Re: {{subject_original}} - Ce qui nous differencie',
    body: `Bonjour {{prenom}},

C'est une bonne demarche de comparer. Voici ce qui differencie Axiom :

1. **Qualite** : Nous ne sous-traitons rien. Tout est fait en interne par notre equipe senior.
2. **Inclusions** : Notre formule {{tier_recommande}} inclut deja {{inclusions_differenciantes}} (souvent en option ailleurs).
3. **Transparence** : Pas de frais caches. Le prix affiche est le prix final.
4. **Resultats** : {{reference_client}} a obtenu {{resultat_concret}} apres notre accompagnement.

Avez-vous clarifie ces points avec {{concurrent}} ?

Je suis disponible pour un comparatif point par point si ca peut aider.

Jonathan`
  },

  // --- OBJECTION : PAS DE BUDGET ---
  budget: {
    subject: 'Re: {{subject_original}} - Solutions budgetaires',
    body: `Bonjour {{prenom}},

Le budget est une contrainte reelle. Voici quelques pistes :

1. **Demarrer petit** : Notre formule {{tier_bronze}} a {{prix_bronze}} EUR couvre les fondamentaux. On peut monter en puissance ensuite.

2. **Echelonnement** : Jusqu'a {{nb_echeances}} mois de paiement sans frais.

3. **Phase 1 / Phase 2** : On decoupe le projet en phases. Phase 1 avec le budget disponible, Phase 2 quand le budget se libere.

4. **ROI rapide** : {{argument_roi}} peut financer la Phase 2.

Quel scenario correspondrait le mieux a votre situation ?

Jonathan`
  },

  // --- OBJECTION : INACTION / INDECISION ---
  inaction: {
    subject: 'On simplifie ? 2 options claires',
    body: `Bonjour {{prenom}},

J'ai l'impression qu'on s'est peut-etre complique les choses. Simplifions :

**OPTION A (rapide)** : Formule {{tier_bronze}} a {{prix_bronze}} EUR
{{resume_bronze}}
Livraison : {{timeline_bronze}} semaines

**OPTION B (complet)** : Formule {{tier_recommande}} a {{prix_recommande}} EUR
{{resume_recommande}}
Livraison : {{timeline_recommande}} semaines

Lequel resonne le plus ? Et quel serait le meilleur moment pour demarrer ?

Jonathan`
  },
}

// ============================================================
// CLASSE PRINCIPALE : RELANCEUR DE DEALS
// ============================================================

class SubAgent8b_RelanceurDeals {

  async processFollowUp(job: FollowUpJob): Promise<void> {
    const deal = await db.deals.findById(job.deal_id)
    if (!deal) {
      console.warn(`[Agent8b] Deal ${job.deal_id} non trouve`)
      return
    }

    // Verifier que le deal est toujours actif (pas deja signe ou perdu)
    if (['GAGNE', 'PERDU', 'SIGNATURE_EN_COURS'].includes(deal.stage)) {
      console.info(`[Agent8b] Deal ${job.deal_id} en stage ${deal.stage}, pas de relance`)
      return
    }

    // Verifier si le prospect a repondu entre-temps
    const recentReply = await db.replies.findRecent(job.prospect_id, 48) // 48h
    if (recentReply) {
      console.info(`[Agent8b] Prospect ${job.prospect_id} a repondu, annulation relance`)
      return
    }

    // Recuperer le score d'engagement
    const engagement = await db.engagement_scores.findByDealId(job.deal_id)
    const score = engagement?.score || 0

    // Router selon l'etape
    switch (job.step) {
      case 1: // J3 : verification reception
        await this.sendFollowUp(deal, 'followup_reception', job)
        await this.scheduleNext(job, 2, 4) // Prochaine relance dans 4 jours (J7)
        break

      case 2: // J7 : angle valeur
        await this.sendFollowUp(deal, 'followup_valeur', job)
        await this.scheduleNext(job, 3, 7) // Prochaine relance dans 7 jours (J14)
        break

      case 3: // J14 : breakup email
        if (score >= SCORE_THRESHOLDS.RELANCE_AGRESSIVE) {
          // Score eleve : ne pas envoyer de breakup, escalader a Jonathan
          await slack.send('#deals', {
            text: `Deal ${deal.entreprise_nom} : score engagement ${score}, pas de breakup. Appel Jonathan recommande.`,
          })
        } else {
          await this.sendFollowUp(deal, 'followup_breakup', job)
        }
        // Planifier aussi une relance LinkedIn le meme jour
        await this.scheduleNext(job, 4, 0) // LinkedIn immediatement
        break

      case 4: // J14 : LinkedIn (changement de canal)
        if (deal.prospect_linkedin_url) {
          await this.sendLinkedInMessage(deal, 'linkedin_devis_followup')
        }
        await this.scheduleNext(job, 5, 7) // J21
        break

      case 5: // J21 : LinkedIn case study
        if (deal.prospect_linkedin_url) {
          await this.sendLinkedInMessage(deal, 'linkedin_case_study')
        }
        await this.scheduleNext(job, 6, 9) // J30
        break

      case 6: // J30 : reconquete finale
        await this.sendFollowUp(deal, 'reconquete_final', job)
        // Planifier le passage en PERDU dans 15 jours (J45)
        await this.scheduleLostDeal(job, 15)
        break
    }

    // Logger la relance
    await db.deal_activities.create({
      deal_id: job.deal_id,
      type: 'FOLLOW_UP',
      step: job.step,
      engagement_score: score,
      created_at: new Date(),
    })
  }

  private async sendFollowUp(deal: any, templateKey: string, job: FollowUpJob): Promise<void> {
    const template = FOLLOW_UP_TEMPLATES[templateKey]
    if (!template || template.canal !== 'email') return

    // Personnaliser le template avec les variables du deal
    const variables = await this.buildTemplateVariables(deal)
    const subject = this.interpolate(template.subject, variables)
    const body = this.interpolate(template.body, variables)

    await emailService.send({
      from: 'Jonathan Dewaele <jonathan@axiom-marketing.fr>',
      to: `${deal.prospect_prenom} ${deal.prospect_nom} <${deal.prospect_email}>`,
      subject,
      text: body,
      headers: {
        'X-Axiom-Deal-ID': deal.deal_id,
        'X-Axiom-Follow-Up-Step': String(job.step),
      }
    })

    // Mettre a jour le nombre de relances
    await db.deals.update({
      deal_id: deal.deal_id,
      nb_relances: (deal.nb_relances || 0) + 1,
      derniere_relance_at: new Date(),
    })
  }

  private async sendLinkedInMessage(deal: any, templateKey: string): Promise<void> {
    const template = FOLLOW_UP_TEMPLATES[templateKey]
    if (!template) return

    const variables = await this.buildTemplateVariables(deal)
    const body = this.interpolate(template.body, variables)

    try {
      await linkedinService.sendMessage(deal.prospect_linkedin_url, body)
    } catch (error) {
      console.warn(`[Agent8b] Echec envoi LinkedIn pour ${deal.deal_id}:`, error)
    }
  }

  async handleObjection(deal: any, objectionType: string, prospectReply: string): Promise<void> {
    const template = OBJECTION_TEMPLATES[objectionType]
    if (!template) {
      console.warn(`[Agent8b] Template objection inconnu: ${objectionType}`)
      return
    }

    // Generer une reponse personnalisee via Claude API
    const variables = await this.buildTemplateVariables(deal)

    // Enrichir les variables avec le contexte de l'objection
    const enrichedVariables = await this.enrichObjectionVariables(deal, objectionType, prospectReply, variables)

    const subject = this.interpolate(template.subject, enrichedVariables)
    const body = this.interpolate(template.body, enrichedVariables)

    // Envoyer la reponse (apres validation Jonathan si deal > 15 000 EUR)
    if (deal.montant_estime > 15000) {
      // Soumettre a validation Jonathan
      await slack.send('#deals', {
        text: `Reponse objection "${objectionType}" pour ${deal.entreprise_nom} (${deal.montant_estime} EUR). Valider avant envoi.`,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `*Objection :* ${objectionType}\n*Reponse prospect :* ${prospectReply}\n\n*Reponse proposee :*\n${body}` } },
          {
            type: 'actions',
            elements: [
              { type: 'button', text: { type: 'plain_text', text: 'Envoyer' }, action_id: 'approve_objection_reply', value: deal.deal_id, style: 'primary' },
              { type: 'button', text: { type: 'plain_text', text: 'Modifier' }, action_id: 'edit_objection_reply', value: deal.deal_id },
            ]
          }
        ]
      })
    } else {
      // Envoi automatique pour deals < 15 000 EUR
      await emailService.send({
        from: 'Jonathan Dewaele <jonathan@axiom-marketing.fr>',
        to: deal.prospect_email,
        subject,
        text: body,
      })
    }

    // Mettre a jour le stage du deal
    await db.deals.update({
      deal_id: deal.deal_id,
      stage: 'NEGOCIATION',
      derniere_objection: objectionType,
      derniere_objection_at: new Date(),
    })
  }

  private async enrichObjectionVariables(
    deal: any,
    objectionType: string,
    prospectReply: string,
    baseVariables: Record<string, string>
  ): Promise<Record<string, string>> {
    const template = SERVICE_TEMPLATES[deal.type_projet]
    if (!template) return baseVariables

    const enriched = { ...baseVariables }

    // Variables specifiques par type d'objection
    switch (objectionType) {
      case 'prix_eleve':
        const tierOrder: Array<'bronze' | 'silver' | 'gold'> = ['bronze', 'silver', 'gold']
        const currentTierIndex = tierOrder.indexOf(deal.tier_recommande)
        const lowerTier = currentTierIndex > 0 ? tierOrder[currentTierIndex - 1] : 'bronze'
        enriched.tier_inferieur = template[lowerTier].nom
        enriched.prix_tier_inferieur = String(template[lowerTier].prix_affiche)
        enriched.nb_echeances = deal.montant_estime >= 10000 ? '3' : '2'
        enriched.detail_echeances = deal.montant_estime >= 10000 ? '30/40/30' : '50/50'
        enriched.montant_mensuel = String(Math.round(template[deal.tier_recommande].prix_affiche / (deal.montant_estime >= 10000 ? 3 : 2)))
        enriched.roi_mois_min = '3'
        enriched.roi_mois_max = '6'
        break

      case 'timing':
        enriched.mois_suggestion = this.suggestMonth()
        enriched.benefice_principal = this.getBeneficePrincipal(deal.type_projet)
        break

      case 'concurrence':
        enriched.concurrent = deal.concurrent_mentionne || 'l\'autre prestataire'
        enriched.inclusions_differenciantes = this.getInclusions(deal.type_projet)
        enriched.reference_client = 'un client du meme secteur'
        enriched.resultat_concret = this.getResultatConcret(deal.type_projet)
        break

      case 'budget':
        enriched.tier_bronze = template.bronze.nom
        enriched.prix_bronze = String(template.bronze.prix_affiche)
        enriched.nb_echeances = '3'
        enriched.argument_roi = this.getROIArgument(deal.type_projet)
        break

      case 'inaction':
        enriched.tier_bronze = template.bronze.nom
        enriched.prix_bronze = String(template.bronze.prix_affiche)
        enriched.resume_bronze = template.bronze.features.slice(0, 3).join(', ')
        enriched.timeline_bronze = String(template.bronze.timeline_semaines)
        enriched.tier_recommande = template[deal.tier_recommande].nom
        enriched.prix_recommande = String(template[deal.tier_recommande].prix_affiche)
        enriched.resume_recommande = template[deal.tier_recommande].features.slice(0, 3).join(', ')
        enriched.timeline_recommande = String(template[deal.tier_recommande].timeline_semaines)
        break
    }

    return enriched
  }

  private async buildTemplateVariables(deal: any): Promise<Record<string, string>> {
    return {
      prenom: deal.prospect_prenom,
      nom: deal.prospect_nom,
      entreprise_nom: deal.entreprise_nom,
      type_projet: deal.type_projet || 'projet',
      subject_original: deal.dernier_subject || '',
      tier_recommande: deal.tier_recommande || 'silver',
      calendly_url: process.env.CALENDLY_URL || 'https://calendly.com/jonathan-axiom/30min',
      jour_envoi: new Date(deal.devis_envoye_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
      point_valeur_specifique: deal.rdv_notes?.points_sensibles || 'l\'optimisation de votre presence digitale',
      entreprise_similaire: 'une entreprise similaire de votre secteur',
      delai_resultats: '3 mois',
      echeancier: deal.montant_estime >= 10000 ? '30/40/30' : '50/50',
      mois_relance: this.suggestMonth(),
      resultats_concrets: 'un gain de 40% en performance',
    }
  }

  private interpolate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `[${key}]`)
  }

  private async scheduleNext(job: FollowUpJob, nextStep: number, delayDays: number): Promise<void> {
    await dealmakerQueue.add(
      `followup-${job.deal_id}-step${nextStep}`,
      {
        ...job,
        step: nextStep,
      },
      {
        delay: delayDays * 24 * 60 * 60 * 1000,
        priority: 3,
      }
    )
  }

  private async scheduleLostDeal(job: FollowUpJob, delayDays: number): Promise<void> {
    await dealmakerQueue.add(
      `lost-${job.deal_id}`,
      {
        type: 'MARK_LOST',
        deal_id: job.deal_id,
        prospect_id: job.prospect_id,
        reason: 'INACTION',
      },
      {
        delay: delayDays * 24 * 60 * 60 * 1000,
        priority: 5,
      }
    )
  }

  private suggestMonth(): string {
    const now = new Date()
    const future = new Date(now.setMonth(now.getMonth() + 2))
    return future.toLocaleDateString('fr-FR', { month: 'long' })
  }

  private getBeneficePrincipal(typeProjet: string): string {
    const map: Record<string, string> = {
      site_vitrine: 'un site web performant',
      ecommerce_shopify: 'une boutique en ligne qui genere des ventes',
      app_flutter: 'une application mobile pour vos utilisateurs',
      app_metier: 'un outil metier qui accelere vos processus',
      rgaa: 'la conformite accessibilite',
      tracking_server_side: 'un tracking fiable et RGPD',
    }
    return map[typeProjet] || 'une presence digitale optimisee'
  }

  private getInclusions(typeProjet: string): string {
    const map: Record<string, string> = {
      site_vitrine: 'le SEO on-page, la formation et la configuration GA4',
      ecommerce_shopify: 'la configuration Klaviyo, les apps strategiques et le training',
      app_flutter: 'le design UX Figma, les tests et le support post-lancement',
      app_metier: 'l\'API documentee, les tests automatises et le support 4 mois',
      rgaa: 'les tests utilisateurs handicapes et le schema pluriannuel',
      tracking_server_side: 'le Consent Mode V2 et le monitoring',
    }
    return map[typeProjet] || 'la formation et le support'
  }

  private getResultatConcret(typeProjet: string): string {
    const map: Record<string, string> = {
      site_vitrine: '+45% de trafic organique en 6 mois',
      ecommerce_shopify: '+60% de conversion en 3 mois',
      app_flutter: '4.7/5 sur les stores apres 2 mois',
      app_metier: '-30% de temps de traitement des dossiers',
      rgaa: 'score RGAA passe de 45% a 92%',
      tracking_server_side: '+41% de precision des donnees analytics',
    }
    return map[typeProjet] || 'des resultats mesurables rapidement'
  }

  private getROIArgument(typeProjet: string): string {
    const map: Record<string, string> = {
      site_vitrine: 'Le gain de leads via le nouveau site',
      ecommerce_shopify: 'Le chiffre d\'affaires genere par la boutique',
      app_flutter: 'La monetisation de l\'app',
      app_metier: 'Le gain de productivite mesurable',
      rgaa: 'L\'evitement des sanctions legales',
      tracking_server_side: 'L\'optimisation des depenses publicitaires',
    }
    return map[typeProjet] || 'Le retour sur investissement'
  }
}

// ============================================================
// GESTION DES DEALS PERDUS
// ============================================================

async function handleLostDeal(dealId: string, reason: string): Promise<void> {
  const deal = await db.deals.findById(dealId)

  // 1. Mettre a jour le stage
  await db.deals.update({
    deal_id: dealId,
    stage: 'PERDU',
    lost_reason: reason,
    lost_at: new Date(),
  })

  // 2. Transferer vers Agent 6 (NURTUREUR) pour re-nurture
  const lostDealHandoff: LostDealToNurturer = {
    prospect_id: deal.prospect_id,
    deal_id: dealId,
    reason: mapReason(reason),
    detail: deal.derniere_objection || 'Aucune reponse apres 45 jours',
    dernier_contact: deal.derniere_relance_at?.toISOString() || deal.devis_envoye_at.toISOString(),
    historique_touches: deal.nb_relances || 0,
    montant_estime: deal.montant_estime,
    recommendation: generateRecommendation(deal, reason),
    recontact_date: calculateRecontactDate(reason).toISOString(),
  }

  await nurturerQueue.add(
    `lost-deal-${deal.prospect_id}`,
    lostDealHandoff,
    { priority: 5 }
  )

  // 3. Envoyer metriques a l'Agent 7
  await analysteQueue.add('deal-metrics', {
    type: 'deal_lost',
    deal_id: dealId,
    montant: deal.montant_estime,
    reason,
    cycle_days: daysBetween(deal.created_at, new Date()),
    segment: deal.segment,
    nb_relances: deal.nb_relances || 0,
  })

  // 4. Notifier Jonathan
  await slack.send('#deals', {
    text: `Deal PERDU : ${deal.entreprise_nom} (${deal.montant_estime} EUR) - Raison : ${reason}. Transfere au NURTUREUR pour re-engagement dans ${calculateRecontactDate(reason).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}.`,
  })
}

function mapReason(reason: string): 'PRIX' | 'TIMING' | 'CONCURRENCE' | 'INACTION' | 'AUTRE' {
  const map: Record<string, 'PRIX' | 'TIMING' | 'CONCURRENCE' | 'INACTION' | 'AUTRE'> = {
    'prix_eleve': 'PRIX',
    'timing': 'TIMING',
    'concurrence': 'CONCURRENCE',
    'INACTION': 'INACTION',
    'budget': 'PRIX',
    'inaction': 'INACTION',
    'indecision': 'INACTION',
  }
  return map[reason] || 'AUTRE'
}

function calculateRecontactDate(reason: string): Date {
  const now = new Date()
  switch (reason) {
    case 'INACTION': return new Date(now.setMonth(now.getMonth() + 3))
    case 'prix_eleve':
    case 'budget': return new Date(now.setMonth(now.getMonth() + 3))
    case 'timing': return new Date(now.setMonth(now.getMonth() + 2))
    case 'concurrence': return new Date(now.setMonth(now.getMonth() + 6))
    default: return new Date(now.setMonth(now.getMonth() + 3))
  }
}

function generateRecommendation(deal: any, reason: string): string {
  const map: Record<string, string> = {
    'INACTION': `Recontacter dans 3 mois avec un case study ${deal.type_projet}. Proposer un audit gratuit comme point d'entree.`,
    'prix_eleve': `Recontacter dans 3 mois avec la formule ${deal.tier_recommande === 'gold' ? 'Silver' : 'Bronze'}. Mettre en avant le ROI.`,
    'timing': `Recontacter a la date indiquee par le prospect. Envoyer du contenu educatif mensuel en attendant.`,
    'concurrence': `Recontacter dans 6 mois pour voir si le prestataire concurrent donne satisfaction. Maintenir la relation LinkedIn.`,
    'budget': `Recontacter en debut de Q+1 quand les budgets sont realloues. Proposer un demarrage Phase 1 a budget reduit.`,
  }
  return map[reason] || `Recontacter dans 3 mois avec du contenu adapte au secteur ${deal.entreprise_secteur}.`
}

function daysBetween(date1: Date, date2: Date): number {
  const diff = Math.abs(date2.getTime() - date1.getTime())
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
```

---

### 3c. SOUS-AGENT 8c -- GESTIONNAIRE DE SIGNATURE

#### 3c.1 Mission

Gerer l'integralite du processus de signature electronique : generation du contrat a partir du devis accepte, envoi via Yousign API V3, tracking du statut, relance signature, et declenchement automatique de l'onboarding post-signature.

#### 3c.2 Architecture technique

```
Devis accepte par le prospect
    |
    v
+---------------------------------------------------+
| SOUS-AGENT 8c : GESTIONNAIRE DE SIGNATURE          |
| 1. Generer contrat depuis devis (Puppeteer)         |
| 2. Creer signature request (Yousign API V3)         |
| 3. Ajouter signataires + document + champs          |
| 4. Activer la demande (envoi email signature)        |
| 5. Ecouter webhooks (signature.done, expired)        |
| 6. Relancer si pas de signature (J2/J5/J7)           |
| 7. Telecharger contrat signe                         |
| 8. Declencher onboarding (Agent 10 CSM)              |
+---------------------------------------------------+
    |
    v
Deal signe --> Agent 10 (CSM) pour onboarding
```

#### 3c.3 Yousign API V3 -- Endpoints et integration

**Configuration :**

```typescript
// Configuration Yousign API V3
const YOUSIGN_CONFIG = {
  base_url: 'https://api.yousign.app/v3',  // Production
  sandbox_url: 'https://staging-api.yousign.app/v3',  // Sandbox
  api_key: process.env.YOUSIGN_API_KEY!,
  webhook_secret: process.env.YOUSIGN_WEBHOOK_SECRET!,
  // IPs a whitelister pour les webhooks :
  // 57.130.41.144/28, 51.38.96.112/28, 5.39.7.128/28
}
```

#### 3c.4 Code TypeScript complet

```typescript
import crypto from 'crypto'
import { db, slack, emailService, dealmakerQueue, csmQueue, analysteQueue } from './services'

// ============================================================
// INTERFACES YOUSIGN API V3
// ============================================================

interface YousignSignatureRequest {
  id: string
  status: 'draft' | 'ongoing' | 'done' | 'expired' | 'canceled' | 'rejected'
  name: string
  delivery_mode: 'email' | 'none'
  created_at: string
  updated_at: string
  expiration_date: string
  signers: YousignSigner[]
  documents: YousignDocument[]
}

interface YousignSigner {
  id: string
  info: {
    first_name: string
    last_name: string
    email: string
    phone_number?: string
    locale: 'fr' | 'en'
  }
  status: 'initiated' | 'notified' | 'verified' | 'processing' | 'consent_given' | 'signed' | 'aborted' | 'error'
  signature_level: 'electronic_signature' | 'advanced_electronic_signature' | 'electronic_signature_with_qualified_certificate'
  signature_authentication_mode: 'otp_email' | 'otp_sms' | 'no_otp'
  sign_url?: string
}

interface YousignDocument {
  id: string
  nature: 'signable_document' | 'attachment'
  content_type: string
  filename: string
  total_pages: number
}

interface YousignWebhookPayload {
  event_id: string
  event_name: string
  event_time: number
  subscription_id: string
  sandbox: boolean
  data: {
    signature_request: {
      id: string
      status: string
      name: string
      signers: Array<{
        id: string
        status: string
        signed_at?: string
      }>
    }
  }
}

// ============================================================
// CLIENT YOUSIGN API V3
// ============================================================

class YousignClient {
  private baseUrl: string
  private apiKey: string

  constructor() {
    this.baseUrl = process.env.NODE_ENV === 'production'
      ? YOUSIGN_CONFIG.base_url
      : YOUSIGN_CONFIG.sandbox_url
    this.apiKey = YOUSIGN_CONFIG.api_key
  }

  private async request(method: string, path: string, body?: any, isMultipart = false): Promise<any> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
    }

    let requestBody: any
    if (isMultipart) {
      // Pour upload de documents : multipart/form-data
      requestBody = body  // FormData
    } else {
      headers['Content-Type'] = 'application/json'
      requestBody = body ? JSON.stringify(body) : undefined
    }

    const response = await fetch(url, {
      method,
      headers,
      body: requestBody,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Yousign API error ${response.status}: ${errorBody}`)
    }

    // Pour les downloads binaires (PDF), retourner le buffer
    if (response.headers.get('content-type')?.includes('application/pdf')) {
      return response.arrayBuffer()
    }

    return response.json()
  }

  // --- 1. CREER UNE SIGNATURE REQUEST ---
  async createSignatureRequest(params: {
    name: string
    delivery_mode: 'email' | 'none'
    timezone?: string
    expiration_date?: string
  }): Promise<YousignSignatureRequest> {
    return this.request('POST', '/signature_requests', {
      name: params.name,
      delivery_mode: params.delivery_mode,
      timezone: params.timezone || 'Europe/Paris',
      ordered_signers: false,
      expiration_date: params.expiration_date,
    })
  }

  // --- 2. AJOUTER UN SIGNATAIRE ---
  async addSigner(signatureRequestId: string, params: {
    info: {
      first_name: string
      last_name: string
      email: string
      phone_number?: string
      locale?: string
    }
    signature_level?: string
    signature_authentication_mode?: string
  }): Promise<YousignSigner> {
    return this.request('POST', `/signature_requests/${signatureRequestId}/signers`, {
      info: {
        ...params.info,
        locale: params.info.locale || 'fr',
      },
      signature_level: params.signature_level || 'electronic_signature',
      signature_authentication_mode: params.signature_authentication_mode || 'otp_email',
    })
  }

  // --- 3. AJOUTER UN DOCUMENT ---
  async addDocument(signatureRequestId: string, pdfBuffer: Buffer, filename: string): Promise<YousignDocument> {
    const formData = new FormData()
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' })
    formData.append('file', blob, filename)
    formData.append('nature', 'signable_document')

    return this.request('POST', `/signature_requests/${signatureRequestId}/documents`, formData, true)
  }

  // --- 4. AJOUTER LES CHAMPS DE SIGNATURE ---
  async addSignatureField(signatureRequestId: string, documentId: string, signerId: string, params: {
    page: number
    x: number
    y: number
    width?: number
    height?: number
    type?: string
  }): Promise<any> {
    return this.request('POST', `/signature_requests/${signatureRequestId}/documents/${documentId}/fields`, {
      signer_id: signerId,
      type: params.type || 'signature',
      page: params.page,
      x: params.x,
      y: params.y,
      width: params.width || 200,
      height: params.height || 60,
    })
  }

  // --- 5. ACTIVER LA SIGNATURE REQUEST (ENVOYER) ---
  async activate(signatureRequestId: string): Promise<YousignSignatureRequest> {
    return this.request('POST', `/signature_requests/${signatureRequestId}/activate`)
  }

  // --- 6. RECUPERER LE STATUT ---
  async getStatus(signatureRequestId: string): Promise<YousignSignatureRequest> {
    return this.request('GET', `/signature_requests/${signatureRequestId}`)
  }

  // --- 7. TELECHARGER LE DOCUMENT SIGNE ---
  async downloadSignedDocument(signatureRequestId: string, documentId: string): Promise<ArrayBuffer> {
    return this.request('GET', `/signature_requests/${signatureRequestId}/documents/${documentId}/download`)
  }

  // --- 8. ENVOYER UN RAPPEL ---
  async sendReminder(signatureRequestId: string): Promise<void> {
    await this.request('POST', `/signature_requests/${signatureRequestId}/renotify`)
  }

  // --- 9. ANNULER UNE SIGNATURE ---
  async cancel(signatureRequestId: string, reason?: string): Promise<void> {
    await this.request('DELETE', `/signature_requests/${signatureRequestId}`, {
      reason: reason || 'Annulation par le commercial',
    })
  }
}

const yousign = new YousignClient()

// ============================================================
// CLASSE PRINCIPALE : GESTIONNAIRE DE SIGNATURE
// ============================================================

class SubAgent8c_GestionnaireSignature {

  // --- WORKFLOW PRINCIPAL : DEVIS ACCEPTE -> CONTRAT -> SIGNATURE ---
  async processAcceptedQuote(deal: any): Promise<void> {
    try {
      // 1. Generer le contrat PDF a partir du devis accepte
      const contractPdf = await this.generateContract(deal)

      // 2. Creer la signature request Yousign
      const expirationDate = new Date()
      expirationDate.setDate(expirationDate.getDate() + 14) // 14 jours pour signer

      const sigRequest = await yousign.createSignatureRequest({
        name: `Contrat_Axiom_${deal.entreprise_nom}_${deal.deal_id.slice(0, 8)}`,
        delivery_mode: 'email',
        timezone: 'Europe/Paris',
        expiration_date: expirationDate.toISOString(),
      })

      // 3. Ajouter le signataire (prospect)
      const signer = await yousign.addSigner(sigRequest.id, {
        info: {
          first_name: deal.prospect_prenom,
          last_name: deal.prospect_nom,
          email: deal.prospect_email,
          phone_number: deal.prospect_telephone || undefined,
          locale: 'fr',
        },
        signature_level: 'electronic_signature',  // eIDAS simple (suffisant contrats commerciaux France)
        signature_authentication_mode: deal.prospect_telephone ? 'otp_sms' : 'otp_email',
      })

      // 4. Upload du document
      const document = await yousign.addDocument(
        sigRequest.id,
        contractPdf,
        `Contrat_Axiom_${deal.entreprise_nom.replace(/\s+/g, '_')}.pdf`
      )

      // 5. Ajouter le champ de signature (derniere page)
      await yousign.addSignatureField(sigRequest.id, document.id, signer.id, {
        page: document.total_pages, // Derniere page
        x: 100,
        y: 650,
        width: 200,
        height: 60,
        type: 'signature',
      })

      // Ajouter un champ date
      await yousign.addSignatureField(sigRequest.id, document.id, signer.id, {
        page: document.total_pages,
        x: 350,
        y: 670,
        width: 150,
        height: 30,
        type: 'text',
      })

      // 6. Activer la signature request (envoie l'email au signataire)
      await yousign.activate(sigRequest.id)

      // 7. Mettre a jour le deal en BDD
      await db.deals.update({
        deal_id: deal.deal_id,
        stage: 'SIGNATURE_EN_COURS',
        yousign_signature_request_id: sigRequest.id,
        yousign_document_id: document.id,
        yousign_signer_id: signer.id,
        contrat_envoye_at: new Date(),
      })

      // 8. Programmer les rappels de signature
      await this.scheduleSignatureReminders(deal.deal_id)

      // 9. Notifier Jonathan
      await slack.send('#deals', {
        text: `Contrat envoye pour signature : ${deal.prospect_prenom} ${deal.prospect_nom} @ ${deal.entreprise_nom} (${new Intl.NumberFormat('fr-FR').format(deal.montant_final)} EUR HT)`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Contrat envoye pour e-signature*\n\nProspect : ${deal.prospect_prenom} ${deal.prospect_nom}\nEntreprise : ${deal.entreprise_nom}\nMontant : ${new Intl.NumberFormat('fr-FR').format(deal.montant_final)} EUR HT\nTier : ${deal.tier_final.toUpperCase()}\nExpiration : ${expirationDate.toLocaleDateString('fr-FR')}` }
          }
        ]
      })

    } catch (error: any) {
      console.error(`[Agent8c] Erreur signature pour deal ${deal.deal_id}:`, error)
      await slack.send('#deals-errors', {
        text: `Erreur envoi contrat signature : ${deal.entreprise_nom} - ${error.message}`,
      })
      throw error
    }
  }

  // --- GENERATION DU CONTRAT PDF ---
  private async generateContract(deal: any): Promise<Buffer> {
    const paiementTerms = deal.montant_final >= 10000
      ? '30% a la signature, 40% a la validation des maquettes, 30% a la livraison'
      : '50% a la signature, 50% a la livraison'

    const contractHtml = this.buildContractHtml(deal, paiementTerms)

    // Generer le PDF avec Puppeteer
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
    const page = await browser.newPage()
    await page.setContent(contractHtml, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '25mm', right: '20mm', bottom: '30mm', left: '20mm' },
    })
    await browser.close()

    return Buffer.from(pdfBuffer)
  }

  private buildContractHtml(deal: any, paiementTerms: string): string {
    const template = SERVICE_TEMPLATES[deal.type_projet]
    const tierConfig = template ? template[deal.tier_final as 'bronze' | 'silver' | 'gold'] : null

    return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Inter', sans-serif; font-size: 12px; line-height: 1.6; color: #333; }
        h1 { font-size: 24px; text-align: center; margin-bottom: 30px; }
        h2 { font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 24px; }
        .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        .partie { padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        table td, table th { padding: 8px; border: 1px solid #e0e0e0; text-align: left; }
        table th { background: #f5f5f5; }
        .signature-block { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .signature-zone { border: 1px dashed #999; height: 100px; text-align: center; padding-top: 70px; font-size: 11px; color: #999; }
        .footer-legal { font-size: 10px; color: #666; margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px; }
      </style>
    </head>
    <body>
      <h1>CONTRAT DE PRESTATION DE SERVICES</h1>

      <h2>Article 1 -- Parties</h2>
      <div class="parties">
        <div class="partie">
          <strong>LE PRESTATAIRE</strong><br>
          UNIVILE SAS (Axiom Marketing)<br>
          SIRET : XXXXXXXXX<br>
          Represente par Jonathan Dewaele, Dirigeant
        </div>
        <div class="partie">
          <strong>LE CLIENT</strong><br>
          ${deal.entreprise_nom}<br>
          SIRET : ${deal.entreprise_siret}<br>
          Represente par ${deal.prospect_prenom} ${deal.prospect_nom}, ${deal.prospect_poste}
        </div>
      </div>

      <h2>Article 2 -- Objet</h2>
      <p>Le Prestataire s'engage a realiser pour le Client les prestations suivantes :</p>
      <p><strong>Projet :</strong> ${template?.display_name || deal.type_projet}</p>
      <p><strong>Formule :</strong> ${tierConfig?.nom || deal.tier_final}</p>

      <h2>Article 3 -- Livrables</h2>
      <ul>
        ${(tierConfig?.features || []).map((f: string) => `<li>${f}</li>`).join('\n')}
      </ul>

      <h2>Article 4 -- Prix et conditions de paiement</h2>
      <table>
        <tr><th>Montant HT</th><td>${new Intl.NumberFormat('fr-FR').format(deal.montant_final)} EUR</td></tr>
        <tr><th>TVA (20%)</th><td>${new Intl.NumberFormat('fr-FR').format(deal.montant_final * 0.2)} EUR</td></tr>
        <tr><th>Montant TTC</th><td>${new Intl.NumberFormat('fr-FR').format(deal.montant_final * 1.2)} EUR</td></tr>
        <tr><th>Echeancier</th><td>${paiementTerms}</td></tr>
      </table>
      <p>En cas de retard de paiement, des penalites de retard au taux de 3 fois le taux d'interet legal seront appliquees, majorees d'une indemnite forfaitaire de 40 EUR pour frais de recouvrement (article L.441-10 du Code de Commerce).</p>

      <h2>Article 5 -- Delais</h2>
      <p><strong>Duree estimee :</strong> ${tierConfig?.timeline_semaines || '8'} semaines a compter de la reception de l'acompte.</p>
      <p><strong>Date de demarrage prevue :</strong> ${deal.start_date || 'A definir apres signature'}</p>

      <h2>Article 6 -- Propriete intellectuelle</h2>
      <p>Le transfert des droits de propriete intellectuelle sur les livrables s'opere au profit du Client a compter du paiement integrale du prix.</p>

      <h2>Article 7 -- Confidentialite</h2>
      <p>Les Parties s'engagent a garder confidentielles toutes les informations echangees dans le cadre de l'execution du present contrat.</p>

      <h2>Article 8 -- Resiliation</h2>
      <p>En cas de manquement grave, le contrat peut etre resilie de plein droit 30 jours apres mise en demeure restee infructueuse.</p>

      <h2>Article 9 -- Loi applicable et juridiction</h2>
      <p>Le present contrat est regi par le droit francais. Tout litige sera soumis aux tribunaux competents de Paris.</p>

      <h2>Article 10 -- Signature</h2>
      <p>Fait en deux exemplaires, par voie electronique conformement aux articles 1366-1367 du Code Civil et au Reglement eIDAS.</p>

      <div class="signature-block">
        <div>
          <p><strong>Le Prestataire</strong></p>
          <p>Jonathan Dewaele, UNIVILE SAS</p>
          <p>Date : ${new Date().toLocaleDateString('fr-FR')}</p>
          <p><em>Signature electronique pre-apposee</em></p>
        </div>
        <div>
          <p><strong>Le Client</strong></p>
          <p>${deal.prospect_prenom} ${deal.prospect_nom}, ${deal.entreprise_nom}</p>
          <p>Date :</p>
          <div class="signature-zone">Zone de signature electronique (Yousign)</div>
        </div>
      </div>

      <div class="footer-legal">
        <p>Ce contrat est signe electroniquement via Yousign, prestataire qualifie eIDAS (QTSP). La signature electronique a la meme valeur juridique qu'une signature manuscrite (articles 1366-1367 du Code Civil francais, Reglement UE eIDAS 910/2014). Les donnees sont hebergees en France (datacenters certifies ANSSI SecNumCloud).</p>
      </div>
    </body>
    </html>`
  }

  // --- WEBHOOK YOUSIGN : RECEPTION DES EVENEMENTS ---
  async handleWebhook(req: Request, res: Response): Promise<void> {
    // 1. Verifier la signature HMAC
    const signature = req.headers['x-yousign-signature-256'] as string
    const rawBody = req.rawBody // Buffer brut du body

    if (!this.verifyWebhookSignature(rawBody, signature)) {
      console.error('[Agent8c] Webhook Yousign: signature HMAC invalide')
      res.status(401).send('Invalid signature')
      return
    }

    // 2. Parser le payload
    const payload: YousignWebhookPayload = JSON.parse(rawBody.toString())

    // 3. Dedupliquer (eviter les doublons de webhook)
    const alreadyProcessed = await db.webhook_events.exists(payload.event_id)
    if (alreadyProcessed) {
      res.status(200).send('Already processed')
      return
    }
    await db.webhook_events.create({ event_id: payload.event_id, processed_at: new Date() })

    // 4. Router selon l'evenement
    try {
      switch (payload.event_name) {
        case 'signature_request.done':
          await this.onSignatureCompleted(payload)
          break

        case 'signature_request.expired':
          await this.onSignatureExpired(payload)
          break

        case 'signature_request.canceled':
          await this.onSignatureCanceled(payload)
          break

        case 'signer.done':
          await this.onSignerSigned(payload)
          break

        case 'signature_request.reminder_executed':
          // Log uniquement
          console.info(`[Agent8c] Rappel Yousign envoye pour ${payload.data.signature_request.id}`)
          break

        default:
          console.info(`[Agent8c] Webhook Yousign non gere: ${payload.event_name}`)
      }

      res.status(200).send('OK')
    } catch (error: any) {
      console.error(`[Agent8c] Erreur traitement webhook: ${error.message}`)
      res.status(500).send('Error processing webhook')
    }
  }

  // --- VERIFICATION HMAC SHA-256 ---
  private verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean {
    if (!signatureHeader) return false

    const computedHash = crypto
      .createHmac('sha256', YOUSIGN_CONFIG.webhook_secret)
      .update(rawBody)
      .digest('hex')

    const expectedSignature = `sha256=${computedHash}`
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signatureHeader)
    )
  }

  // --- EVENEMENT : SIGNATURE COMPLETEE ---
  private async onSignatureCompleted(payload: YousignWebhookPayload): Promise<void> {
    const sigRequestId = payload.data.signature_request.id
    const deal = await db.deals.findByYousignId(sigRequestId)

    if (!deal) {
      console.error(`[Agent8c] Deal non trouve pour Yousign request ${sigRequestId}`)
      return
    }

    // 1. Telecharger le contrat signe
    const signedPdf = await yousign.downloadSignedDocument(sigRequestId, deal.yousign_document_id)
    const signedPdfUrl = await storageService.upload(
      `contrats_signes/${deal.deal_id}_signe.pdf`,
      Buffer.from(signedPdf),
      'application/pdf'
    )

    // 2. Mettre a jour le deal en BDD
    await db.deals.update({
      deal_id: deal.deal_id,
      stage: 'GAGNE',
      date_signature: new Date(),
      contrat_signe_url: signedPdfUrl,
      montant_signe: deal.montant_final,
    })

    // 3. Annuler les rappels de signature programmes
    await this.cancelSignatureReminders(deal.deal_id)

    // 4. Notifier Jonathan (CELEBRATION)
    await slack.send('#deals', {
      text: `:tada: DEAL SIGNE ! ${deal.prospect_prenom} ${deal.prospect_nom} @ ${deal.entreprise_nom} -- ${new Intl.NumberFormat('fr-FR').format(deal.montant_final)} EUR HT`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'DEAL SIGNE !' }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Prospect :* ${deal.prospect_prenom} ${deal.prospect_nom}` },
            { type: 'mrkdwn', text: `*Entreprise :* ${deal.entreprise_nom}` },
            { type: 'mrkdwn', text: `*Montant :* ${new Intl.NumberFormat('fr-FR').format(deal.montant_final)} EUR HT` },
            { type: 'mrkdwn', text: `*Tier :* ${deal.tier_final.toUpperCase()}` },
            { type: 'mrkdwn', text: `*Cycle :* ${daysBetween(deal.created_at, new Date())} jours` },
            { type: 'mrkdwn', text: `*Relances :* ${deal.nb_relances || 0}` },
          ]
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Voir contrat signe' },
              url: signedPdfUrl,
            }
          ]
        }
      ]
    })

    // 5. Transferer au CSM (Agent 10) pour onboarding
    const csmPayload: DealToCSM = {
      deal_id: deal.deal_id,
      prospect_id: deal.prospect_id,
      prospect: {
        prenom: deal.prospect_prenom,
        nom: deal.prospect_nom,
        email: deal.prospect_email,
        telephone: deal.prospect_telephone || undefined,
        linkedin_url: deal.prospect_linkedin_url || undefined,
        poste: deal.prospect_poste,
      },
      entreprise: {
        nom: deal.entreprise_nom,
        siret: deal.entreprise_siret,
        site_web: deal.entreprise_site_web,
        secteur: deal.entreprise_secteur,
        taille: deal.entreprise_taille,
      },
      contrat: {
        montant_ht: deal.montant_final,
        tier: deal.tier_final,
        type_projet: deal.type_projet,
        scope_detaille: deal.scope_livrables || [],
        date_signature: new Date().toISOString(),
        date_demarrage_prevue: deal.start_date || this.calculateStartDate().toISOString(),
        duree_estimee_semaines: SERVICE_TEMPLATES[deal.type_projet]?.[deal.tier_final]?.timeline_semaines || 8,
        conditions_paiement: deal.montant_final >= 10000 ? '30/40/30' : '50/50',
        contrat_pdf_url: signedPdfUrl,
      },
      notes_vente: deal.rdv_notes?.notes_jonathan || '',
    }

    await csmQueue.add(`onboarding-${deal.deal_id}`, csmPayload, { priority: 1 })

    // 6. Envoyer metriques a l'Agent 7 (ANALYSTE)
    const analystePayload: DealMetricsEvent = {
      type: 'deal_won',
      deal_id: deal.deal_id,
      montant: deal.montant_final,
      cycle_days: daysBetween(deal.created_at, new Date()),
      segment: deal.segment,
      tier: deal.tier_final,
      nb_relances: deal.nb_relances || 0,
      source_canal: deal.canal_principal,
      date: new Date().toISOString(),
    }

    await analysteQueue.add('deal-metrics', analystePayload, { priority: 3 })

    // 7. Envoyer un email de bienvenue au client
    await this.sendWelcomeEmail(deal, signedPdfUrl)
  }

  // --- EVENEMENT : SIGNATURE EXPIREE ---
  private async onSignatureExpired(payload: YousignWebhookPayload): Promise<void> {
    const deal = await db.deals.findByYousignId(payload.data.signature_request.id)
    if (!deal) return

    await slack.send('#deals', {
      text: `Signature EXPIREE pour ${deal.entreprise_nom}. Le prospect n'a pas signe dans les 14 jours.`,
    })

    // Option : relancer avec une nouvelle demande de signature
    // ou marquer comme PERDU
    await db.deals.update({
      deal_id: deal.deal_id,
      stage: 'NEGOCIATION', // Revenir en negociation pour relancer
    })
  }

  // --- EVENEMENT : SIGNATURE ANNULEE ---
  private async onSignatureCanceled(payload: YousignWebhookPayload): Promise<void> {
    const deal = await db.deals.findByYousignId(payload.data.signature_request.id)
    if (!deal) return

    await slack.send('#deals', {
      text: `Signature ANNULEE pour ${deal.entreprise_nom}.`,
    })
  }

  // --- EVENEMENT : SIGNATAIRE A SIGNE ---
  private async onSignerSigned(payload: YousignWebhookPayload): Promise<void> {
    // Log pour audit trail
    const sigRequestId = payload.data.signature_request.id
    const deal = await db.deals.findByYousignId(sigRequestId)
    if (deal) {
      console.info(`[Agent8c] Signataire a signe pour deal ${deal.deal_id}`)
    }
  }

  // --- PROGRAMMATION DES RAPPELS DE SIGNATURE ---
  private async scheduleSignatureReminders(dealId: string): Promise<void> {
    // J+2 : premier rappel email
    await dealmakerQueue.add(
      `sig-reminder-${dealId}-1`,
      { type: 'SIGNATURE_REMINDER', deal_id: dealId, step: 1 },
      { delay: 2 * 24 * 60 * 60 * 1000, priority: 2 }
    )

    // J+5 : deuxieme rappel via Yousign (renotify API)
    await dealmakerQueue.add(
      `sig-reminder-${dealId}-2`,
      { type: 'SIGNATURE_REMINDER', deal_id: dealId, step: 2 },
      { delay: 5 * 24 * 60 * 60 * 1000, priority: 2 }
    )

    // J+7 : rappel final + alerte Jonathan pour appel
    await dealmakerQueue.add(
      `sig-reminder-${dealId}-3`,
      { type: 'SIGNATURE_REMINDER', deal_id: dealId, step: 3 },
      { delay: 7 * 24 * 60 * 60 * 1000, priority: 1 }
    )
  }

  async processSignatureReminder(dealId: string, step: number): Promise<void> {
    const deal = await db.deals.findById(dealId)
    if (!deal || deal.stage !== 'SIGNATURE_EN_COURS') return

    switch (step) {
      case 1: // J+2 : rappel email personnalise
        await emailService.send({
          from: 'Jonathan Dewaele <jonathan@axiom-marketing.fr>',
          to: deal.prospect_email,
          subject: `Contrat en attente de signature - ${deal.entreprise_nom}`,
          text: `Bonjour ${deal.prospect_prenom},

Je vous ai transmis notre contrat pour signature electronique il y a 2 jours. Peut-etre est-il passe inapercu ?

Vous pouvez le signer en 2 clics directement depuis l'email Yousign (verifiez aussi vos spams).

Si vous avez des questions sur le contenu du contrat, n'hesitez pas.

Jonathan`
        })
        break

      case 2: // J+5 : rappel via Yousign API
        try {
          await yousign.sendReminder(deal.yousign_signature_request_id)
        } catch (error) {
          console.warn(`[Agent8c] Erreur rappel Yousign: ${error}`)
        }
        break

      case 3: // J+7 : alerte Jonathan pour appel direct
        await slack.send('#deals', {
          text: `ATTENTION : Le contrat pour ${deal.entreprise_nom} (${new Intl.NumberFormat('fr-FR').format(deal.montant_final)} EUR) n'est pas signe depuis 7 jours. Appel recommande.`,
        })

        // Si deal > 10 000 EUR, envoyer aussi un SMS a Jonathan
        if (deal.montant_final > 10000) {
          await slack.dmJonathan(`Contrat non signe depuis 7j : ${deal.entreprise_nom} (${deal.montant_final} EUR). Appeler le prospect.`)
        }
        break
    }
  }

  private async cancelSignatureReminders(dealId: string): Promise<void> {
    // Supprimer les jobs de rappel programmes
    const jobs = await dealmakerQueue.getJobs(['delayed'])
    for (const job of jobs) {
      if (job.name.startsWith(`sig-reminder-${dealId}`)) {
        await job.remove()
      }
    }
  }

  private async sendWelcomeEmail(deal: any, signedPdfUrl: string): Promise<void> {
    await emailService.send({
      from: 'Jonathan Dewaele <jonathan@axiom-marketing.fr>',
      to: deal.prospect_email,
      subject: `Bienvenue chez Axiom Marketing - Prochaines etapes`,
      text: `Bonjour ${deal.prospect_prenom},

Merci pour votre confiance ! Le contrat est signe et votre projet est officiellement lance.

Voici les prochaines etapes :

1. Vous recevrez un email d'onboarding dans les 24h avec un questionnaire de brief
2. Un kickoff call sera programme dans les 3 jours ouvrables
3. Le premier livrable (maquettes / architecture) sera partage dans ${Math.ceil((SERVICE_TEMPLATES[deal.type_projet]?.[deal.tier_final]?.timeline_semaines || 8) * 0.25)} semaines

Votre contrat signe est accessible ici : ${signedPdfUrl}

A tres bientot pour le kickoff !

Jonathan Dewaele
Axiom Marketing`
    })
  }

  private calculateStartDate(): Date {
    const start = new Date()
    start.setDate(start.getDate() + 5) // J+5 apres signature (temps onboarding)
    // Ajuster si weekend
    if (start.getDay() === 0) start.setDate(start.getDate() + 1)
    if (start.getDay() === 6) start.setDate(start.getDate() + 2)
    return start
  }
}
```

#### 3c.5 Validite juridique en France

| Aspect | Detail |
|--------|--------|
| **Base legale** | Articles 1366-1367 du Code Civil francais |
| **Reglement europeen** | eIDAS (UE 910/2014), mis a jour eIDAS V2 (2024-2026) |
| **Niveau de signature** | Signature electronique simple (suffisant pour contrats commerciaux B2B) |
| **Prestataire** | Yousign -- Prestataire de Services de Confiance Qualifie (QTSP) |
| **Hebergement donnees** | France (datacenters certifies ANSSI SecNumCloud) |
| **Valeur probante** | Equivalente a une signature manuscrite (art. 1367 CC) |
| **Signature qualifiee** | Necessaire uniquement pour actes notaries, pas pour contrats agence web |

**Impact mesurable :**
- +25-35% de taux de conversion vs signature papier
- -85% de temps de traitement (5-7 jours a < 48h)
- -60% du cycle de vente total

#### 3c.6 Pricing Yousign 2026

| Plan | Prix | Signatures/mois | Features |
|------|------|----------------|----------|
| **One** | 11 EUR/mois | Illimitees | Signature simple, 1 user |
| **Plus** | 28 EUR/mois | Illimitees | API V3, templates, rappels auto |
| **Pro** | 48 EUR/mois | Illimitees | Workflows, approbations, branding |

**Recommandation Axiom :** Plan **Plus** a 28 EUR/mois (API V3 + templates + rappels automatiques).

---

## 4. PIPELINE CRM -- 7 ETAPES

### 4.1 Definition des etapes

| # | Stage | Definition | Probabilite closing | Trigger deplacement auto | Duree moyenne |
|---|-------|-----------|--------------------|--------------------------|----|
| 1 | **Qualification Avancee** | RDV decouverte effectue, besoins confirmes, notes Jonathan saisies | 40% | Job DealmakerInput cree dans BullMQ | 1-3 jours |
| 2 | **Devis Cree** | Proposition generee (3 tiers) et envoyee au prospect | 50% | PDF genere + email envoye par Sous-agent 8a | 1-2 jours |
| 3 | **Devis en Consideration** | Prospect a ouvert le devis 2+ fois OU a repondu a une relance | 65% | Tracking ouverture >= 2 OU reponse email detectee | 5-7 jours |
| 4 | **Negociation** | Objection soulevee et traitee, ajustements en cours | 75% | Prospect repond avec objection OU demande modification | 7-14 jours |
| 5 | **Signature en Cours** | Contrat genere et envoye via Yousign pour e-signature | 90% | Yousign signature request activee | 2-7 jours |
| 6 | **Gagne** | Contrat signe par le prospect | 100% | Webhook Yousign `signature_request.done` | -- |
| 7 | **Perdu** | Refus explicite OU inaction 45+ jours OU signature expiree | 0% | Prospect dit non OU timeout 45j OU Yousign expired | -- |

### 4.2 Transitions automatiques

```typescript
// Automates de transition du pipeline
const PIPELINE_TRANSITIONS: Record<string, {
  trigger: string
  next_stage: string
  auto: boolean
  notification: boolean
}[]> = {
  'QUALIFICATION': [
    { trigger: 'devis_genere', next_stage: 'DEVIS_CREE', auto: true, notification: true },
  ],
  'DEVIS_CREE': [
    { trigger: 'devis_ouvert_2x', next_stage: 'DEVIS_EN_CONSIDERATION', auto: true, notification: false },
    { trigger: 'prospect_repond', next_stage: 'DEVIS_EN_CONSIDERATION', auto: true, notification: true },
    { trigger: 'timeout_45j', next_stage: 'PERDU', auto: true, notification: true },
  ],
  'DEVIS_EN_CONSIDERATION': [
    { trigger: 'objection_detectee', next_stage: 'NEGOCIATION', auto: true, notification: true },
    { trigger: 'prospect_accepte', next_stage: 'SIGNATURE_EN_COURS', auto: true, notification: true },
    { trigger: 'timeout_45j', next_stage: 'PERDU', auto: true, notification: true },
  ],
  'NEGOCIATION': [
    { trigger: 'objection_resolue_accepte', next_stage: 'SIGNATURE_EN_COURS', auto: true, notification: true },
    { trigger: 'prospect_refuse', next_stage: 'PERDU', auto: true, notification: true },
    { trigger: 'timeout_45j', next_stage: 'PERDU', auto: true, notification: true },
  ],
  'SIGNATURE_EN_COURS': [
    { trigger: 'yousign_done', next_stage: 'GAGNE', auto: true, notification: true },
    { trigger: 'yousign_expired', next_stage: 'NEGOCIATION', auto: true, notification: true },
    { trigger: 'yousign_canceled', next_stage: 'PERDU', auto: true, notification: true },
  ],
}
```

### 4.3 Cycle de vente cible par type de projet

| Type projet | Fourchette prix | Cycle moyen sans DEALMAKER | Cycle cible avec DEALMAKER | Reduction |
|-------------|----------------|--------------------------|---------------------------|-----------|
| Site vitrine | 1 500-15 000 EUR | 15-25 jours | 10-18 jours | -30% |
| E-commerce Shopify | 5 000-15 000 EUR | 25-40 jours | 15-28 jours | -35% |
| App Flutter | 15 000-80 000 EUR | 45-75 jours | 30-55 jours | -30% |
| App metier | 25 000-80 000 EUR | 50-80 jours | 35-60 jours | -30% |
| RGAA collectivites | 8 000-50 000 EUR | 30-60 jours | 20-40 jours | -35% |
| Tracking server-side | 990+ EUR | 10-20 jours | 5-12 jours | -45% |

---

## 5. TIERING COMPLET PAR SERVICE

### 5.1 Vue synthetique

| Service | Bronze | Silver (cible 60-70%) | Gold |
|---------|--------|-----------------------|------|
| **Site vitrine** | 1 500 EUR -- Essentiel | 5 000 EUR -- Professionnel | 9 500 EUR -- Premium |
| **E-commerce Shopify** | 5 000 EUR -- Starter | 10 000 EUR -- Growth | 15 000 EUR -- Scale |
| **App Flutter** | 15 000 EUR -- MVP | 35 000 EUR -- Complete | 60 000 EUR -- Enterprise |
| **App metier** | 25 000 EUR -- Module Unique | 50 000 EUR -- Multi-Modules | 75 000 EUR -- Sur-Mesure |
| **RGAA collectivites** | 8 000 EUR -- Audit + Essentiels | 20 000 EUR -- Refonte Partielle | 40 000 EUR -- Conformite Totale |
| **Tracking server-side** | 990 EUR + 89/mois -- Standard | 1 490 EUR + 129/mois -- Avance | 2 490 EUR + 189/mois -- Enterprise |

### 5.2 Psychologie du tiering -- Decoy Effect

**Principes appliques (Dan Ariely, "Predictably Irrational") :**

1. **Bronze = Leurre d'entree** : Prix attractif mais features volontairement limitees. Force la comparaison defavorable avec Silver.

2. **Silver = Cible** : Le "sweet spot" valeur/prix. Badge "Le plus choisi" + bordure coloree + position centrale (center-stage effect). Objectif : 60-70% des conversions.

3. **Gold = Ancrage haut** : Prix eleve qui rend le Silver "raisonnable" par comparaison. Genere 15-25% de conversions mais surtout justifie le Silver.

**Donnees de reference :**
- Le decoy effect genere +30% de revenu a volume egal
- L'option du milieu recoit 60% plus de selections (center-stage effect)
- Afficher les prix de haut en bas (Gold en premier) augmente le panier moyen de 12%

### 5.3 Grilles detaillees

Les grilles detaillees par service sont definies dans la section 3a.4 (`SERVICE_TEMPLATES`) avec pour chaque tier :
- Nom commercial
- Prix affiche
- Fourchette de prix
- Liste complete des features/livrables
- Timeline en semaines
- Label marketing

---

## 6. GESTION DES OBJECTIONS

### 6.1 Les 5 objections et strategies de reponse

#### Objection 1 : "C'est trop cher" (35% des deals perdus)

**Strategie :** Isoler le comparatif + proposer tier inferieur + echelonnement + ROI chiffre.

**Template email complet :**

```
Objet : Re: Proposition Axiom - Flexibilite tarifaire

Bonjour [prenom],

Je comprends que l'investissement puisse paraitre important. Quelques elements pour
eclairer votre reflexion :

1. **Formule adaptee** : Nous avons aussi une formule "[tier_inferieur]" a [prix] EUR HT,
   qui couvre vos besoins essentiels.

2. **Echelonnement** : Nous proposons un paiement en [2-3] fois ([detail_echeances]),
   ce qui revient a [montant_mensuel] EUR/mois.

3. **ROI mesurable** : Sur la base de projets similaires, le retour sur investissement
   se situe entre 3 et 6 mois.

La question n'est pas "combien ca coute" mais "combien ca rapporte vs ne rien faire".
Chaque mois sans [benefice_principal] represente un manque a gagner.

Voulez-vous qu'on ajuste la proposition sur la formule [tier_inferieur] avec echelonnement ?

Jonathan
```

#### Objection 2 : "Pas le bon moment" (25% des deals perdus)

**Strategie :** Identifier le trigger temporel + fixer une date + quantifier le cout de l'inaction.

**Template email complet :**

```
Objet : Re: Votre projet [type_projet] - On planifie ?

Bonjour [prenom],

Je comprends, le timing est important.

Deux questions rapides pour qu'on se retrouve au bon moment :

- Votre budget pour ce type de projet est-il prevu sur quel trimestre ?
- Y a-t-il un evenement ou une deadline qui rendrait le projet plus urgent ?

Si [mois_suggestion] est plus confortable, je vous propose de bloquer un creneau
des maintenant : [calendly_url]

En attendant, "pas maintenant" ne signifie pas "jamais" -- et chaque mois sans
[benefice_principal] represente un manque a gagner reel.

A bientot,
Jonathan
```

#### Objection 3 : "On compare avec d'autres prestataires" (20% des deals perdus)

**Strategie :** Ne pas baisser le prix. Ajouter de la valeur (vitesse, inclusions, conformite). Differenciateurs factuels.

**Template email complet :**

```
Objet : Re: Votre comparaison - Ce qui nous differencie

Bonjour [prenom],

C'est une bonne demarche de comparer. Voici ce qui differencie Axiom :

1. **Zero sous-traitance** : Tout est fait en interne par notre equipe senior.
   Votre interlocuteur technique EST le developpeur.

2. **Inclusions** : Notre formule [tier_recommande] inclut deja
   [inclusions_differenciantes] (souvent en option ou facture separement ailleurs).

3. **Transparence** : Pas de frais caches. Le prix affiche est le prix final.
   Aucun supplement pour les revisions dans la limite contractuelle.

4. **Resultats** : [reference_client] a obtenu [resultat_concret] apres
   notre accompagnement.

Avez-vous clarifie ces 3 points avec [concurrent] ?
Je suis disponible pour un comparatif point par point si ca peut aider.

Jonathan
```

#### Objection 4 : "Pas de budget alloue" (15% des deals perdus)

**Strategie :** Unbundling (decouper en phases), pilot project, identifier ou reallouer du budget.

**Template email complet :**

```
Objet : Re: Budget - Solutions creatives

Bonjour [prenom],

Le budget est une contrainte reelle. Voici quelques pistes :

1. **Demarrer petit** : Notre formule "[tier_bronze]" a [prix_bronze] EUR couvre
   les fondamentaux. On peut monter en puissance ensuite.

2. **Echelonnement** : Jusqu'a 3 mois de paiement sans frais.

3. **Phase 1 / Phase 2** : On decoupe le projet en phases. Phase 1 avec le budget
   disponible, Phase 2 quand le budget se libere.

4. **ROI rapide** : [argument_roi] peut financer la Phase 2 des les premiers
   resultats.

Quel scenario correspondrait le mieux a votre situation ?

Jonathan
```

#### Objection 5 : "On n'est pas convaincus" / Indecision (5% des deals perdus)

**Strategie :** Simplifier a 2 options claires. Case study sectoriel. Reset de la conversation.

**Template email complet :**

```
Objet : On simplifie ? 2 options claires pour [entreprise_nom]

Bonjour [prenom],

J'ai l'impression qu'on s'est peut-etre complique les choses. Simplifions :

**OPTION A (rapide)** : Formule [tier_bronze] a [prix_bronze] EUR
[resume_bronze]
Livraison : [timeline_bronze] semaines

**OPTION B (complet)** : Formule [tier_recommande] a [prix_recommande] EUR
[resume_recommande]
Livraison : [timeline_recommande] semaines

Lequel resonne le plus ? Et quel serait le meilleur moment pour demarrer ?

Pas besoin de reponse elaboree. Un "A" ou "B" + une date me suffit.

Jonathan
```

### 6.2 Detection automatique des objections

```typescript
// Classification des objections dans les reponses prospects via Claude API
async function classifyObjection(prospectReply: string): Promise<{
  objection_type: 'prix_eleve' | 'timing' | 'concurrence' | 'budget' | 'inaction' | 'aucune'
  confidence: number
  action: string
}> {
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Classifie cette reponse de prospect post-devis dans UNE des categories suivantes :

1. prix_eleve - Le prospect trouve le prix trop cher
2. timing - Ce n'est pas le bon moment
3. concurrence - Le prospect compare avec un concurrent
4. budget - Le prospect n'a pas de budget alloue
5. inaction - Le prospect est indecis, ne se prononce pas
6. aucune - Le prospect est positif, pas d'objection

REPONSE DU PROSPECT :
"${prospectReply}"

Reponds en JSON : {"objection_type": "...", "confidence": 0.95, "action": "..."}`
    }]
  })

  return JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{}')
}
```

### 6.3 Raisons de perte a tracker

| Raison | % historique typique | Action corrective |
|--------|---------------------|-------------------|
| Prix trop eleve | 35% | Proposer tier inferieur + echelonnement |
| Timing / pas le bon moment | 25% | Qualifier timing avant RDV + nurture |
| Concurrence en lice | 20% | Differentiation ROI + case studies |
| Pas de next step defini | 15% | Calendly systematique en fin de RDV |
| Inaction prospect | 5% | 5-6 relances structurees avant abandon |

---

## 7. METRIQUES

### 7.1 Metriques cles a tracker

| Metrique | Definition | Cible Axiom | Benchmark industrie (agences web) |
|----------|-----------|-------------|----------------------------------|
| **Win Rate** | Deals gagnes / total deals | 35-40% | 20-30% |
| **Deal Velocity** | (Nb deals x Deal size x Win rate) / Cycle jours | 3 250 EUR/jour | Variable |
| **Pipeline Coverage** | Pipeline total / Quota mensuel | 3.0-3.5x | 3.0x minimum |
| **Cycle moyen** | Jours de creation deal a signature | 30-40 jours | 50-60 jours |
| **Conversion Devis -> Signe** | % de devis envoyes qui aboutissent | 35-40% | 25-35% |
| **Taux relance efficace** | % de relances qui generent une reponse | 25-30% | 20% |
| **Time to Quote** | Delai entre RDV et envoi devis | < 2 heures | 3-5 jours |
| **Time to Sign** | Delai entre envoi contrat et signature | < 48h | 5-7 jours |
| **Engagement Score moyen** | Score moyen des deals actifs | > 25 | -- |
| **Breakup Recovery** | % de breakup emails qui generent reponse | 33% | 20% |

### 7.2 Calcul Deal Velocity

```
Formule :
  Deal Velocity = (Nb deals x Deal size moyen x Win rate) / Cycle moyen

Baseline (sans DEALMAKER) :
  (15 deals x 10 000 EUR x 0.25) / 50 jours = 750 EUR/jour

Objectif (avec DEALMAKER) :
  (25 deals x 13 000 EUR x 0.40) / 40 jours = 3 250 EUR/jour

Amelioration : +333% vs baseline
```

### 7.3 Dashboard metriques (alimentant Agent 7)

```typescript
interface DealmakerDashboard {
  date: string

  // Pipeline overview
  pipeline: {
    deals_actifs: number
    pipeline_value_total: number
    pipeline_coverage: number    // pipeline / quota
    deals_par_stage: Record<string, number>
    value_par_stage: Record<string, number>
  }

  // Performance
  performance: {
    win_rate_30j: number
    win_rate_90j: number
    avg_deal_size: number
    avg_cycle_days: number
    deals_won_mtd: number        // Month-to-date
    revenue_won_mtd: number
    deals_lost_mtd: number
    deal_velocity: number
  }

  // Conversion funnel
  funnel: {
    qualification_to_devis: number         // %
    devis_to_consideration: number         // %
    consideration_to_negociation: number   // %
    negociation_to_signature: number       // %
    signature_to_gagne: number             // %
    overall_conversion: number             // %
  }

  // Relance effectiveness
  relance: {
    total_relances_envoyees: number
    taux_reponse_global: number
    taux_reponse_par_step: Record<number, number>
    breakup_recovery_rate: number
    avg_engagement_score: number
  }

  // Objections
  objections: {
    total_objections_traitees: number
    par_type: Record<string, number>
    resolution_rate: number
    top_objection: string
  }

  // Loss analysis
  pertes: {
    total_perdu: number
    raisons: Record<string, number>
    montant_perdu_total: number
    avg_deal_perdu: number
  }

  // Signature
  signature: {
    avg_time_to_sign_hours: number
    signature_conversion_rate: number
    rappels_envoyes: number
    signatures_expirees: number
  }
}
```

---

## 8. OUTPUT : SCHEMAS JSON

### 8.1 Output vers Agent 10 (CSM) -- Deal signe

Envoye via la queue BullMQ `csm-onboarding` quand le webhook Yousign confirme la signature.

```typescript
interface DealToCSM {
  deal_id: string
  prospect_id: string

  prospect: {
    prenom: string
    nom: string
    email: string
    telephone?: string
    linkedin_url?: string
    poste: string
  }

  entreprise: {
    nom: string
    siret: string
    site_web: string
    secteur: string
    taille: number
  }

  contrat: {
    montant_ht: number
    tier: 'bronze' | 'silver' | 'gold'
    type_projet: 'site_vitrine' | 'ecommerce_shopify' | 'app_flutter' | 'app_metier' | 'rgaa' | 'tracking_server_side'
    scope_detaille: string[]          // Liste des livrables convenus
    date_signature: string            // ISO 8601
    date_demarrage_prevue: string     // ISO 8601
    duree_estimee_semaines: number
    conditions_paiement: '50/50' | '30/40/30' | 'mensuel'
    contrat_pdf_url: string           // URL du contrat signe
  }

  notes_vente: string                 // Contexte commercial (objections levees, attentes speciales)

  metadata: {
    agent: 'agent_8_dealmaker'
    created_at: string
    deal_cycle_days: number           // Nombre de jours du cycle de vente
    nb_relances: number
    engagement_score_final: number
    version: string
  }
}
```

### 8.2 Output vers Agent 7 (ANALYSTE) -- Metriques deals

Envoye via la queue BullMQ `analyste-metrics` a chaque evenement significatif (deal gagne, deal perdu, changement de stage).

```typescript
// Event ponctuel (a chaque deal gagne ou perdu)
interface DealMetricsEvent {
  type: 'deal_won' | 'deal_lost' | 'deal_stage_change'
  deal_id: string
  date: string                        // ISO 8601

  // Deal won / lost
  montant: number
  cycle_days: number                  // Nombre de jours du cycle
  segment: string
  tier: string
  nb_relances: number
  source_canal: 'email' | 'linkedin'

  // Deal lost specific
  lost_reason?: 'PRIX' | 'TIMING' | 'CONCURRENCE' | 'INACTION' | 'AUTRE'
  lost_detail?: string

  // Stage change specific
  from_stage?: string
  to_stage?: string
}

// Snapshot quotidien (envoye chaque soir a 22h)
interface DealMetricsSnapshot {
  date: string
  type: 'daily_snapshot'

  deals_in_pipeline: number
  pipeline_value: number
  win_rate_30j: number
  avg_deal_size: number
  avg_cycle_days: number
  deals_won_today: number
  deals_lost_today: number
  deals_stalled_over_30days: number

  conversion_rates: {
    qualification_to_devis: number
    devis_to_negociation: number
    negociation_to_signe: number
    overall: number
  }

  top_loss_reasons: Array<{ reason: string; count: number }>
  revenue_velocity_per_day: number

  signature_metrics: {
    avg_time_to_sign_hours: number
    conversion_rate: number
    pending_signatures: number
  }

  metadata: {
    agent: 'agent_8_dealmaker'
    generated_at: string
    version: string
  }
}
```

### 8.3 Output vers Agent 6 (NURTUREUR) -- Deal perdu

Envoye via la queue BullMQ `nurturer-lost-deal` quand un deal est marque comme PERDU (refus explicite ou timeout 45 jours).

```typescript
interface LostDealToNurturer {
  prospect_id: string
  deal_id: string

  // Raison de la perte
  reason: 'PRIX' | 'TIMING' | 'CONCURRENCE' | 'INACTION' | 'AUTRE'
  detail: string                     // Description detaillee de la raison

  // Historique du deal
  dernier_contact: string            // ISO 8601
  historique_touches: number         // Nombre total de points de contact
  montant_estime: number             // Montant du deal perdu
  type_projet: string
  tier_propose: string

  // Recommandation de re-engagement
  recommendation: string             // Strategie suggeree pour re-nurture
  recontact_date: string             // ISO 8601, date suggeree pour relance

  // Contexte prospect
  prospect: {
    prenom: string
    nom: string
    email: string
    entreprise_nom: string
    poste: string
    segment: string
  }

  metadata: {
    agent: 'agent_8_dealmaker'
    lost_at: string
    deal_cycle_days: number
    nb_relances: number
    engagement_score_final: number
    version: string
  }
}
```

---

## 9. COUTS

### 9.1 Couts mensuels detailles

| Poste | Cout mensuel | Details |
|-------|-------------|---------|
| **Yousign Plus** | 28 EUR | API V3, signatures illimitees, rappels auto, branding |
| **Infrastructure** (part Agent 8 sur VPS partage) | 20 EUR | Puppeteer, Node.js, Redis (BullMQ), stockage PDF |
| **Claude API** (generation scope + classification objections) | 8 EUR | ~100 devis/mois x 0.0009 EUR + ~200 classifications x 0.003 EUR |
| **Stockage S3/Minio** (PDF devis + contrats) | 5 EUR | ~100 PDF/mois x 0.5 MB = ~600 MB/an |
| **Domaine tracking** | 1 EUR | Sous-domaine devis.axiom-marketing.fr |
| **TOTAL** | **62 EUR/mois** | **744 EUR/an** |

### 9.2 ROI projete

| Metrique | Valeur |
|----------|--------|
| Cout annuel Agent 8 | 744 EUR |
| Deals moyens/mois (objectif) | 4-6 |
| Montant moyen deal | 13 000 EUR |
| Revenu annuel incremental (vs pas d'automatisation) | +52 000 - 78 000 EUR |
| **ROI** | **70x - 105x** |

**Note :** L'option PandaDoc (40 EUR/mois + 4 EUR/doc) ajouterait 80-440 EUR/mois mais offrirait du tracking natif. A evaluer apres 3 mois d'exploitation avec la solution Puppeteer maison.

---

## 10. VERIFICATION DE COHERENCE

### 10.1 Input == Output Agent 5 "INTERESSE"

Verification que l'input du DEALMAKER est coherent avec le flux de l'Agent 5 lorsqu'un prospect est classifie "INTERESSE".

| Donnee requise par Agent 8 | Source dans l'Agent 5 | Statut |
|---|---|---|
| `prospect_id` | `replyData.prospect_id` (stocke en BDD) | VALIDE |
| `prospect.prenom` | `prospects.prenom` (BDD, rempli par Agent 2) | VALIDE |
| `prospect.nom` | `prospects.nom` (BDD, rempli par Agent 2) | VALIDE |
| `prospect.email` | `prospects.email` (BDD, rempli par Agent 2) | VALIDE |
| `prospect.poste` | `prospects.poste` (BDD, rempli par Agent 2) | VALIDE |
| `entreprise.nom` | `prospects.entreprise_nom` (BDD, rempli par Agent 2) | VALIDE |
| `entreprise.siret` | `entreprise.siret` (BDD, rempli par Agent 2 Enrichisseur) | VALIDE |
| `scoring.score_total` | `prospects.score_total` (BDD, calcule par Agent 3) | VALIDE |
| `scoring.categorie` | `prospects.categorie` (BDD, calcule par Agent 3) | VALIDE |
| `scoring.segment` | `prospects.segment` (BDD, calcule par Agent 3) | VALIDE |
| `historique.nb_emails_envoyes` | `email_sends` table (BDD, logs Agent 5) | VALIDE |
| `historique.reply_classification.category` | `reply_classifications.category` (Agent 5 classifie "INTERESSE") | VALIDE |
| `rdv_decouverte.notes_jonathan` | Saisie par Jonathan APRES le RDV (formulaire Slack ou CRM) | VALIDE (source humaine) |
| `rdv_decouverte.besoins_identifies` | Saisie par Jonathan APRES le RDV | VALIDE (source humaine) |

**Flux complet :**
```
Agent 5 detecte "INTERESSE" (confidence > 0.85)
  --> Agent 5 arrete la sequence
  --> Agent 5 met prospect.status = 'INTERESTED'
  --> Agent 5 notifie Jonathan (Slack URGENT, SLA < 5 min)
  --> Jonathan effectue le RDV decouverte
  --> Jonathan saisit ses notes (formulaire Slack interactif)
  --> Systeme cree DealmakerInput en combinant :
       - Donnees prospect (BDD, Agents 1-3)
       - Historique interactions (BDD, Agent 5)
       - Classification reply (BDD, Agent 5)
       - Notes RDV (Jonathan)
  --> Job envoye dans queue BullMQ `dealmaker-pipeline`
  --> Agent 8 prend le relais
```

### 10.2 Output compatible Agent 10 (CSM)

| Champ output Agent 8 (DealToCSM) | Requis par Agent 10 | Statut |
|---|---|---|
| `deal_id` | Identifiant unique du deal | VALIDE |
| `prospect_id` | Lien vers le prospect en BDD | VALIDE |
| `prospect.prenom/nom/email` | Pour les communications onboarding | VALIDE |
| `entreprise.nom/siret` | Pour la facturation et le suivi | VALIDE |
| `contrat.montant_ht` | Pour le calcul de valeur client | VALIDE |
| `contrat.tier` | Pour adapter le niveau de service | VALIDE |
| `contrat.type_projet` | Pour router vers le bon workflow onboarding | VALIDE |
| `contrat.scope_detaille` | Pour creer le backlog du projet | VALIDE |
| `contrat.date_demarrage_prevue` | Pour planifier le kickoff | VALIDE |
| `contrat.duree_estimee_semaines` | Pour fixer les jalons | VALIDE |
| `contrat.conditions_paiement` | Pour la gestion des factures | VALIDE |
| `contrat.contrat_pdf_url` | Archive du contrat signe | VALIDE |
| `notes_vente` | Contexte pour l'equipe projet | VALIDE |

### 10.3 Output compatible Agent 7 (ANALYSTE)

| Champ output Agent 8 (DealMetricsEvent) | Requis par Agent 7 | Statut |
|---|---|---|
| `type` (deal_won/deal_lost) | Pour le routing des metriques | VALIDE |
| `deal_id` | Identifiant unique | VALIDE |
| `montant` | Pour calcul revenue, deal size moyen | VALIDE |
| `cycle_days` | Pour calcul deal velocity, cycle moyen | VALIDE |
| `segment` | Pour segmentation des metriques | VALIDE |
| `tier` | Pour analyse de la repartition tiers | VALIDE |
| `nb_relances` | Pour optimisation des sequences | VALIDE |
| `source_canal` | Pour analyse d'efficacite par canal | VALIDE |
| `lost_reason` (si perdu) | Pour analyse des raisons de perte | VALIDE |

### 10.4 Output compatible Agent 6 (NURTUREUR)

| Champ output Agent 8 (LostDealToNurturer) | Requis par Agent 6 | Statut |
|---|---|---|
| `prospect_id` | Pour identifier le prospect a re-nurturer | VALIDE |
| `reason` | Pour adapter la strategie de nurturing | VALIDE |
| `recommendation` | Pour guider le contenu de nurturing | VALIDE |
| `recontact_date` | Pour planifier la reprise de contact | VALIDE |
| `prospect.*` | Donnees prospect completes | VALIDE |
| `montant_estime` | Pour prioriser les re-engagements | VALIDE |

### 10.5 Resume de coherence

```
COHERENCE GLOBALE : 100% VALIDE

Input Agent 8 :
  - Donnees prospect (Agents 1-3 via BDD)     --> OK
  - Historique interactions (Agent 5 via BDD)  --> OK
  - Classification INTERESSE (Agent 5)          --> OK
  - Notes RDV Jonathan (saisie humaine)         --> OK

Output Agent 8 :
  - Vers Agent 10 (CSM) : DealToCSM            --> OK, tous champs presents
  - Vers Agent 7 (ANALYSTE) : DealMetrics      --> OK, tous champs presents
  - Vers Agent 6 (NURTUREUR) : LostDeal        --> OK, tous champs presents
```

---

## ANNEXE A : SCHEMA DE BASE DE DONNEES (TABLES SPECIFIQUES AGENT 8)

```sql
-- Table principale des deals
CREATE TABLE deals (
  deal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  lead_id UUID REFERENCES leads(lead_id),

  -- Stage pipeline
  stage VARCHAR(30) NOT NULL DEFAULT 'QUALIFICATION'
    CHECK (stage IN ('QUALIFICATION', 'DEVIS_CREE', 'DEVIS_EN_CONSIDERATION',
                     'NEGOCIATION', 'SIGNATURE_EN_COURS', 'GAGNE', 'PERDU')),
  stage_changed_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Montants
  montant_estime NUMERIC(12,2),
  montant_final NUMERIC(12,2),
  montant_signe NUMERIC(12,2),
  tier_recommande VARCHAR(10),
  tier_final VARCHAR(10),
  type_projet VARCHAR(50),

  -- Devis
  devis_id VARCHAR(30),
  devis_url TEXT,
  devis_envoye_at TIMESTAMP,
  tracking_id UUID,

  -- Signature
  yousign_signature_request_id VARCHAR(100),
  yousign_document_id VARCHAR(100),
  yousign_signer_id VARCHAR(100),
  contrat_envoye_at TIMESTAMP,
  contrat_signe_url TEXT,
  date_signature TIMESTAMP,

  -- Relance
  nb_relances INTEGER DEFAULT 0,
  derniere_relance_at TIMESTAMP,
  derniere_objection VARCHAR(30),
  derniere_objection_at TIMESTAMP,

  -- Perte
  lost_reason VARCHAR(30),
  lost_at TIMESTAMP,

  -- RDV decouverte
  rdv_notes JSONB,
  start_date DATE,

  -- Metadata
  source VARCHAR(30) DEFAULT 'pipeline_prospection',
  segment VARCHAR(50),
  canal_principal VARCHAR(20),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deals_prospect ON deals(prospect_id);
CREATE INDEX idx_deals_stage ON deals(stage);
CREATE INDEX idx_deals_yousign ON deals(yousign_signature_request_id);
CREATE INDEX idx_deals_created ON deals(created_at);

-- Table de tracking des ouvertures de devis
CREATE TABLE devis_tracking (
  tracking_id UUID PRIMARY KEY,
  devis_id VARCHAR(30) NOT NULL,
  pdf_url TEXT NOT NULL,
  opens INTEGER DEFAULT 0,
  last_opened_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE devis_opens (
  id SERIAL PRIMARY KEY,
  tracking_id UUID NOT NULL REFERENCES devis_tracking(tracking_id),
  opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  referer TEXT
);

CREATE INDEX idx_devis_opens_tracking ON devis_opens(tracking_id);

-- Table de scoring d'engagement post-devis
CREATE TABLE engagement_scores (
  deal_id UUID PRIMARY KEY REFERENCES deals(deal_id),
  score INTEGER NOT NULL DEFAULT 0,
  signals JSONB DEFAULT '[]'::jsonb,
  last_updated TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table des activites du deal (audit trail)
CREATE TABLE deal_activities (
  id SERIAL PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES deals(deal_id),
  type VARCHAR(50) NOT NULL,
  step INTEGER,
  engagement_score INTEGER,
  details JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deal_activities_deal ON deal_activities(deal_id);
CREATE INDEX idx_deal_activities_type ON deal_activities(type);

-- Table de deduplication des webhooks
CREATE TABLE webhook_events (
  event_id VARCHAR(100) PRIMARY KEY,
  processed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Vue pipeline summary pour dashboard
CREATE OR REPLACE VIEW v_pipeline_summary AS
SELECT
  stage,
  COUNT(*) as nb_deals,
  SUM(COALESCE(montant_estime, 0)) as value_total,
  AVG(COALESCE(montant_estime, 0)) as avg_deal_size,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400) as avg_age_days
FROM deals
WHERE stage NOT IN ('GAGNE', 'PERDU')
GROUP BY stage
ORDER BY
  CASE stage
    WHEN 'QUALIFICATION' THEN 1
    WHEN 'DEVIS_CREE' THEN 2
    WHEN 'DEVIS_EN_CONSIDERATION' THEN 3
    WHEN 'NEGOCIATION' THEN 4
    WHEN 'SIGNATURE_EN_COURS' THEN 5
  END;

-- Vue win rate rolling 30 jours
CREATE OR REPLACE VIEW v_win_rate_30j AS
SELECT
  COUNT(*) FILTER (WHERE stage = 'GAGNE') as deals_gagnes,
  COUNT(*) FILTER (WHERE stage IN ('GAGNE', 'PERDU')) as deals_fermes,
  ROUND(
    COUNT(*) FILTER (WHERE stage = 'GAGNE')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE stage IN ('GAGNE', 'PERDU')), 0) * 100,
    2
  ) as win_rate_pct,
  COALESCE(AVG(montant_signe) FILTER (WHERE stage = 'GAGNE'), 0) as avg_deal_signe,
  COALESCE(
    AVG(EXTRACT(EPOCH FROM (date_signature - created_at)) / 86400)
    FILTER (WHERE stage = 'GAGNE'),
    0
  ) as avg_cycle_days
FROM deals
WHERE stage IN ('GAGNE', 'PERDU')
AND COALESCE(date_signature, lost_at, updated_at) >= NOW() - INTERVAL '30 days';

-- Vue raisons de perte
CREATE OR REPLACE VIEW v_loss_reasons AS
SELECT
  lost_reason,
  COUNT(*) as nb_deals,
  SUM(montant_estime) as value_perdue,
  AVG(EXTRACT(EPOCH FROM (lost_at - created_at)) / 86400) as avg_days_before_lost,
  ROUND(
    COUNT(*)::numeric /
    NULLIF((SELECT COUNT(*) FROM deals WHERE stage = 'PERDU' AND lost_at >= NOW() - INTERVAL '90 days'), 0) * 100,
    1
  ) as pct_total
FROM deals
WHERE stage = 'PERDU'
AND lost_at >= NOW() - INTERVAL '90 days'
GROUP BY lost_reason
ORDER BY nb_deals DESC;
```

---

## ANNEXE B : VARIABLES D'ENVIRONNEMENT

```bash
# === Yousign ===
YOUSIGN_API_KEY=ysk_live_xxxxxxxxxxxxxxxxxxxx
YOUSIGN_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxx

# === Claude API ===
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx

# === Redis (BullMQ) ===
REDIS_HOST=localhost
REDIS_PORT=6379

# === Base de donnees ===
DATABASE_URL=postgresql://user:password@localhost:5432/axiom_deals

# === Slack ===
SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxxxxxxxxxx
SLACK_CHANNEL_DEALS=#deals
SLACK_CHANNEL_ERRORS=#deals-errors

# === Email ===
GOOGLE_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxx
GOOGLE_REFRESH_TOKEN=xxxxxxxxxxxxxxxxxxxx

# === Stockage ===
S3_ENDPOINT=https://s3.eu-west-3.amazonaws.com
S3_BUCKET=axiom-devis-contrats
S3_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxx
S3_SECRET_KEY=xxxxxxxxxxxxxxxxxxxx

# === Application ===
AXIOM_API_URL=https://api.axiom-marketing.fr
CALENDLY_URL=https://calendly.com/jonathan-axiom/30min
NODE_ENV=production
```

---

**Fin des specifications Agent 8 -- DEALMAKER**
**Version 1.0 -- 19 mars 2026**
