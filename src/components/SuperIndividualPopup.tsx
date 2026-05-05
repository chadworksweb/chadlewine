import Link from "next/link";
import { Prompt } from "@/components/Prompt";

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
  url: "https://chadlewine.com/super-individual",
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

export function SuperIndividualPopupSection() {
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="explore-songs__frame explore-songs__frame--top">
        <span className="explore-songs__frame-label" aria-hidden="true">░▒▓█</span>
        <h2 className="explore-songs__heading" id="si-popup-heading">
          The Super Individual Pop-Up
        </h2>
        <span className="explore-songs__frame-label" aria-hidden="true">█▓▒░</span>
      </div>

      <div className="si-popup__inner">
        <div className="si-popup__header">
          <span className="si-popup__eyebrow">Three Days Only — Live Pop-Up</span>
        </div>

        <div className="si-popup__grid">
          <div className="si-popup__media">
            <Prompt label="Pop-up hero image">
              Photo or graphic that anchors the event. Storefront mock-up, performance shot, or a typographic graphic. Aspect roughly 4:3. Replace this block with the actual image when ready.
            </Prompt>
          </div>

          <div className="si-popup__meta">
            <dl className="si-popup__details">
              <div className="si-popup__detail">
                <dt>Dates</dt>
                <dd>June 26 – 28, 2026</dd>
              </div>
              <div className="si-popup__detail">
                <dt>Venue</dt>
                <dd>
                  {v.name}
                  <br />
                  <span className="si-popup__address">
                    {v.streetAddress}, {v.city}, {v.state} {v.postalCode}
                  </span>
                </dd>
              </div>
              <div className="si-popup__detail">
                <dt>Hours</dt>
                <dd>
                  {POPUP_EVENT.hours.map((h) => (
                    <div key={h.day}>
                      <strong>{h.day}</strong> — {h.time}
                    </div>
                  ))}
                </dd>
              </div>
              <div className="si-popup__detail">
                <dt>Inside</dt>
                <dd>Live painting all day. Talks, discourse, and live sets scheduled across the weekend.</dd>
              </div>
            </dl>

            <div className="si-popup__cta-row">
              <a
                href={googleCalendarLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="si-popup__cta si-popup__cta--primary"
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
          </div>
        </div>

        <div className="si-popup__concept">
          <Prompt label="Pop-up concept paragraph">
            Two-to-three sentences describing what's actually happening in the room. Keep it physical: front window broadcasts a live jukebox where strangers pick a song and you sing it on the spot, lyrics scrolling huge inside; back of the space is the Rising Compass listening zone. Anchor song: "Malls Back." Voice should be gravitas, not hype.
          </Prompt>
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
