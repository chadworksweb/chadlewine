import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { CLStreamEntry } from "@/components/CLStreamEntry";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "CL Stream — Chad Lewine",
  description: "Songs I've been hearing — pointed at the compass.",
  alternates: { canonical: "https://chadlewine.com/curation/cl-stream" },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/curation/cl-stream", DEFAULT_METADATA);
}

export default async function CLStreamPage() {
  const supabase = createPublicClient();
  const { data: songs } = await supabase
    .from("cl_stream_songs")
    .select("id, title, artist, album, note, source_url, rc_color, rc_charge, rc_charge_summary, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  return (
    <div id="page-cl-stream" className="page-static">
      <h1 className="page-static__title">CL Stream</h1>
      <p className="curation-intro">Songs I&apos;ve been hearing — pointed at the compass.</p>
      <div className="cl-stream-page-feed">
        {(songs || []).map((song) => (
          <CLStreamEntry key={song.id} song={song} />
        ))}
        {(!songs || songs.length === 0) && (
          <p style={{ opacity: 0.4 }}>Nothing in the stream yet.</p>
        )}
      </div>
    </div>
  );
}
