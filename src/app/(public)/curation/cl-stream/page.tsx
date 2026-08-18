import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { CLStreamEntry } from "@/components/CLStreamEntry";
import { fetchBadge } from "@/lib/rising-compass";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "CL Stream",
  description: "Songs I've been hearing — pointed at the compass.",
  alternates: { canonical: "https://chadlewine.com/curation/cl-stream" },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/curation/cl-stream", DEFAULT_METADATA);
}

export default async function CLStreamPage() {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("cl_stream_songs")
    .select("id, title, artist, album, note, source_url, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const rows = data || [];
  // Live badge fetches — RC is authoritative. fetchBadge respects the 24h
  // cache + pending-aware bypass defined in lib/rising-compass.
  const badges = await Promise.all(rows.map((r) => fetchBadge(r.title, r.artist)));
  const songs = rows.map((r, i) => ({ ...r, badge: badges[i] }));

  return (
    <div id="page-cl-stream" className="page-static">
      <h1 className="page-static__title">CL Stream</h1>
      <p className="curation-intro">Songs that are or at one time were on personal heavy rotation.</p>
      <div className="cl-stream-page-feed">
        {songs.map((song) => (
          <CLStreamEntry key={song.id} song={song} />
        ))}
        {songs.length === 0 && (
          <p style={{ opacity: 0.4 }}>Nothing in the stream yet.</p>
        )}
      </div>
    </div>
  );
}
