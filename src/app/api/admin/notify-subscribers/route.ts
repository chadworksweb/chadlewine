import { createAdminClient } from "@/lib/supabase-server";
import { sendEmail, buildObservationEmailHtml } from "@/lib/email";

export async function POST(request: Request) {
  const body = await request.json();
  const { observation_id } = body;

  if (!observation_id) {
    return Response.json({ error: "observation_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get the observation
  const { data: observation, error: obsError } = await supabase
    .from("posts")
    .select("title, slug, hook_line, citation_summary, kind")
    .eq("id", observation_id)
    .single();

  if (obsError || !observation) {
    return Response.json({ error: "Observation not found" }, { status: 404 });
  }

  // Get all active subscribers
  const { data: subscribers } = await supabase
    .from("subscribers")
    .select("email")
    .eq("status", "active");

  if (!subscribers || subscribers.length === 0) {
    return Response.json({ sent: 0, message: "No active subscribers" });
  }

  const html = buildObservationEmailHtml(observation);
  const subject = `New Observation: ${observation.title}`;

  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    const ok = await sendEmail({ to: sub.email, subject, html });
    if (ok) sent++;
    else failed++;
  }

  return Response.json({ sent, failed, total: subscribers.length });
}
