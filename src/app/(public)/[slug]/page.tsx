import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { AdminEditButton } from "@/components/AdminEditButton";

export const revalidate = 60;

async function getDoorPage(slug: string) {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("door_pages")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

async function getLinkedSongs(doorPageId: string) {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("door_page_songs")
    .select("position, song:songs(id, title, slug, art_image_path, art_alt, status)")
    .eq("door_page_id", doorPageId)
    .order("position");
  return (data || [])
    .map((row: { position: number; song: unknown }) => row.song as {
      id: string;
      title: string;
      slug: string;
      art_image_path: string | null;
      art_alt: string | null;
      status: string;
    })
    .filter((s) => s && s.status === "published");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dp = await getDoorPage(slug);
  if (!dp) return {};

  return {
    title: dp.meta_title || dp.title,
    description: dp.meta_description || undefined,
    alternates: {
      canonical: `https://chadlewine.com/${slug}`,
    },
    openGraph: {
      title: dp.meta_title || dp.title,
      description: dp.meta_description || undefined,
      url: `https://chadlewine.com/${slug}`,
      type: "website",
      ...(dp.og_image_path
        ? { images: [{ url: dp.og_image_path, width: 1200, height: 630 }] }
        : {}),
    },
    robots: {
      index: true,
      follow: true,
      "max-image-preview": "large" as const,
      "max-snippet": -1,
    },
  };
}

export default async function DoorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dp = await getDoorPage(slug);
  if (!dp) notFound();

  const linkedSongs = await getLinkedSongs(dp.id);

  return (
    <article id="page-door" className="page-static">
      <AdminEditButton href={`/admin/door-pages/${dp.id}`} />
      <h1 className="page-static__title">{dp.title}</h1>
      {dp.body && <MarkdownRenderer html={dp.body} />}

      {linkedSongs.length > 0 && (
        <nav className="door-page__songs" style={{ marginTop: "var(--space-xl)" }}>
          <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
            Songs
          </h2>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "var(--space-md)" }}>
            {linkedSongs.map((s) => (
              <li key={s.id}>
                <a
                  href={`/music/songs/${s.slug}`}
                  style={{
                    display: "block",
                    color: "inherit",
                    textDecoration: "none",
                    border: "1px solid #1a1a2e",
                    borderRadius: 2,
                    overflow: "hidden",
                    background: "#0d0d1a",
                  }}
                >
                  {s.art_image_path && (
                    <img
                      src={s.art_image_path}
                      alt={s.art_alt || s.title}
                      style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }}
                      loading="lazy"
                    />
                  )}
                  <span style={{ display: "block", padding: "var(--space-sm)", fontFamily: "var(--font-ui)", fontSize: "0.9rem", color: "var(--text-primary)" }}>
                    {s.title}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {dp.funnel_targets && dp.funnel_targets.length > 0 && (
        <nav className="door-page__funnels" style={{ marginTop: "var(--space-xl)" }}>
          <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
            Explore
          </h2>
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            {dp.funnel_targets.map((target: string, i: number) => (
              <li key={i}>
                <a href={target} style={{ color: "var(--text-accent)" }}>{target}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </article>
  );
}
