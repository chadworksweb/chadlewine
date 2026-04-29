import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { createPublicClient } from "@/lib/supabase-server";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { ProgressBar } from "@/components/ProgressBar";
import { ObservationJsonLd } from "@/components/ObservationJsonLd";
import { ImageObjectJsonLd } from "@/components/ImageObjectJsonLd";
import { formatDate } from "@/lib/utils";
import { AdminEditButton } from "@/components/AdminEditButton";
import { SynapseDisplay } from "@/components/SynapseDisplay";
import { MerchSection } from "@/components/MerchSection";



export const revalidate = 60;

async function getObservation(slug: string) {
  const supabase = createPublicClient();

  const { data: observation } = await supabase
    .from("observations")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!observation) return null;

  const { data: thoughtlineLinks } = await supabase
    .from("observation_thoughtlines")
    .select("thoughtline_id")
    .eq("observation_id", observation.id);

  const { data: categoryLinks } = await supabase
    .from("observation_categories")
    .select("category_id, categories(title, slug)")
    .eq("observation_id", observation.id);

  const { data: tagLinks } = await supabase
    .from("observation_tags")
    .select("tag_id, tags(label, slug)")
    .eq("observation_id", observation.id);

  return {
    ...observation,
    thoughtline_ids: thoughtlineLinks?.map((t) => t.thoughtline_id) || [],
    category_ids: categoryLinks?.map((c) => c.category_id) || [],
    tag_ids: tagLinks?.map((t) => t.tag_id) || [],
    categories: categoryLinks?.map((c) => (c as Record<string, unknown>).categories as { title: string; slug: string }) || [],
    tags: tagLinks?.map((t) => (t as Record<string, unknown>).tags as { label: string; slug: string }) || [],
  };
}

async function getAdjacentObservations(dateCaptured: string, observationId: string) {
  const supabase = createPublicClient();

  const { data: newer } = await supabase
    .from("observations")
    .select("title, slug")
    .eq("status", "published")
    .gt("date_captured", dateCaptured)
    .neq("id", observationId)
    .order("date_captured", { ascending: true })
    .limit(1)
    .single();

  const { data: older } = await supabase
    .from("observations")
    .select("title, slug")
    .eq("status", "published")
    .lt("date_captured", dateCaptured)
    .neq("id", observationId)
    .order("date_captured", { ascending: false })
    .limit(1)
    .single();

  return { newer, older };
}

// Synapse Jumper: related by shared thoughtlines
async function getSynapseJumperObservations(observationId: string, thoughtlineIds: string[]) {
  if (thoughtlineIds.length === 0) return [];
  const supabase = createPublicClient();
  const { data: links } = await supabase
    .from("observation_thoughtlines")
    .select("observation_id")
    .in("thoughtline_id", thoughtlineIds)
    .neq("observation_id", observationId);
  if (!links || links.length === 0) return [];
  const ids = [...new Set(links.map((l) => l.observation_id))];
  const { data } = await supabase
    .from("observations")
    .select("id, title, slug, art_image_path, art_alt")
    .eq("status", "published")
    .in("id", ids)
    .order("date_captured", { ascending: false })
    .limit(3);
  return data || [];
}

// Related Observations: random by shared categories + tags
async function getRelatedObservations(
  observationId: string,
  categoryIds: string[],
  tagIds: string[],
  excludeIds: string[]
) {
  if (categoryIds.length === 0 && tagIds.length === 0) return [];
  const supabase = createPublicClient();
  const candidateIds = new Set<string>();

  if (categoryIds.length > 0) {
    const { data: catLinks } = await supabase
      .from("observation_categories")
      .select("observation_id")
      .in("category_id", categoryIds)
      .neq("observation_id", observationId);
    catLinks?.forEach((l) => candidateIds.add(l.observation_id));
  }

  if (tagIds.length > 0) {
    const { data: tagLinks } = await supabase
      .from("observation_tags")
      .select("observation_id")
      .in("tag_id", tagIds)
      .neq("observation_id", observationId);
    tagLinks?.forEach((l) => candidateIds.add(l.observation_id));
  }

  // Remove any already shown in Synapse Jumper
  excludeIds.forEach((id) => candidateIds.delete(id));

  if (candidateIds.size === 0) return [];

  const ids = [...candidateIds];
  const { data } = await supabase
    .from("observations")
    .select("id, title, slug, art_image_path, art_alt")
    .eq("status", "published")
    .in("id", ids);

  if (!data || data.length === 0) return [];

  // Shuffle and take 8 (4 cols × 2 rows)
  const shuffled = data.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 8);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const obsv =await getObservation(slug);
  if (!obsv) return {};

  const description = obsv.seo_description || obsv.hook_line || "";

  return {
    title: obsv.seo_title || obsv.title,
    description,
    alternates: {
      canonical: `https://chadlewine.com/observations/${slug}`,
    },
    openGraph: {
      type: "article",
      title: obsv.seo_title || obsv.title,
      description,
      images: obsv.art_image_path ? [obsv.art_image_path] : undefined,
      publishedTime: obsv.published_at || obsv.date_captured,
      modifiedTime: obsv.updated_at || undefined,
      authors: ["Chad Lewine"],
      section: obsv.categories?.[0]?.title || "Observations",
    },
  };
}

