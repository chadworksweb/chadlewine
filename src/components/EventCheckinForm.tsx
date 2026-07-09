"use client";

import { useState } from "react";

// Self-scan check-in: the fan reached this via the venue QR. Confirm email,
// attendance is logged. Same bkf field styling + conic-border stage as the RSVP
// form. Deduped server-side per event + email.
export function EventCheckinForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setMessage("");
    const form = new FormData(e.currentTarget);
    form.set("token", token);
    try {
      const res = await fetch("/api/irl/checkin", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setState("done");
        setMessage(data?.duplicate ? "You are already checked in. Enjoy the show." : "You are checked in. Enjoy the show.");
      } else {
        setState("error");
        setMessage(data?.error || "Could not check you in. Please try again.");
      }
    } catch {
      setState("error");
      setMessage("Could not check you in. Please try again.");
    }
  }

  return (
    <div className="event-form-stage event-form-stage--compact">
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
          </div>
        ) : (
          <form className="bkf__form event-rsvp-form" onSubmit={onSubmit}>
            {/* Honeypot */}
            <div className="sw-hp" aria-hidden="true">
              <label>
                Company
                <input type="text" name="company" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <div className="bkf__field">
              <label className="bkf__label" htmlFor="checkin-name">
                Name <span className="bkf__opt">(optional)</span>
              </label>
              <input id="checkin-name" className="bkf__input" type="text" name="name" maxLength={200} autoComplete="name" />
            </div>

            <div className="bkf__field">
              <label className="bkf__label" htmlFor="checkin-email">Email</label>
              <input id="checkin-email" className="bkf__input" type="email" name="email" required autoFocus autoComplete="email" placeholder="you@example.com" />
            </div>

            {state === "error" && (
              <p className="bkf__error event-rsvp-form__error" role="status" aria-live="polite">{message}</p>
            )}

            <button className="bkf__cta event-rsvp-form__submit" type="submit" disabled={state === "sending"}>
              {state === "sending" ? "Checking in..." : "Check in →"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
