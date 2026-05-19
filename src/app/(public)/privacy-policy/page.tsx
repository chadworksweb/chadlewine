import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy - Chad Lewine",
  description: "Privacy Policy for chadlewine.com.",
  alternates: { canonical: "https://chadlewine.com/privacy-policy" },
};

export default function PrivacyPolicyPage() {
  return (
    <main className="page-static prose" style={{ paddingBlock: "var(--space-2xl)" }}>
      <h1>Privacy Policy</h1>
      <p>
        <em>Last updated: 2026-05-15.</em>
      </p>

      <p>
        This Privacy Policy explains what personal information chadlewine.com
        (the &ldquo;Site,&rdquo; operated by Chad Lewine, an individual sole
        proprietor based in the Commonwealth of Pennsylvania, United States)
        collects, why we collect it, how we use and share it, and the choices
        you have. Capitalized terms not defined here have the meaning given
        in our <Link href="/terms-of-service">Terms of Service</Link>.
      </p>

      <h2>1. Information We Collect</h2>
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
        providers (Vercel, Supabase, Cloudflare, Bunny.net) automatically
        receive standard server-log information when you access the
        Site, including IP address, user agent, request path, response
        status, and timestamp. We use this only for operating, securing,
        and debugging the Site.
      </p>
      <p>
        <strong>Cookies and similar technologies.</strong> The Site sets
        authentication cookies (managed by Supabase, named
        sb-access-token and sb-refresh-token) when you sign in, so that
        subsequent requests can be identified as yours. Cloudflare
        Turnstile may set its own short-lived tokens to verify that form
        submissions are from a human. We do not use third-party
        advertising cookies, cross-site tracking pixels, or analytics
        platforms such as Google Analytics, Meta Pixel, Mixpanel, or
        Segment.
      </p>

      <h2>2. How We Use Information</h2>
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

      <h2>3. How We Share Information</h2>
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
        <strong>Cloudflare</strong> &mdash; bot protection through
        Cloudflare Turnstile on forms.
      </p>
      <p>
        <strong>Vercel</strong> &mdash; web hosting and application
        runtime.
      </p>
      <p>
        We may also share information when required by law (for example,
        in response to a subpoena, court order, or other legal process),
        to protect our rights or the safety of others, or in connection
        with a sale, merger, or transfer of all or part of the business
        (in which case any successor must honor commitments materially
        consistent with this Policy).
      </p>

      <h2>4. Email Marketing and Unsubscribe</h2>
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

      <h2>5. Data Retention</h2>
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

      <h2>6. Your Choices and Rights</h2>
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

      <h2>7. International Data Transfers</h2>
      <p>
        Chad Lewine is based in the United States, and our service
        providers operate primarily in the United States. If you access
        the Site from outside the United States, you understand that
        your information will be transferred to, stored, and processed
        in the United States and other countries where our providers
        operate, which may have data-protection laws different from
        those of your country.
      </p>

      <h2>8. Security</h2>
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

      <h2>9. Children</h2>
      <p>
        The Site is not directed to children under 13 and we do not
        knowingly collect personal information from anyone under 13. If
        you are a parent or guardian and believe your child has provided
        us with personal information, contact us at portal@chadlewine.com
        and we will delete it.
      </p>

      <h2>10. Do Not Track</h2>
      <p>
        The Site does not respond to browser Do Not Track signals
        because there is no industry-standard interpretation. We do not
        use cross-site tracking and do not sell or share personal
        information for behavioral advertising, regardless of any DNT
        setting.
      </p>

      <h2>11. Changes to This Policy</h2>
      <p>
        We may update this Policy from time to time. Material changes
        will be announced via email to active subscribers and noted at
        the top of this page with a revised &ldquo;Last updated&rdquo;
        date. Your continued use of the Site after changes take effect
        constitutes acceptance of the revised Policy.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions, requests, or complaints about this Policy or about
        our handling of your personal information? Email{" "}
        <a href="mailto:portal@chadlewine.com">portal@chadlewine.com</a>.
      </p>
    </main>
  );
}
