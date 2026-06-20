"use client";

import Link from "next/link";
import { useState } from "react";

interface Props {
  outcome: "valid" | "already" | "bad-token" | "no-token";
  token: string | null;
  email: string | null;
}

// Reuses the unsubscribe-page layout classes -- this is its sibling token-action
// page, so the same centered confirm card is the right shell (no new CSS).
export function ConfirmClient({ outcome, token, email }: Props) {
  const [confirmState, setConfirmState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const confirm = async () => {
    if (!token) return;
    setConfirmState("loading");
    const res = await fetch("/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setConfirmState(res.ok ? "done" : "error");
  };

  return (
    <div className="page-static unsubscribe-page">
      <div className="unsubscribe-page__inner">
        {outcome === "valid" && confirmState !== "done" && (
          <>
            <h1 className="unsubscribe-page__title">Confirm your subscription</h1>
            <p className="unsubscribe-page__body">
              {email
                ? <>One click confirms <strong>{email}</strong> is really yours, and you&rsquo;re in.</>
                : "One click confirms your email is really yours, and you're in."}
            </p>
            <div className="unsubscribe-page__resub">
              <button
                type="button"
                className="unsubscribe-page__submit"
                onClick={confirm}
                disabled={confirmState === "loading" || !token}
              >
                {confirmState === "loading" ? "Confirming..." : "Confirm my subscription"}
              </button>
              {confirmState === "error" && (
                <p className="unsubscribe-page__err">
                  Couldn&rsquo;t confirm that. Try again, or reply to the email
                  and I&rsquo;ll sort it out.
                </p>
              )}
            </div>
          </>
        )}

        {outcome === "valid" && confirmState === "done" && (
          <>
            <h1 className="unsubscribe-page__title">You&rsquo;re in.</h1>
            <p className="unsubscribe-page__body">
              Confirmed. A welcome note is on its way, and you&rsquo;ll hear from
              me here from now on.
            </p>
          </>
        )}

        {outcome === "already" && (
          <>
            <h1 className="unsubscribe-page__title">Already confirmed.</h1>
            <p className="unsubscribe-page__body">
              {email
                ? <><strong>{email}</strong> is confirmed and on the list. Nothing else to do.</>
                : "You're confirmed and on the list. Nothing else to do."}
            </p>
          </>
        )}

        {(outcome === "bad-token" || outcome === "no-token") && (
          <>
            <h1 className="unsubscribe-page__title">Couldn&rsquo;t find that link.</h1>
            <p className="unsubscribe-page__body">
              The confirm link may be old or forwarded. Subscribe again at
              chadlewine.com and I&rsquo;ll send a fresh one.
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
