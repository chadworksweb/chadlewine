import type { Metadata } from "next";
import { MerchTierPage } from "@/components/MerchTierPage";

const LABELS: Record<string, string> = { art: "The Art", line: "The Line", fusion: "The Fusion", pick: "The Pick" };

export const metadata: Metadata = {
  title: `${LABELS["pick"]} — Merch — Chad Lewine`,
  description: "Citation goes physical.",
  alternates: { canonical: `https://chadlewine.com/merch/pick` },
};

export const revalidate = 60;

export default function MerchPickPage() {
  return <MerchTierPage tier="pick" />;
}
