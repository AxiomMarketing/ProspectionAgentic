# Agent 5 — SUIVEUR (Master)

## Vue d'Ensemble

L'Agent 5 (SUIVEUR) est le moteur d'exécution du pipeline de prospection Axiom Marketing. Il reçoit les messages prêts à envoyer de l'Agent 4 (RÉDACTEUR) et les envoie au bon moment, sur le bon canal, au bon prospect via Gmail API/Mailgun (email) et Waalaxy (LinkedIn). Il détecte et classifie les réponses en 8 catégories via Claude API, orchestre les séquences multicanales (espacement, arrêt si réponse, widening gap), notifie Jonathan sur Slack pour les réponses intéressantes, et gère le domain warming. Les prospects sans conversion après leur séquence complète sont transmis à l'Agent 6 (NURTUREUR). Coût total : ~150 EUR/mois.

## Sous-Agents

| ID | Nom | Rôle | Fréquence | API Principale |
|----|-----|------|-----------|----------------|
| 5a | Envoyeur Email | Envoie les emails via Gmail API ou Mailgun, gère les bounces, tracking opens/clicks, domain warming | Événementiel (BullMQ) | Gmail API + Mailgun |
| 5b | Envoyeur LinkedIn | Envoie connexions + messages via Waalaxy, détecte les acceptations de connexion | Événementiel (BullMQ) | Waalaxy API |
| 5c | Détecteur de Réponses | Détecte les réponses email (Gmail Watch + IMAP fallback) et LinkedIn (Waalaxy webhooks), classifie via Claude API en 8 catégories | Continu (webhook + polling 30s) | Claude API + Gmail API + Waalaxy |
| 5d | Orchestrateur de Séquences | Planifie les étapes suivantes, gère les délais, les conditions d'arrêt, et les transitions vers Agent 6/8 | Événementiel + cron | BullMQ + PostgreSQL |

## Input / Output

### Input (depuis Agent 4 — RÉDACTEUR)

Reçu via queue BullMQ `suiveur-pipeline` — objet `SuiveurInput` complet (voir section Output Agent 4 pour le schéma exhaustif). Champs critiques :
- `message.canal` : détermine le sous-agent à activer (5a pour email, 5b pour LinkedIn)
- `validation.statut` : doit être `'approved'` ou `'approved_with_edit'` — rejeté sinon
- `sequence.sequence_id` : identifie la séquence de suivi
- `routing.sla_heures` : délai max avant envoi
- `prospect.email` (requis si canal=email), `prospect.linkedin_url` (requis si canal=linkedin)

### Output (vers Agent 6 — NURTUREUR)

Transmis via queue BullMQ `nurturer-pipeline` quand une séquence se termine sans conversion :

```typescript
interface NurturerInput {
  prospect_id: string
  lead_id: string
  handoff_reason: 'SEQUENCE_COMPLETED_NO_REPLY' | 'PAS_MAINTENANT' | 'INTERESTED_SOFT_NO_FOLLOWUP'
  sequence_summary: {
    sequence_id: string; steps_completed: number; total_steps: number;
    emails_sent: number; linkedin_actions: number; duration_days: number;
    replies: Array<{ category: string; date: string }>
  }
  nurturing_recommendations: {
    resume_date: string | null; suggested_content_type: string;
    last_signal: string; engagement_score: number
  }
  prospect: { prenom: string; nom: string; email: string; entreprise_nom: string; poste: string; segment: string; scoring_categorie: string }
  metadata: { agent: 'agent_5_suiveur'; handoff_at: string; suiveur_version: string }
}
```

## Workflow

**Étape 1 — Réception et validation**
- Validation du `SuiveurInput` : champs obligatoires, validation statut, non-opt-out du prospect
- Vérification idempotence : `message_id` déjà envoyé → skip (déduplication)
- Vérification statut prospect : `SUPPRESSED` / `OPTED_OUT` / `EXCLUDED` → skip

