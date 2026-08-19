import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { VideoLibrary } from "./library";
import { VIDEOS_URL } from "./data";

// Static metadata and no request-time APIs, so the library keeps its ISR. Each
// individual video is its own prerendered route (/videos/[slug]) rather than a
// ?v= query on this page -- that is what lets both pages be cached AND carry
// their own title, canonical and share card.
export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Videos",
  description:
    "Chad Lewine's video library. Music videos, live performances and more.",
  alternates: { canonical: VIDEOS_URL },
  openGraph: {
    title: "Videos - Chad Lewine",
    description: "Chad Lewine's video library. Music videos, live performances and more.",
    url: VIDEOS_URL,
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/videos", DEFAULT_METADATA);
}

export default async function VideoPage() {
  return <VideoLibrary />;
}
