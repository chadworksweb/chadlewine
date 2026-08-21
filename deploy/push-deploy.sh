#!/usr/bin/env bash
# Deploy chadlewine from THIS workstation.
#
#   ./deploy/push-deploy.sh staging     staging branch -> cl-staging (3005)
#   ./deploy/push-deploy.sh prod        master branch  -> cl-prod    (3006)
#
# It bundles the commits the droplet does not have yet, copies them over the SSH
# connection that already exists for deploying, and runs that instance's own
# deploy.sh against the bundle.
#
# WHY, rather than the droplet fetching for itself: outbound SSH from
# le-projects-01 to GitHub is refused on every port (2026-08-21). The droplet
# does not otherwise need to reach GitHub for anything, so rather than put a
# token on a public web server to use HTTPS, the machine that already has GitHub
# access does the fetching. It also means a GitHub outage or a revoked deploy
# key no longer blocks shipping code that is already sitting here.
#
# Nothing about the deploy model changes. Prod is still --ff-only, so it cannot
# diverge or carry an ad-hoc edit made on the box; staging is still a hard reset
# to the branch, so it stays a pure mirror. `git rev-parse HEAD` on either
# instance still answers what is actually running.
#
# IT DOES NOT REQUIRE THE BRANCH TO BE CHECKED OUT. What ships is the local
# branch ref, which is committed by definition, so whatever is in the working
# tree is irrelevant to what lands. That matters here because master and staging
# both get deployed from a workstation that is usually sitting on a feature
# branch.
#
# Sibling copies live in the psyche-facts and leam repos.
set -euo pipefail

REMOTE_HOST="deploy@138.197.111.66"

cd "$(dirname "$0")/.."

ENV="${1:-}"
case "$ENV" in
  prod)    BRANCH="master";  REMOTE_DIR="/home/deploy/chadlewine-prod" ;;
  staging) BRANCH="staging"; REMOTE_DIR="/home/deploy/chadlewine-staging" ;;
  *)
    echo "Usage: ./deploy/push-deploy.sh [staging|prod]" >&2
    exit 1
    ;;
esac

if ! git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  echo "No local branch '$BRANCH'." >&2
  exit 1
fi

LOCAL="$(git rev-parse "$BRANCH")"

# Only worth mentioning when the branch being shipped is the one checked out,
# because that is the only case where a dirty tree could mislead.
if [ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] && [ -n "$(git status --porcelain)" ]; then
  echo "NOTE: $BRANCH is checked out and the tree is dirty. Uncommitted work will NOT ship."
fi

if git rev-parse "origin/$BRANCH" >/dev/null 2>&1; then
  if [ "$(git rev-parse "origin/$BRANCH")" != "$LOCAL" ]; then
    echo "NOTE: local $BRANCH differs from origin/$BRANCH. Consider pushing first."
  fi
fi

echo "Deploying $ENV from $BRANCH ..."
REMOTE_HEAD="$(ssh -o ConnectTimeout=20 "$REMOTE_HOST" "cd $REMOTE_DIR && git rev-parse HEAD" 2>/dev/null || true)"

if [ -z "$REMOTE_HEAD" ]; then
  echo "Could not read the droplet's HEAD. Is $REMOTE_DIR a clone?" >&2
  exit 1
fi

echo "  droplet: ${REMOTE_HEAD:0:9}"
echo "  local:   ${LOCAL:0:9}"

if [ "$REMOTE_HEAD" = "$LOCAL" ]; then
  echo "Already up to date. Nothing to send."
  exit 0
fi

# A bundle of just the delta rather than the whole branch, which matters on a
# repo with real history. It needs the droplet to already have the base commit.
#
# Staging hard-resets rather than fast-forwards, so its HEAD can legitimately be
# a commit this branch no longer contains. Sending the whole branch is correct
# in that case rather than an error.
if git cat-file -e "$REMOTE_HEAD^{commit}" 2>/dev/null && \
   git merge-base --is-ancestor "$REMOTE_HEAD" "$BRANCH" 2>/dev/null; then
  RANGE="$REMOTE_HEAD..$BRANCH"
else
  echo "  (droplet is not an ancestor of $BRANCH, sending the whole branch)"
  RANGE=""
fi

BUNDLE="$(mktemp -t chadlewine-XXXXXX.bundle)"
trap 'rm -f "$BUNDLE"' EXIT

echo "Bundling ${RANGE:-$BRANCH} ..."
if [ -n "$RANGE" ]; then
  git bundle create "$BUNDLE" $RANGE "$BRANCH" >/dev/null
else
  git bundle create "$BUNDLE" "$BRANCH" >/dev/null
fi

REMOTE_BUNDLE="/tmp/chadlewine-$ENV-$(date +%s).bundle"
echo "Copying $(du -h "$BUNDLE" | cut -f1) ..."
scp -q -o ConnectTimeout=20 "$BUNDLE" "$REMOTE_HOST:$REMOTE_BUNDLE"

ssh -o ConnectTimeout=20 "$REMOTE_HOST" \
  "cd $REMOTE_DIR && ./deploy.sh $REMOTE_BUNDLE; rm -f $REMOTE_BUNDLE"
