# Backup et Disaster Recovery

## Objectifs RTO/RPO

| Composant | RTO | RPO | Stratégie |
|-----------|-----|-----|-----------|
| PostgreSQL | 1 heure | 30 minutes | pg_dump quotidien + WAL archiving |
| Redis | 5 minutes | < 1 minute | AOF + RDB + snapshot toutes les 60s |
| Application | 10 minutes | N/A (stateless) | Redéploiement depuis GHCR |
| Volumes n8n/Langfuse | 2 heures | 24 heures | Backup quotidien |
| Secrets (.env) | 30 minutes | N/A | Vault/Secret Manager ou coffrefort hors-bande |

---

## PostgreSQL — Stratégie de Backup

### Backup quotidien automatisé (pg_dump)

```bash
#!/bin/bash
# /opt/prospection-agentic/infrastructure/scripts/backup-postgres.sh
# Cron: 0 3 * * * /opt/prospection-agentic/infrastructure/scripts/backup-postgres.sh

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────
BACKUP_DIR="/backups/postgres"
S3_BUCKET="${S3_BACKUP_BUCKET:-s3://votre-bucket-backup}"
ENCRYPTION_KEY_FILE="/etc/backup/encryption.key"
POSTGRES_USER="${POSTGRES_USER:-prospection}"
POSTGRES_DB="${POSTGRES_DB:-prospection_prod}"
RETENTION_LOCAL_DAYS=7
RETENTION_S3_DAYS=30
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
LOG_FILE="/var/log/backup-postgres.log"

# ─── Fonctions utilitaires ────────────────────────────────────────────────
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_FILE"; }

notify_slack() {
  local status="$1"
  local message="$2"
  if [ -n "$SLACK_WEBHOOK" ]; then
    local emoji=":white_check_mark:"
    [ "$status" = "error" ] && emoji=":x:"
    curl -sf -X POST "$SLACK_WEBHOOK" \
      -H 'Content-type: application/json' \
      --data "{\"text\":\"${emoji} PostgreSQL Backup: ${message}\"}" \
      || true
  fi
}

# ─── Préparation ──────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
DATE=$(date '+%Y-%m-%d_%H%M%S')
FILENAME="prospection_${DATE}.sql"
COMPRESSED="${FILENAME}.gz"
ENCRYPTED="${COMPRESSED}.enc"

log "Starting PostgreSQL backup: $FILENAME"
START_TIME=$(date +%s)

# ─── Dump PostgreSQL ──────────────────────────────────────────────────────
# Format custom pour une restauration flexible
docker compose -f /opt/prospection-agentic/docker-compose.yml \
  exec -T postgres \
  pg_dump \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --format=custom \
    --compress=9 \
    --no-acl \
    --no-owner \
    --verbose \
  > "${BACKUP_DIR}/${FILENAME}.dump" 2>> "$LOG_FILE"

if [ $? -ne 0 ]; then
  log "ERROR: pg_dump failed"
  notify_slack "error" "pg_dump FAILED for $POSTGRES_DB at $DATE"
  exit 1
fi

DUMP_SIZE=$(du -sh "${BACKUP_DIR}/${FILENAME}.dump" | cut -f1)
log "Dump completed: $DUMP_SIZE"

# ─── Compression ──────────────────────────────────────────────────────────
gzip -9 "${BACKUP_DIR}/${FILENAME}.dump"
mv "${BACKUP_DIR}/${FILENAME}.dump.gz" "${BACKUP_DIR}/${COMPRESSED}"

# ─── Chiffrement AES-256 ──────────────────────────────────────────────────
if [ -f "$ENCRYPTION_KEY_FILE" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
    -pass "file:${ENCRYPTION_KEY_FILE}" \
    -in "${BACKUP_DIR}/${COMPRESSED}" \
    -out "${BACKUP_DIR}/${ENCRYPTED}"
  rm "${BACKUP_DIR}/${COMPRESSED}"
  FINAL_FILE="${ENCRYPTED}"
  log "Encrypted: $FINAL_FILE"
else
  log "WARNING: No encryption key found, backup is NOT encrypted"
  FINAL_FILE="${COMPRESSED}"
fi

# ─── Upload S3 ────────────────────────────────────────────────────────────
if command -v aws &>/dev/null; then
  aws s3 cp "${BACKUP_DIR}/${FINAL_FILE}" \
    "${S3_BUCKET}/postgres/$(date '+%Y/%m')/${FINAL_FILE}" \
    --storage-class STANDARD_IA \
    --sse AES256 \
    >> "$LOG_FILE" 2>&1

  if [ $? -eq 0 ]; then
    log "Uploaded to S3: ${S3_BUCKET}/postgres/$(date '+%Y/%m')/${FINAL_FILE}"
  else
    log "ERROR: S3 upload failed"
    notify_slack "error" "S3 upload failed for $FINAL_FILE"
  fi
fi

# ─── Vérification de l'intégrité ──────────────────────────────────────────
log "Verifying backup integrity..."

# Déchiffrer et vérifier le dump
if [ -f "$ENCRYPTION_KEY_FILE" ]; then
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -pass "file:${ENCRYPTION_KEY_FILE}" \
    -in "${BACKUP_DIR}/${FINAL_FILE}" \
    | gunzip \
    | docker compose -f /opt/prospection-agentic/docker-compose.yml \
        exec -T postgres \
        pg_restore --list \
        > /dev/null 2>&1

  if [ $? -eq 0 ]; then
    log "Integrity check PASSED"
  else
    log "ERROR: Integrity check FAILED"
    notify_slack "error" "Backup integrity check FAILED for $FINAL_FILE"
    exit 1
  fi
fi

# ─── Rotation locale ──────────────────────────────────────────────────────
find "$BACKUP_DIR" -name "prospection_*.enc" -mtime +${RETENTION_LOCAL_DAYS} -delete
find "$BACKUP_DIR" -name "prospection_*.gz" -mtime +${RETENTION_LOCAL_DAYS} -delete
log "Local rotation: kept last ${RETENTION_LOCAL_DAYS} days"

# ─── Rotation S3 ──────────────────────────────────────────────────────────
if command -v aws &>/dev/null; then
  CUTOFF_DATE=$(date -d "-${RETENTION_S3_DAYS} days" '+%Y-%m-%d')
  aws s3 ls "${S3_BUCKET}/postgres/" --recursive \
    | awk "\$1 < \"$CUTOFF_DATE\" {print \$4}" \
    | while read key; do
        aws s3 rm "${S3_BUCKET}/${key}" || true
      done
  log "S3 rotation: kept last ${RETENTION_S3_DAYS} days"
fi

# ─── Rapport ──────────────────────────────────────────────────────────────
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
FINAL_SIZE=$(du -sh "${BACKUP_DIR}/${FINAL_FILE}" | cut -f1)

log "Backup completed in ${DURATION}s. File: ${FINAL_FILE} (${FINAL_SIZE})"
notify_slack "success" "Backup OK: ${FINAL_FILE} (${FINAL_SIZE}, ${DURATION}s)"

# Enregistrer dans PostgreSQL
docker compose -f /opt/prospection-agentic/docker-compose.yml \
  exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" << SQL
INSERT INTO prospection.metriques_daily (date, metric_name, metric_value, dimensions)
VALUES (CURRENT_DATE, 'backup_completed', 1, '{"type":"postgres","file":"${FINAL_FILE}","duration_s":${DURATION}}')
ON CONFLICT DO NOTHING;
SQL
```

