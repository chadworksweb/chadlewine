"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";

function ThankYouContent() {
  const params = useSearchParams();
  const type = params.get("type"); // song | album | diddy
  const id = params.get("id");

  const [status, setStatus] = useState<"polling" | "ready" | "timeout">("polling");
  const [token, setToken] = useState<string | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  const poll = useCallback(async () => {
    if (!type || !id) { setStatus("timeout"); return; }

    const res = await fetch(`/api/purchase-status?type=${type}&id=${id}`);
    if (!res.ok) return;

    const data = await res.json();
    if (data.status === "ready" && data.token) {
      setToken(data.token);
      setFormat(data.format || null);
      setStatus("ready");
    } else {
      setAttempts((prev) => prev + 1);
    }
  }, [type, id]);

  useEffect(() => {
    if (status !== "polling") return;
    if (attempts >= 12) { setStatus("timeout"); return; } // Stop after ~60s

    const timer = setTimeout(poll, attempts === 0 ? 500 : 5000);
    return () => clearTimeout(timer);
  }, [status, attempts, poll]);

  return (
    <div id="page-thank-you" className="page-static">
      <h1 className="page-static__title">Thank You</h1>

      {status === "polling" && (
        <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-xl)" }}>
          Your purchase is confirmed. Preparing your download...
        </p>
      )}

      {status === "ready" && token && (
        <>
          <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
            Your download is ready. This link is yours to keep — bookmark it or save the email.
          </p>
          <a
            href={`/api/download/${token}`}
            className="track-detail__btn track-detail__btn--buy"
            style={{ display: "inline-block", marginBottom: "var(--space-lg)", textDecoration: "none" }}
          >
            {format ? `Download ${format.toUpperCase()}` : "Download Now"}
          </a>
          <p style={{ color: "var(--text-tertiary)", fontSize: "var(--text-xs)", marginBottom: "var(--space-xl)" }}>
            A copy has been sent to your email. If you ever lose it, recover your downloads at{" "}
            <Link href="/music/recover" style={{ color: "var(--text-accent)" }}>/music/recover</Link>.
          </p>
        </>
      )}

      {status === "timeout" && (
        <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-xl)" }}>
          Your purchase is confirmed. Your download link is on its way by email. You can also
          recover it at{" "}
          <Link href="/music/recover" style={{ color: "var(--text-accent)" }}>/music/recover</Link>.
        </p>
      )}

      <Link href="/music" style={{ color: "var(--text-accent)" }}>
        Back to Music
      </Link>
    </div>
  );
}

export default function PurchaseThankYouPage() {
  return (
    <Suspense fallback={<div className="page-static"><p style={{ color: "var(--text-tertiary)" }}>Loading...</p></div>}>
      <ThankYouContent />
    </Suspense>
  );
}
