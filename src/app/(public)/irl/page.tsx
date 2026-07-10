import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";
import { POPUP_EVENT, POPUP_EVENT_LIVE } from "@/components/SuperIndividualPopup";
import { listPublishedUpcomingEvents, type EventRow } from "@/lib/events";

// DB events are dynamic; keep this page out of the static cache.
export const dynamic = "force-dynamic";

const DEFAULT_METADATA: Metadata = {
  title: "IRL Events",
  description:
    "Upcoming in-person events from Chad Lewine — pop-ups, live sets, talks, and the Super Individual Series.",
  alternates: { canonical: "https://chadlewine.com/irl" },
  openGraph: {
    title: "IRL Events — Chad Lewine",
    description:
      "Upcoming in-person events from Chad Lewine — pop-ups, live sets, talks, and the Super Individual Series.",
    url: "https://chadlewine.com/irl",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/irl", DEFAULT_METADATA);
}

function formatDateRange(startISO: string, endISO: string) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "America/New_York" });
  const dayFmt = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "America/New_York" });
  const yearFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "America/New_York" });
  const startMonth = monthFmt.format(start);
  const endMonth = monthFmt.format(end);
  const startDay = dayFmt.format(start);
  const endDay = dayFmt.format(end);
  const year = yearFmt.format(end);
  if (startMonth === endMonth && startDay === endDay) {
    return `${startMonth} ${startDay}, ${year}`;
  }
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
}

function eventDateLine(ev: EventRow): string {
  if (!ev.starts_at) return "Date TBA";
  if (ev.ends_at) return formatDateRange(ev.starts_at, ev.ends_at);
  return new Date(ev.starts_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: ev.timezone || "America/New_York",
  });
}

function eventVenueLine(ev: EventRow): string {
  const parts = [ev.venue_name, [ev.venue_city, ev.venue_state].filter(Boolean).join(", ")].filter(Boolean);
  return parts.join(" · ");
}

// Block-glyph ramp on each card, matching the Super Individual Night act cards.
function EventGlyph() {
  return (
    <span className="irl-event-card__glyph" aria-hidden="true">
      <span style={{ opacity: 0.22 }}>&#9608;</span>
      <span style={{ opacity: 0.45 }}>&#9608;</span>
      <span style={{ opacity: 0.7 }}>&#9608;</span>
      <span>&#9608;</span>
    </span>
  );
}

export default async function IRLPage() {
  const dateLine = formatDateRange(POPUP_EVENT.startISO, POPUP_EVENT.endISO);
  const venueLine = `${POPUP_EVENT.venue.name} · ${POPUP_EVENT.venue.city}, ${POPUP_EVENT.venue.state}`;
  const events = await listPublishedUpcomingEvents();
  const hasAny = POPUP_EVENT_LIVE || events.length > 0;

  return (
    <div className="irl-page">
      <section className="irl-page__header">
        <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h1 className="glyph-title-bar__heading">IRL Events</h1>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
        </div>
        <p className="irl-page__intro">
          In-person experiences. Pop-ups, live sets, talks, and the
          Super Individual Series.
        </p>
      </section>

      <section className="irl-events">
        {POPUP_EVENT_LIVE && (
          <Link href={POPUP_EVENT.pathname} className="irl-event-card" aria-label={`${POPUP_EVENT.name} — view event details`}>
            <EventGlyph />
            <span className="irl-event-card__kind">{dateLine}</span>
            <h2 className="irl-event-card__title">{POPUP_EVENT.name}</h2>
            <p className="irl-event-card__desc">
              Three days at Montgomery Mall. The wearable thesis on display,
              live painting all weekend, original songs performed in full,
              and the Rising Compass listening zone in the back of the
              room. A physical manifestation of the Super Individual Series.
            </p>
            <span className="irl-event-card__foot">
              <span className="irl-event-card__venue">{venueLine}</span>
              <span className="irl-event-card__cta">See event details &rarr;</span>
            </span>
          </Link>
        )}

        {events.map((ev) => (
          <Link key={ev.id} href={`/irl/${ev.slug}`} className="irl-event-card" aria-label={`${ev.title} — view event details`}>
            <EventGlyph />
            <span className="irl-event-card__kind">{eventDateLine(ev)}</span>
            <h2 className="irl-event-card__title">{ev.title}</h2>
            {ev.summary && <p className="irl-event-card__desc">{ev.summary}</p>}
            <span className="irl-event-card__foot">
              {eventVenueLine(ev) && <span className="irl-event-card__venue">{eventVenueLine(ev)}</span>}
              <span className="irl-event-card__cta">See event details &rarr;</span>
            </span>
          </Link>
        ))}

        {!hasAny && (
          <p className="irl-page__intro">
            No upcoming events right now. Check back soon.
          </p>
        )}
      </section>
    </div>
  );
}
