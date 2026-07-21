import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-server";
import { AuditSessionConsole } from "@/components/AuditSessionConsole";
import { formatAuditCents } from "@/lib/audit-rate";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AdminAuditSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("audit_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!row) notFound();

  return (
    <div className="admin-page">
      <p>
        <Link href="/admin/audit-sessions">Back to audits</Link>
      </p>

      <h1>{row.name || row.email}</h1>
      <p className="admin-page__sub">{row.email}</p>

      <AuditSessionConsole
        id={row.id}
        status={row.status}
        startedAt={row.started_at}
        launchDiscount={row.launch_discount}
        holdCents={row.hold_cents}
        hasSavedCard={!!row.stripe_payment_method_id}
      />

      <h2>Session</h2>
      <table className="admin-table">
        <tbody>
          <tr>
            <th>Status</th>
            <td>{row.status}</td>
          </tr>
          <tr>
            <th>Held</th>
            <td>{fmtDate(row.created_at)}</td>
          </tr>
          <tr>
            <th>Scheduled</th>
            <td>{fmtDate(row.scheduled_at)}</td>
          </tr>
          <tr>
            <th>Started</th>
            <td>{fmtDate(row.started_at)}</td>
          </tr>
          <tr>
            <th>Ended</th>
            <td>{fmtDate(row.ended_at)}</td>
          </tr>
          <tr>
            <th>Billed minutes</th>
            <td>{row.billed_minutes ?? "--"}</td>
          </tr>
          <tr>
            <th>Locus</th>
            <td>{row.primary_locus || "--"}</td>
          </tr>
        </tbody>
      </table>

      <h2>Money</h2>
      <table className="admin-table">
        <tbody>
          <tr>
            <th>Rate</th>
            <td>
              {formatAuditCents(row.rate_cents_per_min)}/min
              {row.launch_discount &&
                ` -- launch 50% off -> $${(row.rate_cents_per_min / 200).toString()}/min effective`}
            </td>
          </tr>
          <tr>
            <th>Hold</th>
            <td>{formatAuditCents(row.hold_cents)}</td>
          </tr>
          <tr>
            <th>Total</th>
            <td>
              {row.total_cents === null ? "--" : formatAuditCents(row.total_cents)}
            </td>
          </tr>
          <tr>
            <th>Balance</th>
            <td>
              {row.balance_cents === null
                ? "--"
                : formatAuditCents(row.balance_cents)}
            </td>
          </tr>
          <tr>
            <th>Saved card</th>
            <td>{row.stripe_payment_method_id ? "yes" : "NONE -- invoice only"}</td>
          </tr>
          {row.balance_due_at && (
            <tr>
              <th>Balance due</th>
              <td>{fmtDate(row.balance_due_at)}</td>
            </tr>
          )}
          {row.settle_error && (
            <tr>
              <th>Settle error</th>
              <td>{row.settle_error}</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Agreement</h2>
      <table className="admin-table">
        <tbody>
          <tr>
            <th>Accepted</th>
            <td>{fmtDate(row.agreement_accepted_at)}</td>
          </tr>
          <tr>
            <th>Version</th>
            <td>{row.agreement_version || "--"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
