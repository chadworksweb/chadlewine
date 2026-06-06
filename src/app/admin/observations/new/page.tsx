"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ObservationEditor } from "@/components/ObservationEditor";

function NewObservationEditor() {
  const kind = useSearchParams().get("kind") || "observation";
  return <ObservationEditor defaultKind={kind} />;
}

export default function NewObservationPage() {
  return (
    <Suspense fallback={null}>
      <NewObservationEditor />
    </Suspense>
  );
}
