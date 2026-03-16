import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@tinker/db";
import { logger } from "@tinker/observability";
import { processRunJob } from "./processors/process-run.js";
import { syncInstallationJob } from "./processors/sync-installation.js";
import {
  PROCESS_RUN_QUEUE,
  SYNC_INSTALLATION_QUEUE,
} from "./queues.js";
import type { ProcessRunJobData, SyncInstallationJobData } from "./processors/types.js";

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

// ─── Graceful shutdown ────────────────────────────────────────────────────────

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal} — shutting down workers`);
  await processRunWorker.close();
  await syncWorker.close();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

logger.info("Worker started — listening for jobs");
