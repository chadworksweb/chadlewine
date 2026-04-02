"use client";

import { useState, useCallback } from "react";

type Tier = "art" | "line" | "fusion";

interface ObservationOption {
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

export function ProductConfigurator() {
  const [step, setStep] = useState<Step>("tier");
  const [tier, setTier] = useState<Tier | null>(null);
  const [observations, setObservations] = useState<ObservationOption[]>([]);
  const [selectedObservation, setSelectedObservation] = useState<ObservationOption | null>(null);
  const [selectedLine, setSelectedLine] = useState<string>("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState("");

  const product = CURATED_PRODUCTS[0];

  const fetchObservations = useCallback(async () => {
    const res = await fetch("/api/configurator/observations");
    if (res.ok) setObservations(await res.json());
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
    fetchObservations();
  }

  function handleObservationSelect(obs: ObservationOption) {
    setSelectedObservation(obs);
    if (tier === "art") {
      if (!obs.art_image_path) {
        setError("This observation has no cover art.");
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

  async function handleCheckout() {
    if (!selectedObservation || !selectedVariant || !tier) return;
    setCheckoutLoading(true);
    setError("");

    const config = {
      tier,
      observation_id: selectedObservation.id,
      observation_title: selectedObservation.title,
      art_image_path: tier !== "line" ? selectedObservation.art_image_path : null,
      selected_line: tier !== "art" ? selectedLine : null,
      blueprint_id: product.blueprint_id,
      blueprint_title: product.title,
      provider_id: product.provider_id,
      variant_id: selectedVariant.id,
      variant_title: selectedVariant.title,
    };

    const res = await fetch("/api/merch-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_config: config, price: product.price }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } else {
      const data = await res.json();
      setError(data.error || "Checkout failed");
    }
    setCheckoutLoading(false);
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
    if (step === "source") { setStep("tier"); setTier(null); setSelectedObservation(null); return; }
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
              <span className="configurator__tier-desc">Cover art from an Observation — visual only</span>
            </button>
            <button className="configurator__tier-card" onClick={() => handleTierSelect("line")}>
              <span className="configurator__tier-label">The Line</span>
              <span className="configurator__tier-desc">A sentence from an Observation — text only</span>
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

          {!selectedObservation ? (
            <div className="configurator__source-list">
              {observations.length === 0 && (
                <p className="configurator__empty">No observations with merch content available.</p>
              )}
              {observations.map((obs) => (
                <button
                  key={obs.id}
                  className="configurator__source-card"
                  onClick={() => handleObservationSelect(obs)}
                >
                  {obs.art_image_path && (tier === "art" || tier === "fusion") && (
                    <img src={obs.art_image_path} alt={obs.title} className="configurator__source-thumb" />
                  )}
                  <span className="configurator__source-title">{obs.title}</span>
                </button>
              ))}
            </div>
          ) : (
            (tier === "line" || tier === "fusion") && (
              <div className="configurator__line-list">
                <p className="configurator__subtext">
                  From: <strong>{selectedObservation.title}</strong>
                </p>
                {selectedObservation.hook_line && (
                  <button
                    className={`configurator__line-card${selectedLine === selectedObservation.hook_line ? " configurator__line-card--selected" : ""}`}
                    onClick={() => handleLineSelect(selectedObservation.hook_line!)}
                  >
                    <span className="configurator__line-tag">Hook</span>
                    {selectedObservation.hook_line}
                  </button>
                )}
                {selectedObservation.merch_lines?.map((line, i) => (
                  <button
                    key={i}
                    className={`configurator__line-card${selectedLine === line ? " configurator__line-card--selected" : ""}`}
                    onClick={() => handleLineSelect(line)}
                  >
                    {line}
                  </button>
                ))}
                {!selectedObservation.hook_line &&
                  (!selectedObservation.merch_lines || selectedObservation.merch_lines.length === 0) && (
                    <p className="configurator__empty">
                      No lines available for this observation.
                      <button className="configurator__back-link" onClick={() => setSelectedObservation(null)}>
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
              <span className="configurator__review-value">{selectedObservation?.title}</span>
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
            <div className="configurator__review-row">
              <span className="configurator__review-label">Price</span>
              <span className="configurator__review-value" style={{ color: "var(--text-accent)", fontWeight: 600 }}>
                ${product.price.toFixed(2)}
              </span>
            </div>
          </div>

          <button
            className="configurator__checkout-btn"
            onClick={handleCheckout}
            disabled={checkoutLoading}
          >
            {checkoutLoading ? "Redirecting to checkout..." : "Proceed to Checkout"}
          </button>
        </div>
      )}
    </div>
  );
}
