"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Position of the current selection/caret, relative to the enclosing
 *  `.be-block`, used to float the formatting toolbar next to the text. */
export interface CaretRect {
  top: number;
  left: number;
}

// ---------------------------------------------------------------------------
// contentEditable primitives for the WYSIWYG email canvas.
//
// The hard constraint: the campaign autosave re-renders the parent every
// ~800ms while you type. A *controlled* contentEditable (value pushed back
// into the DOM on every render) would reset the caret to the start on each
// save. So these editables are deliberately UNCONTROLLED -- innerHTML/textContent
// is written exactly once on mount, the user types freely, and we only ever
// READ from the DOM (on input) to lift changes into React state. We never
// write state back into the node, so the caret is never disturbed.
// ---------------------------------------------------------------------------

// The inline subset the email serializer (src/lib/email-blocks.ts) renders.
// Everything outside this is unwrapped to its text content.
function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Only let links through that resolve to a benign protocol. Blocks
// javascript:/data:/vbscript: from a pasted or hand-typed link URL. Relative,
// anchor, mailto, tel, and {{ variable }} hrefs are all allowed.
function isSafeHref(href: string): boolean {
  const h = href.trim();
  if (/^(https?:|mailto:|tel:|#|\/|\{\{)/i.test(h)) return true;
  // Reject anything with an explicit scheme we didn't allowlist.
  return !/^[a-z][a-z0-9+.-]*:/i.test(h);
}

// Tags that imply a line break in our inline-only model. Pasted documents
// (Google Docs especially) express structure with these; we flatten them to
// <br> so the content still fits a single email <p>.
const BLOCK_TAGS = new Set([
  "DIV",
  "P",
  "LI",
  "TR",
  "BLOCKQUOTE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "SECTION",
  "ARTICLE",
]);
const DROP_TAGS = new Set(["STYLE", "SCRIPT", "META", "TITLE", "HEAD", "LINK"]);

// Google Docs (and Word) encode bold/italic with inline styles on <span>s, not
// <b>/<i> tags -- and wrap the whole paste in <b style="font-weight:normal">.
// So emphasis has to be read from computed-ish style, not just the tag name.
function isBold(el: HTMLElement): boolean {
  const fw = el.style?.fontWeight || "";
  if (el.tagName === "B" || el.tagName === "STRONG") {
    // The Docs wrapper <b style="font-weight:normal"> is NOT actually bold.
    if (/^(normal|[1-5]00)$/.test(fw)) return false;
    return true;
  }
  if (/^(bold|bolder)$/i.test(fw)) return true;
  const n = parseInt(fw, 10);
  return !Number.isNaN(n) && n >= 600;
}

function isItalic(el: HTMLElement): boolean {
  if (el.tagName === "I" || el.tagName === "EM") return true;
  const fs = el.style?.fontStyle || "";
  return fs === "italic" || fs === "oblique";
}

function wrapEmphasis(el: HTMLElement, inner: string): string {
  if (!inner) return inner;
  let out = inner;
  if (isItalic(el)) out = `<em>${out}</em>`;
  if (isBold(el)) out = `<strong>${out}</strong>`;
  return out;
}

// Google Docs rewrites links as https://www.google.com/url?q=<real>&sa=... .
// Recover the real destination so pasted links point where they should.
function unwrapGoogleRedirect(href: string): string {
  try {
    if (/^https?:\/\/(www\.)?google\.com\/url\?/i.test(href)) {
      const q = new URL(href).searchParams.get("q");
      if (q) return q;
    }
  } catch {
    /* not a parseable URL -- fall through */
  }
  return href;
}

function serializeChildren(node: Node): string {
  let html = "";
  node.childNodes.forEach((child) => {
    html += serializeNode(child);
  });
  return html;
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeText(node.textContent || "");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName;
  if (tag === "BR") return "<br>";
  if (DROP_TAGS.has(tag)) return "";

  if (BLOCK_TAGS.has(tag)) {
    // Block-level boundary collapses to a line break + content, so the
    // paragraph stays inline-only (the serializer wraps it in one <p>).
    const inner = wrapEmphasis(el, serializeChildren(el));
    return inner ? `<br>${inner}` : "";
  }

  if (tag === "A") {
    const href = unwrapGoogleRedirect(
      (el.getAttribute("href") || "").trim(),
    ).trim();
    const inner = wrapEmphasis(el, serializeChildren(el));
    if (!href || !isSafeHref(href)) return inner;
    return `<a href="${escapeAttr(href)}">${inner}</a>`;
  }

  // span / font / b / i / strong / em / u / anything else: drop the wrapper but
  // carry any bold/italic it expresses (via tag or inline style) onto its text.
  return wrapEmphasis(el, serializeChildren(el));
}

/** Normalize raw HTML (typed or pasted) down to the email serializer's inline
 *  subset: <strong>, <em>, <a href>, <br>. b/font-weight->strong,
 *  i/font-style->em, block tags->br, all other tags/attributes stripped,
 *  unsafe and Google-redirect hrefs cleaned. {{ variables }} pass through. */
export function normalizeInlineHtml(rawHtml: string): string {
  if (typeof document === "undefined" || typeof DOMParser === "undefined") {
    return rawHtml;
  }
  // DOMParser builds an inert document: no scripts run, no images/resources
  // load -- safer than innerHTML for sanitizing arbitrary pasted markup.
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  let out = serializeChildren(doc.body);
  // Collapse runs of <br> (Docs paragraphs add several) and trim the edges.
  out = out
    .replace(/(?:\s*<br>\s*){3,}/gi, "<br><br>")
    .replace(/^(?:<br\s*\/?>)+/i, "")
    .replace(/(?:<br\s*\/?>)+$/i, "");
  return out.trim();
}

export function focusEnd(el: HTMLElement | null) {
  if (!el) return;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

interface InlineEditableOptions {
  /** Initial DOM contents: innerHTML for "rich", textContent for "plain". */
  initial: string;
  mode: "rich" | "plain";
  /** Receives normalized HTML (rich) or plain text (plain) on every change. */
  onChange: (value: string) => void;
  /** Fired when the editable gains focus (used to select the block). */
  onSelect?: () => void;
  onEscape?: () => void;
  /** Fired on Cmd/Ctrl+K (add-link shortcut); selection is saved first. */
  onLinkShortcut?: () => void;
  autoFocus?: boolean;
}

/** Wires an uncontrolled contentEditable: returns a ref, an `emit` that lifts
 *  the current DOM into state, props to spread onto the editable, and helpers
 *  to run formatting commands / insert text at the saved caret. */
export function useInlineEditable(opts: InlineEditableOptions) {
  const ref = useRef<HTMLDivElement>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const savedRange = useRef<Range | null>(null);
  const [caretRect, setCaretRect] = useState<CaretRect | null>(null);
  // href of the link the caret currently sits inside (null if none) -- lets the
  // toolbar offer "remove link".
  const [activeLink, setActiveLink] = useState<string | null>(null);

  // Walk up from a node to the enclosing <a> within the editable, if any.
  const closestAnchor = (start: Node | null): HTMLElement | null => {
    let node: Node | null = start;
    while (node && node !== ref.current) {
      if (node.nodeType === 1 && (node as HTMLElement).tagName === "A") {
        return node as HTMLElement;
      }
      node = node.parentNode;
    }
    return null;
  };

  // Measure where the caret/selection sits, relative to the enclosing block,
  // so the floating toolbar can hug the text instead of pinning to the top.
  const updateCaret = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    const block = el.closest(".be-block") as HTMLElement | null;
    if (!block) return;
    let rect = sel.getRangeAt(0).getBoundingClientRect();
    // A collapsed caret on an empty line can report a zero rect; fall back to
    // the editable's own box so we still get a sensible anchor.
    if (rect.height === 0 && rect.width === 0) rect = el.getBoundingClientRect();
    const br = block.getBoundingClientRect();
    setCaretRect({ top: rect.top - br.top, left: rect.left - br.left });
    const anchor = closestAnchor(sel.anchorNode);
    setActiveLink(anchor ? anchor.getAttribute("href") : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closestAnchor reads the stable ref
  }, []);

  // Write the DOM once, on mount only. Never again -- that's what keeps the
  // caret stable across the autosave re-renders.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const o = optsRef.current;
    if (o.mode === "rich") el.innerHTML = o.initial;
    else el.textContent = o.initial;
    if (o.autoFocus) focusEnd(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  }, []);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const o = optsRef.current;
    o.onChange(
      o.mode === "rich" ? normalizeInlineHtml(el.innerHTML) : el.textContent ?? "",
    );
  }, []);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (savedRange.current && el.contains(savedRange.current.startContainer)) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange.current);
    }
  }, []);

  /** Run an execCommand against the editable, preferring tag output over inline
   *  styles (so we get <strong>/<em> not <span style>). */
  const exec = useCallback(
    (command: string, value?: string) => {
      restoreSelection();
      document.execCommand("styleWithCSS", false, "false");
      document.execCommand(command, false, value);
      emit();
    },
    [emit, restoreSelection],
  );

  /** Insert literal text (e.g. a {{ variable }}) at the last caret position. */
  const insertTextAtCaret = useCallback(
    (text: string) => {
      restoreSelection();
      document.execCommand("insertText", false, text);
      emit();
    },
    [emit, restoreSelection],
  );

  /** Remove the link wrapping the caret (selects the whole anchor, then unlinks). */
  const unlink = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const anchor = closestAnchor(sel.anchorNode);
    if (anchor) {
      const range = document.createRange();
      range.selectNode(anchor);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand("unlink");
    setActiveLink(null);
    emit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closestAnchor reads the stable ref
  }, [emit, restoreSelection]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const o = optsRef.current;
      // Cmd/Ctrl+K -- add link. Save the current text selection first so the
      // link command can wrap it after focus moves to the link box.
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        saveSelection();
        o.onLinkShortcut?.();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.currentTarget.blur();
        o.onEscape?.();
        return;
      }
      if (o.mode === "plain" && e.key === "Enter") {
        // Single-line fields (heading text, button label): Enter commits.
        e.preventDefault();
        e.currentTarget.blur();
        return;
      }
      if (o.mode === "rich" && e.key === "Enter" && !e.shiftKey) {
        // Keep output inline: a <br>, never a <div> wrapper.
        e.preventDefault();
        document.execCommand("insertLineBreak");
        emit();
      }
    },
    [emit, saveSelection],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const o = optsRef.current;

      // Single-line fields (heading, button label): always strip to plain text.
      if (o.mode === "plain") {
        const text = e.clipboardData
          .getData("text/plain")
          .replace(/\s*\n\s*/g, " ");
        document.execCommand("insertText", false, text);
        emit();
        return;
      }

      // Rich paragraph: prefer the clipboard's HTML so bold/italic/links from
      // Google Docs, Word, the web, etc. survive -- sanitized down to the
      // email's inline subset. Fall back to plain text (newlines -> <br>).
      const html = e.clipboardData.getData("text/html");
      if (html && html.trim()) {
        const clean = normalizeInlineHtml(html);
        document.execCommand("insertHTML", false, clean);
      } else {
        const text = e.clipboardData.getData("text/plain");
        const asHtml = escapeText(text).replace(/\r?\n/g, "<br>");
        document.execCommand("insertHTML", false, asHtml);
      }
      emit();
    },
    [emit],
  );

  const handleFocus = useCallback(() => {
    optsRef.current.onSelect?.();
    updateCaret();
  }, [updateCaret]);

  // Keyboard-driven selection changes (shift+arrows, etc.) don't always fire a
  // key/mouse event on the editable, so track the global selectionchange while
  // this editable holds focus.
  useEffect(() => {
    const handler = () => {
      if (document.activeElement === ref.current) updateCaret();
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [updateCaret]);

  const editableProps = {
    ref,
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: true,
    onFocus: handleFocus,
    onInput: () => {
      emit();
      updateCaret();
    },
    onBlur: () => {
      saveSelection();
      emit();
    },
    onKeyUp: () => {
      saveSelection();
      updateCaret();
    },
    onMouseUp: () => {
      saveSelection();
      updateCaret();
    },
    onKeyDown,
    onPaste,
  } as const;

  return {
    ref,
    emit,
    exec,
    insertTextAtCaret,
    saveSelection,
    caretRect,
    activeLink,
    unlink,
    editableProps,
  };
}
