import { createAdminClient } from "./supabase-server";

export type RedirectContentType =
  | "observation"
  | "art"
  | "song"
  | "album"
  | "release"
  | "door_page"
  | "page"
  | "curation"
  | "foundation"
  | "lyrics"
  | "event";

/**
 * Capture a path change: create/update a 301 from oldPath → newPath.
 * Also flattens any existing redirect chains that were pointing at oldPath.
 *
 * Called from PUT routes whenever a slug-bearing field changes.
 */
export async function captureSlugChange(
  oldPath: string,
  newPath: string,
  contentType: RedirectContentType,
  contentId: string | null
): Promise<void> {
  if (!oldPath || !newPath || oldPath === newPath) return;

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Re-point any chain: A→oldPath becomes A→newPath
  await supabase
    .from("redirects")
    .update({ to_path: newPath, updated_at: now })
    .eq("to_path", oldPath);

  // If newPath was previously a from_path (someone redirected from newPath → X),
  // that old redirect is now obsolete because newPath is canonical again.
  await supabase.from("redirects").delete().eq("from_path", newPath);

  // Upsert oldPath → newPath (overwrites prior auto redirect if re-renamed)
  await supabase.from("redirects").upsert(
    {
      from_path: oldPath,
      to_path: newPath,
      status_code: 301,
      source: "auto",
      content_type: contentType,
      content_id: contentId,
      active: true,
      updated_at: now,
    },
    { onConflict: "from_path" }
  );
}

/**
 * Edge-compatible redirect lookup via Supabase REST.
 * Used from proxy.ts where the full SDK isn't practical.
 * Returns null for no match.
 */
export async function lookupRedirectEdge(
  path: string
): Promise<{ to_path: string; status_code: number } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const query = `${url}/rest/v1/redirects?select=to_path,status_code&from_path=eq.${encodeURIComponent(
    path
  )}&active=eq.true&limit=1`;

  try {
    const res = await fetch(query, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ to_path: string; status_code: number }>;
    return rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget hit counter. Safe to call from Edge runtime.
 */
export async function recordRedirectHit(path: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return;

  try {
    await fetch(`${url}/rest/v1/rpc/increment_redirect_hit`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_from: path }),
      cache: "no-store",
    });
  } catch {
    // best-effort; don't block request
  }
}
