"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eventSchema, milestoneSchema, MILESTONE_STATUS_VALUES, scheduleSchema } from "@/lib/validation/schemas";
import { planDefaultMilestones } from "@/lib/domain/timeline";
import { addDays } from "@/lib/domain/calendar";
import { paymentMethod } from "@/lib/domain/labels";
import { todayISO } from "@/lib/format";
import { searchPattern } from "@/lib/utils";
import { notify } from "@/lib/push";
import { dbError, NOT_AUTHORIZED, parseForm, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";

function refresh() {
  revalidatePath("/", "layout");
}

const idSchema = z.uuid();

// ===========================================================================
// Calendar events
// ===========================================================================
export async function saveEvent(id: string | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(eventSchema, fd);
  if (!p.success) return p.result;
  const row = { ...p.data, ends_on: p.data.ends_on && p.data.ends_on !== p.data.starts_on ? p.data.ends_on : null };
  if (id) {
    const { data: before } = await s.supabase.from("calendar_events").select("assigned_to, starts_on, start_time").eq("id", id).maybeSingle();
    const changedWhen = before && (before.starts_on !== row.starts_on || (before.start_time?.slice(0, 5) ?? null) !== row.start_time);
    const { error } = await s.supabase
      .from("calendar_events")
      .update({ ...row, ...(changedWhen ? { reminded_at: null } : {}) })
      .eq("id", id);
    if (error) return dbError(error, "עדכון האירוע נכשל");
    if (before && before.assigned_to !== row.assigned_to) eventAssigned(s.userId, row.assigned_to, row.title, row.starts_on, row.start_time);
    refresh();
    return ok({ id }, "האירוע עודכן");
  }
  const { data, error } = await s.supabase.from("calendar_events").insert(row).select("id").single();
  if (error) return dbError(error, "יצירת האירוע נכשלה");
  eventAssigned(s.userId, row.assigned_to, row.title, row.starts_on, row.start_time);
  refresh();
  return ok({ id: data.id }, "האירוע נוסף ליומן");
}

function eventAssigned(actor: string, to: string | null, title: string, date: string, time: string | null) {
  if (!to || to === actor) return;
  notify([to], "task_assigned", {
    title: "נוסף לך אירוע ביומן",
    body: `${title} · ${date.split("-").reverse().join("/")}${time ? ` ${time}` : ""}`,
    url: `/calendar?view=day&date=${date}`,
    tag: "event",
  }, { actor });
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  if (!idSchema.safeParse(id).success) return fail("אירוע לא תקין.");
  const { error } = await s.supabase.from("calendar_events").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת האירוע נכשלה");
  refresh();
  return ok(undefined, "האירוע נמחק");
}

/** Drag & drop in the calendar: move to another day, keep the duration. */
export async function moveEvent(id: string, date: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("תאריך לא תקין.");
  const { data: e } = await s.supabase.from("calendar_events").select("starts_on, ends_on").eq("id", id).maybeSingle();
  if (!e) return fail("האירוע לא נמצא.");
  const span = e.ends_on ? Math.round((Date.parse(e.ends_on) - Date.parse(e.starts_on)) / 86_400_000) : 0;
  const { error } = await s.supabase
    .from("calendar_events")
    .update({ starts_on: date, ends_on: span ? addDays(date, span) : null, reminded_at: null })
    .eq("id", id);
  if (error) return dbError(error, "העברת האירוע נכשלה");
  refresh();
  return ok(undefined, "האירוע הועבר");
}

// ===========================================================================
// Tasks — quick actions from today / calendar
// ===========================================================================
export async function postponeTask(id: string, days: number): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: t } = await s.supabase.from("tasks").select("due_date").eq("id", id).maybeSingle();
  if (!t) return fail("המשימה לא נמצאה.");
  const today = todayISO();
  const from = t.due_date && t.due_date > today ? t.due_date : today;
  const due = addDays(from, Math.max(1, Math.min(30, Math.round(days))));
  const { error } = await s.supabase.from("tasks").update({ due_date: due }).eq("id", id);
  if (error) return dbError(error, "דחיית המשימה נכשלה");
  refresh();
  return ok(undefined, days === 1 ? "נדחה למחר" : `נדחה ל-${due.split("-").reverse().join("/")}`);
}

/** Postpone a client follow-up / lead follow-up to a date. */
export async function postponeLead(id: string, days: number): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const due = addDays(todayISO(), Math.max(1, Math.min(30, Math.round(days))));
  const { error } = await s.supabase.from("leads").update({ follow_up_date: due }).eq("id", id);
  if (error) return dbError(error, "הדחייה נכשלה");
  refresh();
  return ok(undefined, "המעקב נדחה");
}

