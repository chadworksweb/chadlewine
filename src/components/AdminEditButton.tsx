"use client";

import { useEffect, useState } from "react";

interface AdminEditButtonProps {
  href: string;
}

// Admin-only edit affordance. This was a server component that read the
// sb-access-token cookie, which forced every content page rendering it (songs,
// observations, releases, art, meditations, merch) into dynamic rendering and
// defeated ISR. It now resolves admin status client-side via /api/auth/me so
// the surrounding page stays statically cacheable; the pencil paints for admins
// just after hydration. The /admin/* target is auth-gated by proxy.ts anyway,
// so this is purely a UX hint (keying off is_admin instead of the old loose
// "any signed-in cookie" check, so fans no longer see a dead edit link).
export function AdminEditButton({ href }: AdminEditButtonProps) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setIsAdmin(!!d?.user?.is_admin);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isAdmin) return null;

  return (
    <a
      href={href}
      className="admin-edit-btn"
      title="Edit in admin"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M9.5 3.5L12.5 6.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    </a>
  );
}
