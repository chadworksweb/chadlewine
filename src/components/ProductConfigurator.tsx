"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/components/Cart";

type Tier = "art" | "line" | "fusion";
type SourceType = "obs" | "song";

interface SourceOption {
  id: string;
  title: string;
  slug: string;
  art_image_path: string | null;
  hook_line: string | null;
  merch_lines: string[] | null;
}

interface Variant {
  id: number;
  title: string;
  options: Record<string, string>;
  placeholders: { position: string; height: number; width: number }[];
}

// Curated product catalog — approved base products only
// Prices set per product. Printify base cost ~$11-13; retail includes margin.
const CURATED_PRODUCTS = [
  {
    blueprint_id: 706,
    provider_id: 99,
    title: "Comfort Colors 1717",
    subtitle: "Unisex Garment-Dyed Tee",
    allowedColors: ["White", "Graphite"],
    price: 34.99,
  },
] as const;

type Step = "tier" | "source" | "variant" | "review";

const SOURCE_ENDPOINT: Record<SourceType, string> = {
  obs: "/api/configurator/observations",
  song: "/api/configurator/songs",
};

const SOURCE_LABEL: Record<SourceType, string> = {
  obs: "Observation",
  song: "Song",
};

export function ProductConfigurator() {
  const [step, setStep] = useState<Step>("tier");
  const [tier, setTier] = useState<Tier | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>("obs");
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceOption | null>(null);
  const [selectedLine, setSelectedLine] = useState<string>("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cart = useCart();

  const product = CURATED_PRODUCTS[0];
  const searchParams = useSearchParams();

  const fetchSources = useCallback(async (type: SourceType) => {
    const res = await fetch(SOURCE_ENDPOINT[type]);
    if (res.ok) {
      const data: SourceOption[] = await res.json();
      setSources(data);
      return data;
    }
    setSources([]);
    return [];
  }, []);

  // Pre-fill from URL params (from The Pick links).
  // Accepts ?tier=...&source=obs|song&obs=<uuid>|song=<uuid>&line=<text>.
  // If `source` is omitted, infer from which id param is present.
  useEffect(() => {
    const urlTier = searchParams.get("tier") as Tier | null;
    const urlLine = searchParams.get("line");
    const urlObs = searchParams.get("obs");
    const urlSong = searchParams.get("song");
    const urlSource = searchParams.get("source") as SourceType | null;

    if (!urlTier || !["art", "line", "fusion"].includes(urlTier)) return;

    const inferredType: SourceType =
      urlSource === "song" || urlSource === "obs"
        ? urlSource
        : urlSong
          ? "song"
          : "obs";
    const targetId = inferredType === "song" ? urlSong : urlObs;

    setTier(urlTier);
    setSourceType(inferredType);

    (async () => {
      const list = await fetchSources(inferredType);

      if (targetId) {
        const match = list.find((o) => o.id === targetId);
        if (match) {
          setSelectedSource(match);

          if (urlTier === "art" && match.art_image_path) {
            setStep("variant");
            fetchVariants();
          } else if (urlLine && (urlTier === "line" || urlTier === "fusion")) {
            setSelectedLine(decodeURIComponent(urlLine));
            setStep("variant");
            fetchVariants();
          } else {
            setStep("source");
          }
        } else {
          setStep("source");
        }
      } else {
        setStep("source");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchVariants() {
    setLoading(true);
    const res = await fetch(
      `/api/configurator/variants?blueprint_id=${product.blueprint_id}&provider_id=${product.provider_id}`
    );
    if (res.ok) {
      const data = await res.json();
      const all: Variant[] = data.variants || [];
      // Filter to allowed colors only
      const filtered = all.filter((v) =>
        product.allowedColors.some((c) =>
          v.title.toLowerCase().startsWith(c.toLowerCase())
        ) && v.placeholders.length > 0
      );
      setVariants(filtered);
    }
    setLoading(false);
  }

  function handleTierSelect(t: Tier) {
    setTier(t);
    setStep("source");
    fetchSources(sourceType);
  }

  function handleSourceTypeChange(type: SourceType) {
    if (type === sourceType) return;
    setSourceType(type);
    setSelectedSource(null);
    setSelectedLine("");
    fetchSources(type);
  }

  function handleSourceSelect(src: SourceOption) {
    setSelectedSource(src);
    if (tier === "art") {
      if (!src.art_image_path) {
        setError(`This ${SOURCE_LABEL[sourceType].toLowerCase()} has no cover art.`);
        return;
      }
      setStep("variant");
      fetchVariants();
    }
  }

  function handleLineSelect(line: string) {
    setSelectedLine(line);
    setStep("variant");
    fetchVariants();
  }

  function handleVariantSelect(variant: Variant) {
    setSelectedVariant(variant);
    setStep("review");
  }

  // Compact product_config — only fields the server can't re-derive go in.
  // Titles/paths are looked up at webhook time from source_id and blueprint_id.
  function buildConfig() {
    if (!selectedSource || !selectedVariant || !tier) return null;
    return {
      tier,
      source_type: sourceType,
      source_id: selectedSource.id,
      selected_line: tier !== "art" ? selectedLine : null,
      blueprint_id: product.blueprint_id,
      variant_id: selectedVariant.id,
    } as Record<string, unknown>;
  }

  const currentConfig = buildConfig();
  const tierLabel = tier === "art" ? "The Art" : tier === "line" ? "The Line" : "The Fusion";
  const cartLineId = `cfg-${product.blueprint_id}`;
  const inCart = currentConfig
    ? cart.hasItem({ type: "merch", id: cartLineId, format: null, product_config: currentConfig })
    : false;

  function handleAddToCart() {
    if (!currentConfig || !selectedSource || inCart) return;
    setError("");
    cart.add({
      type: "merch",
      id: cartLineId,
      title: `${tierLabel} — ${product.title}`,
      slug: "",
      price: product.price,
      format: null,
      cover_art_path: tier !== "line" ? selectedSource.art_image_path : null,
      variant_label: tierLabel,
      product_config: currentConfig,
    });
  }

  function goBack() {
    setError("");
    if (step === "review") { setStep("variant"); setSelectedVariant(null); return; }
    if (step === "variant") {
      if (tier === "art") { setStep("source"); }
      else { setSelectedLine(""); setStep("source"); }
      setVariants([]);
      setSelectedColor("");
      return;
    }
    if (step === "source") { setStep("tier"); setTier(null); setSelectedSource(null); return; }
  }

  // Group variants by color
  const colorGroups: Record<string, Variant[]> = {};
  for (const v of variants) {
    const color = v.title.split(" / ")[0];
    if (!colorGroups[color]) colorGroups[color] = [];
    colorGroups[color].push(v);
  }
  const colors = Object.keys(colorGroups);

  const STEPS: Step[] = ["tier", "source", "variant", "review"];
  const sourceLabel = SOURCE_LABEL[sourceType].toLowerCase();

  return (
    <div className="configurator">
      <div className="configurator__progress">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`configurator__step-dot${
              step === s ? " configurator__step-dot--active" : ""
            }${STEPS.indexOf(step) > i ? " configurator__step-dot--done" : ""}`}
          />
        ))}
      </div>

      {step !== "tier" && (
        <button className="configurator__back" onClick={goBack}>
          &larr; Back
        </button>
      )}

      {error && <p className="configurator__error">{error}</p>}

      {/* Step 1: Tier */}
      {step === "tier" && (
        <div className="configurator__panel">
          <h2 className="configurator__heading">What kind of piece?</h2>
          <p className="configurator__subtext">Choose what goes on the {product.title}.</p>
          <div className="configurator__tier-grid">
            <button className="configurator__tier-card" onClick={() => handleTierSelect("art")}>
              <span className="configurator__tier-label">The Art</span>
              <span className="configurator__tier-desc">Cover art from an Observation or Song — visual only</span>
            </button>
            <button className="configurator__tier-card" onClick={() => handleTierSelect("line")}>
              <span className="configurator__tier-label">The Line</span>
              <span className="configurator__tier-desc">A sentence or lyric — text only</span>
            </button>
            <button className="configurator__tier-card" onClick={() => handleTierSelect("fusion")}>
              <span className="configurator__tier-label">The Fusion</span>
              <span className="configurator__tier-desc">Art + Line combined on one product</span>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Source */}
      {step === "source" && (
        <div className="configurator__panel">
          <h2 className="configurator__heading">
            {tier === "art" ? "Choose the art" : tier === "line" ? "Choose a line" : "Choose art + line"}
          </h2>

          {!selectedSource && (
            <div className="configurator__source-type" style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
              {(["obs", "song"] as SourceType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`configurator__tier-card${sourceType === t ? " configurator__tier-card--selected" : ""}`}
                  onClick={() => handleSourceTypeChange(t)}
                  style={{ padding: "var(--space-xs) var(--space-md)" }}
                >
                  <span className="configurator__tier-label">{SOURCE_LABEL[t]}s</span>
                </button>
              ))}
            </div>
          )}

          {!selectedSource ? (
            <div className="configurator__source-list">
              {sources.length === 0 && (
                <p className="configurator__empty">No {sourceLabel}s with merch content available.</p>
              )}
              {sources.map((src) => (
                <button
                  key={src.id}
                  className="configurator__source-card"
                  onClick={() => handleSourceSelect(src)}
                >
                  {src.art_image_path && (tier === "art" || tier === "fusion") && (
                    <img src={src.art_image_path} alt={src.title} className="configurator__source-thumb" />
                  )}
                  <span className="configurator__source-title">{src.title}</span>
                </button>
              ))}
            </div>
          ) : (
            (tier === "line" || tier === "fusion") && (
              <div className="configurator__line-list">
                <p className="configurator__subtext">
                  From: <strong>{selectedSource.title}</strong>
                </p>
                {selectedSource.hook_line && (
                  <button
                    className={`configurator__line-card${selectedLine === selectedSource.hook_line ? " configurator__line-card--selected" : ""}`}
                    onClick={() => handleLineSelect(selectedSource.hook_line!)}
                  >
                    <span className="configurator__line-tag">Hook</span>
                    {selectedSource.hook_line}
                  </button>
                )}
                {selectedSource.merch_lines?.map((line, i) => (
                  <button
                    key={i}
                    className={`configurator__line-card${selectedLine === line ? " configurator__line-card--selected" : ""}`}
                    onClick={() => handleLineSelect(line)}
                  >
                    {line}
                  </button>
                ))}
                {!selectedSource.hook_line &&
                  (!selectedSource.merch_lines || selectedSource.merch_lines.length === 0) && (
                    <p className="configurator__empty">
                      No lines available for this {sourceLabel}.
                      <button className="configurator__back-link" onClick={() => setSelectedSource(null)}>
                        Pick another
                      </button>
                    </p>
                  )}
              </div>
            )
          )}
        </div>
      )}

      {/* Step 3: Color + Size */}
      {step === "variant" && (
        <div className="configurator__panel">
          <h2 className="configurator__heading">{product.title}</h2>
          <p className="configurator__subtext">{product.subtitle}</p>

          {loading && <p className="configurator__loading">Loading options...</p>}

          {!loading && colors.length > 0 && (
            <>
              {/* Color picker */}
              <div className="configurator__color-picker">
                <p className="configurator__subtext" style={{ marginBottom: "var(--space-sm)" }}>
                  Color{selectedColor ? `: ${selectedColor}` : ""}
                </p>
                <div className="configurator__color-swatches">
                  {colors.map((color) => (
                    <button
                      key={color}
                      className={`configurator__color-swatch${selectedColor === color ? " configurator__color-swatch--selected" : ""}`}
                      onClick={() => { setSelectedColor(color); setSelectedVariant(null); }}
                      title={color}
                      data-color={color.toLowerCase()}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>

              {/* Size picker (shown after color selection) */}
              {selectedColor && colorGroups[selectedColor] && (
                <div className="configurator__size-picker">
                  <p className="configurator__subtext" style={{ marginBottom: "var(--space-sm)" }}>Size</p>
                  <div className="configurator__variant-list">
                    {colorGroups[selectedColor].map((v) => {
                      const size = v.title.split(" / ")[1] || v.title;
                      return (
                        <button
                          key={v.id}
                          className={`configurator__variant-card${selectedVariant?.id === v.id ? " configurator__variant-card--selected" : ""}`}
                          onClick={() => handleVariantSelect(v)}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 4: Review */}
      {step === "review" && (
        <div className="configurator__panel">
          <h2 className="configurator__heading">Review your piece</h2>
          <div className="configurator__review">
            <div className="configurator__review-row">
              <span className="configurator__review-label">Tier</span>
              <span className="configurator__review-value">
                {tier === "art" ? "The Art" : tier === "line" ? "The Line" : "The Fusion"}
              </span>
            </div>
            <div className="configurator__review-row">
              <span className="configurator__review-label">Source</span>
              <span className="configurator__review-value">
                {SOURCE_LABEL[sourceType]} &middot; {selectedSource?.title}
              </span>
            </div>
            {selectedLine && (
              <div className="configurator__review-row">
                <span className="configurator__review-label">Line</span>
                <span className="configurator__review-value configurator__review-value--line">
                  &ldquo;{selectedLine}&rdquo;
                </span>
              </div>
            )}
            <div className="configurator__review-row">
              <span className="configurator__review-label">Product</span>
              <span className="configurator__review-value">{product.title}</span>
            </div>
            <div className="configurator__review-row">
              <span className="configurator__review-label">Color / Size</span>
              <span className="configurator__review-value">{selectedVariant?.title}</span>
            </div>
          </div>

          <button
            className={`configurator__checkout-btn${inCart ? " configurator__checkout-btn--in-cart" : ""}`}
            onClick={handleAddToCart}
            disabled={inCart}
            aria-disabled={inCart}
          >
            {inCart ? "Already in Cart" : "Add to Cart"}
          </button>
        </div>
      )}
    </div>
  );
}
