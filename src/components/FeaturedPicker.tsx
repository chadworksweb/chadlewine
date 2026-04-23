"use client";

import { useEffect, useMemo, useState } from "react";
import { focalCropStyle } from "@/lib/focal-crop";
import "./FeaturedPicker.css";

type Kind = "art" | "song";

type Item = {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  alt: string | null;
  focalX: number | null;
  focalY: number | null;
  zoom: number | null;
  status?: string;
};

type ArtRow = { id: string; slug: string; title: string; image_path: string | null; image_alt: string | null; card_focal_x: number | null; card_focal_y: number | null; card_zoom: number | null; status: string };
type SongRow = { id: string; slug: string; title: string; art_image_path: string | null; art_alt: string | null; card_focal_x: number | null; card_focal_y: number | null; card_zoom: number | null; status: string };

function artToItem(a: ArtRow): Item {
  return { id: a.id, slug: a.slug, title: a.title, image: a.image_path, alt: a.image_alt, focalX: a.card_focal_x, focalY: a.card_focal_y, zoom: a.card_zoom, status: a.status };
}
function songToItem(s: SongRow): Item {
  return { id: s.id, slug: s.slug, title: s.title, image: s.art_image_path, alt: s.art_alt, focalX: s.card_focal_x, focalY: s.card_focal_y, zoom: s.card_zoom, status: s.status };
}

function styleFor(item: Item) {
  return focalCropStyle(item.focalX, item.focalY, item.zoom);
}

export function FeaturedPicker({ kind, parentRef, parentKind, excludeSlug }: { kind: Kind; parentRef: string; parentKind?: Kind; excludeSlug?: string }) {
  const resolvedParentKind: Kind = parentKind ?? (kind === "art" ? "song" : "art");
  const [featured, setFeatured] = useState<Item[]>([]);
  const [candidates, setCandidates] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const parentSegment = resolvedParentKind === "art" ? "art" : "songs";
  const childSegment = kind === "art" ? "featured-art" : "featured-songs";
  const featuredUrl = `/api/admin/${parentSegment}/${parentRef}/${childSegment}`;
  const candidatesUrl = kind === "art" ? "/api/admin/art" : "/api/admin/songs";
  const payloadKey = kind === "art" ? "art_ids" : "song_ids";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [featRes, candRes] = await Promise.all([fetch(featuredUrl), fetch(candidatesUrl)]);
        if (!featRes.ok) throw new Error((await featRes.json()).error || "Failed to load featured list");
        if (!candRes.ok) throw new Error((await candRes.json()).error || "Failed to load candidates");
        const featData: Array<Record<string, unknown>> = await featRes.json();
        const candData: Array<ArtRow | SongRow> = await candRes.json();
        if (cancelled) return;
        const featuredItems: Item[] = featData
          .map((row) => {
            const nested = (kind === "art" ? row.art : row.song) as (ArtRow | SongRow) | null;
            if (!nested) return null;
            return kind === "art" ? artToItem(nested as ArtRow) : songToItem(nested as SongRow);
          })
          .filter((i): i is Item => !!i);
        setFeatured(featuredItems);
        setCandidates((candData || []).map((r) => (kind === "art" ? artToItem(r as ArtRow) : songToItem(r as SongRow))));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [featuredUrl, candidatesUrl, kind]);

  async function persist(next: Item[]) {
    setSaving(true);
    setError(null);
    const res = await fetch(featuredUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [payloadKey]: next.map((i) => i.id) }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Save failed");
      return false;
    }
    return true;
  }

  async function add(item: Item) {
    const next = [...featured, item];
    setFeatured(next);
    setQuery("");
    setOpen(false);
    const ok = await persist(next);
    if (!ok) setFeatured(featured);
  }

  async function remove(id: string) {
    const next = featured.filter((i) => i.id !== id);
    setFeatured(next);
    const ok = await persist(next);
    if (!ok) setFeatured(featured);
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = featured.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= featured.length) return;
    const next = [...featured];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setFeatured(next);
    const ok = await persist(next);
    if (!ok) setFeatured(featured);
  }

  const featuredIds = useMemo(() => new Set(featured.map((p) => p.id)), [featured]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates
      .filter((c) => !featuredIds.has(c.id))
      .filter((c) => (excludeSlug ? c.slug !== excludeSlug : true))
      .filter((c) => (q ? c.title.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q) : true))
      .slice(0, 20);
  }, [candidates, featuredIds, query, excludeSlug]);

  if (loading) return <p className="featured-picker__status">Loading…</p>;

  const kindLabel = kind === "art" ? "art pieces" : "songs";

  return (
    <div className="featured-picker">
      {error && <p className="featured-picker__error">{error}</p>}

      {featured.length === 0 && <p className="featured-picker__empty">No {kindLabel} featured yet.</p>}

      {featured.length > 0 && (
        <ul className="featured-picker__list">
          {featured.map((item, i) => (
            <li key={item.id} className="featured-picker__item">
              {item.image ? (
                <img src={item.image} alt={item.alt || item.title} className="featured-picker__thumb" style={styleFor(item)} />
              ) : (
                <div className="featured-picker__thumb featured-picker__thumb--empty" />
              )}
              <div className="featured-picker__meta">
                <span className="featured-picker__title">{item.title}</span>
                <span className="featured-picker__slug">/{item.slug}</span>
                {item.status && item.status !== "published" && (
                  <span className="featured-picker__badge">{item.status}</span>
                )}
              </div>
              <div className="featured-picker__controls">
                <button type="button" className="admin-btn admin-btn--small" onClick={() => move(item.id, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                <button type="button" className="admin-btn admin-btn--small" onClick={() => move(item.id, 1)} disabled={i === featured.length - 1} aria-label="Move down">↓</button>
                <button type="button" className="admin-btn admin-btn--small admin-btn--danger" onClick={() => remove(item.id)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="featured-picker__add">
        <input
          type="text"
          className="obsv-editor__input"
          placeholder={`Search ${kindLabel}…`}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && filtered.length > 0 && (
          <div className="featured-picker__dropdown">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className="featured-picker__candidate"
                onMouseDown={(e) => { e.preventDefault(); add(c); }}
              >
                {c.image ? (
                  <img src={c.image} alt={c.alt || c.title} className="featured-picker__thumb featured-picker__thumb--sm" style={styleFor(c)} />
                ) : (
                  <div className="featured-picker__thumb featured-picker__thumb--sm featured-picker__thumb--empty" />
                )}
                <span className="featured-picker__title">{c.title}</span>
                {c.status && c.status !== "published" && (
                  <span className="featured-picker__badge">{c.status}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {saving && <p className="featured-picker__status">Saving…</p>}
    </div>
  );
}
