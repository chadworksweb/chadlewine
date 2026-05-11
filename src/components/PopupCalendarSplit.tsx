"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  googleUrl: string;
  icsUrl: string;
  primary?: boolean;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.44c-.28 1.69-1.34 3.21-2.81 4.21v3.5h4.36c2.56-2.36 3.5-5.83 3.5-9.95z" fill="#4285F4" />
      <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-4.36-3.5c-1.2.8-2.74 1.27-4.57 1.27-3.51 0-6.48-2.37-7.55-5.54H2.46v3.62A11.998 11.998 0 0 0 12 24z" fill="#34A853" />
      <path d="M4.45 13.32a7.2 7.2 0 0 1-.38-2.32c0-.81.14-1.59.38-2.32V5.06H2.46a12.011 12.011 0 0 0 0 13.88l1.99-3.62z" fill="#FBBC04" />
      <path d="M12 4.66c1.86 0 3.54.64 4.86 1.89l3.64-3.64C18.46 1.07 15.74 0 12 0 7.34 0 3.31 2.69 1.46 6.59l3.49 3.62C5.52 7.02 8.49 4.66 12 4.66z" fill="#EA4335" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.86-3.08.4-1.09-.47-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function OutlookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="1" y="5" width="13" height="14" fill="#0364B8" rx="1" />
      <path d="M14 7l8 3.5v3L14 17V7z" fill="#0078D4" />
      <circle cx="7.5" cy="12" r="3" fill="#fff" />
      <circle cx="7.5" cy="12" r="1.6" fill="#0078D4" />
    </svg>
  );
}

export function PopupCalendarSplit({ googleUrl, icsUrl, primary = false }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", handleOutside);
    return () => document.removeEventListener("click", handleOutside);
  }, [open]);

  const baseCls = primary
    ? "si-popup__cta si-popup__cta--primary si-popup__cta--split"
    : "si-popup__cta si-popup__cta--split";

  return (
    <div
      ref={ref}
      className={baseCls}
      data-open={open || undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        setOpen((o) => !o);
      }}
    >
      <span className="si-popup__cta-split-label">Add to calendar</span>
      <div className="si-popup__cta-split-options" role="menu" aria-label="Calendar providers">
        <a
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="si-popup__cta-split-option"
          role="menuitem"
          onClick={() => setOpen(false)}
        >
          <span className="si-popup__cta-split-icon si-popup__cta-split-icon--google"><GoogleIcon /></span>
          <span>Google</span>
        </a>
        <a
          href={icsUrl}
          download="super-individual-pop-up.ics"
          className="si-popup__cta-split-option"
          role="menuitem"
          onClick={() => setOpen(false)}
        >
          <span className="si-popup__cta-split-icon"><AppleIcon /></span>
          <span>Apple</span>
        </a>
        <a
          href={icsUrl}
          download="super-individual-pop-up.ics"
          className="si-popup__cta-split-option"
          role="menuitem"
          onClick={() => setOpen(false)}
        >
          <span className="si-popup__cta-split-icon"><OutlookIcon /></span>
          <span>Outlook</span>
        </a>
      </div>
    </div>
  );
}
