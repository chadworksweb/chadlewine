import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-server";
import { formatAuditCents } from "@/lib/audit-rate";

export const dynamic = "force-dynamic";

interface AuditRow {
  id: string;
  name: string | null;
  email: string;
  status: string;
  scheduled_at: string | null;
  billed_minutes: number | null;
  hold_cents: number;
  balance_cents: number | null;
  launch_discount: boolean;
  stripe_payment_method_id: string | null;
  created_at: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AdminAuditSessionsPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("audit_sessions")
    .select(
      "id, name, email, status, scheduled_at, billed_minutes, hold_cents, balance_cents, launch_discount, stripe_payment_method_id, created_at"
    )
    .order("created_at", { ascending: false });

  const rows = (data as AuditRow[] | null) || [];

  return (
    <div className="admin-page">
      <h1>Sovereignty Audits</h1>
      <p className="admin-page__sub">
        {rows.length} {rows.length === 1 ? "session" : "sessions"}. The balance
        auto-charges when you stop the clock.
      </p>

      {rows.length === 0 ? (
        <p>No sessions held yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Held</th>
              <th>Who</th>
              <th>Status</th>
              <th>Scheduled</th>
              <th>Min</th>
              <th>Balance</th>
              <th>Card</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.created_at)}</td>
                <td>
                  {r.name || "--"}
                  <br />
                  <span className="admin-table__dim">{r.email}</span>
                </td>
                <td>
                  {r.status}
                  {r.launch_discount && (
                    <span className="admin-table__dim"> (launch)</span>
                  )}
                </td>
                <td>{fmtDate(r.scheduled_at)}</td>
                <td>{r.billed_minutes ?? "--"}</td>
                <td>
                  {r.balance_cents === null
                    ? "--"
                    : formatAuditCents(r.balance_cents)}
                </td>
                <td>{r.stripe_payment_method_id ? "saved" : "NONE"}</td>
                <td>
                  <Link href={`/admin/audit-sessions/${r.id}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
