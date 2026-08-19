import { createPublicClient } from "@/lib/supabase-server";
import { getSingleSongIds } from "@/lib/song-singles";
import { fetchBadgesCached, badgeCacheKey } from "@/lib/rising-compass";
import "./SimilarSongs.css";

/**
 * Similar Songs, drawn over Chad's own catalogue and nothing else.
 *
 * The relation is Rising Compass' scheme applied locally: two songs are
 * related because they carry the same topics and land near each other on the
 * charge scale. Never by release order, never by what happens to be new.
 *
 * Scoring, highest first:
 *   overlap    x1000  shared / sqrt(base tags x candidate tags), the primary
 *                     axis. Sharing 4 of 5 topics beats sharing 5 of 14.
 *   proximity   0-100  100 minus the charge gap, so inside a near-tie on
 *                      overlap the closer reading wins
 *
 * The overlap is NORMALIZED where RC counts raw shared topics, and that is a
 * deliberate divergence. RC can afford a raw count because it also pays +40
 * for agreeing on the dominant topic, which rewards matching the primary read
 * instead of matching a lot of reads. `song_topics` is an unordered join
 * table, so there is no "first" topic here to pay that bonus on, and a raw
 * count without it turns tag count into ranking power: the catalogue's most
 * tagged song (New Age, 14 topics against a median of 4) qualified nearly
 * everywhere and took 34 in-links, four times the next song. Normalizing
 * closes that on its own. If display_order ever lands on song_topics, the
 * dominant bonus can be added on top of this rather than instead of it.
 *
 * Charge is read from `rc_badge_cache`, a chadlewine table. No call leaves
 * this site, and a song with no cached reading still relates on topics alone.
 */

const SIMILAR_LIMIT = 6;
// Scaled so a real difference in overlap always outranks the charge term:
// 0.1 of overlap is worth the whole proximity range, making charge the
// tiebreak between songs that match about as tightly as each other.
const OVERLAP_WEIGHT = 1000;
// Fallback band for a song with no topics: same tier, within this many points.
const CHARGE_BAND = 8;

interface Props {
  songId: string;
  songTitle: string;
}

interface Candidate {
  id: string;
  title: string;
  slug: string;
  topics: Map<string, string>; // slug -> label
  charge: number | null;
  tier: string | null;
  tierLabel: string | null;
  tierHex: string | null;
  release: { title: string; slug: string } | null;
}

function signedCharge(v: number | null): string {
  if (v === null) return "";
  return (v > 0 ? "+" : "") + v;
}

/**
 * Collapse a title to what it is a version OF. A demo, live cut, or alternate
 * shares every topic with its parent and lands beside it, so without this the
 * list spends two of its six rows on the same song.
 */
function titleKey(title: string): string {
  let t = (title || "").toLowerCase();
  for (const [open, close] of [
    ["(", ")"],
    ["[", "]"],
  ]) {
    while (t.includes(open)) {
      const [head, ...restParts] = t.split(open);
      const rest = restParts.join(open);
      const tail = rest.includes(close) ? rest.slice(rest.indexOf(close) + 1) : "";
      t = head + tail;
    }
  }
  return t.replace(/[^a-z0-9 ]/g, "").trim();
}

