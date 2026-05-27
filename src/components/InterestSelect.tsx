"use client";

import { useEffect, useId, useRef, useState } from "react";

interface Opt {
  value: string;
  label: string;
}

// Custom dropdown for the inquiry "interest" field. Native <select> popups
// can't theme the highlighted-option color in Chrome (it falls back to the OS
// sky-blue), so this renders its own listbox where the active row uses the
// brand accent. A hidden input carries the value into the form's FormData, and
// it clears itself when the form resets after a successful submit.
export function InterestSelect({
  name,
  options,
  placeholder,
}: {
  name: string;
  options: readonly Opt[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Clear when the parent form resets (the form does form.reset() on success).
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const onReset = () => {
      setValue("");
      setActive(0);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const choose = (v: string) => {
    setValue(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) choose(options[active].value);
      else setOpen(true);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="sw-cselect" ref={rootRef}>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        className="sw-cselect__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? undefined : "sw-cselect__placeholder"}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="sw-cselect__chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul className="sw-cselect__list" role="listbox" id={listId}>
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`sw-cselect__opt${i === active ? " is-active" : ""}${
                o.value === value ? " is-selected" : ""
              }`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o.value);
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
