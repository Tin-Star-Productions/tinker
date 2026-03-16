/**
 * Input to the classifier.
 * All data is derived from the CI run — no raw log content is passed here.
 */
export type ClassifierInput = {
  /** Fully-qualified test name, e.g. "com.acme.UserServiceTest#createUser" */
  testName: string;
  /** Optional test suite / class grouping */
  testSuite?: string;
  /** Error message extracted from the test result (no raw logs) */
  errorMessage?: string;
  /** File paths changed in the PR (null if this is a non-PR run) */
  prChangedFiles?: string[];
  /** Whether this test name exists in the flaky test table above the threshold */
  isKnownFlaky?: boolean;
  /** Current flake score (0–1) if the test is in the FlakyTest table */
  flakeScore?: number;
};

export type ClassificationKind =
  | "PR_RELATED"
  | "FLAKY"
  | "INFRASTRUCTURE"
  | "UNKNOWN";

export type ClassificationResult = {
  classification: ClassificationKind;
  /** Confidence score 0–1 */
  confidence: number;
  /** Human-readable explanation for UI display */
  reason: string;
};
