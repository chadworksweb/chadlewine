import type { EntityType } from "@/lib/related-entities";

// Single source of truth for turning a (type, slug) into its public URL. Mirrors
// the hrefs resolveEntities() builds and the (public) route tree. Pass
// absolute=true for contexts that leave the site (campaign emails); relative is
// fine for on-site links (observation/discography bodies).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com";

const CONTENT_PATHS: Record<EntityType, (slug: string) => string> = {
  song: (s) => `/music/songs/${s}`,
  release: (s) => `/music/releases/${s}`,
  observation: (s) => `/observations/${s}`,
  art: (s) => `/art/${s}`,
  merch: (s) => `/merch/${s}`,
};

export function buildContentUrl(
  type: EntityType,
  slug: string,
  absolute = false,
  // observations + journal share the "observation" entity type but live under
  // different sections; pass kind="journal" to route to /journal/...
  kind?: string | null,
): string {
  const path =
    type === "observation" && kind === "journal"
      ? `/journal/${slug}`
      : CONTENT_PATHS[type]
        ? CONTENT_PATHS[type](slug)
        : "/";
  return absolute ? `${SITE_URL}${path}` : path;
}

/** Make a site-relative path absolute when needed (campaign emails). */
export function absolutizeUrl(path: string, absolute = false): string {
  return absolute && path.startsWith("/") ? `${SITE_URL}${path}` : path;
}

// Key static pages that aren't rows in a content table but are common link
// targets. Searched by label in the link picker alongside live content.
export interface StaticPage {
  label: string;
  path: string;
}
export const STATIC_PAGES: StaticPage[] = [
  { label: "Home", path: "/" },
  { label: "Discography", path: "/discography" },
  { label: "Songs", path: "/music/songs" },
  { label: "Music", path: "/music" },
  { label: "Pillar Songs", path: "/pillar-songs" },
  { label: "Super Individual", path: "/super-individual" },
  { label: "Songwriting", path: "/songwriting" },
  { label: "Lyrics", path: "/lyrics" },
  { label: "Art", path: "/art" },
  { label: "Merch", path: "/merch" },
  { label: "Observations", path: "/observations" },
  { label: "Journal", path: "/journal" },
  { label: "Music Videos", path: "/music-videos" },
  { label: "Meditations", path: "/meditations" },
  { label: "Curation", path: "/curation" },
  { label: "About (Chad Lewine)", path: "/chad-lewine" },
];
