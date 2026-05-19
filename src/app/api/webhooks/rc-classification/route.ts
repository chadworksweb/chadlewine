import { createAdminClient } from "@/lib/supabase-server";

/**
 * Webhook receiver for Rising Compass classification pushes.
 *
 * RC POSTs here whenever a song's classification changes. We update the
 * matching song row's rc_* fields and log the event in rc_sync_log.
 *
 * Lives under /api/webhooks/* (not /api/admin/*) so it bypasses the JWT
 * admin gate in proxy.ts. Authenticated by a shared secret in the
 * X-RC-Webhook-Secret header (set RC_WEBHOOK_SECRET in env).
 *
 * Expected payload:
 *   {
 *     rc_song_id: number,
 *     match: { isrc?: string, title?: string, artist?: string, slug?: string },
 *     classification: {
 *       tier: "violet"|"blue"|"green"|"orange"|"red",
 *       charge: number,            // -100..+100
 *       charge_summary: string,
 *       contaminated: boolean,
 *       confidence: number,        // 0..1
 *       calibrated_at: string,     // ISO timestamp
 *       song_source: "submitted"|"library"|"compass"|"stream"
 *     },
 *     action?: "webhook-update"|"manual-recalibrate"
 *   }
 */
export async function POST(request: Request) {
  const expected = process.env.RC_WEBHOOK_SECRET;
  if (!expected) {
    return Response.json({ error: "RC_WEBHOOK_SECRET not configured" }, { status: 500 });
  }
  const provided = request.headers.get("x-rc-webhook-secret");
  if (provided !== expected) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  type WebhookBody = {
    rc_song_id?: unknown;
    match?: { isrc?: unknown; slug?: unknown; title?: unknown };
    classification?: Record<string, unknown>;
    action?: string;
  };
  let body: WebhookBody;
  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { rc_song_id, match = {}, classification = {}, action = "webhook-update" } = body ?? {};
  if (typeof rc_song_id !== "number") {
    return Response.json({ error: "rc_song_id required (number)" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Resolve song: try ISRC first (most reliable), then slug, then title.
  let songId: string | null = null;
  if (typeof match.isrc === "string" && match.isrc) {
    const { data } = await supabase.from("songs").select("id").eq("isrc", match.isrc).maybeSingle();
    songId = data?.id ?? null;
  }
  if (!songId && typeof match.slug === "string" && match.slug) {
    const { data } = await supabase.from("songs").select("id").eq("slug", match.slug).maybeSingle();
    songId = data?.id ?? null;
  }
  if (!songId && typeof match.title === "string" && match.title) {
    const { data } = await supabase
      .from("songs")
      .select("id")
      .ilike("title", match.title)
      .limit(1)
      .maybeSingle();
    songId = data?.id ?? null;
  }

  // Always log the inbound event, even if no song match (for forensic review)
  await supabase.from("rc_sync_log").insert({
    song_id: songId,
    rc_song_id,
    action,
    payload: body,
  });

  if (!songId) {
    return Response.json({ ok: true, matched: false, message: "No song matched; logged only" }, { status: 202 });
  }

  const { error } = await supabase.from("songs").update({
    rc_tier: classification.tier ?? null,
    rc_charge: typeof classification.charge === "number" ? classification.charge : null,
    rc_charge_summary: classification.charge_summary ?? null,
    rc_contaminated: typeof classification.contaminated === "boolean" ? classification.contaminated : null,
    rc_confidence: typeof classification.confidence === "number" ? classification.confidence : null,
    rc_calibrated_at: classification.calibrated_at ?? null,
    rc_song_source: classification.song_source ?? null,
    rc_song_id,
  }).eq("id", songId);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, matched: true, song_id: songId });
}
