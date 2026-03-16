import { parseJunitXml } from "./junit.js";
import type { ParsedTestResult } from "./junit.js";

export type { ParsedTestResult };

/**
 * Detects and parses test output from CI log content.
 *
 * Tries parsers in order: JUnit XML first (most common), then falls back.
 * Returns an empty array if no supported format is detected.
 *
 * IMPORTANT: This operates on in-memory strings only.
 * Raw log content must never be written to disk or the database.
 */
export function parseTestOutput(content: string): ParsedTestResult[] {
  // Detect JUnit XML
  if (content.includes("<testsuite") || content.includes("<testsuites")) {
    return parseJunitXml(content);
  }

  // TODO: Add pytest text output parser (v1.1)
  // TODO: Add TAP parser (v1.1)

  return [];
}
