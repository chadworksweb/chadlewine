"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewCampaignButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      setBusy(false);
      alert("Could not create campaign.");
      return;
    }
    const data = await res.json();
    router.push(`/admin/campaigns/${data.id}`);
  };

  return (
    <button
      type="button"
      className="admin-btn admin-btn--primary"
      onClick={onClick}
      disabled={busy}
    >
      {busy ? "Creating..." : "New campaign"}
    </button>
  );
}
