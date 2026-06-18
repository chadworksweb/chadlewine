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
  --clap        -> "cl"    particle burst
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
    ("clap",       "cl", "clap"),
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


def compute_pitch(stem_path: Path, target_hz: float = 20.0) -> list[float]:
    """Monophonic pitch track at ~target_hz, normalized 0..1 over the
    song's own MIDI range. For sustained-instrument stems (synth bass,
    leads, vocals) where the envelope tells us 'how loud' but not 'what
    note.' Uses librosa.pyin (probabilistic YIN) which is the canonical
    monophonic f0 tracker.

    Unvoiced / unpitched frames (silence, breath) hold the last valid
    value so the visual color doesn't snap to a default during gaps.
    Normalization is in MIDI semitone space (perceptual / linear-in-
    pitch), not Hz space (log-skewed)."""
    librosa, np = _lazy_imports()
    y, sr = librosa.load(str(stem_path), sr=22050, mono=True)
    hop = max(1, int(round(sr / target_hz)))

    # Bass synth range: C1 (~33Hz, sub-bass) to C5 (~523Hz, high lead).
    # Plenty of headroom in both directions; pyin will return NaN for
    # anything outside this range.
    fmin = librosa.note_to_hz("C1")
    fmax = librosa.note_to_hz("C5")
    f0, _voiced_flag, _voiced_probs = librosa.pyin(
        y=y, fmin=fmin, fmax=fmax, sr=sr,
        hop_length=hop, frame_length=hop * 4,
    )
    if f0.size == 0:
        return []

    # Pull valid (voiced) samples to define the per-song MIDI range.
    valid = f0[~np.isnan(f0)]
    if valid.size == 0:
        return [0.5] * len(f0)
    midi_valid = librosa.hz_to_midi(valid)
    midi_min = float(midi_valid.min())
    midi_max = float(midi_valid.max())
    midi_span = midi_max - midi_min if midi_max > midi_min else 1.0

    out: list[float] = []
    last_valid = 0.5
    for f in f0:
        if np.isnan(f):
            out.append(round(last_valid, 4))
        else:
            m = float(librosa.hz_to_midi(float(f)))
            n = (m - midi_min) / midi_span
            n = max(0.0, min(1.0, n))
            last_valid = n
            out.append(round(n, 4))
    return out


def compute_envelope(stem_path: Path, target_hz: float = 20.0) -> tuple[list[float], float]:
    """Continuous amplitude envelope: per-frame RMS sampled at ~target_hz,
    normalized 0..1 via 95th-percentile. Used for SUSTAINED stems (bass
    synth, pads) where onset detection misses everything between note
    attacks. Returns (values, actual_hz). actual_hz differs slightly from
    target_hz because hop_length must be an integer."""
    librosa, np = _lazy_imports()
    y, sr = librosa.load(str(stem_path), sr=22050, mono=True)
    hop = max(1, int(round(sr / target_hz)))
    actual_hz = sr / hop
    # frame_length = 2*hop gives ~50% overlap — RMS reacts faster to
    # changes than the default frame_length=2048 while still smoothing
    # out very short transients (which we don't want for an ambient
    # follower).
    rms = librosa.feature.rms(y=y, hop_length=hop, frame_length=hop * 2)[0]
    if rms.size == 0:
        return [], actual_hz
    p95 = float(np.percentile(rms, 95))
    if p95 <= 0:
        p95 = float(rms.max()) or 1.0
    values = [round(min(1.0, float(r) / p95), 4) for r in rms]
    return values, actual_hz


def detect_hits(stem_path: Path, sensitive: bool = False) -> list[tuple[float, float]]:
    """Return [(time_seconds, normalized_strength_0_to_1), ...] for every
    onset in the stem. 95th-percentile normalization per file so the top
    ~5% of hits clip at 1.0 and the rest spread across the meaningful
    range, matching the analyze_beats.py convention.

    sensitive=True is for sustained instruments (e.g. synth bass) where
    note attacks are softer than percussion. Lowers delta (peak picking
    threshold) and tightens the local-average windows so individual
    notes inside a chord progression are detected, not just the brief
    moments of overall energy spikes."""
    librosa, np = _lazy_imports()

    y, sr = librosa.load(str(stem_path), sr=22050, mono=True)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)

    # wait=1 frame at hop=512/sr=22050 = ~23ms minimum spacing. Catches
    # the fastest musically-spaced snare rolls (64th-notes at 200 BPM ≈
    # 23ms) without producing double-trigger artifacts on hard attacks.
    # Stems have zero cross-talk so false positives within a single kit
    # piece are not a real risk.
    if sensitive:
        onset_frames = librosa.onset.onset_detect(
            onset_envelope=onset_env, sr=sr, units="frames",
            wait=1, delta=0.02, pre_avg=20, post_avg=20,
        )
    else:
        onset_frames = librosa.onset.onset_detect(
            onset_envelope=onset_env, sr=sr, units="frames", wait=1,
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
    ap.add_argument(
        "--synth", action="append", default=None, metavar="KEY=PATH",
        help="Extra continuous synth-envelope channel, repeatable. e.g. "
             "--synth chord=a044.wav --synth warp=l022.wav. RMS envelope only "
             "(sustained/polyphonic synths). The game wires 'chord' -> harmonic "
             "glow and 'warp' -> spatial warp.",
    )
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
        # Bass synth is sustained — chord changes produce gentle attacks
        # rather than percussive transients. Use the sensitive detector
        # so individual notes register, not just the rare big swells.
        sensitive = dest == "bass_synth"
        print(f"[detect {label}{' (sensitive)' if sensitive else ''}] {p}")
        hits = detect_hits(p, sensitive=sensitive)
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

    update: dict = {"beat_data": beat_data}

    # Bass synth: write BOTH the discrete attacks (in beat_data) AND a
    # continuous envelope. Frontend prefers the envelope when present
    # (continuous follower); shape it via BASS_SYNTH_ENV_GATE / CURVE
    # constants there to taste.
    if args.bass_synth:
        bs_env, bs_hz = compute_envelope(Path(args.bass_synth))
        bs_pitch = compute_pitch(Path(args.bass_synth), target_hz=bs_hz)
        update["bass_synth_envelope"] = bs_env
        update["bass_synth_envelope_hz"] = round(bs_hz, 4)
        update["bass_synth_pitch"] = bs_pitch
        print(f"[envelope bass synth] {len(bs_env)} frames @ {bs_hz:.2f} Hz")
        print(f"[pitch    bass synth] {len(bs_pitch)} frames (normalized 0..1)")

    # Extra continuous synth channels (chord, warp, ...). Envelope only - these
    # are sustained / polyphonic synths, so an RMS follower fits (no onset
    # detection, no monophonic pitch track). Written to songs.synth_envelopes.
    if args.synth:
        synth_env: dict = {}
        for spec in args.synth:
            if "=" not in spec:
                print(f"--synth expects KEY=PATH, got {spec!r}", file=sys.stderr); sys.exit(1)
            key, path = spec.split("=", 1)
            key = key.strip()
            sp = Path(path)
            if not sp.exists():
                print(f"Synth stem not found: {sp}", file=sys.stderr); sys.exit(1)
            env, hz = compute_envelope(sp)
            synth_env[key] = {"env": env, "hz": round(hz, 4)}
            print(f"[envelope synth:{key}] {len(env)} frames @ {hz:.2f} Hz")
        if synth_env:
            update["synth_envelopes"] = synth_env

    sb.table("songs").update(update).eq("slug", args.slug).execute()
    print(f"  -> written to songs for slug={args.slug}")


if __name__ == "__main__":
    main()
