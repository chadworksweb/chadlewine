import type { Metadata } from "next";
import Link from "next/link";
import { ManageCookiesButton } from "@/components/ManageCookiesButton";
import { LegalDoc, type LegalSection } from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Privacy Policy - Chad Lewine",
  description: "Privacy Policy for chadlewine.com.",
  alternates: { canonical: "https://chadlewine.com/privacy-policy" },
};

const sections: LegalSection[] = [
  {
    id: "information-we-collect",
    title: "Information We Collect",
    content: (
      <>
        <p>
          <strong>Account and contact information.</strong> When you create
          an account, subscribe to email updates, or place an order, we
          collect your email address and (optionally) your display name,
          first and last name, and mailing address (street, city, state,
          postal code, country).
        </p>
        <p>
          <strong>Order and transaction information.</strong> When you make
          a purchase, we receive a record of what you bought, the amount,
          the time of purchase, your Stripe customer identifier, and (for
          physical goods) your shipping address. We do not store your full
          payment card number; payment details are handled directly by
          Stripe.
        </p>
        <p>
          <strong>Marketing-consent and unsubscribe data.</strong> We record
          the time and source of any marketing consent you give (account
          signup, subscribe form, or checkout opt-in) and any subsequent
          unsubscribe or preference change, including the unsubscribe
          token and request method.
        </p>
        <p>
          <strong>Email engagement data.</strong> We track aggregate email
          delivery, open, and click activity for both transactional and
          marketing email using Resend. This helps us improve our
          communications and detect deliverability issues. We also derive
          an internal engagement score and tags (for example,
          &ldquo;customer,&rdquo; &ldquo;buyer:digital,&rdquo;
          &ldquo;subscriber:active&rdquo;) used to segment campaigns.
        </p>
        <p>
          <strong>Audit events.</strong> We log a structured event record
          for material account interactions (subscribe, purchase,
          email-sent, email-opened, email-clicked, account-deleted, and
          similar) for fraud prevention, debugging, and accounting.
        </p>
        <p>
          <strong>Device and log data.</strong> Our infrastructure
          providers (DigitalOcean, Cloudflare, Supabase, Bunny.net) automatically
          receive standard server-log information when you access the
          Site, including IP address, user agent, request path, response
          status, and timestamp. We use this only for operating, securing,
          and debugging the Site.
        </p>
        <p>
          <strong>Device hash and free-play limit.</strong> To count plays
          and to limit free listening for signed-out visitors (a few free
          plays per song before we prompt you to sign in or buy), we derive
          a short device hash from your IP address and browser user-agent (a
          one-way SHA-256 fingerprint, not your raw IP), used only for play
          counting and rate-limiting, never advertising.
        </p>
        <p>
          <strong>Contact and inquiry forms.</strong> When you submit a
          contact or songwriting inquiry, we collect what you provide (such
          as name, email, and message) along with your IP address and
          browser details for spam and fraud prevention.
        </p>
        <p>
          <strong>Cookies and similar technologies.</strong> The Site sets
          authentication cookies (managed by Supabase, named
          sb-access-token and sb-refresh-token) when you sign in, so that
          subsequent requests can be identified as yours. Cloudflare
          Turnstile may set its own short-lived tokens to verify that form
          submissions are from a human. We do not use third-party
          advertising cookies, cross-site tracking pixels, or
          behavioral-advertising networks such as Meta Pixel.
        </p>
        <p>
          <strong>Product analytics and session replay.</strong> We use
          PostHog and Google Analytics to understand
          how the Site is used: pages viewed, clicks and other interactions,
          device and browser type, and general geographic region. Google
          Analytics sets _ga cookies; PostHog is served first-party from our
          own domain and may set cookies.
          PostHog also records session replays (playbacks of on-page
          activity) with text and form inputs masked, which we use to debug
          and improve the experience. For signed-out visitors this data is
          not linked to your identity; if you sign in, we associate it with
          your account. We ask for your consent before loading analytics and
          apply it by region: visitors in the EU, UK, EEA, and California are
          opt-in (analytics stay off until you choose &ldquo;Accept&rdquo;),
          and elsewhere analytics are on by default with an easy opt-out. You
          can change it anytime (see &ldquo;Your Choices&rdquo; below). We also
          honor your browser&rsquo;s Global Privacy Control and Do Not Track
          signals: with either enabled, no analytics or session-replay data is
          collected, whatever your saved choice. PostHog and Google Analytics
          store this data in the United States.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use-information",
    title: "How We Use Information",
    content: (
      <>
        <p>We use the information described above to:</p>
        <p>
          (a) Process and fulfill your orders, including sending order
          confirmations and download links;
          <br />
          (b) Authenticate you, maintain your account, and provide order
          history and download recovery;
          <br />
          (c) Send transactional email (order confirmations, password
          resets, email-change confirmations, download recovery);
          <br />
          (d) Send marketing email to people who have opted in, and segment
          those campaigns based on engagement and purchase history;
          <br />
          (e) Operate, secure, debug, and improve the Site;
          <br />
          (f) Comply with legal obligations, including tax, accounting, and
          recordkeeping requirements;
          <br />
          (g) Prevent fraud and abuse.
        </p>
      </>
    ),
  },
  {
    id: "how-we-share-information",
    title: "How We Share Information",
    content: (
      <>
        <p>
          We do not sell your personal information, and we do not share it
          for cross-context behavioral advertising. We share information
          only with the service providers that help us operate the Site:
        </p>
        <p>
          <strong>Stripe, Inc.</strong> &mdash; payment processing,
          customer billing, fraud detection, and the customer billing
          portal. Stripe receives your email, billing address, and payment
          details directly. Its terms apply to that processing.
        </p>
        <p>
          <strong>Resend</strong> &mdash; email delivery for both
          transactional and marketing email. Resend receives your email
          address, message contents, and delivery/open/click events.
        </p>
        <p>
          <strong>Printify, Inc.</strong> &mdash; on-demand fulfillment of
          physical merchandise. Printify receives your name, shipping
          address, and the line items needed to produce and ship your
          order.
        </p>
        <p>
          <strong>Supabase</strong> &mdash; database, authentication, and
          file storage. Supabase hosts the authentication records and
          application data that make the Site work.
        </p>
        <p>
          <strong>Bunny.net</strong> &mdash; content delivery and media
          hosting for images, audio, and video.
        </p>
        <p>
          <strong>Cloudflare</strong> &mdash; DNS, CDN, and edge proxy for the
          Site. It processes request metadata (such as your IP address and
          approximate location) to route, cache, and secure traffic, and
          provides bot protection through Cloudflare Turnstile on forms.
        </p>
        <p>
          <strong>DigitalOcean</strong> &mdash; web hosting and application
          runtime (the server the Site runs on).
        </p>
        <p>
          <strong>PostHog</strong> &mdash; product analytics and session
          replay, served first-party from our domain. PostHog receives
          usage and interaction data and masked session recordings, stored
          in the United States.
        </p>
        <p>
          <strong>Google Analytics (Google LLC)</strong> &mdash; aggregate
          usage analytics. Receives page-view and interaction events and sets
          _ga cookies; data stored in the United States.
        </p>
        <p>
          We may also share information when required by law (for example,
          in response to a subpoena, court order, or other legal process),
          to protect our rights or the safety of others, or in connection
          with a sale, merger, or transfer of all or part of the business
          (in which case any successor must honor commitments materially
          consistent with this Policy).
        </p>
      </>
    ),
  },
  {
    id: "email-marketing-and-unsubscribe",
    title: "Email Marketing and Unsubscribe",
    content: (
      <p>
        Marketing email is sent only to people who opt in by creating an
        account, subscribing through a form, or checking the marketing
        box at checkout. We record the time and source of each opt-in.
        Every marketing email includes a one-click unsubscribe link tied
        to a unique token; clicking it removes you immediately. You may
        also update marketing preferences from your account page or
        request manual removal at portal@chadlewine.com. Transactional
        email is sent regardless of marketing preferences because it
        relates to your account or a specific transaction.
      </p>
    ),
  },
  {
    id: "data-retention",
    title: "Data Retention",
    content: (
      <p>
        We retain account and order records for as long as needed to
        provide the service and to satisfy our legal obligations
        (typically at least seven years for financial records under U.S.
        tax law). When you request deletion of your account, we remove
        your authentication record and revoke active sessions, and we
        stop marketing to you. Order, financial, and audit records
        associated with completed purchases are retained as required by
        law and accounting practice but are no longer used for marketing.
      </p>
    ),
  },
  {
    id: "your-choices-and-rights",
    title: "Your Choices and Rights",
    content: (
      <>
        <p>
          <strong>Access and update.</strong> While logged in, you can view
          and update your display name, first/last name, mailing address,
          marketing preferences, and email address from{" "}
          <Link href="/account">your account</Link>. You can also view your
          order and download history there.
        </p>
        <p>
          <strong>Unsubscribe.</strong> Use the link in any marketing
          email, your account settings, or email
          portal@chadlewine.com.
        </p>
        <p>
          <strong>Deletion.</strong> Email portal@chadlewine.com to request
          account deletion. We will remove your authentication record
          and stop marketing to you. Order, financial, and audit data are
          retained as described in section 5.
        </p>
        <p>
          <strong>Data subject access requests.</strong> To exercise your
          access, portability, correction, deletion, or restriction rights,
          see our <Link href="/data-request">DSAR Policy</Link>, which
          describes how to submit a request and how it is processed.
        </p>
        <p>
          <strong>Analytics and cookie choices.</strong> We ask for your
          consent before loading analytics (PostHog and Google Analytics)
          and apply it by region. Visitors in the EU, UK, EEA, and
          California are opt-in (analytics stay off until you accept);
          elsewhere analytics are on by default with an easy opt-out. You can
          change it anytime via{" "}
          <ManageCookiesButton /> or the Privacy and cookies panel on{" "}
          <Link href="/account">your account</Link> (your choice follows you
          across devices when signed in). We honor your browser&rsquo;s Global
          Privacy Control and Do Not Track signals: with either enabled, no
          analytics data is collected, whatever your saved choice.
        </p>
        <p>
          <strong>California residents (CCPA/CPRA).</strong> If you are a
          California resident, you have the right to know what personal
          information we collect, to request a copy of that information,
          to request deletion (subject to the retention exceptions above),
          and to opt out of any sale or sharing of personal information.
          We do not sell or share personal information for cross-context
          behavioral advertising. To exercise these rights, email
          portal@chadlewine.com from the address associated with your
          account; we may need to verify your identity before responding.
          We will not discriminate against you for exercising these
          rights.
        </p>
        <p>
          <strong>Residents of the United Kingdom, European Economic Area,
          and other jurisdictions with comprehensive privacy laws.</strong>{" "}
          You may have rights to access, correct, delete, restrict, or
          object to certain processing of your personal information, and
          the right to data portability. Our lawful bases for processing
          are: (i) performance of a contract (orders, account services);
          (ii) consent (marketing email); (iii) legitimate interests
          (security, fraud prevention, service improvement); and (iv)
          legal obligation (tax, accounting). To exercise rights or
          withdraw consent, email portal@chadlewine.com. You also have
          the right to lodge a complaint with your local supervisory
          authority.
        </p>
      </>
    ),
  },
  {
    id: "international-data-transfers",
    title: "International Data Transfers",
    content: (
      <p>
        Chad Lewine is based in the United States, and our service
        providers operate primarily in the United States. If you access
        the Site from outside the United States, you understand that
        your information will be transferred to, stored, and processed
        in the United States and other countries where our providers
        operate, which may have data-protection laws different from
        those of your country.
      </p>
    ),
  },
  {
    id: "security",
    title: "Security",
    content: (
      <p>
        We use standard industry safeguards to protect personal
        information: HTTPS in transit, encrypted storage at rest with
        our infrastructure providers, scoped API keys, principle-of-least-privilege
        database policies (row-level security), CAPTCHA on
        authentication forms, rate-limiting on sign-in and password-reset
        flows, and a secure password-reset flow that does not reveal
        whether an email is registered. No system is perfectly secure;
        if you have reason to believe your account has been compromised,
        contact us at portal@chadlewine.com.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    content: (
      <p>
        The Site is not directed to children under 13 and we do not
        knowingly collect personal information from anyone under 13. If
        you are a parent or guardian and believe your child has provided
        us with personal information, contact us at portal@chadlewine.com
        and we will delete it.
      </p>
    ),
  },
  {
    id: "gpc-and-dnt",
    title: "Global Privacy Control and Do Not Track",
    content: (
      <p>
        We honor both the Global Privacy Control (GPC) and Do Not Track
        signals sent by your browser. With either enabled, we load no
        analytics at all: Google Analytics, PostHog, and session replay
        stay off, whatever your saved cookie choice. California residents
        can treat GPC as a valid opt-out of any sale or sharing under the
        CPRA. We do not use cross-site tracking and do not sell or share
        personal information for behavioral advertising in any case.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to This Policy",
    content: (
      <p>
        We may update this Policy from time to time. Material changes
        will be announced via email to active subscribers and noted at
        the top of this page with a revised &ldquo;Last updated&rdquo;
        date. Your continued use of the Site after changes take effect
        constitutes acceptance of the revised Policy.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <p>
        Questions, requests, or complaints about this Policy or about
        our handling of your personal information? Email{" "}
        <a href="mailto:portal@chadlewine.com">portal@chadlewine.com</a>.
      </p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="page-static">
      <LegalDoc
        title="Privacy Policy"
        updated="2026-05-30"
        intro={
          <p>
            This Privacy Policy explains what personal information chadlewine.com
            (the &ldquo;Site,&rdquo; operated by Chad Lewine, an individual sole
            proprietor based in the Commonwealth of Pennsylvania, United States)
            collects, why we collect it, how we use and share it, and the choices
            you have. Capitalized terms not defined here have the meaning given
            in our <Link href="/terms-of-service">Terms of Service</Link>.
          </p>
        }
        sections={sections}
      />
    </main>
  );
}
