/* Notification categories -- single source of truth for the per-subscriber
   email preference system. Shared by the account dashboard, the token-based
   /preferences page, the campaign editor (category selector), and the campaign
   sender (delivery gating). Keep this list in sync with the boolean columns on
   public.audience (migration 20260531120000) -- a category's `column` is the
   audience column that gates it.

   Model: the 6 optional categories default ON (opt-out). "general" is REQUIRED
   and has no column -- it reaches every active subscriber and can only be turned
   off via the master unsubscribe (subscriber_status). */

export type NotificationCategoryKey =
  | "new_releases"
  | "archive_highlights"
  | "curated"
  | "observations"
  | "merch"
  | "live_shows"
  | "general";

export interface NotificationCategory {
  key: NotificationCategoryKey;
  /** audience boolean column that gates this category, or null for the
      always-on required "general" category. */
  column: string | null;
  label: string;
  description: string;
  /** true = cannot be individually opted out (only the master unsubscribe
      turns it off). */
  required: boolean;
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  {
    key: "new_releases",
    column: "notify_new_releases",
    label: "New releases & premieres",
    description: "Be first to hear new songs, premieres, and fresh drops.",
    required: false,
  },
  {
    key: "archive_highlights",
    column: "notify_archive_highlights",
    label: "Archive & highlights",
    description: "Older work resurfaced and best-of roundups.",
    required: false,
  },
  {
    key: "curated",
    column: "notify_curated",
    label: "Curated content",
    description: "Playlists, recommendations, and things I'm into.",
    required: false,
  },
  {
    key: "observations",
    column: "notify_observations",
    label: "Observations",
    description: "New observation essays and writing.",
    required: false,
  },
  {
    key: "merch",
    column: "notify_merch",
    label: "Merch",
    description: "New merch and restocks.",
    required: false,
  },
  {
    key: "live_shows",
    column: "notify_live_shows",
    label: "Live shows & events",
    description: "Show announcements, tickets, and IRL events.",
    required: false,
  },
  {
    key: "general",
    column: null,
    label: "General & deals",
    description:
      "News, specials, deals, and sales. Always on while you're subscribed.",
    required: true,
  },
];

/** The 6 individually toggleable categories (everything except "general"). */
export const OPTIONAL_CATEGORIES: NotificationCategory[] =
  NOTIFICATION_CATEGORIES.filter((c) => !c.required);

const BY_KEY: Record<string, NotificationCategory> = Object.fromEntries(
  NOTIFICATION_CATEGORIES.map((c) => [c.key, c]),
);

/** True for any key the campaign editor / sender accepts (incl. "general"). */
export function isValidCategory(key: string): key is NotificationCategoryKey {
  return key in BY_KEY;
}

/** The audience column that gates a category, or null if it has none
    (unknown key or the always-on "general"). */
export function categoryColumn(key: string): string | null {
  return BY_KEY[key]?.column ?? null;
}

/** Default prefs map (all optional categories ON) for hydrating UI before a
    row is loaded. */
export function defaultPrefs(): Record<string, boolean> {
  return Object.fromEntries(OPTIONAL_CATEGORIES.map((c) => [c.key, true]));
}
