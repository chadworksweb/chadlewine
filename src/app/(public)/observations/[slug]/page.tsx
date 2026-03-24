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

  const related = await getRelatedObservations(obs.id, obs.domains);

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
