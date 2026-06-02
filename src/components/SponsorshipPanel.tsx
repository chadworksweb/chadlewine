"use client";

import { useCallback, useEffect, useState } from "react";

/* Admin panel for a Sponsor demo. Lives in the SongEditor side column when a
   song is status=demo + demo_type=sponsor. Manages the song_sponsorships row
   (production target, goal, internal cost, early-access note, status) and shows
   live funding progress + the contributor list. Type/mode are locked at create;
   beat is fixed at $250; full has floors ($2000 remote, $5000 studio). */

const BEAT_GOAL = 250;
const FULL_REMOTE_FLOOR = 2000;
const FULL_STUDIO_FLOOR = 5000;

type ProductionType = "beat" | "full";
type ProductionMode = "remote" | "studio";

interface Sponsorship {
  id: string;
  song_id: string;
  production_type: ProductionType;
  production_mode: ProductionMode | null;
  goal_cents: number;
  cost_cents: number | null;
  raised_cents: number;
  backer_count: number;
  funded_at: string | null;
  status: string;
  enabled: boolean;
  early_access_note: string | null;
}

interface AudienceLite {
  email: string | null;
  display_name: string | null;
}

interface Contribution {
  id: string;
  amount_cents: number;
  credit_name: string | null;
  is_anonymous: boolean;
  request_note: string | null;
  created_at: string;
  audience: AudienceLite | AudienceLite[] | null;
}

const dollars = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toFixed(2);

function backerLabel(c: Contribution): string {
  if (c.is_anonymous) return "Anonymous";
  if (c.credit_name) return c.credit_name;
  const aud = Array.isArray(c.audience) ? c.audience[0] : c.audience;
  return aud?.display_name || aud?.email || "Supporter";
}

