// Block-based email rendering.
// Drives every email the platform sends. Templates live in the
// email_templates table and reference shared header/footer globals.

import { createAdminClient } from "@/lib/supabase-server";

// ---- Block types --------------------------------------------------------

export type BlockSize = "eyebrow" | "small" | "normal" | "large";

export interface HeadingBlock {
  id: string;
  type: "heading";
  level: 1 | 2 | 3;
  text: string;
  align?: "left" | "center" | "right";
  hidden_if_unset_var?: string;
}

export interface ParagraphBlock {
  id: string;
  type: "paragraph";
  html: string;
  size?: BlockSize;
  align?: "left" | "center" | "right";
  hidden_if_unset_var?: string;
}

export interface ImageBlock {
  id: string;
  type: "image";
  src: string;
  alt: string;
  max_width?: number;
  href?: string;
  hidden_if_unset_var?: string;
}

export interface ButtonBlock {
  id: string;
  type: "button";
  label: string;
  url: string;
  align?: "left" | "center" | "right";
  hidden_if_unset_var?: string;
}

export interface SeparatorBlock {
  id: string;
  type: "separator";
  height: number;
  hidden_if_unset_var?: string;
}

export type EmailBlock =
  | HeadingBlock
  | ParagraphBlock
  | ImageBlock
  | ButtonBlock
  | SeparatorBlock;

export const BLOCK_TYPES: EmailBlock["type"][] = [
  "heading",
  "paragraph",
  "image",
  "button",
  "separator",
];

export function newBlock(type: EmailBlock["type"]): EmailBlock {
  const id = `b_${Math.random().toString(36).slice(2, 10)}`;
  switch (type) {
    case "heading":
      return { id, type: "heading", level: 1, text: "Your heading" };
    case "paragraph":
      return { id, type: "paragraph", html: "Your paragraph text. <strong>Bold</strong> and <a href=\"#\">links</a> work." };
    case "image":
      // 600 >= the 560 email content width, so new images render full-width by
      // default (capped by the column). Shrink via the Max width field when you
      // want a smaller/centered image (e.g. a logo).
      return { id, type: "image", src: "", alt: "", max_width: 600 };
    case "button":
      return { id, type: "button", label: "Click here", url: "https://chadlewine.com", align: "center" };
    case "separator":
      return { id, type: "separator", height: 50 };
  }
}

// ---- Variable substitution ---------------------------------------------

export type EmailVars = Record<string, string | null | undefined>;

const VAR_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function substituteVars(input: string, vars: EmailVars): string {
  return input.replace(VAR_RE, (_, name) => {
    const v = vars[name as string];
    return v == null ? "" : String(v);
  });
}

// Returns true if every variable referenced in the string has a non-empty
// value in vars. Used by the renderer to decide whether to hide a block
// whose copy depends on an unset variable.
function allVarsSet(input: string, vars: EmailVars): boolean {
  let m: RegExpExecArray | null;
  const re = new RegExp(VAR_RE.source, "gi");
  while ((m = re.exec(input)) !== null) {
    const v = vars[m[1]];
    if (v == null || String(v).trim() === "") return false;
  }
  return true;
}

// ---- Block → HTML ------------------------------------------------------

const FONT_SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif";
const FONT_UI = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

const SIZE_STYLES: Record<BlockSize, string> = {
  eyebrow: `font-family:${FONT_UI};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8b9cf7;line-height:1.4;`,
  small: `font-family:${FONT_UI};font-size:12px;color:#808090;line-height:1.6;`,
  normal: `font-family:${FONT_SERIF};font-size:17px;color:#f0f0f5;line-height:1.65;`,
  large: `font-family:${FONT_SERIF};font-size:20px;color:#e0e0e8;line-height:1.55;`,
};

function renderHeading(b: HeadingBlock, vars: EmailVars): string {
  const sizePx = b.level === 1 ? 28 : b.level === 2 ? 22 : 18;
  const text = substituteVars(b.text, vars);
  const align = b.align || "left";
  return `<h${b.level} style="font-family:${FONT_UI};font-size:${sizePx}px;font-weight:500;letter-spacing:-0.02em;line-height:1.2;color:#e0e0e8;text-align:${align};margin:0 0 16px;">${text}</h${b.level}>`;
}

