# Arc Radiant v1 — Pre-Build Audit

**Date:** 2026-04-26
**Auditor:** Claude (Phase A, no code changes)
**Scope:** Cross-checks build prompt §5–§14 against the live chadlewine.com codebase as of today. The investigation report from 2026-04-22 is treated as absorbed context; this audit only flags items that have shifted or that the build prompt under-specifies.

---

## Summary

Top findings:

1. **Locked decision #9 is broken.** Migration `20260423200000_drop_rc_stored_columns.sql` (2026-04-23, the day after the investigation report) dropped all eight `rc_*` columns from `songs`. The codebase now reads RC live via `fetchBadge()` only. The build prompt's Compass Charge layer (§9) and its proposed `SELECT … avg(rc_charge) FROM songs GROUP BY year` query target columns that no longer exist. **Re-open required.**
2. **Hybrid publish (§11) has no viable prod path as written.** Vercel runtime FS is read-only; the codebase has no GitHub-API or build-trigger precedent. Options A/B/C must be chosen before build, or §11 should fall back to Supabase-only with markdown export at build time. **[Update 2026-07-05: this constraint is LIFTED. chadlewine left Vercel for the le-projects-01 droplet, where the container filesystem is writable at runtime (ISR already uses a local disk cache). Runtime write-to-disk publish is now viable, so §11 is no longer forced onto Option C. Re-evaluate before building. Note also this audit's "`@vercel/analytics`/`@vercel/speed-insights` in deps, no `output: 'standalone'`" observation is now stale: those deps are gone and the Docker build sets `output: 'standalone'`.]**
3. **`chad-lewine-prose` flag does not slot into the existing flag system.** `feature-flags.ts:59` only matches the **first path segment** of a URL to a section name. Two flags on the same path (`/chad-lewine`) is not a pattern the proxy supports — the prose flag must be enforced inside the page handler, not at the proxy.
4. **The "no AI anywhere" rule is fine for prose, but the codebase already calls Anthropic via raw fetch in 5 admin routes** (song-composition-chat, song-visibility-chat, suggest-lines, optimize-plan, generate-alt). The "do not add @anthropic-ai/sdk" instruction is consistent with the existing pattern (raw fetch, no SDK) — confirm Chad understands these existing AI surfaces remain untouched.
5. **Schema patterns are well-established and the spec mostly matches them**, with a few tightening calls needed: TEXT+CHECK over Postgres ENUM, `update_updated_at()` trigger on every table, RLS pair (`Public can read published …` + `Admin full access …`), and a polymorphic-junction precedent in `thread_pulls`.

Build is **not yet ready to start**. Six open questions block Phase B; once Chad resolves them, the rest of the spec is executable largely as written.

---

## Section-by-section audit

### §5 Migrations

**Inconsistencies**
- **rc_charge / rc_tier no longer exist.** Migration `20260423200000` dropped all eight rc_* columns; `grep rc_charge|rc_tier|rc_contaminated src/` returns zero matches. Any migration that backfills, indexes, or aggregates these columns must first restore them. **Resolution:** see Re-open candidates.
- **Migration 14 (`add_arc_feature_flags`) is misnamed.** `feature_flags` (table) was created in migration 043 as a single-row-per-section table with PK `section`. The new "migration" is an `INSERT … ON CONFLICT (section) DO UPDATE` against an existing table, not a `CREATE TABLE`. **Resolution:** rename to `seed_arc_feature_flags`, body is upsert-only.
- **`thinking` is no longer in `SECTION_SEGMENTS`** (`feature-flags.ts:59-72`) — investigation report listed it but `20260423210000_drop_thinking_page.sql` removed it. Doesn't change the build, but proves the SECTION_SEGMENTS list drifts; re-read it before §12 work.

**Ambiguities**
- **5.3a song_state mechanism.** Codebase has zero Postgres ENUM types; every enum-style field is `TEXT` + `CHECK (… IN (…))`. **Recommend TEXT+CHECK** to match `songs.status` (`017:13`), `albums.status`, `prose_section.status` etc. Audit proposes the seven values are accepted as-is (demo|released|unreleased|reissued|in-progress|lost|shelved) — flag for Chad confirmation but not blocking.
- **5.3b backfill policy.** Recommend: all `status='published'` rows → `song_state='released'`; all `status='unreleased'` → `song_state='unreleased'`; all `status='draft'` → `song_state=NULL`. Chad re-classifies edge cases (demos, lost, shelved, reissues) manually via Capture Drawer post-migration.
- **5.3h writings — extend observations vs. separate table.** Grep confirms zero hardcoded `kind='observation'` logic anywhere in `src/`. Extending observations with a `kind` enum is safe at the data layer, but: (1) public observation pages will need filter logic (don't render `kind!='observation'` on `/observations`), (2) admin observations editor (`src/app/admin/observations/`) needs a `kind` selector. **Recommend extend observations** — saves a duplicate revisions/RLS/admin scaffold — but commit to the UI changes upfront.
- **5.3j polymorphic `prose_section_dependencies` vs. per-entity junction.** Polymorphic precedent exists: `thread_pulls` (`migrations/001:92-107`) uses `(source_type, source_id, target_type, target_id)` with a unique constraint. Pattern is in-codebase. **Recommend polymorphic with `ON DELETE CASCADE` on `section_id` only**; orphan `(entity_kind, entity_id)` rows on entity delete are harmless (they never match a join).
- **5.3k song_state_history mechanism.** No DB-trigger audit-log precedent in chadlewine; `cl_stream_admin` and `songs` admin routes log via API code. **Recommend application-level**: log inside `/api/admin/arc/capture` after the song update succeeds. Captures actor + context that triggers can't see.

**Gaps**
- **RLS policies not specified per-table.** Established pattern is two policies per table: `"Public can read published <name>" FOR SELECT USING (status = 'published')` + `"Admin full access <name>" FOR ALL USING (true) WITH CHECK (true)`. Apply this verbatim to all new tables. life_events, prose_sections, eras, etc. need this; spec is silent.
- **`update_updated_at()` trigger missing from spec.** Function exists from `001:203-209`; every table with `updated_at` calls it via `BEFORE UPDATE` trigger. Add the trigger line to every new table that has `updated_at`.
- **Indexes not specified.** Recommend: `idx_eras_kind`, `idx_eras_dates(date_start, date_end)`, `idx_life_events_dates(date_start, date_end)`, `idx_life_events_era_id`, `idx_prose_sections_scope_kind`, `idx_prose_section_dependencies_section`, partial `idx_prose_sections_stale WHERE is_stale = true`. Also: `songs.write_date` (sparse index — most rows null).
- **FK `ON DELETE` semantics not specified.** Recommend CASCADE on all child→parent links inside the new system; SET NULL on `songs.era_id`-style optional refs.

**Risks**
- **`status` overloading risk (mitigated).** Build prompt's locked decision #1 already separates `song_state` from `status`; this is the right call and removes a risk the investigation flagged.
- **Polymorphic deps + manual orphan accumulation.** Acceptable at v1 scale (Chad-only edits, deletes rare). Add a `cleanup_orphan_dependencies()` admin script later if the table grows noisy.

**Dependency-order issues**
- Eras table (mig 4) must precede `art_piece_eras` (mig 5), `life_events.era_id` FK (mig 6), and `prose_sections.era_id` FK (mig 12). Build order in §5.1 already gets this right.

**Re-open candidates**
- None inside §5 itself; the rc_* re-open belongs in §9 (it doesn't change the migration set, only the charge-line data path).

---

### §6 Seed corpus ingest

**Inconsistencies**
- **Pattern reference (`scripts/ingest-rc-classifications.ts`) was deleted** in the same commit that dropped rc_*. Use `scripts/migrate-md-to-supabase.ts` as the gray-matter+remark+supabase template instead. Same shape, still in repo.

**Ambiguities**
- **6.3a documentary vs. prose corpora.** Treat as separate. Documentary → `life_events` (with `source='documentary'`). Prose backbone → `prose_sections`. They overlap in subject matter, not in row identity.
- **6.3b prose ingest write semantics.** Recommend: write 14 .md files to `/prose/sections/`, **leave uncommitted** for Chad to review and commit. Insert prose_sections rows in a single transaction; if file write succeeds and DB insert fails, files are easy to delete.
- **6.3c discography era backfill.** Recommend: ingest creates `eras` rows (kind=release) with `album_id` FK; **does not** create a `song_eras` junction. Songs link to release-eras implicitly via `release_date` BETWEEN `era.date_start` AND `era.date_end`. (Aligns with §7.4b recommendation below.)

**Gaps**
- **No idempotency strategy.** All three scripts must `INSERT … ON CONFLICT (slug) DO UPDATE` (or check-then-insert) so re-runs don't duplicate. Recommend `upsert` semantics across all three, keyed on slug.
- **Source-file path verification.** Ingest scripts hardcode paths (`Dropbox/Chad Lewine/plans and docs/Chad Lewine Documentary Script.md` etc.). If Chad runs from another machine, paths break. Recommend: scripts accept a `--source` arg with sensible default.
- **Documentary-verbatim enforcement is stated as UI-only** but the source-of-truth field is `life_events.source`. Add a `CHECK (source IN ('documentary','captured'))` constraint at minimum so the data field is enforced. Read-only enforcement remains UI-side, fine.

**Risks**
- **Bulk insert + partial failure.** If insert #15 of 80 fails, rows 1-14 have committed. Wrap each script in a single transaction (`supabase` JS client doesn't natively do multi-statement transactions — use a single batched insert per table, or a Postgres function called from the script).

**Dependency-order issues**
- All three scripts run after migrations are applied. No script-to-script dependency.

**Re-open candidates**
- None.

---

### §7 Stale-flag trigger rules

**Inconsistencies**
- **No existing stale-flag system or pattern in codebase.** This is greenfield. No precedent to violate, but also no precedent to lean on; the implementation is fully a new design.

**Ambiguities**
- **7.4a Postgres function vs. TS server-side.** Codebase has zero PL/pgSQL functions beyond `update_updated_at()` and the redirect-hit recorder. All entity logic is TS in API routes. **Recommend TS in `/api/admin/arc/capture` route handler**, called synchronously after the entity write succeeds. Matches codebase architecture, easier to debug, easier to log.
- **7.4b song-era linkage.** Recommend implicit: songs have `release_date` (and now `write_date`); a song is "in scope" for a release-era if either date falls within the era window. No `song_eras` junction. Optimize later if perf bites.
- **7.4c polymorphic deps without entity-FK.** Accept orphans (see §5). Add CASCADE on `section_id` only.

**Gaps**
- **"In scope" rules under-specified for non-date layers.** What makes a `relationship` in scope for a date-range section? `first_contact_date` in window? Still-active during window? Either-or? **Recommend conservative OR**: any of {date, date_start, first_contact_date, last_contact_date} in window → in scope. Errs toward over-flagging (better than missing).
- **`stale_reasons` JSON shape needs lock.** Recommend: array of `{ kind: string, entity_id: uuid, entity_slug: string, action: 'added'|'updated'|'removed'|'linked'|'unlinked', at: timestamptz }`. Append-only, cleared on publish, no max length in v1.
- **Trigger surface enumeration is ambiguous.** Spec lists "what triggers stale" as prose — translate to a typed switch in the capture handler. Each entity-kind in Capture Drawer maps to a "scope-resolver" that returns affected `prose_section.id[]`.

**Risks**
- **O(M) cost per capture.** With 14 prose sections in v1, trivial. If sections grow to 90+, the synchronous resolver becomes a perf concern. Acceptable for v1; add a Postgres function or async job in v2 if needed.
- **Orphan stale_reasons entries** (e.g., entity_id no longer exists). Cosmetic only — stale UI handles missing entity gracefully (display "deleted entity" or skip).

**Dependency-order issues**
- Trigger logic depends on §5 schema (entity tables + prose_sections) and §8 Capture Drawer API existing. Build order has this correct (step 4, after migrations and admin surfaces).

**Re-open candidates**
- None inside §7 itself.

---

### §8 Admin surfaces

**Inconsistencies**
- **`/admin/arc/` namespace does not exist** (`ls src/app/admin/` shows no `arc/`). Adding it is straightforward — the auth gate at `proxy.ts:29` covers `/admin/*` uniformly, so JWT validation is automatic.
- **No sidebar source location named in spec.** Sidebar is rendered from `src/app/admin/layout.tsx`. Confirm the nav-items file Chad uses (likely a const inside layout.tsx; not a separate config file). Add two entries: `/admin/arc/capture` and `/admin/arc/sections`.

**Ambiguities**
- **8.4c song picker.** No existing cross-entity picker component. With ~150+ songs, a searchable autocomplete is the right pattern. Reuse the search input shape from `src/app/admin/music/songs/` list view (filter-as-you-type) and post the selected `song_id`.
- **8.4d markdown editor preview.** `SongCompositionPanel` (in `src/components/`) renders markdown via `markdownToHtml()` — confirm if it's split-pane or save-then-render. Recommend save-and-render-to-side (no live preview) to match current UX cost; live preview adds remark-on-keystroke complexity not warranted in v1.
- **8.4e modal component.** No modal library installed. Native `<dialog>` element works in all current evergreens; recommend using `<dialog>` for the publish confirmation. Skip headless-ui / Radix.

**Gaps**
- **Capture Drawer payload shapes are not defined.** Each of the 10 entity kinds needs an explicit POST body shape. The Capture API endpoint (`/api/admin/arc/capture`) is essentially a `switch (entity_kind)` dispatcher — define each branch's expected payload + Supabase insert shape upfront. Recommend a Zod-style runtime validator per entity-kind even though the codebase doesn't currently use Zod (other admin endpoints rely on TS types only — but Capture is broader, the runtime check pays off).
- **`song_composition` editor pattern includes a chat panel** wired to `/api/admin/song-composition-chat` (which calls Anthropic via raw fetch). Spec says "minus the chat panel" — confirm the Section Manager does not import `SongCompositionPanel` directly; instead extract the markdown-edit + revisions sub-component into a shared base, or copy the markdown half cleanly. Watch for accidental chat re-introduction during refactor.
- **`source` column read-only enforcement.** Documentary rows must reject UPDATE in the API too, not only hide the edit button. Add an explicit guard in the life_event UPDATE handler: `if (existing.source === 'documentary') return 403`.

**Risks**
- **Confirmation modal can be skipped if the publish action is also a button click.** Use `<dialog>` and require explicit confirm. Chad sole-admin reduces accidental-publish risk but doesn't eliminate it.

**Dependency-order issues**
- Capture Drawer cannot be implemented before §5 migrations exist (entity tables must exist for inserts to work). Section Manager cannot be implemented before `prose_sections` migration applied. Build order step 3 explicitly comes after step 1, fine.

**Re-open candidates**
- None.

---

### §9 ArcRadiant component — **CRITICAL**

**Inconsistencies — BLOCKING**
- **Compass Charge layer queries dropped columns.** `SELECT … avg(rc_charge) … FROM songs WHERE rc_charge IS NOT NULL` against the current schema returns "column does not exist." **Re-open required, see §9 re-open candidates below.**
- **No `framer-motion` in package.json.** Only net-new dep, fine. Confirm v11+ for React 19.2 / Next 16.2 compatibility. Note: framer-motion's gesture API supports drag/pan but **does not natively handle multi-touch pinch**; it would need pointer-event glue. Either pair with native PointerEvent handlers or add `@use-gesture/react` (~5kB). Spec locks one new dep — reconfirm this is enough.

**Ambiguities**
- **9.5a pinch-snap stack.** See above. Recommend: framer-motion for animation + native PointerEvent for pinch detection (`pointerdown` → track 2 pointers → compute distance delta → snap on `pointerup`). Pure-framer-motion will not work.
- **9.5b RSC boundary.** Recommend: `src/app/(public)/chad-lewine/page.tsx` is RSC; fetches all 4 layers' data via `createPublicClient()` parallel queries; passes `initialData` prop to `<ArcRadiant>` client component. Layer-toggle state is client-only.
- **9.5c SVG vs canvas.** Year-aggregated charge line is ~37 points (1989-2026); SVG is fine. Day-grain might surface 100s of dots; SVG still fine for v1. No canvas needed.
- **9.5d bottom sheet.** No existing pattern. Recommend native CSS position-fixed panel with framer-motion drag-down to dismiss. Lightweight.
- **9.5e layer-toggle persistence.** Recommend session-only (no persistence) for v1. URL params can be added in v2 for share-arc-with-layer-state UX.
- **9.5f discoverable panel grayed.** Chad locked grayed. Confirm visual: 50% opacity + "(coming soon)" tooltip on hover.

**Gaps**
- **Zoom-grain binning rules absent.** Seven levels described conceptually; the SQL/aggregation per level is not specified. At Lifetime, charge aggregates per year; at Year, per month? At Day, raw rows? Specify the binning function per level before component implementation.
- **Empty-state UX.** What renders if a year has zero songs and zero life events? Empty band? Skip year? Compress? Spec is silent.

**Risks**
- **First-paint perf at Lifetime grain.** SSR fetches all 4 layers' data into one props blob. With 150 songs + 80 life events + 14 sections, payload is small (well under 100KB). No risk.
- **Live RC fetch as a fallback for charge-line layer = 150 parallel API calls per render.** This breaks the "no live RC at arc render" principle and burns RC quota. **Do not fall back to per-song fetchBadge for the layer.** Either restore rc_* or defer the layer.

**Dependency-order issues**
- Component build (step 5) depends on charge-line data path being decided (re-open question 1). If decision is to defer the layer, ArcRadiant ships with 3 layers in v1, not 4.

**Re-open candidates**
- **#1 (CRITICAL): Compass Charge layer data source.** Three viable paths:
  - **A. Restore denormalized rc_* columns** via a new migration; rebuild `scripts/ingest-rc-classifications.ts` (deleted on Apr 23). Cost: re-introduces the staleness/ownership concern that motivated the drop. Mitigation: nightly cron re-ingest or webhook from RC.
  - **B. RC API gets a new aggregate endpoint.** RC exposes `/api/drift/years-by-artist?artist_slug=chad-lewine` returning pre-aggregated year buckets. Single call per arc render, RC-side aggregation. Requires risingcompass.net work outside chadlewine scope.
  - **C. Defer charge layer to v2.** Arc ships with Music + Eras + Life Events only. Layer toggle shows "Compass Charge (coming soon)" grayed.
  - **Recommend: A or C.** Chad decides. B is best architecturally but adds a cross-repo dependency the build prompt didn't scope.

---

### §10 ProseReader + compile logic

**Inconsistencies**
- **No file-based content pipeline exists.** Codebase has zero `.md` files served as content; gray-matter is installed but used only in scripts. Reading from `/prose/sections/*.md` at build time is a new pattern. Workable, but flag that no precedent exists.
- **`/chad-lewine/page.tsx` is the existing route surface.** Confirmed exists. The `?view=prose` query param swap can be implemented inside that page handler.

**Ambiguities**
- **10.4a manifest vs. DB query.** **Recommend manifest file** (`/prose/sections/_order.json`) regenerated on publish. Reasons: (1) reader needs no DB connection at build, (2) manifest is git-tracked truth alongside the .md files, (3) DB and FS stay in sync via the publish flow. Frontmatter then carries only display data (title, published_at), order lives in the manifest.
- **10.4b build-time vs. runtime compile.** Build-time is fine at 14 sections; even at 100 it's negligible (<1s). Recommend build-time.
- **10.4c hard swap vs. CSS toggle.** Recommend hard swap. Each `?view` is conceptually a different page; visibility-toggle keeps both DOM trees mounted, doubles initial JS payload.
- **10.4d frontmatter on files.** Recommend frontmatter for self-sufficiency: `title`, `slug`, `order_index`, `scope_kind`, `published_at`. DB and frontmatter agree at publish time; if DB is ever lost or rebuilt, files are still readable in order.

**Gaps**
- **Section anchor scrolling specifics.** Deep link `/chad-lewine?view=prose&section=brooklyn-i` should `scrollIntoView` on mount with `behavior: 'smooth'` and offset for any sticky header. Specify in the component.

**Risks**
- **Manifest regeneration as a publish step adds a failure mode.** If manifest write fails, prose order desyncs. Mitigation: regenerate manifest atomically (write `.tmp`, rename) and log failures loudly in admin UI.

**Dependency-order issues**
- ProseReader (step 6) depends on first publish having written the section markdown files (covered by ingest script in step 2). Order is correct.

**Re-open candidates**
- None inside §10 itself; depends on §11 storage decision.

---

### §11 Hybrid publish mechanics — **CRITICAL**

> **Update 2026-07-05:** the whole §11 problem below is framed around Vercel's read-only
> runtime filesystem. chadlewine has since moved off Vercel to the le-projects-01 droplet,
> where the container FS is writable at runtime (ISR uses a local disk cache). Runtime
> write-to-disk publish is now a valid option; the Option C recommendation is no longer
> forced. Treat the analysis below as historical and re-evaluate before building §11.

**Inconsistencies**
- **Vercel runtime FS is read-only at request time.** No precedent in the repo for write-to-disk-at-runtime. The codebase deploys via Vercel (`@vercel/analytics`, `@vercel/speed-insights` in deps; no `output: 'standalone'` in next.config.ts). Option A (dev-only publish) means publish only works when Chad runs `npm run dev` locally. Option B (GitHub API commit) means new infra: GitHub PAT or App, commit signing, branch policy. Option C (Supabase-only at runtime, files regenerated at build) means the "hybrid" is really "Supabase truth, files are deploy artifacts."

**Ambiguities**
- **11.4a A vs. B vs. C — must decide before §11 build.** **Recommend Option C** for the following reasons:
  - Aligns with codebase's "Supabase is truth" pattern (every other content surface).
  - No new infra (no GitHub PAT, no branch protection negotiation).
  - At build time, a script reads `prose_sections WHERE status='published'` and writes `/prose/sections/[slug].md` + manifest.
  - Trade-off: published content not in git history. Mitigation: nightly job commits the regenerated `/prose/sections/` to a `content-snapshots` branch for archival.
  - Option A is acceptable as a v1 fallback if Chad always publishes from local dev — but locks future-Chad into a workflow constraint.
  - Option B is the most architecturally clean (publish writes to git, Vercel rebuilds) but most operationally heavy.
- **11.4b frontmatter format.** gray-matter standard YAML. Already installed.
- **11.4c HTML render timing.** Render markdown → HTML in `prose_sections.content_html` at publish time (cache the result); also render fresh at build time as a safety. Cheap, makes both data paths self-sufficient.
- **11.4d rollback.** Defer to v2. v1 has revisions table; "revert to revision N" is a copy-revision-content-to-current-row + re-publish action. Simple to add later, not v1.

**Gaps**
- **Concurrent-publish handling.** Single-admin (Chad) makes this academic in v1. Skip.
- **What constitutes "published" for a section that has only ever been a draft.** First-publish flow: revision_number = 1, file written, manifest entry created. Spec is fine; just specify the bootstrap state explicitly.

**Risks**
- **Atomic publish across Supabase + FS is hard.** Two-phase: (1) Supabase update first (transactional), (2) FS write. If FS fails, mark section as `publish_pending` and surface in admin. Avoid the temp-file-rename approach in spec — it doesn't help if the failure is in the Supabase update.
- **Option C means published prose is regenerated on every deploy.** Idempotent if section content didn't change; otherwise it's the deploy that "syncs" public site. Acceptable, but Chad should know.

**Dependency-order issues**
- §11 (step 7) depends on §12 flag decisions and §10 reader. Build order is correct.

**Re-open candidates**
- **#2 (CRITICAL): A/B/C choice.** Cannot draft publish flow until decided.

---

### §12 Feature flags

**Inconsistencies**
- **`SECTION_SEGMENTS` is path-segment-based** (`feature-flags.ts:59-72`). The set matches `pathname.split('/').filter(Boolean)[0]` — so flags are keyed on the URL's first segment. Two flags governing the same path (`chad-lewine` for the surface, `chad-lewine-prose` for one view of it) doesn't fit this pattern. The proxy can only check one section per path.
- **The prose flag must be enforced inside the page handler**, not at the proxy. `/chad-lewine?view=prose` would: (a) proxy checks `chad-lewine` flag (existing logic); (b) page handler reads `?view`, checks `chad-lewine-prose` flag via `isSectionLive('chad-lewine-prose')`, and either renders prose, redirects to base view, or 404s.

**Ambiguities**
- **12.1a flag naming.** `chad-lewine-prose` is fine as a `feature_flags.section` row PK (no path-matching collision; it's just a flag key, not a path segment). Don't add it to `SECTION_SEGMENTS`. The arc itself reuses the existing `chad-lewine` flag (no new flag for arc).
- **12.1b redirect vs. 404 when prose flag off and `?view=prose` requested.** Recommend redirect to `/chad-lewine` (drop the query param). Matches the proxy's "rewrite to /preview when off" principle of soft-degradation. 404 is harsh.
- **12.1c auth bypass.** `proxy.ts:56` only enforces flags when `VERCEL_ENV === 'production'`. Staging/preview/local dev bypass flags entirely. There is **no** authenticated-session bypass on production today — admin sessions on prod still see flag enforcement on public routes. Confirm this matches Chad's understanding before lock-in.

**Gaps**
- **Spec says "Seed migration adds both rows; both is_live=false on initial deploy."** "Both" implies arc and prose. Arc doesn't get its own row; it shares `chad-lewine`. Only one new row needed: `chad-lewine-prose`.

**Risks**
- **Soft `?view` redirects can pollute analytics.** Posthog will record the rewritten path. Acceptable, just flag.

**Dependency-order issues**
- Flag seeding (build step 8) is trivial post-step. No dependency issues.

**Re-open candidates**
- None blocking; flag system is solid.

---

### §13 Dependencies

**Inconsistencies**
- **Anthropic is already used via raw fetch** in 5 admin routes (`song-composition-chat`, `song-visibility-chat`, `suggest-lines`, `optimize-plan`, `media/generate-alt`). The "do not add `@anthropic-ai/sdk`" instruction is **consistent** with the current pattern (raw `fetch()` against the Anthropic API, no SDK). The "no AI in this system" rule applies to the **prose pipeline** specifically — confirm Chad understands the existing AI code paths remain in place.
- **`framer-motion` not installed.** Add v11+. React 19.2 and Next 16.2 are supported.

**Ambiguities**
- **Pinch handling shortfall.** Framer-motion alone doesn't handle pinch. See §9.5a — either ship pointer-event pinch handler in-house (small) or add `@use-gesture/react`. Spec says "only net-new dep" — flag this trade-off for Chad.

**Gaps**
- None.

**Risks**
- **No test framework installed.** No Jest, Vitest, Playwright. Smoke pass (§14 step 9) is manual.

**Dependency-order issues**
- Add deps before any code that imports them. Trivial.

**Re-open candidates**
- **#3 (LOW): pinch handling — pure framer-motion + DIY pointer events, or add `@use-gesture/react`?** Recommend DIY: ~80 LOC of pointer math beats a 5kB dep with a learning curve.

---

### §14 Build order

**Ambiguities**
- **14.3a parallelization beyond 2 sub-agents.** Memory caps parallel agents at 2 (user preference). Within Phase B, the largest natural parallel split is: (i) migrations + ingest scripts together, (ii) admin Capture + Section Manager together, (iii) ArcRadiant + ProseReader together. All within the 2-agent cap.
- **14.3b smoke pass automated vs. manual.** No test framework in `package.json`. Recommend manual walkthrough for v1; add Playwright as v2 tech-debt.

**Gaps**
- **Branch name convention not verified.** Repo doesn't enforce a branch-naming pattern in any visible config. `feature/arc-radiant-v1` is consistent with industry default. Confirm with Chad's `MEMORY.md` git rules: deploy pipeline is git-sourced (`master`→prod, `staging`→staging). Recommend the feature branch land in `staging` first, never directly to `master`.

**Risks**
- **Step 1 "all 14 SQL files drafted in parallel; Chad runs in dashboard in listed order" depends on Chad's manual execution.** Provide each migration as a self-contained file with a clear header comment naming its predecessors (e.g., `-- requires: eras table (migration 4)`).

**Dependency-order issues**
- Step 7 (publish mechanics) depends on the §11 A/B/C decision being resolved. If C, step 7 is small (publish writes to Supabase only; markdown export deferred to a build-time hook in step 9). If A or B, step 7 is more involved.

**Re-open candidates**
- None inside §14.

---

## Cross-cutting findings

1. **The "rc_charge dropped" reality cascades through §5 (no aggregate index needed), §7 (no rc-recalibration trigger), §9 (charge-line layer), and the §6 ingest pattern reference.** All four sections were drafted assuming Apr 22 state; resolve §9 re-open #1 first, the rest follow.
2. **Path-segment-based flag system is load-bearing.** §12 needs the prose flag check moved into the page handler, not the proxy. Same pattern any future "sub-view of an existing section" flag will need.
3. **"No AI" applies to the prose pipeline only.** Existing Anthropic-via-fetch admin routes (chat, suggestion, alt-generation) are untouched. Confirm explicitly so a build-pass doesn't accidentally rip them.
4. **Vercel filesystem read-only constraint dictates §11.** The hybrid publish abstraction needs a clear runtime-vs-buildtime story. Recommend Option C (Supabase truth, files as build artifacts), accept the trade-off that published prose isn't in git history at write time.
5. **No test framework.** Smoke pass §14.9 is manual. Quality bar comes from the build prompt's smoke checklist; execute it as written.
6. **`update_updated_at()`, two-policy RLS pair, `slug TEXT UNIQUE`, `ON DELETE CASCADE` — apply uniformly across new tables.** Spec is silent; pattern is uniform across migrations 001-044.

---

## Open questions requiring Chad's decision before build

Ordered by blocking priority.

**Q1 (BLOCKING §9, §14 step 5). Compass Charge layer data source.**
Choose: (A) restore denormalized rc_* via new migration + rewrite ingest script (accept staleness trade-off, optionally cron-refresh); (B) request a new aggregate endpoint on RC side (out of chadlewine scope); (C) defer Compass Charge layer to v2, ship Arc with Music+Eras+LifeEvents only.
Recommendation: **A** if Chad wants the layer in v1 and is OK with up-to-24h staleness; **C** if not.

**Q2 (BLOCKING §11, §14 step 7). Hybrid publish prod path.**
Choose Option A (dev-only publish), B (GitHub API commit), or C (Supabase truth + build-time markdown regen).
Recommendation: **C**. Acceptable trade-off that published content isn't in git at write time; nightly snapshot commit closes the gap.

**Q3 (BLOCKING §12). Confirm prose-flag enforcement model.**
The path-segment flag system can't gate `?view=prose`. Confirm: prose-flag check runs inside `chad-lewine/page.tsx`, behavior on flag-off is redirect-to-base-view (drop the param). Confirm flag name `chad-lewine-prose`.

**Q4 (HIGH §5, §6, §8). Writings — extend observations or separate table.**
If extend: confirm `kind` enum values (observation|essay|excerpt|doc-script-line|other) and accept the admin-UI work to add a kind selector and filter `kind!='observation'` from `/observations` public route.

**Q5 (HIGH §13, §9). Pinch handling.**
Confirm: ship DIY pointer-event pinch (~80 LOC) keeping framer-motion as the only new dep, OR add `@use-gesture/react` as a second new dep.

**Q6 (MEDIUM §11.4d). Rollback semantics in v1.**
Defer "revert to revision N" to v2, or include in v1?
Recommendation: defer to v2.

---

## Recommended build order adjustments

§14 sequence is sound. Two refinements:

1. **Insert "Q1 + Q2 resolution" as a Phase A.5 gate** between Chad's audit review and Phase B start. Both are blocking and need to be in writing before migrations or component work begins.
2. **Step 7 (publish mechanics) effort scales with Q2 outcome.** If C, step 7 collapses: publish updates Supabase only; markdown regeneration runs as a `next build` postbuild hook (or inside `prose-sections-build-export.ts` script). Move build-time export to step 9 prep.

No other reordering needed.

---

## Readiness verdict

**Not ready to build.** Six open questions block Phase B. Q1 and Q2 are critical (architectural); Q3 is critical (system-level mismatch); Q4–Q6 are tightening calls.

Once Q1–Q3 resolve and Q4–Q6 are answered, the build prompt is executable largely as written. The schema patterns, RLS conventions, ingest scripts, admin routing, feature-flag system, and revision-history mechanism all have proven precedents in chadlewine — the build is mostly a careful application of existing patterns to new entity types, plus one new visualization component (ArcRadiant) and one new content surface (ProseReader).

Estimated Phase B duration after gates resolve: 5–8 working sessions at the pace memory suggests. Critical-path items are ArcRadiant component (§9, ~2 sessions) and Capture Drawer (§8, ~1.5 sessions). Migrations + ingest + Section Manager + ProseReader + flags + publish glue = 2–4 sessions combined.
