# Anti-Patterns — Ce qui peut CASSER le système Axiom

> **Public** : Tous les développeurs et contributeurs
> **Dernière révision** : 2026-03-23
> **Statut** : Référence normative — chaque anti-pattern est un risque réel documenté

---

## Avant-propos

Ce document recense les erreurs qui ont été observées en production, en code review, ou dans des post-mortems d'incidents similaires dans des systèmes comparables. Chaque anti-pattern inclut :

- **NE JAMAIS** — ce qu'il ne faut pas faire
- **POURQUOI** — les conséquences précises
- **FAIRE PLUTÔT** — la solution correcte avec du code

---

## Sommaire

1. [Sécurité des secrets](#secrets)
2. [Infrastructure email](#email)
3. [Sécurité des services](#services)
4. [Base de données](#database)
5. [Docker et conteneurs](#docker)
6. [Agents IA et Claude](#agents)
7. [BullMQ et queues](#bullmq)
8. [Conformité RGPD](#rgpd)
9. [Performance et fiabilité](#performance)
10. [Développement et déploiement](#devops)

---

## 1. Sécurité des secrets {#secrets}

### AP-01 — Hardcoder des clés API dans le code source

**NE JAMAIS**
```typescript
// CATASTROPHIQUE — visible dans l'historique Git, les logs CI, les diffs de PR
const anthropic = new Anthropic({
  apiKey: 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz',  // JAMAIS
});

const pgConfig = {
  password: 'mon_super_mot_de_passe_2024',  // JAMAIS
};

// Même masqué partiellement, c'est trop risqué :
const KEY = 'sk-ant-api03-...';  // JAMAIS
```

**POURQUOI**
L'historique Git est permanent. Même si vous supprimez le commit, le secret reste dans `git reflog`, dans les forks, dans les Pull Requests archivées, dans les caches GitHub. Des outils comme `truffleHog` et `gitleaks` scannent continuellement les dépôts publics. Des bots automatisés détectent et exploitent les clés Anthropic dans les minutes suivant leur publication — entraînant des factures de milliers d'euros.

**FAIRE PLUTÔT**
```typescript
// En production : Docker Secrets
import { readFileSync } from 'fs';
const apiKey = readFileSync('/run/secrets/anthropic_api_key', 'utf-8').trim();

// En développement : variables d'environnement depuis .env (qui est dans .gitignore)
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

const anthropic = new Anthropic({ apiKey });
```

---

### AP-02 — Stocker des refresh tokens en clair dans la base de données

**NE JAMAIS**
```typescript
// Si la DB est compromise, tous les refresh tokens sont exploitables
await prisma.refreshToken.create({
  data: {
    token: refreshToken,  // En clair — JAMAIS
    userId: user.id,
  },
});
```

**POURQUOI**
Un refresh token en clair dans la DB est équivalent à un mot de passe. Si la base de données est compromise (dump, accès non autorisé via CVE PostgreSQL), l'attaquant obtient des sessions permanentes valides pour tous les utilisateurs. Les refresh tokens expirent en 7 jours — mais pendant 7 jours, l'attaquant a accès à tous les comptes.

**FAIRE PLUTÔT**
```typescript
import bcrypt from 'bcrypt';

// Hasher le refresh token avant stockage
const tokenHash = await bcrypt.hash(refreshToken, 12);

await prisma.refreshToken.create({
  data: {
    tokenHash,   // Hash uniquement — jamais le token en clair
    userId: user.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    // Famille de token pour la détection de réutilisation
    family: tokenFamily,
  },
});

// Vérification : comparer le token reçu avec le hash stocké
const storedToken = await prisma.refreshToken.findFirst({
  where: { userId, family: tokenFamily },
});
const isValid = await bcrypt.compare(receivedToken, storedToken.tokenHash);
```

---

### AP-03 — Logger des variables d'environnement ou des secrets au démarrage

**NE JAMAIS**
```typescript
// main.ts — souvent fait "pour déboguer", catastrophique en production
async function bootstrap() {
  console.log('Starting with config:', process.env);  // CATASTROPHIQUE
  console.log('DB URL:', process.env.DATABASE_URL);   // Expose le mot de passe
  console.log('API key:', process.env.ANTHROPIC_API_KEY); // JAMAIS
}
```

**POURQUOI**
Les logs de démarrage sont souvent collectés dans des systèmes de log centralisés (Loki, CloudWatch, Sentry). Ces systèmes peuvent avoir des accès élargis, des durées de rétention longues, ou être partagés entre équipes. Un secret dans les logs = secret accessible à quiconque a accès aux logs.

**FAIRE PLUTÔT**
```typescript
async function bootstrap() {
  // Logger uniquement les configurations non-sensibles
  logger.info({
    event: 'app.starting',
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    dbHost: process.env.DB_HOST,     // Hôte OK
    dbName: process.env.DB_NAME,     // Nom OK
    // JAMAIS : DB_PASSWORD, JWT_SECRET, ANTHROPIC_API_KEY
  });

  // Vérifier que les secrets requis sont présents sans les afficher
  const requiredSecrets = ['JWT_SECRET', 'ANTHROPIC_API_KEY'];
  for (const secret of requiredSecrets) {
    if (!process.env[secret]) {
      logger.error(`Missing required secret: ${secret}`);
      process.exit(1);
    }
    logger.debug(`Secret ${secret}: configured (${process.env[secret]!.length} chars)`);
    // Logger uniquement la longueur, jamais la valeur
  }
}
```

---

## 2. Infrastructure email {#email}

### AP-04 — Utiliser le domaine principal pour les emails de prospection froide

**NE JAMAIS**
```
De: contact@votreentreprise.fr
Objet: Vous cherchez à améliorer votre prospection B2B ?

[Email cold outreach non sollicité depuis le domaine principal]
```

**POURQUOI**
Les emails de prospection froide génèrent inévitablement des plaintes spam et des rebonds. Un taux de plainte > 0.1% chez Gmail/Outlook entraîne le blacklisting du domaine entier. Si `votreentreprise.fr` est blacklisté, **tous** vos emails transactionnels (facturation, onboarding, réinitialisation de mot de passe) arrivent en spam. La réputation d'un domaine prend des mois à reconstruire et peut être irréparable.

**FAIRE PLUTÔT**
```typescript
// Séparer strictement les domaines par usage
const DOMAIN_STRATEGY = {
  transactional: 'votreentreprise.fr',       // Jamais de cold email d'ici
  coldOutreach: 'prospection-acme.com',      // Uniquement cold outreach
  newsletter: 'news.votreentreprise.fr',     // Sous-domaine pour marketing
  alerts: 'alerts.votreentreprise.fr',       // Alertes système
};

// Validation au moment de l'envoi
function validateSendingDomain(email: EmailParams): void {
  if (
    email.from.includes('votreentreprise.fr') &&
    email.type === 'cold_outreach'
  ) {
    throw new Error(
      'POLICY VIOLATION: Cannot send cold outreach from main domain. ' +
      'Use prospection-acme.com instead.'
    );
  }
}
```

---

### AP-05 — Sauter le warm-up pour un nouveau domaine d'envoi

**NE JAMAIS**
```typescript
// Envoyer 500 emails le premier jour d'un nouveau domaine — CATASTROPHIQUE
await emailQueue.addBulk(
  allLeads.slice(0, 500).map(lead => ({
    name: 'send-cold-email',
    data: { leadId: lead.id, domain: 'new-domain.com' },
  }))
);
// Résultat : domaine blacklisté dans les 24h
```

**POURQUOI**
Les filtres anti-spam (Gmail, Outlook, Yahoo) considèrent un nouveau domaine qui envoie immédiatement à grande échelle comme un domaine de spam. Le blacklisting est quasi-immédiat et difficile à contester. Vous perdez le domaine et devez recommencer à zéro.

**FAIRE PLUTÔT**
```typescript
// Respecter le plan de chauffe — voir docs/07-GUIDES/02-bonnes-pratiques.md
// Vérification automatique au moment de l'ajout à la queue

@Injectable()
export class EmailQueueService {
  async addEmailJob(emailData: EmailJobData): Promise<void> {
    const domain = await this.domainService.findById(emailData.domainId);

    // Vérifier que le domaine est réchauffé
    if (!domain.isWarmedUp) {
      const warmupStatus = await this.warmupService.getStatus(domain.id);
      if (warmupStatus.currentDayVolume >= warmupStatus.maxAllowedToday) {
        throw new Error(
          `Domain ${domain.name} warm-up limit reached for today: ` +
          `${warmupStatus.currentDayVolume}/${warmupStatus.maxAllowedToday} emails. ` +
          `Domain age: ${warmupStatus.domainAgeInDays} days.`
        );
      }
    }

    await this.queue.add('send-email', emailData, EMAIL_JOB_OPTIONS);
  }
}
```

---

### AP-06 — Envoyer des emails sans mécanisme de désinscription conforme

**NE JAMAIS**
```html
<!-- Email sans lien de désinscription — violation RGPD + CAN-SPAM + CASL -->
<p>Bonjour, je voulais vous parler de notre solution...</p>
<!-- Pas de lien de désinscription -->
```

**POURQUOI**
Infraction légale (RGPD Art. 21, directive e-Privacy) avec risque d'amende CNIL. Les plaintes spam se multiplient (les destinataires cliquent "spam" au lieu de se désinscrire). Un taux de plainte > 0.3% entraîne le rejet automatique par Gmail/Yahoo (depuis 2024).

**FAIRE PLUTÔT**
```typescript
// Chaque email doit inclure :
// 1. Lien de désinscription en bas
// 2. Header List-Unsubscribe (RFC 2369)
// 3. Header List-Unsubscribe-Post (one-click, RFC 8058)

async prepareEmail(template: EmailTemplate, lead: Lead): Promise<PreparedEmail> {
  const unsubscribeToken = this.jwtService.sign(
    { email: lead.email, type: 'unsubscribe' },
    { expiresIn: '90d', secret: process.env.UNSUBSCRIBE_JWT_SECRET },
  );

  const unsubscribeUrl = `${process.env.APP_URL}/unsubscribe?token=${unsubscribeToken}`;

  return {
    ...template,
    body: template.body + this.RGPD_FOOTER(unsubscribeUrl, lead.source),
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:unsub@axiom.example.com?subject=unsub-${unsubscribeToken}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
```

---

## 3. Sécurité des services {#services}

### AP-07 — Déployer n8n sans authentification

**NE JAMAIS**
```yaml
# docker-compose.yml
services:
  n8n:
    image: n8nio/n8n
    ports:
      - "5678:5678"  # Exposé sur Internet SANS auth
    environment:
      - N8N_BASIC_AUTH_ACTIVE=false  # JAMAIS en production
```

**POURQUOI**
CVE-2026-21858 (CVSS 10.0) : n8n sans authentification permet une RCE non authentifiée via les webhooks. N'importe qui connaissant votre IP peut exécuter du code sur votre serveur, exfiltrer toutes vos données de leads, et pivot vers les autres services internes. Des scans Shodan/Censys détectent les instances n8n exposées en quelques heures.

**FAIRE PLUTÔT**
```yaml
services:
  n8n:
    image: n8nio/n8n:1.90.0
    # JAMAIS de port exposé directement
    environment:
      - N8N_USER_MANAGEMENT_DISABLED=false
      - N8N_USER_MANAGEMENT_JWT_SECRET=${N8N_JWT_SECRET}
    networks:
      - internal  # Réseau interne uniquement

# Accès via Caddy avec IP allowlist
# Voir docs/04-SECURITE/02-hardening-guide.md
```

---

### AP-08 — Utiliser `trust` dans pg_hba.conf

**NE JAMAIS**
```
# pg_hba.conf — NE JAMAIS
host    all    all    0.0.0.0/0    trust  # Accès sans mot de passe depuis partout
host    all    all    0.0.0.0/0    md5    # MD5 est cassé — presque aussi mauvais
```

**POURQUOI**
`trust` signifie "se connecter sans mot de passe". Si votre port PostgreSQL est accessible (même temporairement lors d'un mauvais deploy), n'importe qui peut se connecter comme superuser et dump la base entière. `md5` est cryptographiquement cassé depuis 2004 — préférer `scram-sha-256`.

**FAIRE PLUTÔT**
```
# pg_hba.conf — configuration sécurisée
local   all    postgres                         peer
local   all    all                              reject
host    axiom_prod    axiom_app    10.0.0.0/8    scram-sha-256
host    axiom_prod    axiom_app    172.16.0.0/12 scram-sha-256
# JAMAIS d'accès depuis 0.0.0.0/0
# JAMAIS de trust
```

---

### AP-09 — Monter le socket Docker dans des conteneurs applicatifs

**NE JAMAIS**
```yaml
services:
  nestjs-api:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # ÉQUIVALENT ROOT SUR L'HÔTE
```

**POURQUOI**
Avoir accès au socket Docker = avoir root sur l'hôte. Si l'API NestJS est compromise (XSS, RCE, injection), l'attaquant peut utiliser le socket Docker pour lancer un conteneur privilégié, monter le système de fichiers de l'hôte, et lire/écrire n'importe quel fichier. C'est une escalade de privilèges immédiate.

**FAIRE PLUTÔT**
```yaml
# Si vous avez besoin de gérer des conteneurs depuis un service :
# Option 1 : Service dédié avec accès limité au socket (ex: Watchtower avec --label-enable)
# Option 2 : API Docker TCP avec mTLS (Docker daemon exposé sur TCP avec certificats mutuels)
# Option 3 : Utiliser Kubernetes si vous avez besoin d'orchestration fine

# Pour Watchtower (mise à jour auto des conteneurs) — socket limité par labels
services:
  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --label-enable --cleanup
    # Watchtower ne met à jour que les conteneurs avec le label
    # com.centurylinklabs.watchtower.enable=true
```

---

## 4. Base de données {#database}

### AP-10 — Utiliser `$queryRawUnsafe` avec des données utilisateur

**NE JAMAIS**
```typescript
// Injection SQL triviale
const searchTerm = req.query.search; // "'; DROP TABLE leads; --"

const results = await prisma.$queryRawUnsafe(
  `SELECT * FROM leads WHERE company_name LIKE '%${searchTerm}%'`
  // Si searchTerm = "'; DROP TABLE leads; --" → catastrophe
);
```

**POURQUOI**
`$queryRawUnsafe` concatène les chaînes directement dans la requête SQL. Une injection SQL sur un endpoint de recherche peut supprimer des tables, exfiltrer toutes les données (y compris les données chiffrées avec leurs clés), ou créer un utilisateur admin PostgreSQL. CVE-2025-1094 montre que même les fonctions PostgreSQL "safe" comme `to_tsvector` peuvent être vecteurs d'injection dans les versions non patchées.

**FAIRE PLUTÔT**
```typescript
// Option 1 : Prisma ORM (requêtes paramétrées automatiques)
const results = await prisma.lead.findMany({
  where: {
    company_name: { contains: searchTerm, mode: 'insensitive' },
    tenantId,
  },
});

// Option 2 : Prisma.sql avec paramètres explicites (si SQL brut nécessaire)
const results = await prisma.$queryRaw(
  Prisma.sql`
    SELECT id, company_name, status
    FROM leads
    WHERE tenant_id = ${tenantId}::uuid
      AND to_tsvector('french', company_name)
      @@ websearch_to_tsquery('french', ${searchTerm})
    LIMIT ${limit}
  `
);
// Prisma.sql utilise des paramètres préparés — injection impossible
```

---

### AP-11 — Désactiver les migrations Prisma en production sans backup

**NE JAMAIS**
```bash
# SANS backup préalable
prisma migrate deploy  # En production, sur des données réelles
# ou pire :
prisma migrate reset  # Supprime TOUT — irréversible
```

**POURQUOI**
Une migration mal écrite peut supprimer des colonnes avec des données, ajouter des contraintes NOT NULL sans valeur par défaut (bloquant les insertions), ou prendre un verrou de table trop long (rendant l'application indisponible pendant la migration). Sans backup, les données perdues le sont définitivement.

**FAIRE PLUTÔT**
```bash
#!/bin/bash
# scripts/safe-migrate.sh

set -e

echo "1. Creating backup before migration..."
BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql.gz"
docker compose exec postgres pg_dump -U postgres axiom_prod | gzip > "$BACKUP_FILE"
echo "Backup created: $BACKUP_FILE"

echo "2. Checking migration (dry run)..."
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script

read -p "Review the migration above. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Migration cancelled"
  exit 0
fi

echo "3. Applying migration..."
npx prisma migrate deploy

echo "4. Verifying application health..."
curl -f http://localhost:3000/health || {
  echo "HEALTH CHECK FAILED — consider rolling back"
  echo "To rollback: psql -U postgres axiom_prod < $BACKUP_FILE"
  exit 1
}

echo "Migration completed successfully"
```

---

## 5. Docker et conteneurs {#docker}

### AP-12 — Utiliser `--no-sandbox` avec Puppeteer/Chromium

**NE JAMAIS**
```typescript
const browser = await puppeteer.launch({
  args: ['--no-sandbox', '--disable-setuid-sandbox'],  // JAMAIS en production
});
```

**POURQUOI**
Le sandbox de Chrome est la principale protection contre l'exécution de code arbitraire via des sites web malveillants. Avec `--no-sandbox`, un site web malveillant visité par Puppeteer peut exécuter du code avec les droits du processus Puppeteer (souvent root dans Docker). Dans Axiom, Puppeteer est utilisé pour l'enrichissement (scraping de pages d'entreprises) — un site malveillant peut cibler délibérément les scrapers.

**FAIRE PLUTÔT**
```typescript
// Utiliser seccomp + user namespace mapping plutôt que --no-sandbox
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: [
    '--disable-dev-shm-usage',  // Évite les crashes en mémoire limitée
    '--disable-gpu',            // Pas de GPU en serveur
    // PAS de --no-sandbox
  ],
});
```

```yaml
# docker-compose.yml — conteneur Puppeteer avec seccomp approprié
services:
  scraper:
    image: axiom/scraper:latest
    # Utiliser l'image officielle Puppeteer qui configure seccomp correctement
    # https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md
    security_opt:
      - seccomp:./security/chrome-seccomp.json  # Profil seccomp pour Chrome
    user: "1001:1001"
    cap_drop:
      - ALL
    # Si --no-sandbox est vraiment nécessaire dans un container : utiliser
    # le user namespace avec map_to_nobody plutôt que root
```

---

### AP-13 — Utiliser l'image `:latest` en production

**NE JAMAIS**
```yaml
services:
  nestjs-api:
    image: node:latest          # JAMAIS en production
  postgres:
    image: postgres:latest      # JAMAIS en production
  redis:
    image: redis:latest         # JAMAIS en production
```

**POURQUOI**
`:latest` peut changer à tout moment. Un `docker compose pull` en production peut mettre à jour silencieusement vers une version majeure incompatible (Node.js 22 → 23, PostgreSQL 16 → 17), brisant l'application. Vous perdez également la traçabilité : impossible de savoir quelle version exacte tourne en production.

**FAIRE PLUTÔT**
```yaml
services:
  nestjs-api:
    image: node:22.16.0-alpine3.20  # Version exacte
  postgres:
    image: postgres:16.8-alpine     # Version exacte
  redis:
    image: redis:7.4.3-alpine       # Version exacte

  # Pour les images custom : utiliser le digest SHA256
  nestjs-api-custom:
    image: ghcr.io/org/axiom-api@sha256:abc123def456...  # Digest immuable
```

---

## 6. Agents IA et Claude {#agents}

### AP-14 — Envoyer des données PII à Claude sans sanitisation

**NE JAMAIS**
```typescript
const response = await anthropic.messages.create({
  messages: [{
    role: 'user',
    content: `Analyse ce lead:
      Nom: ${lead.firstName} ${lead.lastName}
      Email: ${lead.email}
      Téléphone: ${lead.phone}
      Analyse sa probabilité d'acheter notre solution.`
    // Violation RGPD + risque sécurité
  }],
});
```

**POURQUOI**
1. **RGPD** : Envoyer des données personnelles (nom, email, téléphone) à l'API Anthropic (serveurs aux USA) sans DPA valide et sans mention dans le registre des traitements est une violation du RGPD Art. 44-49 (transferts internationaux). La CNIL peut infliger une amende significative.
2. **Sécurité** : Ces données sont envoyées à un tiers externe. Anthropic peut les utiliser pour l'amélioration des modèles (selon les conditions d'utilisation). Vérifier toujours le Data Processing Agreement d'Anthropic.
3. **Prompt injection** : Les données externes (email contenant `Ignore previous instructions...`) peuvent manipuler le modèle.

**FAIRE PLUTÔT**
```typescript
import { PiiSanitizer } from '@axiom/security';

// Envoyer uniquement les données non-identifiantes
const safeData = {
  companyName: lead.companyName,      // OK — nom d'entreprise public
  sector: lead.sector,               // OK
  employeeCount: lead.employeeCount, // OK
  signals: lead.signals,             // OK — anonymisés
  // JAMAIS : firstName, lastName, email, phone, siren
};

const { sanitized } = PiiSanitizer.sanitize(JSON.stringify(safeData));

const response = await anthropic.messages.create({
  messages: [{
    role: 'user',
    content: `Analyse ce profil d'entreprise pour évaluer son potentiel :\n${sanitized}`
  }],
});
```

---

### AP-15 — Faire confiance aux outputs Claude sans validation

**NE JAMAIS**
```typescript
const response = await anthropic.messages.create({ ... });
// Utiliser directement l'output sans validation
const score = response.content[0].text as number;  // Dangereux
const data = JSON.parse(response.content[0].text);  // Peut échouer et crasher
```

**POURQUOI**
Claude peut retourner des formats inattendus, des nombres hors des plages attendues, des objets avec des propriétés manquantes, ou même du texte explicatif plutôt que du JSON. Si le code aval fait confiance à ces outputs sans validation, on obtient des données corrompues en base, des crashes inattendus, ou des comportements erratiques du système.

**FAIRE PLUTÔT**
```typescript
import { z } from 'zod';

const ScoringOutputSchema = z.object({
  icpScore: z.number().min(0).max(100),
  tier: z.enum(['A', 'B', 'C', 'D']),
  reasons: z.array(z.string().max(200)).max(10),
  signals: z.array(z.object({
    type: z.string(),
    weight: z.number(),
  })).optional(),
});

async function parseScoringResponse(response: Anthropic.Message): Promise<ScoringOutput> {
  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';

  // Extraire le JSON de la réponse (Claude peut l'envelopper dans du texte)
  const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/) ??
                    rawText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error(`Claude response does not contain valid JSON: ${rawText.substring(0, 200)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse Claude JSON response: ${e}`);
  }

  const result = ScoringOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Claude output failed schema validation: ${JSON.stringify(result.error.errors)}`);
  }

  return result.data;
}
```

---

### AP-16 — Exécuter des actions irréversibles sur décision IA autonome

**NE JAMAIS**
```typescript
// Un agent IA qui prend des décisions irréversibles seul
@Processor('agent-queue')
async process(job: Job): Promise<void> {
  const lead = await this.leadsService.findById(job.data.leadId);
  const aiDecision = await this.claudeAgent.evaluate(lead);

  if (aiDecision.shouldUnsubscribe) {
    // JAMAIS — action irréversible sans validation humaine
    await this.blacklistService.addPermanently(lead.email);
    await this.leadsService.delete(lead.id);  // Suppression définitive
  }

  if (aiDecision.shouldSendEmail) {
    // Envoyer sans review humaine — risque de spam, d'erreur de persona
    await this.emailService.sendImmediately(aiDecision.emailContent);
  }
}
```

**POURQUOI**
Les LLMs font des erreurs. Claude peut décider de "désabonner" un prospect chaud par erreur de parsing, ou générer un email contenant des informations incorrectes ou inappropriées. Pour les actions irréversibles (blacklist, suppression, envoi d'email au nom d'un humain), il faut toujours une validation humaine. C'est aussi une obligation RGPD pour les décisions automatisées significatives (Art. 22).

**FAIRE PLUTÔT**
```typescript
// Actions réversibles : OK en automatique
if (aiDecision.shouldUpdateScore) {
  await this.leadsService.updateScore(lead.id, aiDecision.score);
  // Peut être corrigé à tout moment
}

// Actions irréversibles ou à fort impact : file d'attente de validation humaine
if (aiDecision.shouldUnsubscribe || aiDecision.shouldSendEmail) {
  await this.approvalQueue.add('human-review', {
    leadId: lead.id,
    aiDecision,
    proposedActions: aiDecision.actions,
    urgency: aiDecision.urgency,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h pour approuver
  });

  // Notifier le commercial responsable
  await this.notificationService.send({
    userId: lead.assignedTo,
    type: 'ai_decision_pending_review',
    payload: { leadId: lead.id, summary: aiDecision.summary },
  });
}
```

---

## 7. BullMQ et queues {#bullmq}

### AP-17 — Utiliser les événements BullMQ pour la logique transactionnelle

**NE JAMAIS**
```typescript
// Utiliser les événements BullMQ comme source de vérité pour des opérations critiques
queue.on('completed', async (job) => {
  // FRAGILE — les événements peuvent être perdus, dupliqués, ou dans le désordre
  await this.billingService.chargeCustomer(job.data.tenantId, job.data.amount);
  await this.emailService.sendInvoice(job.data.email);
});

// Ou dans un QueueEvents listener
queueEvents.on('failed', async ({ jobId }) => {
  // Ne pas faire ça — ce listener peut ne pas s'exécuter en cas de redémarrage
  await this.alertService.sendCriticalAlert(jobId);
});
```

**POURQUOI**
Les événements BullMQ sont émis via Redis pub/sub. Ils peuvent être perdus si le listener n'est pas actif au moment de l'émission, si Redis redémarre, ou si la connexion réseau est instable. Pour toute logique de facturation, notification critique, ou mise à jour d'état transactionnelle, l'état doit être dérivé du job lui-même, pas des événements.

**FAIRE PLUTÔT**
```typescript
// La logique transactionnelle est dans le processeur du job — toujours exécuté
@Processor('billing-queue')
async process(job: Job<BillingJobData>): Promise<BillingResult> {
  // Si ce job est exécuté, la charge est faite — atomiquement
  const charge = await this.billingService.chargeCustomer(
    job.data.tenantId,
    job.data.amount,
    { idempotencyKey: job.id }, // Idempotence garantie
  );

  await this.emailService.sendInvoice(job.data.email, charge.receiptUrl);

  return { charged: true, receiptUrl: charge.receiptUrl };
}

// Les événements sont pour le monitoring et les métriques uniquement
queue.on('completed', async (job, result) => {
  this.metrics.increment('billing.completed', { tenantId: job.data.tenantId });
  // Pas de logique métier ici
});
```

---

### AP-18 — Utiliser EVAL/EVALSHA Redis sans restrictions ACL

**NE JAMAIS**
```typescript
// Exécuter des scripts Lua arbitraires sur Redis sans contrôle
await redis.eval(userProvidedLuaScript, 0);  // Permet l'exécution arbitraire

// Ou donner accès EVAL à tous les services
// (dans redis.conf — voir AP-07)
```

**POURQUOI**
Les scripts Lua dans Redis s'exécutent dans le thread principal de Redis de façon synchrone. Un script mal formé ou malveillant peut bloquer Redis complètement (DoS), ou accéder à des données appartenant à d'autres services via des patterns de clés (contournement de l'isolation). CVE-2025-49844 (RediShell, CVSS 10.0) montre que Redis sans restrictions sur MODULE/EVAL est un RCE immédiat.

**FAIRE PLUTÔT**
```
# redis.conf — désactiver EVAL ou le renommer
rename-command EVAL ""
rename-command EVALSHA ""
rename-command SCRIPT ""

# Si EVAL est nécessaire pour BullMQ :
# BullMQ utilise ses propres scripts Lua en interne — les scripts sont gérés par la bibliothèque
# Ne jamais passer du code Lua externe à BullMQ
```

---

## 8. Conformité RGPD {#rgpd}

### AP-19 — Utiliser Waalaxy/Kaspr/Lusha sans avis juridique RGPD

**NE JAMAIS**
```typescript
// Intégrer une API de scraping LinkedIn sans vérification légale
const contacts = await kaspr.getContactData({
  linkedinUrls: leads.map(l => l.linkedinUrl),
});
// Puis importer directement en base de données
await this.leadsService.importContacts(contacts);
```

**POURQUOI**
La CNIL a condamné KASPR à 240 000 EUR en 2024 pour collecte illégale de données LinkedIn (voir docs/04-SECURITE/03-rgpd-conformite.md). L'utilisation de ces outils sans un DPA (Data Processing Agreement) valide et sans vérification de la conformité RGPD du fournisseur vous rend co-responsable. LinkedIn interdit également contractuellement le scraping dans ses conditions d'utilisation.

**FAIRE PLUTÔT**
```typescript
// 1. Obtenir un avis juridique sur l'outil spécifique avant intégration
// 2. Vérifier que le fournisseur a un DPA RGPD conforme
// 3. Documenter la base légale dans le registre des traitements
// 4. Informer les personnes concernées de la source (Article 14 RGPD)

// Pour les données LinkedIn : utiliser uniquement les données volontairement publiques
// et fournir l'information RGPD dès le premier contact
const emailFooter = `
  Source de vos données : profil LinkedIn public, consulté le ${date}.
  Traitement basé sur l'intérêt légitime (Art. 6(1)(f) RGPD).
  Désinscription : ${unsubscribeUrl}
`;
```

---

### AP-20 — Conserver les données sans politique de rétention active

**NE JAMAIS**
```typescript
// Importer des leads et les garder indéfiniment
await prisma.lead.createMany({ data: importedLeads });
// Sans jamais nettoyer, sans politique de rétention
// "On gardera ça, on ne sait jamais..."
```

**POURQUOI**
Le RGPD Art. 5(1)(e) impose la "limitation de la conservation" : les données personnelles doivent être conservées uniquement le temps nécessaire à la finalité. Conserver des leads indéfiniment (même des leads "Cold" sans interaction depuis 2 ans) est une infraction directe. En cas d'audit CNIL, chaque table sans politique de rétention documentée et appliquée est un risque d'amende.

**FAIRE PLUTÔT**
```typescript
// Voir docs/04-SECURITE/03-rgpd-conformite.md — Section 6 : Politique de rétention
// Le job cron de nettoyage doit être actif dès le premier déploiement

@Cron('0 2 * * *')
async runDataRetentionCleanup(): Promise<void> {
  // Supprimer les leads RAW > 6 mois
  await this.prisma.lead.deleteMany({
    where: { status: 'RAW', created_at: { lt: sixMonthsAgo } },
  });

  // Anonymiser les leads COLD > 12 mois
  await this.prisma.lead.updateMany({
    where: { status: 'COLD', last_contacted_at: { lt: twelveMonthsAgo } },
    data: { email_encrypted: null, first_name: 'ANONYMISÉ' },
  });
}
```

---

## 9. Performance et fiabilité {#performance}

### AP-21 — Faire des appels API synchrones dans des loops

**NE JAMAIS**
```typescript
// Traiter 500 leads séquentiellement — 500 * 5s = 41 minutes
for (const lead of leads) {
  const enriched = await this.enrichmentService.enrich(lead);  // Synchrone
  await this.prisma.lead.update({ where: { id: lead.id }, data: enriched });
}
```

**POURQUOI**
Les appels synchrones en boucle bloquent l'exécution, empêchent la concurrence, et se comportent mal en cas d'erreur (une erreur sur le lead N stoppe tout). Pour 1000 leads à 5s chacun, le traitement prend plus de 80 minutes et bloque le thread Node.js.

**FAIRE PLUTÔT**
```typescript
// Option 1 : BullMQ (recommandé pour le traitement de masse)
await this.enrichmentQueue.addBulk(
  leads.map(lead => ({
    name: 'enrich-lead',
    data: { leadId: lead.id },
    opts: {
      ...ENRICHMENT_JOB_OPTIONS,
      // Délai pour éviter de spammer les APIs externes
      delay: Math.random() * 2000,
    },
  }))
);

// Option 2 : Concurrence contrôlée avec p-limit (si synchrone nécessaire)
import pLimit from 'p-limit';
const limit = pLimit(10);  // Max 10 appels concurrents

const results = await Promise.allSettled(
  leads.map(lead => limit(() => this.enrichmentService.enrich(lead)))
);

// Gérer les erreurs individuelles sans stopper les autres
const failed = results.filter(r => r.status === 'rejected');
if (failed.length > 0) {
  this.logger.warn(`${failed.length}/${leads.length} enrichments failed`);
}
```

---

### AP-22 — Sélectionner `SELECT *` sur des tables avec des colonnes chiffrées

**NE JAMAIS**
```typescript
// Charger toutes les colonnes dont email_encrypted, phone_encrypted
// pour chaque requête — même quand on n'a besoin que du statut
const lead = await prisma.lead.findUnique({ where: { id: leadId } });
// SELECT * retourne email_encrypted et phone_encrypted — transfert inutile + déchiffrement
```

**POURQUOI**
Les colonnes `email_encrypted` et `phone_encrypted` sont des BYTEAs potentiellement larges. Les charger systématiquement surcharge le réseau DB, augmente la mémoire utilisée par les objets JS, et augmente la surface d'exposition des données chiffrées. De plus, `SELECT *` est fragile aux changements de schéma.

**FAIRE PLUTÔT**
```typescript
// Sélectionner uniquement les colonnes nécessaires
const lead = await prisma.lead.findUnique({
  where: { id: leadId },
  select: {
    id: true,
    company_name: true,
    status: true,
    icp_score: true,
    // email_encrypted: true — uniquement si on a besoin de l'email
    // phone_encrypted: true — uniquement si on a besoin du téléphone
  },
});

// Créer des "views" de données selon le contexte
type LeadSummary = Pick<Lead, 'id' | 'company_name' | 'status' | 'icp_score'>;
type LeadWithContact = Lead & { contact: { email: string; phone?: string } };
```

---

## 10. Développement et déploiement {#devops}

### AP-23 — Déployer sans passer `npm audit`

**NE JAMAIS**
```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      - run: docker compose up -d  # Sans npm audit
```

**POURQUOI**
Les vulnérabilités npm sont découvertes quotidiennement. Un déploiement sans audit peut introduire des CVEs critiques connues. Les bots automatisés scannent et exploitent ces vulnérabilités dans les heures suivant leur publication. Le registre CVE de ce projet (docs/04-SECURITE/01-registre-cve.md) documente des CVEs avec CVSS 10.0 qui ont existé dans des versions npm récentes.

**FAIRE PLUTÔT**
```yaml
jobs:
  security-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.16.0'
      - run: npm ci
      - run: npm audit --audit-level=high
        # Fail le build si des vulnérabilités HIGH ou CRITICAL sont trouvées
      - run: npx better-npm-audit audit --level high
        # Outil supplémentaire avec meilleur reporting
  deploy:
    needs: security-check  # Ne déployer que si l'audit passe
    steps:
      - run: docker compose up -d
```

---

### AP-24 — Commiter directement sur `main` sans review

**NE JAMAIS**
```bash
git checkout main
git commit -am "fix: quick fix for prod issue"
git push origin main  # Directo en production
```

**POURQUOI**
Les fixes "rapides" en production sont la principale source d'incidents secondaires. Sans review, les régressions, les problèmes de sécurité (secret accidentellement commité, validation retirée "temporairement"), et les conflits de migration ne sont pas détectés. La règle de la branche protégée est une protection critique, pas une bureaucratie.

**FAIRE PLUTÔT**
```bash
# Pour les vraies urgences de production
git checkout -b hotfix/critical-auth-bug
# Faire le fix minimal
git commit -am "fix(auth): correct JWT validation bypass"
git push origin hotfix/critical-auth-bug
# Créer une PR avec label "urgent" et reviewer un autre dev
# Merge après approbation (même si rapide)
# Puis cherry-pick vers develop
```

---

### AP-25 — Ignorer les erreurs TypeScript avec `// @ts-ignore` ou `as any`

**NE JAMAIS**
```typescript
// @ts-ignore — "je corrigerai plus tard" (jamais)
const result = parseResponse(data);
// @ts-ignore
result.nonExistentProperty.deepProperty;  // Crash en runtime

// Ou le cast magique qui masque le problème
const score = response as any;
const value = score.data.nested.value;  // Potentiel undefined, crash en runtime
```

**POURQUOI**
TypeScript est configuré en mode strict précisément pour détecter ces problèmes à la compilation plutôt qu'en production. `@ts-ignore` et `as any` désactivent cette protection. Dans un système multi-agent traitant des données RGPD, un crash inattendu peut laisser des jobs à moitié exécutés, des données corrompues, ou des erreurs de sécurité non gérées.

**FAIRE PLUTÔT**
```typescript
// Corriger le type à la source
interface ApiResponse {
  data: {
    nested: {
      value: number;
    };
  };
}

// Ou utiliser la validation Zod pour les données externes
const ResponseSchema = z.object({
  data: z.object({
    nested: z.object({
      value: z.number(),
    }),
  }),
});

const parsed = ResponseSchema.safeParse(response);
if (!parsed.success) {
  throw new Error(`Unexpected API response format: ${parsed.error.message}`);
}
const value = parsed.data.data.nested.value; // TypeScript sait que c'est un number
```

---

### AP-26 — Désactiver temporairement un contrôle de sécurité "le temps du déploiement"

**NE JAMAIS**
```typescript
// "Juste pour que ça marche en prod, je vais désactiver la vérification CORS..."
app.enableCors({ origin: '*' });  // "Temporaire"

// Ou dans pg_hba.conf pendant la migration :
// host all all 0.0.0.0/0 trust  # "Temporaire, je remets après"
```

**POURQUOI**
Il n'existe pas de "temporaire" en sécurité. Les modifications "temporaires" restent. Les bots de scan trouvent les ouvertures en minutes. Des incidents de sécurité majeurs ont été causés par des configurations "temporaires" oubliées : la fuite Capital One (2019) a démarré par une configuration IAM "temporaire".

**FAIRE PLUTÔT**
```bash
# Pour les migrations qui nécessitent un accès élargi temporaire :
# 1. Utiliser un tunnel SSH plutôt qu'ouvrir des ports publics
ssh -L 5432:localhost:5432 user@server

# 2. Utiliser des IP whitelists spécifiques plutôt que 0.0.0.0/0
# 3. Documenter AVEC une date d'expiration dans le code
# 4. Créer un ticket de suivi pour la suppression

# Pour les problèmes CORS : investiguer la vraie cause
# Un problème CORS révèle souvent une misconfiguration dans l'origine de la requête
```

---

## Résumé — Les 5 anti-patterns les plus dangereux

| Priorité | Anti-pattern | Risque |
|----------|-------------|--------|
| 1 | AP-07 : n8n sans auth | RCE non authentifié, compromission totale |
| 2 | AP-01 : Secrets hardcodés | Fuite immédiate, compromission DB |
| 3 | AP-14 : PII à Claude sans sanitisation | Amende CNIL, violation RGPD |
| 4 | AP-04 : Email froid depuis domaine principal | Blacklisting irréversible du domaine |
| 5 | AP-10 : SQL injection avec `$queryRawUnsafe` | Exfiltration totale des données |

---

*Ce document est mis à jour après chaque incident post-mortem et chaque audit de sécurité. Si vous observez un anti-pattern non documenté, ouvrez une PR pour l'ajouter — vous protégez ainsi tous vos collègues.*
