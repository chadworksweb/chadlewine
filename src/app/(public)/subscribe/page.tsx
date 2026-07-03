import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscribe",
  description: "Subscribe to email updates from Chad Lewine and find out where I'm headed.",
  alternates: { canonical: "https://chadlewine.com/subscribe" },
};

// Intentionally empty body: the public layout already renders the subscribe
// form (SubscribeSection) directly below <main>, so this page lets the nav sit
// straight above that form with no duplicate content.
export default function SubscribePage() {
  return null;
}
