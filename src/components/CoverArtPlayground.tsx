"use client";

import { useState } from "react";
import { WaterRipple } from "@/components/WaterRipple";
import { GlitchEffect } from "@/components/effects/GlitchEffect";
import { KaleidoscopeEffect } from "@/components/effects/KaleidoscopeEffect";
import { ShatterEffect } from "@/components/effects/ShatterEffect";
import { InvertWaveEffect } from "@/components/effects/InvertWaveEffect";
import { LightningEffect } from "@/components/effects/LightningEffect";

type EffectMode = "ripple" | "lightning" | "glitch" | "kaleidoscope" | "shatter" | "invert";

const allEffects: { id: EffectMode; label: string; icon: string; interaction: string }[] = [
  { id: "ripple", label: "Ripple", icon: "💧", interaction: "click" },
  { id: "lightning", label: "Lightning", icon: "⚡", interaction: "click" },
  { id: "glitch", label: "Glitch", icon: "📡", interaction: "drag" },
  { id: "kaleidoscope", label: "Kaleidoscope", icon: "🔮", interaction: "drag" },
  { id: "shatter", label: "Shatter", icon: "💎", interaction: "click" },
  { id: "invert", label: "Invert", icon: "🌗", interaction: "click" },
];

interface ArtPlaygroundProps {
  src: string;
  alt: string;
  className?: string;
  focalX?: number; // 0-1, defaults to 0.5
  focalY?: number; // 0-1, defaults to 0.5
  zoom?: number; // >= 1, defaults to 1
}

export function CoverArtPlayground({ src, alt, className, focalX = 0.5, focalY = 0.5, zoom = 1 }: ArtPlaygroundProps) {
  const [mode, setMode] = useState<EffectMode>("ripple");

  const fxProps = { src, alt, className, focalX, focalY, zoom };

  return (
    <div className="art-playground">
      <div className="art-playground__canvas" style={{ position: "relative" }}>
        {mode === "ripple" && <WaterRipple {...fxProps} />}
        {mode === "lightning" && <LightningEffect {...fxProps} />}
        {mode === "glitch" && <GlitchEffect {...fxProps} />}
        {mode === "kaleidoscope" && <KaleidoscopeEffect {...fxProps} />}
        {mode === "shatter" && <ShatterEffect {...fxProps} />}
        {mode === "invert" && <InvertWaveEffect {...fxProps} />}
      </div>
      <div className="art-playground__menu">
        {allEffects.map((fx) => (
          <button
            key={fx.id}
            className={`art-playground__btn${mode === fx.id ? " art-playground__btn--active" : ""}`}
            onClick={() => setMode(fx.id)}
            title={`${fx.label} (${fx.interaction})`}
          >
            <span className="art-playground__btn-icon">{fx.icon}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
