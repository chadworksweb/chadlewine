import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/** Start the clock. Stamps started_at server-side so the billed minutes come
   off the server's clock, not the browser's. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("audit_sessions")
    .select("id, status, started_at")
    .eq("id", id)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (row.status === "settled") {
    return NextResponse.json({ error: "Already settled." }, { status: 409 });
  }
  // Restarting would silently move the start time and under-bill the client.
  if (row.started_at) {
    return NextResponse.json(
      { error: "Already started. Adjust the minutes at settle instead." },
      { status: 409 }
    );
  }

  const startedAt = new Date().toISOString();
  const { error } = await supabase
    .from("audit_sessions")
    .update({ status: "in_progress", started_at: startedAt })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Could not start." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, started_at: startedAt });
}
