export interface ManagedPage {
  route: string;
  label: string;
}

export const MANAGED_PAGES: ManagedPage[] = [
  { route: "/", label: "Home" },
  { route: "/chad-lewine", label: "Who Is Chad Lewine" },
  { route: "/foundations", label: "Foundations (index)" },
  { route: "/art", label: "Art" },
  { route: "/video", label: "Video" },
  { route: "/chad-rising", label: "Chad Rising" },
  { route: "/chad-d", label: "Chad D" },
  { route: "/honeychrome", label: "HoneyChrome" },
  { route: "/discography", label: "Discography" },
  { route: "/music", label: "Music" },
  { route: "/curation", label: "Curation (index)" },
  { route: "/curation/cl-stream", label: "CL Stream" },
  { route: "/archive/xanga", label: "Xanga Archive" },
  { route: "/business", label: "Business" },
  { route: "/merch", label: "Merch" },
  { route: "/observations", label: "Observations (index)" },
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
