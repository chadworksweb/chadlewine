import type { Metadata } from "next";
import { markUnsubscribedByToken } from "@/lib/audience";
import { UnsubscribeClient } from "@/components/UnsubscribeClient";

export const metadata: Metadata = {
  title: "Unsubscribe - Chad Lewine",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface SearchParams {
  token?: string;
}

async function unsubscribeByToken(
  token: string | undefined
): Promise<"ok" | "bad-token" | "no-token"> {
  if (!token) return "no-token";
  const ok = await markUnsubscribedByToken(token);
  return ok ? "ok" : "bad-token";
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  const outcome = await unsubscribeByToken(token);

  return <UnsubscribeClient outcome={outcome} token={token || null} />;
}
