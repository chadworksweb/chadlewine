"use client";

import { useState, useEffect, useCallback } from "react";

interface VoiceMessage {
  id: string;
  audio_storage_path: string;
  audio_url: string | null;
  duration_seconds: number | null;
  status: string;
  created_at: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VoiceMessagesPage() {
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    const res = await fetch("/api/admin/voice-messages");
    if (res.ok) setMessages(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  async function updateStatus(id: string, status: string) {
    await fetch("/api/admin/voice-messages", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    fetchMessages();
  }

  async function deleteMessage(id: string, path: string) {
    if (!confirm("Delete this voice message permanently?")) return;
    await fetch("/api/admin/voice-messages", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, path }),
    });
    fetchMessages();
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  const newCount = messages.filter((m) => m.status === "new").length;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">
          Voice Messages {newCount > 0 && <span style={{ color: "var(--text-accent)" }}>({newCount} new)</span>}
        </h1>
      </div>

      {messages.length === 0 ? (
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)" }}>
          No voice messages yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="admin-card"
              style={{
                padding: "var(--space-md)",
                background: msg.status === "new" ? "var(--bg-glass-hover)" : "var(--bg-elevated)",
                border: `1px solid ${msg.status === "new" ? "var(--text-accent)" : "var(--border-subtle)"}`,
                borderRadius: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-sm)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
                  <span className={`admin-status admin-status--${msg.status === "new" ? "published" : msg.status === "listened" ? "draft" : "private"}`}>
                    {msg.status}
                  </span>
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
                    {formatDate(msg.created_at)}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
                    {formatDuration(msg.duration_seconds)}
                  </span>
                </div>
              </div>

              {msg.audio_url ? (
                <audio
                  controls
                  src={msg.audio_url}
                  style={{ width: "100%", height: 36, marginBottom: "var(--space-sm)" }}
                  onPlay={() => {
                    if (msg.status === "new") updateStatus(msg.id, "listened");
                  }}
                />
              ) : (
                <p style={{ color: "var(--text-tertiary)", fontSize: "var(--text-xs)" }}>Audio unavailable</p>
              )}

              <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                {msg.status !== "listened" && msg.status !== "archived" && (
                  <button
                    className="admin-btn admin-btn--secondary"
                    style={{ fontSize: "0.6875rem", padding: "4px 12px" }}
                    onClick={() => updateStatus(msg.id, "listened")}
                  >
                    Mark Listened
                  </button>
                )}
                {msg.status !== "archived" && (
                  <button
                    className="admin-btn admin-btn--secondary"
                    style={{ fontSize: "0.6875rem", padding: "4px 12px" }}
                    onClick={() => updateStatus(msg.id, "archived")}
                  >
                    Archive
                  </button>
                )}
                <button
                  className="admin-btn admin-btn--danger"
                  style={{ fontSize: "0.6875rem", padding: "4px 12px" }}
                  onClick={() => deleteMessage(msg.id, msg.audio_storage_path)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