### Crontab

```bash
# Éditer: crontab -e (en tant qu'utilisateur deploy)
# Backup PostgreSQL tous les jours à 3h00
0 3 * * * /opt/prospection-agentic/infrastructure/scripts/backup-postgres.sh >> /var/log/backup-postgres.log 2>&1

# Backup Redis tous les jours à 3h30
30 3 * * * /opt/prospection-agentic/infrastructure/scripts/backup-redis.sh >> /var/log/backup-redis.log 2>&1

# Backup volumes n8n/Langfuse tous les jours à 4h00
0 4 * * * /opt/prospection-agentic/infrastructure/scripts/backup-volumes.sh >> /var/log/backup-volumes.log 2>&1

# Test de restauration hebdomadaire (dimanche 5h00)
0 5 * * 0 /opt/prospection-agentic/infrastructure/scripts/test-restore.sh >> /var/log/backup-test.log 2>&1
```

### WAL Archiving (PostgreSQL 16)

```ini
# Dans /infrastructure/postgres/postgresql.conf
# WAL archiving pour Point-in-Time Recovery (PITR)
wal_level = replica
archive_mode = on
archive_command = 'gzip < %p > /backups/wal/%f.gz && aws s3 cp /backups/wal/%f.gz s3://votre-bucket/wal/%f.gz'
archive_timeout = 1800          # Force archive toutes les 30 minutes
restore_command = 'aws s3 cp s3://votre-bucket/wal/%f.gz - | gunzip > %p'
max_wal_size = 4GB
wal_compression = on
```

