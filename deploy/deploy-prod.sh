#!/usr/bin/env bash
# chadlewine PRODUCTION promote. Run on le-projects-01 as `deploy` from
# /home/deploy/chadlewine-prod (this script is copied there as deploy.sh).
# Promotion-only: fast-forward master ONLY. --ff-only REFUSES anything that is
# not a clean fast-forward, so prod can never diverge or take an ad-hoc change.
# .env is gitignored so it survives the checkout.
set -euo pipefail
cd "$(dirname "$0")"
git fetch origin
git checkout master
git merge --ff-only origin/master
docker compose up -d --build
docker image prune -f
echo "prod promoted: $(git rev-parse --short HEAD)"
