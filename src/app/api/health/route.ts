// Liveness probe for the container healthcheck and the LEIT dashboard.
//
// This route deliberately touches nothing: no Supabase, no filesystem, no page
// rendering. That is the entire point of it.
//
// Both pollers used to fetch "/", which looks free and is not. The homepage is
// ISR with `revalidate = 60`, so any request arriving more than 60s after the
// last render serves the cached page instantly AND kicks off a background
// regeneration, which re-runs the homepage's 18 Supabase queries. Two pollers
// at 30s intervals kept that loop running every ~60s around the clock, on prod
// and on staging, for weeks. Measured 2026-07-31: five regenerations in four
// minutes with zero human traffic. It drained the project's disk IO budget,
// Postgres throttled to its 5 MB/s baseline, and the site went down.
//
// The cost was invisible from outside because ISR serves the stale page first:
// the healthcheck always got a fast 200 and reported healthy.
//
// Liveness only, which matches the intent already written into
// docker-compose.yml: a response means the server process is up. It says
// nothing about Supabase, and it must not. Coupling liveness to the database
// turns a slow query into a container restart loop.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true });
}
