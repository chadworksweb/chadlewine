"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatDate } from "@/lib/utils";

type Status =
  | "pending_review"
  | "approved"
  | "in_production"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "refunded";

interface Order {
  id: string;
  order_number: string;
  status: Status;
  buyer_email: string;
  buyer_name: string | null;
  ship_line1: string | null;
  ship_line2: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_zip: string | null;
  ship_country: string | null;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  printify_order_id: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  carrier: string | null;
  has_printify_lines: boolean;
  has_digital_lines: boolean;
  reviewed_at: string | null;
  pushed_to_printify_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  refunded_at: string | null;
  notes: string | null;
  created_at: string;
}

interface Line {
  id: string;
  item_type: "song" | "album" | "ringtone" | "merch" | "art_original";
  item_id: string | null;
  format: string | null;
  title_snapshot: string | null;
  product_config_snapshot: Record<string, unknown> | null;
  line_total: number | null;
  unit_price: number | null;
  image_url: string | null;
  printify_line_item_id: string | null;
  product: {
    printify_product_id: string | null;
    fulfillment: string | null;
    title: string | null;
  } | null;
  created_at: string;
}

const TIER_LABEL: Record<string, string> = {
  art: "The Art",
  line: "The Line",
  fusion: "The Fusion",
};

interface ConfigRow {
  label: string;
  value: string;
}

function configRows(cfg: Record<string, unknown> | null): ConfigRow[] {
  if (!cfg) return [];
  const rows: ConfigRow[] = [];
  if (typeof cfg.size === "string") rows.push({ label: "Size", value: cfg.size });
  if (typeof cfg.color === "string") rows.push({ label: "Color", value: cfg.color });
  if (typeof cfg.tier === "string") {
    rows.push({ label: "Tier", value: TIER_LABEL[cfg.tier] || cfg.tier });
  }
  if (typeof cfg.blueprint_id === "number") {
    rows.push({ label: "Blueprint", value: String(cfg.blueprint_id) });
  }
  if (typeof cfg.variant_id === "number") {
    rows.push({ label: "Variant", value: String(cfg.variant_id) });
  }
  if (typeof cfg.source_type === "string" && typeof cfg.source_id === "string") {
    rows.push({ label: "Source", value: `${cfg.source_type} · ${cfg.source_id.slice(0, 8)}` });
  }
  return rows;
}

interface PrintifyLineForm {
  product_id: string;
  variant_id: string;
  quantity: string;
}

const ALL_STATUSES: Status[] = [
  "pending_review",
  "approved",
  "in_production",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
  "refunded",
];

