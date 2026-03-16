import type { Job } from "bullmq";
import { prisma } from "@tinker/db";
import type { SyncInstallationJobData } from "./types.js";

/**
 * SYNC_INSTALLATION worker job.
 *
 * Triggered when a GitHub App installation is created or deleted.
 */
export async function syncInstallationJob(
  job: Job<SyncInstallationJobData>
): Promise<void> {
  const { action, installationId, githubOrgId, githubOrgLogin, repositoryFullNames } =
    job.data;

  if (action === "created") {
    // Upsert the organization record
    const org = await prisma.organization.upsert({
      where: { githubOrgId },
      create: {
        githubOrgId,
        name: githubOrgLogin,
        slug: githubOrgLogin.toLowerCase(),
        installationId,
      },
      update: { installationId, name: githubOrgLogin },
    });

    // Create repository stubs for each repo in the installation
    if (repositoryFullNames && repositoryFullNames.length > 0) {
      for (const fullName of repositoryFullNames) {
        const repoId = job.data.repositoryIds?.[repositoryFullNames.indexOf(fullName)];
        if (!repoId) continue;

        await prisma.repository.upsert({
          where: { githubRepoId: repoId },
          create: {
            orgId: org.id,
            githubRepoId: repoId,
            fullName,
          },
          update: { fullName },
        });
      }
    }

    await job.log(`Created organization ${githubOrgLogin} (installation ${installationId})`);
  } else if (action === "deleted") {
    // Clear the installationId — keep org + data for audit trail
    await prisma.organization.updateMany({
      where: { githubOrgId },
      data: { installationId: null },
    });

    await job.log(`Removed installation ${installationId} from org ${githubOrgLogin}`);
  }
}
