"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MediaLibrary } from "@/components/MediaLibrary";
import { LinkSearchInput } from "@/components/LinkSearchInput";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
}

// SVG icons for toolbar (16x16)
const icons: Record<string, React.ReactNode> = {
  bold: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>,
  italic: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>,
  underline: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>,
  strikeThrough: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4H9a3 3 0 0 0 0 6"/><path d="M14 14a3 3 0 0 1 0 6H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg>,
  blockquote: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/></svg>,
  ul: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>,
  ol: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text><text x="2" y="14" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text><text x="2" y="20" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text></svg>,
  link: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  unlink: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-3 3a5 5 0 0 0 .12 7.19"/><path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l3-3a5 5 0 0 0-.12-7.19"/><line x1="2" y1="2" x2="22" y2="22"/></svg>,
  image: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  hr: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12"/></svg>,
  clear: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>,
};

const iconKey: Record<string, string> = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strikeThrough: "strikeThrough",
  "formatBlock:blockquote": "blockquote",
  insertUnorderedList: "ul",
  insertOrderedList: "ol",
  createLink: "link",
  unlink: "unlink",
  insertImage: "image",
  insertHR: "hr",
  removeFormat: "clear",
};

const toolbarButtons = [
  { cmd: "bold", title: "Bold" },
  { cmd: "italic", title: "Italic" },
  { cmd: "underline", title: "Underline" },
  { cmd: "strikeThrough", title: "Strikethrough" },
  { cmd: "divider" },
  { cmd: "headingSelect", title: "Block format" },
  { cmd: "divider" },
  { cmd: "insertUnorderedList", title: "Bullet list" },
  { cmd: "insertOrderedList", title: "Numbered list" },
  { cmd: "divider" },
  { cmd: "createLink", title: "Insert link" },
  { cmd: "unlink", title: "Remove link" },
  { cmd: "divider" },
  { cmd: "insertImage", title: "Insert image" },
  { cmd: "divider" },
  { cmd: "insertHR", title: "Horizontal rule" },
  { cmd: "divider" },
  { cmd: "removeFormat", title: "Clear formatting" },
];

// --- Paste sanitizer ------------------------------------------------------
// Google Docs / Word / web pastes carry a mountain of inline styles, <span>
// wrappers, ids and classes. Strip all of that down to the clean semantic tags
// this editor uses, mapping style-based bold/italic/underline/strike back to
// <strong>/<em>/<u>/<s> and unwrapping Google's link redirects.
const PASTE_DROP_TAGS = new Set([
  "STYLE", "SCRIPT", "META", "TITLE", "HEAD", "LINK", "O:P", "COLGROUP", "COL",
]);
const PASTE_BLOCK_MAP: Record<string, string> = {
  P: "p", PRE: "p",
  H1: "h2", H2: "h2", H3: "h3", H4: "h4", H5: "h4", H6: "h4",
  BLOCKQUOTE: "blockquote", UL: "ul", OL: "ol", LI: "li",
};

function escHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function pasteSafeHref(href: string): boolean {
  const h = href.trim();
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(h)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(h);
}
function unwrapGoogleRedirect(href: string): string {
  try {
    if (/^https?:\/\/(www\.)?google\.com\/url\?/i.test(href)) {
      const q = new URL(href).searchParams.get("q");
      if (q) return q;
    }
  } catch {
    /* not a parseable URL */
  }
  return href;
}
// Read bold/italic/underline/strike from either the tag or its inline style
// (Docs encodes them as <span style="font-weight:700">, etc.) and wrap.
function emphasisWrap(el: HTMLElement, inner: string): string {
  if (!inner) return inner;
  const tag = el.tagName;
  const st = el.style;
  const fw = st?.fontWeight || "";
  const fs = st?.fontStyle || "";
  const td = `${st?.textDecorationLine || ""} ${st?.textDecoration || ""}`;
  // Docs wraps the whole paste in <b style="font-weight:normal"> -- not bold.
  const bold =
    tag === "B" || tag === "STRONG"
      ? !/^(normal|[1-5]00)$/.test(fw)
      : /^(bold|bolder)$/i.test(fw) || parseInt(fw, 10) >= 600;
  const italic = tag === "I" || tag === "EM" || fs === "italic" || fs === "oblique";
  const underline = tag === "U" || /underline/.test(td);
  const strike = tag === "S" || tag === "STRIKE" || tag === "DEL" || /line-through/.test(td);
  let out = inner;
  if (strike) out = `<s>${out}</s>`;
  if (underline) out = `<u>${out}</u>`;
  if (italic) out = `<em>${out}</em>`;
  if (bold) out = `<strong>${out}</strong>`;
  return out;
}
function hasBlockChild(el: HTMLElement): boolean {
  return !!el.querySelector(
    "p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,table,hr",
  );
}
function pasteSerializeChildren(node: Node): string {
  let html = "";
  node.childNodes.forEach((c) => {
    html += pasteSerializeNode(c);
  });
  return html;
}
function pasteSerializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escHtmlText((node.textContent || "").replace(/\s+/g, " "));
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName;
  if (PASTE_DROP_TAGS.has(tag)) return "";
  if (tag === "BR") return "<br>";
  if (tag === "HR") return "<hr>";
  if (tag === "IMG") {
    const src = (el.getAttribute("src") || "").trim();
    if (!/^https?:/i.test(src)) return ""; // drop base64/blob/inline images
    const alt = el.getAttribute("alt") || "";
    return `<img src="${escHtmlAttr(src)}" alt="${escHtmlAttr(alt)}" />`;
  }
  if (tag === "A") {
    const href = unwrapGoogleRedirect(
      (el.getAttribute("href") || "").trim(),
    ).trim();
    const inner = pasteSerializeChildren(el);
    if (!inner) return "";
    if (!href || !pasteSafeHref(href)) return inner;
    const tgt =
      el.getAttribute("target") === "_blank"
        ? ` target="_blank" rel="noopener noreferrer"`
        : "";
    return `<a href="${escHtmlAttr(href)}"${tgt}>${inner}</a>`;
  }
  if (tag === "DIV") {
    // A div holding blocks just unwraps; an inline-only div becomes a paragraph
    // (Docs/Word sometimes use a <div> per paragraph).
    const inner = pasteSerializeChildren(el);
    if (!inner.trim()) return "";
    return hasBlockChild(el) ? inner : `<p>${inner}</p>`;
  }
  const mapped = PASTE_BLOCK_MAP[tag];
  if (mapped) {
    const inner = pasteSerializeChildren(el);
    if (!inner.trim()) return "";
    return `<${mapped}>${inner}</${mapped}>`;
  }
  // span / font / b / i / u / s / unknown: drop the wrapper, carry emphasis.
  return emphasisWrap(el, pasteSerializeChildren(el));
}
/** Sanitize pasted clipboard HTML down to this editor's clean semantic tags. */
function sanitizePastedHtml(rawHtml: string): string {
  if (typeof DOMParser === "undefined") return "";
  // DOMParser builds an inert document (no scripts run, no resources load).
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  return pasteSerializeChildren(doc.body)
    .replace(/<(p|h2|h3|h4|blockquote|li)>\s*<\/\1>/gi, "")
    .replace(/(?:<br>\s*){3,}/gi, "<br><br>")
    .trim();
}

