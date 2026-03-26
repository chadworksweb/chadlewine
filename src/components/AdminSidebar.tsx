"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const adminNav = [
  { href: "/admin/observations", label: "Observations" },
  { href: "/admin/tldrs", label: "TLDRs" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/thoughtlines", label: "Thoughtlines" },
  { href: "/admin/tags", label: "Tags" },
  { href: "/admin/foundations", label: "Foundations" },
  { href: "/admin/subscribers", label: "Subscribers" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/seo", label: "SEO" },
  { href: "/admin/voice-profile", label: "Voice Profile" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/merch", label: "Merch" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.href = "/login";
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
          const isActive = pathname.startsWith(item.href);
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
