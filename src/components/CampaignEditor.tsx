"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAutosave } from "@/hooks/useAutosave";
import { BlockEditor } from "@/components/BlockEditor";
import { CampaignPreview } from "@/components/CampaignPreview";
import { newBlock, type EmailBlock } from "@/lib/email-blocks";

export interface CampaignData {
  id: string;
  subject: string;
  preheader: string | null;
  body_html: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  audience_filter: AudienceFilterShape;
  cta_label: string | null;
  cta_url: string | null;
  body_blocks: EmailBlock[] | null;
  status: "draft" | "sending" | "sent" | "failed";
  sent_count: number;
  failed_count: number;
  open_count?: number;
  click_count?: number;
  bounce_count?: number;
  complaint_count?: number;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AudienceFilterShape {
  tags_all?: string[];
  tags_any?: string[];
  exclude_tags?: string[];
  engagement_in?: string[];
}

const ENGAGEMENT_LEVELS = ["high", "medium", "low", "inactive", "unknown"] as const;

interface SendRow {
  id: string;
  email: string;
  status: string;
  is_test: boolean;
  sent_at: string | null;
  opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  click_count: number;
  bounced_at: string | null;
  bounce_reason: string | null;
  complained_at: string | null;
}

interface CampaignEditorProps {
  initial: CampaignData;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return "";
  }
}

