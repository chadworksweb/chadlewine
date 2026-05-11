import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";

const DEFAULT_METADATA: Metadata = {
  title: "Business Inquiries & Licensing",
  description:
    "Sync licensing, placements, collaborations, and business inquiries for Chad Lewine's music catalog.",
  alternates: {
    canonical: "https://chadlewine.com/business",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/business", DEFAULT_METADATA);
}

export default function BusinessPage() {
  return (
    <div className="business-page">
      <div className="business-page__container">
        <h1 className="business-page__title">Business Inquiries &amp; Licensing</h1>

        <div className="business-page__section">
          <h2 className="business-page__heading">Sync &amp; Licensing</h2>
          <p className="business-page__text">
            Chad Lewine's catalog is available for sync licensing in film,
            television, advertising, podcasts, and digital media. All tracks are
            pre-cleared for placement consideration.
          </p>
        </div>

        <div className="business-page__section">
          <h2 className="business-page__heading">What's Available</h2>
          <ul className="business-page__list">
            <li>Sync licensing for existing catalog</li>
            <li>Custom compositions and scoring</li>
            <li>Collaborations and features</li>
            <li>Brand partnerships</li>
            <li>Live performance booking</li>
          </ul>
        </div>

        <div className="business-page__section">
          <h2 className="business-page__heading">Get in Touch</h2>
          <p className="business-page__text">
            For all business inquiries, licensing requests, and partnership
            opportunities:
          </p>
          <p className="business-page__contact">
            <a href="mailto:portal@chadlewine.com" className="business-page__link">
              portal@chadlewine.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
