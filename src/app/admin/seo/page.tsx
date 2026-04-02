"use client";

import { useState, useEffect } from "react";

interface ObservationSeoRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  geo_readiness_score: number | null;
  focus_keyphrase: string | null;
  citation_summary: string | null;
  first_sentence_extractable: boolean;
  word_count: number | null;
  paa_pairs: unknown[] | null;
  entity_tags: unknown[] | null;
  art_image_path: string | null;
  art_alt: string | null;
  published_at: string | null;
  date_captured: string;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  return "#ef4444";
}

function missingFactors(obs: ObservationSeoRow): string[] {
  const missing: string[] = [];
  if (!obs.citation_summary) missing.push("Citation summary");
  if (!obs.first_sentence_extractable) missing.push("First sentence");
  if (!obs.focus_keyphrase) missing.push("Focus keyphrase");
  if ((obs.word_count || 0) < 400) missing.push("Word count < 400");
  if (!obs.paa_pairs || obs.paa_pairs.length < 2) missing.push("PAA pairs");
  if (!obs.art_image_path || !obs.art_alt) missing.push("OG image/alt");
  if (!obs.entity_tags || obs.entity_tags.length === 0) missing.push("Entity tags");
  return missing;
}

export default function SeoAdminPage() {
  const [observations, setObservations] = useState<ObservationSeoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/seo-dashboard")
      .then((r) => r.json())
      .then((data) => {
        setObservations(data.observations || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin-page"><p>Loading...</p></div>;

  const published = observations.filter((o) => o.status === "published");
  const scores = published.map((o) => o.geo_readiness_score || 0);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const above80 = scores.filter((s) => s >= 80).length;
  const below60 = scores.filter((s) => s < 60).length;

  const flagged = published
    .filter((o) => (o.geo_readiness_score || 0) < 60)
    .sort((a, b) => (a.geo_readiness_score || 0) - (b.geo_readiness_score || 0));

  return (
    <div className="admin-page">
      <h1 className="admin-page__title">GEO/SEO Dashboard</h1>

      {/* Score Overview */}
      <div className="seo-dash__overview">
        <div className="seo-dash__stat">
          <span className="seo-dash__stat-value">{published.length}</span>
          <span className="seo-dash__stat-label">Published</span>
        </div>
        <div className="seo-dash__stat">
          <span className="seo-dash__stat-value" style={{ color: scoreColor(avgScore) }}>
            {avgScore}
          </span>
          <span className="seo-dash__stat-label">Avg Score</span>
        </div>
        <div className="seo-dash__stat">
          <span className="seo-dash__stat-value" style={{ color: "#22c55e" }}>
            {above80}
          </span>
          <span className="seo-dash__stat-label">Score 80+</span>
        </div>
        <div className="seo-dash__stat">
          <span className="seo-dash__stat-value" style={{ color: below60 > 0 ? "#ef4444" : "#22c55e" }}>
            {below60}
          </span>
          <span className="seo-dash__stat-label">Below 60</span>
        </div>
      </div>

      {/* Flagged Issues */}
      {flagged.length > 0 && (
        <section className="seo-dash__section">
          <h2 className="seo-dash__section-title">Flagged ({flagged.length})</h2>
          <div className="seo-dash__table-wrap">
            <table className="seo-dash__table">
              <thead>
                <tr>
                  <th>Observation</th>
                  <th>Score</th>
                  <th>Missing</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((obs) => (
                  <tr key={obs.id}>
                    <td>
                      <a href={`/admin/observations/${obs.id}`} className="seo-dash__link">
                        {obs.title}
                      </a>
                    </td>
                    <td>
                      <span style={{ color: scoreColor(obs.geo_readiness_score || 0), fontWeight: 700 }}>
                        {obs.geo_readiness_score || 0}
                      </span>
                    </td>
                    <td className="seo-dash__missing">
                      {missingFactors(obs).slice(0, 3).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* All Observations */}
      <section className="seo-dash__section">
        <h2 className="seo-dash__section-title">All Observations</h2>
        <div className="seo-dash__table-wrap">
          <table className="seo-dash__table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Score</th>
                <th>Words</th>
                <th>Keyphrase</th>
                <th>Citation</th>
              </tr>
            </thead>
            <tbody>
              {observations.map((obs) => (
                <tr key={obs.id}>
                  <td>
                    <a href={`/admin/observations/${obs.id}`} className="seo-dash__link">
                      {obs.title}
                    </a>
                  </td>
                  <td>
                    <span className={`seo-dash__status seo-dash__status--${obs.status}`}>
                      {obs.status}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: scoreColor(obs.geo_readiness_score || 0), fontWeight: 700 }}>
                      {obs.geo_readiness_score || 0}
                    </span>
                  </td>
                  <td>{obs.word_count || "—"}</td>
                  <td>{obs.focus_keyphrase ? "\u2713" : "—"}</td>
                  <td>{obs.citation_summary ? "\u2713" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="seo-dash__note">
        RankScale integration pending — provide screenshots to calibrate scoring weights.
      </p>

      <SitemapHealthWidget />
    </div>
  );
}

function SitemapHealthWidget() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/sitemap-health")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontSize: "var(--text-xs)", marginTop: "var(--space-xl)" }}>Checking sitemap...</p>;
  if (!data) return null;

  const status = data.sitemap_status as string;
  const urlCount = data.sitemap_url_count as number;
  const expected = data.expected_url_count as number;
  const mismatch = data.mismatch as boolean;
  const breakdown = data.breakdown as Record<string, number>;

  return (
    <section style={{ marginTop: "var(--space-2xl)" }}>
      <h2 className="obsv-editor__panel-title">Sitemap Health</h2>
      <div className="admin-stats" style={{ marginBottom: "var(--space-md)" }}>
        <div className={`admin-stats__card${status !== "ok" ? " admin-stats__card--warn" : ""}`}>
          <span className="admin-stats__value" style={{ color: status === "ok" ? "#22c55e" : "#ef4444" }}>
            {status === "ok" ? "OK" : status.toUpperCase()}
          </span>
          <span className="admin-stats__label">Status</span>
        </div>
        <div className={`admin-stats__card${mismatch ? " admin-stats__card--warn" : ""}`}>
          <span className="admin-stats__value">{urlCount}</span>
          <span className="admin-stats__label">URLs in Sitemap</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{expected}</span>
          <span className="admin-stats__label">Expected</span>
        </div>
      </div>
      {mismatch && (
        <p style={{ color: "#eab308", fontFamily: "var(--font-ui)", fontSize: "var(--text-xs)", marginBottom: "var(--space-md)" }}>
          Mismatch: sitemap has {urlCount} URLs but {expected} expected from published content.
        </p>
      )}
      <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", display: "flex", flexWrap: "wrap", gap: "var(--space-md)" }}>
        {Object.entries(breakdown || {}).map(([key, val]) => (
          <span key={key}>{key.replace(/_/g, " ")}: <strong style={{ color: "var(--text-secondary)" }}>{val}</strong></span>
        ))}
      </div>
    </section>
  );
}
