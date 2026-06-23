"use client";

import { useEffect, useState, useCallback } from "react";
import "./SubscribeModal.css";

// Engagement-triggered subscribe modal. Presentational + self-contained submit
// (posts to the existing /api/subscribe). The decision of WHETHER/WHEN to show
// lives in SubscribeModalController; this component just renders and submits.

interface Props {
  sourcePage: string;
  onClose: () => void;
  onSubscribed: () => void;
}

// Must match the glitch-out animation duration in SubscribeModal.css.
const CLOSE_ANIM_MS = 360;

export function SubscribeModal({ sourcePage, onClose, onSubscribed }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [closing, setClosing] = useState(false);

  // Play the glitch-out animation, then unmount (parent removes us on onClose).
  const requestClose = useCallback(() => {
    setClosing((already) => {
      if (already) return already;
      setTimeout(onClose, CLOSE_ANIM_MS);
      return true;
    });
  }, [onClose]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email || !email.includes("@")) return;

      setStatus("loading");
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source_page: sourcePage }),
      });

      if (res.ok) {
        setStatus("success");
        setMessage("Almost there. Check your email and click confirm, then you're in.");
        setEmail("");
        onSubscribed();
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus("error");
        setMessage(data.error || "Something went wrong.");
      }
    },
    [email, sourcePage, onSubscribed]
  );

  return (
    <div
      className={`cl-submodal-overlay${closing ? " cl-submodal-overlay--closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cl-submodal-title"
      onClick={requestClose}
    >
      <div
        className={`cl-submodal-card${closing ? " cl-submodal-card--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="cl-submodal-close"
          aria-label="Close"
          onClick={requestClose}
        >
          &times;
        </button>

        <p className="cl-submodal-eyebrow">Before you disappear</p>
        <h2 id="cl-submodal-title" className="cl-submodal-title">
          Don&rsquo;t lose track of me
        </h2>

        {status === "success" ? (
          <p className="cl-submodal-success">{message}</p>
        ) : (
          <>
            <p className="cl-submodal-body">
              I&rsquo;m not on social media. If you leave this site, you may
              never see or hear from me again &mdash; don&rsquo;t let that
              happen. Subscribe to see where I&rsquo;m headed.
            </p>

            <form className="cl-submodal-form" onSubmit={handleSubmit}>
              <input
                type="email"
                className="cl-submodal-input"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Email address"
                required
              />
              <button
                type="submit"
                className="cl-submodal-btn"
                disabled={status === "loading"}
              >
                {status === "loading" ? "..." : "Subscribe"}
              </button>
            </form>

            {status === "error" && (
              <p className="cl-submodal-error">{message}</p>
            )}

            <button
              type="button"
              className="cl-submodal-dismiss"
              onClick={requestClose}
            >
              No thanks
            </button>
          </>
        )}
      </div>
    </div>
  );
}
