import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "@tinker/db";
import { requireAuth } from "../../middleware/auth.js";

const digestBodySchema = z.object({
  type: z.enum(["EMAIL", "SLACK"]),
  target: z.string().min(1).max(500),
});

export async function orgRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/orgs/:orgSlug/repos
  app.get(
    "/api/orgs/:orgSlug/repos",
    async (
      request: FastifyRequest<{ Params: { orgSlug: string } }>,
      reply: FastifyReply
    ) => {
      const user = requireAuth(request);

      const org = await prisma.organization.findUnique({
        where: { slug: request.params.orgSlug },
      });
      if (!org) return reply.code(404).send({ error: "Organization not found" });

      // Verify membership
      const membership = await prisma.orgMember.findUnique({
        where: {
          orgId_githubUserId: {
            orgId: org.id,
            githubUserId: Number(user.userId),
          },
        },
      });
      if (!membership) return reply.code(403).send({ error: "Not a member of this organization" });

      const repos = await prisma.repository.findMany({
        where: { orgId: org.id },
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          fullName: true,
          defaultBranch: true,
          createdAt: true,
          _count: { select: { ciRuns: true } },
        },
      });

      return reply.send({ repos });
    }
  );

  // GET /api/orgs/:orgSlug/digest
  app.get(
    "/api/orgs/:orgSlug/digest",
    async (
      request: FastifyRequest<{ Params: { orgSlug: string } }>,
      reply: FastifyReply
    ) => {
      const user = requireAuth(request);

      const org = await prisma.organization.findUnique({
        where: { slug: request.params.orgSlug },
      });
      if (!org) return reply.code(404).send({ error: "Organization not found" });

      await assertOrgMember(user.userId, org.id, reply);

      const subscriptions = await prisma.digestSubscription.findMany({
        where: { orgId: org.id },
        orderBy: { createdAt: "asc" },
      });

      return reply.send({ subscriptions });
    }
  );

  // POST /api/orgs/:orgSlug/digest
  app.post(
    "/api/orgs/:orgSlug/digest",
    async (
      request: FastifyRequest<{ Params: { orgSlug: string } }>,
      reply: FastifyReply
    ) => {
      const user = requireAuth(request);

      const org = await prisma.organization.findUnique({
        where: { slug: request.params.orgSlug },
      });
      if (!org) return reply.code(404).send({ error: "Organization not found" });

      await assertOrgMember(user.userId, org.id, reply);

      const parsed = digestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });
      }

      const sub = await prisma.digestSubscription.create({
        data: { orgId: org.id, type: parsed.data.type, target: parsed.data.target },
      });

      return reply.code(201).send(sub);
    }
  );

  // DELETE /api/orgs/:orgSlug/digest/:id
  app.delete(
    "/api/orgs/:orgSlug/digest/:id",
    async (
      request: FastifyRequest<{ Params: { orgSlug: string; id: string } }>,
      reply: FastifyReply
    ) => {
      const user = requireAuth(request);

      const org = await prisma.organization.findUnique({
        where: { slug: request.params.orgSlug },
      });
      if (!org) return reply.code(404).send({ error: "Organization not found" });

      await assertOrgMember(user.userId, org.id, reply);

      const deleted = await prisma.digestSubscription.deleteMany({
        where: { id: request.params.id, orgId: org.id },
      });

      if (deleted.count === 0) return reply.code(404).send({ error: "Subscription not found" });

      return reply.code(204).send();
    }
  );
}

async function assertOrgMember(
  userId: string,
  orgId: string,
  reply: FastifyReply
): Promise<void> {
  const membership = await prisma.orgMember.findUnique({
    where: { orgId_githubUserId: { orgId, githubUserId: Number(userId) } },
  });
  if (!membership) {
    reply.code(403).send({ error: "Not a member of this organization" });
    throw new Error("Unauthorized"); // aborts the handler
  }
}
