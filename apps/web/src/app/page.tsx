"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    retry: false,
  });

  useEffect(() => {
    if (error) {
      router.replace("/login");
      return;
    }
    if (user) {
      const firstOrg = user.orgs[0];
      if (firstOrg) {
        router.replace(`/orgs/${firstOrg.slug}/repos`);
      } else {
        // No orgs — show the GitHub App install prompt
        router.replace("/install");
      }
    }
  }, [user, error, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-400">Loading…</div>
      </div>
    );
  }

  return null;
}
