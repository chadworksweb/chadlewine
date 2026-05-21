"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BlockEditor } from "@/components/BlockEditor";
import type { EmailBlock } from "@/lib/email-blocks";

interface InitialTemplate {
  name: string;
  kind: string;
  subject_template: string;
  preheader_template: string | null;
  body_blocks: EmailBlock[];
}

interface EmailTemplateEditorProps {
  slug: string;
  initial: InitialTemplate;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function EmailTemplateEditor({ slug, initial }: EmailTemplateEditorProps) {
  const [name, setName] = useState(initial.name);
  const [subject, setSubject] = useState(initial.subject_template);
  const [preheader, setPreheader] = useState(initial.preheader_template || "");
  const [blocks, setBlocks] = useState<EmailBlock[]>(initial.body_blocks);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [previewHtml, setPreviewHtml] = useState<string>("");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced autosave.
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setStatus("saving");
      const res = await fetch(`/api/admin/email-templates/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          subject_template: subject,
          preheader_template: preheader || null,
          body_blocks: blocks,
        }),
      });
      setStatus(res.ok ? "saved" : "error");
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [slug, name, subject, preheader, blocks]);

  // Debounced preview render via the server (uses real globals + renderer).
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/admin/email-globals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocks,
          subject,
          preheader,
          vars: {
            first_name: "Chad",
            token: "preview-token-aabbccdd",
            unsubscribe_url: initial.kind === "campaign" ? "https://chadlewine.com/unsubscribe?token=preview" : "",
          },
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setPreviewHtml(d.html || "");
      }
    }, 400);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [blocks, subject, preheader, initial.kind]);

  const statusLabel = useMemo(() => {
    if (status === "saving") return "Saving…";
    if (status === "saved") return "Saved";
    if (status === "error") return "Save failed";
    return "";
  }, [status]);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">
          <Link
            href="/admin/email-templates"
            style={{
              color: "var(--text-tertiary)",
              textDecoration: "none",
              fontSize: "14px",
              marginRight: "10px",
              fontWeight: "normal",
            }}
          >
            &larr; Templates
          </Link>
          {name}
        </h1>
        <div className="admin-page__header-actions">
          <span className="template-edit__save-status">{statusLabel}</span>
          {slug === "for-my-fans-01" && (
            <Link
              href={`/admin/preview/for-my-fans-01`}
              className="admin-btn admin-btn--secondary"
            >
              Open dedicated preview
            </Link>
          )}
          <button
            type="button"
            className="admin-btn admin-btn--danger"
            onClick={async () => {
              const ok = confirm(
                `Delete template "${name}"? This cannot be undone.${
                  slug === "for-my-fans-01"
                    ? "\n\nWARNING: for-my-fans-01 is referenced by the drip cron -- deleting will break the drip until you reseed."
                    : ""
                }`,
              );
              if (!ok) return;
              const res = await fetch(`/api/admin/email-templates/${slug}`, {
                method: "DELETE",
              });
              if (res.ok) {
                window.location.href = "/admin/email-templates";
              } else {
                const d = await res.json().catch(() => ({}));
                alert(`Delete failed: ${d.error || res.statusText}`);
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="template-edit__bar">
        <div className="template-edit__meta">
          <input
            className="template-edit__name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
          />
          <input
            className="template-edit__subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject line"
          />
          <input
            className="template-edit__subject"
            value={preheader}
            onChange={(e) => setPreheader(e.target.value)}
            placeholder="Preheader (inbox preview text, optional)"
          />
        </div>
      </div>

      <BlockEditor blocks={blocks} onChange={setBlocks} />

      <iframe
        title="Email preview"
        className="template-edit__preview-frame"
        srcDoc={previewHtml}
      />
    </div>
  );
}