interface LinkTooltip {
  url: string;
  target: string;
  x: number;
  y: number;
  anchor: HTMLAnchorElement;
}

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const [mode, setMode] = useState<"visual" | "code">("visual");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [linkTooltip, setLinkTooltip] = useState<LinkTooltip | null>(null);
  const [editingLink, setEditingLink] = useState(false);
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editLinkTarget, setEditLinkTarget] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkTarget, setNewLinkTarget] = useState("");
  const [createPos, setCreatePos] = useState<{ x: number; y: number } | null>(null);
  const [currentBlock, setCurrentBlock] = useState("p");
  const editorRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const isInternalUpdate = useRef(false);
  const savedSelection = useRef<Range | null>(null);
  const tooltipHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function detectBlockType() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current?.contains(sel.anchorNode)) return;
    let node: Node | null = sel.anchorNode;
    while (node && node !== editorRef.current) {
      if (node.nodeType === 1) {
        const tag = (node as HTMLElement).tagName.toLowerCase();
        if (["h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote"].includes(tag)) {
          setCurrentBlock(tag);
          return;
        }
      }
      node = node.parentNode;
    }
    setCurrentBlock("p");
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedSelection.current = sel.getRangeAt(0).cloneRange();
    }
    detectBlockType();
  }

  function restoreSelection() {
    if (savedSelection.current) {
      // preventScroll: focusing a tall contentEditable otherwise yanks the
      // editor back to the top before the caret/selection is restored.
      editorRef.current?.focus({ preventScroll: true });
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedSelection.current);
      }
    }
  }

  // Position (relative to the editor wrapper) of the current selection, so the
  // create-link popover can appear next to the cursor rather than top-left.
  function getSelectionPos(): { x: number; y: number } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return null;
    if (!editorRef.current.contains(sel.anchorNode)) return null;
    const range = sel.getRangeAt(0);
    let rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      const rects = range.getClientRects();
      if (rects.length) rect = rects[0];
    }
    const editorRect = editorRef.current.getBoundingClientRect();
    // Clamp so the popover stays inside the editor's width.
    const x = Math.max(
      0,
      Math.min(rect.left - editorRect.left, Math.max(0, editorRect.width - 460)),
    );
    return { x, y: rect.bottom - editorRect.top + 6 };
  }

  function openCreateLink() {
    saveSelection();
    setCreatePos(getSelectionPos());
    setNewLinkUrl("");
    setNewLinkTarget("");
    setCreatingLink(true);
  }

  useEffect(() => {
    if (mode === "visual" && editorRef.current && !isInternalUpdate.current) {
      editorRef.current.innerHTML = value;
    }
    isInternalUpdate.current = false;
  }, [mode, value]);

  function insertImageFromLibrary(url: string, alt?: string, title?: string) {
    setMediaOpen(false);
    const altAttr = alt ? ` alt="${alt.replace(/"/g, "&quot;")}"` : ' alt=""';
    const titleAttr = title ? ` title="${title.replace(/"/g, "&quot;")}"` : "";
    const imgTag = `<img src="${url}"${altAttr}${titleAttr} />`;

    if (mode === "visual" && editorRef.current) {
      editorRef.current.focus({ preventScroll: true });
      document.execCommand("insertHTML", false, imgTag);
      isInternalUpdate.current = true;
      onChange(editorRef.current.innerHTML);
    } else {
      onChange(value + `\n${imgTag}\n`);
    }
  }

  function execCommand(cmdString: string) {
    if (mode !== "visual") return;

    if (cmdString === "insertImage") {
      setMediaOpen(true);
      return;
    }

    restoreSelection();

    if (cmdString === "insertHR") {
      document.execCommand("insertHTML", false, "<hr>");
    } else if (cmdString.startsWith("formatBlock:")) {
      const tag = cmdString.split(":")[1];
      document.execCommand("formatBlock", false, tag);
    } else if (cmdString === "createLink") {
      openCreateLink();
      return;
    } else {
      document.execCommand(cmdString, false);
    }

    if (editorRef.current) {
      isInternalUpdate.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- React Compiler can't model the ref read; manual memo keeps a stable identity for child handlers
  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalUpdate.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Intercept paste so Google Docs / Word / web HTML is sanitized to clean
  // semantic tags instead of dumping inline-CSS spans into the body.
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const html = e.clipboardData.getData("text/html");
      const text = e.clipboardData.getData("text/plain");
      let clean = "";
      if (html && html.trim()) {
        clean = sanitizePastedHtml(html);
      } else if (text) {
        clean = text
          .split(/\r?\n\r?\n+/)
          .map((p) => `<p>${escHtmlText(p).replace(/\r?\n/g, "<br>")}</p>`)
          .join("");
      }
      if (!clean) return;
      document.execCommand("insertHTML", false, clean);
      isInternalUpdate.current = true;
      if (editorRef.current) onChange(editorRef.current.innerHTML);
    },
    [onChange]
  );

  function switchToVisual() {
    setMode("visual");
  }

  function switchToCode() {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
    setMode("code");
  }

  function cancelTooltipHide() {
    if (tooltipHideTimer.current) {
      clearTimeout(tooltipHideTimer.current);
      tooltipHideTimer.current = null;
    }
  }

  function scheduleTooltipHide() {
    cancelTooltipHide();
    tooltipHideTimer.current = setTimeout(() => {
      setLinkTooltip(null);
      setEditingLink(false);
    }, 300);
  }

  function handleEditorMouseOver(e: React.MouseEvent) {
    const target = (e.target as HTMLElement).closest("a") as HTMLAnchorElement | null;
    if (target && editorRef.current?.contains(target)) {
      cancelTooltipHide();
      const rect = target.getBoundingClientRect();
      const editorRect = editorRef.current.getBoundingClientRect();
      setLinkTooltip({
        url: target.getAttribute("href") || "",
        target: target.getAttribute("target") || "",
        x: rect.left - editorRect.left,
        y: rect.bottom - editorRect.top + 4,
        anchor: target,
      });
    }
  }

  function handleEditorMouseOut(e: React.MouseEvent) {
    const related = e.relatedTarget as HTMLElement | null;
    if (related?.closest(".rte__link-tooltip")) return;
    if (related?.closest("a") && editorRef.current?.contains(related)) return;
    scheduleTooltipHide();
  }

  function confirmCreateLink() {
    if (!newLinkUrl) {
      setCreatingLink(false);
      return;
    }
    restoreSelection();
    document.execCommand("createLink", false, newLinkUrl);
    // Apply target to the newly created link
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let node: Node | null = sel.anchorNode;
      while (node && node.nodeType !== 1) node = node.parentNode;
      const anchor = (node as HTMLElement)?.closest("a");
      if (anchor && newLinkTarget) {
        anchor.setAttribute("target", newLinkTarget);
        anchor.setAttribute("rel", "noopener noreferrer");
      }
    }
    setCreatingLink(false);
    if (editorRef.current) {
      isInternalUpdate.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }

  function startEditLink() {
    if (!linkTooltip) return;
    setEditLinkUrl(linkTooltip.url);
    setEditLinkTarget(linkTooltip.target);
    setEditingLink(true);
  }

  function saveEditLink() {
    if (!linkTooltip) return;
    linkTooltip.anchor.setAttribute("href", editLinkUrl);
    if (editLinkTarget) {
      linkTooltip.anchor.setAttribute("target", editLinkTarget);
      linkTooltip.anchor.setAttribute("rel", "noopener noreferrer");
    } else {
      linkTooltip.anchor.removeAttribute("target");
      linkTooltip.anchor.removeAttribute("rel");
    }
    setLinkTooltip({ ...linkTooltip, url: editLinkUrl, target: editLinkTarget });
    setEditingLink(false);
    if (editorRef.current) {
      isInternalUpdate.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }

  function removeLink() {
    if (!linkTooltip) return;
    const parent = linkTooltip.anchor.parentNode;
    if (parent) {
      while (linkTooltip.anchor.firstChild) {
        parent.insertBefore(linkTooltip.anchor.firstChild, linkTooltip.anchor);
      }
      parent.removeChild(linkTooltip.anchor);
    }
    setLinkTooltip(null);
    setEditingLink(false);
    if (editorRef.current) {
      isInternalUpdate.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }

  const textContent = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = textContent ? textContent.split(/\s+/).length : 0;

  return (
    <div className="rte">
      <div className="rte__toolbar-row">
        {mode === "visual" && (
          <div className="rte__toolbar">
            {toolbarButtons.map((btn, i) =>
              btn.cmd === "divider" ? (
                <span key={i} className="rte__toolbar-divider" />
              ) : btn.cmd === "headingSelect" ? (
                <select
                  key={btn.cmd}
                  className="rte__toolbar-select"
                  title={btn.title}
                  value={currentBlock}
                  onMouseDown={saveSelection}
                  onChange={(e) => {
                    execCommand(`formatBlock:${e.target.value}`);
                    setCurrentBlock(e.target.value);
                  }}
                >
                  <option value="p">Paragraph</option>
                  <option value="h2">Heading 2</option>
                  <option value="h3">Heading 3</option>
                  <option value="h4">Heading 4</option>
                  <option value="blockquote">Blockquote</option>
                </select>
              ) : (
                <button
                  key={btn.cmd}
                  type="button"
                  className="rte__toolbar-btn"
                  onClick={() => execCommand(btn.cmd)}
                  title={btn.title}
                >
                  {icons[iconKey[btn.cmd]] || btn.title}
                </button>
              )
            )}
          </div>
        )}
        <div className="rte__toolbar-right">
          <span className="rte__wordcount">{wordCount} words</span>
          <div className="rte__tabs">
            <button
              type="button"
              className={`rte__tab${mode === "visual" ? " rte__tab--active" : ""}`}
              onClick={switchToVisual}
            >
              Visual
            </button>
            <button
              type="button"
              className={`rte__tab${mode === "code" ? " rte__tab--active" : ""}`}
              onClick={switchToCode}
            >
              Code
            </button>
          </div>
        </div>
      </div>

      {mode === "visual" && (
        <div style={{ position: "relative" }}>
          <div
            ref={editorRef}
            className="rte__editor"
            contentEditable
            spellCheck
            onInput={handleInput}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              // Cmd/Ctrl+K -- add link on the current selection.
              if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
                e.preventDefault();
                openCreateLink();
              }
            }}
            onMouseUp={saveSelection}
            onKeyUp={saveSelection}
            onMouseOver={handleEditorMouseOver}
            onMouseOut={handleEditorMouseOut}
            suppressContentEditableWarning
          />
          {linkTooltip && !creatingLink && (
            <div
              className="rte__link-tooltip"
              style={{ left: linkTooltip.x, top: linkTooltip.y }}
              onMouseEnter={cancelTooltipHide}
              onMouseLeave={scheduleTooltipHide}
            >
              {editingLink ? (
                <div className="rte__link-tooltip-edit">
                  <LinkSearchInput
                    value={editLinkUrl}
                    onChange={setEditLinkUrl}
                    onPick={(url) => setEditLinkUrl(url)}
                    onEnter={saveEditLink}
                    autoFocus
                  />
                  <select
                    className="rte__link-tooltip-select"
                    value={editLinkTarget}
                    onChange={(e) => setEditLinkTarget(e.target.value)}
                  >
                    <option value="">Same tab</option>
                    <option value="_blank">New tab</option>
                  </select>
                  <button className="rte__link-tooltip-btn" onClick={saveEditLink} type="button">Save</button>
                </div>
              ) : (
                <div className="rte__link-tooltip-view">
                  <a href={linkTooltip.url} target="_blank" rel="noopener noreferrer" className="rte__link-tooltip-url">
                    {linkTooltip.url}
                  </a>
                  {linkTooltip.target === "_blank" && (
                    <span className="rte__link-tooltip-badge">↗</span>
                  )}
                  <button className="rte__link-tooltip-btn" onClick={startEditLink} type="button">Edit</button>
                  <button className="rte__link-tooltip-btn rte__link-tooltip-btn--danger" onClick={removeLink} type="button">Remove</button>
                </div>
              )}
            </div>
          )}
          {creatingLink && (
            <div
              className="rte__link-tooltip rte__link-tooltip--create"
              style={
                createPos
                  ? { left: createPos.x, top: createPos.y, transform: "none" }
                  : undefined
              }
            >
              <div className="rte__link-tooltip-edit">
                <LinkSearchInput
                  value={newLinkUrl}
                  onChange={setNewLinkUrl}
                  onPick={(url) => setNewLinkUrl(url)}
                  onEnter={confirmCreateLink}
                  autoFocus
                />
                <select
                  className="rte__link-tooltip-select"
                  value={newLinkTarget}
                  onChange={(e) => setNewLinkTarget(e.target.value)}
                >
                  <option value="">Same tab</option>
                  <option value="_blank">New tab</option>
                </select>
                <button className="rte__link-tooltip-btn" onClick={confirmCreateLink} type="button">Insert</button>
                <button className="rte__link-tooltip-btn rte__link-tooltip-btn--danger" onClick={() => setCreatingLink(false)} type="button">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "code" && (
        <textarea
          ref={codeRef}
          className="rte__code"
          value={value}
          onChange={handleCodeChange}
          spellCheck={false}
        />
      )}

      <MediaLibrary
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onSelect={insertImageFromLibrary}
      />
    </div>
  );
}
