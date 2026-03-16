import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  verifyWebhookSignature,
  parseWebhookEvent,
} from "@tinker/github/webhooks";
import {
  getProcessRunQueue,
  getSyncInstallationQueue,
} from "../../jobs/queues.js";

/**
 * GitHub webhook receiver.
 *
 * POST /webhooks/github
 *
 * Design:
 * - Always returns 200 immediately (GitHub retries on non-2xx)
 * - Signature verified synchronously before any processing
 * - All work enqueued to BullMQ — never blocks the response
 * - Idempotent: BullMQ job IDs are keyed on githubRunId
 */
export async function githubWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/webhooks/github",
    {
      config: {
        // Skip session auth — webhooks use HMAC signature verification instead
        skipAuth: true,
      },
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<FastifyReply> => {
      const signature = request.headers["x-hub-signature-256"] as string;
      const eventType = request.headers["x-github-event"] as string;
      const deliveryId = request.headers["x-github-delivery"] as string;

      const rawBody = JSON.stringify(request.body);

      // Step 1: Verify HMAC signature
      const webhookSecret = process.env["GITHUB_APP_WEBHOOK_SECRET"];
      if (!webhookSecret) {
        app.log.error("GITHUB_APP_WEBHOOK_SECRET not configured");
        // Return 200 to avoid GitHub retrying — this is a config error, not a delivery error
        return reply.code(200).send({ ok: false, reason: "misconfigured" });
      }

      const verification = verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!verification.valid) {
        app.log.warn(
          { deliveryId, reason: verification.reason },
          "GitHub webhook: invalid signature"
        );
        return reply.code(401).send({ error: "Invalid signature" });
      }

      // Step 2: Parse event
      const event = parseWebhookEvent(eventType, rawBody);

      app.log.info(
        { eventType, deliveryId, type: event.type },
        "GitHub webhook received"
      );

      // Step 3: Enqueue work — return 200 before async processing
      try {
        switch (event.type) {
          case "workflow_run": {
            const run = event.payload.workflow_run;
            // Only process completed runs
            if (event.payload.action !== "completed") break;

            const installationId = event.payload.installation?.id;
            if (!installationId) {
              app.log.warn({ deliveryId }, "workflow_run event missing installation id");
              break;
            }

            const processRunQueue = getProcessRunQueue(app.redis);
            await processRunQueue.add(
              "process-run",
              {
                githubRunId: run.id,
                repoId: String(run.repository.id),
                installationId,
              },
              {
                // Dedup by githubRunId — idempotent re-delivery
                jobId: `run-${run.id}`,
              }
            );

            app.log.info(
              { githubRunId: run.id, repo: run.repository.full_name },
              "Enqueued PROCESS_RUN job"
            );
            break;
          }

          case "installation": {
            const installation = event.payload.installation;
            const org = installation.account;

            const syncQueue = getSyncInstallationQueue(app.redis);
            await syncQueue.add(
              "sync-installation",
              {
                action: event.payload.action === "created" ? "created" : "deleted",
                installationId: installation.id,
                githubOrgId: org.id,
                githubOrgLogin: org.login,
                repositoryIds: event.payload.repositories?.map((r) => r.id),
                repositoryFullNames: event.payload.repositories?.map((r) => r.full_name),
              },
              {
                jobId: `install-${installation.id}-${event.payload.action}`,
              }
            );

            app.log.info(
              { installationId: installation.id, org: org.login, action: event.payload.action },
              "Enqueued SYNC_INSTALLATION job"
            );
            break;
          }

          case "ping":
            app.log.info({ hookId: event.payload.hook_id }, "GitHub ping received");
            break;

          case "unknown":
            app.log.debug(
              { eventType: event.eventType },
              "Ignoring unknown GitHub event type"
            );
            break;
        }
      } catch (err) {
        app.log.error({ err, deliveryId, eventType }, "Failed to enqueue webhook job");
        // Still return 200 — log the failure but don't trigger retries for queue errors
      }

      return reply.code(200).send({ ok: true });
    }
  );
}
