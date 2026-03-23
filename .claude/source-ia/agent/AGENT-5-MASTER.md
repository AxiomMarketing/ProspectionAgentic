# AGENT 5 — SUIVEUR (MASTER)
**Fichiers associes** : AGENT-5a-EMAIL.md, AGENT-5b-LINKEDIN.md, AGENT-5c-REPONSES.md, AGENT-5d-SEQUENCES.md
**Position dans le pipeline** : Agent 4 (Redacteur) → Agent 5 → Agent 6 (Nurtureur) / Agent 8 (Dealmaker)
**Cout** : ~150 EUR/mois

**Version :** 1.0
**Date :** 2026-03-18
**Auteur :** Systeme Axiom Marketing
**Contexte :** Pipeline de prospection automatise B2B multicanal (Email + LinkedIn)
**Public :** Jonathan Dewaele, Marty Wong, equipe tech Univile

---

## 1. MISSION

### 1.1 Definition

L'Agent 5 (SUIVEUR) est le **moteur d'execution** du pipeline de prospection Axiom Marketing. Il recoit les messages prets a envoyer de l'Agent 4 (REDACTEUR) et les **envoie au bon moment, sur le bon canal, au bon prospect**, puis **detecte et classifie les reponses**, **gere les sequences multicanales**, et **notifie Jonathan** des evenements importants.

### 1.2 Responsabilites exactes

| Responsabilite | Agent 5 fait | Autres agents font |
|---|---|---|
| **Envoi email** | Envoi via Gmail API/Mailgun, tracking, gestion bounces | Agent 4 redige le contenu |
| **Envoi LinkedIn** | Connexions + messages via Waalaxy, likes/comments auto | Agent 4 redige notes et messages |
| **Detection reponses** | Polling inbox, webhook Gmail, detection LinkedIn | Agent 6 prend le relais pour nurturing |
| **Classification IA** | Claude API pour classifier chaque reponse | -- |
| **Orchestration sequences** | Scheduler etapes, widening gap, arret si reponse | Agent 3 definit le scoring/priorite |
| **Notifications** | Slack interactif, SLA, escalade | Jonathan prend la decision finale |
| **Domain warming** | Warmup progressif, rotation domaines | -- |
| **Logging interactions** | Toutes les interactions sont loggees | Agent 7 les analyse |

### 1.3 Ce que le Suiveur ne fait PAS

- Ne redige aucun message (responsabilite Agent 4 REDACTEUR)
- Ne score pas les prospects (responsabilite Agent 3 SCOREUR)
- Ne fait pas de nurturing long terme (responsabilite Agent 6 NURTUREUR)
- Ne produit pas de rapports analytiques (responsabilite Agent 7 ANALYSTE)
- Ne prend pas de decisions commerciales (responsabilite de Jonathan)

### 1.4 Position dans le pipeline

```
Agent 1 (VEILLEUR) --> Agent 2 (ENRICHISSEUR) --> Agent 3 (SCOREUR)
                                                       |
                                                       v
                                              Agent 4 (REDACTEUR)
                                                       |
                                                       v
                                           ===========================
                                           |  AGENT 5 (SUIVEUR)      |
                                           |  - Envoie messages      |
                                           |  - Detecte reponses     |
                                           |  - Gere sequences       |
                                           |  - Notifie Jonathan     |
                                           ===========================
                                                       |
                                              +--------+--------+
                                              |                 |
                                              v                 v
                                     Agent 6 (NURTUREUR)  Agent 7 (ANALYSTE)
```


---

## 2. INPUT : SCHEMA JSON RECU DE L'AGENT 4

### 2.1 Schema JSON complet (output Agent 4 = input Agent 5)

Le Suiveur recoit cet objet via la queue BullMQ `suiveur-pipeline`. Chaque job contient un objet `RedacteurOutput` complet.

```typescript
interface SuiveurInput {
  // === Identifiants ===
  message_id: string           // UUID v4 unique du message
  prospect_id: string          // UUID v4 du prospect
  lead_id: string              // UUID v4 du lead original (venant de l'Agent 1)
  generated_at: string         // ISO 8601 timestamp de generation

  // === Message pret a envoyer ===
  message: {
    canal: 'email' | 'linkedin_connection' | 'linkedin_message' | 'linkedin_inmail'
    type: string               // ex: 'email_froid', 'follow_up_1', etc.
    subject_line: string | null // null pour LinkedIn
    body: string               // Corps du message (plain text)
    cta: string                // Call-to-action
    signature: string          // Signature email
    format: 'plain_text'       // Toujours plain text
    word_count: number
    language: 'fr' | 'en'
  }

  // === Message LinkedIn (si applicable) ===
  linkedin_message: {
    connection_note: {
      content: string          // Max 300 caracteres
      character_count: number
    }
    post_connection_message: {
      content: string          // Message apres acceptation connexion
      character_count: number
    }
  } | null

  // === Donnees prospect ===
  prospect: {
    prenom: string
    nom: string
    email: string
    email_verified: boolean
    linkedin_url: string | null
    poste: string
    entreprise_nom: string
  }

  // === Instructions de sequence ===
  sequence: {
    sequence_id: string        // ex: 'SEQ_HOT_B_PRIORITY'
    etape_actuelle: number     // 1, 2, 3, 4...
    etape_total: number
    etape_type: string         // 'premier_contact', 'follow_up', 'breakup'
    prochaine_etape_dans_jours: number
    espacement_jours: number[] // ex: [0, 2, 5, 10]
  }

  // === Reference template ===
  template: {
    template_id: string
    template_version: string
    template_status: 'control' | 'challenger'
    ab_test_id: string | null
    ab_variant: 'A' | 'B' | null
  }

  // === Score et categorie ===
  scoring: {
    score_total: number        // 0-100
    categorie: 'HOT' | 'WARM' | 'COLD'
    sous_categorie: string | null  // 'HOT_A', 'HOT_B', 'HOT_C', etc.
    segment: string            // 'pme_metro', 'startup_tech', etc.
    signal_principal: string
  }

  // === Validation Agent 4 ===
  validation: {
    statut: 'approved' | 'approved_with_edit'
    validated_by: 'jonathan' | 'auto'
    validated_at: string       // ISO 8601
    quality_checks: {
      longueur: 'PASS' | 'FAIL'
      spam_words: 'PASS' | 'FAIL'
      ton: 'PASS' | 'FAIL'
      hallucination: 'PASS' | 'FAIL'
      personnalisation: 'PASS' | 'FAIL'
    }
  }

  // === Instructions de routage ===
  routing: {
    canal_principal: string    // 'email_perso', 'email_generique', 'linkedin_dm'
    canal_secondaire: string | null
    urgence: 'haute' | 'moyenne' | 'basse'
    sla_heures: number         // Delai max avant envoi
    priorite_queue: number     // 1 = plus haute
    domaine_envoi_suggere: string  // 'axiom-marketing.fr', etc.
  }

  // === Donnees d'impact ===
  impact_data: {
    perte_ca_mensuelle: number
    perte_ca_annuelle: number
    taux_bounce_estime: number
    impact_conversion_pct: number
    message_impact: string
  }

  // === Metadata Agent 4 ===
  metadata: {
    agent: 'agent_4_redacteur'
    generation_model: string
    generation_temperature: number
    generation_cost_usd: number
    generation_latency_ms: number
    generation_attempts: number
    batch_id: string
    redacteur_version: string
  }
}
```

### 2.2 Reception via BullMQ Worker

```typescript
import { Worker, Job } from 'bullmq'

const suiveurWorker = new Worker(
  'suiveur-pipeline',
  async (job: Job<SuiveurInput>) => {
    const input = job.data

    // 1. Valider l'input
    const validation = validateSuiveurInput(input)
    if (!validation.valid) {
      console.error(`[Agent5] Input invalide: ${validation.errors.join(', ')}`)
      throw new Error(`INVALID_INPUT: ${validation.errors.join(', ')}`)
    }

    // 2. Verifier que le prospect n'est pas deja supprime/opt-out
    const prospectStatus = await getProspectStatus(input.prospect_id)
    if (['SUPPRESSED', 'OPTED_OUT', 'EXCLUDED'].includes(prospectStatus)) {
      console.warn(`[Agent5] Prospect ${input.prospect_id} est ${prospectStatus}, skip`)
      return { status: 'SKIPPED', reason: prospectStatus }
    }

    // 3. Verifier idempotence (pas de doublon)
    const alreadySent = await checkIdempotency(input.message_id)
    if (alreadySent) {
      console.warn(`[Agent5] Message ${input.message_id} deja envoye`)
      return { status: 'DUPLICATE', message_id: input.message_id }
    }

    // 4. Router vers le bon sous-agent
    return await routeToSubAgent(input)
  },
  {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    concurrency: 5,
    limiter: {
      max: 10,       // Max 10 jobs par intervalle
      duration: 60000 // Par minute
    }
  }
)

async function routeToSubAgent(input: SuiveurInput): Promise<any> {
  const canal = input.message.canal

  switch (canal) {
    case 'email':
      return await SubAgent5a_EnvoyeurEmail.process(input)

    case 'linkedin_connection':
    case 'linkedin_message':
    case 'linkedin_inmail':
      return await SubAgent5b_EnvoyeurLinkedIn.process(input)

    default:
      throw new Error(`Canal inconnu: ${canal}`)
  }
}

function validateSuiveurInput(input: SuiveurInput): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!input.message_id) errors.push('message_id manquant')
  if (!input.prospect_id) errors.push('prospect_id manquant')
  if (!input.message?.body) errors.push('message.body manquant')
  if (!input.prospect?.email && input.message.canal === 'email') {
    errors.push('prospect.email manquant pour canal email')
  }
  if (!input.prospect?.linkedin_url && input.message.canal.startsWith('linkedin')) {
    errors.push('prospect.linkedin_url manquant pour canal LinkedIn')
  }
  if (!input.validation || input.validation.statut === 'rejected') {
    errors.push('message non approuve (statut rejected)')
  }
  if (!input.sequence?.sequence_id) errors.push('sequence_id manquant')
  if (!input.routing?.canal_principal) errors.push('routing.canal_principal manquant')

  return { valid: errors.length === 0, errors }
}
```

---

---

## 4. SEQUENCES COMPLETES PAR SEGMENT

### 4.1 Format JSON de definition d'une sequence

```typescript
interface SequenceDefinition {
  sequence_id: string
  nom: string
  description: string
  categorie_cible: 'HOT' | 'WARM' | 'COLD'
  segment_cible: string
  duree_totale_jours: number
  nombre_etapes: number
  etapes: SequenceStep[]
  conditions_arret: StopCondition[]
}

interface SequenceStep {
  etape_numero: number
  jour: number                // Jour relatif (0 = premier contact)
  canal: 'email' | 'linkedin_connection' | 'linkedin_message' | 'linkedin_visit' | 'linkedin_like'
  action: string              // Description de l'action
  template_id: string         // Reference au template Agent 4
  conditions: StepCondition[] // Conditions pour executer cette etape
  fallback: string | null     // Si la condition n'est pas remplie
  heure_optimale: { min: number; max: number }  // Heure locale prospect
}

interface StepCondition {
  type: 'linkedin_connected' | 'email_opened' | 'no_reply' | 'no_bounce' | 'business_day'
  value: boolean
}

interface StopCondition {
  type: 'reply_received' | 'bounce_hard' | 'opt_out' | 'linkedin_ban' | 'manual_stop'
  action: string
}
```

### 4.2 Sequence 1 : PME France metro (HOT)

