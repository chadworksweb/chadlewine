export interface NavItem {
  href: string;
  label: string;
  children?: { href: string; label: string }[];
}

export const DEFAULT_NAV_ITEMS: NavItem[] = [
  {
    href: "/music",
    label: "Music",
    children: [
      { href: "/discography", label: "Discography" },
      { href: "/curation", label: "Curation" },
      { href: "/lyrics", label: "Lyrics" },
      { href: "/video", label: "Video" },
    ],
  },
  { href: "/art", label: "Art" },
  { href: "/merch", label: "Store" },
  // { href: "/meditations", label: "Meditations" },   // hidden — music-first pivot
  // { href: "/observations", label: "Observations" }, // hidden from nav — surfaced only from song pages
  { href: "/chad-lewine", label: "About" },
];
