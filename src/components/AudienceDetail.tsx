"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/utils";

export interface AudienceRow {
  id: string;
  email: string;
  display_name: string | null;
  user_id: string | null;
  mailing_line1: string | null;
  mailing_line2: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_postal_code: string | null;
  mailing_country: string | null;
  subscriber_status: string;
  unsubscribed_at: string | null;
  marketing_opt_in_at: string | null;
  marketing_opt_in_source: string | null;
  first_purchase_at: string | null;
  last_purchase_at: string | null;
  lifetime_orders: number;
  lifetime_spend: number;
  engagement_score: string;
  last_opened_at: string | null;
  last_clicked_at: string | null;
  emails_received: number;
  emails_opened: number;
  emails_clicked: number;
  notes: string | null;
  first_seen_at: string;
  last_activity_at: string;
  created_at: string;
}

export interface AudienceDetailData {
  audience: AudienceRow;
  tags: { tag: string; added_at: string }[];
  events: {
    id: string;
    event_type: string;
    metadata: Record<string, unknown> | null;
    occurred_at: string;
  }[];
  orders: {
    id: string;
    order_number: string | null;
    status: string;
    total: number;
    created_at: string;
  }[];
}

function fmtMoney(n: number | null | undefined): string {
  if (!n) return "$0.00";
  return `$${Number(n).toFixed(2)}`;
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

const EVENT_LABELS: Record<string, string> = {
  subscribed: "Subscribed",
  unsubscribed: "Unsubscribed",
  resubscribed: "Resubscribed",
  purchased: "Purchased",
  email_sent: "Email sent",
  email_delivered: "Email delivered",
  email_opened: "Opened email",
  email_clicked: "Clicked link",
  email_bounced: "Email bounced",
  email_complained: "Marked as spam",
  tag_added: "Tag added",
  tag_removed: "Tag removed",
  note_added: "Note updated",
  mailing_address_updated: "Mailing address updated",
  profile_updated: "Profile updated",
  account_created: "Account created",
  account_linked: "Account linked",
};

export function AudienceDetail({ initial }: { initial: AudienceDetailData }) {
  const router = useRouter();
  const [a, setA] = useState<AudienceRow>(initial.audience);
  const [tags, setTags] = useState(initial.tags);
  const [tagInput, setTagInput] = useState("");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    display_name: a.display_name || "",
    notes: a.notes || "",
    line1: a.mailing_line1 || "",
    line2: a.mailing_line2 || "",
    city: a.mailing_city || "",
    state: a.mailing_state || "",
    postal_code: a.mailing_postal_code || "",
    country: a.mailing_country || "",
  });

  const saveProfile = async () => {
    setSavingField("profile");
    await fetch(`/api/admin/audience/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: draft.display_name }),
    });
    setA({ ...a, display_name: draft.display_name });
    setSavingField(null);
  };

  const saveAddress = async () => {
    setSavingField("address");
    await fetch(`/api/admin/audience/${a.id}`, {
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
    setA({
      ...a,
      mailing_line1: draft.line1 || null,
      mailing_line2: draft.line2 || null,
      mailing_city: draft.city || null,
      mailing_state: draft.state || null,
      mailing_postal_code: draft.postal_code || null,
      mailing_country: draft.country || null,
    });
    setSavingField(null);
  };

  const saveNotes = async () => {
    setSavingField("notes");
    await fetch(`/api/admin/audience/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: draft.notes }),
    });
    setA({ ...a, notes: draft.notes });
    setSavingField(null);
  };

  const flipStatus = async (status: "active" | "unsubscribed") => {
    await fetch(`/api/admin/audience/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriber_status: status }),
    });
    setA({ ...a, subscriber_status: status });
    router.refresh();
  };

  const addTag = async () => {
    const tag = tagInput.trim();
    if (!tag) return;
    await fetch(`/api/admin/audience/${a.id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    setTags([{ tag, added_at: new Date().toISOString() }, ...tags]);
    setTagInput("");
  };
  const removeTag = async (tag: string) => {
    await fetch(`/api/admin/audience/${a.id}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    setTags(tags.filter((t) => t.tag !== tag));
  };

  const refreshAll = async () => {
    await fetch(`/api/admin/audience/${a.id}/refresh`, { method: "POST" });
    router.refresh();
  };

  return (
    <div className="admin-page audience-detail">
      <div className="admin-page__header">
        <div>
          <Link href="/admin/audience" className="audience-detail__back">
            ← Audience
          </Link>
          <h1 className="admin-page__title">
            {a.display_name || a.email}
          </h1>
          {a.display_name && (
            <p className="audience-detail__email">{a.email}</p>
          )}
        </div>
        <div className="admin-page__header-actions">
          <span className={`admin-status admin-status--${a.subscriber_status === "active" ? "published" : a.subscriber_status === "unsubscribed" ? "draft" : "private"}`}>
            {a.subscriber_status}
          </span>
          <span className={`audience-engagement audience-engagement--${a.engagement_score}`}>
            {a.engagement_score}
          </span>
        </div>
      </div>

      <div className="audience-detail__grid">
        {/* LEFT — contact info, address, tags, notes */}
        <aside className="audience-detail__rail">
          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">Profile</h3>
            <label className="campaign-editor__label">Display name</label>
            <input
              type="text"
              className="campaign-editor__input"
              value={draft.display_name}
              onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
              onBlur={saveProfile}
            />
            <div className="campaign-editor__hint">
              {a.user_id ? "Linked customer account" : "Email-only (no account)"}
            </div>
            <div className="campaign-editor__hint">
              First seen {formatDate(a.first_seen_at)} · Source {a.marketing_opt_in_source || "—"}
            </div>
          </section>

          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">Mailing address</h3>
            <label className="campaign-editor__label">Line 1</label>
            <input className="campaign-editor__input" value={draft.line1}
              onChange={(e) => setDraft({ ...draft, line1: e.target.value })} />
            <label className="campaign-editor__label">Line 2</label>
            <input className="campaign-editor__input" value={draft.line2}
              onChange={(e) => setDraft({ ...draft, line2: e.target.value })} />
            <label className="campaign-editor__label">City / State / Postal</label>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 6 }}>
              <input className="campaign-editor__input" placeholder="City"
                value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
              <input className="campaign-editor__input" placeholder="ST"
                value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} />
              <input className="campaign-editor__input" placeholder="ZIP"
                value={draft.postal_code} onChange={(e) => setDraft({ ...draft, postal_code: e.target.value })} />
            </div>
            <label className="campaign-editor__label">Country</label>
            <input className="campaign-editor__input" value={draft.country}
              onChange={(e) => setDraft({ ...draft, country: e.target.value })} />
            <button
              type="button"
              className="admin-btn admin-btn--secondary campaign-editor__action"
              onClick={saveAddress}
              disabled={savingField === "address"}
            >
              {savingField === "address" ? "Saving..." : "Save address"}
            </button>
          </section>

          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">Tags</h3>
            <div className="audience-detail__tags">
              {tags.length === 0 && (
                <span className="campaign-editor__hint">No tags yet.</span>
              )}
              {tags.map((t) => (
                <span key={t.tag} className="audience-tag-pill">
                  {t.tag}
                  <button
                    type="button"
                    onClick={() => removeTag(t.tag)}
                    className="audience-tag-pill__x"
                    aria-label={`Remove ${t.tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                className="campaign-editor__input"
                placeholder="New tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
              />
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                onClick={addTag}
              >
                Add
              </button>
            </div>
            <button
              type="button"
              className="admin-btn admin-btn--ghost campaign-editor__action"
              onClick={refreshAll}
            >
              Recompute system tags
            </button>
          </section>

          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">Admin notes</h3>
            <textarea
              className="campaign-editor__input"
              style={{ minHeight: 80, fontFamily: "inherit" }}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              onBlur={saveNotes}
              placeholder="Internal-only notes about this person"
            />
          </section>

          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">Quick actions</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {a.subscriber_status === "active" ? (
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  onClick={() => flipStatus("unsubscribed")}
                >
                  Unsubscribe
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-btn admin-btn--primary"
                  onClick={() => flipStatus("active")}
                >
                  Resubscribe
                </button>
              )}
              {a.user_id && (
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  onClick={async () => {
                    if (!confirm("Delete the linked customer account? They can re-register with the same email afterward.")) return;
                    const res = await fetch(`/api/admin/audience/${a.id}/delete-account`, {
                      method: "DELETE",
                    });
                    if (res.ok) {
                      setA({ ...a, user_id: null });
                    } else {
                      const d = await res.json().catch(() => ({}));
                      alert(d.error || "Delete failed");
                    }
                  }}
                >
                  Delete account
                </button>
              )}
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                onClick={async () => {
                  if (!confirm("Permanently delete this contact and ALL their history (timeline, tags)? Linked orders are preserved but unlinked. This can't be undone.")) return;
                  const res = await fetch(`/api/admin/audience/${a.id}`, {
                    method: "DELETE",
                  });
                  if (res.ok) {
                    router.push("/admin/audience");
                  } else {
                    alert("Delete failed");
                  }
                }}
              >
                Delete contact
              </button>
            </div>
          </section>
        </aside>

        {/* CENTER — timeline + lifetime stats + order history */}
        <div className="audience-detail__main">
          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">Lifetime</h3>
            <div className="campaign-editor__rates" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              <div className="campaign-editor__rate">
                <span className="campaign-editor__rate-num">{a.lifetime_orders}</span>
                <span className="campaign-editor__rate-label">Orders</span>
              </div>
              <div className="campaign-editor__rate">
                <span className="campaign-editor__rate-num">{fmtMoney(a.lifetime_spend)}</span>
                <span className="campaign-editor__rate-label">Spend</span>
              </div>
              <div className="campaign-editor__rate">
                <span className="campaign-editor__rate-num">{a.emails_received}</span>
                <span className="campaign-editor__rate-label">
                  Emails · {a.emails_opened} opens
                </span>
              </div>
              <div className="campaign-editor__rate">
                <span className="campaign-editor__rate-num">{a.emails_clicked}</span>
                <span className="campaign-editor__rate-label">Clicks</span>
              </div>
            </div>
            <p className="campaign-editor__hint">
              First purchase {fmtDateTime(a.first_purchase_at)} · Last purchase {fmtDateTime(a.last_purchase_at)}
            </p>
          </section>

          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">Activity</h3>
            <ul className="audience-timeline">
              {initial.events.length === 0 && (
                <li className="campaign-editor__hint">No activity yet.</li>
              )}
              {initial.events.map((ev) => (
                <li key={ev.id} className="audience-timeline__row">
                  <span className={`audience-timeline__dot audience-timeline__dot--${ev.event_type}`} />
                  <div className="audience-timeline__body">
                    <span className="audience-timeline__label">
                      {EVENT_LABELS[ev.event_type] || ev.event_type}
                    </span>
                    {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                      <span className="audience-timeline__meta">
                        {(ev.metadata as { order_number?: string }).order_number
                          ? `· ${(ev.metadata as { order_number?: string }).order_number}`
                          : null}
                        {(ev.metadata as { tag?: string }).tag
                          ? ` · ${(ev.metadata as { tag?: string }).tag}`
                          : null}
                      </span>
                    )}
                  </div>
                  <span className="audience-timeline__when">
                    {fmtDateTime(ev.occurred_at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {initial.orders.length > 0 && (
            <section className="campaign-editor__panel">
              <h3 className="campaign-editor__panel-title">Order history</h3>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="admin-table__th">Order</th>
                    <th className="admin-table__th">Status</th>
                    <th className="admin-table__th">Total</th>
                    <th className="admin-table__th">Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {initial.orders.map((o) => (
                    <tr key={o.id} className="admin-table__row">
                      <td className="admin-table__td">
                        <Link href={`/admin/orders/${o.id}`} className="admin-table__link">
                          {o.order_number || o.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="admin-table__td">{o.status}</td>
                      <td className="admin-table__td">{fmtMoney(o.total)}</td>
                      <td className="admin-table__td admin-table__td--date">
                        {formatDate(o.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
