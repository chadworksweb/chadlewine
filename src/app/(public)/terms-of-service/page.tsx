import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - Chad Lewine",
  description: "Terms of Service for chadlewine.com.",
  alternates: { canonical: "https://chadlewine.com/terms-of-service" },
};

// Stub — replace with the real Terms of Service before launch. The current
// copy is placeholder; legal review is your responsibility.
export default function TermsPage() {
  return (
    <main className="page-static prose" style={{ paddingBlock: "var(--space-2xl)" }}>
      <h1>Terms of Service</h1>
      <p>
        <em>Last updated: 2026-05-13. This is a placeholder draft — full
        legal copy to follow.</em>
      </p>

      <h2>1. Who we are</h2>
      <p>
        chadlewine.com is operated by Chad Lewine. By using this site,
        creating an account, or making a purchase, you agree to these terms.
      </p>

      <h2>2. Account</h2>
      <p>
        You're responsible for your login credentials and any activity under
        your account. We can suspend or remove accounts that violate these
        terms, post spam, attempt to abuse the platform, or attempt
        unauthorized access.
      </p>

      <h2>3. Purchases</h2>
      <p>
        Payments are processed by Stripe. We don't store credit card numbers.
        Digital downloads are licensed to you for personal use; resale or
        redistribution isn't permitted. Physical merchandise is fulfilled
        via Printify; refunds and exchanges follow Printify's policies for
        production defects.
      </p>

      <h2>4. Email communications</h2>
      <p>
        Creating an account or subscribing opts you into marketing emails
        (occasional updates about new music, art, and events). Every email
        includes a one-click unsubscribe link. Transactional emails (order
        confirmations, password resets, download recovery) are sent
        regardless of marketing preferences.
      </p>

      <h2>5. Content</h2>
      <p>
        All original music, art, writing, and design on this site is
        copyrighted by Chad Lewine. You may share short excerpts with proper
        attribution; commercial reuse requires written permission.
      </p>

      <h2>6. Privacy</h2>
      <p>
        We collect only what's necessary to operate the site: your email,
        order details, optional mailing address, and aggregate analytics.
        We never sell your data. See our Privacy Policy (forthcoming).
      </p>

      <h2>7. Changes</h2>
      <p>
        These terms may evolve. Material changes will be announced via
        email to active subscribers and noted at the top of this page.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions? Email{" "}
        <a href="mailto:portal@chadlewine.com">portal@chadlewine.com</a>.
      </p>
    </main>
  );
}
