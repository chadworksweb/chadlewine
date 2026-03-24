import { createAdminClient } from "@/lib/supabase-server";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getSubscribers() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("subscribers")
    .select("id, email, source_page, status, created_at")
    .order("created_at", { ascending: false });
  return data || [];
}

export default async function AdminSubscribersPage() {
  const subscribers = await getSubscribers();
  const active = subscribers.filter((s) => s.status === "active").length;
  const unsubscribed = subscribers.filter((s) => s.status === "unsubscribed").length;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Subscribers</h1>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card">
          <span className="admin-stats__value">{subscribers.length}</span>
          <span className="admin-stats__label">Total</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{active}</span>
          <span className="admin-stats__label">Active</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{unsubscribed}</span>
          <span className="admin-stats__label">Unsubscribed</span>
        </div>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Email</th>
            <th className="admin-table__th">Source</th>
            <th className="admin-table__th">Status</th>
            <th className="admin-table__th">Date</th>
          </tr>
        </thead>
        <tbody>
          {subscribers.map((sub) => (
            <tr key={sub.id} className="admin-table__row">
              <td className="admin-table__td">
                <span className="admin-table__link">{sub.email}</span>
              </td>
              <td className="admin-table__td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                {sub.source_page || "—"}
              </td>
              <td className="admin-table__td">
                <span className={`admin-status admin-status--${sub.status === "active" ? "published" : "draft"}`}>
                  {sub.status}
                </span>
              </td>
              <td className="admin-table__td admin-table__td--date">
                {formatDate(sub.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {subscribers.length === 0 && (
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", textAlign: "center", padding: "var(--space-xl)" }}>
          No subscribers yet.
        </p>
      )}
    </div>
  );
}
