import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface InquiryRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  files: { name: string }[] | null;
  status: string;
  created_at: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminInquiriesPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("inquiries")
    .select("id, name, email, phone, location, files, status, created_at")
    .order("created_at", { ascending: false });
  const rows = (data || []) as InquiryRow[];

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Inquiries ({rows.length})</h1>
      </div>

      {rows.length === 0 ? (
        <p>No inquiries yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__th">Received</th>
              <th className="admin-table__th">Name</th>
              <th className="admin-table__th">Email</th>
              <th className="admin-table__th">Phone</th>
              <th className="admin-table__th">Location</th>
              <th className="admin-table__th">Files</th>
              <th className="admin-table__th">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr className="admin-table__row" key={r.id}>
                <td className="admin-table__td">{fmtDate(r.created_at)}</td>
                <td className="admin-table__td">
                  <Link href={`/admin/inquiries/${r.id}`} className="admin-table__link">
                    {r.name}
                  </Link>
                </td>
                <td className="admin-table__td">{r.email}</td>
                <td className="admin-table__td">{r.phone || "-"}</td>
                <td className="admin-table__td">{r.location || "-"}</td>
                <td className="admin-table__td">{r.files?.length ?? 0}</td>
                <td className="admin-table__td">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
