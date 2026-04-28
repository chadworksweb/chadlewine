import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { AdminEditButton } from "@/components/AdminEditButton";
import { MerchProductDetail } from "@/components/MerchProductDetail";
import { MerchExplore } from "@/components/MerchExplore";
import type { ProductVariant } from "@/components/MerchProductCard";

export const revalidate = 60;

interface ProductRow {
  id: string;
  slug: string | null;
  tier: string;
  title: string;
  description: string | null;
  price: number | null;
  image_url: string | null;
  image_urls: string[] | null;
  image_alt: string | null;
  fulfillment: string;
  status: string;
  variants: ProductVariant[] | null;
  created_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getProduct(key: string): Promise<ProductRow | null> {
  const supabase = createPublicClient();
  const isUuid = UUID_RE.test(key);
  // Look up by slug first; fall back to id so old UUID URLs don't 404 mid-rollout.
  const { data } = await supabase
    .from("products")
    .select("id, slug, tier, title, description, price, image_url, image_urls, image_alt, fulfillment, status, variants, created_at")
    .eq(isUuid ? "id" : "slug", key)
    .eq("status", "active")
    .single();
  return (data as ProductRow | null) || null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return {};
  const canonicalKey = product.slug || product.id;
  return {
    title: `${product.title} — Chad Lewine`,
    description: product.description || `${product.title} by Chad Lewine.`,
    alternates: { canonical: `https://chadlewine.com/merch/${canonicalKey}` },
    openGraph: {
      title: product.title,
      description: product.description || undefined,
      images: product.image_url ? [{ url: product.image_url }] : undefined,
    },
  };
}

export default async function MerchProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  return (
    <>
      <AdminEditButton href={`/admin/merch/products/${product.id}`} />
      <MerchProductDetail
        id={product.id}
        title={product.title}
        description={product.description}
        image_url={product.image_url}
        image_urls={Array.isArray(product.image_urls) ? product.image_urls : []}
        image_alt={product.image_alt}
        tier={product.tier}
        price={product.price}
        variants={Array.isArray(product.variants) ? product.variants : []}
      />
      <MerchExplore excludeMerchIds={[product.id]} standalone />
    </>
  );
}
