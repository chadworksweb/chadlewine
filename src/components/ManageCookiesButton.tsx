"use client";

import { useConsent } from "@/components/ConsentProvider";

/* Inline link-style button that re-opens the cookie-consent manager. Used in
   the privacy policy "Your Choices" section and anywhere a "manage cookies"
   affordance is needed. Must render under the root ConsentProvider. */
export function ManageCookiesButton({ children }: { children?: React.ReactNode }) {
  const { openManager } = useConsent();
  return (
    <button
      type="button"
      onClick={openManager}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        font: "inherit",
        color: "var(--text-accent, #8b9cf7)",
        textDecoration: "underline",
        cursor: "pointer",
      }}
    >
      {children || "manage cookie preferences"}
    </button>
  );
}
