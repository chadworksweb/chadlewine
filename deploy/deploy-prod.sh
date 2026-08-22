#!/usr/bin/env bash
# chadlewine PRODUCTION promote. Run on le-projects-01 as `deploy` from
# /home/deploy/chadlewine-prod (this script is copied there as deploy.sh).
# Promotion-only: fast-forward master ONLY. --ff-only REFUSES anything that is
# not a clean fast-forward, so prod can never diverge or take an ad-hoc change.
# .env is gitignored so it survives the checkout.
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

git fetch "$SOURCE" master
git checkout master
# FETCH_HEAD rather than origin/master, because a bundle sets the first and not
# the second. --ff-only means this still refuses to do anything clever.
git merge --ff-only FETCH_HEAD
docker compose up -d --build
docker image prune -f
echo "prod promoted: $(git rev-parse --short HEAD)"