```bash
# Script de nettoyage WAL (hebdomadaire)
#!/bin/bash
# /opt/prospection-agentic/infrastructure/scripts/cleanup-wal.sh
# Garder uniquement les WAL des 7 derniers jours en S3

aws s3 ls s3://votre-bucket/wal/ \
  | awk "\$1 < \"$(date -d '-7 days' '+%Y-%m-%d')\" {print \$4}" \
  | xargs -I{} aws s3 rm "s3://votre-bucket/wal/{}"
```

---

## Redis — Persistance et Backup

### Configuration persistance (dans docker-compose.yml)

```yaml
redis:
  command: >
    redis-server
    --requirepass ${REDIS_PASSWORD}
    --maxmemory 1gb
    --maxmemory-policy noeviction
    # AOF — précision < 1 minute
    --appendonly yes
    --appendfilename "appendonly.aof"
    --appendfsync everysec
    --no-appendfsync-on-rewrite no
    --auto-aof-rewrite-percentage 100
    --auto-aof-rewrite-min-size 64mb
    # RDB — snapshots réguliers
    --save 3600 1
    --save 300 100
    --save 60 10000
    --rdbcompression yes
    --rdbfilename dump.rdb
```

### Script de backup Redis

```bash
#!/bin/bash
# /opt/prospection-agentic/infrastructure/scripts/backup-redis.sh

set -euo pipefail

BACKUP_DIR="/backups/redis"
S3_BUCKET="${S3_BACKUP_BUCKET:-s3://votre-bucket-backup}"
DATE=$(date '+%Y-%m-%d_%H%M%S')

mkdir -p "$BACKUP_DIR"

# 1. Forcer un BGSAVE pour avoir un RDB frais
docker compose -f /opt/prospection-agentic/docker-compose.yml \
  exec -T redis redis-cli -a "${REDIS_PASSWORD}" --no-auth-warning BGSAVE

# Attendre la fin du BGSAVE
for i in $(seq 1 30); do
  LAST_SAVE=$(docker compose -f /opt/prospection-agentic/docker-compose.yml \
    exec -T redis redis-cli -a "${REDIS_PASSWORD}" --no-auth-warning LASTSAVE)
  NOW=$(date +%s)
  DIFF=$((NOW - LAST_SAVE))
  if [ "$DIFF" -lt 60 ]; then
    echo "BGSAVE completed ($(date -d @$LAST_SAVE))"
    break
  fi
  sleep 2
done

# 2. Copier le RDB depuis le volume Docker
docker cp prospection-redis:/data/dump.rdb "${BACKUP_DIR}/dump_${DATE}.rdb"
docker cp prospection-redis:/data/appendonly.aof "${BACKUP_DIR}/aof_${DATE}.aof"

# 3. Compresser et chiffrer
tar -czf "${BACKUP_DIR}/redis_${DATE}.tar.gz" \
  -C "$BACKUP_DIR" \
  "dump_${DATE}.rdb" "aof_${DATE}.aof"

if [ -f "/etc/backup/encryption.key" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
    -pass "file:/etc/backup/encryption.key" \
    -in "${BACKUP_DIR}/redis_${DATE}.tar.gz" \
    -out "${BACKUP_DIR}/redis_${DATE}.tar.gz.enc"
  rm "${BACKUP_DIR}/redis_${DATE}.tar.gz" \
     "${BACKUP_DIR}/dump_${DATE}.rdb" \
     "${BACKUP_DIR}/aof_${DATE}.aof"
fi

# 4. Upload S3
aws s3 cp "${BACKUP_DIR}/redis_${DATE}.tar.gz.enc" \
  "${S3_BUCKET}/redis/$(date '+%Y/%m')/redis_${DATE}.tar.gz.enc" \
  --storage-class STANDARD_IA \
  --sse AES256

# 5. Rotation locale (garder 3 jours)
find "$BACKUP_DIR" -name "redis_*.enc" -mtime +3 -delete

echo "Redis backup completed: redis_${DATE}.tar.gz.enc"
```

---

## Backup des Volumes Applicatifs