export async function setLeadNextAction(id: string, nextAction: string, date: string | null): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const text = nextAction.trim().slice(0, 300) || null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("תאריך לא תקין.");
  const { error } = await s.supabase.from("leads").update({ next_action: text, follow_up_date: date }).eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined, "הפעולה הבאה נשמרה");
}

// ===========================================================================
// Project timeline (milestones)
// ===========================================================================
async function nextPosition(s: NonNullable<Awaited<ReturnType<typeof staffClient>>>, projectId: string) {
  const { data } = await s.supabase.from("project_milestones").select("position").eq("project_id", projectId).order("position", { ascending: false }).limit(1).maybeSingle();
  return (data?.position ?? -1) + 1;
}

export async function saveMilestone(projectId: string, id: string | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(milestoneSchema, fd);
  if (!p.success) return p.result;
  if (id && p.data.depends_on === id) return fail("שלב לא יכול להיות תלוי בעצמו.", { depends_on: "בחר שלב אחר" });
  if (id) {
    const { error } = await s.supabase.from("project_milestones").update(p.data).eq("id", id).eq("project_id", projectId);
    if (error) return dbError(error, "עדכון השלב נכשל");
    refresh();
    return ok({ id }, "השלב עודכן");
  }
  const { data, error } = await s.supabase
    .from("project_milestones")
    .insert({ ...p.data, project_id: projectId, position: await nextPosition(s, projectId) })
    .select("id")
    .single();
  if (error) return dbError(error, "הוספת השלב נכשלה");
  refresh();
  return ok({ id: data.id }, "השלב נוסף ללו״ז");
}

export async function setMilestoneStatus(id: string, status: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const parsed = z.enum(MILESTONE_STATUS_VALUES).safeParse(status);
  if (!parsed.success) return fail("סטטוס לא תקין.");
  const { error } = await s.supabase.from("project_milestones").update({ status: parsed.data }).eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined, parsed.data === "done" ? "השלב הושלם" : "הסטטוס עודכן");
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("project_milestones").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת השלב נכשלה");
  refresh();
  return ok(undefined, "השלב נמחק. המשימות שלו נשארו בפרויקט.");
}

export async function moveMilestone(id: string, dir: -1 | 1): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: m } = await s.supabase.from("project_milestones").select("project_id").eq("id", id).maybeSingle();
  if (!m) return fail("השלב לא נמצא.");
  const { data: all } = await s.supabase.from("project_milestones").select("id, position").eq("project_id", m.project_id).order("position").order("created_at");
  const list = all ?? [];
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return ok(undefined);
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(list.map((x, pos) => s.supabase.from("project_milestones").update({ position: pos }).eq("id", x.id)));
  refresh();
  return ok(undefined);
}

/** אפיון → עיצוב → פיתוח → בדיקות → תיקונים → מסירה, laid out on the project's dates. */
export async function addDefaultMilestones(projectId: string): Promise<ActionResult<{ added: number }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: project } = await s.supabase.from("projects").select("start_date, deadline, owner_id").eq("id", projectId).maybeSingle();
  if (!project) return fail("הפרויקט לא נמצא.");
  const { data: existing } = await s.supabase.from("project_milestones").select("phase").eq("project_id", projectId);
  const have = new Set((existing ?? []).map((m) => m.phase).filter(Boolean));
  const plan = planDefaultMilestones(project.start_date ?? todayISO(), project.deadline).filter((p) => !have.has(p.phase));
  if (!plan.length) return ok({ added: 0 }, "השלבים הקבועים כבר קיימים");
  let position = await nextPosition(s, projectId);
  let prev: string | null = null;
  for (const p of plan) {
    const { data, error }: { data: { id: string } | null; error: Parameters<typeof dbError>[0] } = await s.supabase
      .from("project_milestones")
      .insert({ project_id: projectId, title: p.title, phase: p.phase, start_date: p.start_date, end_date: p.end_date, position: position++, depends_on: prev, assigned_to: project.owner_id })
      .select("id")
      .single();
    if (error || !data) return dbError(error, "יצירת השלבים נכשלה");
    prev = data.id;
  }
  if (!project.start_date) await s.supabase.from("projects").update({ start_date: plan[0].start_date }).eq("id", projectId);
  refresh();
  return ok({ added: plan.length }, `נוספו ${plan.length} שלבים ללו״ז — אפשר לגרור תאריכים בעריכה`);
}

/** Move a task into / out of a milestone. */
export async function setTaskMilestone(taskId: string, milestoneId: string | null): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("tasks").update({ milestone_id: milestoneId }).eq("id", taskId);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined);
}

