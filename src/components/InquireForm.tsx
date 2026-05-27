"use client";

import { useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { INQUIRY_INTERESTS } from "@/lib/inquiry-interests";
import { InterestSelect } from "@/components/InterestSelect";
import { FileDrop } from "@/components/FileDrop";

type Status = "idle" | "loading" | "ok" | "err";

const ACCEPT = "audio/*,video/*,image/*,.pdf";

export function InquireForm() {
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const turnstileKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const formRef = useRef<HTMLFormElement>(null);
  const mountedAt = useRef(Date.now());

  const [honeypot, setHoneypot] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Honeypot tripped - pretend success, drop silently.
    if (honeypot) {
      setStatus("ok");
      setMessage("Thanks - I'll be in touch.");
      formRef.current?.reset();
      return;
    }
    if (turnstileKey && !token) {
      setStatus("err");
      setMessage("Please complete the verification check.");
      return;
    }

    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    fd.append("elapsedMs", String(Date.now() - mountedAt.current));
    if (token) fd.append("turnstileToken", token);

    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/inquire", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setStatus("ok");
        setMessage("Got it. I'll be in touch.");
        form.reset();
      } else {
        setStatus("err");
        setMessage(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("err");
      setMessage("Network error. Please try again.");
    } finally {
      setToken(null);
      turnstileRef.current?.reset();
    }
  };

  return (
    <form ref={formRef} className="sw-inquire__form" onSubmit={onSubmit}>
      {/* Honeypot - hidden off-screen; bots fill it, humans never see it. */}
      <div className="sw-hp" aria-hidden="true">
        <label>
          Company
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      <div className="sw-field">
        <input id="iq-name" name="name" type="text" required maxLength={200} autoComplete="name" placeholder="Name *" aria-label="Name" />
      </div>
      <div className="sw-field">
        <input id="iq-email" name="email" type="email" required autoComplete="email" placeholder="Email *" aria-label="Email" />
      </div>
      <div className="sw-field">
        <input id="iq-phone" name="phone" type="tel" autoComplete="tel" placeholder="Phone" aria-label="Phone" />
      </div>
      <div className="sw-field">
        <input id="iq-location" name="location" type="text" autoComplete="address-level2" placeholder="Location" aria-label="Location" />
      </div>
      <div className="sw-field">
        <InterestSelect
          name="interest"
          options={INQUIRY_INTERESTS}
          placeholder="What are you inquiring about?"
        />
      </div>

      <fieldset className="sw-field sw-field--files">
        <legend className="sw-field__legend--lg">
          Share your voice or ideas{" "}
          <span className="sw-field__hint">(at least one file required &mdash; audio, video, image, or PDF)</span>
        </legend>
        <div className="sw-files-grid">
          <FileDrop name="file1" label="File 1" accept={ACCEPT} required />
          <FileDrop name="file2" label="File 2" accept={ACCEPT} />
          <FileDrop name="file3" label="File 3" accept={ACCEPT} />
        </div>
      </fieldset>

      {turnstileKey && (
        <div className="sw-field sw-field--turnstile">
          <Turnstile
            ref={turnstileRef}
            siteKey={turnstileKey}
            onSuccess={setToken}
            onError={() => setToken(null)}
            onExpire={() => setToken(null)}
            options={{ theme: "dark" }}
          />
        </div>
      )}

      <button
        type="submit"
        className="explore-songs__cta sw-inquire__submit"
        disabled={status === "loading"}
      >
        {status === "loading" ? "Sending..." : "Send inquiry →"}
      </button>

      {message && (
        <p className={`sw-inquire__msg sw-inquire__msg--${status}`} role="status" aria-live="polite">
          {message}
        </p>
      )}
    </form>
  );
}
