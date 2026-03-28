interface ProductJsonLdProps {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  image?: string;
  url: string;
  brand?: string;
  observationUrl?: string;
}

export function ProductJsonLd({
  name,
  description,
  price,
  currency = "USD",
  image,
  url,
  brand = "Chad Lewine",
  observationUrl,
}: ProductJsonLdProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    brand: { "@type": "Brand", name: brand },
    offers: {
      "@type": "Offer",
      price: (price / 100).toFixed(2),
      priceCurrency: currency,
      availability: "https://schema.org/InStock",
      url,
    },
  };

  if (description) schema.description = description;
  if (image) schema.image = image;
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
