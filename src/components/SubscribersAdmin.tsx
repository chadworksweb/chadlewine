"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";

export interface SubscriberRow {
  id: string;
  email: string;
  source_page: string | null;
  status: string;
  unsubscribed_at: string | null;
  created_at: string;
}

export interface UnsubRequestRow {
  id: string;
  email: string;
  reason: string | null;
  source_page: string | null;
  status: string;
  created_at: string;
}

type Tab = "active" | "requests" | "archive";

interface Props {
  subscribers: SubscriberRow[];
  requests: UnsubRequestRow[];
}

export function SubscribersAdmin({ subscribers, requests }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("active");
  const [busyId, setBusyId] = useState<string | null>(null);

  const active = useMemo(
    () => subscribers.filter((s) => s.status === "active"),
    [subscribers]
  );
  const archived = useMemo(
    () => subscribers.filter((s) => s.status !== "active"),
    [subscribers]
  );
  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests]
  );

  // Map active subscriber email → pending request, for highlighting in
  // the Active tab and one-click "unsubscribe AND mark processed" flow.
  const pendingByEmail = useMemo(() => {
    const m = new Map<string, UnsubRequestRow>();
    for (const r of pendingRequests) {
      m.set(r.email.toLowerCase(), r);
    }
    return m;
  }, [pendingRequests]);

  const setStatus = async (
    id: string,
    status: "active" | "unsubscribed",
    requestId?: string
  ) => {
    setBusyId(id);
    const res = await fetch(`/api/admin/subscribers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, request_id: requestId }),
    });
    setBusyId(null);
    if (res.ok) router.refresh();
    else alert("Update failed.");
  };

  const dismissRequest = async (id: string) => {
    setBusyId(id);
    const res = await fetch(`/api/admin/unsubscribe-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    setBusyId(null);
    if (res.ok) router.refresh();
    else alert("Update failed.");
  };

  const unsubBySubId = (subscriberId: string, requestId: string) =>
    setStatus(subscriberId, "unsubscribed", requestId);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Subscribers</h1>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card">
          <span className="admin-stats__value">{active.length}</span>
          <span className="admin-stats__label">Active</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{pendingRequests.length}</span>
          <span className="admin-stats__label">Requests</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{archived.length}</span>
          <span className="admin-stats__label">Archived</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{subscribers.length}</span>
          <span className="admin-stats__label">Total</span>
        </div>
      </div>

      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tabs__tab${tab === "active" ? " admin-tabs__tab--active" : ""}`}
          onClick={() => setTab("active")}
        >
          Active <span className="admin-tabs__count">{active.length}</span>
        </button>
        <button
          type="button"
          className={`admin-tabs__tab${tab === "requests" ? " admin-tabs__tab--active" : ""}`}
          onClick={() => setTab("requests")}
        >
          Requests
          {pendingRequests.length > 0 && (
            <span className="admin-tabs__count admin-tabs__count--alert">
              {pendingRequests.length}
            </span>
          )}
        </button>
        <button
          type="button"
          className={`admin-tabs__tab${tab === "archive" ? " admin-tabs__tab--active" : ""}`}
          onClick={() => setTab("archive")}
        >
          Archive <span className="admin-tabs__count">{archived.length}</span>
        </button>
      </div>

      {tab === "active" && (
        <ActiveTable
          rows={active}
          pendingByEmail={pendingByEmail}
          busyId={busyId}
          onUnsub={(id, requestId) =>
            requestId ? unsubBySubId(id, requestId) : setStatus(id, "unsubscribed")
          }
        />
      )}
      {tab === "requests" && (
        <RequestsTable
          rows={pendingRequests}
          subscribers={subscribers}
          busyId={busyId}
          onProcess={unsubBySubId}
          onDismiss={dismissRequest}
        />
      )}
      {tab === "archive" && (
        <ArchiveTable
          rows={archived}
          busyId={busyId}
          onResub={(id) => setStatus(id, "active")}
        />
      )}
    </div>
  );
}

/* ---------- Tables ----------------------------------------------------- */

function ActiveTable({
  rows,
  pendingByEmail,
  busyId,
  onUnsub,
}: {
  rows: SubscriberRow[];
  pendingByEmail: Map<string, UnsubRequestRow>;
  busyId: string | null;
  onUnsub: (id: string, requestId?: string) => void;
}) {
  if (rows.length === 0) {
    return <EmptyState label="No active subscribers." />;
  }
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th className="admin-table__th">Email</th>
          <th className="admin-table__th">Source</th>
          <th className="admin-table__th">Joined</th>
          <th className="admin-table__th">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const pending = pendingByEmail.get(s.email.toLowerCase());
          return (
            <tr
              key={s.id}
              className={`admin-table__row${pending ? " admin-table__row--flagged" : ""}`}
            >
              <td className="admin-table__td">
                <span className="admin-table__link">{s.email}</span>
                {pending && (
                  <span className="admin-flag admin-flag--alert" title={pending.reason || ""}>
                    Wants out
                  </span>
                )}
              </td>
              <td
                className="admin-table__td"
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "0.8rem",
                  color: "var(--text-tertiary)",
                }}
              >
                {s.source_page || "—"}
              </td>
              <td className="admin-table__td admin-table__td--date">
                {formatDate(s.created_at)}
              </td>
              <td className="admin-table__td">
                <button
                  type="button"
                  className={`admin-btn admin-btn--${pending ? "primary" : "secondary"}`}
                  disabled={busyId === s.id}
                  onClick={() => onUnsub(s.id, pending?.id)}
                >
                  {pending ? "Unsubscribe + archive" : "Unsubscribe"}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RequestsTable({
  rows,
  subscribers,
  busyId,
  onProcess,
  onDismiss,
}: {
  rows: UnsubRequestRow[];
  subscribers: SubscriberRow[];
  busyId: string | null;
  onProcess: (subscriberId: string, requestId: string) => void;
  onDismiss: (requestId: string) => void;
}) {
  if (rows.length === 0) {
    return <EmptyState label="No pending unsubscribe requests." />;
  }
  const subByEmail = new Map(subscribers.map((s) => [s.email.toLowerCase(), s]));

  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th className="admin-table__th">Email</th>
          <th className="admin-table__th">Reason</th>
          <th className="admin-table__th">Matched subscriber</th>
          <th className="admin-table__th">Requested</th>
          <th className="admin-table__th">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const match = subByEmail.get(r.email.toLowerCase());
          return (
            <tr key={r.id} className="admin-table__row">
              <td className="admin-table__td">
                <span className="admin-table__link">{r.email}</span>
              </td>
              <td className="admin-table__td admin-table__td--prose">
                {r.reason || <span className="admin-dash">—</span>}
              </td>
              <td className="admin-table__td">
                {match ? (
                  <span
                    className={`admin-status admin-status--${match.status === "active" ? "published" : "draft"}`}
                  >
                    {match.status}
                  </span>
                ) : (
                  <span className="admin-dash">no match</span>
                )}
              </td>
              <td className="admin-table__td admin-table__td--date">
                {formatDate(r.created_at)}
              </td>
              <td className="admin-table__td">
                <div className="admin-actions">
                  {match && match.status === "active" ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn--primary"
                      disabled={busyId === match.id || busyId === r.id}
                      onClick={() => onProcess(match.id, r.id)}
                    >
                      Unsubscribe + archive
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary"
                    disabled={busyId === r.id}
                    onClick={() => onDismiss(r.id)}
                  >
                    Dismiss
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ArchiveTable({
  rows,
  busyId,
  onResub,
}: {
  rows: SubscriberRow[];
  busyId: string | null;
  onResub: (id: string) => void;
}) {
  if (rows.length === 0) {
    return <EmptyState label="No archived subscribers." />;
  }
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th className="admin-table__th">Email</th>
          <th className="admin-table__th">Status</th>
          <th className="admin-table__th">Unsubscribed</th>
          <th className="admin-table__th">Joined</th>
          <th className="admin-table__th">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.id} className="admin-table__row">
            <td className="admin-table__td">
              <span className="admin-table__link">{s.email}</span>
            </td>
            <td className="admin-table__td">
              <span className="admin-status admin-status--draft">{s.status}</span>
            </td>
            <td className="admin-table__td admin-table__td--date">
              {s.unsubscribed_at ? formatDate(s.unsubscribed_at) : "—"}
            </td>
            <td className="admin-table__td admin-table__td--date">
              {formatDate(s.created_at)}
            </td>
            <td className="admin-table__td">
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                disabled={busyId === s.id}
                onClick={() => onResub(s.id)}
              >
                Resubscribe
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p
      style={{
        color: "var(--text-tertiary)",
        fontFamily: "var(--font-ui)",
        textAlign: "center",
        padding: "var(--space-xl)",
      }}
    >
      {label}
    </p>
  );
}
