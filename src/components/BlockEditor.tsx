"use client";

import { useCallback, useState } from "react";
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
} from "@/lib/email-blocks";

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

interface BlockEditorProps {
  blocks: EmailBlock[];
  onChange: (next: EmailBlock[]) => void;
}

export function BlockEditor({ blocks, onChange }: BlockEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<
    { kind: "palette"; blockType: EmailBlock["type"] } | { kind: "block"; id: string } | null
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
      if (selectedId === id) setSelectedId(null);
    },
    [blocks, onChange, selectedId],
  );

  const selected = selectedId ? blocks.find((b) => b.id === selectedId) ?? null : null;

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
          <p className="block-editor__palette-hint">Drag onto the canvas, or drop between existing blocks.</p>
        </aside>

        <div className="block-editor__canvas">
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
                  onSelect={() => setSelectedId(b.id)}
                  onDelete={() => deleteBlock(b.id)}
                />
                <DropSlot index={i + 1} />
              </div>
            ))}
          </SortableContext>
          {blocks.length === 0 && (
            <p className="block-editor__empty">
              Drag a block from the left to start.
            </p>
          )}
        </div>

        <aside className="block-editor__inspector">
          {selected ? (
            <BlockInspector
              block={selected}
              onUpdate={(patch) => updateBlock(selected.id, patch)}
              onDelete={() => deleteBlock(selected.id)}
            />
          ) : (
            <p className="block-editor__inspector-empty">
              Select a block to edit its properties.
            </p>
          )}
        </aside>
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

function SortableBlock({
  block,
  selected,
  onSelect,
  onDelete,
}: {
  block: EmailBlock;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: block.id, data: { kind: "block" } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`block-editor__block${selected ? " block-editor__block--selected" : ""}`}
      onClick={onSelect}
    >
      <div className="block-editor__block-grip" {...attributes} {...listeners}>
        ⋮⋮
      </div>
      <div className="block-editor__block-preview">
        <BlockPreview block={block} />
      </div>
      <button
        type="button"
        className="block-editor__block-delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete block"
      >
        ×
      </button>
    </div>
  );
}

function BlockPreview({ block }: { block: EmailBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <div className="block-editor__preview-heading">
          {block.text || <span className="block-editor__placeholder">(empty heading)</span>}
        </div>
      );
    case "paragraph":
      return (
        <div
          className={`block-editor__preview-paragraph block-editor__preview-paragraph--${block.size || "normal"}`}
          dangerouslySetInnerHTML={{ __html: block.html || "(empty paragraph)" }}
        />
      );
    case "image":
      return block.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={block.src}
          alt={block.alt}
          className="block-editor__preview-image"
        />
      ) : (
        <div className="block-editor__preview-image-placeholder">
          Image: {block.alt || "(no source set)"}
        </div>
      );
    case "button":
      return (
        <div className="block-editor__preview-button-wrap">
          <span className="block-editor__preview-button">
            {block.label || "Button"}
          </span>
          {block.url && (
            <span className="block-editor__preview-button-url"> &rarr; {block.url}</span>
          )}
        </div>
      );
    case "separator":
      return (
        <div className="block-editor__preview-separator">
          <span>{block.height}px</span>
        </div>
      );
  }
}

