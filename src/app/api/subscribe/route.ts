import { createAdminClient } from "@/lib/supabase-server";
import { upsertAudienceFromSubscribe } from "@/lib/audience";

export async function POST(request: Request) {
  const body = await request.json();
  const { email, source_page } = body;

  if (!email || !email.includes("@")) {
    return Response.json({ error: "Valid email required" }, { status: 400 });
  }

  let audienceId: string;
  try {
    audienceId = await upsertAudienceFromSubscribe({
      email,
      source_page: source_page || null,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Subscribe failed" },
      { status: 500 }
    );
  }

  // Keep the legacy `subscribers` row in sync for backwards compat
  // (admin lists, exports). The audience row is the source of truth.
  const supabase = createAdminClient();
  await supabase
    .from("subscribers")
    .upsert(
      {
        email: email.toLowerCase().trim(),
        source_page: source_page || null,
        status: "active",
        audience_id: audienceId,
      },
      { onConflict: "email" }
    );

  return Response.json({ ok: true });
}
