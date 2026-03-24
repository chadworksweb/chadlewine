import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { ProgressBar } from "@/components/ProgressBar";
import { DomainTag } from "@/components/DomainTag";
import { formatDate } from "@/lib/utils";
import { RevisionTimeline } from "@/components/RevisionTimeline";

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

  const { data: domains } = await supabase
    .from("observation_domains")
    .select("domain_slug")
    .eq("observation_id", observation.id);

  return {
    ...observation,
    domains: domains?.map((d) => d.domain_slug) || [],
  };
}

async function getAdjacentObservations(publishedAt: string, observationId: string) {
  const supabase = createPublicClient();

  const { data: newer } = await supabase
    .from("observations")
    .select("title, slug")
    .eq("status", "published")
    .gt("published_at", publishedAt)
    .neq("id", observationId)
    .order("published_at", { ascending: true })
    .limit(1)
    .single();

  const { data: older } = await supabase
    .from("observations")
    .select("title, slug")
    .eq("status", "published")
    .lt("published_at", publishedAt)
    .neq("id", observationId)
    .order("published_at", { ascending: false })
    .limit(1)
    .single();

  return { newer, older };
}

async function getRelatedObservations(observationId: string, domainSlugs: string[]) {
  if (domainSlugs.length === 0) return [];
  const supabase = createPublicClient();

  // Find observations that share at least one domain
  const { data: links } = await supabase
    .from("observation_domains")
    .select("observation_id")
    .in("domain_slug", domainSlugs)
    .neq("observation_id", observationId);

  if (!links || links.length === 0) return [];

  // Dedupe and pick up to 3
  const ids = [...new Set(links.map((l) => l.observation_id))];

  const { data } = await supabase
    .from("observations")
    .select("id, title, slug, art_image_path, art_alt")
    .eq("status", "published")
    .in("id", ids)
    .order("published_at", { ascending: false })
    .limit(3);

  return data || [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const obs = await getObservation(slug);
  if (!obs) return {};

  return {
    title: obs.seo_title || obs.title,
    description: obs.seo_description || obs.hook_line || "",
    openGraph: {
      type: "article",
      title: obs.seo_title || obs.title,
      description: obs.seo_description || obs.hook_line || "",
      images: obs.art_image_path ? [obs.art_image_path] : undefined,
    },
  };
}

export default async function ObservationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const obs = await getObservation(slug);
  if (!obs) notFound();

  const [related, { newer, older }] = await Promise.all([
    getRelatedObservations(obs.id, obs.domains),
    getAdjacentObservations(obs.published_at || obs.date_captured, obs.id),
  ]);

  return (
    <div id="page-observation" className="page-observation">
      <ProgressBar />
      <section className="cover-hero">
        {obs.art_image_path && (
          <div className="cover-hero__art-wrap">
            <img
              src={obs.art_image_path}
              alt={obs.art_alt || obs.title}
              className="cover-hero__art"
            />
          </div>
        )}

        <div className="cover-hero__content">
          <h1 className="cover-hero__title cover-hero__title--observation">
            {obs.title}
          </h1>

          <div className="cover-hero__bar">
            <div className="cover-hero__date-col">
              <time className="cover-hero__date">
                {formatDate(obs.published_at || obs.date_captured)}
              </time>
              <RevisionTimeline slug={slug} />
            </div>
            <div className="cover-hero__tags">
              {obs.domains.map((d: string) => (
                <DomainTag key={d} slug={d} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <article className="observation-body">
        <MarkdownRenderer html={obs.body} />
      </article>

      <div className="obs-celestial-anchor">
        <div className="obs-celestial-wrap" aria-hidden="true">
          <svg className="obs-celestial" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
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
              <ellipse cx="200" cy="200" rx="180" ry="60" className="obs-celestial__ring obs-celestial__ring--1"/>
              <ellipse cx="200" cy="200" rx="140" ry="45" className="obs-celestial__ring obs-celestial__ring--2" strokeDasharray="6 3"/>
              <ellipse cx="200" cy="200" rx="100" ry="32" className="obs-celestial__ring obs-celestial__ring--3"/>
            </g>
            <g opacity="0.5" fill="#8b9cf7">
              <circle cx="340" cy="185" r="3"/>
              <circle cx="60" cy="215" r="2.5"/>
              <circle cx="310" cy="160" r="2"/>
            </g>
            <circle cx="200" cy="200" r="70" fill="url(#navGlow)" filter="url(#navBlur)"/>
            <circle cx="200" cy="200" r="35" fill="url(#navCore)"/>
            <ellipse cx="200" cy="200" rx="55" ry="10" fill="none" stroke="#8b9cf7" strokeWidth="2" opacity="0.4" className="obs-celestial__ring obs-celestial__ring--front"/>
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
        <nav className="obs-nav">
          {newer ? (
            <a href={`/observations/${newer.slug}`} className="obs-nav__card obs-nav__card--newer">
              <span className="obs-nav__label">← Newer</span>
              <span className="obs-nav__title">{newer.title}</span>
            </a>
          ) : (
            <span />
          )}
          <div className="obs-nav__center" />
          {older ? (
            <a href={`/observations/${older.slug}`} className="obs-nav__card obs-nav__card--older">
              <span className="obs-nav__label">Older →</span>
              <span className="obs-nav__title">{older.title}</span>
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}

      {related.length > 0 && (
        <section className="synapse-jumper">
          <h2 className="synapse-jumper__heading">Synapse Jumper</h2>
          <div className="synapse-jumper__grid">
            {related.map((r) => (
              <a key={r.id} href={`/observations/${r.slug}`} className="synapse-jumper__card">
                {r.art_image_path ? (
                  <div className="synapse-jumper__art-wrap">
                    <img
                      src={r.art_image_path}
                      alt={r.art_alt || r.title}
                      className="synapse-jumper__art"
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
    </div>
  );
}