// ===========================================================================
// Payment schedule
// ===========================================================================
export async function saveScheduleRow(projectId: string, id: string | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(scheduleSchema, fd);
  if (!p.success) return p.result;
  if (id) {
    const { error } = await s.supabase.from("payment_schedule").update(p.data).eq("id", id).eq("project_id", projectId);
    if (error) return dbError(error, "העדכון נכשל");
    refresh();
    return ok({ id }, "התשלום הצפוי עודכן");
  }
  const { data: last } = await s.supabase.from("payment_schedule").select("position").eq("project_id", projectId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await s.supabase.from("payment_schedule").insert({ ...p.data, project_id: projectId, position: (last?.position ?? -1) + 1 }).select("id").single();
  if (error) return dbError(error, "ההוספה נכשלה");
  refresh();
  return ok({ id: data.id }, "נוסף ללוח התשלומים");
}

export async function deleteScheduleRow(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("payment_schedule").delete().eq("id", id);
  if (error) return dbError(error, "המחיקה נכשלה");
  refresh();
  return ok(undefined, "הוסר מלוח התשלומים");
}

/** "התקבל": records the real payment and links the expected row to it. */
export async function receiveScheduled(id: string, input: { paid_at: string; method: string }): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paid_at)) return fail("תאריך לא תקין.");
  const method = z.enum(paymentMethod.values).safeParse(input.method);
  if (!method.success) return fail("אמצעי תשלום לא תקין.");
  const { data: row } = await s.supabase.from("payment_schedule").select("project_id, title, amount, payment_id, position").eq("id", id).maybeSingle();
  if (!row) return fail("השורה לא נמצאה.");
  if (row.payment_id) return fail("התשלום הזה כבר נרשם.");
  const kind = /מקדמה/.test(row.title) ? "deposit" : /סופי|יתרה/.test(row.title) ? "final" : "installment";
  const { data: pay, error } = await s.supabase
    .from("payments")
    .insert({ project_id: row.project_id, amount: row.amount, paid_at: input.paid_at, method: method.data, kind, note: row.title })
    .select("id")
    .single();
  if (error) return dbError(error, "רישום התשלום נכשל");
  await s.supabase.from("payment_schedule").update({ payment_id: pay.id }).eq("id", id);
  refresh();
  return ok(undefined, "התשלום נרשם והיתרה עודכנה");
}

/** Builds the schedule from the accepted proposal's payment milestones (amounts only — dates are set by hand). */
export async function scheduleFromProposal(projectId: string): Promise<ActionResult<{ added: number }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: existing } = await s.supabase.from("payment_schedule").select("id").eq("project_id", projectId).limit(1);
  if (existing?.length) return fail("כבר קיים לוח תשלומים לפרויקט.");
  const { data: proposal } = await s.supabase
    .from("proposals")
    .select("milestones, deposit, price")
    .or(`project_id.eq.${projectId},converted_project_id.eq.${projectId}`)
    .eq("status", "accepted")
    .order("responded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: project } = await s.supabase.from("projects").select("total_price, deposit_amount").eq("id", projectId).maybeSingle();
  type M = { label?: string; amount?: number | null; when?: string };
  const fromProposal = (Array.isArray(proposal?.milestones) ? (proposal!.milestones as M[]) : []).filter((m) => m.label && Number(m.amount) > 0);
  const rows = fromProposal.length
    ? fromProposal.map((m, i) => ({ title: m.label!.slice(0, 200), amount: Number(m.amount), notes: m.when || null, position: i }))
    : (() => {
        const total = Number(project?.total_price ?? proposal?.price ?? 0);
        const deposit = Number(project?.deposit_amount ?? proposal?.deposit ?? 0);
        const out: { title: string; amount: number; notes: string | null; position: number }[] = [];
        if (deposit > 0) out.push({ title: "מקדמה", amount: deposit, notes: null, position: 0 });
        if (total - deposit > 0) out.push({ title: "יתרה סופית", amount: total - deposit, notes: null, position: 1 });
        return out;
      })();
  if (!rows.length) return fail("אין סכומים בהצעה או בפרויקט לבנות מהם לוח תשלומים.");
  const { error } = await s.supabase.from("payment_schedule").insert(rows.map((r) => ({ ...r, project_id: projectId })));
  if (error) return dbError(error, "יצירת לוח התשלומים נכשלה");
  refresh();
  return ok({ added: rows.length }, "לוח התשלומים נוצר — הוסף תאריכים צפויים");
}

