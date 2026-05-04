import Link from "next/link";

const CARDS: Array<{
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  primary?: boolean;
}> = [
  {
    href: "/admin/arc/nodes",
    title: "Nodes",
    description: "List, edit, and delete every era and life event. Music nodes link out.",
    primary: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="6" cy="18" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="M6 8.5v7M18 8.5v7M8.5 6h7M8.5 18h7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/admin/arc/capture",
    title: "Capture Drawer",
    description: "Add a new node. Picks the entity kind and writes it.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeWidth="2" />
      </svg>
    ),
  },
  {
    href: "/admin/arc/sections",
    title: "Section Manager",
    description: "Edit and publish prose-backbone sections. See what's stale.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 6h14M5 10h14M5 14h9M5 18h9" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function ArcAdminIndex() {
  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Arc Radiant</h1>
        <Link href="/chad-lewine" target="_blank" className="arc-admin-link">
          View public arc →
        </Link>
      </div>

      <p className="arc-admin-intro">
        Capture nodes (life events, eras, song states, relationships, etc.) and
        manage the prose-backbone sections that the public arc page composes from.
      </p>

      <div className="arc-admin-grid">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={`arc-admin-card${card.primary ? " arc-admin-card--primary" : ""}`}
          >
            <span className="arc-admin-card__icon">{card.icon}</span>
            <span className="arc-admin-card__title">{card.title}</span>
            <span className="arc-admin-card__desc">{card.description}</span>
            <span className="arc-admin-card__cta" aria-hidden="true">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
