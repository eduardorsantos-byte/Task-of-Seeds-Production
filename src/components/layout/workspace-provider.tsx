"use client";

import { createContext, useContext, useMemo } from "react";
import type { Member, Permission, Project, Workspace } from "@/types/domain";

export type WorkspaceClientContext = {
  userId: string;
  workspace: Workspace;
  members: Member[];
  projects: Pick<Project, "id" | "name" | "color" | "status">[];
  permissions: Permission[];
  today: string;
};

const Ctx = createContext<(WorkspaceClientContext & { memberById: Map<string, Member> }) | null>(null);

export function WorkspaceProvider({ value, children }: { value: WorkspaceClientContext; children: React.ReactNode }) {
  const enriched = useMemo(
    () => ({ ...value, memberById: new Map(value.members.map((m) => [m.user_id, m])) }),
    [value],
  );
  return <Ctx value={enriched}>{children}</Ctx>;
}

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace fora do WorkspaceProvider");
  return v;
}
