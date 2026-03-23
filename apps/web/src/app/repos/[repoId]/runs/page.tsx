"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { StatusBadge } from "@/components/StatusBadge";

function shortSha(sha: string) {
  return sha.slice(0, 7);
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function RunsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const repoId = params.repoId as string;

  const page = Number(searchParams.get("page") ?? 1);
  const branch = searchParams.get("branch") ?? undefined;

  const { data, isLoading, error } = useQuery({
    queryKey: ["runs", repoId, page, branch],
    queryFn: () => api.runs(repoId, { page, limit: 25, branch }),
  });

  if (error && (error as { status?: number }).status === 401) {
    router.replace("/login");
    return null;
  }

  const totalPages = data ? Math.ceil(data.pagination.total / data.pagination.limit) : 0;

  return (
    <div className="flex h-screen">
      <Sidebar orgSlug="" repoId={repoId} />

      <main className="flex-1 overflow-auto p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">CI Runs</h1>
          {branch && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
              branch: {branch}
              <button
                onClick={() => router.push(`/repos/${repoId}/runs`)}
                className="ml-2 text-gray-400 hover:text-gray-700"
              >
                ×
              </button>
            </span>
          )}
        </div>

        {isLoading && (
          <div className="mt-8 text-gray-400">Loading runs…</div>
        )}

        {data && (
          <>
            <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Run
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Branch / PR
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Tests
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.runs.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-gray-400"
                      >
                        No runs yet. Push a commit or open a PR to trigger a CI run.
                      </td>
                    </tr>
                  )}
                  {data.runs.map((run) => (
                    <tr
                      key={run.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() =>
                        router.push(`/repos/${repoId}/runs/${run.id}`)
                      }
                    >
                      <td className="px-4 py-3 font-mono text-sm text-gray-700">
                        {shortSha(run.headSha)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {run.prNumber ? (
                          <span className="font-medium text-indigo-600">
                            #{run.prNumber}
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(
                                `/repos/${repoId}/runs?branch=${encodeURIComponent(run.branch)}`
                              );
                            }}
                            className="hover:text-indigo-600"
                          >
                            {run.branch}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={run.status}
                          conclusion={run.conclusion}
                          size="sm"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {run._count.testResults > 0
                          ? `${run._count.testResults} tests · ${run._count.classifications} classified`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {relativeTime(run.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Page {page} of {totalPages} ({data.pagination.total} total)
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() =>
                      router.push(`/repos/${repoId}/runs?page=${page - 1}`)
                    }
                    className="rounded border px-3 py-1 text-sm disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() =>
                      router.push(`/repos/${repoId}/runs?page=${page + 1}`)
                    }
                    className="rounded border px-3 py-1 text-sm disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
