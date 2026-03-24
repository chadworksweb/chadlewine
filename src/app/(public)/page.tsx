import { createPublicClient } from "@/lib/supabase-server";
import { CoverHero } from "@/components/CoverHero";
import { FeedEntry } from "@/components/FeedEntry";

export const revalidate = 60;

async function getObservations() {
  const supabase = createPublicClient();

  const { data: observations } = await supabase
    .from("observations")
    .select("id, title, slug, published_at, date_captured, art_image_path, art_alt, hook_line, status")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (!observations || observations.length === 0) return [];

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

export default async function HomePage() {
  const observations = await getObservations();
  const latest = observations[0];
  const feed = observations.slice(1);

  return (
    <div id="page-home" className="page-home">
      {latest && (
        <CoverHero
          title={latest.title}
          slug={latest.slug}
          dateCaptured={latest.published_at || latest.date_captured}
          domains={latest.domains}
          hookLine={latest.hook_line || ""}
          artImageUrl={latest.art_image_path || ""}
          artAlt={latest.art_alt || latest.title}
        />
      )}

      {feed.length > 0 && (
        <section id="archive" className="archive">
          <h2 className="archive__heading">
            Archive
          </h2>

          <div className="archive__feed">
            {feed.map((obs) => (
              <FeedEntry
                key={obs.slug}
                title={obs.title}
                slug={obs.slug}
                dateCaptured={obs.published_at || obs.date_captured}
                domains={obs.domains}
                hookLine={obs.hook_line || ""}
                artImageUrl={obs.art_image_path || ""}
                artAlt={obs.art_alt || obs.title}
              />
            ))}
          </div>
        </section>
      )}

      {observations.length === 0 && (
        <section className="empty-state">
          <p className="empty-state__message">No observations published yet.</p>
        </section>
      )}
    </div>
  );
}
