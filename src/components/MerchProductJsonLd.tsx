import type { ProductVariant } from "@/components/MerchProductCard";

interface MerchProductJsonLdProps {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  images: string[];
  price: number | null;
  variants: ProductVariant[];
}

const CURRENCY = "USD";
const SITE = "https://chadlewine.com";

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function MerchProductJsonLd({
  id,
  slug,
  title,
  description,
  images,
  price,
  variants,
}: MerchProductJsonLdProps) {
  const url = `${SITE}/merch/${slug || id}`;

  const variantPrices = variants
    .map((v) => (typeof v.price_cents === "number" ? v.price_cents / 100 : null))
    .filter((n): n is number => n != null && n > 0);

  let offers: Record<string, unknown> | null = null;

  if (variantPrices.length > 1) {
    const lo = Math.min(...variantPrices);
    const hi = Math.max(...variantPrices);
    offers = {
      "@type": "AggregateOffer",
      priceCurrency: CURRENCY,
      lowPrice: fmt(lo),
      highPrice: fmt(hi),
      offerCount: variantPrices.length,
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      url,
    };
  } else if (variantPrices.length === 1) {
    offers = {
      "@type": "Offer",
      priceCurrency: CURRENCY,
      price: fmt(variantPrices[0]),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      url,
    };
  } else if (typeof price === "number" && price > 0) {
    offers = {
      "@type": "Offer",
      priceCurrency: CURRENCY,
      price: fmt(price),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      url,
    };
  }

  if (!offers) return null;

  const product: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    url,
    sku: id,
    brand: { "@type": "Brand", name: "Chad Lewine" },
    offers,
  };

  if (description) product.description = description;
  if (images.length > 0) product.image = images;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(product) }}
    />
  );
}
