"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BlockEditor } from "@/components/BlockEditor";
import type { EmailBlock } from "@/lib/email-blocks";

interface InitialGlobals {
  header_blocks: EmailBlock[];
  footer_blocks: EmailBlock[];
}

interface EmailGlobalsEditorProps {
  initial: InitialGlobals;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";
type Tab = "header" | "footer";

export function EmailGlobalsEditor({ initial }: EmailGlobalsEditorProps) {
  const [tab, setTab] = useState<Tab>("header");
  const [header, setHeader] = useState<EmailBlock[]>(initial.header_blocks);
  const [footer, setFooter] = useState<EmailBlock[]>(initial.footer_blocks);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRender = useRef(true);

  useEffect(() => {
    // Don't fire a save on the very first render (preserves the seeded
    // state if the user just lands on the page).
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      const res = await fetch(`/api/admin/email-globals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header_blocks: header, footer_blocks: footer }),
      });
      setStatus(res.ok ? "saved" : "error");
    }, 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [header, footer]);

  const blocks = tab === "header" ? header : footer;
  const setBlocks = tab === "header" ? setHeader : setFooter;

  const statusLabel =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : status === "error"
          ? "Save failed"
          : "";

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
          Global header &amp; footer
        </h1>
        <div className="admin-page__header-actions">
          <span className="template-edit__save-status">{statusLabel}</span>
        </div>
      </div>

      <div className="template-edit__bar">
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className={`admin-btn ${tab === "header" ? "admin-btn--primary" : "admin-btn--secondary"}`}
            onClick={() => setTab("header")}
          >
            Header ({header.length})
          </button>
          <button
            type="button"
            className={`admin-btn ${tab === "footer" ? "admin-btn--primary" : "admin-btn--secondary"}`}
            onClick={() => setTab("footer")}
          >
            Footer ({footer.length})
          </button>
        </div>
        <p className="block-editor__hint" style={{ marginLeft: "auto", maxWidth: "420px" }}>
          {tab === "header"
            ? "Renders at the top of every email before the body."
            : "Renders at the bottom of every email after the body. Blocks referencing {{ unsubscribe_url }} auto-hide when sending transactional templates."}
        </p>
      </div>

      <BlockEditor blocks={blocks} onChange={setBlocks} />
    </div>
  );
}
