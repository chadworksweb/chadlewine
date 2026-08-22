# chadlewine.com shade-ramp favicon

The browser-tab reduction of the wordmark's shade ramp. **Locked 2026-08-21.**
Replaces the "CL" text box that had been the favicon since April.

## Editing it

```
node design/favicon/build.mjs
```

Change a number in `params.json`, run that, and everything moves together: the
master SVG, the whole PNG ladder, the `.ico`, and the five installed copies in
`public/`. Nothing in `out/` is drawn and nothing there should be edited
directly. The whole reason this folder exists is that a favicon which only
survives as exported binaries cannot be adjusted later without redrawing it from
scratch.

The bench that produced these values is an Artifact:
<https://claude.ai/code/artifact/332e75b9-39f3-4fbb-8cfe-4407a58a94ef> — drag
sliders, watch the true 16px raster on a simulated tab strip, then copy the
numbers back into `params.json`.

## What it is

The nav wordmark is flanked by a shade ramp built from block drawing characters
(`.site-nav__logo-frame` in `Nav.tsx`), and the same string sits on the curation
cards (`.curation-door__glyph`). Four characters, four densities, one ink:

```
U+2591  U+2592  U+2593  U+2588  U+2593  U+2592  U+2591
light ......................... solid ......................... light
```

That string is already the closest thing the site has to a logo mark, so the
favicon is its reduction rather than a new drawing. Method is the one the LEAM
pillar favicon used: draw at the size it is consumed at, keep a handful of
elements thick enough to survive, throw the rest away.

Seven bars, four units wide, mirrored around a solid centre, alpha stepping
0.25 / 0.5 / 0.75 / 1 and back down, heights ramping 8 / 12 / 16 / 20 so the
silhouette peaks in the middle. Colour is `--text-accent` `#8b9cf7`, sampled
from `global.css`, not chosen beside it.

## Decisions worth not re-litigating

- **Real alpha, not dither.** A block character fakes four densities by
  stippling one ink. Pixels do not need the fake, and at 16px the stipple is
  mush. Set `dither` to `1` to watch it happen rather than take the claim on
  trust.
- **Transparent, 2 units of padding.** No tile, no ground. `#8b9cf7` is a
  mid-tone, so unlike LEAM's pale marble it holds on a light tab strip without
  needing a hard offset shadow to give it an edge.
- **The height ramp is load-bearing.** Flat-topped bars read as a barcode. The
  0.6 ramp turns the same seven cells into a peak, which is what makes it a mark
  rather than a texture.
- **Snapped to the 16 grid.** Every edge lands on a whole pixel at 16px, so the
  bars are 2px each and the steps stay hard. Off-grid, neighbouring bars
  antialias into each other and the ramp stops stepping. Bar and gap are
  quantised *before* the fit, because snapping after it lets a rounded-up bar
  grow the ramp back past its padding.
- **Odd cell counts only.** The ramp mirrors around one solid block, so an even
  count has no centre and the mark sits off axis.
- **Adjacent cells at the same fill, alpha and height merge into one rect.** Two
  overlapping shapes of one fill composite their antialiased edges twice and
  print a darker seam down the join. Only reachable at `gap: 0`, which is where
  the shipped mark sits.
- **Each raster renders from the SVG at its own density.** A 512 resampled down
  to 16 is a different mark: every hard step becomes a gradient and the whole
  reduction is undone at the last moment.
- **The apple tile is flattened onto `--bg-deep` `#07070d`**, because Apple
  composites transparency against black anyway and black is this site's ground.

## Parked, not lost

`params.json` carries three switches the shipped mark does not use, kept because
they were real candidates:

| Switch | What it does |
|---|---|
| `mode: "single"` | The unmirrored climb `U+2591 U+2592 U+2593 U+2588` |
| `tone: "chroma"` | Freezes `@keyframes logo-shape-shimmer` from the nav: each density step takes the hue that step of the hover animation lands on |
| `brackets: 1` | The accent corner brackets from `.curation-door__bar` |

## Files

| Path | What |
|---|---|
| `params.json` | The locked numbers. The only file to edit. |
| `build.mjs` | Regenerates everything below. |
| `ramp-favicon.svg` | Master, 32x32, transparent. |
| `out/icon-{16..512}.png` | Raster ladder, each rendered from the SVG at its own density. |
| `out/favicon.ico` | 16 / 32 / 48, PNG payloads. |
| `out/apple-icon.png` | 180x180, flattened onto `#07070d`. |

Installed copies, all referenced from `icons` in `src/app/layout.tsx`:
`public/favicon.svg`, `public/favicon.ico`, `public/apple-icon.png`,
`public/icon-192.png`, `public/icon-512.png`.

## The shareable suite

```
node design/favicon/build.mjs --suite
```

Also writes `Dropbox/Chad Lewine/branding/chadlewine-icon-suite/`, which is the
copy for everything that is not this website: avatars, decks, print, anyone who
needs the logo and does not have the repo. It has its own README. Regenerated
from `params.json` rather than snapshotted, so it cannot drift, which also means
an edit made directly to a file in there is thrown away by the next build.

It carries **opaque** variants on `#07070d` and on white, which the web assets
deliberately do not. Every platform composites a transparent PNG against a
ground of its own choosing, and on white the 0.25-alpha outer bars nearly
vanish. Those tiles are square, never pre-rounded, because platforms apply their
own corner radius or circle crop and a pre-rounded mark gets rounded twice. The
mark clears a circle crop at every size in the suite.
