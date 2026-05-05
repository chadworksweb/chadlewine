#!/usr/bin/env bash
# Phase B: standalone singles (loose files). --force overwrites old
# zip-pack paths currently stored on these song rows.
set -e

run() {
  echo ""
  echo "================================================================="
  echo "PHASE B: $@"
  echo "================================================================="
  npx tsx scripts/upload-album-downloads.ts "$@" --force 2>&1 || echo "  ^^ FAILED ^^"
}

run --album "008B Boomerang" --song boomerang
run --album "008C Riptide" --song riptide-acoustic
run --album "009B 35" --song 35
run --album "009C Dark Nights" --song dark-nights
run --album "011A Choose Lit" --song choose-lit
run --album "004A HYVSB" --song hope-you-visit-soon-bro
