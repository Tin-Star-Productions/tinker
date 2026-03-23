"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

export default function ReposPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["repos", orgSlug],
    queryFn: () => api.repos(orgSlug),
  });

  if (error && (error as { status?: number }).status === 401) {
    router.replace("/login");
    return null;
  }

  return (
    <div className="flex h-screen">
      <Sidebar orgSlug={orgSlug} />

      <main className="flex-1 overflow-auto p-8">
        <h1 className="text-xl font-semibold">Repositories</h1>
        <p className="mt-1 text-sm text-gray-500">
          Select a repository to view CI runs and flaky tests.
        </p>

        {isLoading && (
          <div className="mt-8 text-gray-400">Loading repositories…</div>
        )}

        {data && (
          <div className="mt-6 grid gap-3">
            {data.repos.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-400">
                No repositories found. Install the GitHub App on a repository to get started.
              </div>
            )}
            {data.repos.map((repo) => (
              <Link
                key={repo.id}
                href={`/repos/${repo.id}/runs`}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all"
              >
                <div>
                  <p className="font-medium">{repo.fullName}</p>
                  <p className="text-sm text-gray-400">
                    Default branch: {repo.defaultBranch}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-700">
                    {repo._count.ciRuns} runs
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
