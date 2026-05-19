"use client";

import Link from "next/link";
import { useEffect, useRef, useState, use } from "react";
import { MANAGED_PAGES, slugToRoute } from "@/lib/managed-pages";

interface Form {
  title: string;
  description: string;
  og_image_path: string;
}

const EMPTY: Form = { title: "", description: "", og_image_path: "" };
const DEBOUNCE_MS = 800;

type Status = "idle" | "saving" | "saved" | "error";

export default function AdminPageMetaEditor({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const route = slugToRoute(slug);
  const meta = MANAGED_PAGES.find((p) => p.route === route);

  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>("idle");

  const lastSavedJson = useRef<string>(JSON.stringify(EMPTY));
  const inflight = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    fetch("/api/admin/page-meta")
      .then((r) => r.json())
      .then((rows) => {
        const row = (rows || []).find((x: { route: string }) => x.route === route);
        const next = row?.meta
          ? {
              title: row.meta.title || "",
              description: row.meta.description || "",
              og_image_path: row.meta.og_image_path || "",
            }
          : { ...EMPTY };
        lastSavedJson.current = JSON.stringify(next);
        setForm(next);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [route]);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  // Debounced autosave
  useEffect(() => {
    if (loading) return;
    const json = JSON.stringify(form);
    if (json === lastSavedJson.current) return;

    const timer = setTimeout(() => {
      const fire = async () => {
        if (inflight.current) {
          pending.current = true;
          return;
        }
        inflight.current = true;
        setStatus("saving");
        try {
          const res = await fetch("/api/admin/page-meta", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ route, ...form }),
          });
          if (res.ok) {
            lastSavedJson.current = json;
            setStatus("saved");
          } else {
            setStatus("error");
          }
        } catch {
          setStatus("error");
        } finally {
          inflight.current = false;
          if (pending.current) {
            pending.current = false;
            // re-fire with current form
            fire();
          }
        }
      };
      fire();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [form, loading, route]);

  if (!meta) {
    return (
      <div className="admin-page">
        <h1 className="admin-page__title">Unknown page</h1>
        <p>No managed page matches <code>{route}</code>.</p>
        <Link href="/admin/pages" className="admin-btn">← Back to Pages</Link>
      </div>
    );
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/admin/pages" className="admin-btn">← Back</Link>
          <span className={`autosave-status autosave-status--${status}`}>
            {status === "saving" && "Saving..."}
            {status === "saved" && "Saved"}
            {status === "error" && "Save failed"}
          </span>
        </div>
      </div>

      <p style={{ color: "#666", marginTop: 0 }}>
        Route: <code>{route}</code>. Blank fields fall back to hardcoded defaults. Use <strong>Clear</strong> to wipe an override.
      </p>

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
            {/* eslint-disable-next-line @next/next/no-img-element -- admin-only preview */}
            <img src={form.og_image_path} alt="OG preview" style={{ maxWidth: 320, border: "1px solid #d8d8dc" }} />
          </div>
        )}
      </div>
    </div>
  );
}
