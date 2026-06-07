import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { AdminEditButton } from "@/components/AdminEditButton";
import { MerchProductDetail } from "@/components/MerchProductDetail";
import { MerchProductJsonLd } from "@/components/MerchProductJsonLd";
import { ExploreStrip } from "@/components/ExploreStrip";
import { YouMightAlsoLike } from "@/components/YouMightAlsoLike";
import type { ProductVariant } from "@/components/MerchProductCard";
import { getGalleryForProduct, type GalleryImage } from "@/lib/product-images";

export const revalidate = 60;

interface ProductRow {
  id: string;
  slug: string | null;
  tier: string;
  title: string;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
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
): Promise<{
  product: ProductRow;
  gallery: GalleryImage[];
  linkedPrintSlug: string | null;
  isSuperIndividual: boolean;
} | null> {
  const supabase = createPublicClient();
  const isUuid = UUID_RE.test(key);
  const { data } = await supabase
    .from("merch")
    .select("id, slug, tier, title, description, seo_title, seo_description, price, fulfillment, status, variants, linked_art_piece_id, created_at")
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

  const { data: siCollection } = await supabase
    .from("collections")
    .select("id")
    .eq("slug", "super-individual")
    .eq("status", "active")
    .maybeSingle();
  let isSuperIndividual = false;
  if (siCollection) {
    const { data: assignment } = await supabase
      .from("collection_products")
      .select("product_id")
      .eq("collection_id", siCollection.id)
      .eq("product_id", product.id)
      .maybeSingle();
    isSuperIndividual = !!assignment;
  }

  return { product, gallery, linkedPrintSlug, isSuperIndividual };
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
  const seoTitle = product.seo_title?.trim();
  const ogTitle = seoTitle || `${product.title} — Chad Lewine`;
  const description =
    product.seo_description || product.description || `${product.title} by Chad Lewine.`;
  return {
    // Set seo_title renders exactly (absolute bypasses the root brand template);
    // otherwise the bare title gets a single "- Chad Lewine" from the template.
    title: seoTitle ? { absolute: seoTitle } : product.title,
    description,
    alternates: { canonical: `https://chadlewine.com/merch/${canonicalKey}` },
    openGraph: {
      title: ogTitle,
      description,
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
  const { product, gallery, linkedPrintSlug, isSuperIndividual } = result;

  return (
    <>
      <MerchProductJsonLd
        id={product.id}
        slug={product.slug}
        title={product.title}
        description={product.description}
        images={gallery.map((g) => g.url)}
        price={product.price}
        variants={Array.isArray(product.variants) ? product.variants : []}
      />
      <AdminEditButton href={`/admin/merch/products/${product.slug || product.id}`} />
      <MerchProductDetail
        id={product.id}
        title={product.title}
        description={product.description}
        gallery={gallery}
        price={product.price}
        variants={Array.isArray(product.variants) ? product.variants : []}
        linkedPrintSlug={linkedPrintSlug}
        isSuperIndividual={isSuperIndividual}
      />
      <YouMightAlsoLike sourceType="merch" sourceId={product.id} />
      <ExploreStrip excludeMerchIds={[product.id]} wrap />
    </>
  );
}
