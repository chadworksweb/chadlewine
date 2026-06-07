import { notFound } from "next/navigation";
import Image from "next/image";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { ProgressBar } from "@/components/ProgressBar";
import { ObservationJsonLd } from "@/components/ObservationJsonLd";
import { ImageObjectJsonLd } from "@/components/ImageObjectJsonLd";
import { formatDate } from "@/lib/utils";
import { AdminEditButton } from "@/components/AdminEditButton";
import { SynapseDisplay } from "@/components/SynapseDisplay";
import { YouMightAlsoLike } from "@/components/YouMightAlsoLike";
import { ExploreStrip } from "@/components/ExploreStrip";
import {
  getEntry,
  getAdjacentEntries,
  getSynapseEntries,
  getRelatedEntries,
  type EntryKind,
} from "@/lib/entries";

// Shared detail renderer for both /observations/[slug] and /journal/[slug].
// Same table, same layout; `kind` scopes every query and `basePath` prefixes
// every internal link so cross-navigation stays within the section.
interface EntryDetailProps {
  kind: EntryKind;
  basePath: string;
  slug: string;
  relatedLabel: string;
}

export async function EntryDetail({ kind, basePath, slug, relatedLabel }: EntryDetailProps) {
  const entry = await getEntry(kind, slug);
  if (!entry) notFound();

  const { newer, older } = await getAdjacentEntries(kind, entry.date_captured, entry.id);
  const synapseJumper = await getSynapseEntries(kind, entry.id, entry.thoughtline_ids || []);
  const synapseIds = synapseJumper.map((s: { id: string }) => s.id);
  const related = await getRelatedEntries(kind, entry.id, entry.category_ids || [], entry.tag_ids || [], synapseIds);

  return (
    <div id="page-observation" className="page-observation" data-observation-id={entry.id}>
      <AdminEditButton href={`/admin/observations/${entry.slug || entry.id}`} />
      <ObservationJsonLd
        title={entry.title}
        slug={entry.slug}
        description={entry.seo_description || entry.hook_line || entry.title}
        dateCaptured={entry.date_captured}
        publishedAt={entry.published_at}
        updatedAt={entry.updated_at}
        artImagePath={entry.art_image_path}
        artAlt={entry.art_alt}
        articleType={entry.article_type}
        paaPairs={entry.paa_pairs}
        basePath={basePath}
      />
      {entry.art_image_path && (
        <ImageObjectJsonLd
          url={entry.art_image_path}
          name={`Cover art for ${entry.title}`}
          description={entry.art_alt}
        />
      )}
      <ProgressBar />
      <section className="cover-hero">
        {entry.art_image_path && (
          <div className="cover-hero__art-wrap" style={{ position: "relative" }}>
            <Image
              src={entry.art_image_path}
              alt={entry.art_alt || entry.title}
              className="cover-hero__art"
              fill
              sizes="(max-width: 1200px) 100vw, 1200px"
              priority
            />
          </div>
        )}

        <div className="cover-hero__content">
          <h1 className="cover-hero__title cover-hero__title--observation">
            {entry.title}
          </h1>

          <div className="cover-hero__bar">
            <div className="cover-hero__meta">
              <time className="cover-hero__date">
                {formatDate(entry.date_captured)}
              </time>

              {entry.reading_time_minutes && (
                <>
                  <span className="cover-hero__sep">&bull;</span>
                  <span className="cover-hero__read-time">
                    {Math.max(1, Math.round(entry.reading_time_minutes))} min read
                  </span>
                </>
              )}
            </div>

            {entry.categories?.length > 0 && (
              <div className="cover-hero__cats">
                {entry.categories.map((c: { title: string; slug: string }, i: number) => (
                  <span key={c.slug}>
                    <span className="cover-hero__tag cover-hero__tag--cat">{c.title}</span>
                    {i < entry.categories.length - 1 && ", "}
                  </span>
                ))}
              </div>
            )}

            {entry.tags?.length > 0 && (
              <div className="cover-hero__tags">
                {entry.tags.map((t: { label: string; slug: string }, i: number) => (
                  <span key={t.slug}>
                    <span className="cover-hero__tag">#{t.label}</span>
                    {i < entry.tags.length - 1 && ", "}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <article className="observation-body">
        <div className="reading-column">
          <MarkdownRenderer html={entry.body} />
        </div>
      </article>

      <SynapseDisplay sourceType="observation" sourceId={entry.id} />

      <YouMightAlsoLike sourceType="observation" sourceId={entry.id} />

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
              <a href={`${basePath}/${newer.slug}`} className="obsv-nav__card obsv-nav__card--newer">
                <span className="obsv-nav__label">&larr; Newer</span>
                <span className="obsv-nav__title">{newer.title}</span>
              </a>
            ) : (
              <span />
            )}
            <div className="obsv-nav__center" />
            {older ? (
              <a href={`${basePath}/${older.slug}`} className="obsv-nav__card obsv-nav__card--older">
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
              <a key={r.id} href={`${basePath}/${r.slug}`} className="synapse-jumper__card">
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

      {related.length > 0 && (
        <section className="related-observations">
          <h2 className="related-observations__heading">{relatedLabel}</h2>
          <div className="related-observations__grid">
            {related.map((r: { id: string; title: string; slug: string; art_image_path: string | null; art_alt: string | null }) => (
              <a key={r.id} href={`${basePath}/${r.slug}`} className="related-observations__card">
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

      <ExploreStrip wrap />
    </div>
  );
}
