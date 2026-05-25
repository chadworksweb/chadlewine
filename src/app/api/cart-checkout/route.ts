import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createPublicClient, createAdminClient } from "@/lib/supabase-server";
import { createCartCheckoutSession } from "@/lib/stripe";

type Format = "mp3" | "flac" | "wav";

type CartLineInput = {
  type: "song" | "release" | "ringtone" | "merch" | "art_original";
  id: string;
  format?: string | null;
  product_config?: Record<string, unknown> | null;
  // SKU layer: when set, server resolves price + downloads from release_skus
  // / song_skus rather than the legacy songs.price / songs.download_path_*
  // fallback (legacy releases columns are GONE).
  sku_id?: string | null;
  sku_variant_id?: string | null;
};

const FORMAT_LABEL: Record<string, string> = {
  digital: "Digital",
  vinyl: "Vinyl",
  cd: "CD",
  cassette: "Cassette",
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const items = body?.items as CartLineInput[] | undefined;
  const marketingOptIn = body?.marketing_opt_in === true;
  const applyCoupon = body?.apply_coupon === true;

  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ error: "items required" }, { status: 400 });
  }
  // Tighter cap than before: SKU UUIDs nearly double the per-line metadata
  // payload, and Stripe metadata is capped at 500 chars per key.
  if (items.length > 15) {
    return Response.json({ error: "Cart too large" }, { status: 400 });
  }

  const supabase = createPublicClient();
  const origin = request.headers.get("origin") || "https://chadlewine.com";

  type ResolvedLine = {
    type: "song" | "release" | "ringtone" | "merch" | "art_original";
    item_id: string | null;
    sku_id: string | null;
    sku_variant_id: string | null;
    format: Format | null;
    title: string;
    description?: string;
    price: number;
    cover_art_url?: string;
    product_config?: Record<string, unknown> | null;
  };

  const resolved: ResolvedLine[] = [];
  const seen = new Set<string>();

  for (const raw of items) {
    if (
      !raw ||
      !["song", "release", "ringtone", "merch", "art_original"].includes(raw.type)
    ) {
      return Response.json({ error: "Invalid cart item" }, { status: 400 });
    }
    if (raw.type !== "merch" && !raw.id) {
      return Response.json({ error: "Invalid cart item" }, { status: 400 });
    }
    const dedupeKey = `${raw.type}:${raw.id}:${raw.format ?? "na"}:${raw.sku_id ?? "na"}:${raw.sku_variant_id ?? "na"}:${
      raw.product_config ? JSON.stringify(raw.product_config) : "na"
    }`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    if (raw.type === "ringtone") {
      const { data: song } = await supabase
        .from("songs")
        .select("id, title, slug, ringtone_path_m4r, ringtone_path_mp3, ringtone_price")
        .eq("id", raw.id)
        .single();
      if (!song) return Response.json({ error: "Ringtone not found" }, { status: 404 });
      if (!song.ringtone_price) {
        return Response.json({ error: `Ringtone for "${song.title}" has no price set` }, { status: 400 });
      }
      if (!song.ringtone_path_m4r && !song.ringtone_path_mp3) {
        return Response.json({ error: `Ringtone for "${song.title}" has no audio uploaded` }, { status: 400 });
      }

      const { data: assoc } = await supabase
        .from("release_songs")
        .select("release:releases(cover_art_path)")
        .eq("song_id", raw.id)
        .single();
      const album = (assoc as { album?: { cover_art_path?: string | null } } | null)?.album;

      resolved.push({
        type: "ringtone",
        item_id: song.id,
        sku_id: null,
        sku_variant_id: null,
        format: null,
        title: `${song.title} — Ringtone`,
        description: "Ringtone · iPhone (M4R) + Android (MP3)",
        price: song.ringtone_price,
        cover_art_url: album?.cover_art_path || undefined,
      });
    } else if (raw.type === "song") {
      // SKU-priced path: look up song_skus + optional sku_variants and use
      // their price as the server-authoritative line price.
      if (raw.sku_id) {
        const { data: sku } = await supabase
          .from("song_skus")
          .select("id, song_id, format, price, status, stock, download_path_mp3, download_path_flac, download_path_wav")
          .eq("id", raw.sku_id)
          .maybeSingle();
        if (!sku || sku.song_id !== raw.id) {
          return Response.json({ error: "SKU not found" }, { status: 404 });
        }
        if (!["available", "preorder"].includes(sku.status)) {
          return Response.json({ error: "Sold out" }, { status: 400 });
        }

        let variant: { id: string; label: string; price_delta: number; status: string; stock: number | null } | null = null;
        if (raw.sku_variant_id) {
          const { data: v } = await supabase
            .from("sku_variants")
            .select("id, song_sku_id, label, price_delta, status, stock")
            .eq("id", raw.sku_variant_id)
            .maybeSingle();
          if (!v || v.song_sku_id !== sku.id) {
            return Response.json({ error: "Variant not found" }, { status: 404 });
          }
          if (!["available", "preorder"].includes(v.status)) {
            return Response.json({ error: "Sold out" }, { status: 400 });
          }
          variant = { id: v.id, label: v.label, price_delta: Number(v.price_delta), status: v.status, stock: v.stock };
        }

        // Physical SKUs (or variants) — check stock now. Authoritative
        // decrement happens in the webhook after Stripe confirms payment.
        if (sku.format !== "digital") {
          const effStock = variant ? variant.stock : sku.stock;
          if (effStock !== null && effStock <= 0) {
            return Response.json({ error: "Sold out" }, { status: 400 });
          }
        }

        const linePrice = sku.price === null ? null : Number(sku.price) + (variant?.price_delta ?? 0);
        if (linePrice === null) {
          return Response.json({ error: "Pricing unavailable" }, { status: 400 });
        }

        const { data: songRow } = await supabase
          .from("songs")
          .select("title, art_image_path")
          .eq("id", raw.id)
          .single();
        const songTitle = songRow?.title || "Song";

        const { data: assoc } = await supabase
          .from("release_songs")
          .select("release:releases(title, cover_art_path)")
          .eq("song_id", raw.id)
          .single();
        const album = (assoc as { album?: { title?: string; cover_art_path?: string | null } } | null)?.album;

        const labelParts = [FORMAT_LABEL[sku.format] || sku.format];
        if (variant?.label) labelParts.push(variant.label);
        const desc = album?.title
          ? `${labelParts.join(" · ")} · from ${album.title}`
          : labelParts.join(" · ");

        resolved.push({
          type: "song",
          item_id: raw.id,
          sku_id: sku.id,
          sku_variant_id: variant?.id ?? null,
          format: null,
          title: songTitle,
          description: desc,
          price: linePrice,
          cover_art_url: songRow?.art_image_path || album?.cover_art_path || undefined,
        });
        continue;
      }

      // Songs are sold via song_skus only now (no legacy price fallback).
      return Response.json(
        { error: "Song pricing has changed — please re-add this item to your cart." },
        { status: 400 },
      );
    } else if (raw.type === "release") {
      // Releases no longer carry price/download columns. SKU is required.
      if (!raw.sku_id) {
        return Response.json(
          { error: "Release pricing has changed — please re-add this item to your cart." },
          { status: 400 },
        );
      }

      const { data: sku } = await supabase
        .from("release_skus")
        .select("id, release_id, format, price, status, stock, download_path_mp3, download_path_flac, download_path_wav")
        .eq("id", raw.sku_id)
        .maybeSingle();
      if (!sku || sku.release_id !== raw.id) {
        return Response.json({ error: "SKU not found" }, { status: 404 });
      }
      if (!["available", "preorder"].includes(sku.status)) {
        return Response.json({ error: "Sold out" }, { status: 400 });
      }

      let variant: { id: string; label: string; price_delta: number; status: string; stock: number | null } | null = null;
      if (raw.sku_variant_id) {
        const { data: v } = await supabase
          .from("sku_variants")
          .select("id, release_sku_id, label, price_delta, status, stock")
          .eq("id", raw.sku_variant_id)
          .maybeSingle();
        if (!v || v.release_sku_id !== sku.id) {
          return Response.json({ error: "Variant not found" }, { status: 404 });
        }
        if (!["available", "preorder"].includes(v.status)) {
          return Response.json({ error: "Sold out" }, { status: 400 });
        }
        variant = { id: v.id, label: v.label, price_delta: Number(v.price_delta), status: v.status, stock: v.stock };
      }

      if (sku.format !== "digital") {
        const effStock = variant ? variant.stock : sku.stock;
        if (effStock !== null && effStock <= 0) {
          return Response.json({ error: "Sold out" }, { status: 400 });
        }
      }

      const linePrice = sku.price === null ? null : Number(sku.price) + (variant?.price_delta ?? 0);
      if (linePrice === null) {
        return Response.json({ error: "Pricing unavailable" }, { status: 400 });
      }

      const { data: album } = await supabase
        .from("releases")
        .select("id, title, slug, cover_art_path")
        .eq("id", raw.id)
        .single();
      if (!album) return Response.json({ error: "Album not found" }, { status: 404 });

      const labelParts = [FORMAT_LABEL[sku.format] || sku.format];
      if (variant?.label) labelParts.push(variant.label);

      resolved.push({
        type: "release",
        item_id: album.id,
        sku_id: sku.id,
        sku_variant_id: variant?.id ?? null,
        format: null,
        title: album.title,
        description: labelParts.join(" · "),
        price: linePrice,
        cover_art_url: album.cover_art_path || undefined,
      });
    } else if (raw.type === "merch" || raw.type === "art_original") {
      if (!raw.id) {
        return Response.json({ error: "Invalid cart item" }, { status: 400 });
      }
      const { data: product } = await supabase
        .from("products")
        .select("id, title, price, status, image_url, variant_type, edition_size, editions_sold, fulfillment, variants")
        .eq("id", raw.id)
        .eq("status", "active")
        .single();

      if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
      if (product.edition_size > 0 && product.editions_sold >= product.edition_size) {
        return Response.json({ error: `"${product.title}" is sold out` }, { status: 400 });
      }

      const isOriginal = product.variant_type === "original";

      const productVariants = Array.isArray(product.variants) ? product.variants : [];
      let chosenVariant: { id: number; size: string | null; color: string | null; price_cents: number; title: string } | null = null;
      if (raw.type === "merch" && product.fulfillment === "printify_curated" && productVariants.length > 0) {
        const variantId = raw.product_config?.variant_id;
        if (typeof variantId !== "number") {
          return Response.json({ error: `"${product.title}" requires a size selection` }, { status: 400 });
        }
        chosenVariant = productVariants.find((v: { id: number }) => v.id === variantId) || null;
        if (!chosenVariant) {
          return Response.json({ error: `Selected variant not available for "${product.title}"` }, { status: 400 });
        }
      }

      const linePrice = chosenVariant ? chosenVariant.price_cents / 100 : product.price;
      if (!linePrice) {
        return Response.json({ error: `Product "${product.title}" has no price set` }, { status: 400 });
      }

      const desc = isOriginal
        ? "Original artwork"
        : chosenVariant && chosenVariant.size
          ? `Size ${chosenVariant.size}`
          : product.variant_type === "print"
            ? "Print"
            : undefined;

      resolved.push({
        type: isOriginal ? "art_original" : "merch",
        item_id: product.id,
        sku_id: null,
        sku_variant_id: null,
        format: null,
        title: product.title,
        description: desc,
        price: linePrice,
        cover_art_url: product.image_url || undefined,
        product_config: chosenVariant
          ? { variant_id: chosenVariant.id, size: chosenVariant.size, color: chosenVariant.color }
          : undefined,
      });
    }
  }

  if (resolved.length === 0) {
    return Response.json({ error: "Empty cart" }, { status: 400 });
  }

  // Compact metadata payload — Stripe metadata caps at 500 chars per key.
  // When a SKU is resolved (sk present), the webhook uses sk to look up the
  // release_id / song_id (parent), so i is dropped from those lines.
  // Merch lines with a product_config (curated-variant size/color selection)
  // reference an external cfg_<idx> key for it; everything else fits inline.
  const cfgKeys: Record<string, string> = {};
  const metaItems = resolved.map((r, idx) => {
    const t =
      r.type === "song"
        ? "s"
        : r.type === "release"
          ? "a"
          : r.type === "ringtone"
            ? "r"
            : r.type === "art_original"
              ? "o"
              : "m";
    const line: {
      t: string;
      i?: string | null;
      sk?: string;
      v?: string;
      f?: Format | null;
      c?: number;
    } = { t };
    if (r.sku_id) {
      line.sk = r.sku_id;
      if (r.sku_variant_id) line.v = r.sku_variant_id;
    } else {
      line.i = r.item_id;
    }
    if (r.format) line.f = r.format;
    if (r.product_config) {
      cfgKeys[`cfg_${idx}`] = JSON.stringify(r.product_config);
      if (cfgKeys[`cfg_${idx}`].length > 480) {
        throw new Error(`Product config exceeds Stripe metadata limit (line ${idx})`);
      }
      line.c = idx;
    }
    return line;
  });
  const metaJson = JSON.stringify(metaItems);
  if (metaJson.length > 500) {
    return Response.json(
      {
        error:
          "Cart too large to checkout — please remove a few items and try again.",
      },
      { status: 400 },
    );
  }

  const hasPhysical = resolved.some(
    (r) => r.type === "merch" || r.type === "art_original",
  );

  // One thank-you page for every purchase.
  const successPath = "/thank-you";

  let prefillCustomerId: string | undefined;
  let prefillEmail: string | undefined;
  let audienceId: string | null = null;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("sb-access-token")?.value;
    if (token) {
      const anon = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data: userResp } = await anon.auth.getUser(token);
      const user = userResp?.user;
      if (user) {
        const admin = createAdminClient();
        const { data: audienceRow } = await admin
          .from("audience")
          .select("id, email, stripe_customer_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (audienceRow) {
          audienceId = audienceRow.id;
          if (audienceRow.stripe_customer_id) {
            prefillCustomerId = audienceRow.stripe_customer_id;
          } else if (audienceRow.email || user.email) {
            prefillEmail = audienceRow.email || user.email || undefined;
          }
        }
      }
    }
  } catch {
    // Non-fatal — proceed with anonymous checkout.
  }

  let discountCouponId: string | undefined;
  const couponMetadata: Record<string, string> = {};
  if (applyCoupon) {
    if (!audienceId) {
      return Response.json(
        { error: "Sign in to apply your member coupon." },
        { status: 401 },
      );
    }
    const admin = createAdminClient();
    const { data: member_coupon } = await admin
      .from("member_coupons")
      .select("id, percent_off, code, expires_at")
      .eq("audience_id", audienceId)
      .is("redeemed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("granted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!member_coupon) {
      return Response.json(
        { error: "No eligible coupon on your account." },
        { status: 400 },
      );
    }

    const pct = (member_coupon.percent_off || 20) / 100;
    const musicTotal = resolved
      .filter((r) => r.type === "song" || r.type === "release" || r.type === "ringtone")
      .reduce((s, r) => s + r.price, 0);
    const merchPrices = resolved
      .filter((r) => r.type === "merch" || r.type === "art_original")
      .map((r) => r.price);
    const merchMax = merchPrices.length > 0 ? Math.max(...merchPrices) : 0;

    const musicDiscountCents = Math.round(musicTotal * pct * 100);
    const merchDiscountCents = Math.round(merchMax * pct * 100);
    const discountCents = Math.max(musicDiscountCents, merchDiscountCents);

    if (discountCents <= 0) {
      return Response.json(
        { error: "Nothing in this cart qualifies for the member coupon." },
        { status: 400 },
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const adHocCoupon = await stripe.coupons.create({
      amount_off: discountCents,
      currency: "usd",
      duration: "once",
      max_redemptions: 1,
      name: `${member_coupon.percent_off}% member coupon (${member_coupon.code})`,
      metadata: {
        member_coupon_id: member_coupon.id,
        audience_id: audienceId,
        scope: musicDiscountCents >= merchDiscountCents ? "music_all" : "merch_max",
        member_code: member_coupon.code,
      },
    });
    discountCouponId = adHocCoupon.id;
    couponMetadata.member_coupon_id = member_coupon.id;
    couponMetadata.member_coupon_code = member_coupon.code;
    couponMetadata.coupon_scope = musicDiscountCents >= merchDiscountCents ? "music_all" : "merch_max";
  }

  const sessionParams = {
    line_items: resolved.map((r) => ({
      title: r.title,
      description: r.description,
      price: r.price,
      cover_art_url: r.cover_art_url,
    })),
    cart_items_metadata: metaJson,
    extra_metadata: {
      ...cfgKeys,
      marketing_opt_in: marketingOptIn ? "true" : "false",
      ...couponMetadata,
    },
    collect_shipping: hasPhysical,
    customer: prefillCustomerId,
    customer_email: prefillCustomerId ? undefined : prefillEmail,
    discount_coupon_id: discountCouponId,
    success_url: `${origin}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/music`,
  };

  let session;
  try {
    session = await createCartCheckoutSession(sessionParams);
  } catch (e) {
    const err = e as { code?: string; param?: string };
    if (
      sessionParams.customer &&
      err?.code === "resource_missing" &&
      err?.param === "customer"
    ) {
      console.warn(
        "[cart-checkout] Prefilled customer not found in current Stripe mode; retrying with email prefill.",
      );
      session = await createCartCheckoutSession({
        ...sessionParams,
        customer: undefined,
        customer_email: prefillEmail,
      });
    } else {
      throw e;
    }
  }

  if (!session.url) return Response.json({ error: "No checkout URL" }, { status: 500 });
  return Response.json({ url: session.url });
}
