import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { mergeMetadata } from "@/lib/page-meta";
import { markdownToHtml } from "@/lib/markdown";
import { siteOrigin } from "@/lib/resend";
import { getPublishedEventBySlug, type EventRow } from "@/lib/events";
import { EventRsvpForm } from "@/components/EventRsvpForm";
import { EventShareButton } from "@/components/EventShareButton";

export const dynamic = "force-dynamic";

function dateRangeDisplay(ev: EventRow): string {
  if (!ev.starts_at) return "Date to be announced";
  const tz = ev.timezone || "America/New_York";
  const start = new Date(ev.starts_at);
  const monthDayFmt = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: tz });
  const yearFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: tz });
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: tz });
  const dayFmt = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: tz });
  if (!ev.ends_at) return `${monthDayFmt.format(start)}, ${yearFmt.format(start)}`;
  const end = new Date(ev.ends_at);
  const sameDay = monthDayFmt.format(start) === monthDayFmt.format(end);
  if (sameDay) return `${monthDayFmt.format(start)}, ${yearFmt.format(end)}`;
  const sameMonth = monthFmt.format(start) === monthFmt.format(end);
  if (sameMonth) return `${monthFmt.format(start)} ${dayFmt.format(start)} – ${dayFmt.format(end)}, ${yearFmt.format(end)}`;
  return `${monthDayFmt.format(start)} – ${monthDayFmt.format(end)}, ${yearFmt.format(end)}`;
}

function timeDisplay(ev: EventRow): string {
  if (!ev.starts_at) return "";
  const tz = ev.timezone || "America/New_York";
  const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const start = new Date(ev.starts_at);
  if (!ev.ends_at) return timeFmt.format(start);
  const end = new Date(ev.ends_at);
  const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz });
  const sameDay = dayFmt.format(start) === dayFmt.format(end);
  return sameDay
    ? `${timeFmt.format(start)} – ${timeFmt.format(end)}`
    : `${timeFmt.format(start)} – ${dayFmt.format(end)}, ${timeFmt.format(end)}`;
}

function googleMapsLink(ev: EventRow): string | null {
  const parts = [ev.venue_name, ev.venue_address, ev.venue_city, ev.venue_state].filter(Boolean);
  if (parts.length === 0) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(", "))}`;
}

function googleCalendarLink(ev: EventRow): string | null {
  if (!ev.starts_at) return null;
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = fmt(ev.starts_at);
  const end = fmt(ev.ends_at || ev.starts_at);
  const location = [ev.venue_name, ev.venue_address, ev.venue_city, ev.venue_state].filter(Boolean).join(", ");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${start}/${end}`,
    ...(ev.summary ? { details: ev.summary } : {}),
    ...(location ? { location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const ev = await getPublishedEventBySlug(slug);
  if (!ev) return { title: "Event — Chad Lewine" };

  const url = `${siteOrigin()}/irl/${ev.slug}`;
  const title = ev.seo_title || `${ev.title} — Chad Lewine`;
  const description = ev.seo_description || ev.summary || `An in-person event with Chad Lewine.`;
  const base: Metadata = {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
  };
  return mergeMetadata(`/irl/${ev.slug}`, base);
}

export default async function EventDetailPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ev = await getPublishedEventBySlug(slug);
  if (!ev) notFound();

  const bodyHtml = ev.body ? await markdownToHtml(ev.body) : "";
  const url = `${siteOrigin()}/irl/${ev.slug}`;
  const mapsUrl = googleMapsLink(ev);
  const calUrl = googleCalendarLink(ev);
  const dates = dateRangeDisplay(ev);
  const time = timeDisplay(ev);

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: ev.title,
    ...(ev.summary ? { description: ev.summary } : {}),
    ...(ev.starts_at ? { startDate: ev.starts_at } : {}),
    ...(ev.ends_at ? { endDate: ev.ends_at } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(ev.venue_name
      ? {
          location: {
            "@type": "Place",
            name: ev.venue_name,
            ...(ev.venue_address || ev.venue_city
              ? {
                  address: {
                    "@type": "PostalAddress",
                    ...(ev.venue_address ? { streetAddress: ev.venue_address } : {}),
                    ...(ev.venue_city ? { addressLocality: ev.venue_city } : {}),
                    ...(ev.venue_state ? { addressRegion: ev.venue_state } : {}),
                    addressCountry: "US",
                  },
                }
              : {}),
          },
        }
      : {}),
    performer: { "@type": "Person", name: "Chad Lewine", url: siteOrigin() },
    organizer: { "@type": "Person", name: "Chad Lewine", url: siteOrigin() },
    offers: {
      "@type": "Offer",
      url,
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    url,
  };

  return (
    <div className="page-songwriting page-event">
      <section className="si-popup" id="event" aria-labelledby="event-heading">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

        <nav aria-label="Breadcrumb" className="event-page__breadcrumb">
          <Link href="/irl" className="event-page__breadcrumb-link">&larr; IRL Events</Link>
        </nav>

        <p className="si-popup__eyebrow">IRL Event</p>
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
            <span className="glyph-title-bar__label" aria-hidden="true">&#9617;&#9618;&#9619;&#9608;</span>
            <h1 className="glyph-title-bar__heading" id="event-heading">{ev.title}</h1>
            <span className="glyph-title-bar__label" aria-hidden="true">&#9608;&#9619;&#9618;&#9617;</span>
          </div>
        </div>

        {ev.hero_image_path && (
          <div className="si-popup__media si-popup__media--full full-bleed">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ev.hero_image_path} alt={ev.title} className="si-popup__media-img" />
          </div>
        )}

        <div className="si-popup__inner">
          <div className="si-popup__meta-row">
            <div className="si-popup__info-cell">
              <span className="si-popup__info-label">Dates</span>
              <div className="si-popup__info-value si-popup__info-value--display">{dates}</div>
            </div>
            {ev.venue_name && (
              <div className="si-popup__info-cell">
                <span className="si-popup__info-label">Venue</span>
                <div className="si-popup__info-value si-popup__info-value--display">{ev.venue_name}</div>
                {(ev.venue_address || ev.venue_city || ev.venue_state) && (
                  <span className="si-popup__address">
                    {[ev.venue_address, [ev.venue_city, ev.venue_state].filter(Boolean).join(", ")].filter(Boolean).join(", ")}
                  </span>
                )}
              </div>
            )}
            {time && (
              <div className="si-popup__info-cell">
                <span className="si-popup__info-label">Time</span>
                <div className="si-popup__info-value si-popup__info-value--display">{time}</div>
              </div>
            )}
          </div>

          <div className="si-popup__cta-grid">
            {calUrl && (
              <a href={calUrl} target="_blank" rel="noopener noreferrer" className="si-popup__cta si-popup__cta--primary">
                Add to calendar
              </a>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="si-popup__cta">
                Get directions
              </a>
            )}
            <EventShareButton className="si-popup__cta" label="Share" copiedLabel="Link copied" />
          </div>

          <div className="event-detail-split">
            <div className="event-detail-split__text">
              {bodyHtml ? (
                <div className="si-popup__concept si-prose" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
              ) : ev.summary ? (
                <div className="si-popup__concept si-prose"><p>{ev.summary}</p></div>
              ) : null}
            </div>
            {ev.rsvp_enabled && (
              <div className="event-detail-split__rsvp">
                <EventRsvpForm eventId={ev.id} />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
