#!/usr/bin/env python3
"""
analyze_drums_stems.py — Multi-stem drum + bass analysis from isolated
audio stems exported from Ableton. Writes the sparse jsonb beat_data
column on songs.

A stem is one instrument/element bounced to its own audio file. Because
the file contains nothing but that element, every detectable onset IS
that element — no HPSS, no band-restriction, no per-song threshold
tuning. Run onset detection on each stem in isolation, then merge into
one time-sorted array of sparse hit objects.

SETUP (one time):
  pip install librosa soundfile supabase python-dotenv
  # ffmpeg on PATH for non-WAV stems.

EXPORTING STEMS FROM ABLETON:
  1. Solo the target track (or freeze + flatten). Render Length must
     span the FULL arrangement (start = 1.1.1, end = song end). Time 0
     of each stem must align with time 0 of the master mix.
  2. File -> Export Audio/Video. Format: WAV mono 24-bit (44.1 kHz is
     fine; script downsamples to 22.05 kHz internally).
  3. Repeat for each stem you want analyzed.

ENV (reads .env.local at repo root):
  NEXT_PUBLIC_SUPABASE_URL=...
  SUPABASE_SERVICE_ROLE_KEY=...

USAGE:
  python scripts/analyze_drums_stems.py <slug> \\
    --kick kick.wav --snare snare.wav --hat hat.wav --tom tom.wav \\
    --bass-pulse bass-pulse.wav --bass-synth bass-synth.wav
  # All stem flags are optional. Pass only the ones you have.

OUTPUT:
  Writes the sparse jsonb array to songs.beat_data:
    [{"at": 0.50, "k": 0.82}, {"at": 1.00, "s": 0.74, "h": 0.41}, ...]
  Each value is 0..1 normalized per-stem (95th-percentile).

  Per-stem hit count + first 5 timestamps printed for spot-checking.
  Multi-key rows (e.g., kick + tom simultaneous) reported separately.

KEY MAP (matches the jsonb schema):
  --kick        -> "k"     face bulge morph
  --snare       -> "s"     corner strobe
  --hat         -> "h"     rim brightness pulse
  --tom         -> "to"    cube position shake
  --bass-pulse  -> "bp"    uBass spike
  --bass-synth  -> "bs"    ambient palette shift
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv


# Maps the CLI flag to the jsonb key. Order matters only for diagnostic
# print order — the script writes all stems regardless.
STEM_KEYS: list[tuple[str, str, str]] = [
    # (argparse dest, jsonb key, friendly label)
    ("kick",       "k",  "kick"),
    ("snare",      "s",  "snare"),
    ("hat",        "h",  "hat"),
    ("tom",        "to", "tom"),
    ("bass_pulse", "bp", "bass pulse"),
    ("bass_synth", "bs", "bass synth"),
]


def _lazy_imports():
    import librosa
    import numpy as np
    return librosa, np


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


def detect_hits(stem_path: Path) -> list[tuple[float, float]]:
    """Return [(time_seconds, normalized_strength_0_to_1), ...] for every
    onset in the stem. 95th-percentile normalization per file so the top
    ~5% of hits clip at 1.0 and the rest spread across the meaningful
    range, matching the analyze_beats.py convention."""
    librosa, np = _lazy_imports()

    y, sr = librosa.load(str(stem_path), sr=22050, mono=True)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)

    # wait=2 frames at hop=512/sr=22050 = ~46ms minimum spacing between
    # hits. Prevents a single hard kick attack registering as two adjacent
    # hits while allowing fast drum-machine patterns (32nd-note kicks at
    # 180 BPM = 83ms). Acceptable for all six stem types.
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_env, sr=sr, units="frames", wait=2,
    )
    if onset_frames.size == 0:
        return []

    onset_times = librosa.frames_to_time(onset_frames, sr=sr)
    onset_strengths = onset_env[onset_frames]

    s_norm = float(np.percentile(onset_strengths, 95))
    if s_norm <= 0:
        s_norm = float(onset_strengths.max()) or 1.0

    return [(float(t), min(1.0, float(s) / s_norm)) for t, s in zip(onset_times, onset_strengths)]


def merge_into_beat_data(hits_by_key: dict[str, list[tuple[float, float]]]) -> list[dict]:
    """Time-sorted sparse jsonb array. Hits within 1ms quantize to the
    same row so simultaneous kick+tom (heavy programmed accent) appears
    as one entry with both keys present. The frontend dispatcher handles
    multi-key rows by firing every applicable effect."""
    QUANTIZE_MS = 0.001
    grid: dict[float, dict[str, float]] = {}
    for key, hits in hits_by_key.items():
        for t, strength in hits:
            bucket = round(round(t / QUANTIZE_MS) * QUANTIZE_MS, 3)
            cell = grid.setdefault(bucket, {})
            # If two hits of the same stem land in the same 1ms bucket
            # (flam, fast double-tap), keep the louder one. Visualizer
            # only fires once per row anyway.
            cell[key] = max(cell.get(key, 0.0), strength)

    out: list[dict] = []
    for t in sorted(grid.keys()):
        row: dict = {"at": round(t, 4)}
        for k, v in grid[t].items():
            row[k] = round(v, 4)
        out.append(row)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Multi-stem drum analysis -> songs.beat_data (jsonb).")
    ap.add_argument("slug", help="Song slug — the row in `songs` to update")
    for dest, _key, label in STEM_KEYS:
        flag = "--" + dest.replace("_", "-")
        ap.add_argument(flag, default=None, help=f"Path to the isolated {label} stem (audio file)")
    args = ap.parse_args()

    requested = [(dest, key, label) for dest, key, label in STEM_KEYS if getattr(args, dest)]
    if not requested:
        ap.error("provide at least one stem flag (e.g. --kick, --snare, --hat, ...)")

    env = find_env_file()
    if env:
        load_dotenv(env)
        print(f"[env] loaded {env}", file=sys.stderr)

    missing = [k for k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") if k not in os.environ]
    if missing:
        print(f"Missing env vars: {missing}", file=sys.stderr)
        sys.exit(1)

    hits_by_key: dict[str, list[tuple[float, float]]] = {}
    for dest, key, label in requested:
        p = Path(getattr(args, dest))
        if not p.exists():
            print(f"{label.capitalize()} stem not found: {p}", file=sys.stderr); sys.exit(1)
        print(f"[detect {label}] {p}")
        hits = detect_hits(p)
        hits_by_key[key] = hits
        head = ", ".join(f"{t:.2f}" for t, _ in hits[:5])
        print(f"  {len(hits)} {label} hits — first 5: {head}")

    beat_data = merge_into_beat_data(hits_by_key)
    total_keys = sum(len(row) - 1 for row in beat_data)  # subtract `at`
    multi_rows = sum(1 for row in beat_data if len(row) > 2)
    print(f"[merge] {len(beat_data)} hit rows, {total_keys} total stem events, "
          f"{multi_rows} simultaneous-multi-stem rows")

    sb = supabase_client()
    res = sb.table("songs").select("slug").eq("slug", args.slug).execute()
    if not res.data:
        print(f"No song with slug={args.slug!r}", file=sys.stderr)
        sys.exit(1)

    sb.table("songs").update({
        "beat_data": beat_data,
    }).eq("slug", args.slug).execute()
    print(f"  -> written to songs.beat_data for slug={args.slug}")


if __name__ == "__main__":
    main()
