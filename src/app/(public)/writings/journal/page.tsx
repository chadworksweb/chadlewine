import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { EntryArchive } from "@/components/EntryArchive";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Journal",
  description: "Chad Lewine's journal -- writing about his music, work, and experience.",
  alternates: { canonical: "https://chadlewine.com/writings/journal" },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/writings/journal", DEFAULT_METADATA);
}

export default function JournalArchivePage() {
  return (
    <EntryArchive
      kind="journal"
      basePath="/writings/journal"
      ctaLabel="Read the Entry →"
      emptyMessage="No journal entries published yet."
    />
  );
}
