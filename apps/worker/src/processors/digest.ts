import { prisma } from "@tinker/db";
import type { Job } from "bullmq";

export type DigestJobData = {
  orgId: string;
};

type DigestPayload = {
  orgName: string;
  orgSlug: string;
  weekStart: string;
  topFlakyTests: Array<{ testName: string; flakeScore: number; failCount: number }>;
  recentFailures: Array<{
    repoName: string;
    runCount: number;
    failureCount: number;
  }>;
  dashboardUrl: string;
};

/**
 * Builds the weekly digest payload for an org.
 */
async function buildDigest(orgId: string): Promise<DigestPayload | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      repositories: {
        include: {
          flakyTests: {
            where: { flakeScore: { gte: 0.2 } },
            orderBy: { flakeScore: "desc" },
            take: 10,
          },
        },
      },
    },
  });

  if (!org) return null;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Gather recent CI run stats
  const recentFailures = await Promise.all(
    org.repositories.map(async (repo) => {
      const [runCount, failureCount] = await Promise.all([
        prisma.ciRun.count({
          where: { repoId: repo.id, createdAt: { gte: weekAgo } },
        }),
        prisma.ciRun.count({
          where: {
            repoId: repo.id,
            createdAt: { gte: weekAgo },
            status: "COMPLETED",
            conclusion: { not: "success" },
          },
        }),
      ]);
      return { repoName: repo.fullName, runCount, failureCount };
    })
  );

  // Top flaky tests across all repos
  const allFlakyTests = org.repositories.flatMap((r) =>
    r.flakyTests.map((t) => ({
      testName: t.testName,
      flakeScore: t.flakeScore,
      failCount: t.failCount,
    }))
  );
  allFlakyTests.sort((a, b) => b.flakeScore - a.flakeScore);

  const dashboardUrl =
    process.env["DASHBOARD_URL"] ?? "http://localhost:3001";

  return {
    orgName: org.name,
    orgSlug: org.slug,
    weekStart: weekAgo.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    topFlakyTests: allFlakyTests.slice(0, 5),
    recentFailures: recentFailures.filter((r) => r.runCount > 0),
    dashboardUrl,
  };
}

function buildEmailHtml(payload: DigestPayload): string {
  const flakySection =
    payload.topFlakyTests.length > 0
      ? `<h2>Top Flaky Tests</h2>
<table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;width:100%">
  <tr><th>Test</th><th>Flake Score</th><th>Failures</th></tr>
  ${payload.topFlakyTests
    .map(
      (t) =>
        `<tr>
    <td style="font-family:monospace;font-size:13px">${t.testName}</td>
    <td>${(t.flakeScore * 100).toFixed(0)}%</td>
    <td>${t.failCount}</td>
  </tr>`
    )
    .join("")}
</table>`
      : "<p>No flaky tests detected this week. 🎉</p>";

  const failureSection =
    payload.recentFailures.length > 0
      ? `<h2>CI Summary (past 7 days)</h2>
<table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;width:100%">
  <tr><th>Repository</th><th>Total Runs</th><th>Failures</th></tr>
  ${payload.recentFailures
    .map(
      (r) =>
        `<tr>
    <td>${r.repoName}</td>
    <td>${r.runCount}</td>
    <td>${r.failureCount}</td>
  </tr>`
    )
    .join("")}
</table>`
      : "";

  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h1 style="font-size:20px">Tinker Weekly Digest — ${payload.orgName}</h1>
  <p style="color:#666">Week of ${payload.weekStart}</p>
  ${flakySection}
  ${failureSection}
  <p style="margin-top:24px">
    <a href="${payload.dashboardUrl}/orgs/${payload.orgSlug}/repos"
       style="background:#4f46e5;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">
      Open Dashboard
    </a>
  </p>
  <p style="color:#999;font-size:12px;margin-top:24px">
    You're receiving this because you subscribed to Tinker digest emails.
  </p>
</body>
</html>`;
}

function buildSlackMessage(payload: DigestPayload): object {
  const flakyBlocks =
    payload.topFlakyTests.length > 0
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Top Flaky Tests:*\n${payload.topFlakyTests
                .map(
                  (t) =>
                    `• \`${t.testName}\` — ${(t.flakeScore * 100).toFixed(0)}% flake rate (${t.failCount} failures)`
                )
                .join("\n")}`,
            },
          },
        ]
      : [{ type: "section", text: { type: "mrkdwn", text: "No flaky tests this week! 🎉" } }];

  return {
    text: `Tinker Weekly Digest — ${payload.orgName} (week of ${payload.weekStart})`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Tinker Weekly Digest — ${payload.orgName}`,
        },
      },
      {
        type: "context",
        elements: [{ type: "plain_text", text: `Week of ${payload.weekStart}` }],
      },
      { type: "divider" },
      ...flakyBlocks,
      { type: "divider" },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Open Dashboard" },
            url: `${payload.dashboardUrl}/orgs/${payload.orgSlug}/repos`,
            style: "primary",
          },
        ],
      },
    ],
  };
}

/**
 * Sends digest to all subscribers for an org.
 */
export async function digestJob(job: Job<DigestJobData>): Promise<void> {
  const { orgId } = job.data;

  const payload = await buildDigest(orgId);
  if (!payload) {
    await job.log(`Org ${orgId} not found — skipping digest`);
    return;
  }

  const subscriptions = await prisma.digestSubscription.findMany({
    where: { orgId },
  });

  if (subscriptions.length === 0) {
    await job.log(`No digest subscriptions for org ${orgId}`);
    return;
  }

  await job.log(`Sending digest to ${subscriptions.length} subscriber(s)`);

  for (const sub of subscriptions) {
    try {
      if (sub.type === "EMAIL") {
        await sendEmail(sub.target, payload);
        await job.log(`Sent email digest to ${sub.target}`);
      } else if (sub.type === "SLACK") {
        await sendSlack(sub.target, payload);
        await job.log(`Sent Slack digest to webhook`);
      }
    } catch (err) {
      await job.log(`Failed to send digest to ${sub.type} ${sub.target}: ${String(err)}`);
    }
  }
}

async function sendEmail(to: string, payload: DigestPayload): Promise<void> {
  const resendKey = process.env["RESEND_API_KEY"];
  if (!resendKey) throw new Error("RESEND_API_KEY not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tinker <digest@tinker.dev>",
      to,
      subject: `Tinker Weekly Digest — ${payload.orgName} (week of ${payload.weekStart})`,
      html: buildEmailHtml(payload),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

async function sendSlack(webhookUrl: string, payload: DigestPayload): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSlackMessage(payload)),
  });

  if (!res.ok) {
    throw new Error(`Slack webhook error ${res.status}`);
  }
}
