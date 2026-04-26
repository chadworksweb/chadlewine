import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { AdminEditButton } from "@/components/AdminEditButton";
import { MerchProductDetail } from "@/components/MerchProductDetail";
import type { ProductVariant } from "@/components/MerchProductCard";

export const revalidate = 60;

interface ProductRow {
  id: string;
  tier: string;
  title: string;
  description: string | null;
  price: number | null;
  image_url: string | null;
  image_alt: string | null;
  fulfillment: string;
  status: string;
  variants: ProductVariant[] | null;
  created_at: string;
}

async function getProduct(id: string): Promise<ProductRow | null> {
  // UUID-shape guard so we don't query Supabase with garbage paths
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("products")
    .select("id, tier, title, description, price, image_url, image_alt, fulfillment, status, variants, created_at")
    .eq("id", id)
    .eq("status", "active")
    .single();
  return (data as ProductRow | null) || null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return {};
  return {
    title: `${product.title} — Chad Lewine`,
    description: product.description || `${product.title} by Chad Lewine.`,
    alternates: { canonical: `https://chadlewine.com/merch/${id}` },
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
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  return (
    <>
      <AdminEditButton href={`/admin/merch/products/${product.id}`} />
      <MerchProductDetail
        id={product.id}
        title={product.title}
        description={product.description}
        image_url={product.image_url}
        image_alt={product.image_alt}
        tier={product.tier}
        price={product.price}
        variants={Array.isArray(product.variants) ? product.variants : []}
      />
    </>
  );
}