```json
{
  "sequence_id": "SEQ_HOT_PME_METRO",
  "nom": "Hot PME Metro - Multicanal Intensif",
  "description": "Sequence intensive pour PME francaises scorees HOT. Duree courte, multicanal.",
  "categorie_cible": "HOT",
  "segment_cible": "pme_metro",
  "duree_totale_jours": 10,
  "nombre_etapes": 6,
  "etapes": [
    {
      "etape_numero": 1,
      "jour": 0,
      "canal": "linkedin_visit",
      "action": "Visite du profil LinkedIn pour creer une notification",
      "template_id": "VISIT_ONLY",
      "conditions": [
        { "type": "business_day", "value": true }
      ],
      "fallback": "reporter_jour_ouvre_suivant",
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 2,
      "jour": 0,
      "canal": "email",
      "action": "Email personnalise premier contact avec donnee d'impact",
      "template_id": "TPL-HOT-001",
      "conditions": [
        { "type": "no_bounce", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 3,
      "jour": 1,
      "canal": "linkedin_connection",
      "action": "Demande de connexion avec note personnalisee",
      "template_id": "TPL-LI-CONN-001",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 4,
      "jour": 3,
      "canal": "email",
      "action": "Follow-up email avec nouvel angle (social proof)",
      "template_id": "TPL-HOT-002-FOLLOWUP",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "no_bounce", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 5,
      "jour": 5,
      "canal": "linkedin_message",
      "action": "Message LinkedIn si connecte, sinon skip",
      "template_id": "TPL-LI-MSG-001",
      "conditions": [
        { "type": "linkedin_connected", "value": true },
        { "type": "no_reply", "value": true }
      ],
      "fallback": "skip_to_next_step",
      "heure_optimale": { "min": 10, "max": 12 }
    },
    {
      "etape_numero": 6,
      "jour": 10,
      "canal": "email",
      "action": "Email breakup - derniere tentative, ton leger et porte ouverte",
      "template_id": "TPL-HOT-003-BREAKUP",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    }
  ],
  "conditions_arret": [
    { "type": "reply_received", "action": "stop_et_classifier" },
    { "type": "bounce_hard", "action": "stop_et_supprimer" },
    { "type": "opt_out", "action": "stop_et_rgpd_suppression" },
    { "type": "manual_stop", "action": "stop_et_archiver" }
  ]
}
```

### 4.3 Sequence 2 : Startup Tech (HOT)

```json
{
  "sequence_id": "SEQ_HOT_STARTUP_TECH",
  "nom": "Hot Startup Tech - LinkedIn-First",
  "description": "Sequence LinkedIn-first pour startups tech. Decision rapide, canal informel.",
  "categorie_cible": "HOT",
  "segment_cible": "startup_tech",
  "duree_totale_jours": 14,
  "nombre_etapes": 6,
  "etapes": [
    {
      "etape_numero": 1,
      "jour": 0,
      "canal": "linkedin_like",
      "action": "Liker un post recent du prospect",
      "template_id": "LIKE_RECENT_POST",
      "conditions": [{ "type": "business_day", "value": true }],
      "fallback": "skip_to_next_step",
      "heure_optimale": { "min": 10, "max": 14 }
    },
    {
      "etape_numero": 2,
      "jour": 1,
      "canal": "linkedin_connection",
      "action": "Demande connexion avec note tech/startup friendly",
      "template_id": "TPL-LI-CONN-STARTUP-001",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 3,
      "jour": 3,
      "canal": "linkedin_message",
      "action": "Message LinkedIn personnalise avec donnee d'impact",
      "template_id": "TPL-LI-MSG-STARTUP-001",
      "conditions": [
        { "type": "linkedin_connected", "value": true },
        { "type": "no_reply", "value": true }
      ],
      "fallback": "send_email_instead",
      "heure_optimale": { "min": 10, "max": 12 }
    },
    {
      "etape_numero": 4,
      "jour": 7,
      "canal": "email",
      "action": "Email premier contact (si LinkedIn n'a pas converti)",
      "template_id": "TPL-HOT-STARTUP-EMAIL-001",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 5,
      "jour": 10,
      "canal": "email",
      "action": "Follow-up avec case study pertinent",
      "template_id": "TPL-HOT-STARTUP-EMAIL-002",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 6,
      "jour": 14,
      "canal": "email",
      "action": "Email breakup",
      "template_id": "TPL-HOT-STARTUP-EMAIL-003-BREAKUP",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    }
  ],
  "conditions_arret": [
    { "type": "reply_received", "action": "stop_et_classifier" },
    { "type": "bounce_hard", "action": "stop_et_supprimer" },
    { "type": "opt_out", "action": "stop_et_rgpd_suppression" },
    { "type": "linkedin_ban", "action": "pause_linkedin_continue_email" }
  ]
}
```

### 4.4 Sequence 3 : E-commerce (WARM)

```json
{
  "sequence_id": "SEQ_WARM_ECOMMERCE",
  "nom": "Warm E-commerce - Sequence Standard",
  "description": "Sequence standard 21 jours pour e-commerçants scores WARM.",
  "categorie_cible": "WARM",
  "segment_cible": "ecommerce",
  "duree_totale_jours": 21,
  "nombre_etapes": 5,
  "etapes": [
    {
      "etape_numero": 1,
      "jour": 0,
      "canal": "email",
      "action": "Email premier contact avec analyse perf site",
      "template_id": "TPL-WARM-ECOM-001",
      "conditions": [{ "type": "business_day", "value": true }],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 2,
      "jour": 3,
      "canal": "linkedin_connection",
      "action": "Demande connexion LinkedIn",
      "template_id": "TPL-LI-CONN-ECOM-001",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 3,
      "jour": 7,
      "canal": "email",
      "action": "Follow-up avec social proof e-commerce",
      "template_id": "TPL-WARM-ECOM-002",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 4,
      "jour": 14,
      "canal": "linkedin_message",
      "action": "Message LinkedIn court si connecte",
      "template_id": "TPL-LI-MSG-ECOM-001",
      "conditions": [
        { "type": "linkedin_connected", "value": true },
        { "type": "no_reply", "value": true }
      ],
      "fallback": "send_email_followup",
      "heure_optimale": { "min": 10, "max": 12 }
    },
    {
      "etape_numero": 5,
      "jour": 21,
      "canal": "email",
      "action": "Breakup email gracieux",
      "template_id": "TPL-WARM-ECOM-003-BREAKUP",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    }
  ],
  "conditions_arret": [
    { "type": "reply_received", "action": "stop_et_classifier" },
    { "type": "bounce_hard", "action": "stop_et_supprimer" },
    { "type": "opt_out", "action": "stop_et_rgpd_suppression" }
  ]
}
```

### 4.5 Sequence 4 : Services B2B (WARM)

```json
{
  "sequence_id": "SEQ_WARM_SERVICES_B2B",
  "nom": "Warm Services B2B - Approche Consultative",
  "description": "Sequence 28 jours pour entreprises de services B2B. Ton expert, plus de touchpoints.",
  "categorie_cible": "WARM",
  "segment_cible": "services_b2b",
  "duree_totale_jours": 28,
  "nombre_etapes": 7,
  "etapes": [
    {
      "etape_numero": 1,
      "jour": 0,
      "canal": "linkedin_visit",
      "action": "Visite profil LinkedIn",
      "template_id": "VISIT_ONLY",
      "conditions": [{ "type": "business_day", "value": true }],
      "fallback": null,
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 2,
      "jour": 1,
      "canal": "email",
      "action": "Email premier contact expert/consultative",
      "template_id": "TPL-WARM-B2B-001",
      "conditions": [{ "type": "business_day", "value": true }],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 3,
      "jour": 3,
      "canal": "linkedin_connection",
      "action": "Demande connexion avec note pro",
      "template_id": "TPL-LI-CONN-B2B-001",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 4,
      "jour": 7,
      "canal": "email",
      "action": "Follow-up avec contenu educatif (guide, article)",
      "template_id": "TPL-WARM-B2B-002",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 5,
      "jour": 14,
      "canal": "linkedin_message",
      "action": "Message LinkedIn si connecte",
      "template_id": "TPL-LI-MSG-B2B-001",
      "conditions": [
        { "type": "linkedin_connected", "value": true },
        { "type": "no_reply", "value": true }
      ],
      "fallback": "skip_to_next_step",
      "heure_optimale": { "min": 10, "max": 12 }
    },
    {
      "etape_numero": 6,
      "jour": 21,
      "canal": "email",
      "action": "Email case study specifique au secteur",
      "template_id": "TPL-WARM-B2B-003",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 7,
      "jour": 28,
      "canal": "email",
      "action": "Breakup email",
      "template_id": "TPL-WARM-B2B-004-BREAKUP",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    }
  ],
  "conditions_arret": [
    { "type": "reply_received", "action": "stop_et_classifier" },
    { "type": "bounce_hard", "action": "stop_et_supprimer" },
    { "type": "opt_out", "action": "stop_et_rgpd_suppression" }
  ]
}
```

### 4.6 Sequence 5 : Grands Comptes (COLD)

```json
{
  "sequence_id": "SEQ_COLD_GRANDS_COMPTES",
  "nom": "Cold Grands Comptes - Sequence Longue Education",
  "description": "Sequence 45 jours pour grands comptes froids. Approche educative, beaucoup de LinkedIn engagement.",
  "categorie_cible": "COLD",
  "segment_cible": "grands_comptes",
  "duree_totale_jours": 45,
  "nombre_etapes": 8,
  "etapes": [
    {
      "etape_numero": 1,
      "jour": 0,
      "canal": "linkedin_visit",
      "action": "Visite profil LinkedIn",
      "template_id": "VISIT_ONLY",
      "conditions": [{ "type": "business_day", "value": true }],
      "fallback": null,
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 2,
      "jour": 1,
      "canal": "linkedin_like",
      "action": "Liker 1-2 posts recents du prospect",
      "template_id": "LIKE_RECENT_POST",
      "conditions": [{ "type": "business_day", "value": true }],
      "fallback": "skip_to_next_step",
      "heure_optimale": { "min": 10, "max": 14 }
    },
    {
      "etape_numero": 3,
      "jour": 3,
      "canal": "linkedin_connection",
      "action": "Demande connexion formelle",
      "template_id": "TPL-LI-CONN-GC-001",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 9, "max": 11 }
    },
    {
      "etape_numero": 4,
      "jour": 7,
      "canal": "email",
      "action": "Email premier contact formel avec donnee sectorielle",
      "template_id": "TPL-COLD-GC-001",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 5,
      "jour": 14,
      "canal": "email",
      "action": "Email contenu educatif (benchmark secteur, livre blanc)",
      "template_id": "TPL-COLD-GC-002",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 6,
      "jour": 21,
      "canal": "linkedin_message",
      "action": "Message LinkedIn si connecte (lien vers contenu)",
      "template_id": "TPL-LI-MSG-GC-001",
      "conditions": [
        { "type": "linkedin_connected", "value": true },
        { "type": "no_reply", "value": true }
      ],
      "fallback": "skip_to_next_step",
      "heure_optimale": { "min": 10, "max": 12 }
    },
    {
      "etape_numero": 7,
      "jour": 30,
      "canal": "email",
      "action": "Email nouvel angle (actualite secteur ou invite evenement)",
      "template_id": "TPL-COLD-GC-003",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    },
    {
      "etape_numero": 8,
      "jour": 45,
      "canal": "email",
      "action": "Breakup email gracieux, porte ouverte pour futur",
      "template_id": "TPL-COLD-GC-004-BREAKUP",
      "conditions": [
        { "type": "no_reply", "value": true },
        { "type": "business_day", "value": true }
      ],
      "fallback": null,
      "heure_optimale": { "min": 8, "max": 10 }
    }
  ],
  "conditions_arret": [
    { "type": "reply_received", "action": "stop_et_classifier" },
    { "type": "bounce_hard", "action": "stop_et_supprimer" },
    { "type": "opt_out", "action": "stop_et_rgpd_suppression" }
  ]
}
```

