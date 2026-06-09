// Shared Product/Offer JSON-LD fragments for merch and art listings.
// Keeps the structured-data fields Google's Merchant listings report wants
// (description + hasMerchantReturnPolicy) consistent across product types.

// Countries we ship to, per Terms of Service section 5.
const SHIP_COUNTRIES = ["US", "CA", "GB", "AU", "NZ", "IE"];

// Returns are not accepted for change of mind -- "All sales are final" (ToS
// section 8). Damaged/incorrect goods are handled as replacements via email,
// which is a warranty remedy, not a consumer return, so the schema category is
// MerchantReturnNotPermitted. This is the truthful mapping and satisfies the
// recommended hasMerchantReturnPolicy field.
export const MERCHANT_RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: SHIP_COUNTRIES,
  returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
} as const;

// Google recommends priceValidUntil on Offer; without it some price snippets
// are dropped. Prices here are stable, so roll the date one year forward from
// render time. Returns YYYY-MM-DD.
export function priceValidUntil(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

// Google flags Product entries with no description. Use the real description
// when present; otherwise fall back to a truthful, non-empty sentence so the
// recommended field is always populated.
export function productDescription(
  description: string | null | undefined,
  fallback: string,
): string {
  const d = (description || "").trim();
  return d.length > 0 ? d : fallback;
}
