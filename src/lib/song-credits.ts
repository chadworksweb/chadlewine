// Credit roles for the song detail "Credits" section. Stored as a stable
// slug in song_credits.role; rendered via CREDIT_ROLE_LABEL. Add new roles by
// appending here -- existing rows keep their stored slug.

export const CREDIT_ROLES = [
  "producer",
  "beat-producer",
  "lyricist",
  "vocalist",
  "supporting-vocalist",
  "composer",
  "vocal-producer",
  "mastering-engineer",
  "mix-engineer",
  "cover-art",
] as const;

export type CreditRole = (typeof CREDIT_ROLES)[number];

export const CREDIT_ROLE_LABEL: Record<CreditRole, string> = {
  producer: "Producer",
  "beat-producer": "Beat Producer",
  lyricist: "Lyricist",
  vocalist: "Vocalist",
  "supporting-vocalist": "Supporting Vocalist",
  composer: "Composer",
  "vocal-producer": "Vocal Producer",
  "mastering-engineer": "Mastering Engineer",
  "mix-engineer": "Mix Engineer",
  "cover-art": "Cover Art",
};

export function isCreditRole(value: unknown): value is CreditRole {
  return typeof value === "string" && (CREDIT_ROLES as readonly string[]).includes(value);
}

// Fall back to a title-cased slug for any legacy/unknown role value so the UI
// never renders a raw slug.
export function creditRoleLabel(role: string): string {
  if (isCreditRole(role)) return CREDIT_ROLE_LABEL[role];
  return role.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
