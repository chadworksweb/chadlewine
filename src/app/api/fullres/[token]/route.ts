import { createAdminClient } from "@/lib/supabase-server";
import { getMediaConfig } from "@/lib/media-config";
import { signBunnyUrl } from "@/lib/bunny-token";

// GET /api/fullres/[token]?variant=wallpaper|print
// token = purchases.id. Resolves the source observation for a paid merch
// purchase and returns a short-lived signed URL against the chadlewine-art
// (token-auth) zone. Default variant=wallpaper (digital delivery).

type Variant = "wallpaper" | "print";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = new URL(req.url);
  const variantParam = url.searchParams.get("variant");
  const variant: Variant = variantParam === "print" ? "print" : "wallpaper";

  const supabase = createAdminClient();

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, item_type, item_id, download_expires_at")
    .eq("id", token)
    .single();

  if (!purchase) return new Response("Not found", { status: 404 });

  if (
    purchase.download_expires_at &&
    new Date(purchase.download_expires_at) < new Date()
  ) {
    return new Response("Download link expired", { status: 410 });
  }

  if (purchase.item_type !== "merch" || !purchase.item_id) {
    return new Response("Not a deliverable merch purchase", { status: 400 });
  }

  const { data: product } = await supabase
    .from("merch")
    .select("source_observation_id")
    .eq("id", purchase.item_id)
    .single();

  if (!product?.source_observation_id) {
    return new Response("No source observation for this product", { status: 404 });
  }

  const col =
    variant === "print" ? "art_fullres_print_path" : "art_fullres_wallpaper_path";

  const { data: observation } = await supabase
    .from("posts")
    .select(col)
    .eq("id", product.source_observation_id)
    .single<Record<string, string | null>>();

  const rawPath = observation?.[col];
  if (!rawPath) {
    return new Response(`No ${variant} file set for this art`, { status: 404 });
  }

  const signed = signBunnyUrl(getMediaConfig("art-fullres"), rawPath);
  return Response.redirect(signed, 302);
}
