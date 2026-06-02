import { getCurrentSession } from "@/lib/account";
import { createAdminClient, getSponsorDemosEnabled } from "@/lib/supabase-server";
import { createSponsorCheckoutSession } from "@/lib/stripe";

// Minimum chip-in for a group sponsorship.
const MIN_CONTRIBUTION_CENTS = 500;

function tierLabel(production_type: string, production_mode: string | null): string {
  if (production_type === "beat") return "beat";
  return production_mode === "studio" ? "full production (studio)" : "full production";
}

export async function POST(request: Request) {
  // Global kill switch.
  if (!(await getSponsorDemosEnabled())) {
    return Response.json({ error: "Sponsorship is not currently available." }, { status: 403 });
  }

  // Account required -- no guest sponsorship.
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Sign in to sponsor a demo." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const songId: string | undefined = body?.song_id;
  const requestedDollars = Number(body?.amount);
  const creditName: string | undefined =
    typeof body?.credit_name === "string" ? body.credit_name.trim() : undefined;
  const isAnonymous = body?.is_anonymous === true;
  const requestNote: string | undefined =
    typeof body?.request_note === "string" ? body.request_note.trim() : undefined;
  const agreed = body?.agreed === true;

  if (!songId) return Response.json({ error: "song_id required" }, { status: 400 });
  if (!agreed) {
    return Response.json({ error: "You must agree to the sponsorship terms." }, { status: 400 });
  }
  if (!Number.isFinite(requestedDollars) || requestedDollars <= 0) {
    return Response.json({ error: "Enter a valid amount." }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Song must be a sponsor demo.
  const { data: song } = await supabase
    .from("songs")
    .select("id, title, slug, status, demo_type")
    .eq("id", songId)
    .maybeSingle();
  if (!song || song.status !== "demo" || song.demo_type !== "sponsor") {
    return Response.json({ error: "This song is not open for sponsorship." }, { status: 404 });
  }

  // Sponsorship must exist and still be open.
  const { data: sponsorship } = await supabase
    .from("song_sponsorships")
    .select("id, production_type, production_mode, goal_cents, raised_cents, status, enabled")
    .eq("song_id", songId)
    .maybeSingle();
  if (!sponsorship) {
    return Response.json({ error: "This song is not open for sponsorship." }, { status: 404 });
  }
  if (!sponsorship.enabled) {
    return Response.json({ error: "Sponsorship for this song is paused." }, { status: 403 });
  }
  if (sponsorship.status !== "open") {
    return Response.json({ error: "This sponsorship is already funded." }, { status: 409 });
  }

  const remainingCents = sponsorship.goal_cents - sponsorship.raised_cents;
  if (remainingCents <= 0) {
    return Response.json({ error: "This sponsorship is already funded." }, { status: 409 });
  }

  // Cap the charge to what's left so a contribution never overshoots the goal
  // (no overage), and floor a group chip-in at the minimum.
  let chargeCents = Math.round(requestedDollars * 100);
  chargeCents = Math.min(chargeCents, remainingCents);
  if (chargeCents < remainingCents && chargeCents < MIN_CONTRIBUTION_CENTS) {
    return Response.json(
      { error: `Minimum contribution is $${(MIN_CONTRIBUTION_CENTS / 100).toFixed(2)}.` },
      { status: 400 },
    );
  }

  const label = tierLabel(sponsorship.production_type, sponsorship.production_mode);

  // Attach the buyer's Stripe customer (or email) for receipt + account linkage.
  const { data: audienceRow } = await supabase
    .from("audience")
    .select("stripe_customer_id, email")
    .eq("id", session.audienceId)
    .maybeSingle();

  const origin = request.headers.get("origin") || "https://chadlewine.com";

  try {
    const checkout = await createSponsorCheckoutSession({
      amount: chargeCents / 100,
      song_id: song.id,
      sponsorship_id: sponsorship.id,
      audience_id: session.audienceId,
      product_label: `Sponsor "${song.title}" - ${label}`,
      credit_name: creditName,
      is_anonymous: isAnonymous,
      request_note: sponsorship.production_type === "full" ? requestNote : undefined,
      customer: audienceRow?.stripe_customer_id || undefined,
      customer_email: audienceRow?.stripe_customer_id
        ? undefined
        : audienceRow?.email || session.email,
      success_url: `${origin}/music/songs/${song.slug}?sponsored=1`,
      cancel_url: `${origin}/music/songs/${song.slug}`,
    });

    if (!checkout.url) {
      return Response.json({ error: "Checkout could not be created." }, { status: 500 });
    }
    return Response.json({ url: checkout.url, charged: chargeCents / 100 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
