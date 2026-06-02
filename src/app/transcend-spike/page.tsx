import type { Metadata } from "next";
import { TranscendSpike } from "./TranscendSpike";

// Phase 0 proof-of-look for Transcend the Machine. Throwaway spike route, kept
// out of nav and out of the index. See CHADLEWINE-TRANSCEND-THE-MACHINE.md.
export const metadata: Metadata = {
  title: "Transcend the Machine - spike",
  robots: { index: false, follow: false },
};

export default function TranscendSpikePage() {
  return <TranscendSpike />;
}
