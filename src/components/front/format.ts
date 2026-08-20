// Date and duration formatting for the door.
//
// NO Intl, NO toLocaleDateString. Everything here is server-rendered and then
// hydrated, and ICU picks the literal characters between its fields: en-US joins
// a date to a time as either ", " or " at ", and separates the clock from AM/PM
// with either a space or U+202F. Node and a visitor's browser can be on
// different ICU versions, disagree on bytes nobody can see, and take down the
// whole tree with hydration error #418. That is not a hypothetical here; it
// happened on this site's homepage on 2026-07-29 and cost a day.
//
// A date column is "YYYY-MM-DD" and a lookup table has no opinions, so this
// produces the same bytes on every engine that will ever run it.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-08-14" or an ISO timestamp -> "August 14, 2026". Null when unparseable. */
export function frontDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = m[1];
  const month = MONTHS[parseInt(m[2], 10) - 1];
  // parseInt drops the leading zero, which is what a written date wants.
  const day = parseInt(m[3], 10);
  if (!month || !day) return null;
  return `${month} ${day}, ${year}`;
}

/** Seconds -> "4:07". Null when there is no duration to show. */
export function frontDuration(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}
