"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useConsent } from "@/components/ConsentProvider";
import {
  NOTIFICATION_CATEGORIES,
  OPTIONAL_CATEGORIES,
} from "@/lib/notification-categories";
import { type DownloadFormat, downloadFormatChip } from "@/lib/audio-formats";

interface DownloadItem {
  purchase_id: string;
  order_id: string | null;
  item_type: "song" | "release" | "ringtone";
  title: string;
  slug: string | null;
  cover_art_path: string | null;
  amount: number | null;
  created_at: string;
  formatLinks: Array<{ format: DownloadFormat | "m4r"; url: string }>;
}

interface FanTrackItem {
  grant_id: string;
  slug: string;
  title: string;
  artist_credit: string;
  cover_art_path: string | null;
  url: string;
  granted_at: string;
  first_played_at: string | null;
}

export interface AccountAudience {
  id: string;
  email: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  mailing_line1: string | null;
  mailing_line2: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_postal_code: string | null;
  mailing_country: string | null;
  subscriber_status: string;
  lifetime_orders: number;
  lifetime_spend: number;
  emails_received: number;
  emails_opened: number;
  notify_new_releases: boolean;
  notify_youtube_video: boolean;
  notify_archive_highlights: boolean;
  notify_curated: boolean;
  notify_observations: boolean;
  notify_merch: boolean;
  notify_live_shows: boolean;
}

export interface AccountData {
  audience: AccountAudience;
  orders: {
    id: string;
    order_number: string | null;
    status: string;
    total: number;
    created_at: string;
  }[];
  hasStripeCustomer: boolean;
  coupons: {
    code: string;
    percent_off: number;
    source: string;
    granted_at: string;
    expires_at: string;
    redeemed_at: string | null;
  }[];
  patronage: {
    amount: number;
    interval: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    subscriptionId: string;
  } | null;
}