### 4.7 Tableau comparatif des sequences

| Sequence | Segment | Categorie | Duree | Etapes | Emails | LinkedIn | Gap pattern |
|---|---|---|---|---|---|---|---|
| SEQ_HOT_PME_METRO | PME France | HOT | 10j | 6 | 3 | 3 | [0,0,1,3,5,10] |
| SEQ_HOT_STARTUP_TECH | Startup Tech | HOT | 14j | 6 | 3 | 3 | [0,1,3,7,10,14] |
| SEQ_WARM_ECOMMERCE | E-commerce | WARM | 21j | 5 | 3 | 2 | [0,3,7,14,21] |
| SEQ_WARM_SERVICES_B2B | Services B2B | WARM | 28j | 7 | 4 | 3 | [0,1,3,7,14,21,28] |
| SEQ_COLD_GRANDS_COMPTES | Grands comptes | COLD | 45j | 8 | 4 | 4 | [0,1,3,7,14,21,30,45] |


---

## 7. NOTIFICATIONS

### 7.1 Slack API : setup webhook et format

#### Setup Slack App

```
1. Creer une Slack App sur api.slack.com/apps
   Nom : "Axiom Prospection Bot"

2. Configurer les permissions (Bot Token Scopes) :
   - chat:write
   - chat:write.customize
   - channels:read
   - groups:read
   - im:write
   - incoming-webhook
   - users:read

3. Creer les channels :
   - #sales-hot-leads       (notifications URGENT/HIGH)
   - #sales-pipeline        (notifications MEDIUM)
   - #sales-alerts          (erreurs techniques, restrictions)
   - #sales-daily-digest    (resume quotidien automatique)

4. Installer le bot dans le workspace

5. Recuperer le Bot Token : xoxb-XXXX
6. Recuperer le Webhook URL pour chaque channel
```

#### Configuration

```typescript
const SLACK_CONFIG = {
  bot_token: process.env.SLACK_BOT_TOKEN,

  channels: {
    hot_leads: '#sales-hot-leads',
    pipeline: '#sales-pipeline',
    alerts: '#sales-alerts',
    daily_digest: '#sales-daily-digest',
    jonathan_dm: process.env.SLACK_JONATHAN_DM_CHANNEL, // DM direct a Jonathan
  },

  notification_routing: {
    INTERESSE: ['hot_leads', 'jonathan_dm'],
    INTERESSE_SOFT: ['hot_leads'],
    DEMANDE_INFO: ['pipeline'],
    MAUVAISE_PERSONNE: ['pipeline'],
    ERREUR_TECHNIQUE: ['alerts'],
    LINKEDIN_BAN: ['alerts', 'jonathan_dm'],
    BOUNCE_RATE_HIGH: ['alerts'],
    SLA_BREACH: ['alerts', 'jonathan_dm'],
  },
}
```

### 7.2 Quand notifier

| Evenement | Canal Slack | Priorite | Delai max | Format |
|---|---|---|---|---|
| Reponse positive (INTERESSE) | #sales-hot-leads + DM Jonathan | URGENT | < 5 min | Message interactif avec boutons |
| Reponse soft interest | #sales-hot-leads | HIGH | < 1h | Message avec preview |
| Demande d'info | #sales-pipeline | MEDIUM | < 8h | Message simple |
| Personne referree | #sales-pipeline | MEDIUM | < 8h | Message avec lien |
| Bounce rate > 3% sur un domaine | #sales-alerts | HIGH | Immediat | Alerte avec stats |
| LinkedIn restriction detectee | #sales-alerts + DM Jonathan | HIGH | Immediat | Alerte avec recovery plan |
| SLA breache (reponse HOT non traitee > 1h) | #sales-alerts + DM Jonathan | URGENT | Immediat | Escalade |
| Resume quotidien | #sales-daily-digest | LOW | 18h Reunion | Rapport |

### 7.3 Template de notification avec boutons Slack

```typescript
import { WebClient } from '@slack/web-api'

const slack = new WebClient(process.env.SLACK_BOT_TOKEN)

interface NotificationPayload {
  type: string
  prospect_id: string
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  reply_snippet: string
  full_reply?: string
  action?: string
  sla_minutes?: number
}

async function notifyJonathan(payload: NotificationPayload): Promise<void> {
  const prospect = await db.query(
    `SELECT p.*, rc.category, rc.confidence, rc.sentiment
     FROM prospects p
     LEFT JOIN reply_classifications rc ON rc.prospect_id = p.prospect_id
     WHERE p.prospect_id = $1
     ORDER BY rc.classified_at DESC LIMIT 1`,
    [payload.prospect_id]
  )
  const p = prospect.rows[0]

  // Determiner les channels
  const channels = SLACK_CONFIG.notification_routing[payload.type as keyof typeof SLACK_CONFIG.notification_routing] || ['pipeline']
  const channelIds = channels.map(c => SLACK_CONFIG.channels[c as keyof typeof SLACK_CONFIG.channels])

  // Construire le message Slack avec Block Kit
  const blocks = buildNotificationBlocks(payload, p)

  for (const channel of channelIds) {
    await slack.chat.postMessage({
      channel,
      text: `${getPriorityEmoji(payload.priority)} ${payload.type}: ${p.prenom} ${p.nom} @ ${p.entreprise_nom}`,
      blocks,
    })
  }

  // Enregistrer la notification
  await db.query(`
    INSERT INTO notifications (
      prospect_id, type, priority, channels, message_preview,
      sla_deadline, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
  `, [
    payload.prospect_id, payload.type, payload.priority,
    JSON.stringify(channelIds), payload.reply_snippet,
    payload.sla_minutes ? new Date(Date.now() + payload.sla_minutes * 60000).toISOString() : null,
  ])
}

function getPriorityEmoji(priority: string): string {
  switch (priority) {
    case 'URGENT': return 'URGENT'
    case 'HIGH': return 'IMPORTANT'
    case 'MEDIUM': return 'INFO'
    case 'LOW': return 'NOTE'
    default: return ''
  }
}

function buildNotificationBlocks(payload: NotificationPayload, prospect: any): any[] {
  const blocks: any[] = []

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `${payload.priority} - ${payload.type}`,
    },
  })

  // Info prospect
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*${prospect.prenom} ${prospect.nom}* - ${prospect.poste}\n*${prospect.entreprise_nom}*\nScore: *${prospect.score_total}* (${prospect.categorie})`,
    },
  })

  // Citation de la reponse
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `> ${payload.reply_snippet}`,
    },
  })

  // Action suggeree
  if (payload.action) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Action suggeree :* ${payload.action}`,
      },
    })
  }

  // SLA
  if (payload.sla_minutes) {
    const deadline = new Date(Date.now() + payload.sla_minutes * 60000)
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `SLA : repondre avant ${deadline.toLocaleTimeString('fr-FR')} (dans ${payload.sla_minutes} min)`,
      }],
    })
  }

  // Boutons d'action
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Voir email complet' },
        url: `${process.env.APP_URL}/prospects/${payload.prospect_id}/replies`,
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Repondre maintenant' },
        action_id: 'reply_to_prospect',
        value: payload.prospect_id,
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Reporter (3j)' },
        action_id: 'snooze_prospect',
        value: `${payload.prospect_id}_3`,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Ignorer' },
        action_id: 'dismiss_notification',
        value: payload.prospect_id,
      },
    ],
  })

  return blocks
}

// Handler des interactions Slack (boutons)
app.post('/webhooks/slack-interactions', async (req, res) => {
  const payload = JSON.parse(req.body.payload)
  const action = payload.actions[0]

  switch (action.action_id) {
    case 'reply_to_prospect':
      // Ouvrir un modal Slack pour composer la reponse
      await slack.views.open({
        trigger_id: payload.trigger_id,
        view: buildReplyModal(action.value),
      })
      break

    case 'snooze_prospect':
      const [prospectId, days] = action.value.split('_')
      await snoozeProspect(prospectId, parseInt(days))
      await slack.chat.update({
        channel: payload.channel.id,
        ts: payload.message.ts,
        text: `Prospect reporte de ${days} jours`,
      })
      break

    case 'dismiss_notification':
      await db.query(
        `UPDATE notifications SET read_at = NOW() WHERE prospect_id = $1 AND read_at IS NULL`,
        [action.value]
      )
      break
  }

  res.status(200).send('')
})
```

### 7.4 SLA : HOT reponse = notifier en < 5 min

```typescript
class SLAMonitor {
  // Verification toutes les minutes
  async checkSLABreaches(): Promise<void> {
    // Trouver les reponses non traitees qui depassent leur SLA
    const breaches = await db.query(`
      SELECT rc.*, p.prenom, p.nom, p.entreprise_nom, n.sla_deadline
      FROM reply_classifications rc
      JOIN prospects p ON rc.prospect_id = p.prospect_id
      LEFT JOIN notifications n ON n.prospect_id = rc.prospect_id
      WHERE rc.category IN ('INTERESSE', 'INTERESSE_SOFT', 'DEMANDE_INFO')
      AND rc.handled = false
      AND n.sla_deadline IS NOT NULL
      AND n.sla_deadline < NOW()
      AND n.escalated = false
    `)

    for (const breach of breaches.rows) {
      await this.escalate(breach)
    }
  }

  private async escalate(breach: any): Promise<void> {
    // Envoyer un message d'escalade
    await slack.chat.postMessage({
      channel: SLACK_CONFIG.channels.jonathan_dm,
      text: `SLA DEPASSE : ${breach.prenom} ${breach.nom} (${breach.entreprise_nom}) a repondu avec interet il y a plus de ${this.getTimeSince(breach.classified_at)}. Action requise immediatement.`,
    })

    // Marquer comme escalade
    await db.query(
      `UPDATE notifications SET escalated = true, escalated_at = NOW()
       WHERE prospect_id = $1 AND escalated = false`,
      [breach.prospect_id]
    )

    // Si SLA > 2x, envoyer aussi par email
    const slaMultiple = (Date.now() - new Date(breach.sla_deadline).getTime()) / (breach.sla_minutes * 60000)
    if (slaMultiple > 2) {
      await sendEscalationEmail(breach)
    }
  }

  private getTimeSince(date: string): string {
    const diff = Date.now() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes} minutes`
    const hours = Math.floor(minutes / 60)
    return `${hours}h${minutes % 60}min`
  }
}

// Cron : verifier les SLA toutes les minutes
cron.schedule('* * * * *', async () => {
  await slaMonitor.checkSLABreaches()
})
```

### 7.5 Resume quotidien

```typescript
async function sendDailyDigest(): Promise<void> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const stats = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'SENT' AND sent_at >= $1) as emails_envoyes,
      COUNT(*) FILTER (WHERE canal = 'linkedin' AND sent_at >= $1) as linkedin_actions,
      COUNT(DISTINCT prospect_id) FILTER (WHERE sent_at >= $1) as prospects_contactes
    FROM email_sends
    WHERE sent_at >= $1
  `, [today.toISOString()])

  const replies = await db.query(`
    SELECT category, COUNT(*) as count
    FROM reply_classifications
    WHERE classified_at >= $1
    GROUP BY category
  `, [today.toISOString()])

  const pendingReplies = await db.query(`
    SELECT COUNT(*) as count FROM reply_classifications
    WHERE handled = false
  `)

  const s = stats.rows[0]
  const replyBreakdown = replies.rows.map((r: any) => `  - ${r.category}: ${r.count}`).join('\n')

  await slack.chat.postMessage({
    channel: SLACK_CONFIG.channels.daily_digest,
    text: 'Resume quotidien prospection',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `Resume Prospection - ${today.toLocaleDateString('fr-FR')}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Emails envoyes*\n${s.emails_envoyes}` },
          { type: 'mrkdwn', text: `*Actions LinkedIn*\n${s.linkedin_actions}` },
          { type: 'mrkdwn', text: `*Prospects contactes*\n${s.prospects_contactes}` },
          { type: 'mrkdwn', text: `*Reponses non traitees*\n${pendingReplies.rows[0].count}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Reponses recues aujourd'hui :*\n${replyBreakdown || '  Aucune reponse'}`,
        },
      },
    ],
  })
}

