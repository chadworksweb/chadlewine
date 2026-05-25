"use client";

import { useState, useCallback } from "react";
import { useAutosave } from "@/hooks/useAutosave";
import { MerchSectionPicker } from "@/components/MerchSectionPicker";
import type { SongVisibilitySection } from "@/lib/song-visibility";

interface Props {
  section: SongVisibilitySection;
  label: string;
  onChanged: () => void;
}

// Editor for song "data" visibility sections (admin curates picks rather than
// generating prose). Mirrors ReleaseDataSectionEditor; songs currently have a
// single data category (merch).
export function SongDataSectionEditor({ section, label, onChanged }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(section.status);
  const [payload, setPayload] = useState<Record<string, unknown>>(section.data_payload || {});

  // Resync when the parent swaps the section in after a refetch.
  const [lastStatus, setLastStatus] = useState(section.status);
  const [lastPayload, setLastPayload] = useState(section.data_payload);
  if (section.status !== lastStatus || section.data_payload !== lastPayload) {
    setLastStatus(section.status);
    setLastPayload(section.data_payload);
    setStatus(section.status);
    setPayload(section.data_payload || {});
  }

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

  const picked = ((payload as { product_ids?: string[] }).product_ids) || [];
  const populated = picked.length > 0;

  return (
    <div className="song-visibility__section">
      <button
        type="button"
        className="song-visibility__section-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="song-visibility__section-arrow">{expanded ? "▾" : "▸"}</span>
        <span className="song-visibility__section-label">{label}</span>
        <span className={`song-visibility__section-badge song-visibility__section-badge--${populated ? status : "empty"}`}>
          {populated ? status : "empty"}
        </span>
        {saveStatus === "saving" && (
          <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", marginLeft: "auto" }}>Saving...</span>
        )}
      </button>
      {expanded && (
        <div className="song-visibility__section-body">
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
          </div>

          <MerchSectionPicker
            payload={payload}
            onChange={(p) => { setPayload(p); onChanged(); }}
          />
        </div>
      )}
    </div>
  );
}
