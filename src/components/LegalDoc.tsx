"use client";

import { useEffect, useState, type ReactNode } from "react";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

type LegalDocProps = {
  title: string;
  updated?: string;
  intro?: ReactNode;
  sections: LegalSection[];
};

export function LegalDoc({ title, updated, intro, sections }: LegalDocProps) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");
  const [tocOpen, setTocOpen] = useState(false);

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (visible.length > 0) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: 0 },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="legal">
      <header className="legal__head">
        <h1 className="legal__title">{title}</h1>
        {updated ? <p className="legal__updated">Last updated {updated}</p> : null}
      </header>

      <div className="legal__grid">
        <nav className="legal__toc" aria-label="On this page">
          <button
            type="button"
            className="legal__toc-toggle"
            aria-expanded={tocOpen}
            onClick={() => setTocOpen((o) => !o)}
          >
            <span>On this page</span>
            <span className="legal__toc-caret" aria-hidden="true" />
          </button>
          <ol
            className="legal__toc-list"
            data-open={tocOpen ? "true" : "false"}
          >
            {sections.map((s) => (
              <li
                key={s.id}
                className={
                  "legal__toc-item" + (active === s.id ? " is-active" : "")
                }
              >
                <a
                  className="legal__toc-link"
                  href={`#${s.id}`}
                  onClick={() => setTocOpen(false)}
                >
                  <span className="legal__toc-dot" aria-hidden="true" />
                  <span className="legal__toc-text">{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="legal__body">
          {intro ? <div className="legal__intro">{intro}</div> : null}
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="legal__section">
              <h2 className="legal__section-title">
                <span className="legal__section-num" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{s.title}</span>
              </h2>
              <div className="legal__section-content">{s.content}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
