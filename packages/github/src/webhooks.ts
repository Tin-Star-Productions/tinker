import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookVerificationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Verifies a GitHub webhook signature.
 *
 * GitHub signs payloads with HMAC-SHA256 using the webhook secret.
 * The signature is sent in the `X-Hub-Signature-256` header as `sha256=<hex>`.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string,
  secret: string
): WebhookVerificationResult {
  if (!signature) {
    return { valid: false, reason: "Missing X-Hub-Signature-256 header" };
  }

  if (!signature.startsWith("sha256=")) {
    return { valid: false, reason: "Signature must start with sha256=" };
  }

  const body = typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const expectedBuf = Buffer.from(`sha256=${expected}`, "utf8");
  const receivedBuf = Buffer.from(signature, "utf8");

  if (expectedBuf.length !== receivedBuf.length) {
    return { valid: false, reason: "Signature length mismatch" };
  }

  if (!timingSafeEqual(expectedBuf, receivedBuf)) {
    return { valid: false, reason: "Signature mismatch" };
  }

  return { valid: true };
}

// ─── Webhook payload types (minimal — extend as needed) ───────────────────────

export type WorkflowRunEvent = {
  action: "completed" | "requested" | "in_progress";
  workflow_run: {
    id: number;
    name: string;
    head_sha: string;
    head_branch: string;
    status: string;
    conclusion: string | null;
    pull_requests: Array<{ number: number }>;
    repository: {
      id: number;
      full_name: string;
    };
  };
  repository: {
    id: number;
    full_name: string;
  };
  installation?: {
    id: number;
  };
};

export type InstallationEvent = {
  action: "created" | "deleted" | "suspend" | "unsuspend" | "new_permissions_accepted";
  installation: {
    id: number;
    account: {
      id: number;
      login: string;
      type: "User" | "Organization";
    };
    repository_selection: "all" | "selected";
  };
  repositories?: Array<{
    id: number;
    full_name: string;
  }>;
};

export type GitHubWebhookEvent =
  | { type: "workflow_run"; payload: WorkflowRunEvent }
  | { type: "installation"; payload: InstallationEvent }
  | { type: "ping"; payload: { zen: string; hook_id: number } }
  | { type: "unknown"; eventType: string };

/**
 * Parses a raw GitHub webhook payload into a typed event.
 */
export function parseWebhookEvent(
  eventType: string,
  rawBody: string
): GitHubWebhookEvent {
  const payload = JSON.parse(rawBody) as Record<string, unknown>;

  switch (eventType) {
    case "workflow_run":
      return { type: "workflow_run", payload: payload as unknown as WorkflowRunEvent };
    case "installation":
      return { type: "installation", payload: payload as unknown as InstallationEvent };
    case "ping":
      return { type: "ping", payload: payload as { zen: string; hook_id: number } };
    default:
      return { type: "unknown", eventType };
  }
}
