"use client";

import { useEffect, useRef, useState } from "react";

interface SearchResult {
  id: string;
  slug: string | null;
  title: string;
}

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
}

export function LinkedPrintPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [linked, setLinked] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!value) {
      setLinked(null);
      return;
    }
    fetch(`/api/admin/products/search`)
      .then((r) => r.json())
      .then((d) => {
        const found = (d.results || []).find((r: SearchResult) => r.id === value);
        setLinked(found || null);
      })
      .catch(() => setLinked(null));
  }, [value]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!open) return;
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const r = await fetch(`/api/admin/products/search?${params.toString()}`);
      const d = await r.json();
      setResults(d.results || []);
      setLoading(false);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  function pick(r: SearchResult) {
    onChange(r.id);
    setLinked(r);
    setOpen(false);
    setQuery("");
  }

  function clearLink() {
    onChange(null);
    setLinked(null);
  }

  return (
    <div className="obsv-editor__field">
      <label className="obsv-editor__label">Linked print (art piece)</label>
      {linked ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 14 }}>
            <strong>{linked.title}</strong>
            {linked.slug && (
              <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>/art/{linked.slug}</span>
            )}
          </span>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={() => setOpen(true)}
            style={{ padding: "4px 10px", fontSize: 12 }}
          >
            Change
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={clearLink}
            style={{ padding: "4px 10px", fontSize: 12 }}
          >
            Clear
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="admin-btn admin-btn--secondary"
          onClick={() => setOpen(true)}
        >
          Link an art piece
        </button>
      )}

      {open && (
        <div style={{ marginTop: 8, border: "1px solid var(--bg-glass-border)", borderRadius: 6, padding: 8 }}>
          <input
            autoFocus
            type="text"
            className="obsv-editor__input"
            placeholder="Search art pieces by title..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          {loading && (
            <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontSize: 13 }}>Searching...</p>
          )}
          {!loading && results.length === 0 && (
            <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontSize: 13 }}>No matches.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => pick(r)}
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  background: "transparent",
                  border: "1px solid transparent",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  color: "var(--text-primary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-glass-hover, rgba(255,255,255,0.05))";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <strong>{r.title}</strong>
                {r.slug && (
                  <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>/art/{r.slug}</span>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={() => setOpen(false)}
            style={{ marginTop: 8, padding: "4px 10px", fontSize: 12 }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
