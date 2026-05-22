"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface FanTrackRow {
  id: string;
  slug: string;
  title: string;
  artist_credit: string;
  duration_seconds: number | null;
  cover_art_path: string | null;
  hls_playlist_path: string;
  hls_key_b64: string;
  eligibility_rule: Record<string, unknown>;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

export interface FanTrackGrantRow {
  id: string;
  audience_id: string;
  token: string;
  granted_at: string;
  granted_via: string;
  invite_email_sent_at: string | null;
  first_played_at: string | null;
  last_played_at: string | null;
  play_count: number;
  audience: {
    id: string;
    email: string;
    display_name: string | null;
    user_id: string | null;
  } | null;
}

export interface FanTrackDetailData {
  track: FanTrackRow;
  grants: FanTrackGrantRow[];
}

function fmt(date: string | null): string {
  if (!date) return "-";
  try {
    return new Date(date).toLocaleString();
  } catch {
    return "-";
  }
}

export function FanTrackAdminEditor({ initial }: { initial: FanTrackDetailData }) {
  const router = useRouter();
  const [track, setTrack] = useState(initial.track);
  const [grants, setGrants] = useState(initial.grants);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>("");

  const [draft, setDraft] = useState({
    title: track.title,
    artist_credit: track.artist_credit,
    duration_seconds: track.duration_seconds?.toString() ?? "",
    cover_art_path: track.cover_art_path ?? "",
  });

  const [newGrantEmail, setNewGrantEmail] = useState("");

  const saveMetadata = async () => {
    setBusy("save");
    setStatusMsg("");
    const res = await fetch(`/api/admin/fan-tracks/${track.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        artist_credit: draft.artist_credit,
        duration_seconds: draft.duration_seconds === "" ? null : Number(draft.duration_seconds),
        cover_art_path: draft.cover_art_path.trim() || null,
      }),
    });
    setBusy(null);
    if (res.ok) {
      setTrack({
        ...track,
        title: draft.title,
        artist_credit: draft.artist_credit,
        duration_seconds: draft.duration_seconds === "" ? null : Number(draft.duration_seconds),
        cover_art_path: draft.cover_art_path.trim() || null,
      });
      setStatusMsg("Saved.");
    } else {
      setStatusMsg("Save failed.");
    }
  };

  const togglePublish = async () => {
    const next = !track.is_published;
    if (next && !confirm("Publishing backfills grants for every existing buyer. Continue?")) {
      return;
    }
    setBusy("publish");
    setStatusMsg("");
    const res = await fetch(`/api/admin/fan-tracks/${track.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_published: next }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setTrack({ ...track, is_published: next, published_at: next ? new Date().toISOString() : track.published_at });
      setStatusMsg(
        next
          ? `Published. Backfilled ${data.backfilled ?? 0} grant${data.backfilled === 1 ? "" : "s"}.`
          : "Unpublished.",
      );
      router.refresh();
    } else {
      setStatusMsg(data.error || "Toggle failed.");
    }
  };

  const addGrant = async () => {
    const email = newGrantEmail.trim().toLowerCase();
    if (!email) return;
    setBusy("grant");
    setStatusMsg("");
    const res = await fetch(`/api/admin/fan-tracks/${track.slug}/grants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setNewGrantEmail("");
      setStatusMsg(`Granted to ${email}.`);
      router.refresh();
    } else {
      setStatusMsg(data.error || "Grant failed.");
    }
  };

  const revokeGrant = async (audienceId: string, email: string) => {
    if (!confirm(`Revoke access to ${track.title} for ${email}?`)) return;
    setBusy(`revoke-${audienceId}`);
    const res = await fetch(`/api/admin/fan-tracks/${track.slug}/grants`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience_id: audienceId }),
    });
    setBusy(null);
    if (res.ok) {
      setGrants(grants.filter((g) => g.audience_id !== audienceId));
      setStatusMsg(`Revoked ${email}.`);
    } else {
      const d = await res.json().catch(() => ({}));
      setStatusMsg(d.error || "Revoke failed.");
    }
  };

  const sendInvites = async () => {
    const remaining = grants.filter((g) => !g.invite_email_sent_at && g.audience?.user_id).length;
    if (remaining === 0) {
      alert("Every grantee with a linked account has already been emailed.");
      return;
    }
    if (!confirm(`Send invite email to ${remaining} grantee${remaining === 1 ? "" : "s"}?`)) return;
    setBusy("send");
    setStatusMsg("");
    const res = await fetch(`/api/admin/fan-tracks/${track.slug}/send-invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatusMsg(
        `Sent ${data.sent_count ?? 0}, skipped ${data.skipped_count ?? 0}, failed ${data.failed_count ?? 0}.`,
      );
      router.refresh();
    } else {
      setStatusMsg(data.error || "Send failed.");
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <Link href="/admin/fan-tracks" className="audience-detail__back">
            &larr; Fan tracks
          </Link>
          <h1 className="admin-page__title">{track.title}</h1>
          <p className="admin-page__sub">
            <code>/{track.slug}</code> &middot; {track.artist_credit}
          </p>
        </div>
        <div className="admin-page__header-actions">
          <span
            className={`admin-status admin-status--${track.is_published ? "published" : "draft"}`}
          >
            {track.is_published ? "published" : "draft"}
          </span>
        </div>
      </div>

      <div className="audience-detail__grid">
        <aside className="audience-detail__rail">
          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">Metadata</h3>
            <label className="campaign-editor__label">Title</label>
            <input
              type="text"
              className="campaign-editor__input"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <label className="campaign-editor__label">Artist credit</label>
            <input
              type="text"
              className="campaign-editor__input"
              value={draft.artist_credit}
              onChange={(e) => setDraft({ ...draft, artist_credit: e.target.value })}
            />
            <label className="campaign-editor__label">Duration (seconds)</label>
            <input
              type="number"
              className="campaign-editor__input"
              value={draft.duration_seconds}
              onChange={(e) => setDraft({ ...draft, duration_seconds: e.target.value })}
            />
            <label className="campaign-editor__label">Cover art URL (optional)</label>
            <input
              type="text"
              className="campaign-editor__input"
              value={draft.cover_art_path}
              onChange={(e) => setDraft({ ...draft, cover_art_path: e.target.value })}
              placeholder="https://chadlewine-cover-art.b-cdn.net/..."
            />
            <button
              type="button"
              className="admin-btn admin-btn--secondary campaign-editor__action"
              onClick={saveMetadata}
              disabled={busy === "save"}
            >
              {busy === "save" ? "Saving..." : "Save metadata"}
            </button>
          </section>

          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">Publish</h3>
            <p className="campaign-editor__hint">
              Publishing makes the slug live AND backfills grants for every
              audience meeting the eligibility rule. Idempotent &mdash; safe to
              toggle off then on.
            </p>
            <button
              type="button"
              className={`admin-btn ${track.is_published ? "admin-btn--secondary" : "admin-btn--primary"}`}
              onClick={togglePublish}
              disabled={busy === "publish"}
            >
              {busy === "publish"
                ? "..."
                : track.is_published
                  ? "Unpublish"
                  : "Publish + backfill grants"}
            </button>
            {track.published_at && (
              <p className="campaign-editor__hint">First published {fmt(track.published_at)}</p>
            )}
          </section>

          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">Eligibility rule</h3>
            <pre
              style={{
                fontSize: 12,
                padding: 12,
                background: "rgba(0,0,0,0.3)",
                borderRadius: 4,
                overflow: "auto",
              }}
            >
              {JSON.stringify(track.eligibility_rule, null, 2)}
            </pre>
            <p className="campaign-editor__hint">
              Default: lifetime_orders &gt;= 1. Edit by hand via SQL for now;
              rule builder UI lands when we have more than one rule kind.
            </p>
          </section>

          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">Send invites</h3>
            <p className="campaign-editor__hint">
              Emails every grantee with a linked account who hasn&rsquo;t been
              emailed yet. Skips email-only buyers and unsubscribers.
            </p>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={sendInvites}
              disabled={busy === "send" || !track.is_published}
            >
              {busy === "send" ? "Sending..." : "Send invite emails"}
            </button>
          </section>
        </aside>

        <div className="audience-detail__main">
          {statusMsg && (
            <section className="campaign-editor__panel">
              <p style={{ margin: 0 }}>{statusMsg}</p>
            </section>
          )}

          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">Add grant manually</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="email"
                className="campaign-editor__input"
                placeholder="fan@example.com"
                value={newGrantEmail}
                onChange={(e) => setNewGrantEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addGrant()}
              />
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                onClick={addGrant}
                disabled={busy === "grant" || !newGrantEmail.trim()}
              >
                {busy === "grant" ? "..." : "Grant"}
              </button>
            </div>
          </section>

          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">
              Grants ({grants.length})
            </h3>
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="admin-table__th">Email</th>
                  <th className="admin-table__th">Source</th>
                  <th className="admin-table__th">Granted</th>
                  <th className="admin-table__th">Invited</th>
                  <th className="admin-table__th">Plays</th>
                  <th className="admin-table__th"></th>
                </tr>
              </thead>
              <tbody>
                {grants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="admin-table__td">
                      <span className="campaign-editor__hint">
                        No grants yet. Publish the track to backfill, or add one
                        manually above.
                      </span>
                    </td>
                  </tr>
                )}
                {grants.map((g) => (
                  <tr key={g.id} className="admin-table__row">
                    <td className="admin-table__td">
                      {g.audience?.email ?? "(unknown)"}
                      {!g.audience?.user_id && (
                        <span
                          className="campaign-editor__hint"
                          style={{ marginLeft: 8 }}
                          title="No account yet -- can't access the link"
                        >
                          no account
                        </span>
                      )}
                    </td>
                    <td className="admin-table__td">{g.granted_via}</td>
                    <td className="admin-table__td admin-table__td--date">
                      {fmt(g.granted_at)}
                    </td>
                    <td className="admin-table__td admin-table__td--date">
                      {fmt(g.invite_email_sent_at)}
                    </td>
                    <td className="admin-table__td">{g.play_count}</td>
                    <td className="admin-table__td">
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        onClick={() => g.audience && revokeGrant(g.audience_id, g.audience.email)}
                        disabled={busy === `revoke-${g.audience_id}`}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