```bash
#!/bin/bash
# /opt/prospection-agentic/infrastructure/scripts/backup-volumes.sh

VOLUMES=("n8n_data" "langfuse_data" "metabase_data" "caddy_data")
BACKUP_DIR="/backups/volumes"
DATE=$(date '+%Y-%m-%d_%H%M%S')
S3_BUCKET="${S3_BACKUP_BUCKET:-s3://votre-bucket-backup}"

mkdir -p "$BACKUP_DIR"

for VOLUME in "${VOLUMES[@]}"; do
  echo "Backing up volume: $VOLUME"

  # Utiliser un conteneur temporaire pour accéder au volume
  docker run --rm \
    -v "${VOLUME}:/data:ro" \
    -v "${BACKUP_DIR}:/backup" \
    alpine:3.19 \
    tar -czf "/backup/${VOLUME}_${DATE}.tar.gz" /data

  # Chiffrer
  if [ -f "/etc/backup/encryption.key" ]; then
    openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
      -pass "file:/etc/backup/encryption.key" \
      -in "${BACKUP_DIR}/${VOLUME}_${DATE}.tar.gz" \
      -out "${BACKUP_DIR}/${VOLUME}_${DATE}.tar.gz.enc"
    rm "${BACKUP_DIR}/${VOLUME}_${DATE}.tar.gz"
  fi

  # Upload S3
  aws s3 cp "${BACKUP_DIR}/${VOLUME}_${DATE}.tar.gz.enc" \
    "${S3_BUCKET}/volumes/${VOLUME}/$(date '+%Y/%m')/${VOLUME}_${DATE}.tar.gz.enc"

  echo "  Done: ${VOLUME}_${DATE}.tar.gz.enc"
done

# Rotation S3 (garder 14 jours pour les volumes)
for VOLUME in "${VOLUMES[@]}"; do
  aws s3 ls "${S3_BUCKET}/volumes/${VOLUME}/" --recursive \
    | awk "\$1 < \"$(date -d '-14 days' '+%Y-%m-%d')\" {print \$4}" \
    | xargs -I{} aws s3 rm "${S3_BUCKET}/{}" || true
done
```

---

## Chiffrement des Backups

### Génération et gestion de la clé

```bash
# Générer la clé de chiffrement (une seule fois)
sudo mkdir -p /etc/backup
sudo openssl rand -base64 32 > /etc/backup/encryption.key
sudo chmod 400 /etc/backup/encryption.key
sudo chown root:root /etc/backup/encryption.key

# CRITIQUE: Sauvegarder cette clé HORS DU SERVEUR
# Options:
# 1. Bitwarden/1Password partagé avec l'équipe
# 2. AWS Secrets Manager
# 3. Hetzner Cloud Secret Manager
# 4. Clé GPG sur clé USB sécurisée

# Vérifier la clé
ls -la /etc/backup/encryption.key
# -r-------- 1 root root 45 2025-01-01 encryption.key

# Tester le chiffrement/déchiffrement
echo "test data" | openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass "file:/etc/backup/encryption.key" | \
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass "file:/etc/backup/encryption.key"
# → test data
```

---

## Configuration S3 (Hetzner Object Storage / AWS S3)

```bash
# Hetzner Object Storage est compatible S3 et RGPD (EU)
# Coût: ~0.005€/GB/mois stockage + 0.01€/GB transfert sortant

# Installer aws CLI
pip3 install awscli

# Configurer pour Hetzner Object Storage
aws configure set aws_access_key_id HETZNER_ACCESS_KEY
aws configure set aws_secret_access_key HETZNER_SECRET_KEY
aws configure set default.region eu-central-1

# Créer l'alias pour Hetzner
cat >> ~/.bashrc << 'EOF'
alias s3-backup="aws s3 --endpoint-url https://nbg1.your-objectstorage.com"
EOF

# Créer le bucket
aws s3 mb s3://prospection-backups \
  --endpoint-url https://nbg1.your-objectstorage.com

# Configurer la lifecycle policy (rotation automatique S3)
cat > /tmp/lifecycle.json << 'EOF'
{
  "Rules": [
    {
      "ID": "postgres-rotation",
      "Status": "Enabled",
      "Filter": { "Prefix": "postgres/" },
      "Expiration": { "Days": 30 }
    },
    {
      "ID": "redis-rotation",
      "Status": "Enabled",
      "Filter": { "Prefix": "redis/" },
      "Expiration": { "Days": 7 }
    },
    {
      "ID": "wal-rotation",
      "Status": "Enabled",
      "Filter": { "Prefix": "wal/" },
      "Expiration": { "Days": 7 }
    },
    {
      "ID": "volumes-rotation",
      "Status": "Enabled",
      "Filter": { "Prefix": "volumes/" },
      "Expiration": { "Days": 14 }
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket prospection-backups \
  --lifecycle-configuration file:///tmp/lifecycle.json \
  --endpoint-url https://nbg1.your-objectstorage.com
```

