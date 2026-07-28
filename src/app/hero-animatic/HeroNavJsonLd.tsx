import { SITE_URL } from "@/lib/artist-schema";
import { DOORS } from "./heroShapes";

// The hero's five doors, declared as site navigation.
//
// The site graph (SiteJsonLd) describes WHO the site is about: a WebSite, a
// Person, a MusicGroup. It says nothing about how the site is laid out. When
// the hero becomes the homepage's primary internal-linking hub, the five doors
// are the site's main navigation, and a crawler that never executes scripts has
// no other statement of that.
//
// Built from DOORS rather than a second hand-written list, for the same reason
// the DOM labels are projected rather than hardcoded: two copies drift, and a
// navigation schema pointing at a route that no longer exists is worse than no
// schema at all.
export function HeroNavJsonLd() {
  const graph = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Chad Lewine site navigation",
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: DOORS.map((d, i) => ({
      "@type": "SiteNavigationElement",
      position: i + 1,
      name: d.label,
      url: `${SITE_URL}${d.route}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
