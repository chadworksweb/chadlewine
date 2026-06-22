import type { ReactNode } from "react";
import "./SongLabel.css";

/**
 * Psyche Facts — the "Drug Facts" label for a song.
 *
 * Two layers feed it:
 *  - RC-derived (live from the badge): tier, charge, listener prose, societal
 *    prose, deadpan, topics. Rendered as Active charge / Effects / At scale.
 *  - Authored (label_meta jsonb, Opus-seeded + admin-editable): the
 *    prescription voice — purpose, indicated_for, do_not_use_if, directions,
 *    onset, duration, warning, plus optional distilled effects / at_scale.
 *
 * Every field renders only when present, so the panel degrades gracefully from
 * "RC charge + prose" up to the full prescription once the authored layer
 * exists. Returns null when there is nothing meaningful to show.
 */
export interface PsycheFactsMeta {
  purpose?: string | null;
  indicated_for?: string[] | null;
  do_not_use_if?: string | null;
  directions?: string | null;
  onset?: string | null;
  duration?: string | null;
  warning?: string | null;
  /** Distilled bullets; when present they replace the raw listener prose. */
  effects?: string[] | null;
  /** Distilled bullets; when present they replace the raw societal prose. */
  at_scale?: string[] | null;
}

export interface SongLabelProps {
  title: string;
  runtimeSeconds?: number | null;
  tierLabel?: string | null;
  tierHex?: string | null;
  charge?: number | null;
  chargeSummary?: string | null;
  listenerProse?: string | null;
  societalProse?: string | null;
  deadpan?: string | null;
  topics?: string[] | null;
  meta?: PsycheFactsMeta | null;
}

function fmtRuntime(s?: number | null): string | null {
  if (!s || s <= 0) return null;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function paragraphs(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function Field({
  label,
  sub,
  warn,
  children,
}: {
  label: string;
  sub?: string;
  warn?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`song-label__field${warn ? " song-label__field--warn" : ""}`}>
      <span className="song-label__label">
        {label}
        {sub ? <span className="song-label__sub"> ({sub})</span> : null}
      </span>
      <div className="song-label__body">{children}</div>
    </div>
  );
}

export function SongLabel(props: SongLabelProps) {
  const m = props.meta || {};
  const runtime = fmtRuntime(props.runtimeSeconds);

  const effects = m.effects && m.effects.length > 0 ? m.effects : null;
  const effectsProse = effects ? [] : paragraphs(props.listenerProse);
  const atScale = m.at_scale && m.at_scale.length > 0 ? m.at_scale : null;
  const atScaleProse = atScale ? [] : paragraphs(props.societalProse);

  const indicatedFor =
    m.indicated_for && m.indicated_for.length > 0
      ? m.indicated_for
      : (props.topics || []).filter((t) => t && t.trim());

  const warning = m.warning || props.deadpan || null;
  const hasCharge = typeof props.charge === "number";
  const hasEffects = !!effects || effectsProse.length > 0;
  const hasAtScale = !!atScale || atScaleProse.length > 0;

  // Nothing meaningful to render.
  if (!hasCharge && !m.purpose && !hasEffects && !hasAtScale && indicatedFor.length === 0) {
    return null;
  }

  const chargeStr = hasCharge ? `${props.charge! > 0 ? "+" : ""}${props.charge}` : null;

  return (
    <div className="song-label" role="group" aria-label={`Psyche Facts for ${props.title}`}>
      <div className="song-label__head">
        <span className="song-label__kicker">Psyche Facts</span>
        <span className="song-label__track">
          {props.title}
          {runtime ? ` / ${runtime}` : ""}
        </span>
      </div>

      {(props.tierLabel || chargeStr) && (
        <div className="song-label__active">
          {props.tierLabel && (
            <span className="song-label__active-row">
              <span className="song-label__k">Tier</span>
              <span
                className="song-label__v"
                style={props.tierHex ? { color: props.tierHex } : undefined}
              >
                {props.tierLabel}
              </span>
            </span>
          )}
          {chargeStr && (
            <span className="song-label__active-row">
              <span className="song-label__k">Active charge</span>
              <span className="song-label__v">
                {chargeStr}
                {props.chargeSummary ? (
                  <em className="song-label__charge-sum"> {props.chargeSummary}</em>
                ) : null}
              </span>
            </span>
          )}
        </div>
      )}

      {m.purpose && <Field label="Purpose">{m.purpose}</Field>}

      {indicatedFor.length > 0 && (
        <Field label="Indicated for">
          <ul className="song-label__tags">
            {indicatedFor.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Field>
      )}

      {m.do_not_use_if && (
        <Field label="Do not use if" warn>
          {m.do_not_use_if}
        </Field>
      )}

      {hasEffects && (
        <Field label="Effects" sub="per listen">
          {effects ? (
            <ul className="song-label__bullets">
              {effects.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : (
            effectsProse.map((p, i) => (
              <p key={i} className="song-label__p">
                {p}
              </p>
            ))
          )}
        </Field>
      )}

      {hasAtScale && (
        <Field label="At scale" sub="per 1,000,000 listeners">
          {atScale ? (
            <ul className="song-label__bullets">
              {atScale.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : (
            atScaleProse.map((p, i) => (
              <p key={i} className="song-label__p">
                {p}
              </p>
            ))
          )}
        </Field>
      )}

      {m.directions && <Field label="Directions">{m.directions}</Field>}

      {(m.onset || m.duration) && (
        <Field label="Onset / Duration">{[m.onset, m.duration].filter(Boolean).join(" / ")}</Field>
      )}

      {warning && (
        <Field label="Warning" warn>
          {warning}
        </Field>
      )}
    </div>
  );
}
