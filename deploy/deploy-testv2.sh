#!/usr/bin/env bash
# Updates the V2 test environment (https://testv2.cafenoir.tn) on the server.
#   ssh -p 2222 user@<server> 'bash /var/www/CNv2/deploy/deploy-testv2.sh'
# Backs up the test database, pulls main, installs, builds, restarts. Migrations run at start-up.
set -euo pipefail
cd /var/www/CNv2
DB=/var/www/CNv2/server/data/cnv2-test.sqlite3
if [ -f "$DB" ]; then
  DB_PATH="$DB" BACKUP_DIR=/var/www/CNv2/server/data/backups npx tsx server/scripts/backup.ts
fi
git pull --ff-only origin main
npm ci
npm run build
pm2 restart cnv2-test
pm2 save
echo "testv2 mis à jour : $(git rev-parse --short HEAD)"
