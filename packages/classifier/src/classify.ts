import type { ClassifierInput, ClassificationResult } from "./types.js";
import { classifyAsInfrastructure } from "./rules/infrastructure.js";
import { classifyAsPrRelated } from "./rules/pr-related.js";
import { classifyAsFlaky } from "./rules/flaky.js";

/**
 * Classifies a single test failure.
 *
 * Each rule emits a ClassificationResult with a confidence score (0–1).
 * The result with the highest confidence wins.
 *
 * Priority (for tie-breaking at equal confidence):
 *   INFRASTRUCTURE > FLAKY > PR_RELATED > UNKNOWN
 *
 * This priority reflects the cost of a false positive:
 * - Infrastructure false positives waste engineer time investigating non-issues
 * - Flaky misclassifications suppress real regressions
 * - PR-related misclassifications are the most visible to the author
 */
export function classify(input: ClassifierInput): ClassificationResult {
  const candidates: ClassificationResult[] = [];

  const infra = classifyAsInfrastructure(input);
  if (infra) candidates.push(infra);

  const flaky = classifyAsFlaky(input);
  if (flaky) candidates.push(flaky);

  const prRelated = classifyAsPrRelated(input);
  if (prRelated) candidates.push(prRelated);

  if (candidates.length === 0) {
    return {
      classification: "UNKNOWN",
      confidence: 1.0,
      reason: "No classification rule matched — manual review recommended",
    };
  }

  // Sort by confidence desc, then by priority for tie-breaking
  const PRIORITY: Record<string, number> = {
    INFRASTRUCTURE: 3,
    FLAKY: 2,
    PR_RELATED: 1,
    UNKNOWN: 0,
  };

  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (PRIORITY[b.classification] ?? 0) - (PRIORITY[a.classification] ?? 0);
  });

  return candidates[0]!;
}
