"use client";

import { useCallback, useState } from "react";

// The subscribe form, inline in its own cell.
//
// Same endpoint and same double-opt-in contract as the site-wide
// SubscribeSection, and the same localStorage write on success, so a reader who
// signs up at the door is not chased by the engagement popup later. What it does
// NOT carry is that component's cursor-tracking glow: it is a 40-line effect
// built for a full-width band, and this is a cell that has to stay quiet.

export function FrontSubscribe() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email || !email.includes("@")) return;

      setStatus("loading");
      try {
        const res = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, source_page: window.location.pathname }),
        });

        if (res.ok) {
          setStatus("success");
          setMessage(
            "Check your email to confirm. The list is double opt-in, so nothing goes out until you say yes."
          );
          setEmail("");
          try {
            const prev = JSON.parse(localStorage.getItem("cl_submodal") || "{}");
            localStorage.setItem("cl_submodal", JSON.stringify({ ...prev, subscribed: true }));
          } catch {
            /* storage unavailable; ignore */
          }
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus("error");
          setMessage(data.error || "Something went wrong. Try again in a moment.");
        }
      } catch {
        // A dropped connection lands here rather than in the !res.ok branch, and
        // an unhandled rejection would leave the button spinning forever.
        setStatus("error");
        setMessage("Could not reach the server. Try again in a moment.");
      }
    },
    [email]
  );

  if (status === "success") {
    return <p className="front__sub-note front__sub-note--ok">{message}</p>;
  }

  return (
    <form className="front__sub" onSubmit={handleSubmit}>
      <label className="front__sub-label" htmlFor="front-email">
        Email
      </label>
      <div className="front__sub-fields">
        <input
          id="front-email"
          type="email"
          className="front__sub-input"
          placeholder="you@example.com"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" className="front__sub-button" disabled={status === "loading"}>
          {status === "loading" ? "Sending" : "Join"}
        </button>
      </div>
      {status === "error" && <p className="front__sub-note front__sub-note--bad">{message}</p>}
    </form>
  );
}
