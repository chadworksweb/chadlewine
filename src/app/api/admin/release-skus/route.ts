import { createAdminClient } from "@/lib/supabase-server";

// List release_skus for the merch editor's physical-music picker. By default
// returns vinyl/cd/cassette only (the physical_music formats); pass
// ?include_digital=1 to also include digital. Each row carries the parent
// release's slug + title so the dropdown can show "Release Title (Vinyl)".
export async function GET(request: Request) {
  const supabase = createAdminClient();
  const url = new URL(request.url);
  const includeDigital = url.searchParams.get("include_digital") === "1";
  const formats = includeDigital
    ? ["vinyl", "cd", "cassette", "digital"]
    : ["vinyl", "cd", "cassette"];

  const { data, error } = await supabase
    .from("release_skus")
    .select("id, format, status, release:releases!inner(id, slug, title, status, release_date)")
    .in("format", formats)
    .order("format");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string;
    format: string;
    status: string;
    release: { id: string; slug: string; title: string; status: string; release_date: string | null } | null;
  };
  const rows = ((data as unknown) as Row[] | null) || [];

  // Sort: published releases first, by release_date desc, then by format.
  rows.sort((a, b) => {
    const aPub = a.release?.status === "published" ? 1 : 0;
    const bPub = b.release?.status === "published" ? 1 : 0;
    if (aPub !== bPub) return bPub - aPub;
    const ad = a.release?.release_date || "";
    const bd = b.release?.release_date || "";
    if (ad !== bd) return bd.localeCompare(ad);
    return a.format.localeCompare(b.format);
  });

  return Response.json(rows);
}
