import { getFeatureFlags } from "./feature-flags";
import { DEFAULT_NAV_ITEMS, type NavItem } from "@/components/Nav";

// Map nav hrefs → feature_flags.section keys
const HREF_TO_SECTION: Record<string, string> = {
  "/observations": "observations",
  "/meditations": "meditations",
  "/music": "music",
  "/discography": "music",
  "/curation": "curation",
  "/lyrics": "lyrics",
  "/video": "video",
  "/art": "art",
  "/chad-lewine": "chad-lewine",
  "/thinking": "thinking",
  "/foundations": "foundations",
};

export async function getVisibleNavItems(): Promise<NavItem[]> {
  // On staging and local dev, always show everything.
  if (process.env.VERCEL_ENV !== "production") return DEFAULT_NAV_ITEMS;

  const flags = await getFeatureFlags();
  const isLive = (href: string) => {
    const section = HREF_TO_SECTION[href];
    if (!section) return true;
    return flags[section] === true;
  };

  return DEFAULT_NAV_ITEMS.flatMap((item) => {
    if (!isLive(item.href)) return [];
    if (!item.children) return [item];
    const visibleChildren = item.children.filter((c) => isLive(c.href));
    return [{ ...item, children: visibleChildren }];
  });
}
