import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomBytes } from "node:crypto";
import {
  getAuthorizationUrl,
  exchangeCodeForToken,
  getAuthenticatedUser,
} from "@tinker/github/oauth";
import { prisma } from "@tinker/db";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-memory CSRF state store (Redis would be better for multi-instance, fine for MVP)
const pendingStates = new Map<string, number>();

function cleanExpiredStates() {
  const now = Date.now();
  for (const [state, ts] of pendingStates.entries()) {
    if (now - ts > STATE_TTL_MS) pendingStates.delete(state);
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const oauthConfig = {
    clientId: process.env["GITHUB_OAUTH_CLIENT_ID"]!,
    clientSecret: process.env["GITHUB_OAUTH_CLIENT_SECRET"]!,
    callbackUrl:
      process.env["GITHUB_OAUTH_CALLBACK_URL"] ??
      "http://localhost:3000/api/auth/github/callback",
  };

  // GET /api/auth/github — redirect to GitHub OAuth
  app.get(
    "/api/auth/github",
    { config: { skipAuth: true } },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      cleanExpiredStates();
      const state = randomBytes(16).toString("hex");
      pendingStates.set(state, Date.now());
      const url = getAuthorizationUrl(oauthConfig, state);
      return reply.redirect(url);
    }
  );

  // GET /api/auth/github/callback
  app.get(
    "/api/auth/github/callback",
    { config: { skipAuth: true } },
    async (
      request: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>,
      reply: FastifyReply
    ) => {
      const { code, state, error } = request.query;

      if (error) {
        return reply.redirect(`/?error=${encodeURIComponent(error)}`);
      }

      if (!code || !state) {
        return reply.code(400).send({ error: "Missing code or state" });
      }

      // Validate CSRF state
      if (!pendingStates.has(state)) {
        return reply.code(400).send({ error: "Invalid or expired OAuth state" });
      }
      pendingStates.delete(state);

      try {
        const { accessToken } = await exchangeCodeForToken(oauthConfig, code);
        const ghUser = await getAuthenticatedUser(accessToken);

        // Set session
        request.session.userId = String(ghUser.id);
        request.session.githubLogin = ghUser.login;
        request.session.githubAccessToken = accessToken;

        // We'll resolve org memberships lazily on /api/auth/me
        request.session.orgIds = [];

        return reply.redirect("/");
      } catch (err) {
        app.log.error({ err }, "GitHub OAuth callback error");
        return reply.redirect("/?error=oauth_failed");
      }
    }
  );

  // GET /api/auth/me
  app.get(
    "/api/auth/me",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, githubLogin } = request.session;
      if (!userId) {
        return reply.code(401).send({ error: "Not authenticated" });
      }

      // Fetch orgs this user is a member of
      const memberships = await prisma.orgMember.findMany({
        where: { githubUserId: Number(userId) },
        include: { org: { select: { id: true, slug: true, name: true } } },
      });

      return reply.send({
        id: userId,
        githubLogin,
        orgs: memberships.map((m) => ({
          id: m.org.id,
          slug: m.org.slug,
          name: m.org.name,
          role: m.role,
        })),
      });
    }
  );

  // DELETE /api/auth/session — logout
  app.delete(
    "/api/auth/session",
    async (request: FastifyRequest, reply: FastifyReply) => {
      await request.session.destroy();
      return reply.code(204).send();
    }
  );
}
