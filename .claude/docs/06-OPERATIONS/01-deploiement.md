# Guide de Déploiement — De Zéro à Production

## Prérequis

- Compte Hetzner Cloud (hetzner.com)
- Domaine DNS configurable
- Clés SSH générées localement
- Accès aux variables d'environnement (voir `.env.example`)
- GitHub Actions secrets configurés

**Durée estimée: 2-3 heures pour un premier déploiement**

---

## Étape 1 — Provisionnement VPS Hetzner

### Création du serveur

```bash
# Recommandé: Hetzner CX41 (8 vCPU, 16GB RAM, 160GB NVMe SSD, 20TB trafic)
# Prix: ~18€/mois
# Datacenter: nbg1 (Nuremberg, Allemagne) — RGPD compliant

# Depuis l'interface Hetzner Cloud Console:
# 1. New Project → "prospection-agentic"
# 2. Add Server:
#    - Location: Nuremberg (nbg1)
#    - Image: Ubuntu 24.04 LTS
#    - Type: CX41 (ou CPX31 pour débuter)
#    - Networking: IPv4 + IPv6
#    - SSH Keys: Importer votre clé publique
#    - Volume: Ajouter 200GB NVMe pour les données
#    - Name: "prospection-prod"

# Configurer le DNS AVANT de continuer
# Ajouter dans votre registrar:
# A    votre-domaine.com       → IP_DU_VPS
# A    n8n.votre-domaine.com   → IP_DU_VPS
# A    langfuse.votre-domaine.com → IP_DU_VPS
# A    metabase.votre-domaine.com → IP_DU_VPS
# A    queues.votre-domaine.com → IP_DU_VPS

# Tester la résolution DNS (attendre propagation 5-30 min)
dig +short votre-domaine.com
```

### Connexion initiale

```bash
# Sur votre machine locale
ssh root@IP_DU_VPS

# Vérifier Ubuntu 24.04
lsb_release -a
```

### Script de provisionnement

```bash
# Sur le VPS en root
curl -fsSL https://raw.githubusercontent.com/votre-repo/provision-vps.sh | bash

# OU manuellement:
cat << 'SCRIPT' > /tmp/provision.sh
#!/bin/bash
set -euo pipefail

# Mise à jour
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq curl wget git unzip ufw fail2ban \
  htop iotop ncdu logrotate ca-certificates gnupg lsb-release \
  apparmor apparmor-utils

# Utilisateur deploy
useradd -m -s /bin/bash deploy
usermod -aG sudo deploy

# Sudo sans mot de passe pour Docker uniquement
echo 'deploy ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/local/bin/docker-compose' \
  > /etc/sudoers.d/deploy

# SSH hardening
cat >> /etc/ssh/sshd_config << 'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
AllowUsers deploy
EOF
systemctl restart ssh

# Firewall
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# Fail2ban
systemctl enable fail2ban && systemctl start fail2ban

# Swap 4GB
fallocate -l 4G /swapfile
chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

echo "DONE. Reboot now."
SCRIPT

bash /tmp/provision.sh
reboot
```

---

## Étape 2 — Installation Docker

```bash
# Se connecter en tant que deploy
ssh deploy@IP_DU_VPS

# Installer Docker CE
curl -fsSL https://get.docker.com | sudo bash

# Ajouter deploy au groupe docker
sudo usermod -aG docker deploy
newgrp docker

# Vérification
docker --version    # Docker version 27.x
docker compose version  # Docker Compose version v2.x

# Configurer le daemon Docker
sudo tee /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  },
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 65535,
      "Soft": 65535
    }
  },
  "live-restore": true
}
EOF

sudo systemctl restart docker
```

---

## Étape 3 — Cloner le dépôt et configurer

```bash
# Créer la structure des répertoires
sudo mkdir -p /opt/prospection-agentic
sudo chown deploy:deploy /opt/prospection-agentic
cd /opt/prospection-agentic

# Cloner le dépôt
git clone https://github.com/votre-org/prospection-agentic.git .

# Ou si le déploiement est via CI/CD, créer les répertoires nécessaires
mkdir -p \
  data/postgres \
  data/redis \
  data/n8n \
  data/langfuse \
  data/metabase \
  data/caddy \
  logs

# Copier le fichier d'environnement
cp .env.example .env

# IMPORTANT: Éditer .env avec les vraies valeurs
nano .env
```

