export const RESERVED_SLUGS = new Set<string>([
  "admin",
  "api",
  "cl-admin-6nnn",
  "preview",
  "sitemap.xml",
  "robots.txt",
  "archive",
  "art",
  "business",
  "chad-d",
  "chad-lewine",
  "chad-rising",
  "curation",
  "discography",
  "foundations",
  "home-preview",
  "honeychrome",
  "lyrics",
  "meditations",
  "merch",
  "music",
  "observations",
  "thinking",
  "video",
  "doors",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}
