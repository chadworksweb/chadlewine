# Title Reveal Effect Variants

Both use the same TitleReveal.tsx component (canvas comet trail).
The difference is CSS only.

## Variant A: Art reveals INSIDE letter shapes (current goal)
Canvas on top (z-index 2), draws art trails, masks to text shape via canvas destination-in compositing.
Text underneath stays white, art appears inside the letters where cursor has been.

## Variant B: Art reveals OUTSIDE letters — "Scratch-Off" (ss26)
Canvas behind (z-index 1), draws dark bg + art trails.
Text div on top (z-index 2) with:
```css
.title-reveal__text {
  position: relative;
  z-index: 2;
  background: var(--bg, #0a0a0f);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
```
Canvas fills dark bg + art circles. Text div blocks canvas everywhere with dark bg,
but `background-clip: text` + `text-fill-color: transparent` makes letter shapes
transparent windows showing the canvas art through.

Result: dark text with art visible through letter cutouts. Letters act as windows.
Use for: `/scratch` scratch-off feature.

Canvas order for Variant B (in JSX):
```jsx
<canvas className="title-reveal__canvas" />  {/* z-index 1, behind */}
<div className="title-reveal__text">         {/* z-index 2, on top */}
  {children}
</div>
```

Canvas draw for Variant B fills dark bg first:
```js
ctx.fillStyle = "#0a0a0f";
ctx.fillRect(0, 0, w, h);
// then draw art circles on top
```
