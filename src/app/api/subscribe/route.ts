import { createAdminClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const body = await request.json();
  const { email, source_page } = body;

  if (!email || !email.includes("@")) {
    return Response.json({ error: "Valid email required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("subscribers")
    .upsert(
      { email: email.toLowerCase().trim(), source_page: source_page || null, status: "active" },
      { onConflict: "email" }
    );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
