"use client";

import { useState } from "react";
import Link from "next/link";

export default function RecoverPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("sending");
    await fetch("/api/music/recover/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    setState("sent");
  }

  return (
    <div id="page-recover" className="page-static">
      <h1 className="page-static__title">Recover downloads</h1>

      {state !== "sent" ? (
        <>
          <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
            Enter the email you used at checkout. We&apos;ll send you a link to see all your downloads.
          </p>
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", marginBottom: "var(--space-xl)" }}
          >
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="patronage__input"
              style={{ flex: "1 1 260px", width: "auto", minWidth: 0 }}
              disabled={state === "sending"}
            />
            <button
              type="submit"
              className="patronage__submit"
              disabled={state === "sending" || !email.trim()}
            >
              {state === "sending" ? "Sending..." : "Email my link"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
            Check your inbox. If we have a purchase under <strong>{email}</strong>, a recovery link
            is on its way. The link expires in 15 minutes.
          </p>
          <p style={{ color: "var(--text-tertiary)", fontSize: "var(--text-sm)", marginBottom: "var(--space-xl)" }}>
            Didn&apos;t get it? Check spam, or{" "}
            <button
              type="button"
              onClick={() => { setState("idle"); }}
              style={{ background: "none", border: "none", color: "var(--text-accent)", cursor: "pointer", padding: 0, font: "inherit" }}
            >
              try again
            </button>
            .
          </p>
        </>
      )}

      <Link href="/music" style={{ color: "var(--text-accent)" }}>
        Back to Music
      </Link>
    </div>
  );
}