**Étape 2 — Routage vers le bon sous-agent**
```typescript
switch (canal) {
  case 'email': → SubAgent5a_EnvoyeurEmail
  case 'linkedin_connection':
  case 'linkedin_message':
  case 'linkedin_inmail': → SubAgent5b_EnvoyeurLinkedIn
}
```

**Étape 3 (5a) — Envoi email**
- Vérification horaire optimal (08h-10h ou 12h-14h, jours ouvrés)
- Sélection du domaine d'envoi selon la rotation (domain warming)
- Envoi via Gmail API (compte dédié `jonathan@axiom-marketing.io`) ou Mailgun pour volume
- Tracking headers : `Message-ID`, `List-Unsubscribe`, pixels de tracking Plausible
- Bounce handling : hard bounce → `SUPPRESSED` immédiat ; soft bounce → retry 3x sur 48h

**Étape 3 (5b) — Envoi LinkedIn**
- Connexion via Waalaxy (compte LinkedIn Axiom)
- Note de connexion : max 300 caractères, envoi avec délai humain simulé (3-15s)
- Après acceptation connexion → déclencher l'envoi du post-connection message (webhook Waalaxy)

**Étape 4 (5c) — Détection des réponses (continu)**

Méthode principale — Gmail API Watch (latence < 1s) :
```
1. Setup Gmail Watch via PubSub topic → renouveler tous les 6 jours
2. Notification PubSub → récupérer historique depuis lastHistoryId
3. Matcher le message entrant avec un email envoyé via :
   - In-Reply-To header (méthode 1, la plus fiable)
   - References header (méthode 2)
   - Adresse email expéditeur + `email_sends` récents (méthode 3, fallback)
4. Extraire le corps du message (text/plain prioritaire, HTML en fallback)
```

Méthode fallback — IMAP polling (toutes les 30s) :
- Connexion IMAP Gmail TLS port 993
- Search `UNSEEN` → traiter les nouveaux messages
- Même logique de matching que Gmail Watch

Détection réponses LinkedIn — Waalaxy webhooks :
- `message_received` → classifier le contenu
- `connection_accepted` → déclencher post-connection message + logguer
- `connection_rejected` → marquer prospect + passer à l'étape suivante de la séquence

**Étape 5 (5c) — Classification IA via Claude API**

Les 8 catégories de réponse (système de classification exhaustif) :

| Catégorie | Signification | Exemples | Action |
|-----------|--------------|----------|--------|
| `INTERESSE` | Intérêt clair pour un échange (call, meeting, demo) | "Oui, on peut en discuter", "Quand êtes-vous disponible ?" | Notifier Jonathan IMMÉDIATEMENT, arrêter la séquence |
| `INTERESSE_SOFT` | Intérêt mais demande plus d'info avant de s'engager | "Pouvez-vous m'en dire plus ?", "Envoyez-moi une présentation" | Notifier Jonathan sous 1h, préparer info sup |
| `PAS_MAINTENANT` | Potentiellement intéressé mais pas au bon moment | "Recontactez-moi en septembre", "Budget bouclé pour cette année" | Reporter séquence de 30 jours (ou date spécifique) |
| `PAS_INTERESSE` | Déclin clair, sans agressivité | "Pas notre priorité", "On a déjà un prestataire" | Arrêter séquence, archiver, pas de recontact |
| `MAUVAISE_PERSONNE` | Indique une autre personne plus adaptée | "Contactez Marie du marketing", "Voyez avec le nouveau CTO" | Créer nouveau lead pour la personne référée |
| `DEMANDE_INFO` | Question spécifique sans intérêt/désintérêt clair | "Quels sont vos tarifs ?", "Vous avez des références ?" | Répondre à la question, follow-up dans 3 jours |
| `OUT_OF_OFFICE` | Réponse automatique d'absence | "Je suis absent jusqu'au 25 mars" | Pauser séquence, reprendre 2j après date retour |
| `SPAM` | Message non pertinent, pub tierce, notification système | Offre commerciale non sollicitée, newsletter | Ignorer, archiver |

