"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SubSitemapHealth {
  id: string;
  label: string;
  filename: string;
  url: string;
  status: "ok" | "error" | "missing";
  url_count: number;
  expected_count: number;
  mismatch: boolean;
  error: string | null;
  last_built: string;
}

interface HealthResponse {
  index: {
    url: string;
    status: "ok" | "error" | "missing";
    sub_sitemap_count: number;
    expected_sub_sitemap_count: number;
    error: string | null;
    last_built: string;
  };
  sub_sitemaps: SubSitemapHealth[];
  totals: {
    url_count: number;
    expected_count: number;
    any_mismatch: boolean;
  };
}

const PROD_BASE_URL = "https://chadlewine.com";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusColor(status: string): string {
  if (status === "ok") return "#22c55e";
  if (status === "missing") return "#eab308";
  return "#ef4444";
}

function CopyButton({ value, id, copiedId, setCopiedId }: { value: string; id: string; copiedId: string | null; setCopiedId: (v: string | null) => void }) {
  const isCopied = copiedId === id;
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  }
  return (
    <button onClick={onCopy} className="sitemaps-page__copy" type="button" aria-label={`Copy ${value}`}>
      {isCopied ? "Copied" : "Copy"}
    </button>
  );
}

export default function SitemapsAdminPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sitemap-health", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as HealthResponse;
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-page__header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <Link href="/admin/settings" className="admin-page__back-link">
            &larr; Settings
          </Link>
          <h1 className="admin-page__title">Sitemaps</h1>
        </div>
        <button onClick={load} disabled={loading} className="sitemaps-page__refresh">
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="sitemaps-page__error">Failed to load: {error}</p>
      )}

      {data && (
        <>
          <section className="sitemaps-page__section">
            <h2 className="sitemaps-page__section-title">Sitemap Index</h2>
            <table className="sitemaps-page__table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>URL</th>
                  <th>Sub-sitemaps</th>
                  <th>Status</th>
                  <th>Last built</th>
                  <th className="sitemaps-page__copy-col">Copy</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Index</td>
                  <td>
                    <a href={data.index.url} target="_blank" rel="noreferrer" className="sitemaps-page__link">
                      {data.index.url.replace(/^https?:\/\/[^/]+/, "")}
                    </a>
                  </td>
                  <td>
                    {data.index.sub_sitemap_count} / {data.index.expected_sub_sitemap_count}
                  </td>
                  <td>
                    <span style={{ color: statusColor(data.index.status), fontWeight: 700 }}>
                      {data.index.status.toUpperCase()}
                    </span>
                    {data.index.error && <span className="sitemaps-page__error-inline"> &mdash; {data.index.error}</span>}
                  </td>
                  <td>{formatTime(data.index.last_built)}</td>
                  <td className="sitemaps-page__copy-col">
                    <CopyButton value={`${PROD_BASE_URL}/sitemap.xml`} id="index" copiedId={copiedId} setCopiedId={setCopiedId} />
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="sitemaps-page__section">
            <h2 className="sitemaps-page__section-title">Sub-sitemaps</h2>
            <table className="sitemaps-page__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>URL</th>
                  <th>URLs</th>
                  <th>Expected</th>
                  <th>Status</th>
                  <th>Last built</th>
                  <th className="sitemaps-page__copy-col">Copy</th>
                </tr>
              </thead>
              <tbody>
                {data.sub_sitemaps.map((s) => (
                  <tr key={s.id}>
                    <td>{s.label}</td>
                    <td>
                      <a href={s.url} target="_blank" rel="noreferrer" className="sitemaps-page__link">
                        /{s.filename}
                      </a>
                    </td>
                    <td>{s.url_count}</td>
                    <td>
                      {s.expected_count}
                      {s.mismatch && (
                        <span title="Mismatch between sitemap URL count and expected DB count" style={{ color: "#eab308", marginLeft: 6 }}>
                          !
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ color: statusColor(s.status), fontWeight: 700 }}>
                        {s.status.toUpperCase()}
                      </span>
                      {s.error && <span className="sitemaps-page__error-inline"> &mdash; {s.error}</span>}
                    </td>
                    <td>{formatTime(s.last_built)}</td>
                    <td className="sitemaps-page__copy-col">
                      <CopyButton value={`${PROD_BASE_URL}/${s.filename}`} id={s.id} copiedId={copiedId} setCopiedId={setCopiedId} />
                    </td>
                  </tr>
                ))}
                <tr className="sitemaps-page__totals">
                  <td colSpan={2}>Totals</td>
                  <td>{data.totals.url_count}</td>
                  <td>{data.totals.expected_count}</td>
                  <td>
                    {data.totals.any_mismatch ? (
                      <span style={{ color: "#eab308", fontWeight: 700 }}>MISMATCH</span>
                    ) : (
                      <span style={{ color: "#22c55e", fontWeight: 700 }}>OK</span>
                    )}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </section>

          <p className="sitemaps-page__note">
            Sitemaps are generated dynamically from the database on every request. Adding or publishing content updates the sitemap automatically.
          </p>
        </>
      )}

      <style>{`
        .sitemaps-page__section {
          margin-top: var(--space-xl);
        }
        .sitemaps-page__section-title {
          font-family: var(--font-ui);
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: var(--space-sm);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .sitemaps-page__table {
          width: 100%;
          border-collapse: collapse;
          font-family: var(--font-ui);
          font-size: var(--text-sm);
        }
        .sitemaps-page__table th,
        .sitemaps-page__table td {
          padding: var(--space-sm) var(--space-md);
          text-align: left;
          border-bottom: 1px solid var(--bg-glass-border, rgba(255, 255, 255, 0.08));
        }
        .sitemaps-page__table th {
          color: var(--text-tertiary);
          font-weight: 500;
          font-size: var(--text-xs);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .sitemaps-page__link {
          color: var(--text-primary);
          text-decoration: none;
          border-bottom: 1px dashed var(--border-medium, rgba(255, 255, 255, 0.18));
        }
        .sitemaps-page__link:hover {
          border-bottom-color: var(--text-primary);
        }
        .sitemaps-page__refresh {
          font-family: var(--font-ui);
          font-size: var(--text-sm);
          padding: var(--space-xs) var(--space-md);
          background: var(--bg-glass, rgba(255, 255, 255, 0.04));
          border: 1px solid var(--bg-glass-border, rgba(255, 255, 255, 0.08));
          color: var(--text-primary);
          border-radius: 6px;
          cursor: pointer;
        }
        .sitemaps-page__refresh:hover:not(:disabled) {
          background: var(--bg-elevated, rgba(255, 255, 255, 0.06));
        }
        .sitemaps-page__refresh:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .sitemaps-page__error {
          color: #ef4444;
          font-family: var(--font-ui);
          font-size: var(--text-sm);
          margin-top: var(--space-md);
        }
        .sitemaps-page__error-inline {
          color: var(--text-tertiary);
          font-size: var(--text-xs);
        }
        .sitemaps-page__totals td {
          font-weight: 600;
          color: var(--text-primary);
        }
        .sitemaps-page__note {
          margin-top: var(--space-xl);
          font-family: var(--font-ui);
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }
        .sitemaps-page__copy-col {
          width: 80px;
          text-align: right;
        }
        .sitemaps-page__copy {
          font-family: var(--font-ui);
          font-size: var(--text-xs);
          padding: 4px 10px;
          background: transparent;
          border: 1px solid var(--bg-glass-border, rgba(255, 255, 255, 0.12));
          color: var(--text-secondary);
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
          font-variant-numeric: tabular-nums;
        }
        .sitemaps-page__copy:hover {
          background: var(--bg-elevated, rgba(255, 255, 255, 0.06));
          color: var(--text-primary);
          border-color: var(--border-medium, rgba(255, 255, 255, 0.22));
        }
        .sitemaps-page__copy:active {
          background: var(--bg-glass, rgba(255, 255, 255, 0.10));
        }
      `}</style>
    </div>
  );
}
