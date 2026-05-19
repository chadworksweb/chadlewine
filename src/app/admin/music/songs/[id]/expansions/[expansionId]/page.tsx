"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ExpansionEditor } from "@/components/ExpansionEditor";

export default function EditExpansionPage() {
  const { id: songId, expansionId } = useParams() as { id: string; expansionId: string };
  const [initial, setInitial] = useState<null | Record<string, unknown>>(null);
  const [songTitle, setSongTitle] = useState<string>("");

  useEffect(() => {
    fetch(`/api/admin/expansions/${expansionId}`)
      .then((r) => r.json())
      .then(setInitial);
    fetch(`/api/admin/songs/${songId}`)
      .then((r) => r.json())
      .then((s) => setSongTitle(s.title || ""));
  }, [expansionId, songId]);

  if (!initial) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
          Loading...
        </p>
      </div>
    );
  }

  return <ExpansionEditor initial={initial as unknown as Parameters<typeof ExpansionEditor>[0]["initial"]} songId={songId} songTitle={songTitle} />;
}
