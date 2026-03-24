"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Observations" },
  { href: "/domains/general", label: "Domains" },
  { href: "/foundations", label: "Foundations" },
  { href: "/chad-lewine", label: "About" },
];

export function Nav() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastScroll = useRef(0);

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
  }, [pathname]);

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
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-links__item ${
                pathname === link.href ||
                (link.href !== "/" && pathname.startsWith(link.href))
                  ? "nav-links__item--active"
                  : ""
              }`}
            >
              {link.label}
            </Link>
          ))}
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
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-mobile-menu__item"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
