"use client";

import { useParams } from "next/navigation";
import { ArtPieceEditor } from "@/components/admin/ArtPieceEditor";

export default function EditArtPage() {
  const { slug } = useParams() as { slug: string };
  return <ArtPieceEditor slug={slug} />;
}
