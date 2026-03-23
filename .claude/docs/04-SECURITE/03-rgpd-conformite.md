# Conformité RGPD — Axiom Prospection

> **Statut** : Document juridique et technique — mise à jour obligatoire à chaque changement de traitement
> **Dernière révision** : 2026-03-23
> **Référent RGPD** : DPO / Responsable juridique
> **Classification** : CONFIDENTIEL

---

## Avertissement légal

Ce document est un guide technique de mise en conformité. Il ne constitue pas un avis juridique. Consultez un avocat spécialisé RGPD pour toute décision d'importance. La CNIL peut infliger des amendes jusqu'à **4% du CA mondial ou 20M EUR** (le plus élevé des deux).

---

## Sommaire

1. [Base légale des traitements](#base-legale)
2. [Catégories de données traitées](#categories-donnees)
3. [Chiffrement des données](#chiffrement)
4. [Pseudonymisation pour l'analytique](#pseudonymisation)
5. [Droit à l'effacement — procédure technique](#effacement)
6. [Politique de rétention des données](#retention)
7. [Blacklist anti-recontact](#blacklist)
8. [Notification de violation de données](#violation)
9. [Privacy by Design](#privacy-by-design)
10. [Précédent CNIL KASPR — leçons à retenir](#kaspr)
11. [Registre des traitements (Article 30)](#registre)

---

## 1. Base légale des traitements {#base-legale}

### Prospection B2B : Intérêt Légitime (Article 6(1)(f) RGPD)

La base légale principale d'Axiom est l'**intérêt légitime** de l'entreprise cliente pour la prospection commerciale B2B.

**Conditions de validité de l'intérêt légitime (test en 3 étapes)**

```
ÉTAPE 1 — Identifier l'intérêt légitime
"Développer des relations commerciales avec des entreprises susceptibles
d'être intéressées par nos services."

✓ Intérêt clairement identifié et documenté
✓ Activité légale (pas contraire à l'ordre public)
✓ Réel et non fictif

ÉTAPE 2 — Nécessité du traitement
"Le traitement des données de contact professionnelles (email pro, téléphone
pro, titre, entreprise) est strictement nécessaire pour la prospection B2B."

✓ Le traitement est limité aux données nécessaires (minimisation)
✓ Pas de données sensibles (Art. 9) traitées
✓ Données professionnelles, pas personnelles (email pro ≠ email perso)

ÉTAPE 3 — Mise en balance des intérêts
"Les intérêts de la personne concernée ne prévalent pas sur l'intérêt
légitime dû à :"
- Il s'agit de données professionnelles (rôle dans l'entreprise)
- La relation est dans un contexte B2B (attente raisonnable de sollicitation)
- Des mesures de protection sont en place (opt-out facilité, données minimales)
- La personne peut s'opposer facilement (lien de désinscription systématique)
```

**IMPORTANT — Limites de l'intérêt légitime**

| Situation | Base légale applicable | Explication |
|-----------|----------------------|-------------|
| Email professionnel `prenom.nom@entreprise.fr` | Intérêt légitime ✓ | Données professionnelles |
| Email générique `contact@entreprise.fr` | Intérêt légitime ✓ | Entité morale, pas personne physique |
| Email personnel `prenom.nom@gmail.com` | Consentement requis ✗ | Données personnelles hors contexte pro |
| Numéro de mobile personnel | Consentement requis ✗ | Sauf si publié dans un contexte professionnel |
| Dirigeant de TPE (nom = entreprise) | Zone grise — avis juridique requis | La CNIL a des positions spécifiques |

### Information préalable obligatoire (Article 14 RGPD)

Chaque prospect doit recevoir l'information RGPD lors du **premier contact**, pas après :

```typescript
// Template d'email de prospection — mention RGPD obligatoire
const RGPD_FOOTER = `
---
Conformément au RGPD, vos données professionnelles (nom, email, poste, entreprise)
sont traitées par [Entreprise cliente] sur la base de son intérêt légitime de
prospection commerciale B2B (Art. 6(1)(f) RGPD).

Vous pouvez vous opposer à ce traitement ou demander l'effacement de vos données
en répondant à cet email ou via : [lien désinscription] | [email DPO]

Source de vos données : [LinkedIn / Base publique / Recommandation] — collectées le [date].
`;
```

---

## 2. Catégories de données traitées {#categories-donnees}

### 2.1 Données de contact

| Champ              | Sensibilité | Base légale   | Durée de conservation |
|--------------------|-------------|---------------|-----------------------|
| email_pro          | Normale     | Intérêt légi. | Voir politique rétention |
| email_perso        | **Élevée**  | Consentement  | Durée du consentement |
| phone_pro          | Normale     | Intérêt légi. | Voir politique rétention |
| phone_mobile       | **Élevée**  | Consentement  | Durée du consentement |
| prenom             | Normale     | Intérêt légi. | Voir politique rétention |
| nom                | Normale     | Intérêt légi. | Voir politique rétention |
| titre_poste        | Normale     | Intérêt légi. | Voir politique rétention |
| linkedin_url       | Normale     | Intérêt légi. | Voir politique rétention |

### 2.2 Données d'entreprise

| Champ              | Sensibilité | Base légale   | Notes |
|--------------------|-------------|---------------|-------|
| company_name       | Publique    | Intérêt légi. | Donnée SIREN publique |
| siren              | Publique    | Intérêt légi. | Registre public |
| siret              | Publique    | Intérêt légi. | Registre public |
| company_website    | Publique    | Intérêt légi. | Information publique |
| employee_count     | Normale     | Intérêt légi. | Estimation |
| revenue_estimate   | Normale     | Intérêt légi. | Estimation publique |
| sector             | Normale     | Intérêt légi. | Classification NAF |
| address            | Normale     | Intérêt légi. | Registre public |

### 2.3 Données techniques (logs, traces)

| Champ              | Sensibilité | Base légale   | Notes |
|--------------------|-------------|---------------|-------|
| email_opens        | **Élevée**  | Intérêt légi. | Pixel de tracking — opt-out requis |
| email_clicks       | **Élevée**  | Intérêt légi. | Redirection tracking — opt-out requis |
| ip_address         | **Élevée**  | Intérêt légi. | Pseudonymiser après 30 jours |
| browser_ua         | Normale     | Intérêt légi. | Anonymiser après 30 jours |
| sequence_history   | Normale     | Intérêt légi. | Historique des interactions |

### 2.4 Données enrichies par IA

| Champ              | Sensibilité | Base légale   | Notes |
|--------------------|-------------|---------------|-------|
| icp_score          | Normale     | Intérêt légi. | Score calculé, pas donnée source |
| segment            | Normale     | Intérêt légi. | Catégorie marketing |
| ai_summary         | **Élevée**  | Intérêt légi. | Profilage — informer et permettre opposition |
| predicted_intent   | **Élevée**  | Intérêt légi. | Profilage — droits renforcés (Art. 22 RGPD) |

**Point de vigilance Article 22 RGPD — Décision automatisée**

Si le score ICP entraîne automatiquement une décision importante (ex: exclusion définitive d'un contact), il constitue une **décision automatisée** soumise à l'Article 22. Le contact a le droit :
- D'être informé de la logique de scoring
- D'obtenir une révision humaine
- De s'opposer à la décision

```typescript
// Ne jamais prendre de décision irréversible sans intervention humaine
async function scoreAndDecide(leadId: string): Promise<void> {
  const score = await this.scoringAgent.calculate(leadId);

  if (score < 20) {
    // Ne pas archiver définitivement en automatique — créer une tâche de révision
    await this.taskQueue.add('review-low-score-lead', {
      leadId,
      score,
      reason: 'Automated score below threshold',
      requiresHumanReview: true, // Obligation Art. 22 RGPD
    });
  }
}
```

---

## 3. Chiffrement des données {#chiffrement}

### 3.1 Chiffrement au repos (pgcrypto)

```sql
-- Activation de l'extension pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Clé de chiffrement stockée dans postgresql.conf ou settings
-- JAMAIS en dur dans le SQL
-- ALTER DATABASE axiom_prod SET app.encryption_key = '...';  -- EN PRODUCTION
-- Utiliser un gestionnaire de secrets (Docker Secrets, Vault, etc.)

-- Colonnes chiffrées pour les données PII
ALTER TABLE contacts ADD COLUMN email_encrypted BYTEA;
ALTER TABLE contacts ADD COLUMN phone_encrypted BYTEA;

-- Fonction de chiffrement
CREATE OR REPLACE FUNCTION encrypt_pii(data TEXT)
RETURNS BYTEA AS $$
BEGIN
  RETURN pgp_sym_encrypt(
    data,
    current_setting('app.encryption_key'),
    'cipher-algo=aes256, compress-algo=1'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction de déchiffrement
CREATE OR REPLACE FUNCTION decrypt_pii(encrypted_data BYTEA)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(
    encrypted_data,
    current_setting('app.encryption_key')
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL; -- En cas d'erreur de déchiffrement
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hash déterministe pour la déduplication (sans déchiffrement)
CREATE OR REPLACE FUNCTION hash_email_for_dedup(email TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(
    hmac(
      lower(trim(email)),
      current_setting('app.email_hmac_key'),
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- Trigger automatique : chiffrer à l'insertion/mise à jour
CREATE OR REPLACE FUNCTION contacts_encrypt_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email_encrypted := encrypt_pii(NEW.email);
    NEW.email_hash := hash_email_for_dedup(NEW.email);
    NEW.email := NULL; -- Supprimer le clair après chiffrement
  END IF;

  IF NEW.phone IS NOT NULL THEN
    NEW.phone_encrypted := encrypt_pii(NEW.phone);
    NEW.phone := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_encrypt
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION contacts_encrypt_trigger();
```

### 3.2 Chiffrement en transit (TLS 1.3)

```typescript
// Vérification que toutes les connexions sont chiffrées
// config/database.config.ts
export const databaseConfig: PrismaClientOptions = {
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
      // L'URL doit inclure : ?sslmode=verify-full&sslrootcert=/certs/ca.crt
    },
  },
  // Pour Prisma, configurer dans DATABASE_URL :
  // postgresql://user:pass@host:5432/db?sslmode=verify-full
};

// Vérification Redis TLS
export const redisConfig = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT ?? '6380'), // 6380 pour TLS
  password: process.env.REDIS_PASSWORD,
  tls: process.env.NODE_ENV === 'production' ? {
    ca: fs.readFileSync('/certs/redis-ca.crt'),
    cert: fs.readFileSync('/certs/redis-client.crt'),
    key: fs.readFileSync('/certs/redis-client.key'),
    rejectUnauthorized: true,
  } : undefined,
};
```

---

## 4. Pseudonymisation pour l'analytique {#pseudonymisation}

La pseudonymisation remplace les identifiants directs par des pseudonymes, permettant l'analyse statistique sans exposer les données réelles.

```sql
-- Vue pseudonymisée pour l'analytique (Metabase, rapports)
CREATE OR REPLACE VIEW analytics_leads AS
SELECT
  -- Pseudonyme stable (permettant le suivi longitudinal)
  encode(
    hmac(id::text, current_setting('app.analytics_salt'), 'sha256'),
    'hex'
  ) AS pseudo_id,

  -- Données agrégées — jamais les données individuelles
  DATE_TRUNC('week', created_at) AS week,
  source,
  status,
  segment,
  icp_score,
  sector,
  country,

  -- Taille de l'entreprise en tranches (pas le chiffre exact)
  CASE
    WHEN employee_count < 10 THEN 'TPE'
    WHEN employee_count < 50 THEN 'PE'
    WHEN employee_count < 250 THEN 'ME'
    WHEN employee_count < 5000 THEN 'ETI'
    ELSE 'GE'
  END AS company_size_bucket,

  -- Jamais : email, nom, prénom, téléphone, SIREN complet
  -- Jamais : identifiant direct qui permettrait la réidentification

  -- Région plutôt que ville (trop spécifique)
  LEFT(postal_code, 2) AS department_code

FROM leads
-- Exclure les leads ayant exercé leur droit d'opposition
WHERE is_analytics_excluded = false;

-- Permissions — seul le rôle analytics peut accéder à cette vue
GRANT SELECT ON analytics_leads TO axiom_analytics;
REVOKE ALL ON analytics_leads FROM PUBLIC;
```

```typescript
// Pseudonymisation côté application
export class AnalyticsService {
  private readonly analyticsSalt: string;

  constructor(configService: ConfigService) {
    this.analyticsSalt = configService.getOrThrow('ANALYTICS_SALT');
  }

  pseudonymize(realId: string): string {
    return createHmac('sha256', this.analyticsSalt)
      .update(realId)
      .digest('hex');
  }

  // Pour les événements Posthog / analytics — jamais d'identifiants réels
  trackEvent(leadId: string, eventName: string, properties: Record<string, unknown>): void {
    const pseudoId = this.pseudonymize(leadId);

    // Filtrer les propriétés sensibles
    const safeProperties = Object.fromEntries(
      Object.entries(properties).filter(([key]) =>
        !['email', 'phone', 'name', 'firstName', 'lastName', 'siren'].includes(key)
      )
    );

    this.posthog.capture({
      distinctId: pseudoId, // Jamais le vrai ID
      event: eventName,
      properties: safeProperties,
    });
  }
}
```

---

## 5. Droit à l'effacement — procédure technique {#effacement}

### 5.1 Stored procedure d'effacement cascade

```sql
-- Procédure d'effacement complet d'un contact (droit à l'oubli RGPD)
-- Cascade sur toutes les tables liées (~40 tables)
CREATE OR REPLACE FUNCTION rgpd_erase_contact(
  p_contact_id UUID,
  p_reason TEXT DEFAULT 'right_to_erasure',
  p_requested_by TEXT DEFAULT 'dpo'
)
RETURNS JSONB AS $$
DECLARE
  v_lead_ids UUID[];
  v_erased_count INT := 0;
  v_audit_log JSONB;
BEGIN
  -- 1. Récupérer tous les lead_ids associés au contact
  SELECT ARRAY_AGG(id) INTO v_lead_ids
  FROM leads
  WHERE contact_id = p_contact_id;

  -- 2. Audit log AVANT l'effacement (conserver la trace de la demande)
  INSERT INTO rgpd_erasure_log (
    contact_id,
    lead_ids,
    reason,
    requested_by,
    requested_at,
    data_snapshot
  )
  SELECT
    p_contact_id,
    v_lead_ids,
    p_reason,
    p_requested_by,
    NOW(),
    jsonb_build_object(
      'email_hash', email_hash,  -- Conserver le hash pour la blacklist anti-recontact
      'contact_source', source,
      'created_at', created_at
    )
  FROM contacts
  WHERE id = p_contact_id
  RETURNING id INTO v_audit_log;

  -- 3. Cascade sur toutes les tables
  -- Activités email
  DELETE FROM email_events WHERE lead_id = ANY(v_lead_ids);
  GET DIAGNOSTICS v_erased_count = ROW_COUNT;

  DELETE FROM email_messages WHERE lead_id = ANY(v_lead_ids);

  -- Séquences et files d'attente
  DELETE FROM sequence_enrollments WHERE lead_id = ANY(v_lead_ids);
  DELETE FROM sequence_steps_completed WHERE lead_id = ANY(v_lead_ids);
  DELETE FROM email_queue WHERE lead_id = ANY(v_lead_ids);

  -- Tâches et notes
  DELETE FROM tasks WHERE lead_id = ANY(v_lead_ids);
  DELETE FROM notes WHERE lead_id = ANY(v_lead_ids);

  -- Enrichissement et scoring
  DELETE FROM enrichment_results WHERE lead_id = ANY(v_lead_ids);
  DELETE FROM icp_scores WHERE lead_id = ANY(v_lead_ids);
  DELETE FROM signal_detections WHERE lead_id = ANY(v_lead_ids);

  -- Logs d'interaction
  DELETE FROM interaction_history WHERE lead_id = ANY(v_lead_ids);
  DELETE FROM call_logs WHERE lead_id = ANY(v_lead_ids);
  DELETE FROM linkedin_messages WHERE lead_id = ANY(v_lead_ids);

  -- Données d'import
  DELETE FROM import_rows WHERE lead_id = ANY(v_lead_ids);

  -- Leads eux-mêmes
  DELETE FROM leads WHERE id = ANY(v_lead_ids);

  -- 4. Anonymiser le contact (ne pas supprimer pour intégrité référentielle)
  UPDATE contacts SET
    email_encrypted = NULL,
    email_hash = encode(
      hmac(email_hash, current_setting('app.erasure_salt'), 'sha256'),
      'hex'
    ), -- Rehasher pour invalider mais garder pour blacklist
    phone_encrypted = NULL,
    first_name = 'EFFACÉ',
    last_name = 'RGPD',
    linkedin_url = NULL,
    avatar_url = NULL,
    is_erased = TRUE,
    erased_at = NOW(),
    erased_reason = p_reason,
    -- Garder uniquement : company_id (pour statistiques), created_at, source
    updated_at = NOW()
  WHERE id = p_contact_id;

  -- 5. Ajouter le hash à la blacklist anti-recontact
  INSERT INTO blacklist_anti_recontact (
    email_hash,
    reason,
    added_at,
    expires_at  -- NULL = permanent pour les droits à l'oubli
  )
  SELECT
    email_hash,
    p_reason,
    NOW(),
    NULL  -- Permanent
  FROM contacts
  WHERE id = p_contact_id
  ON CONFLICT (email_hash) DO UPDATE SET
    reason = EXCLUDED.reason,
    updated_at = NOW();

  -- 6. Supprimer les données dans Redis (cache, sessions actives)
  -- (effectué côté application après la procédure)

  RETURN jsonb_build_object(
    'success', true,
    'contact_id', p_contact_id,
    'leads_erased', array_length(v_lead_ids, 1),
    'erased_at', NOW()
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'contact_id', p_contact_id
    );
END;
$$ LANGUAGE plpgsql;
```

```typescript
// Service NestJS pour traiter les demandes d'effacement
@Injectable()
export class RgpdService {
  async processErasureRequest(
    request: ErasureRequestDto,
    requestedBy: string,
  ): Promise<ErasureResult> {
    // 1. Vérifier l'identité du demandeur (réponse sous 1 mois max)
    const contact = await this.findContactByEmail(request.email);

    if (!contact) {
      // Contact non trouvé — tracer la demande quand même
      await this.traceErasureRequest(request.email, 'not_found', requestedBy);
      return { success: true, message: 'No data found for this email' };
    }

    // 2. Exécuter la procédure d'effacement
    const result = await this.prisma.$queryRaw<ErasureResult[]>`
      SELECT rgpd_erase_contact(
        ${contact.id}::uuid,
        'right_to_erasure',
        ${requestedBy}
      ) AS result
    `;

    // 3. Invalider le cache Redis
    await this.redis.del(`contact:${contact.id}`);
    await this.redis.del(`leads:contact:${contact.id}`);

    // 4. Invalider les sessions actives du contact
    const sessions = await this.redis.smembers(`user-sessions:${contact.id}`);
    if (sessions.length > 0) {
      await this.redis.del(...sessions);
    }

    // 5. Logger l'action pour audit
    this.logger.info({
      event: 'rgpd.erasure.completed',
      contactId: contact.id,
      requestedBy,
      timestamp: new Date().toISOString(),
    });

    // 6. Envoyer confirmation au contact
    await this.emailService.sendErasureConfirmation(request.email, result);

    return result[0].result;
  }

  // Délai réglementaire : 1 mois (extensible à 3 mois avec notification)
  async getErasureDeadline(): Promise<Date> {
    const deadline = new Date();
    deadline.setMonth(deadline.getMonth() + 1);
    return deadline;
  }
}
```

---

## 6. Politique de rétention des données {#retention}

```sql
-- Configuration des périodes de rétention (paramétrable par tenant)
CREATE TABLE data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  data_category VARCHAR(100) NOT NULL,
  retention_days INT NOT NULL,
  retention_action VARCHAR(50) NOT NULL CHECK (retention_action IN ('delete', 'anonymize', 'archive')),
  legal_basis TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, data_category)
);

-- Politiques de rétention par défaut
INSERT INTO data_retention_policies (tenant_id, data_category, retention_days, retention_action, legal_basis) VALUES
-- Leads bruts (pas encore qualifiés)
('default', 'raw_leads', 180, 'delete',
 'Intérêt légitime — 6 mois suffisants pour qualification'),

-- Leads COLD (pas de réponse après séquence complète)
('default', 'cold_leads', 365, 'anonymize',
 'Intérêt légitime — 12 mois pour tentative de reconversion'),

-- Leads WARM (intérêt exprimé mais pas convertis)
('default', 'warm_leads', 548, 'anonymize',
 'Intérêt légitime — 18 mois pour cycle de vente long B2B'),

-- Clients actifs
('default', 'active_clients', -1, 'none',
 'Exécution du contrat — durée du contrat'),

-- Anciens clients (après fin de contrat)
('default', 'former_clients', 1095, 'anonymize',
 'Intérêt légitime + obligations légales (comptabilité 10 ans) — 3 ans post-contrat'),

-- Données de facturation
('default', 'billing_data', 3650, 'archive',
 'Obligation légale — 10 ans (Code du commerce)'),

-- Logs d'emails (opens, clicks)
('default', 'email_tracking', 90, 'anonymize',
 'Intérêt légitime — 3 mois suffisants pour les statistiques'),

-- Logs techniques (accès, erreurs)
('default', 'technical_logs', 365, 'delete',
 'Sécurité — 12 mois pour investigations forensiques'),

-- Sessions utilisateurs
('default', 'user_sessions', 7, 'delete',
 'Sécurité — 7 jours de validité des sessions');
```

```typescript
// Job de nettoyage automatique (cron quotidien à 2h)
@Injectable()
export class DataRetentionService {
  @Cron('0 2 * * *', { name: 'data-retention-cleanup' })
  async runRetentionCleanup(): Promise<void> {
    this.logger.info('Starting daily data retention cleanup');

    const policies = await this.prisma.dataRetentionPolicy.findMany({
      where: { retention_days: { gt: 0 } },
    });

    for (const policy of policies) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retention_days);

      try {
        await this.applyRetentionPolicy(policy, cutoffDate);
      } catch (error) {
        this.logger.error(`Retention cleanup failed for ${policy.data_category}`, { error });
        // Ne pas arrêter — continuer avec les autres catégories
      }
    }

    this.logger.info('Data retention cleanup completed');
  }

  private async applyRetentionPolicy(
    policy: DataRetentionPolicy,
    cutoffDate: Date,
  ): Promise<void> {
    switch (policy.data_category) {
      case 'raw_leads':
        if (policy.retention_action === 'delete') {
          const deleted = await this.prisma.lead.deleteMany({
            where: {
              status: 'raw',
              created_at: { lt: cutoffDate },
              is_client: false,
            },
          });
          this.logger.info(`Deleted ${deleted.count} raw leads older than ${policy.retention_days} days`);
        }
        break;

      case 'cold_leads':
        if (policy.retention_action === 'anonymize') {
          const updated = await this.prisma.lead.updateMany({
            where: {
              status: 'COLD',
              last_contacted_at: { lt: cutoffDate },
              is_anonymized: false,
            },
            data: {
              first_name: 'ANONYMISÉ',
              last_name: null,
              email_encrypted: null,
              phone_encrypted: null,
              linkedin_url: null,
              is_anonymized: true,
              anonymized_at: new Date(),
              // Garder : company_id, status, score, sector, source — pour stats
            },
          });
          this.logger.info(`Anonymized ${updated.count} COLD leads`);
        }
        break;

      case 'email_tracking':
        await this.prisma.emailEvent.deleteMany({
          where: { created_at: { lt: cutoffDate } },
        });
        break;

      case 'technical_logs':
        // Supprimer les logs techniques (dans la DB — les logs fichiers gérés par logrotate)
        await this.prisma.technicalLog.deleteMany({
          where: { created_at: { lt: cutoffDate } },
        });
        break;
    }
  }
}
```

---

## 7. Blacklist anti-recontact {#blacklist}

La blacklist anti-recontact est la protection la plus importante contre les récidives d'infraction RGPD. Un contact qui a demandé à ne plus être contacté NE DOIT JAMAIS recevoir d'email.

```sql
-- Table blacklist — basée sur des hashes (pas les données réelles)
CREATE TABLE blacklist_anti_recontact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash TEXT NOT NULL UNIQUE,  -- HMAC-SHA256 de l'email normalisé
  phone_hash TEXT,                   -- Hash du numéro de téléphone
  reason VARCHAR(100) NOT NULL CHECK (
    reason IN (
      'unsubscribe',          -- Désinscription volontaire
      'right_to_erasure',     -- Droit à l'effacement
      'right_to_object',      -- Droit d'opposition
      'bounce_permanent',     -- Rebond permanent (email invalide)
      'spam_complaint',       -- Plainte spam
      'legal_action',         -- Action en justice
      'manual'                -- Ajout manuel par l'équipe
    )
  ),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,      -- NULL = permanent
  added_by VARCHAR(200) NOT NULL,
  notes TEXT,
  tenant_id UUID,              -- NULL = blacklist globale (tous tenants)
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour la vérification rapide avant envoi
CREATE INDEX idx_blacklist_email_hash ON blacklist_anti_recontact(email_hash);
CREATE INDEX idx_blacklist_phone_hash ON blacklist_anti_recontact(phone_hash) WHERE phone_hash IS NOT NULL;
CREATE INDEX idx_blacklist_tenant ON blacklist_anti_recontact(tenant_id) WHERE tenant_id IS NOT NULL;

-- Fonction de vérification avant envoi d'email
CREATE OR REPLACE FUNCTION is_blacklisted(
  p_email TEXT,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_email_hash TEXT;
BEGIN
  -- Calculer le hash de l'email normalisé
  v_email_hash := encode(
    hmac(
      lower(trim(p_email)),
      current_setting('app.email_hmac_key'),
      'sha256'
    ),
    'hex'
  );

  -- Vérifier dans la blacklist globale ET tenant-specific
  RETURN EXISTS (
    SELECT 1
    FROM blacklist_anti_recontact
    WHERE email_hash = v_email_hash
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (tenant_id IS NULL OR tenant_id = p_tenant_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger : vérification automatique avant insertion d'email dans la queue
CREATE OR REPLACE FUNCTION check_blacklist_before_email()
RETURNS TRIGGER AS $$
BEGIN
  IF is_blacklisted(
    decrypt_pii(NEW.recipient_email_encrypted),
    NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'BLACKLISTED: Contact is on anti-recontact blacklist'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_blacklist_before_email_insert
  BEFORE INSERT ON email_queue
  FOR EACH ROW
  EXECUTE FUNCTION check_blacklist_before_email();
```

```typescript
// Gestion des désinscriptions dans NestJS
@Controller('unsubscribe')
export class UnsubscribeController {
  // Endpoint de désinscription one-click (RFC 8058 + Google/Yahoo requirements 2024)
  @Post('one-click')
  async oneClickUnsubscribe(
    @Body() body: { token: string },
  ): Promise<{ success: boolean }> {
    const payload = this.jwtService.verify<UnsubscribeToken>(body.token, {
      secret: process.env.UNSUBSCRIBE_JWT_SECRET,
    });

    await this.blacklistService.addToBlacklist({
      email: payload.email,
      reason: 'unsubscribe',
      addedBy: `sequence:${payload.sequenceId}:automatic`,
    });

    // Confirmation email (sans marketing)
    await this.emailService.sendTransactionalEmail({
      to: payload.email,
      subject: 'Désinscription confirmée',
      template: 'unsubscribe-confirmation',
    });

    return { success: true };
  }

  // Traitement des List-Unsubscribe headers (requis par RFC 2369)
  // Header email : List-Unsubscribe: <mailto:unsub@axiom.example.com?subject=unsub-TOKEN>
  @Post('mailto')
  async handleMailtoUnsubscribe(
    @Body() body: { subject: string; from: string },
  ): Promise<void> {
    if (body.subject.startsWith('unsub-')) {
      const token = body.subject.replace('unsub-', '');
      await this.oneClickUnsubscribe({ token });
    }
  }
}

@Injectable()
export class BlacklistService {
  async addToBlacklist(params: AddToBlacklistParams): Promise<void> {
    const emailHash = this.hashEmail(params.email);

    await this.prisma.blacklistAntiRecontact.upsert({
      where: { email_hash: emailHash },
      create: {
        email_hash: emailHash,
        reason: params.reason,
        added_by: params.addedBy,
        expires_at: params.expiresAt ?? null,
      },
      update: {
        reason: params.reason,
        added_by: params.addedBy,
        updated_at: new Date(),
      },
    });

    // Invalider le cache de la vérification blacklist
    await this.redis.del(`blacklist:${emailHash}`);
  }

  async isBlacklisted(email: string, tenantId?: string): Promise<boolean> {
    const emailHash = this.hashEmail(email);
    const cacheKey = `blacklist:${emailHash}:${tenantId ?? 'global'}`;

    // Cache Redis 5 minutes pour éviter les requêtes DB répétées
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) return cached === '1';

    const result = await this.prisma.$queryRaw<[{ blacklisted: boolean }]>`
      SELECT is_blacklisted(${email}, ${tenantId}::uuid) AS blacklisted
    `;

    const isBlacklisted = result[0].blacklisted;
    await this.redis.setex(cacheKey, 300, isBlacklisted ? '1' : '0');

    return isBlacklisted;
  }

  private hashEmail(email: string): string {
    return createHmac('sha256', process.env.EMAIL_HMAC_KEY!)
      .update(email.toLowerCase().trim())
      .digest('hex');
  }
}
```

---

## 8. Notification de violation de données {#violation}

### Procédure de notification (Article 33 & 34 RGPD)

```
DÉLAI LÉGAL : 72 heures après prise de connaissance de la violation

ARTICLE 33 — Notification à la CNIL (toujours obligatoire si risque)
ARTICLE 34 — Notification aux personnes concernées (si risque élevé)
```

### Arbre de décision

```
Incident de sécurité détecté
         │
         ▼
Y a-t-il eu accès à des données personnelles ?
  Non ──────────────────────────────────► Incident technique standard
  Oui
         │
         ▼
Évaluer le risque pour les personnes :

RISQUE ÉLEVÉ ──────────────────────────► Notifier CNIL ET personnes concernées (Art. 33 + 34)
- Données sensibles (santé, financières)    sous 72h
- Volume important (> 500 personnes)
- Données permettant l'usurpation d'identité

RISQUE MODÉRÉ ─────────────────────────► Notifier CNIL uniquement (Art. 33)
- Données professionnelles exposées          sous 72h
- Volume limité
- Accès non confirmé (possible fuite)

RISQUE FAIBLE ─────────────────────────► Documentation interne uniquement
- Accès limité, chiffré                     (Art. 33(2) : documenter mais pas notifier)
- Pas d'impact probable sur les droits
```

### Modèle de notification CNIL

```
NOTIFICATION DE VIOLATION DE DONNÉES PERSONNELLES
Article 33 du Règlement (UE) 2016/679

Référence : AXM-VIOLATION-[AAAA-MM-DD]-[N]
Date de notification : [DATE]

1. RESPONSABLE DU TRAITEMENT
Dénomination : [Nom entreprise]
SIRET : [SIRET]
DPO / Référent : [Nom, email, téléphone]

2. NATURE DE LA VIOLATION
Date/heure de prise de connaissance : [DATE HEURE]
Date/heure probable de la violation : [DATE HEURE ou "à déterminer"]
Description : [Décrire ce qui s'est passé de façon factuelle]

Type de violation :
[ ] Confidentialité (accès non autorisé)
[ ] Intégrité (modification non autorisée)
[ ] Disponibilité (perte ou destruction)

3. DONNÉES CONCERNÉES
Catégories : [emails pro, noms, entreprises, etc.]
Nombre approximatif de personnes : [N]
Données sensibles (Art. 9) : [ ] Oui  [X] Non

4. CONSÉQUENCES PROBABLES
[Décrire les conséquences possibles pour les personnes]

5. MESURES PRISES ET ENVISAGÉES
Mesures immédiates : [Liste]
Mesures préventives : [Liste pour éviter récidive]

6. CONTACT POUR INFORMATION COMPLÉMENTAIRE
[Nom, email, téléphone du DPO]
```

```typescript
// Service d'alerte de violation de données
@Injectable()
export class DataBreachNotificationService {
  async reportBreach(incident: SecurityIncident): Promise<void> {
    const riskLevel = this.assessRisk(incident);

    // Enregistrer immédiatement dans le registre des violations
    const breach = await this.prisma.dataBreachLog.create({
      data: {
        incident_id: incident.id,
        discovered_at: incident.discoveredAt,
        occurred_at: incident.occurredAt,
        data_categories: incident.affectedDataCategories,
        estimated_persons_count: incident.estimatedPersonsCount,
        risk_level: riskLevel,
        status: 'open',
        notification_deadline: new Date(
          incident.discoveredAt.getTime() + 72 * 60 * 60 * 1000
        ), // 72h
      },
    });

    // Alerter l'équipe immédiatement
    await this.alerting.sendCriticalAlert({
      subject: `[BREACH] Violation de données détectée — ${incident.id}`,
      body: `
        Incident: ${incident.description}
        Risque: ${riskLevel}
        Délai notification CNIL: ${breach.notification_deadline.toISOString()}
        Personnes concernées: ~${incident.estimatedPersonsCount}

        ACTION REQUISE: Évaluer et notifier la CNIL sous 72h si risque >= MODERATE
        Portail CNIL: https://notifications.cnil.fr/notifications/index
      `,
      recipients: ['dpo@example.com', 'cto@example.com', 'legal@example.com'],
      urgency: 'critical',
    });

    // Créer une tâche avec rappels automatiques
    await this.taskService.createBreachNotificationTask(breach);
  }

  private assessRisk(incident: SecurityIncident): 'low' | 'moderate' | 'high' {
    if (
      incident.affectedDataCategories.some(c =>
        ['financial', 'health', 'passwords', 'ssn'].includes(c)
      ) ||
      incident.estimatedPersonsCount > 500
    ) {
      return 'high';
    }

    if (incident.estimatedPersonsCount > 50 || incident.isConfirmedAccess) {
      return 'moderate';
    }

    return 'low';
  }
}
```

---

## 9. Privacy by Design {#privacy-by-design}

Les 7 principes fondateurs (Ann Cavoukian) appliqués à Axiom :

### Principe 1 — Proactif, pas réactif

```typescript
// La protection de la vie privée est intégrée au processus dès la conception
// Chaque nouveau champ dans le modèle de données doit passer par une PIA (Privacy Impact Assessment)

// Template de PR pour nouveau traitement de données
/**
 * CHECKLIST RGPD — à compléter pour tout nouveau champ PII
 *
 * Champ ajouté : [nom du champ]
 * Type de donnée : [email / téléphone / nom / localisation / etc.]
 *
 * [ ] Base légale identifiée : [intérêt légitime / contrat / consentement]
 * [ ] Finalité documentée : [à quoi sert ce champ]
 * [ ] Durée de rétention définie : [X mois/années]
 * [ ] Chiffrement si PII sensible : [pgcrypto / non nécessaire]
 * [ ] Inclus dans la procédure d'effacement cascade : [oui / non + raison]
 * [ ] Information ajoutée à la politique de confidentialité : [oui / non + PR]
 * [ ] Registre des traitements mis à jour : [oui / non + référence]
 */
```

### Principe 2 — Privacy as default

```typescript
// La configuration par défaut est la plus protectrice
const DEFAULT_PRIVACY_SETTINGS = {
  analyticsTracking: false,     // Opt-in, pas opt-out
  emailTracking: false,          // Opt-in pour le tracking (pixels)
  dataSharing: false,            // Jamais de partage par défaut
  retentionMaximized: false,     // Conserver le minimum, pas le maximum
  profileBuilding: false,        // Profilage = opt-in
} as const;
```

### Principe 3 — Intégré à la conception

```typescript
// Les PII sont chiffrées DÈS l'insertion — pas en post-traitement
// Voir le trigger PostgreSQL dans la section 3.1
```

### Principe 4 — Fonctionnalité complète (pas de compromis)

L'adoption du RGPD ne se traduit pas par une dégradation de la performance commerciale — elle se traduit par une meilleure qualité de données (contacts qui veulent vraiment être contactés).

### Principe 5 — Sécurité de bout en bout

```typescript
// Chiffrement de transport (TLS 1.3) + chiffrement au repos (AES-256)
// Voir section Chiffrement des données
```

### Principe 6 — Visibilité et transparence

```typescript
// Audit trail complet de toutes les actions sur les données personnelles
@Injectable()
export class AuditTrailInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user, params } = request;

    // Logger toutes les opérations sur des ressources sensibles
    if (url.includes('/leads') || url.includes('/contacts')) {
      this.logger.info({
        event: 'data.access',
        action: method,
        resource: url,
        resourceId: params?.id,
        userId: user?.id,
        tenantId: user?.tenantId,
        timestamp: new Date().toISOString(),
        ip: request.ip,
      });
    }

    return next.handle();
  }
}
```

### Principe 7 — Respect de la vie privée de l'utilisateur

```typescript
// Interface de gestion des droits RGPD — accessible directement par l'utilisateur
@Controller('rgpd')
export class RgpdController {
  @Get('my-data')
  @UseGuards(JwtAuthGuard)
  async getMyData(@CurrentUser() user: User): Promise<PersonalDataExport> {
    return this.rgpdService.exportPersonalData(user.id);
  }

  @Post('erase')
  @UseGuards(JwtAuthGuard)
  async requestErasure(@CurrentUser() user: User): Promise<{ message: string }> {
    await this.rgpdService.processErasureRequest(
      { email: user.email },
      `user:${user.id}:self-request`,
    );
    return { message: 'Your erasure request has been processed. Confirmation sent by email.' };
  }

  @Post('object')
  @UseGuards(JwtAuthGuard)
  async exerciseRightToObject(
    @CurrentUser() user: User,
    @Body() body: { processingType: string },
  ): Promise<{ message: string }> {
    await this.rgpdService.processOppositionRequest(user.id, body.processingType);
    return { message: 'Your opposition has been registered.' };
  }
}
```

---

## 10. Précédent CNIL KASPR — Leçons à retenir {#kaspr}

### L'affaire KASPR (Amende 240 000 EUR — 2024)

**Résumé** : KASPR, une startup de prospection B2B, a été condamnée à 240 000 EUR d'amende par la CNIL pour les infractions suivantes :

1. **Défaut d'information des personnes concernées** (Article 14 RGPD)
   - Les données LinkedIn des prospects n'étaient pas accompagnées d'une information RGPD
   - Les prospects ne savaient pas que leurs données étaient traitées
   - Pas de mention de la source des données

2. **Absence de base légale robuste**
   - L'intérêt légitime invoqué n'était pas suffisamment documenté
   - Pas de test de mise en balance réalisé et documenté

3. **Défaut de coopération avec la CNIL**
   - Réponses tardives aux demandes d'information
   - Documentation insuffisante fournie lors de l'audit

4. **Conservation excessive des données**
   - Données conservées au-delà de la durée nécessaire
   - Pas de procédure automatique de nettoyage

### Mesures prises dans Axiom pour éviter cette situation

| Infraction KASPR | Mesure Axiom |
|-----------------|--------------|
| Pas d'info RGPD au 1er contact | Footer RGPD obligatoire dans tous les templates d'email (voir section 1) |
| Intérêt légitime non documenté | Test en 3 étapes documenté dans ce document + mis à jour à chaque audit |
| Conservation excessive | Jobs de nettoyage automatique (voir section 6) |
| Pas de procédure d'opposition | Endpoint de désinscription one-click + URL dans chaque email |
| Source des données non indiquée | Champ `source` obligatoire + mention dans le footer email |

```typescript
// Vérification automatique : chaque email doit avoir un footer RGPD
@Injectable()
export class EmailRgpdComplianceInterceptor {
  async validateEmail(email: EmailPayload): Promise<void> {
    if (!email.body.includes('[lien désinscription]') &&
        !email.unsubscribeUrl &&
        !email.listUnsubscribeHeader) {
      throw new Error(
        'COMPLIANCE ERROR: Email is missing RGPD unsubscribe mechanism. ' +
        'See docs/04-SECURITE/03-rgpd-conformite.md'
      );
    }

    if (!email.body.includes('RGPD') && !email.body.includes('données')) {
      this.logger.warn('Email may be missing RGPD information notice', {
        templateId: email.templateId,
      });
    }

    // Vérifier que le destinataire n'est pas dans la blacklist
    const isBlacklisted = await this.blacklistService.isBlacklisted(email.to);
    if (isBlacklisted) {
      throw new Error(`COMPLIANCE ERROR: Recipient ${email.to} is on anti-recontact blacklist`);
    }
  }
}
```

---

## 11. Registre des traitements (Article 30) {#registre}

Le registre des traitements est **obligatoire** pour toute entreprise de plus de 250 salariés, et recommandé pour toutes les entreprises (CNIL considère sa tenue de bonne pratique). Il doit être tenu à jour et disponible sur demande de la CNIL.

```
REGISTRE DES ACTIVITÉS DE TRAITEMENT
Article 30(1) du Règlement (UE) 2016/679

Responsable du traitement : [Nom de l'entreprise]
DPO : [Nom, email]
Dernière mise à jour : 2026-03-23

────────────────────────────────────────────────────────────────
TRAITEMENT N°1 : Prospection commerciale B2B

Finalité : Identifier et contacter des prospects professionnels
           susceptibles d'être intéressés par les services de nos clients

Catégories de personnes : Décideurs B2B (directeurs, managers, fondateurs)

Catégories de données :
  - Coordonnées professionnelles (email pro, téléphone pro)
  - Données d'identification (nom, prénom, titre, entreprise)
  - Données d'activité (LinkedIn, site web)

Base légale : Intérêt légitime (Art. 6(1)(f))
Test mise en balance : Document interne AXM-LI-2026-01

Destinataires : Équipes commerciales des entreprises clientes

Transferts hors UE : Aucun
  Exception : API Anthropic (Claude) — données pseudonymisées uniquement
  Garanties : Standard Contractual Clauses (SCC) + DPA Anthropic

Durée de conservation :
  - Leads bruts : 6 mois
  - Leads COLD : 12 mois
  - Leads WARM : 18 mois
  - Clients : durée du contrat + 3 ans

Mesures de sécurité :
  - Chiffrement AES-256 (pgcrypto)
  - TLS 1.3 pour les transports
  - Contrôle d'accès (JWT + RLS PostgreSQL)
  - Pseudonymisation pour l'analytique

────────────────────────────────────────────────────────────────
TRAITEMENT N°2 : Gestion des comptes utilisateurs

Finalité : Authentification et autorisation des utilisateurs de la plateforme

Catégories de personnes : Utilisateurs de la plateforme Axiom

Catégories de données :
  - Email, nom, prénom
  - Mot de passe haché (bcrypt)
  - Logs de connexion (IP, date)

Base légale : Exécution du contrat (Art. 6(1)(b))

Durée de conservation : Durée du contrat + 3 ans

────────────────────────────────────────────────────────────────
TRAITEMENT N°3 : Analytique et amélioration du service

Finalité : Mesurer la performance des campagnes, améliorer les algorithmes

Catégories de données :
  - Données pseudonymisées (jamais identifiantes directes)
  - Métriques agrégées (taux d'ouverture, taux de réponse)

Base légale : Intérêt légitime (Art. 6(1)(f))

Durée de conservation : 3 ans (données pseudonymisées)
```

---

*Ce document doit être révisé à chaque modification significative des traitements de données. Une analyse d'impact (AIPD/DPIA) est recommandée avant tout nouveau traitement à grande échelle impliquant du profilage automatisé.*
