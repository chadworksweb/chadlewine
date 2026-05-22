#!/usr/bin/env python3
"""
set_beat_offset.py — Nudge a song's beat_data timing against the
published MP3 without re-analyzing.

Stems exported from Ableton rarely align to the millisecond with the
mastered MP3. The master may have limiter delay, intro fades, or
mastering edits not in the session. The visualizer adds
songs.beat_offset_seconds to every beat_data event at playback —
this script edits that value.

CONVENTION:
  POSITIVE offset = stems START AFTER the MP3. Visualizer pushes events
                    LATER (delays them) so a kick the analyzer marked at
                    1.000s actually fires at 1.030s if offset = 0.030.
                    Use when the cube is currently morphing BEFORE the
                    audible kick.
  NEGATIVE offset = stems start BEFORE the MP3. Pulls events EARLIER.
                    Use when the cube is morphing AFTER the kick lands.

ENV (reads .env.local at repo root):
  NEXT_PUBLIC_SUPABASE_URL=...
  SUPABASE_SERVICE_ROLE_KEY=...

USAGE:
  python scripts/set_beat_offset.py <slug> <offset_seconds>
  python scripts/set_beat_offset.py machine 0.045        # delay events 45ms
  python scripts/set_beat_offset.py machine -0.020       # advance events 20ms
  python scripts/set_beat_offset.py machine 0            # reset to no offset
  python scripts/set_beat_offset.py <slug> --show        # print current value, no change

WORKFLOW:
  1. Run the stem analyzer (writes beat_data, defaults offset to 0).
  2. Play the song on /music/songs/<slug>. Watch the cube against the audio.
  3. Cube too EARLY (morphs before the kick) -> positive offset, e.g. 0.030.
     Cube too LATE  (morphs after the kick)  -> negative offset, e.g. -0.030.
  4. Iterate in 10-30ms steps until the cube locks to the audio.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv


def find_env_file() -> Path | None:
    here = Path(__file__).resolve().parent
    for parent in [here, *here.parents]:
        for name in (".env.local", ".env"):
            p = parent / name
            if p.exists():
                return p
    return None


def supabase_client():
    from supabase import create_client
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def main() -> None:
    ap = argparse.ArgumentParser(description="Set songs.beat_offset_seconds for one song.")
    ap.add_argument("slug", help="Song slug")
    ap.add_argument("offset", nargs="?", default=None, type=float,
                    help="New offset in seconds (omit + use --show to read current value)")
    ap.add_argument("--show", action="store_true",
                    help="Print current offset without changing it")
    args = ap.parse_args()

    if not args.show and args.offset is None:
        ap.error("provide an offset value or use --show")

    env = find_env_file()
    if env:
        load_dotenv(env)

    missing = [k for k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") if k not in os.environ]
    if missing:
        print(f"Missing env vars: {missing}", file=sys.stderr)
        sys.exit(1)

    sb = supabase_client()
    res = sb.table("songs").select("slug, beat_offset_seconds").eq("slug", args.slug).execute()
    if not res.data:
        print(f"No song with slug={args.slug!r}", file=sys.stderr)
        sys.exit(1)
    cur = res.data[0].get("beat_offset_seconds")
    print(f"[{args.slug}] current offset: {cur} s")

    if args.show:
        return

    sb.table("songs").update({"beat_offset_seconds": args.offset}).eq("slug", args.slug).execute()
    print(f"[{args.slug}] updated offset: {args.offset} s")


if __name__ == "__main__":
    main()
