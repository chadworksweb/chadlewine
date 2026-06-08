"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Status controls for an inbound message detail page. Posts to
// /api/admin/inbox/[id] and refreshes the server component on success.

const OPTIONS: Array<{ value: string; label: string }> = [
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "archived", label: "Archived" },
];

export function InboxActions({ id, current }: { id: string; current: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function setTo(next: string) {
    if (next === status || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/inbox/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setStatus(next);
        router.refresh();
      } else {
        setErr(data.error || "Could not update.");
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`bkf__back${status === o.value ? " bkf__choice--active" : ""}`}
          onClick={() => setTo(o.value)}
          disabled={busy}
          style={status === o.value ? { borderColor: "var(--text-accent)", color: "var(--text-primary)" } : undefined}
        >
          {o.label}
        </button>
      ))}
      {err && <span style={{ color: "#ff6b6b", fontSize: "0.85rem" }}>{err}</span>}
    </div>
  );
}
