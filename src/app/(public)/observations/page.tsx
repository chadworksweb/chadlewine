import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { EntryArchive } from "@/components/EntryArchive";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Observations",
  description: "The full archive of Chad Lewine's Observations.",
  alternates: { canonical: "https://chadlewine.com/observations" },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/observations", DEFAULT_METADATA);
}

export default function ObservationsArchivePage() {
  return (
    <EntryArchive
      kind="observation"
      basePath="/observations"
      emptyMessage="No observations published yet."
    />
  );
}
