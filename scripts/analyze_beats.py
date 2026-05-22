#!/usr/bin/env python3
"""
analyze_beats.py — Compute beat onset timestamps for one or more songs and
write them to songs.beat_peaks in Supabase. Powers the press-play cube
visualizer's per-beat morph triggers; live in-browser FFT detection can't
survive vocal masking, but librosa's beat tracker can.

SETUP (one time):
  pip install librosa soundfile supabase python-dotenv requests
  # ffmpeg must be on PATH for MP3 loading. On Windows:
  #   winget install Gyan.FFmpeg
  # On macOS:
  #   brew install ffmpeg

ENV (reads from project's .env.local or .env at repo root):
  NEXT_PUBLIC_SUPABASE_URL=...
  SUPABASE_SERVICE_ROLE_KEY=...           # admin write access

USAGE:
  python scripts/analyze_beats.py <song-slug>            # one song
  python scripts/analyze_beats.py --all                  # every song with streaming_path AND beat_peaks IS NULL
  python scripts/analyze_beats.py --all --force          # re-analyze all songs, even ones already done

OUTPUT:
  Updates songs.beat_peaks (float8[]) on the targeted row(s). Prints
  per-song progress: tempo + first 5 beats + total count.
"""

from __future__ import annotations

import argparse
import os
import sys
import tempfile
from pathlib import Path
from typing import Iterable

import requests
from dotenv import load_dotenv

# librosa is heavy — only import when we actually run analysis
def _lazy_imports():
    import librosa
    import numpy as np
    return librosa, np

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
    """Lazy-import supabase so the script can show help without it installed."""
    from supabase import create_client
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)

def download_to_temp(url: str) -> Path:
    """Stream an audio URL into a temp file we can hand to librosa.load."""
    suffix = Path(url.split("?")[0]).suffix or ".mp3"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        for chunk in r.iter_content(chunk_size=1 << 16):
            if chunk:
                tmp.write(chunk)
    tmp.close()
    return Path(tmp.name)

def analyze(path: Path) -> tuple[float, list[float], list[float], list[float], list[float]]:
    """Run librosa beat tracking + onset analysis.
    Returns (tempo_bpm, beat_times_seconds, beat_strengths, beat_kicks, beat_snares).
    All four beat_* lists are aligned and the same length as beat_times."""
    librosa, np = _lazy_imports()
    # Mono load at 22050 Hz — beat tracker doesn't need full fidelity and
    # halving the sample rate halves the analysis time on a typical song.
    y, sr = librosa.load(str(path), sr=22050, mono=True)

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    # librosa 0.10+ returns tempo as a (1,) ndarray; older versions as scalar.
    bpm = float(np.asarray(tempo).ravel()[0])

    # Full-band onset envelope on the original signal. Reserved for the
    # beat_strengths column (future non-kick effects); not used for
    # kick detection itself.
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)

    # KICK DETECTION
    #
    # v1 ran the kick-band onset detector on the raw mix and produced two
    # failures simultaneously: vocal fundamentals (~85-180Hz for low male
    # voice) sit inside the kick band and fired as false kicks, AND a
    # single vocal-overlapping peak set the per-song max, squashing real
    # kicks during dense vocal sections down past the threshold.
    #
    # Two changes:
    # 1. HPSS first. librosa.effects.hpss splits the signal into a
    #    harmonic stem (sustained pitched content — vocals, bass guitar,
    #    pads) and a percussive stem (transients — kicks, snares, hats,
    #    plosive consonants). Running the kick-band detector on the
    #    percussive stem only eliminates vocal-pitch leakage almost
    #    entirely. Margin (1.0, 5.0) pushes harder on percussive
    #    isolation than the default (1.0, 1.0) — default leaves audible
    #    vocal energy in y_perc.
    # 2. Tighter band: 30-130 Hz. Brackets the kick fundamental + early
    #    body. Above 130 starts catching snare shells; below 30 is mostly
    #    room rumble + subsonic.
    _y_harm, y_perc = librosa.effects.hpss(y, margin=(1.0, 5.0))
    perc_mel = librosa.feature.melspectrogram(y=y_perc, sr=sr, n_mels=128, fmax=8000)
    mel_freqs = librosa.mel_frequencies(n_mels=128, fmax=8000)
    kick_mask = (mel_freqs >= 30) & (mel_freqs <= 130)
    kick_mel = perc_mel[kick_mask, :]
    kick_env = librosa.onset.onset_strength(S=librosa.power_to_db(kick_mel), sr=sr)

    # SNARE DETECTION
    # Same percussive stem, different band. Snare body fundamentals sit
    # around 200-400 Hz; the "crack" component is up at 2-6 kHz where
    # hi-hats also live, so we stick to the body band for cleaner
    # separation. Beats reading high here AND low in beat_kicks are
    # snare-only (backbeats); beats high in both are kick+snare hits.
    snare_mask = (mel_freqs >= 200) & (mel_freqs <= 450)
    snare_mel = perc_mel[snare_mask, :]
    snare_env = librosa.onset.onset_strength(S=librosa.power_to_db(snare_mel), sr=sr)

    # Sample envelopes at beat frame indices. Clamp in case a beat frame
    # lands one sample past the envelope end (rare, end-of-file rounding).
    env_len = min(len(onset_env), len(kick_env), len(snare_env))
    safe_frames = np.clip(beat_frames, 0, env_len - 1)
    raw_strengths = onset_env[safe_frames]
    raw_kicks = kick_env[safe_frames]
    raw_snares = snare_env[safe_frames]

    # 95th-percentile normalization. Max-normalization (v1) let a single
    # outlier set the ceiling — one vocal-plus-kick spike would compress
    # every other kick toward 0.2-0.4 even when most kicks were equally
    # strong. With p95 the top ~5% clip at 1.0 and the meaningful range
    # spreads across 0.4-1.0, giving the frontend threshold real headroom.
    def _norm(arr) -> float:
        if arr.size == 0:
            return 1.0
        v = float(np.percentile(arr, 95))
        return v if v > 0 else 1.0

    s_norm = _norm(raw_strengths)
    k_norm = _norm(raw_kicks)
    sn_norm = _norm(raw_snares)

    times = [round(float(t), 4) for t in beat_times]
    strengths = [round(min(1.0, float(s) / s_norm), 4) for s in raw_strengths]
    kicks = [round(min(1.0, float(k) / k_norm), 4) for k in raw_kicks]
    snares = [round(min(1.0, float(s) / sn_norm), 4) for s in raw_snares]
    return bpm, times, strengths, kicks, snares