// Email clients disagree on default link styling, so pin paragraph links to
// the accent color + underline. Matches the editor's .be-para a rendering, so
// what you see in the builder is what sends. Skips anchors that already carry
// an inline style.
function styleLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (m, attrs) =>
    /\bstyle=/i.test(attrs)
      ? m
      : `<a${attrs} style="color:#b6c2ff;text-decoration:underline;">`,
  );
}

function renderParagraph(b: ParagraphBlock, vars: EmailVars): string {
  const size = b.size || "normal";
  const html = styleLinks(substituteVars(b.html, vars));
  const align = b.align || "left";
  const marginBottom = size === "eyebrow" ? "10px" : size === "small" ? "12px" : "20px";
  return `<p style="${SIZE_STYLES[size]}text-align:${align};margin:0 0 ${marginBottom};">${html}</p>`;
}

function renderImage(b: ImageBlock, vars: EmailVars): string {
  const src = substituteVars(b.src, vars);
  const href = b.href ? substituteVars(b.href, vars) : "";
  const w = b.max_width || 520;
  const img = `<img src="${src}" alt="${escapeAttr(b.alt)}" width="${w}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;border-radius:6px;margin:0 auto;" />`;
  const inner = href ? `<a href="${href}" style="display:block;">${img}</a>` : img;
  return `<div style="margin:0 0 24px;text-align:center;">${inner}</div>`;
}

function renderButton(b: ButtonBlock, vars: EmailVars): string {
  const label = substituteVars(b.label, vars);
  const url = substituteVars(b.url, vars);
  // Full-width bulletproof table-button (Gmail strips bg+padding from raw <a>),
  // label centered. Padding lives on the display:block <a>, not the <td>, so the
  // ENTIRE button is the clickable target -- not just the label text.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:8px 0 24px;"><tr><td bgcolor="#8b9cf7" style="background:#8b9cf7;border-radius:4px;"><a href="${url}" style="display:block;padding:14px 24px;text-align:center;text-decoration:none;color:#ffffff;font-family:${FONT_UI};font-weight:600;font-size:15px;text-transform:uppercase;letter-spacing:0.06em;"><span style="color:#ffffff;text-decoration:none;">${label}</span></a></td></tr></table>`;
}

function renderSeparator(b: SeparatorBlock): string {
  // Solid 1px divider in the theme's dark blue, with the block height split as
  // breathing room above and below the line.
  const pad = Math.round(Math.max(0, b.height) / 2);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${pad}px 0;"><tr><td height="1" style="height:1px;line-height:1px;font-size:0;background:#3a4ed0;">&nbsp;</td></tr></table>`;
}

function shouldRender(b: EmailBlock, vars: EmailVars): boolean {
  if (b.hidden_if_unset_var) {
    const v = vars[b.hidden_if_unset_var];
    if (v == null || String(v).trim() === "") return false;
  }
  // Also skip blocks whose copy references an unset variable. Keeps the
  // unsubscribe link out of transactional sends without explicit flags.
  switch (b.type) {
    case "paragraph":
      return allVarsSet(b.html, vars);
    case "heading":
      return allVarsSet(b.text, vars);
    case "button":
      return allVarsSet(b.url, vars) && allVarsSet(b.label, vars);
    case "image":
      return allVarsSet(b.src, vars);
    default:
      return true;
  }
}

