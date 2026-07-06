import { spawn } from "node:child_process";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase-server";

// librosa is Python + ffmpeg; it is not installed in the deployed build (Vercel
// serverless nor the le-projects-01 container). This route only works when the dev
// server runs locally (where the analyzer, librosa, and ffmpeg live). Any deployed
// build returns a clear 400. Gate is NODE_ENV (was `process.env.VERCEL`, which stopped
// firing once the site left Vercel for the droplet on 2026-07-05, letting the route
// spawn a missing python and fail messily instead of degrading cleanly).
export const runtime = "nodejs";
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === "production") {
    return Response.json(
      { error: "Scanning runs locally only. Run the site on your machine to analyze." },
      { status: 400 },
    );
  }

  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const field = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const { data: song } = await supabase.from("songs").select("slug, streaming_path").eq(field, idOrSlug).single();
  if (!song) return Response.json({ error: "not found" }, { status: 404 });
  if (!song.streaming_path) return Response.json({ error: "song has no audio" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;

  const py = process.env.LIBROSA_PYTHON || "python";
  const script = path.join(process.cwd(), "scripts", "analyze_beats.py");
  const args = [script, song.slug as string];
  if (force) args.push("--force");

  const result = await new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const child = spawn(py, args, { cwd: process.cwd() });
    let out = "";
    let err = "";
    const cap = 20000; // cap captured output so a runaway log can't balloon the response
    child.stdout.on("data", (d) => { if (out.length < cap) out += d.toString(); });
    child.stderr.on("data", (d) => { if (err.length < cap) err += d.toString(); });
    child.on("error", (e) => resolve({ code: -1, out, err: err + String(e) }));
    child.on("close", (code) => resolve({ code: code ?? -1, out, err }));
  });

  if (result.code !== 0) {
    return Response.json(
      { error: "scan failed", code: result.code, log: (result.err || result.out).slice(-2000) },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, log: (result.out || result.err).slice(-2000) });
}