// Cron : resume quotidien a 18h heure Reunion (14h Paris en hiver)
cron.schedule('0 18 * * 1-5', sendDailyDigest) // Lundi-vendredi seulement
```

---

## 8. GESTION DES ERREURS

### 8.1 Bounce email (hard/soft)

| Type | Codes SMTP | Exemples | Action automatique |
|---|---|---|---|
| **Hard bounce** | 550, 551, 552, 553 | Adresse invalide, domaine inexistant | Supprimer prospect immediatement, annuler toute la sequence |
| **Soft bounce** | 450, 451, 452, 421 | Boite pleine, serveur occupe | Retry 3x avec backoff (1min, 10min, 1h), puis supprimer |
| **Block** | 421, 450 (niveau ISP) | Reputation IP/domaine | Pause le domaine concerne, switch vers autre domaine |

**Seuils critiques :**
- Bounce rate > 3% sur un domaine --> **pause immediate** du domaine
- Bounce rate > 5% global --> **pause TOUS les envois** + investigation
- Spam complaint > 0.3% --> **pause immediate** + warmdown

```typescript
// Monitoring temps reel des bounces
async function monitorBounceRate(): Promise<void> {
  const domains = Object.keys(DOMAIN_THROTTLE_CONFIG)

  for (const domain of domains) {
    const stats = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'BOUNCED') as bounced,
        COUNT(*) FILTER (WHERE status = 'SPAM_COMPLAINT') as spam
      FROM email_sends
      WHERE domaine_envoi = $1
      AND sent_at >= NOW() - INTERVAL '24 hours'
    `, [domain])

    const { total, bounced, spam } = stats.rows[0]
    if (total === 0) continue

    const bounceRate = bounced / total
    const spamRate = spam / total

    if (bounceRate > 0.03) {
      await pauseDomain(domain, 'BOUNCE_RATE_HIGH', bounceRate)
      await notifyJonathan({
        type: 'ERREUR_TECHNIQUE',
        prospect_id: 'SYSTEM',
        priority: 'HIGH',
        reply_snippet: `Domaine ${domain} en pause : bounce rate ${(bounceRate * 100).toFixed(1)}% (seuil: 3%)`,
        action: 'Verifier les adresses et la configuration DNS',
      })
    }

    if (spamRate > 0.003) {
      await pauseDomain(domain, 'SPAM_RATE_HIGH', spamRate)
      await notifyJonathan({
        type: 'ERREUR_TECHNIQUE',
        prospect_id: 'SYSTEM',
        priority: 'URGENT',
        reply_snippet: `ALERTE SPAM : domaine ${domain} a ${(spamRate * 100).toFixed(2)}% de plaintes spam (seuil: 0.3%)`,
        action: 'Arreter les envois, investiguer le contenu et la liste',
      })
    }
  }
}

// Cron toutes les 30 minutes
cron.schedule('*/30 * * * *', monitorBounceRate)
```

### 8.2 LinkedIn ban -- detection + pause + recovery

Voir section 3b.5 pour les signaux de detection et le plan de recovery.

```typescript
// Detection automatique via metriques
async function detectLinkedInRestriction(): Promise<void> {
  // Signal 1 : Taux d'acceptation des connexions en chute
  const acceptanceRate = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'ACCEPTED')::float /
      NULLIF(COUNT(*) FILTER (WHERE status IN ('ACCEPTED', 'PENDING', 'REJECTED')), 0) as rate
    FROM linkedin_actions
    WHERE action_type = 'connection_request'
    AND created_at >= NOW() - INTERVAL '7 days'
  `)

  if (acceptanceRate.rows[0]?.rate < 0.15) {
    // Taux d'acceptation tres bas = probable restriction
    await triggerLinkedInRecovery('LOW_ACCEPTANCE_RATE')
  }

  // Signal 2 : Taux d'echec des actions en hausse
  const failRate = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'FAILED')::float /
      NULLIF(COUNT(*), 0) as rate
    FROM linkedin_actions
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  `)

  if (failRate.rows[0]?.rate > 0.2) {
    await triggerLinkedInRecovery('HIGH_FAIL_RATE')
  }
}

async function triggerLinkedInRecovery(reason: string): Promise<void> {
  // 1. Arreter toute automation LinkedIn
  await db.query(
    `UPDATE linkedin_actions SET status = 'CANCELLED' WHERE status = 'PENDING'`
  )

  // 2. Notifier
  await notifyJonathan({
    type: 'LINKEDIN_BAN',
    prospect_id: 'SYSTEM',
    priority: 'HIGH',
    reply_snippet: `Restriction LinkedIn detectee (${reason}). Toute automation LinkedIn arretee.`,
    action: 'Voir le plan de recovery dans les specs Agent 5',
  })

  // 3. Planifier la reprise progressive
  // Jour 1-2 : rien
  // Jour 3-7 : activites manuelles seulement (5-10/jour)
  // Jour 8-14 : connexions 5/jour, messages 10/jour
  // Jour 15+ : augmentation progressive
  await db.query(`
    INSERT INTO linkedin_recovery_plans (
      reason, detected_at, phase, status
    ) VALUES ($1, NOW(), 'IMMEDIATE_STOP', 'ACTIVE')
  `, [reason])
}

// Cron toutes les 2 heures
cron.schedule('0 */2 * * *', detectLinkedInRestriction)
```

### 8.3 API down -- retry exponential backoff

```typescript
async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    initialDelayMs?: number
    maxDelayMs?: number
    retryableStatuses?: number[]
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    retryableStatuses = [429, 500, 502, 503, 504],
  } = options

  let lastError: Error

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      // Ne pas retry les erreurs client (sauf 429 rate limit)
      if (error.status && !retryableStatuses.includes(error.status)) {
        throw error
      }

      if (attempt === maxRetries) break

      // Backoff exponentiel avec jitter
      const delay = Math.min(
        initialDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelayMs
      )

      console.warn(`[Agent5] Retry ${attempt + 1}/${maxRetries} apres ${delay}ms: ${error.message}`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}

// Utilisation
const result = await withExponentialBackoff(
  () => sendEmailViaMailgun(input),
  { maxRetries: 3, initialDelayMs: 2000 }
)
```

### 8.4 Doublon d'envoi -- prevention idempotency key

```typescript
// Chaque envoi a une cle d'idempotence unique
// Format : {message_id}_{etape_numero}
// Stockee en base avant l'envoi, verifiee avant chaque tentative

async function ensureIdempotency(messageId: string, etape: number): Promise<boolean> {
  const key = `${messageId}_${etape}`

  // Tentative d'insertion atomique (UNIQUE constraint)
  try {
    await db.query(
      `INSERT INTO idempotency_keys (key, created_at) VALUES ($1, NOW())`,
      [key]
    )
    return true // Pas de doublon, on peut envoyer
  } catch (error: any) {
    if (error.code === '23505') {
      // Violation UNIQUE = doublon detecte
      console.warn(`[Agent5] Doublon detecte pour ${key}, skip`)
      return false
    }
    throw error
  }
}

// Table SQL
// CREATE TABLE idempotency_keys (
//   key VARCHAR(200) PRIMARY KEY,
//   created_at TIMESTAMP NOT NULL DEFAULT NOW()
// );
// CREATE INDEX idx_idempotency_created ON idempotency_keys (created_at);
// -- Nettoyage automatique des cles > 60 jours
```

### 8.5 Prospect repond entre deux etapes -- arret immediat

Le mecanisme est integre dans le sous-agent 5c (Detecteur de Reponses). A chaque reponse detectee :

1. La sequence est immediatement stoppee ou pausee selon la categorie
2. Tous les jobs BullMQ en attente pour ce prospect sont supprimes
3. Le statut du prospect est mis a jour en base

```typescript
// Avant chaque envoi, verifier qu'aucune reponse n'est arrivee depuis la planification du job
async function preflightCheck(prospectId: string, sequenceId: string): Promise<boolean> {
  const recentReply = await db.query(`
    SELECT COUNT(*) as count FROM reply_classifications
    WHERE prospect_id = $1
    AND classified_at >= (
      SELECT started_at FROM prospect_sequences
      WHERE prospect_id = $1 AND sequence_id = $2
    )
  `, [prospectId, sequenceId])

  if (recentReply.rows[0].count > 0) {
    console.warn(`[Agent5] Prospect ${prospectId} a repondu, annulation de l'envoi`)
    return false
  }

  // Verifier aussi le statut du prospect
  const status = await db.query(
    `SELECT status FROM prospects WHERE prospect_id = $1`,
    [prospectId]
  )

  if (['SUPPRESSED', 'OPTED_OUT', 'EXCLUDED', 'INTERESTED'].includes(status.rows[0]?.status)) {
    return false
  }

  return true
}
```

### 8.6 Opt-out -- suppression RGPD immediate

```typescript
async function handleOptOut(prospectId: string, source: 'email_reply' | 'unsubscribe_link' | 'manual'): Promise<void> {
  // 1. Arreter TOUTES les sequences immediatement
  await db.query(
    `UPDATE prospect_sequences SET status = 'STOPPED', stopped_reason = 'OPT_OUT'
     WHERE prospect_id = $1 AND status IN ('ACTIVE', 'PAUSED')`,
    [prospectId]
  )

  // 2. Annuler tous les jobs en attente
  const pendingJobs = await suiveurQueue.getJobs(['delayed', 'waiting'])
  for (const job of pendingJobs) {
    if (job.data.prospect_id === prospectId) {
      await job.remove()
    }
  }

  // 3. Marquer le prospect comme opt-out
  await db.query(
    `UPDATE prospects SET status = 'OPTED_OUT', opted_out_at = NOW(),
     opted_out_source = $1 WHERE prospect_id = $2`,
    [source, prospectId]
  )

  // 4. Logger pour conformite RGPD
  await db.query(`
    INSERT INTO rgpd_events (
      prospect_id, event_type, source, data_affected, created_at
    ) VALUES ($1, 'OPT_OUT', $2, $3, NOW())
  `, [
    prospectId, source,
    JSON.stringify(['email_sequences', 'linkedin_automation', 'notifications']),
  ])

  // 5. Si demande de suppression complete (droit a l'effacement RGPD)
  // A faire sur demande explicite uniquement
  // await deleteProspectData(prospectId)

  console.log(`[Agent5] Prospect ${prospectId} opt-out traite (source: ${source})`)
}

