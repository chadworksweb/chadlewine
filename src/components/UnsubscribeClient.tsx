"use client";

import Link from "next/link";
import { useState } from "react";

interface Props {
  outcome: "valid" | "bad-token" | "no-token";
  token: string | null;
  email: string | null;
}

export function UnsubscribeClient({ outcome, token, email }: Props) {
  // The page no longer unsubscribes on load (so link-scanners can't). The
  // actual unsubscribe is this explicit confirm POST.
  const [confirmState, setConfirmState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [resubState, setResubState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [manualEmail, setManualEmail] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [manualState, setManualState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [manualError, setManualError] = useState("");

  const confirmUnsubscribe = async () => {
    if (!token) return;
    setConfirmState("loading");
    const res = await fetch("/api/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setConfirmState(res.ok ? "done" : "error");
  };

  const resubscribe = async () => {
    if (!token) return;
    setResubState("loading");
    const res = await fetch("/api/resubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setResubState(res.ok ? "done" : "error");
  };

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEmail.includes("@")) return;
    setManualState("loading");
    setManualError("");
    const res = await fetch("/api/unsubscribe/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: manualEmail,
        reason: manualReason || null,
        source_page: typeof window !== "undefined" ? window.location.href : null,
      }),
    });
    if (res.ok) {
      setManualState("done");
    } else {
      const d = await res.json().catch(() => ({}));
      setManualError(d.error || "Something went wrong.");
      setManualState("error");
    }
  };

  return (
    <div className="page-static unsubscribe-page">
      <div className="unsubscribe-page__inner">
        {outcome === "valid" && confirmState !== "done" && (
          <>
            <h1 className="unsubscribe-page__title">Unsubscribe?</h1>
            <p className="unsubscribe-page__body">
              {email
                ? <>Confirm you want to stop receiving emails sent to <strong>{email}</strong>.</>
                : "Confirm you want to stop receiving emails from this list."}
            </p>
            <div className="unsubscribe-page__resub">
              <button
                type="button"
                className="unsubscribe-page__submit"
                onClick={confirmUnsubscribe}
                disabled={confirmState === "loading" || !token}
              >
                {confirmState === "loading" ? "Unsubscribing..." : "Confirm unsubscribe"}
              </button>
              {confirmState === "error" && (
                <p className="unsubscribe-page__err">
                  Couldn&rsquo;t process that. Try again, or reply
                  &ldquo;unsubscribe&rdquo; to a recent email.
                </p>
              )}
            </div>
          </>
        )}

        {outcome === "valid" && confirmState === "done" && resubState !== "done" && (
          <>
            <h1 className="unsubscribe-page__title">You&rsquo;re unsubscribed.</h1>
            <div className="unsubscribe-page__resub">
              <p className="unsubscribe-page__resub-line">
                Unsubscribed by mistake?
              </p>
              <button
                type="button"
                className="unsubscribe-page__resub-btn"
                onClick={resubscribe}
                disabled={resubState === "loading" || !token}
              >
                {resubState === "loading"
                  ? "Resubscribing..."
                  : "Resubscribe by clicking here"}
              </button>
              {resubState === "error" && (
                <p className="unsubscribe-page__err">
                  Couldn&rsquo;t resubscribe. Try again later or reply
                  &ldquo;resubscribe&rdquo; to a recent email.
                </p>
              )}
            </div>
          </>
        )}

        {outcome === "valid" && resubState === "done" && (
          <>
            <h1 className="unsubscribe-page__title">You&rsquo;re back in.</h1>
            <p className="unsubscribe-page__body">
              Resubscribed. You&rsquo;ll start getting emails again on the
              next send.
            </p>
          </>
        )}

        {outcome !== "valid" && manualState !== "done" && (
          <>
            <h1 className="unsubscribe-page__title">
              {outcome === "bad-token"
                ? "Couldn’t find that link."
                : "Unsubscribe"}
            </h1>
            <p className="unsubscribe-page__body">
              {outcome === "bad-token"
                ? "The unsubscribe link in your email may be old or forwarded. Enter the email address that was subscribed and I’ll take care of it."
                : "Enter the email address you’d like removed from the list."}
            </p>

            <form className="unsubscribe-page__form" onSubmit={submitManual}>
              <input
                type="email"
                className="unsubscribe-page__input"
                placeholder="you@example.com"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                required
              />
              <textarea
                className="unsubscribe-page__textarea"
                placeholder="Reason (optional)"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                rows={3}
              />
              <button
                type="submit"
                className="unsubscribe-page__submit"
                disabled={manualState === "loading" || !manualEmail}
              >
                {manualState === "loading" ? "Submitting..." : "Request unsubscribe"}
              </button>
              {manualState === "error" && manualError && (
                <p className="unsubscribe-page__err">{manualError}</p>
              )}
            </form>
          </>
        )}

        {manualState === "done" && (
          <>
            <h1 className="unsubscribe-page__title">Request received.</h1>
            <p className="unsubscribe-page__body">
              I&rsquo;ll process this within a day. You won&rsquo;t receive
              future sends from this list once it’s confirmed.
            </p>
          </>
        )}

        <p className="unsubscribe-page__actions">
          <Link href="/" className="unsubscribe-page__home">
            Back to chadlewine.com &rarr;
          </Link>
        </p>
      </div>
    </div>
  );
}
