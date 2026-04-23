import type { Metadata } from "next";
import Link from "next/link";
import { createPublicClient } from "@/lib/supabase-server";
import { focalCropStyle } from "@/lib/focal-crop";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Murals — Chad Lewine",
  description: "Large-format murals by Chad Lewine — locations, neighborhoods, and stories.",
  alternates: { canonical: "https://chadlewine.com/art/murals" },
};

type MuralListRow = {
  id: string;
  slug: string;
  title: string;
  image_path: string;
  image_alt: string | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
  art_summary: string | null;
  mural_details: {
    venue_name: string | null;
    neighborhood: string | null;
    city: string | null;
    completion_date: string | null;
    public_topics: string[] | null;
  } | null;
};

async function getMurals(topicFilter: string | null) {
  const supabase = createPublicClient();
  const { data: format } = await supabase.from("art_formats").select("id").eq("slug", "mural").maybeSingle();
  if (!format?.id) return [];

  const { data } = await supabase
    .from("art_pieces")
    .select("id, slug, title, image_path, image_alt, card_focal_x, card_focal_y, card_zoom, art_summary, mural_details(venue_name, neighborhood, city, completion_date, public_topics)")
    .eq("format_id", format.id)
    .in("status", ["unreleased", "published"]);

  const rows = ((data as unknown as MuralListRow[] | null) || []).map((r) => ({
    ...r,
    mural_details: Array.isArray(r.mural_details) ? r.mural_details[0] || null : r.mural_details,
  }));

  if (!topicFilter) return rows;
  const t = topicFilter.toLowerCase();
  return rows.filter((r) => (r.mural_details?.public_topics || []).some((topic: string) => topic.toLowerCase() === t));
}

function subtitle(md: MuralListRow["mural_details"]): string | null {
  if (!md) return null;
  const parts: string[] = [];
  if (md.venue_name) parts.push(md.venue_name);
  if (md.neighborhood) parts.push(md.neighborhood);
  else if (md.city) parts.push(md.city);
  const year = md.completion_date ? /^(\d{4})/.exec(md.completion_date)?.[1] : null;
  const head = parts.join(", ");
  if (head && year) return `${head} — ${year}`;
  return head || year || null;
}

export default async function MuralsIndexPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const topicFilter = (topic || "").trim() || null;
  const murals = await getMurals(topicFilter);

  return (
    <div className="murals-index site-contain">
      <header className="murals-index__header">
        <h1 className="murals-index__title">Murals</h1>
        {topicFilter ? (
          <p className="murals-index__sub">
            Filtered by <strong>{topicFilter}</strong> — <Link href="/art/murals">clear</Link>
          </p>
        ) : (
          <p className="murals-index__sub">Large-format work, placed in public and private spaces.</p>
        )}
      </header>

      {murals.length === 0 ? (
        <p className="murals-index__empty">No murals{topicFilter ? ` matching "${topicFilter}"` : ""} yet.</p>
      ) : (
        <ul className="murals-index__grid">
          {murals.map((m) => {
            const sub = subtitle(m.mural_details);
            return (
              <li key={m.id} className="murals-index__card">
                <Link href={`/art/${m.slug}`}>
                  <img
                    src={m.image_path}
                    alt={m.image_alt || m.title}
                    className="murals-index__img"
                    style={focalCropStyle(m.card_focal_x, m.card_focal_y, m.card_zoom)}
                  />
                  <div className="murals-index__body">
                    <h2 className="murals-index__card-title">{m.title}</h2>
                    {sub && <p className="murals-index__card-sub">{sub}</p>}
                    {m.art_summary && <p className="murals-index__card-summary">{m.art_summary}</p>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
