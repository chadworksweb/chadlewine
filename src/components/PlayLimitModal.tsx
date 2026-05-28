"use client";

import { useEffect } from "react";
import Link from "next/link";
import "./PlayLimitModal.css";

// Shown when an anonymous device tries to play a song it has already played
// the maximum number of times. Playback does not start; this modal nudges the
// visitor to sign in / create an account (unlimited plays) or buy the song.
// Rendered by PlayerProvider, controlled by its blockedSong state.

interface Props {
  song: { title: string; slug: string };
  onClose: () => void;
}

export function PlayLimitModal({ song, onClose }: Props) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="cl-playgate-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cl-playgate-title"
      onClick={onClose}
    >
      <div className="cl-playgate-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="cl-playgate-close"
          aria-label="Close"
          onClick={onClose}
        >
          &times;
        </button>

        <p className="cl-playgate-eyebrow">Free play limit reached</p>
        <h2 id="cl-playgate-title" className="cl-playgate-title">
          You&rsquo;ve played &ldquo;{song.title}&rdquo; a few times
        </h2>
        <p className="cl-playgate-body">
          Create a free account or sign in to keep listening without limits.
          Or own the song outright &mdash; yours to play anywhere, forever.
        </p>

        <div className="cl-playgate-actions">
          <Link href="/account/register" className="cl-playgate-btn cl-playgate-btn--primary">
            Create free account
          </Link>
          <Link href="/account/login" className="cl-playgate-btn cl-playgate-btn--ghost">
            Sign in
          </Link>
        </div>

        <Link
          href={`/music/songs/${song.slug}`}
          className="cl-playgate-buy"
          onClick={onClose}
        >
          Buy this song &rarr;
        </Link>
      </div>
    </div>
  );
}
