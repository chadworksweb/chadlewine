"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { SongEditor } from "@/components/SongEditor";

export default function EditSongPage() {
  const { id } = useParams() as { id: string };
  const [initial, setInitial] = useState<null | Record<string, unknown>>(null);

  useEffect(() => {
    fetch(`/api/admin/songs/${id}`)
      .then((r) => r.json())
      .then(setInitial);
  }, [id]);

  if (!initial) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
          Loading...
        </p>
      </div>
    );
  }

  return <SongEditor initial={initial as unknown as Parameters<typeof SongEditor>[0]["initial"]} />;
}