// ===========================================================================
// Contract signed → open project
// ===========================================================================
export async function openProjectFromContract(contractId: string): Promise<ActionResult<{ projectId: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: c } = await s.supabase.from("contracts").select("id, title, client_id, project_id, proposal_id, status").eq("id", contractId).maybeSingle();
  if (!c) return fail("החוזה לא נמצא.");
  if (c.project_id) return ok({ projectId: c.project_id }, "החוזה כבר מקושר לפרויקט");
  if (c.proposal_id) {
    const { data: p } = await s.supabase.from("proposals").select("title, project_type, price, deposit, scope, converted_project_id").eq("id", c.proposal_id).maybeSingle();
    if (p?.converted_project_id) {
      await s.supabase.from("contracts").update({ project_id: p.converted_project_id }).eq("id", contractId);
      refresh();
      return ok({ projectId: p.converted_project_id }, "החוזה קושר לפרויקט מההצעה");
    }
    if (p) {
      const { data, error } = await s.supabase
        .from("projects")
        .insert({
          client_id: c.client_id,
          name: p.title.replace(/^הצעת מחיר\s*[—-]\s*/, ""),
          project_type: p.project_type ?? "business_site",
          total_price: Number(p.price),
          deposit_amount: Number(p.deposit),
          description: p.scope,
          status: "awaiting_deposit",
          start_date: todayISO(),
          next_action: "לגבות מקדמה ולהתחיל אפיון",
        })
        .select("id")
        .single();
      if (error) return dbError(error, "פתיחת הפרויקט נכשלה");
      await Promise.all([
        s.supabase.from("contracts").update({ project_id: data.id }).eq("id", contractId),
        s.supabase.from("proposals").update({ converted_project_id: data.id, project_id: data.id }).eq("id", c.proposal_id),
      ]);
      refresh();
      return ok({ projectId: data.id }, "הפרויקט נפתח עם המחיר והתכולה מההצעה");
    }
  }
  const { data, error } = await s.supabase
    .from("projects")
    .insert({ client_id: c.client_id, name: c.title.replace(/^הסכם\s*(התקשרות|עבודה)?\s*[—-]?\s*/, "") || c.title, status: "awaiting_deposit", start_date: todayISO() })
    .select("id")
    .single();
  if (error) return dbError(error, "פתיחת הפרויקט נכשלה");
  await s.supabase.from("contracts").update({ project_id: data.id }).eq("id", contractId);
  refresh();
  return ok({ projectId: data.id }, "הפרויקט נפתח");
}

// ===========================================================================
// Global search (command palette)
// ===========================================================================
export type SearchHit = { type: "client" | "lead" | "project" | "proposal" | "contract" | "task"; id: string; title: string; subtitle: string | null; href: string };

export async function globalSearch(q: string): Promise<SearchHit[]> {
  const s = await staffClient();
  if (!s) return [];
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  const p = searchPattern(term);
  const digits = term.replace(/\D/g, "");
  const people = [`name.ilike.${p}`, `business_name.ilike.${p}`, `email.ilike.${p}`, digits.length >= 3 ? `phone_digits.ilike.%${digits}%` : null].filter(Boolean).join(",");
  const [clients, leads, projects, proposals, contracts, tasks] = await Promise.all([
    s.supabase.from("clients").select("id, name, business_name").or(people).order("updated_at", { ascending: false }).limit(6),
    s.supabase.from("leads").select("id, name, business_name").or(people).neq("status", "converted").limit(4),
    s.supabase.from("projects").select("id, name, clients(name, business_name)").ilike("name", p).order("updated_at", { ascending: false }).limit(6),
    s.supabase.from("proposals").select("id, title, number, clients(name, business_name)").or(`title.ilike.${p},number.ilike.${p}`).limit(5),
    s.supabase.from("contracts").select("id, title, contract_number, clients(name, business_name)").or(`title.ilike.${p},contract_number.ilike.${p}`).limit(5),
    s.supabase.from("tasks").select("id, title, project_id, projects(name)").ilike("title", p).neq("status", "done").limit(6),
  ]);
  const c = (x: { name: string; business_name: string | null } | null) => (x ? x.business_name || x.name : null);
  return [
    ...(clients.data ?? []).map((r) => ({ type: "client" as const, id: r.id, title: r.name, subtitle: r.business_name, href: `/clients/${r.id}` })),
    ...(projects.data ?? []).map((r) => ({ type: "project" as const, id: r.id, title: r.name, subtitle: c(r.clients), href: `/projects/${r.id}` })),
    ...(proposals.data ?? []).map((r) => ({ type: "proposal" as const, id: r.id, title: r.title, subtitle: [r.number, c(r.clients)].filter(Boolean).join(" · ") || null, href: `/proposals/${r.id}` })),
    ...(contracts.data ?? []).map((r) => ({ type: "contract" as const, id: r.id, title: r.title, subtitle: [r.contract_number, c(r.clients)].filter(Boolean).join(" · ") || null, href: `/contracts/${r.id}` })),
    ...(tasks.data ?? []).map((r) => ({ type: "task" as const, id: r.id, title: r.title, subtitle: r.projects?.name ?? null, href: r.project_id ? `/projects/${r.project_id}?tab=tasks` : `/tasks?q=${encodeURIComponent(r.title)}` })),
    ...(leads.data ?? []).map((r) => ({ type: "lead" as const, id: r.id, title: r.name, subtitle: r.business_name, href: `/leads/${r.id}` })),
  ];
}
