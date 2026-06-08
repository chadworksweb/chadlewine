import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { EntryArchive } from "@/components/EntryArchive";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Observations",
  description: "The full archive of Chad Lewine's Observations.",
  alternates: { canonical: "https://chadlewine.com/writings/observations" },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/writings/observations", DEFAULT_METADATA);
}

export default function ObservationsArchivePage() {
  return (
    <EntryArchive
      kind="observation"
      basePath="/writings/observations"
      emptyMessage="No observations published yet."
    />
  );
}
