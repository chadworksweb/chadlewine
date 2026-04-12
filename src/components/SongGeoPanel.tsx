"use client";

import { useMemo } from "react";

export interface SongGeoPanelProps {
  compositionContent: string;
  focusKeyphrase: string;
  secondaryKeyphrases: string[];
  citationSummary: string;
  paaPairs: { question: string; answer: string }[];
  entityTags: string[];
  seoTitle: string;
  seoDescription: string;
}

function countWords(text: string): number {
  const stripped = text.replace(/<[^>]+>/g, " ").replace(/[#*_`>\-]/g, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return 0;
  return stripped.split(" ").length;
}

function computeSongScore(props: SongGeoPanelProps): {
  total: number;
  max: number;
  breakdown: { label: string; points: number; max: number; status: string }[];
} {
  const breakdown: { label: string; points: number; max: number; status: string }[] = [];
  const wc = countWords(props.compositionContent);
  const paaCount = props.paaPairs.length;
  const secondaryCount = props.secondaryKeyphrases.filter((s) => s.trim()).length;
  const entityCount = props.entityTags.filter((s) => s.trim()).length;

  // Citation summary: 20
  const citPts = props.citationSummary.trim() ? 20 : 0;
  breakdown.push({ label: "Citation summary", points: citPts, max: 20, status: citPts === 20 ? "green" : "red" });

  // Focus keyphrase: 15
  const fkPts = props.focusKeyphrase.trim() ? 15 : 0;
  breakdown.push({ label: "Focus keyphrase", points: fkPts, max: 15, status: fkPts === 15 ? "green" : "red" });

  // Composition word count: 15
  let wcPts = 0;
  if (wc >= 300) wcPts = 15;
  else if (wc >= 150) wcPts = 8;
  breakdown.push({
    label: `Composition (${wc} words)`,
    points: wcPts,
    max: 15,
    status: wcPts === 15 ? "green" : wcPts > 0 ? "yellow" : "red",
  });

  // PAA pairs: 20
  let paaPts = 0;
  if (paaCount >= 3) paaPts = 20;
  else if (paaCount >= 2) paaPts = 15;
  else if (paaCount === 1) paaPts = 8;
  breakdown.push({
    label: `PAA pairs (${paaCount})`,
    points: paaPts,
    max: 20,
    status: paaPts === 20 ? "green" : paaPts > 0 ? "yellow" : "red",
  });

  // Secondary keyphrases: 10
  const skPts = secondaryCount >= 3 ? 10 : secondaryCount >= 1 ? 5 : 0;
  breakdown.push({
    label: `Secondary keyphrases (${secondaryCount})`,
    points: skPts,
    max: 10,
    status: skPts === 10 ? "green" : skPts > 0 ? "yellow" : "gray",
  });

  // Entity tags: 10
  const etPts = entityCount >= 2 ? 10 : entityCount === 1 ? 5 : 0;
  breakdown.push({
    label: `Entity tags (${entityCount})`,
    points: etPts,
    max: 10,
    status: etPts === 10 ? "green" : etPts > 0 ? "yellow" : "gray",
  });

  // SEO title + description: 10
  const seoPts = (props.seoTitle.trim() ? 5 : 0) + (props.seoDescription.trim() ? 5 : 0);
  breakdown.push({
    label: "SEO title + description",
    points: seoPts,
    max: 10,
    status: seoPts === 10 ? "green" : seoPts > 0 ? "yellow" : "gray",
  });

  const total = breakdown.reduce((sum, b) => sum + b.points, 0);
  return { total, max: 100, breakdown };
}

export function SongGeoPanel(props: SongGeoPanelProps) {
  const { total, breakdown } = useMemo(() => computeSongScore(props), [props]);

  const scoreColor = total >= 80 ? "#33cc55" : total >= 50 ? "#ffbb33" : "#ff3333";

  return (
    <div className="song-geo-panel">
      <div className="song-geo-panel__header">
        <h3 className="song-geo-panel__title">GEO Score</h3>
        <span className="song-geo-panel__score" style={{ color: scoreColor }}>
          {total}/100
        </span>
      </div>
      <div className="song-geo-panel__breakdown">
        {breakdown.map((item, i) => (
          <div key={i} className="song-geo-panel__row">
            <span className="song-geo-panel__row-label">{item.label}</span>
            <span className={`song-geo-panel__row-pts song-geo-panel__row-pts--${item.status}`}>
              {item.points}/{item.max}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
