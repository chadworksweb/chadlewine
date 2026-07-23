import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Data Subject Access Request (DSAR) Policy - Chad Lewine",
  description:
    "How to access, export, correct, restrict, or delete the personal data chadlewine.com holds about you, and how such requests are processed.",
  alternates: { canonical: "https://chadlewine.com/data-request" },
};

const EMAIL = "portal@chadlewine.com";

const sections: LegalSection[] = [
  {
    id: "introduction",
    title: "Introduction",
    content: (
      <p>
        Chad Lewine, an individual sole proprietor based in the Commonwealth of
        Pennsylvania, United States (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;), maintains this Data Subject Access Request
        (&ldquo;DSAR&rdquo;) Policy to describe how an individual may exercise
        the rights available to them over the personal data we hold, and how we
        receive, verify, and process such requests. This Policy supplements our{" "}
        <Link href="/privacy-policy">Privacy Policy</Link>, which describes the
        personal data we collect and the purposes for which we process it.
      </p>
    ),
  },
  {
    id: "scope",
    title: "Scope",
    content: (
      <p>
        This Policy applies to all personal data processed by chadlewine.com
        (the &ldquo;Site&rdquo;), including data collected through the Site&rsquo;s
        account, commerce, and email features, and through related interactions.
        It governs requests submitted by, or by an authorized agent on behalf of,
        the individual to whom the personal data relates (the &ldquo;data
        subject&rdquo;).
      </p>
    ),
  },
  {
    id: "your-rights",
    title: "Your Rights",
    content: (
      <>
        <p>
          Subject to applicable law, a data subject may request to exercise the
          following rights:
        </p>
        <ul>
          <li>
            <strong>Access.</strong> Obtain confirmation of whether we process
            personal data about them and receive a copy of that data, together
            with its categories, sources, and the categories of recipients.
          </li>
          <li>
            <strong>Portability.</strong> Receive the data in a structured,
            commonly used, and machine-readable format.
          </li>
          <li>
            <strong>Correction.</strong> Have inaccurate or incomplete personal
            data corrected.
          </li>
          <li>
            <strong>Deletion.</strong> Have their personal data deleted, subject
            to the exceptions in Section 10.
          </li>
          <li>
            <strong>Restriction and objection.</strong> Restrict or object to a
            specific processing activity, such as marketing, while their record
            is otherwise retained.
          </li>
        </ul>
        <p>
          California residents additionally have the right to know the categories
          of personal information collected and to opt out of its sale or
          sharing. We do not sell or share personal information for
          cross-context behavioral advertising.
        </p>
      </>
    ),
  },
  {
    id: "making-a-request",
    title: "Making a Request",
    content: (
      <>
        <p>
          Requests may be submitted by email to{" "}
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. To enable us to act on a
          request, it should identify:
        </p>
        <ul>
          <li>
            <strong>Identification.</strong> The data subject and the email
            address or account to which the personal data relates.
          </li>
          <li>
            <strong>Type of request.</strong> The right the data subject wishes
            to exercise, such as access, a copy or export, correction, deletion,
            or restriction of a specified processing activity.
          </li>
        </ul>
        <p>
          No specific form or statutory language is required, and a request
          received through any channel will be honored. A signed-in data subject
          may also view and update much of their data directly from{" "}
          <Link href="/account">their account</Link>.
        </p>
      </>
    ),
  },
  {
    id: "verification",
    title: "Identity Verification",
    content: (
      <p>
        Before disclosing, correcting, or deleting personal data, we verify that
        the request originates from the data subject or an authorized agent.
        Verification is proportionate to the sensitivity of the data concerned
        and typically requires confirmation of control over the account email
        and, for higher-risk requests, corroboration of a non-public detail we
        already hold, such as an order number. We collect no more information
        than is necessary to verify identity and do not retain verification
        materials after the request is closed. Where an agent acts on behalf of a
        data subject, we verify both the agent&rsquo;s authority and the data
        subject&rsquo;s identity. Where identity cannot be established, we will
        decline the request and explain what is required.
      </p>
    ),
  },
  {
    id: "processing",
    title: "Processing and Timeline",
    content: (
      <p>
        We acknowledge receipt of each request within three business days. We
        respond substantively within one month under the GDPR and UK GDPR, and
        within forty-five calendar days under the CCPA/CPRA. Where a request is
        complex or numerous, these periods may be extended once, by up to two
        further months under the GDPR or up to forty-five additional days under
        the CCPA, and we will notify the data subject of any extension, and the
        reasons for it, within the initial response period.
      </p>
    ),
  },
  {
    id: "access",
    title: "Accessing and Exporting Your Data",
    content: (
      <p>
        Upon a verified access request, we provide a copy of the personal data
        we hold about the data subject, together with the categories of data
        processed, the sources from which it was obtained, and the categories of
        recipients with whom it has been shared. The data is provided in a
        structured, commonly used, and machine-readable format, such as JSON or
        CSV, and delivered through a secure channel.
      </p>
    ),
  },
  {
    id: "correction",
    title: "Correcting Your Data",
    content: (
      <p>
        Where personal data we hold about the data subject is inaccurate or
        incomplete, we correct it at the source of record and in any dependent
        copy upon a verified request.
      </p>
    ),
  },
  {
    id: "deletion",
    title: "Deleting Your Data",
    content: (
      <p>
        Upon a verified deletion request, we delete or anonymize the personal
        data we hold about the data subject and instruct our processors to do the
        same, subject to the exceptions in Section 10. Deletion removes the
        authentication record and the associated behavioral and marketing data;
        it does not extend to records we are entitled or required to retain.
      </p>
    ),
  },
  {
    id: "retained-data",
    title: "Retained Data and Exceptions",
    content: (
      <>
        <p>
          We retain certain data notwithstanding a deletion request, limited to
          what the relevant purpose requires:
        </p>
        <ul>
          <li>
            <strong>Transaction records.</strong> Order and financial records are
            retained to satisfy tax and accounting obligations, typically for at
            least seven years under U.S. law, and are no longer used for
            marketing.
          </li>
          <li>
            <strong>Suppression record.</strong> A minimal record, consisting of
            a hashed email address and a do-not-contact flag, is retained so that
            a prior unsubscribe is not reversed by a later import.
          </li>
          <li>
            <strong>Security records.</strong> Security and abuse-prevention
            records are retained for the duration of any active investigation.
          </li>
          <li>
            <strong>Legal hold.</strong> Data subject to a legal hold or
            preservation obligation is retained for the duration of that
            obligation.
          </li>
        </ul>
        <p>
          Where practicable, retained data is minimized to the identifiers the
          obligation requires. Our infrastructure backups may continue to hold
          the data until they age out on their rotation cycle; a completed
          deletion is re-applied if a backup is ever restored.
        </p>
      </>
    ),
  },
  {
    id: "refusal",
    title: "Refusal of Requests",
    content: (
      <p>
        We may decline a request, in whole or in part, where identity cannot be
        verified; where the data is subject to a retention obligation described
        in Section 10; where disclosure would reveal the personal data of another
        individual, in which case we release the remainder in redacted form;
        where the request is manifestly unfounded or excessive; or where the data
        is not personal data or is not held by us. We will explain the basis for
        any refusal.
      </p>
    ),
  },
  {
    id: "fees",
    title: "Fees",
    content: (
      <p>
        Requests are processed free of charge. We may charge a reasonable fee, or
        decline to act, only where a request is manifestly unfounded or
        excessive, in particular where it is repetitive. Any such fee reflects
        the administrative cost of responding and is communicated before it is
        applied.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to This Policy",
    content: (
      <p>
        We may update this Policy from time to time. Material changes will be
        noted on this page with a revised effective date. Continued use of the
        Site after changes take effect constitutes acceptance of the revised
        Policy.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <p>
        Requests and questions regarding this Policy may be directed to{" "}
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. A data subject also has the
        right to lodge a complaint with their local supervisory authority.
      </p>
    ),
  },
];

export default function DataRequestPage() {
  return (
    <main className="page-static">
      <LegalDoc
        title="Data Subject Access Request (DSAR) Policy"
        updated="2026-07-23"
        intro={
          <p>
            This Policy sets out how you may exercise your rights over the
            personal data chadlewine.com holds about you, and how we process
            those requests, in line with applicable data protection law.
          </p>
        }
        sections={sections}
      />
    </main>
  );
}
