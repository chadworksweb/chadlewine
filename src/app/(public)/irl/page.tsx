import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";
import { POPUP_EVENT } from "@/components/SuperIndividualPopup";

const DEFAULT_METADATA: Metadata = {
  title: "IRL Events — Chad Lewine",
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
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
}

export default function IRLPage() {
  const dateLine = formatDateRange(POPUP_EVENT.startISO, POPUP_EVENT.endISO);
  const venueLine = `${POPUP_EVENT.venue.name} · ${POPUP_EVENT.venue.city}, ${POPUP_EVENT.venue.state}`;

  return (
    <div className="irl-page">
      <section className="irl-page__header">
        <div className="explore-songs__frame explore-songs__frame--top">
          <span className="explore-songs__frame-label" aria-hidden="true">░▒▓█</span>
          <h1 className="explore-songs__heading">IRL Events</h1>
          <span className="explore-songs__frame-label" aria-hidden="true">█▓▒░</span>
        </div>
        <p className="irl-page__intro">
          In-person experiences. Pop-ups, live sets, talks, and the
          Super Individual Series.
        </p>
      </section>

      <section className="irl-events">
        <Link href={POPUP_EVENT.pathname} className="irl-event-card" aria-label={`${POPUP_EVENT.name} — view event details`}>
          <div className="irl-event-card__status">
            <span className="irl-event-card__status-dot" aria-hidden="true" />
            Upcoming
          </div>
          <h2 className="irl-event-card__title">{POPUP_EVENT.name}</h2>
          <div className="irl-event-card__meta">
            <span className="irl-event-card__date">{dateLine}</span>
            <span className="irl-event-card__sep" aria-hidden="true">/</span>
            <span className="irl-event-card__venue">{venueLine}</span>
          </div>
          <p className="irl-event-card__desc">
            Three days at Montgomery Mall. The wearable thesis on display,
            live painting all weekend, original songs performed in full,
            and the Rising Compass listening zone in the back of the
            room. A physical manifestation of the Super Individual Series.
          </p>
          <span className="irl-event-card__cta">See event details &rarr;</span>
        </Link>
      </section>
    </div>
  );
}
