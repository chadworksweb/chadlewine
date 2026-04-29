import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-server";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type StatusTab = "all" | "published" | "draft" | "private" | "trash";

const TAB_LABELS: Record<StatusTab, string> = {
  all: "All",
  published: "Published",
  draft: "Drafts",
  private: "Private",
  trash: "Trash",
};

async function getObservations() {
  const supabase = createAdminClient();

  const { data: observations } = await supabase
    .from("observations")
    .select("id, title, slug, status, date_captured, hook_line, tension_line, art_image_path")
    .order("date_captured", { ascending: false });

  if (!observations || observations.length === 0) return [];

  const ids = observations.map((o) => o.id);

  // Fetch category assignments
  const { data: categoryLinks } = await supabase
    .from("observation_categories")
    .select("observation_id, category_id")
    .in("observation_id", ids);

  const categoryIds = [...new Set(categoryLinks?.map((c) => c.category_id) || [])];
  let categoryTitleMap = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: categories } = await supabase
      .from("categories")
      .select("id, title")
      .in("id", categoryIds);
    categories?.forEach((c) => categoryTitleMap.set(c.id, c.title));
  }

  const obsCategoryMap = new Map<string, { id: string; title: string }[]>();
  categoryLinks?.forEach((link) => {
    const existing = obsCategoryMap.get(link.observation_id) || [];
    const title = categoryTitleMap.get(link.category_id);
    if (title) existing.push({ id: link.category_id, title });
    obsCategoryMap.set(link.observation_id, existing);
  });

  // Fetch thoughtline assignments
  const { data: thoughtlineLinks } = await supabase
    .from("observation_thoughtlines")
    .select("observation_id, thoughtline_id")
    .in("observation_id", ids);

  const thoughtlineIds = [...new Set(thoughtlineLinks?.map((t) => t.thoughtline_id) || [])];
  let thoughtlineTitleMap = new Map<string, string>();
  if (thoughtlineIds.length > 0) {
    const { data: thoughtlines } = await supabase
      .from("thoughtlines")
      .select("id, title")
      .in("id", thoughtlineIds);
    thoughtlines?.forEach((t) => thoughtlineTitleMap.set(t.id, t.title));
  }

  const obsThoughtlineMap = new Map<string, { id: string; title: string }[]>();
  thoughtlineLinks?.forEach((link) => {
    const existing = obsThoughtlineMap.get(link.observation_id) || [];
    const title = thoughtlineTitleMap.get(link.thoughtline_id);
    if (title) existing.push({ id: link.thoughtline_id, title });
    obsThoughtlineMap.set(link.observation_id, existing);
  });

  // Fetch tag assignments
  const { data: tagLinks } = await supabase
    .from("observation_tags")
    .select("observation_id, tag_id")
    .in("observation_id", ids);

  const tagIds = [...new Set(tagLinks?.map((t) => t.tag_id) || [])];
  let tagLabelMap = new Map<string, string>();
  if (tagIds.length > 0) {
    const { data: tags } = await supabase
      .from("tags")
      .select("id, label")
      .in("id", tagIds);
    tags?.forEach((t) => tagLabelMap.set(t.id, t.label));
  }

  const obsTagMap = new Map<string, { id: string; label: string }[]>();
  tagLinks?.forEach((link) => {
    const existing = obsTagMap.get(link.observation_id) || [];
    const label = tagLabelMap.get(link.tag_id);
    if (label) existing.push({ id: link.tag_id, label });
    obsTagMap.set(link.observation_id, existing);
  });

  return observations.map((o) => ({
    ...o,
    categories: obsCategoryMap.get(o.id) || [],
    thoughtlines: obsThoughtlineMap.get(o.id) || [],
    tags: obsTagMap.get(o.id) || [],
  }));
}

export default async function AdminObservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const activeTab: StatusTab =
    statusParam && statusParam in TAB_LABELS
      ? (statusParam as StatusTab)
      : "all";

  const observations = await getObservations();

  const counts: Record<StatusTab, number> = {
    all: observations.filter((o) => o.status !== "trash").length,
    published: observations.filter((o) => o.status === "published").length,
    draft: observations.filter((o) => o.status === "draft").length,
    private: observations.filter((o) => o.status === "private").length,
    trash: observations.filter((o) => o.status === "trash").length,
  };

  const filtered =
    activeTab === "all"
      ? observations.filter((o) => o.status !== "trash")
      : observations.filter((o) => o.status === activeTab);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Observations</h1>
        <Link href="/admin/observations/new" className="admin-btn admin-btn--primary">
          New Observation
        </Link>
      </div>

      <div className="admin-tabs">
        {(Object.keys(TAB_LABELS) as StatusTab[]).map((tab) => (
          <Link
            key={tab}
            href={tab === "all" ? "/admin/observations" : `/admin/observations?status=${tab}`}
            className={`admin-tabs__tab${activeTab === tab ? " admin-tabs__tab--active" : ""}`}
          >
            {TAB_LABELS[tab]}
            <span className="admin-tabs__count">({counts[tab]})</span>
          </Link>
        ))}
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Title</th>
            <th className="admin-table__th">Date</th>
            <th className="admin-table__th">Status</th>
            <th className="admin-table__th">Categories</th>
            <th className="admin-table__th">Thoughtlines</th>
            <th className="admin-table__th">Tags</th>
            <th className="admin-table__th">Art</th>
            <th className="admin-table__th">Hook</th>
            <th className="admin-table__th">Tension</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td className="admin-table__td admin-table__td--empty" colSpan={9}>
                No observations found.
              </td>
            </tr>
          )}
          {filtered.map((obsv) => (
            <tr key={obsv.id} className="admin-table__row">
              <td className="admin-table__td">
                <Link
                  href={`/admin/observations/${obsv.slug || obsv.id}`}
                  className="admin-table__link"
                >
                  {obsv.title}
                </Link>
              </td>
              <td className="admin-table__td admin-table__td--date">
                {formatDate(obsv.date_captured)}
              </td>
              <td className="admin-table__td">
                <span className={`admin-status admin-status--${obsv.status}`}>
                  {obsv.status}
                </span>
              </td>
              <td className="admin-table__td admin-table__td--meta">
                {obsv.categories.map((c) => (
                  <span key={c.id} className="admin-meta-chip">
                    {c.title}
                  </span>
                ))}
              </td>
              <td className="admin-table__td admin-table__td--meta">
                {obsv.thoughtlines.map((t) => (
                  <span key={t.id} className="admin-meta-chip">
                    {t.title}
                  </span>
                ))}
              </td>
              <td className="admin-table__td admin-table__td--meta">
                {obsv.tags.map((t) => (
                  <span key={t.id} className="admin-meta-chip">
                    {t.label}
                  </span>
                ))}
              </td>
              <td className="admin-table__td admin-table__td--indicator">
                <span className={obsv.art_image_path ? "admin-check" : "admin-dash"}>
                  {obsv.art_image_path ? "\u2713" : "\u2014"}
                </span>
              </td>
              <td className="admin-table__td admin-table__td--indicator">
                <span className={obsv.hook_line ? "admin-check" : "admin-dash"}>
                  {obsv.hook_line ? "\u2713" : "\u2014"}
                </span>
              </td>
              <td className="admin-table__td admin-table__td--indicator">
                <span className={obsv.tension_line ? "admin-check" : "admin-dash"}>
                  {obsv.tension_line ? "\u2713" : "\u2014"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
