import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { TranscendSpike } from "./TranscendSpike";
import { LEVELS, type BeatEvent, type ReactiveData, type SynthEnvelope } from "./levels";

// Phase 1 core-engine spike for Transcend the Machine. Throwaway route, kept
// out of nav and out of the index. See CHADLEWINE-TRANSCEND-THE-MACHINE.md.
export const metadata: Metadata = {
  title: "Transcend the Machine - spike",
  robots: { index: false, follow: false },
};

export const revalidate = 300;

// A song's reactive cue-sheet columns (mirrors the ReactiveData fields).
type SongReactiveRow = {
  slug: string;
  streaming_path: string | null;
  art_image_path: string | null;
  beat_data: unknown;
  beat_offset_seconds: number | null;
  bass_synth_envelope: unknown;
  bass_synth_envelope_hz: number | null;
  synth_envelopes: unknown;
};

// Parse the songs.synth_envelopes jsonb into a clean channel -> {env, hz} map,
// dropping any malformed channel. Returns null when there's nothing usable.
function parseSynthEnvelopes(raw: unknown): Record<string, SynthEnvelope> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, SynthEnvelope> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== "object") continue;
    const v = val as { env?: unknown; hz?: unknown };
    if (Array.isArray(v.env) && v.env.length > 0 && typeof v.hz === "number") {
      out[key] = { env: v.env as number[], hz: v.hz };
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

// A song row only counts as "reactive" once it has a streaming_path; until then
// the level plays on the ambient placeholder pulse. Per-level beat_offset comes
// from the row, so each track keeps its own sync.
function toReactive(row: SongReactiveRow | undefined): ReactiveData | null {
  if (!row || !row.streaming_path) return null;
  return {
    streamingUrl: row.streaming_path,
    skinTextureUrl: row.art_image_path ?? null,
    beatData: Array.isArray(row.beat_data) ? (row.beat_data as BeatEvent[]) : null,
    beatOffset: typeof row.beat_offset_seconds === "number" ? row.beat_offset_seconds : 0,
    bassSynthEnvelope: Array.isArray(row.bass_synth_envelope) ? (row.bass_synth_envelope as number[]) : null,
    bassSynthEnvelopeHz:
      typeof row.bass_synth_envelope_hz === "number" ? row.bass_synth_envelope_hz : null,
    synthEnvelopes: parseSynthEnvelopes(row.synth_envelopes),
  };
}

// Pull every level's song reactive cue sheet in one query, keyed by level id, so
// each corridor can pulse to its real track. Only L1 (Machine) carries this data
// today; the others resolve to null and fall back to the ambient placeholder
// pulse until their song rows are populated. Fails soft: any error yields an
// all-null map, so the spike never hard-breaks on a data/env issue.
async function getLevelReactive(): Promise<Record<number, ReactiveData | null>> {
  const out: Record<number, ReactiveData | null> = {};
  for (const l of LEVELS) out[l.id] = null;
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("songs")
      .select(
        "slug, streaming_path, art_image_path, beat_data, beat_offset_seconds, bass_synth_envelope, bass_synth_envelope_hz, synth_envelopes",
      )
      .in("slug", LEVELS.map((l) => l.slug))
      .in("status", ["published", "unreleased"]);
    const bySlug = new Map<string, SongReactiveRow>(((data as SongReactiveRow[] | null) ?? []).map((r) => [r.slug, r]));
    for (const l of LEVELS) out[l.id] = toReactive(bySlug.get(l.slug));
  } catch {
    // leave the all-null map
  }
  return out;
}

export default async function TranscendSpikePage() {
  const levelReactive = await getLevelReactive();
  return <TranscendSpike levelReactive={levelReactive} />;
}
