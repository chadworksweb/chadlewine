"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ExpansionEditor } from "@/components/ExpansionEditor";

export default function NewExpansionPage() {
  const { id: songId } = useParams() as { id: string };
  const [songTitle, setSongTitle] = useState<string>("");

  useEffect(() => {
    fetch(`/api/admin/songs/${songId}`)
      .then((r) => r.json())
      .then((s) => setSongTitle(s.title || ""));
  }, [songId]);

  return <ExpansionEditor songId={songId} songTitle={songTitle} />;
}
