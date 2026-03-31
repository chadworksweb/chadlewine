"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  children?: { href: string; label: string }[];
}

const navItems: NavItem[] = [
  { href: "/observations", label: "Observations" },
  { href: "/meditations", label: "Meditations" },
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
  { href: "/chad-lewine", label: "About" },
];

export function Nav() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const lastScroll = useRef(0);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      setHidden(y > 200 && y > lastScroll.current);
      lastScroll.current = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setExpanded(null);
  }, [pathname]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function isParentActive(item: NavItem) {
    if (isActive(item.href)) return true;
    return item.children?.some((c) => isActive(c.href)) ?? false;
  }

  function handleParentEnter(label: string) {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    setExpanded(label);
  }

  function handleParentLeave() {
    collapseTimer.current = setTimeout(() => setExpanded(null), 200);
  }

  return (
    <header
      id="site-header"
      className={`site-header${hidden ? " site-header--hidden" : ""}`}
    >
      <nav className="site-nav">
        <Link href="/" className="site-nav__logo">
          Chad Lewine
        </Link>

        <div className="nav-links">
          {navItems.map((item) =>
            item.children ? (
              <div
                key={item.label}
                className="nav-links__parent"
                onMouseEnter={() => handleParentEnter(item.label)}
                onMouseLeave={handleParentLeave}
              >
                <Link
                  href={item.href}
                  className={`nav-links__item${isParentActive(item) ? " nav-links__item--active" : ""}`}
                >
                  {item.label}
                </Link>

                <div
                  className={`nav-links__dropdown${expanded === item.label ? " nav-links__dropdown--open" : " nav-links__dropdown--closed"}`}
                >
                  {item.children.map((child, i) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`nav-links__sub-item${isActive(child.href) ? " nav-links__sub-item--active" : ""}`}
                      style={{ "--nav-index": i, "--nav-index-rev": item.children!.length - 1 - i } as React.CSSProperties}
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
                className={`nav-links__item${isActive(item.href) ? " nav-links__item--active" : ""}`}
              >
                {item.label}
              </Link>
            )
          )}
        </div>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="nav-hamburger"
          aria-label="Toggle menu"
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </nav>

      {menuOpen && (
        <div className="nav-mobile-menu">
          {navItems.map((item) => (
            <div key={item.label}>
              <Link href={item.href} className="nav-mobile-menu__item">
                {item.label}
              </Link>
              {item.children?.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  className="nav-mobile-menu__item nav-mobile-menu__item--sub"
                >
                  {child.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
