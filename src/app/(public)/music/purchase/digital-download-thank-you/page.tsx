import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thank You — Chad Lewine",
  robots: { index: false },
};

export default function PurchaseThankYouPage() {
  return (
    <div id="page-thank-you" className="page-static">
      <h1 className="page-static__title">Thank You</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-xl)" }}>
        Your purchase is confirmed. A download link will be sent to your email.
      </p>
      <Link href="/music" style={{ color: "var(--text-accent)" }}>
        Back to Music
      </Link>
    </div>
  );
}
