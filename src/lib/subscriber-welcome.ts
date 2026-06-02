import { createAdminClient } from "@/lib/supabase-server";
import { renderTemplateBySlug } from "@/lib/email-blocks";
import { sendEmail } from "@/lib/email";

/* Subscriber welcome / thank-you email.

   Fires async/fire-and-forget from the public subscribe path the first time
   an email opts in, so the subscribe request isn't slowed if Resend hiccups.
   Failures are logged but never throw.

   The copy lives in the editable `welcome-01` email_template (admin at
   /admin/email-templates/welcome-01) -- this module only resolves the
   per-subscriber variables and sends. */

const WELCOME_SLUG = "welcome-01";

export async function sendSubscriberWelcome(opts: {
  audienceId: string;
  email: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com";

    // Pull the name + unsubscribe token off the freshly-upserted row so the
    // greeting personalizes and the footer's unsubscribe link resolves.
    const { data: row } = await supabase
      .from("audience")
      .select("first_name, unsubscribe_token")
      .eq("id", opts.audienceId)
      .maybeSingle();

    const unsubscribeUrl = row?.unsubscribe_token
      ? `${siteUrl}/unsubscribe?token=${encodeURIComponent(row.unsubscribe_token)}`
      : "";

    const rendered = await renderTemplateBySlug(WELCOME_SLUG, {
      first_name: row?.first_name ?? null,
      unsubscribe_url: unsubscribeUrl,
    });
    if (!rendered) {
      console.error(`[subscriber-welcome] template "${WELCOME_SLUG}" not found`);
      return;
    }

    const ok = await sendEmail({
      to: opts.email,
      subject: rendered.subject,
      html: rendered.html,
    });
    if (!ok) {
      console.error("[subscriber-welcome] sendEmail returned false for", opts.email);
    }
  } catch (e) {
    console.error("[subscriber-welcome] failed", e);
  }
}