function isPhysical(t: Line["item_type"]): boolean {
  return t === "merch" || t === "art_original";
}

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");

  // Printify push form state — one row per physical line.
  const [printifyForm, setPrintifyForm] = useState<Record<string, PrintifyLineForm>>({});
  const [shippingMethod, setShippingMethod] = useState("1");

  // Effect-driven loader keyed on `id` plus a tick that handlers bump after
  // mutations (status change, approve, save notes) to refresh.
  const [loadTick, setLoadTick] = useState(0);
  const refresh = useCallback(() => setLoadTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/orders/${id}`);
      if (cancelled) return;
      if (!res.ok) {
        setError("Order not found");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setOrder(data.order);
      const incomingLines: Line[] = data.lines || [];
      setLines(incomingLines);
      setNotes(data.order?.notes || "");

      // Pre-fill the Printify push form: product_id from the products row,
      // variant_id from the snapshot the buyer saved at checkout (size pick).
      const prefill: Record<string, PrintifyLineForm> = {};
      for (const l of incomingLines) {
        if (!isPhysical(l.item_type)) continue;
        const pid = l.product?.printify_product_id || "";
        const cfg = l.product_config_snapshot || {};
        const vid = typeof cfg.variant_id === "number" ? String(cfg.variant_id) : "";
        if (pid || vid) {
          prefill[l.id] = { product_id: pid, variant_id: vid, quantity: "1" };
        }
      }
      if (Object.keys(prefill).length) setPrintifyForm(prefill);

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, loadTick]);

  async function handleStatusChange(status: Status) {
    if (!order) return;
    if (status === "refunded" && !confirm("Mark as refunded? Customer will receive a refund email.")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Update failed");
    }
    setBusy(false);
    refresh();
  }

  async function handleSaveNotes() {
    setBusy(true);
    await fetch(`/api/admin/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setBusy(false);
    refresh();
  }

  async function handleApprove(pushToPrintify: boolean) {
    if (!order) return;
    setBusy(true);
    setError("");

    const body: Record<string, unknown> = { decision: "approve" };
    if (pushToPrintify) {
      const items = Object.entries(printifyForm)
        .map(([, v]) => ({
          product_id: v.product_id.trim(),
          variant_id: parseInt(v.variant_id.trim(), 10),
          quantity: parseInt(v.quantity.trim() || "1", 10),
        }))
        .filter((v) => v.product_id && Number.isFinite(v.variant_id) && v.variant_id > 0);
      if (items.length === 0) {
        setError("Fill in at least one Printify line (product_id + variant_id) to push.");
        setBusy(false);
        return;
      }
      body.printify_line_items = items;
      body.shipping_method = parseInt(shippingMethod, 10) || 1;
    }

    const res = await fetch(`/api/admin/orders/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Approval failed");
    }
    setBusy(false);
    refresh();
  }

  async function handleReject() {
    if (!confirm("Reject this order? This will cancel it.")) return;
    setBusy(true);
    await fetch(`/api/admin/orders/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "reject" }),
    });
    setBusy(false);
    refresh();
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="admin-page">
        <p>Order not found.</p>
        <Link href="/admin/merch/orders" className="admin-btn admin-btn--secondary">← Back</Link>
      </div>
    );
  }

  const physicalLines = lines.filter((l) => isPhysical(l.item_type));
  const reviewable = order.status === "pending_review" || order.status === "approved";

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">{order.order_number}</h1>
          <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", margin: "4px 0 0" }}>
            <span className={`admin-status admin-status--${order.status === "shipped" || order.status === "delivered" || order.status === "completed" ? "published" : order.status === "cancelled" || order.status === "refunded" ? "trash" : "draft"}`}>
              {order.status.replace(/_/g, " ")}
            </span>
            {" "}· placed {formatDate(order.created_at)}
          </p>
        </div>
        <Link href="/admin/merch/orders" className="admin-btn admin-btn--secondary">← All Orders</Link>
      </div>

      {error && <p style={{ color: "var(--color-danger, #d33)", fontFamily: "var(--font-ui)" }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-xl)", marginBottom: "var(--space-xl)" }}>
        <div className="admin-panel" style={{ padding: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, textTransform: "uppercase", color: "var(--text-tertiary)" }}>Customer</h3>
          <p style={{ margin: 0, fontFamily: "var(--font-ui)" }}>
            {order.buyer_name || "(no name)"}<br />
            <a href={`mailto:${order.buyer_email}`} style={{ color: "var(--text-tertiary)" }}>{order.buyer_email}</a>
          </p>
        </div>

        <div className="admin-panel" style={{ padding: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, textTransform: "uppercase", color: "var(--text-tertiary)" }}>Shipping</h3>
          {order.ship_line1 ? (
            <p style={{ margin: 0, fontFamily: "var(--font-ui)", lineHeight: 1.6 }}>
              {order.ship_line1}<br />
              {order.ship_line2 && <>{order.ship_line2}<br /></>}
              {order.ship_city}, {order.ship_state} {order.ship_zip}<br />
              {order.ship_country}
            </p>
          ) : (
            <p style={{ margin: 0, color: "var(--text-tertiary)" }}>—</p>
          )}
        </div>
      </div>

      <div className="admin-panel" style={{ padding: 16, marginBottom: "var(--space-xl)" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, textTransform: "uppercase", color: "var(--text-tertiary)" }}>Line Items</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__th" style={{ width: 72 }}></th>
              <th className="admin-table__th">Item</th>
              <th className="admin-table__th" style={{ width: 110 }}>Type</th>
              <th className="admin-table__th">Details</th>
              <th className="admin-table__th" style={{ width: 90, textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const rows = configRows(l.product_config_snapshot);
              const total =
                typeof l.line_total === "number" ? `$${Number(l.line_total).toFixed(2)}` : "—";
              return (
                <tr key={l.id} className="admin-table__row">
                  <td className="admin-table__td" style={{ verticalAlign: "top" }}>
                    {l.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.image_url}
                        alt=""
                        width={56}
                        height={56}
                        style={{ display: "block", width: 56, height: 56, borderRadius: 6, objectFit: "cover", background: "var(--surface-2, #f0eee9)" }}
                      />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: 6, background: "var(--surface-2, #f0eee9)" }} />
                    )}
                  </td>
                  <td className="admin-table__td" style={{ verticalAlign: "top" }}>
                    {l.title_snapshot || "—"}
                  </td>
                  <td className="admin-table__td" style={{ verticalAlign: "top" }}>
                    <span className="admin-meta-chip">{l.item_type}</span>
                  </td>
                  <td className="admin-table__td" style={{ verticalAlign: "top" }}>
                    {l.format && (
                      <span className="admin-meta-chip" style={{ marginRight: 6 }}>{l.format.toUpperCase()}</span>
                    )}
                    {rows.length > 0 ? (
                      <dl style={{ margin: 0, fontFamily: "var(--font-ui)", fontSize: 13, lineHeight: 1.5 }}>
                        {rows.map((r) => (
                          <div key={r.label} style={{ display: "flex", gap: 8 }}>
                            <dt style={{ color: "var(--text-tertiary)", minWidth: 64 }}>{r.label}</dt>
                            <dd style={{ margin: 0 }}>{r.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : !l.format ? (
                      <span style={{ color: "var(--text-tertiary)" }}>—</span>
                    ) : null}
                  </td>
                  <td className="admin-table__td" style={{ textAlign: "right", verticalAlign: "top", fontFamily: "var(--font-ui)" }}>
                    {total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16, fontFamily: "var(--font-ui)" }}>
          <table style={{ minWidth: 240 }}>
            <tbody>
              <tr><td>Subtotal</td><td style={{ textAlign: "right" }}>${Number(order.subtotal).toFixed(2)}</td></tr>
              <tr><td>Shipping</td><td style={{ textAlign: "right" }}>${Number(order.shipping).toFixed(2)}</td></tr>
              <tr><td>Tax</td><td style={{ textAlign: "right" }}>${Number(order.tax).toFixed(2)}</td></tr>
              <tr style={{ borderTop: "1px solid var(--border)", fontWeight: 600 }}>
                <td>Total</td><td style={{ textAlign: "right" }}>${Number(order.total).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Approval gate — shown for pending_review (and approved orders that weren't pushed yet) */}
      {reviewable && order.has_printify_lines && (
        <div className="admin-panel" style={{ padding: 16, marginBottom: "var(--space-xl)" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            Review &amp; Push to Printify
          </h3>
          <p style={{ fontFamily: "var(--font-ui)", color: "var(--text-tertiary)", fontSize: 13, marginTop: 0 }}>
            Map each physical line to a Printify product + variant. For configurator lines you may need to create the Printify product first, then paste IDs here.
          </p>

          {physicalLines.map((l) => {
            const fulfillment = l.product?.fulfillment;
            const fulfillmentLabel =
              fulfillment === "manual" ? "Manual"
              : fulfillment === "printify_curated" ? "Curated"
              : fulfillment === "printify_configurator" ? "Configurator"
              : l.product_config_snapshot ? "Configurator"
              : null;
            return (
            <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 13 }}>
                {l.title_snapshot || l.item_type}
                {fulfillmentLabel && (
                  <span className="admin-meta-chip" style={{ marginLeft: 6, fontSize: 11 }}>
                    {fulfillmentLabel}
                  </span>
                )}
              </div>
              <input
                placeholder="Printify product_id"
                value={printifyForm[l.id]?.product_id || ""}
                onChange={(e) => setPrintifyForm({
                  ...printifyForm,
                  [l.id]: { ...(printifyForm[l.id] || { variant_id: "", quantity: "1" }), product_id: e.target.value },
                })}
                style={{ padding: "6px 8px", fontFamily: "var(--font-ui)" }}
              />
              <input
                placeholder="variant_id"
                value={printifyForm[l.id]?.variant_id || ""}
                onChange={(e) => setPrintifyForm({
                  ...printifyForm,
                  [l.id]: { ...(printifyForm[l.id] || { product_id: "", quantity: "1" }), variant_id: e.target.value },
                })}
                style={{ padding: "6px 8px", fontFamily: "var(--font-ui)" }}
              />
              <input
                placeholder="qty"
                value={printifyForm[l.id]?.quantity || "1"}
                onChange={(e) => setPrintifyForm({
                  ...printifyForm,
                  [l.id]: { ...(printifyForm[l.id] || { product_id: "", variant_id: "" }), quantity: e.target.value },
                })}
                style={{ padding: "6px 8px", fontFamily: "var(--font-ui)" }}
              />
            </div>
            );
          })}

          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, fontFamily: "var(--font-ui)" }}>
              Shipping method:&nbsp;
              <select
                value={shippingMethod}
                onChange={(e) => setShippingMethod(e.target.value)}
                style={{ padding: "4px 8px", fontFamily: "var(--font-ui)" }}
              >
                <option value="1">Standard</option>
                <option value="2">Priority</option>
                <option value="3">Printify Express</option>
                <option value="4">Economy</option>
              </select>
            </label>
            <div style={{ flex: 1 }} />
            <button
              className="admin-btn admin-btn--danger"
              onClick={handleReject}
              disabled={busy}
            >
              Reject
            </button>
            <button
              className="admin-btn admin-btn--secondary"
              onClick={() => handleApprove(false)}
              disabled={busy}
            >
              Approve only
            </button>
            <button
              className="admin-btn admin-btn--primary"
              onClick={() => handleApprove(true)}
              disabled={busy}
            >
              Approve &amp; Push to Printify
            </button>
          </div>
        </div>
      )}

      {/* Printify info */}
      {order.printify_order_id && (
        <div className="admin-panel" style={{ padding: 16, marginBottom: "var(--space-xl)" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, textTransform: "uppercase", color: "var(--text-tertiary)" }}>Printify</h3>
          <p style={{ margin: 0, fontFamily: "var(--font-ui)", fontSize: 13, lineHeight: 1.7 }}>
            Order ID: <code>{order.printify_order_id}</code><br />
            {order.pushed_to_printify_at && <>Pushed: {formatDate(order.pushed_to_printify_at)}<br /></>}
            {order.carrier && <>Carrier: {order.carrier}<br /></>}
            {order.tracking_number && (
              <>Tracking:{" "}
                {order.tracking_url
                  ? <a href={order.tracking_url} target="_blank" rel="noopener">{order.tracking_number}</a>
                  : order.tracking_number}
                <br />
              </>
            )}
          </p>
        </div>
      )}

      {/* Manual status override */}
      <div className="admin-panel" style={{ padding: 16, marginBottom: "var(--space-xl)" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, textTransform: "uppercase", color: "var(--text-tertiary)" }}>Status Override</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={order.status}
            onChange={(e) => handleStatusChange(e.target.value as Status)}
            disabled={busy}
            style={{ padding: "8px 12px", fontFamily: "var(--font-ui)" }}
          >
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <span style={{ color: "var(--text-tertiary)", fontSize: 12, fontFamily: "var(--font-ui)" }}>
            Setting status to &quot;refunded&quot; sends the customer a refund email.
          </span>
        </div>
      </div>

      {/* Notes */}
      <div className="admin-panel" style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, textTransform: "uppercase", color: "var(--text-tertiary)" }}>Internal Notes</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          style={{ width: "100%", padding: 8, fontFamily: "var(--font-ui)" }}
        />
        <button
          className="admin-btn admin-btn--secondary"
          onClick={handleSaveNotes}
          disabled={busy || notes === (order.notes || "")}
          style={{ marginTop: 8 }}
        >
          Save Notes
        </button>
      </div>
    </div>
  );
}
