"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, type TestResult } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { ClassificationBadge } from "@/components/ClassificationBadge";

function shortSha(sha: string) {
  return sha.slice(0, 7);
}

function formatMs(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function FeedbackButtons({
  classificationId,
  current,
}: {
  classificationId: string;
  current: "CORRECT" | "INCORRECT" | null;
}) {
  const queryClient = useQueryClient();
  const params = useParams();

  const mutation = useMutation({
    mutationFn: (feedback: "CORRECT" | "INCORRECT") =>
      api.submitFeedback(classificationId, feedback),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["run", params.repoId, params.runId],
      });
    },
  });

  return (
    <div className="flex items-center gap-1">
      <button
        title="Correct classification"
        onClick={() => mutation.mutate("CORRECT")}
        className={`rounded px-2 py-1 text-sm transition-colors ${
          current === "CORRECT"
            ? "bg-green-100 text-green-700"
            : "text-gray-400 hover:bg-gray-100"
        }`}
      >
        👍
      </button>
      <button
        title="Incorrect classification"
        onClick={() => mutation.mutate("INCORRECT")}
        className={`rounded px-2 py-1 text-sm transition-colors ${
          current === "INCORRECT"
            ? "bg-red-100 text-red-700"
            : "text-gray-400 hover:bg-gray-100"
        }`}
      >
        👎
      </button>
    </div>
  );
}

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const repoId = params.repoId as string;
  const runId = params.runId as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["run", repoId, runId],
    queryFn: () => api.run(repoId, runId),
  });

  if (error && (error as { status?: number }).status === 401) {
    router.replace("/login");
    return null;
  }

  const run = data?.run;
  const failedTests =
    run?.testResults.filter(
      (t) => t.status === "FAIL" || t.status === "ERROR"
    ) ?? [];
  const passedTests = run?.testResults.filter((t) => t.status === "PASS") ?? [];

  return (
    <div className="flex h-screen">
      <Sidebar orgSlug="" repoId={repoId} />

      <main className="flex-1 overflow-auto p-8">
        <div className="mb-2">
          <Link
            href={`/repos/${repoId}/runs`}
            className="text-sm text-gray-400 hover:text-gray-700"
          >
            ← Back to runs
          </Link>
        </div>

        {isLoading && <div className="text-gray-400">Loading run…</div>}

        {run && (
          <>
            {/* Run header */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold font-mono">
                  {shortSha(run.headSha)}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  {run.prNumber ? `PR #${run.prNumber} · ` : ""}
                  {run.branch}
                </p>
              </div>
              <StatusBadge status={run.status} conclusion={run.conclusion} />
            </div>

            {/* Summary bar */}
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-sm text-gray-500">Total tests</p>
                <p className="mt-1 text-2xl font-bold">{run.testResults.length}</p>
              </div>
              <div className="rounded-lg border border-red-100 bg-red-50 p-4">
                <p className="text-sm text-red-600">Failures</p>
                <p className="mt-1 text-2xl font-bold text-red-700">
                  {failedTests.length}
                </p>
              </div>
              <div className="rounded-lg border border-green-100 bg-green-50 p-4">
                <p className="text-sm text-green-600">Passed</p>
                <p className="mt-1 text-2xl font-bold text-green-700">
                  {passedTests.length}
                </p>
              </div>
            </div>

            {/* Failed tests */}
            {failedTests.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 text-sm font-semibold uppercase text-gray-500">
                  Failures ({failedTests.length})
                </h2>
                <div className="space-y-3">
                  {failedTests.map((test) => (
                    <FailedTestCard key={test.id} test={test} />
                  ))}
                </div>
              </section>
            )}

            {/* Passed tests (collapsed) */}
            {passedTests.length > 0 && (
              <section className="mt-8">
                <details>
                  <summary className="cursor-pointer text-sm font-semibold uppercase text-gray-400">
                    Passed ({passedTests.length})
                  </summary>
                  <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <table className="min-w-full divide-y divide-gray-100">
                      <tbody className="divide-y divide-gray-50">
                        {passedTests.map((t) => (
                          <tr key={t.id}>
                            <td className="px-4 py-2 font-mono text-xs text-gray-500">
                              {t.testName}
                            </td>
                            <td className="px-4 py-2 text-right text-xs text-gray-400">
                              {formatMs(t.durationMs)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function FailedTestCard({ test }: { test: TestResult }) {
  return (
    <div className="rounded-lg border border-red-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-medium text-gray-900 break-all">
            {test.testName}
          </p>
          {test.testSuite && test.testSuite !== test.testName && (
            <p className="mt-0.5 text-xs text-gray-400">{test.testSuite}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {test.classification && (
            <>
              <ClassificationBadge
                classification={test.classification.classification}
                confidence={test.classification.confidence}
              />
              <FeedbackButtons
                classificationId={test.classification.id}
                current={test.classification.feedback}
              />
            </>
          )}
          <span className="text-xs text-gray-400">{formatMs(test.durationMs)}</span>
        </div>
      </div>

      {test.classification && (
        <p className="mt-2 text-xs text-gray-500 italic">
          {test.classification.reason}
        </p>
      )}

      {test.errorMessage && (
        <pre className="mt-3 overflow-x-auto rounded bg-gray-50 p-3 text-xs text-red-700 whitespace-pre-wrap">
          {test.errorMessage}
        </pre>
      )}
    </div>
  );
}
