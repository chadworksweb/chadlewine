"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { DEFAULT_NAV_ITEMS, type NavItem } from "@/lib/nav-items";

export function Nav({
  items = DEFAULT_NAV_ITEMS,
  initialSignedIn = null,
}: { items?: NavItem[]; initialSignedIn?: boolean | null } = {}) {
  const navItems = items;
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  // The art (gallery) template wants minimal chrome. The auto-hide threshold is
  // lowered there (read via a ref inside the scroll handler), and a pill does a
  // one-shot smooth scroll to exactly tuck the header away for full-bleed art --
  // after which normal sticky behavior (show on scroll-up / at top) resumes.
  // Art DETAIL pages only (/art/[slug]) -- not the /art index or /art/murals
  // index, which are their own immersive/list layouts.
  const onArt =
    (pathname?.startsWith("/art/") ?? false) && pathname !== "/art/murals";
  const onArtRef = useRef(onArt);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  // Seed from a server-side cookie check so the Account/Login link is in the
  // initial HTML — otherwise the /api/auth/me fetch below adds it ~1s after
  // first paint and pushes the rest of the menu around.
  const [signedIn, setSignedIn] = useState<boolean | null>(initialSignedIn);
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

  useEffect(() => { onArtRef.current = onArt; }, [onArt]);

  useEffect(() => {
    // Pages can opt to keep the nav visible past 200px by tagging an
    // element with `data-nav-keep-until` — auto-hide only kicks in once
    // the user scrolls past that element's bottom. On the art template the
    // threshold drops near the header height so a small scroll (or the pill's
    // one-shot scroll) tucks it away, and scroll-up brings it back.
    function onScroll() {
      const y = window.scrollY;
      const keepUntil = document.querySelector<HTMLElement>("[data-nav-keep-until]");
      const threshold = onArtRef.current
        ? 40
        : keepUntil
          ? y + keepUntil.getBoundingClientRect().bottom
          : 200;
      setHidden(y > threshold && y > lastScroll.current);
      lastScroll.current = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Pill: one-shot smooth scroll to tuck the header away and bring the gallery
  // flush to the top. The scroll handler hides the header as it passes the
  // (lowered) art threshold; normal sticky behavior governs afterward.
  function collapseHeader() {
    const nav =
      parseInt(getComputedStyle(document.documentElement).getPropertyValue("--nav-height"), 10) || 80;
    window.scrollTo({ top: nav, behavior: "smooth" });
  }

  // Reset overlay state on route change — adjusts during render only when
  // pathname changes (React docs' "adjusting state on prop change" pattern,
  // avoids an extra commit + dropdown flicker that the useEffect form had).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMenuOpen(false);
    setExpanded(null);
    setMobileExpanded(null);
  }

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
              aria-label={signedIn ? "Account" : "Login"}
              title={signedIn ? "Account" : "Login"}
            >
              <svg
                className="nav-links__account-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <circle cx="12" cy="8" r="3.6" />
                <path d="M4.5 19.5c1.4-3.4 4.3-5.2 7.5-5.2s6.1 1.8 7.5 5.2" />
              </svg>
            </Link>
          )}
        </div>

        {onArt && (
          <button
            type="button"
            onClick={collapseHeader}
            className="site-nav__hide"
            aria-label="Hide header for full-screen view"
            title="Tuck the header away"
          >
            <svg className="site-nav__hide-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M6 14.5 12 8.5l6 6" />
            </svg>
            <span className="site-nav__hide-label">Hide</span>
            <svg className="site-nav__hide-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M6 14.5 12 8.5l6 6" />
            </svg>
          </button>
        )}

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
