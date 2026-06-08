import type { Metadata } from "next";
import { lookupAudienceByToken } from "@/lib/audience";
import { UnsubscribeClient } from "@/components/UnsubscribeClient";

export const metadata: Metadata = {
  title: "Unsubscribe - Chad Lewine",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface SearchParams {
  token?: string;
}

// Mask the local part so a forwarded link doesn't leak the full address.
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

// IMPORTANT: this page must NOT unsubscribe on load. It only LOOKS UP the
// token and renders a confirm screen; the actual unsubscribe is an explicit
// POST from the confirm button (or an RFC 8058 one-click from the mail client).
// This prevents email security scanners -- which fetch every link on delivery --
// from silently unsubscribing real recipients.
async function resolveToken(
  token: string | undefined
): Promise<{ outcome: "valid" | "bad-token" | "no-token"; email: string | null }> {
  if (!token) return { outcome: "no-token", email: null };
  const row = await lookupAudienceByToken(token);
  if (!row) return { outcome: "bad-token", email: null };
  // Already unsubscribed? Treat as valid so the client shows the unsub state.
  return { outcome: "valid", email: maskEmail(row.email) };
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  const { outcome, email } = await resolveToken(token);

  return (
    <UnsubscribeClient outcome={outcome} token={token || null} email={email} />
  );
}