export function SponsorshipPanel({
  songId,
  songTitle,
}: {
  songId?: string;
  songTitle: string;
}) {
  const [loading, setLoading] = useState(true);
  const [sponsorship, setSponsorship] = useState<Sponsorship | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  // Create-form state.
  const [pType, setPType] = useState<ProductionType>("full");
  const [pMode, setPMode] = useState<ProductionMode>("remote");
  const [goalInput, setGoalInput] = useState<number>(FULL_REMOTE_FLOOR);
  const [costInput, setCostInput] = useState<string>("");
  const [noteInput, setNoteInput] = useState<string>("");

  const load = useCallback(async () => {
    if (!songId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/song-sponsorships?song_id=${songId}`);
      const data = await res.json();
      setSponsorship(data.sponsorship);
      setContributions(data.contributions || []);
      if (data.sponsorship) {
        setCostInput(dollars(data.sponsorship.cost_cents));
        setNoteInput(data.sponsorship.early_access_note || "");
        setGoalInput(data.sponsorship.goal_cents / 100);
      }
    } finally {
      setLoading(false);
    }
  }, [songId]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the create-form goal in step with the chosen target's floor.
  useEffect(() => {
    if (sponsorship) return;
    if (pType === "beat") setGoalInput(BEAT_GOAL);
    else setGoalInput(pMode === "studio" ? FULL_STUDIO_FLOOR : FULL_REMOTE_FLOOR);
  }, [pType, pMode, sponsorship]);

  async function handleCreate() {
    if (!songId) return;
    setSaving(true);
    setMsg(null);
    const body = {
      song_id: songId,
      production_type: pType,
      production_mode: pType === "beat" ? null : pMode,
      goal_cents: pType === "beat" ? BEAT_GOAL * 100 : Math.round(goalInput * 100),
      cost_cents: costInput ? Math.round(parseFloat(costInput) * 100) : null,
      early_access_note: noteInput || null,
    };
    const res = await fetch("/api/admin/song-sponsorships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMsg({ text: data.error || "Could not create.", ok: false });
      return;
    }
    setMsg({ text: "Sponsorship created.", ok: true });
    await load();
  }

  async function handleSave() {
    if (!songId || !sponsorship) return;
    setSaving(true);
    setMsg(null);
    const body: Record<string, unknown> = {
      song_id: songId,
      cost_cents: costInput ? Math.round(parseFloat(costInput) * 100) : null,
      early_access_note: noteInput || null,
      status: sponsorship.status,
    };
    // Goal is editable only for full productions before anything is raised.
    if (sponsorship.production_type === "full" && sponsorship.raised_cents === 0) {
      body.goal_cents = Math.round(goalInput * 100);
    }
    const res = await fetch("/api/admin/song-sponsorships", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMsg({ text: data.error || "Could not save.", ok: false });
      return;
    }
    setMsg({ text: "Saved.", ok: true });
    await load();
  }

  async function handleStatusChange(status: string) {
    setSponsorship((prev) => (prev ? { ...prev, status } : prev));
  }

  async function handleToggleEnabled(enabled: boolean) {
    if (!songId) return;
    setSponsorship((prev) => (prev ? { ...prev, enabled } : prev));
    await fetch("/api/admin/song-sponsorships", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song_id: songId, enabled }),
    });
    setMsg({ text: enabled ? "Sponsorship live." : "Sponsorship paused.", ok: true });
  }

  async function handleDelete() {
    if (!songId) return;
    setSaving(true);
    const res = await fetch(`/api/admin/song-sponsorships?song_id=${songId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMsg({ text: data.error || "Could not delete.", ok: false });
      return;
    }
    setSponsorship(null);
    setContributions([]);
    setMsg({ text: "Sponsorship removed.", ok: true });
  }

  if (!songId) {
    return (
      <div className="obsv-editor__panel">
        <h3 className="obsv-editor__panel-title">Sponsorship</h3>
        <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
          Save the song first, then set up its sponsorship target.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="obsv-editor__panel">
        <h3 className="obsv-editor__panel-title">Sponsorship</h3>
        <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  const statusMsg = msg && (
    <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-ui)", color: msg.ok ? "#33cc55" : "#ff3333" }}>
      {msg.text}
    </span>
  );

  // ----- Create form (no sponsorship yet) -----
  if (!sponsorship) {
    const floor = pType === "beat" ? BEAT_GOAL : pMode === "studio" ? FULL_STUDIO_FLOOR : FULL_REMOTE_FLOOR;
    return (
      <div className="obsv-editor__panel">
        <h3 className="obsv-editor__panel-title">Sponsorship</h3>
        <p style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", marginTop: 0 }}>
          Set the production target for &ldquo;{songTitle}&rdquo;. This is locked once created.
        </p>

        <div className="obsv-editor__field">
          <label className="obsv-editor__label" htmlFor="sp_type">Production</label>
          <select
            id="sp_type"
            className="obsv-editor__input"
            value={pType}
            onChange={(e) => setPType(e.target.value as ProductionType)}
          >
            <option value="beat">Beat (easy in) - $250</option>
            <option value="full">Full production (Chad&rsquo;s vision)</option>
          </select>
        </div>

        {pType === "full" && (
          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="sp_mode">Mode</label>
            <select
              id="sp_mode"
              className="obsv-editor__input"
              value={pMode}
              onChange={(e) => setPMode(e.target.value as ProductionMode)}
            >
              <option value="remote">Remote (custom beat + pro mix/master) - floor $2000</option>
              <option value="studio">In studio - floor $5000</option>
            </select>
          </div>
        )}

        <div className="obsv-editor__field">
          <label className="obsv-editor__label" htmlFor="sp_goal">Goal ($)</label>
          <input
            id="sp_goal"
            className="obsv-editor__input"
            type="number"
            min={floor}
            step={50}
            value={pType === "beat" ? BEAT_GOAL : goalInput}
            disabled={pType === "beat"}
            onChange={(e) => setGoalInput(parseFloat(e.target.value) || floor)}
          />
          <span style={{ fontSize: "0.65rem", color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
            {pType === "beat" ? "Fixed at $250." : `Floor $${floor}.`}
          </span>
        </div>

        <div className="obsv-editor__field">
          <label className="obsv-editor__label" htmlFor="sp_cost">Internal cost ($) - private</label>
          <input
            id="sp_cost"
            className="obsv-editor__input"
            type="number"
            min={0}
            step={10}
            placeholder="e.g. 40"
            value={costInput}
            onChange={(e) => setCostInput(e.target.value)}
          />
        </div>

        <div className="obsv-editor__field">
          <label className="obsv-editor__label" htmlFor="sp_note">Early-access note</label>
          <textarea
            id="sp_note"
            className="obsv-editor__input"
            rows={2}
            placeholder="What sponsors hear/get early."
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
          />
        </div>

        <button type="button" className="admin-btn admin-btn--primary" onClick={handleCreate} disabled={saving}>
          {saving ? "Creating..." : "Create sponsorship"}
        </button>
        {statusMsg}
      </div>
    );
  }

  // ----- Existing sponsorship -----
  const pct = sponsorship.goal_cents > 0
    ? Math.min(100, Math.round((sponsorship.raised_cents / sponsorship.goal_cents) * 100))
    : 0;
  const tierLabel = sponsorship.production_type === "beat"
    ? "Beat ($250)"
    : `Full production - ${sponsorship.production_mode === "studio" ? "studio" : "remote"}`;
  const margin =
    sponsorship.cost_cents != null ? sponsorship.goal_cents - sponsorship.cost_cents : null;
  const goalLocked = sponsorship.production_type === "beat" || sponsorship.raised_cents > 0;

  return (
    <div className="obsv-editor__panel">
      <h3 className="obsv-editor__panel-title">Sponsorship</h3>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", fontWeight: 600 }}>{tierLabel}</span>
        {sponsorship.funded_at && (
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.65rem", fontWeight: 600, color: "#33cc55", border: "1px solid #33cc55", borderRadius: 4, padding: "1px 6px" }}>
            FUNDED
          </span>
        )}
        {!sponsorship.enabled && (
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.65rem", fontWeight: 600, color: "#ffbb33", border: "1px solid #ffbb33", borderRadius: 4, padding: "1px 6px" }}>
            PAUSED
          </span>
        )}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontFamily: "var(--font-ui)", fontSize: "0.78rem", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={sponsorship.enabled}
          onChange={(e) => handleToggleEnabled(e.target.checked)}
        />
        <span>Accepting sponsorships{" "}
          <span style={{ color: "var(--text-tertiary)" }}>(per-song on/off)</span>
        </span>
      </label>

      {/* Progress */}
      <div style={{ marginBottom: 4, fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
        ${dollars(sponsorship.raised_cents)} / ${dollars(sponsorship.goal_cents)} ({pct}%)
        {" - "}{sponsorship.backer_count} {sponsorship.backer_count === 1 ? "backer" : "backers"}
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2, #222)", overflow: "hidden", marginBottom: 10 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: sponsorship.funded_at ? "#33cc55" : "var(--accent, #6cf)" }} />
      </div>

      {margin != null && (
        <p style={{ fontSize: "0.65rem", color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", margin: "0 0 10px" }}>
          Your margin at goal: ${dollars(margin)} (cost ${dollars(sponsorship.cost_cents)})
        </p>
      )}

      <div className="obsv-editor__field">
        <label className="obsv-editor__label" htmlFor="sp_goal_e">Goal ($)</label>
        <input
          id="sp_goal_e"
          className="obsv-editor__input"
          type="number"
          value={goalLocked ? sponsorship.goal_cents / 100 : goalInput}
          disabled={goalLocked}
          onChange={(e) => setGoalInput(parseFloat(e.target.value) || 0)}
        />
        {goalLocked && (
          <span style={{ fontSize: "0.65rem", color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
            {sponsorship.production_type === "beat" ? "Beat is fixed." : "Locked once funding starts."}
          </span>
        )}
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label" htmlFor="sp_cost_e">Internal cost ($) - private</label>
        <input
          id="sp_cost_e"
          className="obsv-editor__input"
          type="number"
          min={0}
          step={10}
          value={costInput}
          onChange={(e) => setCostInput(e.target.value)}
        />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label" htmlFor="sp_note_e">Early-access note</label>
        <textarea
          id="sp_note_e"
          className="obsv-editor__input"
          rows={2}
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
        />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label" htmlFor="sp_status">Status</label>
        <select
          id="sp_status"
          className="obsv-editor__input"
          value={sponsorship.status}
          onChange={(e) => handleStatusChange(e.target.value)}
        >
          <option value="open">Open</option>
          <option value="funded">Funded</option>
          <option value="in_production">In production</option>
          <option value="released">Released</option>
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
        {sponsorship.raised_cents === 0 && (
          <button type="button" className="admin-btn admin-btn--secondary" onClick={handleDelete} disabled={saving}>
            Remove
          </button>
        )}
        {statusMsg}
      </div>

      {/* Contributors */}
      {contributions.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h4 style={{ fontFamily: "var(--font-ui)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", margin: "0 0 6px" }}>
            Contributors
          </h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {contributions.map((c) => (
              <li key={c.id} style={{ fontFamily: "var(--font-ui)", fontSize: "0.72rem", borderLeft: "2px solid var(--surface-3, #333)", paddingLeft: 8 }}>
                <span style={{ fontWeight: 600 }}>${dollars(c.amount_cents)}</span>
                {" - "}{backerLabel(c)}
                {c.request_note && (
                  <span style={{ display: "block", color: "var(--text-tertiary)", fontStyle: "italic" }}>
                    &ldquo;{c.request_note}&rdquo;
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
