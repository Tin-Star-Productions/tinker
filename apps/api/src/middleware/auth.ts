import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
  RouteOptions,
} from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    session: {
      userId?: string;
      githubLogin?: string;
      githubAccessToken?: string;
      orgIds?: string[];
      destroy: () => Promise<void>;
    };
  }
  interface RouteOptions {
    config?: {
      skipAuth?: boolean;
    };
  }
}

export type SessionUser = {
  userId: string;
  githubLogin: string;
  githubAccessToken: string;
  orgIds: string[];
};

/**
 * Returns the authenticated user from the session, or throws 401.
 * Use in route handlers instead of the preHandler hook for cleaner error messages.
 */
export function requireAuth(request: FastifyRequest): SessionUser {
  const { userId, githubLogin, githubAccessToken, orgIds } = request.session;
  if (!userId || !githubLogin || !githubAccessToken) {
    throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  }
  return { userId, githubLogin, githubAccessToken, orgIds: orgIds ?? [] };
}

/**
 * Fastify plugin: registers a preHandler that enforces session auth on all
 * routes except those with `config.skipAuth = true`.
 */
export async function authMiddleware(app: FastifyInstance): Promise<void> {
  app.addHook(
    "preHandler",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const routeConfig = (request.routeOptions as RouteOptions).config;
      if (routeConfig?.skipAuth) return;

      // Skip auth for health checks, metrics, and webhooks
      const path = request.url.split("?")[0]!;
      if (
        path.startsWith("/healthz") ||
        path.startsWith("/metrics") ||
        path.startsWith("/webhooks/") ||
        path.startsWith("/api/auth/")
      ) {
        return;
      }

      if (!request.session.userId) {
        return reply.code(401).send({ error: "Authentication required" });
      }
    }
  );
}
