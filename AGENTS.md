# Layout: full site width, NEVER a thin centered column

**Every page and new layout renders full site width through the global page-shell grid, exactly like every other page on the site.** This is a hard rule — do not ask, do not default to anything narrower.

- The standard pattern is `page-static` + the existing grid/card classes. Copy the **account dashboard**: `page-static account-dashboard` → `account-dashboard__grid` (two-column) → `account-dashboard__card`. The `/preferences` page is built this way; use it as the template.
- **NEVER** put `max-width`, `margin: auto`, `place-items: center`, or horizontal padding on a page wrapper, and **never** create a new `*-page { max-width: Npx }` centered shell.
- The `unsubscribe-page` centered-column block is a legacy exception, **not** a model to copy. Don't reach for it.
- Before writing any new layout CSS, reuse an existing full-width layout (account dashboard, admin pages). Only use a narrower measure if the user explicitly asks for one.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Testing on mobile (LAN)

**Always build and serve the production output. Never test mobile against `npm run dev`.**

```
npm run build
npx next start -p 8888 -H 0.0.0.0
```

Then visit `http://<PC-LAN-IP>:8888` from the phone (find the IP with `ipconfig`). Do this before chasing any "it doesn't work on mobile" bug.

This note used to say dev over LAN "does not hydrate React on iPhone" and blamed the HMR WebSocket. That was a misdiagnosis, and it cost real time on 2026-07-29 by making a genuine hydration crash look like a known dev-server quirk. What was actually happening: React threw hydration error #418 in **production too**, discarded the server HTML, and re-rendered the whole client tree. See the hydration section below.

# Hydration: never let a runtime choose a string that gets server-rendered

**Anything formatted with `Intl` / `toLocaleString` and rendered during SSR must be assembled from `formatToParts`, never from the formatted string.** ICU picks the *literals* between the fields, and CLDR changes its mind about them between versions, so Node and a visitor's browser disagree on bytes that are invisible on screen:

- en-US joins a date to a time as either `{date}, {time}` or `{date} at {time}`
- the clock is separated from AM/PM by either a space or U+202F NARROW NO-BREAK SPACE

Measured on the homepage 2026-07-29: Node 24 (ICU 77) rendered `Jul 27, 2026, 7:06:38 PM`; an iPhone rendered `Jul 27, 2026 at 7:06:38 PM`. React threw #418, regenerated the tree, and every class the hero had stamped on `<html>` before first paint went with it, which broke the intro's typed reveal and its scroll lock at once. Pinning the timezone (already done) does not help; the timezone was never the variable.

`formatStreamDate` in `HomepageFeed.tsx` is the worked example.

Two things follow from this:

- **A hydration failure is not local.** React regenerates the tree from the root, so it silently reverts any pre-paint DOM mutation. A bug that presents as "my class is missing" or "my pre-hydration script didn't run" is often this.
- **`<html>` carries `suppressHydrationWarning`** because the hero's boot script deliberately stamps classes on it before hydration. React's tree has no `className` there, and it reports a mismatch it will not patch up.

To reproduce engine-specific hydration bugs locally, use **real WebKit**, not Chromium with an iOS user agent (Chromium shares Node's ICU, so it cannot see this class of bug):

```js
import { webkit } from "playwright";   // NOT chromium + devices["iPhone ..."]
```
