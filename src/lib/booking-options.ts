// Shared option sets for the Super Individual Night booking inquiry. The form
// (BookingInquiryForm) renders these as choices; the /api/book route validates
// the submitted value against them. Keep `value` stable (it is stored); edit
// `label` freely.

export const ROOM_TYPES = [
  { value: "sound-bath", label: "Sound-bath / ecstatic-dance room" },
  { value: "yoga-studio", label: "Yoga / breathwork studio" },
  { value: "sanctuary", label: "Meditation center / sanctuary" },
  { value: "listening-room", label: "Listening room / house concert" },
  { value: "gallery", label: "Gallery" },
  { value: "retreat", label: "Retreat / intentional community" },
  { value: "other", label: "Something else" },
] as const;

export const EXCHANGES = [
  { value: "door-split", label: "Door split" },
  { value: "honorarium", label: "Honorarium / flat fee" },
  { value: "ticketed", label: "Ticketed event" },
  { value: "donation", label: "Donation-based" },
  { value: "not-sure", label: "Not sure yet -- let's talk" },
] as const;

// How sound gets handled. "onsite" = the room already has a PA; "rent" = the
// venue rents one (no cost to Chad); "split" = Chad and the venue split the PA
// rental, so Chad carries cost and the exchange step must protect break-even.
export const PA_PLANS = [
  { value: "onsite", label: "Yes -- we have a PA" },
  { value: "rent", label: "We'll rent a PA (preferred)" },
  { value: "split", label: "Split the PA rental with Chad" },
] as const;

export type RoomType = (typeof ROOM_TYPES)[number]["value"];
export type Exchange = (typeof EXCHANGES)[number]["value"];
export type PaPlan = (typeof PA_PLANS)[number]["value"];

// When Chad carries PA cost (split), the no-guarantee exchange models are
// removed so the night at least breaks even. Gating only for now; the real
// break-even math (PA cost + travel) gets wired in later.
export const PA_RESTRICTED_EXCHANGES = new Set<string>(["donation"]);

const ROOM_VALUES = new Set(ROOM_TYPES.map((r) => r.value));
const EXCHANGE_VALUES = new Set(EXCHANGES.map((e) => e.value));
const PA_PLAN_VALUES = new Set(PA_PLANS.map((p) => p.value));

export function isRoomType(v: string): v is RoomType {
  return ROOM_VALUES.has(v as RoomType);
}
export function isExchange(v: string): v is Exchange {
  return EXCHANGE_VALUES.has(v as Exchange);
}
export function roomTypeLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return ROOM_TYPES.find((r) => r.value === v)?.label ?? v;
}
export function exchangeLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return EXCHANGES.find((e) => e.value === v)?.label ?? v;
}
export function isPaPlan(v: string): v is PaPlan {
  return PA_PLAN_VALUES.has(v as PaPlan);
}
export function paPlanLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return PA_PLANS.find((p) => p.value === v)?.label ?? v;
}
