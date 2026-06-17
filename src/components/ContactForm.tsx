"use client";

import { useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

// Static, single-screen contact form. Reuses the Super Individual Night booking
// form's visual language (the bkf__ classes: stage, inputs, cta) but as one
// normal form -- no Typeform steps. Posts to /api/contact, which triages the
// message and routes it into the admin front desk (never straight to an inbox).

type Status = "idle" | "loading" | "ok" | "err";

export function ContactForm() {
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
    // Honeypot tripped -- pretend success, drop silently.
    if (honeypot) {
      setStatus("ok");
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
      const res = await fetch("/api/contact", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setStatus("ok");
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
    <section className="bkf" aria-label="Contact Chad">
      {/* Honeypot -- off-screen; bots fill it, humans never see it. */}
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

      <div className="bkf__panel">
        <div className="bkf__stage">
          <div className="bkf__static">
            {status === "ok" ? (
              <div className="bkf__hero" style={{ padding: 0 }}>
                <p className="bkf__eyebrow">Got it</p>
                <h2 className="bkf__headline">Thanks -- it came through.</h2>
                <p className="bkf__lede">
                  I read what comes in. I do not reply to everything, but the notes that
                  matter reach me. If yours calls for an answer, you&rsquo;ll hear back.
                </p>
              </div>
            ) : (
              <div className="contact-split">
                <div className="contact-split__main">
                <p className="bkf__step-eyebrow">Write to Chad</p>
                <h1 className="bkf__q">Contact Chad Lewine</h1>

                <form ref={formRef} className="bkf__form" onSubmit={onSubmit}>
                  <div className="bkf__field">
                    <input
                      id="ct-name"
                      name="name"
                      className="bkf__input"
                      type="text"
                      required
                      maxLength={200}
                      autoComplete="name"
                      placeholder="Your name"
                      aria-label="Your name"
                    />
                  </div>

                  <div className="bkf__field">
                    <input
                      id="ct-email"
                      name="email"
                      className="bkf__input"
                      type="email"
                      required
                      maxLength={200}
                      autoComplete="email"
                      placeholder="you@example.com"
                      aria-label="Email"
                    />
                  </div>

                  <div className="bkf__field">
                    <input
                      id="ct-subject"
                      name="subject"
                      className="bkf__input"
                      type="text"
                      maxLength={200}
                      placeholder="What's this about? (optional)"
                      aria-label="Subject (optional)"
                    />
                  </div>

                  <div className="bkf__field">
                    <textarea
                      id="ct-message"
                      name="message"
                      className="bkf__textarea"
                      required
                      maxLength={6000}
                      rows={7}
                      placeholder="Whatever you want to tell me."
                      aria-label="Message"
                    />
                  </div>

                  {turnstileKey && (
                    <div className="bkf__turnstile">
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

                  {status === "err" && message && (
                    <p className="bkf__error" role="status" aria-live="polite">
                      {message}
                    </p>
                  )}

                  <div className="bkf__nav">
                    <button
                      type="submit"
                      className="bkf__cta"
                      disabled={status === "loading"}
                    >
                      {status === "loading" ? "Sending..." : "Send →"}
                    </button>
                  </div>
                </form>
                </div>
                <div className="contact-split__media" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/contact/super-individual-stack.webp"
                    alt=""
                    className="contact-split__img"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
