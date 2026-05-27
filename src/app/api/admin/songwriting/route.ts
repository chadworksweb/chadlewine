import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Admin-gated by proxy.ts (/api/admin/*). Saves the "available for a voice"
// selection + order for the Songwriting page grid.
export async function POST(req: Request) {
  let body: { selected?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const selected = (Array.isArray(body.selected) ? body.selected : []).slice(0, 8);
  const supabase = createAdminClient();

  // Reset the current selection, then set the new ordered one. Reset-then-set
  // means removals and re-ordering both take effect from one payload.
  const { error: resetErr } = await supabase
    .from("songs")
    .update({ available_for_a_voice: false, voice_display_order: 0 })
    .eq("available_for_a_voice", true);
  if (resetErr) {
    console.error("[songwriting admin] reset failed", resetErr);
    return NextResponse.json({ error: "Save failed." }, { status: 500 });
  }

  for (let i = 0; i < selected.length; i++) {
    const { error } = await supabase
      .from("songs")
      .update({ available_for_a_voice: true, voice_display_order: i })
      .eq("id", selected[i]);
    if (error) {
      console.error("[songwriting admin] update failed", error);
      return NextResponse.json({ error: "Save failed." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
