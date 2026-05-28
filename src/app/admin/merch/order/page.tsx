"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface ProductRow {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  merch_type_id: string | null;
  display_order: number;
  created_at: string;
}

interface MerchType {
  id: string;
  slug: string;
  label: string;
}

export default function AdminMerchOrderPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [merchTypes, setMerchTypes] = useState<MerchType[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [prodRes, typesRes] = await Promise.all([
      fetch("/api/admin/products"),
      fetch("/api/admin/merch-types"),
    ]);
    const prods = (await prodRes.json()) as ProductRow[];
    const types = await typesRes.json();
    setProducts(prods);
    setMerchTypes(Array.isArray(types) ? types : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
    fetchData();
  }, [fetchData]);

  // Sort by display_order ascending, created_at desc tiebreak (mirrors the
  // public /merch storefront's Featured sort).
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      if (a.display_order !== b.display_order) return a.display_order - b.display_order;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [products]);

  // Filter applied AFTER sort so the visible slice is the in-order view of
  // the storefront when that filter is applied to it.
  const visibleProducts = useMemo(() => {
    if (typeFilter === "all") return sortedProducts;
    if (typeFilter === "uncategorized") return sortedProducts.filter((p) => p.merch_type_id === null);
    return sortedProducts.filter((p) => p.merch_type_id === typeFilter);
  }, [sortedProducts, typeFilter]);

  async function commitReorder(orderedIds: string[]) {
    setSaveState("saving");
    setErrorMsg(null);
    const res = await fetch("/api/admin/products/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordered_ids: orderedIds }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Save failed" }));
      setSaveState("error");
      setErrorMsg(error || "Reorder failed");
      await fetchData();
      return;
    }
    setSaveState("saved");
    setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1200);
  }

  function handleDragStart(id: string) {
    dragIdRef.current = id;
  }
  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (dragIdRef.current && dragIdRef.current !== id) setDragOverId(id);
  }
  function handleDragEnd() {
    dragIdRef.current = null;
    setDragOverId(null);
  }
  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const sourceId = dragIdRef.current;
    dragIdRef.current = null;
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;

    const visibleIds = visibleProducts.map((p) => p.id);
    const fromIdx = visibleIds.indexOf(sourceId);
    const toIdx = visibleIds.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const nextVisibleIds = [...visibleIds];
    const [moved] = nextVisibleIds.splice(fromIdx, 1);
    nextVisibleIds.splice(toIdx, 0, moved);

    // Build the full ordered id list: keep out-of-view products at their
    // current relative position (sorted), replacing the visible slice with
    // the new sequence.
    const visibleSet = new Set(visibleIds);
    const fullOrdered: string[] = [];
    let visibleCursor = 0;
    for (const p of sortedProducts) {
      if (visibleSet.has(p.id)) {
        fullOrdered.push(nextVisibleIds[visibleCursor++]);
      } else {
        fullOrdered.push(p.id);
      }
    }

    // Optimistic local update.
    const orderMap = new Map(fullOrdered.map((id, idx) => [id, idx + 1]));
    setProducts((prev) =>
      prev.map((p) => ({ ...p, display_order: orderMap.get(p.id) ?? p.display_order })),
    );
    void commitReorder(fullOrdered);
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Merch Order</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--text-tertiary)" }}>
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "Saved"}
            {saveState === "error" && (errorMsg || "Save failed")}
          </span>
          <Link href="/admin/merch" className="admin-btn admin-btn--secondary">Back to Merch</Link>
        </div>
      </div>

      <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontSize: 13, marginTop: 0 }}>
        Drag any tile to reorder. The order here drives the public /merch grid&apos;s default Featured sort.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: "var(--space-md)", flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-tertiary)" }}>Type</span>
          <select
            className="obsv-editor__input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ minWidth: 160, padding: "4px 8px" }}
          >
            <option value="all">All ({products.length})</option>
            {merchTypes.map((t) => {
              const n = products.filter((p) => p.merch_type_id === t.id).length;
              return <option key={t.id} value={t.id}>{t.label} ({n})</option>;
            })}
            <option value="uncategorized">
              Uncategorized ({products.filter((p) => p.merch_type_id === null).length})
            </option>
          </select>
        </label>
      </div>

      <div className="merch-order__grid">
        {visibleProducts.map((p, idx) => {
          const isOver = dragOverId === p.id;
          return (
            <div
              key={p.id}
              className={`merch-order__tile${isOver ? " merch-order__tile--over" : ""}`}
              draggable
              onDragStart={() => handleDragStart(p.id)}
              onDragOver={(e) => handleDragOver(e, p.id)}
              onDrop={(e) => handleDrop(e, p.id)}
              onDragEnd={handleDragEnd}
            >
              <span className="merch-order__pos">{idx + 1}</span>
              {p.image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element -- admin tile thumb */
                <img src={p.image_url} alt={p.image_alt || p.title} className="merch-order__thumb" />
              ) : (
                <div className="merch-order__thumb merch-order__thumb--empty">No image</div>
              )}
              <div className="merch-order__title">{p.title}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
