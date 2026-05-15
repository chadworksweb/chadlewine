"use client";

import { useEffect, useRef, useState } from "react";

interface TaxonomyItem {
  id: string;
  title?: string;
  label?: string;
  slug: string;
}

interface TaxonomyPickerProps {
  heading: string;
  items: TaxonomyItem[];
  selected: string[];
  onToggle: (id: string) => void;
  onCreate: (item: TaxonomyItem) => void;
  createEndpoint: string;
  createPlaceholder: string;
  /** Field used for display and creation payload. "title" for categories/thoughtlines, "label" for tags. */
  nameField?: "title" | "label";
  /** When provided, each chip shows a small × on hover that hard-deletes the
      taxonomy row. The caller is responsible for updating local state via
      onDelete. The DELETE URL is `${createEndpoint}/${id}`. */
  onDelete?: (id: string) => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function TaxonomyPicker({
  heading,
  items,
  selected,
  onToggle,
  onCreate,
  createEndpoint,
  createPlaceholder,
  nameField = "title",
  onDelete,
}: TaxonomyPickerProps) {
  const [newValue, setNewValue] = useState("");
  // Two-step delete: first click on × arms the item, second click within
  // ARM_TIMEOUT_MS confirms. Prevents fat-finger deletes of misclicked chips.
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ARM_TIMEOUT_MS = 4000;

  useEffect(() => {
    return () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    };
  }, []);

  function displayName(item: TaxonomyItem): string {
    return (nameField === "label" ? item.label : item.title) || "";
  }

  function armDelete(id: string) {
    if (armTimer.current) clearTimeout(armTimer.current);
    setArmedDeleteId(id);
    armTimer.current = setTimeout(() => setArmedDeleteId(null), ARM_TIMEOUT_MS);
  }

  function disarmDelete() {
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = null;
    setArmedDeleteId(null);
  }

  async function handleCreate() {
    const val = newValue.trim();
    if (!val) return;
    const slug = slugify(val);
    const payload = nameField === "label" ? { label: val, slug } : { title: val, slug };
    const res = await fetch(createEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const created = await res.json();
      onCreate(created);
      setNewValue("");
    }
  }

  async function handleDelete(item: TaxonomyItem) {
    if (!onDelete) return;
    disarmDelete();
    const res = await fetch(`${createEndpoint}/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || "Delete failed");
      return;
    }
    onDelete(item.id);
  }

  const selectedItems = items.filter((i) => selected.includes(i.id));
  const availableItems = items.filter((i) => !selected.includes(i.id));

  function renderDeleteButton(item: TaxonomyItem) {
    if (!onDelete) return null;
    const armed = armedDeleteId === item.id;
    return (
      <button
        type="button"
        className={`obsv-editor__chip-delete${armed ? " obsv-editor__chip-delete--armed" : ""}`}
        onClick={() => (armed ? handleDelete(item) : armDelete(item.id))}
        onBlur={armed ? disarmDelete : undefined}
        aria-label={armed ? `Confirm delete ${displayName(item)}` : `Delete ${displayName(item)}`}
        title={armed ? "Click again to confirm" : "Delete (requires confirm)"}
      >
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden focusable="false">
          {armed ? (
            <polyline
              points="2.8,6.4 5,8.6 9.2,3.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="3" y1="3" x2="9" y2="9" />
              <line x1="9" y1="3" x2="3" y2="9" />
            </g>
          )}
        </svg>
      </button>
    );
  }

  return (
    <div className="obsv-editor__panel">
      <h3 className="obsv-editor__panel-title">
        {heading}
        <span className="obsv-editor__counter">{selected.length} selected</span>
      </h3>
      {selectedItems.length > 0 && (
        <div className="obsv-editor__chip-section">
          <span className="obsv-editor__chip-label">Selected</span>
          <div className="obsv-editor__chip-grid">
            {selectedItems.map((item) => (
              <span
                key={item.id}
                className={`obsv-editor__chip-wrap${armedDeleteId === item.id ? " obsv-editor__chip-wrap--armed" : ""}`}
              >
                <button
                  type="button"
                  className="obsv-editor__chip obsv-editor__chip--active"
                  onClick={() => onToggle(item.id)}
                >
                  {displayName(item)}
                </button>
                {renderDeleteButton(item)}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="obsv-editor__chip-section">
        <span className="obsv-editor__chip-label">Available</span>
        <div className="obsv-editor__chip-grid">
          {availableItems.map((item) => (
            <span
              key={item.id}
              className={`obsv-editor__chip-wrap${armedDeleteId === item.id ? " obsv-editor__chip-wrap--armed" : ""}`}
            >
              <button
                type="button"
                className="obsv-editor__chip"
                onClick={() => onToggle(item.id)}
              >
                {displayName(item)}
              </button>
              {renderDeleteButton(item)}
            </span>
          ))}
          <input
            type="text"
            className="obsv-editor__chip"
            placeholder={createPlaceholder}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
            }}
            style={{ border: "1px dashed var(--border)", background: "transparent", cursor: "text", textAlign: "left" }}
          />
        </div>
      </div>
    </div>
  );
}
