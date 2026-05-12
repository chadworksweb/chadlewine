import Link from "next/link";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase-server";
import { CoverHero } from "@/components/CoverHero";
import { FeedEntry } from "@/components/FeedEntry";

export const revalidate = 60;

export const metadata = {
  title: "Home Preview",
  robots: { index: false, follow: false },
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

async function getMeditations() {
  const supabase = createPublicClient();

  const { data: meditations } = await supabase
    .from("meditations")
    .select("id, subtitle, body, plain_text, published_at, created_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(10);

  return meditations || [];
}

export default async function HomePreviewPage() {
  // Local-only sandbox. Block on any Vercel environment (preview + production + staging).
  if (process.env.VERCEL) notFound();

  const [observations, meditations] = await Promise.all([
    getObservations(),
    getMeditations(),
  ]);

  const latest = observations[0];
  const feed = observations.slice(1);

  return (
    <div id="page-home" className="page-home">
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

      <div className="home-split">
        <section className="home-split__observations">
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
        </section>

        {meditations.length > 0 && (
          <aside className="home-split__meditations">
            <h2 className="home-split__meditations-heading">Meditations</h2>
            <div className="home-split__sidebar-feed">
              {meditations.map((med) => (
                <Link
                  key={med.id}
                  href={`/meditations/${med.id}`}
                  className="home-sidebar-row"
                >
                  <span className="home-sidebar-row__label">{med.subtitle || "new meditation"}</span>
                  <span className="home-sidebar-row__date">{new Date(med.published_at || med.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}</span>
                </Link>
              ))}
            </div>
            <Link href="/meditations" className="home-split__sidebar-more">
              All Meditations
            </Link>
          </aside>
        )}
      </div>

      {observations.length === 0 && meditations.length === 0 && (
        <section className="empty-state">
          <p className="empty-state__message">No observations published yet.</p>
        </section>
      )}
    </div>
  );
}
