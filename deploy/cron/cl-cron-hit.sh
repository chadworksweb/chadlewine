#!/usr/bin/env bash
# chadlewine.com PRODUCTION cron hitter (le-projects-01). PROD ONLY.
# Reads CRON_SECRET from the prod .env so the secret lives in exactly one place.
# Installed on the droplet at /usr/local/bin/cl-cron-hit.sh (chmod 755).
set -euo pipefail
ENVF="/home/deploy/chadlewine-prod/.env"
SECRET="$(grep -m1 '^CRON_SECRET=' "$ENVF" | cut -d= -f2-)"
exec curl -fsS -m 300 -H "Authorization: Bearer ${SECRET}" "https://chadlewine.com/api/cron/$1"