// Suppression complete des donnees (droit a l'effacement)
async function deleteProspectData(prospectId: string): Promise<void> {
  // Attention : conserver un log minimal pour prouver la suppression

  // 1. Supprimer les emails envoyes (corps uniquement, garder les metadata)
  await db.query(
    `UPDATE email_sends SET body_preview = '[SUPPRIME RGPD]', subject_line = '[SUPPRIME RGPD]'
     WHERE prospect_id = $1`,
    [prospectId]
  )

  // 2. Supprimer les reponses
  await db.query(
    `UPDATE reply_classifications SET email_body = '[SUPPRIME RGPD]'
     WHERE prospect_id = $1`,
    [prospectId]
  )

  // 3. Anonymiser les donnees prospect
  await db.query(`
    UPDATE prospects SET
      email = '[SUPPRIME]', prenom = '[SUPPRIME]', nom = '[SUPPRIME]',
      linkedin_url = NULL, poste = '[SUPPRIME]'
    WHERE prospect_id = $1
  `, [prospectId])

  // 4. Logger la suppression
  await db.query(`
    INSERT INTO rgpd_events (
      prospect_id, event_type, source, data_affected, created_at
    ) VALUES ($1, 'DATA_DELETION', 'rgpd_right_to_erasure', $2, NOW())
  `, [prospectId, JSON.stringify(['email', 'prenom', 'nom', 'linkedin_url', 'poste', 'email_bodies', 'reply_bodies'])])
}
```

---

---

## 9. DOMAIN WARMING PLAN

### 9.1 Strategie multi-domaines

```
3 domaines :
1. axiom-marketing.fr    (existant)
2. axiom-agency.com      (a acheter)
3. axiom-growth.fr       (a acheter)

Pour chaque domaine :
  - 2 adresses email : jonathan@ + contact@
  - Configuration SPF/DKIM/DMARC individuelle
  - Warmup individuel de 5 semaines
```

### 9.2 Plan jour par jour (Semaines 1 a 6)

#### Domaine 1 : axiom-marketing.fr (existant, deja partiellement warme)

| Jour | Volume/adresse | Destinataires | Objectif | Monitoring |
|---|---|---|---|---|
| **Sem 1, J1-J3** | 5/jour | Contacts internes, clients | 0 bounce | Gmail Postmaster Tools |
| **Sem 1, J4-J7** | 10/jour | Contacts internes + collegues | 0 bounce, 0 spam | Verifier inbox placement |
| **Sem 2, J8-J10** | 15/jour | Contacts tièdes | Open rate > 40% | Mailreach seed test |
| **Sem 2, J11-J14** | 25/jour | Mix tiede + semi-froid | Open rate > 30% | Seed test quotidien |
| **Sem 3, J15-J18** | 35/jour | Prospects semi-froids | Open rate > 25% | Bounce rate < 1% |
| **Sem 3, J19-J21** | 45/jour | Prospects froids (qualifies) | Inbox > 80% | Verifier onglet Promotions |
| **Sem 4, J22-J28** | 50/jour (MAX) | Campagne froide | Maintenir metriques | Si chute -> PAUSE |
| **Sem 5+** | 50/jour stable | Campagne froide continue | Stable | Monitoring continu |

#### Domaine 2 : axiom-agency.com (nouveau)

| Jour | Volume/adresse | Destinataires | Objectif | Monitoring |
|---|---|---|---|---|
| **Sem 0** | 0 | -- | Achat domaine, config DNS, attendre 48h propagation | DNS checker |
| **Sem 1, J1-J3** | 3/jour | Contacts personnels uniquement | 0 bounce | SPF/DKIM valides |
| **Sem 1, J4-J7** | 5-8/jour | Contacts internes | 0 bounce, 0 spam | Gmail Postmaster |
| **Sem 2, J8-J14** | 10-20/jour | Contacts tiedes | Open rate > 40% | Seed test |
| **Sem 3, J15-J21** | 20-35/jour | Mix tiede + froid | Open rate > 30% | Bounce < 1% |
| **Sem 4, J22-J28** | 35-50/jour | Prospection froide | Inbox > 80% | Monitoring quotidien |
| **Sem 5, J29-J35** | 50/jour (MAX) | Normal | Stable | Monitoring continu |
| **Sem 6+** | 50/jour stable | Normal | -- | -- |

#### Domaine 3 : axiom-growth.fr (nouveau)

Meme plan que Domaine 2, decale de 1 semaine pour ne pas surcharger les tests initiaux.

### 9.3 Configuration DNS pour chaque domaine

```
POUR CHAQUE DOMAINE :

1. SPF :
   TXT @ v=spf1 include:_spf.google.com include:mailgun.org ~all
   (passer en -all apres 48h sans erreur)

2. DKIM :
   Genere par Google Workspace ou Mailgun
   CNAME : google._domainkey.{domaine} -> ...

3. DMARC :
   Semaine 1 : TXT _dmarc v=DMARC1; p=none; rua=mailto:dmarc@{domaine}
   Semaine 2 : TXT _dmarc v=DMARC1; p=quarantine; rua=mailto:dmarc@{domaine}
   Semaine 3+: TXT _dmarc v=DMARC1; p=reject; rua=mailto:dmarc@{domaine}
```

### 9.4 Outils de warmup

```typescript
// Option 1 : Mailreach (recommande pour MVP)
// 20-25 EUR/mois par adresse
// Setup automatique, rapports de delivrabilite

// Option 2 : Script interne de warmup
class InHouseWarmer {
  private warmingAddresses: string[] // Adresses internes qui repondent aux emails

  async warmDay(domaine: string, dayNumber: number): Promise<void> {
    const volume = this.getVolumeForDay(dayNumber)

    for (let i = 0; i < volume; i++) {
      const recipient = this.warmingAddresses[i % this.warmingAddresses.length]

      await sendEmail({
        from: `jonathan@${domaine}`,
        to: recipient,
        subject: this.generateNaturalSubject(),
        body: this.generateNaturalBody(),
      })

      // Delai aleatoire entre chaque envoi (2-10 minutes)
      const delay = (2 + Math.random() * 8) * 60 * 1000
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  private getVolumeForDay(day: number): number {
    if (day <= 3) return 5
    if (day <= 7) return 10
    if (day <= 14) return 20
    if (day <= 21) return 35
    if (day <= 28) return 45
    return 50
  }

  private generateNaturalSubject(): string {
    const subjects = [
      'Re: Question rapide',
      'Suite de notre discussion',
      'Point sur le projet',
      'Disponibilite cette semaine ?',
      'Retour sur la proposition',
      'Info complementaire',
    ]
    return subjects[Math.floor(Math.random() * subjects.length)]
  }

  private generateNaturalBody(): string {
    const bodies = [
      'Bonjour,\n\nJe reviens vers toi concernant notre echange de la semaine derniere.\nAs-tu eu le temps de regarder les documents ?\n\nMerci,\nJonathan',
      'Salut,\n\nPetite question : est-ce que tu serais disponible jeudi pour un point rapide ?\n\nA bientot,\nJonathan',
      'Hello,\n\nJe te transfère les infos demandees.\nN\'hesite pas si tu as des questions.\n\nBonne journee,\nJonathan',
    ]
    return bodies[Math.floor(Math.random() * bodies.length)]
  }
}
```

### 9.5 Monitoring de sante des domaines

```typescript
// Dashboard temps reel par domaine
interface DomainHealth {
  domaine: string
  status: 'HEALTHY' | 'WARNING' | 'PAUSED' | 'WARMING'
  emails_sent_today: number
  emails_sent_7days: number
  bounce_rate_24h: number
  bounce_rate_7days: number
  spam_rate_24h: number
  open_rate_7days: number
  inbox_placement_pct: number // Via seed tests
  warmup_day: number | null
}

async function getDomainHealthDashboard(): Promise<DomainHealth[]> {
  const domains = Object.keys(DOMAIN_THROTTLE_CONFIG)
  const results: DomainHealth[] = []

  for (const domaine of domains) {
    const stats24h = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'BOUNCED') as bounced,
        COUNT(*) FILTER (WHERE status = 'SPAM_COMPLAINT') as spam
      FROM email_sends WHERE domaine_envoi = $1 AND sent_at >= NOW() - INTERVAL '24 hours'
    `, [domaine])

    const stats7d = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'BOUNCED') as bounced,
        COUNT(*) FILTER (WHERE opened = true')::float / NULLIF(COUNT(*), 0) as open_rate
      FROM email_sends WHERE domaine_envoi = $1 AND sent_at >= NOW() - INTERVAL '7 days'
    `, [domaine])

    const s24 = stats24h.rows[0]
    const s7d = stats7d.rows[0]

    const bounceRate24h = s24.total > 0 ? s24.bounced / s24.total : 0
    const spamRate24h = s24.total > 0 ? s24.spam / s24.total : 0
    const bounceRate7d = s7d.total > 0 ? s7d.bounced / s7d.total : 0

    let status: DomainHealth['status'] = 'HEALTHY'
    if (!DOMAIN_THROTTLE_CONFIG[domaine].warmupComplete) status = 'WARMING'
    else if (bounceRate24h > 0.03 || spamRate24h > 0.003) status = 'PAUSED'
    else if (bounceRate24h > 0.02 || spamRate24h > 0.002) status = 'WARNING'

    results.push({
      domaine,
      status,
      emails_sent_today: s24.total,
      emails_sent_7days: s7d.total,
      bounce_rate_24h: bounceRate24h,
      bounce_rate_7days: bounceRate7d,
      spam_rate_24h: spamRate24h,
      open_rate_7days: s7d.open_rate || 0,
      inbox_placement_pct: 0, // Via seed tests externes
      warmup_day: DOMAIN_THROTTLE_CONFIG[domaine].warmupComplete ? null : await getWarmupDay(domaine),
    })
  }

  return results
}
```

---

## 10. OUTPUT : DONNEES PRODUITES PAR LE SUIVEUR

### 10.1 Donnees produites

Le Suiveur produit des donnees qui alimentent directement l'Agent 6 (NURTUREUR) et l'Agent 7 (ANALYSTE).

#### Schema des interactions loggees

```typescript
interface InteractionLog {
  interaction_id: string       // UUID
  prospect_id: string
  lead_id: string
  sequence_id: string

  // Action effectuee
  action_type: 'EMAIL_SENT' | 'LINKEDIN_CONNECTION_SENT' | 'LINKEDIN_MESSAGE_SENT' |
               'LINKEDIN_VISIT' | 'LINKEDIN_LIKE' | 'REPLY_RECEIVED' | 'REPLY_CLASSIFIED' |
               'SEQUENCE_STARTED' | 'SEQUENCE_PAUSED' | 'SEQUENCE_STOPPED' | 'SEQUENCE_COMPLETED' |
               'BOUNCE_HARD' | 'BOUNCE_SOFT' | 'OPT_OUT' | 'NOTIFICATION_SENT'
  canal: 'email' | 'linkedin' | 'system'

  // Details
  etape_numero: number | null
  domaine_envoi: string | null
  gmail_message_id: string | null
  waalaxy_campaign_id: string | null

  // Si reponse
  reply_classification: string | null     // INTERESSE, PAS_MAINTENANT, etc.
  reply_confidence: number | null
  reply_sentiment: string | null

  // Status
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'DEFERRED'
  error_message: string | null

  // Timestamps
  created_at: string
  processed_at: string
}
```

#### Schema du statut prospect mis a jour

```typescript
interface ProspectStatusUpdate {
  prospect_id: string

  // Statut sequence
  sequence_status: 'ACTIVE' | 'PAUSED' | 'STOPPED' | 'COMPLETED'
  current_step: number
  total_steps: number
  next_step_scheduled_at: string | null

  // Engagement
  emails_sent: number
  emails_opened: number       // Si tracking actif (nurturing seulement)
  linkedin_actions: number
  replies_received: number
  last_interaction_at: string

  // Classification
  last_reply_category: string | null
  interest_level: 'HOT' | 'WARM' | 'COLD' | 'NOT_INTERESTED' | null
  handled: boolean

