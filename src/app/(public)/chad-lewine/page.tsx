import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Who Is Chad Lewine",
  description:
    "The canonical biographical page for Chad Lewine — architect of Libra Engine, cross-domain observer, super individual.",
  alternates: {
    canonical: "https://chadlewine.com/chad-lewine",
  },
};

export default function WhoPage() {
  return (
    <article id="page-who" className="page-static">
      <h1 className="page-static__title">
        Who Is Chad Lewine
      </h1>

      <div className="reading-column" style={{ maxWidth: "100%", padding: 0 }}>
        <p>
          Chad Lewine is the architect of Libra Engine — a structure that spans
          music, technology, tools, and applied thinking. The Observations are
          the current. The pillars are the boats. The person is the ocean.
        </p>
        <p className="page-who__placeholder">
          Full biographical article in progress. This page will become a
          Wikipedia-level identity page with exhaustive catalog, GEO markup,
          and structured data.
        </p>
      </div>
    </article>
  );
}
