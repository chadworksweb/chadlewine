"use client";

import { useState } from "react";
import { WaterRipple } from "@/components/WaterRipple";
import { GlitchEffect } from "@/components/effects/GlitchEffect";
import { KaleidoscopeEffect } from "@/components/effects/KaleidoscopeEffect";
import { ShatterEffect } from "@/components/effects/ShatterEffect";
import { InvertWaveEffect } from "@/components/effects/InvertWaveEffect";

type EffectMode = "ripple" | "glitch" | "kaleidoscope" | "shatter" | "invert";

const effects: { id: EffectMode; label: string; icon: string; interaction: string }[] = [
  { id: "ripple", label: "Ripple", icon: "💧", interaction: "click" },
  { id: "glitch", label: "Glitch", icon: "⚡", interaction: "drag" },
  { id: "kaleidoscope", label: "Kaleidoscope", icon: "🔮", interaction: "drag" },
  { id: "shatter", label: "Shatter", icon: "💎", interaction: "click" },
  { id: "invert", label: "Invert", icon: "🌗", interaction: "click" },
];

interface ArtPlaygroundProps {
  src: string;
  alt: string;
  className?: string;
}

export function CoverArtPlayground({ src, alt, className }: ArtPlaygroundProps) {
  const [mode, setMode] = useState<EffectMode>("ripple");

  return (
    <div className="art-playground">
      <div className="art-playground__canvas">
        {mode === "ripple" && <WaterRipple src={src} alt={alt} className={className} />}
        {mode === "glitch" && <GlitchEffect src={src} alt={alt} className={className} />}
        {mode === "kaleidoscope" && <KaleidoscopeEffect src={src} alt={alt} className={className} />}
        {mode === "shatter" && <ShatterEffect src={src} alt={alt} className={className} />}
        {mode === "invert" && <InvertWaveEffect src={src} alt={alt} className={className} />}
      </div>
      <div className="art-playground__menu">
        {effects.map((fx) => (
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