  // Timing
  first_contact_at: string
  last_contact_at: string
  sequence_duration_days: number
}
```

### 10.2 Output vers Agent 6 (NURTUREUR)

Quand une sequence se termine sans conversion (prospect n'a pas repondu ou a repondu PAS_MAINTENANT), le Suiveur transmet le prospect au NURTUREUR pour un suivi long terme.

```typescript
interface NurturerHandoff {
  prospect_id: string
  lead_id: string

  // Raison du handoff
  handoff_reason: 'SEQUENCE_COMPLETED_NO_REPLY' | 'PAS_MAINTENANT' | 'INTERESTED_SOFT_NO_FOLLOWUP'

  // Historique de la sequence
  sequence_summary: {
    sequence_id: string
    steps_completed: number
    total_steps: number
    emails_sent: number
    linkedin_actions: number
    duration_days: number
    replies: Array<{
      category: string
      date: string
    }>
  }

  // Recommendations pour le nurturing
  nurturing_recommendations: {
    resume_date: string | null          // Date de reprise suggeree
    suggested_content_type: string      // 'case_study', 'blog', 'event', 'newsletter'
    last_signal: string                 // Dernier signal business detecte
    engagement_score: number            // 0-100 base sur les interactions
  }

  // Donnees prospect completes
  prospect: {
    prenom: string
    nom: string
    email: string
    entreprise_nom: string
    poste: string
    segment: string
    scoring_categorie: string
  }

  metadata: {
    agent: 'agent_5_suiveur'
    handoff_at: string
    suiveur_version: string
  }
}

// Dispatch vers Agent 6 via BullMQ
async function handoffToNurturer(data: NurturerHandoff): Promise<void> {
  await nurturerQueue.add(
    `nurture-${data.prospect_id}`,
    data,
    {
      priority: data.handoff_reason === 'PAS_MAINTENANT' ? 3 : 7,
      delay: 0,
    }
  )
}
```

### 10.3 Output vers Agent 7 (ANALYSTE)

Le Suiveur produit des metriques en temps reel que l'Analyste agrege pour les rapports.

```typescript
interface AnalysteMetrics {
  // Metriques d'envoi
  envoi: {
    periode: string                    // 'daily', 'weekly', 'monthly'
    date: string
    emails_envoyes: number
    linkedin_connections_envoyees: number
    linkedin_messages_envoyes: number
    linkedin_visites: number
    total_actions: number
  }

  // Metriques de delivrabilite
  delivrabilite: {
    par_domaine: Array<{
      domaine: string
      emails_envoyes: number
      bounce_rate: number
      spam_rate: number
      inbox_placement: number          // % (via seed tests)
    }>
    bounce_rate_global: number
    spam_rate_global: number
  }

  // Metriques de reponses
  reponses: {
    total_reponses: number
    par_categorie: Record<string, number>  // INTERESSE: 5, PAS_MAINTENANT: 12, etc.
    reply_rate: number                     // reponses / emails envoyes
    temps_reponse_moyen_heures: number
    par_etape: Record<number, number>      // Etape 1: 58%, Etape 2: 25%, etc.
  }

  // Metriques de sequences
  sequences: {
    actives: number
    completees: number
    stoppees_reponse: number
    stoppees_bounce: number
    stoppees_optout: number
    duree_moyenne_jours: number
  }

  // Metriques de conversion
  conversion: {
    prospects_contactes: number
    replies_positives: number             // INTERESSE + INTERESSE_SOFT
    taux_conversion_brut: number          // replies positives / prospects contactes
    par_segment: Record<string, {
      contactes: number
      replies: number
      conversion: number
    }>
    par_categorie_scoring: Record<string, {
      contactes: number
      replies: number
      conversion: number
    }>
  }

  // Metriques de notification
  notifications: {
    total_envoyees: number
    sla_respectes: number
    sla_breaches: number
    temps_traitement_moyen_minutes: number
  }

  // Metriques de cout
  couts: {
    claude_api_classification_usd: number
    emails_envoyes_cout_eur: number      // Infrastructure
    linkedin_tool_eur: number            // Waalaxy
    total_eur: number
  }
}

// Vue SQL pour l'Agent 7
const ANALYSTE_VIEWS_SQL = `
-- Vue metriques envoi quotidien
CREATE OR REPLACE VIEW v_metrics_envoi_daily AS
SELECT
  DATE(sent_at) as date,
  canal,
  domaine_envoi,
  categorie,
  segment,
  COUNT(*) as total_envoyes,
  COUNT(*) FILTER (WHERE status = 'SENT') as sent_ok,
  COUNT(*) FILTER (WHERE status = 'BOUNCED') as bounced,
  COUNT(*) FILTER (WHERE status = 'FAILED') as failed
FROM email_sends
GROUP BY DATE(sent_at), canal, domaine_envoi, categorie, segment;

-- Vue metriques reponses
CREATE OR REPLACE VIEW v_metrics_reponses AS
SELECT
  DATE(classified_at) as date,
  category,
  canal,
  COUNT(*) as total,
  AVG(confidence) as confidence_moyenne,
  COUNT(*) FILTER (WHERE sentiment = 'positif') as positives,
  COUNT(*) FILTER (WHERE sentiment = 'negatif') as negatives
FROM reply_classifications
GROUP BY DATE(classified_at), category, canal;

-- Vue taux de conversion par segment
CREATE OR REPLACE VIEW v_conversion_par_segment AS
SELECT
  p.segment,
  p.categorie,
  COUNT(DISTINCT p.prospect_id) as total_prospects,
  COUNT(DISTINCT es.prospect_id) as contactes,
  COUNT(DISTINCT rc.prospect_id) FILTER (WHERE rc.category IN ('INTERESSE', 'INTERESSE_SOFT')) as replies_positives,
  ROUND(
    COUNT(DISTINCT rc.prospect_id) FILTER (WHERE rc.category IN ('INTERESSE', 'INTERESSE_SOFT'))::numeric /
    NULLIF(COUNT(DISTINCT es.prospect_id), 0) * 100, 2
  ) as taux_conversion_pct
FROM prospects p
LEFT JOIN email_sends es ON es.prospect_id = p.prospect_id
LEFT JOIN reply_classifications rc ON rc.prospect_id = p.prospect_id
GROUP BY p.segment, p.categorie;

-- Vue SLA compliance
CREATE OR REPLACE VIEW v_sla_compliance AS
SELECT
  DATE(n.created_at) as date,
  n.type,
  n.priority,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE n.read_at IS NOT NULL AND n.read_at <= n.sla_deadline) as sla_ok,
  COUNT(*) FILTER (WHERE n.escalated = true) as escalated,
  AVG(EXTRACT(EPOCH FROM (COALESCE(n.read_at, NOW()) - n.created_at)) / 60) as temps_moyen_minutes
FROM notifications n
GROUP BY DATE(n.created_at), n.type, n.priority;
`
```

---

---

## 11. COUTS

### 11.1 Detail des couts mensuels

| Poste | Cout mensuel | Details |
|---|---|---|
| **Gmail API** | 0 EUR | Gratuit (quotas largement suffisants) |
| **Google Workspace** (2 adresses) | 12 EUR | 6 EUR/utilisateur/mois |
| **Mailgun** (backup delivrabilite) | 30 EUR | Foundation plan, 50K emails/mois |
| **Waalaxy Pro** | 19 EUR | 300+ invitations LinkedIn/mois |
| **Domaines supplementaires** (x2) | 2 EUR | ~12 EUR/domaine/an |
| **Mailreach warmup** (3 adresses) | 60-75 EUR | 20-25 EUR/adresse/mois |
| **Claude API** (classification reponses) | ~5 EUR | ~500 classifications/mois |
| **Redis** (BullMQ) | 0 EUR | Self-hosted ou inclus dans l'infra |
| **Slack** | 0 EUR | Free plan suffisant pour les notifications |
| **Google Cloud Pub/Sub** | < 1 EUR | Quasi gratuit au volume prevu |
| **Infrastructure serveur** | ~20 EUR | VPS pour faire tourner le worker |
| **TOTAL** | **~150 EUR/mois** | |

### 11.2 Cout par classification Claude API

```
Modele : claude-sonnet-4-20250514
Tarif : $3.00 / million tokens input, $15.00 / million tokens output

Par classification de reponse :
- System prompt : ~800 tokens input
- User message (reponse + contexte) : ~400 tokens input
- Total input : ~1200 tokens
- Output (JSON classification) : ~200 tokens

Cout unitaire :
- Input : (1200 / 1M) x $3.00 = $0.0036
- Output : (200 / 1M) x $15.00 = $0.003
- Total : $0.0066 par classification ~ 0.006 EUR

Volume estime : 500 reponses/mois
Cout mensuel classifications : 500 x 0.006 = 3 EUR
Avec marge (re-classifications, tests) : ~5 EUR/mois
```

### 11.3 Cout par prospect (cycle complet)

```
SCENARIO : 1 prospect traverse une sequence complete de 4 emails + 2 actions LinkedIn

Couts directs :
- Envoi emails (Gmail API) : 0 EUR
- Envoi LinkedIn (Waalaxy, au prorata) : ~0.06 EUR
- Si reponse, classification Claude : 0.006 EUR
- Si reponse, notification Slack : 0 EUR
- Infrastructure (au prorata) : ~0.04 EUR

Cout par prospect : ~0.10 EUR

