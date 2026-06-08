import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

// Update an inbound message's status. Auth-gated by proxy.ts (/api/admin/*).

export const runtime = "nodejs";

const ALLOWED = new Set(["new", "reviewed", "archived"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let payload: { status?: string };
  try {
    payload = (await request.json()) as { status?: string };
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const status = (payload.status || "").trim();
  if (!ALLOWED.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("inbound_messages")
    .update({ status })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status });
}
