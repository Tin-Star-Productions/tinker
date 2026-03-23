import { Worker, Queue } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@tinker/db";
import { logger } from "@tinker/observability";
import { processRunJob } from "./processors/process-run.js";
import { syncInstallationJob } from "./processors/sync-installation.js";
import { digestJob } from "./processors/digest.js";
import {
  PROCESS_RUN_QUEUE,
  SYNC_INSTALLATION_QUEUE,
  DIGEST_QUEUE,
} from "./queues.js";
import type { ProcessRunJobData, SyncInstallationJobData } from "./processors/types.js";
import type { DigestJobData } from "./processors/digest.js";

const redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null, // Required by BullMQ
});

// ─── Process-Run Worker ───────────────────────────────────────────────────────

const processRunWorker = new Worker<ProcessRunJobData>(
  PROCESS_RUN_QUEUE,
  async (job) => {
    await processRunJob(job);
  },
  {
    connection: redis,
    concurrency: 3, // Process up to 3 runs in parallel (bounded by Fly.io worker RAM)
    limiter: {
      max: 10, // Max 10 jobs per duration
      duration: 60_000, // per minute (rate-limit log downloads vs GitHub API)
    },
  }
);

processRunWorker.on("completed", (job) => {
  logger.info({ jobId: job.id, runId: job.data.githubRunId }, "process-run completed");
});

processRunWorker.on("failed", (job, err) => {
  logger.error(
    { jobId: job?.id, runId: job?.data.githubRunId, err },
    "process-run failed"
  );
});

// ─── Sync-Installation Worker ─────────────────────────────────────────────────

const syncWorker = new Worker<SyncInstallationJobData>(
  SYNC_INSTALLATION_QUEUE,
  async (job) => {
    await syncInstallationJob(job);
  },
  {
    connection: redis,
    concurrency: 5,
  }
);

syncWorker.on("completed", (job) => {
  logger.info({ jobId: job.id, org: job.data.githubOrgLogin }, "sync-installation completed");
});

syncWorker.on("failed", (job, err) => {
  logger.error(
    { jobId: job?.id, org: job?.data.githubOrgLogin, err },
    "sync-installation failed"
  );
});

// ─── Digest Worker ────────────────────────────────────────────────────────────

const digestWorker = new Worker<DigestJobData>(
  DIGEST_QUEUE,
  async (job) => {
    await digestJob(job);
  },
  {
    connection: redis,
    concurrency: 2,
  }
);

digestWorker.on("completed", (job) => {
  logger.info({ jobId: job.id, orgId: job.data.orgId }, "digest completed");
});

digestWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, orgId: job?.data.orgId, err }, "digest failed");
});

// ─── Digest scheduler — enqueue weekly digest for each org ───────────────────

async function scheduleWeeklyDigests() {
  const digestQueue = new Queue<DigestJobData>(DIGEST_QUEUE, { connection: redis });

  // Upsert a repeatable job that fires every Monday at 09:00 UTC
  const orgs = await prisma.organization.findMany({
    where: { digestSubs: { some: {} } },
    select: { id: true },
  });

  for (const org of orgs) {
    await digestQueue.add(
      "weekly-digest",
      { orgId: org.id },
      {
        jobId: `weekly-digest-${org.id}`,
        repeat: { pattern: "0 9 * * 1" }, // Every Monday at 09:00 UTC
        removeOnComplete: 10,
        removeOnFail: 10,
      }
    );
  }

  logger.info(`Scheduled weekly digest for ${orgs.length} org(s)`);
}

scheduleWeeklyDigests().catch((err) =>
  logger.error({ err }, "Failed to schedule weekly digests")
);

// ─── Graceful shutdown ────────────────────────────────────────────────────────

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal} — shutting down workers`);
  await processRunWorker.close();
  await syncWorker.close();
  await digestWorker.close();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

logger.info("Worker started — listening for jobs");
