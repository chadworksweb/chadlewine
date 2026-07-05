# chadlewine.com -- self-hosted deployment runbook (le-projects-01)

Migrated off Vercel to the DigitalOcean droplet **le-projects-01** (`138.197.111.66`)
on 2026-07-05. Three-tier, Docker behind the shared `le-nginx` reverse proxy, on the
model of Lyric Transformer. Vercel is kept live (cron-less) as an instant DNS rollback
until decommissioned.

## Topology

```
local dev (npm run dev -p 8888)
   |  push origin staging
   v
STAGING  staging.chadlewine.com  -> le-nginx -> cl-staging:3005  (branch: staging)
   |  fast-forward master
   v
PRODUCTION  chadlewine.com + www -> le-nginx -> cl-prod:3006     (branch: master)
```

- One shared Supabase (`dyjvcjbgnvjkubrsqnym`) for BOTH envs. Staging writes hit live
  tables -- staging proves code/rendering only; real-world side effects are guarded at
  the edges: staging uses Stripe TEST, a catch-all email sender, and runs NO crons.
- Single container per env (ISR uses the local filesystem cache).

## Instances

| | Staging | Prod |
|---|---|---|
| Dir | `/home/deploy/chadlewine-staging` | `/home/deploy/chadlewine-prod` |
| Branch | `staging` | `master` |
| Container / le-proxy alias | `cl-staging` | `cl-prod` |
| Bind | `127.0.0.1:3005` | `127.0.0.1:3006` |
| nginx vhost | `/root/proxy/nginx/conf.d/chadlewine-staging.conf` | `/root/proxy/nginx/conf.d/chadlewine.conf` |
| `.env` (chmod 600, gitignored) | `/home/deploy/chadlewine-staging/.env` | `/home/deploy/chadlewine-prod/.env` |
| Deploy script | `./deploy.sh` (from `deploy/deploy-staging.sh`) | `./deploy.sh` (from `deploy/deploy-prod.sh`) |
| Stripe | TEST | LIVE |
| SITE_URL | https://staging.chadlewine.com | https://chadlewine.com |
| Email sender | onboarding@resend.dev (catch-all) | real sender |
| Crons | none | 6 (see below) |

## Build model (Dockerfile + compose)

- `Dockerfile`: multi-stage `node:22-slim`, `output: "standalone"`. The FULL per-instance
  `.env` is mounted as a **BuildKit secret** during `next build` (written to
  `.env.production` for Next's dotenv loader, then removed -- also removed from
  `.next/standalone/`). This is required because some modules read server env at module
  scope (e.g. `src/lib/media-config.ts`). Only `NEXT_PUBLIC_*` are baked; server vars stay
  runtime-dynamic. `--chown=node:node` on the standalone COPY so the runtime (`node` user)
  can write the ISR cache.
- `docker-compose.yml`: ONE parameterized file. Instance specifics come from the co-located
  `.env` via `${CL_CONTAINER}` / `${CL_ALIAS}` / `${CL_PORT}`. Joins the external `le-proxy`
  network; binds `127.0.0.1:<port>`; `env_file: .env`; healthcheck; `restart: unless-stopped`.

## Git flow / deploying

```
# iterate locally, then:
git push origin staging
ssh root@138.197.111.66 'sudo -u deploy bash -lc "cd /home/deploy/chadlewine-staging && ./deploy.sh"'
# verify staging, then promote:
git push origin staging:master
ssh root@138.197.111.66 'sudo -u deploy bash -lc "cd /home/deploy/chadlewine-prod && ./deploy.sh"'
```

- `deploy-staging.sh`: `git fetch` + `reset --hard origin/staging` + `compose up -d --build` + prune.
- `deploy-prod.sh`: `git fetch` + `merge --ff-only origin/master` + `compose up -d --build` + prune (promotion-only; refuses non-ff).

## GitHub access (droplet -> private repo)

