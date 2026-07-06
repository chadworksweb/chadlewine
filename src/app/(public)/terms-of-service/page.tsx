import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service - Chad Lewine",
  description: "Terms of Service for chadlewine.com.",
  alternates: { canonical: "https://chadlewine.com/terms-of-service" },
};

export default function TermsPage() {
  return (
    <main className="page-static prose" style={{ paddingBlock: "var(--space-2xl)" }}>
      <h1>Terms of Service</h1>
      <p>
        <em>Last updated: 2026-05-15.</em>
      </p>

      <p>
        These Terms of Service (the &ldquo;Terms&rdquo;) govern your access to and
        use of chadlewine.com (the &ldquo;Site&rdquo;), the services offered
        through it, and any purchases you make. The Site is operated by Chad
        Lewine, an individual sole proprietor based in the Commonwealth of
        Pennsylvania, United States (&ldquo;Chad Lewine,&rdquo;
        &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By using
        the Site, creating an account, subscribing to email updates, or
        completing a purchase, you agree to these Terms. If you do not
        agree, do not use the Site.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least 18 years old to create an account or make a
        purchase. By using the Site, you represent that you meet this
        requirement and that you have the legal capacity to enter into a
        binding contract. The Site is not directed to children under 13,
        and we do not knowingly collect personal information from anyone
        under 13. If you believe we have collected information from a child
        under 13, contact us at portal@chadlewine.com and we will delete
        it.
      </p>

      <h2>2. Accounts</h2>
      <p>
        Creating an account is optional but required for certain features
        (order history, saved mailing address, download recovery without
        token email, marketing preferences). You are responsible for
        keeping your login credentials secure and for all activity that
        occurs under your account. Notify us immediately at
        portal@chadlewine.com if you suspect unauthorized access. We may
        suspend or terminate accounts that violate these Terms, attempt
        unauthorized access, abuse the Site, or are inactive for an
        extended period.
      </p>

      <h2>3. Purchases and Payment</h2>
      <p>
        We sell digital downloads (songs, albums, ringtones), physical
        merchandise, original artwork, and accept voluntary patronage
        contributions. All prices are listed in U.S. dollars and do not
        include applicable taxes, duties, or shipping unless stated.
        Payment is processed by Stripe, Inc.; we do not store your full
        payment card number on our servers. By submitting payment, you
        authorize Stripe to charge your selected payment method for the
        order total, and you represent that you are authorized to use that
        payment method. Orders are not confirmed until payment is
        successfully captured. We reserve the right to refuse or cancel
        any order at our discretion (for example, suspected fraud, pricing
        errors, or sold-out inventory), in which case any charge will be
        refunded in full.
      </p>

      <h2>4. Digital Downloads and License</h2>
      <p>
        When you purchase a digital download (song, album, or ringtone),
        we grant you a non-exclusive, non-transferable, revocable license
        to download the file in the offered formats (MP3, FLAC, WAV, or
        M4R as applicable) and to use it for your personal,
        non-commercial enjoyment. You may not redistribute, resell,
        publicly perform, license, sublicense, broadcast, upload to a
        streaming or sharing service, or use the recording in any
        commercial production, advertisement, video, podcast, game, or
        AI/ML training dataset without prior written permission from Chad
        Lewine. Synchronization, master use, or any other commercial
        license must be requested at portal@chadlewine.com.
      </p>
      <p>
        Download links are delivered by email immediately after purchase
        and remain available via the Site&rsquo;s download recovery flow
        at <Link href="/music/recover">/music/recover</Link>. We make a
        reasonable effort to keep purchased files available indefinitely
        but do not guarantee permanent availability; back up your files
        after download.
      </p>

      <h2>5. Physical Merchandise and Shipping</h2>
      <p>
        Physical goods (merchandise, prints, and limited-edition items)
        are fulfilled through Printify, Inc. or by us directly, depending
        on the product. Printify-fulfilled items are produced on demand
        after your order is placed; production and shipping times
        typically range from 5 to 14 business days but are not guaranteed.
        We currently ship to the United States, Canada, the United
        Kingdom, Australia, New Zealand, and Ireland. Risk of loss and
        title pass to you upon delivery to the carrier. You are
        responsible for any customs duties, import taxes, or fees imposed
        by your destination country.
      </p>
      <p>
        Some items are sold in limited editions; once an edition is sold
        out, it will not be reprinted unless explicitly stated. Original
        artwork is unique and sold &ldquo;as is&rdquo; with the
        dimensions and condition described on the product page.
      </p>

      <h2>6. Original Artwork</h2>
      <p>
        Purchase of an original artwork transfers physical ownership of
        the piece. It does not transfer copyright, reproduction rights,
        or any other intellectual property right. Chad Lewine retains all
        rights to reproduce, display, license, and sell prints or
        derivative works of the original unless a separate written
        agreement says otherwise.
      </p>

      <h2>7. Patronage Contributions</h2>
      <p>
        Patronage contributions are voluntary donations to support Chad
        Lewine&rsquo;s work. They are not charitable contributions for tax
        purposes (Chad Lewine is not a registered 501(c)(3) organization)
        and no goods or services are owed in exchange. Patronage
        contributions are non-refundable except where required by law or
        in cases of clear processing error.
      </p>

      <h2>8. Refunds, Returns, and Exchanges</h2>
      <p>
        <strong>All sales are final.</strong> We do not accept refunds,
        returns, or exchanges for change of mind, incorrect size
        selection, buyer&rsquo;s remorse, or any other reason except as
        described below for damaged or incorrect goods.
      </p>
      <p>
        <strong>Physical merchandise.</strong> Most of our physical
        products are printed on demand. If your order arrives damaged or
        is not what you ordered, email portal@chadlewine.com within{" "}
        <strong>14 days of delivery</strong> with your order number, a
        short description of the issue, and one or more photos. Let us
        know whether you would like a replacement or a refund. We will
        respond with a resolution within 1&ndash;2 business days. Any
        returned merchandise must be unused and packaged in its
        original form.
      </p>
      <p>
        <strong>Original artwork.</strong> Original pieces are final
        sale. The sole exception is damage in transit: notify us within
        14 days of delivery at portal@chadlewine.com with your order
        number, a description, and photos of the damage and original
        packaging.
      </p>
      <p>
        <strong>Digital downloads.</strong> Digital downloads are
        non-refundable. If you cannot access a file you purchased
        (corrupted file, wrong format, broken link), email
        portal@chadlewine.com within 14 days of purchase and we will
        reissue the download. Reissuing a working file is not a refund;
        it is a fix.
      </p>
      <p>
        <strong>Patronage contributions.</strong> Patronage
        contributions are non-refundable except in cases of clear
        processing error or where required by law.
      </p>
      <p>
        Approved refunds are issued to the original payment method via
        Stripe and typically appear on your statement within 5 to 10
        business days.
      </p>

      <h2>9. Email Communications</h2>
      <p>
        We send two categories of email:
      </p>
      <p>
        <strong>Transactional emails</strong> include order
        confirmations, download links, download recovery messages,
        password resets, email-change confirmations, and other messages
        directly tied to your account or purchase. These are not
        marketing email and are sent regardless of your marketing
        preferences.
      </p>
      <p>
        <strong>Marketing emails</strong> include occasional updates about
        new music, art, merchandise, performances, and other releases.
        You opt in by creating an account, subscribing through a Site
        form, or checking the marketing-consent box at checkout. Every
        marketing email contains a one-click unsubscribe link, and you
        can also update your preferences from your account page or
        request manual removal at portal@chadlewine.com. We use Resend
        for email delivery and track basic engagement (delivered, opened,
        clicked) to improve our communications.
      </p>

      <h2>10. Intellectual Property</h2>
      <p>
        All content on the Site &mdash; including music recordings,
        compositions, lyrics, album art, visual artwork, photography,
        written observations and essays, designs, logos, brand marks,
        Site code, and the selection and arrangement of all of the
        foregoing &mdash; is owned by Chad Lewine or used with permission
        and is protected by United States and international copyright,
        trademark, and other intellectual-property laws. You may share
        short excerpts of written content for personal or editorial use
        with clear attribution and a link back to the Site. Any other
        reproduction, distribution, public display, derivative work, or
        commercial use requires prior written permission.
      </p>
      <p>
        Use of any content on the Site as training data for machine
        learning or generative AI models is expressly prohibited without
        a written license from Chad Lewine.
      </p>

      <h2>11. User Conduct</h2>
      <p>
        You agree not to: (a) use the Site for any unlawful purpose; (b)
        attempt to gain unauthorized access to accounts, systems, or
        data; (c) probe, scan, or test the vulnerability of the Site or
        any related infrastructure; (d) interfere with the Site&rsquo;s
        operation, including by uploading malware, conducting
        denial-of-service activity, or scraping at volumes that degrade
        performance; (e) impersonate any person or misrepresent your
        affiliation; (f) circumvent rate limits, CAPTCHAs, or other
        security measures; or (g) redistribute, decompile, or reverse
        engineer purchased digital content beyond what is permitted by
        applicable law.
      </p>

      <h2>12. Account Termination and Deletion</h2>
      <p>
        You may request deletion of your account at any time by emailing
        portal@chadlewine.com. We will remove your authentication record
        and revoke active sessions promptly. Some records associated
        with your account (order history, financial records, audit
        events) are retained as required for tax, legal, and accounting
        purposes; this data will not be used for marketing after
        deletion. We may terminate or suspend your access without notice
        if you materially violate these Terms.
      </p>

      <h2>13. Third-Party Services</h2>
      <p>
        The Site relies on the following third parties to provide core
        functions: Stripe (payments and customer billing), Resend (email
        delivery), Printify (physical-product fulfillment), Supabase
        (authentication and database hosting), Bunny.net (content
        delivery and media hosting), Cloudflare (DNS, CDN, edge proxy,
        and Turnstile bot protection), DigitalOcean (hosting),
        PostHog (product analytics and session replay, served first-party
        with data stored in the United States), and Google Analytics
        (aggregate usage analytics). When you use the Site, certain
        information is
        shared with these providers as necessary to deliver the service
        (for example, your email and order details with Stripe and
        Printify; your shipping address with Printify; your email and
        message contents with Resend). Each provider operates under its
        own terms and privacy policy. We are not responsible for the
        independent acts or omissions of these providers.
      </p>

      <h2>14. Privacy</h2>
      <p>
        Our handling of personal information is described in our{" "}
        <Link href="/privacy-policy">Privacy Policy</Link>, which is
        incorporated into these Terms by reference.
      </p>

      <h2>15. Disclaimer of Warranties</h2>
      <p>
        THE SITE AND ALL CONTENT, PRODUCTS, AND SERVICES ARE PROVIDED ON
        AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS. TO
        THE MAXIMUM EXTENT PERMITTED BY LAW, CHAD LEWINE DISCLAIMS ALL
        WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
        IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
        PURPOSE, NON-INFRINGEMENT, AND ANY WARRANTY ARISING FROM COURSE
        OF DEALING OR USAGE OF TRADE. WE DO NOT WARRANT THAT THE SITE
        WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE, OR THAT ANY
        DEFECTS WILL BE CORRECTED.
      </p>

      <h2>16. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, CHAD LEWINE SHALL NOT BE
        LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
        EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS,
        REVENUE, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT
        OF OR IN CONNECTION WITH YOUR USE OF THE SITE OR ANY PURCHASE,
        WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING
        NEGLIGENCE), OR ANY OTHER LEGAL THEORY. OUR TOTAL CUMULATIVE
        LIABILITY FOR ALL CLAIMS RELATING TO THE SITE OR ANY ORDER SHALL
        NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID TO US IN THE
        TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM,
        OR (B) ONE HUNDRED U.S. DOLLARS ($100). SOME JURISDICTIONS DO
        NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES, SO THE
        ABOVE LIMITATIONS MAY NOT APPLY TO YOU.
      </p>

      <h2>17. Indemnification</h2>
      <p>
        You agree to indemnify, defend, and hold harmless Chad Lewine
        from and against any claims, liabilities, damages, losses, and
        expenses (including reasonable attorneys&rsquo; fees) arising
        out of or relating to: (a) your use of the Site; (b) your
        violation of these Terms; (c) your violation of any rights of
        another, including intellectual property or privacy rights; or
        (d) any content you submit or transmit through the Site.
      </p>

      <h2>18. Copyright Complaints (DMCA)</h2>
      <p>
        If you believe content on the Site infringes your copyright,
        send a written notice to portal@chadlewine.com that includes:
        (a) your physical or electronic signature; (b) identification of
        the copyrighted work claimed to be infringed; (c) identification
        of the material that is claimed to be infringing and its
        location on the Site; (d) your contact information; (e) a
        statement that you have a good-faith belief that the use is not
        authorized by the copyright owner, its agent, or the law; and
        (f) a statement, under penalty of perjury, that the information
        in the notice is accurate and that you are authorized to act on
        behalf of the copyright owner.
      </p>

      <h2>19. Governing Law and Dispute Resolution</h2>
      <p>
        These Terms are governed by the laws of the Commonwealth of
        Pennsylvania, United States, without regard to its conflict-of-laws
        rules. You agree that any dispute, claim, or controversy arising
        out of or relating to these Terms, the Site, or any purchase
        shall be resolved exclusively in the state or federal courts
        located in Pennsylvania, and you consent to the personal
        jurisdiction of those courts. Each party waives any right to a
        jury trial. You may bring claims only on an individual basis and
        not as a plaintiff or class member in any purported class,
        consolidated, or representative action.
      </p>

      <h2>20. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes
        will be announced via email to active subscribers and noted at
        the top of this page with a revised &ldquo;Last updated&rdquo;
        date. Your continued use of the Site after changes take effect
        constitutes acceptance of the revised Terms.
      </p>

      <h2>21. Miscellaneous</h2>
      <p>
        These Terms, together with the Privacy Policy and any
        order-specific terms presented at checkout, constitute the
        entire agreement between you and Chad Lewine regarding the Site.
        If any provision is held unenforceable, the remaining provisions
        will remain in full force. Our failure to enforce a provision is
        not a waiver of our right to enforce it later. You may not
        assign these Terms without our prior written consent; we may
        assign them in connection with a sale, merger, or transfer of
        the business.
      </p>

      <h2>22. Contact</h2>
      <p>
        Questions about these Terms? Email{" "}
        <a href="mailto:portal@chadlewine.com">portal@chadlewine.com</a>.
      </p>
    </main>
  );
}