---

## Procédures de Restauration

### Restauration PostgreSQL complète

```bash
#!/bin/bash
# /opt/prospection-agentic/infrastructure/scripts/restore-postgres.sh
# Usage: ./restore-postgres.sh <backup-file-or-date>
# Exemple: ./restore-postgres.sh 2025-01-15_030000
#          ./restore-postgres.sh /backups/postgres/prospection_2025-01-15_030000.sql.dump.gz.enc

set -euo pipefail

RESTORE_TARGET="${1:-}"
POSTGRES_USER="${POSTGRES_USER:-prospection}"
POSTGRES_DB="${POSTGRES_DB:-prospection_prod}"
TEMP_DB="${POSTGRES_DB}_restore_$(date +%s)"

if [ -z "$RESTORE_TARGET" ]; then
  echo "Usage: $0 <date-prefix|file-path>"
  echo "Available backups:"
  ls -lt /backups/postgres/ | head -10
  exit 1
fi

# Résoudre le fichier à restaurer
if [ -f "$RESTORE_TARGET" ]; then
  BACKUP_FILE="$RESTORE_TARGET"
elif [ -f "/backups/postgres/prospection_${RESTORE_TARGET}.sql.dump.gz.enc" ]; then
  BACKUP_FILE="/backups/postgres/prospection_${RESTORE_TARGET}.sql.dump.gz.enc"
else
  echo "Searching S3..."
  aws s3 ls "s3://votre-bucket/postgres/" --recursive | grep "$RESTORE_TARGET" | head -5
  echo "Download manually and re-run with file path"
  exit 1
fi

echo "Restoring from: $BACKUP_FILE"
echo "Target database: $POSTGRES_DB"
echo ""

# AVERTISSEMENT
read -p "WARNING: This will REPLACE the production database. Type 'RESTORE' to continue: " CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Aborted"
  exit 0
fi

echo "Step 1: Stopping application..."
docker compose -f /opt/prospection-agentic/docker-compose.yml stop app

echo "Step 2: Decrypting backup..."
DECRYPTED_FILE="/tmp/restore_$(date +%s).dump"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass "file:/etc/backup/encryption.key" \
  -in "$BACKUP_FILE" \
  | gunzip > "$DECRYPTED_FILE"

echo "Step 3: Creating restore database..."
docker compose -f /opt/prospection-agentic/docker-compose.yml \
  exec -T postgres \
  createdb -U "$POSTGRES_USER" "$TEMP_DB"

echo "Step 4: Restoring to temp database..."
cat "$DECRYPTED_FILE" | docker compose -f /opt/prospection-agentic/docker-compose.yml \
  exec -T postgres \
  pg_restore \
    --username="$POSTGRES_USER" \
    --dbname="$TEMP_DB" \
    --no-owner \
    --no-acl \
    --verbose \
    2>&1

echo "Step 5: Verifying restore..."
TABLE_COUNT=$(docker compose -f /opt/prospection-agentic/docker-compose.yml \
  exec -T postgres psql -U "$POSTGRES_USER" -d "$TEMP_DB" -tA \
  -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='prospection'")

PROSPECT_COUNT=$(docker compose -f /opt/prospection-agentic/docker-compose.yml \
  exec -T postgres psql -U "$POSTGRES_USER" -d "$TEMP_DB" -tA \
  -c "SELECT COUNT(*) FROM prospection.prospects")

echo "  Tables: $TABLE_COUNT, Prospects: $PROSPECT_COUNT"

if [ "$TABLE_COUNT" -lt 10 ]; then
  echo "ERROR: Unexpected table count ($TABLE_COUNT). Aborting."
  docker compose -f /opt/prospection-agentic/docker-compose.yml \
    exec -T postgres dropdb -U "$POSTGRES_USER" "$TEMP_DB"
  exit 1
fi

echo "Step 6: Swapping databases..."
docker compose -f /opt/prospection-agentic/docker-compose.yml \
  exec -T postgres psql -U "$POSTGRES_USER" << SQL
-- Renommer l'actuel en backup
ALTER DATABASE ${POSTGRES_DB} RENAME TO ${POSTGRES_DB}_backup_$(date +%Y%m%d_%H%M%S);
-- Renommer le restore en production
ALTER DATABASE ${TEMP_DB} RENAME TO ${POSTGRES_DB};
SQL

echo "Step 7: Running migrations (if any)..."
docker compose -f /opt/prospection-agentic/docker-compose.yml \
  run --rm app npx prisma migrate deploy

echo "Step 8: Restarting application..."
docker compose -f /opt/prospection-agentic/docker-compose.yml start app

sleep 15
if curl -sf https://votre-domaine.com/api/health; then
  echo ""
  echo "RESTORE COMPLETED SUCCESSFULLY"
  echo "Old database saved as: ${POSTGRES_DB}_backup_..."
  rm -f "$DECRYPTED_FILE"
else
  echo "ERROR: Health check failed after restore!"
  exit 1
fi
```

