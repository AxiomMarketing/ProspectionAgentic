# Agent 4 — RÉDACTEUR (Master)

## Vue d'Ensemble

L'Agent 4 (RÉDACTEUR) est le générateur de contenu personnalisé du pipeline Axiom Marketing. Il reçoit chaque fiche prospect scorée de l'Agent 3 (SCOREUR) et produit des messages de prospection personnalisés prêts à envoyer : un email froid et un message LinkedIn, tous deux rédigés par Claude API (claude-sonnet-4-20250514) en tenant compte du signal détecté, du segment, du canal prioritaire et du niveau d'urgence. Les messages HOT passent en validation humaine obligatoire auprès de Jonathan avant envoi. Le Rédacteur dispatche ensuite vers l'Agent 5 (SUIVEUR) qui se charge de l'envoi effectif.

## Sous-Agents

| ID | Nom | Rôle | Fréquence | API Principale |
|----|-----|------|-----------|----------------|
| 4a | Rédacteur Email | Génère l'email froid personnalisé (50-125 mots, plain text, hook + valeur + CTA) via Claude API | Événementiel (BullMQ) | Claude API (claude-sonnet-4-20250514) |
| 4b | Rédacteur LinkedIn | Génère la note de connexion (< 300 chars) et le message post-connexion (< 500 chars) via Claude API | Événementiel (BullMQ) | Claude API |
| 4c | Calculateur d'Impact | Calcule les chiffres d'impact personnalisés (perte de CA mensuelle, taux de bounce estimé, impact conversion) à injecter dans les messages | Événementiel (synchrone avant 4a/4b) | Aucune API externe (calcul local) |

## Input / Output

### Input (depuis Agent 3 — SCOREUR)

Reçu via queue BullMQ `redacteur-pipeline` :

```json
{
  "prospect_id": "uuid-v4",
  "scored_at": "2026-03-18T09:16:00Z",
  "score": {
    "total": 82,
    "categorie": "HOT",
    "sous_categorie": "HOT_B",
    "segment_primaire": "pme_metro",
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
    "segment": "pme_metro",
    "effectif_exact": 45,
    "chiffre_affaires": 2500000,
    "secteur_label": "Programmation informatique",
    "site_web": "https://techstart.fr"
  },
  "contact": {
    "prenom": "Marie",
    "nom": "Dupont",
    "email": "marie.dupont@techstart.fr",
    "email_verified": true,
    "poste": "CMO",
    "anciennete_poste_mois": 1
  },
  "technique": {
    "lighthouse": { "performance": 62, "accessibility": 85 },
    "core_web_vitals": { "lcp": 3.2, "cls": 0.15 },
    "temps_chargement_s": 3.2,
    "technologies": ["WordPress", "PHP 7.4"],
    "cms": "WordPress"
  },
  "signaux": [
    { "type": "changement_poste", "description": "Marie Dupont nommée CMO", "date": "2026-02-25" },
    { "type": "recrutement_dev_web", "description": "Recrutement dev React", "date": "2026-03-15" }
  ],
  "signal_principal": "Nouveau CMO + recrutement dev = besoin digital probable"
}
```

### Output (vers Agent 5 — SUIVEUR)

Transmis via queue BullMQ `suiveur-pipeline` :

