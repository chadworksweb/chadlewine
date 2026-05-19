"use client";

import { useState, useMemo } from "react";

export interface GeoPanelProps {
  body: string;
  focusKeyphrase: string;
  secondaryKeyphrases: string[];
  searchIntent: string;
  citationSummary: string;
  firstSentenceExtractable: boolean;
  paaPairs: { question: string; answer: string }[];
  entityTags: string[];
  articleType: string;
  artImagePath: string;
  artAlt: string;
  dateCaptured: string;
  publishedAt: string | null;
  hookLine: string;
  tensionLine: string;
  seoTitle: string;
  seoDescription: string;
  onChange: (field: string, value: unknown) => void;
  /** Controls which optional sections appear. Defaults to "observation". */
  contentType?: "observation" | "door-page" | "page";
}

interface SuggestionCandidate {
  sentence: string;
  rationale: string;
  source_position: number;
}

function countWords(html: string): number {
  const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return 0;
  return stripped.split(" ").length;
}

function countHeadings(html: string, tag: string): number {
  const regex = new RegExp(`<${tag}[^>]*>`, "gi");
  return (html.match(regex) || []).length;
}

function countInternalLinks(html: string): number {
  return (html.match(/href="\/(?!\/)[^"]*"/gi) || []).length;
}

function checkHeadingHierarchy(html: string): boolean {
  const headings = html.match(/<h[2-6][^>]*>/gi) || [];
  let lastLevel = 1;
  for (const h of headings) {
    const level = parseInt(h.charAt(2));
    if (level > lastLevel + 1) return false;
    lastLevel = level;
  }
  return true;
}

function computeScore(props: GeoPanelProps): {
  total: number;
  breakdown: { label: string; points: number; max: number; status: string }[];
} {
  const breakdown: { label: string; points: number; max: number; status: string }[] = [];
  const wc = countWords(props.body);
  const h2 = countHeadings(props.body, "h2");
  const internalLinks = countInternalLinks(props.body);
  const paaCount = props.paaPairs.length;
  const secondaryCount = props.secondaryKeyphrases.filter((s) => s.trim()).length;
  const entityCount = props.entityTags.filter((s) => s.trim()).length;

  // Citation summary: 15
  const citPts = props.citationSummary.trim() ? 15 : 0;
  breakdown.push({ label: "Citation summary", points: citPts, max: 15, status: citPts === 15 ? "green" : "red" });

  // First sentence extractable: 10
  const fsePts = props.firstSentenceExtractable ? 10 : 0;
  breakdown.push({ label: "First sentence extractable", points: fsePts, max: 10, status: fsePts === 10 ? "green" : "gray" });

  // Focus keyphrase: 10
  const fkPts = props.focusKeyphrase.trim() ? 10 : 0;
  breakdown.push({ label: "Focus keyphrase", points: fkPts, max: 10, status: fkPts === 10 ? "green" : "red" });

  // Word count: 10
  let wcPts = 0;
  if (wc >= 1000 && wc <= 2000) wcPts = 10;
  else if (wc >= 400 && wc < 1000) wcPts = 5;
  breakdown.push({
    label: `Word count (${wc.toLocaleString()})`,
    points: wcPts,
    max: 10,
    status: wcPts === 10 ? "green" : wcPts > 0 ? "yellow" : "red",
  });

  // Heading structure: 10
  let hPts = 0;
  if (h2 >= 2) hPts = 10;
  else if (h2 === 1) hPts = 5;
  breakdown.push({
    label: `Heading structure (${h2} H2s)`,
    points: hPts,
    max: 10,
    status: hPts === 10 ? "green" : hPts > 0 ? "yellow" : "red",
  });

  // PAA pairs: 10
  let paaPts = 0;
  if (paaCount >= 2) paaPts = 10;
  else if (paaCount === 1) paaPts = 5;
  breakdown.push({
    label: `PAA pairs (${paaCount})`,
    points: paaPts,
    max: 10,
    status: paaPts === 10 ? "green" : paaPts > 0 ? "yellow" : "gray",
  });

  // Internal links: 15
  let ilPts = 0;
  if (internalLinks >= 2) ilPts = 15;
  else if (internalLinks === 1) ilPts = 7;
  breakdown.push({
    label: `Internal links (${internalLinks})`,
    points: ilPts,
    max: 15,
    status: ilPts === 15 ? "green" : ilPts > 0 ? "yellow" : "red",
  });

  // Secondary keyphrases: 5
  const skPts = secondaryCount >= 2 ? 5 : 0;
  breakdown.push({
    label: `Secondary keyphrases (${secondaryCount})`,
    points: skPts,
    max: 5,
    status: skPts === 5 ? "green" : "gray",
  });

  // Entity tags: 5
  const etPts = entityCount >= 1 ? 5 : 0;
  breakdown.push({
    label: `Entity tags (${entityCount})`,
    points: etPts,
    max: 5,
    status: etPts === 5 ? "green" : "gray",
  });

  // OG image + alt: 5
  const ogPts = props.artImagePath.trim() && props.artAlt.trim() ? 5 : 0;
  breakdown.push({
    label: "OG image + alt",
    points: ogPts,
    max: 5,
    status: ogPts === 5 ? "green" : "red",
  });

  // Date fields: 5
  const datePts = props.dateCaptured && props.publishedAt ? 5 : 0;
  breakdown.push({
    label: "Date fields",
    points: datePts,
    max: 5,
    status: datePts === 5 ? "green" : "yellow",
  });

  const total = breakdown.reduce((sum, b) => sum + b.points, 0);
  return { total, breakdown };
}

function ScoreBadge({ score }: { score: number }) {
  let color = "var(--geo-red, #ef4444)";
  if (score >= 80) color = "var(--geo-green, #22c55e)";
  else if (score >= 60) color = "var(--geo-yellow, #eab308)";

  return (
    <div className="geo-score-badge" style={{ borderColor: color }}>
      <span className="geo-score-badge__value" style={{ color }}>{score}</span>
      <span className="geo-score-badge__label">GEO Score</span>
    </div>
  );
}

export function GeoPanel(props: GeoPanelProps) {
  const { onChange, contentType = "observation" } = props;
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    search: true,
    citation: true,
    structure: false,
    paa: false,
    entities: false,
    meta: false,
    surfaces: false,
    ai: false,
    schema: false,
  });
  const [newSecondary, setNewSecondary] = useState("");
  const [newEntity, setNewEntity] = useState("");
  const [newPaaQ, setNewPaaQ] = useState("");
  const [newPaaA, setNewPaaA] = useState("");
  const [hookCandidates, setHookCandidates] = useState<SuggestionCandidate[]>([]);
  const [tensionCandidates, setTensionCandidates] = useState<SuggestionCandidate[]>([]);
  const [suggestingHook, setSuggestingHook] = useState(false);
  const [suggestingTension, setSuggestingTension] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [flyoutLoading, setFlyoutLoading] = useState(false);
  const [flyoutError, setFlyoutError] = useState("");
  const [flyoutHasRun, setFlyoutHasRun] = useState(false);
  const [optimizationPlan, setOptimizationPlan] = useState<{ section: string; items: { action: string; detail: string; points: string }[] }[]>([]);

  async function analyzeAndOptimize() {
    setFlyoutOpen(true);
    setFlyoutLoading(true);
    setFlyoutError("");
    setOptimizationPlan([]);

    try {
      const res = await fetch("/api/admin/optimize-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: props.hookLine ? undefined : undefined,
          body: props.body,
          score: total,
          breakdown: breakdown.map((b) => ({ label: b.label, points: b.points, max: b.max, status: b.status })),
          focusKeyphrase: props.focusKeyphrase,
          citationSummary: props.citationSummary,
          firstSentenceExtractable: props.firstSentenceExtractable,
          secondaryKeyphrases: props.secondaryKeyphrases,
          entityTags: props.entityTags,
          paaPairs: props.paaPairs,
          artImagePath: props.artImagePath,
          artAlt: props.artAlt,
          seoTitle: props.seoTitle,
          seoDescription: props.seoDescription,
        }),
      });
      if (!res.ok) {
        setFlyoutError("Analysis failed");
        setFlyoutLoading(false);
        return;
      }
      const data = await res.json();
      setOptimizationPlan(data.plan || []);
      setFlyoutHasRun(true);
    } catch {
      setFlyoutError("Network error");
    }
    setFlyoutLoading(false);
  }

  const { total, breakdown } = useMemo(
    () => computeScore(props),
    // computeScore reads these scalar fields; listing them lets the memo
    // actually skip work when nothing relevant changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      props.body,
      props.focusKeyphrase,
      props.secondaryKeyphrases,
      props.citationSummary,
      props.firstSentenceExtractable,
      props.paaPairs,
      props.entityTags,
    ],
  );

  const wc = useMemo(() => countWords(props.body), [props.body]);
  const readingTime = useMemo(() => (wc / 238).toFixed(1), [wc]);
  const h2Count = useMemo(() => countHeadings(props.body, "h2"), [props.body]);
  const h3Count = useMemo(() => countHeadings(props.body, "h3"), [props.body]);
  const hierarchyValid = useMemo(() => checkHeadingHierarchy(props.body), [props.body]);
  const internalLinks = useMemo(() => countInternalLinks(props.body), [props.body]);

  function toggleSection(key: string) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function addSecondaryKeyphrase() {
    const val = newSecondary.trim();
    if (!val) return;
    onChange("secondary_keyphrases", [...props.secondaryKeyphrases, val]);
    setNewSecondary("");
  }

  function removeSecondaryKeyphrase(index: number) {
    onChange(
      "secondary_keyphrases",
      props.secondaryKeyphrases.filter((_, i) => i !== index)
    );
  }

  function addEntity() {
    const val = newEntity.trim();
    if (!val) return;
    onChange("entity_tags", [...props.entityTags, val]);
    setNewEntity("");
  }

  function removeEntity(index: number) {
    onChange(
      "entity_tags",
      props.entityTags.filter((_, i) => i !== index)
    );
  }

  function addPaaPair() {
    const q = newPaaQ.trim();
    const a = newPaaA.trim();
    if (!q || !a) return;
    onChange("paa_pairs", [...props.paaPairs, { question: q, answer: a }]);
    setNewPaaQ("");
    setNewPaaA("");
  }

  function removePaaPair(index: number) {
    onChange(
      "paa_pairs",
      props.paaPairs.filter((_, i) => i !== index)
    );
  }

  async function suggestCandidates(field: "hook" | "tension") {
    if (!props.body.trim()) return;
    const setLoading = field === "hook" ? setSuggestingHook : setSuggestingTension;
    const setCandidates = field === "hook" ? setHookCandidates : setTensionCandidates;
    setLoading(true);
    setSuggestError("");

    try {
      const res = await fetch("/api/admin/suggest-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: props.body, field }),
      });
      if (!res.ok) {
        setSuggestError("Suggestion request failed");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setCandidates(field === "hook" ? data.hook_candidates || [] : data.tension_candidates || []);
    } catch {
      setSuggestError("Network error");
    }
    setLoading(false);
  }

  return (
    <div className={`geo-panel-wrap${flyoutOpen ? " geo-panel-wrap--flyout-open" : ""}`}>
    <div className="geo-panel">
      <div className="geo-panel__header">
        <h2 className="geo-panel__title">GEO/SEO Panel</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            className="admin-btn admin-btn--primary admin-btn--small"
            onClick={analyzeAndOptimize}
            disabled={flyoutLoading}
          >
            {flyoutLoading ? "Analyzing..." : "Analyze & Optimize"}
          </button>
          <ScoreBadge score={total} />
        </div>
      </div>

      {/* Left column: score + breakdown (sticky) */}
      <div className="geo-panel__left">
        <div className="geo-panel__breakdown">
          {breakdown.map((b) => (
            <div key={b.label} className={`geo-breakdown-row geo-breakdown-row--${b.status}`}>
              <span className="geo-breakdown-row__label">{b.label}</span>
              <span className="geo-breakdown-row__score">{b.points}/{b.max}</span>
            </div>
          ))}
        </div>
        <div className="geo-legend">
          <span className="geo-legend__item geo-legend__item--green">Complete</span>
          <span className="geo-legend__item geo-legend__item--yellow">Partial</span>
          <span className="geo-legend__item geo-legend__item--red">Missing</span>
          <span className="geo-legend__item geo-legend__item--gray">Optional</span>
        </div>
      </div>

      {/* Right column: all sections — order matches breakdown rows */}
      <div className="geo-panel__right">

      {/* Citation Readiness (breakdown rows 1-2) */}
      <div className="geo-section">
        <button
          type="button"
          className="geo-section__header"
          onClick={() => toggleSection("citation")}
        >

          <span>Citation Readiness</span>
          <span className="geo-section__toggle">{expandedSections.citation ? "\u25B2" : "\u25BC"}</span>
        </button>
        {expandedSections.citation && (
          <div className="geo-section__body">
            <div className="obsv-editor__field">
              <label className="obsv-editor__label">
                Citation Summary
                <span className="obsv-editor__counter">{props.citationSummary.length}/300</span>
              </label>
              <textarea
                className="obsv-editor__textarea obsv-editor__textarea--short"
                value={props.citationSummary}
                onChange={(e) => onChange("citation_summary", e.target.value)}
                maxLength={300}
                rows={3}
                placeholder={'"According to Chad Lewine, [this summary]" must read naturally.'}
              />
            </div>
            <div className="obsv-editor__field">
              <label className="geo-toggle-label">
                <input
                  type="checkbox"
                  checked={props.firstSentenceExtractable}
                  onChange={(e) => onChange("first_sentence_extractable", e.target.checked)}
                />
                First sentence works as standalone claim
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Search Target (breakdown rows 3, 8) */}
      <div className="geo-section">
        <button
          type="button"
          className="geo-section__header"
          onClick={() => toggleSection("search")}
        >

          <span>Search Target</span>
          <span className="geo-section__toggle">{expandedSections.search ? "\u25B2" : "\u25BC"}</span>
        </button>
        {expandedSections.search && (
          <div className="geo-section__body">
            <div className="obsv-editor__field">
              <label className="obsv-editor__label">
                Focus Keyphrase
                <span className="obsv-editor__counter">{props.focusKeyphrase.length}/80</span>
              </label>
              <input
                className="obsv-editor__input"
                type="text"
                value={props.focusKeyphrase}
                onChange={(e) => onChange("focus_keyphrase", e.target.value)}
                maxLength={80}
                placeholder="What would someone search to find this?"
              />
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label">
                Secondary Keyphrases
                <span className="obsv-editor__counter">{props.secondaryKeyphrases.length} added</span>
              </label>
              <div className="geo-tag-list">
                {props.secondaryKeyphrases.map((kp, i) => (
                  <span key={i} className="geo-tag">
                    {kp}
                    <button type="button" className="geo-tag__remove" onClick={() => removeSecondaryKeyphrase(i)}>&times;</button>
                  </span>
                ))}
              </div>
              <div className="geo-add-row">
                <input
                  className="obsv-editor__input"
                  type="text"
                  value={newSecondary}
                  onChange={(e) => setNewSecondary(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSecondaryKeyphrase(); } }}
                  placeholder="Add secondary keyphrase"
                  maxLength={80}
                />
                <button type="button" className="admin-btn admin-btn--small" onClick={addSecondaryKeyphrase}>+</button>
              </div>
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label">Search Intent</label>
              <select
                className="obsv-editor__select"
                value={props.searchIntent}
                onChange={(e) => onChange("search_intent", e.target.value)}
              >
                <option value="informational">Informational</option>
                <option value="navigational">Navigational</option>
                <option value="commercial">Commercial</option>
                <option value="transactional">Transactional</option>
              </select>
              <span className="geo-intent-desc">
                {props.searchIntent === "informational" && "Searcher wants to learn or understand. Most Observations are this."}
                {props.searchIntent === "navigational" && "Searcher wants a specific page or person. The /chad-lewine page is this."}
                {props.searchIntent === "commercial" && "Searcher is researching before a decision."}
                {props.searchIntent === "transactional" && "Searcher wants to buy or act. Future merch/patronage pages."}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Content Structure (read-only computed) */}
      <div className="geo-section">
        <button
          type="button"
          className="geo-section__header"
          onClick={() => toggleSection("structure")}
        >

          <span>Content Structure</span>
          <span className="geo-section__toggle">{expandedSections.structure ? "\u25B2" : "\u25BC"}</span>
        </button>
        {expandedSections.structure && (
          <div className="geo-section__body">
            <div className="geo-stat-grid">
              <div className="geo-stat">
                <span className="geo-stat__value">{wc.toLocaleString()}</span>
                <span className="geo-stat__label">Words</span>
              </div>
              <div className="geo-stat">
                <span className="geo-stat__value">{readingTime}m</span>
                <span className="geo-stat__label">Read time</span>
              </div>
              <div className="geo-stat">
                <span className="geo-stat__value">{h2Count}</span>
                <span className="geo-stat__label">H2s</span>
              </div>
              <div className="geo-stat">
                <span className="geo-stat__value">{h3Count}</span>
                <span className="geo-stat__label">H3s</span>
              </div>
              <div className="geo-stat">
                <span className="geo-stat__value">{internalLinks}</span>
                <span className="geo-stat__label">Int. links</span>
              </div>
            </div>
            {!hierarchyValid && (
              <p className="geo-warning">Heading hierarchy has gaps (e.g. H3 before H2)</p>
            )}
          </div>
        )}
      </div>

      {/* Section 4: PAA Pairs */}
      <div className="geo-section">
        <button
          type="button"
          className="geo-section__header"
          onClick={() => toggleSection("paa")}
        >

          <span>People Also Ask</span>
          <span className="geo-section__toggle">{expandedSections.paa ? "\u25B2" : "\u25BC"}</span>
        </button>
        {expandedSections.paa && (
          <div className="geo-section__body">
            {props.paaPairs.map((pair, i) => (
              <div key={i} className="geo-paa-card">
                <div className="geo-paa-card__q">Q: {pair.question}</div>
                <div className="geo-paa-card__a">A: {pair.answer}</div>
                <button type="button" className="geo-tag__remove geo-paa-card__remove" onClick={() => removePaaPair(i)}>&times;</button>
              </div>
            ))}
            <div className="geo-paa-add">
              <input
                className="obsv-editor__input"
                type="text"
                value={newPaaQ}
                onChange={(e) => setNewPaaQ(e.target.value)}
                placeholder="Question"
                maxLength={100}
              />
              <textarea
                className="obsv-editor__textarea obsv-editor__textarea--short"
                value={newPaaA}
                onChange={(e) => setNewPaaA(e.target.value)}
                placeholder="Answer (40-200 chars)"
                maxLength={200}
                rows={2}
              />
              <button type="button" className="admin-btn admin-btn--small" onClick={addPaaPair}>Add Pair</button>
            </div>
          </div>
        )}
      </div>

      {/* Section 5: Entity Tags */}
      <div className="geo-section">
        <button
          type="button"
          className="geo-section__header"
          onClick={() => toggleSection("entities")}
        >

          <span>Entity Tags</span>
          <span className="geo-section__toggle">{expandedSections.entities ? "\u25B2" : "\u25BC"}</span>
        </button>
        {expandedSections.entities && (
          <div className="geo-section__body">
            <div className="geo-tag-list">
              {props.entityTags.map((tag, i) => (
                <span key={i} className="geo-tag">
                  {tag}
                  <button type="button" className="geo-tag__remove" onClick={() => removeEntity(i)}>&times;</button>
                </span>
              ))}
            </div>
            <div className="geo-add-row">
              <input
                className="obsv-editor__input"
                type="text"
                value={newEntity}
                onChange={(e) => setNewEntity(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEntity(); } }}
                placeholder="Person, concept, place, work..."
              />
              <button type="button" className="admin-btn admin-btn--small" onClick={addEntity}>+</button>
            </div>
          </div>
        )}
      </div>

      {/* Meta / OG (breakdown row 10: OG image + alt) */}
      <div className="geo-section">
        <button
          type="button"
          className="geo-section__header"
          onClick={() => toggleSection("meta")}
        >

          <span>Meta / OG</span>
          <span className="geo-section__toggle">{expandedSections.meta ? "\u25B2" : "\u25BC"}</span>
        </button>
        {expandedSections.meta && (
          <div className="geo-section__body">
            <div className="obsv-editor__field">
              <label className="obsv-editor__label">
                SEO Title
                <span className="obsv-editor__counter">{props.seoTitle.length}/60</span>
              </label>
              <input
                className="obsv-editor__input"
                type="text"
                value={props.seoTitle}
                onChange={(e) => onChange("seo_title", e.target.value)}
                maxLength={60}
                placeholder="Override only when title doesn't match search intent"
              />
            </div>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label">
                SEO Description
                <span className="obsv-editor__counter">{props.seoDescription.length}/160</span>
              </label>
              <textarea
                className="obsv-editor__textarea obsv-editor__textarea--short"
                value={props.seoDescription}
                onChange={(e) => onChange("seo_description", e.target.value)}
                maxLength={160}
                rows={3}
                placeholder="Falls back to citation summary → hook line"
              />
            </div>
            <div className="geo-stat-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: "8px" }}>
              <div className="geo-stat">
                <span className="geo-stat__value" style={{ fontSize: "0.8125rem" }}>
                  {props.artImagePath ? "\u2713" : "\u2717"}
                </span>
                <span className="geo-stat__label">OG Image</span>
              </div>
              <div className="geo-stat">
                <span className="geo-stat__value" style={{ fontSize: "0.8125rem" }}>
                  {props.artAlt ? "\u2713" : "\u2717"}
                </span>
                <span className="geo-stat__label">Image Alt</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 8: Google Surfaces (observations only) */}
      {contentType === "observation" && <div className="geo-section">
        <button
          type="button"
          className="geo-section__header"
          onClick={() => toggleSection("surfaces")}
        >

          <span>Google Surfaces</span>
          <span className="geo-section__toggle">{expandedSections.surfaces ? "\u25B2" : "\u25BC"}</span>
        </button>
        {expandedSections.surfaces && (
          <div className="geo-section__body">
            <div className="obsv-editor__field">
              <label className="geo-toggle-label">
                <input
                  type="checkbox"
                  checked={props.articleType === "news_article"}
                  onChange={(e) =>
                    onChange("article_type", e.target.checked ? "news_article" : "article")
                  }
                />
                News-relevant (switches to NewsArticle schema)
              </label>
            </div>
            <div className="geo-stat" style={{ marginTop: "0.5rem" }}>
              <span className="geo-stat__label">Schema type:</span>
              <span className="geo-stat__value" style={{ fontSize: "0.8125rem" }}>
                {props.articleType === "news_article" ? "NewsArticle" : "Article"}
              </span>
            </div>
          </div>
        )}
      </div>}

      {/* Section 9: AI-Assisted Hook & Tension (observations only) */}
      {contentType === "observation" && <div className="geo-section">
        <button
          type="button"
          className="geo-section__header"
          onClick={() => toggleSection("ai")}
        >

          <span>AI-Assisted Hook & Tension</span>
          <span className="geo-section__toggle">{expandedSections.ai ? "\u25B2" : "\u25BC"}</span>
        </button>
        {expandedSections.ai && (
          <div className="geo-section__body">
            {suggestError && <p className="geo-warning">{suggestError}</p>}

            {/* Hook candidates */}
            <div className="obsv-editor__field">
              <label className="obsv-editor__label">Hook Line Candidates</label>
              <button
                type="button"
                className="admin-btn admin-btn--small"
                onClick={() => suggestCandidates("hook")}
                disabled={suggestingHook || !props.body.trim()}
              >
                {suggestingHook ? "Analyzing..." : "Suggest Candidates"}
              </button>
              {hookCandidates.length > 0 && (
                <div className="geo-candidates">
                  {hookCandidates.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      className="geo-candidate-card"
                      onClick={() => onChange("hook_line", c.sentence)}
                    >
                      <span className="geo-candidate-card__text">&ldquo;{c.sentence}&rdquo;</span>
                      <span className="geo-candidate-card__rationale">{c.rationale}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tension candidates */}
            <div className="obsv-editor__field">
              <label className="obsv-editor__label">Tension Line Candidates</label>
              <button
                type="button"
                className="admin-btn admin-btn--small"
                onClick={() => suggestCandidates("tension")}
                disabled={suggestingTension || !props.body.trim()}
              >
                {suggestingTension ? "Analyzing..." : "Suggest Candidates"}
              </button>
              {tensionCandidates.length > 0 && (
                <div className="geo-candidates">
                  {tensionCandidates.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      className="geo-candidate-card"
                      onClick={() => onChange("tension_line", c.sentence)}
                    >
                      <span className="geo-candidate-card__text">&ldquo;{c.sentence}&rdquo;</span>
                      <span className="geo-candidate-card__rationale">{c.rationale}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>}

      {/* Schema Preview */}
      <div className="geo-section">
        <button
          type="button"
          className="geo-section__header"
          onClick={() => toggleSection("schema")}
        >

          <span>Schema Preview</span>
          <span className="geo-section__toggle">{expandedSections.schema ? "\u25B2" : "\u25BC"}</span>
        </button>
        {expandedSections.schema && (
          <div className="geo-section__body">
            <pre className="geo-schema-preview">
              {JSON.stringify(
                {
                  "@type": props.articleType === "news_article" ? "NewsArticle" : "Article",
                  headline: props.focusKeyphrase || "(focus keyphrase)",
                  datePublished: props.publishedAt || props.dateCaptured,
                  author: "Chad Lewine",
                  image: props.artImagePath || null,
                  ...(props.paaPairs.length > 0
                    ? {
                        faqPage: props.paaPairs.map((p) => ({
                          question: p.question,
                          answer: p.answer,
                        })),
                      }
                    : {}),
                },
                null,
                2
              )}
            </pre>
          </div>
        )}
      </div>

      </div>
    </div>

    {flyoutOpen ? (
      <div className="geo-flyout">
        <div className="geo-flyout__header">
          <h2 className="geo-flyout__title">Optimization Plan</h2>
          <button type="button" className="geo-flyout__close" onClick={() => setFlyoutOpen(false)}>Close</button>
        </div>

        {/* Pre-analysis alerts for missing data */}
        {!flyoutLoading && !flyoutError && optimizationPlan.length === 0 && !flyoutHasRun && (
          <div className="geo-flyout__prereqs">
            {!props.focusKeyphrase.trim() && (
              <div className="geo-flyout__alert">Fill out <strong>Focus Keyphrase</strong> in Search Target for best results</div>
            )}
            {props.secondaryKeyphrases.length === 0 && (
              <div className="geo-flyout__alert">Add <strong>Secondary Keyphrases</strong> in Search Target</div>
            )}
            {!props.citationSummary.trim() && (
              <div className="geo-flyout__alert">Write a <strong>Citation Summary</strong> in Citation Readiness</div>
            )}
            {props.entityTags.length === 0 && (
              <div className="geo-flyout__alert">Add <strong>Entity Tags</strong> so Claude can target named entities</div>
            )}
            {props.paaPairs.length === 0 && (
              <div className="geo-flyout__alert">Add <strong>PAA Pairs</strong> for FAQ schema optimization</div>
            )}
            {!props.seoTitle.trim() && !props.seoDescription.trim() && (
              <div className="geo-flyout__alert">Fill out <strong>SEO Title / Description</strong> in Meta / OG</div>
            )}
          </div>
        )}

        {flyoutLoading && (
          <div className="geo-flyout__loading">Analyzing observation with your voice profile and building optimization plan...</div>
        )}

        {flyoutError && (
          <div className="geo-flyout__error">{flyoutError}</div>
        )}

        {!flyoutLoading && !flyoutError && flyoutHasRun && optimizationPlan.length === 0 && (
          <div className="geo-flyout__loading">No gaps found — score is already at maximum.</div>
        )}

        {optimizationPlan.map((section, si) => (
          <div key={si} className="geo-plan-section">
            <h3 className="geo-plan-section__title">{section.section}</h3>
            {section.items.map((item, ii) => (
              <div key={ii} className="geo-plan-item">
                <span className="geo-plan-item__action">
                  {item.action}
                  <span className="geo-plan-item__points">+{item.points} pts</span>
                </span>
                <span className="geo-plan-item__detail">{item.detail}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    ) : (
      <div className="geo-flyout-placeholder">
        Click &ldquo;Analyze &amp; Optimize&rdquo; to generate a plan
      </div>
    )}

    </div>
  );
}
