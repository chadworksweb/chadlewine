import { CoverHero } from "@/components/CoverHero";
import { FeedEntry } from "@/components/FeedEntry";
import { getEntriesArchive, type EntryKind } from "@/lib/entries";

// Shared archive renderer for both /writings/observations and /writings/journal. The two sections
// are structurally identical (same table, same card components) and differ only
// by `kind` + the URL prefix (`basePath`). Styling classes are reused as-is.
interface EntryArchiveProps {
  kind: EntryKind;
  basePath: string;
  ctaLabel?: string;
  emptyMessage: string;
}

export async function EntryArchive({
  kind,
  basePath,
  ctaLabel,
  emptyMessage,
}: EntryArchiveProps) {
  const entries = await getEntriesArchive(kind);

  const latest = entries[0];
  const feed = entries.slice(1);

  return (
    <div id={`page-${kind}s`} className="page-home">
      {latest && (
        <CoverHero
          title={latest.title}
          slug={latest.slug}
          dateCaptured={latest.date_captured}
          hookLine={latest.hook_line || ""}
          artImageUrl={latest.art_image_path || ""}
          artAlt={latest.art_alt || latest.title}
          href={`${basePath}/${latest.slug}`}
          ctaLabel={ctaLabel}
        />
      )}

      <div className="observations-archive">
        {feed.length > 0 && (
          <div className="observations-grid">
            {feed.map((entry) => (
              <FeedEntry
                key={entry.slug}
                title={entry.title}
                slug={entry.slug}
                dateCaptured={entry.date_captured}
                hookLine={entry.hook_line || ""}
                artImageUrl={entry.art_image_path || ""}
                artAlt={entry.art_alt || entry.title}
                href={`${basePath}/${entry.slug}`}
              />
            ))}
          </div>
        )}
      </div>

      {entries.length === 0 && (
        <section className="empty-state">
          <p className="empty-state__message">{emptyMessage}</p>
        </section>
      )}
    </div>
  );
}
