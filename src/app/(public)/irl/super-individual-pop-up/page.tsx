import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";
import {
  POPUP_EVENT,
  SuperIndividualPopupSection,
} from "@/components/SuperIndividualPopup";

const DEFAULT_METADATA: Metadata = {
  title: "Super Individual Pop-Up — Montgomery Mall, June 26-28, 2026",
  description:
    "Chad Lewine's Super Individual Pop-Up at Montgomery Mall in North Wales, PA — three days of live painting, talks, discourse, and original songs performed in full. June 26-28, 2026.",
  alternates: { canonical: POPUP_EVENT.url },
  openGraph: {
    title: "Super Individual Pop-Up — Montgomery Mall, June 26-28, 2026",
    description:
      "Three days at Montgomery Mall: live painting, original songs, the Super Individual merch line, and the Rising Compass listening zone.",
    url: POPUP_EVENT.url,
    type: "website",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata(POPUP_EVENT.pathname, DEFAULT_METADATA);
}

export default function SuperIndividualPopUpPage() {
  return (
    <div className="event-page">
      <nav aria-label="Breadcrumb" className="event-page__breadcrumb">
        <Link href="/irl" className="event-page__breadcrumb-link">
          &larr; IRL Events
        </Link>
      </nav>
      <SuperIndividualPopupSection includeEventSchema />
    </div>
  );
}
