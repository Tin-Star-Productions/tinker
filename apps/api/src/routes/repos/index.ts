import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "@tinker/db";
import { requireAuth } from "../../middleware/auth.js";

const feedbackSchema = z.object({
  feedback: z.enum(["CORRECT", "INCORRECT"]),
});

export async function repoRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/repos/:repoId
  app.get(
    "/api/repos/:repoId",
    async (
      request: FastifyRequest<{ Params: { repoId: string } }>,
      reply: FastifyReply
    ) => {
      const user = requireAuth(request);

      const repo = await prisma.repository.findUnique({
        where: { id: request.params.repoId },
        include: { org: true },
      });
      if (!repo) return reply.code(404).send({ error: "Repository not found" });

      await assertRepoAccess(user.userId, repo.orgId, reply);

      return reply.send({ repo });
    }
  );

  // GET /api/repos/:repoId/runs
  app.get(
    "/api/repos/:repoId/runs",
    async (
      request: FastifyRequest<{
        Params: { repoId: string };
        Querystring: {
          page?: string;
          limit?: string;
          pr?: string;
          branch?: string;
          status?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const user = requireAuth(request);
      const { repoId } = request.params;
      const { page = "1", limit = "20", pr, branch, status } = request.query;

      const repo = await prisma.repository.findUnique({ where: { id: repoId } });
      if (!repo) return reply.code(404).send({ error: "Repository not found" });

      await assertRepoAccess(user.userId, repo.orgId, reply);

      const skip = (Number(page) - 1) * Number(limit);
      const take = Math.min(Number(limit), 100);

      const where = {
        repoId,
        ...(pr ? { prNumber: Number(pr) } : {}),
        ...(branch ? { branch } : {}),
        ...(status ? { status: status as "QUEUED" | "IN_PROGRESS" | "COMPLETED" } : {}),
      };

      const [runs, total] = await Promise.all([
        prisma.ciRun.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take,
          select: {
            id: true,
            githubRunId: true,
            prNumber: true,
            headSha: true,
            branch: true,
            status: true,
            conclusion: true,
            createdAt: true,
            completedAt: true,
            _count: {
              select: {
                testResults: true,
                classifications: true,
              },
            },
          },
        }),
        prisma.ciRun.count({ where }),
      ]);

      return reply.send({
        runs: runs.map((r) => ({ ...r, githubRunId: r.githubRunId.toString() })),
        pagination: { total, page: Number(page), limit: take },
      });
    }
  );

  // GET /api/repos/:repoId/runs/:runId
  app.get(
    "/api/repos/:repoId/runs/:runId",
    async (
      request: FastifyRequest<{ Params: { repoId: string; runId: string } }>,
      reply: FastifyReply
    ) => {
      const user = requireAuth(request);
      const { repoId, runId } = request.params;

      const repo = await prisma.repository.findUnique({ where: { id: repoId } });
      if (!repo) return reply.code(404).send({ error: "Repository not found" });

      await assertRepoAccess(user.userId, repo.orgId, reply);

      const run = await prisma.ciRun.findUnique({
        where: { id: runId },
        include: {
          testResults: {
            include: { classification: true },
            orderBy: { status: "asc" },
          },
        },
      });

      if (!run || run.repoId !== repoId) {
        return reply.code(404).send({ error: "Run not found" });
      }

      return reply.send({
        run: {
          ...run,
          githubRunId: run.githubRunId.toString(),
        },
      });
    }
  );

  // GET /api/repos/:repoId/flaky-tests
  app.get(
    "/api/repos/:repoId/flaky-tests",
    async (
      request: FastifyRequest<{
        Params: { repoId: string };
        Querystring: { page?: string; limit?: string; minScore?: string };
      }>,
      reply: FastifyReply
    ) => {
      const user = requireAuth(request);
      const { repoId } = request.params;
      const { page = "1", limit = "50", minScore = "0.1" } = request.query;

      const repo = await prisma.repository.findUnique({ where: { id: repoId } });
      if (!repo) return reply.code(404).send({ error: "Repository not found" });

      await assertRepoAccess(user.userId, repo.orgId, reply);

      const skip = (Number(page) - 1) * Number(limit);
      const take = Math.min(Number(limit), 100);

      const [tests, total] = await Promise.all([
        prisma.flakyTest.findMany({
          where: { repoId, flakeScore: { gte: Number(minScore) } },
          orderBy: { flakeScore: "desc" },
          skip,
          take,
        }),
        prisma.flakyTest.count({
          where: { repoId, flakeScore: { gte: Number(minScore) } },
        }),
      ]);

      return reply.send({
        tests,
        pagination: { total, page: Number(page), limit: take },
      });
    }
  );

  // GET /api/repos/:repoId/flaky-tests/:testName/history
  app.get(
    "/api/repos/:repoId/flaky-tests/:testName/history",
    async (
      request: FastifyRequest<{ Params: { repoId: string; testName: string } }>,
      reply: FastifyReply
    ) => {
      const user = requireAuth(request);
      const { repoId, testName } = request.params;
      const decodedName = decodeURIComponent(testName);

      const repo = await prisma.repository.findUnique({ where: { id: repoId } });
      if (!repo) return reply.code(404).send({ error: "Repository not found" });

      await assertRepoAccess(user.userId, repo.orgId, reply);

      // Last 20 test results for this test name
      const history = await prisma.testResult.findMany({
        where: {
          testName: decodedName,
          ciRun: { repoId },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          durationMs: true,
          createdAt: true,
          ciRun: {
            select: {
              id: true,
              githubRunId: true,
              branch: true,
              prNumber: true,
              headSha: true,
            },
          },
        },
      });

      return reply.send({
        testName: decodedName,
        history: history.map((h) => ({
          ...h,
          ciRun: { ...h.ciRun, githubRunId: h.ciRun.githubRunId.toString() },
        })),
      });
    }
  );

  // POST /api/classifications/:id/feedback
  app.post(
    "/api/classifications/:id/feedback",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      requireAuth(request);

      const parsed = feedbackSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });
      }

      const updated = await prisma.failureClassification.updateMany({
        where: { id: request.params.id },
        data: { feedback: parsed.data.feedback },
      });

      if (updated.count === 0) {
        return reply.code(404).send({ error: "Classification not found" });
      }

      return reply.code(204).send();
    }
  );
}

async function assertRepoAccess(
  userId: string,
  orgId: string,
  reply: FastifyReply
): Promise<void> {
  const membership = await prisma.orgMember.findUnique({
    where: { orgId_githubUserId: { orgId, githubUserId: Number(userId) } },
  });
  if (!membership) {
    reply.code(403).send({ error: "Access denied" });
    throw new Error("Unauthorized");
  }
}
