"use client";

import { useEffect, useRef, useState } from "react";
import { ENTITY_LABEL, type EntityType } from "@/lib/related-entities";
import { buildContentUrl, absolutizeUrl, STATIC_PAGES } from "@/lib/content-urls";

interface ApiRow {
  id: string;
  title: string;
  slug: string | null;
  image: string | null;
  type: EntityType;
  kind?: string | null;
}

// A normalized dropdown row -- either a content item or a static page.
interface PickItem {
  key: string;
  label: string;
  url: string;
  image: string | null;
  badge: string;
}

interface LinkSearchInputProps {
  /** Current URL text. */
  value: string;
  /** Fired on every change (typing or pick). */
  onChange: (url: string) => void;
  /** Fired when a search result is chosen (after onChange). */
  onPick?: (url: string, label: string) => void;
  /** Build absolute URLs for internal picks (campaign emails need this). */
  absolute?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  /** Commit (Enter) -- e.g. trigger the surrounding "Insert" action. */
  onEnter?: () => void;
}

// A URL field that doubles as a content search box. Type a URL directly, or
// type a few letters to search songs/releases/observations/merch/art and pick
// one -- which fills the URL with the canonical public path. Search state is
// kept local so autosave re-renders of the parent don't disturb it.
export function LinkSearchInput({
  value,
  onChange,
  onPick,
  absolute = false,
  autoFocus,
  placeholder = "Paste a URL or search your content",
  onEnter,
}: LinkSearchInputProps) {
  const [results, setResults] = useState<PickItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search. Skip when the value already looks like a URL/path so we
  // don't search for "https://..." literally. Matching static pages show
  // instantly; live content (songs/releases/etc.) is fetched and merged in.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2 || /^(https?:|mailto:|tel:|\/|#)/i.test(q)) {
      setResults([]);
      setLoading(false);
      return;
    }
    const lc = q.toLowerCase();
    const pages: PickItem[] = STATIC_PAGES.filter((p) =>
      p.label.toLowerCase().includes(lc),
    ).map((p) => ({
      key: `page:${p.path}`,
      label: p.label,
      url: absolutizeUrl(p.path, absolute),
      image: null,
      badge: "Page",
    }));
    setResults(pages);
    if (pages.length) setOpen(true);

    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/related-entities/lookup?q=${encodeURIComponent(q)}`,
        );
        const data: ApiRow[] = res.ok ? await res.json() : [];
        const content: PickItem[] = (Array.isArray(data) ? data : [])
          .filter((r) => r.slug)
          .map((r) => ({
            key: `${r.type}:${r.id}`,
            label: r.title,
            url: buildContentUrl(r.type, r.slug as string, absolute, r.kind),
            image: r.image,
            badge: ENTITY_LABEL[r.type] ?? r.type,
          }));
        if (!cancelled) {
          setResults([...pages, ...content].slice(0, 16));
          setOpen(true);
        }
      } catch {
        if (!cancelled) setResults(pages);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, absolute]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (item: PickItem) => {
    onChange(item.url);
    onPick?.(item.url, item.label);
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="linksearch" ref={boxRef}>
      <input
        type="text"
        className="linksearch__input"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (results.length) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setOpen(false);
            onEnter?.();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && results.length > 0 && (
        <ul className="linksearch__results">
          {results.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className="linksearch__result"
                // Keep the editor's text selection -- don't blur on mousedown.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
              >
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                  <img src={item.image} alt="" className="linksearch__thumb" />
                ) : (
                  <span className="linksearch__thumb linksearch__thumb--empty" />
                )}
                <span className="linksearch__title">{item.label}</span>
                <span className="linksearch__badge">{item.badge}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && loading && results.length === 0 && (
        <div className="linksearch__note">Searching…</div>
      )}
    </div>
  );
}
