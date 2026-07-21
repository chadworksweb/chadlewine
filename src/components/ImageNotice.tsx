"use client";

import { useEffect, useState } from "react";
import "./ImageNotice.css";

/* Temporary site-status popup: BunnyCDN account is unfunded for a few days so
   images 404. Dismissible per session (sessionStorage) so it reappears on a
   fresh visit but does not nag on route changes. Remove this component + its
   mount in (public)/layout.tsx once the CDN is funded and images return. */
const DISMISS_KEY = "cl-image-notice-dismissed";

export function ImageNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY) !== "1") setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  return (
    <div className="cl-imgnotice" role="status" aria-live="polite">
      <span className="cl-imgnotice__label" aria-hidden="true">{"▚▚ notice"}</span>
      <p className="cl-imgnotice__text">
        Please excuse the broken images, working to remedy this asap.
      </p>
      <button
        type="button"
        className="cl-imgnotice__close"
        aria-label="Dismiss notice"
        onClick={dismiss}
      >
        &times;
      </button>
    </div>
  );
}
