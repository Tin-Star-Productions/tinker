FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@9

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/observability/package.json ./packages/observability/
COPY packages/github/package.json ./packages/github/
COPY packages/classifier/package.json ./packages/classifier/
COPY apps/worker/package.json ./apps/worker/
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @tinker/db db:generate
RUN pnpm --filter @tinker/worker build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules

CMD ["node", "apps/worker/dist/worker.js"]
