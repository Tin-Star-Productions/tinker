import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { Redis } from "ioredis";
import { prisma } from "@tinker/db";
import { logger } from "@tinker/observability";
import { healthzRoutes } from "./routes/healthz.js";
import { githubWebhookRoutes } from "./routes/webhooks/github.js";
import { authRoutes } from "./routes/auth/index.js";
import { githubAppRoutes } from "./routes/github/index.js";
import { orgRoutes } from "./routes/orgs/index.js";
import { repoRoutes } from "./routes/repos/index.js";
import { authMiddleware } from "./middleware/auth.js";

// ─── Fastify type augmentation ────────────────────────────────────────────────

declare module "fastify" {
  interface FastifyInstance {
    db: typeof prisma;
    redis: Redis;
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap() {
  const app = Fastify({
    logger,
    // Expose raw body for webhook signature verification
    addContentTypeParser: false,
  });

  // Parse JSON bodies; preserve rawBody for webhook routes
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // ─── Infrastructure ──────────────────────────────────────────────────────

  const redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null, // Required by BullMQ
  });

  // Decorate Fastify with shared clients
  app.decorate("db", prisma);
  app.decorate("redis", redis);

  // ─── Session ─────────────────────────────────────────────────────────────

  await app.register(cookie);
  await app.register(session, {
    secret: process.env["SESSION_SECRET"] ?? "dev-secret-change-in-production-please",
    cookie: {
      secure: process.env["NODE_ENV"] === "production",
      httpOnly: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  });

  // ─── Auth middleware (runs before all routes except skipAuth ones) ────────

  await app.register(authMiddleware);

  // ─── Routes ──────────────────────────────────────────────────────────────

  await app.register(healthzRoutes);
  await app.register(githubWebhookRoutes);
  await app.register(authRoutes);
  await app.register(githubAppRoutes);
  await app.register(orgRoutes);
  await app.register(repoRoutes);

  // ─── Start ───────────────────────────────────────────────────────────────

  const port = Number(process.env["PORT"] ?? 3000);
  const host = process.env["HOST"] ?? "0.0.0.0";

  await app.listen({ port, host });
  app.log.info(`API server listening on ${host}:${port}`);

  // ─── Graceful shutdown ───────────────────────────────────────────────────

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal} — shutting down`);
    await app.close();
    await redis.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
