"use client";

// NEW badge: the site's own icosahedron field (PsycheAura) at badge scale, in
// the Music door's blue, with the word sitting inside the cluster. Same nested
// shells, same golden-ratio falloff, same slow incommensurate spin -- this is
// the component the song pages use, not a copy of it.
//
// The word is DOM and the field is canvas, so getting the word *between* the
// shells takes two stacked instances of the same cluster: the inner two shells
// paint under the word, the outer two paint over it. Same hex and same seed,
// so the phases line up and it reads as one solid with a word suspended in it.
//
// Non-interactive: the badge rides on top of a product link, so the cursor
// tilt and the centre pause hotspot would fight the click target.
//
// The glitch belongs to the word alone (CSS), not the field -- the solid keeps
// turning cleanly through it.
//
// No ground and no decor: the aura bloom and the bright core are off on both
// instances, so nothing sits behind the wireframe. The badge is the lines and
// the word, over whatever the product photo happens to be.

import { PsycheAura } from "@/components/PsycheAura";

// The icosa door's hue in the hero animatic. Music is the blue solid.
const ICOSA_BLUE = "#4d7cff";

// Module scope: a fresh array literal per render would restart the field.
const INNER_SHELLS: [number, number] = [2, 4];
const OUTER_SHELLS: [number, number] = [0, 2];

// The solid runs 15% smaller than the field it sits in.
const FIELD_SCALE = 0.85;

export function MerchNewBadge({ seed }: { seed?: string | number }) {
  const key = seed ?? "new";
  return (
    <span className="merch-badge" role="img" aria-label="New">
      <span className="merch-badge__field">
        <PsycheAura
          hex={ICOSA_BLUE}
          seed={key}
          interactive={false}
          shellRange={INNER_SHELLS}
          scale={FIELD_SCALE}
          decor={false}
        />
      </span>
      <span className="merch-badge__word">New</span>
      <span className="merch-badge__field">
        <PsycheAura
          hex={ICOSA_BLUE}
          seed={key}
          interactive={false}
          shellRange={OUTER_SHELLS}
          decor={false}
          scale={FIELD_SCALE}
        />
      </span>
    </span>
  );
}