function fmtMoney(n: number | null): string {
  if (!n) return "$0";
  return `$${Number(n).toFixed(2)}`;
}
function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function AccountDashboard({ initial }: { initial: AccountData }) {
  const router = useRouter();
  const supabase = createBrowserClient();
  const [a, setA] = useState(initial.audience);

  const [draft, setDraft] = useState({
    first_name: a.first_name || "",
    last_name: a.last_name || "",
    line1: a.mailing_line1 || "",
    line2: a.mailing_line2 || "",
    city: a.mailing_city || "",
    state: a.mailing_state || "",
    postal_code: a.mailing_postal_code || "",
    country: a.mailing_country || "",
  });
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressMsg, setAddressMsg] = useState("");
  const [prefBusy, setPrefBusy] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    const p: Record<string, boolean> = {};
    const row = initial.audience as unknown as Record<string, unknown>;
    for (const c of OPTIONAL_CATEGORIES) {
      const v = row[c.column as string];
      p[c.key] = v === undefined || v === null ? true : !!v;
    }
    return p;
  });
  const [catBusyKey, setCatBusyKey] = useState<string | null>(null);
  const { consent, update: updateConsent, openManager } = useConsent();

  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const requestEmailChange = async () => {
    const target = newEmail.trim().toLowerCase();
    if (!target) return;
    if (target === a.email.toLowerCase()) {
      setEmailMsg({ kind: "err", text: "That's already your email." });
      return;
    }
    setEmailBusy(true);
    setEmailMsg(null);
    const res = await fetch("/api/account/change-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_email: target }),
    });
    setEmailBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setEmailMsg({ kind: "ok", text: data.message || "Check your new inbox for a confirmation link." });
      setNewEmail("");
    } else {
      setEmailMsg({ kind: "err", text: data.error || "Could not request email change." });
    }
  };

  const saveName = async () => {
    setSavingName(true);
    setNameMsg("");
    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: draft.first_name,
        last_name: draft.last_name,
      }),
    });
    setSavingName(false);
    if (res.ok) {
      setA({ ...a, first_name: draft.first_name || null, last_name: draft.last_name || null });
      setNameMsg("Saved.");
    } else {
      setNameMsg("Save failed.");
    }
  };
  const [portalBusy, setPortalBusy] = useState(false);
  const [downloads, setDownloads] = useState<DownloadItem[] | null>(null);
  const [fanTracks, setFanTracks] = useState<FanTrackItem[] | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
    } catch {
      // Clipboard may be unavailable (insecure context, browser denial) — silent
    }
  };

  const openBillingPortal = async () => {
    setPortalBusy(true);
    const res = await fetch("/api/account/billing-portal", { method: "POST" });
    const d = await res.json();
    if (d.url) {
      window.location.href = d.url;
      return;
    }
    setPortalBusy(false);
    alert(d.error || "Could not open billing portal.");
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/downloads")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && Array.isArray(d.items)) setDownloads(d.items);
      })
      .catch(() => {});
    fetch("/api/account/fan-tracks")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && Array.isArray(d.items)) setFanTracks(d.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const saveAddress = async () => {
    setSavingAddress(true);
    setAddressMsg("");
    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mailing_address: {
          line1: draft.line1 || null,
          line2: draft.line2 || null,
          city: draft.city || null,
          state: draft.state || null,
          postal_code: draft.postal_code || null,
          country: draft.country || null,
        },
      }),
    });
    setSavingAddress(false);
    if (res.ok) {
      setA({
        ...a,
        mailing_line1: draft.line1 || null,
        mailing_line2: draft.line2 || null,
        mailing_city: draft.city || null,
        mailing_state: draft.state || null,
        mailing_postal_code: draft.postal_code || null,
        mailing_country: draft.country || null,
      });
      setAddressMsg("Saved.");
    } else {
      setAddressMsg("Save failed.");
    }
  };

  const togglePref = async () => {
    const next = a.subscriber_status === "active" ? "unsubscribed" : "active";
    setPrefBusy(true);
    const res = await fetch("/api/account/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriber_status: next }),
    });
    setPrefBusy(false);
    if (res.ok) setA({ ...a, subscriber_status: next });
  };

  const toggleCategory = async (key: string, next: boolean) => {
    setPrefs((p) => ({ ...p, [key]: next }));
    setCatBusyKey(key);
    const res = await fetch("/api/account/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: { [key]: next } }),
    });
    setCatBusyKey(null);
    if (!res.ok) {
      // Revert the optimistic flip on failure.
      setPrefs((p) => ({ ...p, [key]: !next }));
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    await fetch("/api/auth/session", { method: "DELETE" });
    router.push("/");
  };

  return (
    <div className="page-static account-dashboard">
      <header className="account-dashboard__header">
        <div>
          <h1 className="account-dashboard__title">Your Account</h1>
          <p className="account-dashboard__email">{a.email}</p>
        </div>
        <button type="button" className="account-dashboard__signout" onClick={signOut}>
          Sign out
        </button>
      </header>

      <div className="account-dashboard__grid">
        <div className="account-dashboard__column">
        <section className="account-dashboard__card">
          <h2 className="account-dashboard__card-title">Your name</h2>
          <p className="account-dashboard__hint">
            Used on receipts and personal notes from Chad.
          </p>
          <div className="account-dashboard__row">
            <div style={{ flex: 1 }}>
              <label className="account-dashboard__label">First name</label>
              <input
                type="text"
                className="account-dashboard__input"
                value={draft.first_name}
                onChange={(e) => setDraft({ ...draft, first_name: e.target.value })}
                autoComplete="given-name"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="account-dashboard__label">Last name</label>
              <input
                type="text"
                className="account-dashboard__input"
                value={draft.last_name}
                onChange={(e) => setDraft({ ...draft, last_name: e.target.value })}
                autoComplete="family-name"
              />
            </div>
          </div>
          <button
            type="button"
            className="account-dashboard__btn"
            onClick={saveName}
            disabled={savingName}
          >
            {savingName ? "Saving..." : "Save name"}
          </button>
          {nameMsg && <p className="account-dashboard__msg">{nameMsg}</p>}
        </section>

        <section className="account-dashboard__card">
          <h2 className="account-dashboard__card-title">Email address</h2>
          <p className="account-dashboard__hint">
            Current: <strong>{a.email}</strong>. Changing it will send a confirmation link to the new address; the change only takes effect after you click that link.
          </p>
          <label className="account-dashboard__label">New email</label>
          <input
            type="email"
            className="account-dashboard__input"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@example.com"
            autoComplete="email"
            inputMode="email"
          />
          <button
            type="button"
            className="account-dashboard__btn"
            onClick={requestEmailChange}
            disabled={emailBusy || !newEmail.trim()}
          >
            {emailBusy ? "Sending..." : "Send confirmation"}
          </button>
          {emailMsg && (
            <p
              className="account-dashboard__msg"
              style={emailMsg.kind === "err" ? { color: "#f87171" } : undefined}
            >
              {emailMsg.text}
            </p>
          )}
        </section>

        <section className="account-dashboard__card">
          <h2 className="account-dashboard__card-title">Shipping/Mailing address</h2>
          <p className="account-dashboard__hint">
            Used at checkout as your default shipping address, and for any
            physical mailers or giveaways.
          </p>
          <label className="account-dashboard__label">Line 1</label>
          <input
            type="text"
            className="account-dashboard__input"
            value={draft.line1}
            onChange={(e) => setDraft({ ...draft, line1: e.target.value })}
          />
          <label className="account-dashboard__label">Line 2</label>
          <input
            type="text"
            className="account-dashboard__input"
            value={draft.line2}
            onChange={(e) => setDraft({ ...draft, line2: e.target.value })}
          />
          <div className="account-dashboard__row">
            <div style={{ flex: 2 }}>
              <label className="account-dashboard__label">City</label>
              <input
                type="text"
                className="account-dashboard__input"
                value={draft.city}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="account-dashboard__label">State</label>
              <input
                type="text"
                className="account-dashboard__input"
                value={draft.state}
                onChange={(e) => setDraft({ ...draft, state: e.target.value })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="account-dashboard__label">Postal</label>
              <input
                type="text"
                className="account-dashboard__input"
                value={draft.postal_code}
                onChange={(e) => setDraft({ ...draft, postal_code: e.target.value })}
              />
            </div>
          </div>
          <label className="account-dashboard__label">Country</label>
          <input
            type="text"
            className="account-dashboard__input"
            value={draft.country}
            onChange={(e) => setDraft({ ...draft, country: e.target.value })}
          />
          <button
            type="button"
            className="account-dashboard__btn"
            onClick={saveAddress}
            disabled={savingAddress}
          >
            {savingAddress ? "Saving..." : "Save address"}
          </button>
          {addressMsg && <p className="account-dashboard__msg">{addressMsg}</p>}
        </section>

        <section className="account-dashboard__card">
          <h2 className="account-dashboard__card-title">Email preferences</h2>
          <p className="account-dashboard__hint">
            Status:{" "}
            <strong>
              {a.subscriber_status === "active"
                ? "Subscribed"
                : a.subscriber_status === "unsubscribed"
                  ? "Unsubscribed"
                  : "Not subscribed yet"}
            </strong>
          </p>
          <button
            type="button"
            className="account-dashboard__btn"
            onClick={togglePref}
            disabled={prefBusy}
          >
            {prefBusy
              ? "..."
              : a.subscriber_status === "active"
                ? "Unsubscribe from everything"
                : "Subscribe to updates"}
          </button>

          <p className="account-dashboard__hint">
            {a.subscriber_status === "active"
              ? "Pick what you hear about. Order, account, and legal emails always come through."
              : "Subscribe to choose which emails you get. Order and account emails always come through regardless."}
          </p>

          <ul className="account-dashboard__prefs">
            {NOTIFICATION_CATEGORIES.map((cat) => {
              const isGeneral = cat.required;
              const checked = isGeneral ? true : !!prefs[cat.key];
              const disabled =
                isGeneral ||
                a.subscriber_status !== "active" ||
                catBusyKey === cat.key;
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

        <section className="account-dashboard__card">
          <h2 className="account-dashboard__card-title">Privacy and cookies</h2>
          <p className="account-dashboard__hint">
            Analytics (PostHog, Google Analytics, and first-party metrics,
            including masked session replay):{" "}
            <strong>{consent.analytics ? "On" : "Off"}</strong>
          </p>
          <button
            type="button"
            className="account-dashboard__btn"
            onClick={() =>
              updateConsent({
                essential: 1,
                functional: consent.analytics ? 0 : 1,
                analytics: consent.analytics ? 0 : 1,
                marketing: 0,
              })
            }
          >
            {consent.analytics ? "Turn analytics off" : "Turn analytics on"}
          </button>
          <button
            type="button"
            className="account-dashboard__btn"
            onClick={openManager}
          >
            Manage cookie preferences
          </button>
          <p className="account-dashboard__hint">
            Saved to your account and applied on every device you sign in on.
            Toggling reloads the page so trackers start or stop cleanly.
          </p>
        </section>
        </div>

        <div className="account-dashboard__column">
        {fanTracks && fanTracks.length > 0 && (
          <section className="account-dashboard__card account-dashboard__card--fan-tracks">
            <h2 className="account-dashboard__card-title">For my fans</h2>
            <p className="account-dashboard__hint">
              Unreleased tracks &mdash; yours because you bought something
              real. Earned, not shared.
            </p>
            <ul className="account-dashboard__fan-tracks">
              {fanTracks.map((ft) => {
                const monogram = (ft.title.trim()[0] || "C").toUpperCase();
                return (
                  <li key={ft.grant_id} className="account-dashboard__fan-track">
                    <div className="account-dashboard__fan-track-art" aria-hidden="true">
                      {ft.cover_art_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ft.cover_art_path} alt="" />
                      ) : (
                        <span>{monogram}</span>
                      )}
                    </div>
                    <div className="account-dashboard__fan-track-body">
                      <div className="account-dashboard__fan-track-title">{ft.title}</div>
                      <div className="account-dashboard__fan-track-artist">{ft.artist_credit}</div>
                    </div>
                    <Link
                      href={ft.url}
                      className="account-dashboard__fan-track-btn"
                    >
                      Listen
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {initial.coupons.length > 0 && (
          <section className="account-dashboard__card">
            <h2 className="account-dashboard__card-title">Your coupons</h2>
            <ul className="account-dashboard__coupons">
              {initial.coupons.map((c) => {
                const isUsed = !!c.redeemed_at;
                // eslint-disable-next-line react-hooks/purity -- "expired now" is a UI-time read; one snapshot per render is correct
                const isExpired = !isUsed && new Date(c.expires_at).getTime() < Date.now();
                const state = isUsed ? "used" : isExpired ? "expired" : "active";
                const isCopyable = !isUsed && !isExpired;
                const wasCopied = copiedCode === c.code;
                return (
                  <li key={c.code} className={`account-dashboard__coupon account-dashboard__coupon--${state}`}>
                    {isCopyable ? (
                      <button
                        type="button"
                        className="account-dashboard__coupon-code account-dashboard__coupon-code--copyable"
                        onClick={() => copyCode(c.code)}
                        aria-label={`Copy coupon code ${c.code}`}
                      >
                        <span>{c.code}</span>
                        <span className="account-dashboard__coupon-copy" aria-hidden="true">
                          {wasCopied ? "Copied" : "Copy"}
                        </span>
                      </button>
                    ) : (
                      <div className="account-dashboard__coupon-code">{c.code}</div>
                    )}
                    <div className="account-dashboard__coupon-meta">
                      <span className="account-dashboard__coupon-pct">{c.percent_off}% off</span>
                      <span className="account-dashboard__coupon-status">
                        {isUsed
                          ? `Used ${fmtDate(c.redeemed_at!)}`
                          : isExpired
                            ? `Expired ${fmtDate(c.expires_at)}`
                            : `Expires ${fmtDate(c.expires_at)}`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="account-dashboard__hint">
              Toggle on at checkout from your cart. Applies to all music
              in your cart, or one merch item &mdash; whichever saves more.
            </p>
          </section>
        )}

        {initial.patronage && (
          <section className="account-dashboard__card">
            <h2 className="account-dashboard__card-title">Your patronage</h2>
            <p className="account-dashboard__hint">
              Monthly patron &mdash; {fmtMoney(initial.patronage.amount)}/
              {initial.patronage.interval}
            </p>
            {initial.patronage.currentPeriodEnd && (
              <p className="account-dashboard__hint">
                {initial.patronage.cancelAtPeriodEnd
                  ? `Ends ${fmtDate(initial.patronage.currentPeriodEnd)} - won't renew`
                  : `Renews ${fmtDate(initial.patronage.currentPeriodEnd)}`}
              </p>
            )}
            <button
              type="button"
              className="account-dashboard__btn"
              onClick={openBillingPortal}
              disabled={portalBusy}
            >
              {portalBusy ? "Opening..." : "Manage or cancel patronage"}
            </button>
          </section>
        )}

        <section className="account-dashboard__card">
          <h2 className="account-dashboard__card-title">Payments &amp; billing</h2>
          {initial.hasStripeCustomer ? (
            <>
              <p className="account-dashboard__hint">
                Manage saved payment methods, billing address, and view
                invoices on Stripe&rsquo;s secure portal.
              </p>
              <button
                type="button"
                className="account-dashboard__btn"
                onClick={openBillingPortal}
                disabled={portalBusy}
              >
                {portalBusy ? "Opening..." : "Manage payment & billing"}
              </button>
            </>
          ) : (
            <p className="account-dashboard__hint">
              Once you make your first purchase, payment methods and billing
              details will show up here.
            </p>
          )}
        </section>

        <section className="account-dashboard__card">
          <h2 className="account-dashboard__card-title">Order history</h2>
          {initial.orders.length === 0 ? (
            <p className="account-dashboard__hint">No orders yet.</p>
          ) : (
            <>
              <table className="account-dashboard__table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {initial.orders.map((o) => (
                    <tr key={o.id}>
                      <td>{o.order_number || o.id.slice(0, 8)}</td>
                      <td>{o.status}</td>
                      <td>{fmtMoney(o.total)}</td>
                      <td>{fmtDate(o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {downloads === null && (
                <p className="account-dashboard__hint">Loading downloads...</p>
              )}
              {downloads !== null && downloads.length > 0 && (
                <>
                  <h3 className="account-dashboard__sub-title">Your downloads</h3>
                  <ul className="account-dashboard__downloads">
                    {downloads.map((d) => (
                      <li key={d.purchase_id} className="account-dashboard__download">
                        <span className="account-dashboard__download-title">
                          {d.title}
                          <span className="account-dashboard__download-type">
                            {" "}· {d.item_type}
                          </span>
                        </span>
                        <span className="account-dashboard__download-actions">
                          {d.formatLinks.length === 0 ? (
                            <span className="account-dashboard__hint" style={{ margin: 0 }}>
                              Unavailable
                            </span>
                          ) : (
                            d.formatLinks.map((f) => (
                              <a
                                key={f.format}
                                href={f.url}
                                className="account-dashboard__download-btn"
                              >
                                {downloadFormatChip(f.format)}
                              </a>
                            ))
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          <p className="account-dashboard__hint">
            Lost a download? You can also{" "}
            <Link href="/music/recover">recover by email</Link>.
          </p>
        </section>
        </div>

      </div>
    </div>
  );
}
