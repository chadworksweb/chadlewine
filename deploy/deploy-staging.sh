#!/usr/bin/env bash
# chadlewine STAGING deploy. Run on le-projects-01 as `deploy` from
# /home/deploy/chadlewine-staging (this script is copied there as deploy.sh).
# A staging clone is a pure mirror of origin/staging -- hard-reset, never merge.
# .env is gitignored so the reset never touches it.
set -euo pipefail
cd "$(dirname "$0")"
git fetch origin
git checkout staging
git reset --hard origin/staging
docker compose up -d --build
docker image prune -f
echo "staging deployed: $(git rev-parse --short HEAD)"
