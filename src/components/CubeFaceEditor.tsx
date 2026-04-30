"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { focalCropStyle } from "@/lib/focal-crop";
import { MediaLibrary } from "./MediaLibrary";

export type ReleaseType = "album" | "song";

interface Face {
  slot: number;
  media_type: "image" | "video";
  media_path: string;
  focal_x: number | null;
  focal_y: number | null;
  zoom: number | null;
}

interface CubeFaceEditorProps {
  releaseType: ReleaseType;
  releaseId: string;
}

const SLOT_LABELS: Record<number, string> = {
  1: "Front",
  2: "Top",
  3: "Right",
  4: "Bottom",
  5: "Left",
};

const EMPTY_FACES: Face[] = [1, 2, 3, 4, 5].map((slot) => ({
  slot,
  media_type: "image",
  media_path: "",
  focal_x: null,
  focal_y: null,
  zoom: 1,
}));

export function CubeFaceEditor({ releaseType, releaseId }: CubeFaceEditorProps) {
  const [faces, setFaces] = useState<Face[]>(EMPTY_FACES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch(
        `/api/admin/release-cube-faces?type=${releaseType}&id=${encodeURIComponent(releaseId)}`,
      );
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json();
        const bySlot = new Map<number, Face>();
        for (const f of (data.faces ?? []) as Face[]) bySlot.set(f.slot, f);
        setFaces(EMPTY_FACES.map((f) => bySlot.get(f.slot) ?? f));
      } else {
        setError("Failed to load faces");
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [releaseType, releaseId]);

  const updateFace = useCallback((slot: number, patch: Partial<Face>) => {
    setFaces((prev) => prev.map((f) => (f.slot === slot ? { ...f, ...patch } : f)));
  }, []);

  const clearFace = useCallback((slot: number) => {
    setFaces((prev) =>
      prev.map((f) =>
        f.slot === slot
          ? { slot, media_type: "image", media_path: "", focal_x: null, focal_y: null, zoom: 1 }
          : f,
      ),
    );
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    const payload = {
      faces: faces
        .filter((f) => f.media_path.trim() !== "")
        .map((f) => ({
          slot: f.slot,
          media_type: f.media_type,
          media_path: f.media_path,
          focal_x: f.focal_x,
          focal_y: f.focal_y,
          zoom: f.zoom,
        })),
    };
    const res = await fetch(
      `/api/admin/release-cube-faces?type=${releaseType}&id=${encodeURIComponent(releaseId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Save failed");
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="cube-face-editor">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
          Loading cube faces…
        </p>
      </div>
    );
  }

  return (
    <div className="cube-face-editor">
      <div className="cube-face-editor__header">
        <div>
          <h3 className="cube-face-editor__title">Discography Cube Faces</h3>
          <p className="cube-face-editor__hint">
            5 face slots for the simpler discography cube. Empty slots fall back to cover art.
          </p>
        </div>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save Faces"}
        </button>
      </div>

      {error && <p className="cube-face-editor__error">{error}</p>}

      <div className="cube-face-editor__grid">
        {faces.map((face) => (
          <FaceSlotRow
            key={face.slot}
            face={face}
            onUpdate={updateFace}
            onClear={clearFace}
            onOpenPicker={() => setPickerSlot(face.slot)}
          />
        ))}
      </div>

      <MediaLibrary
        open={pickerSlot !== null}
        onClose={() => setPickerSlot(null)}
        onSelect={(url) => {
          if (pickerSlot != null) {
            updateFace(pickerSlot, {
              media_type: "image",
              media_path: url,
              focal_x: 50,
              focal_y: 50,
              zoom: 1,
            });
          }
          setPickerSlot(null);
        }}
        uploadZone="cover-art"
      />
    </div>
  );
}

interface FaceSlotRowProps {
  face: Face;
  onUpdate: (slot: number, patch: Partial<Face>) => void;
  onClear: (slot: number) => void;
  onOpenPicker: () => void;
}

function FaceSlotRow({ face, onUpdate, onClear, onOpenPicker }: FaceSlotRowProps) {
  const isEmpty = !face.media_path;
  const isVideo = face.media_type === "video";
  const [videoDraft, setVideoDraft] = useState(isVideo ? face.media_path : "");
  const previewRef = useRef<HTMLDivElement>(null);

  function commitVideo() {
    const path = videoDraft.trim();
    if (!path) return;
    onUpdate(face.slot, {
      media_type: "video",
      media_path: path,
      focal_x: face.focal_x ?? 50,
      focal_y: face.focal_y ?? 50,
      zoom: face.zoom ?? 1,
    });
  }

  function handleFocalClick(e: React.MouseEvent<HTMLDivElement>) {
    const el = previewRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onUpdate(face.slot, {
      focal_x: Number(Math.max(0, Math.min(100, x)).toFixed(2)),
      focal_y: Number(Math.max(0, Math.min(100, y)).toFixed(2)),
    });
  }

  const fx = face.focal_x ?? 50;
  const fy = face.focal_y ?? 50;
  const z = face.zoom && face.zoom > 1 ? face.zoom : 1;
  const cropStyle = focalCropStyle(face.focal_x, face.focal_y, face.zoom);

  return (
    <div className="cube-face-editor__row">
      <div className="cube-face-editor__row-label">
        <span className="cube-face-editor__slot-num">{face.slot}</span>
        <span className="cube-face-editor__slot-name">{SLOT_LABELS[face.slot]}</span>
      </div>

      <div className="cube-face-editor__preview-wrap">
        <div
          ref={previewRef}
          className="cube-face-editor__preview"
          onClick={isEmpty ? undefined : handleFocalClick}
          aria-label={isEmpty ? "Empty slot" : "Click to set focal point"}
        >
          {isEmpty && <span className="cube-face-editor__preview-empty">empty</span>}
          {!isEmpty && !isVideo && (
            <img
              src={face.media_path}
              alt=""
              className="cube-face-editor__preview-img"
              style={cropStyle}
              draggable={false}
            />
          )}
          {!isEmpty && isVideo && (
            <video
              src={face.media_path}
              className="cube-face-editor__preview-video"
              style={cropStyle}
              autoPlay
              muted
              loop
              playsInline
            />
          )}
          {!isEmpty && (
            <span
              className="cube-face-editor__focal-dot"
              style={{ left: `${fx}%`, top: `${fy}%` }}
            />
          )}
        </div>
      </div>

      <div className="cube-face-editor__controls">
        <div className="cube-face-editor__control-group">
          <button
            type="button"
            className="admin-btn admin-btn--small"
            onClick={onOpenPicker}
          >
            Pick Image
          </button>

          <div className="cube-face-editor__video-row">
            <input
              type="text"
              className="cube-face-editor__video-input"
              placeholder="/videos/file.mp4"
              value={videoDraft}
              onChange={(e) => setVideoDraft(e.target.value)}
              onBlur={commitVideo}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitVideo();
                }
              }}
            />
            <button
              type="button"
              className="admin-btn admin-btn--small"
              onClick={commitVideo}
            >
              Set Video
            </button>
          </div>

          {!isEmpty && (
            <button
              type="button"
              className="admin-btn admin-btn--small admin-btn--danger"
              onClick={() => {
                onClear(face.slot);
                setVideoDraft("");
              }}
            >
              Clear
            </button>
          )}
        </div>

        {!isEmpty && (
          <div className="cube-face-editor__zoom-row">
            <label className="cube-face-editor__zoom-label">Zoom</label>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={z}
              onChange={(e) => onUpdate(face.slot, { zoom: parseFloat(e.target.value) })}
              className="cube-face-editor__zoom-slider"
            />
            <code className="cube-face-editor__zoom-value">{z.toFixed(2)}×</code>
            <span className="cube-face-editor__focal-meta">
              x: {fx.toFixed(0)}% · y: {fy.toFixed(0)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
