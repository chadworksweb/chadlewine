"use client";

import Link from "next/link";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { MANAGED_PAGES, slugToRoute } from "@/lib/managed-pages";

interface Form {
  title: string;
  description: string;
  og_image_path: string;
}

const EMPTY: Form = { title: "", description: "", og_image_path: "" };

export default function AdminPageMetaEditor({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const route = slugToRoute(slug);
  const meta = MANAGED_PAGES.find((p) => p.route === route);
  const router = useRouter();

  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/page-meta")
      .then((r) => r.json())
      .then((rows) => {
        const row = (rows || []).find((x: { route: string }) => x.route === route);
        if (row?.meta) {
          setForm({
            title: row.meta.title || "",
            description: row.meta.description || "",
            og_image_path: row.meta.og_image_path || "",
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [route]);

  if (!meta) {
    return (
      <div className="admin-page">
        <h1 className="admin-page__title">Unknown page</h1>
        <p>No managed page matches <code>{route}</code>.</p>
        <Link href="/admin/pages" className="admin-btn">← Back to Pages</Link>
      </div>
    );
  }

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/page-meta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        route,
        title: form.title,
        description: form.description,
        og_image_path: form.og_image_path,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Save failed");
      return;
    }
    setSavedAt(new Date().toLocaleTimeString());
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "#888" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">{meta.label}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/pages" className="admin-btn">← Back</Link>
          <button className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <p style={{ color: "#666", marginTop: 0 }}>
        Route: <code>{route}</code>. Blank fields fall back to hardcoded defaults. Use <strong>Clear</strong> to wipe an override.
      </p>

      {error && <p style={{ color: "#c22", fontFamily: "var(--font-ui)" }}>{error}</p>}
      {savedAt && <p style={{ color: "#3a8", fontFamily: "var(--font-ui)" }}>Saved at {savedAt}</p>}

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Title</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="obsv-editor__input"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="(using hardcoded default)"
            style={{ flex: 1 }}
          />
          <button type="button" className="admin-btn" onClick={() => set("title", "")}>Clear</button>
        </div>
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Description</label>
        <div style={{ display: "flex", gap: 8 }}>
          <textarea
            className="obsv-editor__input"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="(using hardcoded default)"
            rows={3}
            style={{ flex: 1 }}
          />
          <button type="button" className="admin-btn" onClick={() => set("description", "")}>Clear</button>
        </div>
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">OG Image path</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="obsv-editor__input"
            value={form.og_image_path}
            onChange={(e) => set("og_image_path", e.target.value)}
            placeholder="/path/to/image.jpg or full URL"
            style={{ flex: 1 }}
          />
          <button type="button" className="admin-btn" onClick={() => set("og_image_path", "")}>Clear</button>
        </div>
        {form.og_image_path && (
          <div style={{ marginTop: 8 }}>
            <img src={form.og_image_path} alt="OG preview" style={{ maxWidth: 320, border: "1px solid #d8d8dc" }} />
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <button className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <p style={{ color: "#888", fontSize: 12, marginTop: 32 }}>
        Router: {router ? "ready" : ""}
      </p>
    </div>
  );
}
