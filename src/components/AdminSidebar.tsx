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
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/admin/voice-profile", label: "Voice Profile" },
      { href: "/admin/seo", label: "SEO" },
      { href: "/admin/redirects", label: "Redirects" },
      { href: "/admin/subscribers", label: "Subscribers" },
    ],
  },
  {
    href: "/admin/music",
    label: "Music",
    children: [
      { href: "/admin/music", label: "Overview" },
      { href: "/admin/music/albums", label: "Albums" },
      { href: "/admin/music/songs", label: "Songs" },
    ],
  },
  {
    href: "/admin/arc",
    label: "Arc",
    children: [
      { href: "/admin/arc", label: "Overview" },
      { href: "/admin/arc/capture", label: "Capture" },
      { href: "/admin/arc/sections", label: "Sections" },
    ],
  },
  { href: "/admin/art", label: "Art" },
  {
    href: "/admin/merch",
    label: "Merch",
    children: [
      { href: "/admin/merch", label: "Products" },
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
  { href: "/admin/foundations", label: "Foundations" },
  { href: "/admin/door-pages", label: "Door Pages" },
  { href: "/admin/pages", label: "Pages (meta)" },
  {
    href: "/admin/curation",
    label: "Curation",
    children: [
      { href: "/admin/curation", label: "Curated Entries" },
      { href: "/admin/homepage-hero", label: "Homepage Hero" },
      { href: "/admin/cl-stream", label: "CL Stream" },
    ],
  },
  { href: "/admin/videos", label: "Videos" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  async function handleLogout() {
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
