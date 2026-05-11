import Link from "next/link";

// Event constants. When the page is cloned to a dedicated event detail
// route, lift these into a shared module. Edit them in one place to keep
// the JSON-LD schema, the human copy, and the calendar link in sync.
export const POPUP_EVENT = {
  name: "Chad Lewine's Super Individual Pop-Up",
  slug: "super-individual-popup-montgomery-mall-2026-06",
  startISO: "2026-06-26T10:00:00-04:00",
  endISO: "2026-06-28T18:00:00-04:00",
  hours: [
    { day: "Friday, June 26", time: "10am – 8pm" },
    { day: "Saturday, June 27", time: "10am – 8pm" },
    { day: "Sunday, June 28", time: "11am – 6pm" },
  ],
  venue: {
    name: "Montgomery Mall",
    streetAddress: "1500 Bethlehem Pike",
    city: "North Wales",
    state: "PA",
    postalCode: "19454",
    country: "US",
    latitude: 40.2229,
    longitude: -75.2557,
  },
  performer: {
    name: "Chad Lewine",
    url: "https://chadlewine.com",
  },
  organizer: {
    name: "Chad Lewine",
    url: "https://chadlewine.com",
  },
  /** Canonical URL for the event (where Event JSON-LD points). The popup
     section is embedded on /super-individual as a teaser, but the
     authoritative event page is /irl/super-individual-pop-up. */
  url: "https://chadlewine.com/irl/super-individual-pop-up",
  pathname: "/irl/super-individual-pop-up",
};

// Daily schedule — placeholder slots for talk / discourse / live-set, plus
// live-painting running as an all-day ambient activity. Replace times and
// add real titles once the program is locked. Order varies day-to-day on
// purpose so no two days feel identical.
type ScheduleKind = "painting" | "talk" | "discourse" | "live-set";

interface ScheduleSlot {
  time: string;
  kind: ScheduleKind;
  label: string;
  description: string;
}

interface ScheduleDay {
  day: string;
  date: string;
  hours: string;
  slots: ScheduleSlot[];
}

const KIND_LABEL: Record<ScheduleKind, string> = {
  painting: "Live Painting",
  talk: "Talk",
  discourse: "Discourse",
  "live-set": "Live Set",
};

const KIND_BLURB: Record<ScheduleKind, string> = {
  painting:
    "Chad paints in front of the glass, all day, every day. The work travels home on someone's wall.",
  talk: "Chad on the mic — a monologue on a Super Individual theme. Sit, stand, walk past, listen.",
  discourse:
    "The floor opens. What's broken, what to do about it, what to build instead. Not self-help — structural. Anyone can speak.",
  "live-set": "Chad performs his own songs, full-length. The catalog you hear in here goes home with you on a hoodie.",
};

export const POPUP_SCHEDULE: ScheduleDay[] = [
  {
    day: "Friday",
    date: "June 26",
    hours: "10am – 8pm",
    slots: [
      { time: "All day", kind: "painting", label: KIND_LABEL.painting, description: KIND_BLURB.painting },
      { time: "12:30 PM", kind: "live-set", label: KIND_LABEL["live-set"], description: KIND_BLURB["live-set"] },
      { time: "3:00 PM", kind: "talk", label: KIND_LABEL.talk, description: KIND_BLURB.talk },
      { time: "6:00 PM", kind: "discourse", label: KIND_LABEL.discourse, description: KIND_BLURB.discourse },
    ],
  },
  {
    day: "Saturday",
    date: "June 27",
    hours: "10am – 8pm",
    slots: [
      { time: "All day", kind: "painting", label: KIND_LABEL.painting, description: KIND_BLURB.painting },
      { time: "11:30 AM", kind: "talk", label: KIND_LABEL.talk, description: KIND_BLURB.talk },
      { time: "2:00 PM", kind: "discourse", label: KIND_LABEL.discourse, description: KIND_BLURB.discourse },
      { time: "5:30 PM", kind: "live-set", label: KIND_LABEL["live-set"], description: KIND_BLURB["live-set"] },
    ],
  },
  {
    day: "Sunday",
    date: "June 28",
    hours: "11am – 6pm",
    slots: [
      { time: "All day", kind: "painting", label: KIND_LABEL.painting, description: KIND_BLURB.painting },
      { time: "12:30 PM", kind: "discourse", label: KIND_LABEL.discourse, description: KIND_BLURB.discourse },
      { time: "2:30 PM", kind: "live-set", label: KIND_LABEL["live-set"], description: KIND_BLURB["live-set"] },
      { time: "4:30 PM", kind: "talk", label: KIND_LABEL.talk, description: KIND_BLURB.talk },
    ],
  },
];

