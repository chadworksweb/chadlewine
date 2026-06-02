"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface Album { id: string; title: string; slug: string; status: string; display_order: number; release_date: string | null; }
interface Song { id: string; title: string; status: string; streaming_path: string | null; lyrics: string | null; release_id?: string; }
interface FeaturedSong { id: string; title: string; slug: string; }

export default function AdminMusicPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [albumSongCounts, setAlbumSongCounts] = useState<Record<string, number>>({});
  const [featured, setFeatured] = useState<FeaturedSong | null>(null);
  const [settingFeatured, setSettingFeatured] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<string>("preview");
  const [savingPlayback, setSavingPlayback] = useState(false);
  const [sponsorDemosEnabled, setSponsorDemosEnabled] = useState(false);
  const [savingSponsorDemos, setSavingSponsorDemos] = useState(false);
  const [exploreMode, setExploreMode] = useState<"random" | "manual">("random");
  const [exploreIds, setExploreIds] = useState<string[]>([]);
  const [savingExplore, setSavingExplore] = useState(false);
  const [exploreSaved, setExploreSaved] = useState(false);
  const [selectAlbumId, setSelectAlbumId] = useState<string>("");
  const [savingSelect, setSavingSelect] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [aRes, sRes, fRes, settingsRes] = await Promise.all([
      fetch("/api/admin/releases"),
      fetch("/api/admin/songs"),
      fetch("/api/admin/featured-track"),
      fetch("/api/admin/site-settings"),
    ]);
    const albumsData = await aRes.json();
    const songsData = await sRes.json();
    const featuredData = await fRes.json();
    const settingsData = await settingsRes.json();
    setAlbums(albumsData);
    setSongs(songsData);
    setFeatured(featuredData);
    if (settingsData.playback_mode) setPlaybackMode(settingsData.playback_mode);
    setSponsorDemosEnabled(settingsData.sponsor_demos_enabled === "true");
    if (settingsData.homepage_explore_songs_mode === "manual" || settingsData.homepage_explore_songs_mode === "random") {
      setExploreMode(settingsData.homepage_explore_songs_mode);
    }
    if (settingsData.homepage_explore_songs_ids) {
      try {
        const parsed = JSON.parse(settingsData.homepage_explore_songs_ids);
        if (Array.isArray(parsed)) setExploreIds(parsed);
      } catch {}
    }
    if (settingsData.music_hub_select_album_id) {
      setSelectAlbumId(settingsData.music_hub_select_album_id);
    }

    // Get song counts per album
    const counts: Record<string, number> = {};
    for (const album of albumsData) {
      const res = await fetch(`/api/admin/songs?release_id=${album.id}`);
      const albumSongs = await res.json();
      counts[album.id] = albumSongs.length;
    }
    setAlbumSongCounts(counts);
    setLoading(false);
  }, []);

  async function handleSetPlaybackMode(mode: string) {
    setSavingPlayback(true);
    await fetch("/api/admin/site-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playback_mode: mode }),
    });
    setPlaybackMode(mode);
    setSavingPlayback(false);
  }

  async function handleSetSponsorDemos(enabled: boolean) {
    setSavingSponsorDemos(true);
    await fetch("/api/admin/site-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sponsor_demos_enabled: enabled ? "true" : "false" }),
    });
    setSponsorDemosEnabled(enabled);
    setSavingSponsorDemos(false);
  }

  async function handleSaveExplore(nextMode: "random" | "manual", nextIds: string[]) {
    setSavingExplore(true);
    setExploreSaved(false);
    await fetch("/api/admin/site-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        homepage_explore_songs_mode: nextMode,
        homepage_explore_songs_ids: JSON.stringify(nextIds),
      }),
    });
    setSavingExplore(false);
    setExploreSaved(true);
    setTimeout(() => setExploreSaved(false), 2000);
  }

  function handleExploreModeChange(nextMode: "random" | "manual") {
    setExploreMode(nextMode);
    handleSaveExplore(nextMode, exploreIds);
  }

  function handleAddExploreSong(songId: string) {
    if (!songId || exploreIds.includes(songId) || exploreIds.length >= 10) return;
    const next = [...exploreIds, songId];
    setExploreIds(next);
    handleSaveExplore(exploreMode, next);
  }

  function handleRemoveExploreSong(songId: string) {
    const next = exploreIds.filter((id) => id !== songId);
    setExploreIds(next);
    handleSaveExplore(exploreMode, next);
  }

  function handleMoveExploreSong(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= exploreIds.length) return;
    const next = [...exploreIds];
    [next[index], next[target]] = [next[target], next[index]];
    setExploreIds(next);
    handleSaveExplore(exploreMode, next);
  }

  async function handleSetSelectAlbum(albumId: string) {
    setSavingSelect(true);
    await fetch("/api/admin/site-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ music_hub_select_release_id: albumId }),
    });
    setSelectAlbumId(albumId);
    setSavingSelect(false);
  }

  async function handleSetFeatured(songId: string) {
    setSettingFeatured(true);
    const res = await fetch("/api/admin/featured-track", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song_id: songId }),
    });
    const data = await res.json();
    if (!data.error) setFeatured(data);
    setSettingFeatured(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Music</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/music/releases/new" className="admin-btn admin-btn--primary">New Release</Link>
          <Link href="/admin/music/songs/new" className="admin-btn admin-btn--secondary">New Song</Link>
        </div>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card"><span className="admin-stats__value">{albums.length}</span><span className="admin-stats__label">Releases</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{songs.length}</span><span className="admin-stats__label">Songs</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{songs.filter(s => s.lyrics).length}</span><span className="admin-stats__label">With Lyrics</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{songs.filter(s => s.streaming_path).length}</span><span className="admin-stats__label">Streamable</span></div>
      </div>

      <div style={{ marginBottom: "var(--space-xl)", padding: "var(--space-lg)", background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", borderRadius: 8 }}>
        <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--space-md)" }}>Select Album (Music Page)</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          <select
            value={selectAlbumId}
            onChange={(e) => handleSetSelectAlbum(e.target.value)}
            disabled={savingSelect}
            style={{ flex: 1, padding: "8px 12px", background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-medium)", borderRadius: 6, fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)" }}
          >
            <option value="">Auto (first by display order)</option>
            {albums.filter((a) => a.status === "published").map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
          {selectAlbumId && (
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-accent)", whiteSpace: "nowrap" }}>
              {savingSelect ? "Saving..." : `Current: ${albums.find((a) => a.id === selectAlbumId)?.title || "—"}`}
            </span>
          )}
        </div>
      </div>

      <div style={{ marginBottom: "var(--space-xl)", padding: "var(--space-lg)", background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", borderRadius: 8 }}>
        <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--space-md)" }}>Featured Song (Homepage)</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          <select
            value={featured?.id || ""}
            onChange={(e) => e.target.value && handleSetFeatured(e.target.value)}
            disabled={settingFeatured}
            style={{ flex: 1, padding: "8px 12px", background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-medium)", borderRadius: 6, fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)" }}
          >
            <option value="">None</option>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          {featured && (
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-accent)", whiteSpace: "nowrap" }}>
              {settingFeatured ? "Saving..." : `Current: ${featured.title}`}
            </span>
          )}
        </div>
      </div>

      <div style={{ marginBottom: "var(--space-xl)", padding: "var(--space-lg)", background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", borderRadius: 8 }}>
        <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--space-md)" }}>Playback Default</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          <select
            value={playbackMode}
            onChange={(e) => handleSetPlaybackMode(e.target.value)}
            disabled={savingPlayback}
            style={{ flex: 1, padding: "8px 12px", background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-medium)", borderRadius: 6, fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)" }}
          >
            <option value="preview">30s Preview</option>
            <option value="full">Full Length</option>
          </select>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
            {savingPlayback ? "Saving..." : `Sitewide: ${playbackMode === "full" ? "Full Length" : "30s Preview"}`}
          </span>
        </div>
      </div>

      <div style={{ marginBottom: "var(--space-xl)", padding: "var(--space-lg)", background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", borderRadius: 8 }}>
        <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--space-md)" }}>Sponsor Demos</h2>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-primary)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={sponsorDemosEnabled}
            disabled={savingSponsorDemos}
            onChange={(e) => handleSetSponsorDemos(e.target.checked)}
          />
          <span>
            Feature is{" "}
            <strong style={{ color: sponsorDemosEnabled ? "var(--text-accent)" : "var(--text-tertiary)" }}>
              {savingSponsorDemos ? "saving..." : sponsorDemosEnabled ? "ON" : "OFF"}
            </strong>{" "}
            sitewide
          </span>
        </label>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", margin: "var(--space-sm) 0 0" }}>
          Master switch for paid demo sponsorships. When off, every sponsor widget shows paused and the sponsor checkout is blocked. Per-song on/off lives in each song&rsquo;s Sponsorship panel.
        </p>
      </div>

      <div style={{ marginBottom: "var(--space-xl)", padding: "var(--space-lg)", background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", borderRadius: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-md)" }}>
          <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Explore Songs (Homepage)</h2>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-xs)", color: savingExplore ? "var(--text-tertiary)" : "var(--text-accent)" }}>
            {savingExplore ? "Saving..." : exploreSaved ? "Saved" : ""}
          </span>
        </div>

        <div style={{ display: "flex", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-primary)", cursor: "pointer" }}>
            <input type="radio" name="explore-mode" value="random" checked={exploreMode === "random"} onChange={() => handleExploreModeChange("random")} />
            Random (10 from all published)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-primary)", cursor: "pointer" }}>
            <input type="radio" name="explore-mode" value="manual" checked={exploreMode === "manual"} onChange={() => handleExploreModeChange("manual")} />
            Manual (pick and order up to 10)
          </label>
        </div>

        {exploreMode === "manual" && (
          <>
            <div style={{ display: "flex", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
              <select
                value=""
                onChange={(e) => { handleAddExploreSong(e.target.value); e.target.value = ""; }}
                disabled={exploreIds.length >= 10}
                style={{ flex: 1, padding: "8px 12px", background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-medium)", borderRadius: 6, fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)" }}
              >
                <option value="">{exploreIds.length >= 10 ? "Max 10 reached" : "Add a song..."}</option>
                {songs.filter((s) => !exploreIds.includes(s.id)).map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-tertiary)", alignSelf: "center", whiteSpace: "nowrap" }}>
                {exploreIds.length} / 10
              </span>
            </div>

            {exploreIds.length > 0 && (
              <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {exploreIds.map((id, i) => {
                  const song = songs.find((s) => s.id === id);
                  return (
                    <li key={id} style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", padding: "8px 12px", background: "var(--bg-elevated)", border: "1px solid var(--border-medium)", borderRadius: 6, fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>
                      <span style={{ color: "var(--text-tertiary)", minWidth: 20 }}>{i + 1}.</span>
                      <span style={{ flex: 1 }}>{song?.title || <span style={{ color: "var(--text-tertiary)" }}>Missing song ({id.slice(0, 8)}...)</span>}</span>
                      <button type="button" onClick={() => handleMoveExploreSong(i, -1)} disabled={i === 0} className="admin-btn admin-btn--secondary" style={{ padding: "4px 10px" }}>↑</button>
                      <button type="button" onClick={() => handleMoveExploreSong(i, 1)} disabled={i === exploreIds.length - 1} className="admin-btn admin-btn--secondary" style={{ padding: "4px 10px" }}>↓</button>
                      <button type="button" onClick={() => handleRemoveExploreSong(id)} className="admin-btn admin-btn--secondary" style={{ padding: "4px 10px" }}>×</button>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </div>

      <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--space-md)" }}>Releases</h2>
      <table className="admin-table">
        <thead><tr><th className="admin-table__th">Title</th><th className="admin-table__th">Songs</th><th className="admin-table__th">Status</th><th className="admin-table__th">Release</th></tr></thead>
        <tbody>
          {albums.map((a) => (
            <tr key={a.id} className="admin-table__row">
              <td className="admin-table__td"><Link href={`/admin/music/releases/${a.slug || a.id}`} className="admin-table__link">{a.title}</Link></td>
              <td className="admin-table__td">{albumSongCounts[a.id] || 0}</td>
              <td className="admin-table__td"><span className={`admin-status admin-status--${a.status}`}>{a.status}</span></td>
              <td className="admin-table__td admin-table__td--date">{a.release_date || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
