import type { Metadata } from "next";
import { findAudienceForPrefsByToken } from "@/lib/audience";
import { PreferencesClient } from "@/components/PreferencesClient";

export const metadata: Metadata = {
  title: "Email preferences - Chad Lewine",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface SearchParams {
  token?: string;
}

export default async function PreferencesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  const found = token ? await findAudienceForPrefsByToken(token) : null;

  return (
    <PreferencesClient
      token={token || null}
      found={
        found
          ? {
              email: found.email,
              subscriber_status: found.subscriber_status,
              prefs: found.prefs,
            }
          : null
      }
    />
  );
}
