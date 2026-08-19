export interface ManagedPage {
  route: string;
  label: string;
}

export const MANAGED_PAGES: ManagedPage[] = [
  { route: "/", label: "Home" },
  { route: "/chad-lewine", label: "About (Chad Lewine)" },
  { route: "/radiant-arc", label: "Radiant Arc" },
  { route: "/foundations", label: "Foundations (index)" },
  { route: "/art", label: "Art" },
  { route: "/videos", label: "Videos" },
  // chad-rising / chad-d / honeychrome are CMS pages (Pages CMS 'standard');
  // their SEO comes from pages.seo_*, not the page_meta override path.
  { route: "/discography", label: "Discography" },
  { route: "/music", label: "Music" },
  { route: "/curation", label: "Curation (index)" },
  { route: "/curation/cl-stream", label: "CL Stream" },
  { route: "/archive/xanga", label: "Xanga Archive" },
  { route: "/business", label: "Business" },
  { route: "/merch", label: "Merch" },
  { route: "/observations", label: "Observations (index)" },
  { route: "/journal", label: "Journal (index)" },
  { route: "/lyrics", label: "Lyrics (index)" },
  { route: "/meditations", label: "Meditations (index)" },
];

export function routeToSlug(route: string): string {
  if (route === "/") return "home";
  return route.replace(/^\//, "").replace(/\//g, "--");
}

export function slugToRoute(slug: string): string {
  if (slug === "home") return "/";
  return "/" + slug.replace(/--/g, "/");
}
