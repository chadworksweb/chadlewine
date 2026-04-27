#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

target_env="${1:-all}"

mapfile -t lines < <(grep -E "^(BUNNY_|NEXT_PUBLIC_BUNNY_)" .env.local)

PREVIEW_BRANCH="${PREVIEW_BRANCH:-staging}"

push_var() {
  local env="$1" key="$2" val="$3"
  echo "→ $key [$env${env:+ $PREVIEW_BRANCH}]"
  local args=("env" "add" "$key" "$env")
  [[ "$env" == "preview" ]] && args+=("$PREVIEW_BRANCH")
  args+=("--value" "$val" "--yes")
  if npx vercel "${args[@]}" >/tmp/vercel-env-out 2>&1; then
    echo "  added"
  else
    local err
    err="$(cat /tmp/vercel-env-out)"
    if echo "$err" | grep -q "already exists\|already has"; then
      echo "  exists — skipping"
    else
      echo "  ERROR:"
      echo "$err" | sed 's/^/    /'
    fi
  fi
}

envs=()
case "$target_env" in
  production) envs=(production) ;;
  preview)    envs=(preview) ;;
  all)        envs=(production preview) ;;
  *) echo "usage: $0 [production|preview|all]"; exit 1 ;;
esac

for env in "${envs[@]}"; do
  for line in "${lines[@]}"; do
    key="${line%%=*}"
    val="${line#*=}"
    val="${val%$'\r'}"
    push_var "$env" "$key" "$val"
  done
done

echo "Done."
