import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { AdminEditButton } from "@/components/AdminEditButton";
import { MerchProductDetail } from "@/components/MerchProductDetail";
import { MerchExplore } from "@/components/MerchExplore";
import type { ProductVariant } from "@/components/MerchProductCard";
import { getGalleryForProduct, type GalleryImage } from "@/lib/product-images";

export const revalidate = 60;

interface ProductRow {
  id: string;
  slug: string | null;
  tier: string;
  title: string;
  description: string | null;
  price: number | null;
  fulfillment: string;
  status: string;
  variants: ProductVariant[] | null;
  linked_art_piece_id: string | null;
  created_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getProduct(
  key: string,
): Promise<{ product: ProductRow; gallery: GalleryImage[]; linkedPrintSlug: string | null } | null> {
  const supabase = createPublicClient();
  const isUuid = UUID_RE.test(key);
  const { data } = await supabase
    .from("products")
    .select("id, slug, tier, title, description, price, fulfillment, status, variants, linked_art_piece_id, created_at")
    .eq(isUuid ? "id" : "slug", key)
    .eq("status", "active")
    .single();
  if (!data) return null;
  const product = data as ProductRow;
  const gallery = await getGalleryForProduct(supabase, product.id);

  let linkedPrintSlug: string | null = null;
  if (product.linked_art_piece_id) {
    const { data: linked } = await supabase
      .from("art_pieces")
      .select("slug, status")
      .eq("id", product.linked_art_piece_id)
      .eq("status", "published")
      .maybeSingle();
    linkedPrintSlug = linked?.slug ?? null;
  }

  return { product, gallery, linkedPrintSlug };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getProduct(slug);
  if (!result) return {};
  const { product, gallery } = result;
  const canonicalKey = product.slug || product.id;
  const ogImage = gallery[0]?.url;
  return {
    title: `${product.title} — Chad Lewine`,
    description: product.description || `${product.title} by Chad Lewine.`,
    alternates: { canonical: `https://chadlewine.com/merch/${canonicalKey}` },
    openGraph: {
      title: product.title,
      description: product.description || undefined,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

export default async function MerchProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getProduct(slug);
  if (!result) notFound();
  const { product, gallery, linkedPrintSlug } = result;

  return (
    <>
      <AdminEditButton href={`/admin/merch/products/${product.slug || product.id}`} />
      <MerchProductDetail
        id={product.id}
        title={product.title}
        description={product.description}
        gallery={gallery}
        tier={product.tier}
        price={product.price}
        variants={Array.isArray(product.variants) ? product.variants : []}
        linkedPrintSlug={linkedPrintSlug}
      />
      <MerchExplore excludeMerchIds={[product.id]} standalone />
    </>
  );
}
