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

// Theme, resolved before the door paints.
//
// The site is dark-only everywhere else, so there is no site-wide theme state to
// read and nothing to keep in sync. The stamp is therefore its OWN attribute,
// data-front-theme, rather than a generic data-theme: a name that broad would
// read as a promise the other 40 routes do not keep.
//
// Two states, and no attribute means DARK, which is what the rest of the site
// is. prefers-color-scheme is deliberately not consulted: a light-OS visitor
// landing on a cream page would meet a version of the brand that exists nowhere
// else on chadlewine.com. Only an explicit choice is ever written, so this
// script does nothing at all for the visitor who never pressed the switch.
//
// Inline and synchronous because anything deferred lands after first paint,
// which is the flash it exists to prevent. It sits ahead of the door markup in
// the body, so the attribute is on <html> before the door's first pixel.
const FRONT_THEME_BOOTSTRAP = `
(function(){try{var t=localStorage.getItem("cl-front-theme");
if(t==="light"||t==="dark")document.documentElement.setAttribute("data-front-theme",t);}catch(e){}})();
`;

export default function FrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: FRONT_THEME_BOOTSTRAP }} />
      {children}
    </>
  );
}
