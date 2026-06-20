import { createAdminClient } from "@/lib/supabase-server";
import { renderTemplateBySlug } from "@/lib/email-blocks";
import { sendEmail } from "@/lib/email";

/* Double opt-in confirmation email.

   Fires from the public subscribe path when an email first opts in (status
   'pending'). The recipient clicks the confirm button -> /confirm -> the row
   flips to 'active' and the welcome (welcome-01) goes out. Until then the
   contact receives nothing else (campaigns, cart recovery, drips all exclude
   'pending').

   Deliberately transactional: we pass ONLY confirm_url, so the footer's
   unsubscribe + preferences blocks (hidden_if_unset_var) stay hidden. A bare,
   single-link confirm email lands in Primary far more reliably than a
   marketing-shaped one.

   Copy lives in the editable `confirm-01` template (admin at
   /admin/email-templates/confirm-01); this module only resolves the
   per-subscriber confirm link and sends. Fire-and-forget; never throws. */

const CONFIRM_SLUG = "confirm-01";

export async function sendSubscriberConfirm(opts: {
  audienceId: string;
  email: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com";

    const { data: row } = await supabase
      .from("audience")
      .select("first_name, unsubscribe_token")
      .eq("id", opts.audienceId)
      .maybeSingle();

    if (!row?.unsubscribe_token) {
      console.error("[subscriber-confirm] no token for audience", opts.audienceId);
      return;
    }

    // Reuses the unsubscribe token to identify the row; /confirm resolves it.
    const confirmUrl = `${siteUrl}/confirm?token=${encodeURIComponent(row.unsubscribe_token)}`;

    const rendered = await renderTemplateBySlug(CONFIRM_SLUG, {
      first_name: row.first_name ?? null,
      confirm_url: confirmUrl,
    });
    if (!rendered) {
      console.error(`[subscriber-confirm] template "${CONFIRM_SLUG}" not found`);
      return;
    }

    const ok = await sendEmail({
      to: opts.email,
      subject: rendered.subject,
      html: rendered.html,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
    });
    if (!ok) {
      console.error("[subscriber-confirm] sendEmail returned false for", opts.email);
    }
  } catch (e) {
    console.error("[subscriber-confirm] failed", e);
  }
}
