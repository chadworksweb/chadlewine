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
        {/* DRAWN, NOT TYPED. The site nav uses the characters and gets away
            with it because they sit in a tall header where a pixel of drift is
            invisible. In a 34px square it is not, and it cannot be fixed with
            padding: both glyphs are drawn entirely above the baseline, and how
            far above depends on which font the machine falls back to, so the
            nudge that centres it on Windows leaves it high on a phone. An SVG
            has no baseline, so its box IS its ink and centring is exact
            everywhere. Same stroke weight as the account icon beside it. */}
        <svg
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          {open ? (
            <>
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </>
          ) : (
            <>
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </>
          )}
        </svg>
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
