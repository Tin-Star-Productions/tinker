"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { api, type FlakyTest } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

function FlakeBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 70
      ? "bg-red-500"
      : pct >= 40
        ? "bg-orange-400"
        : "bg-yellow-400";

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs text-gray-500">{pct}%</span>
    </div>
  );
}

function FlakyRow({ test, repoId }: { test: FlakyTest; repoId: string }) {
  const router = useRouter();

  return (
    <tr
      className="hover:bg-gray-50 cursor-pointer"
      onClick={() =>
        router.push(
          `/repos/${repoId}/flaky/${encodeURIComponent(test.testName)}`
        )
      }
    >
      <td className="px-4 py-3">
        <p className="font-mono text-sm text-gray-900 break-all">
          {test.testName}
        </p>
        {test.testSuite && (
          <p className="text-xs text-gray-400">{test.testSuite}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <FlakeBar score={test.flakeScore} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {test.failCount}/{test.passCount + test.failCount} runs
      </td>
      <td className="px-4 py-3 text-sm text-gray-400">
        {new Date(test.lastSeenAt).toLocaleDateString()}
      </td>
    </tr>
  );
}

export default function FlakyPage() {
  const params = useParams();
  const router = useRouter();
  const repoId = params.repoId as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["flaky", repoId],
    queryFn: () => api.flakyTests(repoId, { minScore: 0.1 }),
  });

  if (error && (error as { status?: number }).status === 401) {
    router.replace("/login");
    return null;
  }

  return (
    <div className="flex h-screen">
      <Sidebar orgSlug="" repoId={repoId} />

      <main className="flex-1 overflow-auto p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Flaky Tests</h1>
            <p className="mt-1 text-sm text-gray-500">
              Tests that have failed intermittently, sorted by flake score.
            </p>
          </div>
          {data && (
            <span className="text-sm text-gray-400">
              {data.pagination.total} flaky tests
            </span>
          )}
        </div>

        {isLoading && (
          <div className="mt-8 text-gray-400">Loading flaky tests…</div>
        )}

        {data && (
          <>
            {data.tests.length === 0 ? (
              <div className="mt-8 rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-400">
                No flaky tests detected yet. Tests need at least a few runs to
                establish a flake pattern.
              </div>
            ) : (
              <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Test
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Flake Score
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Failure Rate
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Last Seen
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.tests.map((test) => (
                      <FlakyRow key={test.id} test={test} repoId={repoId} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
