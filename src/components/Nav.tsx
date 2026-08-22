"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { DEFAULT_NAV_ITEMS, type NavItem } from "@/lib/nav-items";
import { SiteMenuGroups } from "@/components/SiteMenuGroups";

// How far the page has to travel in one direction before the header changes
// state. Deliberately larger than the settling slop of a smooth scroll and
// larger than the sub-pixel noise iOS emits while a momentum scroll winds
// down, and small enough that a deliberate upward flick brings the bar back
// on the first frame the finger moves.
const NAV_DIR_DELTA = 12;

// Reads the `?booking` flag reactively. Isolated behind Suspense so the rest of
// the app can still be statically prerendered (useSearchParams otherwise opts
// the whole tree into client rendering).
function BookingProbe({ onChange }: { onChange: (booking: boolean) => void }) {
  const searchParams = useSearchParams();
  const booking = searchParams.get("booking") !== null;
  useEffect(() => {
    onChange(booking);
  }, [booking, onChange]);
  return null;
}

export function Nav({
  items = DEFAULT_NAV_ITEMS,
  initialSignedIn = null,
}: { items?: NavItem[]; initialSignedIn?: boolean | null } = {}) {
  const navItems = items;
  const pathname = usePathname();
  const [booking, setBooking] = useState(false);
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
  // Seed from a server-side cookie check so the Account/Login link is in the
  // initial HTML — otherwise the /api/auth/me fetch below adds it ~1s after
  // first paint and pushes the rest of the menu around.
  const [signedIn, setSignedIn] = useState<boolean | null>(initialSignedIn);
  // The scroll position the current direction is measured FROM, not the last
  // position seen. See NAV_DIR_DELTA in the scroll effect.
  const scrollAnchor = useRef(0);
  // Whether a [data-nav-below] hero was covering the header's band on the last
  // scroll event, so the moment it stops can be treated as an arrival rather
  // than as one more scroll down. See the handler.
  const heroCovering = useRef(false);
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
    // The header's own band, read once rather than per event so scrolling never
    // forces a style recalc. It is a single :root value with no breakpoint
    // override, so there is nothing to remeasure on resize.
    const navHeight =
      parseInt(getComputedStyle(document.documentElement).getPropertyValue("--nav-height"), 10) || 80;
    // Pages can opt to keep the nav visible past 200px by tagging an
    // element with `data-nav-keep-until` — auto-hide only kicks in once
    // the user scrolls past that element's bottom. On the art template the
    // threshold drops near the header height so a small scroll (or the pill's
    // one-shot scroll) tucks it away, and scroll-up brings it back.
    function onScroll() {
      const y = window.scrollY;
      // A page can hand the whole first screen to a full-bleed hero by tagging
      // it `data-nav-below`. Nothing is allowed on top of that hero, so the
      // header stays lifted while it still covers the top of the viewport and
      // returns as the content below arrives. The class is stamped before first
      // paint by the hero itself (a scroll handler cannot run that early, and
      // the bar would flash across the hero); this only has to clear it.
      const below = document.querySelector<HTMLElement>("[data-nav-below]");
      if (below) {
        // "Covering" is measured against the header's own band, not against the
        // viewport top, and the animatic's exit is why. #home-enter sits at the
        // hero's bottom edge carrying scroll-margin-top: var(--nav-height), so
        // the move that ends the intro -- skip and "enter homepage" both run it
        // -- lands with the hero's last nav-height strip still on screen,
        // directly behind where the bar sits. Tested against 0 that reads as
        // "still covering", and the header never came back from the one journey
        // whose whole purpose is to bring it back.
        //
        // Nothing is on top of the hero either way: at the crossing the bar
        // covers exactly the strip the page has already travelled past, and the
        // feed underneath is at the top of the viewport where it belongs. The
        // spare pixel absorbs the sub-pixel slop in 100svh, which can otherwise
        // leave the landing a fraction short of the crossing and hold the
        // header out over a rounding error.
        const covering = below.getBoundingClientRect().bottom > navHeight + 1;
        const wasCovering = heroCovering.current;
        heroCovering.current = covering;
        document.documentElement.classList.toggle("ha-hero-top", covering);
        if (covering) {
          scrollAnchor.current = y;
          return;
        }
        if (wasCovering) {
          // ARRIVING IS THE REVEAL. The travel down off the hero is still a
          // downward scroll, and the auto-hide below reads every one of those
          // as "tuck the bar away" -- so on the frame the header was finally
          // allowed back it was sent straight out again, which on a phone (no
          // data-nav-keep-until below 768px) looked exactly like the header
          // never returning at all.
          setHidden(false);
          scrollAnchor.current = y;
          return;
        }
      }
      // data-nav-keep-until keeps the nav pinned through a section (homepage
      // Latest Songs) on desktop/tablet. On mobile (<=768px) we want the nav to
      // auto-hide everywhere so the feed headings can pin flush at the viewport
      // top, so the marker is ignored below that width.
      const keepUntil = window.innerWidth > 768
        ? document.querySelector<HTMLElement>("[data-nav-keep-until]")
        : null;
      const threshold = onArtRef.current
        ? 40
        : keepUntil
          ? y + keepUntil.getBoundingClientRect().bottom
          : 200;
      // Above the threshold the bar is simply present, and the anchor rides
      // along so crossing the threshold does not immediately read as a gesture.
      if (y <= threshold) {
        setHidden(false);
        scrollAnchor.current = y;
        return;
      }
      // Direction is measured against the anchor -- the position the current
      // gesture started from -- and NOT against the previous scroll event.
      // That distinction is the whole fix. A flick DECELERATES: iOS delivers
      // scroll at 60Hz and the tail of every swipe arrives as 4px, 2px, 1px,
      // 0px frames. Compared per event those read as "no longer scrolling
      // down", so the bar slid back in at the end of every single downward
      // swipe and shot out again on the next one -- a 250ms slide each way,
      // twice per swipe, which is the flicker on the phone.
      // Against an anchor the tail is still 300px below where the gesture
      // began, so nothing moves until the page actually travels back up.
      const delta = y - scrollAnchor.current;
      if (delta > NAV_DIR_DELTA) {
        setHidden(true);
        scrollAnchor.current = y;
      } else if (delta < -NAV_DIR_DELTA) {
        setHidden(false);
        scrollAnchor.current = y;
      }
      // Inside the band: leave both the state and the anchor alone, so small
      // moves keep accumulating toward a real reversal instead of resetting.
    }
    // Run it once rather than waiting for the first scroll. A page restored
    // mid-scroll (back/forward) never fires one, and the hero stamps
    // ha-hero-top before first paint on the assumption that it owns the top of
    // the viewport, which is not true when the browser has put you halfway down
    // the page. Left to the first scroll, the header stays hidden and the
    // cookie bar, which waits on the same class, stays away with it.
    onScroll();
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
  }

  // Exact-match active state: only the page you are actually on lights up. No
  // prefix matching (so /super-individual never lights up on /super-individual-
  // night, and /irl never lights up on an /irl/<event> detail page). The
  // booking view is a distinct URL (?booking) on the same path, so it activates
  // its own item ("Booking") and NOT the Super Individual Night overview item.
  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    const [hrefPath, hrefQuery] = href.split("?");
    if (pathname !== hrefPath) return false;
    if (hrefQuery === "booking") return booking;
    return !booking;
  }

  function isParentActive(item: NavItem) {
    if (item.href !== "#" && isActive(item.href)) return true;
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
      <Suspense fallback={null}>
        <BookingProbe onChange={setBooking} />
      </Suspense>
      <nav className="site-nav">
        {/* /home#home-enter, not /. / is the front page now; the animatic and
            the feed live at /home. The hash is what the hero's boot script
            reads as "put me at the feed": it skips the scroll lock and lands on
            the entered state. Bare /home replays the animatic intro, which is
            the wrong answer for someone clicking the logo to get home. */}
        <Link href="/home#home-enter" className="site-nav__logo">
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
          <SiteMenuGroups
            items={navItems}
            isActive={isActive}
            isParentActive={isParentActive}
            onNavigate={() => setMenuOpen(false)}
          />
      </div>
    </header>
  );
}
