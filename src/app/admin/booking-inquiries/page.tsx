import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-server";
import { roomTypeLabel, paPlanLabel } from "@/lib/booking-options";

export const dynamic = "force-dynamic";

interface BookingRow {
  id: string;
  name: string;
  email: string;
  location: string | null;
  room_type: string | null;
  pa_plan: string | null;
  dates: string | null;
  setlist: { title: string }[] | null;
  let_chad: boolean;
  status: string;
  created_at: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminBookingInquiriesPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("booking_inquiries")
    .select("id, name, email, location, room_type, pa_plan, dates, setlist, let_chad, status, created_at")
    .order("created_at", { ascending: false });
  const rows = (data || []) as BookingRow[];

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Booking inquiries ({rows.length})</h1>
      </div>

      {rows.length === 0 ? (
        <p>No booking inquiries yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__th">Received</th>
              <th className="admin-table__th">Name</th>
              <th className="admin-table__th">Email</th>
              <th className="admin-table__th">Location</th>
              <th className="admin-table__th">Room</th>
              <th className="admin-table__th">PA</th>
              <th className="admin-table__th">Dates</th>
              <th className="admin-table__th">Set</th>
              <th className="admin-table__th">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr className="admin-table__row" key={r.id}>
                <td className="admin-table__td">{fmtDate(r.created_at)}</td>
                <td className="admin-table__td">
                  <Link href={`/admin/booking-inquiries/${r.id}`} className="admin-table__link">
                    {r.name}
                  </Link>
                </td>
                <td className="admin-table__td">{r.email}</td>
                <td className="admin-table__td">{r.location || "-"}</td>
                <td className="admin-table__td">{roomTypeLabel(r.room_type) || "-"}</td>
                <td className="admin-table__td">{paPlanLabel(r.pa_plan) || "-"}</td>
                <td className="admin-table__td">{r.dates || "-"}</td>
                <td className="admin-table__td">
                  {r.let_chad ? "Chad's arc" : (r.setlist?.length ?? 0)}
                </td>
                <td className="admin-table__td">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
