import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { todayISO } from "@/lib/format";
import { buildWorkItems, planFor, workloadFor, type WorkInput } from "@/lib/work-engine";

type Db = SupabaseClient<Database>;

export type TeamMember = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * One snapshot of everything the work engine needs. Works with the signed-in
 * user's client (RLS: staff see everything) and with the service-role client
 * used by the morning cron. Money is read from the derived views only.
 */
export async function loadWorkInput(db: Db): Promise<{ input: WorkInput; team: TeamMember[] }> {
  const today = todayISO();
  const recent = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const [
    team, resp, tasks, followUps, leads, projects, fin, subs, proposals, contracts, approvals,
    portfolio, albums, links, handoffs, clients, rel, alerts,
  ] = await Promise.all([
    db.from("profiles").select("*").eq("is_active", true).order("created_at"),
    db.from("team_responsibilities").select("category, assigned_to, position").eq("is_active", true).order("position"),
    db
      .from("tasks")
      .select("id, title, status, priority, due_date, assigned_to, secondary_assigned_to, category, project_id, client_id, auto_key, projects(name), clients(name)")
      .neq("status", "done")
      .limit(1000),
    db.from("follow_ups").select("id, client_id, project_id, assigned_to, due_date, reason, clients(name, business_name)").eq("status", "open").limit(500),
    db.from("leads").select("id, name, business_name, status, follow_up_date, created_at").not("status", "in", "(converted,lost)").limit(500),
    db.from("projects").select("id, name, status, deadline, next_action, status_changed_at, updated_at, owner_id, client_id, completed_at, total_price, deposit_amount, clients(name, business_name)").limit(1000),
    db.from("project_financials").select("project_id, amount_paid, balance_due").limit(1000),
    db
      .from("form_submissions")
      .select("id, title, status, sent_at, created_at, completed_at, project_id, client_id, clients(name, business_name)")
      .or(`status.in.(sent,in_progress),completed_at.gte.${recent}`)
      .limit(500),
    db.from("proposals").select("id, title, status, sent_at, created_at, valid_until, client_id, project_id, submission_id, clients(name, business_name)").limit(1000),
    db.from("contracts").select("id, title, status, created_at, sent_at, content, proposal_id, client_id, project_id, clients(name, business_name)").in("status", ["draft", "sent"]).limit(500),
    db.from("project_approvals").select("id, title, created_at, project_id, projects(name)").eq("status", "pending").limit(500),
    db.from("portfolio_items").select("project_id").not("project_id", "is", null),
    db.from("social_albums").select("project_id").not("project_id", "is", null),
    db.from("project_links").select("project_id, kind").limit(3000),
    db.from("project_ai_handoffs").select("project_id").limit(3000),
    db.from("clients").select("id, name, business_name, status, created_at").neq("status", "archived").limit(2000),
    db.from("client_relationship").select("client_id, last_activity_at, last_purchase_date, total_revenue").limit(2000),
    db.from("alert_states").select("key, snoozed_until, dismissed_at").limit(2000),
  ]);

  const label = (c: { name: string; business_name?: string | null } | null) => (c ? c.business_name || c.name : null);
  const finOf = new Map((fin.data ?? []).map((f) => [f.project_id, f]));
  const relOf = new Map((rel.data ?? []).map((r) => [r.client_id, r]));
  const people = team.data ?? [];

  const input: WorkInput = {
    today,
    people: people.map((p) => ({ id: p.id, name: p.full_name || p.email })),
    responsibilities: resp.data ?? [],
    tasks: (tasks.data ?? []).map(({ projects: p, clients: c, ...t }) => ({ ...t, project_name: p?.name ?? null, client_name: c?.name ?? null })),
    followUps: (followUps.data ?? []).map(({ clients: c, ...f }) => ({ ...f, client_name: label(c) ?? "לקוח" })),
    leads: leads.data ?? [],
    projects: (projects.data ?? []).map(({ clients: c, ...p }) => {
      const f = finOf.get(p.id);
      return { ...p, client_name: label(c), total_price: Number(p.total_price), deposit_amount: Number(p.deposit_amount), amount_paid: Number(f?.amount_paid ?? 0), balance_due: Number(f?.balance_due ?? 0) };
    }),
    submissions: (subs.data ?? []).map(({ clients: c, ...s }) => ({ ...s, client_name: label(c) })),
    proposals: (proposals.data ?? []).map(({ clients: c, ...p }) => ({ ...p, client_name: label(c) })),
    contracts: (contracts.data ?? []).map(({ clients: c, content, ...k }) => ({ ...k, generated: content !== null, client_name: label(c) })),
    approvals: (approvals.data ?? []).map(({ projects: p, ...a }) => ({ ...a, project_name: p?.name ?? null })),
    portfolioProjectIds: (portfolio.data ?? []).map((x) => x.project_id!),
    albumProjectIds: (albums.data ?? []).map((x) => x.project_id!),
    links: links.data ?? [],
    handoffProjectIds: (handoffs.data ?? []).map((x) => x.project_id),
    clients: (clients.data ?? []).map((c) => {
      const r = relOf.get(c.id);
      return { ...c, last_activity_at: r?.last_activity_at ?? null, last_purchase_date: r?.last_purchase_date ?? null, total_revenue: Number(r?.total_revenue ?? 0) };
    }),
    alertStates: alerts.data ?? [],
  };
  return { input, team: people };
}

/** Everything the Today screen / dashboard needs, in one call. */
export async function loadWork(db: Db, userId: string | null) {
  const { input, team } = await loadWorkInput(db);
  const items = buildWorkItems(input);
  return { input, team, items, plan: planFor(items, userId), workload: workloadFor(input) };
}
