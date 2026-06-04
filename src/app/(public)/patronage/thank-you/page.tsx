"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function PatronageThankYouContent() {
  const params = useSearchParams();
  const monthly = params.get("type") === "monthly";

  return (
    <div id="page-patronage-thanks" className="page-static patronage-thanks">
      <h1 className="page-static__title">Thank you for becoming a patron</h1>
      <div className="patronage-thanks__body">
        {monthly ? (
          <>
            <p>
              You&rsquo;re now a monthly patron. Your support backs the work as it
              unfolds &mdash; the songs, the writing, the art, all of it. A receipt is
              on its way to your email, and your patronage will renew each month until
              you choose to stop.
            </p>
            <p>
              You can manage or cancel your monthly patronage anytime from your{" "}
              <Link href="/account" className="patronage-thanks__link">account</Link>.
            </p>
          </>
        ) : (
          <p>
            Your patronage means the work keeps coming. Thank you for backing it &mdash;
            no strings, no expectations, just belief that it should exist. A receipt is
            on its way to your email.
          </p>
        )}
        <p>
          <Link href="/" className="patronage-thanks__link">Back to the work &rarr;</Link>
        </p>
      </div>
    </div>
  );
}

export default function PatronageThankYouPage() {
  return (
    <Suspense
      fallback={
        <div className="page-static">
          <p style={{ color: "var(--text-tertiary)" }}>Loading...</p>
        </div>
      }
    >
      <PatronageThankYouContent />
    </Suspense>
  );
}
