"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavItem } from "@/lib/nav-items";

// The site menu's expanding list: one row per top-level item, a chevron where
// there are children, one section open at a time.
//
// Lifted out of Nav.tsx UNCHANGED so a second surface can use it. The front
// page needs the same menu the rest of the site has, and the alternative --
// writing a second one -- is how two menus drift until the door advertises a
// page the nav stopped linking to.
//
// Everything here keeps its .nav-mobile-menu__* class names, so it also keeps
// the styling, the stagger and the open/close motion that already existed. The
// only thing the caller supplies is the container and the button that opens it,
// because those differ: the nav puts the list under a full-width header, and
// the front page hangs it off the masthead.
//
// ACTIVE STATE IS INJECTED rather than computed here. The nav's own isActive
// knows about ?booking, which distinguishes the Booking item from the Super
// Individual Night item on the same path. A default is provided for callers
// with no such subtlety.
export function SiteMenuGroups({
  items,
  isActive,
  isParentActive,
  onNavigate,
}: {
  items: NavItem[];
  isActive: (href: string) => boolean;
  isParentActive: (item: NavItem) => boolean;
  onNavigate?: () => void;
}) {
  // One section at a time. Opening a second closes the first, which is what
  // keeps the list short enough to scan on a phone.
  const [expanded, setExpanded] = useState<string | null>(null);

  // Collapse on navigation, so the menu is not still holding a section open
  // from two pages ago the next time it is opened. Nav used to do this from its
  // own route-change reset; the state moved here, so the reset did too. Set
  // during render rather than in an effect (React's "adjusting state on prop
  // change" pattern), which is what avoids the extra commit and the flicker.
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setExpanded(null);
  }

  return (
    <>
      {items.map((item) =>
        item.children ? (
          <div key={item.label} className="nav-mobile-menu__group">
            <div className="nav-mobile-menu__row">
              <Link
                href={item.href}
                onClick={onNavigate}
                className={`nav-mobile-menu__item nav-mobile-menu__item--parent${isParentActive(item) ? " nav-mobile-menu__item--active" : ""}`}
              >
                {item.label}
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setExpanded(expanded === item.label ? null : item.label);
                }}
                className={`nav-mobile-menu__chevron${expanded === item.label ? " nav-mobile-menu__chevron--open" : ""}`}
                aria-label={`Toggle ${item.label} submenu`}
                aria-expanded={expanded === item.label}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M5 9l7 7 7-7" />
                </svg>
              </button>
            </div>
            <div
              className={`nav-mobile-menu__dropdown${expanded === item.label ? " nav-mobile-menu__dropdown--open" : " nav-mobile-menu__dropdown--closed"}`}
            >
              {item.children.map((child, i) => (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={onNavigate}
                  className={`nav-mobile-menu__item nav-mobile-menu__item--sub${isActive(child.href) ? " nav-mobile-menu__item--active" : ""}`}
                  style={
                    {
                      "--nav-index": i,
                      "--nav-index-rev": item.children!.length - 1 - i,
                    } as React.CSSProperties
                  }
                >
                  {child.label}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`nav-mobile-menu__item${isActive(item.href) ? " nav-mobile-menu__item--active" : ""}`}
          >
            {item.label}
          </Link>
        )
      )}
    </>
  );
}
