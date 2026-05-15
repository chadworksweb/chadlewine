interface ImageObjectJsonLdProps {
  url: string;
  name: string;
  description?: string | null;
  width?: number;
  height?: number;
}

export function ImageObjectJsonLd({
  url,
  name,
  description,
  width = 1200,
  height = 630,
}: ImageObjectJsonLdProps) {
  // Attribution only — no `license` / `acquireLicensePage`, so the image is
  // not opted into Google's Image License feature (no badge, no required-
  // field warnings in Search Console).
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
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
