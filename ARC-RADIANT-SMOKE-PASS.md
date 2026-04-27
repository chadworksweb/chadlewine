# Arc Radiant v1 — Smoke Pass

Manual walkthrough to verify the v1 build is wired end-to-end. Run after migrations applied + ingests run.

## Prereqs
- Dev server running: `npm run dev` (port 8888)
- Logged in via `/cl-admin-6nnn`
- 14 migrations applied
- 3 ingests run (`life_events`, `eras`, `prose_sections` populated)
- Optional but recommended: feature flags `chad-lewine` and `chad-lewine-prose` set to `is_live=true` in `/admin/launch-control`

## 1. Public arc renders

- [ ] Visit `http://localhost:8888/chad-lewine`
- [ ] Page loads, ArcRadiant renders
- [ ] Year axis 1989 → next year visible
- [ ] Era bands (life on left, release on right) visible as faint colored backgrounds
- [ ] Songs render as dots positioned along the timeline
- [ ] Charge line renders as smoothed gradient path (only if rc_charge data is present — webhook hasn't fired yet, so this may be empty)
- [ ] Layer panel on the right shows 4 active toggles + 6 grayed phase-2 layers
- [ ] Toggling a layer hides/shows its rendering
- [ ] Clicking a song dot navigates to `/music/songs/[slug]`
- [ ] Clicking a life event opens an inline detail overlay with the event's body

## 2. Capture flow + stale-flag

- [ ] Visit `/admin/arc/capture`
- [ ] Pick "Life event" from the entity-kind dropdown
- [ ] Title: `Smoke test event`, date_start: `1995-06-01`, body: `Test capture for stale verification.`
- [ ] Click Capture
- [ ] Toast appears: "Captured." with `pre-catalog-1989-2009` listed under "Sections now stale" (date 1995 falls in 1989-2009 window)

## 3. Section Manager surfaces the stale

- [ ] Visit `/admin/arc/sections`
- [ ] Find row `pre-catalog-1989-2009` — should show ● stale (1) badge
- [ ] Click into the section
- [ ] Side panel shows the stale reason: `added life_event "Smoke test event"` with timestamp
- [ ] Dependencies panel shows `life_event · <id>...`

## 4. Publish flow

- [ ] In the section editor, edit the markdown (or just save as-is)
- [ ] Click Save Draft → toast confirms
- [ ] Click Publish to Site → confirmation modal → confirm
- [ ] Toast: "Published. Revision #1."
- [ ] Section row in list now shows: status=published, no stale badge, last published timestamp set

## 5. Build-time markdown export

- [ ] Run: `npm run prose:export`
- [ ] Output should report: `OK pre-catalog-1989-2009` (and any other published sections)
- [ ] Inspect the file: `prose/sections/pre-catalog-1989-2009.md` should have updated frontmatter + content
- [ ] `prose/sections/_order.json` should list published sections with order

## 6. Public prose view

- [ ] Toggle the `chad-lewine-prose` flag to `is_live=true` in `/admin/launch-control`
- [ ] Visit `http://localhost:8888/chad-lewine?view=prose&section=pre-catalog-1989-2009`
- [ ] Prose reader loads with TOC + sections
- [ ] Page auto-scrolls to the `pre-catalog-1989-2009` section
- [ ] Section content matches what was published
- [ ] Toggle flag back off; visit same URL — should redirect to `/chad-lewine` (param stripped)

## 7. Song state change → era stale

- [ ] Visit `/admin/arc/capture`, pick "Song state change"
- [ ] Pick any song with a `release_date` between 2011 and 2013 (e.g., `The Human Link` era)
- [ ] Set new state to `reissued`, click Capture
- [ ] Toast should list `brooklyn-i-2011-2013` as stale (the song's release_date falls in that window)
- [ ] Verify in `/admin/arc/sections` — that section shows ● stale

## 8. RC webhook receiver (optional, requires RC integration)

- [ ] Set `RC_WEBHOOK_SECRET` env var in `.env.local`
- [ ] POST to `/api/webhooks/rc-classification` with header `X-RC-Webhook-Secret: <secret>`
- [ ] Body: `{ "rc_song_id": 1, "match": { "isrc": "<known ISRC>" }, "classification": { "tier": "blue", "charge": 25, "calibrated_at": "..." } }`
- [ ] Response: `{ ok: true, matched: true, song_id: "..." }`
- [ ] `rc_sync_log` table has the new row
- [ ] Targeted song's `rc_*` fields updated

## Pass criteria

All checkboxes above tick. Failure on any item = capture the error and report.

## Known v1 limitations

- Pinch zoom uses snap-to-discrete-levels, no momentum/inertia
- Layer toggle state is session-only (resets on navigation away)
- No "revert to revision N" UI yet ← actually included; restore button on each revision in side panel
- No Visual Art / Writing / Geography / Relationships / Thematic / Industry layer rendering yet (data captureable, render deferred to v2)
- Charge line is empty until RC webhook fires (no initial-ingest backfill yet — Q1 follow-up)
