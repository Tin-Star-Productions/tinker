import { Octokit } from "@octokit/rest";
import type { Job } from "bullmq";
import { prisma } from "@tinker/db";
import { classify } from "@tinker/classifier";
import { parseTestOutput } from "../parsers/index.js";
import type { ProcessRunJobData } from "./types.js";

/**
 * PROCESS_RUN worker job.
 *
 * Triggered when a GitHub Actions workflow_run completes.
 *
 * Steps:
 * 1. Fetch run metadata from GitHub API
 * 2. Download workflow logs (zip)
 * 3. Parse test output from logs (in-memory only — never written to disk/DB)
 * 4. Store TestResult rows
 * 5. Run classifier on each failed test
 * 6. Store FailureClassification rows
 * 7. Update FlakyTest materialized table
 * 8. Post PR comment (if PR run) via GitHub App bot
 * 9. Discard raw logs (they're GC'd — no explicit action needed)
 */
export async function processRunJob(
  job: Job<ProcessRunJobData>
): Promise<void> {
  const { githubRunId, repoId: githubRepoIdStr, installationId } = job.data;
  const log = job.log.bind(job);

  await log(`Processing run ${githubRunId} (installation ${installationId})`);

  // ─── Step 1: Resolve DB repo record ────────────────────────────────────────

  const repo = await prisma.repository.findFirst({
    where: { githubRepoId: Number(githubRepoIdStr) },
    include: { org: true },
  });

  if (!repo) {
    await log(`Repository with githubRepoId=${githubRepoIdStr} not found — skipping`);
    return;
  }

  // ─── Step 2: Fetch run metadata ────────────────────────────────────────────

  const { App } = await import("@octokit/app");
  const githubApp = new App({
    appId: process.env["GITHUB_APP_ID"]!,
    privateKey: process.env["GITHUB_APP_PRIVATE_KEY"]!,
    webhooks: { secret: process.env["GITHUB_APP_WEBHOOK_SECRET"]! },
    oauth: {
      clientId: process.env["GITHUB_OAUTH_CLIENT_ID"]!,
      clientSecret: process.env["GITHUB_OAUTH_CLIENT_SECRET"]!,
    },
  });

  const octokit = (await githubApp.getInstallationOctokit(installationId)) as Octokit;

  const [owner, repoName] = repo.fullName.split("/") as [string, string];

  const { data: runData } = await octokit.actions.getWorkflowRun({
    owner,
    repo: repoName,
    run_id: githubRunId,
  });

  if (runData.status !== "completed" || runData.conclusion === "success") {
    await log(`Run ${githubRunId} is ${runData.status}/${runData.conclusion ?? "?"} — skipping`);
    return;
  }

  // Upsert CiRun record
  const ciRun = await prisma.ciRun.upsert({
    where: { githubRunId: BigInt(githubRunId) },
    create: {
      repoId: repo.id,
      githubRunId: BigInt(githubRunId),
      prNumber: runData.pull_requests?.[0]?.number ?? null,
      headSha: runData.head_sha,
      branch: runData.head_branch ?? "unknown",
      status: "COMPLETED",
      conclusion: runData.conclusion,
      completedAt: runData.updated_at ? new Date(runData.updated_at) : null,
    },
    update: {
      status: "COMPLETED",
      conclusion: runData.conclusion,
      completedAt: runData.updated_at ? new Date(runData.updated_at) : null,
    },
  });

  // ─── Step 3: Download and parse logs (in-memory) ────────────────────────────

  let parsedTests: Awaited<ReturnType<typeof parseTestOutput>> = [];

  try {
    const logsResponse = await octokit.actions.downloadWorkflowRunLogs({
      owner,
      repo: repoName,
      run_id: githubRunId,
    });

    // logsResponse.data is a zip archive as ArrayBuffer
    const zipBuffer = Buffer.from(logsResponse.data as ArrayBuffer);

    // Dynamically import unzipper to extract and process log files in-memory
    const unzipper = await import("unzipper");
    const directory = await unzipper.Open.buffer(zipBuffer);

    for (const file of directory.files) {
      if (file.type !== "File") continue;
      // Only process text/log files; skip binary
      if (!file.path.match(/\.(xml|txt|log)$/i)) continue;

      const content = (await file.buffer()).toString("utf-8");
      const results = parseTestOutput(content);
      parsedTests = parsedTests.concat(results);
      // content goes out of scope here — no reference retained
    }
    // zipBuffer goes out of scope — GC handles cleanup
  } catch (err) {
    await log(`Failed to download/parse logs for run ${githubRunId}: ${String(err)}`);
    // Continue — we can still update the CiRun record even without test results
  }

  await prisma.ciRun.update({
    where: { id: ciRun.id },
    data: { logsFetchedAt: new Date() },
  });

  // ─── Step 4: Store TestResult rows ─────────────────────────────────────────

  if (parsedTests.length === 0) {
    await log(`No test results found in logs for run ${githubRunId}`);
    return;
  }

  const failedTests = parsedTests.filter(
    (t) => t.status === "FAIL" || t.status === "ERROR"
  );

  await log(`Parsed ${parsedTests.length} tests, ${failedTests.length} failures`);

  // Bulk insert test results
  await prisma.testResult.createMany({
    data: parsedTests.map((t) => ({
      ciRunId: ciRun.id,
      testName: t.testName,
      testSuite: t.testSuite,
      status: t.status,
      durationMs: t.durationMs,
      errorMessage: t.errorMessage,
    })),
    skipDuplicates: true,
  });

  // ─── Step 5 & 6: Classify failed tests ─────────────────────────────────────

  if (failedTests.length === 0) return;

  // Fetch PR changed files (if this is a PR run)
  let prChangedFiles: string[] | undefined;
  if (ciRun.prNumber && ciRun.prNumber > 0) {
    try {
      const { data: prFiles } = await octokit.pulls.listFiles({
        owner,
        repo: repoName,
        pull_number: ciRun.prNumber,
        per_page: 100,
      });
      prChangedFiles = prFiles.map((f) => f.filename);
    } catch {
      await log(`Could not fetch PR files for #${ciRun.prNumber}`);
    }
  }

  // Fetch known flaky tests for this repo (batch lookup)
  const failedTestNames = failedTests.map((t) => t.testName);
  const flakyRecords = await prisma.flakyTest.findMany({
    where: {
      repoId: repo.id,
      testName: { in: failedTestNames },
    },
  });
  const flakyMap = new Map(flakyRecords.map((f) => [f.testName, f.flakeScore]));

  // Fetch the stored TestResult IDs for the failed tests
  const storedResults = await prisma.testResult.findMany({
    where: {
      ciRunId: ciRun.id,
      status: { in: ["FAIL", "ERROR"] },
    },
    select: { id: true, testName: true, errorMessage: true },
  });
  const storedMap = new Map(storedResults.map((r) => [r.testName, r]));

  const classifications = [];
  for (const test of failedTests) {
    const stored = storedMap.get(test.testName);
    if (!stored) continue;

    const flakeScore = flakyMap.get(test.testName);
    const result = classify({
      testName: test.testName,
      testSuite: test.testSuite,
      errorMessage: stored.errorMessage ?? undefined,
      prChangedFiles,
      isKnownFlaky: flakeScore !== undefined,
      flakeScore,
    });

    classifications.push({
      ciRunId: ciRun.id,
      testResultId: stored.id,
      classification: result.classification,
      confidence: result.confidence,
      reason: result.reason,
    });
  }

  if (classifications.length > 0) {
    await prisma.failureClassification.createMany({
      data: classifications,
      skipDuplicates: true,
    });
  }

  // ─── Step 7: Update FlakyTest materialized table ────────────────────────────

  for (const test of parsedTests) {
    const isFail = test.status === "FAIL" || test.status === "ERROR";
    await prisma.flakyTest.upsert({
      where: { repoId_testName: { repoId: repo.id, testName: test.testName } },
      create: {
        repoId: repo.id,
        testName: test.testName,
        testSuite: test.testSuite,
        passCount: isFail ? 0 : 1,
        failCount: isFail ? 1 : 0,
        flakeScore: 0,
      },
      update: {
        passCount: isFail ? undefined : { increment: 1 },
        failCount: isFail ? { increment: 1 } : undefined,
        lastSeenAt: new Date(),
      },
    });
  }

  // Recompute flake scores for tests that failed in this run
  for (const test of failedTests) {
    const record = await prisma.flakyTest.findUnique({
      where: { repoId_testName: { repoId: repo.id, testName: test.testName } },
    });
    if (!record) continue;

    const total = record.passCount + record.failCount;
    const flakeScore = total > 0 ? record.failCount / total : 0;
    await prisma.flakyTest.update({
      where: { id: record.id },
      data: { flakeScore },
    });
  }

  await log(`Stored ${classifications.length} classifications for run ${githubRunId}`);

  // ─── Step 8: Post PR comment ────────────────────────────────────────────────

  if (ciRun.prNumber && ciRun.prNumber > 0 && failedTests.length > 0) {
    try {
      const classificationSummary = classifications
        .slice(0, 10)
        .map((c) => `- **${c.testResultId}**: ${c.classification} (${(c.confidence * 100).toFixed(0)}% confidence) — ${c.reason}`)
        .join("\n");

      const body = [
        "## 🔍 Tinker CI Failure Analysis",
        "",
        `**${failedTests.length} test(s) failed** in this workflow run.`,
        "",
        classificationSummary,
        failedTests.length > 10 ? `\n_…and ${failedTests.length - 10} more. See the Tinker dashboard for the full report._` : "",
        "",
        "_Was this classification helpful? Thumbs up/down on the [Tinker dashboard](#)._",
      ]
        .filter((l) => l !== null)
        .join("\n");

      await octokit.issues.createComment({
        owner,
        repo: repoName,
        issue_number: ciRun.prNumber,
        body,
      });

      await log(`Posted PR comment on #${ciRun.prNumber}`);
    } catch (err) {
      await log(`Failed to post PR comment: ${String(err)}`);
    }
  }

  // Step 9: Raw logs are never written to disk or DB — nothing to discard.
  await log(`Completed processing run ${githubRunId}`);
}
