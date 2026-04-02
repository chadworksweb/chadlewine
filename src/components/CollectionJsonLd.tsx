interface CollectionItem {
  name: string;
  url: string;
  imageUrl?: string | null;
  price?: number | null;
}

interface CollectionJsonLdProps {
  name: string;
  description: string;
  url: string;
  items: CollectionItem[];
}

export function CollectionJsonLd({
  name,
  description,
  url,
  items,
}: CollectionJsonLdProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Product",
          name: item.name,
          url: item.url,
          ...(item.imageUrl ? { image: item.imageUrl } : {}),
          ...(item.price
            ? {
                offers: {
                  "@type": "Offer",
                  price: item.price.toFixed(2),
                  priceCurrency: "USD",
                  availability: "https://schema.org/InStock",
                },
              }
            : {}),
        },
      })),
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
