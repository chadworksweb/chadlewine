"use client";

import { useState } from "react";

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
}: TaxonomyPickerProps) {
  const [newValue, setNewValue] = useState("");

  function displayName(item: TaxonomyItem): string {
    return (nameField === "label" ? item.label : item.title) || "";
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

  const selectedItems = items.filter((i) => selected.includes(i.id));
  const availableItems = items.filter((i) => !selected.includes(i.id));

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
              <button
                key={item.id}
                type="button"
                className="obsv-editor__chip obsv-editor__chip--active"
                onClick={() => onToggle(item.id)}
              >
                {displayName(item)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="obsv-editor__chip-section">
        <span className="obsv-editor__chip-label">Available</span>
        <div className="obsv-editor__chip-grid">
          {availableItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="obsv-editor__chip"
              onClick={() => onToggle(item.id)}
            >
              {displayName(item)}
            </button>
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
