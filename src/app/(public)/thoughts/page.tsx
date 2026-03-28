import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Thoughts — Chad Lewine",
  description: "Named themes that accumulate observations and meditations over time.",
  alternates: { canonical: "https://chadlewine.com/thoughts" },
};

export default async function ThoughtsIndexPage() {
  const supabase = createPublicClient();
  const { data: thoughts } = await supabase
    .from("thoughts")
    .select("id, title, slug, description")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  return (
    <div id="page-thoughts" className="page-static">
      <h1 className="page-static__title">Thoughts</h1>
      {(!thoughts || thoughts.length === 0) && (
        <p style={{ color: "var(--text-tertiary)" }}>No thoughts published yet.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
        {thoughts?.map((t) => (
          <Link
            key={t.id}
            href={`/thoughts/${t.slug}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <article style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
              padding: "var(--space-lg)",
            }}>
              <h2 style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--text-lg)",
                color: "var(--text-primary)",
                margin: 0,
              }}>
                {t.title}
              </h2>
              {t.description && (
                <p style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--text-secondary)",
                  marginTop: "var(--space-xs)",
                  marginBottom: 0,
                }}>
                  {t.description}
                </p>
              )}
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
