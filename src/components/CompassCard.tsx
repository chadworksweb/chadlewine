"use client";

import { useEffect, useRef, useState } from "react";
import {
  renderCompass,
  setCompassDegree,
  setCompassDate,
} from "@/lib/rc-compass";

interface CompassData {
  date: string | null;
  compass_degree: number | null;
  charge_level: string | null;
  has_reading: boolean;
}

function formatLongDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function CompassCard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<CompassData | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rc/compass-current")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: CompassData) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Render the SVG skeleton once on mount.
  useEffect(() => {
    if (containerRef.current) renderCompass(containerRef.current);
  }, []);

  // Push degree/charge into the SVG once data is in.
  useEffect(() => {
    if (!containerRef.current || !data || !data.has_reading) return;
    if (data.compass_degree == null || !data.charge_level) return;
    setCompassDegree(containerRef.current, data.compass_degree, data.charge_level);
    setCompassDate(containerRef.current, formatLongDate(data.date).toUpperCase());
  }, [data]);

  return (
    <div className="rc-card rc-card--compass">
      <div className="rc-card__header">Today&rsquo;s Charge</div>
      <div ref={containerRef} className="rc-card__compass-host" />
      {errored && (
        <p className="rc-card__error">
          Couldn&rsquo;t load the compass.{" "}
          <a href="https://risingcompass.net" target="_blank" rel="noopener noreferrer">
            Open Rising Compass &rarr;
          </a>
        </p>
      )}
    </div>
  );
}
