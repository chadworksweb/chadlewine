export function SiteJsonLd() {
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Chad Lewine",
    url: "https://chadlewine.com",
    description:
      "Cross-domain observations that connect the invisible patterns between music, money, faith, identity, consciousness, and everything else.",
    author: {
      "@type": "Person",
      name: "Chad Lewine",
      url: "https://chadlewine.com/chad-lewine",
    },
  };

  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Chad Lewine",
    url: "https://chadlewine.com/chad-lewine",
    knowsAbout: [
      "Music",
      "Technology",
      "Business Strategy",
      "Applied Thinking",
      "Consciousness",
      "Identity",
      "Faith",
      "Economics",
    ],
    hasOccupation: {
      "@type": "Occupation",
      name: "Cross-Domain Observer and Architect",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />
    </>
  );
}
