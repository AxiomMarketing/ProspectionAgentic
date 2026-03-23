# AGENT 2 — ENRICHISSEUR (MASTER ORCHESTRATEUR)
**Fichiers associes** : AGENT-2a-CONTACT.md, AGENT-2b-ENTREPRISE.md, AGENT-2c-TECHNIQUE.md
**Position dans le pipeline** : Agent 1 (Veilleur) → Agent 2 → Agent 3 (Scoreur)

---

# AGENT 2 -- ENRICHISSEUR : SPECIFICATIONS COMPLETES ET EXHAUSTIVES

**Date** : 18 mars 2026
**Auteur** : Axiom Marketing -- Systeme de prospection automatise
**Version** : 1.0
**Contexte** : Stack interne -- Claude API, n8n, AdonisJS, React, PostgreSQL, scraping custom
**Pipeline** : VEILLEUR (Agent 1) --> **ENRICHISSEUR (ce doc)** --> SCOREUR (Agent 3) --> REDACTEUR --> SUIVEUR --> NURTUREUR --> ANALYSTE

---

## TABLE DES MATIERES

1. [Mission de l'Enrichisseur](#1-mission-de-lenrichisseur)
2. [Input : Schema JSON recu de l'Agent 1](#2-input--schema-json-recu-de-lagent-1)
3. [Sous-Agent 2a -- Enrichisseur Contact](#3-sous-agent-2a--enrichisseur-contact)
4. [Sous-Agent 2b -- Enrichisseur Entreprise](#4-sous-agent-2b--enrichisseur-entreprise)
5. [Sous-Agent 2c -- Enrichisseur Technique](#5-sous-agent-2c--enrichisseur-technique)
6. [Agent Master Enrichisseur -- Orchestrateur](#6-agent-master-enrichisseur--orchestrateur)
7. [RGPD -- Conformite complete](#7-rgpd--conformite-complete)
8. [Couts detailles](#8-couts-detailles)
9. [Schema SQL](#9-schema-sql)
10. [Verification de coherence](#10-verification-de-coherence)
11. [Integration avec les Agents 8, 9, 10](#11-integration-avec-les-agents-8-9-10)

---

## 1. MISSION DE L'ENRICHISSEUR

### 1.1 Position dans le pipeline

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        AGENT 2 -- ENRICHISSEUR                               │
│                                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                             │
│  │  2a         │  │  2b         │  │  2c         │                             │
│  │  Contact    │  │  Entreprise │  │  Technique  │                             │
│  │  (Decideur) │  │  (Finance)  │  │  (Stack+Perf│                             │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘                             │
│         │               │               │                                    │
│         └───────────────┴───────┬───────┘                                    │
│                                 │                                            │
│                    ┌────────────▼────────────┐                               │
│                    │   MASTER ENRICHISSEUR   │                               │
│                    │   - Fusion resultats    │                               │
│                    │   - Dedup BDD           │                               │
│                    │   - Fiche prospect      │                               │
│                    │   - Controle qualite    │                               │
│                    └────────────┬────────────┘                               │
│                                 │                                            │
└─────────────────────────────────┼────────────────────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ AGENT 1         │   │ AGENT 3         │   │ BASE DE DONNEES │
│ VEILLEUR        │   │ SCOREUR         │   │ prospects        │
│ (input)         │   │ (output)        │   │ (persistance)   │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

### 1.2 Mission precise

**Ce que fait l'Enrichisseur** :
- Recoit les leads bruts normalises de l'Agent 1 (VEILLEUR) via la queue BullMQ
- Trouve le BON decideur pour chaque lead (email, telephone, LinkedIn) selon le segment
- Enrichit les donnees entreprise (SIRET, CA, effectif, dirigeants, procedures collectives)
- Complete les donnees techniques du site web (stack, performance, accessibilite) si non fait par Agent 1c
- Fusionne les 3 flux d'enrichissement en une fiche prospect unique et complete
- Deduplique avec les prospects deja existants en base de donnees
- Transmet la fiche enrichie a l'Agent 3 (SCOREUR) pour scoring final

**Ce que l'Enrichisseur ne fait PAS** :
- Il ne detecte PAS les signaux d'achat (c'est le VEILLEUR)
- Il ne score PAS la qualite finale du lead (c'est le SCOREUR)
- Il ne redige PAS les messages de prospection (c'est le REDACTEUR)
- Il n'envoie AUCUN message ou email au prospect
- Il ne gere PAS les sequences de relance
- Il ne fait PAS de veille continue (il reagit aux leads recus)

### 1.3 Les 5 segments et leurs decideurs cibles

| Segment | Cible | Decideurs a trouver (ordre de priorite) |
|---------|-------|----------------------------------------|
| `pme_metro` | PME France metropolitaine, 50-500 salaries | 1. CMO 2. DG 3. CTO/DSI |
| `ecommerce_shopify` | E-commercants Shopify, toutes tailles | 1. Fondateur 2. Head of Growth 3. CMO |
| `collectivite` | Collectivites DOM-TOM | 1. DGS 2. DSI 3. Elus numeriques |
| `startup` | Startups / SaaS, 5-200 salaries | 1. Founder/CEO 2. CTO 3. Head of Growth |
| `agence_wl` | Agences en marque blanche, 2-50 salaries | 1. Fondateur 2. CEO 3. Account Manager principal |

### 1.4 SLA de traitement

| Priorite lead (pre_score) | Delai max enrichissement | Qualite min requise |
|---------------------------|-------------------------|---------------------|
| Hot (>= 60) | 15 minutes | Email verifie obligatoire |
| Warm (40-59) | 2 heures | Email trouve ou flag "manual" |
| Cold (< 40) | 24 heures | Best effort |

---

## 2. INPUT : SCHEMA JSON RECU DE L'AGENT 1

Le schema ci-dessous est **exactement** le format de sortie du Master Veilleur (Agent 1, section 2.5 de ses specs). L'Enrichisseur le recoit via la queue BullMQ `enrichisseur-pipeline`.

```json
{
  "lead_id": "uuid-v4",
  "created_at": "2026-03-18T08:00:00Z",
  "source_primaire": "veille_linkedin",
  "sources": ["veille_linkedin", "veille_jobboard"],
  "nb_detections": 2,

  "entreprise": {
    "nom": "TechCorp SAS",
    "siret": null,
    "site_web": "https://www.techcorp.fr",
    "linkedin_company_url": "https://linkedin.com/company/techcorp",
    "secteur": null,
    "taille_estimee": "50-200",
    "localisation": "Paris, France",
    "segment_estime": "pme_metro"
  },

  "contact": {
    "prenom": "Sophie",
    "nom": "Martin",
    "poste": "Chief Marketing Officer",
    "linkedin_url": "https://linkedin.com/in/sophie-martin",
    "email": null,
    "telephone": null
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

  "pre_score": {
    "total": 50,
    "detail": {
      "signal_force": 30,
      "multi_source_bonus": 5,
      "segment_match": 15
    }
  },

  "metadata": {
    "sous_agent_primaire": "1a_linkedin",
    "batch_id": "batch-2026-03-18-08",
    "traitement_requis": ["enrichissement_contact", "enrichissement_entreprise", "scan_technique"]
  }
}
```

### 2.1 Champs critiques pour l'Enrichisseur

| Champ input | Utilise par | Obligatoire | Fallback si absent |
|-------------|-----------|-------------|-------------------|
| `entreprise.nom` | 2a, 2b | Oui | ERREUR -- lead rejete |
| `entreprise.site_web` | 2a, 2c | Non | 2b tente de le trouver via Pappers/SIRENE |
| `entreprise.siret` | 2b | Non | 2b le recherche via INSEE/Pappers |
| `entreprise.linkedin_company_url` | 2a | Non | 2a cherche via Netrows |
| `entreprise.localisation` | 2b | Non | 2b enrichit via INSEE |
| `entreprise.segment_estime` | 2a | Oui | Defaut `pme_metro` |
| `contact.prenom` | 2a | Non | 2a cherche le decideur from scratch |
| `contact.nom` | 2a | Non | 2a cherche le decideur from scratch |
| `contact.linkedin_url` | 2a | Non | 2a cherche via search |
| `contact.email` | 2a | Non | 2a le trouve (mission principale) |
| `metadata.traitement_requis` | Master | Oui | Defaut = tous les enrichissements |

### 2.2 Determination du traitement requis

Le champ `metadata.traitement_requis` est un tableau qui indique quels sous-agents doivent etre actives. Il est rempli par le Master Veilleur selon ces regles :

```typescript
function determineTraitement(lead: NormalizedLead): string[] {
  const traitements: string[] = []

  // Contact toujours requis sauf si email deja present ET verifie
  if (!lead.contact?.email) {
    traitements.push('enrichissement_contact')
  }

  // Entreprise toujours requis sauf si SIRET + CA deja presents
  if (!lead.entreprise.siret) {
    traitements.push('enrichissement_entreprise')
  }

  // Technique requis sauf si Agent 1c l'a deja fait
  const hasAuditTech = lead.sources.includes('veille_web')
  if (!hasAuditTech && lead.entreprise.site_web) {
    traitements.push('scan_technique')
  }

  // Toujours au moins 1 traitement
  if (traitements.length === 0) {
    traitements.push('enrichissement_contact') // Verifier au minimum
  }

  return traitements
}
```

---


## 6. AGENT MASTER ENRICHISSEUR -- ORCHESTRATEUR

### 6.1 Mission

Orchestrer les 3 sous-agents (2a, 2b, 2c), fusionner leurs resultats en une fiche prospect unique et complete, deduplicater avec les prospects existants en base, et transmettre la fiche enrichie a l'Agent 3 (SCOREUR).

### 6.2 Architecture d'orchestration

```
┌──────────────────────────────────────────────────────────────────────────┐
│ MASTER ENRICHISSEUR -- WORKFLOW COMPLET                                  │
│                                                                          │
│  INPUT (queue BullMQ 'enrichisseur-pipeline')                            │
│  ├── lead_data : NormalizedLead (schema Agent 1)                         │
│  ├── priority : 1 (hot) | 5 (warm) | 10 (cold)                          │
│  └── attempts : max 3 (retry automatique)                                │
│                                                                          │
│  STEP 1 : VERIFICATION PRE-ENRICHISSEMENT                               │
│  ├── Lead deja enrichi en BDD ? --> skip                                 │
│  ├── Entreprise exclue (procedure collective, fermee) ? --> skip         │
│  ├── Email deja blackliste (opposition RGPD) ? --> skip                  │
│  └── Determiner les traitements requis                                   │
│                                                                          │
│  STEP 2 : LANCEMENT PARALLELE DES SOUS-AGENTS                           │
│  ├── 2a Contact ─────────┐                                               │
│  ├── 2b Entreprise ──────┤──> Promise.allSettled()                       │
│  └── 2c Technique ───────┘    (max 3 minutes timeout global)             │
│                                                                          │
│  STEP 3 : FUSION DES RESULTATS                                          │
│  ├── Merger contact (2a) + entreprise (2b) + technique (2c)              │
│  ├── Resoudre les conflits de donnees (priorite des sources)             │
│  ├── Calculer le score de completude global                              │
│  └── Generer la fiche prospect enrichie                                  │
│                                                                          │
│  STEP 4 : DEDUPLICATION BDD                                             │
│  ├── Chercher doublon par SIRET (100% fiable)                            │
│  ├── Chercher doublon par email (95% fiable)                             │
│  ├── Chercher doublon par domaine (90% fiable)                           │
│  ├── Si doublon : fusionner signaux + enrichir fiche existante           │
│  └── Si nouveau : inserer dans table prospects                           │
│                                                                          │
│  STEP 5 : CONTROLE QUALITE                                              │
│  ├── Verifier que les champs critiques sont remplis                      │
│  ├── Verifier la coherence des donnees                                   │
│  ├── Flagger les leads incomplets pour enrichissement manuel             │
│  └── Logger les metriques                                                │
│                                                                          │
│  STEP 6 : DISPATCH VERS SCOREUR                                         │
│  ├── Envoyer la fiche enrichie vers queue 'scoreur-pipeline'             │
│  ├── Priorite basee sur completude + pre_score                           │
│  └── Logger le throughput                                                │
│                                                                          │
│  OUTPUT : Fiche Prospect Enrichie (schema section 6.6)                   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Parallelisation des sous-agents

```typescript
// agents/enrichisseur/master/orchestrateur.ts
import { ContactEnrichisseur } from '../contact/enrichisseur_contact'
import { EntrepriseEnrichisseur } from '../entreprise/enrichisseur_entreprise'
import { TechEnrichisseur } from '../technique/enrichisseur_technique'
import { Queue, Worker } from 'bullmq'

const GLOBAL_TIMEOUT_MS = 180000 // 3 minutes max par lead

export class MasterEnrichisseur {
  private contactAgent: ContactEnrichisseur
  private entrepriseAgent: EntrepriseEnrichisseur
  private techAgent: TechEnrichisseur
  private scoreurQueue: Queue

  constructor() {
    this.contactAgent = new ContactEnrichisseur()
    this.entrepriseAgent = new EntrepriseEnrichisseur()
    this.techAgent = new TechEnrichisseur()
    this.scoreurQueue = new Queue('scoreur-pipeline', { connection: redis })
  }

  async enrichLead(lead: NormalizedLead): Promise<EnrichedProspect> {
    const startTime = Date.now()

    // ═══════════════════════════════════════════════════════════
    // STEP 1 : VERIFICATION PRE-ENRICHISSEMENT
    // ═══════════════════════════════════════════════════════════
    const preCheck = await this.preEnrichmentCheck(lead)
    if (preCheck.skip) {
      return preCheck.existingProspect! // Deja enrichi ou exclu
    }

    const traitements = lead.metadata.traitement_requis || [
      'enrichissement_contact',
      'enrichissement_entreprise',
      'scan_technique',
    ]

    // ═══════════════════════════════════════════════════════════
    // STEP 2 : LANCEMENT PARALLELE
    // ═══════════════════════════════════════════════════════════
    const tasks: Promise<any>[] = []

    // 2a Contact
    if (traitements.includes('enrichissement_contact')) {
      tasks.push(
        Promise.race([
          this.contactAgent.enrich({
            lead_id: lead.lead_id,
            entreprise: lead.entreprise,
            contact: lead.contact,
          }),
          this.timeout(GLOBAL_TIMEOUT_MS, '2a_contact_timeout'),
        ]).catch(err => ({ status: 'failed', error: err.message }))
      )
    } else {
      tasks.push(Promise.resolve(null))
    }

    // 2b Entreprise
    if (traitements.includes('enrichissement_entreprise')) {
      tasks.push(
        Promise.race([
          this.entrepriseAgent.enrich({
            lead_id: lead.lead_id,
            entreprise: lead.entreprise,
            pre_score: lead.pre_score.total,
          }),
          this.timeout(GLOBAL_TIMEOUT_MS, '2b_entreprise_timeout'),
        ]).catch(err => ({ status: 'failed', error: err.message }))
      )
    } else {
      tasks.push(Promise.resolve(null))
    }

    // 2c Technique
    if (traitements.includes('scan_technique') && lead.entreprise.site_web) {
      const shouldScan = await this.shouldRunTechScan(lead)
      if (shouldScan) {
        tasks.push(
          Promise.race([
            this.techAgent.enrich({
              lead_id: lead.lead_id,
              site_web: lead.entreprise.site_web,
            }),
            this.timeout(GLOBAL_TIMEOUT_MS, '2c_technique_timeout'),
          ]).catch(err => ({ status: 'failed', error: err.message }))
        )
      } else {
        // Recuperer le scan existant
        tasks.push(this.getExistingTechScan(lead.entreprise.site_web))
      }
    } else {
      tasks.push(Promise.resolve(null))
    }

    // Lancer les 3 en parallele
    const [contactResult, entrepriseResult, techResult] = await Promise.allSettled(tasks)

    // ═══════════════════════════════════════════════════════════
    // STEP 3 : FUSION DES RESULTATS
    // ═══════════════════════════════════════════════════════════
    const enrichedProspect = this.fuseResults(
      lead,
      contactResult.status === 'fulfilled' ? contactResult.value : null,
      entrepriseResult.status === 'fulfilled' ? entrepriseResult.value : null,
      techResult.status === 'fulfilled' ? techResult.value : null,
    )

    // ═══════════════════════════════════════════════════════════
    // STEP 4 : DEDUPLICATION BDD
    // ═══════════════════════════════════════════════════════════
    const dedupResult = await this.deduplicateWithBDD(enrichedProspect)
    const finalProspect = dedupResult.isNew
      ? enrichedProspect
      : this.mergeWithExisting(enrichedProspect, dedupResult.existingProspect!)

    // ═══════════════════════════════════════════════════════════
    // STEP 5 : CONTROLE QUALITE
    // ═══════════════════════════════════════════════════════════
    const qualityCheck = this.checkQuality(finalProspect)
    finalProspect.enrichissement.qualite = qualityCheck

    // Persister en BDD
    await this.saveProspect(finalProspect, dedupResult.isNew)

    // ═══════════════════════════════════════════════════════════
    // STEP 6 : DISPATCH VERS SCOREUR
    // ═══════════════════════════════════════════════════════════
    if (qualityCheck.enrichable) {
      await this.scoreurQueue.add('score_prospect', {
        prospect_id: finalProspect.prospect_id,
        prospect_data: finalProspect,
        priority: finalProspect.enrichissement.qualite.completude_pct >= 70 ? 1 : 5,
      }, {
        priority: finalProspect.enrichissement.qualite.completude_pct >= 70 ? 1 : 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      })
    }

    // Metriques
    await this.logMetrics(finalProspect, Date.now() - startTime)

    return finalProspect
  }

  // ═══════════════════════════════════════════════════════════
  // METHODES PRIVEES
  // ═══════════════════════════════════════════════════════════

  private async preEnrichmentCheck(lead: NormalizedLead): Promise<{
    skip: boolean
    reason?: string
    existingProspect?: EnrichedProspect
  }> {
    // Verifier si deja enrichi
    const existing = await db.query(
      `SELECT * FROM prospects WHERE lead_id = $1 AND enrichissement_status = 'complet'`,
      [lead.lead_id]
    )
    if (existing.rows.length > 0) {
      return { skip: true, reason: 'deja_enrichi', existingProspect: existing.rows[0] }
    }

    // Verifier blacklist RGPD
    if (lead.contact?.email) {
      const blacklisted = await db.query(
        `SELECT * FROM rgpd_oppositions WHERE email = $1`,
        [lead.contact.email]
      )
      if (blacklisted.rows.length > 0) {
        return { skip: true, reason: 'opposition_rgpd' }
      }
    }

    return { skip: false }
  }

  private fuseResults(
    lead: NormalizedLead,
    contact: any | null,
    entreprise: any | null,
    technique: any | null,
  ): EnrichedProspect {
    return {
      prospect_id: crypto.randomUUID(),
      lead_id: lead.lead_id,
      created_at: new Date().toISOString(),

      // --- Entreprise (fusion 2b + lead original) ---
      entreprise: {
        nom: entreprise?.identite?.denomination || lead.entreprise.nom,
        siren: entreprise?.identite?.siren || null,
        siret: entreprise?.identite?.siret || lead.entreprise.siret || null,
        forme_juridique: entreprise?.identite?.forme_juridique || null,
        date_creation: entreprise?.identite?.date_creation || null,
        capital: entreprise?.identite?.capital || null,
        code_naf: entreprise?.identite?.code_naf || null,
        libelle_naf: entreprise?.identite?.libelle_naf || null,
        categorie: entreprise?.identite?.categorie_entreprise || null,
        tva_intracommunautaire: entreprise?.identite?.tva_intracommunautaire || null,
        site_web: lead.entreprise.site_web || null,
        linkedin_url: lead.entreprise.linkedin_company_url || null,
        secteur: entreprise?.identite?.libelle_naf || lead.entreprise.secteur || null,
        segment: lead.entreprise.segment_estime,

        effectif: {
          tranche: entreprise?.effectif?.tranche_libelle || lead.entreprise.taille_estimee || null,
          exact: entreprise?.effectif?.effectif_exact || null,
        },

        adresse: entreprise?.adresse || {
          rue: null,
          code_postal: null,
          ville: null,
          departement: null,
          region: null,
          pays: 'France',
        },

        finances: entreprise?.finances || {
          ca_dernier: null,
          ca_n_moins_1: null,
          ca_n_moins_2: null,
          resultat_dernier: null,
          croissance_ca_pct: null,
          annee_dernier_bilan: null,
        },

        dirigeants: entreprise?.dirigeants || [],
        beneficiaires_effectifs: entreprise?.beneficiaires_effectifs || [],
        signaux_bodacc: entreprise?.signaux_bodacc || [],
        alertes: entreprise?.alertes || {
          procedure_collective: false,
          entreprise_fermee: false,
          ca_en_baisse: false,
          effectif_en_baisse: false,
        },
      },

      // --- Contact principal (fusion 2a + lead original) ---
      contact: {
        prenom: contact?.contact_principal?.prenom || lead.contact?.prenom || null,
        nom: contact?.contact_principal?.nom || lead.contact?.nom || null,
        poste: contact?.contact_principal?.poste || lead.contact?.poste || null,
        linkedin_url: contact?.contact_principal?.linkedin_url || lead.contact?.linkedin_url || null,
        email: contact?.contact_principal?.email || lead.contact?.email || null,
        email_status: contact?.contact_principal?.email_status || 'not_found',
        email_confidence: contact?.contact_principal?.email_confidence || null,
        telephone: contact?.contact_principal?.telephone || null,
        decideur_score: contact?.decideur_score || 0,
      },

      contacts_secondaires: contact?.contacts_secondaires || [],

      // --- Donnees techniques (fusion 2c) ---
      technique: technique ? {
        stack: technique.stack,
        performance: technique.performance,
        accessibilite: technique.accessibilite,
        seo: technique.seo,
        ssl: technique.ssl,
        problemes_detectes: technique.problemes_detectes,
      } : null,

      // --- Signaux (du Veilleur) ---
      signaux: lead.signaux,
      signal_principal: lead.signal_principal,
      sources: lead.sources,
      nb_detections: lead.nb_detections,
      pre_score: lead.pre_score,

      // --- Enrichissement metadata ---
      enrichissement: {
        status: 'complet',
        date_enrichissement: new Date().toISOString(),
        sous_agents_utilises: [
          contact ? '2a_contact' : null,
          entreprise ? '2b_entreprise' : null,
          technique ? '2c_technique' : null,
        ].filter(Boolean) as string[],
        qualite: { completude_pct: 0, champs_manquants: [], enrichable: true },
        duration_ms: 0,
        credits_total: {},
      },
    }
  }

  private async deduplicateWithBDD(prospect: EnrichedProspect): Promise<{
    isNew: boolean
    existingProspect?: EnrichedProspect
    matchType?: string
  }> {
    // Priorite 1 : SIRET
    if (prospect.entreprise.siret) {
      const existing = await db.query(
        `SELECT * FROM prospects WHERE siret = $1 LIMIT 1`,
        [prospect.entreprise.siret]
      )
      if (existing.rows.length > 0) {
        return { isNew: false, existingProspect: existing.rows[0], matchType: 'siret' }
      }
    }

    // Priorite 2 : Email
    if (prospect.contact.email) {
      const existing = await db.query(
        `SELECT * FROM prospects WHERE email = $1 LIMIT 1`,
        [prospect.contact.email]
      )
      if (existing.rows.length > 0) {
        return { isNew: false, existingProspect: existing.rows[0], matchType: 'email' }
      }
    }

    // Priorite 3 : Domaine du site web
    if (prospect.entreprise.site_web) {
      const domain = new URL(prospect.entreprise.site_web).hostname.replace('www.', '')
      const existing = await db.query(
        `SELECT * FROM prospects WHERE site_web LIKE $1 LIMIT 1`,
        [`%${domain}%`]
      )
      if (existing.rows.length > 0) {
        return { isNew: false, existingProspect: existing.rows[0], matchType: 'domain' }
      }
    }

    return { isNew: true }
  }

  private mergeWithExisting(
    newData: EnrichedProspect, existing: EnrichedProspect
  ): EnrichedProspect {
    // Fusionner les signaux (ajouter les nouveaux, ne pas dupliquer)
    const existingSignalKeys = new Set(
      existing.signaux.map(s => `${s.type}:${s.source}:${s.date_signal}`)
    )
    const newSignaux = newData.signaux.filter(
      s => !existingSignalKeys.has(`${s.type}:${s.source}:${s.date_signal}`)
    )
    existing.signaux.push(...newSignaux)

    // Completer les champs manquants
    if (!existing.contact.email && newData.contact.email) {
      existing.contact.email = newData.contact.email
      existing.contact.email_status = newData.contact.email_status
    }
    if (!existing.entreprise.finances.ca_dernier && newData.entreprise.finances.ca_dernier) {
      existing.entreprise.finances = newData.entreprise.finances
    }
    if (!existing.technique && newData.technique) {
      existing.technique = newData.technique
    }

    // Incrementer detections
    existing.nb_detections = (existing.nb_detections || 0) + 1
    existing.sources = [...new Set([...existing.sources, ...newData.sources])]

    return existing
  }

  private checkQuality(prospect: EnrichedProspect): {
    completude_pct: number
    champs_manquants: string[]
    enrichable: boolean
  } {
    const champsManquants: string[] = []

    // Champs critiques
    if (!prospect.contact.email) champsManquants.push('email')
    if (!prospect.contact.prenom) champsManquants.push('contact_prenom')
    if (!prospect.contact.nom) champsManquants.push('contact_nom')
    if (!prospect.entreprise.siret) champsManquants.push('siret')

    // Champs importants
    if (!prospect.entreprise.finances.ca_dernier) champsManquants.push('chiffre_affaires')
    if (!prospect.entreprise.effectif.exact) champsManquants.push('effectif_exact')
    if (!prospect.contact.telephone) champsManquants.push('telephone')
    if (!prospect.technique) champsManquants.push('donnees_techniques')

    // Champs secondaires
    if (!prospect.entreprise.site_web) champsManquants.push('site_web')
    if (prospect.entreprise.dirigeants.length === 0) champsManquants.push('dirigeants')

    const totalChamps = 10
    const champsRemplis = totalChamps - champsManquants.length
    const completude = Math.round((champsRemplis / totalChamps) * 100)

    // Enrichable = au minimum le nom entreprise + 1 moyen de contact
    const enrichable = !!(
      prospect.entreprise.nom &&
      (prospect.contact.email || prospect.contact.telephone || prospect.contact.linkedin_url)
    )

    return {
      completude_pct: completude,
      champs_manquants: champsManquants,
      enrichable,
    }
  }

  private timeout(ms: number, label: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${label} after ${ms}ms`)), ms)
    )
  }
}
```

### 6.4 Worker BullMQ

```typescript
// workers/enrichisseur_worker.ts
import { Worker, Job } from 'bullmq'

const enrichisseur = new MasterEnrichisseur()

const worker = new Worker('enrichisseur-pipeline', async (job: Job) => {
  const { lead_data, priority } = job.data

  try {
    const result = await enrichisseur.enrichLead(lead_data)

    // Logger le succes
    await db.query(
      `UPDATE leads_bruts SET statut = 'enrichi', updated_at = NOW() WHERE id = $1`,
      [lead_data.lead_id]
    )

    return result
  } catch (error) {
    // Logger l'erreur
    await db.query(
      `UPDATE leads_bruts SET statut = 'erreur_enrichissement', metadata = metadata || $2, updated_at = NOW() WHERE id = $1`,
      [lead_data.lead_id, JSON.stringify({ enrichment_error: (error as Error).message })]
    )
    throw error // BullMQ va retry
  }
}, {
  connection: redis,
  concurrency: 5,           // 5 leads en parallele
  limiter: {
    max: 10,                 // Max 10 jobs par minute
    duration: 60000,
  },
  settings: {
    stalledInterval: 300000, // 5 minutes avant de considerer un job bloque
  },
})

worker.on('completed', (job, result) => {
  console.log(`Lead ${job.data.lead_data.lead_id} enrichi en ${result.enrichissement.duration_ms}ms`)
})

worker.on('failed', (job, err) => {
  console.error(`Lead ${job?.data?.lead_data?.lead_id} FAILED: ${err.message}`)
})
```

### 6.5 Gestion des donnees manquantes

| Donnee manquante | Action | Impact sur scoring |
|-----------------|--------|-------------------|
| Email non trouve | Flag `email_status: 'not_found'`, marquer pour enrichissement manuel | -20 pts (pas de canal de contact direct) |
| Telephone non trouve | Pas bloquant, continuer | Neutre |
| SIRET non trouve | Marquer `siret_status: 'not_found'`, continuer avec nom | -10 pts (donnees financieres indisponibles) |
| CA non disponible | Normal pour TPE/startups, marquer `unknown` | Neutre pour startups, -5 pts pour PME |
| Site web absent | Pas de scan technique possible | -5 pts |
| Procedure collective detectee | EXCLURE le lead automatiquement | Lead rejete |
| Entreprise fermee | EXCLURE le lead automatiquement | Lead rejete |
| Contact poste non pertinent | Chercher un autre decideur | -5 pts si fallback |

### 6.6 Schema JSON de sortie COMPLET (fiche prospect enrichie)

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
      },
      {
        "prenom": "Sophie",
        "nom": "Martin",
        "fonction": "Directeur General",
        "date_nomination": "2025-12-01"
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

### 6.7 Monitoring du Master Enrichisseur

```typescript
interface EnrichisseurHealthStatus {
  status: 'healthy' | 'degraded' | 'down'
  queue: {
    waiting: number
    active: number
    completed_last_hour: number
    failed_last_hour: number
    avg_duration_ms: number
  }
  subagents: {
    '2a_contact': { success_rate_pct: number, avg_duration_ms: number, credits_remaining: Record<string, number> }
    '2b_entreprise': { success_rate_pct: number, avg_duration_ms: number, credits_remaining: Record<string, number> }
    '2c_technique': { success_rate_pct: number, avg_duration_ms: number }
  }
  last_enrichment_at: string
  completude_moyenne_pct: number
  email_found_rate_pct: number       // % de leads avec email trouve
  siret_found_rate_pct: number       // % de leads avec SIRET trouve
  deduplication_rate_pct: number     // % de leads dedupliques
}

// Alertes
const ALERT_THRESHOLDS = {
  queue_waiting_warn: 50,        // > 50 leads en attente
  queue_waiting_critical: 200,   // > 200 leads en attente
  email_found_rate_warn: 60,     // < 60% d'emails trouves
  email_found_rate_critical: 40, // < 40% d'emails trouves
  avg_duration_warn: 120000,     // > 2 minutes en moyenne
  failed_rate_warn: 20,          // > 20% d'echecs
}
```

---

## 7. RGPD -- CONFORMITE COMPLETE

### 7.1 Base legale : Interet legitime B2B

**Fondement juridique** : Article 6.1(f) du RGPD -- Interet legitime

En B2B (prospection entre professionnels), le consentement prealable N'EST PAS requis a condition de respecter les 3 conditions suivantes :

| Condition | Application Axiom |
|-----------|------------------|
| **Pertinence** | Le message doit se rapporter a l'activite professionnelle du destinataire. Axiom propose des services de dev web/IA -- pertinent pour les profils CMO, CTO, DSI, fondateurs |
| **Transparence** | Information au 1er contact (Article 14 RGPD) : d'ou viennent les donnees, pourquoi le contact, quels droits |
| **Opposition facile** | Lien de desinscription 1-clic dans chaque email, sans justification requise |

### 7.2 Distinction email nominatif vs generique

**Email nominatif** = DONNEE PERSONNELLE (RGPD s'applique) :
```
sophie.martin@techcorp.fr     <-- Identifie une personne physique
jean.dupont@techcorp.fr       <-- Identifie une personne physique
```

**Email generique** = PAS une donnee personnelle :
```
contact@techcorp.fr           <-- Identifie l'entite, pas une personne
info@techcorp.fr              <-- Identifie l'entite, pas une personne
```

**Consequence** : L'enrichissement d'emails nominatifs (ce que fait l'Agent 2a) est soumis au RGPD, y compris le droit d'opposition et l'obligation d'information.

### 7.3 Obligations RGPD de l'Enrichisseur

#### 7.3.1 Obligation d'information (Article 14)

Quand les donnees ne sont PAS collectees directement aupres de la personne (cas de l'enrichissement), l'Article 14 du RGPD impose d'informer la personne dans un "delai raisonnable" (max 1 mois) ou au plus tard au premier contact.

**Information a fournir** :
1. Identite du responsable de traitement (Axiom Marketing / UNIVILE SAS)
2. Finalite du traitement (prospection commerciale B2B)
3. Categories de donnees (email professionnel, poste, entreprise)
4. Source des donnees (sources publiques, LinkedIn, annuaires professionnels)
5. Duree de conservation (3 ans apres le dernier contact)
6. Droits de la personne (opposition, acces, rectification, effacement)
7. Coordonnees du DPO (si designe)

#### 7.3.2 Droit d'opposition (Article 21)

Le droit d'opposition doit etre :
- **Inconditionnel** : pas besoin de justification
- **Immediat** : traitement dans les 72h
- **Simple** : lien 1-clic ou email simple
- **Gratuit** : aucun frais

**Implementation technique** :

```typescript
// rgpd/opposition.ts

async function handleOpposition(email: string, source: string): Promise<void> {
  // 1. Ajouter a la table des oppositions
  await db.query(
    `INSERT INTO rgpd_oppositions (email, date_opposition, source, status)
     VALUES ($1, NOW(), $2, 'active')
     ON CONFLICT (email) DO UPDATE SET date_opposition = NOW(), status = 'active'`,
    [email, source]
  )

  // 2. Supprimer de la table prospects (ou anonymiser)
  await db.query(
    `UPDATE prospects SET
       email = NULL,
       telephone = NULL,
       contact_prenom = '[OPPOSE]',
       contact_nom = '[OPPOSE]',
       statut = 'oppose_rgpd',
       updated_at = NOW()
     WHERE email = $1`,
    [email]
  )

  // 3. Supprimer des sequences de relance en cours
  await db.query(
    `DELETE FROM sequences_emails WHERE prospect_email = $1`,
    [email]
  )

  // 4. Logger dans le registre des traitements
  await db.query(
    `INSERT INTO rgpd_log (action, email, date_action, detail)
     VALUES ('opposition', $1, NOW(), $2)`,
    [email, `Opposition recue via ${source}`]
  )
}
```

#### 7.3.3 Registre des traitements

**Obligatoire si** : plus de 1,000 contacts actifs OU traitement systematique.

**Contenu du registre** :

| Champ | Valeur |
|-------|--------|
| Responsable de traitement | UNIVILE SAS (Axiom Marketing) |
| DPO | [A designer si necessaire] |
| Finalite | Prospection commerciale B2B -- services dev web et IA |
| Base legale | Interet legitime (Art. 6.1.f) |
| Categories de personnes | Decideurs d'entreprises (CMO, CTO, DG, DSI, Fondateurs) |
| Categories de donnees | Email pro, telephone pro, poste, nom, prenom, entreprise, LinkedIn |
| Sources | LinkedIn (publique), annuaires pro, APIs Dropcontact/Hunter, registres legaux |
| Destinataires | Outils internes (n8n, AdonisJS, PostgreSQL), Dropcontact, Hunter.io, ZeroBounce |
| Transfert hors UE | ZeroBounce (USA) -- clauses contractuelles types requises |
| Duree conservation | 3 ans apres le dernier contact actif |
| Mesures de securite | Chiffrement transit (TLS) + repos (AES-256), acces restreint, logs d'acces |

#### 7.3.4 Duree de conservation

```
┌─────────────────────────────────────────────────────────────────────────┐
│ REGLES DE CONSERVATION DES DONNEES                                     │
│                                                                         │
│  PROSPECTS ACTIFS (reponse ou interaction dans les 3 ans) :             │
│  └── Conservation illimitee tant qu'il y a interaction                   │
│                                                                         │
│  PROSPECTS INACTIFS (aucune interaction depuis 3 ans) :                 │
│  └── Suppression automatique apres 3 ans                                │
│  └── OU anonymisation (garder les stats, supprimer les donnees perso)   │
│                                                                         │
│  PROSPECTS OPPOSES (droit d'opposition exerce) :                        │
│  └── Suppression immediate des donnees de contact                       │
│  └── Conservation du hash email dans la blacklist (pour ne pas          │
│      re-contacter)                                                      │
│                                                                         │
│  CRON DE NETTOYAGE : 1x/mois                                           │
│  └── Supprimer les prospects sans interaction depuis 3 ans              │
│  └── Verifier les oppositions en attente                                │
│  └── Generer un rapport de conformite                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

```typescript
// cron/rgpd_cleanup.ts
// Execution : 1er de chaque mois a 03:00

async function rgpdCleanup() {
  // 1. Supprimer les prospects inactifs > 3 ans
  const deleted = await db.query(
    `UPDATE prospects SET
       email = NULL, telephone = NULL,
       contact_prenom = '[EXPIRE]', contact_nom = '[EXPIRE]',
       statut = 'expire_rgpd'
     WHERE last_interaction_at < NOW() - INTERVAL '3 years'
       AND statut NOT IN ('oppose_rgpd', 'expire_rgpd')
     RETURNING id`
  )
  console.log(`${deleted.rowCount} prospects expires et anonymises`)

  // 2. Verifier coherence blacklist
  const orphans = await db.query(
    `SELECT p.email FROM prospects p
     JOIN rgpd_oppositions o ON p.email = o.email
     WHERE p.statut != 'oppose_rgpd'`
  )
  for (const orphan of orphans.rows) {
    await handleOpposition(orphan.email, 'cleanup_auto')
  }

  // 3. Rapport
  const stats = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE statut = 'actif') as actifs,
       COUNT(*) FILTER (WHERE statut = 'oppose_rgpd') as opposes,
       COUNT(*) FILTER (WHERE statut = 'expire_rgpd') as expires,
       COUNT(*) as total
     FROM prospects`
  )
  await slack.send('#ops-rgpd', {
    text: `Rapport RGPD mensuel : ${stats.rows[0].actifs} actifs, ${stats.rows[0].opposes} opposes, ${stats.rows[0].expires} expires`,
  })
}
```

### 7.4 Conformite des outils tiers

| Outil | Serveurs | DPA requis | RGPD-compliant |
|-------|---------|-----------|----------------|
| **Dropcontact** | France (EU) | Inclus | OUI -- audite CNIL |
| **Hunter.io** | EU | Oui (a signer) | OUI (avec DPA) |
| **ZeroBounce** | USA | Oui + Clauses Contractuelles Types | ATTENTION -- transfert hors UE |
| **Kaspr** | EU | Oui (a signer) | OUI (avec DPA) |
| **INSEE** | France | Non requis (donnees publiques) | OUI |
| **Pappers** | France | Non requis (donnees publiques) | OUI |
| **BODACC** | France | Non requis (donnees publiques) | OUI |

**Action requise pour ZeroBounce** : Signer les Clauses Contractuelles Types (CCT/SCC) pour le transfert de donnees UE --> USA. Alternative : utiliser NeverBounce (serveurs EU) a la place.

### 7.5 Template mention legale email (premier contact)

```
---
Vous recevez cet email car vous etes [POSTE] chez [ENTREPRISE].
Vos donnees professionnelles (email, poste, entreprise) proviennent
de sources publiques (LinkedIn, annuaires professionnels, registres legaux).

Conformement au RGPD, vous disposez d'un droit d'opposition, d'acces,
de rectification et de suppression de vos donnees.

[SE DESINSCRIRE EN 1 CLIC]

Pour exercer vos droits : rgpd@axiom-marketing.fr
Responsable de traitement : UNIVILE SAS, [adresse]
---
```

### 7.6 Checklist conformite RGPD Enrichisseur

| Point | Statut | Detail |
|-------|--------|--------|
| Base legale definie (interet legitime B2B) | A IMPLEMENTER | Documenter dans le registre |
| Information Article 14 au 1er contact | A IMPLEMENTER | Template ci-dessus integre dans Agent 4 (REDACTEUR) |
| Lien desinscription 1-clic | A IMPLEMENTER | Dans chaque email envoye |
| Gestion droit d'opposition (72h max) | A IMPLEMENTER | Fonction handleOpposition() |
| Registre des traitements | A REDIGER | Contenu defini section 7.3.3 |
| DPA signes avec sous-traitants | A SIGNER | Hunter, ZeroBounce, Kaspr |
| Duree conservation 3 ans | A IMPLEMENTER | Cron mensuel rgpdCleanup() |
| Blacklist des opposes | A IMPLEMENTER | Table rgpd_oppositions |
| Transfert hors UE (ZeroBounce) | A EVALUER | CCT a signer ou changer pour EU-only |
| Designation DPO | A EVALUER | Obligatoire si > 5000 contacts ou suivi systematique |

---

## 8. COUTS DETAILLES

### 8.1 Couts par API et par mois (base : 500 leads/mois)

| Service | Plan | Cout/mois | Credits inclus | Usage prevu (500 leads) | Credits restants |
|---------|------|----------|---------------|------------------------|-----------------|
| **Dropcontact** | Pro | 39 EUR | 2,500 | ~500 (1 par lead) | ~2,000 |
| **Hunter.io** | Starter | 49 USD (~46 EUR) | 500 | ~200 (40% fallback) | ~300 |
| **ZeroBounce** | Pack 2K | 16 USD (~15 EUR) | 2,000 | ~300 (emails non-Dropcontact) | ~1,700 |
| **Kaspr** | Business | 79 EUR | 3,000 | ~150 (30% des leads) | ~2,850 |
| **INSEE Sirene** | Gratuit | 0 EUR | Illimite (30/min) | ~1,000 (2 par lead) | Illimite |
| **Pappers** | Pay-per-use | ~25 EUR | ~500 lookups | ~500 | 0 |
| **Societe.com** | Pay-per-use | ~40 EUR | ~400 lookups | ~100 (leads hot) | ~300 |
| **BODACC** | Gratuit | 0 EUR | Illimite | ~500 | Illimite |
| **Wappalyzer** | Pro | ~30 EUR | 1,000 | ~300 (60% des leads) | ~700 |
| **Lighthouse** | Gratuit (CLI) | 0 EUR | Illimite | ~300 | Illimite |
| **axe-core** | Gratuit (npm) | 0 EUR | Illimite | ~300 | Illimite |

### 8.2 Total mensuel

| Poste | Cout/mois |
|-------|----------|
| Sous-agent 2a (Contact) | ~183 EUR |
| Sous-agent 2b (Entreprise) | ~65 EUR |
| Sous-agent 2c (Technique) | ~30 EUR |
| **TOTAL AGENT 2 -- ENRICHISSEUR** | **~278 EUR/mois** |

### 8.3 Total annuel

| Poste | Cout annuel |
|-------|-----------|
| APIs et services | ~3,336 EUR |
| Avec rabais annuels (-15% moyenne) | ~2,836 EUR |

### 8.4 Cout par lead enrichi

| Metrique | Valeur |
|----------|--------|
| Leads enrichis par mois | 500 |
| Cout total mensuel | ~278 EUR |
| **Cout par lead enrichi** | **~0.56 EUR** |
| Cout par lead avec email verifie (~80% des leads) | ~0.70 EUR |
| Cout par lead complet (email + SIRET + CA + tech) | ~0.75 EUR |

### 8.5 Scenarios de montee en charge

| Volume mensuel | Cout estime | Cout/lead |
|---------------|------------|----------|
| 250 leads | ~220 EUR | ~0.88 EUR |
| 500 leads | ~278 EUR | ~0.56 EUR |
| 1,000 leads | ~380 EUR | ~0.38 EUR |
| 2,000 leads | ~550 EUR | ~0.28 EUR |
| 5,000 leads | ~900 EUR | ~0.18 EUR |

**Economies d'echelle** : A partir de 1,000 leads/mois, les plans superieurs deviennent plus avantageux (Dropcontact Scale, Hunter Growth, etc.).

### 8.6 Comparaison cout Enrichisseur vs pipeline total

| Agent | Cout/mois | Part budget |
|-------|----------|------------|
| Agent 1 -- Veilleur | ~430 EUR | 61% |
| **Agent 2 -- Enrichisseur** | **~278 EUR** | **39%** |
| **Total Agents 1+2** | **~708 EUR** | 100% |
| Agents 3-7 (estimation) | ~500-800 EUR | - |
| **Pipeline complet (estimation)** | **~1,200-1,500 EUR** | - |

---

## 9. SCHEMA SQL

### 9.1 Tables specifiques a l'Enrichisseur

Ces tables s'ajoutent a celles definies dans les specs de l'Agent 1 (leads_bruts, audits_techniques, etc.).

```sql
-- ═══════════════════════════════════════════════════════════
-- TABLE PRINCIPALE : prospects (fiche enrichie)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE prospects (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                 UUID REFERENCES leads_bruts(id),
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW(),

  -- Entreprise
  entreprise              VARCHAR(255) NOT NULL,
  siren                   VARCHAR(9),
  siret                   VARCHAR(14),
  forme_juridique         VARCHAR(100),
  date_creation           DATE,
  capital                 DECIMAL,
  code_naf                VARCHAR(10),
  libelle_naf             VARCHAR(255),
  categorie_entreprise    VARCHAR(20),   -- 'TPE' | 'PME' | 'ETI' | 'GE'
  tva_intracommunautaire  VARCHAR(20),
  site_web                VARCHAR(500),
  linkedin_url            VARCHAR(500),
  secteur                 VARCHAR(255),
  segment                 VARCHAR(50),   -- 'pme_metro' | 'ecommerce_shopify' | etc.

  -- Effectif
  effectif_tranche        VARCHAR(100),
  effectif_exact          INTEGER,

  -- Adresse
  adresse_rue             VARCHAR(300),
  adresse_code_postal     VARCHAR(10),
  adresse_ville           VARCHAR(100),
  adresse_departement     VARCHAR(5),
  adresse_region          VARCHAR(50),
  adresse_pays            VARCHAR(50) DEFAULT 'France',

  -- Finances
  ca_dernier              DECIMAL,
  ca_n_moins_1            DECIMAL,
  ca_n_moins_2            DECIMAL,
  resultat_dernier        DECIMAL,
  croissance_ca_pct       DECIMAL,
  annee_dernier_bilan     INTEGER,

  -- Contact principal
  contact_prenom          VARCHAR(100),
  contact_nom             VARCHAR(100),
  contact_poste           VARCHAR(200),
  contact_linkedin        VARCHAR(500),
  email                   VARCHAR(255),
  email_status            VARCHAR(20),   -- 'verified' | 'catch_all' | 'unverified' | 'not_found'
  email_confidence        INTEGER,
  email_source            VARCHAR(30),   -- 'dropcontact' | 'hunter_domain' | 'hunter_finder' | 'pattern_match'
  telephone               VARCHAR(30),
  telephone_source        VARCHAR(20),   -- 'kaspr' | 'dropcontact'
  decideur_score          INTEGER DEFAULT 0,

  -- Contacts secondaires
  contacts_secondaires    JSONB DEFAULT '[]'::JSONB,

  -- Dirigeants et beneficiaires
  dirigeants              JSONB DEFAULT '[]'::JSONB,
  beneficiaires_effectifs JSONB DEFAULT '[]'::JSONB,

  -- Signaux BODACC
  signaux_bodacc          JSONB DEFAULT '[]'::JSONB,

  -- Alertes
  alerte_procedure_collective BOOLEAN DEFAULT false,
  alerte_entreprise_fermee    BOOLEAN DEFAULT false,
  alerte_ca_en_baisse         BOOLEAN DEFAULT false,

  -- Donnees techniques (si scan effectue)
  tech_cms                VARCHAR(100),
  tech_cms_version        VARCHAR(50),
  tech_framework_js       VARCHAR(100),
  tech_analytics          TEXT[],
  tech_ecommerce          VARCHAR(100),
  tech_stack_complete     JSONB,
  perf_score              INTEGER,       -- 0-100
  perf_lcp_ms             INTEGER,
  perf_cls                DECIMAL,
  perf_tbt_ms             INTEGER,
  perf_verdict            VARCHAR(20),   -- 'bon' | 'moyen' | 'mauvais'
  a11y_score              INTEGER,       -- 0-100
  a11y_violations_critical INTEGER DEFAULT 0,
  a11y_violations_serious INTEGER DEFAULT 0,
  a11y_rgaa_compliant     BOOLEAN,
  seo_score               INTEGER,
  ssl_valid               BOOLEAN,
  ssl_days_remaining      INTEGER,
  problemes_detectes      TEXT[],

  -- Signaux (du Veilleur)
  signaux                 JSONB DEFAULT '[]'::JSONB,
  signal_principal        TEXT,
  sources                 TEXT[],
  nb_detections           INTEGER DEFAULT 1,
  pre_score               INTEGER DEFAULT 0,
  pre_score_detail        JSONB,

  -- Enrichissement metadata
  enrichissement_status   VARCHAR(20) DEFAULT 'en_attente',
    -- 'en_attente' | 'en_cours' | 'complet' | 'partiel' | 'echec'
  enrichissement_date     TIMESTAMP,
  enrichissement_sous_agents TEXT[],
  enrichissement_completude INTEGER DEFAULT 0, -- 0-100
  enrichissement_champs_manquants TEXT[],
  enrichissement_duration_ms INTEGER,
  enrichissement_credits  JSONB,

  -- Statut pipeline
  statut                  VARCHAR(30) DEFAULT 'enrichi',
    -- 'enrichi' | 'score' | 'contacte' | 'en_sequence' | 'converti' | 'perdu' | 'oppose_rgpd' | 'expire_rgpd'
  score_final             INTEGER,       -- Rempli par Agent 3

  -- Interaction tracking (pour RGPD conservation 3 ans)
  last_interaction_at     TIMESTAMP,
  nb_interactions         INTEGER DEFAULT 0
);

-- Index pour performance
CREATE INDEX idx_prospects_siret ON prospects(siret);
CREATE INDEX idx_prospects_siren ON prospects(siren);
CREATE INDEX idx_prospects_email ON prospects(email);
CREATE INDEX idx_prospects_site_web ON prospects(site_web);
CREATE INDEX idx_prospects_segment ON prospects(segment);
CREATE INDEX idx_prospects_statut ON prospects(statut);
CREATE INDEX idx_prospects_score ON prospects(score_final DESC NULLS LAST);
CREATE INDEX idx_prospects_enrichissement ON prospects(enrichissement_status);
CREATE INDEX idx_prospects_lead_id ON prospects(lead_id);
CREATE INDEX idx_prospects_last_interaction ON prospects(last_interaction_at DESC);
CREATE INDEX idx_prospects_nom ON prospects USING gin(to_tsvector('french', entreprise));
CREATE INDEX idx_prospects_completude ON prospects(enrichissement_completude DESC);

-- ═══════════════════════════════════════════════════════════
-- TABLE : RGPD Oppositions (blacklist)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE rgpd_oppositions (
  id                  SERIAL PRIMARY KEY,
  email               VARCHAR(255) UNIQUE NOT NULL,
  email_hash          VARCHAR(64) NOT NULL,   -- SHA-256 pour verification rapide
  date_opposition     TIMESTAMP DEFAULT NOW(),
  source              VARCHAR(50),            -- 'email_link' | 'manual' | 'cnil' | 'cleanup'
  status              VARCHAR(20) DEFAULT 'active',
    -- 'active' | 'archived'
  prospect_id         UUID REFERENCES prospects(id),
  notes               TEXT,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rgpd_email ON rgpd_oppositions(email);
CREATE INDEX idx_rgpd_hash ON rgpd_oppositions(email_hash);
CREATE INDEX idx_rgpd_status ON rgpd_oppositions(status);

-- ═══════════════════════════════════════════════════════════
-- TABLE : RGPD Log d'actions
-- ═══════════════════════════════════════════════════════════
CREATE TABLE rgpd_log (
  id                  SERIAL PRIMARY KEY,
  action              VARCHAR(50) NOT NULL,
    -- 'opposition' | 'acces' | 'rectification' | 'effacement' | 'export' | 'conservation_expire'
  email               VARCHAR(255),
  prospect_id         UUID,
  date_action         TIMESTAMP DEFAULT NOW(),
  detail              TEXT,
  traite_par          VARCHAR(100),   -- 'auto' | 'operateur_nom'
  delai_traitement_h  INTEGER         -- Nombre d'heures entre demande et traitement
);

CREATE INDEX idx_rgpd_log_action ON rgpd_log(action);
CREATE INDEX idx_rgpd_log_date ON rgpd_log(date_action DESC);

-- ═══════════════════════════════════════════════════════════
-- TABLE : Enrichissement batches (metriques)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE enrichissement_batches (
  id                      SERIAL PRIMARY KEY,
  batch_id                VARCHAR(100) NOT NULL UNIQUE,
  nb_leads_recus          INTEGER DEFAULT 0,
  nb_leads_enrichis       INTEGER DEFAULT 0,
  nb_leads_partiels       INTEGER DEFAULT 0,
  nb_leads_echec          INTEGER DEFAULT 0,
  nb_leads_dedupliques    INTEGER DEFAULT 0,
  nb_leads_exclus         INTEGER DEFAULT 0,  -- procedure collective, ferme, oppose

  -- Taux de succes par sous-agent
  taux_email_found_pct    DECIMAL,
  taux_siret_found_pct    DECIMAL,
  taux_ca_found_pct       DECIMAL,
  taux_tech_scan_pct      DECIMAL,

  -- Performance
  avg_duration_ms         INTEGER,
  max_duration_ms         INTEGER,

  -- Credits consommes
  credits_dropcontact     INTEGER DEFAULT 0,
  credits_hunter          INTEGER DEFAULT 0,
  credits_zerobounce      INTEGER DEFAULT 0,
  credits_kaspr           INTEGER DEFAULT 0,
  credits_pappers         INTEGER DEFAULT 0,
  credits_societecom      INTEGER DEFAULT 0,
  credits_wappalyzer      INTEGER DEFAULT 0,

  -- Cout estime
  cout_estime_eur         DECIMAL,

  created_at              TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_enrich_batches_date ON enrichissement_batches(created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- TABLE : Cache enrichissement (eviter re-queries)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE enrichissement_cache (
  id                  SERIAL PRIMARY KEY,
  cache_type          VARCHAR(30) NOT NULL,
    -- 'contact' | 'entreprise' | 'technique'
  cache_key           VARCHAR(500) NOT NULL,  -- ex: "domain:techcorp.fr:sophie_martin"
  data                JSONB NOT NULL,
  source              VARCHAR(50),            -- API source
  expires_at          TIMESTAMP NOT NULL,
  created_at          TIMESTAMP DEFAULT NOW(),

  UNIQUE(cache_type, cache_key)
);

CREATE INDEX idx_cache_type_key ON enrichissement_cache(cache_type, cache_key);
CREATE INDEX idx_cache_expires ON enrichissement_cache(expires_at);

-- Nettoyage automatique du cache expire
-- (a executer via cron quotidien)
-- DELETE FROM enrichissement_cache WHERE expires_at < NOW();

-- ═══════════════════════════════════════════════════════════
-- TABLE : Extension api_usage (ajout colonnes Agent 2)
-- ═══════════════════════════════════════════════════════════
-- La table api_usage existe deja (Agent 1). On ajoute les providers de l'Agent 2 :
-- 'dropcontact' | 'zerobounce' | 'kaspr' | 'pappers' | 'societecom' | 'wappalyzer' | 'insee'
-- Pas de changement de schema necessaire, les nouveaux providers utilisent la meme table.

-- ═══════════════════════════════════════════════════════════
-- VUES pour monitoring
-- ═══════════════════════════════════════════════════════════
CREATE VIEW v_enrichissement_daily_summary AS
SELECT
  DATE(enrichissement_date) as jour,
  COUNT(*) as total_enrichis,
  COUNT(*) FILTER (WHERE enrichissement_status = 'complet') as complets,
  COUNT(*) FILTER (WHERE enrichissement_status = 'partiel') as partiels,
  COUNT(*) FILTER (WHERE enrichissement_status = 'echec') as echecs,
  AVG(enrichissement_completude) as completude_moyenne,
  COUNT(*) FILTER (WHERE email IS NOT NULL AND email_status = 'verified') as avec_email_verifie,
  COUNT(*) FILTER (WHERE siret IS NOT NULL) as avec_siret,
  COUNT(*) FILTER (WHERE ca_dernier IS NOT NULL) as avec_ca,
  COUNT(*) FILTER (WHERE perf_score IS NOT NULL) as avec_tech_scan,
  AVG(enrichissement_duration_ms) as avg_duration_ms
FROM prospects
WHERE enrichissement_date IS NOT NULL
GROUP BY DATE(enrichissement_date)
ORDER BY jour DESC;

CREATE VIEW v_prospects_a_scorer AS
SELECT *
FROM prospects
WHERE enrichissement_status = 'complet'
  AND statut = 'enrichi'
  AND enrichissement_completude >= 50
  AND NOT alerte_procedure_collective
  AND NOT alerte_entreprise_fermee
ORDER BY pre_score DESC, enrichissement_completude DESC;

CREATE VIEW v_prospects_enrichissement_manuel AS
SELECT id, entreprise, email, email_status, enrichissement_champs_manquants, pre_score
FROM prospects
WHERE enrichissement_status IN ('partiel', 'echec')
  AND email_status IN ('not_found', 'unverified')
  AND pre_score >= 50
ORDER BY pre_score DESC;
```

---

## 10. VERIFICATION DE COHERENCE

### 10.1 Input Agent 2 == Output Agent 1

**Verification champ par champ** :

| Champ Output Agent 1 | Champ Input Agent 2 | Present | Coherent |
|----------------------|---------------------|---------|----------|
| `lead_id` (UUID) | `lead_id` | OUI | OUI |
| `created_at` | `created_at` | OUI | OUI |
| `source_primaire` | `source_primaire` | OUI | OUI |
| `sources[]` | `sources[]` | OUI | OUI |
| `nb_detections` | `nb_detections` | OUI | OUI |
| `entreprise.nom` | `entreprise.nom` | OUI | OUI -- utilise par 2a et 2b |
| `entreprise.siret` | `entreprise.siret` | OUI (parfois null) | OUI -- 2b le cherche si null |
| `entreprise.site_web` | `entreprise.site_web` | OUI (souvent) | OUI -- utilise par 2a et 2c |
| `entreprise.linkedin_company_url` | `entreprise.linkedin_company_url` | OUI | OUI -- utilise par 2a |
| `entreprise.secteur` | `entreprise.secteur` | OUI (souvent null) | OUI -- 2b enrichit |
| `entreprise.taille_estimee` | `entreprise.taille_estimee` | OUI | OUI -- 2b precise |
| `entreprise.localisation` | `entreprise.localisation` | OUI | OUI -- 2b enrichit |
| `entreprise.segment_estime` | `entreprise.segment_estime` | OUI | OUI -- utilise par 2a pour mapping decideur |
| `contact.prenom` | `contact.prenom` | OUI (parfois null) | OUI -- 2a le cherche si null |
| `contact.nom` | `contact.nom` | OUI (parfois null) | OUI |
| `contact.poste` | `contact.poste` | OUI (parfois null) | OUI |
| `contact.linkedin_url` | `contact.linkedin_url` | OUI (parfois null) | OUI -- utilise par 2a |
| `contact.email` | `contact.email` | OUI (souvent null) | OUI -- 2a le trouve |
| `contact.telephone` | `contact.telephone` | OUI (souvent null) | OUI -- 2a le trouve |
| `signaux[]` | `signaux[]` | OUI | OUI -- transmis au SCOREUR |
| `signal_principal` | `signal_principal` | OUI | OUI |
| `pre_score.total` | `pre_score.total` | OUI | OUI -- utilise pour priorisation |
| `pre_score.detail` | `pre_score.detail` | OUI | OUI |
| `metadata.traitement_requis[]` | `metadata.traitement_requis[]` | OUI | OUI -- determine quels sous-agents activer |
| `metadata.batch_id` | `metadata.batch_id` | OUI | OUI |

**Verdict** : COMPATIBLE a 100%. Tous les champs du schema de sortie Agent 1 sont mappes et utilises par l'Agent 2.

### 10.2 Output Agent 2 compatible avec Input Agent 3 (SCOREUR)

L'Agent 3 (SCOREUR) a besoin des donnees suivantes pour calculer le score final :

| Donnee requise par le SCOREUR | Fournie par Agent 2 | Champ |
|------------------------------|--------------------|----|
| Signal d'achat (type + tier) | OUI | `signaux[]` (transmis du Veilleur) |
| Email verifie (oui/non) | OUI | `contact.email_status` |
| Segment confirme | OUI | `entreprise.segment` |
| Taille entreprise (effectif) | OUI | `entreprise.effectif.exact` ou `tranche` |
| CA (chiffre d'affaires) | OUI | `entreprise.finances.ca_dernier` |
| Performance site (score) | OUI | `technique.performance.score` |
| Accessibilite (score) | OUI | `technique.accessibilite.score` |
| Stack technique | OUI | `technique.stack` |
| Decideur score | OUI | `contact.decideur_score` |
| Nb detections multi-source | OUI | `nb_detections` |
| Problemes detectes | OUI | `technique.problemes_detectes[]` |
| Pre-score | OUI | `pre_score.total` |
| Procedure collective (alerte) | OUI | `entreprise.alertes.procedure_collective` |
| Entreprise fermee (alerte) | OUI | `entreprise.alertes.entreprise_fermee` |
| Croissance CA | OUI | `entreprise.finances.croissance_ca_pct` |
| Localisation | OUI | `entreprise.adresse` |

**Verdict** : COMPATIBLE. Le schema de sortie de l'Agent 2 (section 6.6) contient toutes les donnees necessaires au SCOREUR pour calculer le score final.

### 10.3 Volumes realistes

| Metrique | Valeur estimee | Validation |
|----------|---------------|-----------|
| Leads recus de l'Agent 1 / jour | 8-20 (qualifies, pre_score >= 40) | COHERENT avec les estimations Agent 1 (30-80 bruts, ~25% qualifies) |
| Leads enrichis / jour | 8-20 | COHERENT -- pas de filtrage supplementaire sauf exclusions |
| Leads exclus / jour (procedure coll., ferme) | 0-2 | REALISTE -- ~5-10% des leads |
| Leads dedupliques avec BDD / jour | 1-3 | REALISTE -- ~10-15% de doublons |
| Leads transmis au SCOREUR / jour | 6-18 | COHERENT avec le debit du SCOREUR |
| Leads par mois | 250-500 | COHERENT avec le budget prevu |
| Temps moyen d'enrichissement / lead | 30-120 secondes | REALISTE -- Dropcontact async + parallele |
| Throughput max (5 workers, 10/min) | ~2,800 leads/jour | SUFFISANT pour les volumes prevus |

### 10.4 Budget coherent

| Verification | Resultat |
|-------------|---------|
| Budget Agent 2 / mois | ~278 EUR |
| Budget Agent 1 / mois | ~430 EUR |
| Budget Agent 1 + Agent 2 | ~708 EUR |
| Part Agent 2 dans budget total 1+2 | 39% |
| Budget pipeline 10 agents | ~1 175 EUR/mois |
| Part Agent 2 dans budget pipeline total | ~19-23% |
| Cout par lead enrichi | ~0.56 EUR |
| Cout par lead qualifie (email verifie) | ~0.70 EUR |
| Cout pipeline complet par lead (Agent 1 + 2) | ~1.42 EUR |
| Valeur moyenne d'un deal Axiom | 10,000-50,000 EUR |
| Conversion estimee leads --> deals | ~2% |
| Cout par deal (pipeline 1+2) | ~71 EUR |
| **ROI estime (pipeline 1+2 seul)** | **140x-700x** |

**Verdict** : COHERENT. Le budget est raisonnable par rapport aux volumes et au ROI potentiel.

### 10.5 Pas de redondance avec Agent 1c (Veille Web)

| Fonctionnalite | Agent 1c (Veilleur Web) | Agent 2c (Enrichisseur Technique) | Redondance ? |
|---------------|------------------------|----------------------------------|-------------|
| Scan Lighthouse | OUI -- batch nocturne, 100-500 sites | OUI -- a la demande, 1 site | NON -- 2c ne scanne QUE si 1c n'a pas deja fait |
| Wappalyzer | OUI -- pendant scan nocturne | OUI -- a la demande | NON -- 2c verifie si scan < 30 jours existe |
| axe-core | OUI -- pendant scan nocturne | OUI -- a la demande | NON -- meme logique |
| Declenchement | Batch programme (02h-06h) | A la reception d'un lead (temps reel) | NON -- contextes differents |
| Donnees stockees | Table `audits_techniques` | Table `prospects` (colonnes tech_*) | NON -- 2c reutilise les donnees de `audits_techniques` |

**Mecanisme anti-redondance** : La fonction `shouldRunTechScan()` (section 5.2) verifie explicitement si :
1. Le lead vient de `veille_web` --> skip (donnees deja presentes)
2. Un scan de moins de 30 jours existe en BDD `audits_techniques` --> reutiliser

**Verdict** : PAS DE REDONDANCE. Le sous-agent 2c est un complement intelligent de l'Agent 1c, pas un doublon.

### 10.6 Checklist finale

| Point de verification | Statut |
|----------------------|--------|
| Input Agent 2 == Output Agent 1 (tous les champs mappes) | VALIDE |
| Output Agent 2 compatible avec Input Agent 3 (SCOREUR) | VALIDE |
| Schema JSON de sortie complet et documente | VALIDE |
| Waterfall d'enrichissement contact documente (Dropcontact --> Hunter --> Pattern --> ZeroBounce) | VALIDE |
| Waterfall d'enrichissement entreprise documente (INSEE --> Pappers --> BODACC --> Societe.com) | VALIDE |
| Pas de redondance avec Agent 1c (veille web) | VALIDE |
| Volumes quotidiens realistes (8-20 leads/jour enrichis) | VALIDE |
| Budget mensuel coherent (~278 EUR pour 500 leads) | VALIDE |
| ROI compatible avec les objectifs Axiom | VALIDE |
| RGPD complet (base legale, information, opposition, conservation) | VALIDE |
| Schema SQL complet avec index | VALIDE |
| Gestion d'erreurs documentee pour chaque sous-agent | VALIDE |
| Cache et rate limiting documentes | VALIDE |
| Deduplication BDD multi-cle (SIRET, email, domaine) | VALIDE |
| Mapping decideur par segment documente | VALIDE |
| Pattern matching email documente | VALIDE |
| Controle qualite et completude integre | VALIDE |
| Monitoring et alertes documentes | VALIDE |
| DPA a signer avec sous-traitants identifies | A FAIRE |
| Template mention legale RGPD pret | VALIDE |
| Parallelisation 2a + 2b + 2c documentee | VALIDE |
| Toutes les APIs listees avec endpoints, auth, pricing | VALIDE |

---

## 11. INTEGRATION AVEC LES AGENTS 8, 9, 10

**Date d'ajout** : 19 mars 2026
**Reference** : Rapport d'impact AGENT-2-IMPACT-AGENTS-8-9-10.md

### 11.1 Optimisation waterfall pour les referrals

Les leads referral envoyes par l'Agent 10 (CSM) transitent par l'Agent 1 (Veilleur) avant d'arriver a l'Agent 2. Lorsqu'un referral arrive avec un email **deja fourni** par le client ambassadeur, le sous-agent 2a applique un waterfall simplifie :

```
SI email fourni par referrer :
  ├── SKIP Etapes 1-4 (Dropcontact, Hunter, Pattern Match)
  ├── GO directement Etape 5 : ZeroBounce verification
  │   ├── Si VALID    --> email_status = 'verified', source = 'referral'
  │   ├── Si INVALID  --> FALLBACK au waterfall complet (Dropcontact etapes 1-4)
  │   └── Si CATCH_ALL --> flag 'risky', utiliser quand meme
  └── Etape 6 : Kaspr telephone (si LinkedIn dispo, inchange)

SI email PAS fourni (referral sans email) :
  └── Waterfall complet classique (comportement identique a un lead non-referral)
```

**Economies estimees** : -0.4 a -1.4 credits/lead referral (skip Dropcontact + Hunter). Impact budgetaire negligeable (~1 EUR/mois) compte tenu du volume projete (25-50 referrals/mois).

### 11.2 Colonne `referral_info JSONB` ajoutee a la table `prospects`

```sql
-- Colonne pour stocker les informations referral sur le prospect enrichi
ALTER TABLE prospects ADD COLUMN referral_info JSONB DEFAULT NULL;
-- Contenu : { referral_id, referred_by_client_id, referral_code, priority_boost, source_type }

-- Index partiel pour filtrer les prospects referral
CREATE INDEX idx_prospects_referral ON prospects USING gin(referral_info) WHERE referral_info IS NOT NULL;
```

Le champ `referral_info` est optionnel et `NULL` pour tous les leads classiques (non-referral). Il est transmis tel quel dans la fiche `EnrichedProspect` vers l'Agent 3 (Scoreur) pour permettre le bonus de scoring referral.

La valeur `'referral'` est ajoutee comme nouvelle valeur possible pour la colonne `email_source` (VARCHAR, pas d'ENUM -- pas de modification de schema necessaire).

### 11.3 Confirmation : pas d'impact sur les flux sortants ni sur les 3 sous-agents pour les leads classiques

| Point | Statut |
|-------|--------|
| **Flux sortants** : l'Agent 2 continue d'envoyer **uniquement** vers `scoreur-pipeline` (Agent 3). Aucun flux vers Agent 8, 9 ou 10. | CONFIRME |
| **Sous-agent 2a (Contact)** : pour les leads classiques (sans `referral_info`), le waterfall est 100% identique. Le check referral est un branchement conditionnel en amont. | CONFIRME |
| **Sous-agent 2b (Entreprise)** : aucune modification. L'enrichissement entreprise (INSEE, Pappers, BODACC, Societe.com) est identique pour referrals et non-referrals. | CONFIRME |
| **Sous-agent 2c (Technique)** : aucune modification. Le scan technique ne depend pas de la source du lead. | CONFIRME |
| **Deduplication BDD** : memes criteres (SIRET, email, domaine). Pas d'impact. | CONFIRME |
| **RGPD** : meme base legale (interet legitime B2B). La mention de source "recommandation client" dans le premier email est geree par l'Agent 4 (Redacteur), pas par l'Agent 2. | CONFIRME |
| **Budget** : variation negligeable (~-1 EUR/mois). | CONFIRME |
| **SLA** : les referrals arrivent avec `pre_score >= 40` et `priority = 1`, traites comme leads Hot/Warm. SLA respectes naturellement. | CONFIRME |

### 11.4 Verification de coherence inter-agents

| Verification | Statut |
|-------------|--------|
| Input Agent 2 == Output Agent 1 (NormalizedLead v2 avec `referral_info` optionnel) | COMPATIBLE |
| Output Agent 2 == Input Agent 3 (EnrichedProspect v2 avec `referral_info` optionnel) | COMPATIBLE |
| Agent 2 --> Agent 8 (Dealmaker) : aucun flux | CONFIRME |
| Agent 2 --> Agent 9 (Appels d'offres) : aucun flux | CONFIRME |
| Agent 2 --> Agent 10 (CSM) : aucun flux | CONFIRME |
| Agent 8 --> Agent 2 : aucun flux | CONFIRME |
| Agent 9 --> Agent 2 : aucun flux | CONFIRME |
| Agent 10 --> Agent 2 : aucun flux (passe par Agent 1) | CONFIRME |
| Retro-compatibilite : champ `referral_info` optionnel, ignore si absent | CONFIRME |
| Schema EnrichedProspect v2 retro-compatible avec Agent 3 existant | CONFIRME |

---

## ANNEXE A : DIAGRAMME DE FLUX COMPLET

```
                   ┌──────────────────────┐
                   │    AGENT 1 VEILLEUR   │
                   │    (leads bruts)      │
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │ Queue BullMQ         │
                   │ 'enrichisseur-       │
                   │  pipeline'           │
                   │ Priority: 1/5/10     │
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │ MASTER ENRICHISSEUR   │
                   │ Pre-check:            │
                   │ - Deja enrichi ?      │
                   │ - Blacklist RGPD ?    │
                   │ - Entreprise fermee ? │
                   └──────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ 2a CONTACT │  │ 2b ENTREP. │  │ 2c TECH    │
     │            │  │            │  │            │
     │ Dropcontact│  │ INSEE      │  │ Wappalyzer │
     │    ↓       │  │    ↓       │  │    ↓       │
     │ Hunter     │  │ Pappers    │  │ Lighthouse │
     │    ↓       │  │    ↓       │  │    ↓       │
     │ Pattern    │  │ BODACC     │  │ axe-core   │
     │    ↓       │  │    ↓       │  │            │
     │ ZeroBounce │  │ Societe.com│  │            │
     │    ↓       │  │            │  │            │
     │ Kaspr (tel)│  │            │  │            │
     └──────┬─────┘  └──────┬─────┘  └──────┬─────┘
            │               │               │
            └───────────────┼───────────────┘
                            │
                            ▼
                   ┌──────────────────────┐
                   │ FUSION + DEDUP BDD    │
                   │ - Merger les 3 flux   │
                   │ - Chercher doublons   │
                   │ - Controle qualite    │
                   │ - Generer fiche       │
                   └──────────┬───────────┘
                              │
                   ┌──────────▼───────────┐
                   │ PERSISTANCE           │
                   │ - Table prospects     │
                   │ - Table RGPD          │
                   │ - Metriques           │
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │ Queue BullMQ         │
                   │ 'scoreur-pipeline'   │
                   │                      │
                   │    AGENT 3 SCOREUR   │
                   └──────────────────────┘
```

---

## ANNEXE B : SOURCES ET REFERENCES

### APIs officielles
- API INSEE Sirene : `https://api.insee.fr/api-sirene/3.11/`
- API Pappers : `https://api.pappers.fr/v2/`
- API Societe.com Pro : `https://api.societe.com/api/v1/`
- API BODACC OpenData : `https://opendata.datainfogreffe.fr/api/v1/console`
- Annuaire Entreprises : `https://annuaire-entreprises.data.gouv.fr/donnees/api-entreprises`

### APIs commerciales
- Dropcontact : `https://api.dropcontact.com/v1/` (39 EUR/mois Pro)
- Hunter.io : `https://api.hunter.io/v2/` (49 USD/mois Starter)
- ZeroBounce : `https://api.zerobounce.net/v2/` (16 USD/2000 verifs)
- Kaspr : API sur plan Business (79 EUR/mois)
- Wappalyzer : `https://api.wappalyzer.com/v2/` (~30 EUR/mois)

### Outils open source
- Lighthouse CLI : `https://github.com/GoogleChrome/lighthouse`
- axe-core : `https://github.com/dequelabs/axe-core`
- Playwright : `https://playwright.dev/`
- BullMQ : `https://bullmq.io/`

### RGPD et conformite
- CNIL Prospection commerciale : `https://www.cnil.fr/fr/la-prospection-commerciale`
- CNIL Prospection B2B par email : `https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique`
- CNIL Registre des traitements : `https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement`
- RGPD et prospection B2B : `https://www.leto.legal/guides/rgpd-et-prospection-btob-quelles-regles-respecter`
- Dropcontact conformite RGPD : `https://support.dropcontact.com/article/54-dropcontact-seule-solution-conforme-au-rgpd`

### Documentation technique
- Portail API INSEE : `https://portail-api.insee.fr/`
- Documentation Pappers : `https://www.pappers.fr/api/documentation`
- Hunter.io API docs : `https://hunter.io/api-documentation`
- ZeroBounce API docs : `https://www.zerobounce.net/docs/`
- Dropcontact API developer : `https://developer.dropcontact.com/`

---

## INTEGRATION AVEC LES AGENTS 8, 9, 10

### Agent 8 (DEALMAKER) : Aucun impact direct
L'Agent 2 n'envoie pas de donnees a l'Agent 8 et n'en recoit pas.

### Agent 9 (APPELS D'OFFRES) : Aucun impact direct
L'Agent 9 recoit ses donnees directement de l'Agent 1b, pas de l'Agent 2.

### Agent 10 (CSM) : Impact indirect via referrals
Les leads referral (Agent 10 → Agent 1 → Agent 2) arrivent avec un email souvent deja fourni par le referrer. Optimisation : skip du waterfall Dropcontact/Hunter et verification ZeroBounce directe. Fallback au waterfall complet si email invalide.

### Modification schema : colonne referral_info
La table `prospects` inclut une colonne `referral_info JSONB` pour stocker les donnees de referral (referral_id, client_id, code).
