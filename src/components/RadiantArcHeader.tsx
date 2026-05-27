"use client";

import { useState } from "react";

// Title block for the Radiant Arc page with a "Hide title" toggle on the far
// right. Collapsing it frees the vertical space the title eats, so the full arc
// viewport fits a laptop screen without scrolling. Client component because the
// collapse state is interactive; the page itself stays a server component.
export function RadiantArcHeader() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <header className={`page-radiant-arc__header${collapsed ? " is-collapsed" : ""}`}>
      <div className="page-radiant-arc__header-text">
        <div className="page-radiant-arc__header-text-inner">
          <h1 className="page-radiant-arc__title">Chad Lewine&rsquo;s Radiant Arc</h1>
          <h2 className="page-radiant-arc__subtitle">Visualization of a Lifetime Unfolding Through Art</h2>
        </div>
      </div>
      <button
        type="button"
        className="page-radiant-arc__title-toggle"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        title={collapsed ? "Show the title" : "Hide the title to enlarge the arc"}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path
            d={collapsed ? "M3 6l5 5 5-5" : "M3 10l5-5 5 5"}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{collapsed ? "Show title" : "Hide title"}</span>
      </button>
    </header>
  );
}
