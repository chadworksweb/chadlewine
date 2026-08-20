// The door's own chrome, which is to say almost none of it.
//
// This is a SIBLING route group to (public), not a child, and that is the whole
// point: (public)/layout.tsx renders the Nav, the SubscribeSection, the
// patronage widget and the Footer around everything it wraps. The door has to
// close at exactly one viewport height, so it cannot inherit a header it did
// not budget for or a footer that pushes it into a scroll.
//
// What it DOES still inherit is the root layout, and that carries the parts
// worth keeping: SiteJsonLd (the WebSite + Person + MusicGroup graph, which is
// most of what an answer engine reads off this URL), the consent bootstrap, the
// cart and the player. A page with no navigation still describes the same
// entity as every other page on the site.

export default function FrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
