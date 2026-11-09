#!/usr/bin/env bash
# Updates the V2 test environment (https://testv2.cafenoir.tn) on the server.
#   ssh -p 2222 user@<server> 'bash /var/www/CNv2/deploy/deploy-testv2.sh'
# Kept for habit: the real work (backup, build, health check, rollback) is in deploy.sh.
set -euo pipefail
exec bash "$(dirname "$0")/deploy.sh" testv2
