# Session pickup - 2026-06-20 (chadlewine.com)

Crash-safety notes + resume prompt. Covers a long session: email/front-desk work,
a full double opt-in build, subscribe-form styling, and a new homepage Gallery Wall.

Supabase project ref: `dyjvcjbgnvjkubrsqnym` (local `.env.local` points at this HOSTED db,
so any template/DB edit is live immediately; CODE changes need a deploy).

---

## STATUS AT A GLANCE

LIVE IN DB NOW (already affecting real data):
- `welcome-01` email template fully rewritten ("The Deprogrammer's Digest" welcome).
- `confirm-01` email template created (double opt-in confirmation email).
- 10 art pieces given made-up `dimensions` (8x10in .. 60x36in) for the Gallery Wall test.

CODE, NOT YET DEPLOYED (works locally; ship to see on prod):
- Double opt-in behavior (pending -> confirm -> active).
- Welcome reply routing to the front desk (`reply_to = EMAIL_REPLY_TO`).
- No-key triage fallback in the inbound front desk.
- Subscribe-form confirmation styling + copy.
- The Gallery Wall homepage section.

Dev server: was left running on http://localhost:8888 (npm run dev). Typecheck: 0 errors.

COMMITTED 2026-06-20 to the `staging` branch (NOT pushed, NOT deployed). Only THIS
session's files were staged - the repo had unrelated work-in-progress (transcend-spike,
RoomView, SongEditor, several migrations, backup scripts, vercel.json, etc.) which was
deliberately left untouched. For `global.css`, only the `.subscribe-section__success`
hunk was committed (the file also held unrelated pending CSS, left unstaged).

---

## 1. Front desk + welcome reply routing
- `src/lib/subscriber-welcome.ts`: welcome now sends with `replyTo: process.env.EMAIL_REPLY_TO`
  (the `reply@...` receiving address) so a subscriber's reply flows into the inbound
  webhook -> ingest -> Opus triage -> ping/queue, same as campaign replies.
  Also now passes `preferences_url` so the footer "Manage preferences" link renders.
- `src/lib/inbound.ts`: if `ANTHROPIC_API_KEY` is empty, triage is SKIPPED cleanly
  (message inserted, `triaged=false`, `triage_error=null` = the clean "not looked at"
  state). A present-but-failing key still fails closed WITH `triage_error` set.

