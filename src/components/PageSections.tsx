import type { ReactNode } from "react";
import { ReleaseTrackGrid, type ReleaseTrackGridTrack } from "@/components/ReleaseTrackGrid";
import { getTracksForSource } from "@/lib/page-section-data";
import type { PageRow, PageSectionRow } from "@/lib/pages";

// Renders a DB page from its typed sections, reproducing the si-* / glyph-bar
// markup the code pages use. Prompts are first-class rows nested inside their
// group's si-prose box (data.group + placement/order, or faqIndex for FAQ).
// See the section data contract in scripts/seed-pages-cms.ts.

const GLYPH_L = "░▒▓█"; // light-to-full blocks
const GLYPH_R = "█▓▒░"; // full-to-light blocks

type SectionData = Record<string, unknown>;
const str = (d: SectionData, k: string): string | undefined =>
  typeof d[k] === "string" ? (d[k] as string) : undefined;

function Banner({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className="si-banner-bar">
      <div className="glyph-title-bar glyph-title-bar--top">
        <span className="glyph-title-bar__label" aria-hidden="true">{GLYPH_L}</span>
        <h2 className="glyph-title-bar__heading" id={id}>{children}</h2>
        <span className="glyph-title-bar__label" aria-hidden="true">{GLYPH_R}</span>
      </div>
    </div>
  );
}

// An open prompt renders the WRITE scaffold; a filled prompt renders its copy.
function PromptBlock({ section }: { section: PageSectionRow }) {
  if (section.status === "filled" && section.body) {
    return <div dangerouslySetInnerHTML={{ __html: section.body }} />;
  }
  return (
    <p className="sw-prompt">
      <strong>WRITE:</strong> {section.body}
    </p>
  );
}

function groupPrompts(
  byGroup: Map<string, PageSectionRow[]>,
  anchor: string,
  placement: "before" | "after",
): PageSectionRow[] {
  return (byGroup.get(anchor) || [])
    .filter((p) => ((p.data?.placement as string) || "after") === placement)
    .sort((a, b) => ((a.data?.order as number) || 0) - ((b.data?.order as number) || 0));
}

export async function PageSections({
  page,
  sections,
  wrapperId,
  wrapperClassName = "page-static",
}: {
  page: PageRow;
  sections: PageSectionRow[];
  wrapperId?: string;
  wrapperClassName?: string;
}) {
  const ordered = [...sections].sort((a, b) => a.position - b.position);

  // Prompts grouped by their container anchor.
  const promptsByGroup = new Map<string, PageSectionRow[]>();
  for (const s of ordered) {
    if (s.type !== "prompt") continue;
    const g = (s.data?.group as string) || "";
    if (!promptsByGroup.has(g)) promptsByGroup.set(g, []);
    promptsByGroup.get(g)!.push(s);
  }

  // Pre-fetch live track data for track-grid sections.
  const tracksBySection = new Map<string, ReleaseTrackGridTrack[]>();
  for (const s of ordered) {
    if (s.type === "track-grid") {
      tracksBySection.set(s.id, await getTracksForSource(str(s.data || {}, "source")));
    }
  }

  const hero = ordered.find((s) => s.type === "hero");
  const containers = ordered.filter((s) => s.type !== "prompt" && s.type !== "hero");

  // ItemList JSON-LD from the first track-grid (mirrors the old page).
  const gridSection = ordered.find((s) => s.type === "track-grid");
  const gridTracks = gridSection ? tracksBySection.get(gridSection.id) || [] : [];
  const canonical = `https://chadlewine.com/${page.slug}`;
  const itemListJsonLd =
    gridTracks.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${page.title} - Chad Lewine`,
          url: canonical,
          itemListOrder: "https://schema.org/ItemListOrderDescending",
          numberOfItems: gridTracks.length,
          itemListElement: gridTracks.map((t, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `https://chadlewine.com/music/songs/${t.slug}`,
            name: t.title,
          })),
        }
      : null;

  return (
    <div id={wrapperId} className={wrapperClassName}>
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}

      {hero && (
        <section className="si-hero" aria-label={str(hero.data || {}, "headline") || page.title}>
          <div className="si-hero__inner">
            {str(hero.data || {}, "eyebrow") && (
              <p className="si-hero__eyebrow">{str(hero.data || {}, "eyebrow")}</p>
            )}
            <h1 className="si-hero__headline">{str(hero.data || {}, "headline") || page.title}</h1>
          </div>
        </section>
      )}

      {containers.map((s) => {
        const anchor = (s.data?.anchor as string) || s.id;
        const headingId = `${anchor}-heading`;

        if (s.type === "track-grid") {
          const tracks = tracksBySection.get(s.id) || [];
          if (tracks.length > 0) {
            return (
              <ReleaseTrackGrid key={s.id} tracks={tracks} heading={s.heading || "Tracks"} />
            );
          }
          return (
            <section key={s.id} className="si-section" aria-label={s.heading || "List"}>
              <Banner id={headingId}>{s.heading}</Banner>
              <div className="si-prose">
                <p>The list is being gathered. Come back soon.</p>
              </div>
            </section>
          );
        }

        if (s.type === "faq") {
          const items = (s.data?.items as Array<{ question: string }>) || [];
          const faqPrompts = promptsByGroup.get(anchor) || [];
          return (
            <section key={s.id} className="si-section" id={anchor} aria-labelledby={headingId}>
              <Banner id={headingId}>{s.heading}</Banner>
              <div className="si-prose">
                {items.map((item, i) => {
                  const ans = faqPrompts.find((p) => (p.data?.faqIndex as number) === i);
                  return (
                    <div key={i}>
                      <h3>{item.question}</h3>
                      {ans ? <PromptBlock section={ans} /> : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        }

        if (s.type === "favorites") {
          const items =
            (s.data?.items as Array<{ artist: string; title: string; runtime: string; note: string }>) || [];
          return (
            <section key={s.id} className="si-section" id={anchor} aria-labelledby={headingId}>
              <Banner id={headingId}>{s.heading}</Banner>
              <div className="si-prose">
                {items.length === 0 ? (
                  groupPrompts(promptsByGroup, anchor, "after").map((p) => (
                    <PromptBlock key={p.id} section={p} />
                  ))
                ) : (
                  <ul className="sw-audiences">
                    {items.map((f) => (
                      <li key={`${f.artist}-${f.title}`}>
                        <strong>{f.artist} &mdash; {f.title}</strong> ({f.runtime}) {f.note}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          );
        }

        // prose / research (and any future banner+prose container).
        return (
          <section key={s.id} className="si-section" id={anchor} aria-labelledby={headingId}>
            <Banner id={headingId}>{s.heading}</Banner>
            <div className="si-prose">
              {groupPrompts(promptsByGroup, anchor, "before").map((p) => (
                <PromptBlock key={p.id} section={p} />
              ))}
              {s.body && <div dangerouslySetInnerHTML={{ __html: s.body }} />}
              {groupPrompts(promptsByGroup, anchor, "after").map((p) => (
                <PromptBlock key={p.id} section={p} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
