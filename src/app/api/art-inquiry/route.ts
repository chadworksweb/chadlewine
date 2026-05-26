import { createAdminClient } from "@/lib/supabase-server";

// Public concierge inquiry for art sold via sale_mode = 'inquire'. Writes a row
// to art_inquiries (service-role; the table holds buyer PII and is admin-read
// only) and, when the inquiry names a specific available SKU, flips it to
// 'reserved' so it stops reading as buyable while Chad follows up.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid request" }, { status: 400 });

  const artId = typeof body.art_id === "string" ? body.art_id : null;
  const artSkuId = typeof body.art_sku_id === "string" ? body.art_sku_id : null;
  const buyerName = typeof body.buyer_name === "string" ? body.buyer_name.trim() : "";
  const buyerEmail = typeof body.buyer_email === "string" ? body.buyer_email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : null;
  const reserve = body.reserve === true;

  if (!artId) return Response.json({ error: "Missing artwork" }, { status: 400 });
  if (!buyerName) return Response.json({ error: "Please enter your name" }, { status: 400 });
  if (!EMAIL_RE.test(buyerEmail)) return Response.json({ error: "Please enter a valid email" }, { status: 400 });

  const supabase = createAdminClient();

  // Validate the art piece is published and the SKU (if given) belongs to it.
  const { data: art } = await supabase
    .from("art_pieces")
    .select("id, status")
    .eq("id", artId)
    .maybeSingle();
  if (!art || !["unreleased", "published"].includes(art.status)) {
    return Response.json({ error: "Artwork not found" }, { status: 404 });
  }

  let skuToReserve: { id: string; status: string } | null = null;
  if (artSkuId) {
    const { data: sku } = await supabase
      .from("art_skus")
      .select("id, art_id, status")
      .eq("id", artSkuId)
      .maybeSingle();
    if (!sku || sku.art_id !== artId) {
      return Response.json({ error: "Edition not found" }, { status: 404 });
    }
    skuToReserve = { id: sku.id, status: sku.status };
  }

  const { error: insErr } = await supabase.from("art_inquiries").insert({
    art_id: artId,
    art_sku_id: artSkuId,
    buyer_name: buyerName,
    buyer_email: buyerEmail,
    message,
    status: reserve && skuToReserve ? "reserved" : "new",
  });
  if (insErr) {
    console.error("art_inquiries insert", insErr);
    return Response.json({ error: "Could not submit your inquiry" }, { status: 500 });
  }

  // Reserve the SKU only when the buyer asked to and it is currently available.
  if (reserve && skuToReserve && skuToReserve.status === "available") {
    await supabase.from("art_skus").update({ status: "reserved" }).eq("id", skuToReserve.id);
  }

  return Response.json({ ok: true });
}
