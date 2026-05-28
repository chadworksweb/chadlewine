import { createAdminClient } from "@/lib/supabase-server";
import { LEVERS, mergeConfig, profileForSong, profileFromStored } from "@/lib/librosa-levers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_IDS = new Set(LEVERS.map((l) => l.id));

async function readStored(supabase: ReturnType<typeof createAdminClient>) {
  const { data } = await supabase
    .from("librosa_settings")
    .select("config")
    .eq("id", 1)
    .maybeSingle();
  return (data?.config as Record<string, unknown> | null) || {};
}

/** strong/medium/weak histogram, matching the analyzer's print bands. */
function hist(vals: number[]): { strong: number; medium: number; weak: number } {
  let strong = 0, medium = 0, weak = 0;
  for (const v of vals) {
    if (v >= 0.5) strong++;
    else if (v >= 0.3) medium++;
    else weak++;
  }
  return { strong, medium, weak };
}

type BeatEvent = { at: number; k?: number; s?: number; h?: number; to?: number; bp?: number; bs?: number };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const field = UUID_RE.test(idOrSlug) ? "id" : "slug";

  const { data: song, error } = await supabase
    .from("songs")
    .select(
      "id, slug, title, streaming_path, tempo_bpm, beat_peaks, beat_kicks, beat_snares, beat_data, beat_offset_seconds, bass_synth_envelope, bass_synth_envelope_hz, bass_synth_pitch, visualizer_overrides",
    )
    .eq(field, idOrSlug)
    .single();
  if (error || !song) return Response.json({ error: "not found" }, { status: 404 });

  const overrides = (song.visualizer_overrides || {}) as Record<string, number>;

  const beatData = (Array.isArray(song.beat_data) ? song.beat_data : null) as BeatEvent[] | null;
  const beatKicks = Array.isArray(song.beat_kicks) ? (song.beat_kicks as number[]) : null;
  const beatSnares = Array.isArray(song.beat_snares) ? (song.beat_snares as number[]) : null;
  const beatPeaks = Array.isArray(song.beat_peaks) ? (song.beat_peaks as number[]) : null;
  const envelope = Array.isArray(song.bass_synth_envelope) ? (song.bass_synth_envelope as number[]) : null;
  const pitch = Array.isArray(song.bass_synth_pitch) ? (song.bass_synth_pitch as number[]) : null;

  const source: "stems" | "hpss" | "none" = beatData ? "stems" : beatPeaks ? "hpss" : "none";

  // Profile baseline: stem songs inherit the stem profile, everything else
  // the shared default (frequency) profile. Per-song overrides layer on top.
  const stored = await readStored(supabase);
  const hasStems = !!beatData;
  const profile = profileForSong(hasStems);
  const profileCfg = profileFromStored(stored, profile);

  // Per-stem hit summaries. Stems path reads beat_data keys; HPSS path reads
  // the parallel kick/snare arrays.
  const stems: Record<string, { count: number } & ReturnType<typeof hist>> = {};
  if (beatData) {
    const keys: (keyof BeatEvent)[] = ["k", "s", "h", "to", "bp", "bs"];
    const names: Record<string, string> = { k: "kick", s: "snare", h: "hat", to: "tom", bp: "bassPulse", bs: "bassSynth" };
    for (const key of keys) {
      const vals = beatData.map((e) => e[key]).filter((v): v is number => typeof v === "number");
      if (vals.length) stems[names[key]] = { count: vals.length, ...hist(vals) };
    }
  } else {
    if (beatKicks) stems.kick = { count: beatKicks.filter((v) => v > 0).length, ...hist(beatKicks) };
    if (beatSnares) stems.snare = { count: beatSnares.filter((v) => v > 0).length, ...hist(beatSnares) };
  }

  return Response.json({
    slug: song.slug,
    title: song.title,
    hasAudio: !!song.streaming_path,
    summary: {
      source,
      tempo_bpm: typeof song.tempo_bpm === "number" ? song.tempo_bpm : null,
      beatCount: beatData ? beatData.length : beatPeaks ? beatPeaks.length : 0,
      stems,
      envelope: envelope
        ? { frames: envelope.length, hz: typeof song.bass_synth_envelope_hz === "number" ? song.bass_synth_envelope_hz : null }
        : null,
      pitch: pitch ? { frames: pitch.length } : null,
    },
    beat_offset_seconds: typeof song.beat_offset_seconds === "number" ? song.beat_offset_seconds : 0,
    profile,                                       // "default" | "stem"
    hasStems,
    global: profileCfg,                            // profile baseline for "song" mode
    overrides,                                     // explicit per-song overrides
    effective: mergeConfig(profileCfg, overrides), // merged values for display
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const field = UUID_RE.test(idOrSlug) ? "id" : "slug";

  const { data: song } = await supabase.from("songs").select("id").eq(field, idOrSlug).single();
  if (!song) return Response.json({ error: "not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const updates: Record<string, unknown> = {};

  if (body && typeof body === "object" && "overrides" in body) {
    const incoming = (body.overrides || {}) as Record<string, unknown>;
    const overrides: Record<string, number> = {};
    const byId = new Map(LEVERS.map((l) => [l.id, l]));
    for (const [id, v] of Object.entries(incoming)) {
      if (!VALID_IDS.has(id)) continue;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) continue;
      const lever = byId.get(id)!;
      overrides[id] = Math.min(lever.max, Math.max(lever.min, n));
    }
    updates.visualizer_overrides = overrides;
  }

  if (body && typeof body.beat_offset_seconds === "number" && Number.isFinite(body.beat_offset_seconds)) {
    // Clamp to a sane alignment window (+/- 1s).
    updates.beat_offset_seconds = Math.min(1, Math.max(-1, body.beat_offset_seconds));
  }

  if (Object.keys(updates).length === 0) return Response.json({ ok: true, noop: true });

  const { error } = await supabase.from("songs").update(updates).eq("id", song.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
