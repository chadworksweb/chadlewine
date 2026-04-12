"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { SongGeoPanel } from "@/components/SongGeoPanel";
import type { SongComposition, SongCompositionMessage } from "@/lib/song-visibility";

interface CompositionRevision {
  id: string;
  revision_number: number;
  content: string;
  content_html: string;
  created_at: string;
}

export function SongCompositionPanel({
  songId,
  hasRawSections,
}: {
  songId: string;
  hasRawSections: boolean;
}) {
  const [messages, setMessages] = useState<SongCompositionMessage[]>([]);
  const [composition, setComposition] = useState<SongComposition | null>(null);
  const [geoFields, setGeoFields] = useState({
    focus_keyphrase: "",
    secondary_keyphrases: [] as string[],
    citation_summary: "",
    paa_pairs: [] as { question: string; answer: string }[],
    entity_tags: [] as string[],
    seo_title: "",
    seo_description: "",
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState<"preview" | "edit">("preview");
  const [revisions, setRevisions] = useState<CompositionRevision[]>([]);
  const [showRevisions, setShowRevisions] = useState(false);
  const [viewingRevision, setViewingRevision] = useState<CompositionRevision | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(() => {
    Promise.all([
      fetch(`/api/admin/song-composition-messages?song_id=${songId}`).then((r) => r.json()),
      fetch(`/api/admin/song-composition?song_id=${songId}`).then((r) => r.json()),
      fetch(`/api/admin/songs/${songId}`).then((r) => r.json()),
      fetch(`/api/admin/song-composition-revisions?song_id=${songId}`).then((r) => r.json()),
    ]).then(([msgs, comp, song, revs]) => {
      setMessages(msgs || []);
      setComposition(comp);
      setRevisions(revs || []);
      setGeoFields({
        focus_keyphrase: song.focus_keyphrase || "",
        secondary_keyphrases: song.secondary_keyphrases || [],
        citation_summary: song.citation_summary || "",
        paa_pairs: song.paa_pairs || [],
        entity_tags: song.entity_tags || [],
        seo_title: song.seo_title || "",
        seo_description: song.seo_description || "",
      });
      setLoading(false);
    });
  }, [songId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamText]);

  async function sendMessage(userMessage?: string) {
    setStreaming(true);
    setStreamText("");

    const body: Record<string, string> = { song_id: songId };
    if (userMessage) {
      body.message = userMessage;
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), song_id: songId, role: "user", content: userMessage, created_at: new Date().toISOString() },
      ]);
      setInput("");
    }

    try {
      const res = await fetch("/api/admin/song-composition-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) { setStreaming(false); return; }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.text) {
              accumulated += event.text;
              setStreamText(accumulated);
            }
            if (event.done) {
              setMessages((prev) => [
                ...prev,
                { id: crypto.randomUUID(), song_id: songId, role: "assistant", content: accumulated, created_at: new Date().toISOString() },
              ]);
              setStreamText("");
              // Refresh composition + GEO fields
              fetchData();
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("Composition chat error:", err);
    } finally {
      setStreaming(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    sendMessage(input.trim());
  }

  async function handleReset() {
    if (!confirm("Clear composition conversation? The composed content will be kept.")) return;
    await fetch(`/api/admin/song-composition-messages?song_id=${songId}`, { method: "DELETE" });
    setMessages([]);
  }

  function handleRecompose() {
    if (!confirm("Re-compose? The current version will be saved as a revision.")) return;
    sendMessage("Re-compose this piece. The current version has been archived. Write a fresh composition from the raw visibility data, applying the voice profile and humanizing rules more rigorously.");
  }

  async function handlePublishToggle() {
    if (!composition) return;
    const newStatus = composition.status === "published" ? "draft" : "published";
    const res = await fetch("/api/admin/song-composition", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: composition.id, status: newStatus }),
    });
    const updated = await res.json();
    setComposition(updated);
  }

  async function handleRestoreRevision(revisionId: string) {
    if (!confirm("Restore this revision? The current composition will be archived.")) return;
    const res = await fetch("/api/admin/song-composition-revisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song_id: songId, revision_id: revisionId }),
    });
    const updated = await res.json();
    setComposition(updated);
    setViewingRevision(null);
    fetchData();
  }

  if (loading) {
    return <div style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", padding: "1rem" }}>Loading...</div>;
  }

  if (!hasRawSections) {
    return (
      <div style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", padding: "1rem", textAlign: "center" }}>
        Complete the visibility chat first to generate raw material for composition.
      </div>
    );
  }

  const hasMessages = messages.length > 0 || streamText;

  return (
    <div className="song-composition">
      <div className="song-composition__grid">
        {/* Left: Chat */}
        <div className="song-composition__chat-col">
          <div className="song-composition__chat">
            <div className="song-composition__chat-header">
              <h3 className="obsv-editor__panel-title" style={{ margin: 0 }}>Composition</h3>
              <div style={{ display: "flex", gap: "0.35rem" }}>
                {composition && !streaming && (
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={handleRecompose} style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}>
                    Re-compose
                  </button>
                )}
                {messages.length > 0 && (
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={handleReset} style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}>
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div ref={scrollRef} className="song-composition__messages">
              {!hasMessages && (
                <div className="song-composition__empty">
                  <p style={{ color: "var(--text-secondary)", fontFamily: "var(--font-ui)", fontSize: "0.875rem", marginBottom: "1rem" }}>
                    Compose the publishable content from your raw visibility data. Claude synthesizes all 9 categories into a unified piece and fills the GEO fields to 100.
                  </p>
                  <button type="button" className="admin-btn" onClick={() => sendMessage()} disabled={streaming}>
                    Start Composition
                  </button>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`song-visibility__msg song-visibility__msg--${msg.role}`}>
                  <div className="song-visibility__msg-role">{msg.role === "user" ? "You" : "Claude"}</div>
                  <div className="song-visibility__msg-content">
                    {msg.content.split("\n").map((line, i) => (
                      <span key={i}>{line}{i < msg.content.split("\n").length - 1 && <br />}</span>
                    ))}
                  </div>
                </div>
              ))}

              {streamText && (
                <div className="song-visibility__msg song-visibility__msg--assistant">
                  <div className="song-visibility__msg-role">Claude</div>
                  <div className="song-visibility__msg-content">
                    {streamText.split("\n").map((line, i) => (
                      <span key={i}>{line}{i < streamText.split("\n").length - 1 && <br />}</span>
                    ))}
                    <span className="song-visibility__cursor">▊</span>
                  </div>
                </div>
              )}
            </div>

            {hasMessages && (
              <form onSubmit={handleSubmit} className="song-visibility__chat-input">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={streaming ? "Composing..." : "Refine..."}
                  disabled={streaming}
                  className="obsv-editor__input"
                  style={{ flex: 1 }}
                />
                <button type="submit" className="admin-btn" disabled={streaming || !input.trim()} style={{ marginLeft: "0.5rem" }}>
                  Send
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right: Preview + GEO Score */}
        <div className="song-composition__preview-col">
          {composition && (
            <>
              <div className="song-composition__preview-header">
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button
                    type="button"
                    className={`song-composition__tab${previewMode === "preview" ? " song-composition__tab--active" : ""}`}
                    onClick={() => setPreviewMode("preview")}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className={`song-composition__tab${previewMode === "edit" ? " song-composition__tab--active" : ""}`}
                    onClick={() => setPreviewMode("edit")}
                  >
                    Markdown
                  </button>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span className={`song-composition__status-badge song-composition__status-badge--${composition.status}`}>
                    {composition.status}
                  </span>
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={handlePublishToggle} style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}>
                    {composition.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                </div>
              </div>

              <div className="song-composition__preview-body">
                {previewMode === "preview" ? (
                  <div
                    className="song-composition__rendered reading-column"
                    dangerouslySetInnerHTML={{ __html: composition.content_html }}
                  />
                ) : (
                  <pre className="song-composition__markdown">{composition.content}</pre>
                )}
              </div>
            </>
          )}

          {!composition && !streaming && (
            <div style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontSize: "0.875rem", padding: "2rem", textAlign: "center" }}>
              No composition yet. Start the composition chat to generate.
            </div>
          )}

          {/* Revision viewing overlay */}
          {viewingRevision && (
            <div style={{ marginTop: "1rem", background: "var(--surface-primary)", border: "1px solid #ffbb33", borderRadius: "6px", padding: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "#ffbb33" }}>
                  Revision #{viewingRevision.revision_number} — {new Date(viewingRevision.created_at).toLocaleDateString()}
                </span>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={() => handleRestoreRevision(viewingRevision.id)} style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}>
                    Restore
                  </button>
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setViewingRevision(null)} style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}>
                    Close
                  </button>
                </div>
              </div>
              <div
                className="song-composition__rendered reading-column"
                dangerouslySetInnerHTML={{ __html: viewingRevision.content_html }}
                style={{ maxHeight: "300px", overflowY: "auto" }}
              />
            </div>
          )}

          {/* Revisions list */}
          {revisions.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <button
                type="button"
                onClick={() => setShowRevisions((v) => !v)}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-tertiary)", padding: 0 }}
              >
                {showRevisions ? "▾" : "▸"} {revisions.length} revision{revisions.length !== 1 ? "s" : ""}
              </button>
              {showRevisions && (
                <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {revisions.map((rev) => (
                    <button
                      key={rev.id}
                      type="button"
                      onClick={() => setViewingRevision(rev)}
                      style={{
                        background: viewingRevision?.id === rev.id ? "rgba(139, 156, 247, 0.1)" : "none",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "4px",
                        padding: "0.35rem 0.5rem",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "var(--font-ui)",
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Rev #{rev.revision_number} — {new Date(rev.created_at).toLocaleDateString()} {new Date(rev.created_at).toLocaleTimeString()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: "1rem" }}>
            <SongGeoPanel
              compositionContent={composition?.content || ""}
              focusKeyphrase={geoFields.focus_keyphrase}
              secondaryKeyphrases={geoFields.secondary_keyphrases}
              citationSummary={geoFields.citation_summary}
              paaPairs={geoFields.paa_pairs}
              entityTags={geoFields.entity_tags}
              seoTitle={geoFields.seo_title}
              seoDescription={geoFields.seo_description}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
