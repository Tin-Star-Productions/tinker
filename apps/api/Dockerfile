FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@9

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/observability/package.json ./packages/observability/
COPY packages/github/package.json ./packages/github/
COPY packages/classifier/package.json ./packages/classifier/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile --prod

# ─── Build ────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @tinker/db db:generate
RUN pnpm --filter @tinker/api build

# ─── Runner ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