export function CampaignEditor({ initial }: CampaignEditorProps) {
  const router = useRouter();
  const [form, setForm] = useState<CampaignData>(() => {
    // Legacy: if a draft was created before the block editor and has
    // body_html but no body_blocks yet, lift the HTML into one paragraph
    // block so the user has something editable to start with.
    if (
      (!initial.body_blocks || initial.body_blocks.length === 0) &&
      initial.body_html?.trim()
    ) {
      const seed = newBlock("paragraph");
      if (seed.type === "paragraph") seed.html = initial.body_html;
      return { ...initial, body_blocks: [seed] };
    }
    return initial;
  });
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sends, setSends] = useState<SendRow[] | null>(null);
  const [sendsOpen, setSendsOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testStatus, setTestStatus] = useState<{ kind: "idle" | "sending" | "ok" | "err"; msg?: string }>({ kind: "idle" });
  const [sendStatus, setSendStatus] = useState<{ kind: "idle" | "confirm" | "sending" | "ok" | "err"; msg?: string }>({ kind: "idle" });

  const buildPayload = useCallback(
    (data: CampaignData) => ({
      subject: data.subject,
      preheader: data.preheader,
      body_html: data.body_html,
      body_blocks: data.body_blocks,
      from_name: data.from_name,
      from_email: data.from_email,
      reply_to: data.reply_to,
      audience_filter: data.audience_filter,
      cta_label: data.cta_label,
      cta_url: data.cta_url,
    }),
    []
  );

  const { status: autosaveStatus } = useAutosave({
    data: form,
    endpoint: "/api/admin/campaigns",
    id: form.id,
    buildPayload,
    enabled: form.status === "draft",
  });

  // Re-count whenever the audience_filter changes so the editor reflects
  // live segment size. Debounced via the filter dep below.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/campaigns/${form.id}/audience-count`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filter: form.audience_filter || {} }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && typeof d.count === "number") setAudienceCount(d.count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [form.id, form.audience_filter]);

  // Once a campaign is sent, load the per-recipient stats. Only fetch on
  // demand (when the user opens the panel) to keep the editor responsive.
  const loadSends = useCallback(async () => {
    const res = await fetch(`/api/admin/campaigns/${form.id}/sends`);
    if (!res.ok) return;
    const data = (await res.json()) as SendRow[];
    setSends(data);
  }, [form.id]);

  const isLocked = form.status !== "draft";
  const hasBody =
    (form.body_blocks && form.body_blocks.length > 0) ||
    form.body_html.trim().length > 0;
  const canSend =
    form.status === "draft" &&
    form.subject.trim().length > 0 &&
    hasBody &&
    (audienceCount ?? 0) > 0;

  const sendTest = async () => {
    setTestStatus({ kind: "sending" });
    const res = await fetch(`/api/admin/campaigns/${form.id}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });
    if (res.ok) {
      setTestStatus({ kind: "ok", msg: `Test sent to ${testEmail}` });
    } else {
      const d = await res.json().catch(() => ({}));
      setTestStatus({ kind: "err", msg: d.error || "Send failed" });
    }
  };

  const confirmSend = () => setSendStatus({ kind: "confirm" });
  const cancelSend = () => setSendStatus({ kind: "idle" });

  const reallySend = async () => {
    setSendStatus({ kind: "sending" });
    const res = await fetch(`/api/admin/campaigns/${form.id}/send`, {
      method: "POST",
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setSendStatus({ kind: "ok", msg: `Sent to ${d.sent}, failed ${d.failed}` });
      // Optimistically flip local state into the sent-view so the editor
      // re-renders without a manual reload. router.refresh() in the
      // background reconciles any server-side numbers (sent_at precision).
      setForm((prev) => ({
        ...prev,
        status: "sent",
        sent_count: d.sent ?? 0,
        failed_count: d.failed ?? 0,
        sent_at: new Date().toISOString(),
        open_count: 0,
        click_count: 0,
        bounce_count: 0,
        complaint_count: 0,
      }));
      router.refresh();
    } else {
      setSendStatus({ kind: "err", msg: d.error || "Send failed" });
    }
  };

  const deleteDraft = async () => {
    if (!confirm("Delete this draft? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/campaigns/${form.id}`, {
      method: "DELETE",
    });
    if (res.ok) router.push("/admin/campaigns");
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">
          {form.subject.trim() || "Untitled campaign"}
        </h1>
        <div className="admin-page__header-actions">
          <span className={`admin-status admin-status--${form.status === "sent" ? "published" : form.status === "draft" ? "draft" : "private"}`}>
            {form.status}
          </span>
          {form.status === "draft" && (
            <span className={`autosave-status autosave-status--${autosaveStatus}`}>
              {autosaveStatus === "saving" && "Saving..."}
              {autosaveStatus === "saved" && "Saved"}
              {autosaveStatus === "error" && "Save failed"}
            </span>
          )}
        </div>
      </div>

      <div className="campaign-editor">
        <div className="campaign-editor__main">
          <div className="campaign-editor__field">
            <label className="campaign-editor__label">Subject</label>
            <input
              type="text"
              className="campaign-editor__input campaign-editor__input--subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              disabled={isLocked}
              placeholder="A subject line your subscribers want to open"
            />
          </div>

          <div className="campaign-editor__field">
            <label className="campaign-editor__label">Preview text (preheader)</label>
            <input
              type="text"
              className="campaign-editor__input"
              value={form.preheader || ""}
              onChange={(e) => setForm({ ...form, preheader: e.target.value })}
              disabled={isLocked}
              placeholder="One short line shown next to the subject in the inbox preview"
            />
          </div>

          <div className="campaign-editor__field">
            <label className="campaign-editor__label">Body</label>
            {isLocked ? (
              <div
                className="campaign-editor__readonly-body"
                dangerouslySetInnerHTML={{ __html: form.body_html }}
              />
            ) : (
              <BlockEditor
                blocks={form.body_blocks || []}
                onChange={(next) => setForm({ ...form, body_blocks: next })}
              />
            )}
          </div>

          <div className="campaign-editor__field">
            <label className="campaign-editor__label">Call-to-action button label (optional)</label>
            <input
              type="text"
              className="campaign-editor__input"
              value={form.cta_label || ""}
              onChange={(e) => setForm({ ...form, cta_label: e.target.value })}
              disabled={isLocked}
              placeholder="e.g. Listen now"
            />
            <label className="campaign-editor__label">Call-to-action button URL</label>
            <input
              type="url"
              className="campaign-editor__input"
              value={form.cta_url || ""}
              onChange={(e) => setForm({ ...form, cta_url: e.target.value })}
              disabled={isLocked}
              placeholder="https://chadlewine.com/..."
            />
            <p className="campaign-editor__hint">
              Rendered as a bulletproof table-button after the body. Leave both blank to omit.
            </p>
          </div>

          <div className="campaign-editor__field campaign-editor__preview-toggle">
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              onClick={() => setPreviewOpen((v) => !v)}
            >
              {previewOpen ? "Hide preview" : "Preview email"}
            </button>
          </div>

          {previewOpen && (
            <div className="campaign-editor__field">
              <CampaignPreview
                subject={form.subject}
                preheader={form.preheader}
                bodyHtml={form.body_html}
                fromName={form.from_name}
                fromEmail={form.from_email}
                ctaLabel={form.cta_label}
                ctaUrl={form.cta_url}
              />
            </div>
          )}

          {sendsOpen && form.status === "sent" && (
            <div className="campaign-editor__field">
              <SendsTable rows={sends} />
            </div>
          )}
        </div>

        <aside className="campaign-editor__rail">
          {form.status === "sent" && (
            <section className="campaign-editor__panel">
              <h3 className="campaign-editor__panel-title">Sent</h3>
              <p className="campaign-editor__stat">
                <strong>{form.sent_count}</strong> sent
                {form.failed_count > 0 && (
                  <>
                    {", "}<strong>{form.failed_count}</strong> failed
                  </>
                )}
              </p>
              <div className="campaign-editor__rates">
                <div className="campaign-editor__rate">
                  <span className="campaign-editor__rate-num">
                    {form.click_count ?? 0}
                  </span>
                  <span className="campaign-editor__rate-label">
                    Clicks
                    {form.sent_count > 0 && (
                      <span className="campaign-editor__rate-pct">
                        {" "}{Math.round(((form.click_count ?? 0) / form.sent_count) * 100)}%
                      </span>
                    )}
                  </span>
                </div>
                {(form.bounce_count ?? 0) > 0 && (
                  <div className="campaign-editor__rate campaign-editor__rate--alert">
                    <span className="campaign-editor__rate-num">
                      {form.bounce_count}
                    </span>
                    <span className="campaign-editor__rate-label">Bounces</span>
                  </div>
                )}
                {(form.complaint_count ?? 0) > 0 && (
                  <div className="campaign-editor__rate campaign-editor__rate--alert">
                    <span className="campaign-editor__rate-num">
                      {form.complaint_count}
                    </span>
                    <span className="campaign-editor__rate-label">Complaints</span>
                  </div>
                )}
              </div>
              <p className="campaign-editor__hint">
                {formatDateTime(form.sent_at)}
              </p>
              <button
                type="button"
                className="admin-btn admin-btn--secondary campaign-editor__action"
                onClick={() => {
                  setSendsOpen((v) => !v);
                  if (!sendsOpen) loadSends(); // also refresh on re-toggle
                }}
              >
                {sendsOpen ? "Hide per-recipient" : "View per-recipient"}
              </button>
            </section>
          )}

          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">Sender</h3>
            <label className="campaign-editor__label">From name</label>
            <input
              type="text"
              className="campaign-editor__input"
              value={form.from_name}
              onChange={(e) => setForm({ ...form, from_name: e.target.value })}
              disabled={isLocked}
            />
            <label className="campaign-editor__label">From email</label>
            <input
              type="email"
              className="campaign-editor__input"
              value={form.from_email}
              onChange={(e) => setForm({ ...form, from_email: e.target.value })}
              disabled={isLocked}
            />
            <label className="campaign-editor__label">Reply-to (optional)</label>
            <input
              type="email"
              className="campaign-editor__input"
              value={form.reply_to || ""}
              onChange={(e) => setForm({ ...form, reply_to: e.target.value })}
              disabled={isLocked}
              placeholder={form.from_email}
            />
          </section>

          <section className="campaign-editor__panel">
            <h3 className="campaign-editor__panel-title">Audience</h3>
            <p className="campaign-editor__stat">
              Will send to{" "}
              <strong>{audienceCount ?? "…"}</strong>{" "}
              active subscriber{audienceCount === 1 ? "" : "s"}
            </p>
            <AudienceFilterEditor
              filter={form.audience_filter || {}}
              onChange={(next) =>
                setForm({ ...form, audience_filter: next })
              }
              disabled={isLocked}
            />
          </section>

          {form.status === "draft" && (
            <>
              <section className="campaign-editor__panel">
                <h3 className="campaign-editor__panel-title">Send test</h3>
                <input
                  type="email"
                  className="campaign-editor__input"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary campaign-editor__action"
                  onClick={sendTest}
                  disabled={!testEmail || testStatus.kind === "sending"}
                >
                  {testStatus.kind === "sending" ? "Sending..." : "Send test"}
                </button>
                {testStatus.kind === "ok" && (
                  <p className="campaign-editor__hint campaign-editor__hint--ok">
                    {testStatus.msg}
                  </p>
                )}
                {testStatus.kind === "err" && (
                  <p className="campaign-editor__hint campaign-editor__hint--err">
                    {testStatus.msg}
                  </p>
                )}
              </section>

              <section className="campaign-editor__panel campaign-editor__panel--cta">
                <h3 className="campaign-editor__panel-title">Send to audience</h3>
                {sendStatus.kind === "confirm" || sendStatus.kind === "sending" ? (
                  <div className="campaign-editor__confirm">
                    <p className="campaign-editor__hint">
                      {sendStatus.kind === "sending" ? (
                        <>Sending to <strong>{audienceCount}</strong> subscribers...</>
                      ) : (
                        <>Send to <strong>{audienceCount}</strong> subscribers? This cannot be undone.</>
                      )}
                    </p>
                    <div className="campaign-editor__confirm-actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn--primary"
                        onClick={reallySend}
                        disabled={sendStatus.kind === "sending"}
                      >
                        {sendStatus.kind === "sending" ? "Sending..." : "Yes, send"}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn--secondary"
                        onClick={cancelSend}
                        disabled={sendStatus.kind === "sending"}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="admin-btn admin-btn--primary campaign-editor__action campaign-editor__action--send"
                    onClick={confirmSend}
                    disabled={!canSend}
                  >
                    {`Send to ${audienceCount ?? "—"}`}
                  </button>
                )}
                {sendStatus.kind === "err" && (
                  <p className="campaign-editor__hint campaign-editor__hint--err">
                    {sendStatus.msg}
                  </p>
                )}
                {!canSend && form.status === "draft" && (
                  <p className="campaign-editor__hint">
                    {form.subject.trim().length === 0 && "Subject required. "}
                    {!hasBody && "Body required. "}
                    {(audienceCount ?? 0) === 0 && "Audience is empty."}
                  </p>
                )}
              </section>

              <section className="campaign-editor__panel">
                <button
                  type="button"
                  className="admin-btn admin-btn--danger campaign-editor__action"
                  onClick={deleteDraft}
                >
                  Delete draft
                </button>
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function SendsTable({ rows }: { rows: SendRow[] | null }) {
  if (rows === null) {
    return (
      <p className="campaign-editor__hint">Loading recipients...</p>
    );
  }
  if (rows.length === 0) {
    return <p className="campaign-editor__hint">No recipients yet.</p>;
  }
  const realRows = rows.filter((r) => !r.is_test);
  const testRows = rows.filter((r) => r.is_test);

  return (
    <div className="campaign-sends">
      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Recipient</th>
            <th className="admin-table__th">Status</th>
            <th className="admin-table__th">Sent</th>
            <th className="admin-table__th">Clicks</th>
            <th className="admin-table__th">Last click</th>
          </tr>
        </thead>
        <tbody>
          {realRows.map((r) => (
            <tr key={r.id} className="admin-table__row">
              <td className="admin-table__td">
                <span className="admin-table__link">{r.email}</span>
              </td>
              <td className="admin-table__td">
                <span
                  className={`admin-status admin-status--${statusVariant(r.status)}`}
                >
                  {r.status}
                </span>
                {r.bounce_reason && (
                  <span className="campaign-sends__hint">{r.bounce_reason}</span>
                )}
              </td>
              <td className="admin-table__td admin-table__td--date">
                {fmtShort(r.sent_at)}
              </td>
              <td className="admin-table__td">
                {r.click_count > 0 ? (
                  <strong>{r.click_count}</strong>
                ) : (
                  <span className="admin-dash">—</span>
                )}
              </td>
              <td className="admin-table__td admin-table__td--date">
                {fmtShort(r.clicked_at)}
              </td>
            </tr>
          ))}
          {testRows.length > 0 && (
            <>
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: "var(--space-md) var(--space-md) 4px",
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--text-xs)",
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Tests
                </td>
              </tr>
              {testRows.map((r) => (
                <tr key={r.id} className="admin-table__row">
                  <td className="admin-table__td">
                    <span className="admin-table__link">{r.email}</span>
                  </td>
                  <td className="admin-table__td">
                    <span
                      className={`admin-status admin-status--${statusVariant(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="admin-table__td admin-table__td--date">
                    {fmtShort(r.sent_at)}
                  </td>
                  <td className="admin-table__td">
                    {r.click_count > 0 ? r.click_count : "—"}
                  </td>
                  <td className="admin-table__td admin-table__td--date">
                    {fmtShort(r.clicked_at)}
                  </td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function statusVariant(status: string): string {
  if (status === "delivered" || status === "sent") return "published";
  if (status === "bounced" || status === "complained" || status === "failed")
    return "trash";
  return "draft";
}

function AudienceFilterEditor({
  filter,
  onChange,
  disabled,
}: {
  filter: AudienceFilterShape;
  onChange: (next: AudienceFilterShape) => void;
  disabled: boolean;
}) {
  const tagsAll = (filter.tags_all || []).join(", ");
  const excludeTags = (filter.exclude_tags || []).join(", ");
  const engagementIn = new Set(filter.engagement_in || []);

  const setTagsAll = (csv: string) => {
    const list = csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onChange({ ...filter, tags_all: list.length > 0 ? list : undefined });
  };
  const setExcludeTags = (csv: string) => {
    const list = csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onChange({ ...filter, exclude_tags: list.length > 0 ? list : undefined });
  };
  const toggleEngagement = (level: string) => {
    const next = new Set(engagementIn);
    if (next.has(level)) next.delete(level);
    else next.add(level);
    onChange({
      ...filter,
      engagement_in: next.size > 0 ? Array.from(next) : undefined,
    });
  };

  return (
    <div className="campaign-editor__filter">
      <label className="campaign-editor__label">Must have tags (AND)</label>
      <input
        type="text"
        className="campaign-editor__input"
        placeholder="customer:recent, buyer:physical"
        value={tagsAll}
        onChange={(e) => setTagsAll(e.target.value)}
        disabled={disabled}
      />
      <label className="campaign-editor__label">Exclude tags</label>
      <input
        type="text"
        className="campaign-editor__input"
        placeholder="vip, press"
        value={excludeTags}
        onChange={(e) => setExcludeTags(e.target.value)}
        disabled={disabled}
      />
      <label className="campaign-editor__label">Engagement</label>
      <div className="campaign-editor__chips">
        {ENGAGEMENT_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className={`campaign-editor__chip${engagementIn.has(level) ? " campaign-editor__chip--on" : ""}`}
            onClick={() => toggleEngagement(level)}
            disabled={disabled}
          >
            {level}
          </button>
        ))}
      </div>
      <p className="campaign-editor__hint">
        Empty filter sends to every active subscriber. Add tags to narrow.
      </p>
    </div>
  );
}
