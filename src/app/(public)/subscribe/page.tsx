import type { Metadata } from "next";
import { SubscribeSection } from "@/components/SubscribeSection";

export const metadata: Metadata = {
  title: "Subscribe - Chad Lewine",
  description: "Subscribe to email updates from Chad Lewine and find out where I'm headed.",
  alternates: { canonical: "https://chadlewine.com/subscribe" },
};

export default function SubscribePage() {
  return (
    <main className="page-static" style={{ paddingBlock: "var(--space-2xl)" }}>
      <SubscribeSection />
    </main>
  );
}
