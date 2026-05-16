"use client";

import { useRef, useEffect, useState, useCallback } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

interface UseAutosaveOptions<T> {
  /** Current form data */
  data: T;
  /** API base path, e.g. "/api/admin/observations" */
  endpoint: string;
  /** Record ID — undefined for new records */
  id: string | undefined;
  /** Build the POST/PUT payload from current data */
  buildPayload: (data: T) => Record<string, unknown>;
  /** Called after first POST creates the record (receives new ID) */
  onCreated?: (id: string) => void;
  /** Debounce delay in ms */
  delay?: number;
  /** Whether autosave is ready (e.g. data loaded) */
  enabled?: boolean;
}

export function useAutosave<T>({
  data,
  endpoint,
  id,
  buildPayload,
  onCreated,
  delay = 800,
  enabled = true,
}: UseAutosaveOptions<T>) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(id);
  const inflightRef = useRef(false);
  const pendingRef = useRef(false);
  const initializedRef = useRef(false);
  const lastPayloadRef = useRef<string>("");

  // Keep idRef in sync
  useEffect(() => {
    idRef.current = id;
  }, [id]);

  const saveNow = useCallback(
    async (payload: Record<string, unknown>) => {
      const json = JSON.stringify(payload);

      // Skip if nothing changed
      if (json === lastPayloadRef.current) return;
      lastPayloadRef.current = json;

      // If already saving, mark pending and bail
      if (inflightRef.current) {
        pendingRef.current = true;
        return;
      }

      inflightRef.current = true;
      setStatus("saving");

      const isNew = !idRef.current;
      const url = isNew ? endpoint : `${endpoint}/${idRef.current}`;
      const method = isNew ? "POST" : "PUT";

      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: json,
        });

        if (!res.ok) {
          setStatus("error");
          inflightRef.current = false;
          return;
        }

        const result = await res.json();

        if (isNew && result.id) {
          idRef.current = result.id;
          onCreated?.(result.id);
        }

        setStatus("saved");
      } catch {
        setStatus("error");
      } finally {
        inflightRef.current = false;

        // If changes came in while saving, fire again
        if (pendingRef.current) {
          pendingRef.current = false;
          const freshPayload = buildPayload(data);
          saveNow(freshPayload);
        }
      }
    },
    [endpoint, onCreated, buildPayload, data]
  );

  // Watch data and debounce
  useEffect(() => {
    if (!enabled) return;

    // Skip the very first render (initial load)
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastPayloadRef.current = JSON.stringify(buildPayload(data));
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      saveNow(buildPayload(data));
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, delay, enabled, buildPayload, saveNow]);

  // Flush on unmount / page leave
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        // Sync save on unmount
        const payload = buildPayload(data);
        const json = JSON.stringify(payload);
        if (json !== lastPayloadRef.current && idRef.current) {
          navigator.sendBeacon?.(
            `${endpoint}/${idRef.current}`,
            new Blob([json], { type: "application/json" })
          );
        }
      }
    };
  }, []);

  /** Force an immediate save (e.g. before publish) */
  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    return saveNow(buildPayload(data));
  }, [saveNow, buildPayload, data]);

  return { status, flush };
}
