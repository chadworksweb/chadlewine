"use client";

import { useRef, useState } from "react";
import { uploadMedia } from "@/lib/upload-media";

interface BunnyMusicUploaderProps {
  // Stored value — relative path inside the music-downloads zone, e.g.
  // "songs/35/35_Chad-Lewine.mp3". Empty string = nothing stored.
  value: string | null;
  // Called with the new relative path (or null on clear) so the parent can
  // persist it. The text-input override below also flows through this.
  onChange: (path: string | null) => void;
  // Bunny zone folder, e.g. "songs/35" or "ringtones".
  folder: string;
  // Required file extension — used both as the file picker filter and to
  // validate the picked file before upload. Lowercase, leading dot.
  acceptExtension: string;
  label: string;
  fieldId: string;
}

const MAX_BYTES = 200 * 1024 * 1024;

export function BunnyMusicUploader({
  value,
  onChange,
  folder,
  acceptExtension,
  label,
  fieldId,
}: BunnyMusicUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const folderReady = folder.trim().length > 0 && !folder.endsWith("/");

  async function handleFile(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith(acceptExtension)) {
      setError(`Pick a ${acceptExtension.toUpperCase().slice(1)} file.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`File exceeds ${MAX_BYTES / (1024 * 1024)} MB limit.`);
      return;
    }
    if (!folderReady) {
      setError("Save the song first so the folder path is available.");
      return;
    }

    setUploading(true);
    try {
      const result = await uploadMedia(file, {
        type: "music-download",
        folder,
        filename: file.name,
      });
      onChange(result.path);
      if (result.renamedTo) {
        setError(`That name was taken, so it uploaded as "${result.renamedTo}".`);
      }
    } catch (e) {
      setError((e as Error).message || "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function pick() {
    if (uploading || !folderReady) return;
    inputRef.current?.click();
  }

  function clear() {
    if (uploading) return;
    onChange(null);
  }

  return (
    <div className="obsv-editor__field">
      <label className="obsv-editor__label" htmlFor={fieldId}>{label}</label>
      <div style={{ display: "flex", gap: "var(--space-xs)", alignItems: "center" }}>
        <input
          id={fieldId}
          className="obsv-editor__input obsv-editor__input--mono"
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={`${folder || "<save first>"}/your-file${acceptExtension}`}
          disabled={uploading}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="admin-btn"
          onClick={pick}
          disabled={uploading || !folderReady}
          title={folderReady ? "Upload to Bunny" : "Save the song first to enable upload"}
        >
          {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
        </button>
        {value && !uploading && (
          <button type="button" className="admin-btn admin-btn--danger" onClick={clear} title="Clear path">
            Clear
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={acceptExtension}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {error && (
        <p style={{ margin: "var(--space-xs) 0 0", fontSize: "0.75rem", color: "#ff6b6b" }}>
          {error}
        </p>
      )}
      {uploading && (
        <p style={{ margin: "var(--space-xs) 0 0", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
          Uploading… large files can take a minute.
        </p>
      )}
    </div>
  );
}
