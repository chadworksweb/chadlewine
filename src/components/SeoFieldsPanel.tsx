"use client";

/**
 * SeoFieldsPanel -- the basic, Yoast-style "Search Appearance" block used on
 * every entity editor (songs, releases, merch, foundations, videos). It is the
 * lightweight counterpart to GeoPanel: just an SEO title + meta description
 * override with live counters and a Google preview. The two values feed each
 * page's generateMetadata (title/description + OG/Twitter) and, where relevant,
 * the entity's JSON-LD description -- both fall back to the entity's real title
 * and summary when these are blank, so an empty override is always safe.
 */

const TITLE_LIMIT = 60;
const DESC_LIMIT = 160;

export interface SeoFieldsPanelProps {
  seoTitle: string;
  seoDescription: string;
  /** Title used (and shown in the preview) when seoTitle is blank. */
  defaultTitle: string;
  /** Description used in the preview when seoDescription is blank. */
  defaultDescription?: string;
  /** Italic helper under the description, e.g. "song summary, then a generated line". */
  descriptionFallbackHint?: string;
  /** Breadcrumb tail for the preview, e.g. "music > songs". Host is prepended. */
  urlBreadcrumb: string;
  onChange: (field: "seo_title" | "seo_description", value: string) => void;
}

function counterClass(len: number, limit: number): string {
  if (len === 0) return "seo-fields__counter--empty";
  if (len > limit) return "seo-fields__counter--over";
  return "seo-fields__counter--ok";
}

function barColor(len: number, limit: number): string {
  if (len === 0) return "var(--bad, #ef4444)";
  if (len > limit) return "var(--warn, #eab308)";
  return "var(--good, #22c55e)";
}

export function SeoFieldsPanel({
  seoTitle,
  seoDescription,
  defaultTitle,
  defaultDescription = "",
  descriptionFallbackHint,
  urlBreadcrumb,
  onChange,
}: SeoFieldsPanelProps) {
  const effectiveTitle = seoTitle.trim() || defaultTitle;
  const effectiveDesc = seoDescription.trim() || defaultDescription;

  return (
    <div className="obsv-editor__panel seo-fields">
      <h3 className="obsv-editor__panel-title">
        <span>Search Appearance</span>
        <span className="seo-fields__tag">SEO</span>
      </h3>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label" htmlFor="seo_title">
          <span>SEO Title</span>
          <span className={`obsv-editor__counter ${counterClass(seoTitle.length, TITLE_LIMIT)}`}>
            {seoTitle.length} / {TITLE_LIMIT}
          </span>
        </label>
        <input
          id="seo_title"
          className="obsv-editor__input"
          type="text"
          value={seoTitle}
          maxLength={90}
          onChange={(e) => onChange("seo_title", e.target.value)}
          placeholder={defaultTitle}
        />
        <div className="seo-fields__bar">
          <i
            style={{
              width: `${Math.min(100, (seoTitle.length / TITLE_LIMIT) * 100)}%`,
              background: barColor(seoTitle.length, TITLE_LIMIT),
            }}
          />
        </div>
        <span className="seo-fields__hint">
          {seoTitle.trim()
            ? seoTitle.length > TITLE_LIMIT
              ? "Over 60 -- Google will truncate"
              : " "
            : `Blank -> "${defaultTitle}"`}
        </span>
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label" htmlFor="seo_description">
          <span>Meta Description</span>
          <span className={`obsv-editor__counter ${counterClass(seoDescription.length, DESC_LIMIT)}`}>
            {seoDescription.length} / {DESC_LIMIT}
          </span>
        </label>
        <textarea
          id="seo_description"
          className="obsv-editor__textarea obsv-editor__textarea--short"
          value={seoDescription}
          maxLength={240}
          rows={3}
          onChange={(e) => onChange("seo_description", e.target.value)}
          placeholder={defaultDescription || "Override the default..."}
        />
        <div className="seo-fields__bar">
          <i
            style={{
              width: `${Math.min(100, (seoDescription.length / DESC_LIMIT) * 100)}%`,
              background: barColor(seoDescription.length, DESC_LIMIT),
            }}
          />
        </div>
        <span className="seo-fields__hint">
          {seoDescription.trim()
            ? seoDescription.length > DESC_LIMIT
              ? "Over 160 -- Google will truncate"
              : " "
            : descriptionFallbackHint
              ? `Blank -> ${descriptionFallbackHint}`
              : "Blank -> the entity's default description"}
        </span>
      </div>

      <div className="seo-fields__preview">
        <p className="seo-fields__preview-cap">Google preview</p>
        <div className="seo-serp">
          <div className="seo-serp__crumb">
            <span className="seo-serp__fav" />
            <div>
              <div className="seo-serp__site">Chad Lewine</div>
              <div className="seo-serp__url">
                https://chadlewine.com {"›"} {urlBreadcrumb}
              </div>
            </div>
          </div>
          <div className="seo-serp__title">{effectiveTitle || "Untitled"}</div>
          <div className="seo-serp__desc">
            {effectiveDesc || "No description set yet -- a fallback line will be used."}
          </div>
        </div>
      </div>
    </div>
  );
}
