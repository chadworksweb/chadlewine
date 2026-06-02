import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { PatronageWidget } from "@/components/PatronageWidget";

const DEFAULT_METADATA: Metadata = {
  title: "Patronage - Support Chad Lewine",
  description:
    "Become a patron of Chad Lewine. Make a one-time patronage payment to directly support an independent musician's catalog, art, and ongoing work.",
  alternates: { canonical: "https://chadlewine.com/patronage" },
  openGraph: {
    title: "Patronage - Chad Lewine",
    description:
      "Support an independent musician directly with a one-time patronage payment.",
    url: "https://chadlewine.com/patronage",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/patronage", DEFAULT_METADATA);
}

// Standalone home for the patronage section -- the same widget that lives in
// the global footer, given its own URL so it can be linked directly (e.g. the
// MusicBrainz "patronage page" relationship). The duplicate global footer
// instance is hidden on this route via CSS (see body:has(.page-patronage)).
export default function PatronagePage() {
  return (
    <div id="page-patronage" className="page-patronage">
      <section className="site-patronage">
        <PatronageWidget />
      </section>
    </div>
  );
}
