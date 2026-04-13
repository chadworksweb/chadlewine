/**
 * Resolve metadata from a music URL.
 * Currently supports: Tidal (via oEmbed)
 */
export async function POST(request: Request) {
  const { url } = await request.json();
  if (!url?.trim()) {
    return Response.json({ error: "url required" }, { status: 400 });
  }

  const isTidal = /tidal\.com/i.test(url);

  if (isTidal) {
    try {
      const oembed = await fetch(
        `https://oembed.tidal.com/?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!oembed.ok) {
        return Response.json({ error: "Tidal could not resolve this URL" }, { status: 422 });
      }
      const data = await oembed.json();

      // oEmbed title is often "Song Title by Artist"
      const titleRaw: string = data.title || "";
      const artist: string = data.author_name || "";
      const albumArtUrl: string = data.thumbnail_url || null;

      let title = titleRaw;
      if (titleRaw.toLowerCase().endsWith(` by ${artist.toLowerCase()}`)) {
        title = titleRaw.slice(0, -(` by ${artist}`.length)).trim();
      } else if (titleRaw.includes(" by ") && artist) {
        title = titleRaw.split(" by ")[0].trim();
      }

      return Response.json({
        title: title || titleRaw,
        artist,
        album_art_url: albumArtUrl,
        source_platform: "tidal",
      });
    } catch {
      return Response.json({ error: "Failed to reach Tidal" }, { status: 502 });
    }
  }

  return Response.json({ error: "URL platform not supported — enter title and artist manually" }, { status: 422 });
}
