import { createPublicClient } from "@/lib/supabase-server";
import { createCartCheckoutSession } from "@/lib/stripe";

type Format = "mp3" | "flac" | "wav";
const FORMATS: Format[] = ["mp3", "flac", "wav"];

type CartLineInput = {
  type: "song" | "album" | "ringtone" | "merch" | "art_original";
  id: string;
  format?: string | null;
  product_config?: Record<string, unknown> | null;
};

// Curated blueprints — server-authoritative price/title for configurator products.
// Mirrors src/components/ProductConfigurator.tsx's CURATED_PRODUCTS so the client
// can never set its own price.
const CURATED_BLUEPRINTS: Record<number, { title: string; price: number }> = {
  706: { title: "Comfort Colors 1717", price: 34.99 },
};

function isConfigurator(config: Record<string, unknown> | null | undefined): boolean {
  return !!config && typeof config.blueprint_id === "number" && typeof config.tier === "string";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const items = body?.items as CartLineInput[] | undefined;

  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ error: "items required" }, { status: 400 });
  }
  if (items.length > 25) {
    return Response.json({ error: "Cart too large" }, { status: 400 });
  }

  const supabase = createPublicClient();
  const origin = request.headers.get("origin") || "https://chadlewine.com";

  type ResolvedLine = {
    type: "song" | "album" | "ringtone" | "merch" | "art_original";
    item_id: string | null;
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
      !["song", "album", "ringtone", "merch", "art_original"].includes(raw.type)
    ) {
      return Response.json({ error: "Invalid cart item" }, { status: 400 });
    }
    if (raw.type !== "merch" && !raw.id) {
      return Response.json({ error: "Invalid cart item" }, { status: 400 });
    }
    const dedupeKey = `${raw.type}:${raw.id}:${raw.format ?? "na"}:${
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
        .from("album_songs")
        .select("album:albums(cover_art_path)")
        .eq("song_id", raw.id)
        .single();
      const album = (assoc as { album?: { cover_art_path?: string | null } } | null)?.album;

      resolved.push({
        type: "ringtone",
        item_id: song.id,
        format: null,
        title: `${song.title} — Ringtone`,
        description: "Ringtone · iPhone (M4R) + Android (MP3)",
        price: song.ringtone_price,
        cover_art_url: album?.cover_art_path || undefined,
      });
    } else if (raw.type === "song") {
      const { data: song } = await supabase
        .from("songs")
        .select("id, title, slug, price, download_path_mp3, download_path_flac, download_path_wav, download_path")
        .eq("id", raw.id)
        .single();
      if (!song) return Response.json({ error: "Song not found" }, { status: 404 });
      if (!song.price) return Response.json({ error: `Song "${song.title}" has no price set` }, { status: 400 });

      const availableFormats: Format[] = FORMATS.filter(
        (f) => (song as Record<string, string | null>)[`download_path_${f}`],
      );
      const hasAny = availableFormats.length > 0 || !!song.download_path;
      if (!hasAny) {
        return Response.json(
          { error: `No download available for "${song.title}"` },
          { status: 400 },
        );
      }

      const { data: assoc } = await supabase
        .from("album_songs")
        .select("album:albums(title, cover_art_path)")
        .eq("song_id", raw.id)
        .single();
      const album = (assoc as { album?: { title?: string; cover_art_path?: string | null } } | null)?.album;

      const formatList = (availableFormats.length ? availableFormats : (["mp3"] as Format[]))
        .map((f) => f.toUpperCase())
        .join(" / ");
      const desc = album?.title
        ? `Digital download · ${formatList} · from ${album.title}`
        : `Digital download · ${formatList}`;

      resolved.push({
        type: "song",
        item_id: song.id,
        format: null,
        title: song.title,
        description: desc,
        price: song.price,
        cover_art_url: album?.cover_art_path || undefined,
      });
    } else if (raw.type === "album") {
      const { data: album } = await supabase
        .from("albums")
        .select("id, title, slug, cover_art_path, price, download_path_mp3, download_path_flac, download_path_wav")
        .eq("id", raw.id)
        .single();
      if (!album) return Response.json({ error: "Album not found" }, { status: 404 });
      if (!album.price) return Response.json({ error: `Album "${album.title}" has no price set` }, { status: 400 });

      const hasAny =
        album.download_path_mp3 || album.download_path_flac || album.download_path_wav;
      if (!hasAny) {
        const { count } = await supabase
          .from("album_songs")
          .select("songs!inner(download_path)", { count: "exact", head: true })
          .eq("album_id", album.id)
          .not("songs.download_path", "is", null);
        if (!count) {
          return Response.json({ error: `Album "${album.title}" has no download available` }, { status: 400 });
        }
      }

      resolved.push({
        type: "album",
        item_id: album.id,
        format: null,
        title: album.title,
        description: "Album download · MP3 / FLAC / WAV",
        price: album.price,
        cover_art_url: album.cover_art_path || undefined,
      });
    } else if (raw.type === "merch" && isConfigurator(raw.product_config)) {
      // Configurator merch — server-authoritative price from blueprint id.
      const cfg = raw.product_config as Record<string, unknown>;
      const blueprintId = cfg.blueprint_id as number;
      const blueprint = CURATED_BLUEPRINTS[blueprintId];
      if (!blueprint) {
        return Response.json({ error: "Unknown product type" }, { status: 400 });
      }
      const tierLabel =
        cfg.tier === "art" ? "The Art" : cfg.tier === "line" ? "The Line" : "The Fusion";

      // Resolve source title server-side so the cart can't lie about it.
      let sourceTitle: string | null = null;
      let coverArt: string | null = null;
      if (cfg.source_type === "song" && cfg.source_id) {
        const { data: song } = await supabase
          .from("songs")
          .select("title, art_image_path")
          .eq("id", cfg.source_id as string)
          .single();
        sourceTitle = song?.title || null;
        coverArt = song?.art_image_path || null;
      } else if (cfg.source_type === "obs" && cfg.source_id) {
        const { data: obs } = await supabase
          .from("observations")
          .select("title, art_image_path")
          .eq("id", cfg.source_id as string)
          .single();
        sourceTitle = obs?.title || null;
        coverArt = obs?.art_image_path || null;
      }

      const title = `${tierLabel} — ${blueprint.title}`;
      const desc = sourceTitle ? `From "${sourceTitle}"` : undefined;

      resolved.push({
        type: "merch",
        item_id: null,
        format: null,
        title,
        description: desc,
        price: blueprint.price,
        cover_art_url: coverArt || undefined,
        product_config: cfg,
      });
    } else if (raw.type === "merch" || raw.type === "art_original") {
      // Existing product row (print, mural, original, or Printify-curated).
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

      // Curated merch with sized variants — caller must pass variant_id;
      // we look up that variant on the product row and use its price as the
      // server-authoritative line price.
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
  // Configurator merch lines reference an external cfg_<idx> key for their
  // full product_config; everything else fits inline.
  const cfgKeys: Record<string, string> = {};
  const metaItems = resolved.map((r, idx) => {
    const t =
      r.type === "song"
        ? "s"
        : r.type === "album"
          ? "a"
          : r.type === "ringtone"
            ? "r"
            : r.type === "art_original"
              ? "o"
              : "m";
    const line: { t: string; i: string | null; f?: Format | null; c?: number } = {
      t,
      i: r.item_id,
    };
    if (r.format) line.f = r.format;
    if (r.product_config) {
      cfgKeys[`cfg_${idx}`] = JSON.stringify(r.product_config);
      if (cfgKeys[`cfg_${idx}`].length > 480) {
        // Stripe metadata limit; should never happen for our curated configs.
        // Fail loudly so we catch it in dev rather than silently dropping data.
        throw new Error(`Configurator product config exceeds Stripe metadata limit (line ${idx})`);
      }
      line.c = idx;
    }
    return line;
  });
  const metaJson = JSON.stringify(metaItems);
  if (metaJson.length > 500) {
    return Response.json(
      { error: "Cart too large to checkout — please remove a few items" },
      { status: 400 },
    );
  }

  const hasPhysical = resolved.some(
    (r) => r.type === "merch" || r.type === "art_original",
  );

  const session = await createCartCheckoutSession({
    line_items: resolved.map((r) => ({
      title: r.title,
      description: r.description,
      price: r.price,
      cover_art_url: r.cover_art_url,
    })),
    cart_items_metadata: metaJson,
    extra_metadata: cfgKeys,
    collect_shipping: hasPhysical,
    success_url: `${origin}/music/purchase/cart-thank-you?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/music`,
  });

  if (!session.url) return Response.json({ error: "No checkout URL" }, { status: 500 });
  return Response.json({ url: session.url });
}
