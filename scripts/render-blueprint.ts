/** Sovereignty Blueprint renderer: filled markdown -> styled, print-ready PDF.
 *
 *   npx tsx scripts/render-blueprint.ts "<path-to-filled.md>" [--html]
 *
 * Reads the frontmatter (client, session_date, minutes, locus, launch), computes
 * the billing from src/lib/audit-rate.ts -- the SAME module the checkout and the
 * settle route use, so a blueprint can never quote a number the client was not
 * actually charged -- renders the body, and prints to PDF via headless Chrome.
 *
 * No puppeteer: Chrome is already installed, and `--headless --print-to-pdf` is
 * the whole dependency. Pass --html to keep the intermediate file for styling.
 */

import { readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import matter from "gray-matter";
import { remark } from "remark";
import remarkHtml from "remark-html";
// GFM is not optional here: the untangle role map is a pipe table, and plain
// remark renders it as literal "| text |" lines. That table is the core of the
// blueprint.
import remarkGfm from "remark-gfm";
import {
  AUDIT_HOLD_MINUTES,
  auditBalanceCents,
  auditHoldCents,
  auditTotalCents,
  formatAuditCents,
} from "../src/lib/audit-rate";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];

interface Front {
  client?: string;
  session_date?: string;
  minutes?: number;
  /** Who they were walking IN -- the silo + a short read of the person.
     Distinct from `locus`, which is the read that came OUT. */
  avatar?: string;
  locus?: string;
  launch?: boolean;
}

