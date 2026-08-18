"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ENTITY_TYPES, ENTITY_LABEL, type EntityType } from "@/lib/related-entities";
import "./EntityPicker.css";

interface PickedRow {
  id: string; // related_entities row id
  entity_type: EntityType;
  entity_id: string;
  title: string;
  image: string | null;
}
interface Candidate { id: string; title: string; slug: string | null; image: string | null }

// Shared admin picker for the YMAL ("You Might Also Like") section. Curates an
// ordered, mixed list of entities (song/release/merch/art/observation) for any
// source page. Backed by /api/admin/related-entities.
export function EntityPicker({ sourceType, sourceId }: { sourceType: EntityType | "merch" | string; sourceId: string }) {
  const [rows, setRows] = useState<PickedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchType, setSearchType] = useState<EntityType>("merch");
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [open, setOpen] = useState(false);

  const base = `/api/admin/related-entities`;
  const srcQS = `source_type=${encodeURIComponent(sourceType)}&source_id=${encodeURIComponent(sourceId)}`;

  const load = useCallback(() => {
    fetch(`${base}?${srcQS}`)
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [base, srcQS]);

  useEffect(() => { load(); }, [load]);

  // Candidate search whenever type or query changes.
  useEffect(() => {
    let cancelled = false;
    fetch(`${base}/lookup?type=${searchType}&q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setCandidates(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setCandidates([]); });
    return () => { cancelled = true; };
  }, [base, searchType, query]);

  const pickedKeys = useMemo(
    () => new Set(rows.map((r) => `${r.entity_type}:${r.entity_id}`)),
    [rows],
  );
  const shownCandidates = candidates.filter((c) => !pickedKeys.has(`${searchType}:${c.id}`)).slice(0, 20);

  async function add(entity_id: string) {
    await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_type: sourceType, source_id: sourceId, entity_type: searchType, entity_id }),
    });
    setQuery("");
    setOpen(false);
    load();
  }

  async function remove(rowId: string) {
    await fetch(`${base}?id=${rowId}`, { method: "DELETE" });
    load();
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[idx], next[j]] = [next[j], next[idx]];
    setRows(next);
    await fetch(base, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((r) => r.id) }),
    });
  }

  if (loading) return <p className="entity-picker__status">Loading…</p>;

  return (
    <div className="entity-picker">
      {rows.length === 0 && <p className="entity-picker__empty">Nothing linked yet.</p>}

      {rows.length > 0 && (
        <ul className="entity-picker__list">
          {rows.map((r, i) => (
            <li key={r.id} className="entity-picker__item">
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                <img src={r.image} alt="" className="entity-picker__thumb" />
              ) : (
                <span className="entity-picker__thumb entity-picker__thumb--empty" />
              )}
              <div className="entity-picker__meta">
                <span className="entity-picker__title">{r.title}</span>
                <span className="entity-picker__badge">{ENTITY_LABEL[r.entity_type]}</span>
              </div>
              <div className="entity-picker__controls">
                <button type="button" className="admin-btn admin-btn--small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                <button type="button" className="admin-btn admin-btn--small" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down">↓</button>
                <button type="button" className="admin-btn admin-btn--small admin-btn--danger" onClick={() => remove(r.id)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="entity-picker__add">
        <div className="entity-picker__types">
          {ENTITY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`entity-picker__type${searchType === t ? " is-active" : ""}`}
              onClick={() => { setSearchType(t); setOpen(true); }}
            >
              {ENTITY_LABEL[t]}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="obsv-editor__input"
          placeholder={`Search ${ENTITY_LABEL[searchType].toLowerCase()}…`}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && shownCandidates.length > 0 && (
          <div className="entity-picker__dropdown">
            {shownCandidates.map((c) => (
              <button
                key={c.id}
                type="button"
                className="entity-picker__candidate"
                onMouseDown={(e) => { e.preventDefault(); add(c.id); }}
              >
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                  <img src={c.image} alt="" className="entity-picker__thumb entity-picker__thumb--sm" />
                ) : (
                  <span className="entity-picker__thumb entity-picker__thumb--sm entity-picker__thumb--empty" />
                )}
                <span className="entity-picker__title">{c.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
