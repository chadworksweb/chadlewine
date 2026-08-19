"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Row-level archive toggle for the front desk inbox list. Posts to the same
// /api/admin/inbox/[id] endpoint the detail page uses.

export function InboxArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/inbox/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: archived ? "reviewed" : "archived" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        router.refresh();
      } else {
        setErr(data.error || "Failed");
      }
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="bkf__back"
        onClick={toggle}
        disabled={busy}
        style={{ fontSize: "0.8rem", padding: "0.25rem 0.6rem" }}
      >
        {busy ? "..." : archived ? "Restore" : "Archive"}
      </button>
      {err && <span style={{ color: "#ff6b6b", fontSize: "0.8rem", marginLeft: "0.4rem" }}>{err}</span>}
    </>
  );
}
