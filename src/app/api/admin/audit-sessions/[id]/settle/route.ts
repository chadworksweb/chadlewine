import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import {
  chargeAuditBalance,
  createAuditBalanceInvoice,
} from "@/lib/stripe";
import {
  AUDIT_MAX_MINUTES,
  auditBalanceCents,
  auditTotalCents,
  formatAuditCents,
} from "@/lib/audit-rate";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

const SITE_URL = process.env.SITE_URL || "https://chadlewine.com";

/** Settle a Sovereignty Audit the moment the session ends.

   Auto-charges the saved card. The invoice is the failure path only, and it is
   what the agreement's "balance is due within 24 hours" line refers to.

   `billed_minutes` comes from the settle confirm, not straight off the timer,
   because a forgotten stop would otherwise bill the 120-minute ceiling and the
   money would already be gone. The confirm is the last point it can be fixed. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { billed_minutes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const minutes = Number(body.billed_minutes);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > AUDIT_MAX_MINUTES) {
    return NextResponse.json(
      { error: `Minutes must be between 0 and ${AUDIT_MAX_MINUTES}.` },
      { status: 400 }
    );
  }
  const billedMinutes = Math.ceil(minutes);

  const supabase = createAdminClient();

  const { data: row, error: loadError } = await supabase
    .from("audit_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !row) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  // Charging twice takes real money from a real person. Anything already paid
  // is terminal here regardless of what the client sends.
  if (row.status === "settled") {
    return NextResponse.json(
      { error: "Already settled. Refund and re-charge in Stripe if it is wrong." },
      { status: 409 }
    );
  }

  const launch = row.launch_discount;
  const totalCents = auditTotalCents(billedMinutes, launch);
  const balanceCents = auditBalanceCents(billedMinutes, launch);
  const endedAt = row.ended_at ? new Date(row.ended_at) : new Date();

  // Ended at or under the hold window: nothing left to charge. Settle flat --
  // the hold is non-refundable, so this does not pay anything back.
  if (balanceCents === 0) {
    await supabase
      .from("audit_sessions")
      .update({
        status: "settled",
        billed_minutes: billedMinutes,
        total_cents: totalCents,
        balance_cents: 0,
        ended_at: endedAt.toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      settled: true,
      balance_cents: 0,
      message: "Inside the 10 minutes already held. Nothing further charged.",
    });
  }

  // Off-session charge. No saved card means the hold webhook could not capture
  // one, so skip straight to the invoice.
  const charge = row.stripe_customer_id && row.stripe_payment_method_id
    ? await chargeAuditBalance({
        amount_cents: balanceCents,
        customer: row.stripe_customer_id,
        payment_method: row.stripe_payment_method_id,
        audit_session_id: id,
        billed_minutes: billedMinutes,
      })
    : ({ ok: false, code: "no_saved_card", message: "No saved card on file." } as const);

  if (charge.ok) {
    await supabase
      .from("audit_sessions")
      .update({
        status: "settled",
        billed_minutes: billedMinutes,
        total_cents: totalCents,
        balance_cents: balanceCents,
        ended_at: endedAt.toISOString(),
        stripe_balance_payment_intent: charge.paymentIntentId,
        settle_error: null,
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      settled: true,
      balance_cents: balanceCents,
      message: `Charged ${formatAuditCents(balanceCents)} for ${billedMinutes} min.`,
    });
  }

  // Charge failed. Fall back to the 24-hour invoice.
  if (!row.stripe_customer_id) {
    await supabase
      .from("audit_sessions")
      .update({
        status: "settle_failed",
        billed_minutes: billedMinutes,
        total_cents: totalCents,
        balance_cents: balanceCents,
        ended_at: endedAt.toISOString(),
        settle_error: `${charge.code}: ${charge.message} (no customer to invoice)`,
      })
      .eq("id", id);

    return NextResponse.json(
      { error: "Charge failed and there is no Stripe customer to invoice. Handle manually." },
      { status: 502 }
    );
  }

  try {
    const invoice = await createAuditBalanceInvoice({
      amount_cents: balanceCents,
      customer: row.stripe_customer_id,
      audit_session_id: id,
      billed_minutes: billedMinutes,
    });

    await supabase
      .from("audit_sessions")
      .update({
        status: "settle_failed",
        billed_minutes: billedMinutes,
        total_cents: totalCents,
        balance_cents: balanceCents,
        ended_at: endedAt.toISOString(),
        stripe_balance_invoice_id: invoice.invoiceId,
        balance_due_at: invoice.dueAt.toISOString(),
        settle_error: `${charge.code}: ${charge.message}`,
      })
      .eq("id", id);

    await sendEmail({
      to: process.env.ADMIN_NOTIFY_EMAIL || "portal@chadlewine.com",
      subject: `Audit balance charge failed -- ${row.email}`,
      html: `<p>The off-session charge failed, so an invoice went out instead.</p>
        <p><strong>${row.email}</strong> -- ${billedMinutes} min -- ${formatAuditCents(balanceCents)}</p>
        <p>Reason: ${charge.code} (${charge.message})</p>
        <p>Due: ${invoice.dueAt.toUTCString()}</p>
        ${invoice.hostedUrl ? `<p><a href="${invoice.hostedUrl}">Hosted invoice</a></p>` : ""}
        <p><a href="${SITE_URL}/admin/audit-sessions/${id}">Open in admin</a></p>`,
    });

    return NextResponse.json({
      ok: true,
      settled: false,
      invoiced: true,
      balance_cents: balanceCents,
      hosted_url: invoice.hostedUrl,
      message: `Card declined (${charge.code}). Invoice sent, due in 24 hours.`,
    });
  } catch (err) {
    console.error("[audit settle] invoice fallback failed", err);

    await supabase
      .from("audit_sessions")
      .update({
        status: "settle_failed",
        billed_minutes: billedMinutes,
        total_cents: totalCents,
        balance_cents: balanceCents,
        ended_at: endedAt.toISOString(),
        settle_error: `${charge.code}: ${charge.message} (invoice fallback also failed)`,
      })
      .eq("id", id);

    return NextResponse.json(
      { error: "Charge failed and the invoice fallback failed too. Handle in Stripe." },
      { status: 502 }
    );
  }
}