### Restauration PostgreSQL PITR (Point-in-Time Recovery)

```bash
#!/bin/bash
# Restauration à un point précis dans le temps
# Usage: ./restore-postgres-pitr.sh "2025-01-15 14:30:00"

TARGET_TIME="$1"
POSTGRES_DATA="/var/lib/docker/volumes/prospection-agentic_postgres_data/_data"

echo "PITR restore to: $TARGET_TIME"

# 1. Arrêter PostgreSQL
docker compose stop postgres

# 2. Restaurer le dernier backup complet
# (Voir la procédure complète ci-dessus)

# 3. Configurer recovery.conf pour le PITR
cat > "${POSTGRES_DATA}/pgdata/recovery.conf" << EOF
restore_command = 'aws s3 cp s3://votre-bucket/wal/%f.gz - | gunzip > %p'
recovery_target_time = '${TARGET_TIME}'
recovery_target_action = 'promote'
EOF

# 4. Redémarrer PostgreSQL (il va rejouer les WAL jusqu'à TARGET_TIME)
docker compose start postgres

echo "PostgreSQL will replay WAL logs up to: $TARGET_TIME"
echo "Monitor with: docker compose logs -f postgres"
```

### Restauration Redis

```bash
#!/bin/bash
# /opt/prospection-agentic/infrastructure/scripts/restore-redis.sh
# Usage: ./restore-redis.sh <backup-date>

set -euo pipefail

BACKUP_DATE="${1:-}"
BACKUP_DIR="/backups/redis"

if [ -z "$BACKUP_DATE" ]; then
  echo "Available Redis backups:"
  ls -lt "$BACKUP_DIR" | head -10
  exit 1
fi

BACKUP_FILE="${BACKUP_DIR}/redis_${BACKUP_DATE}.tar.gz.enc"

echo "Step 1: Stopping application (to prevent writes)..."
docker compose stop app

echo "Step 2: Decrypting backup..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass "file:/etc/backup/encryption.key" \
  -in "$BACKUP_FILE" \
  | tar -xzf - -C /tmp

echo "Step 3: Stopping Redis..."
docker compose stop redis

echo "Step 4: Replacing data files..."
REDIS_DATA="/var/lib/docker/volumes/prospection-agentic_redis_data/_data"
cp /tmp/dump_*.rdb "${REDIS_DATA}/dump.rdb"
cp /tmp/aof_*.aof "${REDIS_DATA}/appendonly.aof" 2>/dev/null || true

echo "Step 5: Restarting Redis..."
docker compose start redis
sleep 5
docker compose exec redis redis-cli -a "${REDIS_PASSWORD}" --no-auth-warning ping

echo "Step 6: Restarting application..."
docker compose start app

echo "Redis restore completed"
rm -f /tmp/dump_*.rdb /tmp/aof_*.aof
```

---

## Tests de Restauration (Schedule hebdomadaire)

