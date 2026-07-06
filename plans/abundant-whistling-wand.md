# Campaign send pipeline — background queue

Email campaigns are sent through an async enqueue + cron-drain worker so lists
of any size go out reliably (the old synchronous send died inside a single 60s
Vercel function at ~130 recipients).

## Flow

1. **Enqueue (Send button)** — `POST /api/admin/campaigns/[id]/send` calls
   `enqueueCampaign()`: locks the campaign `draft -> sending`, inserts one
   `campaign_sends` row per recipient with `status='queued'`, and returns `202
   { queued: N }`. No email is sent in this request. Guard: audience over
   `MAX_CAMPAIGN_AUDIENCE` (50k) unlocks back to draft.

2. **Drain (cron worker)** — `GET /api/cron/campaign-queue` runs every minute
   (droplet cron `/etc/cron.d/chadlewine` via `cl-cron-hit.sh`, `* * * * *`, prod only;
   `vercel.json` crons were emptied and the Vercel project deleted 2026-07-05) and calls
   `drainCampaignQueue(deadline)`. For
   each campaign in `sending`:
   - Reclaim stale `sending_row` rows (a crashed prior tick) back to `queued`.
   - Atomically claim up to `CLAIM_BATCH` queued rows
     (`status='queued' -> 'sending_row'`, two-step select + guarded update,
     race-safe under READ COMMITTED).
   - Render + send them paced under Resend's 5/sec limit (`sendPaced`).
   - Mark each row `sent`/`failed`.
   - When no `queued`/`sending_row` rows remain, finalize the campaign
     (`status='sent'`, recompute counts).
   - Stop before `RESERVE_MS` of the deadline so a started batch always
     finishes inside `maxDuration`.

3. **UI** — `CampaignEditor` flips to a "Sending" view on enqueue and polls
   `/api/admin/campaigns/[id]/sends` to show `X/Y sent` until the queue drains,
   then switches to the sent view. "Resend failed" still covers stragglers.

## Idempotency / no double-send

- Per-row claim (`update ... where status='queued'`) ensures each row is sent by
  exactly one tick.
- Ticks for one campaign don't overlap (cron is once/min, each tick budgeted
  under 60s), and campaigns are processed sequentially within a tick, so the
  global Resend rate stays under 5/sec.
- A claimed row carries its claim time in `sent_at`; rows stuck in
  `sending_row` past `STALE_CLAIM_MS` are reclaimed and re-sent (at-least-once).
