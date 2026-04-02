interface ProductJsonLdProps {
  name: string;
  description?: string | null;
  price: number;
  currency?: string;
  imageUrl?: string | null;
  url: string;
  observationUrl?: string | null;
  availability?: "InStock" | "OutOfStock" | "PreOrder";
}

export function ProductJsonLd({
  name,
  description,
  price,
  currency = "USD",
  imageUrl,
  url,
  observationUrl,
  availability = "InStock",
}: ProductJsonLdProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    url,
    brand: {
      "@type": "Brand",
      name: "Chad Lewine",
    },
    offers: {
      "@type": "Offer",
      price: price.toFixed(2),
      priceCurrency: currency,
      availability: `https://schema.org/${availability}`,
      seller: {
        "@type": "Person",
        name: "Chad Lewine",
        url: "https://chadlewine.com",
      },
    },
  };

  if (description) schema.description = description;
  if (imageUrl) schema.image = imageUrl;
  if (observationUrl) {
    schema.isRelatedTo = {
      "@type": "Article",
      url: observationUrl,
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
