import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-server";
import { roomTypeLabel, exchangeLabel, paPlanLabel } from "@/lib/booking-options";

export const dynamic = "force-dynamic";

interface BookingInquiry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  space_name: string | null;
  location: string | null;
  room_type: string | null;
  pa_plan: string | null;
  has_projector: boolean | null;
  has_screen: boolean | null;
  capacity: string | null;
  dates: string | null;
  exchange: string | null;
  setlist: { id?: string; title: string }[] | null;
  covers: string[] | null;
  let_chad: boolean;
  message: string | null;
  ip: string | null;
  user_agent: string | null;
  referer: string | null;
  source: string;
  status: string;
  created_at: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });
}

export default async function AdminBookingInquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase.from("booking_inquiries").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const inq = data as BookingInquiry;

  const setlist = inq.setlist || [];

  const meta: Array<[string, React.ReactNode]> = [
    ["Received", fmtDate(inq.created_at)],
    ["Email", <a key="e" className="admin-table__link" href={`mailto:${inq.email}`}>{inq.email}</a>],
    ["Phone", inq.phone || "-"],
    ["Space", inq.space_name || "-"],
    ["Location", inq.location || "-"],
    ["Room type", roomTypeLabel(inq.room_type) || "-"],
    ["PA", paPlanLabel(inq.pa_plan) || "-"],
    [
      "Projection",
      inq.has_projector
        ? inq.has_screen
          ? "Projector + screen"
          : "Projector, no screen"
        : inq.has_screen
          ? "Screen, no projector"
          : inq.has_projector === false
            ? "No projection"
            : "-",
    ],
    ["Capacity", inq.capacity || "-"],
    ["Possible dates", inq.dates || "-"],
    ["Exchange", exchangeLabel(inq.exchange) || "-"],
    ["Status", inq.status],
    ["Source", inq.source],
    ["IP", inq.ip || "-"],
    ["Referer", inq.referer || "-"],
    ["User agent", inq.user_agent || "-"],
  ];

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">{inq.name}</h1>
      </div>
      <p style={{ marginBottom: "var(--space-lg)" }}>
        <Link href="/admin/booking-inquiries" className="admin-table__link">&larr; All booking inquiries</Link>
      </p>

      <table className="admin-table" style={{ marginBottom: "var(--space-xl)" }}>
        <tbody>
          {meta.map(([label, value]) => (
            <tr className="admin-table__row" key={label}>
              <td className="admin-table__td" style={{ width: "180px", fontWeight: 600 }}>{label}</td>
              <td className="admin-table__td">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="admin-page__title" style={{ fontSize: "1.1rem" }}>
        Suggested set{inq.let_chad ? "" : ` (${setlist.length})`}
      </h2>
      {inq.let_chad ? (
        <p>Host asked Chad to pick the setlist for their room.</p>
      ) : setlist.length === 0 ? (
        <p>No songs suggested.</p>
      ) : (
        <ol style={{ paddingLeft: "1.25rem", lineHeight: 1.8 }}>
          {setlist.map((s, i) => (
            <li key={s.id || i}>{s.title}</li>
          ))}
        </ol>
      )}

      {(inq.covers?.length ?? 0) > 0 && (
        <>
          <h2 className="admin-page__title" style={{ fontSize: "1.1rem", marginTop: "var(--space-xl)" }}>
            Covers ({inq.covers!.length})
          </h2>
          <ul style={{ paddingLeft: "1.25rem", lineHeight: 1.8 }}>
            {inq.covers!.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </>
      )}

      {inq.message && (
        <>
          <h2 className="admin-page__title" style={{ fontSize: "1.1rem", marginTop: "var(--space-xl)" }}>
            Anything else
          </h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{inq.message}</p>
        </>
      )}
    </div>
  );
}
