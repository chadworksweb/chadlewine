import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-server";
import { getDomainLabel, getDomainsAdmin } from "@/lib/domains";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getObservations() {
  const supabase = createAdminClient();

  const { data: observations } = await supabase
    .from("observations")
    .select("id, title, slug, status, date_captured, hook_line, tension_line, source")
    .order("date_captured", { ascending: false });

  if (!observations) return [];

  const ids = observations.map((o) => o.id);
  const { data: domains } = await supabase
    .from("observation_domains")
    .select("observation_id, domain_slug")
    .in("observation_id", ids);

  const domainMap = new Map<string, string[]>();
  domains?.forEach((d) => {
    const existing = domainMap.get(d.observation_id) || [];
    existing.push(d.domain_slug);
    domainMap.set(d.observation_id, existing);
  });

  return observations.map((o) => ({
    ...o,
    domains: domainMap.get(o.id) || [],
  }));
}

export default async function AdminObservationsPage() {
  const [observations, domainList] = await Promise.all([getObservations(), getDomainsAdmin()]);

  const published = observations.filter((o) => o.status === "published").length;
  const drafts = observations.filter((o) => o.status === "draft").length;
  const missingHook = observations.filter((o) => !o.hook_line).length;
  const missingTension = observations.filter((o) => !o.tension_line).length;
  const generalOnly = observations.filter(
    (o) => o.domains.length === 0 || (o.domains.length === 1 && o.domains[0] === "general")
  ).length;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Observations</h1>
        <Link href="/admin/observations/new" className="admin-btn admin-btn--primary">
          New Observation
        </Link>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card">
          <span className="admin-stats__value">{observations.length}</span>
          <span className="admin-stats__label">Total</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{published}</span>
          <span className="admin-stats__label">Published</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{drafts}</span>
          <span className="admin-stats__label">Drafts</span>
        </div>
        <div className="admin-stats__card admin-stats__card--warn">
          <span className="admin-stats__value">{missingHook}</span>
          <span className="admin-stats__label">No Hook</span>
        </div>
        <div className="admin-stats__card admin-stats__card--warn">
          <span className="admin-stats__value">{missingTension}</span>
          <span className="admin-stats__label">No Tension</span>
        </div>
        <div className="admin-stats__card admin-stats__card--warn">
          <span className="admin-stats__value">{generalOnly}</span>
          <span className="admin-stats__label">Untagged</span>
        </div>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Title</th>
            <th className="admin-table__th">Date</th>
            <th className="admin-table__th">Status</th>
            <th className="admin-table__th">Domains</th>
            <th className="admin-table__th">Hook</th>
            <th className="admin-table__th">Tension</th>
          </tr>
        </thead>
        <tbody>
          {observations.map((obs) => (
            <tr key={obs.id} className="admin-table__row">
              <td className="admin-table__td">
                <Link
                  href={`/admin/observations/${obs.id}`}
                  className="admin-table__link"
                >
                  {obs.title}
                </Link>
                {obs.source && obs.source !== "original" && (
                  <span className="admin-table__source">{obs.source}</span>
                )}
              </td>
              <td className="admin-table__td admin-table__td--date">
                {formatDate(obs.date_captured)}
              </td>
              <td className="admin-table__td">
                <span className={`admin-status admin-status--${obs.status}`}>
                  {obs.status}
                </span>
              </td>
              <td className="admin-table__td admin-table__td--domains">
                {obs.domains.map((d) => (
                  <span key={d} className="admin-domain-chip">
                    {getDomainLabel(d, domainList)}
                  </span>
                ))}
              </td>
              <td className="admin-table__td admin-table__td--indicator">
                <span className={`admin-dot ${obs.hook_line ? "admin-dot--green" : "admin-dot--red"}`} />
              </td>
              <td className="admin-table__td admin-table__td--indicator">
                <span className={`admin-dot ${obs.tension_line ? "admin-dot--green" : "admin-dot--red"}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