function googleMapsLink() {
  const v = POPUP_EVENT.venue;
  const q = encodeURIComponent(`${v.name}, ${v.streetAddress}, ${v.city}, ${v.state} ${v.postalCode}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function googleCalendarLink() {
  const fmt = (iso: string) =>
    iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = fmt(new Date(POPUP_EVENT.startISO).toISOString());
  const end = fmt(new Date(POPUP_EVENT.endISO).toISOString());
  const v = POPUP_EVENT.venue;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: POPUP_EVENT.name,
    dates: `${start}/${end}`,
    details: `Three days of live painting, talks, discourse, and live sets. Super Individual merch on display, Rising Compass listening zone in back. Full schedule: ${POPUP_EVENT.url}#schedule`,
    location: `${v.name}, ${v.streetAddress}, ${v.city}, ${v.state} ${v.postalCode}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

interface PopupSectionProps {
  /** Render the Event JSON-LD. Only true on the canonical event page
     (/irl/super-individual-pop-up). When the section is embedded on
     /super-individual as a teaser, JSON-LD must NOT render — search
     engines should see one authoritative MusicEvent, not two. */
  includeEventSchema?: boolean;
  /** Show the "See full event details →" link directing readers to the
     canonical event page. True only when this section is embedded on a
     page OTHER than the event page itself. */
  showEventPageLink?: boolean;
}

export function SuperIndividualPopupSection({
  includeEventSchema = false,
  showEventPageLink = false,
}: PopupSectionProps = {}) {
  const v = POPUP_EVENT.venue;

  // Event JSON-LD. Maximally populated for Google Events / rich results.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: POPUP_EVENT.name,
    description:
      "A three-day pop-up at Montgomery Mall: live performance, the Super Individual merch line, and the Rising Compass diagnostic. Front of the storefront broadcasts a request-driven jukebox; the back of the room is the Rising Compass listening zone.",
    startDate: POPUP_EVENT.startISO,
    endDate: POPUP_EVENT.endISO,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: v.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: v.streetAddress,
        addressLocality: v.city,
        addressRegion: v.state,
        postalCode: v.postalCode,
        addressCountry: v.country,
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: v.latitude,
        longitude: v.longitude,
      },
    },
    performer: {
      "@type": "Person",
      name: POPUP_EVENT.performer.name,
      url: POPUP_EVENT.performer.url,
    },
    organizer: {
      "@type": "Person",
      name: POPUP_EVENT.organizer.name,
      url: POPUP_EVENT.organizer.url,
    },
    offers: {
      "@type": "Offer",
      url: POPUP_EVENT.url,
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      validFrom: "2026-05-05T00:00:00-04:00",
    },
    image: [`${POPUP_EVENT.url}#popup`],
    url: POPUP_EVENT.url,
  };

  return (
    <section className="si-popup" id="popup" aria-labelledby="si-popup-heading">
      {includeEventSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      <div className="explore-songs__frame explore-songs__frame--top">
        <span className="explore-songs__frame-label" aria-hidden="true">░▒▓█</span>
        <h2 className="explore-songs__heading" id="si-popup-heading">
          The Super Individual Pop-Up
        </h2>
        <span className="explore-songs__frame-label" aria-hidden="true">█▓▒░</span>
      </div>

      <div className="si-popup__media si-popup__media--full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/super-individual/popup-hero.webp"
          alt="Chad Lewine — Super Individual Pop-Up"
          className="si-popup__media-img"
        />
      </div>

      <div className="si-popup__inner">
        <div className="si-popup__meta-row">
          <div className="si-popup__info-cell">
            <span className="si-popup__info-label">Dates</span>
            <div className="si-popup__info-value si-popup__info-value--display">June 26 – 28, 2026</div>
          </div>
          <div className="si-popup__info-cell">
            <span className="si-popup__info-label">Venue</span>
            <div className="si-popup__info-value si-popup__info-value--display">{v.name}</div>
            <span className="si-popup__address">
              {v.streetAddress}, {v.city}, {v.state} {v.postalCode}
            </span>
          </div>
          <div className="si-popup__info-cell">
            <span className="si-popup__info-label">Hours</span>
            <ul className="si-popup__hours">
              {POPUP_EVENT.hours.map((h) => (
                <li key={h.day}>
                  <span className="si-popup__hours-day">{h.day}</span>
                  <span className="si-popup__hours-time">{h.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="si-popup__cta-grid">
          {showEventPageLink && (
            <Link
              href={POPUP_EVENT.pathname}
              className="si-popup__cta si-popup__cta--primary"
            >
              See full event details &rarr;
            </Link>
          )}
          <a
            href={googleCalendarLink()}
            target="_blank"
            rel="noopener noreferrer"
            className={`si-popup__cta${showEventPageLink ? "" : " si-popup__cta--primary"}`}
          >
            Add to calendar
          </a>
          <a
            href={googleMapsLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="si-popup__cta"
          >
            Get directions
          </a>
          <Link href="#popup-notify" className="si-popup__cta">
            Tell me when it starts
          </Link>
        </div>

        <div className="si-popup__concept si-prose">
          <p>
            Now, I would like to invite you to join me and experience the physical manifestation of my life&rsquo;s work thus far as described above: Chad Lewine&rsquo;s Super Individual Pop Up at Montgomery Mall in North Wales, PA, about an hour outside of Philadelphia and 2 hours away from NYC.
          </p>
          <p>
            This event-experience is a solution to the fact that I have been rejected by all current institutions that hold art, music and apparel: art galleries, music venues and fashion retailers. All of these institutions have boxes that you must check or you are not allowed in.
          </p>
          <p>
            It&rsquo;s no wonder they won&rsquo;t let me in: my mission, my initiatives and my entire existence are a threat to all that they are: structural, institutional hierarchy, control and programming. My initiatives are designed to help individuals see through the very facades that these institutions operate under, so it&rsquo;s no wonder that they don&rsquo;t want to promote my message. Yet, here I am, having found a space in a mall&mdash;a place we perceive as a dying industry yet maybe just the Third Place we need at this time of isolation. And I believe, as does the administrator of this pop-up program, that dead malls might just be the existing infrastructure for the community hubs that we are so desperately seeking: places and space for physical experience, both free and paid, that we are starved of in an age of social media, digital, virtual burnout.
          </p>
          <p>
            Come. Meet me face to face. Come experience all of the above in real time, real world, real life. Come reclaim your power. Become the Super Individual you were born to be.
          </p>
        </div>
      </div>

      <div id="schedule" className="si-schedule">
        <div className="explore-songs__frame explore-songs__frame--top">
          <span className="explore-songs__frame-label" aria-hidden="true">░▒▓█</span>
          <h3 className="explore-songs__heading">Three-Day Schedule</h3>
          <span className="explore-songs__frame-label" aria-hidden="true">█▓▒░</span>
        </div>

        <div className="si-schedule__inner">
          <p className="si-schedule__lede">
            Times are placeholders. Final program will be confirmed closer to the date. Live painting runs continuously while the doors are open.
          </p>

          <div className="si-schedule__grid">
            {POPUP_SCHEDULE.map((day) => (
              <article key={day.day} className="si-schedule__day">
                <header className="si-schedule__day-header">
                  <span className="si-schedule__day-name">{day.day}</span>
                  <span className="si-schedule__day-date">{day.date}</span>
                  <span className="si-schedule__day-hours">{day.hours}</span>
                </header>

                <ol className="si-schedule__slots">
                  {day.slots.map((slot, i) => (
                    <li key={i} className={`si-schedule__slot si-schedule__slot--${slot.kind}`}>
                      <span className="si-schedule__time">{slot.time}</span>
                      <div className="si-schedule__body">
                        <span className={`si-schedule__pill si-schedule__pill--${slot.kind}`}>
                          {slot.label}
                        </span>
                        <p className="si-schedule__desc">{slot.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>

          <p className="si-schedule__note">
            Talks are short, structural, and skippable. Discourse is open mic — anyone can take it. Live sets are full songs from the catalog.
          </p>
        </div>
      </div>
    </section>
  );
}
