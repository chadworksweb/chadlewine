import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { ArcRadiant, type ArcInitialData } from "@/components/ArcRadiant";
import { RadiantArcHeader } from "@/components/RadiantArcHeader";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Radiant Arc",
  description:
    "An interactive timeline of Chad Lewine's life, music, and the Compass charge of his songs from 1989 to today.",
  alternates: {
    canonical: "https://chadlewine.com/radiant-arc",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/radiant-arc", DEFAULT_METADATA);
}

// Rising Compass tier bands, keyed by charge_value (-100..+100). Mirrors
// backend TIER_RANGES in rising-compass calibrator.py so the arc's per-release
// colors match RC exactly.
function tierForCharge(charge: number): string {
  if (charge >= 75) return "violet";
  if (charge >= 25) return "blue";
  if (charge >= -24) return "green";
  if (charge >= -74) return "orange";
  return "red";
}

async function getArcData(): Promise<ArcInitialData> {
  const supabase = createPublicClient();

  const [
    songsRes,
    albumsRes,
    erasRes,
    lifeEventsRes,
    releaseSongsRes,
    geographyRes,
    relationshipsRes,
    threadsRes,
    threadLinksRes,
    artRes,
    writingsRes,
    industryRes,
  ] = await Promise.all([
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
    supabase
      .from("release_songs")
      .select("release_id, song_id"),
    // Phase 2 layers (each renders only when its Key toggle is on)
    supabase
      .from("geography_bands")
      .select("id, slug, location_name, region, date_start, date_end")
      .eq("status", "published"),
    supabase
      .from("relationships")
      .select("id, slug, full_name, role, first_contact_date, last_contact_date, still_active")
      .eq("status", "published"),
    supabase
      .from("thematic_threads")
      .select("id, slug, name")
      .eq("status", "published"),
    supabase
      .from("thematic_thread_links")
      .select("thread_id, entity_kind, entity_id"),
    supabase
      .from("art_pieces")
      .select("id, slug, title, created_at_date, year_created")
      .eq("status", "published")
      .not("created_at_date", "is", null),
    supabase
      .from("posts")
      .select("id, slug, title, date_captured, kind")
      .eq("status", "published")
      .not("date_captured", "is", null),
    supabase
      .from("industry_encounters")
      .select("id, slug, title, date, counterparty, outcome, body_html")
      .eq("status", "published")
      .not("date", "is", null),
  ]);

  const songs = (songsRes.data ?? []) as ArcInitialData["songs"];
  const albums = (albumsRes.data ?? []) as ArcInitialData["albums"];
  const eras = (erasRes.data ?? []) as ArcInitialData["eras"];
  const lifeEvents = (lifeEventsRes.data ?? []) as ArcInitialData["lifeEvents"];
  const geography = (geographyRes.data ?? []) as ArcInitialData["geography"];
  const relationships = (relationshipsRes.data ?? []) as ArcInitialData["relationships"];
  const threads = (threadsRes.data ?? []) as ArcInitialData["threads"];
  const threadLinks = (threadLinksRes.data ?? []) as ArcInitialData["threadLinks"];
  const art = (artRes.data ?? []) as ArcInitialData["art"];
  const writings = (writingsRes.data ?? []) as ArcInitialData["writings"];
  const industry = (industryRes.data ?? []) as ArcInitialData["industry"];

  // Per-release charge = mean of its non-instrumental, calibrated track charges
  // (RC's compute_release_charge). Each release is one trajectory point; the
  // compass curve plots releases, not songs. Duplicates across compilations are
  // intentional -- a release is a release.
  const chargeBySongId = new Map<string, number>();
  for (const s of songs) {
    if (!s.instrumental && s.rc_charge != null) chargeBySongId.set(s.id, s.rc_charge);
  }
  const chargesByRelease = new Map<string, number[]>();
  for (const link of releaseSongsRes.data ?? []) {
    const c = chargeBySongId.get(link.song_id);
    if (c == null) continue;
    const arr = chargesByRelease.get(link.release_id) ?? [];
    arr.push(c);
    chargesByRelease.set(link.release_id, arr);
  }
  for (const a of albums) {
    const charges = chargesByRelease.get(a.id);
    if (charges && charges.length) {
      const mean = charges.reduce((sum, c) => sum + c, 0) / charges.length;
      a.charge = Math.round(mean);
      a.tier = tierForCharge(mean);
    } else {
      a.charge = null;
      a.tier = null;
    }
  }

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
  for (const g of geography) {
    if (g.date_start) dateYears.push(parseInt(g.date_start.slice(0, 4), 10));
  }
  for (const r of relationships) {
    if (r.first_contact_date) dateYears.push(parseInt(r.first_contact_date.slice(0, 4), 10));
  }
  for (const a of art) {
    const d = a.created_at_date ?? (a.year_created ? `${a.year_created}` : null);
    if (d) dateYears.push(parseInt(d.slice(0, 4), 10));
  }
  for (const w of writings) {
    if (w.date_captured) dateYears.push(parseInt(w.date_captured.slice(0, 4), 10));
  }
  for (const enc of industry) {
    if (enc.date) dateYears.push(parseInt(enc.date.slice(0, 4), 10));
  }

  const currentYear = new Date().getFullYear();
  const yearStart = dateYears.length ? Math.min(...dateYears) : 1989;
  // End a year past "now" so today's date (and the Now line) always sits inside
  // the canvas with a little future runway, rather than on the clipped edge.
  const yearEnd = Math.max(currentYear + 1, dateYears.length ? Math.max(...dateYears) : currentYear + 1);

  return {
    songs,
    albums,
    eras,
    lifeEvents,
    geography,
    relationships,
    threads,
    threadLinks,
    art,
    writings,
    industry,
    yearRange: [yearStart, yearEnd],
  };
}

export default async function RadiantArcPage() {
  const data = await getArcData();

  return (
    <article id="page-radiant-arc" className="page-radiant-arc">
      <RadiantArcHeader />
      <ArcRadiant data={data} />
    </article>
  );
}