Format de sortie de la classification :
```json
{
  "category": "INTERESSE",
  "confidence": 0.95,
  "sentiment": "positif",
  "action_suggeree": "Notifier Jonathan immédiatement via Slack",
  "date_retour_ooo": null,
  "personne_referree": { "nom": null, "email": null, "poste": null },
  "phrase_cle": "Oui, ça m'intéresse, quand seriez-vous disponible ?",
  "raisonnement": "Le prospect exprime un intérêt clair et demande un créneau"
}
```

**Étape 6 — Actions selon la classification**
- `INTERESSE` / `INTERESSE_SOFT` : notification Slack Jonathan avec bouton "Répondre" + infos prospect ; transmission vers Agent 8 (DEALMAKER) après RDV
- `PAS_MAINTENANT` : transmettre à Agent 6 avec `handoff_reason: 'PAS_MAINTENANT'`
- `MAUVAISE_PERSONNE` : créer nouveau lead, relancer le pipeline depuis l'Agent 1
- `OUT_OF_OFFICE` : planifier reprise automatique via BullMQ delayed job
- Fin de séquence sans réponse : transmettre à Agent 6 avec `handoff_reason: 'SEQUENCE_COMPLETED_NO_REPLY'`

**Séquences multicanales définies :**

*SEQ_HOT_PME_METRO (10 jours, 6 étapes) :*
| Étape | Jour | Canal | Action |
|-------|------|-------|--------|
| 1 | J+0 | linkedin_visit | Visite profil (notification douce) |
| 2 | J+0 | email | Email personnalisé premier contact avec impact data |
| 3 | J+1 | linkedin_connection | Demande connexion avec note personnalisée |
| 4 | J+3 | email | Follow-up angle social proof |
| 5 | J+5 | linkedin_message | Message LinkedIn si connecté, sinon skip |
| 6 | J+10 | email | Breakup email — porte ouverte, ton léger |

*SEQ_HOT_STARTUP_TECH (14 jours, 6 étapes) — LinkedIn-first :*
| Étape | Jour | Canal | Action |
|-------|------|-------|--------|
| 1 | J+0 | linkedin_like | Liker un post récent du prospect |
| 2 | J+1 | linkedin_connection | Note tech/startup friendly |
| 3 | J+3 | email | Email direct si connexion refusée |
| 4 | J+7 | linkedin_message | Message LinkedIn si connecté |
| 5 | J+10 | email | Follow-up avec cas d'usage |
| 6 | J+14 | email | Breakup email |

*SEQ_WARM_SERVICES_B2B (28 jours, 7 étapes)* et *SEQ_COLD_GRANDS_COMPTES (45 jours, 8 étapes)* disponibles dans `AGENT-5d-SEQUENCES.md`.

## APIs & Coûts

| API | Coût/mois | Crédits | Rate Limit |
|-----|-----------|---------|------------|
| Gmail API (envoi email, tracking) | 0 EUR | Inclus Google Workspace | 1B unités quota/jour |
| Mailgun (volume supplémentaire) | ~20-40 EUR | 50 000 emails | 100 req/s |
| Waalaxy (LinkedIn automation) | ~80 EUR | 800 actions/mois | 200 connexions/jour |
| Claude API (classification réponses) | ~15-20 EUR | ~1 500 classifications/mois | 50 req/min |
| Google Cloud PubSub (Gmail Watch) | ~0-5 EUR | Faible volume | N/A |

**Total Agent 5 : ~150 EUR/mois**

## Base de Données

### Tables Principales

