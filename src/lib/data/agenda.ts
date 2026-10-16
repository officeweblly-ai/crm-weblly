import "server-only";
import { createClient } from "@/lib/supabase/server";
import { eventKindToAgenda, sortAgenda, type AgendaItem } from "@/lib/domain/calendar";
import { taskStatus, type TaskStatus } from "@/lib/domain/labels";
import { todayISO } from "@/lib/format";

const who = (client: { name: string; business_name?: string | null } | null | undefined, project?: { name: string } | null) =>
  [project?.name, client ? client.business_name || client.name : null].filter(Boolean).join(" · ") || null;

const MILESTONE_LABEL: Record<string, string> = { not_started: "לא התחיל", in_progress: "בתהליך", waiting_client: "ממתין ללקוח", done: "הושלם" };

/**
 * Everything dated between `from` and `to` (inclusive), from the real tables.
 * `overdue` also pulls open items dated before `from` (for "today").
 */
export async function loadAgenda(from: string, to: string, opts: { overdue?: boolean; payments?: boolean } = {}): Promise<AgendaItem[]> {
  const supabase = await createClient();
  const lo = opts.overdue ? "1900-01-01" : from;
  const withPayments = opts.payments ?? true;

  const [events, tasks, deadlines, milestones, schedule, received, followUps, leads, proposals, contracts] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("id, title, kind, starts_on, ends_on, all_day, start_time, end_time, assigned_to, client_id, project_id, description, reminder_minutes, clients(name, business_name), projects(name)")
      .lte("starts_on", to)
      .or(`ends_on.gte.${from},and(ends_on.is.null,starts_on.gte.${from})`)
      .limit(1000),
    (() => {
      let q = supabase
        .from("tasks")
        .select("id, title, status, due_date, due_time, assigned_to, secondary_assigned_to, project_id, client_id, projects(name), clients(name, business_name)")
        .not("due_date", "is", null)
        .lte("due_date", to)
        .limit(1000);
      q = opts.overdue ? q.or(`due_date.gte.${from},status.neq.done`) : q.gte("due_date", from);
      return q;
    })(),
    supabase
      .from("projects")
      .select("id, name, deadline, status, owner_id, client_id, clients(name, business_name)")
      .not("deadline", "is", null)
      .gte("deadline", lo)
      .lte("deadline", to)
      .neq("status", "completed")
      .limit(500),
    supabase
      .from("project_milestones")
      .select("id, title, phase, start_date, end_date, status, assigned_to, project_id, projects(name, client_id, clients(name, business_name))")
      .not("end_date", "is", null)
      .gte("end_date", lo)
      .lte("end_date", to)
      .limit(1000),
    withPayments
      ? supabase
          .from("payment_schedule")
          .select("id, title, amount, due_date, payment_id, project_id, projects(name, owner_id, client_id, clients(name, business_name))")
          .not("due_date", "is", null)
          .gte("due_date", lo)
          .lte("due_date", to)
          .limit(500)
      : Promise.resolve({ data: [] as never[] }),
    withPayments
      ? supabase
          .from("payments")
          .select("id, amount, paid_at, kind, project_id, projects(name, client_id, clients(name, business_name))")
          .gte("paid_at", from)
          .lte("paid_at", to)
          .limit(500)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("follow_ups")
      .select("id, reason, due_date, status, assigned_to, client_id, project_id, clients(name, business_name), projects(name)")
      .eq("status", "open")
      .gte("due_date", lo)
      .lte("due_date", to)
      .limit(500),
    supabase
      .from("leads")
      .select("id, name, business_name, follow_up_date, next_action, status")
      .not("status", "in", "(converted,lost)")
      .not("follow_up_date", "is", null)
      .gte("follow_up_date", lo)
      .lte("follow_up_date", to)
      .limit(300),
    supabase
      .from("proposals")
      .select("id, title, valid_until, status, client_id, project_id, clients(name, business_name)")
      .in("status", ["sent", "viewed"])
      .not("valid_until", "is", null)
      .gte("valid_until", from)
      .lte("valid_until", to)
      .limit(300),
    supabase
      .from("contracts")
      .select("id, title, signed_at, status, client_id, project_id, clients(name, business_name)")
      .not("signed_at", "is", null)
      .gte("signed_at", `${from}T00:00:00Z`)
      .lte("signed_at", `${to}T23:59:59Z`)
      .limit(300),
  ]);

  const today = todayISO();
  const items: AgendaItem[] = [];
  const base = { endDate: null, time: null, endTime: null, assigneeId: null, projectId: null, clientId: null, done: false, amount: null, status: null } as const;

  for (const e of events.data ?? []) {
    items.push({
      ...base,
      key: `event-${e.id}`,
      source: "event",
      sourceId: e.id,
      kind: eventKindToAgenda(e.kind),
      title: e.title,
      context: who(e.clients, e.projects),
      date: e.starts_on,
      endDate: e.ends_on && e.ends_on !== e.starts_on ? e.ends_on : null,
      time: e.all_day ? null : (e.start_time?.slice(0, 5) ?? null),
      endTime: e.all_day ? null : (e.end_time?.slice(0, 5) ?? null),
      href: `/calendar?view=day&date=${e.starts_on}&event=${e.id}`,
      assigneeId: e.assigned_to,
      projectId: e.project_id,
      clientId: e.client_id,
      done: e.starts_on < today && (e.ends_on ?? e.starts_on) < today,
      event: {
        id: e.id,
        title: e.title,
        kind: e.kind,
        starts_on: e.starts_on,
        ends_on: e.ends_on,
        all_day: e.all_day,
        start_time: e.start_time,
        end_time: e.end_time,
        assigned_to: e.assigned_to,
        client_id: e.client_id,
        project_id: e.project_id,
        description: e.description,
        reminder_minutes: e.reminder_minutes,
      },
    });
  }
  for (const t of tasks.data ?? []) {
    items.push({
      ...base,
      key: `task-${t.id}`,
      source: "task",
      sourceId: t.id,
      kind: "task",
      title: t.title,
      context: who(t.clients, t.projects),
      date: t.due_date!,
      time: t.due_time?.slice(0, 5) ?? null,
      href: t.project_id ? `/projects/${t.project_id}?tab=tasks#task-${t.id}` : `/tasks?task=${t.id}`,
      assigneeId: t.assigned_to ?? t.secondary_assigned_to,
      projectId: t.project_id,
      clientId: t.client_id,
      done: t.status === "done",
      status: taskStatus.label(t.status as TaskStatus),
    });
  }
  for (const p of deadlines.data ?? []) {
    items.push({
      ...base,
      key: `deadline-${p.id}`,
      source: "project",
      sourceId: p.id,
      kind: "deadline",
      title: `יעד מסירה: ${p.name}`,
      context: who(p.clients),
      date: p.deadline!,
      href: `/projects/${p.id}?tab=timeline`,
      assigneeId: p.owner_id,
      projectId: p.id,
      clientId: p.client_id,
    });
  }
  for (const m of milestones.data ?? []) {
    const done = m.status === "done";
    if (opts.overdue && done && m.end_date! < from) continue;
    items.push({
      ...base,
      key: `milestone-${m.id}`,
      source: "milestone",
      sourceId: m.id,
      kind: m.phase === "delivery" ? "delivery" : "milestone",
      title: m.title,
      context: who(m.projects?.clients, m.projects),
      date: m.end_date!,
      href: `/projects/${m.project_id}?tab=timeline`,
      assigneeId: m.assigned_to,
      projectId: m.project_id,
      clientId: m.projects?.client_id ?? null,
      done,
      status: MILESTONE_LABEL[m.status] ?? m.status,
    });
  }
  for (const s of schedule.data ?? []) {
    const paid = Boolean(s.payment_id);
    if (opts.overdue && paid && s.due_date! < from) continue;
    items.push({
      ...base,
      key: `schedule-${s.id}`,
      source: "schedule",
      sourceId: s.id,
      kind: "payment_due",
      title: s.title,
      context: who(s.projects?.clients, s.projects),
      date: s.due_date!,
      href: `/projects/${s.project_id}?tab=finance`,
      assigneeId: s.projects?.owner_id ?? null,
      projectId: s.project_id,
      clientId: s.projects?.client_id ?? null,
      done: paid,
      amount: Number(s.amount),
      status: paid ? "שולם" : s.due_date! < today ? "באיחור" : "צפוי",
    });
  }
  for (const p of received.data ?? []) {
    items.push({
      ...base,
      key: `payment-${p.id}`,
      source: "payment",
      sourceId: p.id,
      kind: "payment",
      title: "התקבל תשלום",
      context: who(p.projects?.clients, p.projects),
      date: p.paid_at,
      href: `/projects/${p.project_id}?tab=finance`,
      projectId: p.project_id,
      clientId: p.projects?.client_id ?? null,
      done: true,
      amount: Number(p.amount),
    });
  }
  for (const f of followUps.data ?? []) {
    items.push({
      ...base,
      key: `followup-${f.id}`,
      source: "followup",
      sourceId: f.id,
      kind: "follow_up",
      title: f.reason,
      context: who(f.clients, f.projects),
      date: f.due_date,
      href: `/clients/${f.client_id}?tab=relationship`,
      assigneeId: f.assigned_to,
      projectId: f.project_id,
      clientId: f.client_id,
    });
  }
  for (const l of leads.data ?? []) {
    items.push({
      ...base,
      key: `lead-${l.id}`,
      source: "lead",
      sourceId: l.id,
      kind: "follow_up",
      title: l.next_action || `חזרה לליד: ${l.name}`,
      context: l.business_name || l.name,
      date: l.follow_up_date!,
      href: `/leads/${l.id}`,
    });
  }
  for (const p of proposals.data ?? []) {
    items.push({
      ...base,
      key: `proposal-${p.id}`,
      source: "proposal",
      sourceId: p.id,
      kind: "follow_up",
      title: `תוקף הצעה: ${p.title}`,
      context: who(p.clients),
      date: p.valid_until!,
      href: `/proposals/${p.id}`,
      projectId: p.project_id,
      clientId: p.client_id,
    });
  }
  for (const c of contracts.data ?? []) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(c.signed_at!));
    items.push({
      ...base,
      key: `contract-${c.id}`,
      source: "contract",
      sourceId: c.id,
      kind: "contract",
      title: `נחתם: ${c.title}`,
      context: who(c.clients),
      date: day,
      href: `/contracts/${c.id}`,
      projectId: c.project_id,
      clientId: c.client_id,
      done: true,
    });
  }
  return items.sort(sortAgenda);
}
