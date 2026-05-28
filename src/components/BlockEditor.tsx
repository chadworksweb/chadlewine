"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BLOCK_TYPES,
  newBlock,
  type EmailBlock,
  type HeadingBlock,
  type ParagraphBlock,
  type ImageBlock,
  type ButtonBlock,
  type SeparatorBlock,
  type BlockSize,
} from "@/lib/email-blocks";
import { useInlineEditable, type CaretRect } from "@/components/InlineEditable";
import { LinkSearchInput } from "@/components/LinkSearchInput";
import { MediaLibrary } from "@/components/MediaLibrary";

const BLOCK_LABELS: Record<EmailBlock["type"], string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  image: "Image",
  button: "Button",
  separator: "Separator",
};

const BLOCK_ICONS: Record<EmailBlock["type"], string> = {
  heading: "H",
  paragraph: "P",
  image: "Img",
  button: "Btn",
  separator: "Sep",
};

type Align = "left" | "center" | "right";

interface BlockEditorProps {
  blocks: EmailBlock[];
  onChange: (next: EmailBlock[]) => void;
}

export function BlockEditor({ blocks, onChange }: BlockEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Set when a block is freshly dropped from the palette, so its editable
  // grabs focus once. Cleared after that first focus so click-selecting an
  // existing block lets the native click place the caret where you clicked.
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<
    | { kind: "palette"; blockType: EmailBlock["type"] }
    | { kind: "block"; id: string }
    | null
  >(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as
      | { kind: "palette"; blockType: EmailBlock["type"] }
      | { kind: "block" }
      | undefined;
    if (data?.kind === "palette") {
      setDragging({ kind: "palette", blockType: data.blockType });
    } else if (data?.kind === "block") {
      setDragging({ kind: "block", id: String(e.active.id) });
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const { active, over } = e;
    if (!over) return;

    const activeData = active.data.current as
      | { kind: "palette"; blockType: EmailBlock["type"] }
      | { kind: "block" }
      | undefined;
    const overData = over.data.current as
      | { kind: "block-slot"; index: number }
      | { kind: "block" }
      | undefined;

    if (activeData?.kind === "palette") {
      const newOne = newBlock(activeData.blockType);
      let insertAt = blocks.length;
      if (overData?.kind === "block-slot") {
        insertAt = overData.index;
      } else if (overData?.kind === "block") {
        insertAt = blocks.findIndex((b) => b.id === String(over.id));
        if (insertAt === -1) insertAt = blocks.length;
      }
      const next = [...blocks];
      next.splice(insertAt, 0, newOne);
      onChange(next);
      setSelectedId(newOne.id);
      setAutoFocusId(newOne.id);
      return;
    }

    if (activeData?.kind === "block") {
      const fromIdx = blocks.findIndex((b) => b.id === String(active.id));
      let toIdx = fromIdx;
      if (overData?.kind === "block-slot") {
        toIdx = overData.index > fromIdx ? overData.index - 1 : overData.index;
      } else if (overData?.kind === "block") {
        toIdx = blocks.findIndex((b) => b.id === String(over.id));
      }
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
      onChange(arrayMove(blocks, fromIdx, toIdx));
    }
  };

  const updateBlock = useCallback(
    (id: string, patch: Partial<EmailBlock>) => {
      onChange(
        blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)),
      );
    },
    [blocks, onChange],
  );

  const deleteBlock = useCallback(
    (id: string) => {
      onChange(blocks.filter((b) => b.id !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [blocks, onChange],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="block-editor">
        <aside className="block-editor__palette">
          <h3 className="block-editor__palette-title">Blocks</h3>
          {BLOCK_TYPES.map((t) => (
            <PaletteItem key={t} blockType={t} />
          ))}
          <p className="block-editor__palette-hint">
            Drag onto the canvas, or drop between blocks. Click any block to
            edit it in place.
          </p>
        </aside>

        <div
          className="block-editor__canvas"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          <div
            className="block-editor__sheet"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedId(null);
            }}
          >
            <DropSlot index={0} key="slot-0" />
            <SortableContext
              items={blocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              {blocks.map((b, i) => (
                <div key={b.id}>
                  <SortableBlock
                    block={b}
                    selected={b.id === selectedId}
                    autoFocus={b.id === autoFocusId}
                    onSelect={() => setSelectedId(b.id)}
                    onDeselect={() => setSelectedId(null)}
                    onUpdate={(patch) => updateBlock(b.id, patch)}
                    onDelete={() => deleteBlock(b.id)}
                  />
                  <DropSlot index={i + 1} />
                </div>
              ))}
            </SortableContext>
            {blocks.length === 0 && (
              <p className="block-editor__empty">
                Drag a block from the left to start building your email.
              </p>
            )}
          </div>
        </div>
      </div>

      <DragOverlay>
        {dragging?.kind === "palette" && (
          <div className="block-editor__drag-overlay">
            {BLOCK_LABELS[dragging.blockType]}
          </div>
        )}
        {dragging?.kind === "block" && (
          <div className="block-editor__drag-overlay">
            {(() => {
              const b = blocks.find((x) => x.id === dragging.id);
              return b ? BLOCK_LABELS[b.type] : "";
            })()}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function PaletteItem({ blockType }: { blockType: EmailBlock["type"] }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `palette-${blockType}`,
    data: { kind: "palette", blockType },
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`block-editor__palette-item${isDragging ? " block-editor__palette-item--dragging" : ""}`}
    >
      <span className="block-editor__palette-icon">{BLOCK_ICONS[blockType]}</span>
      <span>{BLOCK_LABELS[blockType]}</span>
    </button>
  );
}

function DropSlot({ index }: { index: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${index}`,
    data: { kind: "block-slot", index },
  });
  return (
    <div
      ref={setNodeRef}
      className={`block-editor__slot${isOver ? " block-editor__slot--over" : ""}`}
    />
  );
}

interface EditorProps<B extends EmailBlock> {
  block: B;
  selected: boolean;
  autoFocus: boolean;
  onUpdate: (patch: Partial<EmailBlock>) => void;
  onSelect: () => void;
  onDeselect: () => void;
}

function SortableBlock({
  block,
  selected,
  autoFocus,
  onSelect,
  onDeselect,
  onUpdate,
  onDelete,
}: {
  block: EmailBlock;
  selected: boolean;
  autoFocus: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  onUpdate: (patch: Partial<EmailBlock>) => void;
  onDelete: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: block.id, data: { kind: "block" } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const editorProps = { block, selected, autoFocus, onUpdate, onSelect, onDeselect };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`be-block be-block--${block.type}${selected ? " be-block--selected" : ""}`}
      onClick={onSelect}
    >
      <div className="be-block__tools" onClick={(e) => e.stopPropagation()}>
        <span
          className="be-block__grip"
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          &#x2807;
        </span>
        <button
          type="button"
          className="be-block__del"
          title="Delete block"
          onClick={onDelete}
        >
          &times;
        </button>
      </div>

      {block.type === "heading" && <HeadingEditor {...editorProps} block={block} />}
      {block.type === "paragraph" && (
        <ParagraphEditor {...editorProps} block={block} />
      )}
      {block.type === "button" && <ButtonEditor {...editorProps} block={block} />}
      {block.type === "image" && <ImageEditor {...editorProps} block={block} />}
      {block.type === "separator" && (
        <SeparatorEditor {...editorProps} block={block} />
      )}
    </div>
  );
}

// --- Toolbar building blocks ---------------------------------------------

const prevent = (e: React.MouseEvent) => e.preventDefault();

function BlockToolbar({
  anchor,
  children,
}: {
  anchor: CaretRect | null;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(0);

  // Clamp the toolbar's left edge so it stays inside the block once we know its
  // own measured width. Runs after layout, before paint, so there's no flash.
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const parent = ref.current.offsetParent as HTMLElement | null;
    const parentW = parent?.clientWidth ?? 600;
    const selfW = ref.current.offsetWidth;
    setLeft(Math.max(0, Math.min(anchor.left, parentW - selfW - 4)));
  }, [anchor]);

  // With an anchor, float just above the selection; otherwise fall back to the
  // CSS default (pinned above the block's top-left).
  const style: React.CSSProperties | undefined = anchor
    ? { top: anchor.top, bottom: "auto", left, transform: "translateY(calc(-100% - 8px))" }
    : undefined;

  return (
    <div
      ref={ref}
      className="be-toolbar"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function AlignButtons({
  value,
  onChange,
}: {
  value: Align;
  onChange: (v: Align) => void;
}) {
  const opts: { v: Align; glyph: string; label: string }[] = [
    { v: "left", glyph: "L", label: "Align left" },
    { v: "center", glyph: "C", label: "Align center" },
    { v: "right", glyph: "R", label: "Align right" },
  ];
  return (
    <span className="be-tb__group">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          title={o.label}
          className={`be-tb__btn${value === o.v ? " be-tb__btn--on" : ""}`}
          onMouseDown={prevent}
          onClick={() => onChange(o.v)}
        >
          {o.glyph}
        </button>
      ))}
    </span>
  );
}

function VarMenu({ onInsert }: { onInsert: (v: string) => void }) {
  return (
    <select
      className="be-tb__select"
      value=""
      title="Insert a personalization variable"
      onChange={(e) => {
        if (e.target.value) onInsert(e.target.value);
        e.target.value = "";
      }}
    >
      <option value="">+ Variable</option>
      <option value="{{ first_name }}">First name</option>
      <option value="{{ first_name_clause }}">First name, </option>
      <option value="{{ unsubscribe_url }}">Unsubscribe URL</option>
      <option value="{{ token }}">Token</option>
    </select>
  );
}

// --- Per-block inline editors --------------------------------------------

function HeadingEditor({
  block,
  selected,
  autoFocus,
  onUpdate,
  onSelect,
  onDeselect,
}: EditorProps<HeadingBlock>) {
  const { caretRect, editableProps } = useInlineEditable({
    initial: block.text,
    mode: "plain",
    autoFocus,
    onChange: (text) => onUpdate({ text }),
    onSelect,
    onEscape: onDeselect,
  });
  const align = block.align || "left";
  return (
    <>
      {selected && (
        <BlockToolbar anchor={caretRect}>
          <span className="be-tb__group">
            {([1, 2, 3] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                className={`be-tb__btn${block.level === lvl ? " be-tb__btn--on" : ""}`}
                onMouseDown={prevent}
                onClick={() => onUpdate({ level: lvl })}
                title={`Heading level ${lvl}`}
              >
                H{lvl}
              </button>
            ))}
          </span>
          <span className="be-tb__sep" />
          <AlignButtons value={align} onChange={(v) => onUpdate({ align: v })} />
        </BlockToolbar>
      )}
      <div
        {...editableProps}
        className={`be-heading be-heading--l${block.level} be-align--${align}`}
        role="textbox"
        aria-label="Heading text"
        data-placeholder="Heading"
        data-empty={block.text.length === 0}
      />
    </>
  );
}

function ParagraphEditor({
  block,
  selected,
  autoFocus,
  onUpdate,
  onSelect,
  onDeselect,
}: EditorProps<ParagraphBlock>) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const { caretRect, exec, insertTextAtCaret, activeLink, unlink, editableProps } =
    useInlineEditable({
      initial: block.html,
      mode: "rich",
      autoFocus,
      onChange: (html) => onUpdate({ html }),
      onSelect,
      onEscape: onDeselect,
      // Cmd/Ctrl+K opens the bar; pre-fill with the existing link if the caret
      // is already inside one.
      onLinkShortcut: () => {
        setLinkUrl(activeLink || "");
        setLinkOpen(true);
      },
    });
  const size = block.size || "normal";
  const align = block.align || "left";

  // createLink runs against the text selection saved before focus moved to the
  // link box (useInlineEditable.exec restores it). Campaign links must be
  // absolute, which LinkSearchInput handles for internal picks.
  const applyLink = (raw: string) => {
    const url = raw.trim();
    if (url) exec("createLink", url);
    setLinkOpen(false);
    setLinkUrl("");
  };

  return (
    <>
      {selected && (
        <BlockToolbar anchor={caretRect}>
          {linkOpen ? (
            <div className="be-linkbar">
              <LinkSearchInput
                value={linkUrl}
                onChange={setLinkUrl}
                onPick={(u) => applyLink(u)}
                onEnter={() => applyLink(linkUrl)}
                absolute
                autoFocus
                placeholder="Paste a URL or search content"
              />
              <button
                type="button"
                className="be-tb__btn"
                onMouseDown={prevent}
                onClick={() => applyLink(linkUrl)}
                title="Add link"
              >
                Add
              </button>
              {activeLink && (
                <button
                  type="button"
                  className="be-tb__btn"
                  onMouseDown={prevent}
                  onClick={() => {
                    unlink();
                    setLinkOpen(false);
                    setLinkUrl("");
                  }}
                  title="Remove link"
                >
                  Unlink
                </button>
              )}
              <button
                type="button"
                className="be-tb__btn"
                onMouseDown={prevent}
                onClick={() => {
                  setLinkOpen(false);
                  setLinkUrl("");
                }}
                title="Cancel"
              >
                &times;
              </button>
            </div>
          ) : (
            <>
              <span className="be-tb__group">
                <button
                  type="button"
                  className="be-tb__btn"
                  onMouseDown={prevent}
                  onClick={() => exec("bold")}
                  title="Bold"
                >
                  <strong>B</strong>
                </button>
                <button
                  type="button"
                  className="be-tb__btn"
                  onMouseDown={prevent}
                  onClick={() => exec("italic")}
                  title="Italic"
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  className={`be-tb__btn${activeLink ? " be-tb__btn--on" : ""}`}
                  onMouseDown={prevent}
                  onClick={() => {
                    setLinkUrl(activeLink || "");
                    setLinkOpen(true);
                  }}
                  title={activeLink ? "Edit or remove link" : "Add link (select text first)"}
                >
                  &#128279;
                </button>
              </span>
              <span className="be-tb__sep" />
              <select
                className="be-tb__select"
                value={size}
                title="Text size"
                onChange={(e) => onUpdate({ size: e.target.value as BlockSize })}
              >
                <option value="eyebrow">Eyebrow</option>
                <option value="small">Small</option>
                <option value="normal">Body</option>
                <option value="large">Lede</option>
              </select>
              <AlignButtons value={align} onChange={(v) => onUpdate({ align: v })} />
              <span className="be-tb__sep" />
              <VarMenu onInsert={insertTextAtCaret} />
            </>
          )}
        </BlockToolbar>
      )}
      <div
        {...editableProps}
        className={`be-para be-para--${size} be-align--${align}`}
        role="textbox"
        aria-multiline="true"
        aria-label="Paragraph text"
        data-placeholder="Write your copy. Select text to make it bold, italic, or a link."
        data-empty={block.html.length === 0}
      />
    </>
  );
}

function ButtonEditor({
  block,
  selected,
  autoFocus,
  onUpdate,
  onSelect,
  onDeselect,
}: EditorProps<ButtonBlock>) {
  const { caretRect, editableProps } = useInlineEditable({
    initial: block.label,
    mode: "plain",
    autoFocus,
    onChange: (label) => onUpdate({ label }),
    onSelect,
    onEscape: onDeselect,
  });
  return (
    <>
      {selected && (
        <BlockToolbar anchor={caretRect}>
          <LinkSearchInput
            value={block.url}
            onChange={(u) => onUpdate({ url: u })}
            onPick={(u) => onUpdate({ url: u })}
            absolute
            placeholder="Paste a URL or search content"
          />
        </BlockToolbar>
      )}
      <div className="be-button-wrap">
        <span
          {...editableProps}
          className="be-button"
          role="textbox"
          aria-label="Button label"
          data-placeholder="Button"
          data-empty={block.label.length === 0}
        />
      </div>
      {selected && !block.url.trim() && (
        <p className="be-block__warn">Set a destination URL above.</p>
      )}
    </>
  );
}

function ImageEditor({
  block,
  selected,
  onUpdate,
  onSelect,
}: EditorProps<ImageBlock>) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const maxWidth = block.max_width || 600;

  const upload = async (file: File) => {
    setErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "site-image");
      fd.append("folder", "email/campaigns");
      const res = await fetch("/api/admin/media/upload", {
        method: "POST",
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error || "Upload failed");
      } else if (d.url) {
        onUpdate({ src: d.url, alt: block.alt || file.name.replace(/\.[^.]+$/, "") });
      }
    } catch {
      setErr("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="be-image" style={{ maxWidth }}>
        {block.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={block.src} alt={block.alt} className="be-image__img" />
        ) : (
          <button
            type="button"
            className="be-image__drop"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
              setMediaOpen(true);
            }}
          >
            {uploading ? "Uploading..." : "Choose from media library, upload, or set a URL"}
          </button>
        )}
      </div>

      {selected && (
        <div className="be-fields" onClick={(e) => e.stopPropagation()}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <div className="be-fields__row">
            <button
              type="button"
              className="be-fields__btn"
              onClick={() => setMediaOpen(true)}
            >
              Media library
            </button>
            <button
              type="button"
              className="be-fields__btn"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading..." : block.src ? "Replace upload" : "Upload"}
            </button>
            <label className="be-field be-field--grow">
              <span className="be-field__label">Image URL</span>
              <input
                type="url"
                className="be-field__input"
                value={block.src}
                placeholder="https://..."
                onChange={(e) => onUpdate({ src: e.target.value })}
              />
            </label>
          </div>
          <div className="be-fields__row">
            <label className="be-field be-field--grow">
              <span className="be-field__label">Alt text</span>
              <input
                type="text"
                className="be-field__input"
                value={block.alt}
                placeholder="Describe the image"
                onChange={(e) => onUpdate({ alt: e.target.value })}
              />
            </label>
            <label className="be-field">
              <span className="be-field__label">Max width</span>
              <input
                type="number"
                className="be-field__input be-field__input--num"
                value={maxWidth}
                onChange={(e) =>
                  onUpdate({ max_width: Number(e.target.value) || 520 })
                }
              />
            </label>
          </div>
          <label className="be-field be-field--grow">
            <span className="be-field__label">Link (optional)</span>
            <input
              type="url"
              className="be-field__input"
              value={block.href || ""}
              placeholder="Make the image clickable"
              onChange={(e) => onUpdate({ href: e.target.value })}
            />
          </label>
          {err && <p className="be-block__warn">{err}</p>}
        </div>
      )}

      <MediaLibrary
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onSelect={(url, alt) => {
          onUpdate({ src: url, alt: block.alt || alt || "" });
          setMediaOpen(false);
        }}
        uploadZone="site-image"
        uploadFolder="email/campaigns"
      />
    </>
  );
}

function SeparatorEditor({ block, selected }: EditorProps<SeparatorBlock>) {
  // Fixed 50px spacer -- no adjustable control.
  return (
    <div className="be-sep" style={{ height: block.height }}>
      <span className="be-sep__line" />
      {selected && <span className="be-sep__label">{block.height}px spacer</span>}
    </div>
  );
}
