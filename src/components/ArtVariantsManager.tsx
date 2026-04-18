"use client";

import { useEffect, useState } from "react";
import "./ArtVariantsManager.css";

type Product = {
  id: string;
  title: string;
  price: number | null;
  status: string;
  variant_type: "original" | "print" | null;
  variant_label: string | null;
  edition_size: number;
  editions_sold: number;
};

type RowState = Product & { dirty: boolean; saving: boolean };

function toRow(p: Product): RowState {
  return { ...p, dirty: false, saving: false };
}

export function ArtVariantsManager({ slug }: { slug: string }) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | "original" | "print">(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/art/${slug}/products`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to load variants");
      setLoading(false);
      return;
    }
    const data: Product[] = await res.json();
    setRows(data.map(toRow));
    setLoading(false);
  }

  useEffect(() => { load(); }, [slug]);  // eslint-disable-line react-hooks/exhaustive-deps

  function patchRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch, dirty: true } : r)));
  }

  async function save(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, saving: true } : r)));
    const res = await fetch(`/api/admin/art/${slug}/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variant_label: row.variant_label,
        price: row.price,
        edition_size: row.edition_size,
        editions_sold: row.editions_sold,
        status: row.status,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Save failed");
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, saving: false } : r)));
      return;
    }
    const saved: Product = await res.json();
    setRows((prev) => prev.map((r) => (r.id === id ? toRow(saved) : r)));
  }

  async function remove(id: string) {
    if (!confirm("Delete this variant? This removes the product row — sales history is kept in purchases.")) return;
    const res = await fetch(`/api/admin/art/${slug}/products/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Delete failed");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function add(variant_type: "original" | "print") {
    setAdding(variant_type);
    setError(null);
    const res = await fetch(`/api/admin/art/${slug}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variant_type,
        variant_label: variant_type === "print" ? "" : null,
        price: null,
        edition_size: variant_type === "original" ? 1 : 0,
      }),
    });
    setAdding(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Create failed");
      return;
    }
    const created: Product = await res.json();
    setRows((prev) => [...prev, toRow(created)]);
  }

  if (loading) return <p className="art-variants__loading">Loading variants…</p>;

  const originals = rows.filter((r) => r.variant_type === "original");
  const prints = rows.filter((r) => r.variant_type === "print");
  const other = rows.filter((r) => r.variant_type !== "original" && r.variant_type !== "print");

  return (
    <div className="art-variants">
      {error && <p className="art-variants__error">{error}</p>}

      <div className="art-variants__group">
        <h3 className="art-variants__group-title">Original</h3>
        {originals.length === 0 && <p className="art-variants__empty">No original variant yet.</p>}
        {originals.map((r) => (
          <VariantRow key={r.id} row={r} onChange={(patch) => patchRow(r.id, patch)} onSave={() => save(r.id)} onDelete={() => remove(r.id)} />
        ))}
      </div>

      <div className="art-variants__group">
        <h3 className="art-variants__group-title">Prints</h3>
        {prints.length === 0 && <p className="art-variants__empty">No print variants yet.</p>}
        {prints.map((r) => (
          <VariantRow key={r.id} row={r} onChange={(patch) => patchRow(r.id, patch)} onSave={() => save(r.id)} onDelete={() => remove(r.id)} />
        ))}
      </div>

      {other.length > 0 && (
        <div className="art-variants__group">
          <h3 className="art-variants__group-title">Other / Legacy</h3>
          {other.map((r) => (
            <VariantRow key={r.id} row={r} onChange={(patch) => patchRow(r.id, patch)} onSave={() => save(r.id)} onDelete={() => remove(r.id)} />
          ))}
        </div>
      )}

      <div className="art-variants__add-row">
        <button type="button" className="admin-btn admin-btn--small" onClick={() => add("original")} disabled={adding !== null || originals.length > 0}>
          {adding === "original" ? "Adding…" : originals.length > 0 ? "Original already exists" : "+ Add Original"}
        </button>
        <button type="button" className="admin-btn admin-btn--small" onClick={() => add("print")} disabled={adding !== null}>
          {adding === "print" ? "Adding…" : "+ Add Print Size"}
        </button>
      </div>
    </div>
  );
}

function VariantRow({
  row,
  onChange,
  onSave,
  onDelete,
}: {
  row: RowState;
  onChange: (patch: Partial<RowState>) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const isPrint = row.variant_type === "print";
  const availLabel =
    row.edition_size === 0
      ? "Open edition"
      : `${Math.max(0, row.edition_size - row.editions_sold)} of ${row.edition_size} remaining`;

  return (
    <div className="art-variants__row">
      <div className="art-variants__cell art-variants__cell--label">
        <label className="art-variants__field-label">Label</label>
        <input
          className="obsv-editor__input"
          value={row.variant_label ?? ""}
          onChange={(e) => onChange({ variant_label: e.target.value })}
          placeholder={isPrint ? 'e.g. 8×10" Print' : "Original"}
        />
      </div>

      <div className="art-variants__cell art-variants__cell--price">
        <label className="art-variants__field-label">Price ($)</label>
        <input
          className="obsv-editor__input"
          type="number"
          step="0.01"
          value={row.price ?? ""}
          onChange={(e) => onChange({ price: e.target.value ? parseFloat(e.target.value) : null })}
        />
      </div>

      <div className="art-variants__cell art-variants__cell--edition">
        <label className="art-variants__field-label">Edition size</label>
        <input
          className="obsv-editor__input"
          type="number"
          min="0"
          value={row.edition_size}
          onChange={(e) => onChange({ edition_size: parseInt(e.target.value) || 0 })}
          disabled={row.variant_type === "original"}
          title={row.variant_type === "original" ? "Originals are always 1 of 1" : "0 = open/unlimited"}
        />
        <span className="art-variants__avail">{availLabel}</span>
      </div>

      <div className="art-variants__cell art-variants__cell--sold">
        <label className="art-variants__field-label">Sold (override)</label>
        <input
          className="obsv-editor__input"
          type="number"
          min="0"
          value={row.editions_sold}
          onChange={(e) => onChange({ editions_sold: parseInt(e.target.value) || 0 })}
          title="Normally managed by Stripe webhook. Edit to correct refunds or adjust manually."
        />
      </div>

      <div className="art-variants__cell art-variants__cell--status">
        <label className="art-variants__field-label">Status</label>
        <select
          className="obsv-editor__input"
          value={row.status}
          onChange={(e) => onChange({ status: e.target.value })}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="art-variants__cell art-variants__cell--actions">
        <button type="button" className="admin-btn admin-btn--small admin-btn--primary" onClick={onSave} disabled={!row.dirty || row.saving}>
          {row.saving ? "Saving…" : row.dirty ? "Save" : "Saved"}
        </button>
        <button type="button" className="admin-btn admin-btn--small admin-btn--danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