Read-only deploy key on `chadlewine/chadlewine`, titled "le-projects-01 droplet (read-only)".
Key: `/home/deploy/.ssh/chadlewine_deploy`. Because the deploy user already has a
risingcompass deploy key, an SSH host alias disambiguates:

```
# /home/deploy/.ssh/config
Host github-chadlewine
    HostName github.com
    User git
    IdentityFile ~/.ssh/chadlewine_deploy
    IdentitiesOnly yes
```

Both clones' `origin` = `git@github-chadlewine:chadlewine/chadlewine.git`.

## nginx

Central `le-nginx` container (`/root/proxy`), conf.d mounted read-only. Both vhosts set
`client_max_body_size 200m` (admin media uploads to 200MB) and `proxy_pass` to the
container alias. Reload after a conf change:

```
cp /home/deploy/chadlewine-<env>/deploy/nginx/<file> /root/proxy/nginx/conf.d/<file>
docker exec le-nginx nginx -t && docker exec le-nginx nginx -s reload
```

## TLS

Shared certbot volumes (`rising-compass_certbot-certs` -> /etc/letsencrypt,
`rising-compass_certbot-webroot` -> /var/www/certbot); `00-acme.conf` serves the HTTP-01
challenge for any host; the `le-certbot` container auto-renews. Issue a new cert:

```
docker run --rm \
  -v rising-compass_certbot-certs:/etc/letsencrypt \
  -v rising-compass_certbot-webroot:/var/www/certbot \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  --cert-name chadlewine.com -d chadlewine.com -d www.chadlewine.com \
  --non-interactive --agree-tos -m chadlewine@gmail.com
```

Certs: `staging.chadlewine.com` (single), `chadlewine.com` (SAN: apex + www).

## Crons (PROD ONLY)

- `/etc/cron.d/chadlewine` (root:root 644) -- 6 jobs, UTC, from `deploy/cron/chadlewine.cron`.
- `/usr/local/bin/cl-cron-hit.sh` (755) -- from `deploy/cron/cl-cron-hit.sh`; reads
  `CRON_SECRET` from the prod `.env` and curls the endpoint with the Bearer.
- NEVER install these on staging. Vercel crons were emptied in `vercel.json` to avoid
  double execution.

| Job | Schedule (UTC) |
|---|---|
| printify-sync | `0 12 * * *` |
| merch-image-cleanup | `0 13 * * *` |
| fan-track-drip | `0 * * * *` |
| cart-recovery | `0 * * * *` |
| campaign-queue | `* * * * *` |
| inbound-digest | `0 14 * * 1` |

## DNS (GoDaddy)

| Host | Type | Value |
|---|---|---|
| staging | A | 138.197.111.66 |
| @ | A | 138.197.111.66 |
| www | A | 138.197.111.66 |

## Rollback (to Vercel)

Repoint GoDaddy `@` and `www` back to Vercel (apex A `216.150.1.1`; www was a Vercel
CNAME). The Vercel project is still live. NOTE: Vercel crons are emptied -- if rolling
back for more than a short window, restore the `crons` array in `vercel.json`.

## Resources / notes

- Droplet: Ubuntu 24.04, 4 vCPU, 7.8GB RAM, Etc/UTC. A temporary 4GB `/swapfile3` was
  added for Next builds on this memory-tight box (safe to keep).
- No `VERCEL` env var is set (the two `process.env.VERCEL` guards relax off-platform).
- librosa is NOT installed; the admin audio-scan route degrades gracefully (local-only).

## Known follow-ups

- **Consent geo-default**: off Vercel there are no `x-vercel-ip-*` geo headers, so
  `proxy.ts` now defaults unknown regions to `deny` (privacy-safe/compliant). To restore
  per-region "allow" for non-opt-in countries (analytics coverage), wire an nginx GeoIP2
  header mapped to `x-vercel-ip-country`.
- **Vercel decommission**: keep as rollback until confident, then delete the project.
