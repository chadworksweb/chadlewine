import Link from "next/link";
import Image from "next/image";
import { formatDate } from "@/lib/utils";

interface FeedEntryProps {
  title: string;
  slug: string;
  dateCaptured: string;
  hookLine: string;
  artImageUrl?: string;
  artAlt?: string;
  href?: string;
}

export function FeedEntry({
  title,
  slug,
  dateCaptured,
  hookLine,
  artImageUrl,
  artAlt,
  href,
}: FeedEntryProps) {
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
          />
        )}
      </div>

      <div className="feed-entry__content">
        <div className="feed-entry__meta">
          <time className="feed-entry__date">
            {formatDate(dateCaptured)}
          </time>
        </div>

        <h2 className="feed-entry__title">
          {title}
        </h2>

        {hookLine && (
          <p className="feed-entry__hook">
            {hookLine}
          </p>
        )}
      </div>
    </Link>
  );
}
