import type { Metadata } from "next";
import HeroAnimatic from "./HeroAnimatic";

// Standalone WebGL preview of the Transcend the Machine homepage hero. Kept out
// of nav and out of the index; no DB dependency. See the storyboard artifact.
export const metadata: Metadata = {
  title: "Transcend the Machine - hero (WebGL preview)",
  robots: { index: false, follow: false },
};

// `dev` is what keeps the lab a lab: transport, scrubber, timecode HUD and the
// framed 16:9 box. The homepage renders the same component without it.
export default function HeroAnimaticPage() {
  return <HeroAnimatic dev />;
}
