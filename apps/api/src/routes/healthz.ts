import type { FastifyInstance } from "fastify";

/**
 * Health check endpoints.
 *
 * GET /healthz         — shallow (process is alive)
 * GET /healthz/db      — Postgres connectivity
 * GET /healthz/redis   — Redis connectivity
 *
 * These are consumed by:
 *  - Fly.io machine health checks (fly.toml)
 *  - Betterstack Uptime monitors
 *  - Load balancer readiness checks
 *
 * Response: 200 OK (healthy) | 503 Service Unavailable (degraded)
 */
export async function healthzRoutes(app: FastifyInstance): Promise<void> {
  app.get("/healthz", async (_req, reply) => {
    return reply.code(200).send({ status: "ok", ts: new Date().toISOString() });
  });

  app.get("/healthz/db", async (_req, reply) => {
    try {
      // `app.db` is the Prisma client instance registered as a Fastify plugin
      await app.db.$queryRaw`SELECT 1`;
      return reply.code(200).send({ status: "ok", store: "postgres" });
    } catch (err) {
      app.log.error({ err }, "healthz/db: Postgres check failed");
      return reply.code(503).send({ status: "error", store: "postgres" });
    }
  });

  app.get("/healthz/redis", async (_req, reply) => {
    try {
      // `app.redis` is the ioredis instance registered as a Fastify plugin
      await app.redis.ping();
      return reply.code(200).send({ status: "ok", store: "redis" });
    } catch (err) {
      app.log.error({ err }, "healthz/redis: Redis check failed");
      return reply.code(503).send({ status: "error", store: "redis" });
    }
  });
}
