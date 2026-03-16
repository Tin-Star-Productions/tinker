/**
 * JUnit XML test result parser.
 *
 * Supports output from:
 * - jest-junit
 * - Maven Surefire
 * - JUnit 4/5
 * - pytest --junitxml
 * - Any reporter that produces standard JUnit XML
 *
 * Raw log content is NEVER stored — only test name, status, duration, and
 * error message (from <failure> or <error> elements).
 */

export type ParsedTestResult = {
  testName: string;
  testSuite: string;
  status: "PASS" | "FAIL" | "SKIP" | "ERROR";
  durationMs: number | null;
  errorMessage: string | null;
};

// Minimal XML parsing without an external dep — regex-based for performance
// and to avoid pulling in a full XML parser for this simple structure.

const TESTSUITE_RE = /<testsuite\s([^>]*)>/gi;
const TESTCASE_RE = /<testcase\s([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gi;
const ATTR_RE = /(\w+)="([^"]*)"/g;
const FAILURE_RE = /<(?:failure|error)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:failure|error)>/i;
const SKIPPED_RE = /<skipped\s*\/?>|<skipped>/i;

function parseAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(attrStr)) !== null) {
    attrs[m[1]!] = m[2]!;
  }
  return attrs;
}

function truncateMessage(msg: string, maxLen = 2000): string {
  const trimmed = msg.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen) + "… [truncated]";
}

export function parseJunitXml(xml: string): ParsedTestResult[] {
  const results: ParsedTestResult[] = [];

  // Extract suite name for context
  let currentSuite = "unknown";
  TESTSUITE_RE.lastIndex = 0;
  const suiteMatch = TESTSUITE_RE.exec(xml);
  if (suiteMatch?.[1]) {
    const suiteAttrs = parseAttributes(suiteMatch[1]);
    currentSuite = suiteAttrs["name"] ?? "unknown";
  }

  TESTCASE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = TESTCASE_RE.exec(xml)) !== null) {
    const attrs = parseAttributes(m[1] ?? "");
    const body = m[2] ?? "";

    const name = attrs["name"] ?? "unknown";
    const className = attrs["classname"] ?? currentSuite;
    const timeStr = attrs["time"];
    const durationMs = timeStr ? Math.round(parseFloat(timeStr) * 1000) : null;

    let status: ParsedTestResult["status"];
    let errorMessage: string | null = null;

    if (SKIPPED_RE.test(body)) {
      status = "SKIP";
    } else {
      const failureMatch = FAILURE_RE.exec(body);
      if (failureMatch) {
        // Determine FAIL vs ERROR based on tag name
        status = body.match(/<error/) ? "ERROR" : "FAIL";
        errorMessage = truncateMessage(failureMatch[1] ?? "");
      } else {
        status = "PASS";
      }
    }

    results.push({
      testName: `${className}#${name}`,
      testSuite: className,
      status,
      durationMs,
      errorMessage,
    });
  }

  return results;
}