```sql
-- Emails envoyés
CREATE TABLE email_sends (
  id                  SERIAL PRIMARY KEY,
  message_id          UUID NOT NULL UNIQUE,
  prospect_id         UUID REFERENCES prospects(prospect_id),
  sequence_id         VARCHAR(50),
  etape_numero        INTEGER,
  canal               VARCHAR(30),
  domaine_envoi       VARCHAR(100),
  subject_line        VARCHAR(200),
  body_preview        VARCHAR(500),
  gmail_message_id    VARCHAR(255),
  idempotency_key     VARCHAR(255),
  status              VARCHAR(20) DEFAULT 'PENDING', -- 'SENT'|'BOUNCED'|'FAILED'
  opened_at           TIMESTAMP,
  clicked_at          TIMESTAMP,
  sent_at             TIMESTAMP,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Classifications de réponses
CREATE TABLE reply_classifications (
  id                  SERIAL PRIMARY KEY,
  reply_id            VARCHAR(255) UNIQUE,
  prospect_id         UUID REFERENCES prospects(prospect_id),
  sequence_id         VARCHAR(50),
  etape_repondue      INTEGER,
  canal               VARCHAR(20) DEFAULT 'email',
  category            VARCHAR(30) NOT NULL,
  confidence          DECIMAL,
  sentiment           VARCHAR(20),
  action_suggeree     TEXT,
  phrase_cle          TEXT,
  raisonnement        TEXT,
  personne_referree   JSONB,
  date_retour_ooo     DATE,
  email_body_preview  VARCHAR(500),
  classified_at       TIMESTAMP DEFAULT NOW()
);

-- Séquences prospects
CREATE TABLE prospect_sequences (
  id                  SERIAL PRIMARY KEY,
  prospect_id         UUID REFERENCES prospects(prospect_id),
  sequence_id         VARCHAR(50),
  sequence_status     VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE'|'COMPLETED'|'STOPPED'|'PAUSED'
  current_step        INTEGER DEFAULT 0,
  total_steps         INTEGER,
  started_at          TIMESTAMP DEFAULT NOW(),
  last_action_at      TIMESTAMP,
  stop_reason         VARCHAR(50)
);

-- Actions LinkedIn
CREATE TABLE linkedin_actions (
  id                  SERIAL PRIMARY KEY,
  prospect_id         UUID REFERENCES prospects(prospect_id),
  action_type         VARCHAR(30), -- 'connection_sent'|'message_sent'|'visit'|'like'
  result              VARCHAR(20), -- 'sent'|'accepted'|'rejected'|'pending'
  campaign_id         VARCHAR(100),
  content_preview     VARCHAR(300),
  sent_at             TIMESTAMP DEFAULT NOW()
);

-- Bounces email
CREATE TABLE bounce_events (
  id                  SERIAL PRIMARY KEY,
  prospect_id         UUID,
  email               VARCHAR(255),
  bounce_type         VARCHAR(20), -- 'hard'|'soft'
  domaine             VARCHAR(100),
  reason              VARCHAR(200),
  bounced_at          TIMESTAMP DEFAULT NOW()
);

-- Notifications Jonathan
CREATE TABLE notifications (
  id                  SERIAL PRIMARY KEY,
  type                VARCHAR(50), -- 'INTERESSE'|'INTERESSE_SOFT'|'BOUNCE_ALERT'|'SLA_BREACH'
  priority            VARCHAR(10), -- 'urgent'|'high'|'normal'
  prospect_id         UUID,
  message             TEXT,
  sla_deadline        TIMESTAMP,
  read_at             TIMESTAMP,
  escalated           BOOLEAN DEFAULT false,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Vue métriques envoi quotidien
CREATE VIEW v_metrics_envoi_daily AS
SELECT DATE(sent_at) as date, canal, domaine_envoi, COUNT(*) as total_envoyes,
  COUNT(*) FILTER (WHERE status='BOUNCED') as bounces,
  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opens
FROM email_sends GROUP BY 1,2,3;
```

## Scheduling

