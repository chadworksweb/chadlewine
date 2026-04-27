"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export type ProseSection = {
  id: string;
  slug: string;
  title: string;
  order_index: number;
  scope_kind: string;
  date_start: string | null;
  date_end: string | null;
  content_html: string;
  last_published_at: string | null;
};

export function ProseReader({ sections, initialSection }: { sections: ProseSection[]; initialSection: string | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!initialSection) return;
    const el = document.getElementById(`section-${initialSection}`);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [initialSection]);

  if (sections.length === 0) {
    return (
      <div className="prose-reader prose-reader--empty">
        <p>No published prose sections yet.</p>
        <Link href="/chad-lewine">← Back to arc</Link>
      </div>
    );
  }

  return (
    <div className="prose-reader" ref={containerRef}>
      <div className="prose-reader__toolbar">
        <span className="prose-reader__toolbar-label">Prose Backbone</span>
        <Link href="/chad-lewine" className="arc-radiant__view-switch">← Switch to Arc Radiant</Link>
      </div>
      <header className="prose-reader__header">
        <h1>Chad Lewine — Prose Backbone</h1>
      </header>

      <nav className="prose-reader__toc">
        {sections.map((s) => (
          <Link key={s.id} href={`/chad-lewine?view=prose&section=${s.slug}`} className="prose-reader__toc-item">
            <span className="prose-reader__toc-num">{String(s.order_index + 1).padStart(2, "0")}</span>
            <span className="prose-reader__toc-title">{s.title}</span>
            {s.date_start && (
              <span className="prose-reader__toc-meta">
                {s.date_start.slice(0, 4)}–{s.date_end?.slice(0, 4) ?? "present"}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <main className="prose-reader__sections">
        {sections.map((s) => (
          <section key={s.id} id={`section-${s.slug}`} className="prose-reader__section">
            <h2 className="prose-reader__section-title">{s.title}</h2>
            {s.date_start && (
              <div className="prose-reader__section-meta">
                {s.date_start.slice(0, 4)}–{s.date_end?.slice(0, 4) ?? "present"}
              </div>
            )}
            <div className="prose-reader__section-body" dangerouslySetInnerHTML={{ __html: s.content_html }} />
          </section>
        ))}
      </main>
    </div>
  );
}
