import type { Metadata } from "next";
import Link from "next/link";
import { createPublicClient } from "@/lib/supabase-server";
import { formatDate } from "@/lib/utils";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Meditations — Chad Lewine",
  description: "Short form real time verbatim channelings",
  alternates: { canonical: "https://chadlewine.com/meditations" },
  openGraph: {
    title: "Meditations — Chad Lewine",
    description: "Short form real time verbatim channelings",
    url: "https://chadlewine.com/meditations",
    type: "website",
  },
};

async function getMeditations() {
  const supabase = createPublicClient();

  const { data: meditations } = await supabase
    .from("meditations")
    .select("id, body, plain_text, published_at, created_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (!meditations || meditations.length === 0) return [];

  const ids = meditations.map((m) => m.id);

  const { data: categoryLinks } = await supabase
    .from("meditation_categories")
    .select("meditation_id, category_id, categories(title, slug)")
    .in("meditation_id", ids);

  const medCatMap = new Map<string, { title: string; slug: string }[]>();
  categoryLinks?.forEach((link) => {
    const existing = medCatMap.get(link.meditation_id) || [];
    const cat = (link as Record<string, unknown>).categories as { title: string; slug: string };
    if (cat) existing.push(cat);
    medCatMap.set(link.meditation_id, existing);
  });

  const { data: tagLinks } = await supabase
    .from("meditation_tags")
    .select("meditation_id, tag_id, tags(label, slug)")
    .in("meditation_id", ids);

  const medTagMap = new Map<string, { label: string; slug: string }[]>();
  tagLinks?.forEach((link) => {
    const existing = medTagMap.get(link.meditation_id) || [];
    const tag = (link as Record<string, unknown>).tags as { label: string; slug: string };
    if (tag) existing.push(tag);
    medTagMap.set(link.meditation_id, existing);
  });

  return meditations.map((m) => ({
    ...m,
    categories: medCatMap.get(m.id) || [],
    tags: medTagMap.get(m.id) || [],
  }));
}

async function getHeroImage() {
  const supabase = createPublicClient();
  const { data } = await supabase.storage
    .from("observation-images")
    .getPublicUrl("page-heroes/meditations.webp");
  return data?.publicUrl || "";
}

export default async function MeditationsPage() {
  const [meditations, heroImage] = await Promise.all([
    getMeditations(),
    getHeroImage(),
  ]);

  const latest = meditations[0];
  const feed = meditations.slice(1);

  return (
    <div className="page-meditations">
      {/* Cover Hero — static art, swappable via Supabase Storage */}
      <section className="cover-hero">
        {heroImage && (
          <div className="cover-hero__art-wrap">
            <img
              src={heroImage}
              alt="Meditations"
              className="cover-hero__art"
            />
          </div>
        )}

        <div className="cover-hero__content">
          <div className="cover-hero__title-col">
            <h1 className="cover-hero__title">
              Meditations
            </h1>
          </div>

          <div className="cover-hero__bar">
            <span className="cover-hero__date">
              {meditations.length} meditation{meditations.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </section>

      {/* Feed — inverted (light) reading scheme */}
      {meditations.length > 0 && (
        <section className="meditation-archive">
          <div className="meditation-archive__layout">
            {/* Feed — left column */}
            <div className="meditation-feed">
              {meditations.map((med) => (
                <Link
                  key={med.id}
                  href={`/meditations/${med.id}`}
                  className="meditation-entry"
                >
                  <div className="meditation-entry__content">
                    <time className="meditation-entry__date">
                      {new Date(med.published_at || med.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      <span style={{ display: "inline-block", width: "2em" }} />
                      {new Date(med.published_at || med.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
                    </time>
                    <div
                      className="meditation-entry__body"
                      dangerouslySetInnerHTML={{ __html: med.body }}
                    />
                    {(med.categories.length > 0 || med.tags.length > 0) && (
                      <div className="meditation-entry__meta">
                        {med.categories.map((c) => (
                          <span key={c.slug} className="meditation-card__category">{c.title}</span>
                        ))}
                        {med.tags.map((t) => (
                          <span key={t.slug} className="meditation-card__tag">#{t.label}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            {/* Sidebar — right column, timeline + filters */}
            <aside className="meditation-sidebar">
              <div className="meditation-sidebar__section">
                <h3 className="meditation-sidebar__heading">Timeline</h3>
                <nav className="meditation-sidebar__timeline">
                  {(() => {
                    const months = new Map<string, number>();
                    meditations.forEach((m) => {
                      const d = new Date(m.published_at || m.created_at);
                      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                      if (!months.has(key)) months.set(key, 0);
                      months.set(key, months.get(key)! + 1);
                    });
                    return Array.from(months.entries()).map(([key, count]) => {
                      const [year, month] = key.split("-");
                      const label = new Date(+year, +month - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
                      return (
                        <span key={key} className="meditation-sidebar__month">
                          {label} <span className="meditation-sidebar__count">{count}</span>
                        </span>
                      );
                    });
                  })()}
                </nav>
              </div>

              {(() => {
                const allCats = new Map<string, string>();
                const allTags = new Map<string, string>();
                meditations.forEach((m) => {
                  m.categories.forEach((c) => allCats.set(c.slug, c.title));
                  m.tags.forEach((t) => allTags.set(t.slug, t.label));
                });
                return (
                  <>
                    {allCats.size > 0 && (
                      <div className="meditation-sidebar__section">
                        <h3 className="meditation-sidebar__heading">Categories</h3>
                        <div className="meditation-sidebar__filters">
                          {Array.from(allCats.entries()).map(([slug, title]) => (
                            <span key={slug} className="meditation-sidebar__filter">{title}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {allTags.size > 0 && (
                      <div className="meditation-sidebar__section">
                        <h3 className="meditation-sidebar__heading">Tags</h3>
                        <div className="meditation-sidebar__filters">
                          {Array.from(allTags.entries()).map(([slug, label]) => (
                            <span key={slug} className="meditation-sidebar__filter">#{label}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </aside>
          </div>
        </section>
      )}

      {meditations.length === 0 && (
        <section className="empty-state">
          <p className="empty-state__message">No meditations published yet.</p>
        </section>
      )}
    </div>
  );
}