```typescript
interface SuiveurInput {
  message_id: string           // UUID v4 unique du message
  prospect_id: string
  lead_id: string
  generated_at: string

  message: {
    canal: 'email' | 'linkedin_connection' | 'linkedin_message' | 'linkedin_inmail'
    type: string               // 'email_froid', 'follow_up_1', etc.
    subject_line: string | null
    body: string               // Corps du message (plain text)
    cta: string
    signature: string
    format: 'plain_text'
    word_count: number
    language: 'fr'
  }

  linkedin_message: {
    connection_note: { content: string; character_count: number }
    post_connection_message: { content: string; character_count: number }
  } | null

  prospect: { prenom: string; nom: string; email: string; email_verified: boolean; linkedin_url: string | null; poste: string; entreprise_nom: string }

  sequence: {
    sequence_id: string; etape_actuelle: number; etape_total: number;
    etape_type: string; prochaine_etape_dans_jours: number; espacement_jours: number[]
  }

  template: { template_id: string; template_version: string; template_status: 'control' | 'challenger'; ab_test_id: string | null }

  scoring: { score_total: number; categorie: 'HOT' | 'WARM' | 'COLD'; segment: string; signal_principal: string }

  validation: {
    statut: 'approved' | 'approved_with_edit'
    validated_by: 'jonathan' | 'auto'
    validated_at: string
    quality_checks: { longueur: 'PASS'|'FAIL'; spam_words: 'PASS'|'FAIL'; ton: 'PASS'|'FAIL'; hallucination: 'PASS'|'FAIL'; personnalisation: 'PASS'|'FAIL' }
  }

  routing: { canal_principal: string; urgence: 'haute'|'moyenne'|'basse'; sla_heures: number; domaine_envoi_suggere: string }

  impact_data: { perte_ca_mensuelle: number; perte_ca_annuelle: number; taux_bounce_estime: number; impact_conversion_pct: number; message_impact: string }

  metadata: { agent: 'agent_4_redacteur'; generation_model: string; generation_cost_usd: number; generation_latency_ms: number }
}
```

## Workflow

**Étape 1 — Réception et validation de l'input**
- Validation Zod : tous les champs requis (prospect_id, scoring, routing, entreprise.nom, contact.prenom)
- Vérification que le prospect n'est pas opt-out (table `rgpd_oppositions`)

