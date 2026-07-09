"use client";

import { useEffect, useRef, useState } from "react";
import { EventShareButton } from "@/components/EventShareButton";

// "Coming with friends?" prompt + a share action.
function ShareRow() {
  return (
    <div className="event-rsvp-form__share">
      <span className="event-rsvp-form__share-text">Coming with friends? Share this for their RSVP too.</span>
      <EventShareButton className="event-rsvp-form__share-btn" label="Share →" />
    </div>
  );
}

// Open RSVP (name + email, one person per RSVP). Booking-form (bkf) field
// styling inside the conic-animated-border stage. Posts to /api/irl/rsvp with a
// honeypot + time-trap, mirroring the contact form's anti-spam stack.
export function EventRsvpForm({ eventId }: { eventId: string }) {
  const mountedAt = useRef(0);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => { mountedAt.current = Date.now(); }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setMessage("");
    const form = new FormData(e.currentTarget);
    form.set("eventId", eventId);
    form.set("elapsedMs", String(Date.now() - mountedAt.current));
    try {
      const res = await fetch("/api/irl/rsvp", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setState("done");
        setMessage(data?.duplicate ? "You are already on the list. See you there." : "You are on the list. See you there.");
      } else {
        setState("error");
        setMessage(data?.error || "Something went wrong. Please try again.");
      }
    } catch {
      setState("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="event-form-stage">
      <div className="event-form-stage__inner">
        {state === "done" ? (
          <div className="event-form-done">
            <span className="event-glyph event-glyph--lg" aria-hidden="true">
              <span style={{ opacity: 0.22 }}>&#9608;</span>
              <span style={{ opacity: 0.45 }}>&#9608;</span>
              <span style={{ opacity: 0.7 }}>&#9608;</span>
              <span>&#9608;</span>
            </span>
            <p className="event-form-done__msg">{message}</p>
            <ShareRow />
          </div>
        ) : (
          <form className="bkf__form event-rsvp-form" onSubmit={onSubmit}>
            <p className="bkf__step-eyebrow">Free RSVP</p>

            {/* Honeypot: off-screen; bots fill it, humans never see it. */}
            <div className="sw-hp" aria-hidden="true">
              <label>
                Company
                <input type="text" name="company" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <div className="event-rsvp-form__row">
              <div className="bkf__field">
                <label className="bkf__label" htmlFor="rsvp-name">Name</label>
                <input id="rsvp-name" className="bkf__input" type="text" name="name" required maxLength={200} autoComplete="name" />
              </div>
              <div className="bkf__field">
                <label className="bkf__label" htmlFor="rsvp-email">Email</label>
                <input id="rsvp-email" className="bkf__input" type="email" name="email" required autoComplete="email" placeholder="you@example.com" />
              </div>
            </div>

            {state === "error" && (
              <p className="bkf__error event-rsvp-form__error" role="status" aria-live="polite">{message}</p>
            )}

            <button className="bkf__cta event-rsvp-form__submit" type="submit" disabled={state === "sending"}>
              {state === "sending" ? "Sending..." : "Count me in →"}
            </button>

            <ShareRow />
          </form>
        )}
      </div>
    </div>
  );
}
