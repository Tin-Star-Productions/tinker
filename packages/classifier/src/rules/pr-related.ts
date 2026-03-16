import { extname, basename, dirname } from "node:path";
import type { ClassifierInput, ClassificationResult } from "../types.js";

/**
 * PR-related failure classifier.
 *
 * A test failure is likely PR-related if the test file path or test suite
 * corresponds to files changed in the PR diff.
 *
 * Matching strategy (most → least confident):
 * 1. Exact path match between test file and changed file
 * 2. Test suite/class name matches a changed file's basename (without extension)
 * 3. Test name includes a token that matches a changed file's basename
 */

function toBaseName(filePath: string): string {
  return basename(filePath, extname(filePath)).toLowerCase();
}

function toPackagePath(filePath: string): string {
  // Convert "src/services/UserService.ts" to "userservice"
  return dirname(filePath).split("/").join(".").toLowerCase() + "." + toBaseName(filePath);
}

export function classifyAsPrRelated(
  input: ClassifierInput
): ClassificationResult | null {
  if (!input.prChangedFiles || input.prChangedFiles.length === 0) {
    return null;
  }

  const changedFiles = input.prChangedFiles;
  const testNameLower = input.testName.toLowerCase();
  const testSuiteLower = input.testSuite?.toLowerCase();

  // Strategy 1: Test suite or test name contains the exact base name of a changed file
  for (const changedFile of changedFiles) {
    const base = toBaseName(changedFile);
    if (!base) continue;

    // Check suite name match (most reliable — e.g. "UserServiceTest" matches "UserService.ts")
    if (testSuiteLower) {
      // Strip "Test" / "Spec" / "Suite" suffix from the test suite name for comparison
      const suiteBase = testSuiteLower
        .replace(/(test|spec|suite)$/, "")
        .replace(/\./g, "");
      if (suiteBase === base || suiteBase.endsWith(base) || base.endsWith(suiteBase)) {
        return {
          classification: "PR_RELATED",
          confidence: 0.85,
          reason: `Test suite "${input.testSuite}" likely tests "${changedFile}" which was changed in this PR`,
        };
      }
    }

    // Check test name contains changed file's base name (weaker signal)
    if (testNameLower.includes(base) || base.includes(testNameLower.split("#")[0]!)) {
      return {
        classification: "PR_RELATED",
        confidence: 0.65,
        reason: `Test name includes "${base}" which matches changed file "${changedFile}"`,
      };
    }
  }

  // Strategy 2: Java/Kotlin-style package path matching
  // "com.acme.services.UserServiceTest#createUser" vs "src/services/UserService.kt"
  for (const changedFile of changedFiles) {
    const packagePath = toPackagePath(changedFile);
    if (testNameLower.includes(packagePath) || packagePath.length > 3 && testNameLower.includes(packagePath.split(".").pop()!)) {
      return {
        classification: "PR_RELATED",
        confidence: 0.75,
        reason: `Test "${input.testName}" appears to test "${changedFile}" which was changed in this PR`,
      };
    }
  }

  return null;
}