```bash
#!/bin/bash
# /opt/prospection-agentic/infrastructure/scripts/test-restore.sh
# Cron: Dimanche 5h00
# Teste la restauration sur une base de données temporaire

set -euo pipefail

TEST_DB="restore_test_$(date +%Y%m%d)"
LOG_FILE="/var/log/backup-test.log"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_FILE"; }
ERRORS=0

log "=== Weekly Restore Test Started ==="

# ─── Test 1: Dernière sauvegarde PostgreSQL ────────────────────────────────
log "Test 1: PostgreSQL restore to temp DB"

LATEST_BACKUP=$(ls -t /backups/postgres/*.enc 2>/dev/null | head -1)
if [ -z "$LATEST_BACKUP" ]; then
  log "FAIL: No backup files found"
  ERRORS=$((ERRORS + 1))
else
  # Déchiffrer
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -pass "file:/etc/backup/encryption.key" \
    -in "$LATEST_BACKUP" \
    | gunzip > /tmp/test_restore.dump

  # Créer base temporaire
  docker compose exec -T postgres \
    createdb -U "${POSTGRES_USER}" "$TEST_DB" 2>/dev/null || true

  # Restaurer
  cat /tmp/test_restore.dump | docker compose exec -T postgres \
    pg_restore \
      --username="${POSTGRES_USER}" \
      --dbname="$TEST_DB" \
      --no-owner --no-acl \
      2>&1 | tail -5

  # Vérifier
  TABLES=$(docker compose exec -T postgres psql \
    -U "${POSTGRES_USER}" -d "$TEST_DB" -tA \
    -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='prospection'")

  PROSPECTS=$(docker compose exec -T postgres psql \
    -U "${POSTGRES_USER}" -d "$TEST_DB" -tA \
    -c "SELECT COUNT(*) FROM prospection.prospects")

  log "  Tables restored: $TABLES"
  log "  Prospects in backup: $PROSPECTS"

  if [ "$TABLES" -lt 10 ]; then
    log "FAIL: Only $TABLES tables (expected >= 10)"
    ERRORS=$((ERRORS + 1))
  else
    log "PASS: PostgreSQL restore test"
  fi

  # Nettoyer
  docker compose exec -T postgres \
    dropdb -U "${POSTGRES_USER}" "$TEST_DB" 2>/dev/null || true
  rm -f /tmp/test_restore.dump
fi

# ─── Test 2: Intégrité du backup Redis ────────────────────────────────────
log "Test 2: Redis backup integrity"

LATEST_REDIS=$(ls -t /backups/redis/*.enc 2>/dev/null | head -1)
if [ -z "$LATEST_REDIS" ]; then
  log "FAIL: No Redis backup found"
  ERRORS=$((ERRORS + 1))
else
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -pass "file:/etc/backup/encryption.key" \
    -in "$LATEST_REDIS" \
    | tar -tzvf - > /dev/null 2>&1

  if [ $? -eq 0 ]; then
    log "PASS: Redis backup integrity OK"
  else
    log "FAIL: Redis backup is corrupted"
    ERRORS=$((ERRORS + 1))
  fi
fi

# ─── Test 3: Disponibilité S3 ─────────────────────────────────────────────
log "Test 3: S3 accessibility"

LATEST_S3=$(aws s3 ls "s3://votre-bucket/postgres/" --recursive \
  | sort | tail -1 | awk '{print $4}')

if [ -n "$LATEST_S3" ]; then
  log "PASS: Latest S3 backup: $LATEST_S3"
else
  log "FAIL: No backups found in S3"
  ERRORS=$((ERRORS + 1))
fi

# ─── Rapport final ────────────────────────────────────────────────────────
log "=== Restore Test Complete: $ERRORS errors ==="

if [ $ERRORS -eq 0 ]; then
  [ -n "$SLACK_WEBHOOK" ] && curl -sf -X POST "$SLACK_WEBHOOK" \
    --data "{\"text\":\":white_check_mark: Weekly restore test PASSED\"}" || true
else
  [ -n "$SLACK_WEBHOOK" ] && curl -sf -X POST "$SLACK_WEBHOOK" \
    --data "{\"text\":\":x: Weekly restore test FAILED: $ERRORS errors. Check $LOG_FILE\"}" || true
fi
```

---

## Runbook Disaster Recovery

### Scénario 1 — Corruption base de données