### Contenu .env complet pour production

```bash
# /opt/prospection-agentic/.env
# Générer les secrets avec: openssl rand -hex 32

# ─── Application ─────────────────────────────────────────────────────────
NODE_ENV=production
APP_PORT=3000
APP_API_KEY=GENERER_AVEC_openssl_rand_hex_32
APP_WEBHOOK_SECRET=GENERER_AVEC_openssl_rand_hex_32
DOMAIN=votre-domaine.com
ADMIN_IP=VOTRE_IP_PERSONNELLE
ALLOWED_ORIGINS=https://votre-domaine.com

# ─── PostgreSQL ───────────────────────────────────────────────────────────
POSTGRES_USER=prospection
POSTGRES_PASSWORD=GENERER_AVEC_openssl_rand_hex_16
POSTGRES_DB=prospection_prod
N8N_DB_NAME=n8n_prod
LANGFUSE_DB_NAME=langfuse_prod
METABASE_DB_NAME=metabase_prod
DATABASE_URL=postgresql://prospection:MOT_DE_PASSE@postgres:5432/prospection_prod

# ─── Redis ────────────────────────────────────────────────────────────────
REDIS_PASSWORD=GENERER_AVEC_openssl_rand_hex_16
REDIS_URL=redis://:MOT_DE_PASSE_REDIS@redis:6379

# ─── Claude API ───────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-api03-...
LLM_MONTHLY_BUDGET_EUR=500
LLM_DAILY_BUDGET_EUR=25

# ─── Langfuse ────────────────────────────────────────────────────────────
LANGFUSE_NEXTAUTH_SECRET=GENERER_AVEC_openssl_rand_hex_32
LANGFUSE_SALT=GENERER_AVEC_openssl_rand_hex_16
LANGFUSE_ENCRYPTION_KEY=GENERER_AVEC_openssl_rand_hex_32
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://langfuse.votre-domaine.com

# ─── n8n ─────────────────────────────────────────────────────────────────
N8N_ENCRYPTION_KEY=GENERER_AVEC_openssl_rand_base64_24
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=MOT_DE_PASSE_N8N_FORT

# ─── Metabase ────────────────────────────────────────────────────────────
METABASE_DB_NAME=metabase_prod
METABASE_EMBEDDING_KEY=GENERER_AVEC_openssl_rand_hex_32

# ─── Bull Board ──────────────────────────────────────────────────────────
BULL_BOARD_USER=admin
BULL_BOARD_PASSWORD=MOT_DE_PASSE_BULL_BOARD
# Hash bcrypt pour Caddy: caddy hash-password --plaintext MOT_DE_PASSE
BULL_BOARD_PASSWORD_HASH=HASH_BCRYPT

# ─── APIs externes ────────────────────────────────────────────────────────
DROPCONTACT_API_KEY=...
HUNTER_API_KEY=...
ZEROBOUNCE_API_KEY=...
KASPR_API_KEY=...
PAPPERS_API_KEY=...
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
MAILGUN_API_KEY=...
MAILGUN_DOMAIN=mg.votre-domaine.com
MAILGUN_WEBHOOK_SIGNING_KEY=...
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
WAALAXY_API_KEY=...
YOUSIGN_API_KEY=...
TYPEFORM_API_KEY=...
TYPEFORM_WEBHOOK_SECRET=...
INSEE_CLIENT_ID=...
INSEE_CLIENT_SECRET=...
```

---

## Étape 4 — Initialisation des bases de données

```bash
cd /opt/prospection-agentic

# Démarrer uniquement PostgreSQL et Redis en premier
docker compose up -d postgres redis

# Attendre que PostgreSQL soit prêt (30-60s)
docker compose exec postgres pg_isready -U prospection -d prospection_prod

# Créer les bases de données supplémentaires
docker compose exec postgres psql -U prospection << 'SQL'
CREATE DATABASE n8n_prod;
CREATE DATABASE langfuse_prod;
CREATE DATABASE metabase_prod;
GRANT ALL PRIVILEGES ON DATABASE n8n_prod TO prospection;
GRANT ALL PRIVILEGES ON DATABASE langfuse_prod TO prospection;
GRANT ALL PRIVILEGES ON DATABASE metabase_prod TO prospection;

-- Rôle read-only pour Metabase
CREATE ROLE metabase_reader WITH LOGIN PASSWORD 'METABASE_READER_PASSWORD';
GRANT CONNECT ON DATABASE prospection_prod TO metabase_reader;
GRANT USAGE ON SCHEMA prospection TO metabase_reader;
SQL

# Vérifier Redis
docker compose exec redis redis-cli -a ${REDIS_PASSWORD} ping
# → PONG

# Appliquer les migrations Prisma
docker compose run --rm app npx prisma migrate deploy

# Vérifier les tables créées
docker compose exec postgres psql -U prospection -d prospection_prod \
  -c "\dt prospection.*"
```

