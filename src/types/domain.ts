/**
 * Tipos de domínio espelhando as tabelas em supabase/migrations.
 * Para gerar tipos completos a partir do banco: `npm run db:types` (ver README).
 */
export const TASK_STATUSES = ["todo", "in_progress", "blocked", "in_review", "done"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const TASK_TYPES = ["one_off", "recurring", "project"] as const;
export const PERMISSIONS = ["impacts.validate", "members.manage", "workspace.manage"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskType = (typeof TASK_TYPES)[number];
export type Permission = (typeof PERMISSIONS)[number];

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  theme: "light" | "dark" | "system";
};

export type Workspace = {
  id: string;
  name: string;
  timezone: string;
  due_soon_days: number;
};

export type Member = {
  user_id: string;
  role: "owner" | "member";
  profile: Pick<Profile, "id" | "email" | "full_name" | "avatar_url">;
  permissions: Permission[];
};

export type Task = {
  id: string;
  workspace_id: string;
  parent_task_id: string | null;
  project_id: string | null;
  category_id: string | null;
  recurrence_id: string | null;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  start_date: string | null;
  due_date: string | null;
  weight: number;
  position: number;
  completed_at: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  owner_id: string | null;
  status: "planned" | "active" | "on_hold" | "completed" | "cancelled";
  priority: TaskPriority;
  start_date: string | null;
  due_date: string | null;
  color: string;
  version: number;
};

export type Comment = {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
};

export type ActivityLog = {
  id: number;
  actor_id: string | null;
  action: string;
  changes: Record<string, { from?: unknown; to?: unknown; changed?: boolean }> | null;
  created_at: string;
};

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
