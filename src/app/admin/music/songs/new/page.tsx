"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SongEditor } from "@/components/SongEditor";

function NewSongInner() {
  const searchParams = useSearchParams();
  const presetAlbumId = searchParams.get("release_id") || undefined;
  return <SongEditor presetAlbumId={presetAlbumId} />;
}

export default function NewSongPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-page">
          <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
            Loading...
          </p>
        </div>
      }
    >
      <NewSongInner />
    </Suspense>
  );
}