---

## Étape 5 — Démarrage de tous les services

```bash
cd /opt/prospection-agentic

# Build de l'image de l'application
docker compose build app

# Démarrer tous les services
docker compose up -d

# Surveiller le démarrage
docker compose ps
docker compose logs -f --tail=50

# Attendre que tous les services soient healthy (2-3 minutes)
watch docker compose ps

# Vérifier les health checks
curl -s https://votre-domaine.com/api/health | jq
```

### Réponse attendue de /api/health

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "memory_heap": { "status": "up" }
  },
  "error": {},
  "details": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "memory_heap": { "status": "up", "usedHeapSize": 145285120 }
  }
}
```

---

## Étape 6 — Configuration Caddy SSL

Caddy obtient automatiquement les certificats Let's Encrypt au premier démarrage. Vérifier que les DNS ont bien propagé avant cette étape.

```bash
# Vérifier les certificats
docker compose exec caddy caddy trust

# Logs Caddy pour voir les obtentions de certificats
docker compose logs caddy --tail=100

# Test SSL
curl -I https://votre-domaine.com
# → HTTP/2 200
# → strict-transport-security: max-age=31536000...

# Tester tous les sous-domaines
for subdomain in n8n langfuse metabase queues; do
  echo "Testing https://${subdomain}.votre-domaine.com..."
  curl -s -o /dev/null -w "%{http_code}" \
    "https://${subdomain}.votre-domaine.com" || echo "FAIL"
done
```

---

## Étape 7 — Configuration n8n

```bash
# Accéder à n8n: https://n8n.votre-domaine.com
# Login: N8N_BASIC_AUTH_USER / N8N_BASIC_AUTH_PASSWORD

# 1. Créer un compte admin au premier accès
# 2. Configurer les credentials (Settings → Credentials):
#    - Anthropic: apiKey = ANTHROPIC_API_KEY
#    - PostgreSQL: host=postgres, port=5432, database=n8n_prod
#    - Slack: webhookUrl = SLACK_WEBHOOK_URL
#    - Gmail OAuth2

# 3. Importer les workflows depuis le dépôt
# Fichiers dans: infrastructure/n8n/workflows/*.json
# Menu: Workflows → Import from File

# 4. Activer les workflows
# Vérifier que le trigger webhook est actif pour chaque workflow

# 5. Tester le webhook de santé
curl -X POST https://n8n.votre-domaine.com/webhook/health-check \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

---

## Étape 8 — Configuration Langfuse

```bash
# Accéder à Langfuse: https://langfuse.votre-domaine.com
# Créer un compte admin

# 1. Créer un projet "prospection-production"
# 2. Générer les clés API (Settings → API Keys):
#    - Public Key → LANGFUSE_PUBLIC_KEY dans .env
#    - Secret Key → LANGFUSE_SECRET_KEY dans .env
# 3. Configurer la rétention des données: 90 jours
# 4. Activer le score tracking pour l'évaluation des prompts

# Redémarrer l'app pour prendre en compte les nouvelles clés
docker compose restart app
```

---

## Étape 9 — Configuration Metabase

```bash
# Accéder à Metabase: https://metabase.votre-domaine.com
# (Premier démarrage prend 2-3 minutes)

# 1. Suivre le wizard de setup:
#    - Language: French
#    - Admin: prénom, nom, email, mot de passe
#    - Database:
#      * Type: PostgreSQL
#      * Host: postgres
#      * Port: 5432
#      * Database: prospection_prod
#      * Username: metabase_reader
#      * Password: METABASE_READER_PASSWORD

# 2. Une fois connecté, créer les dashboards
# Menu: New → Dashboard → "Pipeline Prospection"

# 3. Configurer le rafraîchissement auto
# Edit Dashboard → Auto-refresh: 30 minutes

# 4. (Optionnel) Partager les dashboards avec liens publics
# Edit Card → Sharing → Public link
```

