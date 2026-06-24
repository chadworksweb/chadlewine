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

// Datacenter / cloud IPv4 ranges. Mail-security gateways (Microsoft 365
// Defender / ATP Safe Links is by far the largest) pre-fetch every link in a
// message from cloud IPs the instant it is delivered. A click from a
// datacenter IP is a scanner; a real reader is on a home/mobile ISP. This is
// the same signal Mailchimp/SendGrid lean on, and we CAN use it here even
// though Resend hides the user-agent behind "Amazon CloudFront", because the
// click webhook still carries the originating IP.
//
// Curated and high-confidence on purpose -- only well-established cloud
// aggregates, never residential/mobile ISP space, so we never flag a real
// reader. It does NOT need to be exhaustive: scanners on ISP-looking IPs are
// caught behaviorally (per-recipient burst) in click-analytics.ts. Extend this
// list as new datacenter sources show up in campaign_events.ip_address.
//
// Each entry is [first-octet-prefixed base, prefix length]. IPv6 is treated as
// non-datacenter (real readers here are on IPv6 home/mobile ISPs).
const DATACENTER_CIDRS: Array<[string, number]> = [
  // Microsoft Azure (covers the observed 135.232.x and 172.186.x scanners)
  ["135.224.0.0", 12],
  ["172.160.0.0", 11],
  ["13.64.0.0", 11],
  ["20.33.0.0", 16],
  ["40.64.0.0", 10],
  ["104.40.0.0", 13],
  ["168.61.0.0", 16],
  ["191.232.0.0", 13],
  // Amazon AWS
  ["3.0.0.0", 9],
  ["18.32.0.0", 11],
  ["52.0.0.0", 10],
  ["54.224.0.0", 11],
  // Google Cloud
  ["34.0.0.0", 9],
  ["35.184.0.0", 13],
  ["35.192.0.0", 12],
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = n * 256 + o;
  }
  return n >>> 0;
}

/** True when the click IP belongs to a known cloud/datacenter range, i.e. a
    mail-security scanner pre-fetching links rather than a person on an ISP. */
export function isLikelyDatacenterIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const addr = ipv4ToInt(ip.trim());
  if (addr === null) return false; // IPv6 / malformed -> not flagged here
  for (const [base, bits] of DATACENTER_CIDRS) {
    const baseInt = ipv4ToInt(base);
    if (baseInt === null) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((addr & mask) === (baseInt & mask)) return true;
  }
  return false;
}