## 2. welcome-01 template (LIVE in DB)
- Heading: "Welcome To The Deprogrammer's Digest" (no period).
- Preheader: "tuning signal... standby for comms..."
- Subject still "Thank you for subscribing." (NOT changed - Chad may want to align it to
  the Deprogrammer's Digest name; OPEN QUESTION).
- Body = Chad's manifesto copy + the "One request:" reply ask paragraph at the end.

## 3. Double opt-in (DOI) - full build, CODE pending deploy
New flow: subscribe -> row `pending` + confirm email (NOT welcome, NOT admin ping)
-> click confirm link -> `/confirm` page -> button POSTs -> row flips `active`,
THEN welcome fires + admin new-member ping.

NEW files:
- `src/lib/subscriber-confirm.ts` - sends confirm-01 (transactional; passes only
  `confirm_url` so footer unsub/prefs links stay hidden). reply_to = EMAIL_REPLY_TO.
- `src/app/api/confirm/route.ts` - GET redirects to /confirm page; POST does the flip.
- `src/app/(public)/confirm/page.tsx` + `src/components/ConfirmClient.tsx` - mirror the
  unsubscribe page (scanner-safe: GET only looks up, POST mutates).

CHANGED files:
- `src/lib/audience.ts`:
  - `upsertAudienceFromSubscribe` now returns `{ audienceId, status }`, sets new/never
    rows to `pending` + sends confirm (instead of active + welcome). Returns resolved
    status so the legacy `subscribers` mirror is not wrongly downgraded.
  - NEW `confirmSubscriptionByToken(token)` - flips pending->active, fires welcome +
    ping. Idempotent (already-active = no-op); does NOT reactivate an unsubscribed row.
- `src/app/api/subscribe/route.ts` - legacy `subscribers` mirror writes the resolved
  `status` (pending for new signups).
- `src/lib/cart-recovery.ts` + `src/app/api/cron/fan-track-drip/route.ts` - now also
  EXCLUDE `pending` (an unconfirmed contact gets nothing until they confirm).
- `src/lib/audience-notify.ts` - added a `pending` MemberTier (label "Pending
  (unconfirmed)"), deriveTier returns it, and notifyTierChange never pings on it.
- `src/components/AudienceAdmin.tsx` - new "Pending" stat card + tab.
- `src/components/SubscribeModal.tsx` + `SubscribeSection.tsx` - success copy changed.

confirm-01 template (LIVE in DB):
- Subject: "Confirm Subscription to Chad Lewine's Email List"
- Body: "Thanks again. Please click the button below to officially join my email list
  and receive my welcome message." + button -> {{confirm_url}}.

TESTED end-to-end (Playwright + DB): subscribe->pending->confirm page click->active,
events `subscribed, confirmed`, welcome sent, idempotent "Already confirmed." on revisit.

NOTE: campaign sends already filter `subscriber_status='active'`, so pending never leaks.
NOTE: account-register path is already DOI via Supabase; unchanged.

## 4. Subscribe-form confirmation (SubscribeSection - footer form on every page)
- `src/components/SubscribeSection.tsx` success message:
  "Thank you. NOTE: To protect your privacy and prevent spam, I use a double opt-in
  email system. Please check your email to confirm you want to be on this list."
- `.subscribe-section__success` in `src/styles/global.css`: restyled to a stylized
  boxed block - brand serif `var(--font-body)`, bright blue `var(--text-accent)`,
  bordered/tinted/glowing box. (Chad asked for "one line" but the copy is ~150 chars and
  overflows as a single physical line, so it wraps inside the box. OPEN: he may still
  want literal nowrap. The modal popup still uses old short copy/plain style - OPEN:
  match it to this?)

## 5. Art dimensions (LIVE in DB - TEST DATA)
- 10 visible art pieces given made-up `dimensions` (standard canvas sizes 8x10in..60x36in,
  incl. two 5-footers). Chad asked to seed only ~10 for testing, NOT all.
  Pieces with dims: Ancient Artifact 1, Ancient Symbol 3 (the one REAL value 16x20in),
  Ardent One, Emergence 2, Hamilton, Have A Heart, Interstitial, One Possible Way,
  Untitled 2011, When You Were Young.
- These show on the public /art pages too (made-up). Replace with real values anytime.

## 6. Gallery Wall - NEW homepage section (CODE pending deploy)
Concept (Chad's): full-viewport (100vh) virtual gallery wall at real architectural scale
(22ft x 14ft). Pieces sized from REAL dimensions (a 5ft canvas dwarfs an 8x10), scattered
salon-hang style, random each load. Digitized/glitch aesthetic: tech-wireframe FRAMES,
the ART flickers, the whole wall is subtly glitchy. Click a piece -> clean lightbox +
"View piece ->" link to /art/[slug].

NEW files:
- `src/components/GalleryWall.tsx` (client) + `src/components/GalleryWall.css`.
CHANGED:
- `src/app/(public)/page.tsx` - new `getGalleryArt()` (fetches pieces WHERE dimensions
  IS NOT NULL, Fisher-Yates shuffles server-side, returns a RANDOM 30 = GALLERY_WALL_POOL;
  rotates each ISR regen). Added to the Promise.all, and `<GalleryWall pieces={galleryArt} />`
  rendered between `<ExploreSongs/>` and the `song-brief-feed` section. Title bar
  "Browse Chad Lewine Art". (Only 10 measured pieces today, so all 10 show; pool scales.)

How it works: parses `dimensions` -> uses LONGEST side as real size + the image's own
aspect ratio for shape (so nothing crops). Pieces without parseable dims fall back to an
assumed 26in longest side. Placement is rejection-sampling (non-overlap) in inch
coordinates, done once per load; resize only re-scales px-per-inch. prefers-reduced-motion
disables the animations.

TESTED: renders 10 pieces at true-scale, lightbox opens with title/meta/View piece/close.
Screenshots: `Dropbox/Debug/gallery-wall.png`, `gallery-wall-lightbox.png`,
`subscribe-confirmation-styled.png`.

POSSIBLE NEXT STEPS on the wall:
- Open it to all pieces (drop the `.not("dimensions","is",null)` filter; the aspect-ratio
  fallback handles unmeasured pieces) once more dims exist.
- Mobile/portrait: wall is contain-fit so the hang region is a short band on tall screens
  - acceptable v1, may want a mobile-specific treatment.
- 10 pieces on a 22x14 wall reads a bit sparse - more pieces or a smaller modeled wall.
- Add a "View all art ->" link to /art somewhere in the section if desired.

---

## CLEANUP / LOOSE ENDS
- Leftover test rows in `audience` for `chad+formpreview@chadworks.co` (pending, from the
  subscribe-form styling preview). Harmless (pending = excluded from sends). Delete when
  convenient: `delete from audience where email='chad+formpreview@chadworks.co'` (+ its
  subscribers/audience_events/audience_tags rows).
- Throwaway script `scripts/_test-welcome-email.ts` left in place (sends welcome-01 to a
  test address). `scripts/_test-doi.ts` was removed.
- This file (`SESSION-PICKUP-2026-06-20.md`) can be deleted once work resumes.

## OPEN QUESTIONS FOR CHAD
1. welcome-01 subject - align to "The Deprogrammer's Digest" name?
2. Subscribe success - keep wrapped box, or force literal one line (overflows)?
3. Match the popup MODAL's confirmation to the new boxed style/copy?
4. Gallery Wall - happy with the look? open to all pieces? add "View all art" link?
5. Ship everything to STAGING?

---

## PICKUP PROMPT (paste into a fresh session to resume)

```
Resuming work on chadlewine.com (C:\Users\chad\Local Sites\chadlewine, Next.js 16 +
Supabase ref dyjvcjbgnvjkubrsqnym; local .env.local points at the hosted db so DB edits
are live, code changes need deploy). Read SESSION-PICKUP-2026-06-20.md at the project
root for full context. Summary of where we are:

Built this session (CODE = local, not deployed; DB = live):
- Email front desk: welcome now replies to EMAIL_REPLY_TO; no-ANTHROPIC_API_KEY triage
  fallback. (code)
- welcome-01 + confirm-01 email templates rewritten. (DB, live)
- Full double opt-in: subscribe -> pending + confirm email -> /confirm click -> active +
  welcome. New files: subscriber-confirm.ts, api/confirm/route.ts, (public)/confirm/page.tsx,
  ConfirmClient.tsx; edits across audience.ts, audience-notify.ts, subscribe/route.ts,
  cart-recovery.ts, fan-track-drip, AudienceAdmin.tsx, both subscribe forms. Tested e2e. (code)
- Subscribe footer-form confirmation: new copy + stylized blue serif box. (code + nothing in DB)
- 10 art pieces seeded with made-up dimensions for testing. (DB, live)
- Gallery Wall homepage section: full-viewport real-scale digitized gallery wall between
  ExploreSongs and song-brief-feed; GalleryWall.tsx/.css + page.tsx wiring. Tested. (code)

Typecheck is clean (npx tsc --noEmit = 0 errors). Dev server: npm run dev on :8888.

Open items: (1) align welcome-01 subject to "The Deprogrammer's Digest"? (2) subscribe
success - keep wrapped box or force one line? (3) match the popup modal style? (4) Gallery
Wall tweaks / open to all pieces / add "View all art" link? (5) ship to staging?

Do NOT deploy unless I say so (Vercel builds burn minutes; staging on request, master only
on explicit merge). Ask me which of the open items to tackle.
```