---

## Étape 10 — Checklist Go-Live

```bash
#!/bin/bash
# infrastructure/scripts/go-live-check.sh

DOMAIN="votre-domaine.com"
ERRORS=0

check() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd" &>/dev/null; then
    echo "  [OK] $name"
  else
    echo "  [FAIL] $name"
    ERRORS=$((ERRORS + 1))
  fi
}

echo "=== Go-Live Checklist ==="
echo ""

echo "--- DNS ---"
check "A record principal" "dig +short $DOMAIN | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'"
check "A record n8n" "dig +short n8n.$DOMAIN | grep -E '^[0-9]+'"
check "A record langfuse" "dig +short langfuse.$DOMAIN | grep -E '^[0-9]+'"
check "A record metabase" "dig +short metabase.$DOMAIN | grep -E '^[0-9]+'"

echo ""
echo "--- SSL ---"
check "SSL principal" "curl -sf https://$DOMAIN/api/health"
check "SSL n8n" "curl -skf https://n8n.$DOMAIN/healthz"
check "SSL langfuse" "curl -sf https://langfuse.$DOMAIN/api/public/health"

echo ""
echo "--- Services ---"
check "App health" "curl -sf https://$DOMAIN/api/health | jq -e '.status == \"ok\"'"
check "PostgreSQL" "docker compose -f /opt/prospection-agentic/docker-compose.yml exec -T postgres pg_isready"
check "Redis" "docker compose -f /opt/prospection-agentic/docker-compose.yml exec -T redis redis-cli ping | grep PONG"

echo ""
echo "--- Sécurité ---"
check "HSTS header" "curl -sI https://$DOMAIN | grep -i 'strict-transport-security'"
check "X-Frame-Options" "curl -sI https://$DOMAIN | grep -i 'x-frame-options'"
check "Content-Security-Policy" "curl -sI https://$DOMAIN | grep -i 'content-security-policy'"
check "No Server header" "! curl -sI https://$DOMAIN | grep -i '^server:'"

echo ""
echo "--- Données ---"
check "DB migrations" "docker compose -f /opt/prospection-agentic/docker-compose.yml exec -T app npx prisma migrate status | grep 'Database schema is up to date'"
check "Redis connecté" "docker compose -f /opt/prospection-agentic/docker-compose.yml exec -T redis redis-cli -a \$REDIS_PASSWORD info server | grep 'redis_version'"

echo ""
echo "--- Monitoring ---"
check "Langfuse accessible" "curl -sf https://langfuse.$DOMAIN/api/public/health | jq -e '.status == \"ok\"'"
check "Metabase accessible" "curl -sf https://metabase.$DOMAIN/api/health | jq -e '.status == \"ok\"'"

echo ""
if [ $ERRORS -eq 0 ]; then
  echo "RESULTAT: Tous les checks passent. Systeme pret pour la production!"
else
  echo "RESULTAT: $ERRORS checks echoues. Corriger avant mise en production."
  exit 1
fi
```

```bash
# Exécuter la checklist
bash /opt/prospection-agentic/infrastructure/scripts/go-live-check.sh
```

---

## Maintenance quotidienne

### Commandes utiles

```bash
# Statut de tous les services
cd /opt/prospection-agentic && docker compose ps

# Logs en temps réel
docker compose logs -f app --tail=100
docker compose logs -f --tail=50

# Redémarrer un service spécifique
docker compose restart app

# Mise à jour de l'application (déclenchée par CI/CD)
git pull origin main
docker compose build app
docker compose up -d app
docker compose exec app npx prisma migrate deploy

# Nettoyer les images Docker non utilisées (mensuel)
docker image prune -af --filter "until=720h"

# Backup manuel immédiat
docker compose exec postgres pg_dump \
  -U prospection prospection_prod \
  | gzip > /backups/manual_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Surveillance des ressources

```bash
# CPU/RAM/Disque
htop
df -h
du -sh /var/lib/docker/volumes/*

# Connexions PostgreSQL actives
docker compose exec postgres psql -U prospection -d prospection_prod \
  -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Files BullMQ (via Redis)
docker compose exec redis redis-cli -a $REDIS_PASSWORD \
  --no-auth-warning keys "bull:*" | wc -l
```
