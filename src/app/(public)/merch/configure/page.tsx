import type { Metadata } from "next";
import { ProductConfigurator } from "@/components/ProductConfigurator";

export const metadata: Metadata = {
  title: "Design Your Own — Merch — Chad Lewine",
  description:
    "Pick any art or line from an Observation. Put it on a Comfort Colors 1717.",
  alternates: { canonical: "https://chadlewine.com/merch/configure" },
};

export default function ConfigurePage() {
  return (
    <div id="page-merch-configure" className="page-merch">
      <header className="page-merch__header">
        <h1 className="page-merch__title">Design Your Own</h1>
        <p className="page-merch__subtitle">
          Pick any art or line from an Observation. Put it on a Comfort Colors
          1717. If it&rsquo;s good, submit it for the permanent catalog &mdash;
          and earn revenue share on every future sale.
        </p>
      </header>
      <ProductConfigurator />
    </div>
  );
}
