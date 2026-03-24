"use client";

import { useEffect, useRef, useState } from "react";

export function ProgressBar() {
  const [width, setWidth] = useState(0);
  const ticking = useRef(false);

  useEffect(() => {
    function onScroll() {
      if (!ticking.current) {
        requestAnimationFrame(() => {
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
          setWidth(docHeight > 0 ? (scrollTop / docHeight) * 100 : 0);
          ticking.current = false;
        });
        ticking.current = true;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="progress-bar"
      style={{ width: `${width}%` }}
      aria-hidden="true"
    />
  );
}
