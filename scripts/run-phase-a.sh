#!/usr/bin/env bash
# Phase A: full albums with zip packs. No --force (fills nulls only).
set -e

run() {
  echo ""
  echo "================================================================="
  echo "PHASE A: $@"
  echo "================================================================="
  npx tsx scripts/upload-album-downloads.ts "$@" 2>&1 || echo "  ^^ FAILED ^^"
}

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
