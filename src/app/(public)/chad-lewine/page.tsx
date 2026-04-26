import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { isSectionLive } from "@/lib/feature-flags";
import { ArcRadiant, type ArcInitialData } from "@/components/ArcRadiant";
import { ProseReader } from "@/components/ProseReader";
import { redirect } from "next/navigation";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Chad Lewine — Arc Radiant",
  description:
    "An autobiographical living timeline. Music, eras, life events, and Compass Charge for Chad Lewine.",
  alternates: { canonical: "https://chadlewine.com/chad-lewine" },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/chad-lewine", DEFAULT_METADATA);
}

type SearchParams = { view?: string; section?: string };

export default async function ChadLewinePage(props: { searchParams: Promise<SearchParams> }) {
  const params = await props.searchParams;
  const wantsProse = params.view === "prose";
  const proseLive = await isSectionLive("chad-lewine-prose");

  if (wantsProse) {
    if (!proseLive) redirect("/chad-lewine");
    return <ProseReaderView initialSection={params.section ?? null} />;
  }

  return <ArcView proseAvailable={proseLive} />;
}

async function ArcView({ proseAvailable }: { proseAvailable: boolean }) {
  const supabase = createPublicClient();

  const [songsRes, erasRes, eventsRes] = await Promise.all([
    supabase
      .from("songs")
      .select("id,slug,title,release_date,write_date,song_state,status,instrumental,rc_charge,rc_tier")
      .in("status", ["unreleased", "published"])
      .order("release_date", { ascending: true }),
    supabase
      .from("eras")
      .select("id,slug,title,kind,date_start,date_end")
      .order("date_start", { ascending: true }),
    supabase
      .from("life_events")
      .select("id,slug,title,date_start,date_end,body_html")
      .eq("status", "published")
      .order("date_start", { ascending: true }),
  ]);

  const songs = songsRes.data ?? [];
  const eras = erasRes.data ?? [];
  const lifeEvents = eventsRes.data ?? [];

  // Year range — 1989 (formation start) to next year (headroom).
  const currentYear = new Date().getFullYear();
  const data: ArcInitialData = {
    songs,
    eras: eras as ArcInitialData["eras"],
    lifeEvents,
    yearRange: [1989, currentYear + 1],
  };

  return (
    <div className="arc-radiant-shell">
      <ArcRadiant data={data} proseAvailable={proseAvailable} />
    </div>
  );
}

async function ProseReaderView({ initialSection }: { initialSection: string | null }) {
  const supabase = createPublicClient();
  const { data: sections } = await supabase
    .from("prose_sections")
    .select("id,slug,title,order_index,scope_kind,date_start,date_end,content_html,last_published_at")
    .eq("status", "published")
    .order("order_index", { ascending: true });

  return <ProseReader sections={sections ?? []} initialSection={initialSection} />;
}
