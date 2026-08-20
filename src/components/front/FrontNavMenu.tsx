"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { SiteMenuGroups } from "@/components/SiteMenuGroups";
import type { NavItem } from "@/lib/nav-items";

// THE SITE MENU, ON THE FRONT DOOR. Same component the rest of the site uses.
//
// Why it is here at all: the cutover's one real cost was link distribution. The
// old homepage carried the nav, the footer and a long feed -- roughly forty
// internal links from the strongest page on the site -- and the front page
// carries six. This puts the site's own menu back on the door and takes it to
// twenty-six, from the URL that holds the backlinks.
//
// It renders .nav-hamburger and .nav-mobile-menu, the classes the site already
// styles, with SiteMenuGroups inside. Nothing is reimplemented: the expand
// behaviour, the stagger, the chevron and the open/close motion are the ones
// that already ship. The front page only supplies the button and positions the
// container, because that is the part that genuinely differs -- the nav hangs
// this under a full-width header, and here it hangs off the masthead.
//
// It replaces the theme switch that used to sit in this corner.
export function FrontNavMenu({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // The door has no ?booking subtlety to worry about, so plain path equality is
  // the whole of it. Nothing on the front page is ever "current" anyway: every
  // item in this menu goes somewhere else.
  const isActive = (href: string) => pathname === href.split("?")[0];
  const isParentActive = (item: NavItem) =>
    (item.href !== "#" && isActive(item.href)) ||
    (item.children?.some((c) => isActive(c.href)) ?? false);

  return (
    <div className="front__menu">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="nav-hamburger front__menu-button"
        aria-label="Toggle menu"
        aria-expanded={open}
      >
        {open ? "✕" : "☰"}
      </button>

      <div
        className={`nav-mobile-menu front__menu-panel${open ? " nav-mobile-menu--open" : ""}`}
        aria-hidden={!open}
      >
        <SiteMenuGroups
          items={items}
          isActive={isActive}
          isParentActive={isParentActive}
          onNavigate={() => setOpen(false)}
        />
      </div>
    </div>
  );
}
