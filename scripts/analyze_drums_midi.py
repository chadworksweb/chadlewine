#!/usr/bin/env python3
"""
analyze_drums_midi.py — Ground-truth drum analysis from an Ableton MIDI export.

Bypasses audio detection entirely. Reads a .mid file containing the song's
drum clip(s), extracts kick + snare note-on events with their exact
timestamps and velocities, and writes them to the song's beat_* columns
in Supabase. The visualizer plays them back identically to librosa-derived
beats but with zero false positives, zero misses, and per-hit velocity.

When to use this instead of analyze_beats.py:
  - You have the Ableton session and the drum track is MIDI-triggered
    (Drum Rack, Battery, Impulse, VST drums — anything sampled). Export
    the drum clip(s) via right-click -> Export MIDI Clip, or for a full
    session: File -> Export MIDI File.
  - You want a song's visualizer to be exact. There is no comparison to
    audio detection — MIDI is the source.

Use analyze_beats.py instead when:
  - The drums were tracked live (real kit + microphones) and you only
    have a flat WAV stem, OR
  - You don't have the .als and only have the final stereo mix.

SETUP (one time):
  pip install mido supabase python-dotenv
  # mido has no native deps; no rtmidi needed (we only parse files).

ENV (reads .env.local at repo root):
  NEXT_PUBLIC_SUPABASE_URL=...
  SUPABASE_SERVICE_ROLE_KEY=...

USAGE:
  # Mode A — separate tracks for kick and snare (preferred when the
  # session has them on different MIDI tracks). Every note-on in each
  # file is treated as that kit piece, no note-number filtering needed.
  python scripts/analyze_drums_midi.py <slug> --kick-midi kick.mid --snare-midi snare.mid

  # Mode B — single combined MIDI clip with a Drum Rack mapping.
  python scripts/analyze_drums_midi.py <slug> --combined drums.mid
  python scripts/analyze_drums_midi.py <slug> --combined drums.mid --kick-notes 36,37
  python scripts/analyze_drums_midi.py <slug> --combined drums.mid --snare-notes 38,40

DEFAULTS (Mode B only):
  Kick notes:  36                (GM Bass Drum 1)
  Snare notes: 38, 40            (GM Acoustic + Electric Snare)
  Override per-song with --kick-notes / --snare-notes if Chad's drum rack
  uses a non-GM mapping. List multiple notes comma-separated.

OUTPUT:
  Writes to songs row matching <slug>:
    beat_peaks      sorted timestamps (seconds) of every kick OR snare hit
    beat_kicks      parallel array, velocity/127 on kick hits, 0 otherwise
    beat_snares     parallel array, velocity/127 on snare hits, 0 otherwise
    tempo_bpm       first set_tempo event in the file (most clips are constant)
    beat_strengths  left NULL (full-band onset not meaningful from MIDI)

  Prints per-song summary: tempo, total hits, kick count, snare count,
  number of simultaneous kick+snare hits (heavy backbeats).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv


def find_env_file() -> Path | None:
    """Walk up from cwd looking for .env.local or .env (project convention)."""
    here = Path(__file__).resolve().parent
    for parent in [here, *here.parents]:
        for name in (".env.local", ".env"):
            p = parent / name
            if p.exists():
                return p
    return None


def supabase_client():
    """Lazy-import so the script can show help without supabase installed."""
    from supabase import create_client
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def parse_note_set(arg: str | None, default: list[int]) -> set[int]:
    """Parse a comma-separated MIDI note-number list. Falls back to default."""
    if not arg:
        return set(default)
    out: set[int] = set()
    for tok in arg.split(","):
        tok = tok.strip()
        if not tok:
            continue
        try:
            out.add(int(tok))
        except ValueError:
            print(f"[warn] ignoring non-integer note '{tok}'", file=sys.stderr)
    return out or set(default)


def read_tempo_bpm(midi_path: Path) -> float:
    """Pull the first set_tempo event's BPM. mido handles tempo internally
    during message iteration but doesn't surface the value, so we scan
    once. Fallback 120 BPM matches Ableton's default for clips with no
    explicit tempo event."""
    import mido
    mid = mido.MidiFile(str(midi_path))
    for track in mid.tracks:
        for msg in track:
            if msg.type == "set_tempo":
                return mido.tempo2bpm(msg.tempo)
    return 120.0


def extract_all_hits(midi_path: Path) -> list[tuple[float, int]]:
    """Mode A helper: every note-on in the file is a hit. Used when a
    MIDI file is known to contain only one kit piece (the user exported
    the kick track or the snare track as its own .mid)."""
    import mido
    mid = mido.MidiFile(str(midi_path))
    hits: list[tuple[float, int]] = []
    abs_time = 0.0
    for msg in mid:
        abs_time += msg.time  # delta in seconds; mido has applied tempo
        if msg.type == "note_on" and msg.velocity > 0:
            hits.append((abs_time, msg.velocity))
    return hits


def extract_hits(midi_path: Path, kick_notes: set[int], snare_notes: set[int]) -> tuple[list[tuple[float, int]], list[tuple[float, int]], float]:
    """Return (kicks, snares, tempo_bpm).

    kicks / snares are lists of (time_seconds, velocity 0-127). mido's
    file iterator yields messages in temporal order with delta-time in
    seconds (it applies tempo events internally), so absolute time is
    just a running sum of msg.time."""
    import mido

    mid = mido.MidiFile(str(midi_path))

    # Pull first tempo event for the bpm field. mido.MidiFile iteration
    # handles tempo internally, but it doesn't expose the value, so we
    # scan tracks once for it. Falls back to 120 BPM if absent (mido's
    # default — matches Ableton's default for clips without explicit tempo).
    tempo_us = 500000  # microseconds per quarter note (= 120 BPM)
    for track in mid.tracks:
        for msg in track:
            if msg.type == "set_tempo":
                tempo_us = msg.tempo
                break
        else:
            continue
        break
    bpm = mido.tempo2bpm(tempo_us)

    kicks: list[tuple[float, int]] = []
    snares: list[tuple[float, int]] = []
    note_census: dict[int, int] = {}  # note -> hit count, for diagnostics
    abs_time = 0.0
    for msg in mid:
        abs_time += msg.time  # delta in seconds; mido has applied tempo
        # Drum pads only register on note_on with velocity > 0. note_on
        # with velocity == 0 is "note off via running status" in MIDI
        # and must be ignored, not treated as a hit.
        if msg.type == "note_on" and msg.velocity > 0:
            note_census[msg.note] = note_census.get(msg.note, 0) + 1
            if msg.note in kick_notes:
                kicks.append((abs_time, msg.velocity))
            elif msg.note in snare_notes:
                snares.append((abs_time, msg.velocity))

    # If the configured kick/snare notes pulled nothing, the rack mapping
    # probably isn't GM. Surface the note census so the user can pick the
    # right --kick-notes / --snare-notes values without opening Ableton.
    if not kicks or not snares:
        ranked = sorted(note_census.items(), key=lambda kv: -kv[1])
        census = ", ".join(f"note {n} = {c} hits" for n, c in ranked[:12])
        print(f"[diag] notes found in file (top 12): {census}", file=sys.stderr)
        if not kicks:
            print(f"[diag] ZERO kicks at configured notes {sorted(kick_notes)} — rerun with --kick-notes <n>", file=sys.stderr)
        if not snares:
            print(f"[diag] ZERO snares at configured notes {sorted(snare_notes)} — rerun with --snare-notes <n>", file=sys.stderr)

    return kicks, snares, bpm


def build_arrays(kicks: list[tuple[float, int]], snares: list[tuple[float, int]]) -> tuple[list[float], list[float], list[float]]:
    """Merge kick + snare events into the schema's parallel arrays.

    A row in (beat_peaks[i], beat_kicks[i], beat_snares[i]) represents one
    DRUM HIT MOMENT. If a kick and snare fire within 1 ms (programmed as
    simultaneous in Ableton — heavy backbeat), they collapse into a single
    row with both values populated. Frontend visualizer iterates beat_peaks
    in order and fires kick OR snare per row (snare wins ties, per the
    current mutual-exclusion rule)."""
    # Quantize timestamps to 1 ms — Ableton's MIDI grid resolution is well
    # finer than this; the rounding catches kick+snare programmed at the
    # same beat that landed at e.g. 1.7321 and 1.7322 seconds.
    QUANTIZE_MS = 0.001

    grid: dict[float, dict[str, float]] = {}
    for t, v in kicks:
        key = round(t / QUANTIZE_MS) * QUANTIZE_MS
        cell = grid.setdefault(round(key, 3), {"kick": 0.0, "snare": 0.0})
        # If somehow two kicks land in the same 1ms bucket (flam, double-
        # tap programmed tight), keep the louder velocity — the visualizer
        # only fires once per row anyway.
        cell["kick"] = max(cell["kick"], v / 127.0)
    for t, v in snares:
        key = round(t / QUANTIZE_MS) * QUANTIZE_MS
        cell = grid.setdefault(round(key, 3), {"kick": 0.0, "snare": 0.0})
        cell["snare"] = max(cell["snare"], v / 127.0)

    times = sorted(grid.keys())
    peaks = [round(t, 4) for t in times]
    kick_arr = [round(grid[t]["kick"], 4) for t in times]
    snare_arr = [round(grid[t]["snare"], 4) for t in times]
    return peaks, kick_arr, snare_arr


def main() -> None:
    ap = argparse.ArgumentParser(description="Write MIDI-derived ground-truth drum data to a song's beat_* columns.")
    ap.add_argument("slug", help="Song slug — the row in `songs` to update")
    ap.add_argument("--kick-midi", default=None,
                    help="Mode A: MIDI file containing only kick events (every note-on = kick)")
    ap.add_argument("--snare-midi", default=None,
                    help="Mode A: MIDI file containing only snare events (every note-on = snare)")
    ap.add_argument("--combined", default=None,
                    help="Mode B: single MIDI file with multiple kit pieces; filter by --kick-notes / --snare-notes")
    ap.add_argument("--kick-notes", default=None,
                    help="Mode B only: comma-separated MIDI note numbers treated as kicks (default 36 = GM Bass Drum 1)")
    ap.add_argument("--snare-notes", default=None,
                    help="Mode B only: comma-separated MIDI note numbers treated as snares (default 38,40 = GM Acoustic + Electric Snare)")
    args = ap.parse_args()

    using_separate = bool(args.kick_midi or args.snare_midi)
    using_combined = bool(args.combined)
    if not (using_separate or using_combined):
        ap.error("provide either --kick-midi/--snare-midi (Mode A) or --combined <file> (Mode B)")
    if using_separate and using_combined:
        ap.error("--combined is exclusive with --kick-midi/--snare-midi")

    env = find_env_file()
    if env:
        load_dotenv(env)
        print(f"[env] loaded {env}", file=sys.stderr)
    else:
        print("[env] no .env / .env.local found; assuming env is already set", file=sys.stderr)

    missing = [k for k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") if k not in os.environ]
    if missing:
        print(f"Missing env vars: {missing}", file=sys.stderr)
        sys.exit(1)

    if using_separate:
        kicks: list[tuple[float, int]] = []
        snares: list[tuple[float, int]] = []
        bpm = 120.0
        if args.kick_midi:
            p = Path(args.kick_midi)
            if not p.exists():
                print(f"Kick MIDI not found: {p}", file=sys.stderr); sys.exit(1)
            print(f"[read kick] {p}")
            kicks = extract_all_hits(p)
            bpm = read_tempo_bpm(p)
            print(f"  {len(kicks)} kick hits, tempo {bpm:.1f} BPM")
        if args.snare_midi:
            p = Path(args.snare_midi)
            if not p.exists():
                print(f"Snare MIDI not found: {p}", file=sys.stderr); sys.exit(1)
            print(f"[read snare] {p}")
            snares = extract_all_hits(p)
            if not args.kick_midi:
                bpm = read_tempo_bpm(p)
            print(f"  {len(snares)} snare hits")
    else:
        midi_path = Path(args.combined)
        if not midi_path.exists():
            print(f"MIDI file not found: {midi_path}", file=sys.stderr); sys.exit(1)
        kick_notes = parse_note_set(args.kick_notes, [36])
        snare_notes = parse_note_set(args.snare_notes, [38, 40])
        print(f"[map] kicks={sorted(kick_notes)} snares={sorted(snare_notes)}")
        print(f"[read combined] {midi_path}")
        kicks, snares, bpm = extract_hits(midi_path, kick_notes, snare_notes)
        print(f"  tempo {bpm:.1f} BPM, {len(kicks)} kick hits, {len(snares)} snare hits")

    peaks, kick_arr, snare_arr = build_arrays(kicks, snares)
    backbeats = sum(1 for k, s in zip(kick_arr, snare_arr) if k > 0 and s > 0)
    print(f"  merged into {len(peaks)} hit rows ({backbeats} simultaneous kick+snare)")

    sb = supabase_client()
    res = sb.table("songs").select("slug").eq("slug", args.slug).execute()
    if not res.data:
        print(f"No song with slug={args.slug!r}", file=sys.stderr)
        sys.exit(1)

    sb.table("songs").update({
        "beat_peaks": peaks,
        "beat_kicks": kick_arr,
        "beat_snares": snare_arr,
        "beat_strengths": None,  # not derivable from MIDI; visualizer doesn't use it yet
        "tempo_bpm": round(bpm, 2),
    }).eq("slug", args.slug).execute()
    print(f"  -> written to songs row for slug={args.slug}")


if __name__ == "__main__":
    main()
