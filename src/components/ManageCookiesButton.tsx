"use client";

import { useConsent } from "@/components/ConsentProvider";

/* Inline link-style button that re-opens the cookie-consent manager. Used in
   the privacy policy "Your Choices" section and anywhere a "manage cookies"
   affordance is needed. Must render under the root ConsentProvider. */
export function ManageCookiesButton({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const { openManager } = useConsent();

  // Base reset so the <button> sits inline like a text link. When a className
  // is supplied (e.g. footer link styling), let that class own color and
  // decoration; otherwise fall back to the default accent-underline look.
  const baseStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    cursor: "pointer",
  };
  const style: React.CSSProperties = className
    ? baseStyle
    : { ...baseStyle, color: "var(--text-accent, #8b9cf7)", textDecoration: "underline" };

  return (
    <button type="button" onClick={openManager} className={className} style={style}>
      {children || "manage cookie preferences"}
    </button>
  );
}
