"use client";

import { useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import {
  AUDIT_HOLD_MINUTES,
  AUDIT_LAUNCH_ACTIVE,
  auditHoldCents,
  formatAuditCents,
} from "@/lib/audit-rate";

type Status = "idle" | "sending" | "error";

/** The booking form only. The terms it consents to are their own section on
   the page above -- the checkbox here is the gate, and the hold route rejects
   any submit without it. */
export function AuditHoldForm() {
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const turnstileKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const formRef = useRef<HTMLFormElement>(null);
  const mountedAt = useRef(Date.now());

  const [honeypot, setHoneypot] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const holdLabel = formatAuditCents(auditHoldCents(AUDIT_LAUNCH_ACTIVE));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending" || !agreed) return;

    setStatus("sending");
    setMessage("");

    const fd = new FormData(formRef.current!);
    fd.append("elapsedMs", String(Date.now() - mountedAt.current));
    if (token) fd.append("turnstileToken", token);

    try {
      const res = await fetch("/api/audit/hold", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok || data.error) {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Try again.");
        turnstileRef.current?.reset();
        setToken(null);
        return;
      }

      // Straight to Stripe. Deliberately not resetting status: the redirect is
      // in flight and a re-enabled button is a second hold waiting to happen.
      if (data.url) {
        window.location.href = data.url;
        return;
      }

      setStatus("error");
      setMessage("Could not reach checkout. Try again.");
    } catch {
      setStatus("error");
      setMessage("Could not reach checkout. Try again.");
      turnstileRef.current?.reset();
      setToken(null);
    }
  }

  return (
    <form ref={formRef} className="sa-hold" onSubmit={handleSubmit}>
      <div className="sa-hold__fields">
        <label className="sa-hold__label" htmlFor="sa-name">
          Name
          <input
            id="sa-name"
            name="name"
            type="text"
            className="sa-hold__input"
            autoComplete="name"
          />
        </label>

        <label className="sa-hold__label" htmlFor="sa-email">
          Email
          <input
            id="sa-email"
            name="email"
            type="email"
            required
            className="sa-hold__input"
            autoComplete="email"
          />
        </label>
      </div>

      {/* Honeypot. Hidden from people, catches bots that fill everything. */}
      <input
        type="text"
        name="company"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="sa-hold__honeypot"
      />

      <label className="sa-agreement__check">
        <input
          type="checkbox"
          name="agreement"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          required
        />
        <span>
          I have read the terms above. I understand I am tracking my own time.
        </span>
      </label>

      {turnstileKey && (
        <div className="sa-hold__turnstile">
          <Turnstile
            ref={turnstileRef}
            siteKey={turnstileKey}
            onSuccess={setToken}
            onExpire={() => setToken(null)}
          />
        </div>
      )}

      <div className="bk-cta">
        <button
          type="submit"
          className="bk-cta__btn"
          disabled={status === "sending" || !agreed}
        >
          {status === "sending"
            ? "Opening checkout..."
            : `Book my session -- ${holdLabel}`}
        </button>
      </div>

      <p className="sa-hold__note">
        {holdLabel} holds the spot and covers your first {AUDIT_HOLD_MINUTES}{" "}
        minutes. The card you use is the card the balance settles against when
        the session ends.
      </p>

      {status === "error" && (
        <p className="sa-hold__error" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
