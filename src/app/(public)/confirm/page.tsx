import type { Metadata } from "next";
import { lookupAudienceByToken } from "@/lib/audience";
import { ConfirmClient } from "@/components/ConfirmClient";

export const metadata: Metadata = {
  title: "Confirm your subscription - Chad Lewine",
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

// Like the unsubscribe page: this only LOOKS UP the token and renders a button.
// The confirm itself is an explicit POST from the button, so link-scanners that
// GET this page on delivery can't auto-confirm a dead address.
async function resolveToken(
  token: string | undefined
): Promise<{ outcome: "valid" | "already" | "bad-token" | "no-token"; email: string | null }> {
  if (!token) return { outcome: "no-token", email: null };
  const row = await lookupAudienceByToken(token);
  if (!row) return { outcome: "bad-token", email: null };
  // Already active -> nothing to do; the client shows a confirmed state.
  if (row.subscriber_status === "active") {
    return { outcome: "already", email: maskEmail(row.email) };
  }
  return { outcome: "valid", email: maskEmail(row.email) };
}

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  const { outcome, email } = await resolveToken(token);

  return <ConfirmClient outcome={outcome} token={token || null} email={email} />;
}
