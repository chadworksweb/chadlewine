"use client";

import { useEffect, useMemo, useState } from "react";
import "./MerchSectionPicker.css";

// Shared product picker for "merch" sections (song panel + release editor).
// Controlled: reads/writes data_payload.product_ids[] (ordered) via onChange;
// the parent owns persistence. Tactile thumbnail cards + search-to-add,
// matching the FeaturedPicker ("Art you might like") next to it.

interface ProductLite {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  status: string;
}

export function MerchSectionPicker({
  payload,
  onChange,
}: {
  payload: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const picked = useMemo(
    () => ((payload as { product_ids?: string[] }).product_ids) || [],
    [payload],
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/products`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setProducts(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setProducts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  function add(id: string) {
    if (picked.includes(id)) return;
    onChange({ product_ids: [...picked, id] });
    setQuery("");
    setOpen(false);
  }

  function remove(id: string) {
    onChange({ product_ids: picked.filter((x) => x !== id) });
  }

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= picked.length) return;
    const next = [...picked];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ product_ids: next });
  }

  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => !pickedSet.has(p.id))
      .filter((p) => (q ? p.title.toLowerCase().includes(q) || (p.slug || "").toLowerCase().includes(q) : true))
      .slice(0, 20);
  }, [products, pickedSet, query]);

  if (loading) return <p className="merch-picker__status">Loading products…</p>;

  return (
    <div className="merch-picker">
      {picked.length === 0 && <p className="merch-picker__empty">No products featured yet.</p>}

      {picked.length > 0 && (
        <ul className="merch-picker__list">
          {picked.map((id, i) => {
            const p = byId.get(id);
            return (
              <li key={id} className="merch-picker__item">
                {p?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-only picker thumbnail
                  <img src={p.image_url} alt={p.image_alt || p.title} className="merch-picker__thumb" />
                ) : (
                  <div className="merch-picker__thumb merch-picker__thumb--empty" />
                )}
                <div className="merch-picker__meta">
                  <span className="merch-picker__title">{p ? p.title : id}</span>
                  {p?.slug && <span className="merch-picker__slug">/{p.slug}</span>}
                  {p && p.status !== "active" && (
                    <span className="merch-picker__badge">{p.status}</span>
                  )}
                </div>
                <div className="merch-picker__controls">
                  <button type="button" className="admin-btn admin-btn--small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button type="button" className="admin-btn admin-btn--small" onClick={() => move(i, 1)} disabled={i === picked.length - 1} aria-label="Move down">↓</button>
                  <button type="button" className="admin-btn admin-btn--small admin-btn--danger" onClick={() => remove(id)}>Remove</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="merch-picker__add">
        <input
          type="text"
          className="obsv-editor__input"
          placeholder="Search products…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && candidates.length > 0 && (
          <div className="merch-picker__dropdown">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                className="merch-picker__candidate"
                onMouseDown={(e) => { e.preventDefault(); add(c.id); }}
              >
                {c.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-only picker thumbnail
                  <img src={c.image_url} alt={c.image_alt || c.title} className="merch-picker__thumb merch-picker__thumb--sm" />
                ) : (
                  <div className="merch-picker__thumb merch-picker__thumb--sm merch-picker__thumb--empty" />
                )}
                <span className="merch-picker__title">{c.title}</span>
                {c.status !== "active" && <span className="merch-picker__badge">{c.status}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
