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
  songSummary?: string;
  hookLine?: string;
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
  songSummary,
  hookLine,
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
      href={href ?? `/writings/observations/${slug}`}
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
        {dateCaptured && (
          <div className="feed-entry__meta">
            <time className="feed-entry__date">
              {formatDate(dateCaptured)}
            </time>
          </div>
        )}

        <h2 className="feed-entry__title">
          {title}
        </h2>

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
