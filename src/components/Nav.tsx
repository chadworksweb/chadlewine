"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { DEFAULT_NAV_ITEMS, type NavItem } from "@/lib/nav-items";

export function Nav({ items = DEFAULT_NAV_ITEMS }: { items?: NavItem[] } = {}) {
  const navItems = items;
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const lastScroll = useRef(0);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setSignedIn(!!d.user);
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    // Pages can opt to keep the nav visible past 200px by tagging an
    // element with `data-nav-keep-until` — auto-hide only kicks in once
    // the user scrolls past that element's bottom.
    function onScroll() {
      const y = window.scrollY;
      const keepUntil = document.querySelector<HTMLElement>("[data-nav-keep-until]");
      const threshold = keepUntil
        ? y + keepUntil.getBoundingClientRect().bottom
        : 200;
      setHidden(y > threshold && y > lastScroll.current);
      lastScroll.current = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setExpanded(null);
    setMobileExpanded(null);
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
          <span className="site-nav__logo-frame site-nav__logo-frame--left" aria-hidden="true">
            <span className="logo-shape">░</span><span className="logo-shape">▒</span><span className="logo-shape">▓</span><span className="logo-shape">█</span>
          </span>
          <span className="site-nav__logo-text">Chad Lewine</span>
          <span className="site-nav__logo-frame site-nav__logo-frame--right" aria-hidden="true">
            <span className="logo-shape">█</span><span className="logo-shape">▓</span><span className="logo-shape">▒</span><span className="logo-shape">░</span>
          </span>
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
          {signedIn !== null && (
            <Link
              href={signedIn ? "/account" : "/account/login"}
              className={`nav-links__item nav-links__item--account${isActive("/account") ? " nav-links__item--active" : ""}`}
            >
              {signedIn ? "Account" : "Login"}
            </Link>
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

      <div
        className={`nav-mobile-menu${menuOpen ? " nav-mobile-menu--open" : ""}`}
        aria-hidden={!menuOpen}
      >
          {navItems.map((item) =>
            item.children ? (
              <div key={item.label} className="nav-mobile-menu__group">
                <div className="nav-mobile-menu__row">
                  <Link
                    href={item.href}
                    className={`nav-mobile-menu__item nav-mobile-menu__item--parent${isParentActive(item) ? " nav-mobile-menu__item--active" : ""}`}
                  >
                    {item.label}
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setMobileExpanded(mobileExpanded === item.label ? null : item.label);
                    }}
                    className={`nav-mobile-menu__chevron${mobileExpanded === item.label ? " nav-mobile-menu__chevron--open" : ""}`}
                    aria-label={`Toggle ${item.label} submenu`}
                    aria-expanded={mobileExpanded === item.label}
                  >
                    <span aria-hidden>▾</span>
                  </button>
                </div>
                <div
                  className={`nav-mobile-menu__dropdown${mobileExpanded === item.label ? " nav-mobile-menu__dropdown--open" : " nav-mobile-menu__dropdown--closed"}`}
                >
                  {item.children.map((child, i) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`nav-mobile-menu__item nav-mobile-menu__item--sub${isActive(child.href) ? " nav-mobile-menu__item--active" : ""}`}
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
                className={`nav-mobile-menu__item${isActive(item.href) ? " nav-mobile-menu__item--active" : ""}`}
              >
                {item.label}
              </Link>
            )
          )}
      </div>
    </header>
  );
}
