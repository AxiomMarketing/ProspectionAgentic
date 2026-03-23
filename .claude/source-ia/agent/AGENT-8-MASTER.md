# AGENT 8 — DEALMAKER (MASTER)
**Fichiers associes** : AGENT-8a-DEVIS.md, AGENT-8b-RELANCES.md, AGENT-8c-SIGNATURE.md
**Position** : Agent 5 → Agent 8 → Agent 10 (CSM)
**Cout** : ~62 EUR/mois

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

L'Agent 8 se decompose en 3 sous-agents specialises. Chaque sous-agent est documente dans son propre fichier :

| Sous-agent | Fichier | Mission |
|---|---|---|
| **8a. Generateur de Devis** | [AGENT-8a-DEVIS.md](AGENT-8a-DEVIS.md) | Creer automatiquement un devis personnalise en < 30s avec tiering Bronze/Silver/Gold, Puppeteer PDF, Claude API scope |
| **8b. Relanceur de Deals** | [AGENT-8b-RELANCES.md](AGENT-8b-RELANCES.md) | Sequences J3/J7/J14 breakup, scoring engagement post-devis, gestion prospects fantomes |
| **8c. Gestionnaire de Signature** | [AGENT-8c-SIGNATURE.md](AGENT-8c-SIGNATURE.md) | Yousign API V3 (9 endpoints), generation contrat PDF, relance signature J2/J5/J7, trigger onboarding |

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

Les grilles detaillees par service sont definies dans le fichier [AGENT-8a-DEVIS.md](AGENT-8a-DEVIS.md) (section `SERVICE_TEMPLATES`) avec pour chaque tier :
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

**Fin des specifications Agent 8 -- DEALMAKER (MASTER)**
**Version 1.0 -- 19 mars 2026**
