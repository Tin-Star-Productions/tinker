import type { ClassifierInput, ClassificationResult } from "../types.js";

/**
 * Infrastructure failure patterns.
 *
 * Matches common CI environment failures that are not related to the PR code.
 * These patterns are intentionally conservative — we only match clear signals
 * to avoid misclassifying legitimate test failures as infra issues.
 */

type InfraPattern = {
  pattern: RegExp;
  reason: string;
  confidence: number;
};

const INFRA_PATTERNS: InfraPattern[] = [
  // Out of memory
  {
    pattern: /\bOut of memory\b|\bOOM\b|\bjava\.lang\.OutOfMemoryError\b/i,
    reason: "Out-of-memory error — likely a CI runner resource constraint",
    confidence: 0.9,
  },
  // Timeout
  {
    pattern: /\btimed? ?out\b|\btimeout\b|\bExceeded.*timeout\b/i,
    reason: "Timeout — likely a slow CI runner or external service unavailability",
    confidence: 0.75,
  },
  // Network failure
  {
    pattern:
      /\bConnection refused\b|\bECONNREFUSED\b|\bECONNRESET\b|\bNetwork.*unreachable\b|\bUnable to connect\b/i,
    reason: "Network connection error — likely a transient CI networking issue",
    confidence: 0.8,
  },
  // Docker / container failure
  {
    pattern: /\bDocker\b.*\bfailed\b|\bcontainer.*exited\b|\bdocker: error\b/i,
    reason: "Docker/container failure — CI environment issue, not code",
    confidence: 0.85,
  },
  // Disk space
  {
    pattern: /\bNo space left on device\b|\bDisk.*full\b/i,
    reason: "Disk space exhausted on CI runner",
    confidence: 0.95,
  },
  // Port already in use (common in test environments)
  {
    pattern: /\bEADDRINUSE\b|\bAddress already in use\b/i,
    reason: "Port already in use — CI runner conflict",
    confidence: 0.7,
  },
  // Process killed
  {
    pattern: /\bKilled\b|\bSIGKILL\b|\bprocess.*killed\b/i,
    reason: "Process killed — likely OOM or CI timeout",
    confidence: 0.8,
  },
];

export function classifyAsInfrastructure(
  input: ClassifierInput
): ClassificationResult | null {
  if (!input.errorMessage) return null;

  let bestMatch: (InfraPattern & { match: RegExpMatchArray }) | null = null;

  for (const infra of INFRA_PATTERNS) {
    const match = input.errorMessage.match(infra.pattern);
    if (match && (!bestMatch || infra.confidence > bestMatch.confidence)) {
      bestMatch = { ...infra, match };
    }
  }

  if (!bestMatch) return null;

  return {
    classification: "INFRASTRUCTURE",
    confidence: bestMatch.confidence,
    reason: bestMatch.reason,
  };
}
