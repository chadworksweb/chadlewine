import type { Metadata } from "next";
import { MerchTierPage } from "@/components/MerchTierPage";

const LABELS: Record<string, string> = { art: "The Art", line: "The Line", fusion: "The Fusion", pick: "The Pick" };

export const metadata: Metadata = {
  title: `${LABELS["art"]} — Merch — Chad Lewine`,
  description: "Citation goes physical.",
  alternates: { canonical: `https://chadlewine.com/merch/art` },
};

export const revalidate = 60;

export default function MerchArtPage() {
  return <MerchTierPage tier="art" />;
}
