"use client";

import { useState, useEffect, useCallback } from "react";
import { useAutosave } from "@/hooks/useAutosave";
import { MerchSectionPicker } from "@/components/MerchSectionPicker";

interface MerchRow {
  id: string;
  status: "draft" | "published";
  data_payload: Record<string, unknown> | null;
}

const panelHeading: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-tertiary)",
  marginBottom: "0.75rem",
};

// Standalone admin panel for a song's merch picks. Stores into the song's
// "merch" visibility-section row (category='merch', data_payload.product_ids),
// but lives as its own panel -- not inside the Visibility Engine list.
export function SongMerchPanel({ songId }: { songId: string }) {
  const [row, setRow] = useState<MerchRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/song-visibility-sections?song_id=${encodeURIComponent(songId)}`);
      const data = await res.json();
      let merch: MerchRow | null = Array.isArray(data)
        ? (data.find((s: { category?: string }) => s.category === "merch") ?? null)
        : null;
      if (!merch) {
        merch = await fetch(`/api/admin/song-visibility-sections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ song_id: songId, category: "merch", status: "published", data_payload: {} }),
        }).then((r) => r.json());
      }
      if (!cancelled) {
        setRow(merch);
        setLoading(false);
      }
    })().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [songId]);

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h2 style={panelHeading}>Merch (shown on song detail page)</h2>
      {loading || !row ? (
        <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>Loading...</p>
      ) : (
        <MerchPanelBody section={row} />
      )}
    </div>
  );
}

function MerchPanelBody({ section }: { section: MerchRow }) {
  const [status, setStatus] = useState(section.status);
  const [payload, setPayload] = useState<Record<string, unknown>>(section.data_payload || {});

  const buildPayload = useCallback(
    () => ({ data_payload: payload, status }),
    [payload, status],
  );

  const { status: saveStatus } = useAutosave({
    data: { payload, status },
    endpoint: "/api/admin/song-visibility-sections",
    id: section.id,
    buildPayload,
    enabled: true,
  });

  return (
    <div className="obsv-editor__panel">
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <label style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
          Status:
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "draft" | "published")}
          className="obsv-editor__select"
          style={{ fontSize: "0.75rem" }}
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        {saveStatus === "saving" && (
          <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", marginLeft: "auto" }}>Saving...</span>
        )}
      </div>
      <MerchSectionPicker payload={payload} onChange={setPayload} />
    </div>
  );
}
