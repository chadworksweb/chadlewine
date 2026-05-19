"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewEmailTemplateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<"transactional" | "campaign">("transactional");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setSlug("");
    setKind("transactional");
    setErr(null);
    setBusy(false);
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    reset();
  };

  // Auto-derive slug from name while the user hasn't manually typed one.
  const [slugTouched, setSlugTouched] = useState(false);
  const onNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) {
      setSlug(
        v
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
      );
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/admin/email-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, name, kind }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(d.error || "Create failed");
      setBusy(false);
      return;
    }
    router.push(`/admin/email-templates/${slug}`);
  };

  return (
    <>
      <button
        type="button"
        className="admin-btn admin-btn--primary"
        onClick={() => setOpen(true)}
      >
        New template
      </button>

      {open && (
        <div className="new-template-modal" onClick={close}>
          <form
            className="new-template-modal__sheet"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <h2 className="new-template-modal__title">New email template</h2>

            <label className="new-template-modal__label">Name</label>
            <input
              className="new-template-modal__input"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g. Welcome drip"
              autoFocus
              required
            />

            <label className="new-template-modal__label">
              Slug (URL-safe, lowercase)
            </label>
            <input
              className="new-template-modal__input"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, ""),
                );
              }}
              placeholder="welcome-drip"
              pattern="[a-z0-9][a-z0-9-]*"
              required
            />
            <p className="new-template-modal__hint">
              Used by code (e.g. renderTemplateBySlug). Hard to rename later.
            </p>

            <label className="new-template-modal__label">Kind</label>
            <select
              className="new-template-modal__input"
              value={kind}
              onChange={(e) => setKind(e.target.value as "transactional" | "campaign")}
            >
              <option value="transactional">Transactional (no unsubscribe)</option>
              <option value="campaign">Campaign (with unsubscribe)</option>
            </select>

            {err && <p className="new-template-modal__error">{err}</p>}

            <div className="new-template-modal__actions">
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                onClick={close}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="admin-btn admin-btn--primary"
                disabled={busy || !name || !slug}
              >
                {busy ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
