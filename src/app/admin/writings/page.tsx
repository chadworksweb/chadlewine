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

type Kind = "observation" | "journal";
type KindFilter = "all" | Kind;

async function getObservations(kind: KindFilter) {
  const supabase = createAdminClient();

  let query = supabase
    .from("posts")
    .select("id, title, slug, status, kind, date_captured, hook_line, tension_line, art_image_path")
    .order("date_captured", { ascending: false });

  if (kind !== "all") query = query.eq("kind", kind);

  const { data: observations } = await query;

  if (!observations || observations.length === 0) return [];

  const ids = observations.map((o) => o.id);

  // Fetch category assignments
  const { data: categoryLinks } = await supabase
    .from("post_categories")
    .select("post_id, category_id")
    .in("post_id", ids);

  const categoryIds = [...new Set(categoryLinks?.map((c) => c.category_id) || [])];
  const categoryTitleMap = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: categories } = await supabase
      .from("categories")
      .select("id, title")
      .in("id", categoryIds);
    categories?.forEach((c) => categoryTitleMap.set(c.id, c.title));
  }

  const obsCategoryMap = new Map<string, { id: string; title: string }[]>();
  categoryLinks?.forEach((link) => {
    const existing = obsCategoryMap.get(link.post_id) || [];
    const title = categoryTitleMap.get(link.category_id);
    if (title) existing.push({ id: link.category_id, title });
    obsCategoryMap.set(link.post_id, existing);
  });

  // Fetch thoughtline assignments
  const { data: thoughtlineLinks } = await supabase
    .from("post_thoughtlines")
    .select("post_id, thoughtline_id")
    .in("post_id", ids);

  const thoughtlineIds = [...new Set(thoughtlineLinks?.map((t) => t.thoughtline_id) || [])];
  const thoughtlineTitleMap = new Map<string, string>();
  if (thoughtlineIds.length > 0) {
    const { data: thoughtlines } = await supabase
      .from("thoughtlines")
      .select("id, title")
      .in("id", thoughtlineIds);
    thoughtlines?.forEach((t) => thoughtlineTitleMap.set(t.id, t.title));
  }

  const obsThoughtlineMap = new Map<string, { id: string; title: string }[]>();
  thoughtlineLinks?.forEach((link) => {
    const existing = obsThoughtlineMap.get(link.post_id) || [];
    const title = thoughtlineTitleMap.get(link.thoughtline_id);
    if (title) existing.push({ id: link.thoughtline_id, title });
    obsThoughtlineMap.set(link.post_id, existing);
  });

  // Fetch tag assignments
  const { data: tagLinks } = await supabase
    .from("post_tags")
    .select("post_id, tag_id")
    .in("post_id", ids);

  const tagIds = [...new Set(tagLinks?.map((t) => t.tag_id) || [])];
  const tagLabelMap = new Map<string, string>();
  if (tagIds.length > 0) {
    const { data: tags } = await supabase
      .from("tags")
      .select("id, label")
      .in("id", tagIds);
    tags?.forEach((t) => tagLabelMap.set(t.id, t.label));
  }

  const obsTagMap = new Map<string, { id: string; label: string }[]>();
  tagLinks?.forEach((link) => {
    const existing = obsTagMap.get(link.post_id) || [];
    const label = tagLabelMap.get(link.tag_id);
    if (label) existing.push({ id: link.tag_id, label });
    obsTagMap.set(link.post_id, existing);
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
  searchParams: Promise<{ status?: string; kind?: string }>;
}) {
  const { status: statusParam, kind: kindParam } = await searchParams;
  const activeTab: StatusTab =
    statusParam && statusParam in TAB_LABELS
      ? (statusParam as StatusTab)
      : "all";
  const activeKind: KindFilter =
    kindParam === "journal" || kindParam === "observation"
      ? (kindParam as Kind)
      : "all";

  const observations = await getObservations(activeKind);

  // Preserve the active kind across status-tab links + the New button.
  const kindQuery = `kind=${activeKind}`;
  const isAll = activeKind === "all";
  const isJournal = activeKind === "journal";
  const noun = isAll ? "Writings" : isJournal ? "Journal" : "Observations";
  // New entries default to "observation" on the master view; the kind is set in the editor.
  const newKind: Kind = isJournal ? "journal" : "observation";
  const newLabel = isJournal ? "New Entry" : isAll ? "New Post" : "New Observation";

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
        <h1 className="admin-page__title">{noun}</h1>
        <Link href={`/admin/writings/new?kind=${newKind}`} className="admin-btn admin-btn--primary">
          {newLabel}
        </Link>
      </div>

      <div className="admin-tabs">
        <Link
          href="/admin/writings"
          className={`admin-tabs__tab${isAll ? " admin-tabs__tab--active" : ""}`}
        >
          All
        </Link>
        <Link
          href="/admin/writings?kind=observation"
          className={`admin-tabs__tab${activeKind === "observation" ? " admin-tabs__tab--active" : ""}`}
        >
          Observations
        </Link>
        <Link
          href="/admin/writings?kind=journal"
          className={`admin-tabs__tab${isJournal ? " admin-tabs__tab--active" : ""}`}
        >
          Journal
        </Link>
      </div>

      <div className="admin-tabs">
        {(Object.keys(TAB_LABELS) as StatusTab[]).map((tab) => (
          <Link
            key={tab}
            href={tab === "all" ? `/admin/writings?${kindQuery}` : `/admin/writings?${kindQuery}&status=${tab}`}
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
            <th className="admin-table__th">Kind</th>
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
              <td className="admin-table__td admin-table__td--empty" colSpan={10}>
                No {isJournal ? "journal entries" : isAll ? "posts" : "observations"} found.
              </td>
            </tr>
          )}
          {filtered.map((obsv) => (
            <tr key={obsv.id} className="admin-table__row">
              <td className="admin-table__td">
                <Link
                  href={`/admin/writings/${obsv.slug || obsv.id}`}
                  className="admin-table__link"
                >
                  {obsv.title}
                </Link>
              </td>
              <td className="admin-table__td">
                <span className="admin-meta-chip">
                  {obsv.kind === "journal" ? "Journal" : "Observation"}
                </span>
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