def process_song(sb, song: dict, force: bool) -> None:
    slug = song["slug"]
    streaming = song.get("streaming_path")
    if not streaming:
        print(f"[skip] {slug} — no streaming_path", file=sys.stderr)
        return
    if not force and song.get("beat_peaks"):
        print(f"[skip] {slug} — already analyzed ({len(song['beat_peaks'])} beats)")
        return

    print(f"[analyze] {slug} — downloading ...", flush=True)
    tmp_path = download_to_temp(streaming)
    try:
        bpm, beats, strengths, kicks, snares = analyze(tmp_path)
        head = ", ".join(f"{t:.2f}" for t in beats[:5])
        # Surface band stats so threshold-tuning decisions don't require
        # querying the DB after every run.
        def _hist(vals: list[float]) -> str:
            strong = sum(1 for v in vals if v >= 0.5)
            medium = sum(1 for v in vals if 0.3 <= v < 0.5)
            weak = sum(1 for v in vals if v < 0.3)
            return f"{strong} strong / {medium} medium / {weak} weak"
        print(f"  tempo {bpm:.1f} BPM, {len(beats)} beats — first 5: {head}")
        print(f"  kicks:  {_hist(kicks)}")
        print(f"  snares: {_hist(snares)}")
        sb.table("songs").update({
            "beat_peaks": beats,
            "beat_strengths": strengths,
            "beat_kicks": kicks,
            "beat_snares": snares,
            "tempo_bpm": round(bpm, 2),
        }).eq("slug", slug).execute()
        print(f"  -> written to songs (peaks + strengths + kicks + snares + tempo)")
    finally:
        try:
            tmp_path.unlink()
        except OSError:
            pass

def iter_songs(sb, slug: str | None, force: bool) -> Iterable[dict]:
    select = "slug, streaming_path, beat_peaks"
    if slug:
        res = sb.table("songs").select(select).eq("slug", slug).execute()
        if not res.data:
            print(f"No song with slug={slug!r}", file=sys.stderr)
            sys.exit(1)
        return res.data
    # --all: songs with audio. If not --force, skip ones already analyzed.
    q = sb.table("songs").select(select).not_.is_("streaming_path", "null")
    if not force:
        q = q.is_("beat_peaks", "null")
    res = q.execute()
    return res.data

def main() -> None:
    ap = argparse.ArgumentParser(description="Compute beat timestamps for songs and persist to Supabase.")
    ap.add_argument("slug", nargs="?", help="Song slug. Omit + use --all for bulk.")
    ap.add_argument("--all", action="store_true", help="Process every song with streaming_path")
    ap.add_argument("--force", action="store_true", help="Re-analyze even if beat_peaks already set")
    args = ap.parse_args()

    if not args.slug and not args.all:
        ap.error("provide a slug or --all")

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

    sb = supabase_client()
    songs = list(iter_songs(sb, args.slug, args.force))
    print(f"[run] {len(songs)} song(s) to process", file=sys.stderr)
    for s in songs:
        try:
            process_song(sb, s, args.force)
        except Exception as e:
            print(f"[error] {s['slug']}: {e}", file=sys.stderr)

if __name__ == "__main__":
    main()
