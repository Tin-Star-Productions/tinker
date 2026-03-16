import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export type ProcessRunJobData = {
  githubRunId: number;
  repoId: string;
  installationId: number;
};

export type SyncInstallationJobData = {
  action: "created" | "deleted";
  installationId: number;
  githubOrgId: number;
  githubOrgLogin: string;
  repositoryIds?: number[];
  repositoryFullNames?: string[];
};

export const PROCESS_RUN_QUEUE = "process-run";
export const SYNC_INSTALLATION_QUEUE = "sync-installation";

let processRunQueue: Queue<ProcessRunJobData> | null = null;
let syncInstallationQueue: Queue<SyncInstallationJobData> | null = null;

export function getProcessRunQueue(redis: Redis): Queue<ProcessRunJobData> {
  if (!processRunQueue) {
    processRunQueue = new Queue<ProcessRunJobData>(PROCESS_RUN_QUEUE, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return processRunQueue;
}

export function getSyncInstallationQueue(
  redis: Redis
): Queue<SyncInstallationJobData> {
  if (!syncInstallationQueue) {
    syncInstallationQueue = new Queue<SyncInstallationJobData>(
      SYNC_INSTALLATION_QUEUE,
      {
        connection: redis,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      }
    );
  }
  return syncInstallationQueue;
}
