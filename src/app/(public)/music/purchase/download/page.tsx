"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

function DownloadInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  return (
    <div id="page-download" className="page-static">
      <h1 className="page-static__title">Download</h1>
      {token ? (
        <>
          <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-xl)" }}>
            Your download should start automatically.
          </p>
          <a
            href={`/api/download/${token}`}
            className="track-detail__btn track-detail__btn--buy"
            style={{ display: "inline-block" }}
          >
            Download Now
          </a>
        </>
      ) : (
        <p style={{ color: "var(--text-tertiary)" }}>
          No download token provided. Check your purchase confirmation email.
        </p>
      )}
      <div style={{ marginTop: "var(--space-xl)" }}>
        <Link href="/music" style={{ color: "var(--text-accent)" }}>
          Back to Music
        </Link>
      </div>
    </div>
  );
}

export default function DownloadPage() {
  return (
    <Suspense fallback={<div className="page-static"><p style={{ color: "var(--text-tertiary)" }}>Loading...</p></div>}>
      <DownloadInner />
    </Suspense>
  );
}
