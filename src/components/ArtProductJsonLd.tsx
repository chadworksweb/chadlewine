interface ArtProductOffer {
  id: string;
  title: string;
  price: number | null;
  edition_size: number;
  editions_sold: number;
}

interface ArtProductJsonLdProps {
  slug: string;
  title: string;
  description: string | null;
  image: string;
  products: ArtProductOffer[];
}

const CURRENCY = "USD";
const SITE = "https://chadlewine.com";

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function ArtProductJsonLd({
  slug,
  title,
  description,
  image,
  products,
}: ArtProductJsonLdProps) {
  const url = `${SITE}/art/${slug}`;
  const available = products.filter(
    (p) => typeof p.price === "number" && p.price! > 0 && p.editions_sold < p.edition_size,
  );

  if (available.length === 0) return null;

  const prices = available.map((p) => p.price as number);
  let offers: Record<string, unknown>;

  if (available.length === 1) {
    offers = {
      "@type": "Offer",
      priceCurrency: CURRENCY,
      price: fmt(prices[0]),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      url,
    };
  } else {
    offers = {
      "@type": "AggregateOffer",
      priceCurrency: CURRENCY,
      lowPrice: fmt(Math.min(...prices)),
      highPrice: fmt(Math.max(...prices)),
      offerCount: available.length,
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      url,
    };
  }

  const product: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    url,
    image,
    brand: { "@type": "Brand", name: "Chad Lewine" },
    offers,
  };

  if (description) product.description = description;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(product) }}
    />
  );
}
