"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface IfYouLikeEntry {
  artist: string;
  title: string;
  reason: string;
}

const fieldLabel: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: "0.7rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--text-tertiary)",
  margin: "0 0 0.25rem",
};

const helpBlock: React.CSSProperties = {
  background: "var(--bg-tertiary, #f0ede5)",
  border: "1px solid var(--border-subtle, #d8d3c4)",
  borderLeft: "3px solid var(--accent, #2a8a8a)",
  padding: "0.75rem 1rem",
  marginBottom: "1rem",
  fontFamily: "var(--font-ui)",
  fontSize: "0.78rem",
  lineHeight: 1.55,
  color: "var(--text-secondary)",
};

const entryRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 2fr auto",
  gap: "0.5rem",
  alignItems: "start",
  padding: "0.5rem",
  background: "var(--bg-secondary, #faf8f3)",
  border: "1px solid var(--border-subtle, #e8e3d4)",
  borderRadius: "4px",
  marginBottom: "0.5rem",
};

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: "0.8rem",
  width: "100%",
};

export function SongIfYouLikePanel({ songId }: { songId: string }) {
  const [blurb, setBlurb] = useState("");
  const [entries, setEntries] = useState<IfYouLikeEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const initializedRef = useRef(false);
  const lastPayloadRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing data
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/song-if-you-like?song_id=${encodeURIComponent(songId)}`)
      .then((r) => r.json())
      .then((data: { blurb: string | null; entries: IfYouLikeEntry[] }) => {
        if (cancelled) return;
        setBlurb(data.blurb || "");
        setEntries(Array.isArray(data.entries) ? data.entries : []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [songId]);

  const save = useCallback(
    async (payload: { blurb: string; entries: IfYouLikeEntry[] }) => {
      const json = JSON.stringify(payload);
      if (json === lastPayloadRef.current) return;
      lastPayloadRef.current = json;
      setSaveStatus("saving");
      try {
        const res = await fetch("/api/admin/song-if-you-like", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ song_id: songId, ...payload }),
        });
        setSaveStatus(res.ok ? "saved" : "error");
      } catch {
        setSaveStatus("error");
      }
    },
    [songId]
  );

  // Debounced autosave
  useEffect(() => {
    if (loading) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastPayloadRef.current = JSON.stringify({ blurb, entries });
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save({ blurb, entries }), 800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [blurb, entries, loading, save]);

  function updateEntry(idx: number, patch: Partial<IfYouLikeEntry>) {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }

  function addEntry() {
    setEntries((prev) => [...prev, { artist: "", title: "", reason: "" }]);
  }

  function removeEntry(idx: number) {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveEntry(idx: number, dir: -1 | 1) {
    setEntries((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  const filledCount = entries.filter((e) => e.artist || e.title || e.reason).length;
  const badgeText = loading ? "loading" : filledCount > 0 ? `${filledCount} ${filledCount === 1 ? "entry" : "entries"}` : "empty";
  const badgeMod = loading ? "empty" : filledCount > 0 ? "published" : "empty";

  return (
    <div className="song-visibility__section">
      <button
        type="button"
        className="song-visibility__section-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="song-visibility__section-arrow">{expanded ? "▾" : "▸"}</span>
        <span className="song-visibility__section-label">If You Like</span>
        <span className={`song-visibility__section-badge song-visibility__section-badge--${badgeMod}`}>
          {badgeText}
        </span>
        {saveStatus === "saving" && (
          <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", marginLeft: "auto" }}>Saving...</span>
        )}
      </button>

      {expanded && (
        <div className="song-visibility__section-body">
          <div style={helpBlock}>
            <strong>If You Like — manual entry.</strong> Each entry is a discovery hook. AI engines extract these as structured artist comparisons. Pick well-known artists with searchable hits. Reason: name the shared feeling, stance, or musical move in 10-20 words. Avoid &ldquo;similar vibes&rdquo; / &ldquo;great for fans of&rdquo; / &ldquo;perfect for&rdquo;. Specifics extract better than abstractions.
          </div>

          <div style={fieldLabel}>Section intro (optional)</div>
          <textarea
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            className="obsv-editor__textarea"
            rows={2}
            style={{ fontFamily: "var(--font-ui)", fontSize: "0.85rem", marginBottom: "1rem" }}
            placeholder="One sentence on who connects with this song. Appears as the section's lead paragraph."
          />

          <div style={fieldLabel}>Entries</div>
          {entries.length === 0 && (
            <div style={{
              fontFamily: "var(--font-ui)",
              fontSize: "0.8rem",
              color: "var(--text-tertiary)",
              padding: "0.75rem",
              fontStyle: "italic",
              marginBottom: "0.5rem",
            }}>
              No entries yet. Add the first one below.
            </div>
          )}
          {entries.map((entry, idx) => (
            <div key={idx} style={entryRow}>
              <div>
                <input
                  type="text"
                  value={entry.artist}
                  onChange={(e) => updateEntry(idx, { artist: e.target.value })}
                  placeholder="Artist (e.g. Kesha)"
                  className="obsv-editor__input"
                  style={inputStyle}
                />
              </div>
              <div>
                <input
                  type="text"
                  value={entry.title}
                  onChange={(e) => updateEntry(idx, { title: e.target.value })}
                  placeholder="Song title (e.g. Praying)"
                  className="obsv-editor__input"
                  style={inputStyle}
                />
              </div>
              <div>
                <textarea
                  value={entry.reason}
                  onChange={(e) => updateEntry(idx, { reason: e.target.value })}
                  placeholder="Why fans of this artist connect — shared feeling, stance, or musical move (10-20 words)"
                  rows={2}
                  className="obsv-editor__textarea"
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <button
                  type="button"
                  onClick={() => moveEntry(idx, -1)}
                  disabled={idx === 0}
                  className="admin-btn"
                  style={{ fontSize: "0.65rem", padding: "0.15rem 0.35rem", opacity: idx === 0 ? 0.3 : 1 }}
                  title="Move up"
                  aria-label="Move up"
                >
                  &uarr;
                </button>
                <button
                  type="button"
                  onClick={() => moveEntry(idx, 1)}
                  disabled={idx === entries.length - 1}
                  className="admin-btn"
                  style={{ fontSize: "0.65rem", padding: "0.15rem 0.35rem", opacity: idx === entries.length - 1 ? 0.3 : 1 }}
                  title="Move down"
                  aria-label="Move down"
                >
                  &darr;
                </button>
                <button
                  type="button"
                  onClick={() => removeEntry(idx)}
                  className="admin-btn admin-btn--danger"
                  style={{ fontSize: "0.65rem", padding: "0.15rem 0.35rem" }}
                  title="Delete entry"
                  aria-label="Delete entry"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addEntry}
            className="admin-btn"
            style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem", marginTop: "0.5rem" }}
          >
            + Add entry
          </button>
        </div>
      )}
    </div>
  );
}
