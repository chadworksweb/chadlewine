"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  children?: { href: string; label: string }[];
}

const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", exact: true },
  {
    href: "/admin/settings",
    label: "Settings",
    children: [
      { href: "/admin/settings", label: "Overview" },
      { href: "/admin/launch-control", label: "Launch Control" },
      { href: "/admin/voice-profile", label: "Voice Profile" },
      { href: "/admin/seo", label: "SEO" },
      { href: "/admin/songwriting", label: "Songwriting Grid" },
      { href: "/admin/redirects", label: "Redirects" },
      { href: "/admin/arc", label: "Arc — Overview" },
      { href: "/admin/arc/capture", label: "Arc — Capture" },
      { href: "/admin/arc/sections", label: "Arc — Sections" },
    ],
  },
  {
    href: "/admin/audience",
    label: "Audience",
    children: [
      { href: "/admin/audience", label: "Members" },
      { href: "/admin/campaigns", label: "Campaigns" },
      { href: "/admin/email-templates", label: "Email templates" },
      { href: "/admin/fan-tracks", label: "For my fans" },
      { href: "/admin/analytics", label: "Analytics" },
    ],
  },
  {
    href: "/admin/music",
    label: "Music",
    children: [
      { href: "/admin/music", label: "Overview" },
      { href: "/admin/music/releases", label: "Releases" },
      { href: "/admin/music/songs", label: "Songs" },
      { href: "/admin/pillar-songs", label: "Pillar Songs" },
      { href: "/admin/music/analytics/plays", label: "Song Plays" },
      { href: "/admin/curation", label: "Curation — Entries" },
      { href: "/admin/homepage-hero", label: "Curation — Homepage Hero" },
      { href: "/admin/cl-stream", label: "Curation — CL Stream" },
    ],
  },
  { href: "/admin/inquiries", label: "Inquiries" },
  { href: "/admin/art", label: "Art" },
  {
    href: "/admin/merch",
    label: "Merch",
    children: [
      { href: "/admin/merch", label: "Products" },
      { href: "/admin/collections", label: "Collections" },
      { href: "/admin/merch/orders", label: "Orders" },
    ],
  },
  { href: "/admin/media", label: "Media" },
  {
    href: "/admin/observations",
    label: "Observations",
    children: [
      { href: "/admin/observations", label: "Overview" },
      { href: "/admin/meditations", label: "Meditations" },
      { href: "/admin/categories", label: "Categories" },
      { href: "/admin/thoughtlines", label: "Thoughtlines" },
      { href: "/admin/tags", label: "Tags" },
    ],
  },
  {
    href: "/admin/pages",
    label: "Pages",
    children: [
      { href: "/admin/pages", label: "Pages (meta)" },
      { href: "/admin/door-pages", label: "Door Pages" },
      { href: "/admin/foundations", label: "Foundations" },
    ],
  },
  { href: "/admin/videos", label: "Videos" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("cl_posthog_reset", "1");
    }
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.href = "/cl-admin-6nnn";
  }

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar__header">
        <Link href="/" className="admin-sidebar__logo">
          CL
        </Link>
        <span className="admin-sidebar__badge">Admin</span>
      </div>

      <nav className="admin-sidebar__nav">
        {adminNav.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          if (item.children) {
            return (
              <div key={item.href} className="admin-sidebar__flyout-wrap">
                <Link
                  href={item.href}
                  className={`admin-sidebar__link${isActive ? " admin-sidebar__link--active" : ""}`}
                >
                  {item.label}
                </Link>
                <div className="admin-sidebar__flyout">
                  <div className="admin-sidebar__flyout-title">{item.label}</div>
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className="admin-sidebar__flyout-item"
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-sidebar__link${isActive ? " admin-sidebar__link--active" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="admin-sidebar__footer">
        <Link href="/" className="admin-sidebar__link" target="_blank">
          View Site
        </Link>
        <button
          className="admin-sidebar__logout"
          onClick={handleLogout}
          type="button"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
