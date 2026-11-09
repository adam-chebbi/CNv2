#!/usr/bin/env bash
# Deploys main to a target, on the server:   bash deploy/deploy.sh <testv2|production>
#
# 1. backs up the database            4. restarts the process (pm2) with the new version
# 2. pulls main, installs              5. waits for /api/health to answer "database: ok"
# 3. builds into dist.next, then swaps 6. if it does not within 60 s: rolls back code, build and
#    it in (the old build is kept)        process to the previous version, and exits in error
#
# Migrations are additive only, so the previous version keeps working on the migrated database.
# production reads APP_DIR, PM2_NAME, PORT and DB from /etc/cafenoir/deploy.env.
set -euo pipefail

TARGET="${1:-}"
case "$TARGET" in
  testv2)
    APP_DIR=/var/www/CNv2
    PM2_NAME=cnv2-test
    PORT=3021
    DB=/var/www/CNv2/server/data/cnv2-test.sqlite3
    ;;
  production)
    ENV_FILE=/etc/cafenoir/deploy.env
    [ -f "$ENV_FILE" ] || { echo "Fichier $ENV_FILE manquant (APP_DIR, PM2_NAME, PORT, DB)." >&2; exit 1; }
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    ;;
  *)
    echo "usage: deploy.sh <testv2|production>" >&2
    exit 1
    ;;
esac

cd "$APP_DIR"
log() { echo "[$(date '+%H:%M:%S')] $*"; }

PREV=$(git rev-parse HEAD)
if [ -f "$DB" ]; then
  log "Sauvegarde de la base"
  DB_PATH="$DB" BACKUP_DIR="$(dirname "$DB")/backups" npx tsx server/scripts/backup.ts
fi

log "Récupération de main"
git pull --ff-only origin main
NEW=$(git rev-parse HEAD)
if [ "$NEW" = "$PREV" ] && [ "${FORCE:-0}" != "1" ]; then
  log "Déjà à jour ($(git rev-parse --short HEAD)). FORCE=1 pour reconstruire."
  exit 0
fi

build() {
  npm ci --no-audit --no-fund
  rm -rf dist.next
  npx vite build --outDir dist.next --emptyOutDir
  rm -rf dist.prev
  [ -d dist ] && mv dist dist.prev
  mv dist.next dist
}

restart() {
  APP_VERSION=$(git rev-parse --short HEAD) pm2 restart "$PM2_NAME" --update-env >/dev/null
}

healthy() {
  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:${PORT}/api/health" 2>/dev/null | grep -q '"database":"ok"'; then return 0; fi
    sleep 1
  done
  return 1
}

log "Installation et construction de $(git rev-parse --short HEAD)"
build
log "Redémarrage de $PM2_NAME"
restart

if healthy; then
  pm2 save >/dev/null
  log "OK : $TARGET en $(git rev-parse --short HEAD) (précédente : ${PREV:0:7})"
  exit 0
fi

log "ÉCHEC du contrôle de santé : retour à ${PREV:0:7}"
pm2 logs "$PM2_NAME" --lines 40 --nostream || true
git reset --hard "$PREV"
npm ci --no-audit --no-fund
if [ -d dist.prev ]; then
  rm -rf dist && mv dist.prev dist
else
  npm run build
fi
restart
if healthy; then log "Version précédente rétablie."; else log "La version précédente ne répond pas non plus : intervention nécessaire."; fi
exit 1
