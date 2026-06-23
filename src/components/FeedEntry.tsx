import Link from "next/link";
import Image from "next/image";
import { formatDate } from "@/lib/utils";
import { focalCropStyle } from "@/lib/focal-crop";

// FeedEntry renders a single card with a title and an optional secondary line
// below it. The secondary line is intentionally split into entity-specific
// props so each context maps 1:1 to its source field in the database / admin:
//
//   songSummary  → songs.song_summary           (admin: "Song Summary")
//   hookLine     → observations.hook_line       (admin: "Hook Line")
//
// Add new entity-specific props as new entities use FeedEntry — never
// re-introduce a generic "summary" prop, since the whole point of the
// granular naming is to avoid losing track of what each line really is.
interface FeedEntryProps {
  title: string;
  slug: string;
  dateCaptured?: string;
  chipLabel?: string; // small kind tag shown above the title (e.g. "Observation")
  chipTone?: string; // modifier suffix -> .feed-entry__chip--{tone} for per-kind color
  songSummary?: string;
  hookLine?: string;
  lede?: string; // opening sentence of the post body
  artImageUrl?: string;
  artAlt?: string;
  href?: string;
  focalX?: number | null; // 0-100 (percent, matches DB column)
  focalY?: number | null;
  zoom?: number | null; // >= 1
}

export function FeedEntry({
  title,
  slug,
  dateCaptured,
  chipLabel,
  chipTone,
  songSummary,
  hookLine,
  lede,
  artImageUrl,
  artAlt,
  href,
  focalX,
  focalY,
  zoom,
}: FeedEntryProps) {
  const artStyle = focalCropStyle(focalX, focalY, zoom);
  return (
    <Link
      href={href ?? `/observations/${slug}`}
      className="feed-entry"
    >
      <div className="feed-entry__art-wrap">
        {artImageUrl && (
          <Image
            src={artImageUrl}
            alt={artAlt || title}
            className="feed-entry__art"
            fill
            sizes="(max-width: 720px) 100vw, (max-width: 1200px) 50vw, 600px"
            style={artStyle}
          />
        )}
      </div>

      <div className="feed-entry__content">
        {(chipLabel || dateCaptured) && (
          <div className="feed-entry__meta">
            {dateCaptured && (
              <time className="feed-entry__date">
                {formatDate(dateCaptured)}
              </time>
            )}
            {chipLabel && (
              <span className={`feed-entry__chip${chipTone ? ` feed-entry__chip--${chipTone}` : ""}`}>
                {chipLabel}
              </span>
            )}
          </div>
        )}

        <h2 className="feed-entry__title">
          {title}
        </h2>

        {lede && (
          <p className="feed-entry__lede">
            {lede}
          </p>
        )}

        {songSummary && (
          <p className="feed-entry__song-summary">
            {songSummary}
          </p>
        )}

        {hookLine && (
          <p className="feed-entry__hook">
            {hookLine}
          </p>
        )}
      </div>
    </Link>
  );
}
