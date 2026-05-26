"use client";

import { useRef } from "react";
import Image from "next/image";
import { focalCropStyle } from "@/lib/focal-crop";
import "./ArtCubeRadiant.css";

// Art hero in the site's cube language (cf. CubeVisualizer / ReleaseCubeRadiant),
// but for a static painting: the artwork is mapped onto a slowly self-rotating
// radiant cube, lit from behind by a blurred bloom of the piece itself. No
// audio, no navigation -- it exhibits the work in three dimensions. Pointer
// position adds a parallax tilt; idle auto-rotation respects reduced motion.

interface Props {
  imagePath: string;
  imageAlt: string | null;
  title: string;
  focalX?: number | null;
  focalY?: number | null;
  zoom?: number | null;
  /** "Sold" / "Reserved" ribbon, when the original is gone. */
  ribbon?: string | null;
}

export function ArtCubeRadiant({ imagePath, imageAlt, title, focalX, focalY, zoom, ribbon }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const cubeRef = useRef<HTMLDivElement>(null);

  function handleMove(e: React.PointerEvent) {
    const el = stageRef.current;
    const cube = cubeRef.current;
    if (!el || !cube) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5; // -0.5..0.5
    const py = (e.clientY - r.top) / r.height - 0.5;
    // Tilt toward the cursor; the idle spin keeps running underneath.
    cube.style.setProperty("--tilt-x", `${(-py * 16).toFixed(2)}deg`);
    cube.style.setProperty("--tilt-y", `${(px * 16).toFixed(2)}deg`);
  }

  function handleLeave() {
    const cube = cubeRef.current;
    if (!cube) return;
    cube.style.setProperty("--tilt-x", "0deg");
    cube.style.setProperty("--tilt-y", "0deg");
  }

  const faceStyle = focalCropStyle(focalX, focalY, zoom);
  const faces = ["front", "back", "right", "left", "top", "bottom"] as const;

  return (
    <div
      ref={stageRef}
      className="art-cube"
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      {/* Radiant bloom: an oversized, blurred copy of the piece behind the cube. */}
      <div className="art-cube__bloom" aria-hidden="true">
        <Image src={imagePath} alt="" fill sizes="700px" className="art-cube__bloom-img" unoptimized />
      </div>

      <div ref={cubeRef} className="art-cube__spin">
        <div className="art-cube__box">
          {faces.map((face) => (
            <div key={face} className={`art-cube__face art-cube__face--${face}`}>
              {face === "front" ? (
                <Image
                  src={imagePath}
                  alt={imageAlt || title}
                  fill
                  sizes="(max-width: 720px) 90vw, 520px"
                  priority
                  className="art-cube__face-img"
                  style={faceStyle}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePath} alt="" aria-hidden="true" className="art-cube__face-img" style={faceStyle} />
              )}
            </div>
          ))}
        </div>
      </div>

      {ribbon && <span className="art-cube__ribbon">{ribbon}</span>}
    </div>
  );
}
