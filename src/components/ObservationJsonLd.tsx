interface ObservationJsonLdProps {
  title: string;
  slug: string;
  description: string;
  dateCaptured: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  artImagePath?: string | null;
  artAlt?: string | null;
  articleType?: string | null;
  paaPairs?: { question: string; answer: string }[] | null;
}

export function ObservationJsonLd({
  title,
  slug,
  description,
  dateCaptured,
  publishedAt,
  updatedAt,
  artImagePath,
  artAlt,
  articleType,
  paaPairs,
}: ObservationJsonLdProps) {
  const isNews = articleType === "news_article";

  const articleSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": isNews ? "NewsArticle" : "Article",
    headline: title,
    description,
    url: `https://chadlewine.com/observations/${slug}`,
    datePublished: publishedAt || dateCaptured,
    dateModified: updatedAt || publishedAt || dateCaptured,
    author: {
      "@type": "Person",
      name: "Chad Lewine",
      url: "https://chadlewine.com/chad-lewine",
    },
    publisher: {
      "@type": "Person",
      name: "Chad Lewine",
      url: "https://chadlewine.com",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://chadlewine.com/observations/${slug}`,
    },
  };

  if (artImagePath) {
    articleSchema.image = {
      "@type": "ImageObject",
      url: artImagePath,
      width: 1200,
      height: 630,
      ...(artAlt ? { description: artAlt } : {}),
    };
  }

  const schemas = [articleSchema];

  // FAQPage schema from PAA pairs
  if (paaPairs && paaPairs.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: paaPairs.map((pair) => ({
        "@type": "Question",
        name: pair.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: pair.answer,
        },
      })),
    });
  }

  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}
