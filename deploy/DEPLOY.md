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

## DNS + CDN (Cloudflare)

DNS authority was moved from GoDaddy to **Cloudflare** (free plan) on 2026-07-05;
GoDaddy remains only the registrar (nameservers -> `cloe`/`decker.ns.cloudflare.com`).
The full zone was imported from the GoDaddy export (`Downloads/chadlewine.com (1).txt`)
-- notably the Google Workspace MX + all Resend/Amazon SES records (`reply`/`send`/
`send.reply` MX, `dc-*._spfm*` SPF, `resend._domainkey[.reply]` DKIM, `click` CNAME).

| Host | Type | Value | Cloudflare proxy |
|---|---|---|---|
| @ | A | 138.197.111.66 | Proxied (orange) |
| www | A | 138.197.111.66 | Proxied (orange) |
| staging | A | 138.197.111.66 | Proxied (orange) |
| MX (Google + SES) | MX | ... | DNS only (never proxy MX) |
| `click` | CNAME | links1.resend-dns.com | **DNS only** (Resend tracking) |
| DKIM/SPF/DMARC/verif | TXT | ... | DNS only |

Cloudflare settings: **SSL/TLS = Full (strict)** (origin has a valid LE cert),
**Always Use HTTPS = on**. Cloudflare gives visitors HTTP/2 + HTTP/3 + Brotli at the
edge, so the origin `le-nginx` HTTP/1.1 is now only the CF<->origin hop.

Edge caching: `_next/static` (immutable) caches at the edge automatically (MISS->HIT).
**`/_next/image` does NOT edge-cache** -- Next sends `Vary: Accept` (AVIF/WebP/JPEG by
browser) and Cloudflare free won't cache non-`Accept-Encoding` Vary responses. A
Cache Rule for `/_next/image` was created but is inert for this reason. Images are
still fine (origin disk-cached + Bunny-sourced). To make images globally edge-fast,
the clean fix is app-side: serve Bunny (`b-cdn.net`) images directly via a custom
Next image loader / plain `<img>`, bypassing the optimizer entirely (Bunny is already
a global CDN and sources are pre-compressed at quality 100).

TLS renewal note: the origin LE cert renews via HTTP-01 through Cloudflare; verify the
first auto-renewal (~2026-10-03 window). If it fails behind the proxy, switch the
droplet to DNS-01 (Cloudflare API token) or install a Cloudflare Origin Certificate.

## Rollback

- **Off Cloudflare (back to GoDaddy DNS):** repoint the domain's nameservers at GoDaddy
  back to `ns23`/`ns24.domaincontrol.com` (the GoDaddy zone still has the pre-move
  records). Or, within Cloudflare, set the A records to "DNS only" (grey) to bypass the
  proxy while keeping CF DNS.
- **Off the droplet (back to Vercel):** in Cloudflare DNS, point `@`/`www` back to Vercel
  (apex A `216.150.1.1`; www CNAME to Vercel). The Vercel project is still live. NOTE:
  Vercel crons are emptied -- if rolling back for more than a short window, restore the
  `crons` array in `vercel.json`.

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
