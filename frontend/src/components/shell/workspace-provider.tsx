"use client";

import { createContext, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { mutate as globalMutate } from "swr";
import { api, mutate as apiMutate, useMe, useUsers } from "@/lib/api";
import type { Me, User } from "@/lib/types";
import { Skeleton } from "@/components/ui/primitives";

interface WorkspaceContextValue {
  me: Me;
  users: User[];
  refresh: () => void;
  logout: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: me, error, isLoading, mutate } = useMe();
  const { data: users } = useUsers();

  const value = useMemo<WorkspaceContextValue | null>(() => {
    if (!me) return null;
    return {
      me,
      users: users ?? [me.user],
      refresh: () => {
        void mutate();
        void globalMutate((key) => typeof key === "string" && key.startsWith("/users"));
      },
      logout: async () => {
        await api("/auth/logout", { method: "POST", redirectOnUnauthorized: false });
        await globalMutate(() => true, undefined, { revalidate: false });
        router.push("/login");
        router.refresh();
      },
    };
  }, [me, users, mutate, router]);

  if (isLoading && !me) {
    return (
      <div className="flex h-dvh w-full">
        <div className="hidden w-[236px] flex-col gap-3 border-r border-border bg-sidebar p-4 lg:flex">
          <Skeleton className="h-8 w-40" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-7 w-full" />
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col">
          <div className="flex h-14 items-center justify-between border-b border-border px-5">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-8 w-24" />
          </div>
          <div className="space-y-4 p-6">
            <Skeleton className="h-8 w-52" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full" />
              ))}
            </div>
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !me) {
    return (
      <div className="grid h-dvh place-items-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-foreground">We couldn’t load your workspace</h1>
          <p className="mt-2 text-[13px] text-muted">
            {error instanceof Error ? error.message : "Please refresh the page to try again."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13px] font-medium text-brand-foreground"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  if (!value) return null;

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
