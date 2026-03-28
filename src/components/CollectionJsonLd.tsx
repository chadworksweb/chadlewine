interface CollectionItem {
  name: string;
  url: string;
}

interface CollectionJsonLdProps {
  name: string;
  description?: string;
  url: string;
  items: CollectionItem[];
}

export function CollectionJsonLd({ name, description, url, items }: CollectionJsonLdProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    url,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        url: item.url,
      })),
    },
  };

  if (description) schema.description = description;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
