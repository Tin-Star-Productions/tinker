import type { ClassifierInput, ClassificationResult } from "../types.js";

/** Flake score threshold above which we classify as FLAKY */
const FLAKY_THRESHOLD = 0.3;

/**
 * Flaky test classifier.
 *
 * A test is classified as flaky if it appears in the FlakyTest materialized table
 * with a flake score above the threshold. The caller is responsible for looking
 * up the flake score and passing it in `input.flakeScore`.
 *
 * Confidence scales linearly with flake score:
 *   - score 0.3 → confidence 0.5
 *   - score 0.8 → confidence 0.9
 *   - score 1.0 → confidence 0.95 (capped — never 100% certain)
 */
export function classifyAsFlaky(
  input: ClassifierInput
): ClassificationResult | null {
  if (!input.isKnownFlaky) return null;

  const score = input.flakeScore ?? FLAKY_THRESHOLD;
  if (score < FLAKY_THRESHOLD) return null;

  // Map flake score to confidence: y = 0.5 + (score - 0.3) * (0.45 / 0.7), capped at 0.95
  const confidence = Math.min(0.95, 0.5 + ((score - FLAKY_THRESHOLD) * 0.45) / 0.7);

  return {
    classification: "FLAKY",
    confidence: Math.round(confidence * 100) / 100,
    reason: `"${input.testName}" has a flake score of ${(score * 100).toFixed(0)}% based on historical runs`,
  };
}
