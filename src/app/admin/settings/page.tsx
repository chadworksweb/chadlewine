import Link from "next/link";

const ITEMS = [
  { href: "/admin/launch-control", label: "Launch Control", blurb: "Toggle site sections live." },
  { href: "/admin/analytics", label: "Analytics", blurb: "Traffic, conversions, events." },
  { href: "/admin/voice-profile", label: "Voice Profile", blurb: "Chad Lewine voice persona." },
  { href: "/admin/seo", label: "SEO", blurb: "Metadata, structured data, GEO scores." },
  { href: "/admin/settings/sitemaps", label: "Sitemaps", blurb: "Index + per-section sitemaps, URL counts, health." },
  { href: "/admin/subscribers", label: "Subscribers", blurb: "Newsletter + patronage." },
];

export default function AdminSettingsPage() {
  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Settings</h1>
      </div>
      <div className="admin-settings-grid">
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className="admin-settings-card">
            <span className="admin-settings-card__label">{item.label}</span>
            <span className="admin-settings-card__blurb">{item.blurb}</span>
          </Link>
        ))}
      </div>
      <style>{`
        .admin-settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 0.75rem;
        }
        .admin-settings-card {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 1rem;
          background: var(--bg-glass, rgba(255, 255, 255, 0.04));
          border: 1px solid var(--bg-glass-border, rgba(255, 255, 255, 0.08));
          border-radius: 8px;
          text-decoration: none;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .admin-settings-card:hover {
          background: var(--bg-elevated, rgba(255, 255, 255, 0.06));
          border-color: var(--border-medium, rgba(255, 255, 255, 0.18));
        }
        .admin-settings-card__label {
          font-family: var(--font-ui);
          font-weight: 600;
          font-size: 1rem;
          color: var(--text-primary);
        }
        .admin-settings-card__blurb {
          font-family: var(--font-ui);
          font-size: 0.85rem;
          color: var(--text-tertiary);
        }
      `}</style>
    </div>
  );
}
