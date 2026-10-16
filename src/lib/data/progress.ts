import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Progress = {
  pct: number;
  done: number;
  total: number;
  /** "milestones" when the project has a timeline, else counted from tasks. */
  basis: "milestones" | "tasks" | "none";
  next: { title: string; end_date: string | null; status: string } | null;
};

/** Progress per project: milestones first (the timeline), tasks as a fallback. */
export async function loadProgress(projectIds: string[]): Promise<Map<string, Progress>> {
  const out = new Map<string, Progress>();
  if (!projectIds.length) return out;
  const supabase = await createClient();
  const [{ data: ms }, { data: ts }] = await Promise.all([
    supabase.from("project_milestones").select("project_id, title, status, end_date, position").in("project_id", projectIds).order("position"),
    supabase.from("tasks").select("project_id, status").in("project_id", projectIds),
  ]);
  for (const id of projectIds) {
    const m = (ms ?? []).filter((x) => x.project_id === id);
    if (m.length) {
      const done = m.filter((x) => x.status === "done").length;
      const next = m.find((x) => x.status !== "done") ?? null;
      out.set(id, { pct: Math.round((done / m.length) * 100), done, total: m.length, basis: "milestones", next: next && { title: next.title, end_date: next.end_date, status: next.status } });
      continue;
    }
    const t = (ts ?? []).filter((x) => x.project_id === id);
    const done = t.filter((x) => x.status === "done").length;
    out.set(id, { pct: t.length ? Math.round((done / t.length) * 100) : 0, done, total: t.length, basis: t.length ? "tasks" : "none", next: null });
  }
  return out;
}
