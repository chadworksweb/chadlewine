"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MerchProductCard } from "@/components/MerchProductCard";
import { MerchShopBackdrop } from "@/components/MerchShopBackdrop";

export interface BrowserItem {
  key: string;
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  href?: string;
  type_id: string | null;
  type_slug: string | null;
  created_at: string;
  price: number | null;
  display_order: number;
}

export interface BrowserType {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
}

type SortKey = "featured" | "newest" | "oldest" | "title_asc" | "price_asc" | "price_desc";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title_asc", label: "Title A-Z" },
  { value: "price_asc", label: "Price low-high" },
  { value: "price_desc", label: "Price high-low" },
];

function compareItems(a: BrowserItem, b: BrowserItem, sort: SortKey): number {
  switch (sort) {
    case "oldest":
      return a.created_at.localeCompare(b.created_at);
    case "title_asc":
      return a.title.localeCompare(b.title);
    case "price_asc": {
      const ap = a.price ?? Number.POSITIVE_INFINITY;
      const bp = b.price ?? Number.POSITIVE_INFINITY;
      return ap - bp;
    }
    case "price_desc": {
      const ap = a.price ?? Number.NEGATIVE_INFINITY;
      const bp = b.price ?? Number.NEGATIVE_INFINITY;
      return bp - ap;
    }
    case "newest":
      return b.created_at.localeCompare(a.created_at);
    case "featured":
    default: {
      if (a.display_order !== b.display_order) return a.display_order - b.display_order;
      return b.created_at.localeCompare(a.created_at);
    }
  }
}

interface Props {
  items: BrowserItem[];
  types: BrowserType[];
  backdropCovers?: string[];
}

export function MerchShopBrowser({ items, types, backdropCovers = [] }: Props) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("featured");

  const hasUncategorized = useMemo(
    () => items.some((it) => it.type_id === null),
    [items],
  );

  // Only surface chips for types that have at least one item.
  const visibleTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) {
      if (it.type_id) counts.set(it.type_id, (counts.get(it.type_id) || 0) + 1);
    }
    return types.filter((t) => (counts.get(t.id) || 0) > 0);
  }, [items, types]);

  const filtered = useMemo(() => {
    let out = items;
    if (typeFilter === "uncategorized") {
      out = out.filter((it) => it.type_id === null);
    } else if (typeFilter !== "all") {
      out = out.filter((it) => it.type_id === typeFilter);
    }
    return [...out].sort((a, b) => compareItems(a, b, sort));
  }, [items, typeFilter, sort]);

  // Replay a brief glitch-fade per card on every filter / sort change. Staggered
  // by index (capped) so the new arrangement reveals in a wave, not all at once.
  // Skips the first paint so the page doesn't animate on initial load.
  const gridRef = useRef<HTMLDivElement>(null);
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    const grid = gridRef.current;
    if (!grid) return;
    const cards = grid.querySelectorAll<HTMLElement>(".merch-shop__card");
    cards.forEach((c, i) => {
      const delay = Math.min(i * 22, 260);
      // Clear any in-flight animation and force a reflow before reapplying so
      // rapid chip presses retrigger cleanly.
      c.style.animation = "none";
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      c.offsetWidth;
      c.style.animation = `merch-card-glitch-in 420ms cubic-bezier(0.2, 0.85, 0.25, 1) ${delay}ms both`;
    });
  }, [typeFilter, sort, filtered]);

  return (
    <>
      <div className="merch-shop__controls">
        <MerchShopBackdrop covers={backdropCovers} />
        <div className="merch-shop__chips" role="tablist" aria-label="Filter by type">
          <button
            type="button"
            role="tab"
            aria-selected={typeFilter === "all"}
            className={`merch-shop__chip${typeFilter === "all" ? " is-active" : ""}`}
            onClick={() => setTypeFilter("all")}
          >
            All
          </button>
          {visibleTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={typeFilter === t.id}
              className={`merch-shop__chip${typeFilter === t.id ? " is-active" : ""}`}
              onClick={() => setTypeFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
          {hasUncategorized && (
            <button
              type="button"
              role="tab"
              aria-selected={typeFilter === "uncategorized"}
              className={`merch-shop__chip${typeFilter === "uncategorized" ? " is-active" : ""}`}
              onClick={() => setTypeFilter("uncategorized")}
            >
              Other
            </button>
          )}
        </div>

        <label className="merch-shop__sort">
          <span className="merch-shop__sort-label">Sort</span>
          <select
            className="merch-shop__sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="page-merch__empty">
          <p>Nothing here yet.</p>
        </div>
      ) : (
        <div className="merch-shop__grid" ref={gridRef}>
          {filtered.map((it) => (
            <MerchProductCard
              key={it.key}
              id={it.id}
              slug={it.slug}
              title={it.title}
              image_url={it.image_url}
              image_alt={it.image_alt}
              href={it.href}
            />
          ))}
        </div>
      )}
    </>
  );
}
