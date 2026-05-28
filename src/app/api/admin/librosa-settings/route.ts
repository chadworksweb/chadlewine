import { createAdminClient } from "@/lib/supabase-server";
import {
  DEFAULT_CONFIG,
  LEVERS,
  mergeConfig,
  profileFromStored,
  type LibrosaProfile,
} from "@/lib/librosa-levers";

const VALID_IDS = new Set(LEVERS.map((l) => l.id));
const PROFILES: LibrosaProfile[] = ["default", "stem"];

async function readStored(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from("librosa_settings")
    .select("config")
    .eq("id", 1)
    .maybeSingle();
  return (data?.config as Record<string, unknown> | null) || {};
}

/**
 * GET — both profiles' effective configs + the collective data view. Uses
 * count-head queries + slug-only membership selects so it never transfers
 * the large beat_* arrays.
 */
export async function GET() {
  const supabase = createAdminClient();
  const stored = await readStored(supabase);

  const configs = {
    default: mergeConfig(profileFromStored(stored, "default"), null),
    stem: mergeConfig(profileFromStored(stored, "stem"), null),
  };

  const countWhere = async (col: string) => {
    const { count } = await supabase
      .from("songs")
      .select("id", { count: "exact", head: true })
      .not(col, "is", "null");
    return count ?? 0;
  };
  const slugsWhere = async (col: string): Promise<string[]> => {
    const { data } = await supabase.from("songs").select("slug").not(col, "is", "null");
    return (data || []).map((r) => r.slug as string);
  };

  const [withAudio, analyzed, withStems, withEnvelope] = await Promise.all([
    countWhere("streaming_path"),
    countWhere("beat_peaks"),
    countWhere("beat_data"),
    countWhere("bass_synth_envelope"),
  ]);

  const [stemSlugs, envelopeSlugs] = await Promise.all([
    slugsWhere("beat_data"),
    slugsWhere("bass_synth_envelope"),
  ]);
  const stemSet = new Set(stemSlugs);
  const envSet = new Set(envelopeSlugs);

  const { data: rows } = await supabase
    .from("songs")
    .select("slug, title, tempo_bpm, beat_offset_seconds, visualizer_overrides")
    .not("streaming_path", "is", "null")
    .order("title");

  const songs = (rows || []).map((r) => {
    const overrides = (r.visualizer_overrides || {}) as Record<string, unknown>;
    const hasStems = stemSet.has(r.slug as string);
    return {
      slug: r.slug as string,
      title: r.title as string,
      tempo_bpm: typeof r.tempo_bpm === "number" ? r.tempo_bpm : null,
      beat_offset_seconds: typeof r.beat_offset_seconds === "number" ? r.beat_offset_seconds : 0,
      analyzed: typeof r.tempo_bpm === "number",
      hasStems,
      profile: (hasStems ? "stem" : "default") as LibrosaProfile,
      hasEnvelope: envSet.has(r.slug as string),
      overrideCount: Object.keys(overrides).filter((k) => VALID_IDS.has(k)).length,
    };
  });

  const tempos = songs.map((s) => s.tempo_bpm).filter((t): t is number => t != null);
  const tempo = tempos.length
    ? {
        count: tempos.length,
        min: Math.min(...tempos),
        max: Math.max(...tempos),
        avg: Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10,
      }
    : { count: 0, min: 0, max: 0, avg: 0 };

  return Response.json({
    configs,
    stats: { withAudio, analyzed, withStems, withEnvelope, tempo },
    songs,
  });
}

/**
 * PUT — upsert one profile's config. Body: { profile, config }. Only known
 * lever ids that differ from the registry default are stored (sparse). The
 * other profile in the row is preserved.
 */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const profile = body?.profile as LibrosaProfile | undefined;
  if (!profile || !PROFILES.includes(profile)) {
    return Response.json({ error: "invalid profile" }, { status: 400 });
  }

  const incoming = (body?.config ?? {}) as Record<string, unknown>;
  const sparse: Record<string, number> = {};
  for (const [id, v] of Object.entries(incoming)) {
    if (!VALID_IDS.has(id)) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) continue;
    if (n === DEFAULT_CONFIG[id]) continue; // sparse: skip values == default
    sparse[id] = n;
  }

  const supabase = createAdminClient();
  const stored = await readStored(supabase);
  const nextConfig = {
    ...stored,
    default: profileFromStored(stored, "default"),
    stem: profileFromStored(stored, "stem"),
    [profile]: sparse,
  };

  const { error } = await supabase
    .from("librosa_settings")
    .upsert({ id: 1, config: nextConfig, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, config: mergeConfig(sparse, null) });
}
