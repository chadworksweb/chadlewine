import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-server";
import { inquiryInterestLabel } from "@/lib/inquiry-interests";

export const dynamic = "force-dynamic";

const BUCKET = "inquiry-files";

interface InquiryFile {
  name: string;
  type: string;
  size: number;
  path: string;
}
interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  interest: string | null;
  files: InquiryFile[] | null;
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
function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function AdminInquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase.from("inquiries").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const inq = data as Inquiry;

  const files = inq.files || [];
  const signed = await Promise.all(
    files.map(async (f) => {
      const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 60 * 60);
      return { ...f, url: s?.signedUrl || null };
    }),
  );

  const meta: Array<[string, React.ReactNode]> = [
    ["Received", fmtDate(inq.created_at)],
    ["Email", <a key="e" className="admin-table__link" href={`mailto:${inq.email}`}>{inq.email}</a>],
    ["Phone", inq.phone || "-"],
    ["Location", inq.location || "-"],
    ["Inquiring about", inquiryInterestLabel(inq.interest) || "-"],
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
        <Link href="/admin/inquiries" className="admin-table__link">&larr; All inquiries</Link>
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
        Files ({signed.length})
      </h2>
      {signed.length === 0 ? (
        <p>No files attached.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__th">File</th>
              <th className="admin-table__th">Type</th>
              <th className="admin-table__th">Size</th>
              <th className="admin-table__th">Download</th>
            </tr>
          </thead>
          <tbody>
            {signed.map((f, i) => (
              <tr className="admin-table__row" key={i}>
                <td className="admin-table__td">{f.name}</td>
                <td className="admin-table__td">{f.type || "-"}</td>
                <td className="admin-table__td">{fmtSize(f.size)}</td>
                <td className="admin-table__td">
                  {f.url ? (
                    <a className="admin-table__link" href={f.url} target="_blank" rel="noopener noreferrer">
                      Download
                    </a>
                  ) : (
                    "unavailable"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