| Cron | Action | Description |
|------|--------|-------------|
| Événementiel (BullMQ) | `routeToSubAgent(input)` | Déclenché par chaque job dans `suiveur-pipeline` |
| Continu | Gmail Watch Pub/Sub handler | Détection réponses email en temps réel |
| `*/30 * * * * *` | IMAP polling (fallback) | Détection réponses si Gmail Watch indisponible |
| `0 */6 * * *` | renewGmailWatch() | Renouvellement du Gmail Watch (expire tous les 7j) |
| `0 8,10,12,14 * * 1-5` | optimiseHoraire() | Envois groupés aux heures optimales (jours ouvrés) |

## Error Handling

| Erreur | Action | Fallback |
|--------|--------|----------|
| Gmail API 403 / quota dépassé | Basculer sur Mailgun | Log + alerte Slack |
| Hard bounce détecté | Marquer `SUPPRESSED` immédiatement | Aucun autre envoi à cet email |
| Waalaxy rate limit | Espacer les actions de 5-15 min | Continuer le lendemain |
| Claude API timeout (classification) | Retry 2x, puis classification manuelle | Tag `classification_failed`, alerte Jonathan |
| Gmail Watch expiré non renouvelé | IMAP polling prend le relais | Alerte Slack + renouvellement d'urgence |
| Message déjà envoyé (idempotence) | Skip sans erreur | Log `duplicate_skip` |
| Prospect opt-out entre génération et envoi | Annuler l'envoi | Log `cancelled_optin`, déclencher suppression RGPD |
| Waalaxy connexion LinkedIn expirée | Suspendre 5b, alerter Jonathan | Les emails continuent, LinkedIn en pause |

## KPIs & Métriques

| KPI | Cible Phase 1 | Fréquence |
|-----|---------------|-----------|
| Taux de réponse (reply rate) | >= 5% | Quotidien |
| Taux de réponse positive (INTERESSE + INTERESSE_SOFT) | >= 2% | Quotidien |
| Taux de bounce | < 2% | Quotidien |
| Taux d'opt-out | < 0,5% | Hebdomadaire |
| Taux d'acceptation LinkedIn | >= 25% | Quotidien |
| SLA compliance (notifications Jonathan) | > 90% | Quotidien |
| Précision classification réponses | >= 90% | Hebdomadaire |

## Edge Cases

- **Réponse simultanée email + LinkedIn** : Le premier message reçu déclenche la classification et arrête la séquence ; le doublon LinkedIn est ignoré
- **OUT_OF_OFFICE avec date de retour dans le passé** : Traiter comme une réponse normale (peut-être une réponse tardive), classifier à nouveau
- **MAUVAISE_PERSONNE sans coordonnées de la personne référée** : Créer un lead partiel (nom seulement) et passer en enrichissement manuel avec flag
- **Séquence LinkedIn sans profil LinkedIn** : Skiper toutes les étapes LinkedIn, envoyer uniquement les étapes email de la séquence
- **Email ouvert mais pas de réponse après l'étape 2** : L'Agent 5 continue la séquence normalement — l'ouverture augmente l'Axe 4 (engagement) pour le prochain re-score
- **Connexion LinkedIn acceptée à l'étape 5 (trop tard)** : Le post-connection message est quand même envoyé, mais la séquence peut être en fin de vie — vérifier le statut avant envoi
- **Domaine d'envoi blacklisté** : Rotation automatique vers un autre domaine ; si tous les domaines sont touchés, alerte Jonathan et pause de l'envoi

## Budget

| Poste | Coût/mois |
|-------|-----------|
| Gmail API (inclus Google Workspace) | 0 EUR |
| Mailgun (emails overflow) | ~30 EUR |
| Waalaxy (LinkedIn automation) | ~80 EUR |
| Claude API (classifications) | ~20 EUR |
| Google Cloud PubSub | ~5 EUR |
| Infrastructure (incluse) | ~15 EUR |
| **Total** | **~150 EUR/mois** |

## Référence Spec

`.claude/source-ia/agent/AGENT-5-MASTER.md`
Sous-agents détaillés : `AGENT-5a-EMAIL.md`, `AGENT-5b-LINKEDIN.md`, `AGENT-5c-REPONSES.md`, `AGENT-5d-SEQUENCES.md`
