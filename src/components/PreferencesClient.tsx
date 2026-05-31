"use client";

import Link from "next/link";
import { useState } from "react";
import { NOTIFICATION_CATEGORIES } from "@/lib/notification-categories";

interface Found {
  email: string;
  subscriber_status: string;
  prefs: Record<string, boolean>;
}

interface Props {
  token: string | null;
  found: Found | null;
}

export function PreferencesClient({ token, found }: Props) {
  const [status, setStatus] = useState(found?.subscriber_status ?? "never");
  const [prefs, setPrefs] = useState<Record<string, boolean>>(found?.prefs ?? {});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const active = status === "active";

  // Bad or missing token: don't reveal anything, just offer the safe paths.
  // Same full-width account-dashboard shell as the happy path.
  if (!token || !found) {
    return (
      <div className="page-static account-dashboard">
        <header className="account-dashboard__header">
          <div>
            <h1 className="account-dashboard__title">Email preferences</h1>
          </div>
        </header>
        <div className="account-dashboard__grid">
          <div className="account-dashboard__column">
            <section className="account-dashboard__card">
              <h2 className="account-dashboard__card-title">Link not recognized</h2>
              <p className="account-dashboard__hint">
                This link looks old or incomplete. Open the &ldquo;Manage email
                preferences&rdquo; link from a recent email, or unsubscribe by
                email instead.
              </p>
              <p className="account-dashboard__hint">
                <Link href="/unsubscribe">Unsubscribe by email</Link>
              </p>
            </section>
          </div>
        </div>
      </div>
    );
  }

  const flashSaved = () => {
    setNote("Saved.");
    setTimeout(() => setNote(""), 1500);
  };

  const patch = async (body: Record<string, unknown>): Promise<boolean> => {
    const res = await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...body }),
    });
    return res.ok;
  };

  const toggleMaster = async () => {
    const next = active ? "unsubscribed" : "active";
    setStatus(next);
    setBusyKey("__master__");
    const ok = await patch({ subscriber_status: next });
    setBusyKey(null);
    if (ok) flashSaved();
    else setStatus(active ? "active" : "unsubscribed"); // revert
  };

  const toggleCategory = async (key: string, next: boolean) => {
    setPrefs((p) => ({ ...p, [key]: next }));
    setBusyKey(key);
    const ok = await patch({ categories: { [key]: next } });
    setBusyKey(null);
    if (ok) flashSaved();
    else setPrefs((p) => ({ ...p, [key]: !next })); // revert
  };

  return (
    <div className="page-static account-dashboard">
      <header className="account-dashboard__header">
        <div>
          <h1 className="account-dashboard__title">Email preferences</h1>
          <p className="account-dashboard__email">{found.email}</p>
        </div>
      </header>

      <div className="account-dashboard__grid">
        <div className="account-dashboard__column">
          <section className="account-dashboard__card">
            <h2 className="account-dashboard__card-title">Subscription</h2>
            <p className="account-dashboard__hint">
              Status:{" "}
              <strong>
                {active
                  ? "Subscribed"
                  : status === "unsubscribed"
                    ? "Unsubscribed"
                    : "Not subscribed yet"}
              </strong>
            </p>
            <button
              type="button"
              className="account-dashboard__btn"
              onClick={toggleMaster}
              disabled={busyKey === "__master__"}
            >
              {busyKey === "__master__"
                ? "..."
                : active
                  ? "Unsubscribe from everything"
                  : "Subscribe to updates"}
            </button>
            <p className="account-dashboard__hint">
              {active
                ? "Pick what you hear about in the next panel. Order, account, and legal emails always come through."
                : "Order and account emails always come through regardless of this setting."}
            </p>
            {note && <p className="account-dashboard__msg">{note}</p>}
          </section>
        </div>

        <div className="account-dashboard__column">
          <section className="account-dashboard__card">
            <h2 className="account-dashboard__card-title">What you hear about</h2>
            <ul className="account-dashboard__prefs">
              {NOTIFICATION_CATEGORIES.map((cat) => {
                const isGeneral = cat.required;
                const checked = isGeneral ? true : !!prefs[cat.key];
                const disabled = isGeneral || !active || busyKey === cat.key;
                return (
                  <li key={cat.key} className="account-dashboard__pref">
                    <span className="account-dashboard__pref-info">
                      <span className="account-dashboard__pref-label">
                        {cat.label}
                        {isGeneral && (
                          <span className="account-dashboard__pref-badge">Always on</span>
                        )}
                      </span>
                      <span className="account-dashboard__pref-desc">{cat.description}</span>
                    </span>
                    <label className="account-dashboard__toggle">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={(e) => toggleCategory(cat.key, e.target.checked)}
                      />
                      <span className="account-dashboard__toggle-slider" />
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      <p className="account-dashboard__hint" style={{ marginTop: "var(--space-lg)" }}>
        <Link href="/">Back to chadlewine.com &rarr;</Link>
      </p>
    </div>
  );
}
