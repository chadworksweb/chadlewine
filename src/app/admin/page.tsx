import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const supabase = createAdminClient();

  // Observations with status + key fields
  const { data: observations } = await supabase
    .from("observations")
    .select("id, status, hook_line, tension_line, art_image_path, published_at, geo_readiness_score");

  // Meditations
  const { data: meditations } = await supabase
    .from("meditations")
    .select("id, status, published_at");

  // Taxonomy counts
  const { data: categories } = await supabase.from("categories").select("id");
  const { data: thoughtlines } = await supabase.from("thoughtlines").select("id");
  const { data: tags } = await supabase.from("tags").select("id");

  // Junction table counts for taxonomy coverage
  const { data: obsCats } = await supabase.from("observation_categories").select("observation_id, category_id");
  const { data: obsThoughtlines } = await supabase.from("observation_thoughtlines").select("observation_id, thoughtline_id");
  const { data: obsTags } = await supabase.from("observation_tags").select("observation_id, tag_id");

  // Subscribers
  const { data: subscribers } = await supabase.from("subscribers").select("id, status, created_at");

  return { observations, meditations, categories, thoughtlines, tags, obsCats, obsThoughtlines, obsTags, subscribers };
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default async function AdminDashboardPage() {
  const {
    observations = [],
    meditations = [],
    categories = [],
    thoughtlines = [],
    tags = [],
    obsCats = [],
    obsThoughtlines = [],
    obsTags = [],
    subscribers = [],
  } = await getDashboardData();

  const obs = observations || [];
  const meds = meditations || [];

  // --- Content Health ---
  const published = obs.filter((o) => o.status === "published");
  const drafts = obs.filter((o) => o.status === "draft");
  const volumeCollected = obs.filter((o) => o.status === "volume-collected");
  const missingHook = obs.filter((o) => o.status !== "trash" && !o.hook_line);
  const missingTension = obs.filter((o) => o.status !== "trash" && !o.tension_line);
  const missingArt = obs.filter((o) => o.status !== "trash" && !o.art_image_path);
  const avgGeo = obs.length > 0
    ? Math.round(obs.reduce((sum, o) => sum + (o.geo_readiness_score || 0), 0) / obs.length)
    : 0;

  // --- Taxonomy Coverage ---
  const usedCatIds = new Set((obsCats || []).map((c) => c.category_id));
  const usedTlIds = new Set((obsThoughtlines || []).map((t) => t.thoughtline_id));
  const usedTagIds = new Set((obsTags || []).map((t) => t.tag_id));
  const emptyCats = (categories || []).filter((c) => !usedCatIds.has(c.id));
  const emptyThoughtlines = (thoughtlines || []).filter((t) => !usedTlIds.has(t.id));
  const emptyTags = (tags || []).filter((t) => !usedTagIds.has(t.id));
  const obsNoCats = obs.filter((o) => o.status !== "trash").length - new Set((obsCats || []).map((c) => c.observation_id)).size;
  const obsNoThoughtlines = obs.filter((o) => o.status !== "trash").length - new Set((obsThoughtlines || []).map((t) => t.observation_id)).size;
  const obsNoTags = obs.filter((o) => o.status !== "trash").length - new Set((obsTags || []).map((t) => t.observation_id)).size;

  // --- Publishing Pulse ---
  const publishedObs = obs
    .filter((o) => o.published_at)
    .sort((a, b) => new Date(b.published_at!).getTime() - new Date(a.published_at!).getTime());
  const lastPublished = publishedObs[0]?.published_at || null;
  const daysSincePublish = daysSince(lastPublished);
  const draftQueue = drafts.length;

  const publishedMeds = meds
    .filter((m) => m.published_at)
    .sort((a, b) => new Date(b.published_at!).getTime() - new Date(a.published_at!).getTime());
  const lastMeditation = publishedMeds[0]?.published_at || null;
  const daysSinceMed = daysSince(lastMeditation);

  // --- Subscribers ---
  const activeSubs = (subscribers || []).filter((s) => s.status === "active");
  const now = Date.now();
  const last7 = (subscribers || []).filter(
    (s) => now - new Date(s.created_at).getTime() < 7 * 86400000
  ).length;
  const last30 = (subscribers || []).filter(
    (s) => now - new Date(s.created_at).getTime() < 30 * 86400000
  ).length;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Dashboard</h1>
      </div>

      {/* Content Health */}
      <section className="admin-dashboard__section">
        <h2 className="admin-dashboard__heading">Content Health</h2>
        <div className="admin-stats">
          <div className="admin-stats__card">
            <span className="admin-stats__value">{obs.filter((o) => o.status !== "trash").length}</span>
            <span className="admin-stats__label">Total Observations</span>
          </div>
          <div className="admin-stats__card">
            <span className="admin-stats__value">{published.length}</span>
            <span className="admin-stats__label">Published</span>
          </div>
          <div className="admin-stats__card">
            <span className="admin-stats__value">{drafts.length}</span>
            <span className="admin-stats__label">Drafts</span>
          </div>
          <div className="admin-stats__card">
            <span className="admin-stats__value">{volumeCollected.length}</span>
            <span className="admin-stats__label">Volume Collected</span>
          </div>
          <div className="admin-stats__card">
            <span className="admin-stats__value">{meds.filter((m) => m.status === "published").length}</span>
            <span className="admin-stats__label">Meditations</span>
          </div>
        </div>

        <div className="admin-stats" style={{ marginTop: "var(--space-sm)" }}>
          <div className={`admin-stats__card${missingHook.length > 0 ? " admin-stats__card--warn" : ""}`}>
            <span className="admin-stats__value">{missingHook.length}</span>
            <span className="admin-stats__label">Missing Hook Line</span>
          </div>
          <div className={`admin-stats__card${missingTension.length > 0 ? " admin-stats__card--warn" : ""}`}>
            <span className="admin-stats__value">{missingTension.length}</span>
            <span className="admin-stats__label">Missing Tension Line</span>
          </div>
          <div className={`admin-stats__card${missingArt.length > 0 ? " admin-stats__card--warn" : ""}`}>
            <span className="admin-stats__value">{missingArt.length}</span>
            <span className="admin-stats__label">Missing Cover Art</span>
          </div>
          <div className="admin-stats__card">
            <span className="admin-stats__value">{avgGeo}/100</span>
            <span className="admin-stats__label">Avg GEO Score</span>
          </div>
        </div>
      </section>

      {/* Taxonomy Coverage */}
      <section className="admin-dashboard__section">
        <h2 className="admin-dashboard__heading">Taxonomy Coverage</h2>
        <div className="admin-stats">
          <div className={`admin-stats__card${emptyCats.length > 0 ? " admin-stats__card--warn" : ""}`}>
            <span className="admin-stats__value">{emptyCats.length}/{(categories || []).length}</span>
            <span className="admin-stats__label">Empty Categories</span>
          </div>
          <div className={`admin-stats__card${emptyThoughtlines.length > 0 ? " admin-stats__card--warn" : ""}`}>
            <span className="admin-stats__value">{emptyThoughtlines.length}/{(thoughtlines || []).length}</span>
            <span className="admin-stats__label">Empty Thoughtlines</span>
          </div>
          <div className={`admin-stats__card${emptyTags.length > 0 ? " admin-stats__card--warn" : ""}`}>
            <span className="admin-stats__value">{emptyTags.length}/{(tags || []).length}</span>
            <span className="admin-stats__label">Empty Tags</span>
          </div>
        </div>
        <div className="admin-stats" style={{ marginTop: "var(--space-sm)" }}>
          <div className={`admin-stats__card${obsNoCats > 0 ? " admin-stats__card--warn" : ""}`}>
            <span className="admin-stats__value">{obsNoCats}</span>
            <span className="admin-stats__label">Obs w/o Categories</span>
          </div>
          <div className={`admin-stats__card${obsNoThoughtlines > 0 ? " admin-stats__card--warn" : ""}`}>
            <span className="admin-stats__value">{obsNoThoughtlines}</span>
            <span className="admin-stats__label">Obs w/o Thoughtlines</span>
          </div>
          <div className={`admin-stats__card${obsNoTags > 0 ? " admin-stats__card--warn" : ""}`}>
            <span className="admin-stats__value">{obsNoTags}</span>
            <span className="admin-stats__label">Obs w/o Tags</span>
          </div>
        </div>
      </section>

      {/* Publishing Pulse */}
      <section className="admin-dashboard__section">
        <h2 className="admin-dashboard__heading">Publishing Pulse</h2>
        <div className="admin-stats">
          <div className={`admin-stats__card${daysSincePublish !== null && daysSincePublish > 14 ? " admin-stats__card--warn" : ""}`}>
            <span className="admin-stats__value">
              {daysSincePublish !== null ? `${daysSincePublish}d ago` : "Never"}
            </span>
            <span className="admin-stats__label">Last Observation</span>
          </div>
          <div className={`admin-stats__card${daysSinceMed !== null && daysSinceMed > 7 ? " admin-stats__card--warn" : ""}`}>
            <span className="admin-stats__value">
              {daysSinceMed !== null ? `${daysSinceMed}d ago` : "Never"}
            </span>
            <span className="admin-stats__label">Last Meditation</span>
          </div>
          <div className="admin-stats__card">
            <span className="admin-stats__value">{draftQueue}</span>
            <span className="admin-stats__label">Draft Queue</span>
          </div>
        </div>
      </section>

      {/* Subscriber Snapshot */}
      <section className="admin-dashboard__section">
        <h2 className="admin-dashboard__heading">Subscriber Snapshot</h2>
        <div className="admin-stats">
          <div className="admin-stats__card">
            <span className="admin-stats__value">{activeSubs.length}</span>
            <span className="admin-stats__label">Active Subscribers</span>
          </div>
          <div className="admin-stats__card">
            <span className="admin-stats__value">+{last7}</span>
            <span className="admin-stats__label">Last 7 Days</span>
          </div>
          <div className="admin-stats__card">
            <span className="admin-stats__value">+{last30}</span>
            <span className="admin-stats__label">Last 30 Days</span>
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="admin-dashboard__section">
        <h2 className="admin-dashboard__heading">Quick Actions</h2>
        <div className="admin-dashboard__links">
          <Link href="/admin/observations/new" className="admin-btn admin-btn--primary">New Observation</Link>
          <Link href="/admin/meditations" className="admin-btn admin-btn--secondary">New Meditation</Link>
          <Link href="/admin/seo" className="admin-btn admin-btn--secondary">SEO Dashboard</Link>
          <Link href="/admin/observations" className="admin-btn admin-btn--secondary">All Observations</Link>
        </div>
      </section>
    </div>
  );
}
