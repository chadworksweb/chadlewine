import type { Metadata } from "next";
import Link from "next/link";
import { getEventByCheckinToken, type EventRow } from "@/lib/events";
import { EventCheckinForm } from "@/components/EventCheckinForm";

export const dynamic = "force-dynamic";

// Reached by scanning the venue QR. Never index a check-in page.
export const metadata: Metadata = {
  title: "Check in — Chad Lewine",
  robots: { index: false, follow: false },
};

function whenLine(ev: EventRow): string {
  if (!ev.starts_at) return "";
  const tz = ev.timezone || "America/New_York";
  const start = new Date(ev.starts_at);
  const date = start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
  const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return `${date} · ${time}`;
}

function venueLine(ev: EventRow): string {
  return [ev.venue_name, [ev.venue_city, ev.venue_state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
}

export default async function CheckinPage(
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ev = await getEventByCheckinToken(token);

  return (
    <div className="page-songwriting page-event page-event--checkin">
      <section className="si-hero event-checkin-hero" aria-label="Check in">
        <div className="si-hero__inner event-checkin-hero__inner">
          <p className="event-hero__eyebrow event-hero__eyebrow--center">
            <span className="event-glyph" aria-hidden="true">
              <span style={{ opacity: 0.22 }}>&#9608;</span>
              <span style={{ opacity: 0.45 }}>&#9608;</span>
              <span style={{ opacity: 0.7 }}>&#9608;</span>
              <span>&#9608;</span>
            </span>
            <span>Check in</span>
          </p>

          {!ev ? (
            <>
              <h1 className="event-hero__title event-checkin-hero__title">This link isn&rsquo;t valid</h1>
              <p className="event-checkin-hero__msg">
                Double-check the QR at the door, or find a host to get you in.
              </p>
            </>
          ) : !ev.checkin_enabled ? (
            <>
              <h1 className="event-hero__title event-checkin-hero__title">{ev.title}</h1>
              {whenLine(ev) && <p className="event-checkin-hero__when">{whenLine(ev)}</p>}
              <p className="event-checkin-hero__msg">
                Check-in isn&rsquo;t open yet. Hold tight, or find a host at the door.
              </p>
            </>
          ) : (
            <>
              <h1 className="event-hero__title event-checkin-hero__title">{ev.title}</h1>
              <p className="event-checkin-hero__when">
                {[whenLine(ev), venueLine(ev)].filter(Boolean).join("  /  ")}
              </p>
              <p className="event-checkin-hero__msg">Confirm your email to check in.</p>
              <EventCheckinForm token={token} />
            </>
          )}

          <nav className="event-checkin-hero__foot">
            <Link href="/irl" className="event-page__breadcrumb-link">Chad Lewine — IRL Events</Link>
          </nav>
        </div>
      </section>
    </div>
  );
}