export default async function ObservationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const obsv =await getObservation(slug);
  if (!obsv) notFound();

  const { newer, older } = await getAdjacentObservations(obsv.date_captured, obsv.id);
  const synapseJumper = await getSynapseJumperObservations(obsv.id, obsv.thoughtline_ids || []);
  const synapseIds = synapseJumper.map((s: { id: string }) => s.id);
  const related = await getRelatedObservations(obsv.id, obsv.category_ids || [], obsv.tag_ids || [], synapseIds);

  return (
    <div id="page-observation" className="page-observation" data-observation-id={obsv.id}>
      <AdminEditButton href={`/admin/observations/${obsv.slug || obsv.id}`} />
      <ObservationJsonLd
        title={obsv.title}
        slug={obsv.slug}
        description={obsv.seo_description || obsv.hook_line || obsv.title}
        dateCaptured={obsv.date_captured}
        publishedAt={obsv.published_at}
        updatedAt={obsv.updated_at}
        artImagePath={obsv.art_image_path}
        artAlt={obsv.art_alt}
        articleType={obsv.article_type}
        paaPairs={obsv.paa_pairs}
      />
      {obsv.art_image_path && (
        <ImageObjectJsonLd
          url={obsv.art_image_path}
          name={`Cover art for ${obsv.title}`}
          description={obsv.art_alt}
        />
      )}
      <ProgressBar />
      <section className="cover-hero">
        {obsv.art_image_path && (
          <div className="cover-hero__art-wrap" style={{ position: "relative" }}>
            <Image
              src={obsv.art_image_path}
              alt={obsv.art_alt || obsv.title}
              className="cover-hero__art"
              fill
              sizes="(max-width: 1200px) 100vw, 1200px"
              priority
            />
          </div>
        )}

        <div className="cover-hero__content">
          <h1 className="cover-hero__title cover-hero__title--observation">
            {obsv.title}
          </h1>

          <div className="cover-hero__bar">
            <div className="cover-hero__meta">
              <time className="cover-hero__date">
                {formatDate(obsv.date_captured)}
              </time>

              {obsv.reading_time_minutes && (
                <>
                  <span className="cover-hero__sep">&bull;</span>
                  <span className="cover-hero__read-time">
                    {Math.max(1, Math.round(obsv.reading_time_minutes))} min read
                  </span>
                </>
              )}
            </div>

            {obsv.categories?.length > 0 && (
              <div className="cover-hero__cats">
                {obsv.categories.map((c: { title: string; slug: string }, i: number) => (
                  <span key={c.slug}>
                    <span className="cover-hero__tag cover-hero__tag--cat">{c.title}</span>
                    {i < obsv.categories.length - 1 && ", "}
                  </span>
                ))}
              </div>
            )}

            {obsv.tags?.length > 0 && (
              <div className="cover-hero__tags">
                {obsv.tags.map((t: { label: string; slug: string }, i: number) => (
                  <span key={t.slug}>
                    <span className="cover-hero__tag">#{t.label}</span>
                    {i < obsv.tags.length - 1 && ", "}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <article className="observation-body">
        <MarkdownRenderer html={obsv.body} />
      </article>

      <SynapseDisplay sourceType="observation" sourceId={obsv.id} />

      <div className="obsv-celestial-anchor">
        <div className="obsv-celestial-wrap" aria-hidden="true">
          <svg className="obsv-celestial" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="navCore" cx="30%" cy="30%">
                <stop offset="0%" stopColor="#b4bfff"/>
                <stop offset="50%" stopColor="#8b9cf7"/>
                <stop offset="100%" stopColor="#2a2a4e"/>
              </radialGradient>
              <radialGradient id="navGlow" cx="50%" cy="50%">
                <stop offset="0%" stopColor="#8b9cf7" stopOpacity="0.3"/>
                <stop offset="60%" stopColor="#8b9cf7" stopOpacity="0.05"/>
                <stop offset="100%" stopColor="#8b9cf7" stopOpacity="0"/>
              </radialGradient>
              <filter id="navBlur" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2"/>
              </filter>
            </defs>
            <g opacity="0.25" stroke="#8b9cf7" strokeWidth="0.5" fill="none">
              <ellipse cx="200" cy="200" rx="180" ry="60" className="obsv-celestial__ring obsv-celestial__ring--1"/>
              <ellipse cx="200" cy="200" rx="140" ry="45" className="obsv-celestial__ring obsv-celestial__ring--2" strokeDasharray="6 3"/>
              <ellipse cx="200" cy="200" rx="100" ry="32" className="obsv-celestial__ring obsv-celestial__ring--3"/>
            </g>
            <g opacity="0.5" fill="#8b9cf7">
              <circle cx="340" cy="185" r="3"/>
              <circle cx="60" cy="215" r="2.5"/>
              <circle cx="310" cy="160" r="2"/>
            </g>
            <circle cx="200" cy="200" r="70" fill="url(#navGlow)" filter="url(#navBlur)"/>
            <circle cx="200" cy="200" r="35" fill="url(#navCore)"/>
            <ellipse cx="200" cy="200" rx="55" ry="10" fill="none" stroke="#8b9cf7" strokeWidth="2" opacity="0.4" className="obsv-celestial__ring obsv-celestial__ring--front"/>
            <g opacity="0.2">
              <circle cx="80" cy="120" r="1" fill="#fff"/>
              <circle cx="320" cy="100" r="1.2" fill="#fff"/>
              <circle cx="100" cy="300" r="1" fill="#fff"/>
              <circle cx="310" cy="290" r="0.8" fill="#fff"/>
            </g>
          </svg>
        </div>
      </div>

      {(newer || older) && (
        <div className="obsv-nav-anchor">
          <nav className="obsv-nav">
            {newer ? (
              <a href={`/observations/${newer.slug}`} className="obsv-nav__card obsv-nav__card--newer">
                <span className="obsv-nav__label">&larr; Newer</span>
                <span className="obsv-nav__title">{newer.title}</span>
              </a>
            ) : (
              <span />
            )}
            <div className="obsv-nav__center" />
            {older ? (
              <a href={`/observations/${older.slug}`} className="obsv-nav__card obsv-nav__card--older">
                <span className="obsv-nav__label">Older &rarr;</span>
                <span className="obsv-nav__title">{older.title}</span>
              </a>
            ) : (
              <span />
            )}
          </nav>
        </div>
      )}

      {synapseJumper.length > 0 && (
        <section className="synapse-jumper">
          <h2 className="synapse-jumper__heading">Synapse Jumper</h2>
          <div className="synapse-jumper__grid">
            {synapseJumper.map((r: { id: string; title: string; slug: string; art_image_path: string | null; art_alt: string | null }) => (
              <a key={r.id} href={`/observations/${r.slug}`} className="synapse-jumper__card">
                {r.art_image_path ? (
                  <div className="synapse-jumper__art-wrap" style={{ position: "relative" }}>
                    <Image
                      src={r.art_image_path}
                      alt={r.art_alt || r.title}
                      className="synapse-jumper__art"
                      fill
                      sizes="(max-width: 720px) 50vw, 240px"
                    />
                  </div>
                ) : (
                  <div className="synapse-jumper__art-wrap synapse-jumper__art-wrap--empty" />
                )}
                <h3 className="synapse-jumper__title">{r.title}</h3>
              </a>
            ))}
          </div>
        </section>
      )}

      <MerchSection observationId={obsv.id} />

      {related.length > 0 && (
        <section className="related-observations">
          <h2 className="related-observations__heading">Related Observations</h2>
          <div className="related-observations__grid">
            {related.map((r: { id: string; title: string; slug: string; art_image_path: string | null; art_alt: string | null }) => (
              <a key={r.id} href={`/observations/${r.slug}`} className="related-observations__card">
                {r.art_image_path ? (
                  <div className="related-observations__art-wrap" style={{ position: "relative" }}>
                    <Image
                      src={r.art_image_path}
                      alt={r.art_alt || r.title}
                      className="related-observations__art"
                      fill
                      sizes="(max-width: 720px) 50vw, 240px"
                    />
                  </div>
                ) : (
                  <div className="related-observations__art-wrap related-observations__art-wrap--empty" />
                )}
                <h3 className="related-observations__title">{r.title}</h3>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
