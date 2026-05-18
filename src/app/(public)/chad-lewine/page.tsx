import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { ArcRadiant, type ArcInitialData } from "@/components/ArcRadiant";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Who Is Chad Lewine",
  description:
    "The canonical biographical page for Chad Lewine — architect of Libra Engine, cross-domain observer, super individual.",
  alternates: {
    canonical: "https://chadlewine.com/chad-lewine",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/chad-lewine", DEFAULT_METADATA);
}

async function getArcData(): Promise<ArcInitialData> {
  const supabase = createPublicClient();

  const [songsRes, albumsRes, erasRes, lifeEventsRes] = await Promise.all([
    supabase
      .from("songs")
      .select("id, slug, title, release_date, write_date, song_state, status, instrumental, rc_charge, rc_tier")
      .in("status", ["published", "unreleased"]),
    supabase
      .from("releases")
      .select("id, slug, title, release_date")
      .in("status", ["published", "draft"]),
    supabase
      .from("eras")
      .select("id, slug, title, kind, date_start, date_end")
      .eq("status", "published"),
    supabase
      .from("life_events")
      .select("id, slug, title, date_start, date_end, body_html")
      .eq("status", "published"),
  ]);

  const songs = (songsRes.data ?? []) as ArcInitialData["songs"];
  const albums = (albumsRes.data ?? []) as ArcInitialData["albums"];
  const eras = (erasRes.data ?? []) as ArcInitialData["eras"];
  const lifeEvents = (lifeEventsRes.data ?? []) as ArcInitialData["lifeEvents"];

  const dateYears: number[] = [];
  for (const s of songs) {
    const d = s.release_date ?? s.write_date;
    if (d) dateYears.push(parseInt(d.slice(0, 4), 10));
  }
  for (const a of albums) {
    if (a.release_date) dateYears.push(parseInt(a.release_date.slice(0, 4), 10));
  }
  for (const e of eras) {
    if (e.date_start) dateYears.push(parseInt(e.date_start.slice(0, 4), 10));
    if (e.date_end) dateYears.push(parseInt(e.date_end.slice(0, 4), 10));
  }
  for (const ev of lifeEvents) {
    if (ev.date_start) dateYears.push(parseInt(ev.date_start.slice(0, 4), 10));
  }

  const currentYear = new Date().getFullYear();
  const yearStart = dateYears.length ? Math.min(...dateYears) : 1989;
  const yearEnd = Math.max(currentYear, dateYears.length ? Math.max(...dateYears) : currentYear);

  return { songs, albums, eras, lifeEvents, yearRange: [yearStart, yearEnd] };
}

export default async function WhoPage() {
  const data = await getArcData();

  return (
    <article id="page-who" className="page-who">
      <ArcRadiant data={data} />
    </article>
  );
}
