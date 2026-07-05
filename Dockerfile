# chadlewine.com -- production image (migrated off Vercel to le-projects-01).
#
# Multi-stage: install deps -> build Next (output: "standalone") -> lean runner
# that serves .next/standalone/server.js. Base node:22-slim matches Lyric
# Transformer (glibc -> sharp's prebuilt binary works). Joined to the shared
# le-proxy network; the central le-nginx proxies to it. See deploy/DEPLOY.md.
#
# ENV MODEL: the FULL env (public + server) must be present during `next build`,
# because several modules read server env at MODULE scope -- e.g.
# src/lib/media-config.ts builds MEDIA_TYPE_CONFIG at import time via an env()
# helper that throws on any missing BUNNY_* var, and Next evaluates it during
# "collect page data". So the per-instance .env is mounted as a BuildKit secret
# and written to .env.production for Next's own dotenv loader. Only NEXT_PUBLIC_*
# get inlined into the client bundle; server process.env reads stay dynamic and
# are supplied at RUNTIME from the compose env_file. The secret is never stored
# in an image layer.

# --- 1) deps ---
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- 2) build ---
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# .env.production is created + removed inside this single RUN, so it never lands
# in a persisted layer; the secret itself is tmpfs-mounted, never in a layer.
RUN --mount=type=secret,id=buildenv,mode=0400 \
    cp /run/secrets/buildenv .env.production \
 && NEXT_TELEMETRY_DISABLED=1 npm run build \
 && rm -f .env.production

# --- 3) runner ---
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0
# Standalone bundles server.js + traced node_modules; static + public are NOT
# folded in, so copy them alongside. No env file is copied -- runtime env comes
# from the compose env_file.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# node:22-slim ships a non-root `node` user (UID 1000); use it.
USER node
# Actual port comes from PORT (set by compose per instance). EXPOSE is docs only.
EXPOSE 3000
CMD ["node", "server.js"]
