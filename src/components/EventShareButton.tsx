"use client";

import { useState } from "react";

// Shares the event page URL (native share sheet where available, clipboard copy
// as fallback) so a friend lands on the event and RSVPs on their own. Styling
// is driven entirely by `className` so it can wear the pop-up CTA look or the
// inline RSVP-share look.
export function EventShareButton({
  className,
  label = "Share",
  copiedLabel = "Link copied",
}: {
  className?: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href.split("?")[0] : "";
    const title = typeof document !== "undefined" ? document.title : "IRL Event";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // dismissed or unsupported target -- fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked -- nothing more to do silently
    }
  }

  return (
    <button type="button" className={className} onClick={share}>
      {copied ? copiedLabel : label}
    </button>
  );
}
