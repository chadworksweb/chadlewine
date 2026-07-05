# chadlewine.com -- production image (migrated off Vercel to le-projects-01).
#
# Multi-stage: install deps -> build Next (output: "standalone") -> lean runner
# that serves .next/standalone/server.js. NEXT_PUBLIC_* are BAKED into the client
# bundle at build time, so they arrive as build ARGs and differ per instance
# (staging vs prod each build their own image). SERVER secrets are injected at
# RUNTIME via the compose env_file and are never present in the image.
#
# Base image node:22-slim matches Lyric Transformer (glibc -> sharp's prebuilt
# binary works without alpine/musl gymnastics). Joined to the shared le-proxy
# network; the central le-nginx proxies to it. See deploy/DEPLOY.md.

# --- 1) deps: install with the committed lockfile ---
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- 2) build: bake NEXT_PUBLIC_* and run next build ---
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public values baked into the client bundle. The full set the app references
# (verified via grep of src/ + .env.local). SITE_URL and TURNSTILE are NOT in
# the local .env.local -- they come from the deployed env, so they MUST be passed
# here or the client bundle bakes `undefined`.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES
ARG NEXT_PUBLIC_BUNNY_PULL_ZONE_COVER_ART
ARG NEXT_PUBLIC_BUNNY_PULL_ZONE_MUSIC_STREAMING
ARG NEXT_PUBLIC_BUNNY_STREAM_PULL_ZONE
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES=$NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES \
    NEXT_PUBLIC_BUNNY_PULL_ZONE_COVER_ART=$NEXT_PUBLIC_BUNNY_PULL_ZONE_COVER_ART \
    NEXT_PUBLIC_BUNNY_PULL_ZONE_MUSIC_STREAMING=$NEXT_PUBLIC_BUNNY_PULL_ZONE_MUSIC_STREAMING \
    NEXT_PUBLIC_BUNNY_STREAM_PULL_ZONE=$NEXT_PUBLIC_BUNNY_STREAM_PULL_ZONE \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- 3) runner: minimal standalone runtime ---
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0
# Standalone bundles server.js + traced node_modules; static + public are NOT
# folded in, so copy them alongside.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# node:22-slim ships a non-root `node` user (UID 1000); use it.
USER node
# Actual port comes from PORT (set by compose per instance). EXPOSE is docs only.
EXPOSE 3000
CMD ["node", "server.js"]
