"use client";

import { useEffect, useState } from "react";

interface RecentSend {
  email: string;
  cart_total: number;
  item_count: number;
  status: string;
  sent_at: string;
  coupon_code: string | null;
  discount_percent: number;
}

interface Bounds {
  default: number;
  min: number;
  max: number;
}

interface Settings {
  enabled: boolean;
  test_mode: boolean;
  delay_hours: number;
  delay_bounds: Bounds;
  discount_percent: number;
  discount_bounds: Bounds;
  recent: RecentSend[];
}

interface PreviewRecipient {
  email: string;
  sessionId: string;
  total: number;
}

export default function CartRecoveryAdminPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [delay, setDelay] = useState("");
  const [discount, setDiscount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRecipient[] | null>(null);
  const [previewing, setPreviewing] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/cart-recovery");
    if (res.ok) {
      const data: Settings = await res.json();
      setSettings(data);
      setDelay(String(data.delay_hours));
      setDiscount(String(data.discount_percent));
    }
    setLoading(false);
  }

  async function save(patch: Record<string, unknown>, label: string) {
    setSaving(label);
    const res = await fetch("/api/admin/cart-recovery", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) await load();
    setSaving(null);
  }

  async function runPreview() {
    setPreviewing(true);
    setPreview(null);
    const res = await fetch("/api/admin/cart-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run" }),
    });
    if (res.ok) {
      const data = await res.json();
      setPreview(data.recipients || []);
    }
    setPreviewing(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
    load();
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Cart Recovery</h1>
      </div>

      <p className="admin-empty" style={{ marginBottom: "1.5rem" }}>
        Emails shoppers who started checkout but didn&rsquo;t pay, with a link back
        to their still-live checkout. Runs hourly, one email per cart, honors
        unsubscribe. <strong>Test mode</strong> makes the hourly run a dry run
        (computes recipients, sends nothing). Use &ldquo;Preview eligible carts&rdquo;
        any time &mdash; it never sends.
      </p>

      {loading && <p className="admin-empty">Loading...</p>}

      {!loading && settings && (
        <div className="cart-recovery">
          <div className="cart-recovery__row">
            <div className="cart-recovery__info">
              <span className="cart-recovery__label">Master switch</span>
              <span className="cart-recovery__meta">
                {settings.enabled ? "Live - hourly run sends email" : "Off - no email sent"}
              </span>
            </div>
            <button
              className={`admin-btn ${settings.enabled ? "admin-btn--danger" : "admin-btn--primary"}`}
              disabled={saving === "enabled"}
              onClick={() => save({ enabled: !settings.enabled }, "enabled")}
            >
              {saving === "enabled" ? "Saving..." : settings.enabled ? "Turn Off" : "Turn On"}
            </button>
          </div>

          <div className="cart-recovery__row">
            <div className="cart-recovery__info">
              <span className="cart-recovery__label">Test mode</span>
              <span className="cart-recovery__meta">
                {settings.test_mode ? "Dry run - computes recipients, sends nothing" : "Live sending"}
              </span>
            </div>
            <button
              className={`admin-btn ${settings.test_mode ? "admin-btn--danger" : "admin-btn--primary"}`}
              disabled={saving === "test_mode"}
              onClick={() => save({ test_mode: !settings.test_mode }, "test_mode")}
            >
              {saving === "test_mode" ? "Saving..." : settings.test_mode ? "Turn Off" : "Turn On"}
            </button>
          </div>

          <div className="cart-recovery__row">
            <div className="cart-recovery__info">
              <span className="cart-recovery__label">Send delay</span>
              <span className="cart-recovery__meta">
                Hours after abandonment before emailing ({settings.delay_bounds.min}-
                {settings.delay_bounds.max}, default {settings.delay_bounds.default}).
              </span>
            </div>
            <div className="cart-recovery__delay">
              <input
                type="number"
                className="cart-recovery__number"
                min={settings.delay_bounds.min}
                max={settings.delay_bounds.max}
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
              />
              <button
                className="admin-btn admin-btn--primary"
                disabled={saving === "delay"}
                onClick={() => save({ delay_hours: delay }, "delay")}
              >
                {saving === "delay" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div className="cart-recovery__row">
            <div className="cart-recovery__info">
              <span className="cart-recovery__label">Discount incentive</span>
              <span className="cart-recovery__meta">
                Percent off, sent as a single-use code in the email ({settings.discount_bounds.min}-
                {settings.discount_bounds.max}%, default {settings.discount_bounds.default}%; 0 = no coupon).
              </span>
            </div>
            <div className="cart-recovery__delay">
              <input
                type="number"
                className="cart-recovery__number"
                min={settings.discount_bounds.min}
                max={settings.discount_bounds.max}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
              <button
                className="admin-btn admin-btn--primary"
                disabled={saving === "discount"}
                onClick={() => save({ discount_percent: discount }, "discount")}
              >
                {saving === "discount" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div className="cart-recovery__row">
            <div className="cart-recovery__info">
              <span className="cart-recovery__label">Preview eligible carts</span>
              <span className="cart-recovery__meta">Dry run against Stripe right now. Sends nothing.</span>
            </div>
            <button className="admin-btn" onClick={runPreview} disabled={previewing}>
              {previewing ? "Checking..." : "Preview now"}
            </button>
          </div>

          {preview && (
            <div className="cart-recovery__panel">
              <strong>{preview.length}</strong> cart{preview.length === 1 ? "" : "s"} would be emailed
              {preview.length > 0 && (
                <ul className="cart-recovery__list">
                  {preview.map((r) => (
                    <li key={r.sessionId}>
                      {r.email} &mdash; ${r.total.toFixed(2)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="cart-recovery__panel">
            <span className="cart-recovery__label">Recent sends</span>
            {settings.recent.length === 0 ? (
              <p className="cart-recovery__meta" style={{ marginTop: "0.5rem" }}>None yet.</p>
            ) : (
              <table className="cart-recovery__table">
                <tbody>
                  {settings.recent.map((r, i) => (
                    <tr key={i}>
                      <td>{r.email}</td>
                      <td>${Number(r.cart_total).toFixed(2)}</td>
                      <td>{r.item_count} item{r.item_count === 1 ? "" : "s"}</td>
                      <td>{r.coupon_code ? `${r.discount_percent}% ${r.coupon_code}` : "-"}</td>
                      <td>{r.status}</td>
                      <td>{new Date(r.sent_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .cart-recovery {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          max-width: 720px;
        }
        .cart-recovery__row,
        .cart-recovery__panel {
          padding: 0.875rem 1rem;
          background: var(--glass-bg, rgba(255, 255, 255, 0.04));
          border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
          border-radius: 8px;
        }
        .cart-recovery__row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .cart-recovery__info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .cart-recovery__label {
          font-weight: 600;
          font-size: 1rem;
        }
        .cart-recovery__meta {
          font-size: 0.8rem;
          opacity: 0.7;
        }
        .cart-recovery__delay {
          display: flex;
          gap: 0.5rem;
        }
        .cart-recovery__number {
          width: 80px;
          padding: 0.5rem 0.75rem;
          font-family: var(--font-mono, monospace);
          font-size: 0.9rem;
          color: var(--text-primary);
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
          border-radius: 6px;
        }
        .cart-recovery__list {
          margin: 0.5rem 0 0;
          padding-left: 1.1rem;
          font-size: 0.85rem;
          line-height: 1.6;
        }
        .cart-recovery__table {
          width: 100%;
          margin-top: 0.5rem;
          border-collapse: collapse;
          font-size: 0.82rem;
        }
        .cart-recovery__table td {
          padding: 0.35rem 0.5rem 0.35rem 0;
          border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.06));
          opacity: 0.85;
        }
      `}</style>
    </div>
  );
}
