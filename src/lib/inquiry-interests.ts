// The services/situations offered on /songwriting. The inquiry form uses these
// to let a visitor say what they are reaching out about; the API validates the
// submitted value against this list. Keep `value` stable (it is stored); edit
// `label` freely.
export const INQUIRY_INTERESTS = [
  { value: "inspirational-cut", label: "The Inspirational Cut (for a label or established artist)" },
  { value: "sing-my-songs", label: "Sing My Songs" },
  { value: "vision-completion", label: "Vision Completion" },
  { value: "realtime-songwriting", label: "Realtime Human Songwriting" },
  { value: "realtime-plus-demo", label: "Realtime Human Songwriting + demo production" },
  { value: "not-sure", label: "Something else / not sure yet" },
] as const;

export type InquiryInterest = (typeof INQUIRY_INTERESTS)[number]["value"];

const VALUES = new Set(INQUIRY_INTERESTS.map((i) => i.value));

export function isInquiryInterest(v: string): v is InquiryInterest {
  return VALUES.has(v as InquiryInterest);
}

export function inquiryInterestLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return INQUIRY_INTERESTS.find((i) => i.value === v)?.label ?? v;
}
