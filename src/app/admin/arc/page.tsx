import Link from "next/link";

export default function ArcAdminIndex() {
  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Arc Radiant</h1>
      </div>

      <p style={{ color: "var(--text-secondary)", fontFamily: "var(--font-ui)", maxWidth: 720, marginBottom: "var(--space-xl)" }}>
        Capture nodes (life events, eras, song states, relationships, etc.) and manage the
        prose backbone sections that the public arc page composes from.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)", maxWidth: 720 }}>
        <Link href="/admin/arc/capture" className="admin-btn admin-btn--primary" style={{ padding: "var(--space-lg)", textAlign: "left" }}>
          <strong style={{ display: "block", fontSize: "1.05rem", marginBottom: 4 }}>Capture Drawer</strong>
          <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>Add or update a node. Picks the entity kind and writes it.</span>
        </Link>
        <Link href="/admin/arc/sections" className="admin-btn admin-btn--secondary" style={{ padding: "var(--space-lg)", textAlign: "left" }}>
          <strong style={{ display: "block", fontSize: "1.05rem", marginBottom: 4 }}>Section Manager</strong>
          <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>Edit and publish prose-backbone sections. See what&rsquo;s stale.</span>
        </Link>
      </div>
    </div>
  );
}
