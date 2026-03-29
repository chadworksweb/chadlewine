import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { CoverHero } from "@/components/CoverHero";
import { FeedEntry } from "@/components/FeedEntry";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Observations — Chad Lewine",
  description: "The full archive of Chad Lewine's Observations.",
  alternates: { canonical: "https://chadlewine.com/observations" },
};

async function getObservations() {
  const supabase = createPublicClient();

  const { data: observations } = await supabase
    .from("observations")
    .select("id, title, slug, date_captured, art_image_path, art_alt, hook_line, status")
    .eq("status", "published")
    .order("date_captured", { ascending: false });

  if (!observations || observations.length === 0) return [];

  return observations;
}

export default async function ObservationsArchivePage() {
  const observations = await getObservations();

  const latest = observations[0];
  const feed = observations.slice(1);

  return (
    <div id="page-observations" className="page-home">
      {latest && (
        <CoverHero
          title={latest.title}
          slug={latest.slug}
          dateCaptured={latest.date_captured}
          hookLine={latest.hook_line || ""}
          artImageUrl={latest.art_image_path || ""}
          artAlt={latest.art_alt || latest.title}
        />
      )}

      <div className="observations-archive">
        {feed.length > 0 && (
          <div className="archive__feed">
            {feed.map((obsv) => (
              <FeedEntry
                key={obsv.slug}
                title={obsv.title}
                slug={obsv.slug}
                dateCaptured={obsv.date_captured}
                hookLine={obsv.hook_line || ""}
                artImageUrl={obsv.art_image_path || ""}
                artAlt={obsv.art_alt || obsv.title}
              />
            ))}
          </div>
        )}
      </div>

      {observations.length === 0 && (
        <section className="empty-state">
          <p className="empty-state__message">No observations published yet.</p>
        </section>
      )}
    </div>
  );
}
