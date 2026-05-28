"use client";

import { leversBySection, type Lever } from "@/lib/librosa-levers";
import "./LibrosaLeverControls.css";

interface LibrosaLeverControlsProps {
  levers: Lever[];
  /** Current effective values keyed by lever id. */
  values: Record<string, number>;
  /**
   * "global": every lever is always set; the right-hand chip resets a value
   * to its registry default.
   * "song": levers inherit the global value until overridden; the chip
   * toggles between Inherit and Override.
   */
  mode: "global" | "song";
  /**
   * The value a lever falls back to when not explicitly set. For "global"
   * this is the registry default (per lever). For "song" this is the global
   * effective config.
   */
  baseline: Record<string, number>;
  /** Lever ids that are explicitly set at this layer (vs inherited/default). */
  explicit: Set<string>;
  /**
   * Set an explicit value for a lever. Passing null clears it (reset to
   * default in "global" mode, inherit in "song" mode).
   */
  onChange: (id: string, value: number | null) => void;
}

export function LibrosaLeverControls({
  levers,
  values,
  mode,
  baseline,
  explicit,
  onChange,
}: LibrosaLeverControlsProps) {
  const sections = leversBySection(levers);

  return (
    <div className="lev-group">
      {sections.map(({ section, levers: secLevers }) => (
        <div key={section} className="lev-section">
          <h4 className="lev-section__title">{section}</h4>
          {secLevers.map((lever) => {
            const isExplicit = explicit.has(lever.id);
            const shown = isExplicit
              ? values[lever.id] ?? baseline[lever.id] ?? lever.default
              : baseline[lever.id] ?? lever.default;
            // In song mode an inherited lever shows the global value but is
            // still editable: dragging the slider or typing creates the
            // override. The chip flips it back to Inherit. Nothing is disabled.
            const inheriting = mode === "song" && !isExplicit;

            return (
              <div key={lever.id} className="lev-row">
                <div className="lev-row__head">
                  <span
                    className={`lev-row__label${inheriting ? " lev-row__label--inherited" : ""}`}
                  >
                    {lever.label}
                    {lever.requiresRescan && (
                      <span className="lev-row__rescan"> &nbsp;rescan</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className={`lev-row__state${isExplicit ? " lev-row__state--overridden" : ""}`}
                    onClick={() =>
                      isExplicit ? onChange(lever.id, null) : onChange(lever.id, shown)
                    }
                  >
                    {mode === "song"
                      ? isExplicit
                        ? "Override"
                        : "Inherit"
                      : isExplicit
                        ? "Reset"
                        : "Default"}
                  </button>
                </div>
                <div className="lev-row__controls">
                  <input
                    type="range"
                    className={`lev-row__slider${inheriting ? " lev-row__slider--inherited" : ""}`}
                    min={lever.min}
                    max={lever.max}
                    step={lever.step}
                    value={shown}
                    onChange={(e) => onChange(lever.id, Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="lev-row__num"
                    min={lever.min}
                    max={lever.max}
                    step={lever.step}
                    value={shown}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") return;
                      onChange(lever.id, Number(v));
                    }}
                  />
                  <span className="lev-row__unit">{lever.unit || ""}</span>
                </div>
                <p className="lev-row__desc">{lever.description}</p>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
