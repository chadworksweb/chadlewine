// Detects email security scanners / link-protection gateways and non-browser
// fetchers by user-agent. These "click" every link the instant an email is
// delivered (scanning for malware), which inflates open/click analytics and
// engagement scores. Used to exclude their events from metrics and engagement
// bumps. It does NOT block delivery: the recipient is a real person sitting
// behind a scanning mail gateway.
//
// NOTE: "Amazon CloudFront" is deliberately NOT in this list. Resend routes
// every tracked click through CloudFront, so that UA appears on REAL human
// clicks too -- filtering it here zeroed out all legitimate clicks. Scanner
// pre-fetch storms are instead caught behaviorally (burst of clicks to one
// recipient within ~2s) in src/lib/click-analytics.ts, where timing -- not the
// UA -- is the signal.
//
// Conservative on purpose -- only clearly non-human fetchers match. A null or
// empty UA is NOT treated as a bot (some legitimate clients omit it), to avoid
// silently dropping real engagement.

const BOT_UA_PATTERNS: RegExp[] = [
  /proofpoint|urldefense/i,            // Proofpoint URL Defense
  /mimecast/i,
  /barracuda/i,
  /forcepoint|websense/i,
  /symantec|messagelabs/i,
  /ironport|cisco/i,
  /safe-?links|safebrowsing/i,         // Microsoft Defender Safe Links
  /bingpreview|skypeuripreview/i,
  /\bbot\b|crawler|spider|slurp|scanner|crawl\b/i,
  /curl|wget|python-requests|python-urllib|go-http-client|okhttp|java\/|libwww|httpclient|guzzle|node-fetch|axios|\bgot\b/i,
  /headlesschrome|phantomjs|puppeteer|playwright/i,
  /facebookexternalhit|slackbot|telegrambot|whatsapp|twitterbot|discordbot|linkedinbot/i,
];

/** True when the user-agent looks like an automated scanner/fetcher rather
    than a human's mail client or browser. */
export function isLikelyBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return BOT_UA_PATTERNS.some((re) => re.test(ua));
}