function BlockInspector({
  block,
  onUpdate,
  onDelete,
}: {
  block: EmailBlock;
  onUpdate: (patch: Partial<EmailBlock>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="block-editor__inspector-body">
      <h3 className="block-editor__inspector-title">
        {BLOCK_LABELS[block.type]}
      </h3>

      {block.type === "heading" && (
        <>
          <label className="block-editor__label">Text</label>
          <input
            className="block-editor__input"
            value={block.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
          />
          <label className="block-editor__label">Level</label>
          <select
            className="block-editor__input"
            value={block.level}
            onChange={(e) =>
              onUpdate({ level: Number(e.target.value) as 1 | 2 | 3 })
            }
          >
            <option value={1}>H1 (largest)</option>
            <option value={2}>H2</option>
            <option value={3}>H3 (smallest)</option>
          </select>
          <label className="block-editor__label">Align</label>
          <AlignSelect value={block.align} onChange={(v) => onUpdate({ align: v })} />
        </>
      )}

      {block.type === "paragraph" && (
        <>
          <label className="block-editor__label">HTML allowed</label>
          <textarea
            className="block-editor__textarea"
            rows={6}
            value={block.html}
            onChange={(e) => onUpdate({ html: e.target.value })}
          />
          <p className="block-editor__hint">
            Tags: <code>&lt;strong&gt;</code>, <code>&lt;em&gt;</code>, <code>&lt;a&gt;</code>, <code>&lt;br&gt;</code>. Variables: <code>{"{{ first_name }}"}</code>, <code>{"{{ token }}"}</code>, <code>{"{{ unsubscribe_url }}"}</code>.
          </p>
          <label className="block-editor__label">Size</label>
          <select
            className="block-editor__input"
            value={block.size || "normal"}
            onChange={(e) =>
              onUpdate({
                size: e.target.value as "eyebrow" | "small" | "normal" | "large",
              })
            }
          >
            <option value="eyebrow">Eyebrow (small caps)</option>
            <option value="small">Small fineprint</option>
            <option value="normal">Normal body</option>
            <option value="large">Large lede</option>
          </select>
          <label className="block-editor__label">Align</label>
          <AlignSelect value={block.align} onChange={(v) => onUpdate({ align: v })} />
        </>
      )}

      {block.type === "image" && (
        <>
          <label className="block-editor__label">Source URL</label>
          <input
            className="block-editor__input"
            type="url"
            value={block.src}
            onChange={(e) => onUpdate({ src: e.target.value })}
            placeholder="https://..."
          />
          <label className="block-editor__label">Alt text</label>
          <input
            className="block-editor__input"
            value={block.alt}
            onChange={(e) => onUpdate({ alt: e.target.value })}
          />
          <label className="block-editor__label">Max width (px)</label>
          <input
            className="block-editor__input"
            type="number"
            value={block.max_width ?? 520}
            onChange={(e) => onUpdate({ max_width: Number(e.target.value) || 520 })}
          />
          <label className="block-editor__label">Link (optional)</label>
          <input
            className="block-editor__input"
            type="url"
            value={block.href || ""}
            onChange={(e) => onUpdate({ href: e.target.value })}
            placeholder="Make the image clickable"
          />
        </>
      )}

      {block.type === "button" && (
        <>
          <label className="block-editor__label">Label</label>
          <input
            className="block-editor__input"
            value={block.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
          />
          <label className="block-editor__label">URL</label>
          <input
            className="block-editor__input"
            type="url"
            value={block.url}
            onChange={(e) => onUpdate({ url: e.target.value })}
          />
          <label className="block-editor__label">Align</label>
          <AlignSelect value={block.align} onChange={(v) => onUpdate({ align: v })} />
        </>
      )}

      {block.type === "separator" && (
        <>
          <label className="block-editor__label">Height (px)</label>
          <input
            className="block-editor__input"
            type="number"
            value={block.height}
            onChange={(e) =>
              onUpdate({ height: Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </>
      )}

      <button
        type="button"
        className="admin-btn admin-btn--danger block-editor__inspector-delete"
        onClick={onDelete}
      >
        Delete block
      </button>
    </div>
  );
}

function AlignSelect({
  value,
  onChange,
}: {
  value: "left" | "center" | "right" | undefined;
  onChange: (v: "left" | "center" | "right") => void;
}) {
  return (
    <div className="block-editor__align">
      {(["left", "center", "right"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          className={`block-editor__align-btn${(value || "left") === opt ? " block-editor__align-btn--on" : ""}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
