"use client";

import { useState, useEffect } from "react";

interface RelatedMusicItem {
  type: "song" | "album";
  id: string;
}

export function RelatedMusicPanel({
  value,
  onChange,
}: {
  value: RelatedMusicItem[];
  onChange: (val: RelatedMusicItem[]) => void;
}) {
  const [songs, setSongs] = useState<{ id: string; title: string }[]>([]);
  const [albums, setAlbums] = useState<{ id: string; title: string }[]>([]);
  const [addType, setAddType] = useState<"song" | "album">("song");
  const [addId, setAddId] = useState("");

  useEffect(() => {
    fetch("/api/admin/songs").then(r => r.json()).then(setSongs);
    fetch("/api/admin/albums").then(r => r.json()).then(setAlbums);
  }, []);

  function add() {
    if (!addId || value.some(v => v.type === addType && v.id === addId)) return;
    onChange([...value, { type: addType, id: addId }]);
    setAddId("");
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function label(item: RelatedMusicItem) {
    const list = item.type === "song" ? songs : albums;
    return list.find(x => x.id === item.id)?.title || item.id.slice(0, 8);
  }

  return (
    <div className="obsv-editor__panel">
      <h3 className="obsv-editor__panel-title">Related Music</h3>

      {value.length > 0 && (
        <div style={{ marginBottom: "var(--space-sm)" }}>
          {value.map((item, i) => (
            <div key={`${item.type}-${item.id}`} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: "var(--text-xs)" }}>
              <span style={{ color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.type}</span>
              <span style={{ color: "var(--text-secondary)", flex: 1 }}>{label(item)}</span>
              <button type="button" onClick={() => remove(i)} style={{ color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem" }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 4 }}>
        <select className="obsv-editor__input" value={addType} onChange={e => setAddType(e.target.value as "song" | "album")} style={{ width: "auto", flex: "0 0 auto" }}>
          <option value="song">Song</option>
          <option value="album">Album</option>
        </select>
        <select className="obsv-editor__input" value={addId} onChange={e => setAddId(e.target.value)} style={{ flex: 1 }}>
          <option value="">Select...</option>
          {(addType === "song" ? songs : albums).map(x => (
            <option key={x.id} value={x.id}>{x.title}</option>
          ))}
        </select>
        <button type="button" className="admin-btn admin-btn--secondary" onClick={add} style={{ padding: "4px 10px", fontSize: "0.6875rem" }}>+</button>
      </div>
    </div>
  );
}
