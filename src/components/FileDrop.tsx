"use client";

import { useEffect, useRef, useState } from "react";

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// A self-contained drag-and-drop file unit wrapping a real <input type="file">
// so the form's FormData still picks it up. Dropped files are written back onto
// the input via DataTransfer; native `required` (file 1) keeps working because
// the input is screen-reader-hidden, not display:none. Clears on form reset.
export function FileDrop({
  name,
  label,
  accept,
  required = false,
}: {
  name: string;
  label: string;
  accept: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const form = inputRef.current?.closest("form");
    if (!form) return;
    const onReset = () => setFile(null);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const setInputFile = (f: File | null) => {
    const input = inputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    if (f) dt.items.add(f);
    input.files = dt.files;
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setInputFile(dropped);
  };

  return (
    <div
      className={`sw-filedrop${dragOver ? " is-dragover" : ""}${file ? " has-file" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        className="sw-filedrop__input"
        name={name}
        type="file"
        accept={accept}
        required={required}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="sw-filedrop__filled">
          <span className="sw-filedrop__filename" title={file.name}>
            {file.name}
          </span>
          <span className="sw-filedrop__size">{fmtSize(file.size)}</span>
          <button
            type="button"
            className="sw-filedrop__remove"
            onClick={() => setInputFile(null)}
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="sw-filedrop__prompt"
          onClick={() => inputRef.current?.click()}
        >
          <svg className="sw-filedrop__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="sw-filedrop__hint">Drop a file or browse</span>
          <span className="sw-filedrop__label">
            {label}
            {required && <span className="sw-filedrop__req"> *</span>}
          </span>
        </button>
      )}
    </div>
  );
}
