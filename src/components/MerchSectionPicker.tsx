"use client";

import { useState, useEffect } from "react";

// Shared product picker for "merch" data sections. Used by both the release
// and song visibility editors so the two stay one mechanism. Reads/writes
// data_payload.product_ids[] (ordered).

interface ProductLite {
  id: string;
  title: string;
  tier: string | null;
  status: string;
}

function moveItem<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
  const next = [...arr];
  const j = idx + dir;
  if (j < 0 || j >= next.length) return next;
  [next[idx], next[j]] = [next[j], next[idx]];
  return next;
}

const headerLabel: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: "0.7rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--text-tertiary)",
  margin: "0.5rem 0 0.25rem",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.4rem 0.5rem",
  border: "1px solid var(--bg-glass-border)",
  borderRadius: 4,
  marginBottom: "0.25rem",
  fontFamily: "var(--font-ui)",
  fontSize: "0.8rem",
};

export function MerchSectionPicker({
  payload,
  onChange,
}: {
  payload: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [products, setProducts] = useState<ProductLite[]>([]);
  const picked = ((payload as { product_ids?: string[] }).product_ids) || [];
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetch(`/api/admin/products`)
      .then((r) => r.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]));
  }, []);

  function toggle(id: string) {
    const set = new Set(picked);
    if (set.has(id)) set.delete(id); else set.add(id);
    onChange({ product_ids: Array.from(set) });
  }

  function move(idx: number, dir: -1 | 1) {
    onChange({ product_ids: moveItem(picked, idx, dir) });
  }

  const available = products.filter(
    (p) => !picked.includes(p.id) && (filter === "" || p.title.toLowerCase().includes(filter.toLowerCase())),
  );

  return (
    <div>
      <div style={headerLabel}>Picked ({picked.length})</div>
      {picked.map((id, i) => {
        const p = products.find((x) => x.id === id);
        return (
          <div key={id} style={rowStyle}>
            <span style={{ flex: 1, fontSize: "0.78rem" }}>{p ? p.title : id}</span>
            <button type="button" className="admin-btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => move(i, -1)}>↑</button>
            <button type="button" className="admin-btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => move(i, 1)}>↓</button>
            <button type="button" className="admin-btn admin-btn--danger" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => toggle(id)}>✕</button>
          </div>
        );
      })}
      <div style={headerLabel}>Available</div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter…" className="obsv-editor__input" style={{ fontSize: "0.75rem", marginBottom: "0.25rem" }} />
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {available.map((p) => (
          <div key={p.id} style={rowStyle}>
            <span style={{ flex: 1, fontSize: "0.78rem" }}>{p.title}</span>
            <span style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>{p.status}</span>
            <button type="button" className="admin-btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => toggle(p.id)}>+ add</button>
          </div>
        ))}
      </div>
    </div>
  );
}
