import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@tinker/db";

export async function githubAppRoutes(app: FastifyInstance): Promise<void> {
  const appId = process.env["GITHUB_APP_ID"]!;
  const appSlug = process.env["GITHUB_APP_SLUG"] ?? "tinker-ci";

  // GET /api/github/app/setup — returns the GitHub App install URL
  app.get(
    "/api/github/app/setup",
    { config: { skipAuth: true } },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const installUrl = `https://github.com/apps/${appSlug}/installations/new`;
      return reply.send({ installUrl, appId });
    }
  );

  // GET /api/github/app/callback — post-install callback from GitHub
  // GitHub redirects here after user installs the App with ?installation_id=...&setup_action=install
  app.get(
    "/api/github/app/callback",
    { config: { skipAuth: true } },
    async (
      request: FastifyRequest<{
        Querystring: {
          installation_id?: string;
          setup_action?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { installation_id, setup_action } = request.query;

      if (!installation_id) {
        return reply.redirect("/?error=missing_installation_id");
      }

      app.log.info(
        { installationId: installation_id, action: setup_action },
        "GitHub App install callback received"
      );

      // The actual org/repo upsert happens via the `installation` webhook event
      // (more reliable than depending on this callback). Redirect to dashboard.
      return reply.redirect(`/?installed=true&installation_id=${installation_id}`);
    }
  );
}
