import Link from "next/link";
import { createPublicClient } from "@/lib/supabase-server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Foundations",
  description: "The founding texts — the intellectual bedrock.",
  alternates: { canonical: "https://chadlewine.com/foundations" },
};

export const revalidate = 60;

export default async function FoundationsPage() {
  const supabase = createPublicClient();

  const { data: foundations } = await supabase
    .from("foundations")
    .select("title, slug, display_order")
    .order("display_order", { ascending: true });

  return (
    <div id="page-foundations" className="page-static">
      <h1 className="page-static__title">
        Foundations
      </h1>

      <div className="page-foundations__list">
        {foundations?.map((f, i) => (
          <Link
            key={f.slug}
            href={`/foundations/${f.slug}`}
            className="glass-panel page-foundations__item"
          >
            <span className="page-foundations__item-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="page-foundations__item-title">{f.title}</span>
            <span className="page-foundations__item-arrow">→</span>
          </Link>
        ))}

        {(!foundations || foundations.length === 0) && (
          <p className="empty-state__message">No founding texts yet.</p>
        )}
      </div>
    </div>
  );
}
