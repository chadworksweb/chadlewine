"use client";

import { MeditationComposer } from "@/components/MeditationComposer";
import { useParams } from "next/navigation";

export default function EditMeditationPage() {
  const { id } = useParams<{ id: string }>();
  return <MeditationComposer meditationId={id} />;
}
