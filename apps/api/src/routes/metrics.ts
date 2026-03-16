import type { FastifyInstance } from "fastify";
import { registry } from "@tinker/observability";

/**
 * Prometheus metrics endpoint.
 * Consumed by Fly.io's built-in Prometheus scraper → Fly Grafana dashboards.
 *
 * GET /metrics  — Prometheus text format
 *
 * Note: this endpoint should NOT be publicly accessible in production.
 * Restrict via Fly.io private networking (fly-local-6pn) or an internal-only service.
 */
export async function metricsRoute(app: FastifyInstance): Promise<void> {
  app.get(
    "/metrics",
    {
      config: { skipAuth: true },
      schema: { hide: true },
    },
    async (_req, reply) => {
      const metrics = await registry.metrics();
      return reply
        .code(200)
        .type(registry.contentType)
        .send(metrics);
    }
  );
}
