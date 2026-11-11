# syntax=docker/dockerfile:1

FROM node:22-alpine AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=1536
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build \
  && npm run build:worker

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/data \
  && chown -R nextjs:nodejs /app/data

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/database ./database
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@napi-rs ./node_modules/@napi-rs
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pngjs ./node_modules/pngjs
# Next standalone already traces sharp's platform-specific native package.
# Copying all @img variants would add unnecessary macOS/Windows binaries.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/detect-libc ./node_modules/detect-libc
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/semver ./node_modules/semver
COPY --from=builder --chown=nextjs:nodejs /app/worker-dist ./worker-dist
COPY --from=builder --chown=nextjs:nodejs /app/scripts/ingestion-worker.mjs ./scripts/ingestion-worker.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/research-worker.mjs ./scripts/research-worker.mjs

USER nextjs
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
