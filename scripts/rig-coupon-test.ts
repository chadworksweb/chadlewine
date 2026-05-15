/* Recurring test rig for the cart-thank-you coupon claim flow.

   Wipes the target member's prior cart_thankyou_offer coupon row (and
   deactivates the underlying Stripe Promotion Code), ensures a synthetic
   order exists tied to that member's audience row, and prints the
   thank-you URL the tester should visit while signed in as the target.

   Usage: npx tsx scripts/rig-coupon-test.ts <email>
*/

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [k, ...rest] = line.split("=");
    if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: npx tsx scripts/rig-coupon-test.ts <email>");
  process.exit(1);
}

(async () => {
  const { data: audience } = await supabase
    .from("audience")
    .select("id, email, user_id")
    .eq("email", email)
    .maybeSingle();
  if (!audience) {
    console.error("No audience row for", email);
    process.exit(1);
  }
  if (!audience.user_id) {
    console.error(
      "Audience row has no user_id (not a member). Sign up the user first, then re-run.",
    );
    process.exit(1);
  }
  console.log("Audience:", audience.id, "user_id:", audience.user_id);

  // 1. Tear down any prior cart_thankyou_offer coupon for this member.
  const { data: existing } = await supabase
    .from("member_coupons")
    .select("id, code, stripe_coupon_id, stripe_promotion_code_id")
    .eq("audience_id", audience.id)
    .eq("source", "cart_thankyou_offer")
    .maybeSingle();
  if (existing) {
    console.log("Deleting prior coupon:", existing.code);
    if (existing.stripe_promotion_code_id) {
      try {
        await stripe.promotionCodes.update(existing.stripe_promotion_code_id, {
          active: false,
        });
      } catch (e) {
        console.warn("Stripe promo code deactivate failed (non-fatal):", (e as Error).message);
      }
    }
    if (existing.stripe_coupon_id) {
      try {
        await stripe.coupons.del(existing.stripe_coupon_id);
      } catch (e) {
        console.warn("Stripe coupon delete failed (non-fatal):", (e as Error).message);
      }
    }
    await supabase.from("member_coupons").delete().eq("id", existing.id);
  } else {
    console.log("No prior coupon row to tear down.");
  }

  // 2. Ensure a synthetic order exists tied to this audience. Stable
  //    session_id so the URL never changes between rig runs.
  const sessionId = `rig_test_${audience.id}`;
  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (!order) {
    const { error: orderErr } = await supabase.from("orders").insert({
      stripe_session_id: sessionId,
      audience_id: audience.id,
      buyer_email: audience.email,
      status: "completed",
      subtotal: 1,
      total: 1,
    });
    if (orderErr) {
      console.error("Failed to create synthetic order:", orderErr.message);
      process.exit(1);
    }
    console.log("Synthetic order created.");
  } else {
    console.log("Synthetic order already exists.");
  }

  console.log("\nReady. Sign in as", email, "then visit:\n");
  console.log(`  http://localhost:8888/thank-you?session_id=${sessionId}\n`);
})();
