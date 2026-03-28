import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { formatDate } from "@/lib/utils";
import { AdminEditButton } from "@/components/AdminEditButton";

export const revalidate = 60;

async function getThought(slug: string) {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("thoughts")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

async function getThoughtContent(thoughtId: string) {
  const supabase = createPublicClient();

  // Observations linked to this thought
  const { data: obsLinks } = await supabase
    .from("observation_thoughts")
    .select("observation_id")
    .eq("thought_id", thoughtId);

  let observations: { id: string; title: string; slug: string; date_captured: string; hook_line: string | null }[] = [];
  if (obsLinks && obsLinks.length > 0) {
    const obsIds = obsLinks.map((l) => l.observation_id);
    const { data } = await supabase
      .from("observations")
      .select("id, title, slug, date_captured, hook_line")
      .in("id", obsIds)
      .eq("status", "published")
      .order("date_captured", { ascending: false });
    observations = data || [];
  }

  // Meditations linked to this thought
  const { data: medLinks } = await supabase
    .from("meditation_thoughts")
    .select("meditation_id")
    .eq("thought_id", thoughtId);

  let meditations: { id: string; plain_text: string; published_at: string | null; created_at: string }[] = [];
  if (medLinks && medLinks.length > 0) {
    const medIds = medLinks.map((l) => l.meditation_id);
    const { data } = await supabase
      .from("meditations")
      .select("id, plain_text, published_at, created_at")
      .in("id", medIds)
      .eq("status", "published")
      .order("published_at", { ascending: false });
    meditations = data || [];
  }

  return { observations, meditations };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const thought = await getThought(slug);
  if (!thought) return {};
  return {
    title: `${thought.title} — Thoughts — Chad Lewine`,
    description: thought.description || undefined,
    alternates: { canonical: `https://chadlewine.com/thoughts/${slug}` },
  };
}

export default async function ThoughtPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const thought = await getThought(slug);
  if (!thought) notFound();

  const { observations, meditations } = await getThoughtContent(thought.id);

  // Merge into a chronological timeline
  type TimelineItem =
    | { type: "observation"; date: string; data: typeof observations[0] }
    | { type: "meditation"; date: string; data: typeof meditations[0] };

  const timeline: TimelineItem[] = [
    ...observations.map((o) => ({ type: "observation" as const, date: o.date_captured, data: o })),
    ...meditations.map((m) => ({ type: "meditation" as const, date: m.published_at || m.created_at, data: m })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div id="page-thought" className="page-static">
      <AdminEditButton href={`/admin/thoughts/${thought.id}`} />
      <h1 className="page-static__title">{thought.title}</h1>
      {thought.description && (
        <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-xl)" }}>
          {thought.description}
        </p>
      )}

      {timeline.length === 0 && (
        <p style={{ color: "var(--text-tertiary)" }}>No content in this thought yet.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
        {timeline.map((item, i) => (
          <article key={i} style={{
            borderLeft: `2px solid ${item.type === "observation" ? "var(--text-accent)" : "var(--border-subtle)"}`,
            paddingLeft: "var(--space-md)",
          }}>
            <span style={{
              fontFamily: "var(--font-ui)",
              fontSize: "var(--text-xs)",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              {item.type === "observation" ? "Observation" : "Meditation"} &middot; {formatDate(item.date)}
            </span>
            {item.type === "observation" ? (
              <div>
                <Link
                  href={`/observations/${item.data.slug}`}
                  style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: 600 }}
                >
                  {item.data.title}
                </Link>
                {item.data.hook_line && (
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", margin: "var(--space-xs) 0 0" }}>
                    {item.data.hook_line}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <Link
                  href={`/meditations/${item.data.id}`}
                  style={{ color: "var(--text-primary)", textDecoration: "none" }}
                >
                  <p style={{ margin: "var(--space-xs) 0 0", fontSize: "var(--text-sm)" }}>
                    {item.data.plain_text.length > 200
                      ? item.data.plain_text.slice(0, 200) + "..."
                      : item.data.plain_text}
                  </p>
                </Link>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
