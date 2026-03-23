/**
 * Typed API client for apps/api.
 * All requests go through Next.js rewrites → apps/api.
 */

export type ApiUser = {
  id: string;
  githubLogin: string;
  orgs: Array<{ id: string; slug: string; name: string; role: "OWNER" | "MEMBER" }>;
};

export type Repo = {
  id: string;
  fullName: string;
  defaultBranch: string;
  createdAt: string;
  _count: { ciRuns: number };
};

export type CiRun = {
  id: string;
  githubRunId: string;
  prNumber: number | null;
  headSha: string;
  branch: string;
  status: "QUEUED" | "IN_PROGRESS" | "COMPLETED";
  conclusion: string | null;
  createdAt: string;
  completedAt: string | null;
  _count: { testResults: number; classifications: number };
};

export type Classification = {
  id: string;
  classification: "PR_RELATED" | "FLAKY" | "INFRASTRUCTURE" | "UNKNOWN";
  confidence: number;
  reason: string;
  feedback: "CORRECT" | "INCORRECT" | null;
};

export type TestResult = {
  id: string;
  testName: string;
  testSuite: string | null;
  status: "PASS" | "FAIL" | "SKIP" | "ERROR";
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  classification: Classification | null;
};

export type CiRunDetail = CiRun & { testResults: TestResult[] };

export type FlakyTest = {
  id: string;
  testName: string;
  testSuite: string | null;
  flakeScore: number;
  passCount: number;
  failCount: number;
  lastSeenAt: string;
};

export type Pagination = { total: number; page: number; limit: number };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error((err as { error: string }).error ?? "API error"), {
      status: res.status,
    });
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => apiFetch<ApiUser>("/api/auth/me"),

  logout: () =>
    fetch("/api/auth/session", { method: "DELETE", credentials: "include" }),

  repos: (orgSlug: string) =>
    apiFetch<{ repos: Repo[] }>(`/api/orgs/${orgSlug}/repos`),

  runs: (
    repoId: string,
    params?: { page?: number; limit?: number; pr?: number; branch?: string }
  ) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.pr) q.set("pr", String(params.pr));
    if (params?.branch) q.set("branch", params.branch);
    return apiFetch<{ runs: CiRun[]; pagination: Pagination }>(
      `/api/repos/${repoId}/runs?${q}`
    );
  },

  run: (repoId: string, runId: string) =>
    apiFetch<{ run: CiRunDetail }>(`/api/repos/${repoId}/runs/${runId}`),

  flakyTests: (repoId: string, params?: { page?: number; minScore?: number }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.minScore !== undefined) q.set("minScore", String(params.minScore));
    return apiFetch<{ tests: FlakyTest[]; pagination: Pagination }>(
      `/api/repos/${repoId}/flaky-tests?${q}`
    );
  },

  testHistory: (repoId: string, testName: string) =>
    apiFetch<{ testName: string; history: unknown[] }>(
      `/api/repos/${repoId}/flaky-tests/${encodeURIComponent(testName)}/history`
    ),

  submitFeedback: (classificationId: string, feedback: "CORRECT" | "INCORRECT") =>
    apiFetch(`/api/classifications/${classificationId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ feedback }),
    }),
};