Pour 500 prospects/mois : ~50 EUR de couts directs
```


---

## 12. VERIFICATION DE COHERENCE

### 12.1 Input == Output Agent 4

Verification que chaque champ de l'input du Suiveur (Agent 5) correspond exactement a un champ de l'output du Redacteur (Agent 4).

| Champ input Agent 5 | Present dans output Agent 4 (section 8) | Statut |
|---|---|---|
| `message_id` | `message_id` | VALIDE |
| `prospect_id` | `prospect_id` | VALIDE |
| `lead_id` | `lead_id` | VALIDE |
| `generated_at` | `generated_at` | VALIDE |
| `message.canal` | `message.canal` | VALIDE |
| `message.type` | `message.type` | VALIDE |
| `message.subject_line` | `message.subject_line` | VALIDE |
| `message.body` | `message.body` | VALIDE |
| `message.cta` | `message.cta` | VALIDE |
| `message.signature` | `message.signature` | VALIDE |
| `message.format` | `message.format` | VALIDE |
| `message.word_count` | `message.word_count` | VALIDE |
| `message.language` | `message.language` | VALIDE |
| `linkedin_message.connection_note` | `linkedin_message.connection_note` | VALIDE |
| `linkedin_message.post_connection_message` | `linkedin_message.post_connection_message` | VALIDE |
| `prospect.prenom` | `prospect.prenom` | VALIDE |
| `prospect.nom` | `prospect.nom` | VALIDE |
| `prospect.email` | `prospect.email` | VALIDE |
| `prospect.email_verified` | `prospect.email_verified` | VALIDE |
| `prospect.linkedin_url` | `prospect.linkedin_url` | VALIDE |
| `prospect.poste` | `prospect.poste` | VALIDE |
| `prospect.entreprise_nom` | `prospect.entreprise_nom` | VALIDE |
| `sequence.sequence_id` | `sequence.sequence_id` | VALIDE |
| `sequence.etape_actuelle` | `sequence.etape_actuelle` | VALIDE |
| `sequence.etape_total` | `sequence.etape_total` | VALIDE |
| `sequence.etape_type` | `sequence.etape_type` | VALIDE |
| `sequence.prochaine_etape_dans_jours` | `sequence.prochaine_etape_dans_jours` | VALIDE |
| `sequence.espacement_jours` | `sequence.espacement_jours` | VALIDE |
| `template.template_id` | `template.template_id` | VALIDE |
| `template.template_version` | `template.template_version` | VALIDE |
| `template.template_status` | `template.template_status` | VALIDE |
| `template.ab_test_id` | `template.ab_test_id` | VALIDE |
| `template.ab_variant` | `template.ab_variant` | VALIDE |
| `scoring.score_total` | `scoring.score_total` | VALIDE |
| `scoring.categorie` | `scoring.categorie` | VALIDE |
| `scoring.sous_categorie` | `scoring.sous_categorie` | VALIDE |
| `scoring.segment` | `scoring.segment` | VALIDE |
| `scoring.signal_principal` | `scoring.signal_principal` | VALIDE |
| `validation.statut` | `validation.statut` | VALIDE |
| `validation.validated_by` | `validation.validated_by` | VALIDE |
| `validation.validated_at` | `validation.validated_at` | VALIDE |
| `validation.quality_checks` | `validation.quality_checks` | VALIDE |
| `routing.canal_principal` | `routing.canal_principal` | VALIDE |
| `routing.canal_secondaire` | `routing.canal_secondaire` | VALIDE |
| `routing.urgence` | `routing.urgence` | VALIDE |
| `routing.sla_heures` | `routing.sla_heures` | VALIDE |
| `routing.priorite_queue` | `routing.priorite_queue` | VALIDE |
| `routing.domaine_envoi_suggere` | `routing.domaine_envoi_suggere` | VALIDE |
| `impact_data.*` | `impact_data.*` | VALIDE |
| `metadata.*` | `metadata.*` | VALIDE |

**RESULTAT : 100% de coherence input Agent 5 / output Agent 4.**

### 12.2 Outputs vers Agent 6 (NURTUREUR)

| Donnee produite par Agent 5 | Necessaire pour Agent 6 | Raison |
|---|---|---|
| `NurturerHandoff.prospect_id` | OUI | Identifier le prospect |
| `NurturerHandoff.handoff_reason` | OUI | Adapter le type de nurturing |
| `NurturerHandoff.sequence_summary` | OUI | Savoir ce qui a deja ete fait |
| `NurturerHandoff.nurturing_recommendations` | OUI | Guider le contenu de nurturing |
| `NurturerHandoff.prospect.*` | OUI | Personnaliser le nurturing |
| `InteractionLog.*` | OUI | Historique complet des interactions |
| `ProspectStatusUpdate.*` | OUI | Etat actuel du prospect |

**RESULTAT : L'output Agent 5 contient tous les champs necessaires pour l'Agent 6.**

### 12.3 Outputs vers Agent 7 (ANALYSTE)

| Donnee produite par Agent 5 | Necessaire pour Agent 7 | Raison |
|---|---|---|
| `AnalysteMetrics.envoi` | OUI | KPIs d'activite |
| `AnalysteMetrics.delivrabilite` | OUI | Sante des domaines |
| `AnalysteMetrics.reponses` | OUI | Taux de reponse par categorie |
| `AnalysteMetrics.sequences` | OUI | Performance des sequences |
| `AnalysteMetrics.conversion` | OUI | ROI par segment |
| `AnalysteMetrics.notifications` | OUI | SLA compliance |
| `AnalysteMetrics.couts` | OUI | Suivi budget |
| Vues SQL (`v_metrics_*`) | OUI | Requetes directes pour rapports |

**RESULTAT : L'output Agent 5 contient tous les champs necessaires pour l'Agent 7.**

### 12.4 Coherence du flux complet

```
Agent 4 output (RedacteurOutput)
    |
    | via BullMQ queue 'suiveur-pipeline'
    | priorite: HOT=1, WARM=5, COLD=10
    |
    v
Agent 5 input (SuiveurInput) = copie exacte de RedacteurOutput
    |
    | Traitement par sous-agents 5a/5b/5c/5d
    |
    v
Agent 5 outputs :
    |
    +---> InteractionLog (toutes les actions)
    |     --> Stocke en PostgreSQL
    |     --> Accessible par Agent 7 via vues SQL
    |
    +---> ProspectStatusUpdate (statuts mis a jour)
    |     --> Stocke en PostgreSQL
    |     --> Lu par Agent 6 pour decisions nurturing
    |
    +---> NurturerHandoff (quand sequence terminee/pausee)
    |     --> Via BullMQ queue 'nurturer-pipeline'
    |     --> Consomme par Agent 6
    |
    +---> AnalysteMetrics (metriques agregees)
    |     --> Via vues SQL materialisees
    |     --> Consomme par Agent 7
    |
    +---> Notifications Slack (evenements importants)
          --> Via Slack API
          --> Consomme par Jonathan
```

### 12.5 Tables SQL de l'Agent 5

```sql
-- Table des envois email
CREATE TABLE IF NOT EXISTS email_sends (
  id SERIAL PRIMARY KEY,
  message_id UUID NOT NULL,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  lead_id UUID NOT NULL,
  sequence_id VARCHAR(50) NOT NULL,
  etape_numero INTEGER NOT NULL,
  canal VARCHAR(30) NOT NULL,
  domaine_envoi VARCHAR(100) NOT NULL,
  gmail_message_id VARCHAR(255),
  gmail_thread_id VARCHAR(255),
  subject_line VARCHAR(200),
  body_preview VARCHAR(500),
  categorie VARCHAR(20) NOT NULL,
  sous_categorie VARCHAR(10),
  segment VARCHAR(30) NOT NULL,
  template_id VARCHAR(30),
  ab_test_id VARCHAR(50),
  ab_variant CHAR(1),
  idempotency_key VARCHAR(200) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'BOUNCED', 'FAILED', 'SPAM_COMPLAINT', 'CANCELLED')),
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  opened BOOLEAN DEFAULT false,
  opened_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_sends_prospect ON email_sends(prospect_id);
CREATE INDEX idx_email_sends_domaine ON email_sends(domaine_envoi);
CREATE INDEX idx_email_sends_status ON email_sends(status);
CREATE INDEX idx_email_sends_date ON email_sends(sent_at);
CREATE INDEX idx_email_sends_idempotency ON email_sends(idempotency_key);

-- Table des actions LinkedIn
CREATE TABLE IF NOT EXISTS linkedin_actions (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  action_type VARCHAR(30) NOT NULL
    CHECK (action_type IN ('connection_request', 'message', 'profile_visit', 'like', 'comment')),
  linkedin_url VARCHAR(500),
  waalaxy_campaign_id VARCHAR(100),
  content TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'ACCEPTED', 'REJECTED', 'FAILED', 'RATE_LIMITED', 'CANCELLED', 'PAUSED_RESTRICTION')),
  delay_applied_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_linkedin_actions_prospect ON linkedin_actions(prospect_id);
CREATE INDEX idx_linkedin_actions_type ON linkedin_actions(action_type);
CREATE INDEX idx_linkedin_actions_status ON linkedin_actions(status);
CREATE INDEX idx_linkedin_actions_date ON linkedin_actions(created_at);

-- Table des classifications de reponses
CREATE TABLE IF NOT EXISTS reply_classifications (
  id SERIAL PRIMARY KEY,
  reply_id VARCHAR(255) NOT NULL UNIQUE,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  sequence_id VARCHAR(50),
  etape_repondue INTEGER,
  email_body TEXT,
  from_address VARCHAR(255),
  canal VARCHAR(20) DEFAULT 'email',
  category VARCHAR(30) NOT NULL
    CHECK (category IN ('INTERESSE', 'INTERESSE_SOFT', 'PAS_MAINTENANT', 'PAS_INTERESSE',
                         'MAUVAISE_PERSONNE', 'DEMANDE_INFO', 'OUT_OF_OFFICE', 'SPAM')),
  confidence NUMERIC(3,2) NOT NULL,
  sentiment VARCHAR(10),
  action_suggeree TEXT,
  date_retour_ooo DATE,
  personne_referree_nom VARCHAR(200),
  personne_referree_email VARCHAR(255),
  personne_referree_poste VARCHAR(100),
  phrase_cle TEXT,
  raisonnement TEXT,
  classification_model VARCHAR(50),
  classification_cost_usd NUMERIC(8,5),
  tokens_input INTEGER,
  tokens_output INTEGER,
  handled BOOLEAN DEFAULT false,
  handled_by VARCHAR(50),
  handled_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  classified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reply_class_prospect ON reply_classifications(prospect_id);
CREATE INDEX idx_reply_class_category ON reply_classifications(category);
CREATE INDEX idx_reply_class_handled ON reply_classifications(handled) WHERE handled = false;
CREATE INDEX idx_reply_class_date ON reply_classifications(classified_at);

-- Table des sequences prospect
CREATE TABLE IF NOT EXISTS prospect_sequences (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  sequence_id VARCHAR(50) NOT NULL,
  categorie VARCHAR(20) NOT NULL,
  segment VARCHAR(30),
  total_steps INTEGER NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'STOPPED', 'COMPLETED')),
  gaps_days JSONB,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  paused_at TIMESTAMP WITH TIME ZONE,
  stopped_at TIMESTAMP WITH TIME ZONE,
  stopped_reason VARCHAR(50),
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(prospect_id, sequence_id)
);

CREATE INDEX idx_prospect_seq_status ON prospect_sequences(status);
CREATE INDEX idx_prospect_seq_prospect ON prospect_sequences(prospect_id);

-- Table des notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  prospect_id UUID REFERENCES prospects(prospect_id),
  type VARCHAR(50) NOT NULL,
  priority VARCHAR(10) NOT NULL,
  channels JSONB,
  message_preview TEXT,
  sla_deadline TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  escalated BOOLEAN DEFAULT false,
  escalated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_unread ON notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_sla ON notifications(sla_deadline) WHERE escalated = false;

-- Table des evenements bounce
CREATE TABLE IF NOT EXISTS bounce_events (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  message_id UUID,
  bounce_type VARCHAR(10) NOT NULL CHECK (bounce_type IN ('HARD', 'SOFT')),
  error_code INTEGER,
  error_message TEXT,
  email_address VARCHAR(255),
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Table des restrictions LinkedIn
CREATE TABLE IF NOT EXISTS linkedin_restrictions (
  id SERIAL PRIMARY KEY,
  restriction_type VARCHAR(50) NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  recovery_days INTEGER,
  phase VARCHAR(30) NOT NULL DEFAULT 'IMMEDIATE_STOP',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'RECOVERING', 'RESOLVED')),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Table de cles d'idempotence
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(200) PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_idempotency_date ON idempotency_keys(created_at);

-- Table RGPD
CREATE TABLE IF NOT EXISTS rgpd_events (
  id SERIAL PRIMARY KEY,
  prospect_id UUID NOT NULL,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('OPT_OUT', 'DATA_DELETION', 'DATA_EXPORT')),
  source VARCHAR(50),
  data_affected JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Table des referrals (mauvaise personne)
CREATE TABLE IF NOT EXISTS referral_leads (
  id SERIAL PRIMARY KEY,
  original_prospect_id UUID NOT NULL REFERENCES prospects(prospect_id),
  referred_name VARCHAR(200),
  referred_email VARCHAR(255),
  referred_poste VARCHAR(100),
  source_reply_id VARCHAR(255),
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Table config systeme
CREATE TABLE IF NOT EXISTS system_config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

### 12.6 Variables d'environnement requises

```bash
# === Gmail API ===
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REFRESH_TOKEN=xxx
GCP_PROJECT_ID=axiom-prospection

# === Mailgun (backup) ===
MAILGUN_API_KEY=key-xxx
MAILGUN_DOMAIN=axiom-marketing.fr

# === LinkedIn automation ===
WAALAXY_API_KEY=xxx
WAALAXY_WEBHOOK_SECRET=xxx

# === Claude API (classification) ===
ANTHROPIC_API_KEY=sk-ant-xxx

# === Slack ===
SLACK_BOT_TOKEN=xoxb-xxx
SLACK_JONATHAN_DM_CHANNEL=DXXXXX

# === Base de donnees ===
DATABASE_URL=postgresql://user:pass@localhost:5432/axiom_prospection
REDIS_HOST=localhost
REDIS_PORT=6379

# === Configuration ===
APP_URL=https://app.axiom-marketing.fr
NODE_ENV=production
TIMEZONE_DEFAULT=Indian/Reunion

# === Gmail credentials pour IMAP (fallback) ===
GMAIL_USER=jonathan@axiom-marketing.fr
GMAIL_APP_PASSWORD=xxx
```

---

---

## 13. INTEGRATION AVEC LES AGENTS 8, 9, 10

> **Ajout v1.1 -- 19 mars 2026** : Cette section documente l'integration du Suiveur avec les trois nouveaux agents du pipeline etendu (Agent 8 Dealmaker, Agent 9 Appels d'offres, Agent 10 CSM).

