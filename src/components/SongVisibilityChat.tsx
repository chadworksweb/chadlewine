"use client";

import { useState, useEffect, useRef } from "react";
import type { SongVisibilityMessage } from "@/lib/song-visibility";

export function SongVisibilityChat({
  songId,
  onSectionsUpdated,
}: {
  songId: string;
  onSectionsUpdated?: () => void;
}) {
  const [messages, setMessages] = useState<SongVisibilityMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load existing messages
  useEffect(() => {
    fetch(`/api/admin/song-visibility-messages?song_id=${songId}`)
      .then((r) => r.json())
      .then((data: SongVisibilityMessage[]) => {
        setMessages(data);
        setLoading(false);
      });
  }, [songId]);

  // Auto-scroll on new content
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
      const res = await fetch("/api/admin/song-visibility-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setStreaming(false);
        return;
      }

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
              onSectionsUpdated?.();
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
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
    if (!confirm("Clear conversation history? Section content will be kept.")) return;
    await fetch(`/api/admin/song-visibility-messages?song_id=${songId}`, { method: "DELETE" });
    setMessages([]);
  }

  if (loading) {
    return (
      <div className="song-visibility__chat">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  const hasMessages = messages.length > 0 || streamText;

  return (
    <div className="song-visibility__chat">
      <div className="song-visibility__chat-header">
        <h3 className="obsv-editor__panel-title" style={{ margin: 0 }}>Visibility Chat</h3>
        {messages.length > 0 && (
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={handleReset}
            style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
          >
            Reset
          </button>
        )}
      </div>

      <div ref={scrollRef} className="song-visibility__chat-messages">
        {!hasMessages && (
          <div className="song-visibility__chat-empty">
            <p style={{ color: "var(--text-secondary)", fontFamily: "var(--font-ui)", fontSize: "0.875rem", marginBottom: "1rem" }}>
              Start the visibility engine to analyze this song and generate marketing material across all 10 categories.
            </p>
            <button
              type="button"
              className="admin-btn"
              onClick={() => sendMessage()}
              disabled={streaming}
            >
              Start Visibility
            </button>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`song-visibility__msg song-visibility__msg--${msg.role}`}>
            <div className="song-visibility__msg-role">
              {msg.role === "user" ? "You" : "Claude"}
            </div>
            <div className="song-visibility__msg-content">
              {msg.content.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i < msg.content.split("\n").length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}

        {streamText && (
          <div className="song-visibility__msg song-visibility__msg--assistant">
            <div className="song-visibility__msg-role">Claude</div>
            <div className="song-visibility__msg-content">
              {streamText.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i < streamText.split("\n").length - 1 && <br />}
                </span>
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
            placeholder={streaming ? "Waiting for response..." : "Reply..."}
            disabled={streaming}
            className="obsv-editor__input"
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className="admin-btn"
            disabled={streaming || !input.trim()}
            style={{ marginLeft: "0.5rem" }}
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
