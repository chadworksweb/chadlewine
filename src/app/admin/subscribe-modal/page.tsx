"use client";

import { useEffect, useState } from "react";

interface Bound {
  default: number;
  min: number;
  max: number;
}

interface ModalSettings {
  enabled: boolean;
  test_mode: boolean;
  admin_ips: string[];
  dwell_seconds: number;
  cart_dwell_seconds: number;
  scroll_depth_pct: number;
  reshow_days: number;
  bounds: {
    dwellSeconds: Bound;
    cartDwellSeconds: Bound;
    scrollDepthPct: Bound;
    reshowDays: Bound;
  };
  your_ip: string;
}

export default function SubscribeModalAdminPage() {
  const [settings, setSettings] = useState<ModalSettings | null>(null);
  const [ipsText, setIpsText] = useState("");
  const [thresholds, setThresholds] = useState({
    dwell_seconds: "",
    cart_dwell_seconds: "",
    scroll_depth_pct: "",
    reshow_days: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/subscribe-modal");
    if (res.ok) {
      const data: ModalSettings = await res.json();
      setSettings(data);
      setIpsText(data.admin_ips.join("\n"));
      setThresholds({
        dwell_seconds: String(data.dwell_seconds),
        cart_dwell_seconds: String(data.cart_dwell_seconds),
        scroll_depth_pct: String(data.scroll_depth_pct),
        reshow_days: String(data.reshow_days),
      });
    }
    setLoading(false);
  }

  async function save(patch: Record<string, unknown>, label: string) {
    setSaving(label);
    const res = await fetch("/api/admin/subscribe-modal", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setSavedAt(new Date().toLocaleTimeString());
      await load();
    }
    setSaving(null);
  }

  function toggleEnabled() {
    if (!settings) return;
    save({ enabled: !settings.enabled }, "enabled");
  }

  function toggleTestMode() {
    if (!settings) return;
    save({ test_mode: !settings.test_mode }, "test_mode");
  }

  function saveIps() {
    const list = ipsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    save({ admin_ips: list }, "ips");
  }

  function saveThresholds() {
    save(
      {
        dwell_seconds: thresholds.dwell_seconds,
        cart_dwell_seconds: thresholds.cart_dwell_seconds,
        scroll_depth_pct: thresholds.scroll_depth_pct,
        reshow_days: thresholds.reshow_days,
      },
      "thresholds"
    );
  }

  function addMyIp() {
    if (!settings?.your_ip) return;
    const existing = ipsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (existing.includes(settings.your_ip)) return;
    setIpsText([...existing, settings.your_ip].join("\n"));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
    load();
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Subscribe Modal</h1>
      </div>

      <p className="admin-empty" style={{ marginBottom: "1.5rem" }}>
        The engagement popup that asks visitors to subscribe. It fires on
        exit-intent or the thresholds below (whichever comes first) &mdash; never
        on page load, never on cart/checkout/booking pages, capped to once per
        session. When{" "}
        <strong>Test mode</strong> is off, it will not fire for admins or any IP
        listed below. Turn Test mode on to QA it on your own machine.
      </p>

      {loading && <p className="admin-empty">Loading...</p>}

      {!loading && settings && (
        <div className="submodal-admin">
          <div className="submodal-admin__row">
            <div className="submodal-admin__info">
              <span className="submodal-admin__label">Master switch</span>
              <span className="submodal-admin__meta">
                {settings.enabled ? "Live on site" : "Off everywhere"}
              </span>
            </div>
            <button
              className={`admin-btn ${
                settings.enabled ? "admin-btn--danger" : "admin-btn--primary"
              }`}
              disabled={saving === "enabled"}
              onClick={toggleEnabled}
            >
              {saving === "enabled"
                ? "Saving..."
                : settings.enabled
                ? "Turn Off"
                : "Turn On"}
            </button>
          </div>

          <div className="submodal-admin__row">
            <div className="submodal-admin__info">
              <span className="submodal-admin__label">Test mode</span>
              <span className="submodal-admin__meta">
                {settings.test_mode
                  ? "Popup fires for admins / listed IPs"
                  : "Popup hidden from admins / listed IPs"}
              </span>
            </div>
            <button
              className={`admin-btn ${
                settings.test_mode ? "admin-btn--danger" : "admin-btn--primary"
              }`}
              disabled={saving === "test_mode"}
              onClick={toggleTestMode}
            >
              {saving === "test_mode"
                ? "Saving..."
                : settings.test_mode
                ? "Turn Off"
                : "Turn On"}
            </button>
          </div>

          <div className="submodal-admin__ips">
            <div className="submodal-admin__info">
              <span className="submodal-admin__label">Trigger thresholds</span>
              <span className="submodal-admin__meta">
                When the popup fires. It always shows on whichever comes first.
              </span>
            </div>
            <div className="submodal-admin__fields">
              {(
                [
                  {
                    key: "dwell_seconds",
                    label: "Time on page",
                    unit: "sec",
                    bound: settings.bounds.dwellSeconds,
                  },
                  {
                    key: "cart_dwell_seconds",
                    label: "Time on page (after add to cart)",
                    unit: "sec",
                    bound: settings.bounds.cartDwellSeconds,
                  },
                  {
                    key: "scroll_depth_pct",
                    label: "Scroll depth",
                    unit: "%",
                    bound: settings.bounds.scrollDepthPct,
                  },
                  {
                    key: "reshow_days",
                    label: "Re-show after dismiss",
                    unit: "days",
                    bound: settings.bounds.reshowDays,
                  },
                ] as const
              ).map((f) => (
                <label key={f.key} className="submodal-admin__field">
                  <span className="submodal-admin__field-label">
                    {f.label}
                    <span className="submodal-admin__field-hint">
                      {" "}
                      ({f.bound.min}-{f.bound.max} {f.unit}, default{" "}
                      {f.bound.default})
                    </span>
                  </span>
                  <input
                    type="number"
                    className="submodal-admin__number"
                    min={f.bound.min}
                    max={f.bound.max}
                    value={thresholds[f.key]}
                    onChange={(e) =>
                      setThresholds((prev) => ({
                        ...prev,
                        [f.key]: e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="submodal-admin__actions">
              <button
                className="admin-btn admin-btn--primary"
                type="button"
                onClick={saveThresholds}
                disabled={saving === "thresholds"}
              >
                {saving === "thresholds" ? "Saving..." : "Save thresholds"}
              </button>
            </div>
          </div>

          <div className="submodal-admin__ips">
            <div className="submodal-admin__info">
              <span className="submodal-admin__label">Excluded IPs</span>
              <span className="submodal-admin__meta">
                One per line. Your current IP:{" "}
                <code>{settings.your_ip || "unknown"}</code>
              </span>
            </div>
            <textarea
              className="submodal-admin__textarea"
              rows={4}
              value={ipsText}
              onChange={(e) => setIpsText(e.target.value)}
              placeholder="203.0.113.42"
            />
            <div className="submodal-admin__actions">
              <button
                className="admin-btn"
                type="button"
                onClick={addMyIp}
                disabled={!settings.your_ip}
              >
                Add my current IP
              </button>
              <button
                className="admin-btn admin-btn--primary"
                type="button"
                onClick={saveIps}
                disabled={saving === "ips"}
              >
                {saving === "ips" ? "Saving..." : "Save IPs"}
              </button>
            </div>
          </div>

          {savedAt && (
            <p className="submodal-admin__saved">Saved at {savedAt}</p>
          )}
        </div>
      )}

      <style jsx>{`
        .submodal-admin {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          max-width: 640px;
        }
        .submodal-admin__row,
        .submodal-admin__ips {
          padding: 0.875rem 1rem;
          background: var(--glass-bg, rgba(255, 255, 255, 0.04));
          border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
          border-radius: 8px;
        }
        .submodal-admin__row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .submodal-admin__ips {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
        }
        .submodal-admin__info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .submodal-admin__label {
          font-weight: 600;
          font-size: 1rem;
        }
        .submodal-admin__meta {
          font-size: 0.8rem;
          opacity: 0.7;
        }
        .submodal-admin__fields {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.625rem 1rem;
        }
        .submodal-admin__field {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .submodal-admin__field-label {
          font-size: 0.85rem;
        }
        .submodal-admin__field-hint {
          opacity: 0.55;
          font-size: 0.75rem;
        }
        .submodal-admin__number {
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-family: var(--font-mono, monospace);
          font-size: 0.9rem;
          color: var(--text-primary);
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
          border-radius: 6px;
        }
        .submodal-admin__textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-family: var(--font-mono, monospace);
          font-size: 0.85rem;
          color: var(--text-primary);
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
          border-radius: 6px;
          resize: vertical;
        }
        .submodal-admin__actions {
          display: flex;
          gap: 0.5rem;
        }
        .submodal-admin__saved {
          font-size: 0.8rem;
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
}
