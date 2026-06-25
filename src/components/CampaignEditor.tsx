"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAutosave } from "@/hooks/useAutosave";
import { BlockEditor } from "@/components/BlockEditor";
import { CampaignPreview } from "@/components/CampaignPreview";
import { newBlock, type EmailBlock } from "@/lib/email-blocks";
import { NOTIFICATION_CATEGORIES } from "@/lib/notification-categories";

export interface CampaignData {
  id: string;
  subject: string;
  preheader: string | null;
  body_html: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  audience_filter: AudienceFilterShape;
  category: string;
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
  audience_id: string | null;
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
  bounce_type: string | null;
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
    // block so the user has something editable to start with. Also lift
    // any legacy cta_label/cta_url pair into a button block so the CTA
    // survives the migration off those columns.
    if (
      (!initial.body_blocks || initial.body_blocks.length === 0) &&
      (initial.body_html?.trim() || (initial.cta_label && initial.cta_url))
    ) {
      const blocks: EmailBlock[] = [];
      if (initial.body_html?.trim()) {
        const p = newBlock("paragraph");
        if (p.type === "paragraph") p.html = initial.body_html;
        blocks.push(p);
      }
      if (initial.cta_label && initial.cta_url) {
        const btn = newBlock("button");
        if (btn.type === "button") {
          btn.label = initial.cta_label;
          btn.url = initial.cta_url;
          btn.align = "center";
        }
        blocks.push(btn);
      }
      return { ...initial, body_blocks: blocks };
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
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [resendStatus, setResendStatus] = useState<{ kind: "idle" | "confirm" | "sending" | "ok" | "err"; msg?: string }>({ kind: "idle" });
  const [sentPreviewHtml, setSentPreviewHtml] = useState("");
  const [reusing, setReusing] = useState(false);
  const [clickMetrics, setClickMetrics] = useState<{ uniqueLinkClicks: number; totalClicks: number; bySend?: Record<string, number> } | null>(null);

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
      category: data.category,
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

  // Re-count whenever the audience_filter or category changes so the editor
  // reflects live segment size (category excludes opted-out subscribers).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/campaigns/${form.id}/audience-count`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filter: form.audience_filter || {},
        category: form.category || "general",
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && typeof d.count === "number") setAudienceCount(d.count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [form.id, form.audience_filter, form.category]);

