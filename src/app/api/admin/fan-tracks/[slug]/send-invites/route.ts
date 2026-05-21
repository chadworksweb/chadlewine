import { createAdminClient } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";
import { renderTemplateBySlug } from "@/lib/email-blocks";

// Sends the For-my-fans invite email to every grantee whose audience has
// a linked Supabase account (user_id) and hasn't been emailed yet. The
// dashboard URL only works for logged-in fans, so email-only buyers are
// skipped here -- they'll be reached via a separate "claim your account"
// flow (TBD; pickup mentions /music/recover as a hint).
//
// Proxy already gates this admin-only.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com";
const TEMPLATE_SLUG = "for-my-fans-01"; // shared template; per-track URL via {{ track_url }}.

interface Body {
  // Optional override -- in case Chad wants to dry-run or limit to one address.
  test_only_to?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    // Empty body is fine.
  }

  const supabase = createAdminClient();
  const { data: track } = await supabase
    .from("fan_tracks")
    .select("id, slug, title")
    .eq("slug", slug)
    .maybeSingle();
  if (!track) {
    return Response.json({ error: "Track not found" }, { status: 404 });
  }

  const { data: grants, error: gErr } = await supabase
    .from("fan_track_grants")
    .select(
      "id, token, audience_id, invite_email_sent_at, audience:audience(id, email, first_name, user_id, unsubscribe_token, subscriber_status)",
    )
    .eq("fan_track_id", track.id)
    .is("invite_email_sent_at", null);
  if (gErr) return Response.json({ error: gErr.message }, { status: 500 });

  type GrantRow = {
    id: string;
    token: string;
    audience_id: string;
    invite_email_sent_at: string | null;
    audience: {
      id: string;
      email: string;
      first_name: string | null;
      user_id: string | null;
      unsubscribe_token: string | null;
      subscriber_status: string;
    } | null;
  };

  const sent: string[] = [];
  const skipped: Array<{ email: string; reason: string }> = [];
  const failed: Array<{ email: string; reason: string }> = [];

  for (const g of (grants ?? []) as unknown as GrantRow[]) {
    if (!g.audience) {
      skipped.push({ email: "(unknown)", reason: "audience row missing" });
      continue;
    }
    const aud = g.audience;
    if (body.test_only_to && aud.email !== body.test_only_to.toLowerCase()) {
      continue;
    }
    if (!aud.user_id) {
      skipped.push({ email: aud.email, reason: "no linked account yet" });
      continue;
    }
    if (aud.subscriber_status === "unsubscribed") {
      // Honor unsubscribe even for this 1:1 invitational send.
      skipped.push({ email: aud.email, reason: "unsubscribed" });
      continue;
    }

    const trackUrl = `${SITE_URL}/${slug}?token=${encodeURIComponent(g.token)}`;
    const unsubscribeUrl = aud.unsubscribe_token
      ? `${SITE_URL}/unsubscribe?t=${aud.unsubscribe_token}`
      : "";

    const rendered = await renderTemplateBySlug(TEMPLATE_SLUG, {
      first_name: aud.first_name,
      token: g.token,
      track_url: trackUrl,
      unsubscribe_url: unsubscribeUrl,
    });
    if (!rendered) {
      failed.push({ email: aud.email, reason: `${TEMPLATE_SLUG} template missing` });
      continue;
    }

    const ok = await sendEmail({
      to: aud.email,
      subject: rendered.subject,
      html: rendered.html,
    });

    if (!ok) {
      failed.push({ email: aud.email, reason: "resend send returned false" });
      continue;
    }

    await supabase
      .from("fan_track_grants")
      .update({ invite_email_sent_at: new Date().toISOString() })
      .eq("id", g.id);
    sent.push(aud.email);
  }

  return Response.json({
    track: { slug: track.slug, title: track.title },
    sent_count: sent.length,
    skipped_count: skipped.length,
    failed_count: failed.length,
    sent,
    skipped,
    failed,
  });
}
