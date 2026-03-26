"use client";

import { useState, useEffect } from "react";

export default function VoiceProfilePage() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/voice-profile")
      .then((r) => r.json())
      .then((data) => {
        setContent(data.content || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/voice-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setSaving(false);
    setSaved(true);
  }

  if (loading) return <div className="admin-page"><p>Loading...</p></div>;

  return (
    <div className="admin-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
        <h1 className="admin-page__title" style={{ margin: 0 }}>Voice Profile</h1>
        <button
          className="admin-btn admin-btn--primary"
          onClick={handleSave}
          disabled={saving}
          type="button"
        >
          {saving ? "Saving..." : saved ? "Saved" : "Save"}
        </button>
      </div>
      <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--reading-text-tertiary)", marginBottom: "var(--space-md)" }}>
        This profile is fed to Claude when generating optimization plans and hook/tension suggestions. Edit it anytime — changes take effect on the next analysis.
      </p>
      <textarea
        className="obsv-editor__textarea"
        value={content}
        onChange={(e) => { setContent(e.target.value); setSaved(false); }}
        style={{ width: "100%", minHeight: "70vh", fontFamily: "monospace", fontSize: "0.8125rem", lineHeight: 1.6 }}
      />
    </div>
  );
}
