import Link from "next/link";
import { DomainTag } from "./DomainTag";
import { formatDate } from "@/lib/utils";

interface FeedEntryProps {
  title: string;
  slug: string;
  dateCaptured: string;
  domains: string[];
  hookLine: string;
  artImageUrl?: string;
  artAlt?: string;
}

export function FeedEntry({
  title,
  slug,
  dateCaptured,
  domains,
  hookLine,
  artImageUrl,
  artAlt,
}: FeedEntryProps) {
  return (
    <Link
      href={`/observations/${slug}`}
      className="feed-entry"
    >
      <div className="feed-entry__art-wrap">
        {artImageUrl && (
          <img
            src={artImageUrl}
            alt={artAlt || title}
            className="feed-entry__art"
          />
        )}
      </div>

      <div className="feed-entry__content">
        <div className="feed-entry__meta">
          <time className="feed-entry__date">
            {formatDate(dateCaptured)}
          </time>
          {domains.map((d) => (
            <DomainTag key={d} slug={d} />
          ))}
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