**Étape 2 — Calcul d'impact (sous-agent 4c)**
Calcul synchrone (pas d'API) basé sur les données techniques :
- `perte_ca_mensuelle` : `ca_mensuel × taux_conversion × impact_perf_score`
  - Exemple : site LCP > 3s = -10% conversion, CA mensuel 208k EUR → perte ~20 800 EUR/mois
- `taux_bounce_estime` : corrélation score Lighthouse ↔ bounce rate (score 62 → bounce estimé 55%)
- `message_impact` : phrase injectable dans le message, ex: "votre site charge en 3.2s — soit 2x plus lent que la moyenne de votre secteur"

**Étape 3 — Sélection du template**
- Clé de sélection : `segment × canal × etape_sequence`
- Bibliothèque de templates en base de données (table `templates`)
- A/B testing : 50% du trafic reçoit `template_status: 'challenger'`

**Étape 4 — Génération email (sous-agent 4a) via Claude API**

Principes de rédaction non-négociables :
| Principe | Règle |
|----------|-------|
| Longueur | 50-125 mots, 3-5 phrases |
| Structure | Hook signal → Valeur chiffrée → CTA question |
| Ton | Peer-to-peer, conversationnel, PAS marketing |
| Format | Plain text UNIQUEMENT (pas de HTML) |
| CTA | Question douce ("Worth exploring?" pas "Book a call NOW!") |
| Personnalisation | Signal-based, chiffrée, spécifique |
| Langue | Français (vouvoiement par défaut, tutoiement pour startups) |
| Spam words | 800+ mots interdits en liste noire |

Exemple de prompt system pour 4a (segment pme_metro, signal changement_poste) :
```
Tu es un expert en prospection B2B pour Axiom Marketing. Rédige un email froid
de 50-125 mots maximum, en plain text, sans HTML, sans listes à puces.
Structure : 1 phrase hook sur le signal (nouveau CMO chez {entreprise}),
1-2 phrases sur la valeur chiffrée ({impact_data.message_impact}),
1 phrase CTA question douce. Ton peer-to-peer, pas marketeux.
```

**Étape 5 — Génération LinkedIn (sous-agent 4b) via Claude API**

- Note de connexion : 300 caractères max, pas de pitch, juste la raison de connexion (le signal)
- Message post-connexion : 500 caractères max, même structure que l'email mais plus détendue

**Étape 6 — Contrôle qualité automatique**

Vérifications sur chaque message généré :
- `longueur` : email 50-125 mots, LinkedIn note < 300 chars, message < 500 chars
- `spam_words` : scan liste noire 800+ mots (gratuit, exclu, offre spéciale, etc.)
- `ton` : détection de mots trop agressifs ou trop marketeux via regex patterns
- `hallucination` : vérifier que les chiffres injectés (impact_data) correspondent aux données réelles du prospect
- `personnalisation` : au moins 1 élément spécifique à l'entreprise/contact (nom, signal, chiffre)

Si un contrôle FAIL : régénérer (max 2 tentatives). Si toujours FAIL après 2 tentatives : utiliser template statique de fallback.

**Étape 7 — Validation humaine (pour HOT)**
- Si `routing.validation_jonathan = true` : envoyer notification Slack interactive à Jonathan
- Si `routing.validation_bloquante = true` : mettre le message en queue `pending_validation` et attendre
- Jonathan peut : approuver, modifier + approuver, ou rejeter
- SLA : si pas de réponse dans `routing.sla_heures`, escalade puis auto-approve avec log

**Étape 8 — Dispatch vers Agent 5**
- Envoyer dans BullMQ `suiveur-pipeline` avec priorité selon urgence
- Logger dans table `messages_generes`

## APIs & Coûts

| API | Coût/mois | Crédits | Rate Limit |
|-----|-----------|---------|------------|
| Claude API (claude-sonnet-4-20250514) | ~12 EUR | Pay-per-use | 50 req/min (Tier 1), 1000/min (Tier 3) |
| Slack API (notifications validation Jonathan) | 0 EUR | Inclus workspace | Variable |

**Coût Claude API estimé :**
- ~500 prospects/mois × 2 messages (email + LinkedIn) × ~0,01 USD/message = ~10 USD = ~9 EUR
- Total arrondi : ~12 EUR/mois

## Base de Données

### Tables Principales

```sql
-- Templates de messages
CREATE TABLE templates (
  id                  SERIAL PRIMARY KEY,
  template_id         VARCHAR(50) NOT NULL UNIQUE, -- ex: 'TPL-HOT-001'
  version             VARCHAR(10) NOT NULL DEFAULT '1.0',
  status              VARCHAR(20) DEFAULT 'active', -- 'active'|'inactive'|'control'|'challenger'
  canal               VARCHAR(30) NOT NULL, -- 'email'|'linkedin_connection'|'linkedin_message'
  segment             VARCHAR(30),
  categorie_cible     VARCHAR(10), -- 'HOT'|'WARM'|'COLD'
  etape               INTEGER DEFAULT 1, -- 1=premier contact, 2=follow-up, etc.
  ab_test_id          VARCHAR(50),
  subject_template    TEXT,
  body_template       TEXT NOT NULL,
  cta_template        TEXT,
  spam_score_max      INTEGER DEFAULT 2, -- Score spam accepté (0-10)
  mot_cles_requis     TEXT[], -- Champs de personnalisation obligatoires
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- Messages générés
CREATE TABLE messages_generes (
  id                  SERIAL PRIMARY KEY,
  message_id          UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  prospect_id         UUID REFERENCES prospects(prospect_id),
  template_id         VARCHAR(50) REFERENCES templates(template_id),
  canal               VARCHAR(30),
  subject_line        VARCHAR(200),
  body                TEXT NOT NULL,
  word_count          INTEGER,
  quality_checks      JSONB, -- résultats des 5 contrôles
  validation_statut   VARCHAR(30) DEFAULT 'pending', -- 'pending'|'approved'|'approved_with_edit'|'rejected'
  validated_by        VARCHAR(20), -- 'jonathan'|'auto'
  validated_at        TIMESTAMP,
  generation_model    VARCHAR(50),
  generation_cost_usd DECIMAL,
  generation_latency_ms INTEGER,
  impact_data         JSONB,
  ab_variant          VARCHAR(2), -- 'A'|'B'
  created_at          TIMESTAMP DEFAULT NOW()
);

-- A/B tests
CREATE TABLE ab_tests (
  id                  SERIAL PRIMARY KEY,
  ab_test_id          VARCHAR(50) NOT NULL UNIQUE,
  template_control    VARCHAR(50) REFERENCES templates(template_id),
  template_challenger VARCHAR(50) REFERENCES templates(template_id),
  status              VARCHAR(20) DEFAULT 'running', -- 'running'|'completed'|'paused'
  winner              VARCHAR(50), -- template_id du gagnant
  started_at          TIMESTAMP DEFAULT NOW(),
  ended_at            TIMESTAMP
);
```

## Scheduling

| Cron | Action | Description |
|------|--------|-------------|
| Événementiel (BullMQ) | `generateMessages(fiche)` | Déclenché par chaque job dans `redacteur-pipeline` |
| Retry | 3 tentatives | Backoff exponentiel 2s, 4s, 8s |
| Fallback template | Si Claude API échoue 3x | Template statique sans personnalisation Claude |
| Concurrency | 5 génération en parallèle | Rate limité par Claude API tier |

## Error Handling

| Erreur | Action | Fallback |
|--------|--------|----------|
| Claude API timeout (> 10s) | Retry 2x, puis fallback template | Log `generation_method: 'static_fallback'` |
| Claude API 429 rate limit | Backoff exponentiel, retry | File d'attente BullMQ avec délai |
| Contrôle qualité FAIL après 2 tentatives | Utiliser template statique | Log `quality_fallback: true` |
| Hallucination détectée (chiffre inventé) | Régénérer sans les données techniques | Si persiste : template sans chiffres |
| `validation_jonathan` mais pas de réponse dans le SLA | Escalade Slack, puis auto-approve | Log `auto_approved_sla_timeout: true` |
| Prospect opt-out entre score et génération | Annuler le job, archiver | Log `cancelled_rgpd_optin` |
| Template non trouvé pour la combinaison segment × canal × étape | Utiliser template générique du segment | Log `template_fallback_generic` |

## KPIs & Métriques

| KPI | Cible | Fréquence |
|-----|-------|-----------|
| Coût par message généré | < 0,02 USD | Quotidien |
| Taux de contrôle qualité PASS (all 5 checks) | >= 95% | Quotidien |
| Temps de génération moyen (Claude API) | 2-5s | Quotidien |
| Taux de fallback template statique | < 5% | Hebdomadaire |
| Templates actifs en A/B test | 1-2 | Hebdomadaire |
| Délai validation Jonathan (HOT) | < 30 min | Quotidien |

## Edge Cases

- **Prospect sans données techniques** : Le calculateur d'impact 4c utilise des benchmarks sectoriels à la place des données Lighthouse réelles ; le message ne mentionne pas de chiffres Lighthouse spécifiques
- **Contact sans ancienneté de poste connue** : Le hook "nouveau CMO" est supprimé ; on utilise le signal de recrutement comme accroche principale
- **Email personnel détecté (@gmail)** : Le canal principal passe à LinkedIn même si l'email est disponible
- **Segment `startup` + vouvoiement** : Forcer le tutoiement (règle de ton pour les startups)
- **A/B test** : Chaque prospect reçoit aléatoirement la variante A ou B ; le split est loggué pour permettre l'analyse statistique par l'Agent 7
- **Séquence multi-touchpoints** : L'Agent 4 génère TOUS les messages de la séquence en une seule passe (ex: 4 emails pour SEQ_HOT_B_PRIORITY), pas un à la fois — les messages suivants sont mis en queue avec les délais appropriés

## Budget

| Poste | Coût/mois |
|-------|-----------|
| Claude API (generation messages) | ~12 EUR |
| Slack API (notifications) | 0 EUR |
| Infrastructure (incluse agents précédents) | 0 EUR |
| **Total** | **~12 EUR/mois** |

## Référence Spec

`.claude/source-ia/agent/AGENT-4-MASTER.md`
Sous-agents détaillés : `AGENT-4a-EMAIL.md`, `AGENT-4b-LINKEDIN.md`, `AGENT-4c-IMPACT.md`
