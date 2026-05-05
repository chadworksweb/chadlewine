#!/usr/bin/env bash
# One-shot dry-run sweep. Lists every planned upload + DB write for all
# remaining albums and standalone singles. Run from chadlewine repo root.
set -e

run() {
  echo ""
  echo "================================================================="
  echo "ALBUM/SINGLE: $@"
  echo "================================================================="
  npx tsx scripts/upload-album-downloads.ts "$@" --dry-run 2>&1 || echo "  ^^ FAILED ^^"
}

# Phase A: full albums with zip packs.
run --album "000 Demoesque"
run --album "002 Williamsburgadelphia"
run --album "003 Life as as Student" --album-slug life-as-a-student
run --album "004 HoneyChrome"
run --album "005 Daylight Animal"
run --album "006 All The Right Places"
run --album "007 Sprout" --album-slug sprout
run --album "008 Feeling High"
run --album "009 The Gap"
run --album "010 Pivotal Days"
run --album "011 HYPERISING"

# Phase B: standalone singles (loose files, no album row in DB).
run --album "008B Boomerang" --song boomerang
run --album "008C Riptide" --song riptide-acoustic
run --album "009B 35" --song 35
run --album "009C Dark Nights" --song dark-nights
run --album "011A Choose Lit" --song choose-lit
run --album "004A HYVSB" --song hope-you-visit-soon-bro
