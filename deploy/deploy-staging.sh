#!/usr/bin/env bash
# chadlewine STAGING deploy. Run on le-projects-01 as `deploy` from
# /home/deploy/chadlewine-staging (this script is copied there as deploy.sh).
# A staging clone is a pure mirror of origin/staging -- hard-reset, never merge.
# .env is gitignored so the reset never touches it.
#
#   ./deploy.sh                  fetch from origin (needs GitHub over SSH)
#   ./deploy.sh /tmp/x.bundle    take the commits from a git bundle instead
#
# THE BUNDLE FORM IS THE ONE THAT WORKS. Outbound SSH from this droplet to
# GitHub is refused on every port (found 2026-08-21; ufw allows all outgoing, so
# the block is upstream). HTTPS to GitHub still works, but using it would mean
# putting a token on a public web server, and the deploy step was the only
# reason this box ever reached GitHub. deploy/push-deploy.sh drives it from the
# workstation. The origin form is kept, so fixing the network needs no edit.
set -euo pipefail
cd "$(dirname "$0")"
SOURCE="${1:-origin}"

git fetch "$SOURCE" staging
git checkout staging
# FETCH_HEAD rather than origin/staging: a bundle sets the first, not the
# second. Still a hard reset, so staging stays a pure mirror.
git reset --hard FETCH_HEAD
docker compose up -d --build
docker image prune -f
echo "staging deployed: $(git rev-parse --short HEAD)"