### 13.1 Synthese de l'impact

| Agent | Impact sur Agent 5 | Nature |
|-------|-------------------|--------|
| **Agent 8 (Dealmaker)** | SIGNIFICATIF | Le flux "prospect INTERESSE" est formalise : apres notification Jonathan et RDV decouverte, le prospect est transmis a l'Agent 8 pour le closing. Nouveau flux sortant a documenter. |
| **Agent 9 (Appels d'offres)** | AUCUN | L'Agent 9 est sur un flux completement independant (Agent 1b --> Agent 9). Le Suiveur n'interagit pas avec le pipeline AO. |
| **Agent 10 (CSM)** | AUCUN (direct) | L'Agent 10 recoit ses clients de l'Agent 8 (deal signe). Le Suiveur n'a aucun flux direct vers l'Agent 10. Les leads referral generes par l'Agent 10 entrent dans le pipeline par l'Agent 1, pas par l'Agent 5. |

### 13.2 Nouveau flux : INTERESSE --> Agent 8 (Dealmaker)

#### 13.2.1 Contexte

Actuellement (specs v1.0), quand un prospect repond "INTERESSE", le Suiveur :
1. Arrete la sequence
2. Met a jour le statut prospect (`INTERESTED`, `interest_level: HOT`)
3. Notifie Jonathan en < 5 minutes

**Avec l'Agent 8**, le flux est etendu : apres que Jonathan a effectue le RDV decouverte et confirme l'opportunite, le prospect est transmis a l'Agent 8 pour la gestion du pipeline de deals.

#### 13.2.2 Flux mis a jour

```
Prospect repond "INTERESSE"
        |
        v
[Agent 5] Arrete la sequence + notifie Jonathan (SLA < 5 min)
        |
        v
[Jonathan] RDV Decouverte (visio/tel)
        |
        +--> Si opportunite confirmee --> [Agent 8] Pipeline de deals (closing)
        |
        +--> Si pas d'opportunite --> [Agent 6] Nurturing (PAS_MAINTENANT)
```

**IMPORTANT** : Ce flux vers l'Agent 8 est **PARALLELE** au flux existant vers l'Agent 6. Il ne le remplace pas. Le Suiveur continue d'envoyer les prospects sans reponse et PAS_MAINTENANT vers l'Agent 6 comme avant.

#### 13.2.3 Modification de handleInteresse()

```typescript
private async handleInteresse(replyData: any, classification: ReplyClassification): Promise<void> {
  // 1. Arreter la sequence IMMEDIATEMENT (INCHANGE)
  await this.stopSequence(replyData.prospect_id, replyData.sequence_id)

  // 2. Mettre a jour le statut prospect (INCHANGE)
  await db.query(
    `UPDATE prospects SET status = 'INTERESTED', last_reply_at = NOW(),
     interest_level = 'HOT' WHERE prospect_id = $1`,
    [replyData.prospect_id]
  )

  // 3. Notifier Jonathan en < 5 minutes avec boutons d'action (MIS A JOUR)
  await notifyJonathan({
    type: 'HOT_LEAD_REPLY',
    prospect_id: replyData.prospect_id,
    priority: 'URGENT',
    reply_snippet: classification.phrase_cle,
    full_reply: replyData.email_body,
    action: classification.action_suggeree,
    sla_minutes: 5,
    // ═══ NOUVEAU : Boutons post-RDV pour routing vers Agent 8 ou Agent 6 ═══
    post_rdv_actions: [
      { label: 'Opportunite confirmee → Pipeline Deals', action: 'HANDOFF_DEALMAKER' },
      { label: 'Pas d opportunite → Nurturing', action: 'HANDOFF_NURTUREUR' },
    ],
  })
}
```

#### 13.2.4 Nouveau handoff vers Agent 8 (DealmakerHandoff)

Quand Jonathan clique sur "Opportunite confirmee" dans Slack, le Suiveur transmet le prospect a l'Agent 8 via la queue BullMQ `dealmaker-pipeline` :

```typescript
interface DealmakerHandoff {
  prospect_id: string
  lead_id: string

  // Contexte du RDV decouverte
  rdv_decouverte: {
    date: string                    // ISO 8601
    notes_jonathan: string          // Notes saisies dans Slack
    budget_estime: number | null    // Budget estime par Jonathan
    decision_timeline: string | null // Timeline de decision
    besoin_principal: string        // Besoin identifie
  }

  // Historique de la prospection (Agent 5)
  prospection_summary: {
    sequence_id: string
    steps_completed: number
    total_steps: number
    emails_sent: number
    linkedin_actions: number
    reply_category: 'INTERESSE'
    reply_date: string
    reply_snippet: string
  }

  // Donnees prospect completes
  prospect: {
    entreprise: string
    prenom: string
    nom: string
    poste: string
    email: string
    telephone: string | null
    segment: string
    score_total: number
    categorie: string
  }

  // Metadata
  metadata: {
    handoff_at: string
    suiveur_version: string
    source: 'agent5_interesse'
  }
}

// Dispatch vers Agent 8
async function handoffToDealmaker(prospect: any, rdvNotes: any): Promise<void> {
  const handoff: DealmakerHandoff = {
    prospect_id: prospect.prospect_id,
    lead_id: prospect.lead_id,
    rdv_decouverte: rdvNotes,
    prospection_summary: await buildProspectionSummary(prospect.prospect_id),
    prospect: await loadProspectForHandoff(prospect.prospect_id),
    metadata: {
      handoff_at: new Date().toISOString(),
      suiveur_version: '1.1',
      source: 'agent5_interesse',
    },
  }

  await dealmakerQueue.add('new-deal', handoff, {
    priority: 1,  // Haute priorite
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  })

  // Logger le handoff
  await db.query(
    `INSERT INTO agent_handoffs (source_agent, target_agent, prospect_id, handoff_type, payload)
     VALUES ('agent5', 'agent8', $1, 'INTERESSE_TO_DEALMAKER', $2)`,
    [prospect.prospect_id, JSON.stringify(handoff)]
  )
}
```

#### 13.2.5 Classification des reponses mise a jour

| Categorie reponse | Action AVANT (v1.0) | Action APRES (v1.1) |
|---|---|---|
| **INTERESSE** | Arrete sequence + notifie Jonathan | Arrete sequence + notifie Jonathan + **boutons post-RDV (Agent 8 ou Agent 6)** |
| **INTERESSE_SOFT** | Pause sequence + notifie Jonathan | INCHANGE |
| **PAS_MAINTENANT** | Arrete sequence + handoff Agent 6 | INCHANGE |
| **PAS_INTERESSE** | Arrete sequence + archive | INCHANGE |
| **MAUVAISE_PERSONNE** | Arrete sequence + notification | INCHANGE |
| **DEMANDE_INFO** | Pause sequence + notifie Jonathan | INCHANGE |
| **OUT_OF_OFFICE** | Planifie relance apres retour | INCHANGE |
| **SPAM** | Archive + blocklist | INCHANGE |

### 13.3 Flux sortants mis a jour

| Flux sortant | Destination | Condition | Statut |
|---|---|---|---|
| `nurturer-pipeline` --> Agent 6 | Prospects sans reponse, PAS_MAINTENANT, INTERESSE_SOFT sans suite | Sequence terminee sans conversion | INCHANGE |
| Agent 7 (via tables SQL) | Metriques d'envoi, reponses, sequences | Toujours (logs BDD) | INCHANGE |
| **`dealmaker-pipeline` --> Agent 8** | **Prospects INTERESSE apres RDV decouverte confirme par Jonathan** | **Jonathan clique "Opportunite confirmee" dans Slack** | **NOUVEAU** |

### 13.4 Ce qui NE change PAS

| Composant | Changement |
|-----------|-----------|
| Sous-agents 5a (Envoyeur Email), 5b (Envoyeur LinkedIn), 5c (Scheduler), 5d (Classificateur) | AUCUN |
| Sequences par segment (5 segments x N etapes) | AUCUN |
| Scheduling (horaires, timezone, throttling, jours feries) | AUCUN |
| Detection des reponses (Gmail Watch, IMAP, LinkedIn webhook) | AUCUN |
| Classification IA (prompt Claude, 8 categories) | AUCUN -- les categories restent identiques |
| Domain warming plan | AUCUN |
| Gestion des erreurs (bounces, ban LinkedIn, API down) | AUCUN |
| Output vers Agent 6 (NurturerHandoff) | AUCUN |
| Output vers Agent 7 (via tables SQL) | AUCUN |
| Cout (~150 EUR/mois) | AUCUN |

---

## FIN DU DOCUMENT

**Verification finale :**

| Section | Presente | Complete |
|---|---|---|
| 1. Mission | OUI | OUI |
| 2. Input (schema JSON) | OUI | OUI -- 100% coherent avec output Agent 4 |
| 3. Sous-agents (5a, 5b, 5c, 5d) | OUI | OUI -- code TypeScript reel pour chacun |
| 4. Sequences completes (5 segments) | OUI | OUI -- JSON complet jour par jour |
| 5. Scheduling | OUI | OUI -- horaires, timezone, throttling, jours feries |
| 6. Detection reponses | OUI | OUI -- Gmail Watch, IMAP, LinkedIn webhook, prompt Claude |
| 7. Notifications | OUI | OUI -- Slack Block Kit, boutons, SLA, escalade |
| 8. Gestion erreurs | OUI | OUI -- bounces, ban LinkedIn, API down, doublons, opt-out |
| 9. Domain warming plan | OUI | OUI -- plan jour par jour pour 3 domaines sur 6 semaines |
| 10. Output | OUI | OUI -- schemas vers Agent 6 + Agent 7, vues SQL |
| 11. Couts | OUI | OUI -- detail par poste, cout/prospect, cout/classification |
| 12. Verification coherence | OUI | OUI -- input/output valides, tables SQL, env vars |

---

## INTEGRATION AVEC LES AGENTS 8, 9, 10

### Agent 8 (DEALMAKER) : Nouveau flux sortant INTERESSE → DEALMAKER
Quand un prospect repond "INTERESSE" et que Jonathan confirme l'opportunite apres le RDV decouverte, le Suiveur transmet le handoff vers l'Agent 8 via `dealmaker-pipeline`. Ce flux est PARALLELE au flux existant vers l'Agent 6.

Workflow : Prospect repond INTERESSE → Jonathan fait RDV → Jonathan clique "Opportunite confirmee" sur Slack → Agent 5 envoie DealmakerHandoff → Agent 8 prend le relai (devis, relances, signature).

### Agent 9 (APPELS D'OFFRES) : Aucun impact direct

### Agent 10 (CSM) : Aucun impact direct
L'Agent 10 recoit les deals signes de l'Agent 8, pas de l'Agent 5.
