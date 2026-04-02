interface ImageObjectJsonLdProps {
  url: string;
  name: string;
  description?: string | null;
  width?: number;
  height?: number;
  acquireLicensePage?: string | null;
}

export function ImageObjectJsonLd({
  url,
  name,
  description,
  width = 1200,
  height = 630,
  acquireLicensePage,
}: ImageObjectJsonLdProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    url,
    name,
    ...(description ? { description } : {}),
    width,
    height,
    creator: {
      "@type": "Person",
      name: "Chad Lewine",
    },
    copyrightHolder: {
      "@type": "Person",
      name: "Chad Lewine",
    },
    license: "https://chadlewine.com/foundations",
  };

  if (acquireLicensePage) {
    schema.acquireLicensePage = acquireLicensePage;
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