```
TEMPS TOTAL ESTIMÉ: 1h

T+0:    Alerte reçue (monitoring ou utilisateur)
T+5:    Évaluer l'étendue des dégâts
         → docker compose exec postgres psql -U prospection -c "SELECT COUNT(*) FROM prospects"
         → Si erreur: confirmer la corruption

T+10:   Stopper l'application (prévenir les écritures)
         → docker compose stop app

T+15:   Identifier le dernier backup sain
         → ls -lt /backups/postgres/*.enc | head -5
         → Choisir le plus récent avant l'incident

T+20:   Lancer la restauration
         → ./infrastructure/scripts/restore-postgres.sh YYYY-MM-DD_HHMMSS

T+50:   Vérification post-restauration
         → curl https://votre-domaine.com/api/health
         → Vérifier données récentes: SELECT MAX(created_at) FROM prospects

T+55:   Notifier l'équipe
         → Slack #incidents avec timeline et données perdues estimées

T+60:   Post-mortem prévu dans 24h
```

### Scénario 2 — VPS inaccessible (crash complet)

```
TEMPS TOTAL ESTIMÉ: 2h

T+0:    Alerte monitoring: site down
T+5:    Vérifier Hetzner Console:
         → console.hetzner.cloud → Check server status
         → Si "Server error": contacter le support Hetzner

T+10:   Si le serveur ne répond plus, créer un nouveau VPS:
         → Hetzner Console: New Server (même datacenter, même specs)
         → Utiliser la même clé SSH publique

T+30:   Provisionner le nouveau VPS
         → ssh root@NEW_IP
         → bash provision.sh
         → Installer Docker

T+45:   Récupérer les données depuis S3
         → mkdir -p /backups && aws s3 sync s3://votre-bucket/postgres/ /backups/postgres/
         → aws s3 sync s3://votre-bucket/redis/ /backups/redis/

T+60:   Restaurer PostgreSQL et Redis
         → ./infrastructure/scripts/restore-postgres.sh LATEST
         → ./infrastructure/scripts/restore-redis.sh LATEST

T+75:   Mettre à jour le DNS
         → Pointer votre-domaine.com vers NEW_IP
         → Attendre propagation: watch dig +short votre-domaine.com

T+90:   Déployer l'application
         → git clone, .env, docker compose up -d

T+110:  Tests de validation
         → Checklist go-live: ./infrastructure/scripts/go-live-check.sh

T+120:  Notifier et documenter
```

### Scénario 3 — Redis indisponible

```
TEMPS TOTAL ESTIMÉ: 5-15 minutes

T+0:    Alerte: jobs BullMQ ne s'exécutent plus
T+2:    Vérifier Redis: docker compose logs redis --tail=50
T+5:    Tenter redémarrage: docker compose restart redis
T+7:    Si Redis démarre mais données perdues:
         → ./infrastructure/scripts/restore-redis.sh LATEST
         → BullMQ recrée les jobs manquants automatiquement (jobs idempotents)
T+15:   Vérifier les queues: accéder à Bull Board (queues.votre-domaine.com)
```

### Scénario 4 — Certificat SSL expiré

```
Caddy renouvelle automatiquement. Si problème:

T+0:    Erreur SSL dans les navigateurs
T+2:    docker compose exec caddy caddy certificates list
T+5:    Si expiré: docker compose restart caddy
         Caddy tente le renouvellement au redémarrage
T+10:   Si Let's Encrypt rate limit (5 certificats/7 jours):
         → Utiliser le staging ACME: modifier Caddyfile
         → acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
T+30:   Si toujours en échec: utiliser Cloudflare DNS challenge
```

---

## Monitoring des Backups

```typescript
// src/modules/health/backup-health.indicator.ts
import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class BackupHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(): Promise<HealthIndicatorResult> {
    // Vérifier que le dernier backup date de moins de 26h (SLA: quotidien)
    const lastBackup = await this.prisma.metriquesDaily.findFirst({
      where: { metricName: 'backup_completed' },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastBackup) {
      throw new HealthCheckError(
        'backup',
        this.getStatus('backup', false, { error: 'No backup record found' }),
      );
    }

    const hoursSinceLastBackup =
      (Date.now() - lastBackup.createdAt.getTime()) / 3600000;

    if (hoursSinceLastBackup > 26) {
      throw new HealthCheckError(
        'backup',
        this.getStatus('backup', false, {
          lastBackup: lastBackup.createdAt,
          hoursSince: hoursSinceLastBackup.toFixed(1),
        }),
      );
    }

    return this.getStatus('backup', true, {
      lastBackup: lastBackup.createdAt,
      hoursSince: hoursSinceLastBackup.toFixed(1),
    });
  }
}
```