export async function SimilarSongs({ songId, songTitle }: Props) {
  const supabase = createPublicClient();

  const { data: songRows } = await supabase
    .from("songs")
    .select("id, title, slug, status")
    .in("status", ["unreleased", "published"]);
  if (!songRows || songRows.length === 0) return null;

  type SongRow = { id: string; title: string; slug: string; status: string };
  const songs = songRows as SongRow[];

  const [topicLinksRes, relRes, singleIds, badges] = await Promise.all([
    supabase.from("song_topics").select("song_id, topic:topics(label, slug)"),
    supabase
      .from("release_songs")
      .select("song_id, release:releases(title, slug, status, release_type)"),
    getSingleSongIds(supabase),
    fetchBadgesCached(songs.map((s) => ({ title: s.title, artist: "Chad Lewine" }))),
  ]);

  type TopicLite = { label: string; slug: string };
  const topicsBySong = new Map<string, Map<string, string>>();
  for (const row of (topicLinksRes.data || []) as unknown as {
    song_id: string;
    topic: TopicLite | TopicLite[] | null;
  }[]) {
    const topic = Array.isArray(row.topic) ? row.topic[0] : row.topic;
    if (!topic) continue;
    let m = topicsBySong.get(row.song_id);
    if (!m) {
      m = new Map();
      topicsBySong.set(row.song_id, m);
    }
    m.set(topic.slug, topic.label);
  }

  // Where to say a song lives: a studio release over a compilation, never the
  // song's own single (that names the row after itself).
  type ReleaseLite = {
    title: string;
    slug: string;
    status: string;
    release_type: string | null;
  };
  const releaseBySong = new Map<string, { title: string; slug: string }>();
  for (const row of (relRes.data || []) as unknown as {
    song_id: string;
    release: ReleaseLite | ReleaseLite[] | null;
  }[]) {
    const rel = Array.isArray(row.release) ? row.release[0] : row.release;
    if (!rel || rel.release_type === "single") continue;
    if (rel.status !== "published" && rel.status !== "unreleased") continue;
    const held = releaseBySong.get(row.song_id);
    // Studio first; a compilation only stands in for comp-only songs.
    if (held && rel.release_type === "compilation") continue;
    releaseBySong.set(row.song_id, { title: rel.title, slug: rel.slug });
  }

  const canClickThrough = (s: SongRow) =>
    s.status === "published" || (s.status === "unreleased" && singleIds.has(s.id));

  const build = (s: SongRow): Candidate => {
    const badge = badges.get(badgeCacheKey(s.title, "Chad Lewine"));
    return {
      id: s.id,
      title: s.title,
      slug: s.slug,
      topics: topicsBySong.get(s.id) || new Map(),
      charge: badge?.charge ?? null,
      tier: badge?.tier ?? null,
      tierLabel: badge?.tier_label ?? null,
      tierHex: badge?.tier_hex ?? null,
      release: releaseBySong.get(s.id) || null,
    };
  };

  const baseRow = songs.find((s) => s.id === songId);
  if (!baseRow) return null;
  const base = build(baseRow);
  const baseTopics = [...base.topics.keys()];

  const pool = songs
    .filter((s) => s.id !== songId && canClickThrough(s))
    .map(build);

  const scored: {
    cand: Candidate;
    shared: string[];
    gap: number | null;
    score: number;
  }[] = [];

  for (const cand of pool) {
    const shared = baseTopics.filter((t) => cand.topics.has(t));
    const gap =
      base.charge !== null && cand.charge !== null
        ? Math.abs(cand.charge - base.charge)
        : null;

    if (baseTopics.length > 0) {
      if (shared.length === 0) continue;
    } else {
      // No topics on this song: the only reading left to relate on is where it
      // landed, so fall back to its own tier inside a tight charge band.
      if (base.charge === null || !base.tier) continue;
      if (cand.tier !== base.tier || gap === null || gap > CHARGE_BAND) continue;
    }

    // Overlap as a share of both tag sets rather than a raw count, so a song
    // that is broadly tagged cannot outrank a tighter match on breadth.
    const denom = Math.sqrt(baseTopics.length * cand.topics.size);
    const overlap = denom > 0 ? shared.length / denom : 0;

    // Proximity maxes below any real overlap difference on purpose: topics
    // decide the set, charge only orders it. An unread song scores neutral
    // rather than last, so it is not buried for a gap nobody has measured.
    const proximity = gap === null ? 50 : 100 - Math.min(gap, 100);
    scored.push({
      cand,
      shared,
      gap,
      score: overlap * OVERLAP_WEIGHT + proximity,
    });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.gap ?? 999) - (b.gap ?? 999) ||
      a.cand.title.localeCompare(b.cand.title),
  );

  // One row per work, so no row is a demo of the row above it. The song's own
  // variants are excluded outright.
  const rows: typeof scored = [];
  const seenTitles = new Set<string>([titleKey(songTitle)]);
  for (const s of scored) {
    const key = titleKey(s.cand.title);
    if (key && seenTitles.has(key)) continue;
    seenTitles.add(key);
    rows.push(s);
    if (rows.length >= SIMILAR_LIMIT) break;
  }

  if (rows.length === 0) return null;

  return (
    <section className="similar-songs" aria-labelledby="similar-songs-heading">
      {/* The Explore title bar, same markup ExploreStrip uses. Its classes are
          unscoped in global.css, so the frame carries over intact. */}
      <div className="explore-strip__frame">
        <span className="explore-strip__frame-label" aria-hidden="true">░▒▓█</span>
        <h2 className="explore-strip__heading" id="similar-songs-heading">Similar Songs</h2>
        <span className="explore-strip__frame-label" aria-hidden="true">█▓▒░</span>
      </div>
      <ul className="similar-songs__grid">
        {rows.map(({ cand, shared, gap }) => {
          const labels = shared.map((slug) => cand.topics.get(slug) || slug);
          const note = labels.length ? `Shares ${labels.join(", ")}. ` : "";
          const gapNote =
            gap === null
              ? ""
              : gap === 0
                ? "Same charge."
                : `${gap} point${gap === 1 ? "" : "s"} apart.`;
          const why = `${note}${gapNote}`.trim();
          return (
            <li className="similar-songs__card" key={cand.id}>
              <a className="similar-songs__link" href={`/music/songs/${cand.slug}`}>
                {cand.tierLabel && (
                  <span
                    className="similar-songs__kicker"
                    style={{ color: cand.tierHex || undefined }}
                  >
                    <span
                      className="similar-songs__dot"
                      style={{ background: cand.tierHex || "#888" }}
                      aria-hidden="true"
                    />
                    {cand.tierLabel} {signedCharge(cand.charge)}
                  </span>
                )}
                <span className="similar-songs__name">{cand.title}</span>
                {cand.release && (
                  <span className="similar-songs__sub">{cand.release.title}</span>
                )}
                {why && <span className="similar-songs__why">{why}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