  // For a locked (sent/sending/failed) campaign, render the real email -- the
  // same server renderer used at send time (header + body + footer globals) --
  // so you can see exactly how it looked. body_html is stale, so render blocks.
  useEffect(() => {
    if (form.status === "draft") return;
    let cancelled = false;
    fetch(`/api/admin/email-globals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: form.body_blocks || [],
        subject: form.subject,
        preheader: form.preheader,
        vars: {
          first_name: "there",
          token: "preview",
          unsubscribe_url: "https://chadlewine.com/unsubscribe?token=preview",
        },
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.html) setSentPreviewHtml(d.html);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [form.status, form.body_blocks, form.subject, form.preheader]);

  // Once a campaign is sent, load the per-recipient stats. Only fetch on
  // demand (when the user opens the panel) to keep the editor responsive.
  const loadSends = useCallback(async () => {
    const res = await fetch(`/api/admin/campaigns/${form.id}/sends`);
    if (!res.ok) return;
    const data = (await res.json()) as SendRow[];
    setSends(data);
  }, [form.id]);

  // For a sent campaign, load click metrics: unique link-clicks (distinct
  // recipient+link) and total clicks (every event). From campaign_events.
  useEffect(() => {
    if (form.status !== "sent") return;
    let cancelled = false;
    fetch(`/api/admin/campaigns/${form.id}/click-metrics`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setClickMetrics(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [form.status, form.id]);

  // While a campaign is draining in the background, poll the per-recipient
  // log every few seconds and surface "X/Y sent". When nothing is left queued
  // or mid-flight, flip into the sent view and let router.refresh() reconcile
  // the authoritative server-side counts.
  useEffect(() => {
    if (form.status !== "sending") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/campaigns/${form.id}/sends`);
        if (res.ok) {
          const rows = (await res.json()) as SendRow[];
          const real = rows.filter((r) => !r.is_test);
          const remaining = real.filter(
            (r) => r.status === "queued" || r.status === "sending_row",
          ).length;
          const failed = real.filter((r) => r.status === "failed").length;
          const done = real.length - remaining;
          if (!cancelled) {
            setSendProgress({ done, total: real.length, failed });
            if (real.length > 0 && remaining === 0) {
              setForm((prev) => ({
                ...prev,
                status: "sent",
                sent_count: done - failed,
                failed_count: failed,
                sent_at: new Date().toISOString(),
                open_count: 0,
                click_count: 0,
                bounce_count: 0,
                complaint_count: 0,
              }));
              router.refresh();
              return; // stop polling
            }
          }
        }
      } catch {
        // transient — keep polling
      }
      if (!cancelled) timer = setTimeout(poll, 3000);
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [form.status, form.id, router]);

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
      // Enqueue-only: the campaign now drains in the background. Flip into the
      // 'sending' view; the polling effect below tracks progress until done.
      setSendStatus({
        kind: "ok",
        msg: `Queued ${d.queued ?? ""} — sending in background`,
      });
      setSendProgress({ done: 0, total: d.queued ?? 0, failed: 0 });
      setForm((prev) => ({ ...prev, status: "sending" }));
    } else {
      setSendStatus({ kind: "err", msg: d.error || "Send failed" });
    }
  };

  const resendFailed = async () => {
    setResendStatus({ kind: "sending" });
    const res = await fetch(`/api/admin/campaigns/${form.id}/resend-failed`, {
      method: "POST",
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      const ok = d.sent ?? 0;
      setResendStatus({
        kind: "ok",
        msg: `Resent: ${ok} delivered, ${d.failed ?? 0} still failed`,
      });
      // Newly-sent were previously counted as failed; shift the totals.
      setForm((prev) => ({
        ...prev,
        sent_count: prev.sent_count + ok,
        failed_count: Math.max(0, prev.failed_count - ok),
      }));
      router.refresh();
    } else {
      setResendStatus({ kind: "err", msg: d.error || "Resend failed" });
    }
  };

  // Create a fresh draft pre-filled with this campaign's content and open it.
  const reuseCampaign = async () => {
    setReusing(true);
    const res = await fetch(`/api/admin/campaigns/${form.id}/duplicate`, {
      method: "POST",
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.id) {
      router.push(`/admin/campaigns/${d.id}`);
    } else {
      setReusing(false);
      alert(d.error || "Could not duplicate campaign.");
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
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={reuseCampaign}
            disabled={reusing}
            title="Start a new draft pre-filled with this campaign's content"
          >
            {reusing ? "Duplicating..." : "Reuse campaign"}
          </button>
        </div>
      </div>

      <div className="campaign-editor">
        <div className="campaign-editor__main">
          {sendsOpen && form.status === "sent" && (
            <div className="campaign-editor__field">
              <SendsTable rows={sends} clicksBySend={clickMetrics?.bySend} />
            </div>
          )}
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
              <iframe
                title="Sent email"
                className="template-edit__preview-frame"
                srcDoc={sentPreviewHtml}
              />
            ) : (
              <BlockEditor
                blocks={form.body_blocks || []}
                onChange={(next) => setForm({ ...form, body_blocks: next })}
              />
            )}
            <p className="campaign-editor__hint">
              The header and footer are shared across every email.{" "}
              <Link
                href="/admin/email-templates/globals"
                style={{ color: "var(--text-accent)", fontWeight: 500 }}
              >
                Edit header &amp; footer &rarr;
              </Link>
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
              />
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
              <div className="campaign-editor__rates campaign-editor__rates--cols3">
                <div className="campaign-editor__rate">
                  <span className="campaign-editor__rate-num">
                    {clickMetrics ? clickMetrics.uniqueLinkClicks : "—"}
                  </span>
                  <span className="campaign-editor__rate-label">Unique clicks</span>
                </div>
                <div className="campaign-editor__rate">
                  <span className="campaign-editor__rate-num">
                    {clickMetrics ? clickMetrics.totalClicks : "—"}
                  </span>
                  <span className="campaign-editor__rate-label">Total clicks</span>
                </div>
                <div
                  className={`campaign-editor__rate${(form.bounce_count ?? 0) > 0 ? " campaign-editor__rate--alert" : ""}`}
                >
                  <span className="campaign-editor__rate-num">
                    {form.bounce_count ?? 0}
                  </span>
                  <span className="campaign-editor__rate-label">Bounces</span>
                </div>
              </div>
              {(form.complaint_count ?? 0) > 0 && (
                <p className="campaign-editor__hint campaign-editor__hint--err">
                  {form.complaint_count} spam complaint
                  {form.complaint_count === 1 ? "" : "s"}
                </p>
              )}
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

              {form.failed_count > 0 &&
                (resendStatus.kind === "confirm" || resendStatus.kind === "sending" ? (
                  <div className="campaign-editor__confirm">
                    <p className="campaign-editor__hint">
                      {resendStatus.kind === "sending" ? (
                        <>Resending to <strong>{form.failed_count}</strong> failed (paced ~4/sec, give it a minute)...</>
                      ) : (
                        <>Resend to the <strong>{form.failed_count}</strong> recipients whose send failed? Already-sent recipients are skipped.</>
                      )}
                    </p>
                    <div className="campaign-editor__confirm-actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn--primary"
                        onClick={resendFailed}
                        disabled={resendStatus.kind === "sending"}
                      >
                        {resendStatus.kind === "sending" ? "Resending..." : "Yes, resend"}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn--secondary"
                        onClick={() => setResendStatus({ kind: "idle" })}
                        disabled={resendStatus.kind === "sending"}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary campaign-editor__action"
                    onClick={() => setResendStatus({ kind: "confirm" })}
                  >
                    Resend to {form.failed_count} failed
                  </button>
                ))}
              {resendStatus.kind === "ok" && (
                <p className="campaign-editor__hint campaign-editor__hint--ok">
                  {resendStatus.msg}
                </p>
              )}
              {resendStatus.kind === "err" && (
                <p className="campaign-editor__hint campaign-editor__hint--err">
                  {resendStatus.msg}
                </p>
              )}
            </section>
          )}

          {form.status === "sending" && (
            <section className="campaign-editor__panel">
              <h3 className="campaign-editor__panel-title">Sending</h3>
              <p className="campaign-editor__stat">
                {sendProgress && sendProgress.total > 0 ? (
                  <>
                    <strong>{sendProgress.done}</strong> / {sendProgress.total} sent
                    {sendProgress.failed > 0 && (
                      <>
                        {", "}
                        <strong>{sendProgress.failed}</strong> failed
                      </>
                    )}
                  </>
                ) : (
                  "Queued — sending in background…"
                )}
              </p>
              <p className="campaign-editor__hint">
                This sends in the background. You can leave this page; progress
                updates automatically.
              </p>
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
            <label className="campaign-editor__label">Category</label>
            <select
              className="campaign-editor__input"
              value={form.category || "general"}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              disabled={isLocked}
            >
              {NOTIFICATION_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                  {c.required ? " (all subscribers)" : ""}
                </option>
              ))}
            </select>
            <p className="campaign-editor__hint">
              Subscribers who opted out of this category are skipped. General
              reaches every active subscriber.
            </p>
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

