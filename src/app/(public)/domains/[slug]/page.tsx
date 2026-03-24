import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { getDomains, getDomainLabel } from "@/lib/domains";
import { FeedEntry } from "@/components/FeedEntry";
import { DomainTag } from "@/components/DomainTag";

export const revalidate = 60;

export async function generateStaticParams() {
  const domains = await getDomains();
  return domains.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const domains = await getDomains();
  const label = getDomainLabel(slug, domains);
  return {
    title: label,
    description: `Observations on ${label}`,
  };
}

export default async function DomainPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const domains = await getDomains();
  const label = getDomainLabel(slug, domains);

  if (!domains.find((d) => d.slug === slug)) notFound();

  const supabase = createPublicClient();

  const { data: domainLinks } = await supabase
    .from("observation_domains")
    .select("observation_id")
    .eq("domain_slug", slug);

  const ids = domainLinks?.map((d) => d.observation_id) || [];

  let observations: Array<{
    id: string;
    title: string;
    slug: string;
    date_captured: string;
    published_at: string | null;
    art_image_path: string | null;
    art_alt: string | null;
    hook_line: string | null;
    domains: string[];
  }> = [];

  if (ids.length > 0) {
    const { data } = await supabase
      .from("observations")
      .select("id, title, slug, date_captured, published_at, art_image_path, art_alt, hook_line")
      .eq("status", "published")
      .in("id", ids)
      .order("published_at", { ascending: false });

    const { data: allDomains } = await supabase
      .from("observation_domains")
      .select("observation_id, domain_slug")
      .in("observation_id", ids);

    const domainMap = new Map<string, string[]>();
    allDomains?.forEach((d) => {
      const existing = domainMap.get(d.observation_id) || [];
      existing.push(d.domain_slug);
      domainMap.set(d.observation_id, existing);
    });

    observations = (data || []).map((o) => ({
      ...o,
      domains: domainMap.get(o.id) || [],
    }));
  }

  return (
    <div id="page-domain" className="page-domain">
      <div className="page-domain__layout">
        <div className="page-domain__main">
          <h1 className="page-domain__title">
            {label}
          </h1>
          <p className="page-domain__count">
            {observations.length} observation{observations.length !== 1 ? "s" : ""}
          </p>

          {observations.length > 0 ? (
            <div className="page-domain__feed">
              {observations.map((obs) => (
                <FeedEntry
                  key={obs.slug}
                  title={obs.title}
                  slug={obs.slug}
                  dateCaptured={obs.published_at || obs.date_captured}
                  domains={obs.domains}
                  hookLine={obs.hook_line || ""}
                  artImageUrl={obs.art_image_path || ""}
                  artAlt={obs.art_alt || obs.title}
                />
              ))}
            </div>
          ) : (
            <p className="empty-state__message">No observations in this domain yet.</p>
          )}
        </div>

        <aside className="domain-sidebar">
          <h2 className="domain-sidebar__heading">
            All Domains
          </h2>
          <div className="domain-sidebar__tags">
            {domains.map((d) => (
              <DomainTag key={d.slug} slug={d.slug} label={d.label} size="md" />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
