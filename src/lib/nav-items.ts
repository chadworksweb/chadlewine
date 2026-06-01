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
      { href: "/music-videos", label: "Music Videos" },
      { href: "/music/songs", label: "Songs" },
      { href: "/lyrics", label: "Lyrics" },
      { href: "/curation", label: "Curation" },
    ],
  },
  { href: "/merch", label: "Merch" },
  { href: "/art", label: "Art" },
  { href: "/irl", label: "IRL" },
  // { href: "/meditations", label: "Meditations" },   // hidden — music-first pivot
  { href: "/observations", label: "Observations" },
  {
    href: "/chad-lewine",
    label: "About",
    children: [
      { href: "/pillar-songs", label: "Pillar Songs" },
      { href: "/radiant-arc", label: "Radiant Arc" },
      { href: "/super-individual", label: "Super Individual" },
      { href: "/songwriting", label: "Songwriting" },
      { href: "/super-individual-night", label: "Booking" },
    ],
  },
];