type SendSortCol = "email" | "status" | "sent_at" | "click_count" | "clicked_at";

function recipientCell(r: SendRow) {
  return r.audience_id ? (
    <Link href={`/admin/audience/${r.audience_id}`} className="admin-table__link">
      {r.email}
    </Link>
  ) : (
    <span className="admin-table__link">{r.email}</span>
  );
}

function statusCell(r: SendRow) {
  return (
    <>
      <span className={`admin-status admin-status--${statusVariant(r.status)}`}>
        {r.status}
      </span>
      {r.status === "bounced" && r.bounce_type && (
        <span
          className={`campaign-sends__bounce campaign-sends__bounce--${r.bounce_type === "hard" ? "hard" : "soft"}`}
        >
          {r.bounce_type}
        </span>
      )}
      {r.bounce_reason && (
        <span className="campaign-sends__hint">{r.bounce_reason}</span>
      )}
    </>
  );
}

function SendsTable({ rows, clicksBySend }: { rows: SendRow[] | null; clicksBySend?: Record<string, number> }) {
  const [sortCol, setSortCol] = useState<SendSortCol>("sent_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  if (rows === null) {
    return <p className="campaign-editor__hint">Loading recipients...</p>;
  }
  if (rows.length === 0) {
    return <p className="campaign-editor__hint">No recipients yet.</p>;
  }
  // Per-recipient human click count (scanner/CloudFront pre-fetch storms
  // removed). Once metrics have loaded, a recipient missing from bySend had ALL
  // its clicks filtered as scanner -> show 0, NOT the raw scanner-inclusive
  // counter. Only fall back to the raw count while metrics are still loading.
  const clicksFor = (r: SendRow) =>
    clicksBySend ? (clicksBySend[r.id] ?? 0) : r.click_count;

  const realRows = rows.filter((r) => !r.is_test);
  const testRows = rows.filter((r) => r.is_test);

  const cmp = (a: SendRow, b: SendRow): number => {
    switch (sortCol) {
      case "email":
        return a.email.localeCompare(b.email);
      case "status":
        return a.status.localeCompare(b.status);
      case "click_count":
        return clicksFor(a) - clicksFor(b);
      default: {
        // date columns: nulls sort last
        const av = a[sortCol] ?? "";
        const bv = b[sortCol] ?? "";
        if (av === bv) return 0;
        if (!av) return 1;
        if (!bv) return -1;
        return av < bv ? -1 : 1;
      }
    }
  };
  const sorted = [...realRows].sort(
    (a, b) => cmp(a, b) * (sortDir === "asc" ? 1 : -1),
  );

  const toggleSort = (col: SendSortCol) => {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      // text columns default ascending; counts/dates default descending
      setSortDir(col === "email" || col === "status" ? "asc" : "desc");
    }
  };
  const arrow = (col: SendSortCol) =>
    sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const cols: { col: SendSortCol; label: string; date?: boolean }[] = [
    { col: "email", label: "Recipient" },
    { col: "status", label: "Status" },
    { col: "sent_at", label: "Sent", date: true },
    { col: "click_count", label: "Clicks" },
    { col: "clicked_at", label: "Last click", date: true },
  ];

  return (
    <div className="campaign-sends campaign-sends--scroll">
      <table className="admin-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.col}
                className={`admin-table__th campaign-sends__th${c.date ? " admin-table__th--date" : ""}`}
                onClick={() => toggleSort(c.col)}
              >
                {c.label}
                {arrow(c.col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="admin-table__row">
              <td className="admin-table__td">{recipientCell(r)}</td>
              <td className="admin-table__td">{statusCell(r)}</td>
              <td className="admin-table__td admin-table__td--date">
                {fmtShort(r.sent_at)}
              </td>
              <td className="admin-table__td">
                {clicksFor(r) > 0 ? (
                  <strong>{clicksFor(r)}</strong>
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
                  <td className="admin-table__td">{recipientCell(r)}</td>
                  <td className="admin-table__td">{statusCell(r)}</td>
                  <td className="admin-table__td admin-table__td--date">
                    {fmtShort(r.sent_at)}
                  </td>
                  <td className="admin-table__td">
                    {clicksFor(r) > 0 ? clicksFor(r) : "—"}
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
