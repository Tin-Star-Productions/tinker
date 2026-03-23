"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, type ApiUser } from "@/lib/api";
import clsx from "clsx";

type Props = {
  orgSlug: string;
  repoId?: string;
};

export function Sidebar({ orgSlug, repoId }: Props) {
  const pathname = usePathname();
  const { data: user } = useQuery<ApiUser>({ queryKey: ["me"], queryFn: api.me });

  const navItems = repoId
    ? [
        { href: `/repos/${repoId}/runs`, label: "CI Runs" },
        { href: `/repos/${repoId}/flaky`, label: "Flaky Tests" },
      ]
    : [];

  return (
    <aside className="flex w-56 flex-col border-r border-gray-200 bg-white px-3 py-4">
      {/* Logo */}
      <Link href="/" className="mb-6 px-2 text-lg font-bold tracking-tight">
        Tinker
      </Link>

      {/* Org switcher */}
      {user && user.orgs.length > 0 && (
        <div className="mb-4">
          <p className="px-2 text-xs font-medium uppercase text-gray-400">Organization</p>
          <div className="mt-1 space-y-1">
            {user.orgs.map((org) => (
              <Link
                key={org.id}
                href={`/orgs/${org.slug}/repos`}
                className={clsx(
                  "block rounded-md px-2 py-1.5 text-sm",
                  orgSlug === org.slug
                    ? "bg-gray-100 font-medium text-gray-900"
                    : "text-gray-600 hover:bg-gray-50"
                )}
              >
                {org.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Repo nav */}
      {navItems.length > 0 && (
        <div className="mb-4">
          <p className="px-2 text-xs font-medium uppercase text-gray-400">Repository</p>
          <nav className="mt-1 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "block rounded-md px-2 py-1.5 text-sm",
                  pathname.startsWith(item.href)
                    ? "bg-indigo-50 font-medium text-indigo-700"
                    : "text-gray-600 hover:bg-gray-50"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto">
        {user && (
          <div className="flex items-center gap-2 px-2 py-2">
            <span className="text-sm text-gray-500">@{user.githubLogin}</span>
            <button
              onClick={() => api.logout().then(() => (window.location.href = "/login"))}
              className="ml-auto text-xs text-gray-400 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
