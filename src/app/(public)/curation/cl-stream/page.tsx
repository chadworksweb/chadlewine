import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { CLStreamEntry } from "@/components/CLStreamEntry";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "CL Stream — Chad Lewine",
  description: "Songs I've been hearing — pointed at the compass.",
  alternates: { canonical: "https://chadlewine.com/curation/cl-stream" },
};

export default async function CLStreamPage() {
  const supabase = createPublicClient();
  const { data: songs } = await supabase
    .from("cl_stream_songs")
    .select("id, title, artist, album, note, source_url, rc_color, rc_charge, created_at")
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
