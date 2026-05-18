"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface RecoveryItem {
  purchase_id: string;
  item_type: "song" | "release";
  format: "mp3" | "flac" | "wav" | null;
  title: string;
  slug: string | null;
  cover_art_path: string | null;
  amount: number;
  created_at: string;
  formatLinks: Array<{ format: "mp3" | "flac" | "wav"; url: string }>;
}

function RecoverViewContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "ready" | "expired" | "invalid">("loading");
  const [email, setEmail] = useState<string>("");
  const [items, setItems] = useState<RecoveryItem[]>([]);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/music/recover/verify?token=${encodeURIComponent(token)}`);
      if (cancelled) return;
      if (res.status === 410) { setState("expired"); return; }
      if (!res.ok) { setState("invalid"); return; }
      const data = await res.json();
      setEmail(data.email || "");
      setItems(data.items || []);
      setState("ready");
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (state === "loading") {
    return (
      <div id="page-recover-view" className="page-static">
        <p style={{ color: "var(--text-tertiary)" }}>Verifying…</p>
      </div>
    );
  }

  if (state === "expired" || state === "invalid") {
    return (
      <div id="page-recover-view" className="page-static">
        <h1 className="page-static__title">Link {state === "expired" ? "expired" : "invalid"}</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
          {state === "expired"
            ? "Recovery links are valid for 15 minutes. Request a new one."
            : "This link isn't valid. Request a fresh one."}
        </p>
        <Link href="/music/recover" style={{ color: "var(--text-accent)" }}>
          Request new link
        </Link>
      </div>
    );
  }

  return (
    <div id="page-recover-view" className="page-static">
      <h1 className="page-static__title">Your downloads</h1>
      <p style={{ color: "var(--text-tertiary)", marginBottom: "var(--space-xl)" }}>
        {email ? <>Signed to <strong>{email}</strong></> : null}
      </p>

      {items.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>No purchases found.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          {items.map((it) => (
            <li
              key={it.purchase_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-md)",
                padding: "var(--space-md)",
                background: "var(--bg-surface)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6,
              }}
            >
              {it.cover_art_path && (
                <img
                  src={it.cover_art_path}
                  alt=""
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 3, flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{it.title}</div>
                <div style={{ color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>
                  {it.item_type === "release" ? "Release" : "Single"}
                  {it.format ? ` · ${it.format.toUpperCase()}` : ""}
                  {" · "}{new Date(it.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-xs)", flexShrink: 0, justifyContent: "flex-end" }}>
                {it.formatLinks.length > 0 ? (
                  it.formatLinks.map((link) => (
                    <a
                      key={link.format}
                      href={link.url}
                      className="patronage__submit"
                      style={{ textDecoration: "none" }}
                    >
                      {it.formatLinks.length > 1 ? link.format.toUpperCase() : "Download"}
                    </a>
                  ))
                ) : (
                  <span style={{ color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>unavailable</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p style={{ color: "var(--text-tertiary)", fontSize: "var(--text-sm)", marginTop: "var(--space-xl)" }}>
        Links are permanent — bookmark this page or save the email. If you lose everything, come
        back to <Link href="/music/recover" style={{ color: "var(--text-accent)" }}>/music/recover</Link>.
      </p>
    </div>
  );
}

export default function RecoverViewPage() {
  return (
    <Suspense
      fallback={
        <div className="page-static">
          <p style={{ color: "var(--text-tertiary)" }}>Loading…</p>
        </div>
      }
    >
      <RecoverViewContent />
    </Suspense>
  );
}