export function renderBlock(b: EmailBlock, vars: EmailVars): string {
  if (!shouldRender(b, vars)) return "";
  switch (b.type) {
    case "heading":
      return renderHeading(b, vars);
    case "paragraph":
      return renderParagraph(b, vars);
    case "image":
      return renderImage(b, vars);
    case "button":
      return renderButton(b, vars);
    case "separator":
      return renderSeparator(b);
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---- Plain-text fallback -----------------------------------------------

function blockToText(b: EmailBlock, vars: EmailVars): string {
  if (!shouldRender(b, vars)) return "";
  switch (b.type) {
    case "heading":
      return substituteVars(b.text, vars).toUpperCase();
    case "paragraph":
      return substituteVars(b.html, vars)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p\s*>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&mdash;/g, "--");
    case "button":
      return `${substituteVars(b.label, vars)}: ${substituteVars(b.url, vars)}`;
    case "image":
      return b.alt ? `[Image: ${b.alt}]` : "";
    case "separator":
      return "";
  }
}

// ---- Email shell -------------------------------------------------------

interface ShellInput {
  subject: string;
  preheader?: string;
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
}

function shell(input: ShellInput): string {
  const safeSubject = escapeHtml(input.subject);
  const safePreheader = input.preheader ? escapeHtml(input.preheader) : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a14;color:#e0e0e8;font-family:${FONT_UI};">
  ${safePreheader ? `<div style="display:none;font-size:1px;color:#0a0a14;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${safePreheader}&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a14" style="background:#0a0a14;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
          <tr><td style="color:#e0e0e8;">
            ${input.headerHtml}
            ${input.bodyHtml}
            ${input.footerHtml}
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

// ---- Public renderers --------------------------------------------------

export interface RenderedEmail {
  html: string;
  text: string;
  subject: string;
  preheader: string;
}

export interface TemplateRow {
  slug: string;
  name: string;
  kind: string;
  subject_template: string;
  preheader_template: string | null;
  body_blocks: EmailBlock[];
}

export interface GlobalsRow {
  header_blocks: EmailBlock[];
  footer_blocks: EmailBlock[];
}

/** Renders a template's blocks (plus globals) using the given variables. */
export function renderEmail(
  template: TemplateRow,
  globals: GlobalsRow,
  vars: EmailVars,
): RenderedEmail {
  // Derive a "first_name_clause" for templates that want "Chad, you ..."
  // with no awkward "(empty), you ..." when the name is missing.
  const enrichedVars: EmailVars = {
    ...vars,
    first_name_clause:
      vars.first_name && String(vars.first_name).trim()
        ? `${String(vars.first_name).trim()}, `
        : "",
  };

  const headerHtml = globals.header_blocks
    .map((b) => renderBlock(b, enrichedVars))
    .join("\n");
  const bodyHtml = template.body_blocks
    .map((b) => renderBlock(b, enrichedVars))
    .join("\n");
  const footerHtml = globals.footer_blocks
    .map((b) => renderBlock(b, enrichedVars))
    .join("\n");

  const subject = substituteVars(template.subject_template, enrichedVars);
  const preheader = substituteVars(template.preheader_template || "", enrichedVars);

  const html = shell({
    subject,
    preheader,
    headerHtml,
    bodyHtml,
    footerHtml,
  });

  const textParts: string[] = [];
  for (const b of globals.header_blocks) {
    const t = blockToText(b, enrichedVars);
    if (t) textParts.push(t);
  }
  for (const b of template.body_blocks) {
    const t = blockToText(b, enrichedVars);
    if (t) textParts.push(t);
  }
  for (const b of globals.footer_blocks) {
    const t = blockToText(b, enrichedVars);
    if (t) textParts.push(t);
  }
  const text = textParts.join("\n\n");

  return { html, text, subject, preheader };
}

/** Looks the template + globals up by slug, then renders. */
export async function renderTemplateBySlug(
  slug: string,
  vars: EmailVars,
): Promise<RenderedEmail | null> {
  const supabase = createAdminClient();
  const [tplRes, gRes] = await Promise.all([
    supabase
      .from("email_templates")
      .select("slug, name, kind, subject_template, preheader_template, body_blocks")
      .eq("slug", slug)
      .maybeSingle(),
    supabase
      .from("email_globals")
      .select("header_blocks, footer_blocks")
      .eq("id", 1)
      .maybeSingle(),
  ]);
  if (!tplRes.data) return null;
  const globals: GlobalsRow = {
    header_blocks: (gRes.data?.header_blocks as EmailBlock[]) || [],
    footer_blocks: (gRes.data?.footer_blocks as EmailBlock[]) || [],
  };
  return renderEmail(tplRes.data as TemplateRow, globals, vars);
}

/** Synchronous render for the editor preview — pass blocks + globals directly. */
export function renderPreview(
  bodyBlocks: EmailBlock[],
  globals: GlobalsRow,
  subjectTemplate: string,
  preheaderTemplate: string | null,
  vars: EmailVars,
): RenderedEmail {
  return renderEmail(
    {
      slug: "_preview",
      name: "Preview",
      kind: "transactional",
      subject_template: subjectTemplate,
      preheader_template: preheaderTemplate,
      body_blocks: bodyBlocks,
    },
    globals,
    vars,
  );
}
