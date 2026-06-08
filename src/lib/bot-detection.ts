// Detects email security scanners / link-protection gateways and non-browser
// fetchers by user-agent. These "click" every link the instant an email is
// delivered (scanning for malware), which inflates open/click analytics and
// engagement scores -- e.g. a corporate gateway behind "Amazon CloudFront"
// firing 8 clicks in 0.7s with zero opens. Used to exclude their events from
// metrics and from engagement bumps. It does NOT block delivery: the recipient
// is a real person sitting behind a scanning mail gateway.
//
// Conservative on purpose -- only clearly non-human fetchers match. A null or
// empty UA is NOT treated as a bot (some legitimate clients omit it), to avoid
// silently dropping real engagement.

const BOT_UA_PATTERNS: RegExp[] = [
  /cloudfront/i,                       // Amazon CloudFront (mail-gateway scanners)
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