function findChrome(): string {
  for (const c of CHROME_CANDIDATES) {
    if (c && existsSync(c)) return c;
  }
  throw new Error(
    "Chrome not found. Checked:\n  " + CHROME_CANDIDATES.join("\n  ")
  );
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** The billing line. Computed, never typed -- this is the whole reason the
   renderer imports audit-rate instead of taking dollar figures as input. */
function billingLine(minutes: number, launch: boolean): string {
  const total = auditTotalCents(minutes, launch);
  const hold = auditHoldCents(launch);
  const balance = auditBalanceCents(minutes, launch);
  const rate = launch ? "the launch rate" : "the standard rate";

  if (balance === 0) {
    return `${minutes} min at ${rate}. Inside the ${AUDIT_HOLD_MINUTES} minutes you held with (${formatAuditCents(hold)}). Nothing further charged.`;
  }
  return `${minutes} min at ${rate}. ${formatAuditCents(total)} total, less the ${formatAuditCents(hold)} you held with. Balance charged: ${formatAuditCents(balance)}.`;
}

const PRINT_CSS = `
  @page { size: Letter; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    font-size: 10.5pt;
    line-height: 1.65;
    color: #16161c;
  }
  .doc { max-width: 100%; }

  .mock-banner {
    border: 1.5pt solid #b3261e;
    background: #fdf0ef;
    color: #b3261e;
    padding: 8pt 10pt;
    margin-bottom: 16pt;
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .cover { border-bottom: 2pt solid #16161c; padding-bottom: 12pt; margin-bottom: 18pt; }
  .cover__eyebrow {
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    font-size: 7.5pt; font-weight: 700; letter-spacing: 0.18em;
    text-transform: uppercase; color: #6a6a78; margin: 0 0 6pt;
  }
  .cover__title { font-size: 26pt; line-height: 1.05; letter-spacing: -0.02em; margin: 0 0 12pt; }
  .meta { width: 100%; border-collapse: collapse; font-family: -apple-system, "Segoe UI", system-ui, sans-serif; font-size: 8.5pt; }
  .meta td { padding: 2.5pt 0; vertical-align: top; }
  .meta td:first-child {
    width: 21%; color: #6a6a78; text-transform: uppercase;
    letter-spacing: 0.08em; font-size: 7.5pt; font-weight: 700;
  }

  h1 {
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    font-size: 11pt; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;
    margin: 22pt 0 10pt; padding-bottom: 5pt; border-bottom: 1.5pt solid #16161c;
    break-after: avoid; break-before: page;
  }
  h1:first-of-type { break-before: auto; }
  h2 {
    font-size: 13pt; letter-spacing: -0.01em; margin: 16pt 0 6pt;
    break-after: avoid;
  }
  h3 { font-size: 11pt; margin: 12pt 0 4pt; break-after: avoid; }
  p { margin: 0 0 8pt; orphans: 3; widows: 3; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  hr { border: 0; border-top: 1pt solid #dcdce4; margin: 16pt 0; }

  /* The click line. The single most important object in the document. */
  blockquote {
    margin: 10pt 0;
    padding: 10pt 14pt;
    border-left: 3pt solid #3a4ed0;
    background: #f4f5fd;
    font-size: 13pt;
    line-height: 1.4;
    break-inside: avoid;
  }
  blockquote p { margin: 0; }
  blockquote strong { font-weight: 700; }

  table:not(.meta) {
    width: 100%; border-collapse: collapse; margin: 10pt 0;
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    font-size: 8.5pt; break-inside: avoid;
  }
  table:not(.meta) th, table:not(.meta) td {
    border: 0.75pt solid #c8c8d4; padding: 5pt 7pt; text-align: left; vertical-align: top;
  }
  table:not(.meta) thead th {
    background: #ececf4; font-size: 7.5pt; text-transform: uppercase;
    letter-spacing: 0.06em; font-weight: 700;
  }

  ul, ol { margin: 0 0 8pt; padding-left: 15pt; }
  li { margin-bottom: 5pt; }

  .footer {
    margin-top: 22pt; padding-top: 10pt; border-top: 1pt solid #dcdce4;
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    font-size: 7.5pt; line-height: 1.5; color: #55555f;
    break-inside: avoid;
  }
  .footer strong { color: #16161c; }
`;

const DISCLAIMER = `
  <p><em>This document is yours. I keep a copy for my own records and it goes nowhere else.</em></p>
  <p>A Sovereignty Audit is a philosophical and personal inquiry dialogue. Chad Lewine is an
  independent advisor and artist, not a licensed mental health counselor, clinical psychologist,
  psychiatrist, physician, or medical therapist. He holds no clinical license and provides no
  clinical service. Nothing in this document is medical, psychological, psychiatric, legal, or
  financial advice, and nothing in it is a reason to start, stop, or change any treatment or
  medication you are receiving.</p>
  <p><strong>The &ldquo;sonic prescription&rdquo; is music.</strong> The quotation marks are
  there because the word is a joke at the expense of an industry that has a pill for every
  human problem. It is a list of songs and the reasons they are on it. It is not a medical
  prescription, it prescribes nothing, it treats nothing, it cures nothing, and it is not a
  substitute for care from somebody licensed to give it.</p>
  <p><strong>If you are thinking about suicide or self-harm, or you are worried about your own
  safety or someone else's, call or text 988 to reach the Suicide &amp; Crisis Lifeline (US, 24
  hours). If anyone is in immediate danger, call 911 or go to your nearest emergency room.</strong></p>
`;

async function main() {
  const args = process.argv.slice(2);
  const keepHtml = args.includes("--html");
  const input = args.find((a) => !a.startsWith("--"));

  if (!input) {
    console.error(
      'Usage: npx tsx scripts/render-blueprint.ts "<path-to-filled.md>" [--html]'
    );
    process.exit(1);
  }

  const inPath = resolve(input);
  if (!existsSync(inPath)) throw new Error(`Not found: ${inPath}`);

  const raw = readFileSync(inPath, "utf8");
  const { data, content } = matter(raw);
  const front = data as Front;

  const client = front.client ?? "[client]";
  const minutes = Number(front.minutes ?? 0);
  const launch = front.launch !== false;
  const isMock = /mock/i.test(basename(inPath)) || /THIS IS A MOCK/i.test(content);

  if (!minutes) {
    console.warn("! frontmatter has no `minutes` -- billing line will be omitted.");
  }

  // Strip the mock-warning blockquote from the body; it becomes a real banner.
  const body = content.replace(/^>\s*\*\*THIS IS A MOCK\.\*\*[\s\S]*?(?=\n---)/m, "").trim();

  const rendered = String(
    await remark().use(remarkGfm).use(remarkHtml, { sanitize: false }).process(body)
  );

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Sovereignty Blueprint - ${client}</title>
<style>${PRINT_CSS}</style></head>
<body><div class="doc">
${isMock ? '<div class="mock-banner">Mock example. Fictional composite, not a real client or a real session.</div>' : ""}
<header class="cover">
  <p class="cover__eyebrow">Chad Lewine &middot; Sovereignty Audit</p>
  <h1 class="cover__title" style="border:0;padding:0;margin:0 0 12pt;text-transform:none;letter-spacing:-0.02em;font-family:inherit;font-size:26pt;">The Sovereignty Blueprint</h1>
  <table class="meta"><tbody>
    <tr><td>Prepared for</td><td>${client}</td></tr>
    ${front.session_date ? `<tr><td>Session</td><td>${fmtDate(front.session_date)}</td></tr>` : ""}
    ${minutes ? `<tr><td>Length</td><td>${minutes} minutes (you ended it)</td></tr>` : ""}
    ${front.avatar ? `<tr><td>Avatar</td><td>${front.avatar}</td></tr>` : ""}
    ${front.locus ? `<tr><td>Primary locus</td><td>${front.locus}</td></tr>` : ""}
    ${minutes ? `<tr><td>Billing</td><td>${billingLine(minutes, launch)}</td></tr>` : ""}
  </tbody></table>
</header>
${rendered}
<div class="footer">${DISCLAIMER}</div>
</div></body></html>`;

  const outPdf = inPath.replace(/\.md$/i, ".pdf");
  const tmp = mkdtempSync(join(tmpdir(), "blueprint-"));
  const htmlPath = keepHtml ? inPath.replace(/\.md$/i, ".html") : join(tmp, "blueprint.html");
  writeFileSync(htmlPath, html, "utf8");

  execFileSync(
    findChrome(),
    [
      "--headless",
      "--disable-gpu",
      "--no-pdf-header-footer",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=4000",
      `--print-to-pdf=${outPdf}`,
      `file:///${htmlPath.replace(/\\/g, "/")}`,
    ],
    { stdio: "pipe" }
  );

  if (!existsSync(outPdf)) throw new Error("Chrome produced no PDF.");
  const kb = Math.round(readFileSync(outPdf).length / 1024);
  console.log(`PDF  -> ${outPdf}  (${kb} KB)`);
  if (keepHtml) console.log(`HTML -> ${htmlPath}`);
  if (minutes) console.log(`Billing: ${billingLine(minutes, launch)}`);
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
